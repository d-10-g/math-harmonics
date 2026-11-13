import type { PrismScoreData } from './prismTrail';

export const SCULPTURE_LIFETIMES = Object.freeze({ auroras: 12, constellations: 8.5, gyroscopes: 7 });
export const SCULPTURE_BUDGETS = Object.freeze({
  desktop: { auroras: 24, constellations: 144, gyroscopes: 28 },
  xr: { auroras: 14, constellations: 88, gyroscopes: 16 },
});
export const CHORD_LINK_WINDOW = 0.36;
export const CHORD_LINK_NEIGHBORS = 3;

export type ChordLinkData = { birth: Float32Array; from: Int32Array; to: Int32Array };

/** Close attacks on different instruments weave a chord, rather than bridging rests. */
export function buildChordLinks(data: PrismScoreData): ChordLinkData {
  const latest = new Map<number, number>();
  const birth: number[] = [], from: number[] = [], to: number[] = [];
  for (let note = 0; note < data.count; note++) {
    const candidates: { note: number; distance: number }[] = [];
    const at = note * 16;
    for (const [channel, before] of latest) {
      if (channel === data.channels[note]) continue;
      const age = data.birth[note] - data.birth[before];
      if (age < 0 || age > CHORD_LINK_WINDOW) continue;
      const earlier = before * 16;
      const distance = Math.hypot(data.matrices[at + 12] - data.matrices[earlier + 12],
        data.matrices[at + 13] - data.matrices[earlier + 13], data.matrices[at + 14] - data.matrices[earlier + 14]);
      if (Number.isFinite(distance) && distance > 0.08 && distance <= 36) candidates.push({ note: before, distance });
    }
    candidates.sort((a, b) => a.distance - b.distance || a.note - b.note);
    for (const candidate of candidates.slice(0, CHORD_LINK_NEIGHBORS)) {
      birth.push(data.birth[note]); from.push(candidate.note); to.push(note);
    }
    latest.set(data.channels[note], note);
  }
  return { birth: Float32Array.from(birth), from: Int32Array.from(from), to: Int32Array.from(to) };
}

/** Bounded absolute-time opacity shared with the shader's soft entrance/exit. */
export function sculptureEnvelope(age: number, lifetime: number): number {
  if (!Number.isFinite(age) || !Number.isFinite(lifetime) || lifetime <= 0 || age <= 0 || age >= lifetime) return 0;
  const entrance = Math.min(1, age / 0.4);
  const exit = Math.min(1, (lifetime - age) / 1.6);
  return entrance * entrance * (3 - 2 * entrance) * exit * exit * (3 - 2 * exit);
}
