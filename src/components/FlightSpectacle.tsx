import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useXR } from '@react-three/xr';
import * as THREE from 'three';
import type { FlightEffectsSettings } from '../lib/flightEffects';
import type { PrismScoreData } from '../lib/prismTrail';
import { fireworkRandom, fireworkWindow } from '../lib/flightFireworks';
import { buildLightningLinks, SPECTACLE_BUDGETS, SPECTACLE_LIFETIMES } from '../lib/flightSpectacle';

type Key = 'lightning' | 'petals' | 'bubbles';
type Uniforms = { uTime: { value: number }; uStrength: { value: number } };
type Batch = { object: THREE.Mesh; geometry: THREE.InstancedBufferGeometry; material: THREE.ShaderMaterial;
  uniforms: Uniforms; update(time: number, strength: number): void };
const COLOR = /* glsl */ `
vec3 spectacleColor(float hue) {
  return mix(vec3(0.06), clamp(abs(fract(hue + vec3(0.0, 0.6666667, 0.3333333)) * 6.0 - 3.0) - 1.0, 0.0, 1.0), 0.94);
}
float spectacleLife(float age, float life) {
  return smoothstep(0.0, 0.22, age) * (1.0 - smoothstep(life - 1.2, life, age));
}
vec3 safeUnit(vec3 value) { return value * inversesqrt(max(dot(value, value), 0.00000001)); }
`;
const OUTPUT = /* glsl */ `
#include <tonemapping_fragment>
#include <colorspace_fragment>
`;
const NOTE = /* glsl */ `
attribute vec3 aCenter;
attribute vec3 aU;
attribute vec3 aV;
attribute vec3 aW;
attribute vec4 aMeta;
uniform float uTime;
uniform float uStrength;
varying float vAge;
varying float vHue;
varying float vEnergy;
varying float vSeed;
`;
const LIGHTNING_VERTEX = /* glsl */ `
attribute vec3 aStart;
attribute vec3 aEnd;
attribute vec4 aMeta;
uniform float uTime;
uniform float uStrength;
varying float vAge;
varying float vHue;
varying float vEnergy;
varying float vAlong;
varying float vSide;
varying float vBranch;
float boltNoise(float t, float seed) { return fract(sin(t * 127.1 + seed * 311.7) * 43758.5453) * 2.0 - 1.0; }
vec3 boltPoint(float t, float branch, vec3 direction, vec3 u, vec3 v, float seed, float age) {
  float start = branch < 0.5 ? 0.0 : (branch < 1.5 ? 10.0 : 15.0) / 24.0;
  float along = mix(start, 1.0, t);
  float boltLength = length(direction);
  float jagged = boltNoise(floor(t * 24.0 + 0.1), seed + branch * 9.0);
  float envelope = sin(t * 3.14159265);
  float amplitude = min(0.75, boltLength * 0.12) * (0.88 + 0.12 * sin(age * 2.2 + seed * 6.0));
  vec3 point = aStart + direction * along;
  point += u * jagged * envelope * amplitude;
  point += v * boltNoise(floor(t * 24.0 + 0.1), seed + 17.0) * envelope * amplitude * 0.55;
  if (branch > 0.5) {
    // Branches start on the same seeded main-bolt vertex before peeling away.
    float baseNoise = boltNoise(floor(start * 24.0 + 0.1), seed);
    float baseCross = boltNoise(floor(start * 24.0 + 0.1), seed + 17.0);
    point += (u * baseNoise + v * baseCross * 0.55) * sin(start * 3.14159265) * amplitude * (1.0 - t);
    float branchSign = branch < 1.5 ? 1.0 : -1.0;
    point += (u * branchSign + v * 0.45) * t * (0.6 + min(boltLength * 0.13, 1.3));
    point -= direction * t * (0.16 + branch * 0.08);
  }
  return point;
}
void main() {
  vAge = uTime - aMeta.x; vHue = aMeta.z; vEnergy = aMeta.y;
  vAlong = position.x; vSide = position.y; vBranch = position.z;
  vec3 direction = aEnd - aStart;
  vec3 axis = normalize(direction);
  vec3 u = cross(axis, vec3(0.0, 1.0, 0.0));
  if (dot(u, u) < 0.001) u = cross(axis, vec3(0.0, 0.0, 1.0));
  u = normalize(u); vec3 v = cross(axis, u);
  float age = max(0.0, vAge);
  vec3 p = boltPoint(position.x, position.z, direction, u, v, aMeta.w, age);
  float nextT = position.x < 0.999 ? min(1.0, position.x + 0.0416667) : max(0.0, position.x - 0.0416667);
  vec3 tangent = mat3(modelViewMatrix) * (boltPoint(nextT, position.z, direction, u, v, aMeta.w, age) - p);
  if (position.x >= 0.999) tangent = -tangent;
  vec2 side = vec2(-tangent.y, tangent.x);
  if (dot(side, side) < 0.00001) side = vec2(1.0, 0.0);
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  float width = (position.z < 0.5 ? 0.12 : 0.065) * (0.7 + aMeta.y * 0.3);
  view.xy += normalize(side) * position.y * width * length(modelViewMatrix[0].xyz);
  gl_Position = projectionMatrix * view;
}
`;
const LIGHTNING_FRAGMENT = /* glsl */ `
uniform float uStrength;
varying float vAge;
varying float vHue;
varying float vEnergy;
varying float vAlong;
varying float vSide;
varying float vBranch;
${COLOR}
void main() {
  if (vAge < 0.0 || vAge > 3.2) discard;
  float side = clamp(abs(vSide), 0.0, 1.0);
  float core = exp(-side * side * 42.0), corona = exp(-side * side * 5.5);
  float packetDistance = (vAlong - fract(vAge * 0.48)) * 10.0;
  float packet = exp(-packetDistance * packetDistance);
  float flux = 0.66 + packet * 0.34;
  float alpha = (core * 0.6 + corona * 0.24) * spectacleLife(vAge, 3.2) * flux * uStrength * (0.5 + vEnergy * 0.3);
  alpha *= vBranch < 0.5 ? 1.0 : 0.58;
  if (!(alpha >= 0.005)) discard;
  vec3 color = mix(spectacleColor(vHue + 0.12), vec3(0.85, 0.93, 1.0), core * 0.65);
  gl_FragColor = vec4(color * (1.4 + packet * 0.35), min(alpha, 0.95));
  ${OUTPUT}
}
`;
const PETAL_VERTEX = /* glsl */ `
${NOTE}
varying vec2 vUv;
varying float vPetal;
varying vec3 vViewPosition;
void main() {
  vAge = uTime - aMeta.x; vHue = aMeta.z; vEnergy = aMeta.y; vSeed = aMeta.w;
  vUv = position.xy; vPetal = position.z;
  float age = max(0.0, vAge);
  float opening = smoothstep(0.0, 0.85, age);
  float t = position.x, across = position.y;
  float angle = position.z * 0.7853981634 + aMeta.w * 6.2831853 + age * 0.18;
  float radius = 0.12 + t * (1.25 + aMeta.y * 0.55) * opening;
  float width = sin(t * 3.14159265) * (0.35 + aMeta.y * 0.1) * opening;
  float fold = sin(t * 3.14159265) * (0.35 + 0.17 * sin(age * 0.65 + position.z));
  fold += across * across * width * 0.65 + (1.0 - opening) * t * 1.2;
  vec3 local = vec3(cos(angle) * radius - sin(angle) * across * width,
    sin(angle) * radius + cos(angle) * across * width, fold);
  vec3 p = aCenter + aU * local.x + aV * local.y + aW * local.z;
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  vViewPosition = -view.xyz;
  gl_Position = projectionMatrix * view;
}
`;
const PETAL_FRAGMENT = /* glsl */ `
uniform float uStrength;
varying float vAge;
varying float vHue;
varying float vEnergy;
varying float vSeed;
varying vec2 vUv;
varying float vPetal;
varying vec3 vViewPosition;
${COLOR}
void main() {
  if (vAge < 0.0 || vAge > 8.0) discard;
  vec2 uv = vec2(clamp(vUv.x, 0.0, 1.0), clamp(vUv.y, -1.0, 1.0));
  vec3 n = safeUnit(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
  vec3 view = safeUnit(vViewPosition);
  float facing = abs(dot(n, view));
  float rim = 1.0 - clamp(facing, 0.0, 1.0);
  float edge = smoothstep(0.64, 1.0, abs(uv.y));
  float tip = 1.0 - smoothstep(0.94, 1.0, uv.x);
  float vein = exp(-uv.y * uv.y * 100.0);
  vec3 color = spectacleColor(vHue + vPetal * 0.055 + uv.x * 0.21 + rim * 0.2);
  float glint = pow(max(0.0, abs(dot(n, safeUnit(vec3(0.4, 0.7, 1.0) + view)))), 24.0);
  color *= 0.5 + facing * 0.35 + glint * 0.8;
  color += spectacleColor(vHue + 0.3) * (vein * 0.18 + edge * 0.23);
  float alpha = spectacleLife(vAge, 8.0) * uStrength * (0.38 + rim * 0.25 + edge * 0.18) * tip;
  if (!(alpha >= 0.005)) discard;
  gl_FragColor = vec4(color, min(0.88, alpha));
  ${OUTPUT}
}
`;
const BUBBLE_VERTEX = /* glsl */ `
${NOTE}
varying vec3 vViewPosition;
varying vec3 vViewNormal;
varying vec3 vSphere;
void main() {
  vAge = uTime - aMeta.x; vHue = aMeta.z; vEnergy = aMeta.y; vSeed = aMeta.w;
  float age = max(0.0, vAge);
  float radius = (0.45 + 1.1 * (1.0 - exp(-age * 0.4))) * (0.8 + aMeta.y * 0.4);
  vec3 axis = aU * position.x + aV * position.y + aW * position.z;
  float ripple = 1.0 + 0.018 * sin(position.y * 9.0 + age * 0.8 + aMeta.w * 6.0);
  vec3 p = aCenter + axis * radius * ripple + aV * age * 0.12;
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  vViewPosition = -view.xyz; vViewNormal = normalMatrix * axis; vSphere = position;
  gl_Position = projectionMatrix * view;
}
`;
const BUBBLE_FRAGMENT = /* glsl */ `
uniform float uStrength;
varying float vAge;
varying float vHue;
varying float vEnergy;
varying float vSeed;
varying vec3 vViewPosition;
varying vec3 vViewNormal;
varying vec3 vSphere;
${COLOR}
void main() {
  if (vAge < 0.0 || vAge > 9.0) discard;
  vec3 n = safeUnit(vViewNormal), view = safeUnit(vViewPosition);
  float facing = clamp(abs(dot(n, view)), 0.0, 1.0);
  float rim = pow(clamp(1.0 - facing, 0.0, 1.0), 2.4);
  float thickness = 4.0 + vSphere.y * 1.1 + sin(vSphere.x * 4.0 + vAge * 0.35 + vSeed * 6.0) * 0.55;
  vec3 film = 0.5 + 0.5 * cos(thickness * (0.3 + facing * 1.9) + vec3(0.0, 2.0943951, 4.1887902));
  vec3 color = mix(film, spectacleColor(vHue + facing * 0.1), 0.2);
  vec3 reflected = reflect(-view, n);
  float softbox = pow(max(0.0, dot(reflected, safeUnit(vec3(-0.4, 0.8, 0.6)))), 70.0);
  float band = pow(clamp(0.5 + 0.5 * sin(thickness * 2.6 + facing * 16.0), 0.0, 1.0), 4.0);
  color = color * (0.65 + rim * 0.6) + vec3(0.7, 0.9, 1.0) * softbox * 0.7;
  float alpha = spectacleLife(vAge, 9.0) * uStrength * (0.018 + rim * 0.35 + band * 0.045 + softbox * 0.22);
  if (!(alpha >= 0.004)) discard;
  gl_FragColor = vec4(color, min(0.72, alpha));
  ${OUTPUT}
}
`;

