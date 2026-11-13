import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createFlightPhenomena } from '../src/components/FlightPhenomena';
import { DEFAULT_FLIGHT_EFFECTS } from '../src/lib/flightEffects';
import { crystalDirections, crystalLength, mobiusPoint, phenomenaEnvelope, PHENOMENA_BUDGETS, PHENOMENA_LIFETIMES } from '../src/lib/flightPhenomena';
import { buildPrismScore } from '../src/lib/prismTrail';
import type { ParsedMidi } from '../src/lib/midi';

for (const phase of [0, 0.7, 3.1, 17]) for (const across of [-1, -0.5, 0, 0.5, 1]) {
  const a = new THREE.Vector3(...mobiusPoint(0, -across, phase, 1));
  const b = new THREE.Vector3(...mobiusPoint(Math.PI * 2, across, phase, 1));
  assert(a.distanceTo(b) < 1e-12, 'The half-twist strip closes on its opposite edge');
}
for (const value of [NaN, Infinity, -50, 0, 0.2, 1, 50]) {
  const point = mobiusPoint(value, value, value, value);
  assert(point.every(Number.isFinite) && Math.hypot(...point) < 1.9, 'Edited parameters cannot invert or explode the strip');
}
const directions = crystalDirections();
assert.equal(directions.length, 12);
assert.equal(new Set(directions.map(direction => direction.join(','))).size, 12);
directions.forEach((direction, i) => {
  assert(Math.abs(Math.hypot(...direction) - 1) < 1e-12);
  assert(directions.some(other => Math.hypot(...other.map((value, n) => value + direction[n])) < 1e-12), 'Geode arms have balanced opposing directions');
  assert(crystalLength(i) >= 1.15 && crystalLength(i) <= 1.7);
});
for (const life of Object.values(PHENOMENA_LIFETIMES)) {
  for (const age of [-1, 0, life, life + 1, NaN]) assert.equal(phenomenaEnvelope(age, life), 0);
  for (let age = 0; age < life; age += 0.015) assert(phenomenaEnvelope(age, life) >= 0 && phenomenaEnvelope(age, life) <= 1);
}
const score: ParsedMidi = { notes: Array.from({ length: 20000 }, (_, i) => ({ time: i * 0.005,
  duration: 0.25, velocity: 65 + i % 45, channel: i % 16, track: i % 16, pitch: 40 + i % 48,
})), duration: 101, controls: [], beats: [], bpm: 120, trackCount: 16, programs: {} };
const data = buildPrismScore(score, 5, true, 'chroma', 1, 'mixed')!;
const settings = { ...DEFAULT_FLIGHT_EFFECTS, ribbons: 1.1, crystals: 0.8, vortexes: 1.2 };
type Mesh = THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
const signature = (group: THREE.Group) => group.children.map(raw => {
  const mesh = raw as Mesh;
  return { count: mesh.geometry.instanceCount, time: mesh.material.uniforms.uTime.value,
    attributes: Object.fromEntries(Object.entries(mesh.geometry.attributes).filter(([, a]) => (a as THREE.BufferAttribute).usage === THREE.DynamicDrawUsage)
      .map(([key, a]) => [key, Array.from(a.array).slice(0, mesh.geometry.instanceCount * a.itemSize)])) };
});
for (const xr of [false, true]) {
  const pool = createFlightPhenomena(data, xr, settings), budget = xr ? PHENOMENA_BUDGETS.xr : PHENOMENA_BUDGETS.desktop;
  assert.equal(pool.group.children.length, 3, 'All three phenomena need only three additional draw batches');
  pool.update(40, settings);
  pool.group.children.forEach((raw, i) => {
    const mesh = raw as Mesh, capacity = [budget.ribbons, budget.crystals, budget.vortexes][i];
    assert(mesh.geometry.instanceCount > 0 && mesh.geometry.instanceCount <= capacity);
    assert.equal(mesh.material.depthTest, true); assert.equal(mesh.material.depthWrite, false);
    assert.equal(mesh.material.forceSinglePass, true);
    assert.equal(mesh.material.blending, THREE.NormalBlending, 'Metallic surfaces and dark vortex cores retain colored transparency');
    const positions = mesh.geometry.getAttribute('position'), indices = mesh.geometry.getIndex();
    if (indices) assert(Array.from(indices.array).every(value => value >= 0 && value < positions.count));
    for (const attribute of Object.values(mesh.geometry.attributes)) assert(Array.from(attribute.array).every(Number.isFinite));
    const meta = mesh.geometry.getAttribute('aMeta');
    for (let note = 0; note < mesh.geometry.instanceCount; note++) assert(meta.getX(note) <= 40);
  });
  const geode = (pool.group.children[1] as Mesh).geometry, normals = geode.getAttribute('normal');
  assert(geode.getAttribute('position').count > 300, 'The geode has a faceted core and genuine three-dimensional branches');
  for (let n = 0; n < normals.count; n++) assert(Math.abs(Math.hypot(normals.getX(n), normals.getY(n), normals.getZ(n)) - 1) < 1e-6);
  const bary = geode.getAttribute('aBary'), facets = geode.getAttribute('aFacet');
  for (let n = 0; n < bary.count; n += 3) {
    assert.equal(bary.getX(n), 1); assert.equal(bary.getY(n + 1), 1); assert.equal(bary.getZ(n + 2), 1);
    assert.equal(facets.getX(n), facets.getX(n + 1)); assert.equal(facets.getX(n + 1), facets.getX(n + 2));
  }
  const before = signature(pool.group);
  pool.update(79.75, settings); pool.update(40, settings);
  assert.deepEqual(signature(pool.group), before, 'Backward seeks recreate the identical bounded recent-note pool');
  const versions = pool.group.children.map(raw => ((raw as Mesh).geometry.getAttribute('aMeta') as THREE.BufferAttribute).version);
  pool.update(40, { ...settings, ribbons: 2, crystals: 1.5, vortexes: 0.2 });
  assert.deepEqual(pool.group.children.map(raw => ((raw as Mesh).geometry.getAttribute('aMeta') as THREE.BufferAttribute).version), versions, 'Strength edits change uniforms without rebuilding topology or reuploading note buffers');
  assert.deepEqual(signature(pool.group), before, 'Paused time preserves every animation uniform and note attribute');
  pool.update(40, DEFAULT_FLIGHT_EFFECTS); assert(pool.group.children.every(object => !object.visible));
  pool.update(40, settings); assert.deepEqual(signature(pool.group), before);
  let geometries = 0, materials = 0;
  pool.group.children.forEach(raw => {
    const mesh = raw as Mesh;
    mesh.geometry.addEventListener('dispose', () => geometries++); mesh.material.addEventListener('dispose', () => materials++);
  });
  pool.dispose(); pool.dispose(); assert.equal(geometries, 3); assert.equal(materials, 3); assert.equal(pool.group.children.length, 0);
  const replacement = createFlightPhenomena(data, xr, settings);
  replacement.update(40, settings); assert.deepEqual(signature(replacement.group), before, 'StrictMode remounts own fresh equivalent buffers'); replacement.dispose();
}
for (const key of ['ribbons', 'crystals', 'vortexes'] as const) {
  const pool = createFlightPhenomena(data, false, { ...DEFAULT_FLIGHT_EFFECTS, [key]: 1 });
  assert.equal(pool.group.children.length, 1, 'Individual layers allocate only their own resources'); pool.dispose();
}
const disabled = createFlightPhenomena(data, false, DEFAULT_FLIGHT_EFFECTS);
assert.equal(disabled.group.children.length, 0); disabled.dispose();
console.log('PASS: closed Mobius topology, balanced branched geodes, finite lifetimes, 20k-note bounded desktop/XR pools, exact rewind/pause, uniform-only strengths, independent layers, and owned resource disposal.');
