import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DEFAULT_FLIGHT_EFFECTS } from '../src/lib/flightEffects';
import { beginFlightCameraGesture, createFlightCameraGate, createFlightFocus, createFlightFocusIndex,
  createFlightFitWorkspace, projectedFlightFitDistance,
  dampFlightVector, endFlightCameraGesture, flightCameraMayMove, flightCameraTimeline,
  flightFitDistance, FLIGHT_CAMERA_NOTES_PER_CHANNEL, sampleFlightFocus } from '../src/lib/flightCamera';
import { buildPrismPath, buildPrismScore, type PrismScoreData } from '../src/lib/prismTrail';
import type { ParsedMidi } from '../src/lib/midi';

function points(notes: Array<{ channel: number; x: number; birth?: number; duration?: number }>): PrismScoreData {
  const count = notes.length;
  const data: PrismScoreData = { count, table: buildPrismPath(10), fit: 1, matrices: new Float32Array(count * 16),
    birth: new Float32Array(count), duration: new Float32Array(count), velocity: new Float32Array(count).fill(1),
    hue: new Float32Array(count), crowd: new Float32Array(count), channels: new Uint8Array(count), pitches: new Uint8Array(count) };
  notes.forEach((note, i) => {
    new THREE.Matrix4().makeTranslation(note.x, 0, 0).toArray(data.matrices, i * 16);
    data.channels[i] = note.channel; data.birth[i] = note.birth ?? 0; data.duration[i] = note.duration ?? 5;
  });
  return data;
}
const output = createFlightFocus();
const empty = points([]);
sampleFlightFocus(empty, createFlightFocusIndex(empty), NaN, DEFAULT_FLIGHT_EFFECTS, output);
assert.equal(output.notes, 0); assert.deepEqual(output.center.toArray(), [0, 0, 0]);
const fair = points([...Array.from({ length: 100 }, () => ({ channel: 0, x: 0 })), { channel: 1, x: 20 }]);
sampleFlightFocus(fair, createFlightFocusIndex(fair), 1, DEFAULT_FLIGHT_EFFECTS, output);
assert.equal(output.center.x, 10, 'A hundred accompaniment notes do not overpower the solo channel');
assert.equal(output.channels, 2); assert.equal(output.notes, FLIGHT_CAMERA_NOTES_PER_CHANNEL + 1);
const chord = points([{ channel: 0, x: -12 }, { channel: 0, x: 12 }]);
sampleFlightFocus(chord, createFlightFocusIndex(chord), 1, DEFAULT_FLIGHT_EFFECTS, output);
assert.equal(output.center.x, 0); assert(output.radius >= 16, 'Single-channel chords get a useful framing radius');
const future = points([{ channel: 0, x: 3 }, { channel: 1, x: 99, birth: 4 }]);
sampleFlightFocus(future, createFlightFocusIndex(future), 2, DEFAULT_FLIGHT_EFFECTS, output);
assert.equal(output.center.x, 3); assert.equal(output.notes, 1, 'Unheard notes cannot pull the camera ahead');
sampleFlightFocus(future, createFlightFocusIndex(future), 30, DEFAULT_FLIGHT_EFFECTS, output);
assert.equal(output.notes, 0, 'Long rests do not drag the shot toward ancient notes');

const midi: ParsedMidi = { notes: Array.from({ length: 20000 }, (_, i) => ({ time: i * 0.005,
  duration: 0.25, velocity: 70 + i % 45, channel: i % 16, track: i % 16, pitch: 40 + i % 48 })),
  duration: 101, controls: [], beats: [], bpm: 120, trackCount: 16, programs: {} };
const data = buildPrismScore(midi, 5, true, 'chroma', 1, 'mixed')!, index = createFlightFocusIndex(data);
const effects = { ...DEFAULT_FLIGHT_EFFECTS, motion: 'butterfly' as const, motionAmount: 2, morph: 1 };
for (const time of [-1, 0, 12.25, 65, 1000, NaN]) {
  sampleFlightFocus(data, index, time, effects, output);
  assert(output.notes <= 16 * FLIGHT_CAMERA_NOTES_PER_CHANNEL);
  assert([...output.center.toArray(), output.radius].every(Number.isFinite));
  assert(output.radius >= 3.5 && output.radius <= 38);
}
sampleFlightFocus(data, index, 12.25, effects, output);
const signature = [...output.center.toArray(), output.radius, output.notes];
sampleFlightFocus(data, index, 65, effects, output);
sampleFlightFocus(data, index, 12.25, effects, output);
assert.deepEqual([...output.center.toArray(), output.radius, output.notes], signature, 'Seeking restores the same framing intent');
sampleFlightFocus(data, index, 12.25, effects, output);
assert.deepEqual([...output.center.toArray(), output.radius, output.notes], signature, 'Paused score sampling does not drift');

