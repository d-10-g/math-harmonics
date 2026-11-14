import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createStaticFlightActor } from '../src/lib/staticFlight';
import { createGlbFlightActor } from '../src/lib/glbFlight';
import { buildPrismScore } from '../src/lib/prismTrail';
import type { ParsedMidi } from '../src/lib/midi';
import { makeFlightCastUniforms, setFlightCastTransition } from '../src/lib/flightActor';

const midi: ParsedMidi = { notes: [
  { time: 0, duration: 0.1, pitch: 60, velocity: 96, channel: 0, track: 0 },
  { time: 1, duration: 12, pitch: 60, velocity: 96, channel: 0, track: 0 },
], controls: [], duration: 15, beats: [], bpm: 120, trackCount: 1, programs: {} };
const data = buildPrismScore(midi, 5, true, 'chroma', 1, 'mixed')!;
const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
matrix.fromArray(data.matrices).decompose(position, rotation, scale);
const noteScale = scale.x;

function renderedRadius(root: THREE.Object3D, note: number) {
  matrix.fromArray(data.matrices, note * 16).decompose(position, rotation, scale);
  const origin = position.clone(), noteSize = scale.x, point = new THREE.Vector3(), instance = new THREE.Matrix4();
  let radius = 0;
  root.updateMatrixWorld(true);
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) (mesh as THREE.SkinnedMesh).skeleton.update();
    if ((mesh as THREE.InstancedMesh).isInstancedMesh) (mesh as THREE.InstancedMesh).getMatrixAt(0, instance);
    for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
      mesh.getVertexPosition(i, point);
      if ((mesh as THREE.InstancedMesh).isInstancedMesh) point.applyMatrix4(instance);
      point.applyMatrix4(mesh.matrixWorld);
      radius = Math.max(radius, point.distanceTo(origin) / noteSize);
    }
  });
  return radius;
}
function shaders(root: THREE.Object3D) {
  const result: { uniforms: Record<string, any>; fragmentShader: string }[] = [];
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (material instanceof THREE.ShaderMaterial) result.push(material);
      else {
        const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
        material.onBeforeCompile(shader as any, null as any); result.push(shader);
      }
    }
  });
  return result;
}
type Actor = ReturnType<typeof createStaticFlightActor>;
function checkFade(actor: Pick<Actor, 'root' | 'setCastTransition' | 'update'>) {
  actor.update(data, 0, 0.05, 4, 0);
  const compiled = shaders(actor.root);
  assert(compiled.length > 0);
  for (const shader of compiled) {
    assert(shader.fragmentShader.includes('flightCastDiscard();'), 'The material actually applies its cast mask');
    assert(shader.fragmentShader.includes('threshold >= uFlightCastProgress : threshold < uFlightCastProgress'),
      'Incoming and outgoing coverage use complementary inequalities');
  }
  actor.setCastTransition(0.375, 'incoming');
  const saved = compiled.map(shader => ({ progress: shader.uniforms.uFlightCastProgress.value, role: shader.uniforms.uFlightCastRole.value }));
  assert(saved.every(value => value.progress === 0.375 && value.role === 1));
  actor.update(data, 0, 3.5, 4, 0);
  for (const shader of compiled) {
    assert.equal(shader.uniforms.uFlightCastProgress.value, 0.375, 'Memory fading cannot overwrite cast dissolve');
    const memory = shader.uniforms.uGlbFlightFade ?? shader.uniforms.uStaticFlightFade;
    if (memory) assert(memory.value < 1, 'Solid imported meshes fade history independently');
    else assert.equal(shader.uniforms.uPrismLength.value, 4);
  }
  actor.setCastTransition(0.375, 'outgoing');
  assert(compiled.every(shader => shader.uniforms.uFlightCastRole.value === -1));
  actor.setCastTransition(0, 'steady');
  assert(compiled.every(shader => shader.uniforms.uFlightCastRole.value === 0), 'Ordinary flights bypass the cast mask');
}

