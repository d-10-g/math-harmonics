import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createFlightSpectacle } from '../src/components/FlightSpectacle';
import { DEFAULT_FLIGHT_EFFECTS } from '../src/lib/flightEffects';
import { buildLightningLinks, bubbleRadius, spectacleEnvelope, SPECTACLE_BUDGETS, SPECTACLE_LIFETIMES } from '../src/lib/flightSpectacle';
import { buildPrismScore } from '../src/lib/prismTrail';
import type { ParsedMidi } from '../src/lib/midi';

const score: ParsedMidi = { notes: Array.from({ length: 20000 }, (_, i) => ({ time: i * 0.005,
  duration: 0.25, velocity: 65 + i % 45, channel: i % 16, track: i % 16, pitch: 40 + i % 48,
})), duration: 101, controls: [], beats: [], bpm: 120, trackCount: 16, programs: {} };
const data = buildPrismScore(score, 5, true, 'chroma', 1, 'mixed')!;
const links = buildLightningLinks(data);
assert(links.birth.length > 1000 && links.birth.length < data.count);
for (let i = 0; i < links.birth.length; i++) {
  const a = links.from[i], b = links.to[i];
  assert(a < b && data.channels[a] === data.channels[b]);
  assert(data.birth[b] - data.birth[a] > 0.001 && data.birth[b] - data.birth[a] <= 2);
  assert.equal(links.birth[i], data.birth[b], 'Both linked notes must exist before a discharge');
}
assert.deepEqual(buildLightningLinks(data), links);
const silence = buildPrismScore({ ...score, notes: [
  { time: 0, duration: 0.2, velocity: 100, channel: 0, track: 0, pitch: 60 },
  { time: 3, duration: 0.2, velocity: 100, channel: 0, track: 0, pitch: 62 },
  { time: 3.1, duration: 0.2, velocity: 100, channel: 1, track: 1, pitch: 64 },
] }, 5, true, 'chroma', 1, 'mixed')!;
assert.equal(buildLightningLinks(silence).birth.length, 0, 'Lightning does not bridge rests or instruments');
for (const life of Object.values(SPECTACLE_LIFETIMES)) {
  assert.equal(spectacleEnvelope(-1, life), 0); assert.equal(spectacleEnvelope(life, life), 0);
  assert.equal(spectacleEnvelope(NaN, life), 0);
  for (let age = 0; age < life; age += 0.015) {
    assert(spectacleEnvelope(age, life) >= 0 && spectacleEnvelope(age, life) <= 1);
    assert(bubbleRadius(age, 1) >= 0.54 && bubbleRadius(age, 1) < 1.86, 'Shells remain finite and compact');
  }
}
for (const value of [NaN, Infinity, -50, 0, 1, 50]) assert(Number.isFinite(bubbleRadius(value, value)));
const settings = { ...DEFAULT_FLIGHT_EFFECTS, lightning: 1.2, petals: 0.8, bubbles: 1.1 };
type Mesh = THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
const state = (group: THREE.Group) => group.children.map(raw => {
  const mesh = raw as Mesh;
  return { count: mesh.geometry.instanceCount, time: mesh.material.uniforms.uTime.value,
    attributes: Object.fromEntries(Object.entries(mesh.geometry.attributes)
      .filter(([, value]) => (value as THREE.BufferAttribute).usage === THREE.DynamicDrawUsage)
      .map(([key, value]) => [key, Array.from(value.array).slice(0, mesh.geometry.instanceCount * value.itemSize)])) };
});
for (const xr of [false, true]) {
  const pool = createFlightSpectacle(data, xr, settings), budgets = xr ? SPECTACLE_BUDGETS.xr : SPECTACLE_BUDGETS.desktop;
  assert.equal(pool.group.children.length, 3);
  pool.update(40, settings);
  pool.group.children.forEach((raw, i) => {
    const mesh = raw as Mesh, capacity = [budgets.lightning, budgets.petals, budgets.bubbles][i];
    assert(mesh.geometry.instanceCount > 0 && mesh.geometry.instanceCount <= capacity);
    assert.equal(mesh.material.depthTest, true); assert.equal(mesh.material.depthWrite, false);
    assert.equal(mesh.material.forceSinglePass, true, 'Transparent double-sided petals do not add a second pass');
    const position = mesh.geometry.getAttribute('position'), index = mesh.geometry.getIndex()!;
    assert(Array.from(index.array).every(value => value >= 0 && value < position.count), 'Topology has valid indices');
    for (const value of Object.values(mesh.geometry.attributes)) assert(Array.from(value.array).every(Number.isFinite));
    const meta = mesh.geometry.getAttribute('aMeta');
    for (let n = 0; n < mesh.geometry.instanceCount; n++) assert(meta.getX(n) <= 40);
  });
  assert.equal((pool.group.children[2] as Mesh).material.blending, THREE.NormalBlending, 'Thin-film shells retain color and transparency rather than additive white');
  const before = state(pool.group), versions = pool.group.children.map(raw => ((raw as Mesh).geometry.getAttribute('aMeta') as THREE.BufferAttribute).version);
  pool.update(79.75, settings); pool.update(40, settings);
  assert.deepEqual(state(pool.group), before, 'Seeking restores the exact same note/link pool');
  const afterSeekVersions = pool.group.children.map(raw => ((raw as Mesh).geometry.getAttribute('aMeta') as THREE.BufferAttribute).version);
  assert(afterSeekVersions.every((value, i) => value > versions[i]));
  pool.update(40, { ...settings, lightning: 2, petals: 1.5, bubbles: 0.2 });
  assert.deepEqual(pool.group.children.map(raw => ((raw as Mesh).geometry.getAttribute('aMeta') as THREE.BufferAttribute).version), afterSeekVersions, 'Strength sliders update uniforms without topology or buffer uploads');
  assert.deepEqual(state(pool.group), before, 'Paused score time freezes geometry and animation uniforms');
  pool.update(40, DEFAULT_FLIGHT_EFFECTS); assert(pool.group.children.every(object => !object.visible));
  pool.update(40, settings); assert.deepEqual(state(pool.group), before);
  let geometries = 0, materials = 0;
  pool.group.children.forEach(raw => {
    const mesh = raw as Mesh;
    mesh.geometry.addEventListener('dispose', () => geometries++); mesh.material.addEventListener('dispose', () => materials++);
  });
  pool.dispose(); pool.dispose(); assert.equal(geometries, 3); assert.equal(materials, 3); assert.equal(pool.group.children.length, 0);
  const replacement = createFlightSpectacle(data, xr, settings);
  replacement.update(40, settings); assert.deepEqual(state(replacement.group), before, 'StrictMode remount owns fresh equivalent resources'); replacement.dispose();
}
for (const key of ['lightning', 'petals', 'bubbles'] as const) {
  const pool = createFlightSpectacle(data, false, { ...DEFAULT_FLIGHT_EFFECTS, [key]: 1 });
  assert.equal(pool.group.children.length, 1, 'An individual effect only allocates its own batch'); pool.dispose();
}
const empty = createFlightSpectacle(data, false, DEFAULT_FLIGHT_EFFECTS);
assert.equal(empty.group.children.length, 0); empty.dispose();
console.log('PASS: bounded seeded lightning, 3D petals and thin-film shells, same-channel/rest identity, 20k-note desktop/XR pools, exact pause/seek, private uniforms, single-pass transparency, and resource disposal.');
