import { fireworkRandom } from './flightFireworks';

export const PHENOMENA_LIFETIMES = Object.freeze({ ribbons: 10, crystals: 9, vortexes: 10 });
export const PHENOMENA_BUDGETS = Object.freeze({
  desktop: { ribbons: 18, crystals: 22, vortexes: 18 },
  xr: { ribbons: 10, crystals: 14, vortexes: 10 },
});

export function phenomenaEnvelope(age: number, life: number) {
  if (!Number.isFinite(age) || !Number.isFinite(life) || age <= 0 || life <= 0 || age >= life) return 0;
  const entrance = Math.min(1, age / 0.35), exit = Math.min(1, (life - age) / 1.6);
  return entrance * entrance * (3 - 2 * entrance) * exit * exit * (3 - 2 * exit);
}

/** The opposite strip edges meet after one full turn: p(2π,v)=p(0,-v). */
export function mobiusPoint(angle: number, across: number, phase: number, energy: number): [number, number, number] {
  const u = Number.isFinite(angle) ? angle : 0, v = Number.isFinite(across) ? Math.max(-1, Math.min(1, across)) : 0;
  const turn = Number.isFinite(phase) ? phase : 0, strength = Number.isFinite(energy) ? Math.max(0, Math.min(1, energy)) : 0;
  const width = 0.25 + strength * 0.08, radius = 1.15 + strength * 0.2 + v * width * Math.cos(u * 0.5 + turn);
  return [Math.cos(u) * radius, Math.sin(u) * radius, v * width * Math.sin(u * 0.5 + turn)];
}

/** Icosahedral growth directions give a compact, truly three-dimensional geode. */
export function crystalDirections(): [number, number, number][] {
  const t = (1 + Math.sqrt(5)) / 2;
  const directions = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
  return directions.map(direction => {
    const length = Math.hypot(...direction);
    return direction.map(value => value / length) as [number, number, number];
  });
}

export const crystalLength = (branch: number) => 1.15 + fireworkRandom(branch, 0, 4721) * 0.55;
