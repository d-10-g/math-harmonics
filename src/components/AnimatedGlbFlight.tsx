import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useXR } from '@react-three/xr';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { WebGPUMaterialProfile } from '../constants';
import { clockStore } from '../lib/clock';
import { resolvePrismChannel, type PrismChannelMap } from '../lib/prismChannels';
import { type PrismFinish, type PrismScoreData } from '../lib/prismTrail';
import { createGlbFlightActor, glbFlightRangeKey, glbFlightReleaseTimes, indexGlbFlightChannels, selectGlbFlightNotes,
  GLB_FLIGHT_LIMIT, GLB_FLIGHT_XR_LIMIT, type GlbFlightActor } from '../lib/glbFlight';

const templates = new Map<string, Promise<GLTF>>();
function loadTemplate(url: string) {
  let request = templates.get(url);
  if (!request) {
    request = new GLTFLoader().loadAsync(url).catch(error => { templates.delete(url); throw error; });
    templates.set(url, request);
  }
  return request;
}

type FlightSlot = { channel: number; index: number; actor: GlbFlightActor };
type Pool = { update: (time: number, length: number, fx: number) => void; dispose: () => void };

export default function AnimatedGlbFlight({ data, getMusicTime, channelMap, materialProfile, finish,
  showWireframe, trailLength, onStatus }: {
  data: PrismScoreData;
  getMusicTime?: () => { time: number; duration: number };
  channelMap: PrismChannelMap;
  materialProfile: WebGPUMaterialProfile;
  finish: PrismFinish;
  showWireframe: boolean;
  trailLength: number;
  onStatus?: (status: string) => void;
}) {
  const group = useMemo(() => new THREE.Group(), []);
  const pool = useRef<Pool | null>(null);
  const session = useXR(state => state.session);
  const channelIndex = useMemo(() => indexGlbFlightChannels(data), [data]);
  const releases = useMemo(() => glbFlightReleaseTimes(data), [data]);
  const choices = useMemo(() => new Map(channelIndex.map(({ channel }) =>
    [channel, resolvePrismChannel(channelMap, channel, materialProfile, finish)])), [channelIndex, channelMap, materialProfile, finish]);
  const assets = useMemo(() => [...new Map([...choices.values()].map(choice => [choice.asset.file, choice.asset])).values()], [choices]);
  const assetKey = assets.map(asset => asset.file).sort().join('|');
  const [loaded, setLoaded] = useState<{ models: Map<string, GLTF>; failed: string[]; pending: boolean }>({ models: new Map(), failed: [], pending: true });
  useEffect(() => {
    let active = true;
    setLoaded(previous => ({ ...previous, failed: [], pending: true }));
    void Promise.allSettled(assets.map(asset => loadTemplate(asset.url))).then(results => {
      if (!active) return;
      const models = new Map<string, GLTF>(), failed: string[] = [];
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') models.set(assets[index].file, result.value);
        else failed.push(assets[index].file);
      });
      setLoaded({ models, failed, pending: false });
    });
    return () => { active = false; };
    // Choices that only change material/movement reuse the same GLTF cache.
  }, [assetKey]);

  // Pending/failed channels stay visible as small faceted markers; one
  // unavailable asset cannot suspend or blank every other channel's flight.
  const fallback = useMemo(() => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.5), new THREE.MeshPhysicalMaterial({
      color: 0x9da6d8, metalness: 0.6, roughness: 0.22, clearcoat: 1,
    })));
    return root;
  }, []);
  useEffect(() => () => fallback.traverse(object => {
    if (object instanceof THREE.Mesh) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); }
  }), [fallback]);

  const limit = useMemo(() => {
    let maxVertices = 1;
    for (const asset of assets) {
      let vertices = 0;
      loaded.models.get(asset.file)?.scene.traverse(object => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh) vertices += mesh.geometry.getAttribute('position')?.count ?? 0;
      });
      maxVertices = Math.max(maxVertices, vertices);
    }
    return Math.max(1, Math.min(session ? GLB_FLIGHT_XR_LIMIT : GLB_FLIGHT_LIMIT, Math.floor(500_000 / maxVertices)));
  }, [assets, loaded.models, session]);

  useEffect(() => {
    onStatus?.(loaded.pending ? 'Loading animated flight models…' : loaded.failed.length
      ? `Model unavailable: ${loaded.failed.join(', ')}. Faceted markers show those channels; other models continue.`
      : `Animated GLB history: up to ${limit} recent models, shared fairly across MIDI channels.`);
    return () => { onStatus?.(''); };
  }, [loaded.pending, loaded.failed, limit, onStatus]);

  useEffect(() => {
    const slots: FlightSlot[] = [];
    let selectionKey = '';
    const makeSlot = (channel: number): FlightSlot => {
      const choice = choices.get(channel)!;
      const gltf = loaded.models.get(choice.asset.file);
      const actor = createGlbFlightActor(gltf?.scene ?? fallback, gltf?.animations ?? [], choice.material, showWireframe, choice.movement);
      group.add(actor.root);
      return { channel, index: -1, actor };
    };
    const current: Pool = {
      update(time, length, fx) {
        const key = glbFlightRangeKey(data, time, length, releases);
        if (key !== selectionKey) {
          const selected = selectGlbFlightNotes(data, channelIndex, time, length, limit);
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
        for (const slot of slots) if (slot.index >= 0) slot.actor.update(data, slot.index, time, length, fx);
      },
      dispose() { slots.forEach(slot => slot.actor.dispose()); },
    };
    pool.current = current;
    return () => { if (pool.current === current) pool.current = null; current.dispose(); };
  }, [data, channelIndex, releases, choices, loaded.models, fallback, group, limit, showWireframe]);

  useFrame(() => {
    const rawTime = getMusicTime?.().time ?? 0;
    const time = Number.isFinite(rawTime) ? Math.max(0, rawTime) : 0;
    const clock = clockStore.getState();
    pool.current?.update(time, Number.isFinite(trailLength) ? Math.max(0, trailLength) : 0,
      clock.noteFxMode === 'off' ? 0 : Math.min(3, clock.noteFxAmount) / 2);
  });
  return <primitive object={group} dispose={null} />;
}
