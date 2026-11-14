import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { erniePose } from './ernie';
import { createCatPoseLayer } from './catPose';
import { createPhysicalMaterial } from './materials';
import { prismLowerBound, type PrismScoreData } from './prismTrail';
import type { WebGPUMaterialProfile } from '../constants';
import type { FlightEffectsSettings } from './flightEffects';
import { createFlightMotionSample, sampleFlightMotion } from './flightMotion';
import { FLIGHT_CAST_GLSL, flightObjectFit, makeFlightCastUniforms, setFlightCastTransition, type FlightCastRole } from './flightActor';

export const GLB_FLIGHT_LIMIT = 48;
export const GLB_FLIGHT_XR_LIMIT = 24;
export type GlbFlightMaterial = 'original' | Exclude<WebGPUMaterialProfile, 'auto'>;
export type GlbFlightChannelIndex = { channel: number; notes: number[]; prefixEnd: number[] };

export function indexGlbFlightChannels(data: PrismScoreData): GlbFlightChannelIndex[] {
  const channels = new Map<number, GlbFlightChannelIndex>();
  for (let i = 0; i < data.count; i++) {
    const channel = data.channels[i];
    let group = channels.get(channel);
    if (!group) channels.set(channel, group = { channel, notes: [], prefixEnd: [] });
    group.notes.push(i);
    group.prefixEnd.push(Math.max(group.prefixEnd.at(-1) ?? 0, data.birth[i] + data.duration[i]));
  }
  return [...channels.values()].sort((a, b) => a.channel - b.channel);
}

// Give each sounding channel a turn before filling its remaining history.
// Dense accompaniment cannot evict every note from a quieter instrument.
export function selectGlbFlightNotes(data: PrismScoreData, groups: GlbFlightChannelIndex[], time: number, length: number, limit: number): number[] {
  const now = Number.isFinite(time) ? Math.max(0, time) : 0;
  const cutoff = length > 0 ? now - length : -Infinity;
  const queues = groups.map(group => {
    const lower = (value: number, inclusive = false) => {
      let lo = 0, hi = group.notes.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        const birth = data.birth[group.notes[mid]];
        if (birth < value || (inclusive && birth === value)) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    };
    const start = lower(cutoff), end = lower(now, true);
    const queue: number[] = [], active = new Set<number>();
    for (let i = end - 1; i >= start && group.prefixEnd[i] > now; i--) {
      const note = group.notes[i];
      if (data.birth[note] + data.duration[note] > now) { queue.push(note); active.add(note); }
      if (queue.length >= limit) break;
    }
    for (let i = end - 1; i >= start && queue.length < limit; i--) {
      if (!active.has(group.notes[i])) queue.push(group.notes[i]);
    }
    return queue;
  });
  const selected: number[] = [];
  for (let round = 0; selected.length < limit; round++) {
    let added = false;
    for (const queue of queues) {
      if (queue[round] !== undefined && selected.length < limit) { selected.push(queue[round]); added = true; }
    }
    if (!added) break;
  }
  return selected;
}

export function glbFlightPose(data: PrismScoreData, index: number, time: number) {
  const birth = data.birth[index], duration = data.duration[index];
  // A released stamp keeps its last expressive pose instead of blending to
  // rest; both phase and velocity weight are sampled at the release instant.
  return erniePose({ time: birth, duration, pitch: data.pitches[index], channel: data.channels[index],
    velocity: Math.min(127, data.velocity[index] * 96), track: 0 }, Math.min(Math.max(time, birth), birth + duration));
}

export type GlbFlightActor = {
  root: THREE.Group;
  model: THREE.Object3D;
  materials: Set<THREE.Material>;
  skeletons: Set<THREE.Skeleton>;
  assign: (data: PrismScoreData, index: number) => void;
  update: (data: PrismScoreData, index: number, time: number, length: number, fx: number, effects?: FlightEffectsSettings) => void;
  setCastTransition: (progress: number, role: FlightCastRole) => void;
  dispose: () => void;
};

// Geometry and image maps stay owned by the cached GLTF template. Every actor
// owns its skeletons, mixer and material instances, including authored ones.
const normalizedTemplateFits = new WeakMap<THREE.Object3D, ReturnType<typeof flightObjectFit>>();

