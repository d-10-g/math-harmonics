import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useXR } from '@react-three/xr';
import * as THREE from 'three';
import type { FlightEffectsSettings } from '../lib/flightEffects';
import type { PrismScoreData } from '../lib/prismTrail';
import { buildFlightLinks, fireworkDirection, fireworkRandom, fireworkWindow, FIREWORK_BUDGETS,
  FIREWORK_LIFETIMES, type FlightLinkData } from '../lib/flightFireworks';

const COLOR = /* glsl */ `
vec3 fireworkColor(float hue) {
  vec3 rgb = clamp(abs(fract(hue + vec3(0.0, 0.6666667, 0.3333333)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
  return mix(vec3(0.11), rgb, 0.89);
}
float effectLife(float age, float duration) {
  return smoothstep(0.0, 0.08, age) * pow(clamp(1.0 - age / duration, 0.0, 1.0), 1.5);
}
`;
const END_FRAGMENT = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;
const SPARK_VERTEX = /* glsl */ `
attribute vec3 aDirection;
attribute vec4 aMeta;
uniform float uTime;
uniform float uStrength;
uniform float uPixels;
varying float vAge;
varying float vHue;
varying float vEnergy;
void main() {
  float age = max(0.0, uTime - aMeta.x);
  vAge = uTime - aMeta.x;
  vHue = aMeta.z + aMeta.w * 0.065;
  vEnergy = aMeta.y;
  float speed = 1.8 + 3.4 * aMeta.y + aMeta.w;
  float travel = (1.0 - exp(-age * 0.9)) / 0.9;
  vec3 p = position + aDirection * speed * travel;
  p.y -= 0.25 * age * age;
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * view;
  float worldScale = length(modelViewMatrix[0].xyz);
  gl_PointSize = clamp(uPixels * worldScale * (0.065 + 0.035 * aMeta.y) * (0.6 + 0.35 * uStrength) / max(0.1, -view.z), 1.0, 9.0);
}
`;
const SPARK_FRAGMENT = /* glsl */ `
uniform float uStrength;
varying float vAge;
varying float vHue;
varying float vEnergy;
${COLOR}
void main() {
  if (vAge < 0.0 || vAge > 2.6) discard;
  vec2 p = gl_PointCoord - 0.5;
  float core = exp(-dot(p, p) * 27.0);
  float rays = exp(-abs(p.x) * 38.0 - abs(p.y) * 7.0) + exp(-abs(p.y) * 38.0 - abs(p.x) * 7.0);
  float alpha = (core + 0.32 * rays) * effectLife(vAge, 2.6) * uStrength * (0.32 + vEnergy * 0.22);
  if (alpha < 0.008) discard;
  gl_FragColor = vec4(fireworkColor(vHue) * 1.45, alpha);
  ${END_FRAGMENT}
}
`;
const RING_VERTEX = /* glsl */ `
attribute vec3 aCenter;
attribute vec3 aU;
attribute vec3 aV;
attribute vec4 aMeta;
uniform float uTime;
uniform float uStrength;
varying float vAge;
varying float vSide;
varying float vHue;
varying float vEnergy;
void main() {
  vAge = uTime - aMeta.x;
  vSide = position.y;
  vHue = aMeta.z;
  vEnergy = aMeta.y * aMeta.w;
  float age = max(0.0, vAge);
  float angle = position.x + age * 0.18;
  float radius = 0.2 + (1.0 - exp(-age * 1.5)) * (2.0 + 2.8 * aMeta.y);
  float width = 0.055 * (0.65 + 0.35 * uStrength) * (1.0 + age * 0.2);
  vec3 p = aCenter + (aU * cos(angle) + aV * sin(angle)) * (radius + position.y * width);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;
const RING_FRAGMENT = /* glsl */ `
uniform float uStrength;
varying float vAge;
varying float vSide;
varying float vHue;
varying float vEnergy;
${COLOR}
void main() {
  if (vAge < 0.0 || vAge > 2.4) discard;
  float alpha = pow(max(0.0, 1.0 - abs(vSide)), 1.5) * effectLife(vAge, 2.4) * uStrength * (0.22 + 0.18 * vEnergy);
  if (alpha < 0.005) discard;
  gl_FragColor = vec4(fireworkColor(vHue + vSide * 0.06) * 1.3, alpha);
  ${END_FRAGMENT}
}
`;
const BEAM_VERTEX = /* glsl */ `
attribute vec3 aStart;
attribute vec3 aEnd;
attribute vec4 aMeta;
uniform float uTime;
uniform float uStrength;
uniform float uTracer;
varying float vAge;
varying float vSide;
varying float vAlong;
varying float vHue;
varying float vEnergy;
varying float vSeed;
void main() {
  vAge = uTime - aMeta.x;
  vSide = position.y;
  vAlong = position.x;
  vHue = aMeta.z;
  vEnergy = aMeta.y;
  vSeed = aMeta.w;
  float age = max(vAge, 0.0);
  float t = position.x * clamp(age / 0.18, 0.0, 1.0);
  vec3 direction = normalize(aEnd - aStart);
  vec3 side = cross(direction, vec3(0.0, 1.0, 0.0));
  if (dot(side, side) < 0.001) side = cross(direction, vec3(0.0, 0.0, 1.0));
  side = normalize(side);
  float arc = sin(t * 3.14159265);
  vec3 p = mix(aStart, aEnd, t);
  p += uTracer * arc * (vec3(0.0, 0.75 + aMeta.w * 0.6, 0.0) + side * sin(t * 6.2831853 + aMeta.w * 6.0) * 0.4);
  float width = mix(0.045, 0.15, uTracer) * (0.7 + aMeta.y * 0.3) * (0.65 + uStrength * 0.35);
  // Width faces each eye independently. World-up ribbon widths become
  // edge-on for horizontal channel rows under the default desktop camera.
  vec3 viewTangent = mat3(modelViewMatrix) * direction;
  vec2 viewSide = vec2(-viewTangent.y, viewTangent.x);
  if (dot(viewSide, viewSide) < 0.00001) viewSide = vec2(1.0, 0.0);
  viewSide = normalize(viewSide);
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  float worldScale = length(modelViewMatrix[0].xyz);
  view.xy += viewSide * position.y * width * worldScale * (0.45 + 0.55 * sin(position.x * 3.14159265));
  gl_Position = projectionMatrix * view;
}
`;
const BEAM_FRAGMENT = /* glsl */ `
uniform float uStrength;
uniform float uTracer;
varying float vAge;
varying float vSide;
varying float vAlong;
varying float vHue;
varying float vEnergy;
varying float vSeed;
${COLOR}
void main() {
  float lifetime = mix(1.8, 11.0, uTracer);
  if (vAge < 0.0 || vAge > lifetime) discard;
  float edge = pow(max(0.0, 1.0 - abs(vSide)), 1.4);
  float head = exp(-pow((vAlong - fract(vAge * 0.18 + vSeed)) * 11.0, 2.0));
  float energy = mix(0.85, 0.32 + head * 0.85, uTracer);
  float alpha = edge * effectLife(vAge, lifetime) * energy * uStrength * (0.22 + vEnergy * 0.15);
  if (alpha < 0.005) discard;
  gl_FragColor = vec4(fireworkColor(vHue + vAlong * 0.055) * (1.2 + head * 0.3 * uTracer), alpha);
  ${END_FRAGMENT}
}
`;

type Uniforms = { uTime: { value: number }; uStrength: { value: number }; uPixels: { value: number }; uTracer: { value: number } };
type Batch = { object: THREE.Object3D; geometry: THREE.BufferGeometry; material: THREE.ShaderMaterial;
  uniforms: Uniforms; update: (time: number, strength: number, pixels: number) => void };

function material(vertexShader: string, fragmentShader: string, tracer = 0) {
  const uniforms: Uniforms = { uTime: { value: 0 }, uStrength: { value: 0 }, uPixels: { value: 800 }, uTracer: { value: tracer } };
  return { uniforms, material: new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }) };
}
function attribute(geometry: THREE.BufferGeometry, name: string, size: number, count: number, instanced = false) {
  const values = new Float32Array(size * count);
  const value = instanced ? new THREE.InstancedBufferAttribute(values, size) : new THREE.BufferAttribute(values, size);
  value.setUsage(THREE.DynamicDrawUsage); geometry.setAttribute(name, value);
  return values;
}
function updateAttributes(geometry: THREE.BufferGeometry, count: number) {
  for (const raw of Object.values(geometry.attributes)) {
    const attr = raw as THREE.BufferAttribute;
    if (attr.usage === THREE.DynamicDrawUsage) { attr.clearUpdateRanges(); attr.addUpdateRange(0, count * attr.itemSize); attr.needsUpdate = true; }
  }
}
function stripGeometry(segments: number, ring = false): THREE.InstancedBufferGeometry {
  const geometry = new THREE.InstancedBufferGeometry();
  const positions: number[] = [], indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const x = i / segments * (ring ? Math.PI * 2 : 1);
    positions.push(x, -1, 0, x, 1, 0);
    if (i < segments) { const k = i * 2; indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.instanceCount = 0;
  return geometry;
}

function makeSparks(data: PrismScoreData, capacity: number, particles: number): Batch {
  const geometry = new THREE.BufferGeometry();
  const position = attribute(geometry, 'position', 3, capacity * particles);
  const direction = attribute(geometry, 'aDirection', 3, capacity * particles);
  const meta = attribute(geometry, 'aMeta', 4, capacity * particles);
  const fx = material(SPARK_VERTEX, SPARK_FRAGMENT);
  const object = new THREE.Points(geometry, fx.material); object.frustumCulled = false;
  let lastStart = -1, lastEnd = -1;
  return { object, geometry, ...fx, update(time, strength, pixels) {
    object.visible = strength > 0;
    fx.uniforms.uTime.value = time; fx.uniforms.uStrength.value = strength; fx.uniforms.uPixels.value = pixels;
    const range = fireworkWindow(data.birth, time, FIREWORK_LIFETIMES.bursts, capacity);
    if (range.start === lastStart && range.end === lastEnd) return;
    let target = 0;
    for (let i = range.start; i < range.end; i++) {
      const m = i * 16, crowd = 1 / Math.sqrt(1 + data.crowd[i] * 0.2);
      for (let p = 0; p < particles; p++, target++) {
        position.set(data.matrices.subarray(m + 12, m + 15), target * 3);
        direction.set(fireworkDirection(i, p), target * 3);
        meta.set([data.birth[i], Math.min(1, data.velocity[i]) * crowd, data.hue[i], fireworkRandom(i, p, 777)], target * 4);
      }
    }
    geometry.setDrawRange(0, target); updateAttributes(geometry, target);
    lastStart = range.start; lastEnd = range.end;
  } };
}

function makeRings(data: PrismScoreData, capacity: number): Batch {
  const geometry = stripGeometry(56, true);
  const center = attribute(geometry, 'aCenter', 3, capacity, true);
  const u = attribute(geometry, 'aU', 3, capacity, true), v = attribute(geometry, 'aV', 3, capacity, true);
  const meta = attribute(geometry, 'aMeta', 4, capacity, true);
  const fx = material(RING_VERTEX, RING_FRAGMENT);
  const object = new THREE.Mesh(geometry, fx.material); object.frustumCulled = false;
  let lastStart = -1, lastEnd = -1;
  return { object, geometry, ...fx, update(time, strength) {
    object.visible = strength > 0; fx.uniforms.uTime.value = time; fx.uniforms.uStrength.value = strength;
    const range = fireworkWindow(data.birth, time, FIREWORK_LIFETIMES.shockwaves, capacity);
    if (range.start === lastStart && range.end === lastEnd) return;
    let target = 0;
    for (let i = range.start; i < range.end; i++, target++) {
      const m = i * 16, xs = Math.max(0.001, Math.hypot(data.matrices[m], data.matrices[m + 1], data.matrices[m + 2]));
      const ys = Math.max(0.001, Math.hypot(data.matrices[m + 4], data.matrices[m + 5], data.matrices[m + 6]));
      center.set(data.matrices.subarray(m + 12, m + 15), target * 3);
      u.set([data.matrices[m] / xs, data.matrices[m + 1] / xs, data.matrices[m + 2] / xs], target * 3);
      v.set([data.matrices[m + 4] / ys, data.matrices[m + 5] / ys, data.matrices[m + 6] / ys], target * 3);
      meta.set([data.birth[i], Math.min(1, data.velocity[i]), data.hue[i], 1 / Math.sqrt(1 + data.crowd[i] * 0.2)], target * 4);
    }
    geometry.instanceCount = target; updateAttributes(geometry, target);
    lastStart = range.start; lastEnd = range.end;
  } };
}

function makeBeams(data: PrismScoreData, links: FlightLinkData, capacity: number, tracer: boolean): Batch {
  const geometry = stripGeometry(tracer ? 24 : 1);
  const start = attribute(geometry, 'aStart', 3, capacity, true), end = attribute(geometry, 'aEnd', 3, capacity, true);
  const meta = attribute(geometry, 'aMeta', 4, capacity, true);
  const fx = material(BEAM_VERTEX, BEAM_FRAGMENT, tracer ? 1 : 0);
  const object = new THREE.Mesh(geometry, fx.material); object.frustumCulled = false;
  let lastStart = -1, lastEnd = -1;
  return { object, geometry, ...fx, update(time, strength) {
    object.visible = strength > 0; fx.uniforms.uTime.value = time; fx.uniforms.uStrength.value = strength;
    const range = fireworkWindow(links.birth, time, tracer ? FIREWORK_LIFETIMES.tracers : FIREWORK_LIFETIMES.lasers, capacity);
    if (range.start === lastStart && range.end === lastEnd) return;
    let target = 0;
    for (let i = range.start; i < range.end; i++, target++) {
      const from = links.from[i] * 16, note = links.to[i], to = note * 16;
      start.set(data.matrices.subarray(from + 12, from + 15), target * 3);
      end.set(data.matrices.subarray(to + 12, to + 15), target * 3);
      meta.set([links.birth[i], Math.min(1, data.velocity[note]) / Math.sqrt(1 + data.crowd[note] * 0.12), data.hue[note], fireworkRandom(note, 0, 811)], target * 4);
    }
    geometry.instanceCount = target; updateAttributes(geometry, target);
    lastStart = range.start; lastEnd = range.end;
  } };
}

export function createFlightFireworks(data: PrismScoreData, xr: boolean,
  enabled: Pick<FlightEffectsSettings, 'bursts' | 'shockwaves' | 'lasers' | 'tracers'>) {
  const budget = xr ? FIREWORK_BUDGETS.xr : FIREWORK_BUDGETS.desktop;
  const group = new THREE.Group(), batches = new Map<'bursts' | 'shockwaves' | 'lasers' | 'tracers', Batch>();
  if (enabled.bursts > 0) batches.set('bursts', makeSparks(data, budget.bursts, budget.particlesPerNote));
  if (enabled.shockwaves > 0) batches.set('shockwaves', makeRings(data, budget.shockwaves));
  const links = enabled.lasers > 0 || enabled.tracers > 0 ? buildFlightLinks(data) : null;
  if (enabled.lasers > 0 && links) batches.set('lasers', makeBeams(data, links, budget.lasers, false));
  if (enabled.tracers > 0 && links) batches.set('tracers', makeBeams(data, links, budget.tracers, true));
  batches.forEach(batch => group.add(batch.object));
  let disposed = false;
  return {
    group,
    update(time: number, settings: FlightEffectsSettings, pixels = 800) {
      if (disposed) return;
      const now = Number.isFinite(time) ? Math.max(0, time) : 0;
      batches.forEach((batch, key) => batch.update(now,
        Number.isFinite(settings[key]) ? THREE.MathUtils.clamp(settings[key], 0, 2) : 0, pixels));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      batches.forEach(batch => { batch.geometry.dispose(); batch.material.dispose(); });
      group.removeFromParent();
      group.clear();
    },
  };
}

export default function FlightFireworks({ data, getMusicTime, settings }: {
  data: PrismScoreData;
  getMusicTime?: () => { time: number; duration: number };
  settings: FlightEffectsSettings;
}) {
  const session = useXR(state => state.session);
  const group = useMemo(() => new THREE.Group(), []);
  const resources = useRef<ReturnType<typeof createFlightFireworks> | null>(null);
  const bursts = settings.bursts > 0, rings = settings.shockwaves > 0;
  const lasers = settings.lasers > 0, tracers = settings.tracers > 0;
  useEffect(() => {
    // Build in the effect so StrictMode setup/cleanup/setup creates fresh
    // buffers instead of retaining a disposed render-time memo.
    const current = createFlightFireworks(data, Boolean(session), {
      bursts: bursts ? 1 : 0, shockwaves: rings ? 1 : 0, lasers: lasers ? 1 : 0, tracers: tracers ? 1 : 0,
    });
    resources.current = current; group.add(current.group);
    return () => { if (resources.current === current) resources.current = null; current.dispose(); };
  }, [data, Boolean(session), group, bursts, rings, lasers, tracers]);
  useFrame(state => {
    const raw = getMusicTime?.().time ?? 0;
    resources.current?.update(raw, settings, state.size.height * state.gl.getPixelRatio());
  });
  return <primitive object={group} dispose={null} />;
}
