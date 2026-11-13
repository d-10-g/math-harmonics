import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildPrismPath, buildPrismScore, samplePrismPose, prismInstanceBudget, prismVisibleRange } from '../src/lib/prismTrail';
import type { ParsedMidi } from '../src/lib/midi';

const p = new THREE.Vector3(), q = new THREE.Quaternion();
const guide = buildPrismPath(90);
const first = buildPrismPath(0, guide, 0, 4, 1);
const second = buildPrismPath(0, guide, 1, 4, 1);
const repeat = buildPrismPath(0, guide, 0, 4, 1);
assert.deepEqual(first.positions, repeat.positions, 'Channel integration is deterministic');
assert.notDeepEqual(first.positions, second.positions, 'Channels follow independent paths');
for (const table of [guide, first, second]) {
  for (const time of [-2, 0, 0.025, 14.123, 89, 1000, NaN]) {
    samplePrismPose(table, time, p, q);
    assert(p.toArray().every(Number.isFinite));
    assert(q.toArray().every(Number.isFinite));
    assert(Math.abs(q.length() - 1) < 1e-6, 'Interpolated orientation stays normalized');
  }
  samplePrismPose(table, 14.123, p, q);
  const seek = [...p.toArray(), ...q.toArray()];
  samplePrismPose(table, 70, p, q);
  samplePrismPose(table, 14.123, p, q);
  assert.deepEqual([...p.toArray(), ...q.toArray()], seek, 'Seeking does not depend on playback history');
}
for (const table of [first, second]) {
  // Independently integrated steering has different headings, not just a
  // translated copy of the guide. It remains within the scene's view scale.
  assert.notDeepEqual(table.quaternions, guide.quaternions);
  for (let i = 0; i < table.count; i += 20) {
    const a = new THREE.Vector3().fromArray(table.positions, i * 3);
    const b = new THREE.Vector3().fromArray(guide.positions, i * 3);
    assert(a.distanceTo(b) < 30, 'Channel steering stays bounded around the guide');
  }
}
assert(buildPrismPath(12 * 60 * 60).count <= 40003, 'Long score path memory is bounded');
const midi: ParsedMidi = {
  notes: [
    { time: 2, duration: 0.4, pitch: 72, velocity: 100, channel: 0, track: 1 },
    { time: 0, duration: 0.1, pitch: 60, velocity: 80, channel: 0, track: 0 },
    { time: 1, duration: 1, pitch: 64, velocity: 90, channel: 1, track: 1 },
    { time: 0.3, duration: 0.1, pitch: 67, velocity: 90, channel: 0, track: 0 },
  ],
  controls: [ { time: 0.05, channel: 0, kind: 'sustain', value: 1 }, { time: 0.7, channel: 0, kind: 'sustain', value: 0 } ],
  duration: 3, beats: [], bpm: 120, trackCount: 2, programs: {},
};
const originalNotes = [...midi.notes];
for (const shape of ['spectrum', 'sphere', 'crystal', 'torus', 'knot', 'mesh'] as const) {
  for (const mode of ['full', 'pitch', 'chroma', 'length'] as const) {
    const score = buildPrismScore(midi, 5, true, mode, 1.3, shape)!;
    assert.equal(score.count, midi.notes.length);
    assert.deepEqual(Array.from(score.birth), [0, Math.fround(0.3), 1, 2]);
    for (const values of [score.matrices, score.birth, score.duration, score.velocity, score.hue, score.crowd]) {
      assert(values.every(Number.isFinite), `${shape}/${mode} data is finite`);
    }
    assert(score.duration[0] > 0.69, 'Sustain pedal extends the painted stroke');
    assert.equal(score.crowd[0], 1, 'Crowding uses sorted per-channel times');
    assert.equal(score.crowd[1], 1);
    assert.deepEqual(midi.notes, originalNotes, 'Precomputation does not mutate caller MIDI');
  }
}
assert.equal(buildPrismScore({ ...midi, notes: [] }, 5, true, 'full'), null);
assert.deepEqual(prismVisibleRange([0, 1, 2, 3, 4], -1, 0, 8), { start: 0, end: 0 });
assert.deepEqual(prismVisibleRange([0, 1, 2, 3, 4], 2, 0, 8), { start: 0, end: 3 }, 'Birth on seek time is visible');
assert.deepEqual(prismVisibleRange([0, 1, 2, 3, 4], 4, 0, 2), { start: 3, end: 5 }, 'Budget retains most recent notes');
assert.deepEqual(prismVisibleRange([0, 1, 2, 3, 4], 4, 1.5, 8), { start: 3, end: 5 }, 'Finite history removes expired notes');
assert(prismInstanceBudget(100000) < prismInstanceBudget(200), 'Detailed meshes use smaller history windows');
console.log('PASS: independent bounded channel paths, deterministic seeking, normalized poses, score order, sustain, crowding, all shapes/colors, visible windows and geometry budgets.');
