import type { WebGPUMaterialProfile } from '../constants';
import type { FlightAutoPlan } from './flightAutoDirector';
import { FLIGHT_SCENES } from './flightScenes';
import type { ParsedMidi, MidiNote } from './midi';
import { PRISM_GLB_ASSETS, type PrismChannelMap, type PrismStaticShape } from './prismChannels';

type Physical = Exclude<WebGPUMaterialProfile, 'auto'>;
type ChannelPhrase = { count: number; pitch: number; velocity: number; duration: number };
export type FlightAutoCastPlan = Readonly<{
  channels: readonly number[];
  /** Stable, immutable maps; section indices match the camera/effects plan. */
  casts: readonly PrismChannelMap[];
}>;

// Keep automatic casting to a bounded set of modest source meshes. These
// all fit an individual actor within the lower XR vertex budget.
export const FLIGHT_AUTO_OBJ_ASSETS = Object.freeze([
  'Blob.obj', 'Star.obj', 'Thaidrop.obj', 'Icosahedron.obj', 'Torus.obj',
  'Twistytorus.obj', 'Atom.obj', 'Gear.obj', 'Dish.obj', 'Dodecahedron.obj',
  'Cuboctahedron.obj', 'Stellateddodecahedron.obj', 'Teapot.obj', 'Wireicosahedron.obj',
]);
const GLASS_OBJECTS = ['Blob.obj', 'Thaidrop.obj', 'Dish.obj', 'Torus.obj', 'Atom.obj', 'Teapot.obj'];
const METAL_OBJECTS = ['Gear.obj', 'Star.obj', 'Icosahedron.obj', 'Dodecahedron.obj', 'Twistytorus.obj', 'Teapot.obj'];
const SPECTRAL_OBJECTS = ['Wireicosahedron.obj', 'Stellateddodecahedron.obj', 'Star.obj', 'Atom.obj', 'Cuboctahedron.obj', 'Twistytorus.obj'];
const SHAPES: readonly PrismStaticShape[] = ['sphere', 'crystal', 'torus', 'knot', 'spectrum'];
const PALETTES: Record<'glass' | 'ornament' | 'spectrum', readonly Physical[]> = {
  glass: ['opal-glass', 'dichroic', 'stained-glass', 'ice', 'ruby', 'jade', 'glass', 'pearl', 'hologram', 'oil-slick', 'gold', 'ornament', 'chrome', 'plasma', 'neon', 'liquid-metal', 'copper', 'solar-gold', 'ceramic', 'velvet', 'obsidian', 'carbon', 'xray'],
  ornament: ['solar-gold', 'ornament', 'gold', 'oil-slick', 'chrome', 'copper', 'pearl', 'liquid-metal', 'ruby', 'obsidian', 'dichroic', 'stained-glass', 'plasma', 'jade', 'ceramic', 'opal-glass', 'hologram', 'glass', 'neon', 'ice', 'velvet', 'carbon', 'xray'],
  spectrum: ['hologram', 'plasma', 'neon', 'dichroic', 'oil-slick', 'pearl', 'chrome', 'stained-glass', 'ruby', 'opal-glass', 'ice', 'gold', 'ornament', 'liquid-metal', 'jade', 'solar-gold', 'glass', 'copper', 'ceramic', 'velvet', 'obsidian', 'carbon', 'xray'],
};
const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const mod = (value: number, length: number) => ((value % length) + length) % length;
const validChannel = (channel: number) => Number.isInteger(channel) && channel >= 0 && channel <= 15;
const empty = (): ChannelPhrase => ({ count: 0, pitch: 0, velocity: 0, duration: 0 });
function add(stats: ChannelPhrase, note: MidiNote) {
  stats.count++;
  stats.pitch += Math.round(Math.min(127, Math.max(0, finite(note.pitch, 60))));
  stats.velocity += Math.round(Math.min(127, Math.max(1, finite(note.velocity, 64))));
  // Integer milliseconds make the complete plan independent of input order.
  stats.duration += Math.round(Math.min(120, Math.max(0, finite(note.duration))) * 1000);
}

/** Assign every used channel a musical character once per phrase. Source kind
 * rotates on the phrase grid, so every channel explores rigged animals, OBJ
 * sculptures and built-in forms. Pitch, articulation, dynamics and instrument
 * influence the particular mesh/gesture. No actor or manual map is mutated. */
