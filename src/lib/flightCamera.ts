import * as THREE from 'three';
import { prismLowerBound, type PrismScoreData } from './prismTrail';
import type { FlightEffectsSettings } from './flightEffects';
import { createFlightMotionSample, sampleFlightMotion } from './flightMotion';
import type { FlightCameraStyle } from './flightCameraStyles';

export const FLIGHT_CAMERA_NOTES_PER_CHANNEL = 24;
export const FLIGHT_CAMERA_MEMORY = 6;
export const FLIGHT_CAMERA_MANUAL_GRACE = 3;
export const FLIGHT_CAMERA_SETTLE_SECONDS = 12;

export type FlightFocus = { center: THREE.Vector3; radius: number; notes: number; channels: number; energy: number };
export const createFlightFocus = (): FlightFocus => ({ center: new THREE.Vector3(), radius: 3.5, notes: 0, channels: 0, energy: 0 });

/** Index once; each frame visits at most 24 notes per MIDI channel. A busy
 * accompaniment gets the same framing vote as the solo instrument. */
export function createFlightFocusIndex(data: PrismScoreData) {
  const grouped = new Map<number, number[]>();
  for (let i = 0; i < data.count; i++) {
    const channel = data.channels[i];
    if (!grouped.has(channel)) grouped.set(channel, []);
    grouped.get(channel)!.push(i);
  }
  const channels = [...grouped].sort(([a], [b]) => a - b).map(([, notes]) => ({
    notes, birth: Float32Array.from(notes, i => data.birth[i]),
  }));
  return { channels, point: new THREE.Vector3(), motion: createFlightMotionSample(),
    samples: new Float64Array(channels.length * FLIGHT_CAMERA_NOTES_PER_CHANNEL * 4),
    sums: new Float64Array(channels.length * 4) };
}

export function sampleFlightFocus(data: PrismScoreData, index: ReturnType<typeof createFlightFocusIndex>,
  time: number, effects: FlightEffectsSettings | undefined, out: FlightFocus): FlightFocus {
  out.center.set(0, 0, 0); out.radius = 3.5; out.notes = 0; out.channels = 0; out.energy = 0;
  const now = Number.isFinite(time) ? Math.max(0, time) : 0;
  index.sums.fill(0);
  for (let c = 0; c < index.channels.length; c++) {
    const channel = index.channels[c], end = prismLowerBound(channel.birth, now, true);
    const begin = Math.max(0, end - FLIGHT_CAMERA_NOTES_PER_CHANNEL);
    const base = c * 4;
    let channelEnergy = 0;
    for (let k = begin; k < end; k++) {
      const note = channel.notes[k], age = now - data.birth[note];
      const held = age <= data.duration[note];
      if (!held && age > FLIGHT_CAMERA_MEMORY) continue;
      const weight = (0.2 + 0.8 * data.velocity[note]) * (held ? 1.7 : Math.exp(-age / 1.4));
      // A soft score-time attack/release is reproducible when seeking and
      // does not let a dense accompaniment dictate the camera's energy.
      const attack = 1 - Math.exp(-age * 12);
      channelEnergy = Math.max(channelEnergy, THREE.MathUtils.clamp(data.velocity[note], 0, 1) * attack
        * (0.85 * Math.exp(-age / 0.95) + (held ? 0.15 : 0)));
      const m = note * 16;
      sampleFlightMotion(data.birth[note], data.hue[note], now, effects, index.motion);
      index.point.copy(index.motion.offset);
      // Imported rigs use a proportional root; static meshes may have a
      // longer held-note Z axis. The proportional approximation plus the
      // framing margin avoids chasing an extreme ribbon endpoint.
      const size = Math.hypot(data.matrices[m], data.matrices[m + 1], data.matrices[m + 2]);
      const p = index.point, x = p.x, y = p.y, z = p.z;
      const ys = Math.max(0.001, Math.hypot(data.matrices[m + 4], data.matrices[m + 5], data.matrices[m + 6]));
      const zs = Math.max(0.001, Math.hypot(data.matrices[m + 8], data.matrices[m + 9], data.matrices[m + 10]));
      p.set(data.matrices[m + 12] + data.matrices[m] * x + data.matrices[m + 4] / ys * size * y + data.matrices[m + 8] / zs * size * z,
        data.matrices[m + 13] + data.matrices[m + 1] * x + data.matrices[m + 5] / ys * size * y + data.matrices[m + 9] / zs * size * z,
        data.matrices[m + 14] + data.matrices[m + 2] * x + data.matrices[m + 6] / ys * size * y + data.matrices[m + 10] / zs * size * z);
      const offset = out.notes++ * 4;
      index.samples[offset] = p.x; index.samples[offset + 1] = p.y;
      index.samples[offset + 2] = p.z; index.samples[offset + 3] = c;
      index.sums[base] += p.x * weight; index.sums[base + 1] += p.y * weight;
      index.sums[base + 2] += p.z * weight; index.sums[base + 3] += weight;
    }
    const weight = index.sums[base + 3];
    if (weight > 0) {
      index.sums[base] /= weight; index.sums[base + 1] /= weight; index.sums[base + 2] /= weight;
      out.center.x += index.sums[base]; out.center.y += index.sums[base + 1]; out.center.z += index.sums[base + 2];
      out.channels++;
      out.energy += channelEnergy;
    }
  }
  if (!out.channels) return out;
  out.center.divideScalar(out.channels);
  out.energy /= out.channels;
  // Cover the recent action, including chords within one instrument. The
  // additional margin leaves room for model size, motion and nearby FX.
  let radius = 0;
  for (let c = 0; c < index.channels.length; c++) {
    const base = c * 4;
    if (index.sums[base + 3] <= 0) continue;
    radius = Math.max(radius, Math.hypot(index.sums[base] - out.center.x,
      index.sums[base + 1] - out.center.y, index.sums[base + 2] - out.center.z));
  }
  for (let i = 0; i < out.notes; i++) {
    const at = i * 4;
    radius = Math.max(radius, Math.hypot(index.samples[at] - out.center.x,
      index.samples[at + 1] - out.center.y, index.samples[at + 2] - out.center.z));
  }
  out.radius = Math.min(38, radius + 4.5);
  return out;
}

