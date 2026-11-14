import assert from 'node:assert/strict';
import { buildPrismScore } from '../src/lib/prismTrail';
import { indexGlbFlightChannels } from '../src/lib/glbFlight';
import { mixedFlightBudget, selectMixedFlightNotes, type MixedFlightCost } from '../src/lib/mixedFlight';
import { createFlightCastAnchor, flightCastChannelOffset, flightCastLayerBudget, pairedFlightCastCosts, sampleFlightCastProgress,
  updateFlightCastAnchor } from '../src/lib/flightCastTransition';
import { mixedFlightSourceCosts, resolveMixedFlightChoices } from '../src/lib/mixedFlightSources';
import type { ParsedMidi } from '../src/lib/midi';

for (const style of ['together', 'ripple'] as const) {
  for (let channel = 0; channel < 16; channel++) {
    assert.equal(sampleFlightCastProgress(29, 30, channel, style), 0);
    assert.equal(sampleFlightCastProgress(30, 30, channel, style), 0);
    assert.equal(sampleFlightCastProgress(36, 30, channel, style), 1);
    assert.equal(sampleFlightCastProgress(50, 30, channel, style), 1);
    let previous = 0;
    for (let time = 30; time <= 36; time += .01) {
      const progress = sampleFlightCastProgress(time, 30, channel, style);
      assert(Number.isFinite(progress) && progress >= previous && progress <= 1);
      previous = progress;
      assert.equal(sampleFlightCastProgress(time, 30, channel, style), progress, 'Pauses are exact repeated samples');
      sampleFlightCastProgress(100, 30, channel, style);
      assert.equal(sampleFlightCastProgress(time, 30, channel, style), progress, 'Seeking back reproduces the same threshold');
    }
  }
}
assert.equal(new Set(Array.from({ length: 16 }, (_, channel) => sampleFlightCastProgress(32, 30, channel, 'together'))).size, 1);
assert.equal(new Set(Array.from({ length: 16 }, (_, channel) => sampleFlightCastProgress(32, 30, channel, 'ripple'))).size, 16,
  'Ripple gives every channel its own staggered fade without changing the six-second endpoint');
assert.equal(sampleFlightCastProgress(NaN, Infinity, -3, 'ripple'), 0);

const anchor = createFlightCastAnchor();
assert.equal(updateFlightCastAnchor(anchor, 1, 30, 30, false), 30);
assert.equal(updateFlightCastAnchor(anchor, 1, 30, 31, false), 30);
assert.equal(updateFlightCastAnchor(anchor, 1, 30, 31.1, true), 31.1, 'Late incoming meshes start a whole fade instead of popping at the current weight');
assert.equal(updateFlightCastAnchor(anchor, 1, 30, 31.1, true), 31.1, 'A paused delayed fade cannot advance with wall time');
assert.equal(updateFlightCastAnchor(anchor, 1, 30, 31.5, true), 31.1);
assert.equal(updateFlightCastAnchor(anchor, 1, 30, 30.5, true), 30, 'A backwards seek discards the delayed readiness anchor');
assert.equal(updateFlightCastAnchor(anchor, 1, 30, 35, true), 30, 'A warm forward seek uses the original planned transition');
assert.equal(updateFlightCastAnchor(anchor, 2, 60, 60, true), 60, 'A preloaded new phrase begins at its score boundary');

const notes = Array.from({ length: 200 }, (_, i) => Array.from({ length: 16 }, (_, channel) => ({
  time: i * .1, duration: .4, velocity: 90, pitch: 48 + channel, channel, track: channel,
}))).flat();
const midi: ParsedMidi = { notes, beats: [], controls: [], duration: 21, bpm: 120, trackCount: 16, programs: {} };
const score = buildPrismScore(midi, 5, true, 'pitch', 1, 'mixed')!;
const groups = indexGlbFlightChannels(score);
const from = new Map<number, MixedFlightCost>(), to = new Map<number, MixedFlightCost>();
for (let channel = 0; channel < 16; channel++) {
  from.set(channel, { vertices: channel % 2 ? 18000 : 1000, skinned: channel % 3 === 0 });
  to.set(channel, { vertices: channel % 2 ? 1000 : 18000, skinned: channel % 3 === 1 });
}
const shared = pairedFlightCastCosts(from, to);
assert([...shared.values()].every(cost => cost.vertices === 18000));
for (const xr of [false, true]) {
  const full = mixedFlightBudget(xr), half = flightCastLayerBudget(full);
  assert(half.objects * 2 <= full.objects && half.vertices * 2 <= full.vertices && half.skinnedVertices * 2 <= full.skinnedVertices);
  const a = selectMixedFlightNotes(score, groups, 5, 0, shared, half);
  const b = selectMixedFlightNotes(score, groups, 5, 0, shared, half);
  assert.deepEqual(a, b, 'Both layers choose exactly the same note IDs despite different mesh costs');
  let vertices = 0, skins = 0;
  for (const note of a) for (const map of [from, to]) {
    const cost = map.get(score.channels[note])!;
    vertices += cost.vertices; if (cost.skinned) skins += cost.vertices;
  }
  assert(vertices <= full.vertices && skins <= full.skinnedVertices && a.length * 2 <= full.objects,
    'Combined visible GPU work remains within the ordinary desktop/XR budget');
  assert(a.every(note => score.birth[note] <= 5));
}
const xrPairBudget = flightCastLayerBudget(mixedFlightBudget(true));
const cheap = new Map(Array.from({ length: 16 }, (_, channel) => [channel, { vertices: 1000, skinned: false }]));
const witnessed = new Set<number>();
for (let phrase = 0; phrase < 16; phrase++) {
  const offset = flightCastChannelOffset(phrase, groups.length, xrPairBudget.objects);
  const ordered = [...groups.slice(offset), ...groups.slice(0, offset)];
  const selected = selectMixedFlightNotes(score, ordered, 5, 0, cheap, xrPairBudget);
  assert(selected.length <= xrPairBudget.objects);
  selected.forEach(note => witnessed.add(score.channels[note]));
  assert.equal(flightCastChannelOffset(phrase, 11, xrPairBudget.objects), 0, 'Scores fitting the pair cap never change channel priority');
}
assert.equal(witnessed.size, 16, 'Phrase-only XR priority rotates through every channel instead of starving the last voices');
const choices = resolveMixedFlightChoices([0, 4, 15], {
  0: { kind: 'shape', shape: 'sphere', material: 'glass' },
  4: { kind: 'obj', asset: 'Star.obj', material: 'gold' },
  15: { kind: 'glb', asset: 'Ernie_model.glb', material: 'chrome' },
}, 'auto', 'ornament');
const budget = flightCastLayerBudget(mixedFlightBudget(false));
const costs = mixedFlightSourceCosts(choices, new Map([
  ['obj:Star.obj:app', { vertices: budget.vertices + 1 }],
  ['glb:Ernie_model.glb:app', { vertices: budget.skinnedVertices + 1 }],
]), budget);
assert.deepEqual(new Set(costs.oversized), new Set(['Star.obj', 'Ernie_model.glb']));
assert.equal(costs.costs.get(0)!.vertices, 1024);
assert.deepEqual(costs.costs.get(4), { vertices: 24, skinned: false });
assert.deepEqual(costs.costs.get(15), { vertices: 24, skinned: false }, 'Over-budget sources are charged as their actual small substitutes');
console.log('PASS: six-second complementary channel ripples, repeat/seek and late-ready anchors, paired note selection, bounded total desktop/XR work, and source cost accounting.');
