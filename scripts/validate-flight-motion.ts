import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DEFAULT_FLIGHT_EFFECTS, FLIGHT_MOTIONS } from '../src/lib/flightEffects';
import { createFlightMotionSample, deformFlightPoint, flightMotionIndex, sampleFlightMotion } from '../src/lib/flightMotion';
import { createPrismMaterial, makePrismUniforms, updatePrismEffectsUniforms } from '../src/lib/prismRender';
import { createStaticFlightActor } from '../src/lib/staticFlight';
import { createGlbFlightActor } from '../src/lib/glbFlight';
import { buildPrismScore } from '../src/lib/prismTrail';
import type { ParsedMidi } from '../src/lib/midi';

const a = createFlightMotionSample(), b = createFlightMotionSample();
const signature = () => [...a.offset.toArray(), ...a.rotation.toArray(), ...a.scale.toArray(), a.twist];
for (const [motion] of FLIGHT_MOTIONS) {
  const effects = { ...DEFAULT_FLIGHT_EFFECTS, motion, motionAmount: 2, morph: 1 };
  for (const time of [-10, 0, 0.025, 0.7, 6, 120, NaN]) {
    sampleFlightMotion(0, 0.35, time, effects, a);
    assert(signature().every(Number.isFinite), `${motion} motion stays finite`);
    assert(a.offset.length() <= 2.3);
    assert(a.scale.toArray().every(v => v > 0.3 && v < 3), 'Morphing never collapses or inverts a mesh');
    assert(a.rotation.toArray().every(v => Math.abs(v) < 1.5));
  }
  sampleFlightMotion(0.25, 0.35, 3.75, effects, a); const first = signature();
  sampleFlightMotion(0.25, 0.35, 90, effects, a);
  sampleFlightMotion(0.25, 0.35, 3.75, effects, a);
  assert.deepEqual(signature(), first, 'Backward seek restores the exact motion');
  sampleFlightMotion(0.25, 0.35, 3.75, effects, a);
  assert.deepEqual(signature(), first, 'Paused frames do not integrate drift');
  sampleFlightMotion(0.25, 0.75, 3.75, effects, b);
  assert.notDeepEqual(a.scale.toArray(), b.scale.toArray(), 'Note hues seed independent motion');
  for (let step = 0; step <= 1200; step++) {
    sampleFlightMotion(0.25, 0.35, 0.25 + step * 0.05, effects, a);
    assert(signature().every(Number.isFinite), `${motion} stays finite over an entire minute`);
    assert(a.offset.length() <= 2.3, `${motion} remains inside the flight envelope`);
    assert(a.scale.toArray().every(value => value > 0.3 && value < 3));
  }
  sampleFlightMotion(0.25, 0.35, 0.25, effects, a);
  assert(signature().every((value, index) => value === (index >= 6 && index <= 8 ? 1 : 0)), `${motion} starts on the original note position`);
  sampleFlightMotion(0.25, 0.35, 0.25 + 1e-7, effects, a);
  assert(a.offset.length() < 1e-6 && a.rotation.length() < 1e-6, `${motion} has no attack discontinuity`);
  sampleFlightMotion(0.25, 0.35, 30, { ...effects, motionAmount: 0, morph: 0 }, a);
  assert.equal(a.active, false);
  assert.deepEqual(signature(), [0, 0, 0, 0, 0, 0, 1, 1, 1, 0], 'A zero strength field restores the exact baseline');
}
assert.equal(flightMotionIndex('breathe'), 4, 'Existing motion indices remain compatible with shader uniforms');
assert.equal(flightMotionIndex('helix'), 5);
assert.equal(flightMotionIndex('butterfly'), 6);
// A corkscrew must move in depth; a butterfly has opposite wings and
// crosses their center. These geometric checks distinguish the new fields
// from a face-on orbit, even when the shader still compiles.
const helix = { ...DEFAULT_FLIGHT_EFFECTS, motion: 'helix' as const, motionAmount: 1, morph: 0 };
const butterfly = { ...DEFAULT_FLIGHT_EFFECTS, motion: 'butterfly' as const, motionAmount: 1, morph: 0 };
let minDepth = Infinity, maxDepth = -Infinity, minWing = Infinity, maxWing = -Infinity;
for (let step = 0; step < 200; step++) {
  const time = 20 + step * 0.05;
  sampleFlightMotion(0, 0, time, helix, a);
  assert(Math.abs(Math.hypot(a.offset.x, a.offset.z) - 0.68) < 1e-12, 'Helix retains a circular depth orbit');
  minDepth = Math.min(minDepth, a.offset.z); maxDepth = Math.max(maxDepth, a.offset.z);
  sampleFlightMotion(0, 0, time, butterfly, a);
  minWing = Math.min(minWing, a.offset.x); maxWing = Math.max(maxWing, a.offset.x);
}
assert(minDepth < -0.6 && maxDepth > 0.6, 'Corkscrew visits both sides of the depth axis');
assert(minWing < -0.9 && maxWing > 0.9, 'Butterfly visits both wings');
for (const turns of [10, 11, 12]) {
  sampleFlightMotion(0, 0, turns * Math.PI / 1.35, butterfly, a);
  assert(Math.abs(a.offset.x) < 1e-12 && Math.abs(a.offset.y) < 1e-12, 'The figure-eight crosses its center on every half cycle');
}
sampleFlightMotion(0, 0.8, 9, undefined, a);
assert.equal(a.active, false);
assert.deepEqual(signature(), [0, 0, 0, 0, 0, 0, 1, 1, 1, 0], 'Old links keep exactly still transforms');
const point = new THREE.Vector3(0.23, 0.38, 0.82), normal = new THREE.Vector3(0.4, 0.5, 0.7).normalize();
const outPoint = new THREE.Vector3(), outNormal = new THREE.Vector3();
deformFlightPoint(point, normal, a, outPoint, outNormal);
assert.deepEqual(outPoint.toArray(), point.toArray());
assert.deepEqual(outNormal.toArray(), normal.toArray());
const effects = { ...DEFAULT_FLIGHT_EFFECTS, motion: 'vortex' as const, motionAmount: 1.7, morph: 0.9 };
const u = new THREE.Vector3().crossVectors(normal, new THREE.Vector3(1, 0, 0)).normalize();
const v = new THREE.Vector3().crossVectors(normal, u).normalize();
for (const [motion] of FLIGHT_MOTIONS) {
  sampleFlightMotion(0, 0.35, 3.75, { ...effects, motion }, a);
  deformFlightPoint(point, normal, a, outPoint, outNormal);
  assert(Math.abs(outNormal.length() - 1) < 1e-12);
  for (const tangent of [u, v]) {
    const shifted = point.clone().addScaledVector(tangent, 1e-6), result = new THREE.Vector3();
    deformFlightPoint(shifted, normal, a, result, new THREE.Vector3());
    const transformedTangent = result.sub(outPoint).normalize();
    assert(Math.abs(transformedTangent.dot(outNormal)) < 1e-5, `${motion}: analytic normals remain perpendicular to the morphed surface`);
  }
}

