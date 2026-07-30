import { WebGPULightingPreset } from '../constants';

// Shared light-rig definitions for BOTH renderer paths (pure data, no three
// imports). The WebGPU view applies them imperatively; the WebGL/XR view
// renders them declaratively — same rig, same look, either backend.

export type LightingRig = {
  background: number;
  ambient: number;
  ground: number;
  key: number;
  rim: number;
  fill: number;
  keyPosition: [number, number, number];
  rimPosition: [number, number, number];
  fillPosition: [number, number, number];
  ambientScale: number;
  hemiScale: number;
  keyScale: number;
  rimScale: number;
  fillScale: number;
};

export function lightingRigSettings(preset: WebGPULightingPreset): LightingRig {
  switch (preset) {
    case 'aurora':
      return {
        background: 0x06111f,
        ambient: 0x85f7d2,
        ground: 0x12051d,
        key: 0xb7ffef,
        rim: 0xd946ef,
        fill: 0x38bdf8,
        keyPosition: [-3.5, 8.0, 7.0],
        rimPosition: [5.5, 2.8, 8.0],
        fillPosition: [-6.0, -2.5, 4.5],
        ambientScale: 0.3,
        hemiScale: 0.62,
        keyScale: 1.55,
        rimScale: 18.0,
        fillScale: 7.0
      };
    case 'gallery':
      return {
        background: 0x0b0b0a,
        ambient: 0xf8fafc,
        ground: 0x1f2937,
        key: 0xffffff,
        rim: 0xf59e0b,
        fill: 0xa78bfa,
        keyPosition: [0.0, 9.0, 6.0],
        rimPosition: [-7.0, 3.5, 6.0],
        fillPosition: [6.0, -2.0, 5.0],
        ambientScale: 0.46,
        hemiScale: 0.5,
        keyScale: 2.5,
        rimScale: 8.0,
        fillScale: 4.2
      };
    case 'eclipse':
      return {
        background: 0x02030a,
        ambient: 0x3b82f6,
        ground: 0x050505,
        key: 0x60a5fa,
        rim: 0xff3d81,
        fill: 0x22d3ee,
        keyPosition: [-7.0, 1.2, 9.0],
        rimPosition: [7.5, 0.2, 8.5],
        fillPosition: [0.0, -5.0, 6.0],
        ambientScale: 0.18,
        hemiScale: 0.28,
        keyScale: 1.1,
        rimScale: 26.0,
        fillScale: 3.8
      };
    case 'caustic':
      return {
        background: 0x031414,
        ambient: 0xa7f3d0,
        ground: 0x082f49,
        key: 0x67e8f9,
        rim: 0xf0fdfa,
        fill: 0x2dd4bf,
        keyPosition: [3.0, 7.5, 8.5],
        rimPosition: [-4.0, 4.0, 8.0],
        fillPosition: [6.0, -3.4, 5.5],
        ambientScale: 0.34,
        hemiScale: 0.78,
        keyScale: 1.9,
        rimScale: 16.0,
        fillScale: 9.5
      };
    case 'noir':
      return {
        background: 0x020204,
        ambient: 0x9ca3af,
        ground: 0x050505,
        key: 0xe5e7eb,
        rim: 0xef4444,
        fill: 0x60a5fa,
        keyPosition: [-4.5, 7.5, 7.5],
        rimPosition: [6.5, 1.5, 6.8],
        fillPosition: [-6.0, -3.5, 4.5],
        ambientScale: 0.12,
        hemiScale: 0.18,
        keyScale: 2.0,
        rimScale: 22.0,
        fillScale: 2.8
      };
    case 'sunset':
      return {
        background: 0x1c0808,
        ambient: 0xffc48c,
        ground: 0x30133a,
        key: 0xffb86b,
        rim: 0xfb7185,
        fill: 0x818cf8,
        keyPosition: [7.5, 2.8, 8.0],
        rimPosition: [-6.5, 4.2, 7.0],
        fillPosition: [-2.0, -4.0, 5.2],
        ambientScale: 0.34,
        hemiScale: 0.48,
        keyScale: 2.6,
        rimScale: 14.0,
        fillScale: 5.8
      };
    case 'laboratory':
      return {
        background: 0x06131a,
        ambient: 0xc7f9ff,
        ground: 0x0f172a,
        key: 0xf8fafc,
        rim: 0x22d3ee,
        fill: 0xa7f3d0,
        keyPosition: [0.0, 8.8, 5.2],
        rimPosition: [-5.5, 4.8, 6.0],
        fillPosition: [5.5, -2.2, 4.8],
        ambientScale: 0.52,
        hemiScale: 0.7,
        keyScale: 2.2,
        rimScale: 10.5,
        fillScale: 8.4
      };
    case 'underlight':
      return {
        background: 0x030712,
        ambient: 0x38bdf8,
        ground: 0x000000,
        key: 0x67e8f9,
        rim: 0xf0abfc,
        fill: 0x34d399,
        keyPosition: [1.0, -6.5, 7.0],
        rimPosition: [-6.8, 2.2, 7.5],
        fillPosition: [6.6, -4.8, 5.0],
        ambientScale: 0.16,
        hemiScale: 0.24,
        keyScale: 2.9,
        rimScale: 18.5,
        fillScale: 12.0
      };
    case 'prism':
      return {
        background: 0x070711,
        ambient: 0xdbeafe,
        ground: 0x111827,
        key: 0xff4d8d,
        rim: 0x22d3ee,
        fill: 0xfacc15,
        keyPosition: [5.5, 5.4, 8.2],
        rimPosition: [-6.0, 3.8, 8.0],
        fillPosition: [0.4, -5.8, 6.2],
        ambientScale: 0.28,
        hemiScale: 0.42,
        keyScale: 2.15,
        rimScale: 16.5,
        fillScale: 10.0
      };
    case 'studio':
    default:
      return {
        background: 0x07090d,
        ambient: 0xa9b8ff,
        ground: 0x17121d,
        key: 0xffffff,
        rim: 0x22d3ee,
        fill: 0xff8bd5,
        keyPosition: [5.0, 7.0, 10.0],
        rimPosition: [-6.0, 2.5, 8.0],
        fillPosition: [6.0, -3.0, 7.0],
        ambientScale: 0.22,
        hemiScale: 0.32,
        keyScale: 2.3,
        rimScale: 16.0,
        fillScale: 4.6
      };
  }
}
