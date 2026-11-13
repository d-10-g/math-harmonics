export type FlightMotion = 'none' | 'orbit' | 'vortex' | 'wave' | 'breathe' | 'helix' | 'butterfly';

export type FlightEffectsSettings = {
  bursts: number;
  shockwaves: number;
  lasers: number;
  tracers: number;
  auroras: number;
  constellations: number;
  gyroscopes: number;
  lightning: number;
  petals: number;
  bubbles: number;
  motion: FlightMotion;
  motionAmount: number;
  morph: number;
};

export const FLIGHT_MOTIONS: ReadonlyArray<readonly [FlightMotion, string]> = [
  ['none', 'Still'], ['orbit', 'Satellite orbits'], ['vortex', 'Vortex spin'],
  ['wave', 'Sine-wave surfing'], ['breathe', 'Breathing pulse'],
  ['helix', 'Corkscrew flight'], ['butterfly', 'Butterfly figure eight'],
];

export const DEFAULT_FLIGHT_EFFECTS: Readonly<FlightEffectsSettings> = Object.freeze({
  bursts: 0, shockwaves: 0, lasers: 0, tracers: 0, auroras: 0, constellations: 0, gyroscopes: 0,
  lightning: 0, petals: 0, bubbles: 0,
  motion: 'none', motionAmount: 1, morph: 0,
});

/** Settings from old links or edited storage always produce a complete, bounded scene. */
export function normalizeFlightEffects(value: unknown): FlightEffectsSettings {
  const saved = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  const bounded = (key: Exclude<keyof FlightEffectsSettings, 'motion'>, max: number) => {
    const v = saved[key];
    return typeof v === 'number' && Number.isFinite(v)
      ? Math.max(0, Math.min(max, v)) : DEFAULT_FLIGHT_EFFECTS[key];
  };
  return {
    bursts: bounded('bursts', 2), shockwaves: bounded('shockwaves', 2),
    lasers: bounded('lasers', 2), tracers: bounded('tracers', 2),
    auroras: bounded('auroras', 2), constellations: bounded('constellations', 2), gyroscopes: bounded('gyroscopes', 2),
    lightning: bounded('lightning', 2), petals: bounded('petals', 2), bubbles: bounded('bubbles', 2),
    motion: FLIGHT_MOTIONS.some(([id]) => id === saved.motion) ? saved.motion as FlightMotion : 'none',
    motionAmount: bounded('motionAmount', 2), morph: bounded('morph', 1),
  };
}

export type FlightShowcase = 'supernova' | 'neon-highway' | 'cosmic-jelly' | 'stargate'
  | 'aurora-dream' | 'quantum-garden' | 'clockwork-nebula'
  | 'electric-tempest' | 'prism-bloom' | 'bubble-ballet';
export type FlightShowcasePreset = {
  id: FlightShowcase;
  label: string;
  description: string;
  effects: Readonly<FlightEffectsSettings>;
};

export const FLIGHT_SHOWCASES: readonly FlightShowcasePreset[] = [
  {
    id: 'supernova', label: 'Supernova', description: 'Starbursts and expanding halos',
    effects: Object.freeze({ ...DEFAULT_FLIGHT_EFFECTS, bursts: 1.3, shockwaves: 1.1, lasers: 0.25, tracers: 0.4, motion: 'orbit', motionAmount: 0.65, morph: 0.2 }),
  },
  {
    id: 'neon-highway', label: 'Neon Highway', description: 'Laser filaments and flowing traces',
    effects: Object.freeze({ ...DEFAULT_FLIGHT_EFFECTS, bursts: 0.2, shockwaves: 0.25, lasers: 1.3, tracers: 1.4, motion: 'wave', motionAmount: 0.7, morph: 0.15 }),
  },
  {
    id: 'cosmic-jelly', label: 'Cosmic Jelly', description: 'Liquid shapes and breathing motion',
    effects: Object.freeze({ ...DEFAULT_FLIGHT_EFFECTS, bursts: 0.25, shockwaves: 0.4, lasers: 0.15, tracers: 0.65, motion: 'breathe', motionAmount: 1.15, morph: 0.9 }),
  },
  {
    id: 'stargate', label: 'Stargate', description: 'Vortex flight through luminous rings',
    effects: Object.freeze({ ...DEFAULT_FLIGHT_EFFECTS, bursts: 0.45, shockwaves: 1.35, lasers: 0.7, tracers: 0.9, motion: 'vortex', motionAmount: 1.05, morph: 0.45 }),
  },
  {
    id: 'aurora-dream', label: 'Aurora Dream', description: 'Silk curtains on corkscrew flights',
    effects: Object.freeze({ ...DEFAULT_FLIGHT_EFFECTS, auroras: 1.1, constellations: 0.35, tracers: 0.5, motion: 'helix', motionAmount: 0.8, morph: 0.25 }),
  },
  {
    id: 'quantum-garden', label: 'Quantum Garden', description: 'Chords weave luminous constellations',
    effects: Object.freeze({ ...DEFAULT_FLIGHT_EFFECTS, constellations: 1.15, auroras: 0.35, bursts: 0.2, motion: 'butterfly', motionAmount: 0.9, morph: 0.5 }),
  },
  {
    id: 'clockwork-nebula', label: 'Clockwork Nebula', description: 'Orbiting gyroscopes and clockwork metals',
    effects: Object.freeze({ ...DEFAULT_FLIGHT_EFFECTS, gyroscopes: 1.2, constellations: 0.35, lasers: 0.2, motion: 'helix', motionAmount: 0.75, morph: 0.1 }),
  },
  {
    id: 'electric-tempest', label: 'Electric Tempest', description: 'Branching plasma in a chrome storm',
    effects: Object.freeze({ ...DEFAULT_FLIGHT_EFFECTS, lightning: 1.25, bursts: 0.3, tracers: 0.5, motion: 'vortex', motionAmount: 0.85, morph: 0.2 }),
  },
  {
    id: 'prism-bloom', label: 'Prism Bloom', description: 'Folded spectral flowers open in space',
    effects: Object.freeze({ ...DEFAULT_FLIGHT_EFFECTS, petals: 1.2, auroras: 0.2, constellations: 0.3, motion: 'butterfly', motionAmount: 0.8, morph: 0.4 }),
  },
  {
    id: 'bubble-ballet', label: 'Bubble Ballet', description: 'Iridescent soap films and drifting pearls',
    effects: Object.freeze({ ...DEFAULT_FLIGHT_EFFECTS, bubbles: 1.1, gyroscopes: 0.2, tracers: 0.35, motion: 'helix', motionAmount: 0.7, morph: 0.25 }),
  },
];
