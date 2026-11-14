import * as THREE from 'three';

export type FlightCastRole = 'incoming' | 'outgoing' | 'steady';
export type FlightCastUniforms = ReturnType<typeof makeFlightCastUniforms>;
export function makeFlightCastUniforms() {
  return { uFlightCastProgress: { value: 1 }, uFlightCastRole: { value: 0 } };
}
export function setFlightCastTransition(uniforms: FlightCastUniforms, progress: number, role: FlightCastRole) {
  uniforms.uFlightCastProgress.value = Number.isFinite(progress) ? THREE.MathUtils.clamp(progress, 0, 1) : 0;
  uniforms.uFlightCastRole.value = role === 'incoming' ? 1 : role === 'outgoing' ? -1 : 0;
}

// An ordered 8x8 screen-door mask is stable while paused and identical in both
// casts. Incoming and outgoing use complementary inequalities, so overlapping
// opaque surfaces exchange pixel coverage without holes or double brightness.
// Lifetime fading remains a separate test in every material family.
export const FLIGHT_CAST_GLSL = /* glsl */ `
uniform float uFlightCastProgress;
uniform float uFlightCastRole;
float flightBayer2(vec2 p) { return mod(2.0 * p.x + 3.0 * p.y, 4.0); }
float flightCastThreshold() {
  vec2 pixel = floor(gl_FragCoord.xy);
  float rank = 16.0 * flightBayer2(mod(pixel, 2.0))
    + 4.0 * flightBayer2(mod(floor(pixel / 2.0), 2.0))
    + flightBayer2(mod(floor(pixel / 4.0), 2.0));
  return (rank + 0.5) / 64.0;
}
void flightCastDiscard() {
  if (uFlightCastRole == 0.0) return;
  float threshold = flightCastThreshold();
  if (uFlightCastRole > 0.0 ? threshold >= uFlightCastProgress : threshold < uFlightCastProgress) discard;
}
`;

/** Common auto-cast footprint: a centered sphere of diameter one. Measure real
 * vertices (including skins), rather than a box diagonal that shrinks round
 * shapes relative to long animals. Called only when constructing a cast. */
export function flightObjectFit(model: THREE.Object3D) {
  model.updateMatrixWorld(true);
  model.traverse(object => {
    const mesh = object as THREE.SkinnedMesh;
    if (mesh.isSkinnedMesh) mesh.skeleton.update();
  });
  const bounds = new THREE.Box3();
  const point = new THREE.Vector3();
  const visit = (fn: (point: THREE.Vector3) => void) => model.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const attribute = mesh.geometry.getAttribute('position');
    for (let i = 0; i < (attribute?.count ?? 0); i++) {
      mesh.getVertexPosition(i, point); point.applyMatrix4(mesh.matrixWorld);
      if (Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)) fn(point);
    }
  });
  visit(point => bounds.expandByPoint(point));
  const center = bounds.isEmpty() ? new THREE.Vector3() : bounds.getCenter(new THREE.Vector3());
  let radiusSq = 0;
  visit(point => { radiusSq = Math.max(radiusSq, point.distanceToSquared(center)); });
  return { center, scale: 0.5 / Math.max(0.0005, Math.sqrt(radiusSq)) };
}

/** This geometry is private to its actor. Cached OBJ/GLB source data is never
 * translated, scaled, or given instance attributes by normalization. */
export function normalizeFlightGeometry(geometry: THREE.BufferGeometry) {
  geometry.computeBoundingBox();
  const center = geometry.boundingBox?.getCenter(new THREE.Vector3()) ?? new THREE.Vector3();
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.computeBoundingSphere();
  const radius = geometry.boundingSphere?.radius ?? 0;
  const scale = 0.5 / Math.max(0.0005, Number.isFinite(radius) ? radius : 0);
  geometry.scale(scale, scale, scale);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return { center, scale };
}
