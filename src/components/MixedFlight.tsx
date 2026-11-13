import { DEFAULT_FLIGHT_EFFECTS, type FlightEffectsSettings } from '../lib/flightEffects';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useXR } from '@react-three/xr';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { WebGPUMaterialProfile } from '../constants';
import { clockStore } from '../lib/clock';
import { createGlbFlightActor, glbFlightRangeKey, glbFlightReleaseTimes, indexGlbFlightChannels } from '../lib/glbFlight';
import { loadMeshGeometry, loadMeshGroup } from '../lib/meshLibrary';
import { mixedFlightBudget, selectMixedFlightNotes, type MixedFlightCost } from '../lib/mixedFlight';
import { resolveMixedPrismChannel, type PrismChannelMap, type ResolvedMixedPrismChannel } from '../lib/prismChannels';
import type { PrismFinish, PrismScoreData } from '../lib/prismTrail';
import type { PrismColorMode } from '../lib/urlState';
import { createStaticFlightActor } from '../lib/staticFlight';

const gltfTemplates = new Map<string, Promise<GLTF>>();
function loadGlb(url: string) {
  let request = gltfTemplates.get(url);
  if (!request) {
    request = new GLTFLoader().loadAsync(url).catch(error => { gltfTemplates.delete(url); throw error; });
    gltfTemplates.set(url, request);
  }
  return request;
}

type Source = { geometry?: THREE.BufferGeometry; template?: THREE.Object3D; clips?: THREE.AnimationClip[]; vertices: number };
type Actor = { root: THREE.Group; assign: (data: PrismScoreData, index: number) => void;
  update: (data: PrismScoreData, index: number, time: number, length: number, fx: number, effects?: FlightEffectsSettings) => void; dispose: () => void };
type Slot = { channel: number; index: number; actor: Actor };
type Pool = { update: (time: number, length: number, fx: number, effects: FlightEffectsSettings) => void; dispose: () => void };

