import * as THREE from 'three';
import { MidiControlSampler, SustainMap, type ParsedMidi } from './midi';

export type PrismShape = 'spectrum' | 'sphere' | 'crystal' | 'torus' | 'knot' | 'mesh' | 'glb' | 'mixed';
export type PrismFinish = 'spectrum' | 'ornament' | 'glass';
export const PRISM_SHAPES: readonly PrismShape[] = ['spectrum', 'sphere', 'crystal', 'torus', 'knot', 'mesh', 'glb', 'mixed'];
export const PRISM_FINISHES: readonly PrismFinish[] = ['spectrum', 'ornament', 'glass'];
export const PRISM_SPEED = 3.5;
const Z = new THREE.Vector3(0, 0, 1);

export type PrismPoseTable = { positions: Float32Array; quaternions: Float32Array; dt: number; count: number };

// Cap table memory even for very long scores; normal pieces retain 20 Hz poses.
export function buildPrismPath(duration: number, guide?: PrismPoseTable, channel = 0, channels = 1, spread = 1): PrismPoseTable {
  const seconds = Math.max(0, Number.isFinite(duration) ? duration : 0);
  const dt = guide?.dt ?? Math.max(1 / 20, seconds / 40000);
  const count = guide?.count ?? Math.max(2, Math.ceil(seconds / dt) + 2);
  const positions = new Float32Array(count * 3);
  const quaternions = new Float32Array(count * 4);
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const forward = new THREE.Vector3();
  const basePosition = new THREE.Vector3();
  const baseQuaternion = new THREE.Quaternion();
  const target = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const phase = channel * 2.399963229728653;
  const angle = channel / Math.max(1, channels) * Math.PI * 2 + Math.PI / 2;
  const radius = channels > 1 ? 5 + Math.min(16, channels) * 0.8 : 0;
  const strength = THREE.MathUtils.clamp(Number.isFinite(spread) ? spread : 1, 0, 2);
  for (let i = 0; i < count; i++) {
    const t = i * dt;
    if (guide) {
      basePosition.fromArray(guide.positions, i * 3);
      baseQuaternion.fromArray(guide.quaternions, i * 4);
      target.set(Math.cos(angle) * radius + strength * 3 * Math.sin(t * 0.11 + phase),
        Math.sin(angle) * radius * 0.65 + strength * 2 * Math.sin(t * 0.09 + phase + 1), 0)
        .applyQuaternion(baseQuaternion).add(basePosition);
      if (i === 0) position.copy(target);
      quaternion.setFromEuler(euler.set(strength * 0.3 * Math.sin(t * 0.13 + phase),
        strength * 0.45 * Math.sin(t * 0.1 + phase + 0.7), 0, 'YXZ'));
      forward.copy(Z).applyQuaternion(quaternion).applyQuaternion(baseQuaternion);
      // Each plane integrates its own steering velocity. A gentle guide
      // attraction keeps independently weaving paths inside the stage.
      velocity.copy(forward).multiplyScalar(PRISM_SPEED).addScaledVector(target.sub(position), 0.16);
      quaternion.setFromUnitVectors(Z, forward.copy(velocity).normalize());
    } else {
      quaternion.setFromEuler(euler.set(-0.28 * Math.sin(0.061 * t + 1.7),
        0.55 * Math.sin(0.085 * t) + 0.25 * Math.sin(0.031 * t + 0.8), 0, 'YXZ'));
      velocity.copy(Z).applyQuaternion(quaternion).multiplyScalar(PRISM_SPEED);
    }
    position.toArray(positions, i * 3);
    quaternion.toArray(quaternions, i * 4);
    position.addScaledVector(velocity, dt);
  }
  return { positions, quaternions, dt, count };
}

export function samplePrismPose(table: PrismPoseTable, time: number, outPosition: THREE.Vector3, outQuaternion: THREE.Quaternion) {
  const f = Math.max(0, Number.isFinite(time) ? time : 0) / table.dt;
  const i = Math.min(table.count - 2, Math.floor(f));
  const k = Math.min(1, Math.max(0, f - i));
  const p = table.positions;
  outPosition.set(p[i * 3] + (p[(i + 1) * 3] - p[i * 3]) * k,
    p[i * 3 + 1] + (p[(i + 1) * 3 + 1] - p[i * 3 + 1]) * k,
    p[i * 3 + 2] + (p[(i + 1) * 3 + 2] - p[i * 3 + 2]) * k);
  outQuaternion.fromArray(table.quaternions, i * 4).slerp(_sampleQuaternion.fromArray(table.quaternions, (i + 1) * 4), k);
}
const _sampleQuaternion = new THREE.Quaternion();