/** Sphere fit includes the narrower horizontal field on portrait windows. */
export function flightFitDistance(radius: number, verticalFov: number, aspect: number) {
  const r = Number.isFinite(radius) ? Math.max(1, radius) : 4.5;
  const vertical = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(verticalFov || 50, 20, 100)) / 2;
  const horizontal = Math.atan(Math.tan(vertical) * Math.max(0.25, Number.isFinite(aspect) ? aspect : 1));
  return THREE.MathUtils.clamp(r * 1.14 / Math.sin(Math.min(vertical, horizontal)), 14, 64);
}

export const createFlightFitWorkspace = () => ({
  right: new THREE.Vector3(), up: new THREE.Vector3(), back: new THREE.Vector3(), point: new THREE.Vector3(),
});

/** Fit the actual shot rather than treating a horizontal ensemble as a
 * vertically tall sphere. Z is measured toward the camera, so nearer points
 * receive more clearance. This also works after a manual orbit. */
export function projectedFlightFitDistance(samples: Float64Array, count: number, pointToWorld: THREE.Matrix4,
  center: THREE.Vector3, direction: THREE.Vector3, verticalFov: number, aspect: number, padding: number,
  work: ReturnType<typeof createFlightFitWorkspace>) {
  const fov = Number.isFinite(verticalFov) ? THREE.MathUtils.clamp(verticalFov, 20, 100) : 50;
  const tanV = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
  const tanH = tanV * Math.max(0.25, Number.isFinite(aspect) ? aspect : 1);
  work.back.copy(direction);
  if (work.back.lengthSq() < 0.00001) work.back.set(0, 0, 1);
  work.back.normalize();
  work.right.set(0, 1, 0).cross(work.back);
  if (work.right.lengthSq() < 0.00001) work.right.set(1, 0, 0);
  work.right.normalize(); work.up.crossVectors(work.back, work.right).normalize();
  let distance = 10;
  const margin = Number.isFinite(padding) ? Math.max(0, padding) : 3;
  const limit = Math.min(Math.max(0, count), samples.length / 4);
  for (let i = 0; i < limit; i++) {
    const at = i * 4;
    work.point.set(samples[at], samples[at + 1], samples[at + 2]).applyMatrix4(pointToWorld).sub(center);
    const x = Math.abs(work.point.dot(work.right)), y = Math.abs(work.point.dot(work.up)), z = work.point.dot(work.back);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    distance = Math.max(distance, z + (x + margin) / tanH, z + (y + margin) / tanV);
  }
  return THREE.MathUtils.clamp(distance * 1.08 + margin * 0.4, 12, 66);
}

/** Exponential damping is frame-rate independent, with an explicit speed
 * limit so a seek or a new phrase cannot whip the view across the score. */
export function dampFlightVector(current: THREE.Vector3, target: THREE.Vector3, dt: number, rate: number, speed: number) {
  const step = Math.max(0, Math.min(0.1, Number.isFinite(dt) ? dt : 0));
  const distance = current.distanceTo(target);
  if (distance <= 1e-9 || step <= 0) return current;
  current.lerp(target, Math.min(1 - Math.exp(-Math.max(0, rate) * step), Math.max(0, speed) * step / distance));
  return current;
}

