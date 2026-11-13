import * as THREE from 'three';
import type { FlightEffectsSettings, FlightMotion } from './flightEffects';

const MOTIONS: readonly FlightMotion[] = ['none', 'orbit', 'vortex', 'wave', 'breathe', 'helix', 'butterfly'];
export const flightMotionIndex = (motion: FlightMotion | undefined) => Math.max(0, MOTIONS.indexOf(motion ?? 'none'));
const bounded = (value: number | undefined, maximum: number, fallback = 0) =>
  Number.isFinite(value) ? THREE.MathUtils.clamp(value!, 0, maximum) : fallback;

export type FlightMotionSample = {
  offset: THREE.Vector3;
  rotation: THREE.Vector3;
  scale: THREE.Vector3;
  twist: number;
  active: boolean;
};
export function createFlightMotionSample(): FlightMotionSample {
  return { offset: new THREE.Vector3(), rotation: new THREE.Vector3(), scale: new THREE.Vector3(1, 1, 1), twist: 0, active: false };
}

// Absolute note age, rather than a frame accumulator, makes pauses, seeks,
// mode changes and pooled-actor reuse land on the same transform every time.
export function sampleFlightMotion(birth: number, hue: number, time: number,
  effects: FlightEffectsSettings | undefined, out: FlightMotionSample): FlightMotionSample {
  out.offset.set(0, 0, 0); out.rotation.set(0, 0, 0); out.scale.set(1, 1, 1); out.twist = 0;
  const motion = flightMotionIndex(effects?.motion);
  const amount = bounded(effects?.motionAmount, 2, 1), morph = bounded(effects?.morph, 1);
  out.active = (motion > 0 && amount > 0) || morph > 0;
  if (!out.active) return out;
  const age = Math.max(0, (Number.isFinite(time) ? time : 0) - (Number.isFinite(birth) ? birth : 0));
  const envelope = 1 - Math.exp(-age * 1.8);
  const phase = age * 1.35 + (Number.isFinite(hue) ? hue : 0) * Math.PI * 2 + (Number.isFinite(birth) ? birth : 0) * 0.37;
  const a = amount * envelope;
  if (motion === 1) {
    out.offset.set(Math.sin(phase) * 0.65, Math.cos(phase) * 0.4, Math.sin(phase * 0.53) * 0.35).multiplyScalar(a);
    out.rotation.y = Math.sin(phase * 0.5) * 0.35 * a;
  } else if (motion === 2) {
    out.offset.set(Math.cos(phase) * 0.75, Math.sin(phase) * 0.75, Math.sin(phase * 0.5) * 0.35).multiplyScalar(a);
    out.rotation.set(0, Math.cos(phase * 0.45) * 0.45 * a, Math.sin(phase * 0.35) * 0.65 * a);
  } else if (motion === 3) {
    out.offset.set(Math.sin(phase) * 0.6, Math.sin(phase * 1.5) * 0.55, 0).multiplyScalar(a);
    out.rotation.set(Math.cos(phase) * 0.25 * a, 0, Math.sin(phase) * 0.25 * a);
  } else if (motion === 4) {
    const breath = Math.sin(phase) * 0.22 * a;
    out.scale.set(1 + breath, 1 - breath * 0.55, 1 + breath);
  } else if (motion === 5) {
    // The circle lies in depth, unlike the face-on vortex. Together with
    // forward score travel this leaves a corkscrew of banked sculptures.
    out.offset.set(Math.cos(phase) * 0.68, Math.sin(phase * 0.45) * 0.42, Math.sin(phase) * 0.68).multiplyScalar(a);
    out.rotation.set(Math.cos(phase) * 0.22 * a, Math.sin(phase * 0.5) * 0.35 * a, Math.sin(phase) * 0.32 * a);
  } else if (motion === 6) {
    // A 1:2 Lissajous orbit crosses itself like wings, with its bank tied
    // to the turn. No velocity integration is needed to reverse a seek.
    out.offset.set(Math.sin(phase) * 0.95, Math.sin(phase * 2) * 0.44, Math.cos(phase) * 0.25).multiplyScalar(a);
    out.rotation.set(Math.cos(phase * 2) * 0.18 * a, Math.sin(phase) * 0.22 * a, Math.cos(phase) * 0.42 * a);
  }
  const sx = 1 + 0.22 * morph * Math.sin(phase * 1.2) * envelope;
  const sy = 1 + 0.28 * morph * Math.cos(phase) * envelope;
  out.scale.x *= sx; out.scale.y *= sy; out.scale.z /= sx * sy;
  out.twist = morph * (0.8 + 0.7 * Math.sin(phase)) * envelope;
  out.rotation.y += 0.45 * morph * Math.sin(phase * 0.65) * envelope;
  return out;
}

function rotateXYZ(vector: THREE.Vector3, angles: THREE.Vector3) {
  let c = Math.cos(angles.z), s = Math.sin(angles.z), x = vector.x * c - vector.y * s;
  vector.y = vector.x * s + vector.y * c; vector.x = x;
  c = Math.cos(angles.y); s = Math.sin(angles.y); x = vector.x * c + vector.z * s;
  vector.z = -vector.x * s + vector.z * c; vector.x = x;
  c = Math.cos(angles.x); s = Math.sin(angles.x); const y = vector.y * c - vector.z * s;
  vector.z = vector.y * s + vector.z * c; vector.y = y;
}

