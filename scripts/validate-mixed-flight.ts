import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildPrismScore, samplePrismPose } from '../src/lib/prismTrail';
import { createGlbFlightActor, glbFlightRangeKey, glbFlightReleaseTimes, indexGlbFlightChannels } from '../src/lib/glbFlight';
import { mixedFlightBudget, selectMixedFlightNotes } from '../src/lib/mixedFlight';
import { createStaticFlightActor, staticFlightVertexCount } from '../src/lib/staticFlight';
import { normalizePrismChannels, resolveMixedPrismChannel } from '../src/lib/prismChannels';
import type { ParsedMidi } from '../src/lib/midi';

const note = (time: number, channel: number, duration = 0.8) => ({ time, channel, duration, pitch: 60 + channel, velocity: 100, track: channel });
const midi: ParsedMidi = {
  notes: Array.from({ length: 120 }, (_, i) => [note(i * 0.1, 0), note(i * 0.1, 1), note(i * 0.1, 2)]).flat(),
  controls: [], duration: 13, beats: [], bpm: 120, trackCount: 3, programs: {},
};
const data = buildPrismScore(midi, 5, true, 'pitch', 1, 'mixed')!;
const groups = indexGlbFlightChannels(data), releases = glbFlightReleaseTimes(data);
const map = normalizePrismChannels({
  0: { kind: 'glb', asset: 'Ernie_model.glb', material: 'gold', movement: '01_Head_nod' },
  1: { kind: 'obj', asset: 'Star.obj', material: 'spectrum' },
  2: { kind: 'shape', shape: 'torus', material: 'glass' },
});
assert.deepEqual([0, 1, 2].map(channel => resolveMixedPrismChannel(map, channel).kind), ['glb', 'obj', 'shape']);
const costs = new Map([[0, { vertices: 10_320, skinned: true }], [1, { vertices: 200_000, skinned: false }], [2, { vertices: 1024, skinned: false }]]);
for (const xr of [false, true]) {
  const budget = mixedFlightBudget(xr), selected = selectMixedFlightNotes(data, groups, 5, 0, costs, budget);
  assert(selected.length <= (xr ? 24 : 48));
  assert.equal(new Set(selected).size, selected.length);
  assert.deepEqual(new Set(selected.map(index => data.channels[index])), new Set([0, 1, 2]), 'Every type gets a fair turn in the same flight');
  const total = selected.reduce((sum, index) => sum + costs.get(data.channels[index])!.vertices, 0);
  const skinned = selected.reduce((sum, index) => sum + (costs.get(data.channels[index])!.skinned ? costs.get(data.channels[index])!.vertices : 0), 0);
  assert(total <= budget.vertices && skinned <= budget.skinnedVertices, 'Mixed and skin work remain within their independent budgets');
  assert(selected.every(index => data.birth[index] <= 5));
  const recent = selectMixedFlightNotes(data, groups, 5, 0.5, costs, budget);
  assert(recent.every(index => data.birth[index] >= 4.5), 'Memory removes old objects across every source type');
  selectMixedFlightNotes(data, groups, 1, 0, costs, budget);
  assert.deepEqual(selectMixedFlightNotes(data, groups, 5, 0, costs, budget), selected, 'Backward/forward seeks have no selection history');
}
const huge = new Map(costs); huge.set(1, { vertices: 3_000_000, skinned: false });
const withoutHuge = selectMixedFlightNotes(data, groups, 5, 0, huge, mixedFlightBudget(false));
assert(withoutHuge.some(index => data.channels[index] === 0) && withoutHuge.some(index => data.channels[index] === 2), 'One over-budget mesh cannot hide unrelated channels');
assert(withoutHuge.length > 2);
const retrigger = buildPrismScore({ ...midi, notes: [note(0, 0, 0.09), note(0.01, 0, 0.04)] }, 5, true, 'pitch', 1, 'mixed')!;
assert.notEqual(glbFlightRangeKey(retrigger, 0.049, 0, glbFlightReleaseTimes(retrigger)), glbFlightRangeKey(retrigger, 0.071, 0, glbFlightReleaseTimes(retrigger)), 'Exact release boundaries invalidate mixed selection');

