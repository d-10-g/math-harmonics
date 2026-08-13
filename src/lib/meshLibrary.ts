import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MESH_LIBRARY } from './meshManifest';

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

// Full load with the OBJ's own MTL colors. Returns a normalized TEMPLATE —
// callers clone() it per slot (clones share geometry + materials, which is
// exactly right: MTL mode does not modulate materials per note).
export function loadMeshGroup(name: string): Promise<THREE.Group | null> {
  const cached = groupCache.get(name);
  if (cached) return cached;
  const promise = new MTLLoader()
    .setPath(MESH_BASE)
    .loadAsync(`${name}.mtl`)
    .then((materials) => {
      materials.preload();
      return new OBJLoader().setMaterials(materials).loadAsync(`${MESH_BASE}${name}.obj`);
    })
    .catch(() => new OBJLoader().loadAsync(`${MESH_BASE}${name}.obj`))
    .then((group) => {
      if (!group) return null;
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
      return template;
    })
    .catch(() => null);
  groupCache.set(name, promise);
  return promise;
}

export function isValidMeshName(name: string): boolean {
  return MESH_LIBRARY.includes(name);
}
