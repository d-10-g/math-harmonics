import type { PrismScoreData } from './prismTrail';
import { selectGlbFlightNotes, type GlbFlightChannelIndex } from './glbFlight';

export const MIXED_FLIGHT_LIMIT = 48;
export const MIXED_FLIGHT_XR_LIMIT = 24;
export type MixedFlightCost = { vertices: number; skinned: boolean };
export type MixedFlightBudget = { objects: number; vertices: number; skinnedVertices: number };

export function mixedFlightBudget(xr: boolean): MixedFlightBudget {
  return { objects: xr ? MIXED_FLIGHT_XR_LIMIT : MIXED_FLIGHT_LIMIT,
    vertices: xr ? 1_000_000 : 2_000_000, skinnedVertices: xr ? 250_000 : 500_000 };
}

// Fair, active-first candidate ordering comes from the same exact-time
// selector as animated flight. Charge each selected channel's actual mesh
// cost, so one detailed sculpture cannot shrink every other channel's pool.
export function selectMixedFlightNotes(data: PrismScoreData, groups: GlbFlightChannelIndex[], time: number,
  length: number, costs: ReadonlyMap<number, MixedFlightCost>, budget: MixedFlightBudget): number[] {
  const candidates = selectGlbFlightNotes(data, groups, time, length,
    Math.max(budget.objects, budget.objects * groups.length));
  const selected: number[] = [];
  let vertices = 0, skinnedVertices = 0;
  for (const index of candidates) {
    if (selected.length >= budget.objects) break;
    const cost = costs.get(data.channels[index]) ?? { vertices: 24, skinned: false };
    const amount = Math.max(1, Number.isFinite(cost.vertices) ? Math.ceil(cost.vertices) : budget.vertices + 1);
    if (vertices + amount > budget.vertices || (cost.skinned && skinnedVertices + amount > budget.skinnedVertices)) continue;
    selected.push(index);
    vertices += amount;
    if (cost.skinned) skinnedVertices += amount;
  }
  return selected;
}
