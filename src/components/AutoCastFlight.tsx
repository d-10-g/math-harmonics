import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useXR } from '@react-three/xr';
import type { WebGPUMaterialProfile } from '../constants';
import type { ParsedMidi } from '../lib/midi';
import type { FlightAutoPlan } from '../lib/flightAutoDirector';
import { FLIGHT_AUTO_TRANSITION_SECONDS } from '../lib/flightAutoDirector';
import { createFlightAutoCastPlan } from '../lib/flightAutoCast';
import { createFlightCastAnchor, flightCastChannelOffset, flightCastLayerBudget, pairedFlightCastCosts, sampleFlightCastProgress,
  updateFlightCastAnchor, type FlightCastTransitionStyle } from '../lib/flightCastTransition';
import type { FlightEffectsSettings } from '../lib/flightEffects';
import { mixedFlightBudget } from '../lib/mixedFlight';
import { mixedFlightSourceCosts, prepareMixedFlightSources, resolveMixedFlightChoices,
  type PreparedMixedFlightSources } from '../lib/mixedFlightSources';
import type { PrismFinish, PrismScoreData } from '../lib/prismTrail';
import type { PrismColorMode } from '../lib/urlState';
import MixedFlight from './MixedFlight';

type PreparedCast = { data: PreparedMixedFlightSources };

/** A maximum of two actor pools, never one pool per visited phrase. Source
 * preloads contain cached templates only and create no actors/GPU draws. */
