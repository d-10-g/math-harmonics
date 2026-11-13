import type { WebGPULightingPreset } from '../constants';
import { FLIGHT_SHOWCASES, normalizeFlightEffects, type FlightShowcase } from './flightEffects';
import { normalizePrismChannels, type PrismChannelMap } from './prismChannels';
import type { PrismFinish } from './prismTrail';
import type { PrismColorMode } from './urlState';

type Scene = {
  channels: PrismChannelMap;
  lighting: WebGPULightingPreset;
  finish: PrismFinish;
  spread: number;
  memory: number;
  bloom: number;
  color: PrismColorMode;
};

export const FLIGHT_SCENES: Record<FlightShowcase, Scene> = {
  supernova: {
    channels: {
      0: { kind: 'shape', shape: 'crystal', material: 'gold' },
      1: { kind: 'obj', asset: 'Star.obj', material: 'spectrum' },
      2: { kind: 'glb', asset: 'Kira_model.glb', material: 'ornament', movement: 'Kira_27_Question_mark_tail' },
      3: { kind: 'shape', shape: 'sphere', material: 'ruby' },
    },
    lighting: 'sunset', finish: 'ornament', spread: 1.1, memory: 25, bloom: 0.5, color: 'chroma',
  },
  'neon-highway': {
    channels: {
      0: { kind: 'shape', shape: 'torus', material: 'neon' },
      1: { kind: 'obj', asset: 'Torus.obj', material: 'spectrum' },
      2: { kind: 'glb', asset: 'Ernie_model.glb', material: 'liquid-metal', movement: '25_Tail_left' },
      3: { kind: 'shape', shape: 'spectrum', material: 'spectrum' },
    },
    lighting: 'prism', finish: 'spectrum', spread: 0.8, memory: 35, bloom: 0.45, color: 'pitch',
  },
  'cosmic-jelly': {
    channels: {
      0: { kind: 'shape', shape: 'sphere', material: 'dichroic' },
      1: { kind: 'obj', asset: 'Blob.obj', material: 'stained-glass' },
      2: { kind: 'glb', asset: 'Kira_model.glb', material: 'glass', movement: 'Kira_29_Tail_ribbon_left' },
      3: { kind: 'shape', shape: 'knot', material: 'pearl' },
    },
    lighting: 'aurora', finish: 'glass', spread: 0.7, memory: 25, bloom: 0.3, color: 'length',
  },
  stargate: {
    channels: {
      0: { kind: 'shape', shape: 'torus', material: 'gold' },
      1: { kind: 'obj', asset: 'Twistytorus.obj', material: 'dichroic' },
      2: { kind: 'glb', asset: 'Ernie_model.glb', material: 'chrome', movement: '09_Left_ear_flick' },
      3: { kind: 'shape', shape: 'knot', material: 'spectrum' },
    },
    lighting: 'prism', finish: 'ornament', spread: 1.2, memory: 30, bloom: 0.45, color: 'chroma',
  },
  'aurora-dream': {
    channels: {
      0: { kind: 'shape', shape: 'knot', material: 'hologram' },
      1: { kind: 'obj', asset: 'Thaidrop.obj', material: 'ice' },
      2: { kind: 'glb', asset: 'Kira_model.glb', material: 'pearl', movement: 'Kira_30_Tail_ribbon_right' },
      3: { kind: 'shape', shape: 'sphere', material: 'jade' },
    },
    lighting: 'aurora', finish: 'glass', spread: 1, memory: 30, bloom: 0.35, color: 'pitch',
  },
  'quantum-garden': {
    channels: {
      0: { kind: 'obj', asset: 'Atom.obj', material: 'hologram' },
      1: { kind: 'shape', shape: 'crystal', material: 'jade' },
      2: { kind: 'glb', asset: 'Ernie_model.glb', material: 'dichroic', movement: '28_Tail_ripple' },
      3: { kind: 'shape', shape: 'sphere', material: 'plasma' },
    },
    lighting: 'caustic', finish: 'glass', spread: 1.1, memory: 25, bloom: 0.3, color: 'chroma',
  },
  'clockwork-nebula': {
    channels: {
      0: { kind: 'obj', asset: 'Gear.obj', material: 'copper' },
      1: { kind: 'shape', shape: 'torus', material: 'gold' },
      2: { kind: 'glb', asset: 'Kira_model.glb', material: 'ornament', movement: 'Kira_12_Both_ears_swivel' },
      3: { kind: 'shape', shape: 'crystal', material: 'chrome' },
    },
    lighting: 'eclipse', finish: 'ornament', spread: 1.2, memory: 30, bloom: 0.4, color: 'length',
  },
  'electric-tempest': {
    channels: {
      0: { kind: 'obj', asset: 'Wireicosahedron.obj', material: 'neon' },
      1: { kind: 'shape', shape: 'knot', material: 'liquid-metal' },
      2: { kind: 'glb', asset: 'Ernie_model.glb', material: 'chrome', movement: '11_Ears_perk' },
      3: { kind: 'shape', shape: 'crystal', material: 'plasma' },
    },
    lighting: 'underlight', finish: 'spectrum', spread: 1.1, memory: 25, bloom: 0.4, color: 'pitch',
  },
  'prism-bloom': {
    channels: {
      0: { kind: 'obj', asset: 'Stellateddodecahedron.obj', material: 'spectrum' },
      1: { kind: 'shape', shape: 'crystal', material: 'ruby' },
      2: { kind: 'glb', asset: 'Kira_model.glb', material: 'gold', movement: 'Kira_01_Golden_hello' },
      3: { kind: 'shape', shape: 'torus', material: 'dichroic' },
    },
    lighting: 'prism', finish: 'glass', spread: 1, memory: 30, bloom: 0.35, color: 'chroma',
  },
  'bubble-ballet': {
    channels: {
      0: { kind: 'shape', shape: 'sphere', material: 'dichroic' },
      1: { kind: 'obj', asset: 'Dish.obj', material: 'glass' },
      2: { kind: 'glb', asset: 'Ernie_model.glb', material: 'pearl', movement: '29_Shoulder_sway' },
      3: { kind: 'shape', shape: 'torus', material: 'ice' },
    },
    lighting: 'gallery', finish: 'glass', spread: 0.9, memory: 25, bloom: 0.25, color: 'length',
  },
  'mobius-dream': {
    channels: {
      0: { kind: 'shape', shape: 'knot', material: 'liquid-metal' },
      1: { kind: 'obj', asset: 'Twistytorus.obj', material: 'spectrum' },
      2: { kind: 'glb', asset: 'Kira_model.glb', material: 'hologram', movement: 'Kira_29_Tail_ribbon_left' },
      3: { kind: 'shape', shape: 'crystal', material: 'stained-glass' },
    },
    lighting: 'prism', finish: 'glass', spread: 0.8, memory: 30, bloom: 0.3, color: 'pitch',
  },
  'crystal-galaxy': {
    channels: {
      0: { kind: 'shape', shape: 'crystal', material: 'dichroic' },
      1: { kind: 'obj', asset: 'Icosahedron.obj', material: 'ice' },
      2: { kind: 'glb', asset: 'Ernie_model.glb', material: 'chrome', movement: '09_Left_ear_flick' },
      3: { kind: 'shape', shape: 'sphere', material: 'pearl' },
    },
    lighting: 'laboratory', finish: 'glass', spread: 1.1, memory: 25, bloom: 0.3, color: 'chroma',
  },
  'event-horizon': {
    channels: {
      0: { kind: 'shape', shape: 'torus', material: 'gold' },
      1: { kind: 'obj', asset: 'Atom.obj', material: 'obsidian' },
      2: { kind: 'glb', asset: 'Kira_model.glb', material: 'copper', movement: 'Kira_27_Question_mark_tail' },
      3: { kind: 'shape', shape: 'sphere', material: 'ruby' },
    },
    lighting: 'eclipse', finish: 'ornament', spread: 1.2, memory: 30, bloom: 0.35, color: 'length',
  },
};

export function flightScene(id: FlightShowcase) {
  return {
    ...FLIGHT_SCENES[id],
    channels: normalizePrismChannels(FLIGHT_SCENES[id].channels),
    effects: normalizeFlightEffects(FLIGHT_SHOWCASES.find(showcase => showcase.id === id)!.effects),
  };
}
