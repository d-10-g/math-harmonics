import { DEFAULT_FLIGHT_EFFECTS, type FlightEffectsSettings } from '../lib/flightEffects';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useXR } from '@react-three/xr';
import * as THREE from 'three';
import type { WebGPUMaterialProfile } from '../constants';
import { clockStore } from '../lib/clock';
import { createGlbFlightActor, glbFlightRangeKey, glbFlightReleaseTimes, indexGlbFlightChannels } from '../lib/glbFlight';
import { mixedFlightBudget, selectMixedFlightNotes, type MixedFlightCost } from '../lib/mixedFlight';
import { flightCastLayerBudget, type FlightCastTransition } from '../lib/flightCastTransition';
import { mixedFlightSourceKey as sourceKey, mixedFlightSourceCosts, prepareMixedFlightSources, type PreparedMixedFlightSources } from '../lib/mixedFlightSources';
import { resolveMixedPrismChannel, type PrismChannelMap, type ResolvedMixedPrismChannel } from '../lib/prismChannels';
import type { PrismFinish, PrismScoreData } from '../lib/prismTrail';
import type { PrismColorMode } from '../lib/urlState';
import { createStaticFlightActor } from '../lib/staticFlight';

type Actor = { root: THREE.Group; assign: (data: PrismScoreData, index: number) => void;
  update: (data: PrismScoreData, index: number, time: number, length: number, fx: number, effects?: FlightEffectsSettings) => void;
  setCastTransition: (progress: number, role: 'incoming' | 'outgoing' | 'steady') => void; dispose: () => void };
type Slot = { channel: number; index: number; actor: Actor };
type CastTransition = (channel: number, time: number) => FlightCastTransition;
type Pool = { update: (time: number, length: number, fx: number, effects: FlightEffectsSettings, transition?: CastTransition) => void; dispose: () => void };