const uniforms = makePrismUniforms(), otherUniforms = makePrismUniforms();
updatePrismEffectsUniforms(uniforms, effects);
assert.equal(uniforms.uFlightMotion.value, 2);
assert.equal(uniforms.uFlightMorph.value, 0.9);
assert.equal(otherUniforms.uFlightMorph.value, 0, 'Channel morph uniforms are private');
for (const finish of ['spectrum', 'ornament', 'glass'] as const) {
  const material = createPrismMaterial(finish, 'auto', false, uniforms);
  const shader = material instanceof THREE.ShaderMaterial ? { uniforms: material.uniforms, vertexShader: material.vertexShader, fragmentShader: material.fragmentShader }
    : { uniforms: {} as Record<string, any>, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
  if (!(material instanceof THREE.ShaderMaterial)) material.onBeforeCompile(shader as any, null as any);
  assert(shader.vertexShader.includes('flightDeform'));
  assert(shader.vertexShader.includes('n.y - twist * z * nx + twist * x * nz'), 'Morph carries its analytic normal transform');
  assert.equal(shader.uniforms.uFlightMorph, uniforms.uFlightMorph);
  material.dispose();
}
updatePrismEffectsUniforms(uniforms, undefined);
assert.equal(uniforms.uFlightMotion.value, 0);
assert.equal(uniforms.uFlightMorph.value, 0, 'Clear FX restores the shader baseline');

const midi: ParsedMidi = { notes: [{time:0,duration:2,velocity:96,pitch:60,channel:0,track:0}], controls:[], duration:5, beats:[], bpm:120, trackCount:1, programs:{} };
const data = buildPrismScore(midi, 5, true, 'chroma', 1, 'mixed')!;
const staticActor = createStaticFlightActor({shape:'torus',material:'gold',wireframe:false});
staticActor.assign(data, 0); staticActor.update(data, 0, 1.1, 0, 1, effects);
const staticMaterial = (staticActor.root.children[0] as THREE.InstancedMesh).material as THREE.Material;
const staticShader = {uniforms:{} as Record<string, any>,vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader};
staticMaterial.onBeforeCompile(staticShader as any, null as any);
assert.equal(staticShader.uniforms.uFlightMorph.value, 0.9);
staticActor.update(data, 0, 1.1, 0, 1);
assert.equal(staticShader.uniforms.uFlightMorph.value, 0);
staticActor.dispose();

// Parse the actual exported rig, omitting only image decoding in Node.
const bytes = fs.readFileSync('public/demo/meshes/Ernie_model.glb'), jsonLength = bytes.readUInt32LE(12);
const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
for (const m of json.materials) if(m.pbrMetallicRoughness) delete m.pbrMetallicRoughness.baseColorTexture;
json.images=[]; json.textures=[];
const text = Buffer.from(JSON.stringify(json)), padded = Buffer.alloc(Math.ceil(text.length / 4) * 4, 32); text.copy(padded);
const bin = bytes.subarray(20 + jsonLength), header = Buffer.alloc(20);
header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2,4); header.writeUInt32LE(20+padded.length+bin.length,8);
header.writeUInt32LE(padded.length,12); header.writeUInt32LE(0x4e4f534a,16);
const file = Buffer.concat([header,padded,bin]);
const rig = await new GLTFLoader().parseAsync(file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength),'');
const actor = createGlbFlightActor(rig.scene, rig.animations, 'gold', false, rig.animations[0].name);
actor.assign(data,0); actor.update(data,0,1.1,0,1);
const body = actor.root.children[0];
const oldBody = [...body.position.toArray(),...body.quaternion.toArray(),...body.scale.toArray()];
const bones = (root:THREE.Object3D) => { const values:number[]=[];root.traverse(o=>{if(o instanceof THREE.Bone)values.push(...o.position.toArray(),...o.quaternion.toArray());});return values; };
const beforeBones = bones(actor.model), templateBones = bones(rig.scene);
actor.update(data,0,1.1,0,1,effects);
const movedBody = [...body.position.toArray(),...body.quaternion.toArray(),...body.scale.toArray()];
assert.notDeepEqual(movedBody,oldBody,'GLB model bodies visibly squash and orbit');
assert.deepEqual(bones(actor.model),beforeBones,'Body morph cannot corrupt the rig pose');
assert.deepEqual(bones(rig.scene),templateBones,'The cached rig remains untouched');
actor.update(data,0,40,0,1,effects); actor.update(data,0,1.1,0,1,effects);
assert.deepEqual([...body.position.toArray(),...body.quaternion.toArray(),...body.scale.toArray()],movedBody);
for (const motion of ['helix', 'butterfly'] as const) {
  const field = { ...effects, motion };
  actor.update(data,0,1.1,0,1,field);
  const transform = [...body.position.toArray(),...body.quaternion.toArray(),...body.scale.toArray()];
  assert.notDeepEqual(transform,oldBody, `${motion} animates the model body`);
  actor.update(data,0,17,0,1,field); actor.update(data,0,1.1,0,1,field);
  assert.deepEqual([...body.position.toArray(),...body.quaternion.toArray(),...body.scale.toArray()],transform, `${motion} GLB seeks restore the exact body`);
  assert.deepEqual(bones(actor.model),beforeBones, `${motion} keeps the authored skeletal gesture intact`);
  assert.deepEqual(bones(rig.scene),templateBones, `${motion} leaves cached rig resources intact`);
}
actor.update(data,0,1.1,0,1);
assert.deepEqual([...body.position.toArray(),...body.quaternion.toArray(),...body.scale.toArray()],oldBody,'Clear FX restores the exact old body transform');
actor.dispose();
console.log('PASS: deterministic bounded motion/morph, exact pause/seek/reset, analytic surface normals, private shader uniforms, real GLB body motion and intact independent rigs.');
