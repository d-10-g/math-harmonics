import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPhysicalMaterial, PHYSICAL_MATERIAL_PROFILES, physicalProfileSettings } from '../src/lib/materials';
import { buildRigEnvironmentScene, disposeEnvironmentScene } from '../src/lib/environments';
import type { WebGPULightingPreset } from '../src/constants';

// Verify the actual objects consumed by the renderers, including each optical
// layer. A shared table entry alone cannot prove the material factory uses it.
assert.equal(PHYSICAL_MATERIAL_PROFILES.length, 23);
assert.equal(new Set(PHYSICAL_MATERIAL_PROFILES).size, 23);
const opticalNumbers = [
  'emissiveIntensity', 'metalness', 'roughness', 'opacity', 'transmission',
  'thickness', 'ior', 'iridescence', 'iridescenceIOR', 'sheen',
  'sheenRoughness', 'clearcoat', 'clearcoatRoughness', 'envMapIntensity',
  'dispersion', 'attenuationDistance', 'specularIntensity',
] as const;
const unitInterval = [
  'metalness', 'roughness', 'opacity', 'transmission', 'iridescence',
  'sheen', 'sheenRoughness', 'clearcoat', 'clearcoatRoughness',
] as const;
for (const profile of PHYSICAL_MATERIAL_PROFILES) {
  const settings = physicalProfileSettings(profile);
  const material = createPhysicalMaterial(profile, false);
  const wireframe = createPhysicalMaterial(profile, true);
  assert.equal(material.isMeshPhysicalMaterial, true, `${profile}: a physical material is required`);
  assert.equal(material.color.getHex(), settings.color, `${profile}: body color`);
  assert.equal(material.emissive.getHex(), settings.emissive, `${profile}: emissive color`);
  assert.equal(material.side, THREE.DoubleSide);
  assert.equal(material.wireframe, false);
  assert.equal(wireframe.wireframe, true);
  for (const property of opticalNumbers) {
    const actual = material[property];
    assert(Number.isFinite(actual) || (property === 'attenuationDistance' && actual === Infinity), `${profile}: invalid ${property}`);
    assert(actual >= 0, `${profile}: negative ${property}`);
    if (settings[property] !== undefined) {
      assert.equal(actual, settings[property], `${profile}: factory dropped ${property}`);
    }
  }
  for (const property of unitInterval) {
    assert(material[property] <= 1, `${profile}: ${property} exceeds 1`);
  }
  assert(material.ior >= 1 && material.ior <= 2.5, `${profile}: implausible IOR`);
  assert(material.attenuationDistance > 0, `${profile}: absorption distance must be positive`);
  if (settings.attenuationColor !== undefined) {
    assert.equal(material.attenuationColor.getHex(), settings.attenuationColor, `${profile}: volume color`);
  }
  if (settings.sheenColor !== undefined) {
    assert.equal(material.sheenColor.getHex(), settings.sheenColor, `${profile}: sheen color`);
  }
  if (settings.iridescenceThicknessRange) {
    assert.deepEqual(material.iridescenceThicknessRange, settings.iridescenceThicknessRange, `${profile}: film thickness`);
    // Editing one material's film must not mutate the shared profile or its peers.
    const original = [...settings.iridescenceThicknessRange];
    material.iridescenceThicknessRange[0] += 1;
    assert.deepEqual(settings.iridescenceThicknessRange, original);
    assert.deepEqual(wireframe.iridescenceThicknessRange, original);
  }
  if (material.transmission > 0) {
    assert.equal(material.opacity, 1, `${profile}: refraction must use transmission, not alpha`);
    assert.equal(material.transparent, false, `${profile}: use the renderer's transmissive pass`);
    assert.equal(material.depthWrite, true, `${profile}: retain transmissive depth`);
    assert(material.thickness > 0, `${profile}: a volume needs thickness`);
    assert(material.attenuationDistance < Infinity, `${profile}: colored glass needs absorption`);
  }
  let disposals = 0;
  material.addEventListener('dispose', () => disposals++);
  wireframe.addEventListener('dispose', () => disposals++);
  material.dispose();
  wireframe.dispose();
  assert.equal(disposals, 2);
}
for (const profile of ['ornament', 'gold', 'solar-gold'] as const) {
  const material = createPhysicalMaterial(profile, false);
  assert(material.metalness >= 0.95, `${profile}: colored metallic reflection`);
  assert(material.clearcoat >= 0.8, `${profile}: lacquered finish`);
  assert(material.clearcoatRoughness < material.roughness, `${profile}: crisp coat over softer body`);
  assert(material.emissiveIntensity < 0.05, `${profile}: reflections should remain visible`);
  material.dispose();
}
const petrol = createPhysicalMaterial('oil-slick', false);
assert.equal(petrol.metalness, 1, 'Petrol rainbows reflect as a conductor');
assert.equal(petrol.iridescence, 1, 'Petrol rainbows use actual thin-film interference');
assert(petrol.iridescenceThicknessRange[1] - petrol.iridescenceThicknessRange[0] > 600);
assert(petrol.emissiveIntensity < 0.05, 'Petrol optics retain view-dependent reflections');
petrol.dispose();
const opal = createPhysicalMaterial('opal-glass', false);
const clearGlass = createPhysicalMaterial('dichroic', false);
assert(opal.transmission > 0.7, 'Opal remains a refractive volume');
assert(opal.roughness > clearGlass.roughness, 'Opal softens the body reflection');
assert(opal.clearcoatRoughness < 0.05, 'Opal retains a crisp outer shell');
assert(opal.iridescence >= 0.9 && opal.sheen > 0, 'Opal has distinct thin-film and pearlescent lobes');
opal.dispose();
clearGlass.dispose();