// Real exported skins/clips/geometry; omit only image decoding in Node.
const bytes = fs.readFileSync('public/demo/meshes/Ernie_model.glb');
const size = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + size).toString());
for (const material of json.materials) if (material.pbrMetallicRoughness) delete material.pbrMetallicRoughness.baseColorTexture;
json.images = []; json.textures = [];
const j = Buffer.from(JSON.stringify(json)), pad = Buffer.alloc(Math.ceil(j.length / 4) * 4, 32); j.copy(pad);
const bin = bytes.subarray(20 + size), header = Buffer.alloc(20);
header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(20 + pad.length + bin.length, 8);
header.writeUInt32LE(pad.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
const glb = Buffer.concat([header, pad, bin]);
const gltf = await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '');
const mtl = new MTLLoader().parse(fs.readFileSync('public/demo/meshes/Star.mtl', 'utf8'), ''); mtl.preload();
const obj = new OBJLoader().setMaterials(mtl).parse(fs.readFileSync('public/demo/meshes/Star.obj', 'utf8'));
let objGeometry!: THREE.BufferGeometry;
obj.traverse(object => { if (!objGeometry && object instanceof THREE.Mesh) objGeometry = object.geometry; });
assert(staticFlightVertexCount(obj) > 0);
const glbActor = createGlbFlightActor(gltf.scene, gltf.animations, 'gold', false, '01_Head_nod');
const objActor = createStaticFlightActor({ shape: 'mesh', geometry: objGeometry, material: 'spectrum', wireframe: false, colorMode: 'pitch' });
const shapeActor = createStaticFlightActor({ shape: 'torus', material: 'glass', wireframe: false });
const authoredActor = createStaticFlightActor({ shape: 'mesh', template: obj, material: 'original', wireframe: false });
const actors = [glbActor, objActor, shapeActor, authoredActor];
const stage = new THREE.Group(); actors.forEach(actor => stage.add(actor.root));
actors.forEach((actor, index) => actor.assign(data, index % 3));
const bones = (root: THREE.Object3D) => {
  const values: number[] = [];
  root.traverse(object => { if (object instanceof THREE.Bone) values.push(...object.quaternion.toArray(), ...object.position.toArray()); });
  return values;
};
const rest = bones(gltf.scene);
const update = (time: number) => {
  const position = new THREE.Vector3(), rotation = new THREE.Quaternion();
  samplePrismPose(data.table, time, position, rotation);
  stage.quaternion.copy(rotation).invert(); stage.position.copy(position).negate().applyQuaternion(stage.quaternion);
  actors.forEach((actor, index) => actor.update(data, index % 3, time, 0, 1)); stage.updateMatrixWorld(true);
  return [...bones(glbActor.model), ...actors.flatMap(actor => actor.root.matrixWorld.toArray())];
};
const atAttack = update(0.12);
assert.notDeepEqual(bones(glbActor.model), rest, 'The GLB remains animated in the mixed stage');
assert.deepEqual(bones(gltf.scene), rest, 'Static channels and rig poses cannot mutate the cached GLB');
assert.deepEqual(update(0.12), atAttack, 'Pause freezes every object type and the guide');
update(6);
assert.deepEqual(update(0.12), atAttack, 'A seek restores the same world transforms and skin pose');
update(1); const frozen = bones(glbActor.model); update(5);
assert.deepEqual(bones(glbActor.model), frozen);
update(-1); assert(actors.every(actor => !actor.root.visible), 'Future objects are hidden for all types');
let cacheDisposals = 0;
objGeometry.addEventListener('dispose', () => cacheDisposals++);
const cachedMaterials = new Set<THREE.Material>();
for (const template of [gltf.scene, obj]) template.traverse(object => {
  if (object instanceof THREE.Mesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) cachedMaterials.add(material);
});
cachedMaterials.forEach(material => material.addEventListener('dispose', () => cacheDisposals++));
for (const actor of actors) { actor.dispose(); actor.dispose(); }
assert.equal(cacheDisposals, 0, 'Mixed cleanup leaves cached GLB/OBJ geometry and materials alive');
assert.equal(stage.children.length, 0, 'Every mixed actor releases its scene node');
obj.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
cachedMaterials.forEach(material => material.dispose());
console.log('PASS: mixed GLB/OBJ/built-in flight, actual skins/OBJ/MTL, separate materials, fair weighted desktop/XR budgets, exact seeking, frozen history, and shared-resource ownership.');