export function createFlightAutoCastPlan(midi: Pick<ParsedMidi, 'notes' | 'programs'> | null,
  direction: FlightAutoPlan): FlightAutoCastPlan {
  const notes = (midi?.notes ?? []).filter(note => validChannel(note.channel) && Number.isFinite(note.time) && note.time >= 0)
    .slice().sort((a, b) => a.time - b.time || a.channel - b.channel || a.pitch - b.pitch || a.velocity - b.velocity || a.duration - b.duration);
  const channels = [...new Set(notes.map(note => note.channel))].sort((a, b) => a - b);
  const whole = new Map(channels.map(channel => [channel, empty()]));
  const phrases = direction.sections.map(() => new Map(channels.map(channel => [channel, empty()])));
  let sectionIndex = 0;
  for (const note of notes) {
    add(whole.get(note.channel)!, note);
    while (sectionIndex + 1 < direction.sections.length && note.time >= direction.sections[sectionIndex + 1].time) sectionIndex++;
    if (phrases[sectionIndex]) add(phrases[sectionIndex].get(note.channel)!, note);
  }
  const casts: PrismChannelMap[] = [];
  for (const [index, section] of direction.sections.entries()) {
    const finish = FLIGHT_SCENES[section.scene].finish;
    const palette = PALETTES[finish];
    const previous = casts.at(-1);
    // A shared rotation preserves distinct channel colors. With 23 materials
    // and at most 16 channels, a rotation always exists that also changes every
    // channel's previous material, even when the optical family has changed.
    const preferred = Math.round(section.energy * 8) + index * 7;
    let shift = mod(preferred, palette.length);
    for (let offset = 0; offset < palette.length; offset++) {
      const candidate = mod(preferred + offset, palette.length);
      if (channels.every(channel => palette[(channel + candidate) % palette.length] !== previous?.[channel]?.material)) {
        shift = candidate; break;
      }
    }
    const map: PrismChannelMap = {};
    for (const channel of channels) {
      const local = phrases[index].get(channel)!;
      const stats = local.count ? local : whole.get(channel)!;
      const count = Math.max(1, stats.count), pitch = Math.round(stats.pitch / count);
      const velocity = stats.velocity / count;
      const articulation = Math.round(stats.duration / count / 120);
      const program = Math.round(finite(midi?.programs[channel] ?? 0));
      const seed = channel * 11 + index * 7 + Math.round(pitch / 5) + articulation + program * 3;
      const material = palette[(channel + shift) % palette.length];
      const kind = (channel + index) % 3;
      if (kind === 0) {
        map[channel] = { kind: 'shape', shape: SHAPES[mod(seed, SHAPES.length)], material };
      } else if (kind === 1) {
        const objects = finish === 'glass' ? GLASS_OBJECTS : finish === 'spectrum' ? SPECTRAL_OBJECTS : METAL_OBJECTS;
        map[channel] = { kind: 'obj', asset: objects[mod(seed, objects.length)], material };
      } else {
        const asset = PRISM_GLB_ASSETS[mod(channel + index + Math.floor(program / 8), PRISM_GLB_ASSETS.length)];
        if (!asset) {
          map[channel] = Object.freeze({ kind: 'shape', shape: 'crystal', material });
          continue;
        }
        const expressive = asset.movements.filter(movement => (velocity >= 85 || section.energy >= .68)
          ? /paw|knead|bat|reach|perk|greeting/i.test(movement.name)
          : /listen|tilt|look|tail|ripple|sway|blink/i.test(movement.name));
        const movements = expressive.length ? expressive : asset.movements;
        map[channel] = { kind: 'glb', asset: asset.file, material, movement: movements[mod(seed, movements.length)]?.clip };
      }
      Object.freeze(map[channel]);
    }
    // One static voice occasionally carries the original full-spectrum prism
    // shader among the reflective surfaces. Rigged cats retain real physical
    // optics, and no channel repeats Spectrum on consecutive phrases.
    if (index % 2 === 0) {
      const spectral = channels.filter(channel => map[channel].kind !== 'glb' && previous?.[channel]?.material !== 'spectrum');
      if (spectral.length) {
        const channel = spectral[index % spectral.length];
        map[channel] = Object.freeze({ ...map[channel], material: 'spectrum' });
      }
    }
    casts.push(Object.freeze(map));
  }
  return Object.freeze({ channels: Object.freeze(channels), casts: Object.freeze(casts) });
}
