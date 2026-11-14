import { FLIGHT_AUTO_TRANSITION_SECONDS } from './flightAutoDirector';
import type { MixedFlightBudget, MixedFlightCost } from './mixedFlight';
import type { FlightCastStyle } from './flightAutoCastSettings';

export type FlightCastRole = 'incoming' | 'outgoing' | 'steady';
export type FlightCastTransition = { progress: number; role: FlightCastRole };
export type FlightCastTransitionStyle = FlightCastStyle;
const clamp = (value: number) => Math.min(1, Math.max(0, value));

/** Both casts use this same channel threshold. Their stable screen-door masks
 * are complementary even for glass, with no transparency sorting or scale pop. */
export function sampleFlightCastProgress(time: number, start: number, channel: number,
  style: FlightCastTransitionStyle): number {
  const safeTime = Number.isFinite(time) ? time : 0, safeStart = Number.isFinite(start) ? start : 0;
  const safeChannel = Number.isInteger(channel) && channel >= 0 && channel <= 15 ? channel : 0;
  // A permutation spreads adjacent instrument channels through the ripple.
  const offset = style === 'ripple' ? ((safeChannel * 7) % 16) / 15 * 1.5 : 0;
  const phase = clamp((safeTime - safeStart - offset) / (FLIGHT_AUTO_TRANSITION_SECONDS - offset));
  return phase * phase * (3 - 2 * phase);
}

export function flightCastLayerBudget(budget: MixedFlightBudget): MixedFlightBudget {
  return { objects: Math.max(1, Math.floor(budget.objects / 2)), vertices: Math.floor(budget.vertices / 2),
    skinnedVertices: Math.floor(budget.skinnedVertices / 2) };
}

/** Select the same note IDs in each layer, charging the more expensive member
 * of every channel pair. Two half pools cannot exceed the ordinary budget. */
export function pairedFlightCastCosts(from: ReadonlyMap<number, MixedFlightCost>, to: ReadonlyMap<number, MixedFlightCost>) {
  const result = new Map<number, MixedFlightCost>();
  for (const channel of new Set([...from.keys(), ...to.keys()])) {
    const a = from.get(channel), b = to.get(channel);
    result.set(channel, { vertices: Math.max(a?.vertices ?? 0, b?.vertices ?? 0), skinned: Boolean(a?.skinned || b?.skinned) });
  }
  return result;
}

/** A dense 16-voice XR score can exceed the 12-pair cap. Rotate priority once
 * per phrase, rather than permanently hiding the final MIDI channels. */
export function flightCastChannelOffset(index: number, channels: number, pairLimit: number) {
  if (channels <= pairLimit || channels < 1) return 0;
  return ((Math.max(0, Math.floor(index)) * 7) % channels + channels) % channels;
}

export type FlightCastAnchor = { index: number; lastTime: number; start: number; waiting: boolean };
export function createFlightCastAnchor(): FlightCastAnchor { return { index: -1, lastTime: NaN, start: 0, waiting: true }; }

/** Late first loads begin a whole dissolve once available. A new phrase or seek
 * invalidates the delayed anchor; already-cached seek samples use score time. */
export function updateFlightCastAnchor(state: FlightCastAnchor, index: number, sectionStart: number, time: number, ready: boolean) {
  const seek = Number.isFinite(state.lastTime) && (time < state.lastTime - 0.001 || time - state.lastTime > 1.5);
  if (state.index !== index || seek) {
    state.index = index; state.start = sectionStart; state.waiting = !ready;
  } else if (state.waiting && ready) {
    state.start = Math.max(sectionStart, time); state.waiting = false;
  }
  state.lastTime = time;
  return state.start;
}
