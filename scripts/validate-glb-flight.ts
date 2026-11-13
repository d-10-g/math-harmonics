import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildPrismScore } from '../src/lib/prismTrail';
import { createGlbFlightActor, glbFlightPose, glbFlightRangeKey, glbFlightReleaseTimes, indexGlbFlightChannels, selectGlbFlightNotes,
  GLB_FLIGHT_LIMIT, GLB_FLIGHT_XR_LIMIT } from '../src/lib/glbFlight';
import type { ParsedMidi } from '../src/lib/midi';

const note = (time: number, channel: number, duration = 0.8) => ({ time, channel, duration, pitch: 60 + channel, velocity: 100, track: channel });
const midi: ParsedMidi = {
  notes: [note(0, 15, 9), ...Array.from({ length: 120 }, (_, i) => note(i * 0.05, 0))],
  controls: [], duration: 10, beats: [], bpm: 120, trackCount: 2, programs: {},
};
const data = buildPrismScore(midi, 5, true, 'pitch', 1, 'glb')!;
assert.equal(data.channels.length, midi.notes.length);
assert.equal(data.pitches.length, midi.notes.length);
const groups = indexGlbFlightChannels(data);
const selected = selectGlbFlightNotes(data, groups, 5, 0, GLB_FLIGHT_LIMIT);
assert.equal(selected.length, GLB_FLIGHT_LIMIT);
assert.equal(new Set(selected).size, selected.length, 'Pool selection cannot duplicate a note');
assert(selected.some(index => data.channels[index] === 15), 'A quieter channel survives dense accompaniment');
assert(selected.every(index => data.birth[index] <= 5), 'Future notes cannot enter the pool');
assert.equal(selectGlbFlightNotes(data, groups, 5, 0, GLB_FLIGHT_XR_LIMIT).length, GLB_FLIGHT_XR_LIMIT);
assert(selectGlbFlightNotes(data, groups, 5, 1, GLB_FLIGHT_LIMIT).every(index => data.birth[index] >= 4));
assert.deepEqual(selectGlbFlightNotes(data, groups, 5, 0, 12), selectGlbFlightNotes(data, groups, 5, 0, 12));
assert.deepEqual(glbFlightPose(data, 0, 9), glbFlightPose(data, 0, 100), 'Released pose freezes phase AND velocity weight');

const retrigger = buildPrismScore({ ...midi, notes: [note(0, 0, 0.09), note(0.01, 0, 0.04)] }, 5, true, 'pitch', 1, 'glb')!;
const retriggerGroups = indexGlbFlightChannels(retrigger), releases = glbFlightReleaseTimes(retrigger);
assert.notEqual(glbFlightRangeKey(retrigger, 0.049, 0, releases), glbFlightRangeKey(retrigger, 0.071, 0, releases));
assert.deepEqual(selectGlbFlightNotes(retrigger, retriggerGroups, 0.049, 0, 1), [1]);
assert.deepEqual(selectGlbFlightNotes(retrigger, retriggerGroups, 0.071, 0, 1), [0], 'An earlier held note resumes when its retrigger releases');

async function loadRig(name: string) {
  const file = fs.readFileSync(`public/demo/meshes/${name}_model.glb`);
  const size = file.readUInt32LE(12);
  const json = JSON.parse(file.subarray(20, 20 + size).toString());
  // Only image decoding is omitted in Node. All exported skins, animation
  // tracks, geometry and material identities come from the real GLB file.
  for (const material of json.materials) if (material.pbrMetallicRoughness) delete material.pbrMetallicRoughness.baseColorTexture;
  json.images = []; json.textures = [];
  const j = Buffer.from(JSON.stringify(json)), pad = Buffer.alloc(Math.ceil(j.length / 4) * 4, 32); j.copy(pad);
  const bin = file.subarray(20 + size), header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(20 + pad.length + bin.length, 8);
  header.writeUInt32LE(pad.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const buffer = Buffer.concat([header, pad, bin]);
  return new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '');
}
const signature = (root: THREE.Object3D) => {
  const values: number[] = [];
  root.traverse(object => { if (object instanceof THREE.Bone) values.push(...object.position.toArray(), ...object.quaternion.toArray()); });
  return values;
};
for (const name of ['Ernie', 'Kira']) {
  const gltf = await loadRig(name);
  const actor = createGlbFlightActor(gltf.scene, gltf.animations, 'ornament', false, gltf.animations[0].name);
  const other = createGlbFlightActor(gltf.scene, gltf.animations, 'gold', false, gltf.animations[1].name);
  const authored = createGlbFlightActor(gltf.scene, gltf.animations, 'original', false, gltf.animations[0].name);
  const rest = signature(gltf.scene);
  actor.assign(data, 0); other.assign(data, 0); authored.assign(data, 0);
  assert.equal(actor.root.scale.x, actor.root.scale.y);
  assert.equal(actor.root.scale.y, actor.root.scale.z, 'GLB models retain their proportions for long notes');
  actor.update(data, 0, 0.12, 0, 1);
  assert.notDeepEqual(signature(actor.model), rest, `${name} genuinely deforms from the MIDI note`);
  assert.deepEqual(signature(other.model), rest, 'Each historical model owns a separate rig');
  assert.deepEqual(signature(gltf.scene), rest, 'The cached template stays in its authored pose');
  const paused = signature(actor.model); actor.update(data, 0, 0.12, 0, 1); assert.deepEqual(signature(actor.model), paused);
  actor.update(data, 0, 9, 0, 1); const released = signature(actor.model);
  actor.update(data, 0, 100, 0, 1); assert.deepEqual(signature(actor.model), released, 'Old history stays frozen');
  actor.update(data, 0, 0.12, 0, 1); assert.deepEqual(signature(actor.model), paused, 'Backward seeks restore the exact skin pose');
  actor.update(data, 0, 9, 0, 1); assert.deepEqual(signature(actor.model), released);
  for (const a of actor.skeletons) for (const b of other.skeletons) assert.notEqual(a, b);
  for (const a of actor.materials) for (const b of other.materials) assert.notEqual(a, b, 'Channel materials are independent');
  for (const material of actor.materials) {
    assert(material instanceof THREE.MeshPhysicalMaterial);
    assert.equal(material.metalness, 0.96);
    const shader = { uniforms: {}, fragmentShader: '#include <common>\n#include <alphatest_fragment>' } as any;
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    assert(shader.fragmentShader.includes('uGlbFlightFade'));
  }
  let materialDisposals = 0, geometryDisposals = 0, authoredDisposals = 0;
  actor.materials.forEach(material => material.addEventListener('dispose', () => materialDisposals++));
  gltf.scene.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.addEventListener('dispose', () => geometryDisposals++);
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach(material => material.addEventListener('dispose', () => authoredDisposals++));
  });
  actor.dispose(); actor.dispose();
  assert.equal(materialDisposals, actor.materials.size, 'Per-model materials dispose exactly once');
  assert.equal(geometryDisposals, 0, 'Disposing history cannot destroy cached geometry');
  assert.equal(authoredDisposals, 0, 'Disposing history cannot destroy authored materials');
  other.dispose(); authored.dispose();
}
console.log('PASS: real Ernie/Kira flight animation, independent skins/materials, deterministic pause/seek/frozen history, proportional scaling, channel-fair desktop/XR budgets, and exact resource ownership.');