export function createGlbFlightActor(template: THREE.Object3D, clips: THREE.AnimationClip[], materialChoice: GlbFlightMaterial,
  wireframe: boolean, movement?: string, normalizedSize = false): GlbFlightActor {
  const model = clone(template);
  const materials = new Set<THREE.Material>(), skeletons = new Set<THREE.Skeleton>();
  const originalMaterials = new Map<THREE.Material, THREE.Material>();
  const fade = { value: 1 };
  const cast = makeFlightCastUniforms();
  const decorate = (source: THREE.Material) => {
    const existing = originalMaterials.get(source);
    if (existing) return existing;
    const material = materialChoice === 'original' ? source.clone() : createPhysicalMaterial(materialChoice, wireframe);
    if ('wireframe' in material) material.wireframe = wireframe;
    material.onBeforeCompile = shader => {
      shader.uniforms.uGlbFlightFade = fade;
      Object.assign(shader.uniforms, cast);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nuniform float uGlbFlightFade;\n${FLIGHT_CAST_GLSL}`)
        .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
          flightCastDiscard();
          if (uGlbFlightFade < fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453)) discard;
        `);
    };
    material.customProgramCacheKey = () => 'glb-flight-dither-v2';
    originalMaterials.set(source, material); materials.add(material);
    return material;
  };
  model.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(decorate) : decorate(mesh.material);
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) skeletons.add((mesh as THREE.SkinnedMesh).skeleton);
  });
  const catPose = createCatPoseLayer(model);
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  let center = bounds.getCenter(new THREE.Vector3());
  let normalization = 1 / Math.max(0.001, size.x, size.y, size.z);
  if (normalizedSize) {
    let fit = normalizedTemplateFits.get(template);
    if (!fit) {
      // Measure the lifted, curved tail, not the old horizontal export pose.
      // Only the private clone is posed, then restored before mixer binding.
      catPose?.apply({ time: 0, phase: 0, weight: 0, seed: 0 });
      fit = flightObjectFit(model);
      catPose?.reset(true);
      normalizedTemplateFits.set(template, fit);
    }
    center = fit.center; normalization = fit.scale;
  }
  const root = new THREE.Group(), body = new THREE.Group(), fit = new THREE.Group();
  fit.scale.setScalar(normalization); fit.position.copy(center).multiplyScalar(-normalization); fit.add(model);
  body.add(fit); root.add(body); root.visible = false;
  const clip = clips.find(c => c.name === movement) ?? clips[0];
  const mixer = clip ? new THREE.AnimationMixer(model) : null;
  const action = clip && mixer ? mixer.clipAction(clip).play() : null;
  const matrix = new THREE.Matrix4(), scale = new THREE.Vector3();
  const motion = createFlightMotionSample();
  let previousPhase = NaN, previousWeight = NaN, previousCatTime = NaN, previousCatNote = -1;
  let disposed = false;
  return {
    root, model, materials, skeletons,
    setCastTransition(progress, role) { setFlightCastTransition(cast, progress, role); },
    assign(data, index) {
      matrix.fromArray(data.matrices, index * 16).decompose(root.position, root.quaternion, scale);
      // Held-note ribbon length is in matrix.z; GLB rigs keep their natural
      // proportions so long notes cannot squash a cat into an extrusion.
      root.scale.setScalar(scale.x);
      root.visible = true;
    },
    update(data, index, time, length, fx, effects) {
      const age = time - data.birth[index];
      root.visible = age >= 0 && (length <= 0 || age < length);
      if (!root.visible) return;
      const pose = glbFlightPose(data, index, time);
      const catTime = Math.min(Math.max(time, data.birth[index]), data.birth[index] + data.duration[index]);
      if (action && mixer && clip && (pose.phase !== previousPhase || pose.weight !== previousWeight
        || (catPose && (catTime !== previousCatTime || index !== previousCatNote)))) {
        catPose?.reset();
        action.enabled = true;
        action.time = pose.phase * clip.duration;
        action.setEffectiveWeight(pose.weight);
        mixer.update(0);
        catPose?.apply({ time: catTime, phase: pose.phase, weight: pose.weight,
          seed: data.pitches[index] + data.channels[index] * 17, movement: clip.name, strength: 2 });
        previousCatTime = catTime; previousCatNote = index;
        previousPhase = pose.phase; previousWeight = pose.weight;
      }
      // A small attack pulse follows absolute score time, so pause freezes
      // both skin deformation and body motion and a backward seek restores it.
      const attack = Math.exp(-Math.max(0, age) / 0.16) * data.velocity[index] * fx;
      sampleFlightMotion(data.birth[index], data.hue[index], time, effects, motion);
      body.scale.copy(motion.scale).multiplyScalar(1 + attack * 0.2);
      body.position.copy(motion.offset); body.position.y += attack * 0.08;
      body.rotation.set(motion.rotation.x, motion.rotation.y, motion.rotation.z);
      fade.value = length > 0 ? THREE.MathUtils.smoothstep(length - age, 0, Math.min(2, length)) : 1;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      action?.stop(); mixer?.uncacheRoot(model);
      materials.forEach(material => material.dispose());
      skeletons.forEach(skeleton => skeleton.dispose());
      root.removeFromParent();
    },
  };
}

export function glbFlightReleaseTimes(data: PrismScoreData) {
  return Float64Array.from(data.birth, (birth, i) => birth + data.duration[i]).sort();
}

export function glbFlightRangeKey(data: PrismScoreData, time: number, length: number, releases: ArrayLike<number>) {
  // Refresh exactly at births, releases and memory expiry. A release can
  // change active-note priority even within a sub-frame backward seek.
  return `${prismLowerBound(data.birth, time, true)}:${length > 0 ? prismLowerBound(data.birth, time - length) : 0}:${prismLowerBound(releases, time, true)}`;
}