const hammered = createPhysicalMaterial('solar-gold', false);
const hammeredOther = createPhysicalMaterial('solar-gold', false);
const hammeredTexture = hammered.normalMap as THREE.DataTexture;
const otherTexture = hammeredOther.normalMap as THREE.DataTexture;
assert(hammeredTexture?.isDataTexture, 'Hammered metal has real microfacet surface detail');
assert.notEqual(hammeredTexture, otherTexture, 'Each material owns its texture');
assert.notEqual(hammeredTexture.image.data, otherTexture.image.data, 'Pixel buffers are independent');
assert.deepEqual(hammeredTexture.image.data, otherTexture.image.data, 'Hammering is deterministic');
assert.equal(hammeredTexture.wrapS, THREE.RepeatWrapping, 'Surface detail tiles seamlessly');
assert.equal(hammeredTexture.wrapT, THREE.RepeatWrapping);
assert(hammeredTexture.generateMipmaps, 'Distant metallic detail uses mipmaps');
const pixels = hammeredTexture.image.data;
let tiltedNormals = 0;
for (let i = 0; i < pixels.length; i += 4) {
  const x = pixels[i] / 255 * 2 - 1, y = pixels[i + 1] / 255 * 2 - 1, z = pixels[i + 2] / 255 * 2 - 1;
  assert(Math.abs(Math.hypot(x, y, z) - 1) < 0.015, 'Microfacet normal is normalized');
  assert(z > 0.5, 'Hammering preserves the outward-facing surface');
  if (Math.abs(x) + Math.abs(y) > 0.1) tiltedNormals++;
}
assert(tiltedNormals > pixels.length / 16, 'The normal map contains visible curved dents');
// Model the renderer's residency contract: disposal frees a resident GPU
// allocation, repeated disposal is harmless, and rendering after disposal can
// upload the same material/texture again. StrictMode exercises that reuse.
let textureResident = true, textureReleases = 0, otherDisposals = 0;
hammeredTexture.addEventListener('dispose', () => {
  if (textureResident) { textureReleases++; textureResident = false; }
});
otherTexture.addEventListener('dispose', () => otherDisposals++);
hammered.dispose(); hammered.dispose();
assert.equal(textureReleases, 1, 'Repeated cleanup safely releases one resident allocation');
assert.equal(otherDisposals, 0, 'Deleting one flight leaves another flight texture alive');
hammeredTexture.needsUpdate = true; textureResident = true;
hammered.dispose();
assert.equal(textureReleases, 2, 'A reused material releases its texture after re-upload');
assert.equal(otherDisposals, 0, 'Releasing a reused material still preserves other channel textures');
hammeredOther.dispose();
assert.equal(otherDisposals, 1);
for (const profile of ['glass', 'stained-glass', 'dichroic'] as const) {
  const material = createPhysicalMaterial(profile, false);
  assert(material.transmission >= 0.8, `${profile}: actual glass transmission`);
  assert(material.dispersion > 0, `${profile}: wavelength-dependent refraction`);
  if (profile === 'dichroic') assert.equal(material.iridescence, 1);
  material.dispose();
}

const rigs: WebGPULightingPreset[] = ['studio', 'aurora', 'gallery', 'eclipse', 'caustic', 'noir', 'sunset', 'laboratory', 'underlight', 'prism'];
function signature(scene: THREE.Scene) {
  return scene.children.map((object) => {
    assert(object instanceof THREE.Mesh, 'Baked reflections must not add runtime lights');
    const mesh = object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    assert(mesh.material.isMeshBasicMaterial);
    assert(mesh.position.toArray().every(Number.isFinite));
    for (const attribute of Object.values(mesh.geometry.attributes)) {
      assert(Array.from(attribute.array).every(Number.isFinite), 'Reflection geometry must be finite');
    }
    return {
      position: mesh.position.toArray(),
      quaternion: mesh.quaternion.toArray(),
      color: mesh.material.color.toArray(),
      side: mesh.material.side,
      geometry: Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([name, attribute]) => [name, Array.from(attribute.array)])),
    };
  });
}
const rigSignatures = new Set<string>();
for (const rig of rigs) {
  const scene = buildRigEnvironmentScene(rig);
  const other = buildRigEnvironmentScene(rig);
  const first = signature(scene);
  assert.deepEqual(signature(other), first, `${rig}: deterministic reflection scene`);
  assert.equal(first.length, 15, `${rig}: sky, three softboxes, ten practical lights, ground bounce`);
  assert(first.some(({ color }) => color.some((channel) => channel > 1)), `${rig}: HDR reflection sources`);
  rigSignatures.add(JSON.stringify(first));
  let geometryCount = 0;
  let materialCount = 0;
  let geometryDisposals = 0;
  let materialDisposals = 0;
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometryCount++;
    object.geometry.addEventListener('dispose', () => geometryDisposals++);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materialCount++;
      material.addEventListener('dispose', () => materialDisposals++);
    }
  });
  disposeEnvironmentScene(scene);
  disposeEnvironmentScene(other);
  assert.equal(geometryDisposals, geometryCount, `${rig}: every geometry is disposed exactly once`);
  assert.equal(materialDisposals, materialCount, `${rig}: every material is disposed exactly once`);
}
assert.equal(rigSignatures.size, rigs.length, 'Light rigs must produce distinct reflections');
console.log('PASS: 23 physical profiles, refractive opal, petrol thin films, deterministic hammered-gold microfacets with independent texture disposal, real glass optics, and HDR reflections for all 10 rigs.');
