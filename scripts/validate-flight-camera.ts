import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DEFAULT_FLIGHT_EFFECTS } from '../src/lib/flightEffects';
import { beginFlightCameraGesture, createFlightCameraGate, createFlightFocus, createFlightFocusIndex,
  createFlightFitWorkspace, projectedFlightFitDistance,
  dampFlightVector, endFlightCameraGesture, flightCameraMayMove, flightCameraTimeline,
  flightFitDistance, FLIGHT_CAMERA_NOTES_PER_CHANNEL, sampleFlightFocus,
  createFlightCameraShot, sampleFlightCameraShot, createFlightDirectionWorkspace, dampFlightDirection,
  FLIGHT_CAMERA_SETTLE_SECONDS } from '../src/lib/flightCamera';
import { FLIGHT_CAMERA_STYLES } from '../src/lib/flightCameraStyles';
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
assert(Number.isFinite(output.energy) && output.energy >= 0 && output.energy <= 1);
const quiet = points([{ channel: 0, x: 0 }]), loud = points([{ channel: 0, x: 0 }]);
quiet.velocity[0] = 0.15;
sampleFlightFocus(quiet, createFlightFocusIndex(quiet), 0.2, DEFAULT_FLIGHT_EFFECTS, output);
const quietEnergy = output.energy;
sampleFlightFocus(loud, createFlightFocusIndex(loud), 0.2, DEFAULT_FLIGHT_EFFECTS, output);
assert(output.energy > quietEnergy * 5, 'The camera follows actual note dynamics');
const dense = points(Array.from({ length: 200 }, () => ({ channel: 0, x: 0 })));
const loudEnergy = output.energy;
sampleFlightFocus(dense, createFlightFocusIndex(dense), 0.2, DEFAULT_FLIGHT_EFFECTS, output);
assert.equal(output.energy, loudEnergy, 'Dense attacks do not multiply one instrument’s camera influence');
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

const heading = new THREE.Vector3(0, 0, 1), shot = createFlightCameraShot();
const shotSignature = () => [...shot.direction.toArray(), shot.distance, shot.lead];
for (const [style] of FLIGHT_CAMERA_STYLES) {
  for (const time of [-1, 0, 0.2, 15, 120, 10000, NaN]) for (const energy of [0, 0.4, 1, NaN]) {
    sampleFlightCameraShot(style, time, energy, 2, heading, shot);
    assert(shotSignature().every(Number.isFinite), `${style} shot stays finite`);
    assert(Math.abs(shot.direction.length() - 1) < 1e-12);
    assert(shot.distance >= 0.8 && shot.distance <= 1.4);
    assert(shot.lead >= 0 && shot.lead <= 2.1);
  }
  sampleFlightCameraShot(style, 16.25, 0.65, 1.2, heading, shot); const saved = shotSignature();
  sampleFlightCameraShot(style, 100, 0.4, 2, heading, shot);
  sampleFlightCameraShot(style, 16.25, 0.65, 1.2, heading, shot);
  assert.deepEqual(shotSignature(), saved, `${style} rewinds to the exact shot intent`);
  sampleFlightCameraShot(style, 16.25, 0.65, 1.2, heading, shot);
  assert.deepEqual(shotSignature(), saved, 'Paused shot intent does not integrate drift');
  sampleFlightCameraShot(style, 25, 0, 0, heading, shot); const noMusic = shotSignature();
  sampleFlightCameraShot(style, 25, 1, 0, heading, shot);
  assert.deepEqual(shotSignature(), noMusic, 'Zero musical response disables only the music accents');
}
sampleFlightCameraShot('balanced', 1000, 1, 2, heading, shot);
assert.deepEqual(shotSignature(), [0, 0, 1, 1, 0], 'Balanced retains the original camera direction and distance');
sampleFlightCameraShot('chase', 25, 0.5, 1, heading, shot);
assert(shot.direction.dot(heading) < -0.9, 'Chase places the camera behind the flight heading');
sampleFlightCameraShot('orbit', 0, 0, 1, heading, shot); const orbitStart = shot.direction.clone();
sampleFlightCameraShot('orbit', Math.PI / 0.055, 0, 1, heading, shot);
assert(orbitStart.dot(shot.direction) < -0.9, 'Orbit circles the action rather than oscillating in one direction');
sampleFlightCameraShot('cinematic', 30, 0, 1, heading, shot); const calmDolly = shot.distance;
sampleFlightCameraShot('cinematic', 30, 1, 2, heading, shot);
assert(shot.distance < calmDolly, 'Musical accents gently push the cinematic dolly toward the action');
for (const fps of [30, 60, 120]) {
  const direction = new THREE.Vector3(0, 0, 1), target = new THREE.Vector3(0, 0, -1), work = createFlightDirectionWorkspace();
  for (let frame = 0; frame < fps * FLIGHT_CAMERA_SETTLE_SECONDS; frame++) {
    const previous = direction.clone(); dampFlightDirection(direction, target, 1 / fps, work);
    assert(direction.toArray().every(Number.isFinite));
    assert(Math.abs(direction.length() - 1) < 1e-12);
    assert(previous.angleTo(direction) <= 0.3 / fps + 1e-7, 'Even opposite views transition around the action at a bounded angular speed');
  }
  assert(direction.dot(target) > 0.998, 'A paused Chase/style transition has enough settling time to reach its trailing view');
}
console.log('PASS: channel-balanced framing and dynamics, deterministic chase/orbit/cinematic shots, musical-response bounds, safe great-circle transitions, pause/seek intent, projected framing, and manual-camera grace.');