const templates = ['Star', 'Teapot'].map(name => new OBJLoader().parse(fs.readFileSync(`public/demo/meshes/${name}.obj`, 'utf8')));
const untouched = templates.map(template => template.children.map(object => Array.from((object as THREE.Mesh).geometry.attributes.position.array)));
for (const shape of ['spectrum', 'sphere', 'crystal', 'torus', 'knot', 'mesh'] as const) {
  for (const material of ['spectrum', 'gold', 'opal-glass', 'solar-gold'] as const) {
    const actor = createStaticFlightActor({ shape, geometry: (templates[0].children[0] as THREE.Mesh).geometry,
      material, wireframe: false, normalizedSize: true });
    actor.assign(data, 0); actor.update(data, 0, 0, 0, 0);
    assert(Math.abs(renderedRadius(actor.root, 0) - 0.5) < 1e-5, `${shape}/${material} uses the common real-vertex radius`);
    actor.assign(data, 1); actor.update(data, 1, 1, 0, 0);
    assert(Math.abs(renderedRadius(actor.root, 1) - 0.5) < 1e-5, 'A long note cannot extrude an automatic cast');
    const mesh = actor.root.children[0] as THREE.InstancedMesh;
    mesh.getMatrixAt(0, matrix); matrix.decompose(position, rotation, scale);
    assert(Math.abs(scale.x - scale.y) < 1e-6 && Math.abs(scale.y - scale.z) < 1e-6, 'Automatic static actors retain proportions');
    const shader = shaders(actor.root)[0];
    assert.equal(shader.uniforms.uPrismNormalized.value, 1);
    checkFade(actor); actor.dispose(); actor.dispose();
  }
}
for (const template of templates) {
  const actor = createStaticFlightActor({ shape: 'mesh', template, material: 'original', wireframe: false, normalizedSize: true });
  actor.assign(data, 0); actor.update(data, 0, 0, 0, 0);
  assert(Math.abs(renderedRadius(actor.root, 0) - 0.5) < 1e-5, 'Original OBJ groups share the same centered footprint');
  checkFade(actor); actor.dispose();
}
assert.deepEqual(templates.map(template => template.children.map(object => Array.from((object as THREE.Mesh).geometry.attributes.position.array))), untouched,
  'Normalization never mutates cached OBJ vertices');

async function loadRig(name: string) {
  const file = fs.readFileSync(`public/demo/meshes/${name}_model.glb`), size = file.readUInt32LE(12);
  const json = JSON.parse(file.subarray(20, 20 + size).toString());
  for (const material of json.materials) if (material.pbrMetallicRoughness) delete material.pbrMetallicRoughness.baseColorTexture;
  json.images = []; json.textures = [];
  const j = Buffer.from(JSON.stringify(json)), pad = Buffer.alloc(Math.ceil(j.length / 4) * 4, 32); j.copy(pad);
  const bin = file.subarray(20 + size), header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(20 + pad.length + bin.length, 8);
  header.writeUInt32LE(pad.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const buffer = Buffer.concat([header, pad, bin]);
  return new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '');
}
for (const name of ['Ernie', 'Kira']) {
  const gltf = await loadRig(name);
  const bones: number[] = []; gltf.scene.traverse(object => { if ((object as THREE.Bone).isBone) bones.push(...object.quaternion); });
  for (const material of ['original', 'oil-slick'] as const) {
    const actor = createGlbFlightActor(gltf.scene, gltf.animations, material, false, gltf.animations[0].name, true);
    actor.assign(data, 0); actor.update(data, 0, 0, 0, 0);
    const radius = renderedRadius(actor.root, 0);
    assert(radius > 0.45 && radius < 0.55, `${name} includes its curved tail in a comparable footprint (${radius})`);
    assert(Math.abs(actor.root.scale.x - noteScale) < 1e-6);
    checkFade(actor); actor.dispose();
  }
  const after: number[] = []; gltf.scene.traverse(object => { if ((object as THREE.Bone).isBone) after.push(...object.quaternion); });
  assert.deepEqual(after, bones, 'Sizing the curved cat pose leaves the cached rig unchanged');
}
const first = makeFlightCastUniforms(), second = makeFlightCastUniforms();
setFlightCastTransition(first, 99, 'incoming'); assert.equal(first.uFlightCastProgress.value, 1);
setFlightCastTransition(first, NaN, 'outgoing'); assert.equal(first.uFlightCastProgress.value, 0);
assert.equal(second.uFlightCastRole.value, 0, 'Other actors own independent cast uniforms');
console.log('PASS: common real-vertex size/centering for every shape, original OBJ groups and both posed GLBs; proportional long notes; complementary independent cast/lifetime masks; private resources and untouched templates.');
