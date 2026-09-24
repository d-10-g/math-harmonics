import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MESH_LIBRARY } from './meshManifest';
import type { ObjFinish } from './modelChannels';

// Owner-provided OBJ/MTL sculpture library (public/demo/meshes). Meshes can
// stand in for formula geometry in the note constellation: either wearing
// the app's physical material profiles (geometry-only load) or their own
// MTL colors (full group load).

export { MESH_LIBRARY };

// The random pool sticks to light, visually distinct files so a busy score
// doesn't pull megabytes of skulls mid-piece. Anything in MESH_LIBRARY can
// still be assigned per channel explicitly.
export const RANDOM_MESH_POOL: string[] = [
  'Atom', 'Blob', 'Cat', 'Coin', 'Cow', 'Cube', 'Cuboctahedron', 'Dodecahedron',
  'Gear', 'Icosahedron', 'Octahedron', 'Rooster', 'Star', 'Stellateddodecahedron',
  'Teapot', 'Tet', 'Torus', 'Twistytorus', 'Truncatedcube', 'Pluscube'
];

export const DEFAULT_CHANNEL_MESHES: string[] = ['Teapot', 'Star', 'Gear', 'Atom'];

const MESH_BASE = './demo/meshes/';
// Normalized to the same working radius as formula geometry so the
// constellation's scale math applies unchanged.
const TARGET_RADIUS = 12;

const geometryCache = new Map<string, Promise<THREE.BufferGeometry | null>>();
const groupCache = new Map<string, Promise<THREE.Group | null>>();

function normalizeGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  geometry.computeBoundingSphere();
  const sphere = geometry.boundingSphere;
  if (sphere) {
    geometry.translate(-sphere.center.x, -sphere.center.y, -sphere.center.z);
    const scale = TARGET_RADIUS / Math.max(0.0001, sphere.radius);
    geometry.scale(scale, scale, scale);
  }
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

// Geometry-only load: children merged into one BufferGeometry stripped to
// position(+normal), centered and scaled — ready for the app's materials
// and GLSL shaders.
export function loadMeshGeometry(name: string): Promise<THREE.BufferGeometry | null> {
  const cached = geometryCache.get(name);
  if (cached) return cached;
  const promise = new OBJLoader()
    .loadAsync(`${MESH_BASE}${name}.obj`)
    .then((group) => {
      const parts: THREE.BufferGeometry[] = [];
      let allHaveNormals = true;
      group.updateWorldMatrix(true, true);
      group.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh || !mesh.geometry) return;
        const part = (mesh.geometry as THREE.BufferGeometry).clone();
        part.applyMatrix4(mesh.matrixWorld);
        if (!part.getAttribute('normal')) allHaveNormals = false;
        parts.push(part);
      });
      if (parts.length === 0) return null;
      // Merge wants identical attribute sets; keep only position (+normal
      // when every part carries one).
      for (const part of parts) {
        for (const key of Object.keys(part.attributes)) {
          if (key !== 'position' && !(key === 'normal' && allHaveNormals)) part.deleteAttribute(key);
        }
      }
      const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
      if (!merged) return normalizeGeometry(parts[0]);
      if (!allHaveNormals) merged.computeVertexNormals();
      return normalizeGeometry(merged);
    })
    .catch(() => null);
  geometryCache.set(name, promise);
  return promise;
}

// Most of the library's MTLs share one Blender debug material (Kd 0.2/1/0.2
// green; some default 0.8 gray). Those aren't authored colors. Each such
// material is FLAGGED (userData.placeholder) so the stage can dress it in an
// app material profile instead — and, for callers that insist on MTL colors,
// gets a stable, distinct, tone-safe hue derived from the mesh name.
// Genuinely authored MTL colors pass through untouched.
function isPlaceholderColor(color: THREE.Color): boolean {
  const near = (v: number, t: number) => Math.abs(v - t) < 0.02;
  const matches = (c: THREE.Color) =>
    (near(c.r, 0.2) && near(c.g, 1.0) && near(c.b, 0.2))
    || (near(c.r, 0.8) && near(c.g, 0.8) && near(c.b, 0.8));
  // MTLLoader converts Kd from sRGB into the (linear) working space, so the
  // file's 0.2/1.0/0.2 arrives as 0.033/1.0/0.033 — compare in sRGB, and in
  // the raw values in case color management is off.
  const srgb = THREE.ColorManagement.workingToColorSpace(new THREE.Color().copy(color), THREE.SRGBColorSpace);
  return matches(srgb) || matches(color);
}

