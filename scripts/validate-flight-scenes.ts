import assert from 'node:assert/strict';
import { FLIGHT_SHOWCASES, normalizeFlightEffects } from '../src/lib/flightEffects';
import { flightScene, FLIGHT_SCENES } from '../src/lib/flightScenes';
import { normalizePrismChannels, resolveMixedPrismChannel } from '../src/lib/prismChannels';

assert.deepEqual(Object.keys(FLIGHT_SCENES).sort(), FLIGHT_SHOWCASES.map(preset => preset.id).sort(),
  'Every scene button has one complete scene and no scene is unreachable');
const visualSignatures = new Set<string>();
for (const preset of FLIGHT_SHOWCASES) {
  const raw = FLIGHT_SCENES[preset.id];
  assert.deepEqual(normalizePrismChannels(raw.channels), raw.channels, `${preset.label} uses real models, materials, and valid animation clips`);
  const scene = flightScene(preset.id);
  assert.deepEqual(scene.effects, normalizeFlightEffects(preset.effects));
  assert(scene.bloom >= 0 && scene.bloom <= 1, 'Showcases keep bloom controlled');
  assert(scene.memory > 0 && scene.memory <= 120);
  assert(scene.spread >= 0 && scene.spread <= 2);
  for (const [key, step] of [['spread', 0.1], ['memory', 5], ['bloom', 0.05]] as const) {
    assert(Math.abs(scene[key] / step - Math.round(scene[key] / step)) < 1e-8,
      `${preset.label}/${key} aligns with the actual desktop and VR slider step`);
  }
  assert.equal(Object.keys(scene.channels).length, 4, 'Every showcase explicitly dresses the first four channels');
  const sources = new Set(Object.keys(scene.channels).map(channel => resolveMixedPrismChannel(scene.channels, Number(channel)).kind));
  assert.deepEqual([...sources].sort(), ['glb', 'obj', 'shape'], 'Each showcase mixes animated rigs, sculptures, and built-in shapes');
  const signature = JSON.stringify([scene.channels, scene.lighting, scene.color]);
  assert(!visualSignatures.has(signature), 'Showcases have distinct visual identities');
  visualSignatures.add(signature);
  const editedRow = Number(Object.keys(scene.channels).find(channel => scene.channels[channel].kind === 'glb'));
  scene.channels[editedRow].material = 'velvet';
  scene.channels[0] = { kind: 'shape', shape: 'sphere', material: 'glass' };
  scene.effects.morph = 0;
  assert.deepEqual(flightScene(preset.id).channels, raw.channels, 'Editing a live showcase cannot mutate the preset');
  assert.deepEqual(flightScene(preset.id).effects, preset.effects);
}
for (const id of ['aurora-dream', 'quantum-garden', 'clockwork-nebula'] as const) {
  const effects = flightScene(id).effects;
  assert(effects.auroras > 0 || effects.constellations > 0 || effects.gyroscopes > 0,
    'Each new scene demonstrates a new spatial sculpture effect');
  assert(['helix', 'butterfly'].includes(effects.motion), 'New scenes demonstrate the new kinetic paths');
}
for (const [id, layer] of [['electric-tempest', 'lightning'], ['prism-bloom', 'petals'], ['bubble-ballet', 'bubbles']] as const) {
  const scene = flightScene(id);
  assert(scene.effects[layer] >= 1, `${id} prominently demonstrates its new shader layer`);
  assert(scene.bloom <= 0.4, 'New spectacle scenes preserve readable translucent detail');
  assert.equal(Object.keys(scene.channels).sort().join(','), '0,1,2,3', 'New scenes explicitly dress the same first four MIDI channels');
}
for (const [id, layer] of [['mobius-dream', 'ribbons'], ['crystal-galaxy', 'crystals'], ['event-horizon', 'vortexes']] as const) {
  assert(flightScene(id).effects[layer] >= 1, `${id} prominently demonstrates its new phenomenon`);
}
console.log('PASS: all thirteen showcase scenes use valid catalog assets/clips/materials, bounded optical settings, three source types, distinct looks, independent settings, and new spatial FX.');
