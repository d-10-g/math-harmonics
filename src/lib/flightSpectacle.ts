import { buildFlightLinks } from './flightFireworks';
import type { PrismScoreData } from './prismTrail';

export const SPECTACLE_LIFETIMES = Object.freeze({ lightning: 3.2, petals: 8, bubbles: 9 });
export const SPECTACLE_BUDGETS = Object.freeze({
  desktop: { lightning: 72, petals: 20, bubbles: 18 },
  xr: { lightning: 40, petals: 12, bubbles: 10 },
});

/** Discharges never leap across a long rest or the opposite side of the score. */
export function buildLightningLinks(data: PrismScoreData) {
  const links = buildFlightLinks(data), selected: number[] = [];
  for (let i = 0; i < links.birth.length; i++) {
    const a = links.from[i], b = links.to[i], m = a * 16, n = b * 16;
    const distance = Math.hypot(data.matrices[n + 12] - data.matrices[m + 12],
      data.matrices[n + 13] - data.matrices[m + 13], data.matrices[n + 14] - data.matrices[m + 14]);
    if (data.birth[b] - data.birth[a] <= 2 && distance <= 24) selected.push(i);
  }
  return {
    birth: Float32Array.from(selected, i => links.birth[i]),
    from: Int32Array.from(selected, i => links.from[i]),
    to: Int32Array.from(selected, i => links.to[i]),
  };
}

/** Soft attacks leave room for the mesh; releases never strobe or overshoot. */
export function spectacleEnvelope(age: number, life: number) {
  if (!Number.isFinite(age) || !Number.isFinite(life) || age <= 0 || life <= 0 || age >= life) return 0;
  const entrance = Math.min(1, age / 0.22), exit = Math.min(1, (life - age) / 1.2);
  return entrance * entrance * (3 - 2 * entrance) * exit * exit * (3 - 2 * exit);
}

export function bubbleRadius(age: number, energy: number) {
  const t = Number.isFinite(age) ? Math.max(0, age) : 0;
  const velocity = Number.isFinite(energy) ? Math.max(0, Math.min(1, energy)) : 0;
  return (0.45 + 1.1 * (1 - Math.exp(-t * 0.4))) * (0.8 + velocity * 0.4);
}
