import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useXR } from '@react-three/xr';
import * as THREE from 'three';
import type { FlightEffectsSettings } from '../lib/flightEffects';
import type { PrismScoreData } from '../lib/prismTrail';
import { fireworkRandom, fireworkWindow } from '../lib/flightFireworks';
import { buildChordLinks, SCULPTURE_BUDGETS, SCULPTURE_LIFETIMES, type ChordLinkData } from '../lib/flightSculptures';

type SculptureKey = 'auroras' | 'constellations' | 'gyroscopes';
type Uniforms = { uTime: { value: number }; uStrength: { value: number } };
type Batch = { object: THREE.Mesh; geometry: THREE.InstancedBufferGeometry; material: THREE.ShaderMaterial;
  uniforms: Uniforms; update(time: number, strength: number): void };

const COLOR = /* glsl */ `
vec3 sculptureColor(float hue) {
  vec3 rgb = clamp(abs(fract(hue + vec3(0.0, 0.6666667, 0.3333333)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
  return mix(vec3(0.07), rgb, 0.93);
}
float sculptureLife(float age, float life) {
  return smoothstep(0.0, 0.4, age) * (1.0 - smoothstep(life - 1.6, life, age));
}
`;
const OUTPUT = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;
const NOTE_ATTRIBUTES = /* glsl */ `
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
const AURORA_VERTEX = /* glsl */ `
${NOTE_ATTRIBUTES}
varying vec2 vUv;
void main() {
  vAge = uTime - aMeta.x; vHue = aMeta.z; vEnergy = aMeta.y; vSeed = aMeta.w;
  vUv = position.xy;
  float age = max(0.0, vAge);
  float phase = position.x * 12.56637 + aMeta.w * 6.2831853 - age * 0.55;
  float width = 2.3 + aMeta.y * 1.6;
  float height = 2.5 + aMeta.y * 1.8;
  vec3 p = aCenter + aU * ((position.x - 0.5) * width);
  p += aV * (position.y * height * (0.86 + 0.14 * sin(phase * 0.7 + age * 0.2)));
  p += aW * (sin(phase + position.y * 2.8) * (0.15 + position.y * 0.55));
  p += aU * sin(position.y * 4.0 + phase * 0.45) * position.y * 0.28;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;
const AURORA_FRAGMENT = /* glsl */ `
uniform float uStrength;
varying float vAge;
varying float vHue;
varying float vEnergy;
varying float vSeed;
varying vec2 vUv;
${COLOR}
void main() {
  if (vAge < 0.0 || vAge > 12.0) discard;
  vec2 uv = clamp(vUv, vec2(0.0), vec2(1.0));
  float edge = smoothstep(0.0, 0.16, uv.x) * (1.0 - smoothstep(0.84, 1.0, uv.x));
  // Interpolated UVs can overshoot an edge by a few ulps; fractional pow
  // on a negative base produces NaN, which can contaminate the bloom chain.
  float height = smoothstep(0.0, 0.1, uv.y) * pow(clamp(1.0 - uv.y, 0.0, 1.0), 0.8);
  float fold = clamp(sin(uv.x * 61.0 + sin(uv.x * 13.0 + vAge * 0.4) * 2.0 + uv.y * 3.0 - vAge * 0.35), -1.0, 1.0);
  float silk = 0.2 + 0.8 * pow(clamp(0.5 + 0.5 * fold, 0.0, 1.0), 3.0);
  float alpha = edge * height * silk * sculptureLife(vAge, 12.0) * uStrength * (0.13 + vEnergy * 0.065);
  if (!(alpha >= 0.004)) discard;
  vec3 color = sculptureColor(vHue + uv.y * 0.26 + fold * 0.035 + vSeed * 0.05);
  gl_FragColor = vec4(color * 1.3, alpha);
  ${OUTPUT}
}
`;
const CONSTELLATION_VERTEX = /* glsl */ `
attribute vec3 aStart;
attribute vec3 aEnd;
attribute vec4 aMeta;
uniform float uTime;
uniform float uStrength;
varying float vAge;
varying float vHue;
varying float vSide;
varying float vAlong;
varying float vEnergy;
varying float vSeed;
void main() {
  vAge = uTime - aMeta.x; vHue = aMeta.z; vEnergy = aMeta.y; vSeed = aMeta.w;
  vSide = position.y; vAlong = position.x;
  float t = position.x;
  vec3 direction = aEnd - aStart;
  vec3 bow = cross(normalize(direction), vec3(0.0, 1.0, 0.0));
  if (dot(bow, bow) < 0.001) bow = vec3(1.0, 0.0, 0.0);
  float bend = sin(vAge * 0.45 + aMeta.w * 6.2831853) * 0.16;
  float drift = sin(t * 3.14159265) * bend;
  vec3 p = mix(aStart, aEnd, t) + bow * drift;
  vec3 tangent = mat3(modelViewMatrix) * (direction + bow * cos(t * 3.14159265) * 3.14159265 * bend);
  vec2 side = vec2(-tangent.y, tangent.x);
  if (dot(side, side) < 0.00001) side = vec2(1.0, 0.0);
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  float endpoint = pow(abs(t * 2.0 - 1.0), 16.0);
  float width = (0.026 + endpoint * 0.07) * (0.7 + aMeta.y * 0.3);
  view.xy += normalize(side) * position.y * width * length(modelViewMatrix[0].xyz);
  gl_Position = projectionMatrix * view;
}
`;
const CONSTELLATION_FRAGMENT = /* glsl */ `
uniform float uStrength;
varying float vAge;
varying float vHue;
varying float vSide;
varying float vAlong;
varying float vEnergy;
varying float vSeed;
${COLOR}
void main() {
  if (vAge < 0.0 || vAge > 8.5) discard;
  float edge = pow(max(0.0, 1.0 - abs(vSide)), 1.6);
  float packetDistance = (vAlong - fract(vAge * 0.16 + vSeed)) * 18.0;
  float packet = exp(-packetDistance * packetDistance);
  float endpoint = pow(abs(vAlong * 2.0 - 1.0), 20.0);
  float alpha = edge * (0.42 + packet * 0.45 + endpoint * 0.25) * sculptureLife(vAge, 8.5) * uStrength * (0.3 + vEnergy * 0.2);
  if (!(alpha >= 0.005)) discard;
  gl_FragColor = vec4(sculptureColor(vHue + vAlong * 0.08) * (1.1 + packet * 0.5), alpha);
  ${OUTPUT}
}
`;
const GYROSCOPE_VERTEX = /* glsl */ `
${NOTE_ATTRIBUTES}
varying float vAlong;
varying float vSide;
varying float vRing;
vec3 gyroRotate(vec3 p, float x, float y) {
  float c = cos(x), s = sin(x);
  p.yz = mat2(c, s, -s, c) * p.yz;
  c = cos(y); s = sin(y);
  p.xz = mat2(c, -s, s, c) * p.xz;
  return p;
}
void main() {
  vAge = uTime - aMeta.x; vHue = aMeta.z; vEnergy = aMeta.y; vSeed = aMeta.w;
  vAlong = position.x; vSide = position.y; vRing = position.z;
  float age = max(0.0, vAge);
  float angle = position.x * 6.28318530718;
  float radius = (0.7 + position.z * 0.22 + aMeta.y * 0.3) * (0.9 + 0.1 * sin(age * 0.6 + aMeta.w * 6.0));
  float x = position.z * 1.04719755 + sin(age * 0.33 + aMeta.w * 6.0) * 0.6;
  float y = age * (0.22 + position.z * 0.13) + aMeta.w * 6.2831853;
  vec3 local = gyroRotate(vec3(cos(angle), sin(angle), 0.0) * radius, x, y);
  vec3 tangent = gyroRotate(vec3(-sin(angle), cos(angle), 0.0), x, y);
  vec3 p = aCenter + aU * local.x + aV * local.y + aW * local.z;
  tangent = mat3(modelViewMatrix) * (aU * tangent.x + aV * tangent.y + aW * tangent.z);
  vec2 side = vec2(-tangent.y, tangent.x);
  if (dot(side, side) < 0.00001) side = vec2(1.0, 0.0);
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  view.xy += normalize(side) * position.y * 0.032 * length(modelViewMatrix[0].xyz);
  gl_Position = projectionMatrix * view;
}
`;
const GYROSCOPE_FRAGMENT = /* glsl */ `
uniform float uStrength;
varying float vAge;
varying float vHue;
varying float vEnergy;
varying float vSeed;
varying float vAlong;
varying float vSide;
varying float vRing;
${COLOR}
void main() {
  if (vAge < 0.0 || vAge > 7.0) discard;
  float edge = pow(max(0.0, 1.0 - abs(vSide)), 1.3);
  float ticks = smoothstep(0.72, 0.88, sin(vAlong * 150.796447));
  float travel = fract(vAlong - vAge * 0.1 * (1.0 + vRing * 0.2) + vSeed);
  float satelliteDistance = min(travel, 1.0 - travel) * 25.0;
  float satellite = exp(-satelliteDistance * satelliteDistance);
  float alpha = edge * (0.48 + ticks * 0.2 + satellite * 0.65) * sculptureLife(vAge, 7.0) * uStrength * (0.32 + vEnergy * 0.2);
  if (!(alpha >= 0.005)) discard;
  gl_FragColor = vec4(sculptureColor(vHue + vRing * 0.13) * (1.15 + satellite * 0.7), alpha);
  ${OUTPUT}
}
`;

function geometry(segments: number, rows = 1, hoops = 1) {
  const result = new THREE.InstancedBufferGeometry();
  const positions: number[] = [], indices: number[] = [];
  for (let hoop = 0; hoop < hoops; hoop++) {
    const offset = positions.length / 3;
    for (let x = 0; x <= segments; x++) for (let y = 0; y <= rows; y++) {
      positions.push(x / segments, rows > 1 ? y / rows : y * 2 - 1, hoop);
    }
    for (let x = 0; x < segments; x++) for (let y = 0; y < rows; y++) {
      const a = offset + x * (rows + 1) + y, b = a + rows + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  result.setIndex(indices); result.instanceCount = 0;
  return result;
}
function attribute(target: THREE.BufferGeometry, name: string, size: number, count: number) {
  const values = new Float32Array(size * count);
  const value = new THREE.InstancedBufferAttribute(values, size); value.setUsage(THREE.DynamicDrawUsage);
  target.setAttribute(name, value); return values;
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
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  return { uniforms, material };
}
function noteBatch(data: PrismScoreData, capacity: number, key: 'auroras' | 'gyroscopes', xr: boolean): Batch {
  const target = key === 'auroras' ? geometry(xr ? 20 : 32, xr ? 8 : 12) : geometry(xr ? 40 : 64, 1, 3);
  const center = attribute(target, 'aCenter', 3, capacity), u = attribute(target, 'aU', 3, capacity);
  const v = attribute(target, 'aV', 3, capacity), w = attribute(target, 'aW', 3, capacity);
  const meta = attribute(target, 'aMeta', 4, capacity);
  const fx = key === 'auroras' ? surface(AURORA_VERTEX, AURORA_FRAGMENT) : surface(GYROSCOPE_VERTEX, GYROSCOPE_FRAGMENT);
  const object = new THREE.Mesh(target, fx.material); object.frustumCulled = false;
  let lastStart = -1, lastEnd = -1;
  return { object, geometry: target, ...fx, update(time, strength) {
    object.visible = strength > 0; fx.uniforms.uTime.value = time; fx.uniforms.uStrength.value = strength;
    if (strength <= 0) return;
    const range = fireworkWindow(data.birth, time, SCULPTURE_LIFETIMES[key], capacity);
    if (range.start === lastStart && range.end === lastEnd) return;
    let output = 0;
    for (let i = range.start; i < range.end; i++, output++) {
      const m = i * 16;
      center.set(data.matrices.subarray(m + 12, m + 15), output * 3);
      for (const [offset, values] of [[0, u], [4, v], [8, w]] as const) {
        const length = Math.max(0.001, Math.hypot(data.matrices[m + offset], data.matrices[m + offset + 1], data.matrices[m + offset + 2]));
        values.set([data.matrices[m + offset] / length, data.matrices[m + offset + 1] / length, data.matrices[m + offset + 2] / length], output * 3);
      }
      meta.set([data.birth[i], Math.min(1, data.velocity[i]) / Math.sqrt(1 + data.crowd[i] * 0.12), data.hue[i], fireworkRandom(i, 0, 119)], output * 4);
    }
    target.instanceCount = output; upload(target, output); lastStart = range.start; lastEnd = range.end;
  } };
}
function constellationBatch(data: PrismScoreData, links: ChordLinkData, capacity: number): Batch {
  const target = geometry(12), start = attribute(target, 'aStart', 3, capacity), end = attribute(target, 'aEnd', 3, capacity);
  const meta = attribute(target, 'aMeta', 4, capacity), fx = surface(CONSTELLATION_VERTEX, CONSTELLATION_FRAGMENT);
  const object = new THREE.Mesh(target, fx.material); object.frustumCulled = false;
  let lastStart = -1, lastEnd = -1;
  return { object, geometry: target, ...fx, update(time, strength) {
    object.visible = strength > 0; fx.uniforms.uTime.value = time; fx.uniforms.uStrength.value = strength;
    if (strength <= 0) return;
    const range = fireworkWindow(links.birth, time, SCULPTURE_LIFETIMES.constellations, capacity);
    if (range.start === lastStart && range.end === lastEnd) return;
    let output = 0;
    for (let i = range.start; i < range.end; i++, output++) {
      const from = links.from[i], to = links.to[i];
      start.set(data.matrices.subarray(from * 16 + 12, from * 16 + 15), output * 3);
      end.set(data.matrices.subarray(to * 16 + 12, to * 16 + 15), output * 3);
      meta.set([links.birth[i], Math.min(1, data.velocity[to]) / Math.sqrt(1 + data.crowd[to] * 0.1), data.hue[to], fireworkRandom(from, to, 713)], output * 4);
    }
    target.instanceCount = output; upload(target, output); lastStart = range.start; lastEnd = range.end;
  } };
}

export function createFlightSculptures(data: PrismScoreData, xr: boolean,
  enabled: Pick<FlightEffectsSettings, SculptureKey>) {
  const budget = xr ? SCULPTURE_BUDGETS.xr : SCULPTURE_BUDGETS.desktop;
  const group = new THREE.Group(), batches = new Map<SculptureKey, Batch>();
  if (enabled.auroras > 0) batches.set('auroras', noteBatch(data, budget.auroras, 'auroras', xr));
  if (enabled.constellations > 0) batches.set('constellations', constellationBatch(data, buildChordLinks(data), budget.constellations));
  if (enabled.gyroscopes > 0) batches.set('gyroscopes', noteBatch(data, budget.gyroscopes, 'gyroscopes', xr));
  batches.forEach(batch => group.add(batch.object));
  let disposed = false;
  return { group, update(time: number, settings: FlightEffectsSettings) {
    if (disposed) return;
    const now = Number.isFinite(time) ? Math.max(0, time) : 0;
    batches.forEach((batch, key) => batch.update(now, Number.isFinite(settings[key]) ? THREE.MathUtils.clamp(settings[key], 0, 2) : 0));
  }, dispose() {
    if (disposed) return;
    disposed = true;
    batches.forEach(batch => { batch.geometry.dispose(); batch.material.dispose(); });
    group.removeFromParent(); group.clear();
  } };
}

export default function FlightSculptures({ data, getMusicTime, settings }: {
  data: PrismScoreData;
  getMusicTime?: () => { time: number; duration: number };
  settings: FlightEffectsSettings;
}) {
  const session = useXR(state => state.session), group = useMemo(() => new THREE.Group(), []);
  const resources = useRef<ReturnType<typeof createFlightSculptures> | null>(null);
  const auroras = settings.auroras > 0, constellations = settings.constellations > 0, gyroscopes = settings.gyroscopes > 0;
  useEffect(() => {
    const current = createFlightSculptures(data, Boolean(session), { auroras: auroras ? 1 : 0,
      constellations: constellations ? 1 : 0, gyroscopes: gyroscopes ? 1 : 0 });
    resources.current = current; group.add(current.group);
    return () => { if (resources.current === current) resources.current = null; current.dispose(); };
  }, [data, Boolean(session), group, auroras, constellations, gyroscopes]);
  useFrame(() => resources.current?.update(getMusicTime?.().time ?? 0, settings));
  return <primitive object={group} dispose={null} />;
}
