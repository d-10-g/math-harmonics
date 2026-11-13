import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { createCatPoseLayer, type CatPoseSample } from '../src/lib/catPose';
import { erniePose } from '../src/lib/ernie';

async function loadRig(name: string) {
  const bytes = fs.readFileSync(`public/demo/meshes/${name}_model.glb`), size = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + size).toString());
  for (const material of json.materials) if (material.pbrMetallicRoughness) delete material.pbrMetallicRoughness.baseColorTexture;
  json.images = []; json.textures = [];
  const text = Buffer.from(JSON.stringify(json)), padded = Buffer.alloc(Math.ceil(text.length / 4) * 4, 32); text.copy(padded);
  const binary = bytes.subarray(20 + size), header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(20 + padded.length + binary.length, 8);
  header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const buffer = Buffer.concat([header, padded, binary]);
  return new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '');
}
function signature(root: THREE.Object3D) {
  const result: number[] = [];
  root.traverse(object => { if ((object as THREE.Bone).isBone) result.push(...object.position, ...object.quaternion, ...object.scale); });
  return result;
}
function point(root: THREE.Object3D, bone: string) { root.updateMatrixWorld(true); return root.getObjectByName(bone)!.getWorldPosition(new THREE.Vector3()); }
function skin(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const positions: number[] = [], vertex = new THREE.Vector3();
  root.traverse(object => {
    const mesh = object as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    mesh.skeleton.update();
    for (let i = 0; i < mesh.geometry.attributes.position.count; i += 7) {
      mesh.getVertexPosition(i, vertex); positions.push(...vertex);
    }
  });
  return positions;
}
assert.equal(createCatPoseLayer(new THREE.Group()), null, 'Unrelated models retain their own animations');
const partial = new THREE.Group(); partial.name = 'Ernie_Rig'; const head = new THREE.Bone(); head.name = 'head'; partial.add(head);
assert.equal(createCatPoseLayer(partial), null, 'A partial/name-colliding rig is not treated as a cat');
for (const name of ['Ernie', 'Kira']) {
  const gltf = await loadRig(name), model = clone(gltf.scene), untouched = clone(gltf.scene);
  const templatePose = signature(gltf.scene), originalSkin = skin(model), tailTip = point(model, 'tail_3');
  const layer = createCatPoseLayer(model)!; assert(layer);
  const quiet: CatPoseSample = { time: 1, phase: 0, weight: 0, seed: 61, strength: 2 };
  layer.reset(); layer.apply(quiet);
  const relaxed = signature(model), relaxedTip = point(model, 'tail_3');
  assert(relaxedTip.y > tailTip.y + .10, `${name}'s resting tail rises into a greeting curve`);
  const a = point(model, 'tail_1').sub(point(model, 'tail_0')).normalize();
  const b = point(model, 'tail_3').sub(point(model, 'tail_2')).normalize();
  assert(a.dot(b) < .9, `${name}'s tail segments form a curve instead of a straight pole`);
  const newSkin = skin(model);
  assert(Math.max(...newSkin.map((v, i) => Math.abs(v - originalSkin[i]))) > .10, 'The natural pose deforms the actual skinned mesh');
  layer.reset(); layer.apply(quiet); assert.deepEqual(signature(model), relaxed, 'Resting pose does not accumulate each frame');
  assert.deepEqual(signature(gltf.scene), templatePose, 'Cached GLB skeleton is unchanged');
  assert.deepEqual(signature(untouched), templatePose, 'A second channel owns its own pose');
  // Every movement is sampled through a real mixer, followed by exactly the
  // shared layer used in both the flight engine and the standalone cat stage.
  for (const clip of gltf.animations) {
    layer.reset(true);
    const mixer = new THREE.AnimationMixer(model), action = mixer.clipAction(clip).play();
    const sample = (time: number, strength = 2) => {
      layer.reset(); const p = erniePose({ time: 0, duration: .22, velocity: 110, channel: 0, pitch: 61, track: 0 }, time);
      action.time = p.phase * clip.duration; action.setEffectiveWeight(p.weight); mixer.update(0);
      layer.apply({ time, ...p, seed: 61, movement: clip.name, strength }); return signature(model);
    };
    const active = sample(.121);
    assert(active.every(Number.isFinite), `${clip.name} has a finite animated pose`);
    assert.notDeepEqual(active, relaxed, `${clip.name} reads distinctly from the resting pose`);
    assert.deepEqual(sample(.121), active, `${clip.name} remains exact when paused`);
    sample(.20); assert.deepEqual(sample(.121), active, `${clip.name} seeks backwards exactly`);
    sample(.38); const settled = signature(model); sample(.38); assert.deepEqual(signature(model), settled);
    const max = sample(.121, 3), gentle = sample(.121, .5); assert.notDeepEqual(max, gentle, 'Gesture strength still changes expression');
    action.stop(); mixer.uncacheRoot(model);
  }
  assert.deepEqual(signature(gltf.scene), templatePose);
}
console.log('PASS: real Ernie/Kira curved resting tails, visible skin deformation, all 64 expressive clip layers, gesture strength, independent rigs, and exact pause/seek sampling.');