function paletteColor(name: string): THREE.Color {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const hue = (hash % 360) / 360;
  return new THREE.Color().setHSL(hue, 0.62, 0.52);
}

export type ObjFinishReport = { placeholders: number; total: number };

// `everything` marks every material a placeholder (no MTL loaded at all —
// OBJLoader's default white is no more authored than debug green).
function markPlaceholders(group: THREE.Group, name: string, everything: boolean): ObjFinishReport {
  let placeholders = 0;
  let total = 0;
  group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material, index) => {
      total++;
      const colored = material as THREE.MeshPhongMaterial;
      if (everything || (colored.color && isPlaceholderColor(colored.color))) {
        placeholders++;
        material.userData.placeholder = true;
        // Multi-material meshes get slightly rotated hues so parts differ.
        if (colored.color) colored.color.copy(paletteColor(index === 0 ? name : `${name}:${index}`));
      }
    });
  });
  return { placeholders, total };
}

// Full load with the OBJ's own MTL materials. Returns a normalized TEMPLATE —
// callers clone() it per slot (clones share geometry + materials; dress the
// clone with dressObjMaterials when per-slot materials are wanted).
// template.userData.finish reports how many materials were placeholders.
export function loadMeshGroup(name: string): Promise<THREE.Group | null> {
  const cached = groupCache.get(name);
  if (cached) return cached;
  const promise = new MTLLoader()
    .setPath(MESH_BASE)
    .loadAsync(`${name}.mtl`)
    .then((materials) => {
      materials.preload();
      return new OBJLoader()
        .setMaterials(materials)
        .loadAsync(`${MESH_BASE}${name}.obj`)
        .then((group) => ({ group, authored: true }));
    })
    .catch(() => new OBJLoader().loadAsync(`${MESH_BASE}${name}.obj`).then((group) => ({ group, authored: false })))
    .then(({ group, authored }) => {
      if (!group) return null;
      const finish = markPlaceholders(group, name, !authored);
      const box = new THREE.Box3().setFromObject(group);
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const wrapper = new THREE.Group();
      const scale = TARGET_RADIUS / Math.max(0.0001, sphere.radius);
      group.position.sub(sphere.center);
      wrapper.add(group);
      wrapper.scale.setScalar(scale);
      // Bake the fit into a single template node.
      const template = new THREE.Group();
      template.add(wrapper);
      template.userData.finish = finish;
      return template;
    })
    .catch(() => null);
  groupCache.set(name, promise);
  return promise;
}

// Dress an OBJ clone for the stage. 'mtl' keeps every MTL material
// (placeholders wear their palette hue); 'app' replaces every material with a
// fresh app material; 'auto' replaces only flagged placeholders, so authored
// colors survive next to dressed stand-ins. Returns the materials it created
// so the caller can pulse and dispose them.
export function dressObjMaterials<T extends THREE.Material>(
  root: THREE.Object3D,
  finish: ObjFinish,
  makeMaterial: () => T
): T[] {
  const created: T[] = [];
  if (finish === 'mtl') return created;
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    let changed = false;
    const next = materials.map((material) => {
      if (finish !== 'app' && !material.userData.placeholder) return material;
      const made = makeMaterial();
      created.push(made);
      changed = true;
      return made;
    });
    if (changed) mesh.material = Array.isArray(mesh.material) ? next : next[0];
  });
  return created;
}

export function isValidMeshName(name: string): boolean {
  return MESH_LIBRARY.includes(name);
}
