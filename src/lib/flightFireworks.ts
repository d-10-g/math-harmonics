import { prismLowerBound, type PrismScoreData } from './prismTrail';

export const FIREWORK_LIFETIMES = Object.freeze({ bursts: 2.6, shockwaves: 2.4, lasers: 1.8, tracers: 11 });
export const FIREWORK_BUDGETS = Object.freeze({
  desktop: { particlesPerNote: 14, bursts: 112, shockwaves: 56, lasers: 112, tracers: 224 },
  xr: { particlesPerNote: 9, bursts: 72, shockwaves: 32, lasers: 72, tracers: 128 },
});

/** Stable integer hash: effects rewind to exactly the same constellation. */
export function fireworkRandom(note: number, particle: number, salt = 0): number {
  let value = Math.imul(note + 1, 0x9e3779b1) ^ Math.imul(particle + 1, 0x85ebca6b) ^ salt;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

export function fireworkDirection(note: number, particle: number): [number, number, number] {
  const y = fireworkRandom(note, particle, 491) * 2 - 1;
  const angle = fireworkRandom(note, particle, 8731) * Math.PI * 2;
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
}

export function fireworkWindow(birth: ArrayLike<number>, time: number, lifetime: number, limit: number) {
  const now = Number.isFinite(time) ? Math.max(0, time) : 0;
  const end = prismLowerBound(birth, now, true);
  const start = Math.max(prismLowerBound(birth, now - lifetime), end - Math.max(0, Math.floor(limit)));
  return { start, end };
}

export function fireworkEnvelope(age: number, lifetime: number): number {
  if (!Number.isFinite(age) || !Number.isFinite(lifetime) || lifetime <= 0 || age <= 0 || age >= lifetime) return 0;
  const attack = Math.min(1, age / 0.08);
  return attack * Math.pow(1 - age / lifetime, 1.5);
}

export type FlightLinkData = { birth: Float32Array; from: Int32Array; to: Int32Array };

/** Consecutive notes link only within their own channel; rests break the beam. */
export function buildFlightLinks(data: PrismScoreData): FlightLinkData {
  const previous = new Map<number, number>();
  const from: number[] = [], to: number[] = [], birth: number[] = [];
  for (let index = 0; index < data.count; index++) {
    const channel = data.channels[index], before = previous.get(channel);
    if (before !== undefined) {
      const gap = data.birth[index] - data.birth[before];
      const a = before * 16, b = index * 16;
      const distance = Math.hypot(data.matrices[b + 12] - data.matrices[a + 12],
        data.matrices[b + 13] - data.matrices[a + 13], data.matrices[b + 14] - data.matrices[a + 14]);
      if (gap > 0.001 && gap <= 4 && distance > 0.04 && Number.isFinite(distance)) {
        from.push(before); to.push(index); birth.push(data.birth[index]);
      }
    }
    previous.set(channel, index);
  }
  return { birth: Float32Array.from(birth), from: Int32Array.from(from), to: Int32Array.from(to) };
}
