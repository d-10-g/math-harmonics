import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { buildPrismScore } from '../src/lib/prismTrail';
import type { ParsedMidi } from '../src/lib/midi';
import { createStaticFlightActor, staticFlightVertexCount } from '../src/lib/staticFlight';
import { createPrismGeometry } from '../src/lib/prismRender';

const midi: ParsedMidi = {
  notes: [
    { time: 1, duration: 2, pitch: 60, velocity: 96, channel: 0, track: 0 },
    { time: 2, duration: 0.5, pitch: 72, velocity: 72, channel: 7, track: 1 },
  ],
  controls: [], duration: 5, beats: [], bpm: 120, trackCount: 2, programs: {},
};
const score = buildPrismScore(midi, 5, true, 'chroma', 1, 'mixed')!;
const sourceGroup = new OBJLoader().parse(fs.readFileSync('public/demo/meshes/Star.obj', 'utf8'));
const sourceMesh = sourceGroup.children.find(object => object instanceof THREE.Mesh) as THREE.Mesh;
assert.ok(sourceMesh, 'A real bundled OBJ supplies the static channel geometry');
const sourceGeometry = sourceMesh.geometry;
const originalPositions = Array.from(sourceGeometry.getAttribute('position').array);
let sourceGeometryDisposals = 0;
sourceGeometry.addEventListener('dispose', () => sourceGeometryDisposals++);