const goal = new THREE.Vector3(3, -4, 8), positions: THREE.Vector3[] = [];
for (const fps of [30, 60, 120]) {
  const position = new THREE.Vector3();
  for (let frame = 0; frame < fps; frame++) dampFlightVector(position, goal, 1 / fps, 1.5, 1e6);
  positions.push(position);
}
assert(positions[0].distanceTo(positions[1]) < 1e-12 && positions[1].distanceTo(positions[2]) < 1e-12,
  'Smoothing has the same one-second response across frame rates');
const limited = new THREE.Vector3();
dampFlightVector(limited, new THREE.Vector3(1000, 0, 0), 1 / 60, 100, 9);
assert(limited.length() <= 9 / 60 + 1e-12, 'Seek transitions obey the explicit speed limit');
const frozen = limited.clone(); dampFlightVector(limited, goal, 0, 1.5, 9); assert(limited.equals(frozen));
for (const [r, fov, aspect] of [[8, 50, 2], [8, 50, 0.5], [999, 50, 0.1], [NaN, NaN, NaN]]) {
  const distance = flightFitDistance(r, fov, aspect); assert(Number.isFinite(distance) && distance >= 14 && distance <= 64);
}
assert(flightFitDistance(8, 50, 0.5) > flightFitDistance(8, 50, 2), 'Portrait framing uses the narrower horizontal field');
const fitWork = createFlightFitWorkspace(), identity = new THREE.Matrix4(), origin = new THREE.Vector3(), back = new THREE.Vector3(0, 0, 1);
const horizontal = new Float64Array([-12, 0, 0, 0, 12, 0, 0, 0]);
const vertical = new Float64Array([0, -12, 0, 0, 0, 12, 0, 0]);
const wide = projectedFlightFitDistance(horizontal, 2, identity, origin, back, 50, 2, 1, fitWork);
const tall = projectedFlightFitDistance(vertical, 2, identity, origin, back, 50, 2, 1, fitWork);
assert(wide < tall * 0.7, 'A horizontal ensemble fills a widescreen shot instead of receiving a wasted vertical sphere fit');
assert(projectedFlightFitDistance(horizontal, 2, identity, origin, back, 50, 0.5, 1, fitWork) > wide * 1.5,
  'Actual view-space box fitting adapts to portrait screens');
const tanV = Math.tan(THREE.MathUtils.degToRad(25)), tanH = tanV * 2;
assert((12 + 1) / wide <= tanH && 1 / wide <= tanV, 'The selected distance includes the ensemble and its model margin');
const depthView = projectedFlightFitDistance(horizontal, 2, identity, origin, new THREE.Vector3(1, 0, 0), 50, 2, 1, fitWork);
assert(depthView > 12 + 1 / tanV, 'Manual orbiting preserves near-point depth clearance');
for (const aspect of [0.25, 0.5, 1, 2, 4, NaN]) {
  const distance = projectedFlightFitDistance(horizontal, 2, identity, origin, back, NaN, aspect, 1, fitWork);
  assert(Number.isFinite(distance) && distance >= 12 && distance <= 66);
}
const gate = createFlightCameraGate(); assert(flightCameraMayMove(gate, 0));
beginFlightCameraGesture(gate, 0); assert(!flightCameraMayMove(gate, 100), 'A held drag never expires');
endFlightCameraGesture(gate, 1); assert(!flightCameraMayMove(gate, 3.9)); assert(flightCameraMayMove(gate, 4));
assert(!flightCameraTimeline(20, 0, 20, 1 / 60).active, 'An ordinary paused frame cannot move the camera');
assert(flightCameraTimeline(20, 0, 12, 1 / 60).jump, 'Backward seeking requests a bounded reframing transition');
assert(flightCameraTimeline(20, 0, 50, 1 / 60).active);
assert.equal(flightCameraTimeline(0, 0, NaN, NaN).time, 0);
console.log('PASS: channel-balanced bounded framing, same-channel chords, no future-note leakage, exact pause/seek intent, frame-rate-independent easing, seek speed limits, view-space ensemble/depth/aspect fit, and manual-camera grace.');
