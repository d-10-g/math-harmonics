import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { WebGPUMaterialProfile } from '../constants';
import { loadMeshGeometry, loadMeshGroup } from './meshLibrary';
import { resolveMixedPrismChannel, type PrismChannelMap, type ResolvedMixedPrismChannel } from './prismChannels';
import type { PrismFinish } from './prismTrail';
import type { MixedFlightBudget, MixedFlightCost } from './mixedFlight';

export type MixedFlightSource = { geometry?: THREE.BufferGeometry; template?: THREE.Object3D; clips?: THREE.AnimationClip[]; vertices: number };
export type PreparedMixedFlightSources = { sources: Map<string, MixedFlightSource>; failed: string[]; pending: boolean };
const gltfTemplates = new Map<string, Promise<GLTF>>();
const sourceRequests = new Map<string, Promise<MixedFlightSource>>();

export function mixedFlightSourceKey(choice: ResolvedMixedPrismChannel) {
  return choice.kind === 'shape' ? null : `${choice.kind}:${choice.asset.file}:${choice.material === 'original' ? 'original' : 'app'}`;
}
function countVertices(root: THREE.Object3D) {
  let count = 0;
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) count += mesh.geometry.getAttribute('position')?.count ?? 0;
  });
  return count;
}
async function loadSource(choice: ResolvedMixedPrismChannel): Promise<MixedFlightSource> {
  if (choice.kind === 'glb') {
    let request = gltfTemplates.get(choice.asset.url);
    if (!request) {
      request = new GLTFLoader().loadAsync(choice.asset.url).catch(error => { gltfTemplates.delete(choice.asset.url); throw error; });
      gltfTemplates.set(choice.asset.url, request);
    }
    const gltf = await request;
    return { template: gltf.scene, clips: gltf.animations, vertices: countVertices(gltf.scene) };
  }
  if (choice.kind === 'obj') {
    const stem = choice.asset.file.replace(/\.obj$/i, '');
    if (choice.material === 'original') {
      const template = await loadMeshGroup(stem);
      if (!template) throw new Error(`Unable to load ${choice.asset.file}`);
      return { template, vertices: countVertices(template) };
    }
    const geometry = await loadMeshGeometry(stem);
    if (!geometry) throw new Error(`Unable to load ${choice.asset.file}`);
    return { geometry, vertices: geometry.getAttribute('position').count };
  }
  return { vertices: 1024 };
}

/** Preloading owns no actors or GPU draws. Cached templates keep their existing
 * loader ownership, while every mounted flight still clones its own actors. */
export async function prepareMixedFlightSources(choices: ReadonlyMap<number, ResolvedMixedPrismChannel>): Promise<PreparedMixedFlightSources> {
  const unique = new Map<string, ResolvedMixedPrismChannel>();
  for (const choice of choices.values()) { const key = mixedFlightSourceKey(choice); if (key) unique.set(key, choice); }
  const entries = [...unique];
  const results = await Promise.allSettled(entries.map(([key, choice]) => {
    let request = sourceRequests.get(key);
    if (!request) {
      request = loadSource(choice).catch(error => { sourceRequests.delete(key); throw error; });
      sourceRequests.set(key, request);
    }
    return request;
  }));
  const sources = new Map<string, MixedFlightSource>(), failed: string[] = [];
  results.forEach((result, i) => {
    const [key, choice] = entries[i];
    if (result.status === 'fulfilled') sources.set(key, result.value);
    else if (choice.kind !== 'shape') failed.push(choice.asset.file);
  });
  return { sources, failed: [...new Set(failed)], pending: false };
}

export function resolveMixedFlightChoices(channels: readonly number[], map: PrismChannelMap,
  material: WebGPUMaterialProfile, finish: PrismFinish) {
  return new Map(channels.map(channel => [channel, resolveMixedPrismChannel(map, channel, material, finish)]));
}

export function mixedFlightSourceCosts(choices: ReadonlyMap<number, ResolvedMixedPrismChannel>,
  sources: ReadonlyMap<string, MixedFlightSource>, budget: MixedFlightBudget) {
  const oversized: string[] = [];
  const costs = new Map<number, MixedFlightCost>();
  for (const [channel, choice] of choices) {
    const key = mixedFlightSourceKey(choice), source = key ? sources.get(key) : null;
    const tooLarge = choice.kind !== 'shape' && source
      && (source.vertices > budget.vertices || (choice.kind === 'glb' && source.vertices > budget.skinnedVertices));
    if (tooLarge) oversized.push(choice.asset.file);
    costs.set(channel, { vertices: choice.kind === 'shape' ? 1024 : tooLarge ? 24 : source?.vertices ?? 24,
      skinned: choice.kind === 'glb' && Boolean(source) && !tooLarge });
  }
  return { costs, oversized: [...new Set(oversized)] };
}