export default function AutoCastFlight({ midi, data, plan, index, getMusicTime,
  showWireframe, trailLength, effects, colorMode = 'full', sliceWidth = 0.14, onStatus, transitionStyle = 'ripple' }: {
  midi: ParsedMidi; data: PrismScoreData; plan: FlightAutoPlan; index: number;
  getMusicTime?: () => { time: number; duration: number }; materialProfile: WebGPUMaterialProfile; finish: PrismFinish;
  showWireframe: boolean; trailLength: number; effects: FlightEffectsSettings;
  colorMode?: PrismColorMode; sliceWidth?: number; onStatus?: (status: string) => void;
  transitionStyle?: FlightCastTransitionStyle;
}) {
  const castPlan = useMemo(() => createFlightAutoCastPlan(midi, plan), [midi, plan]);
  // Automatic maps name every source and surface explicitly. Unrelated global
  // material edits must not invalidate their prepared sources or active pools.
  const choices = useMemo(() => castPlan.casts.map(map => resolveMixedFlightChoices(castPlan.channels, map, 'auto', 'ornament')),
    [castPlan]);
  const requests = useMemo(() => new Map<number, Promise<PreparedMixedFlightSources>>(), [choices]);
  const [loaded, setLoaded] = useState<{ choices: typeof choices; casts: Map<number, PreparedCast> }>(() => ({ choices, casts: new Map() }));
  const prepared = loaded.choices === choices ? loaded.casts : new Map<number, PreparedCast>();
  const runtime = useMemo(() => ({ index: -1, fromIndex: -1, lastReadyIndex: -1, anchor: createFlightCastAnchor() }), [choices]);
  const session = useXR(state => state.session);
  const budget = useMemo(() => flightCastLayerBudget(mixedFlightBudget(Boolean(session))), [session]);
  const livePrepared = useRef(prepared); livePrepared.current = prepared;
  const now = () => {
    const time = getMusicTime?.().time ?? 0;
    return Number.isFinite(time) ? Math.max(0, time) : 0;
  };
  const time = now();
  const section = plan.sections[index];
  // On a new phrase the preceding cast is already loaded by ordinary
  // playback. Cold seeks retain the last ready cast while loading the target.
  const sought = Number.isFinite(runtime.anchor.lastTime)
    && (time < runtime.anchor.lastTime - .001 || time - runtime.anchor.lastTime > 1.5);
  if (runtime.index !== index || sought) {
    runtime.fromIndex = prepared.has(index - 1) ? index - 1 : runtime.lastReadyIndex;
    runtime.index = index;
  }
  const incoming = prepared.get(index);
  const fromIndex = runtime.fromIndex;
  const outgoing = fromIndex >= 0 && fromIndex !== index ? prepared.get(fromIndex) : undefined;
  const start = updateFlightCastAnchor(runtime.anchor, index, section.time, time, Boolean(incoming));
  const completed = Boolean(incoming) && (fromIndex < 0 || time >= start + FLIGHT_AUTO_TRANSITION_SECONDS);
  const costs = useMemo(() => {
    const from = outgoing ? mixedFlightSourceCosts(choices[fromIndex], outgoing.data.sources, budget).costs : new Map();
    const to = incoming ? mixedFlightSourceCosts(choices[index], incoming.data.sources, budget).costs : from;
    return pairedFlightCastCosts(from, to);
  }, [outgoing, incoming, choices, fromIndex, index, budget]);

  useEffect(() => {
    let active = true;
    // Prepare the desired pair plus one phrase ahead. A direct seek reuses
    // the same source promises, but never mounts stale requested actors.
    for (const target of [index - 1, index, index + 1]) {
      if (target < 0 || target >= choices.length) continue;
      let request = requests.get(target);
      if (!request) { request = prepareMixedFlightSources(choices[target]); requests.set(target, request); }
      void request.then(result => {
        if (!active) return;
        setLoaded(previous => {
          const casts = previous.choices === choices ? previous.casts : new Map<number, PreparedCast>();
          if (casts.has(target)) return previous;
          return { choices, casts: new Map(casts).set(target, { data: result }) };
        });
      });
    }
    return () => { active = false; };
  }, [index, choices, requests]);

  useEffect(() => {
    const failed = [...new Set([...(incoming?.data.failed ?? []), ...(outgoing?.data.failed ?? [])])];
    onStatus?.(!incoming ? 'Auto cast: preparing the next meshes; the last ready cast stays visible.'
      : failed.length ? `Auto cast: ${failed.join(', ')} unavailable; faceted substitutes retain those channels.`
        : `Auto cast: matched-size ${transitionStyle === 'ripple' ? 'channel ripples' : 'crossfades'}; up to ${budget.objects} note pairs within the shared desktop/VR budget.`);
    return () => { onStatus?.(''); };
  }, [incoming, outgoing, onStatus, transitionStyle, budget]);

  // Before actor updates (0), after the score guide (-.5). The anchor is
  // shared by both masks and advances only with score time, including pauses.
  useFrame(() => {
    const time = now();
    const before = runtime.anchor.lastTime;
    const sought = Number.isFinite(before) && (time < before - .001 || time - before > 1.5);
    if (sought) runtime.fromIndex = livePrepared.current.has(index - 1) ? index - 1 : runtime.lastReadyIndex;
    const ready = livePrepared.current.has(index);
    const start = updateFlightCastAnchor(runtime.anchor, index, section.time, time, ready);
    if (ready && (runtime.fromIndex < 0 || time >= start + FLIGHT_AUTO_TRANSITION_SECONDS)) runtime.lastReadyIndex = index;
  }, -0.25);

  const transition = (role: 'incoming' | 'outgoing') => (channel: number, at: number) => ({
    progress: incoming && outgoing ? sampleFlightCastProgress(at, runtime.anchor.start, channel, transitionStyle) : incoming ? 1 : 0,
    role: incoming && outgoing ? role : 'steady' as const,
  });
  const common = { data, getMusicTime, materialProfile: 'auto' as const, finish: 'ornament' as const, showWireframe, trailLength, effects, colorMode, sliceWidth,
    normalizedSize: true, halfBudget: true, hideWhileLoading: true, selectionCosts: costs,
    selectionChannelOffset: flightCastChannelOffset(index, castPlan.channels.length, budget.objects) };
  return <>
    {outgoing && !completed && <MixedFlight key={fromIndex} {...common} channelMap={castPlan.casts[fromIndex]}
      preparedSources={outgoing.data} castTransition={transition('outgoing')} />}
    {incoming && <MixedFlight key={index} {...common} channelMap={castPlan.casts[index]}
      preparedSources={incoming.data} castTransition={transition('incoming')} />}
  </>;
}
