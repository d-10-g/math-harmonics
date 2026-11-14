import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMidi, type ParsedMidi, type MidiNote } from '../src/lib/midi';
import { createFlightAutoPlan } from '../src/lib/flightAutoDirector';
import { createFlightAutoCastPlan, FLIGHT_AUTO_OBJ_ASSETS } from '../src/lib/flightAutoCast';
import { MODEL_ASSETS } from '../src/lib/modelChannels';
import { normalizePrismChannels, resolveMixedPrismChannel } from '../src/lib/prismChannels';

const bytes = readFileSync('public/demo/library/mars.mid');
const midi = parseMidi(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const direction = createFlightAutoPlan(midi);
const savedMidi = JSON.stringify(midi), savedDirection = JSON.stringify(direction);
const cast = createFlightAutoCastPlan(midi, direction);
assert.deepEqual(cast, createFlightAutoCastPlan(midi, direction), 'A musical performance has repeatable channel casting');
assert.equal(cast.casts.length, direction.sections.length, 'Cast indices align with the camera/effects phrases');
assert(Object.isFrozen(cast) && Object.isFrozen(cast.channels) && Object.isFrozen(cast.casts));
assert.deepEqual(cast.channels, [...new Set(midi.notes.map(note => note.channel))].sort((a, b) => a - b));
const assets = new Map(MODEL_ASSETS.map(asset => [asset.file, asset]));
for (const file of FLIGHT_AUTO_OBJ_ASSETS) {
  assert.equal(assets.get(file)?.kind, 'obj', 'The curated mesh list only contains actual OBJ catalog entries');
  const text = readFileSync(`public/demo/meshes/${file}`, 'utf8');
  // OBJ triangle expansion is bounded by the real face vertex count, not just
  // its unique positions. Keep all automatic choices modest for dual casting.
  const expandedVertices = text.split('\n').filter(line => line.startsWith('f '))
    .reduce((count, line) => count + Math.max(0, line.trim().split(/\s+/).length - 3) * 3, 0);
  assert(expandedVertices > 0 && expandedVertices < 20000, `${file} remains modest after real OBJ triangulation`);
}
for (const [index, map] of cast.casts.entries()) {
  assert(Object.isFrozen(map));
  assert.deepEqual(normalizePrismChannels(map), map, 'All models, surfaces and gestures survive the actual channel parser');
  assert.deepEqual(Object.keys(map).map(Number), cast.channels, 'Every used MIDI channel has an explicit cast');
  assert.equal(new Set(Object.values(map).map(choice => choice.material)).size, cast.channels.length,
    'Every channel has a distinct surface within this phrase');
  for (const channel of cast.channels) {
    const choice = map[channel], resolved = resolveMixedPrismChannel(map, channel);
    assert(Object.isFrozen(choice));
    assert.equal(resolved.kind, choice.kind);
    if (choice.kind === 'obj') assert(FLIGHT_AUTO_OBJ_ASSETS.includes(choice.asset!));
    if (choice.kind === 'glb') {
      assert.notEqual(choice.material, 'spectrum', 'Rigged cats retain physical optical surfaces');
      assert.equal(assets.get(choice.asset!)?.kind, 'glb');
      assert(assets.get(choice.asset!)!.movements.some(movement => movement.clip === choice.movement));
    }
    if (index) {
      assert.notEqual(choice.kind, cast.casts[index - 1][channel].kind, 'Every channel changes its source mesh family at the next phrase');
      assert.notEqual(choice.material, cast.casts[index - 1][channel].material, 'Every channel changes surface at the next phrase');
    }
  }
}
assert(cast.casts.some(map => Object.values(map).some(choice => choice.material === 'spectrum')),
  'The original prism shader gets an occasional static voice among the physical surfaces');
for (const channel of cast.channels) {
  assert.deepEqual([...new Set(cast.casts.map(map => map[channel].kind))].sort(), ['glb', 'obj', 'shape'],
    'Every channel explores animated cats, sculptures and built-in forms across the movement');
}
const reordered = { ...midi, notes: [...midi.notes].reverse() };
assert.deepEqual(createFlightAutoCastPlan(reordered, direction), cast, 'Input note order cannot reshuffle the performance');
assert.equal(JSON.stringify(midi), savedMidi, 'Casting never mutates the score');
assert.equal(JSON.stringify(direction), savedDirection, 'Casting never mutates camera/effect direction');

const note = (channel: number, time: number, pitch = 60, velocity = 96, duration = .3): MidiNote =>
  ({ channel, time, pitch, velocity, duration, track: 0 });
const fixture = (channels: number[], pitch = 60, velocity = 96, duration = .3): ParsedMidi => ({
  notes: channels.flatMap(channel => Array.from({ length: 120 }, (_, index) => note(channel, index, pitch, velocity, duration))),
  programs: Object.fromEntries(channels.map(channel => [channel, channel * 4])),
  controls: [], beats: Array.from({ length: 241 }, (_, index) => index / 2), duration: 120, bpm: 120, trackCount: channels.length,
});
const all = fixture(Array.from({ length: 16 }, (_, channel) => channel));
const allCasts = createFlightAutoCastPlan(all, createFlightAutoPlan(all));
for (const map of allCasts.casts) {
  assert.equal(Object.keys(map).length, 16);
  assert.equal(new Set(Object.values(map).map(choice => choice.material)).size, 16);
  assert.deepEqual(normalizePrismChannels(map), map);
}
const sparse = fixture([0, 7, 15]);
const sparseCasts = createFlightAutoCastPlan(sparse, createFlightAutoPlan(sparse));
assert.deepEqual(sparseCasts.channels, [0, 7, 15]);
for (const map of sparseCasts.casts) assert.deepEqual(Object.keys(map), ['0', '7', '15'], 'Sparse channels keep their actual MIDI identities');
const single = fixture([15]);
assert.equal(new Set(createFlightAutoCastPlan(single, createFlightAutoPlan(single)).casts.map(map => map[15].kind)).size, 3);
const high = fixture([2], 88, 126, .08), low = fixture([2], 37, 30, 1.6);
// Hold the global direction constant: each channel's own playing still guides
// the particular object/gesture instead of using only the whole-score energy.
assert.notDeepEqual(createFlightAutoCastPlan(high, direction), createFlightAutoCastPlan(low, direction),
  'Channel pitch, dynamics and articulation materially influence its cast');
const invalid = { ...sparse, notes: sparse.notes.concat([note(-1, 0), note(16, 0), note(1.5, 0), note(4, NaN), note(8, -1)]) };
assert.deepEqual(createFlightAutoCastPlan(invalid, createFlightAutoPlan(sparse)), sparseCasts, 'Invalid channels/times cannot create unsafe cast entries');
assert.deepEqual(createFlightAutoCastPlan(null, createFlightAutoPlan(null)).channels, []);
console.log(`PASS: ${cast.casts.length} deterministic musical casts across all ${cast.channels.length} Mars channels, all16/sparse channel identities, real catalog/clip/material validity, modest OBJ costs, perchannel musical response, changed meshes/surfaces and immutable score/manual independence.`);
