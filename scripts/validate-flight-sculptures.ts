import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createFlightSculptures } from '../src/components/FlightSculptures';
import { DEFAULT_FLIGHT_EFFECTS } from '../src/lib/flightEffects';
import { buildChordLinks, CHORD_LINK_NEIGHBORS, CHORD_LINK_WINDOW, SCULPTURE_BUDGETS,
  SCULPTURE_LIFETIMES, sculptureEnvelope } from '../src/lib/flightSculptures';
import { buildPrismScore } from '../src/lib/prismTrail';
import type { ParsedMidi } from '../src/lib/midi';

const score: ParsedMidi = { notes: Array.from({ length: 20000 }, (_, i) => ({
  time: i * 0.005, duration: 0.25, velocity: 70 + i % 45, channel: i % 16, track: i % 16, pitch: 40 + i % 48,
})), duration: 101, controls: [], beats: [], bpm: 120, trackCount: 16, programs: {} };
const data = buildPrismScore(score, 5, true, 'chroma', 1, 'mixed')!;
const links = buildChordLinks(data);
assert(links.birth.length > 1000 && links.birth.length <= data.count * CHORD_LINK_NEIGHBORS);
for (let i = 0; i < links.birth.length; i++) {
  const from = links.from[i], to = links.to[i];
  assert.notEqual(data.channels[from], data.channels[to], 'Constellations weave different instruments');
  assert(from < to && data.birth[to] - data.birth[from] <= CHORD_LINK_WINDOW, 'Only nearby attacks form a chord');
  assert.equal(links.birth[i], data.birth[to], 'Links never appear before both notes sound');
}
assert.deepEqual(buildChordLinks(data), links, 'Chord selection is deterministic');
const separated = buildPrismScore({ ...score, notes: [
  { time: 0, duration: 0.2, velocity: 100, channel: 0, track: 0, pitch: 60 },
  { time: 2, duration: 0.2, velocity: 100, channel: 1, track: 1, pitch: 66 },
  { time: 2.1, duration: 0.2, velocity: 100, channel: 1, track: 1, pitch: 67 },
] }, 5, true, 'chroma', 1, 'mixed')!;
assert.equal(buildChordLinks(separated).birth.length, 0, 'Rests and single-channel phrases cannot generate chord webs');
for (const lifetime of Object.values(SCULPTURE_LIFETIMES)) {
  assert.equal(sculptureEnvelope(-1, lifetime), 0); assert.equal(sculptureEnvelope(0, lifetime), 0);
  assert.equal(sculptureEnvelope(lifetime, lifetime), 0); assert.equal(sculptureEnvelope(lifetime + 1, lifetime), 0);
  for (let age = 0; age <= lifetime; age += 0.01) assert(sculptureEnvelope(age, lifetime) >= 0 && sculptureEnvelope(age, lifetime) <= 1);
}
const settings = { ...DEFAULT_FLIGHT_EFFECTS, auroras: 1.2, constellations: 1.1, gyroscopes: 0.9 };
function snapshot(group: THREE.Group) {
  return group.children.map(raw => {
    const mesh = raw as THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
    return { count: mesh.geometry.instanceCount, time: mesh.material.uniforms.uTime.value,
      attributes: Object.fromEntries(Object.entries(mesh.geometry.attributes).filter(([, a]) => (a as THREE.BufferAttribute).usage === THREE.DynamicDrawUsage)
        .map(([name, a]) => [name, Array.from(a.array).slice(0, mesh.geometry.instanceCount * a.itemSize)])) };
  });
}
for (const xr of [false, true]) {
  const pool = createFlightSculptures(data, xr, settings), budget = xr ? SCULPTURE_BUDGETS.xr : SCULPTURE_BUDGETS.desktop;
  assert.equal(pool.group.children.length, 3, 'Three overlay structures need only three GPU draws');
  pool.update(40, settings);
  pool.group.children.forEach((raw, index) => {
    const mesh = raw as THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
    const count = mesh.geometry.instanceCount, cap = [budget.auroras, budget.constellations, budget.gyroscopes][index];
    assert(count > 0 && count <= cap, '20k-note pieces keep a fixed recent geometry budget');
    for (const attribute of Object.values(mesh.geometry.attributes)) assert(Array.from(attribute.array).every(Number.isFinite));
    const meta = mesh.geometry.getAttribute('aMeta');
    for (let i = 0; i < count; i++) assert(meta.getX(i) <= 40);
    assert.equal(mesh.material.depthWrite, false); assert.equal(mesh.material.depthTest, true);
  });
  const before = snapshot(pool.group);
  pool.update(75.125, settings); pool.update(40, settings);
  assert.deepEqual(snapshot(pool.group), before, 'Backward seeks restore buffers, no integrated state');
  pool.update(40, settings); assert.deepEqual(snapshot(pool.group), before, 'Pausing is exactly repeatable');
  const versions = pool.group.children.map(raw => ((raw as THREE.Mesh).geometry.getAttribute('aMeta') as THREE.BufferAttribute).version);
  pool.update(40, { ...settings, auroras: 0.4, constellations: 2, gyroscopes: 1.5 });
  assert.deepEqual(pool.group.children.map(raw => ((raw as THREE.Mesh).geometry.getAttribute('aMeta') as THREE.BufferAttribute).version), versions,
    'Strength changes update uniforms without uploading geometry');
  pool.update(40, DEFAULT_FLIGHT_EFFECTS); assert(pool.group.children.every(object => !object.visible));
  pool.update(40, settings); assert.deepEqual(snapshot(pool.group), before, 'Disabled effects resume deterministically');
  let geometries = 0, materials = 0;
  pool.group.children.forEach(raw => {
    const mesh = raw as THREE.Mesh;
    mesh.geometry.addEventListener('dispose', () => geometries++);
    (mesh.material as THREE.Material).addEventListener('dispose', () => materials++);
  });
  pool.dispose(); pool.dispose();
  assert.equal(geometries, 3); assert.equal(materials, 3); assert.equal(pool.group.children.length, 0);
  const replacement = createFlightSculptures(data, xr, settings);
  replacement.update(40, settings); assert.deepEqual(snapshot(replacement.group), before, 'StrictMode setup after cleanup gets fresh equivalent resources');
  replacement.dispose();
}
const disabled = createFlightSculptures(data, false, DEFAULT_FLIGHT_EFFECTS);
assert.equal(disabled.group.children.length, 0, 'Disabled overlay structures allocate no GPU buffers'); disabled.dispose();
console.log('PASS: cross-instrument chord topology, rest separation, smooth lifetimes, bounded 20k-note desktop/XR structures, exact pause/seek, uniform-only strengths and owned StrictMode-safe disposal.');