// CPU equivalent of the static shader deformation, also used to validate
// the analytic inverse-transpose normal under anisotropic breathing/twist.
export function deformFlightPoint(point: THREE.Vector3, normal: THREE.Vector3, sample: FlightMotionSample,
  outPoint: THREE.Vector3, outNormal: THREE.Vector3) {
  outPoint.copy(point); outNormal.copy(normal);
  if (!sample.active) return;
  outPoint.multiply(sample.scale); outNormal.divide(sample.scale);
  const angle = sample.twist * outPoint.y, c = Math.cos(angle), s = Math.sin(angle);
  const x = c * outPoint.x + s * outPoint.z, z = -s * outPoint.x + c * outPoint.z;
  const nx = c * outNormal.x + s * outNormal.z, nz = -s * outNormal.x + c * outNormal.z;
  outNormal.set(nx, outNormal.y - sample.twist * z * nx + sample.twist * x * nz, nz);
  outPoint.x = x; outPoint.z = z;
  rotateXYZ(outPoint, sample.rotation); rotateXYZ(outNormal, sample.rotation);
  outPoint.add(sample.offset); outNormal.normalize();
}

// Keep these coefficients in sync with sampleFlightMotion. GLSL applies
// motion after held-note growth and uses the exact twist Jacobian for PBR.
export const FLIGHT_MOTION_GLSL = /* glsl */ `
uniform float uFlightMotion;
uniform float uFlightMotionAmount;
uniform float uFlightMorph;
vec3 flightRotateXYZ(vec3 p, vec3 r) {
  float c = cos(r.z), s = sin(r.z);
  p.xy = mat2(c, s, -s, c) * p.xy;
  c = cos(r.y); s = sin(r.y);
  p.xz = mat2(c, -s, s, c) * p.xz;
  c = cos(r.x); s = sin(r.x);
  p.yz = mat2(c, s, -s, c) * p.yz;
  return p;
}
void flightDeform(inout vec3 p, inout vec3 n, float birth, float hue) {
  if ((uFlightMotion < 0.5 || uFlightMotionAmount <= 0.0) && uFlightMorph <= 0.0) return;
  float age = max(uPrismTime - birth, 0.0);
  float envelope = 1.0 - exp(-age * 1.8);
  float phase = age * 1.35 + hue * 6.28318530718 + birth * 0.37;
  float a = uFlightMotionAmount * envelope;
  vec3 offset = vec3(0.0), angles = vec3(0.0), stretch = vec3(1.0);
  if (uFlightMotion > 0.5 && uFlightMotion < 1.5) {
    offset = vec3(sin(phase) * 0.65, cos(phase) * 0.4, sin(phase * 0.53) * 0.35) * a;
    angles.y = sin(phase * 0.5) * 0.35 * a;
  } else if (uFlightMotion > 1.5 && uFlightMotion < 2.5) {
    offset = vec3(cos(phase) * 0.75, sin(phase) * 0.75, sin(phase * 0.5) * 0.35) * a;
    angles = vec3(0.0, cos(phase * 0.45) * 0.45 * a, sin(phase * 0.35) * 0.65 * a);
  } else if (uFlightMotion > 2.5 && uFlightMotion < 3.5) {
    offset = vec3(sin(phase) * 0.6, sin(phase * 1.5) * 0.55, 0.0) * a;
    angles = vec3(cos(phase) * 0.25 * a, 0.0, sin(phase) * 0.25 * a);
  } else if (uFlightMotion > 3.5 && uFlightMotion < 4.5) {
    float breath = sin(phase) * 0.22 * a;
    stretch = vec3(1.0 + breath, 1.0 - breath * 0.55, 1.0 + breath);
  } else if (uFlightMotion > 4.5 && uFlightMotion < 5.5) {
    offset = vec3(cos(phase) * 0.68, sin(phase * 0.45) * 0.42, sin(phase) * 0.68) * a;
    angles = vec3(cos(phase) * 0.22 * a, sin(phase * 0.5) * 0.35 * a, sin(phase) * 0.32 * a);
  } else if (uFlightMotion > 5.5 && uFlightMotion < 6.5) {
    offset = vec3(sin(phase) * 0.95, sin(phase * 2.0) * 0.44, cos(phase) * 0.25) * a;
    angles = vec3(cos(phase * 2.0) * 0.18 * a, sin(phase) * 0.22 * a, cos(phase) * 0.42 * a);
  }
  float sx = 1.0 + 0.22 * uFlightMorph * sin(phase * 1.2) * envelope;
  float sy = 1.0 + 0.28 * uFlightMorph * cos(phase) * envelope;
  stretch *= vec3(sx, sy, 1.0 / (sx * sy));
  p *= stretch; n /= stretch;
  float twist = uFlightMorph * (0.8 + 0.7 * sin(phase)) * envelope;
  float angle = twist * p.y, c = cos(angle), s = sin(angle);
  float x = c * p.x + s * p.z, z = -s * p.x + c * p.z;
  float nx = c * n.x + s * n.z, nz = -s * n.x + c * n.z;
  n = vec3(nx, n.y - twist * z * nx + twist * x * nz, nz);
  p.x = x; p.z = z;
  angles.y += 0.45 * uFlightMorph * sin(phase * 0.65) * envelope;
  p = flightRotateXYZ(p, angles) + offset;
  n = flightRotateXYZ(n, angles);
}
`;