export function prismLowerBound(list: ArrayLike<number>, value: number, inclusive = false) {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (list[mid] < value || (inclusive && list[mid] === value)) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export type PrismScoreData = {
  matrices: Float32Array; birth: Float32Array; duration: Float32Array;
  velocity: Float32Array; hue: Float32Array; crowd: Float32Array;
  channels: Uint8Array; pitches: Uint8Array;
  count: number; table: PrismPoseTable; fit: number;
};

export function buildPrismScore(midi: ParsedMidi, spread: number, perChannel: boolean,
  colorMode: 'full' | 'pitch' | 'chroma' | 'length', pathSpread = 1, shape: PrismShape = 'spectrum'): PrismScoreData | null {
  // Parser output is normally sorted; explicit sorting also makes supplied
  // MIDI and crowding lookup correct when tracks arrive out of time order.
  const notes = [...midi.notes].filter(n => Number.isFinite(n.time) && n.time >= 0 && Number.isFinite(n.duration) && Number.isFinite(n.pitch))
    .sort((a, b) => a.time - b.time);
  if (!notes.length) return null;
  const count = notes.length;
  const table = buildPrismPath(Math.max(midi.duration || 0, notes[count - 1].time + notes[count - 1].duration) + 5);
  const channels = [...new Set(notes.map(n => n.channel))].sort((a, b) => a - b);
  const channelIndex = new Map(channels.map((channel, i) => [channel, i]));
  const paths = perChannel ? channels.map((_, i) => buildPrismPath(0, table, i, channels.length, pathSpread)) : [table];
  const times = channels.map(channel => notes.filter(n => n.channel === channel).map(n => n.time));
  let minPitch = 127, maxPitch = 0;
  for (const n of notes) { minPitch = Math.min(minPitch, n.pitch); maxPitch = Math.max(maxPitch, n.pitch); }
  const span = Math.max(1, maxPitch - minPitch);
  const width = Math.min(44, 5.2 * THREE.MathUtils.clamp(spread, 0.5, 10)) * (perChannel ? 0.65 : 1);
  const sampler = new MidiControlSampler(midi.controls ?? []);
  const sustain = new SustainMap(midi.controls ?? []);
  const matrices = new Float32Array(count * 16);
  const birth = new Float32Array(count), duration = new Float32Array(count), velocity = new Float32Array(count);
  const hue = new Float32Array(count), crowd = new Float32Array(count);
  const noteChannels = new Uint8Array(count), pitches = new Uint8Array(count);
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(), local = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const note = notes[i], group = channelIndex.get(note.channel) ?? 0;
    const controls = sampler.at(note.time)[note.channel];
    const pitch = (note.pitch - minPitch) / span;
    const v = Math.min(1, Math.max(0, note.velocity / 96)) * Math.min(1.25, controls.dynamics);
    const held = Math.max(0.05, sustain.holdUntil(note.channel, note.time + note.duration, 1.2) - note.time);
    samplePrismPose(paths[perChannel ? group : 0], note.time, position, quaternion);
    local.set((pitch - 0.5) * width + controls.bend * 3 + controls.pan * 1.2,
      ((note.pitch % 12) / 11 - 0.5) * 5.5 + (perChannel ? 0 : (group - (channels.length - 1) / 2) * Math.min(7, 30 / channels.length)), 0)
      .applyQuaternion(quaternion).add(position);
    const w = shape === 'spectrum' ? 2 + 1.8 * v : 1.1 + 1.3 * v;
    scale.set(w, w * (shape === 'spectrum' ? 0.7 : 1), Math.max(w * 0.65, held * PRISM_SPEED));
    matrix.compose(local, quaternion, scale).toArray(matrices, i * 16);
    hue[i] = colorMode === 'pitch' ? pitch : colorMode === 'chroma' ? (note.pitch % 12) / 12 + 1 / 24
      : colorMode === 'length' ? THREE.MathUtils.clamp(Math.log2(held / 0.08) / Math.log2(50), 0, 1) : group / Math.max(1, channels.length);
    birth[i] = note.time; duration[i] = held; velocity[i] = v;
    noteChannels[i] = note.channel; pitches[i] = note.pitch;
    crowd[i] = Math.max(0, prismLowerBound(times[group], note.time + 0.6) - prismLowerBound(times[group], note.time - 0.6) - 1);
  }
  return { matrices, birth, duration, velocity, hue, crowd, channels: noteChannels, pitches, count, table,
    fit: perChannel ? Math.min(1, 6 / (Math.sqrt(channels.length) + 4)) : 1 };
}

export function prismInstanceBudget(vertices: number) {
  // Bound vertex work for detailed library sculptures without decimating
  // owner-provided geometry. Older notes leave first when the budget fills.
  return Math.max(8, Math.min(30000, Math.floor(4_000_000 / Math.max(1, vertices))));
}

export function prismVisibleRange(birth: ArrayLike<number>, time: number, length: number, capacity: number) {
  const end = prismLowerBound(birth, time, true);
  const start = Math.max(length > 0 ? prismLowerBound(birth, time - length) : 0, end - capacity);
  return { start, end };
}