export default function MixedFlight({ data, getMusicTime, channelMap, materialProfile, finish,
  showWireframe, trailLength, effects = DEFAULT_FLIGHT_EFFECTS, colorMode = 'full', sliceWidth = 0.14, onStatus,
  preparedSources, normalizedSize = false, halfBudget = false, hideWhileLoading = false, selectionCosts, castTransition, selectionChannelOffset = 0 }: {
  data: PrismScoreData; getMusicTime?: () => { time: number; duration: number };
  channelMap: PrismChannelMap; materialProfile: WebGPUMaterialProfile; finish: PrismFinish;
  showWireframe: boolean; trailLength: number; colorMode?: PrismColorMode; sliceWidth?: number;
  effects?: FlightEffectsSettings;
  onStatus?: (status: string) => void;
  preparedSources?: PreparedMixedFlightSources; normalizedSize?: boolean; halfBudget?: boolean; hideWhileLoading?: boolean;
  selectionCosts?: ReadonlyMap<number, MixedFlightCost>; castTransition?: CastTransition;
  selectionChannelOffset?: number;
}) {
  const group = useMemo(() => new THREE.Group(), []);
  const pool = useRef<Pool | null>(null);
  const session = useXR(state => state.session);
  const budget = useMemo(() => { const full = mixedFlightBudget(Boolean(session)); return halfBudget ? flightCastLayerBudget(full) : full; }, [session, halfBudget]);
  const channelIndex = useMemo(() => indexGlbFlightChannels(data), [data]);
  const selectionIndex = useMemo(() => {
    const offset = channelIndex.length ? ((Math.floor(selectionChannelOffset) % channelIndex.length) + channelIndex.length) % channelIndex.length : 0;
    return offset ? [...channelIndex.slice(offset), ...channelIndex.slice(0, offset)] : channelIndex;
  }, [channelIndex, selectionChannelOffset]);
  const releases = useMemo(() => glbFlightReleaseTimes(data), [data]);
  const choices = useMemo(() => new Map(channelIndex.map(({ channel }) =>
    [channel, resolveMixedPrismChannel(channelMap, channel, materialProfile, finish)])), [channelIndex, channelMap, materialProfile, finish]);
  const requested = useMemo(() => {
    const unique = new Map<string, ResolvedMixedPrismChannel>();
    for (const choice of choices.values()) { const key = sourceKey(choice); if (key) unique.set(key, choice); }
    return unique;
  }, [choices]);
  const assetKey = [...requested.keys()].sort().join('|');
  const [localSources, setLocalSources] = useState<PreparedMixedFlightSources>({ sources: new Map(), failed: [], pending: true });
  useEffect(() => {
    if (preparedSources) return;
    let active = true;
    setLocalSources(previous => ({ ...previous, failed: [], pending: true }));
    void prepareMixedFlightSources(choices).then(result => { if (active) setLocalSources(result); });
    return () => { active = false; };
    // Movement/material changes do not reload an unchanged asset family.
  }, [assetKey, preparedSources]);
  const loaded = preparedSources ?? localSources;
  const { costs: ownCosts, oversized } = useMemo(() => mixedFlightSourceCosts(choices, loaded.sources, budget), [choices, loaded.sources, budget]);
  const costs = selectionCosts ?? ownCosts;
  useEffect(() => {
    onStatus?.(loaded.pending ? 'Loading mixed flight meshes…' : loaded.failed.length
      ? `Mesh unavailable: ${loaded.failed.join(', ')}. Faceted markers show those channels; other channels continue.`
      : oversized.length ? `Mesh exceeds this flight’s vertex budget: ${oversized.join(', ')}. Faceted markers preserve those channels.`
      : `Mixed flight: up to ${budget.objects} recent objects, shared fairly across channels; ${budget.vertices / 1_000_000}M total / ${budget.skinnedVertices / 1000}k skinned vertex budget.`);
    return () => { onStatus?.(''); };
  }, [loaded.pending, loaded.failed, oversized, budget, onStatus]);

  useEffect(() => {
    if (hideWhileLoading && loaded.pending) return;
    const slots: Slot[] = [];
    let selectionKey = '';
    const makeSlot = (channel: number): Slot => {
      const choice = choices.get(channel)!;
      const key = sourceKey(choice);
      const source = key && choice.kind !== 'shape' && !oversized.includes(choice.asset.file) ? loaded.sources.get(key) : null;
      let actor: Actor;
      if (choice.kind === 'glb' && source?.template) {
        actor = createGlbFlightActor(source.template, source.clips ?? [], choice.material, showWireframe, choice.movement, normalizedSize);
      } else if (choice.kind === 'shape') {
        actor = createStaticFlightActor({ shape: choice.shape, material: choice.material, wireframe: showWireframe, colorMode, sliceWidth, normalizedSize });
      } else if (choice.kind === 'obj' && source) {
        actor = createStaticFlightActor({ shape: 'mesh', geometry: source.geometry, template: source.template,
          material: choice.material, wireframe: showWireframe, colorMode, sliceWidth, normalizedSize });
      } else {
        actor = createStaticFlightActor({ shape: 'crystal', material: 'pearl', wireframe: showWireframe, colorMode, sliceWidth, normalizedSize });
      }
      group.add(actor.root);
      return { channel, index: -1, actor };
    };
    const current: Pool = {
      update(time, length, fx, currentEffects, transition) {
        const key = glbFlightRangeKey(data, time, length, releases);
        if (key !== selectionKey) {
          const selected = selectMixedFlightNotes(data, selectionIndex, time, length, costs, budget);
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
        for (const slot of slots) if (slot.index >= 0) {
          slot.actor.update(data, slot.index, time, length, fx, currentEffects);
          const cast = transition?.(slot.channel, time);
          slot.actor.setCastTransition(cast?.progress ?? 1, cast?.role ?? 'steady');
        }
      },
      dispose() { slots.forEach(slot => slot.actor.dispose()); },
    };
    pool.current = current;
    return () => { if (pool.current === current) pool.current = null; current.dispose(); };
  }, [data, selectionIndex, releases, choices, loaded.sources, costs, oversized, budget, group, showWireframe, colorMode, sliceWidth, normalizedSize, hideWhileLoading, loaded.pending]);

  useFrame(() => {
    const rawTime = getMusicTime?.().time ?? 0;
    const time = Number.isFinite(rawTime) ? Math.max(0, rawTime) : 0;
    const clock = clockStore.getState();
    pool.current?.update(time, Number.isFinite(trailLength) ? Math.max(0, trailLength) : 0,
      clock.noteFxMode === 'off' ? 0 : Math.min(3, clock.noteFxAmount) / 2, effects, castTransition);
  });
  return <primitive object={group} dispose={null} />;
}