for (const shape of ['spectrum', 'sphere', 'crystal', 'torus', 'knot', 'mesh'] as const) {
  for (const material of ['spectrum', 'gold', 'dichroic'] as const) {
    const actor = createStaticFlightActor({ shape, geometry: sourceGeometry, material, wireframe: false, colorMode: 'chroma', sliceWidth: 0.2 });
    const mesh = actor.root.children[0] as THREE.InstancedMesh;
    const geometry = mesh.geometry;
    assert.notEqual(geometry, sourceGeometry, 'Static draws own their normalized geometry and instance attributes');
    assert.equal(actor.vertexCount, geometry.getAttribute('position').count);
    geometry.computeBoundingBox();
    const size = geometry.boundingBox!.getSize(new THREE.Vector3());
    assert.ok(Math.abs(Math.max(size.x, size.y, size.z) - 1) < 1e-6, 'Every source fits a common note footprint');
    assert.ok(geometry.boundingBox!.min.z >= -1e-6 && geometry.boundingBox!.max.z <= 1 + 1e-6, 'Held growth starts at the birth plane');
    actor.assign(score, 1);
    assert.deepEqual(Array.from(mesh.instanceMatrix.array), Array.from(score.matrices.subarray(16, 32)));
    for (const [name, data] of [['aBirth', score.birth], ['aDuration', score.duration], ['aVelocity', score.velocity], ['aHue', score.hue], ['aCrowd', score.crowd]] as const) {
      assert.equal(geometry.getAttribute(name).getX(0), data[1], 'A reused slot receives the new note attributes');
    }
    actor.update(score, 1, 1.9, 10, 1);
    assert.equal(actor.root.visible, false, 'Unborn notes do not draw');
    actor.update(score, 1, 2.2, 10, 1);
    assert.equal(actor.root.visible, true);
    const shader = material === 'spectrum' ? { uniforms: (mesh.material as THREE.ShaderMaterial).uniforms,
      vertexShader: (mesh.material as THREE.ShaderMaterial).vertexShader, fragmentShader: (mesh.material as THREE.ShaderMaterial).fragmentShader }
      : { uniforms: {} as Record<string, any>, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
    if (material !== 'spectrum') (mesh.material as THREE.Material).onBeforeCompile(shader as any, null as any);
    assert.equal(shader.uniforms.uPrismTime.value, 2.2);
    assert.equal(shader.uniforms.uPrismSlice.value, 1);
    assert.equal(shader.uniforms.uPrismSliceWidth.value, 0.2);
    assert.equal(shader.uniforms.uPrismFan.value, shape === 'spectrum' ? 1 : 0);
    assert.ok(shader.vertexShader.includes('aBirth') && shader.vertexShader.includes('aDuration'));
    if (material !== 'spectrum') assert.ok(shader.vertexShader.includes('objectNormal.z /= mix'), 'Physical normals follow held growth');
    else assert.ok(shader.fragmentShader.includes('colorspace_fragment'), 'Luminous static channels retain color-space output');
    if (material === 'gold') assert.equal((mesh.material as THREE.MeshPhysicalMaterial).metalness, 1);
    if (material === 'dichroic') assert.ok((mesh.material as THREE.MeshPhysicalMaterial).transmission > 0.8);
    actor.update(score, 1, 20, 10, 1);
    assert.equal(actor.root.visible, false, 'Expired notes leave the active draw');
    actor.update(score, 1, 2.2, 10, 1);
    assert.equal(actor.root.visible, true, 'Backward seeking restores a retained note');
    assert.equal(shader.uniforms.uPrismTime.value, 2.2);
    assert.deepEqual(Array.from(mesh.instanceMatrix.array), Array.from(score.matrices.subarray(16, 32)));
    let geometryDisposals = 0, materialDisposals = 0, instanceDisposals = 0;
    geometry.addEventListener('dispose', () => geometryDisposals++);
    (mesh.material as THREE.Material).addEventListener('dispose', () => materialDisposals++);
    mesh.addEventListener('dispose', () => instanceDisposals++);
    const parent = new THREE.Group(); parent.add(actor.root);
    actor.dispose(); actor.dispose();
    assert.deepEqual([geometryDisposals, materialDisposals, instanceDisposals], [1, 1, 1], 'Owned static resources dispose exactly once');
    assert.equal(parent.children.length, 0);
  }
}

// Two independent static channels must not share note attributes, fading
// uniforms, or selected material settings when the pool is reused/seeking.
const first = createStaticFlightActor({ shape: 'torus', material: 'gold', wireframe: false });
const second = createStaticFlightActor({ shape: 'crystal', material: 'dichroic', wireframe: true });
first.assign(score, 0); second.assign(score, 1);
const firstMesh = first.root.children[0] as THREE.InstancedMesh;
const secondMesh = second.root.children[0] as THREE.InstancedMesh;
assert.notEqual(firstMesh.geometry.getAttribute('aBirth'), secondMesh.geometry.getAttribute('aBirth'));
assert.notEqual(firstMesh.material, secondMesh.material);
const compile = (material: THREE.Material) => {
  const shader = { uniforms: {} as Record<string, any>, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
  material.onBeforeCompile(shader as any, null as any); return shader;
};
const firstShader = compile(firstMesh.material as THREE.Material), secondShader = compile(secondMesh.material as THREE.Material);
first.update(score, 0, 1.2, 5, 1); second.update(score, 1, 2.2, 25, 0);
assert.notEqual(firstShader.uniforms.uPrismTime, secondShader.uniforms.uPrismTime);
assert.equal(firstShader.uniforms.uPrismLength.value, 5);
assert.equal(secondShader.uniforms.uPrismLength.value, 25);
assert.equal(firstShader.uniforms.uPrismFx.value, 1);
assert.equal(secondShader.uniforms.uPrismFx.value, 0);
first.dispose(); second.dispose();

// Original OBJ materials keep authored colors/maps and material groups, but
// no pooled actor owns or disposes the cached template's image/geometry.
const texture = new THREE.Texture();
const originalMaterial = new THREE.MeshPhongMaterial({ color: 0x3a8aca, map: texture });
sourceMesh.material = originalMaterial;
let originalMaterialDisposals = 0, textureDisposals = 0;
originalMaterial.addEventListener('dispose', () => originalMaterialDisposals++);
texture.addEventListener('dispose', () => textureDisposals++);
const authoredA = createStaticFlightActor({ shape: 'mesh', template: sourceGroup, material: 'original', wireframe: false });
const authoredB = createStaticFlightActor({ shape: 'mesh', template: sourceGroup, material: 'original', wireframe: true });
const findMesh = (root: THREE.Object3D) => { let mesh!: THREE.Mesh; root.traverse(object => { if (object instanceof THREE.Mesh) mesh = object; }); return mesh; };
const a = findMesh(authoredA.root), b = findMesh(authoredB.root);
assert.equal(a.geometry, sourceGeometry);
assert.equal(b.geometry, sourceGeometry);
assert.notEqual(a.material, originalMaterial);
assert.notEqual(a.material, b.material);
assert.equal((a.material as THREE.MeshPhongMaterial).map, texture);
assert.equal((b.material as THREE.MeshPhongMaterial).wireframe, true);
assert.equal(originalMaterial.wireframe, false);
assert.equal((a.material as THREE.MeshPhongMaterial).color.getHex(), originalMaterial.color.getHex());
assert.equal(authoredA.vertexCount, staticFlightVertexCount(sourceGroup));
authoredA.assign(score, 0); authoredB.assign(score, 1);
authoredA.update(score, 0, 1, 10, 1);
const body = authoredA.root.children[0];
assert.ok(body.scale.z < 0.1, 'Authored OBJ grows from its birth plane without losing its material groups');
authoredA.update(score, 0, 3, 10, 1);
assert.equal(body.scale.z, 1);
const end = body.scale.clone();
authoredA.update(score, 0, 1, 10, 1);
authoredA.update(score, 0, 3, 10, 1);
assert.deepEqual(body.scale.toArray(), end.toArray(), 'Authored growth is deterministic after backward seeks');
authoredA.dispose(); authoredB.dispose();
assert.equal(sourceGeometryDisposals, 0);
assert.equal(originalMaterialDisposals, 0);
assert.equal(textureDisposals, 0);
assert.deepEqual(Array.from(sourceGeometry.getAttribute('position').array), originalPositions);
const independent = createPrismGeometry('mesh', sourceGeometry);
independent.dispose();
assert.equal(sourceGeometryDisposals, 0);
originalMaterial.dispose(); texture.dispose(); sourceGeometry.dispose();
console.log('PASS: real OBJ and all static shapes, physical/spectrum profiles, per-channel attributes/uniforms, deterministic growth/seek/expiry, authored maps, and exact cache/resource ownership.');
