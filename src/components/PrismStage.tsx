import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MidiControlSampler, SustainMap, type ParsedMidi } from '../lib/midi';
import { clockStore } from '../lib/clock';
import type { PrismColorMode } from '../lib/urlState';

// Prism canvas: an invisible rectangular plane rides a slow, curving path
// through space. Every note is painted on it the instant it sounds — a
// dispersed prism spectrum (white beam entering, rainbow fanning out) whose
// size follows velocity, x follows pitch and row follows the instrument
// group — and then stays exactly where it was painted while the plane moves
// on. Held notes keep drawing, so they stretch into streaks reaching from
// their birth point to the plane. The viewer rides the plane: the world is
// moved by the inverse of the plane's pose, so new notes flare right in front
// of the eye and the history recedes behind as a bending tunnel of spectra.
//
// Everything is precomputed from the score into one InstancedMesh; per frame
// only the plane pose and a time uniform change, so 20k-note scores are fine.

const SPEED = 3.5; // plane units per second
const POSE_HZ = 20;
const GROUP_CAP = 8;
const ROW_GAP = 7;
const STAGE_SCALE = 1.15;
// The stage tilts so the trail recedes up and away instead of hiding
// straight behind the newest notes.
const STAGE_TILT = 0.3;
const SUSTAIN_HOLD_MAX = 1.2;

type PoseTable = { positions: Float32Array; quaternions: Float32Array; dt: number; count: number };

// Gentle, deterministic wander: the plane yaws and tilts on slow sines, so a
// seek lands on the same pose every time and the tunnel behind never repeats
// within a piece.
function buildPath(duration: number): PoseTable {
  const dt = 1 / POSE_HZ;
  const count = Math.max(2, Math.ceil(duration / dt) + 2);
  const positions = new Float32Array(count * 3);
  const quaternions = new Float32Array(count * 4);
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const forward = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const t = i * dt;
    const yaw = 0.55 * Math.sin(0.085 * t) + 0.25 * Math.sin(0.031 * t + 0.8);
    const tilt = 0.28 * Math.sin(0.061 * t + 1.7);
    quaternion.setFromEuler(euler.set(-tilt, yaw, 0, 'YXZ'));
    positions[i * 3] = position.x;
    positions[i * 3 + 1] = position.y;
    positions[i * 3 + 2] = position.z;
    quaternions[i * 4] = quaternion.x;
    quaternions[i * 4 + 1] = quaternion.y;
    quaternions[i * 4 + 2] = quaternion.z;
    quaternions[i * 4 + 3] = quaternion.w;
    forward.set(0, 0, 1).applyQuaternion(quaternion);
    position.addScaledVector(forward, SPEED * dt);
  }
  return { positions, quaternions, dt, count };
}

const QA = new THREE.Quaternion();
const QB = new THREE.Quaternion();
function samplePose(table: PoseTable, time: number, outPosition: THREE.Vector3, outQuaternion: THREE.Quaternion) {
  const f = Math.max(0, time) / table.dt;
  const i = Math.min(table.count - 2, Math.floor(f));
  const k = Math.min(1, Math.max(0, f - i));
  const p = table.positions;
  outPosition.set(
    p[i * 3] + (p[(i + 1) * 3] - p[i * 3]) * k,
    p[i * 3 + 1] + (p[(i + 1) * 3 + 1] - p[i * 3 + 1]) * k,
    p[i * 3 + 2] + (p[(i + 1) * 3 + 2] - p[i * 3 + 2]) * k
  );
  QA.fromArray(table.quaternions, i * 4);
  QB.fromArray(table.quaternions, (i + 1) * 4);
  outQuaternion.copy(QA).slerp(QB, k);
}

