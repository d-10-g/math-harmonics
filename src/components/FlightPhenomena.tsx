import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useXR } from '@react-three/xr';
import * as THREE from 'three';
import type { FlightEffectsSettings } from '../lib/flightEffects';
import type { PrismScoreData } from '../lib/prismTrail';
import { fireworkRandom, fireworkWindow } from '../lib/flightFireworks';
import { crystalDirections, crystalLength, PHENOMENA_BUDGETS, PHENOMENA_LIFETIMES } from '../lib/flightPhenomena';

type Key = 'ribbons' | 'crystals' | 'vortexes';
type Uniforms = { uTime: { value: number }; uStrength: { value: number } };
type Batch = { object: THREE.Mesh; geometry: THREE.InstancedBufferGeometry; material: THREE.ShaderMaterial;
  uniforms: Uniforms; update(time: number, strength: number): void };
const COMMON = /* glsl */ `
vec3 phenomenaColor(float hue) {
  return mix(vec3(0.055), clamp(abs(fract(hue + vec3(0.0, 0.6666667, 0.3333333)) * 6.0 - 3.0) - 1.0, 0.0, 1.0), 0.945);
}
float phenomenaLife(float age, float life) {
  return smoothstep(0.0, 0.35, age) * (1.0 - smoothstep(life - 1.6, life, age));
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
vec3 noteBasis(vec3 p) { return aU * p.x + aV * p.y + aW * p.z; }
vec3 slowTurn(vec3 p, float age, float seed) {
  float angle = age * 0.17 + seed * 6.28318530718;
  float c = cos(angle), s = sin(angle);
  p.xz = mat2(c, s, -s, c) * p.xz;
  angle = sin(age * 0.22 + seed * 6.0) * 0.4;
  c = cos(angle); s = sin(angle);
  p.yz = mat2(c, s, -s, c) * p.yz;
  return p;
}
`;
const RIBBON_VERTEX = /* glsl */ `
${NOTE}
varying vec2 vUv;
varying vec3 vViewPosition;
void main() {
  vAge = uTime - aMeta.x; vHue = aMeta.z; vEnergy = aMeta.y; vSeed = aMeta.w;
  vUv = position.xy;
  float age = max(0.0, vAge), u = position.x * 6.28318530718, v = position.y;
  float phase = age * 0.25 + aMeta.w * 6.28318530718;
  float width = 0.25 + aMeta.y * 0.08;
  float radius = 1.15 + aMeta.y * 0.2 + v * width * cos(u * 0.5 + phase);
  vec3 local = vec3(cos(u) * radius, sin(u) * radius, v * width * sin(u * 0.5 + phase));
  local *= 0.2 + 0.8 * smoothstep(0.0, 0.9, age);
  local = slowTurn(local, age, aMeta.w);
  vec4 view = modelViewMatrix * vec4(aCenter + noteBasis(local), 1.0);
  vViewPosition = -view.xyz;
  gl_Position = projectionMatrix * view;
}
`;
const RIBBON_FRAGMENT = /* glsl */ `
uniform float uStrength;
varying float vAge;
varying float vHue;
varying float vEnergy;
varying float vSeed;
varying vec2 vUv;
varying vec3 vViewPosition;
${COMMON}
void main() {
  if (vAge < 0.0 || vAge > 10.0) discard;
  vec2 uv = vec2(clamp(vUv.x, 0.0, 1.0), clamp(vUv.y, -1.0, 1.0));
  vec3 n = safeUnit(cross(dFdx(vViewPosition), dFdy(vViewPosition))), view = safeUnit(vViewPosition);
  float facing = clamp(abs(dot(n, view)), 0.0, 1.0);
  float rim = 1.0 - facing;
  float edge = smoothstep(0.74, 1.0, abs(uv.y));
  float acrossPhase = uv.y * cos(uv.x * 3.14159265359 + vAge * 0.25 + vSeed * 6.28318530718);
  float grain = 0.5 + 0.5 * sin(uv.x * 219.911485751 + acrossPhase * 8.0 + vSeed * 5.0);
  float sheen = pow(max(0.0, abs(dot(n, safeUnit(vec3(-0.4, 0.65, 1.0) + view)))), 42.0);
  float interference = sin(uv.x * 6.28318530718) * 0.18 + acrossPhase * 0.08 + rim * 0.38 + vAge * 0.025;
  vec3 color = phenomenaColor(vHue + interference) * (0.45 + facing * 0.35 + grain * 0.08);
  color += phenomenaColor(vHue + 0.28) * (edge * 0.5 + sheen * 0.85);
  color += vec3(0.65, 0.85, 1.0) * sheen * 0.25;
  float alpha = phenomenaLife(vAge, 10.0) * uStrength * (0.55 + rim * 0.2 + edge * 0.15);
  if (!(alpha >= 0.005)) discard;
  gl_FragColor = vec4(color, min(alpha, 0.92));
  ${OUTPUT}
}
`;
const CRYSTAL_VERTEX = /* glsl */ `
${NOTE}
attribute vec3 aBary;
attribute float aFacet;
varying vec3 vBary;
varying float vFacet;
varying vec3 vLocal;
varying vec3 vViewPosition;
varying vec3 vViewNormal;
void main() {
  vAge = uTime - aMeta.x; vHue = aMeta.z; vEnergy = aMeta.y; vSeed = aMeta.w;
  vBary = aBary; vFacet = aFacet; vLocal = position;
  float age = max(0.0, vAge);
  float growth = (0.12 + 0.88 * smoothstep(0.0, 1.1, age)) * (0.8 + aMeta.y * 0.35);
  vec3 local = slowTurn(position * growth, age, aMeta.w);
  vec4 view = modelViewMatrix * vec4(aCenter + noteBasis(local), 1.0);
  vViewPosition = -view.xyz;
  vViewNormal = normalMatrix * noteBasis(slowTurn(normal, age, aMeta.w));
  gl_Position = projectionMatrix * view;
}
`;
const CRYSTAL_FRAGMENT = /* glsl */ `
uniform float uStrength;
varying float vAge;
varying float vHue;
varying float vEnergy;
varying float vSeed;
varying vec3 vBary;
varying float vFacet;
varying vec3 vLocal;
varying vec3 vViewPosition;
varying vec3 vViewNormal;
${COMMON}
void main() {
  if (vAge < 0.0 || vAge > 9.0) discard;
  vec3 n = safeUnit(vViewNormal), view = safeUnit(vViewPosition);
  float facing = clamp(abs(dot(n, view)), 0.0, 1.0), rim = 1.0 - facing;
  vec3 antialias = max(fwidth(vBary) * 1.25, vec3(0.0001));
  vec3 edges = smoothstep(vec3(0.0), antialias, vBary);
  float wire = 1.0 - min(min(edges.x, edges.y), edges.z);
  float scan = pow(clamp(0.5 + 0.5 * sin(vLocal.y * 22.0 + vLocal.x * 4.0 - vAge * 0.8), 0.0, 1.0), 8.0);
  float glint = pow(max(0.0, abs(dot(n, safeUnit(vec3(0.6, 0.8, 0.4) + view)))), 36.0);
  vec3 color = phenomenaColor(vHue + vFacet * 0.12 + rim * 0.27) * (0.25 + facing * 0.35 + glint * 1.1);
  color += phenomenaColor(vHue + 0.32) * (wire * 0.65 + scan * 0.28);
  float alpha = phenomenaLife(vAge, 9.0) * uStrength * (0.42 + rim * 0.22 + wire * 0.22);
  if (!(alpha >= 0.005)) discard;
  gl_FragColor = vec4(color, min(alpha, 0.9));
  ${OUTPUT}
}
`;
const VORTEX_VERTEX = /* glsl */ `
${NOTE}
varying vec2 vUv;
varying vec3 vViewPosition;
void main() {
  vAge = uTime - aMeta.x; vHue = aMeta.z; vEnergy = aMeta.y; vSeed = aMeta.w;
  vUv = position.xy;
  float age = max(0.0, vAge), angle = position.x * 6.28318530718, r = position.y;
  float radius = r * (1.5 + aMeta.y * 0.65) * (0.25 + 0.75 * smoothstep(0.0, 1.0, age));
  float warp = sin(angle * 2.0 + age * 0.35 + aMeta.w * 6.0) * r * r * 0.24;
  vec3 local = vec3(cos(angle) * radius, sin(angle) * radius, warp);
  local = slowTurn(local, age * 0.45, aMeta.w);
  vec4 view = modelViewMatrix * vec4(aCenter + noteBasis(local), 1.0);
  vViewPosition = -view.xyz;
  gl_Position = projectionMatrix * view;
}
`;
const VORTEX_FRAGMENT = /* glsl */ `
uniform float uStrength;
varying float vAge;
varying float vHue;
varying float vEnergy;
varying float vSeed;
varying vec2 vUv;
varying vec3 vViewPosition;
${COMMON}
void main() {
  if (vAge < 0.0 || vAge > 10.0) discard;
  vec2 uv = clamp(vUv, vec2(0.0), vec2(1.0));
  float r = uv.y, angle = uv.x * 6.28318530718;
  float phase = angle * 3.0 - log(max(r, 0.03)) * 8.0 - vAge * 0.65 + vSeed * 6.0;
  float arms = pow(clamp(0.5 + 0.5 * sin(phase), 0.0, 1.0), 5.0);
  float filaments = pow(clamp(0.5 + 0.5 * sin(r * 95.0 - angle * 2.0 + vAge * 0.4), 0.0, 1.0), 16.0);
  float horizonDistance = (r - 0.23) * 27.0;
  float horizon = exp(-horizonDistance * horizonDistance);
  float outer = 1.0 - smoothstep(0.78, 1.0, r);
  float disk = smoothstep(0.18, 0.3, r) * outer;
  float core = 1.0 - smoothstep(0.17, 0.235, r);
  vec3 n = safeUnit(cross(dFdx(vViewPosition), dFdy(vViewPosition))), view = safeUnit(vViewPosition);
  float rim = 1.0 - clamp(abs(dot(n, view)), 0.0, 1.0);
  vec3 color = phenomenaColor(vHue + r * 0.23 + arms * 0.1 + rim * 0.2);
  color *= disk * (0.25 + arms * 0.9 + filaments * 0.3);
  color += mix(phenomenaColor(vHue + 0.12), vec3(1.0, 0.65, 0.28), 0.35) * horizon * 1.5;
  color = mix(color, vec3(0.0015), core);
  float alpha = phenomenaLife(vAge, 10.0) * uStrength * (core * 0.9 + disk * (0.12 + arms * 0.28 + filaments * 0.08) + horizon * 0.5);
  if (!(alpha >= 0.004)) discard;
  gl_FragColor = vec4(color, min(alpha, 0.96));
  ${OUTPUT}
}
`;