function stripGeometry(segments: number, across = 1, copies = 1) {
  const target = new THREE.InstancedBufferGeometry(), positions: number[] = [], indices: number[] = [];
  for (let copy = 0; copy < copies; copy++) {
    const offset = positions.length / 3;
    for (let x = 0; x <= segments; x++) for (let y = 0; y <= across; y++) positions.push(x / segments, y / across * 2 - 1, copy);
    for (let x = 0; x < segments; x++) for (let y = 0; y < across; y++) {
      const a = offset + x * (across + 1) + y, b = a + across + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  target.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); target.setIndex(indices); target.instanceCount = 0;
  return target;
}
function sphereGeometry(xr: boolean) {
  const source = new THREE.SphereGeometry(1, xr ? 24 : 36, xr ? 16 : 24), target = new THREE.InstancedBufferGeometry();
  target.setAttribute('position', source.getAttribute('position').clone()); target.setIndex(source.getIndex()!.clone());
  source.dispose(); target.instanceCount = 0; return target;
}
function attribute(target: THREE.BufferGeometry, name: string, size: number, capacity: number) {
  const values = new Float32Array(size * capacity), value = new THREE.InstancedBufferAttribute(values, size);
  value.setUsage(THREE.DynamicDrawUsage); target.setAttribute(name, value); return values;
}
function upload(target: THREE.BufferGeometry, count: number) {
  for (const raw of Object.values(target.attributes)) {
    const value = raw as THREE.BufferAttribute;
    if (value.usage !== THREE.DynamicDrawUsage) continue;
    value.clearUpdateRanges(); value.addUpdateRange(0, count * value.itemSize); value.needsUpdate = true;
  }
}
function surface(vertexShader: string, fragmentShader: string, additive = false) {
  const uniforms: Uniforms = { uTime: { value: 0 }, uStrength: { value: 0 } };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide });
  material.forceSinglePass = true; return { uniforms, material };
}
function noteBatch(data: PrismScoreData, capacity: number, key: 'petals' | 'bubbles', xr: boolean): Batch {
  const target = key === 'petals' ? stripGeometry(xr ? 12 : 18, xr ? 4 : 6, 8) : sphereGeometry(xr);
  const center = attribute(target, 'aCenter', 3, capacity), u = attribute(target, 'aU', 3, capacity);
  const v = attribute(target, 'aV', 3, capacity), w = attribute(target, 'aW', 3, capacity), meta = attribute(target, 'aMeta', 4, capacity);
  const fx = key === 'petals' ? surface(PETAL_VERTEX, PETAL_FRAGMENT) : surface(BUBBLE_VERTEX, BUBBLE_FRAGMENT);
  if (key === 'bubbles') fx.material.side = THREE.FrontSide;
  const object = new THREE.Mesh(target, fx.material); object.frustumCulled = false; object.name = `flight-${key}`;
  let lastStart = -1, lastEnd = -1;
  return { object, geometry: target, ...fx, update(time, strength) {
    object.visible = strength > 0; fx.uniforms.uTime.value = time; fx.uniforms.uStrength.value = strength;
    if (strength <= 0) return;
    const range = fireworkWindow(data.birth, time, SPECTACLE_LIFETIMES[key], capacity);
    if (lastStart === range.start && lastEnd === range.end) return;
    let output = 0;
    for (let i = range.start; i < range.end; i++, output++) {
      const m = i * 16;
      center.set(data.matrices.subarray(m + 12, m + 15), output * 3);
      for (const [offset, values] of [[0, u], [4, v], [8, w]] as const) {
        const length = Math.max(0.001, Math.hypot(data.matrices[m + offset], data.matrices[m + offset + 1], data.matrices[m + offset + 2]));
        values.set([data.matrices[m + offset] / length, data.matrices[m + offset + 1] / length, data.matrices[m + offset + 2] / length], output * 3);
      }
      meta.set([data.birth[i], Math.min(1, data.velocity[i]) / Math.sqrt(1 + data.crowd[i] * 0.12), data.hue[i], fireworkRandom(i, 0, 2311)], output * 4);
    }
    target.instanceCount = output; upload(target, output); lastStart = range.start; lastEnd = range.end;
  } };
}
function lightningBatch(data: PrismScoreData, capacity: number): Batch {
  const links = buildLightningLinks(data), target = stripGeometry(24, 1, 3);
  const start = attribute(target, 'aStart', 3, capacity), end = attribute(target, 'aEnd', 3, capacity), meta = attribute(target, 'aMeta', 4, capacity);
  const fx = surface(LIGHTNING_VERTEX, LIGHTNING_FRAGMENT, true), object = new THREE.Mesh(target, fx.material);
  object.frustumCulled = false; object.name = 'flight-lightning';
  let lastStart = -1, lastEnd = -1;
  return { object, geometry: target, ...fx, update(time, strength) {
    object.visible = strength > 0; fx.uniforms.uTime.value = time; fx.uniforms.uStrength.value = strength;
    if (strength <= 0) return;
    const range = fireworkWindow(links.birth, time, SPECTACLE_LIFETIMES.lightning, capacity);
    if (lastStart === range.start && lastEnd === range.end) return;
    let output = 0;
    for (let i = range.start; i < range.end; i++, output++) {
      const a = links.from[i], b = links.to[i];
      start.set(data.matrices.subarray(a * 16 + 12, a * 16 + 15), output * 3);
      end.set(data.matrices.subarray(b * 16 + 12, b * 16 + 15), output * 3);
      meta.set([links.birth[i], Math.min(1, data.velocity[b]) / Math.sqrt(1 + data.crowd[b] * 0.1), data.hue[b], fireworkRandom(a, b, 937)], output * 4);
    }
    target.instanceCount = output; upload(target, output); lastStart = range.start; lastEnd = range.end;
  } };
}

