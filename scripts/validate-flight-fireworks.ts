import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createFlightFireworks } from '../src/components/FlightFireworks';
import { buildFlightLinks, fireworkDirection, fireworkEnvelope, fireworkRandom, fireworkWindow,
  FIREWORK_BUDGETS, FIREWORK_LIFETIMES } from '../src/lib/flightFireworks';
import { DEFAULT_FLIGHT_EFFECTS } from '../src/lib/flightEffects';
import { buildPrismScore } from '../src/lib/prismTrail';
import type { ParsedMidi } from '../src/lib/midi';

for (let note = 0; note < 16; note++) for (let particle = 0; particle < 20; particle++) {
  const direction = fireworkDirection(note, particle);
  assert.deepEqual(direction, fireworkDirection(note, particle));
  assert(Math.abs(Math.hypot(...direction) - 1) < 1e-10, 'Ballistic directions have bounded unit speed');
  assert(direction.every(Number.isFinite));
  assert(fireworkRandom(note, particle) >= 0 && fireworkRandom(note, particle) < 1);
}
assert.notDeepEqual(fireworkDirection(0, 0), fireworkDirection(1, 0));
for (const life of Object.values(FIREWORK_LIFETIMES)) {
  assert.equal(fireworkEnvelope(-1, life), 0);
  assert.equal(fireworkEnvelope(0, life), 0, 'Effects fade in instead of flashing on');
  assert.equal(fireworkEnvelope(life, life), 0);
  assert.equal(fireworkEnvelope(life + 1, life), 0);
  for (let i = 0; i <= 100; i++) assert(fireworkEnvelope(life * i / 100, life) >= 0 && fireworkEnvelope(life * i / 100, life) <= 1);
}
assert.deepEqual(fireworkWindow([0, 1, 2, 3], 2, 1.5, 8), { start: 1, end: 3 });
assert.deepEqual(fireworkWindow([0, 1, 2, 3], 3, 8, 2), { start: 2, end: 4 });

const score: ParsedMidi = {
  notes: Array.from({ length: 20000 }, (_, index) => ({ time: index * 0.005, duration: 0.2,
    velocity: 65 + index % 62, channel: index % 16, track: index % 16, pitch: 45 + index % 40 })),
  duration: 101, controls: [], beats: [], bpm: 120, trackCount: 16, programs: {},
};
const data = buildPrismScore(score, 5, true, 'chroma', 1, 'mixed')!;
const links = buildFlightLinks(data);
assert(links.birth.length > 1000);
for (let i = 0; i < links.birth.length; i++) {
  assert.equal(data.channels[links.from[i]], data.channels[links.to[i]], 'Lasers and tracers never connect different instruments');
  assert(data.birth[links.to[i]] > data.birth[links.from[i]]);
  assert(data.birth[links.to[i]] - data.birth[links.from[i]] <= 4);
  assert.equal(links.birth[i], data.birth[links.to[i]]);
}
const effects = { ...DEFAULT_FLIGHT_EFFECTS, bursts: 1, shockwaves: 1, lasers: 1, tracers: 1 };
const signature = (root: THREE.Group) => root.children.map(object => {
  const mesh = object as THREE.Mesh;
  const geometry = mesh.geometry;
  const count = geometry instanceof THREE.InstancedBufferGeometry ? geometry.instanceCount : geometry.drawRange.count;
  return { count, time: (mesh.material as THREE.ShaderMaterial).uniforms.uTime.value,
    attributes: Object.fromEntries(Object.entries(geometry.attributes).filter(([, raw]) => (raw as THREE.BufferAttribute).usage === THREE.DynamicDrawUsage)
      .map(([key, raw]) => { const attr = raw as THREE.BufferAttribute; return [key, Array.from(attr.array).slice(0, count * attr.itemSize)]; })) };
});
for (const xr of [false, true]) {
  const pool = createFlightFireworks(data, xr, effects);
  assert.equal(pool.group.children.length, 4, 'Four effects need only four GPU draws');
  pool.update(40, effects);
  const budget = xr ? FIREWORK_BUDGETS.xr : FIREWORK_BUDGETS.desktop;
  const caps = [budget.bursts * budget.particlesPerNote, budget.shockwaves, budget.lasers, budget.tracers];
  pool.group.children.forEach((object, i) => {
    const geometry = (object as THREE.Mesh).geometry;
    const count = geometry instanceof THREE.InstancedBufferGeometry ? geometry.instanceCount : geometry.drawRange.count;
    assert(count > 0 && count <= caps[i], 'Twenty-thousand-note pieces retain bounded GPU work');
    for (const attr of Object.values(geometry.attributes)) assert(Array.from(attr.array).every(Number.isFinite));
    const meta = geometry.getAttribute('aMeta');
    for (let j = 0; j < count; j++) assert(meta.getX(j) <= 40, 'No future note contributes');
  });
  const before = signature(pool.group);
  pool.update(75.123, effects);
  pool.update(40, effects);
  assert.deepEqual(signature(pool.group), before, 'Backward seeks restore exact effect buffers and uniforms');
  pool.update(40, effects);
  assert.deepEqual(signature(pool.group), before, 'Pause does not accumulate particle integration');
  pool.update(40, DEFAULT_FLIGHT_EFFECTS);
  assert(pool.group.children.every(object => !object.visible));
  let geometries = 0, materials = 0;
  pool.group.children.forEach(object => {
    const mesh = object as THREE.Mesh;
    mesh.geometry.addEventListener('dispose', () => geometries++);
    (mesh.material as THREE.Material).addEventListener('dispose', () => materials++);
  });
  pool.dispose(); pool.dispose();
  assert.equal(geometries, 4); assert.equal(materials, 4);
}
const disabled = createFlightFireworks(data, false, DEFAULT_FLIGHT_EFFECTS);
assert.equal(disabled.group.children.length, 0, 'Zero-effect defaults allocate no GPU buffers');
disabled.dispose();
console.log('PASS: seeded note bursts, finite unit directions, smooth lifetimes, same-channel links, exact pause/seek, bounded 20k-note desktop/XR pools and owned GPU resource disposal.');