function sheetGeometry(around: number, across: number, disk = false) {
  const target = new THREE.InstancedBufferGeometry(), positions: number[] = [], indices: number[] = [];
  for (let x = 0; x <= around; x++) for (let y = 0; y <= across; y++) positions.push(x / around, disk ? y / across : y / across * 2 - 1, 0);
  for (let x = 0; x < around; x++) for (let y = 0; y < across; y++) {
    const a = x * (across + 1) + y, b = a + across + 1;
    indices.push(a, a + 1, b, a + 1, b + 1, b);
  }
  target.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); target.setIndex(indices); target.instanceCount = 0;
  return target;
}
function geodeGeometry() {
  const positions: number[] = [], normals: number[] = [], bary: number[] = [], facets: number[] = [];
  const edgeA = new THREE.Vector3(), edgeB = new THREE.Vector3(), normal = new THREE.Vector3();
  const triangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    normal.crossVectors(edgeA.subVectors(b, a), edgeB.subVectors(c, a)).normalize();
    const facet = fireworkRandom(facets.length / 3, 0, 812);
    for (const vertex of [a, b, c]) { positions.push(vertex.x, vertex.y, vertex.z); normals.push(normal.x, normal.y, normal.z); facets.push(facet); }
    bary.push(1, 0, 0, 0, 1, 0, 0, 0, 1);
  };
  const spike = (base: THREE.Vector3, direction: THREE.Vector3, length: number, width: number) => {
    const axis = new THREE.Vector3(0, 1, 0);
    if (Math.abs(direction.y) > 0.9) axis.set(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(direction, axis).normalize().multiplyScalar(width);
    const v = new THREE.Vector3().crossVectors(direction, u).normalize().multiplyScalar(width);
    const ring = [base.clone().add(u), base.clone().add(v), base.clone().sub(u), base.clone().sub(v)];
    const tip = base.clone().addScaledVector(direction, length);
    for (let i = 0; i < 4; i++) triangle(ring[i], ring[(i + 1) % 4], tip);
  };
  const core = new THREE.IcosahedronGeometry(0.38, 0), raw = core.getAttribute('position');
  for (let i = 0; i < raw.count; i += 3) triangle(new THREE.Vector3().fromBufferAttribute(raw, i), new THREE.Vector3().fromBufferAttribute(raw, i + 1), new THREE.Vector3().fromBufferAttribute(raw, i + 2));
  core.dispose();
  crystalDirections().forEach((rawDirection, i) => {
    const direction = new THREE.Vector3(...rawDirection), length = crystalLength(i);
    spike(direction.clone().multiplyScalar(0.26), direction, length, 0.15);
    if (i % 2 === 0) {
      const axis = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0)).normalize();
      for (const sign of [-1, 1]) {
        const branch = direction.clone().multiplyScalar(0.65).addScaledVector(axis, sign * 0.76).normalize();
        spike(direction.clone().multiplyScalar(length * 0.58), branch, length * 0.44, 0.085);
      }
    }
  });
  const target = new THREE.InstancedBufferGeometry();
  target.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  target.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  target.setAttribute('aBary', new THREE.Float32BufferAttribute(bary, 3)); target.setAttribute('aFacet', new THREE.Float32BufferAttribute(facets, 1));
  target.instanceCount = 0; return target;
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
function surface(vertexShader: string, fragmentShader: string) {
  const uniforms: Uniforms = { uTime: { value: 0 }, uStrength: { value: 0 } };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent: true,
    blending: THREE.NormalBlending, depthWrite: false, side: THREE.DoubleSide });
  material.forceSinglePass = true; return { uniforms, material };
}
function makeBatch(data: PrismScoreData, capacity: number, key: Key, xr: boolean): Batch {
  const target = key === 'crystals' ? geodeGeometry() : sheetGeometry(xr ? 40 : 64, key === 'ribbons' ? (xr ? 6 : 10) : (xr ? 12 : 18), key === 'vortexes');
  const center = attribute(target, 'aCenter', 3, capacity), u = attribute(target, 'aU', 3, capacity);
  const v = attribute(target, 'aV', 3, capacity), w = attribute(target, 'aW', 3, capacity), meta = attribute(target, 'aMeta', 4, capacity);
  const shaders = key === 'ribbons' ? [RIBBON_VERTEX, RIBBON_FRAGMENT] : key === 'crystals' ? [CRYSTAL_VERTEX, CRYSTAL_FRAGMENT] : [VORTEX_VERTEX, VORTEX_FRAGMENT];
  const fx = surface(shaders[0], shaders[1]), object = new THREE.Mesh(target, fx.material);
  object.frustumCulled = false; object.name = `flight-${key}`;
  let lastStart = -1, lastEnd = -1;
  return { object, geometry: target, ...fx, update(time, strength) {
    object.visible = strength > 0; fx.uniforms.uTime.value = time; fx.uniforms.uStrength.value = strength;
    if (strength <= 0) return;
    const range = fireworkWindow(data.birth, time, PHENOMENA_LIFETIMES[key], capacity);
    if (range.start === lastStart && range.end === lastEnd) return;
    let output = 0;
    for (let i = range.start; i < range.end; i++, output++) {
      const m = i * 16;
      center.set(data.matrices.subarray(m + 12, m + 15), output * 3);
      for (const [offset, values] of [[0, u], [4, v], [8, w]] as const) {
        const length = Math.max(0.001, Math.hypot(data.matrices[m + offset], data.matrices[m + offset + 1], data.matrices[m + offset + 2]));
        values.set([data.matrices[m + offset] / length, data.matrices[m + offset + 1] / length, data.matrices[m + offset + 2] / length], output * 3);
      }
      meta.set([data.birth[i], Math.min(1, data.velocity[i]) / Math.sqrt(1 + data.crowd[i] * 0.12), data.hue[i], fireworkRandom(i, 0, 5713)], output * 4);
    }
    target.instanceCount = output; upload(target, output); lastStart = range.start; lastEnd = range.end;
  } };
}