function sourceKey(choice: ResolvedMixedPrismChannel) {
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
async function loadSource(choice: ResolvedMixedPrismChannel): Promise<Source> {
  if (choice.kind === 'glb') {
    const gltf = await loadGlb(choice.asset.url);
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
  // Conservative built-in cost; no GPU geometry needs creating during load.
  return { vertices: 1024 };
}

export default function MixedFlight({ data, getMusicTime, channelMap, materialProfile, finish,
  showWireframe, trailLength, effects = DEFAULT_FLIGHT_EFFECTS, colorMode = 'full', sliceWidth = 0.14, onStatus }: {
  data: PrismScoreData; getMusicTime?: () => { time: number; duration: number };
  channelMap: PrismChannelMap; materialProfile: WebGPUMaterialProfile; finish: PrismFinish;
  showWireframe: boolean; trailLength: number; colorMode?: PrismColorMode; sliceWidth?: number;
  effects?: FlightEffectsSettings;
  onStatus?: (status: string) => void;
}) {
  const group = useMemo(() => new THREE.Group(), []);
  const pool = useRef<Pool | null>(null);
  const session = useXR(state => state.session);
  const budget = useMemo(() => mixedFlightBudget(Boolean(session)), [session]);
  const channelIndex = useMemo(() => indexGlbFlightChannels(data), [data]);
  const releases = useMemo(() => glbFlightReleaseTimes(data), [data]);
  const choices = useMemo(() => new Map(channelIndex.map(({ channel }) =>
    [channel, resolveMixedPrismChannel(channelMap, channel, materialProfile, finish)])), [channelIndex, channelMap, materialProfile, finish]);
  const requested = useMemo(() => {
    const unique = new Map<string, ResolvedMixedPrismChannel>();
    for (const choice of choices.values()) { const key = sourceKey(choice); if (key) unique.set(key, choice); }
    return unique;
  }, [choices]);
  const assetKey = [...requested.keys()].sort().join('|');
  const [loaded, setLoaded] = useState<{ sources: Map<string, Source>; failed: string[]; pending: boolean }>({ sources: new Map(), failed: [], pending: true });
  useEffect(() => {
    let active = true;
    setLoaded(previous => ({ ...previous, failed: [], pending: true }));
    const entries = [...requested];
    void Promise.allSettled(entries.map(([, choice]) => loadSource(choice))).then(results => {
      if (!active) return;
      const sources = new Map<string, Source>(), failed: string[] = [];
      results.forEach((result, index) => {
        const [key, choice] = entries[index];
        if (result.status === 'fulfilled') sources.set(key, result.value);
        else if (choice.kind !== 'shape') failed.push(choice.asset.file);
      });
      setLoaded({ sources, failed: [...new Set(failed)], pending: false });
    });
    return () => { active = false; };
    // Materials/movements do not reload geometry. Original OBJ uses its MTL
    // template, so changing to/from Original is part of this resource key.
  }, [assetKey]);

  const oversized = useMemo(() => [...new Set([...choices.values()].flatMap(choice => {
    const key = sourceKey(choice), source = key ? loaded.sources.get(key) : null;
    if (choice.kind === 'shape' || !source) return [];
    return source.vertices > budget.vertices || (choice.kind === 'glb' && source.vertices > budget.skinnedVertices)
      ? [choice.asset.file] : [];
  }))], [choices, loaded.sources, budget]);
  const costs = useMemo(() => new Map([...choices].map(([channel, choice]): [number, MixedFlightCost] => {
    const key = sourceKey(choice), source = key ? loaded.sources.get(key) : null;
    const usable = choice.kind === 'shape' || !oversized.includes(choice.asset.file);
    return [channel, { vertices: choice.kind === 'shape' ? 1024 : usable ? source?.vertices ?? 24 : 24, skinned: choice.kind === 'glb' && Boolean(source) && usable }];
  })), [choices, loaded.sources, oversized]);
  useEffect(() => {
    onStatus?.(loaded.pending ? 'Loading mixed flight meshes…' : loaded.failed.length
      ? `Mesh unavailable: ${loaded.failed.join(', ')}. Faceted markers show those channels; other channels continue.`
      : oversized.length ? `Mesh exceeds this flight’s vertex budget: ${oversized.join(', ')}. Faceted markers preserve those channels.`
      : `Mixed flight: up to ${budget.objects} recent objects, shared fairly across channels; ${budget.vertices / 1_000_000}M total / ${budget.skinnedVertices / 1000}k skinned vertex budget.`);
    return () => { onStatus?.(''); };
  }, [loaded.pending, loaded.failed, oversized, budget, onStatus]);

  useEffect(() => {
    const slots: Slot[] = [];
    let selectionKey = '';
    const makeSlot = (channel: number): Slot => {
      const choice = choices.get(channel)!;
      const key = sourceKey(choice);
      const source = key && choice.kind !== 'shape' && !oversized.includes(choice.asset.file) ? loaded.sources.get(key) : null;
      let actor: Actor;
      if (choice.kind === 'glb' && source?.template) {
        actor = createGlbFlightActor(source.template, source.clips ?? [], choice.material, showWireframe, choice.movement);
      } else if (choice.kind === 'shape') {
        actor = createStaticFlightActor({ shape: choice.shape, material: choice.material, wireframe: showWireframe, colorMode, sliceWidth });
      } else if (choice.kind === 'obj' && source) {
        actor = createStaticFlightActor({ shape: 'mesh', geometry: source.geometry, template: source.template,
          material: choice.material, wireframe: showWireframe, colorMode, sliceWidth });
      } else {
        actor = createStaticFlightActor({ shape: 'crystal', material: 'pearl', wireframe: showWireframe, colorMode, sliceWidth });
      }
      group.add(actor.root);
      return { channel, index: -1, actor };
    };
    const current: Pool = {
      update(time, length, fx, currentEffects) {
        const key = glbFlightRangeKey(data, time, length, releases);
        if (key !== selectionKey) {
          const selected = selectMixedFlightNotes(data, channelIndex, time, length, costs, budget);
          const retained = new Set(selected);
          for (const slot of slots) if (!retained.has(slot.index)) { slot.index = -1; slot.actor.root.visible = false; }
          const assigned = new Set(slots.filter(slot => slot.index >= 0).map(slot => slot.index));
          for (const index of selected) {
            if (assigned.has(index)) continue;
            const channel = data.channels[index];
            let slot = slots.find(candidate => candidate.index < 0 && candidate.channel === channel);
            if (!slot) {
              const replace = slots.findIndex(candidate => candidate.index < 0);
              slot = makeSlot(channel);
              if (replace >= 0) { slots[replace].actor.dispose(); slots[replace] = slot; }
              else slots.push(slot);
            }
            slot.index = index; slot.actor.assign(data, index);
          }
          selectionKey = key;
        }
        for (const slot of slots) if (slot.index >= 0) slot.actor.update(data, slot.index, time, length, fx, currentEffects);
      },
      dispose() { slots.forEach(slot => slot.actor.dispose()); },
    };
    pool.current = current;
    return () => { if (pool.current === current) pool.current = null; current.dispose(); };
  }, [data, channelIndex, releases, choices, loaded.sources, costs, oversized, budget, group, showWireframe, colorMode, sliceWidth]);

  useFrame(() => {
    const rawTime = getMusicTime?.().time ?? 0;
    const time = Number.isFinite(rawTime) ? Math.max(0, rawTime) : 0;
    const clock = clockStore.getState();
    pool.current?.update(time, Number.isFinite(trailLength) ? Math.max(0, trailLength) : 0,
      clock.noteFxMode === 'off' ? 0 : Math.min(3, clock.noteFxAmount) / 2, effects);
  });
  return <primitive object={group} dispose={null} />;
}
