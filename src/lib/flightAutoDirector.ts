import type { ParsedMidi } from './midi';
import type { FlightCameraStyle } from './flightCameraStyles';
import { normalizeFlightEffects, type FlightEffectsSettings, type FlightShowcase } from './flightEffects';

export const FLIGHT_AUTO_TRANSITION_SECONDS = 6;
export const FLIGHT_AUTO_MIN_SECTION_SECONDS = 20;
export const FLIGHT_AUTO_MAX_SECTION_SECONDS = 40;
const BIN_SECONDS = 2;
const MAX_SECTIONS = 4096;
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;

export type FlightAutoSection = Readonly<{
  time: number;
  end: number;
  scene: FlightShowcase;
  camera: FlightCameraStyle;
  /** Relative score energy, including velocity, density and chord activity. */
  energy: number;
}>;
export type FlightAutoPlan = Readonly<{
  sections: readonly FlightAutoSection[];
  duration: number;
}>;
export type FlightAutoSample = Readonly<{
  index: number;
  section: FlightAutoSection;
  previous: FlightAutoSection;
  /** Smooth, score-time interpolation: pause and seeks never drift. */
  blend: number;
}>;

const QUIET: readonly FlightShowcase[] = ['aurora-dream', 'bubble-ballet', 'crystal-galaxy', 'prism-bloom', 'mermaid-lagoon'];
const FLOWING: readonly FlightShowcase[] = ['mobius-dream', 'quantum-garden', 'cosmic-jelly', 'clockwork-nebula', 'petrol-nebula'];
const INTENSE: readonly FlightShowcase[] = ['electric-tempest', 'supernova', 'neon-highway', 'stargate', 'event-horizon', 'solar-forge'];

/** Precompute a complete performance once per score. Section boundaries prefer
 * quiet quarter-note grid positions near a half-minute, without assuming 4/4.
 * The upcoming phrase's dynamics choose the visual family. No frame scans MIDI. */
