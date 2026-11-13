import assert from 'node:assert/strict';
import { FLIGHT_SHOWCASES, normalizeFlightEffects } from '../src/lib/flightEffects';
import { flightScene, FLIGHT_SCENES } from '../src/lib/flightScenes';
import { normalizePrismChannels, resolveMixedPrismChannel } from '../src/lib/prismChannels';

for (const preset of FLIGHT_SHOWCASES) {
  const raw = FLIGHT_SCENES[preset.id];
  assert.deepEqual(normalizePrismChannels(raw.channels), raw.channels, `${preset.label} uses real models, materials, and valid animation clips`);
  const scene = flightScene(preset.id);
  assert.deepEqual(scene.effects, normalizeFlightEffects(preset.effects));
  assert(scene.bloom >= 0 && scene.bloom <= 1, 'Showcases keep bloom controlled');
  assert(scene.memory > 0 && scene.memory <= 120);
  assert(scene.spread >= 0 && scene.spread <= 2);
  const sources = new Set(Object.keys(scene.channels).map(channel => resolveMixedPrismChannel(scene.channels, Number(channel)).kind));
  assert(sources.size >= 2, 'Each showcase mixes distinct visual sources');
  scene.channels[0] = { kind: 'shape', shape: 'sphere', material: 'glass' };
  scene.effects.morph = 0;
  assert.deepEqual(flightScene(preset.id).channels, raw.channels, 'Editing a live showcase cannot mutate the preset');
  assert.deepEqual(flightScene(preset.id).effects, preset.effects);
}
console.log('PASS: all showcase scenes use valid catalog assets/clips/materials, bounded optical settings, mixed sources, and independent editable settings.');