export type FlightCameraGate = { dragging: boolean; until: number };
export const createFlightCameraGate = (): FlightCameraGate => ({ dragging: false, until: -Infinity });
export function beginFlightCameraGesture(gate: FlightCameraGate, now: number) { gate.dragging = true; gate.until = now + FLIGHT_CAMERA_MANUAL_GRACE; }
export function endFlightCameraGesture(gate: FlightCameraGate, now: number) { gate.dragging = false; gate.until = now + FLIGHT_CAMERA_MANUAL_GRACE; }
export const flightCameraMayMove = (gate: FlightCameraGate, now: number) => !gate.dragging && now >= gate.until;

export function flightCameraTimeline(lastTime: number, settling: number, rawTime: number, rawDelta: number) {
  const time = Number.isFinite(rawTime) ? Math.max(0, rawTime) : 0;
  const delta = Math.max(0, Math.min(0.05, Number.isFinite(rawDelta) ? rawDelta : 0));
  const moved = !Number.isFinite(lastTime) || Math.abs(time - lastTime) > 1e-6;
  const jump = Number.isFinite(lastTime) && (time < lastTime || time - lastTime > 0.5);
  const remaining = jump ? FLIGHT_CAMERA_SETTLE_SECONDS : Math.max(0, settling);
  return { time, delta, moved, jump, active: moved || remaining > 0, settling: Math.max(0, remaining - delta) };
}

export type FlightCameraShot = { direction: THREE.Vector3; distance: number; lead: number };
export const createFlightCameraShot = (): FlightCameraShot => ({ direction: new THREE.Vector3(0, 0, 1), distance: 1, lead: 0 });

/** Absolute score-time choreography. Response changes musical accents,
 * while zero response retains the chosen camera style's deliberate travel. */
export function sampleFlightCameraShot(style: FlightCameraStyle, time: number, energy: number, response: number,
  heading: THREE.Vector3, out: FlightCameraShot): FlightCameraShot {
  const t = Number.isFinite(time) ? Math.max(0, time) : 0;
  const music = THREE.MathUtils.clamp(Number.isFinite(energy) ? energy : 0, 0, 1)
    * THREE.MathUtils.clamp(Number.isFinite(response) ? response : 1, 0, 2);
  out.direction.set(0, 0, 1); out.distance = 1; out.lead = 0;
  if (style === 'balanced') return out;
  if (style === 'chase') {
    out.direction.copy(heading).negate();
    if (out.direction.lengthSq() < 0.00001 || !Number.isFinite(out.direction.x)
      || !Number.isFinite(out.direction.y) || !Number.isFinite(out.direction.z)) out.direction.set(0, 0, -1);
    out.direction.normalize();
    const yaw = 0.1 * Math.sin(t * 0.11) * (1 + music * 0.4);
    const x = out.direction.x, z = out.direction.z;
    out.direction.x = x * Math.cos(yaw) + z * Math.sin(yaw);
    out.direction.z = -x * Math.sin(yaw) + z * Math.cos(yaw);
    out.direction.y += 0.12 + Math.sin(t * 0.07) * 0.035;
    out.direction.normalize(); out.distance = 0.96 - music * 0.055;
    out.lead = 1.1 + music * 0.45;
    return out;
  }
  const orbit = style === 'orbit';
  const yaw = orbit ? t * 0.055 + Math.sin(t * 0.09) * 0.08 * music
    : Math.sin(t * 0.035) * 0.85 + Math.sin(t * 0.011 + 1.1) * 0.3;
  const pitch = orbit ? Math.sin(t * 0.037) * 0.17 + Math.sin(t * 0.08) * 0.035 * music
    : 0.13 + Math.sin(t * 0.043 - 0.8) * 0.18;
  out.direction.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  out.distance = orbit ? 1.05 + Math.sin(t * 0.055) * 0.055 - music * 0.04
    : 1.12 + Math.sin(t * 0.024 + 0.6) * 0.16 - music * 0.065;
  out.lead = orbit ? 0.25 * music : 0.45 + Math.sin(t * 0.07) * 0.4 + music * 0.3;
  return out;
}

export const createFlightDirectionWorkspace = () => ({ rotation: new THREE.Quaternion(), partial: new THREE.Quaternion() });

/** Great-circle easing keeps a Chase transition from cutting through the
 * action, even when its trailing view is opposite the current camera. */
export function dampFlightDirection(current: THREE.Vector3, target: THREE.Vector3, dt: number,
  work: ReturnType<typeof createFlightDirectionWorkspace>) {
  const step = Math.max(0, Math.min(0.05, Number.isFinite(dt) ? dt : 0));
  const angle = current.angleTo(target);
  if (step <= 0 || angle <= 1e-8) return current;
  work.rotation.setFromUnitVectors(current, target);
  work.partial.identity().slerp(work.rotation, Math.min(1 - Math.exp(-step * 1.4), step * 0.3 / angle));
  return current.applyQuaternion(work.partial).normalize();
}