export function createFlightPhenomena(data: PrismScoreData, xr: boolean, enabled: Pick<FlightEffectsSettings, Key>) {
  const budget = xr ? PHENOMENA_BUDGETS.xr : PHENOMENA_BUDGETS.desktop;
  const group = new THREE.Group(), batches = new Map<Key, Batch>();
  for (const key of ['ribbons', 'crystals', 'vortexes'] as const) if (enabled[key] > 0) batches.set(key, makeBatch(data, budget[key], key, xr));
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

export default function FlightPhenomena({ data, getMusicTime, settings }: {
  data: PrismScoreData; getMusicTime?: () => { time: number; duration: number }; settings: FlightEffectsSettings;
}) {
  const session = useXR(state => state.session), group = useMemo(() => new THREE.Group(), []);
  const resources = useRef<ReturnType<typeof createFlightPhenomena> | null>(null);
  const ribbons = settings.ribbons > 0, crystals = settings.crystals > 0, vortexes = settings.vortexes > 0;
  useEffect(() => {
    const current = createFlightPhenomena(data, Boolean(session), { ribbons: ribbons ? 1 : 0, crystals: crystals ? 1 : 0, vortexes: vortexes ? 1 : 0 });
    resources.current = current; group.add(current.group);
    return () => { if (resources.current === current) resources.current = null; current.dispose(); };
  }, [data, Boolean(session), group, ribbons, crystals, vortexes]);
  useFrame(() => resources.current?.update(getMusicTime?.().time ?? 0, settings));
  return <primitive object={group} dispose={null} />;
}