export function createFlightSpectacle(data: PrismScoreData, xr: boolean, enabled: Pick<FlightEffectsSettings, Key>) {
  const budget = xr ? SPECTACLE_BUDGETS.xr : SPECTACLE_BUDGETS.desktop;
  const group = new THREE.Group(), batches = new Map<Key, Batch>();
  if (enabled.lightning > 0) batches.set('lightning', lightningBatch(data, budget.lightning));
  if (enabled.petals > 0) batches.set('petals', noteBatch(data, budget.petals, 'petals', xr));
  if (enabled.bubbles > 0) batches.set('bubbles', noteBatch(data, budget.bubbles, 'bubbles', xr));
  batches.forEach(batch => group.add(batch.object)); let disposed = false;
  return { group, update(time: number, settings: FlightEffectsSettings) {
    if (disposed) return;
    const now = Number.isFinite(time) ? Math.max(0, time) : 0;
    batches.forEach((batch, key) => batch.update(now, Number.isFinite(settings[key]) ? THREE.MathUtils.clamp(settings[key], 0, 2) : 0));
  }, dispose() {
    if (disposed) return; disposed = true;
    batches.forEach(batch => { batch.geometry.dispose(); batch.material.dispose(); }); group.removeFromParent(); group.clear();
  } };
}

export default function FlightSpectacle({ data, getMusicTime, settings }: {
  data: PrismScoreData; getMusicTime?: () => { time: number; duration: number }; settings: FlightEffectsSettings;
}) {
  const session = useXR(state => state.session), group = useMemo(() => new THREE.Group(), []);
  const resources = useRef<ReturnType<typeof createFlightSpectacle> | null>(null);
  const lightning = settings.lightning > 0, petals = settings.petals > 0, bubbles = settings.bubbles > 0;
  useEffect(() => {
    const current = createFlightSpectacle(data, Boolean(session), { lightning: lightning ? 1 : 0, petals: petals ? 1 : 0, bubbles: bubbles ? 1 : 0 });
    resources.current = current; group.add(current.group);
    return () => { if (resources.current === current) resources.current = null; current.dispose(); };
  }, [data, Boolean(session), group, lightning, petals, bubbles]);
  useFrame(() => resources.current?.update(getMusicTime?.().time ?? 0, settings));
  return <primitive object={group} dispose={null} />;
}