const VERTEX = /* glsl */ `
attribute float aBirth;
attribute float aDuration;
attribute float aVelocity;
attribute float aHue;
attribute float aCrowd;
uniform float uTime;
uniform float uFx;
varying vec3 vLocal;
varying float vAge;
varying float vVel;
varying float vDur;
varying float vHue;
varying float vCrowd;
void main() {
  float age = uTime - aBirth;
  vAge = age;
  vVel = aVelocity;
  vDur = aDuration;
  vHue = aHue;
  vCrowd = aCrowd;
  vLocal = position;
  float born = step(0.0, age);
  // Birth pop: the spectrum bursts open and settles within ~150 ms.
  float pop = 1.0 + 1.0 * aVelocity * uFx * exp(-max(age, 0.0) / 0.12);
  // Held notes keep drawing: the streak grows from its birth point (z = 0)
  // toward the plane, which has moved on by exactly SPEED * age.
  float held = clamp(age / max(aDuration, 0.02), 0.0, 1.0);
  vec3 p = vec3(position.xy * pop, position.z * held) * born;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform float uFx;
uniform float uSlice;
uniform float uSliceWidth;
varying vec3 vLocal;
varying float vAge;
varying float vVel;
varying float vDur;
varying float vHue;
varying float vCrowd;
// Seven-stop dispersion ramp: red -> orange -> yellow -> green -> cyan -> blue -> violet.
vec3 spectrum(float t) {
  t = clamp(t, 0.0, 1.0) * 6.0;
  vec3 c = mix(vec3(1.0, 0.05, 0.05), vec3(1.0, 0.45, 0.0), clamp(t, 0.0, 1.0));
  c = mix(c, vec3(1.0, 0.95, 0.0), clamp(t - 1.0, 0.0, 1.0));
  c = mix(c, vec3(0.1, 1.0, 0.15), clamp(t - 2.0, 0.0, 1.0));
  c = mix(c, vec3(0.0, 0.85, 1.0), clamp(t - 3.0, 0.0, 1.0));
  c = mix(c, vec3(0.1, 0.25, 1.0), clamp(t - 4.0, 0.0, 1.0));
  c = mix(c, vec3(0.6, 0.05, 1.0), clamp(t - 5.0, 0.0, 1.0));
  return c;
}
void main() {
  float x = vLocal.x + 0.5; // 0 = beam entry, 1 = wide end of the fan
  float y = vLocal.y + 0.5;
  // Prism fan: a narrow white beam enters on the left and disperses into a
  // widening rainbow, red at the bottom, violet at the top.
  float halfW = 0.5 * (0.3 + 0.7 * smoothstep(0.0, 0.5, x));
  float inside = smoothstep(halfW + 0.03, halfW - 0.06, abs(y - 0.5));
  float endFade = smoothstep(1.0, 0.84, x) * smoothstep(0.0, 0.05, x);
  float fanHue = clamp((y - 0.5) / max(halfW * 2.0, 0.001) + 0.5, 0.0, 1.0);
  // Slice mode: the note carries only a narrow band of the spectrum centred
  // on its own hue, so the fan reads as one colour with a little dispersion.
  float hue = mix(fanHue, clamp(vHue + (fanHue - 0.5) * uSliceWidth, 0.0, 1.0), uSlice);
  // Warm bias: real dispersion gives red and orange a broad band, so the
  // lower half of the fan runs red-orange-yellow and the upper half the cool end.
  vec3 col = spectrum(pow(hue, 1.35));
  float beam = exp(-pow((y - 0.5) * 9.0, 2.0)) * (1.0 - smoothstep(0.0, 0.25, x));
  // Time: white-hot flare at birth, full colour while the note sounds, then a
  // settled trail that dims with age but never disappears.
  float age = max(vAge, 0.0);
  float sounding = 1.0 - smoothstep(vDur, vDur + 0.35, age);
  // Crowding: dense chords and tremolos share the light, so stacked notes
  // never add up to a white blot while sparse passages keep their punch.
  float crowd = 1.0 / (1.0 + 0.3 * vCrowd);
  float flash = exp(-age / 0.16) * (1.0 + 2.0 * vVel) * uFx * crowd;
  float settle = mix(0.45, 1.0, sounding);
  float fade = mix(1.0, 0.55, smoothstep(15.0, 70.0, age));
  float brightness = (0.85 + 0.55 * vVel) * settle * fade * crowd;
  // The cap facing the plane is the painting; the streak body is a faint
  // ribbon so stacked sustained notes never bleach to white.
  float cap = step(0.999, vLocal.z);
  float body = mix(0.15, 1.0, cap);
  // Colour carries the energy; white stays confined to the entry beam so the
  // rainbow never bleaches out under tone mapping.
  vec3 rgb = min(col * (brightness * body + flash * 0.7) + vec3(1.0) * beam * (0.25 * sounding + 0.4 * flash), vec3(2.5));
  float alpha = inside * endFade * mix(0.22, 1.0, cap) * (0.6 + 0.4 * sounding) * mix(0.5, 1.0, crowd);
  gl_FragColor = vec4(rgb, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

type PrismData = {
  geometry: THREE.InstancedBufferGeometry | THREE.BufferGeometry;
  matrices: Float32Array;
  count: number;
  table: PoseTable;
  // Whole-stage scale so a ring of many channel canvases still fits the view.
  fit: number;
};

function buildPrism(midi: ParsedMidi, spread: number, perChannel: boolean, colorMode: PrismColorMode): PrismData | null {
  const notes = midi.notes;
  if (!notes.length) return null;
  const count = notes.length;
  const table = buildPath(midi.duration + 5);

  // Instrument groups ranked exactly as the constellation engine ranks them,
  // so rows here match its formula groups.
  const pairCounts = new Map<string, number>();
  for (const note of notes) {
    const key = `${note.track}:${note.channel}`;
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
  }
  const groupByPair = new Map<string, number>();
  [...pairCounts.entries()].sort((a, b) => b[1] - a[1]).forEach(([key], rank) => groupByPair.set(key, rank % GROUP_CAP));
  const groups = Math.min(GROUP_CAP, groupByPair.size);
  const rowGap = Math.min(ROW_GAP, 30 / Math.max(1, groups));
  // Per-channel canvases sit on a ring around the line of travel, each with
  // its own drift and wobble, so their trails weave as separate ribbons.
  const ringX = groups > 1 ? 5 + 1.6 * groups : 0;
  const ringY = groups > 1 ? 3 + groups : 0;
  // Crowding per note: neighbours in the same group within +-0.6 s.
  const groupTimes = new Map<number, number[]>();
  for (const note of notes) {
    const g = groupByPair.get(`${note.track}:${note.channel}`) ?? 0;
    let list = groupTimes.get(g);
    if (!list) groupTimes.set(g, (list = []));
    list.push(note.time);
  }
  const lowerBound = (list: number[], value: number) => {
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (list[mid] < value) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  let minPitch = 127;
  let maxPitch = 0;
  for (const note of notes) {
    if (note.pitch < minPitch) minPitch = note.pitch;
    if (note.pitch > maxPitch) maxPitch = note.pitch;
  }
  const span = Math.max(1, maxPitch - minPitch);
  const width = Math.min(44, 5.2 * spread);
  const sampler = new MidiControlSampler(midi.controls ?? []);
  const sustain = new SustainMap(midi.controls ?? []);

  // Local z runs 0..1 from the birth point toward the plane.
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.translate(0, 0, 0.5);
  const matrices = new Float32Array(count * 16);
  const birth = new Float32Array(count);
  const duration = new Float32Array(count);
  const velocity = new Float32Array(count);
  const hue = new Float32Array(count);
  const crowd = new Float32Array(count);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const local = new THREE.Vector3();
  const channelQuaternion = new THREE.Quaternion();
  const channelEuler = new THREE.Euler();
  const combined = new THREE.Quaternion();
  notes.forEach((note, i) => {
    const controls = sampler.at(note.time)[note.channel];
    const group = groupByPair.get(`${note.track}:${note.channel}`) ?? 0;
    const pitch01 = (note.pitch - minPitch) / span;
    const v = Math.min(1, note.velocity / 96);
    const held = Math.max(0.05, sustain.holdUntil(note.channel, note.time + note.duration, SUSTAIN_HOLD_MAX) - note.time);
    samplePose(table, note.time, position, quaternion);
    // Pitch across, instrument row up, a little pitch-class stagger so
    // chords don't stack; pitch bend and pan at the moment of birth slide it.
    const t = note.time;
    const phase = group * 1.9;
    let offsetX = 0;
    let offsetY = (group - (groups - 1) / 2) * rowGap;
    if (perChannel) {
      const angle = (group / Math.max(1, groups)) * Math.PI * 2 + Math.PI / 2;
      offsetX = Math.cos(angle) * ringX + 4 * Math.sin(0.05 * t + phase);
      offsetY = Math.sin(angle) * ringY + 2.5 * Math.sin(0.043 * t + phase + 2);
      channelQuaternion.setFromEuler(channelEuler.set(-0.25 * Math.sin(0.045 * t + phase + 1), 0.4 * Math.sin(0.06 * t + phase), 0, 'YXZ'));
    } else {
      channelQuaternion.identity();
    }
    local.set(
      (pitch01 - 0.5) * width + controls.bend * 3 + controls.pan * 1.2,
      ((note.pitch % 12) / 11 - 0.5) * 5.5,
      0
    );
    local.applyQuaternion(channelQuaternion);
    local.x += offsetX;
    local.y += offsetY;
    local.applyQuaternion(quaternion).add(position);
    combined.copy(quaternion).multiply(channelQuaternion);
    const w = 2.0 + 1.8 * v;
    scale.set(w, w * 0.7, Math.max(0.3, held * SPEED));
    matrix.compose(local, combined, scale);
    // Slice centre by note value: pitch across the piece's range, pitch class
    // around the twelve semitones, or note length on a log scale (80 ms .. 4 s).
    hue[i] = colorMode === 'pitch' ? pitch01
      : colorMode === 'chroma' ? (note.pitch % 12) / 12 + 1 / 24
      : colorMode === 'length' ? Math.min(1, Math.max(0, Math.log2(Math.max(0.05, held) / 0.08) / Math.log2(50)))
      : 0.5;
    matrix.toArray(matrices, i * 16);
    birth[i] = note.time;
    duration[i] = held;
    velocity[i] = v;
    const times = groupTimes.get(group) ?? [];
    crowd[i] = Math.max(0, lowerBound(times, t + 0.6) - lowerBound(times, t - 0.6) - 1);
  });
  geometry.setAttribute('aBirth', new THREE.InstancedBufferAttribute(birth, 1));
  geometry.setAttribute('aDuration', new THREE.InstancedBufferAttribute(duration, 1));
  geometry.setAttribute('aVelocity', new THREE.InstancedBufferAttribute(velocity, 1));
  geometry.setAttribute('aHue', new THREE.InstancedBufferAttribute(hue, 1));
  geometry.setAttribute('aCrowd', new THREE.InstancedBufferAttribute(crowd, 1));
  return { geometry, matrices, count, table, fit: perChannel ? Math.min(1, 4.5 / (groups + 0.5)) : 1 };
}

const PLANE_POSITION = new THREE.Vector3();
const PLANE_QUATERNION = new THREE.Quaternion();

export default function PrismStage({
  midi,
  getMusicTime,
  noteSpread,
  colorMode = 'full',
  sliceWidth = 0.14,
  perChannel = false
}: {
  midi: ParsedMidi | null;
  getMusicTime?: () => { time: number; duration: number };
  noteSpread: number;
  colorMode?: PrismColorMode;
  sliceWidth?: number;
  perChannel?: boolean;
}) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uFx: { value: 1 }, uSlice: { value: 0 }, uSliceWidth: { value: 0.14 } },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.FrontSide,
        toneMapped: true
      }),
    []
  );
  useEffect(() => () => material.dispose(), [material]);

  const data = useMemo(() => (midi ? buildPrism(midi, noteSpread, perChannel, colorMode) : null), [midi, noteSpread, perChannel, colorMode]);
  useEffect(() => () => data?.geometry.dispose(), [data]);

  const mesh = useMemo(() => {
    if (!data) return null;
    const instanced = new THREE.InstancedMesh(data.geometry, material, data.count);
    (instanced.instanceMatrix.array as Float32Array).set(data.matrices);
    instanced.instanceMatrix.needsUpdate = true;
    instanced.frustumCulled = false;
    return instanced;
  }, [data, material]);

  const trailRef = useRef<THREE.Group>(null);

  useFrame(() => {
    const trail = trailRef.current;
    if (!trail || !data) return;
    const time = getMusicTime?.().time ?? 0;
    // Ride the plane: the whole history is moved by the inverse of its pose.
    samplePose(data.table, time, PLANE_POSITION, PLANE_QUATERNION);
    trail.quaternion.copy(PLANE_QUATERNION).invert();
    trail.position.copy(PLANE_POSITION).negate().applyQuaternion(trail.quaternion);
    material.uniforms.uTime.value = time;
    material.uniforms.uSlice.value = colorMode === 'full' ? 0 : 1;
    material.uniforms.uSliceWidth.value = sliceWidth;
    const clock = clockStore.getState();
    material.uniforms.uFx.value = clock.noteFxMode === 'off' ? 0 : Math.min(3, clock.noteFxAmount) / 2;
  });

  if (!mesh) return null;
  return (
    <group rotation={[STAGE_TILT, 0, 0]} scale={STAGE_SCALE * data.fit}>
      <group ref={trailRef}>
        <primitive object={mesh} />
      </group>
    </group>
  );
}