export function createFlightAutoPlan(midi: Pick<ParsedMidi, 'notes' | 'beats' | 'duration'> | null): FlightAutoPlan {
  const lastNote = midi?.notes.reduce((end, note) => Math.max(end, finite(note.time) + Math.max(0, finite(note.duration))), 0) ?? 0;
  const duration = Math.max(1, finite(midi?.duration ?? 0) || lastNote || 180);
  // Bound auxiliary storage for unusually long scores. Normal music uses 2s bins.
  const binSeconds = Math.max(BIN_SECONDS, duration / 100000);
  const binCount = Math.ceil(duration / binSeconds) + 1;
  const counts = new Float64Array(binCount), velocities = new Float64Array(binCount);
  const chords = new Float64Array(binCount), pitch = new Float64Array(binCount);
  const seen = new Set<string>();
  for (const note of midi?.notes ?? []) {
    if (!Number.isFinite(note.time) || note.time < 0 || note.time > duration) continue;
    const bin = Math.min(binCount - 1, Math.floor(note.time / binSeconds));
    counts[bin]++;
    velocities[bin] += clamp(finite(note.velocity) / 127);
    pitch[bin] += clamp(finite(note.pitch), 0, 127);
    // A chord accent is a second or later pitch at the same attack instant.
    // Millisecond rounding tolerates MIDI conversion without merging arpeggios.
    const attack = `${Math.round(note.time * 1000)}`;
    if (seen.has(attack)) chords[bin]++;
    else seen.add(attack);
  }
  const densityValues = Array.from(counts).filter(value => value > 0).sort((a, b) => a - b);
  const densityReference = densityValues[Math.floor(Math.max(0, densityValues.length - 1) * 0.8)] || 1;
  const energy = Float64Array.from(counts, (count, i) => count > 0
    ? clamp(0.47 * velocities[i] / count + 0.38 * clamp(count / densityReference) + 0.15 * chords[i] / count) : 0);
  const prefixEnergy = new Float64Array(binCount + 1), prefixCount = new Float64Array(binCount + 1), prefixPitch = new Float64Array(binCount + 1);
  for (let i = 0; i < binCount; i++) {
    prefixEnergy[i + 1] = prefixEnergy[i] + energy[i];
    prefixCount[i + 1] = prefixCount[i] + counts[i];
    prefixPitch[i + 1] = prefixPitch[i] + pitch[i];
  }
  const stats = (start: number, end: number) => {
    const lo = Math.min(binCount - 1, Math.max(0, Math.floor(start / binSeconds)));
    const hi = Math.min(binCount, Math.max(lo + 1, Math.ceil(end / binSeconds)));
    const count = prefixCount[hi] - prefixCount[lo];
    return { energy: (prefixEnergy[hi] - prefixEnergy[lo]) / (hi - lo),
      pitch: count ? (prefixPitch[hi] - prefixPitch[lo]) / count : 60, count };
  };
  const beats = (midi?.beats ?? []).filter(time => Number.isFinite(time) && time >= 0 && time <= duration).sort((a, b) => a - b);
  let beatCursor = 0;
  const boundaries = [0];
  while (boundaries.length < MAX_SECTIONS) {
    const start = boundaries.at(-1)!;
    // Keep the last phrase long enough to establish its look.
    if (duration - start <= FLIGHT_AUTO_MAX_SECTION_SECONDS) break;
    const earliest = start + FLIGHT_AUTO_MIN_SECTION_SECONDS;
    const latest = Math.min(start + FLIGHT_AUTO_MAX_SECTION_SECONDS, duration - FLIGHT_AUTO_MIN_SECTION_SECONDS);
    const target = Math.min(start + 29, latest);
    while (beatCursor < beats.length && beats[beatCursor] < earliest) beatCursor++;
    let next = target, best = Infinity;
    for (let i = beatCursor; i < beats.length && beats[i] <= latest; i++) {
      const beat = beats[i];
      const bin = Math.min(binCount - 1, Math.floor(beat / binSeconds));
      // A quiet cut can move the nominal timing by several seconds; a very
      // distant quiet beat cannot override the overall measured pacing.
      const score = Math.abs(beat - target) / 10 + energy[bin] * 0.75;
      if (score < best) { next = beat; best = score; }
    }
    boundaries.push(next);
  }
  const sections: FlightAutoSection[] = [];
  for (let i = 0; i < boundaries.length; i++) {
    const time = boundaries[i], end = boundaries[i + 1] ?? duration;
    const phrase = stats(time, end);
    const family = phrase.energy < 0.5 ? QUIET : phrase.energy < 0.68 ? FLOWING : INTENSE;
    let scene: FlightShowcase = i === 0 ? 'cosmic-jelly'
      : family[(i + Math.round(phrase.pitch / 7) + Math.round(phrase.count / 13)) % family.length];
    if (i > 0) {
      const seed = family.indexOf(scene);
      const recent = sections.slice(-3).map(section => section.scene);
      scene = Array.from({ length: family.length }, (_, offset) => family[(seed + offset) % family.length])
        .find(candidate => !recent.includes(candidate)) ?? family[(seed + 1) % family.length];
    }
    // Alternate deliberate shots, giving energetic phrases more chase shots,
    // and periodically return to balanced framing for a visual breath.
    const cameras: readonly FlightCameraStyle[] = phrase.energy >= 0.68
      ? ['cinematic', 'chase', 'orbit', 'chase'] : ['cinematic', 'orbit', 'balanced', 'orbit'];
    const camera = cameras[i % cameras.length];
    sections.push(Object.freeze({ time, end, scene, camera, energy: phrase.energy }));
  }
  return Object.freeze({ sections: Object.freeze(sections), duration });
}

/** Binary search supports direct jumps and reverse seeking without state. */
export function sampleFlightAutoPlan(plan: FlightAutoPlan, rawTime: number): FlightAutoSample {
  const time = clamp(finite(rawTime), 0, plan.duration);
  let lo = 0, hi = plan.sections.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (plan.sections[mid].time <= time) lo = mid + 1;
    else hi = mid;
  }
  const index = Math.max(0, lo - 1), section = plan.sections[index];
  const previous = plan.sections[Math.max(0, index - 1)];
  const phase = index ? clamp((time - section.time) / FLIGHT_AUTO_TRANSITION_SECONDS) : 1;
  return { index, section, previous, blend: phase * phase * (3 - 2 * phase) };
}

/** Keep both optical layers alive during a dissolve. Different motion fields
 * ease to rest at the midpoint before the new field grows, so changing the enum
 * never teleports every actor. */
export function blendFlightAutoEffects(from: FlightEffectsSettings, to: FlightEffectsSettings, rawBlend: number): FlightEffectsSettings {
  const blend = clamp(finite(rawBlend));
  const result = normalizeFlightEffects(from);
  const target = normalizeFlightEffects(to);
  const previousMotion = result.motion, previousAmount = result.motionAmount;
  for (const key of Object.keys(result) as (keyof FlightEffectsSettings)[]) {
    if (key === 'motion') result.motion = blend < 0.5 ? result.motion : target.motion;
    else result[key] += (target[key] - result[key]) * blend;
  }
  if (previousMotion !== target.motion) {
    const phase = blend < 0.5 ? 1 - blend * 2 : blend * 2 - 1;
    const amount = blend < 0.5 ? previousAmount : target.motionAmount;
    result.motionAmount = amount * phase * phase * (3 - 2 * phase);
  }
  return result;
}
