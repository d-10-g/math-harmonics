/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three/webgpu';
import { color, float, mix, mx_noise_float, positionWorld, smoothstep, time as tslTime } from 'three/tsl';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { compile } from 'mathjs';
import {
  Formula,
  FormulaGeometryMode,
  ShaderPreset,
  WebGPUGeometryProfile,
  WebGPULightingPreset,
  WebGPUMaterialProfile
} from '../constants';
import { getClockTime, reportVerts } from '../lib/clock';
import { lightingRigSettings } from '../lib/lighting';
import { buildParametricGeometry, surfaceMidQ } from '../lib/parametricSurface';

type WebGPUViewProps = {
  formula: Formula;
  shader: ShaderPreset;
  show3D: boolean;
  showWireframe: boolean;
  showArtifacts: boolean;
  showMirrors: boolean;
  webgpuLighting: number;
  webgpuLightingPreset: WebGPULightingPreset;
  webgpuGeometry: WebGPUGeometryProfile;
  webgpuMaterial: WebGPUMaterialProfile;
  speed: number;
  isPlaying: boolean;
};

type CompiledFormula = {
  valid: boolean;
  x?: any;
  y?: any;
  z?: any;
};

type WebGPURefs = {
  renderer: THREE.WebGPURenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  contentGroup: THREE.Group;
  mesh: THREE.Mesh;
  extras: THREE.Group;
  mirrors: THREE.Group;
  material: THREE.MeshStandardNodeMaterial;
  geometry: THREE.BufferGeometry;
  ambientLight: THREE.AmbientLight;
  hemiLight: THREE.HemisphereLight;
  keyLight: THREE.DirectionalLight;
  rimLight: THREE.PointLight;
  fillLight: THREE.PointLight;
  resizeObserver: ResizeObserver;
  xrInputSources: Map<number, XRInputSource>;
  xrControllerCleanup: Array<() => void>;
  isXRPresenting: boolean;
};

type WebGPUXRStatus = 'checking' | 'available' | 'unavailable' | 'starting' | 'presenting';

// Match the WebGL path's curve domain: p spans [0, 8pi] so multi-loop
// presets (torus knots, Mobius edges) close instead of being cut short.
const POINT_COUNT = 320;
const TWO_TURNS = Math.PI * 8;
const WEBGPU_XR_REQUEST_EVENT = 'math-harmonics:webgpu-xr-request';
const WEBGPU_XR_UNAVAILABLE_EVENT = 'math-harmonics:webgpu-xr-unavailable';
const WEBGPU_CAPTURE_EVENT = 'math-harmonics:webgpu-capture';
const WEBGPU_XR_DEADZONE = 0.18;
const WEBGPU_XR_START_TIMEOUT_MS = 8000;
const WEBGPU_XR_DEFAULT_SCALE = 0.48;
const WEBGPU_XR_DEFAULT_Y = 1.25;
const WEBGPU_XR_DEFAULT_Z = -4.2;
const GEOMETRY_MODES: FormulaGeometryMode[] = [
  'tube',
  'ribbon',
  'surface',
  'lathe',
  'crystal',
  'extrude',
  'helix',
  'shell',
  'terrain',
  'constellation',
  'knot',
  'mandala',
  'lattice',
  'ripple',
  'prism',
  'vortex'
];
const MATERIAL_PROFILES: Exclude<WebGPUMaterialProfile, 'auto'>[] = [
  'plasma',
  'liquid-metal',
  'pearl',
  'glass',
  'velvet',
  'ceramic',
  'hologram',
  'obsidian',
  'copper',
  'jade',
  'xray',
  'carbon',
  'chrome',
  'ruby',
  'ice',
  'neon'
];

function hashText(text: string) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function paletteForShader(shader: ShaderPreset) {
  const key = `${shader.category || 'Core'}:${shader.id}:${shader.name}`;
  const seed = hashText(key);
  const palettes = [
    [0x06121f, 0x22d3ee, 0xf472b6],
    [0x100724, 0x8b5cf6, 0x2dd4bf],
    [0x170812, 0xfb7185, 0xfacc15],
    [0x071a12, 0x34d399, 0x60a5fa],
    [0x111827, 0xe5e7eb, 0xa78bfa],
    [0x180f06, 0xf59e0b, 0x38bdf8]
  ];

  if (shader.category === 'Audio-reactive shaders') return [0x050510, 0x22d3ee, 0xf472b6];
  if (shader.category === 'R185 TSL Lab shaders') return [0x07051a, 0x8b5cf6, 0x22d3ee];
  if (shader.id === 'webgpu-tsl-solar-granulation') return [0x1a0700, 0xff7a18, 0xfff2a3];
  if (shader.id === 'webgpu-tsl-neural-rain') return [0x03110d, 0x22c55e, 0x67e8f9];
  if (shader.id === 'webgpu-tsl-opal-depth') return [0x111827, 0x93c5fd, 0xf9a8d4];
  if (shader.id === 'webgpu-tsl-lava-suture') return [0x170707, 0xef4444, 0xfacc15];
  if (shader.id === 'webgpu-tsl-cryosphere') return [0x06111f, 0x38bdf8, 0xe0f2fe];
  if (shader.id === 'webgpu-tsl-biome-weave') return [0x04140b, 0x34d399, 0xfef08a];
  if (shader.id === 'webgpu-tsl-circuit-bloom') return [0x020617, 0x22d3ee, 0xa78bfa];
  if (shader.id === 'webgpu-tsl-nebula-foam') return [0x12051f, 0xf472b6, 0x60a5fa];
  if (shader.id === 'webgpu-tsl-carbon-spark') return [0x030303, 0x64748b, 0xf97316];
  if (shader.id === 'webgpu-tsl-quartz-resonator') return [0x07111f, 0xbae6fd, 0xffffff];
  if (shader.category === 'WebGPU TSL shaders') return [0x06111f, 0x38bdf8, 0xf472b6];
  if (shader.category === 'Volumetric harmonic fields') return [0x031415, 0x2dd4bf, 0xf59e0b];
  if (shader.category === 'HTMLTexture scene shaders') return [0x06111f, 0x38bdf8, 0xa7f3d0];
  if (shader.category === 'WebGPU XR lighting shaders') return [0x0b1020, 0x60a5fa, 0xfbbf24];

  return palettes[seed % palettes.length];
}

function geometryModeForFormula(formula: Formula, show3D: boolean, webgpuGeometry: WebGPUGeometryProfile): FormulaGeometryMode {
  if (!show3D) return 'ribbon';
  if (webgpuGeometry !== 'auto') return webgpuGeometry;
  if (formula.geometryMode) return formula.geometryMode;

  return GEOMETRY_MODES[hashText(`${formula.id}:${formula.name}`) % GEOMETRY_MODES.length];
}

export function webgpuMaterialLabel(profile: WebGPUMaterialProfile) {
  if (profile === 'auto') return 'Shader Mapped';
  return profile
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function resolveMaterialProfile(shader: ShaderPreset, profile: WebGPUMaterialProfile): Exclude<WebGPUMaterialProfile, 'auto'> {
  if (profile !== 'auto') return profile;
  if (shader.id === 'webgpu-tsl-solar-granulation') return 'copper';
  if (shader.id === 'webgpu-tsl-neural-rain') return 'hologram';
  if (shader.id === 'webgpu-tsl-opal-depth') return 'pearl';
  if (shader.id === 'webgpu-tsl-lava-suture') return 'obsidian';
  if (shader.id === 'webgpu-tsl-cryosphere') return 'xray';
  if (shader.id === 'webgpu-tsl-biome-weave') return 'jade';
  if (shader.id === 'webgpu-tsl-circuit-bloom') return 'neon';
  if (shader.id === 'webgpu-tsl-nebula-foam') return 'ruby';
  if (shader.id === 'webgpu-tsl-carbon-spark') return 'carbon';
  if (shader.id === 'webgpu-tsl-quartz-resonator') return 'ice';
  if (shader.category === 'Audio-reactive shaders') return 'neon';
  if (shader.category === 'R185 TSL Lab shaders') return 'plasma';
  if (shader.category === 'WebGPU TSL shaders') return 'hologram';
  if (shader.category === 'Volumetric harmonic fields') return 'glass';
  if (shader.category === 'HTMLTexture scene shaders') return 'ceramic';
  if (shader.category === 'WebGPU XR lighting shaders') return 'liquid-metal';

  return MATERIAL_PROFILES[hashText(`${shader.id}:${shader.name}`) % MATERIAL_PROFILES.length];
}

function resetWebGPUXRContent(current: WebGPURefs) {
  current.contentGroup.position.set(0, WEBGPU_XR_DEFAULT_Y, WEBGPU_XR_DEFAULT_Z);
  current.contentGroup.rotation.set(0, 0, 0);
  current.contentGroup.scale.setScalar(WEBGPU_XR_DEFAULT_SCALE);
}

function restoreWebGPUDesktopContent(current: WebGPURefs) {
  current.contentGroup.position.set(0, 0, 0);
  current.contentGroup.rotation.set(0, 0, 0);
  current.contentGroup.scale.setScalar(1);
}

function axisWithDeadzone(value: number | undefined) {
  if (!Number.isFinite(value) || Math.abs(value || 0) < WEBGPU_XR_DEADZONE) return 0;
  return value || 0;
}

function readThumbstickAxes(gamepad?: Gamepad | null) {
  const axes = gamepad?.axes || [];
  const pairs = [
    [2, 3],
    [0, 1]
  ];
  let best = { x: 0, y: 0, magnitude: 0 };

  pairs.forEach(([xIndex, yIndex]) => {
    const x = axisWithDeadzone(axes[xIndex]);
    const y = axisWithDeadzone(axes[yIndex]);
    const magnitude = Math.abs(x) + Math.abs(y);
    if (magnitude > best.magnitude) best = { x, y, magnitude };
  });

  return best;
}

function hasPressedGamepadButton(gamepad?: Gamepad | null) {
  return Boolean(gamepad?.buttons?.some((button) => button.pressed));
}

function updateWebGPUXRInput(current: WebGPURefs, deltaSeconds: number) {
  if (!current.isXRPresenting) return;

  let moveX = 0;
  let moveY = 0;
  let turnX = 0;
  let scaleY = 0;

  current.xrInputSources.forEach((source) => {
    const axes = readThumbstickAxes(source.gamepad);
    if (axes.magnitude === 0) return;

    if (hasPressedGamepadButton(source.gamepad)) {
      turnX += axes.x;
      scaleY += axes.y;
      return;
    }

    moveX += axes.x;
    moveY += axes.y;
  });

  const moveSpeed = 2.35;
  const transformSpeed = 1.35;
  const zoomSpeed = 0.58;
  const group = current.contentGroup;

  if (moveX !== 0 || moveY !== 0) {
    group.position.x = THREE.MathUtils.clamp(group.position.x - moveX * moveSpeed * deltaSeconds, -8, 8);
    group.position.z = THREE.MathUtils.clamp(group.position.z + -moveY * moveSpeed * deltaSeconds, -10, -1.15);
  }

  if (turnX !== 0) {
    group.rotation.y -= turnX * transformSpeed * deltaSeconds;
  }

  if (scaleY !== 0) {
    const nextScale = THREE.MathUtils.clamp(group.scale.x + -scaleY * zoomSpeed * deltaSeconds, 0.22, 1.6);
    group.scale.setScalar(nextScale);
  }
}

function reportWebGPUXRUnavailable(reason: string) {
  window.dispatchEvent(new CustomEvent(WEBGPU_XR_UNAVAILABLE_EVENT, { detail: { reason } }));
}

function materialSettings(profile: Exclude<WebGPUMaterialProfile, 'auto'>) {
  switch (profile) {
    case 'liquid-metal':
      return { palette: [0x0b1220, 0xb6c7d8, 0xffffff], colorGain: 1.2, emissive: 0.16, roughLow: 0.03, roughHigh: 0.18, metalLow: 0.82, metalHigh: 1.0, opacity: 1, hotMix: 0.46, alpha: false, additive: false };
    case 'pearl':
      return { palette: [0xf8fafc, 0xa5b4fc, 0xf9a8d4], colorGain: 1.34, emissive: 0.14, roughLow: 0.22, roughHigh: 0.58, metalLow: 0.0, metalHigh: 0.08, opacity: 1, hotMix: 0.74, alpha: false, additive: false };
    case 'glass':
      return { palette: [0x06111f, 0x38bdf8, 0xe0f2fe], colorGain: 1.55, emissive: 0.48, roughLow: 0.01, roughHigh: 0.12, metalLow: 0.0, metalHigh: 0.04, opacity: 0.64, hotMix: 0.86, alpha: true, additive: false };
    case 'velvet':
      return { palette: [0x16051a, 0x7c2d12, 0xf0abfc], colorGain: 1.52, emissive: 0.55, roughLow: 0.86, roughHigh: 1.0, metalLow: 0.0, metalHigh: 0.01, opacity: 1, hotMix: 1.0, alpha: false, additive: false };
    case 'ceramic':
      return { palette: [0xf8fafc, 0x94a3b8, 0x22d3ee], colorGain: 1.18, emissive: 0.08, roughLow: 0.52, roughHigh: 0.9, metalLow: 0.0, metalHigh: 0.04, opacity: 1, hotMix: 0.42, alpha: false, additive: false };
    case 'hologram':
      return { palette: [0x03111a, 0x22d3ee, 0xf472b6], colorGain: 1.72, emissive: 1.08, roughLow: 0.02, roughHigh: 0.22, metalLow: 0.0, metalHigh: 0.16, opacity: 0.58, hotMix: 1.18, alpha: true, additive: true };
    case 'obsidian':
      return { palette: [0x020202, 0x1f2937, 0xff2e2e], colorGain: 1.44, emissive: 0.86, roughLow: 0.08, roughHigh: 0.36, metalLow: 0.1, metalHigh: 0.42, opacity: 1, hotMix: 1.08, alpha: false, additive: false };
    case 'copper':
      return { palette: [0x2a1106, 0xc46a28, 0x5eead4], colorGain: 1.36, emissive: 0.28, roughLow: 0.18, roughHigh: 0.48, metalLow: 0.58, metalHigh: 0.96, opacity: 1, hotMix: 0.7, alpha: false, additive: false };
    case 'jade':
      return { palette: [0x052e1c, 0x10b981, 0xd9f99d], colorGain: 1.32, emissive: 0.32, roughLow: 0.18, roughHigh: 0.62, metalLow: 0.0, metalHigh: 0.12, opacity: 0.9, hotMix: 0.82, alpha: true, additive: false };
    case 'xray':
      return { palette: [0x020617, 0x60a5fa, 0xffffff], colorGain: 1.86, emissive: 1.18, roughLow: 0.04, roughHigh: 0.28, metalLow: 0.0, metalHigh: 0.0, opacity: 0.46, hotMix: 1.24, alpha: true, additive: true };
    case 'carbon':
      return { palette: [0x020202, 0x334155, 0xf97316], colorGain: 1.16, emissive: 0.38, roughLow: 0.64, roughHigh: 0.96, metalLow: 0.16, metalHigh: 0.44, opacity: 1, hotMix: 0.78, alpha: false, additive: false };
    case 'chrome':
      return { palette: [0x111827, 0xe5e7eb, 0x93c5fd], colorGain: 1.28, emissive: 0.12, roughLow: 0.01, roughHigh: 0.08, metalLow: 0.92, metalHigh: 1.0, opacity: 1, hotMix: 0.36, alpha: false, additive: false };
    case 'ruby':
      return { palette: [0x2a050b, 0xbe123c, 0xffb4c8], colorGain: 1.5, emissive: 0.54, roughLow: 0.08, roughHigh: 0.34, metalLow: 0.0, metalHigh: 0.08, opacity: 0.82, hotMix: 1.02, alpha: true, additive: false };
    case 'ice':
      return { palette: [0x082f49, 0x7dd3fc, 0xf0f9ff], colorGain: 1.62, emissive: 0.72, roughLow: 0.03, roughHigh: 0.2, metalLow: 0.0, metalHigh: 0.02, opacity: 0.56, hotMix: 1.08, alpha: true, additive: false };
    case 'neon':
      return { palette: [0x050116, 0x22d3ee, 0xf0abfc], colorGain: 1.9, emissive: 1.32, roughLow: 0.04, roughHigh: 0.24, metalLow: 0.0, metalHigh: 0.18, opacity: 0.72, hotMix: 1.3, alpha: true, additive: true };
    case 'plasma':
    default:
      return { palette: [0x12041f, 0x8b5cf6, 0x22d3ee], colorGain: 1.62, emissive: 0.88, roughLow: 0.06, roughHigh: 0.34, metalLow: 0.0, metalHigh: 0.24, opacity: 1, hotMix: 1.0, alpha: false, additive: false };
  }
}

type WebGPUShaderStyle = 'default' | 'solar' | 'neural' | 'opal' | 'lava' | 'cryo' | 'biome' | 'circuit' | 'nebula' | 'carbon' | 'quartz';

function webgpuShaderStyle(shader: ShaderPreset): WebGPUShaderStyle {
  if (shader.id === 'webgpu-tsl-solar-granulation') return 'solar';
  if (shader.id === 'webgpu-tsl-neural-rain') return 'neural';
  if (shader.id === 'webgpu-tsl-opal-depth') return 'opal';
  if (shader.id === 'webgpu-tsl-lava-suture') return 'lava';
  if (shader.id === 'webgpu-tsl-cryosphere') return 'cryo';
  if (shader.id === 'webgpu-tsl-biome-weave') return 'biome';
  if (shader.id === 'webgpu-tsl-circuit-bloom') return 'circuit';
  if (shader.id === 'webgpu-tsl-nebula-foam') return 'nebula';
  if (shader.id === 'webgpu-tsl-carbon-spark') return 'carbon';
  if (shader.id === 'webgpu-tsl-quartz-resonator') return 'quartz';
  return 'default';
}

function compileFormula(formula: Formula): CompiledFormula {
  try {
    return {
      valid: true,
      x: compile(formula.x),
      y: compile(formula.y),
      z: compile(formula.z || 'sin(2 * p + t) * 2')
    };
  } catch (error) {
    console.warn('Unable to compile formula for WebGPU path:', error);
    return { valid: false };
  }
}

function evaluateCompiled(node: any, p: number, t: number, fallback: number, q = 0) {
  try {
    const value = node?.evaluate({ p, t, q });
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function samplePoints(compiled: CompiledFormula, t: number, show3D: boolean, qValue = 0) {
  const points: THREE.Vector3[] = [];

  for (let i = 0; i <= POINT_COUNT; i++) {
    const alpha = i / POINT_COUNT;
    const p = alpha * TWO_TURNS;

    if (compiled.valid) {
      points.push(new THREE.Vector3(
        evaluateCompiled(compiled.x, p, t, Math.cos(p) * 4, qValue),
        evaluateCompiled(compiled.y, p, t, Math.sin(p) * 4, qValue),
        show3D ? evaluateCompiled(compiled.z, p, t, Math.sin(p + t) * 1.5, qValue) : 0
      ));
    } else {
      points.push(new THREE.Vector3(Math.cos(p) * 4, Math.sin(p) * 4, show3D ? Math.sin(p * 3 + t) : 0));
    }
  }

  const bounds = new THREE.Box3().setFromPoints(points);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z, 1);
  const scale = 11 / maxDimension;

  return points.map((point) => point.sub(center).multiplyScalar(scale));
}

function basisForPoint(points: THREE.Vector3[], index: number) {
  const prev = points[Math.max(0, index - 1)];
  const next = points[Math.min(points.length - 1, index + 1)];
  const tangent = next.clone().sub(prev);
  if (tangent.lengthSq() < 1e-8) tangent.set(1, 0, 0);
  tangent.normalize();
  const up = Math.abs(tangent.dot(new THREE.Vector3(0, 0, 1))) > 0.92
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(0, 0, 1);
  const side = new THREE.Vector3().crossVectors(tangent, up).normalize();
  const normal = new THREE.Vector3().crossVectors(side, tangent).normalize();
  return { tangent, side, normal };
}

function createRibbonGeometry(points: THREE.Vector3[], t: number) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  points.forEach((point, index) => {
    const alpha = index / Math.max(1, points.length - 1);
    const { side, normal } = basisForPoint(points, index);
    const width = 0.28 + 0.16 * Math.sin(alpha * Math.PI * 8 + t);
    const lift = normal.multiplyScalar(0.055 * Math.sin(alpha * Math.PI * 14 - t * 0.7));
    const left = point.clone().add(side.clone().multiplyScalar(-width)).add(lift);
    const right = point.clone().add(side.clone().multiplyScalar(width)).sub(lift);

    positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
    uvs.push(alpha, 0, alpha, 1);

    if (index < points.length - 1) {
      const base = index * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createSurfaceGeometry(points: THREE.Vector3[], t: number) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const crossSegments = 14;
  const width = 2.4;

  points.forEach((point, index) => {
    const alpha = index / Math.max(1, points.length - 1);
    const { side, normal } = basisForPoint(points, index);

    for (let j = 0; j <= crossSegments; j++) {
      const beta = j / crossSegments;
      const offset = (beta - 0.5) * width;
      const ripple = Math.sin(alpha * Math.PI * 12 + beta * Math.PI * 4 + t) * 0.26;
      const edgeTaper = Math.sin(beta * Math.PI);
      const position = point.clone()
        .add(side.clone().multiplyScalar(offset))
        .add(normal.clone().multiplyScalar(ripple * edgeTaper));

      positions.push(position.x, position.y, position.z);
      uvs.push(alpha, beta);

      if (index < points.length - 1 && j < crossSegments) {
        const row = crossSegments + 1;
        const a = index * row + j;
        indices.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
      }
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createLatheGeometry(points: THREE.Vector3[], t: number) {
  const profile: THREE.Vector2[] = [];
  const sampleCount = 58;

  for (let i = 0; i < sampleCount; i++) {
    const source = points[Math.floor((i / Math.max(1, sampleCount - 1)) * (points.length - 1))];
    const alpha = i / Math.max(1, sampleCount - 1);
    const radial = Math.sqrt(source.x * source.x + source.y * source.y);
    const radius = Math.max(0.22, radial * 0.36 + Math.abs(source.z) * 0.08 + 0.18 * Math.sin(alpha * Math.PI * 10 + t));
    const y = (alpha - 0.5) * 10.8 + source.z * 0.24;
    profile.push(new THREE.Vector2(radius, y));
  }

  const geometry = new THREE.LatheGeometry(profile, 72);
  geometry.rotateX(Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function createCrystalGeometry(points: THREE.Vector3[], t: number) {
  const geometry = new THREE.IcosahedronGeometry(4.2, 3);
  const position = geometry.getAttribute('position');
  const vertex = new THREE.Vector3();

  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i);
    const direction = vertex.clone().normalize();
    const sample = points[(i * 17) % points.length];
    const sampleEnergy = Math.min(1.8, sample.length() * 0.12);
    const facets = Math.sin(direction.x * 8.0 + direction.y * 6.0 + direction.z * 7.0 + t);
    const radius = 3.35 + sampleEnergy + facets * 0.5;
    vertex.copy(direction.multiplyScalar(radius));
    position.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function createExtrudeGeometry(points: THREE.Vector3[], t: number) {
  const shape = new THREE.Shape();
  const sampleCount = 96;
  const sampled: THREE.Vector2[] = [];

  for (let i = 0; i < sampleCount; i++) {
    const source = points[Math.floor((i / sampleCount) * points.length)];
    sampled.push(new THREE.Vector2(source.x * 0.66, source.y * 0.66));
  }

  sampled.forEach((point, index) => {
    if (index === 0) {
      shape.moveTo(point.x, point.y);
    } else {
      shape.lineTo(point.x, point.y);
    }
  });
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.92 + 0.28 * Math.sin(t),
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.08,
    bevelThickness: 0.16,
    curveSegments: 6,
    steps: 2
  });

  geometry.center();
  geometry.rotateX(-0.22);
  geometry.computeVertexNormals();
  return geometry;
}

function createTubeGeometry(points: THREE.Vector3[], show3D: boolean) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.35);
  const radius = show3D ? 0.11 : 0.05;
  return new THREE.TubeGeometry(curve, POINT_COUNT, radius, show3D ? 20 : 10, false);
}

function createHelixGeometry(points: THREE.Vector3[], t: number) {
  const helixPoints = points.map((source, index) => {
    const alpha = index / Math.max(1, points.length - 1);
    const angle = alpha * Math.PI * 10 + t * 0.28;
    const radius = 2.4 + Math.sin(alpha * Math.PI * 8 + source.z * 0.18) * 0.6;
    return new THREE.Vector3(
      Math.cos(angle) * radius + source.x * 0.16,
      Math.sin(angle) * radius + source.y * 0.16,
      (alpha - 0.5) * 11 + source.z * 0.24
    );
  });

  const curve = new THREE.CatmullRomCurve3(helixPoints, false, 'centripetal', 0.28);
  return new THREE.TubeGeometry(curve, POINT_COUNT, 0.16, 22, false);
}

function createShellGeometry(points: THREE.Vector3[], t: number) {
  const radialSegments = 72;
  const heightSegments = 34;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iy = 0; iy <= heightSegments; iy++) {
    const v = iy / heightSegments;
    const sample = points[Math.floor(v * (points.length - 1))];
    for (let ix = 0; ix <= radialSegments; ix++) {
      const u = ix / radialSegments;
      const angle = u * Math.PI * 2.0 + v * Math.PI * 1.35 + t * 0.12;
      const taper = 1.0 - v * 0.64;
      const harmonic = Math.sin(u * Math.PI * 12 + sample.x * 0.2 + t) * 0.22 + Math.cos(v * Math.PI * 8 + sample.y * 0.2) * 0.18;
      const radius = Math.max(0.18, (4.2 * taper + 0.26) + harmonic + Math.abs(sample.z) * 0.035);
      const z = (v - 0.5) * 9.5 + Math.sin(angle * 2.0) * 0.28;

      positions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, z);
      uvs.push(u, v);

      if (ix < radialSegments && iy < heightSegments) {
        const row = radialSegments + 1;
        const a = iy * row + ix;
        indices.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createTerrainGeometry(points: THREE.Vector3[], t: number) {
  const segments = 54;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iy = 0; iy <= segments; iy++) {
    for (let ix = 0; ix <= segments; ix++) {
      const u = ix / segments;
      const v = iy / segments;
      const x = (u - 0.5) * 11.5;
      const y = (v - 0.5) * 11.5;
      const sample = points[(ix * 11 + iy * 19) % points.length];
      const ridge = Math.sin(x * 0.9 + sample.x * 0.18 + t) + Math.cos(y * 0.82 + sample.y * 0.16 - t * 0.7);
      const crater = Math.sin(Math.sqrt(x * x + y * y) * 2.4 - t + sample.z * 0.08);
      const z = ridge * 0.58 + crater * 0.48 + sample.z * 0.1;
      positions.push(x, y, z);
      uvs.push(u, v);

      if (ix < segments && iy < segments) {
        const row = segments + 1;
        const a = iy * row + ix;
        indices.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createConstellationGeometry(points: THREE.Vector3[], t: number) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const count = 78;
  const octa = [
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(0, -1, 0)
  ];
  const faces = [
    [0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 1],
    [5, 2, 1], [5, 3, 2], [5, 4, 3], [5, 1, 4]
  ];

  for (let i = 0; i < count; i++) {
    const alpha = i / count;
    const source = points[Math.floor(alpha * (points.length - 1))];
    const orbit = new THREE.Vector3(
      source.x * 0.82 + Math.sin(alpha * Math.PI * 18 + t) * 0.28,
      source.y * 0.82 + Math.cos(alpha * Math.PI * 15 - t) * 0.28,
      source.z * 0.82
    );
    const scale = 0.12 + 0.14 * (0.5 + 0.5 * Math.sin(alpha * Math.PI * 20 + t + source.z));
    const base = positions.length / 3;

    octa.forEach((vertex) => {
      const point = orbit.clone().add(vertex.clone().multiplyScalar(scale));
      positions.push(point.x, point.y, point.z);
      uvs.push(alpha, Math.abs(vertex.y));
    });
    faces.forEach((face) => indices.push(base + face[0], base + face[1], base + face[2]));
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createKnotGeometry(points: THREE.Vector3[], t: number) {
  const geometry = new THREE.TorusKnotGeometry(3.0, 0.38, 260, 22, 3, 5);
  const position = geometry.getAttribute('position');
  const vertex = new THREE.Vector3();

  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i);
    const sample = points[(i * 23) % points.length];
    const radial = vertex.clone();
    if (radial.lengthSq() < 1e-8) radial.set(1, 0, 0);
    radial.normalize();
    const warp = Math.sin(vertex.x * 1.7 + vertex.y * 1.2 + sample.z * 0.2 + t) * 0.34;
    vertex.add(radial.multiplyScalar(warp + sample.length() * 0.014));
    position.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function createMandalaGeometry(points: THREE.Vector3[], t: number) {
  const radialSegments = 120;
  const rings = 26;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let ir = 0; ir <= rings; ir++) {
    const v = ir / rings;
    for (let ia = 0; ia <= radialSegments; ia++) {
      const u = ia / radialSegments;
      const angle = u * Math.PI * 2;
      const sample = points[(ir * 13 + ia * 7) % points.length];
      const petals = Math.sin(angle * 8 + t * 0.45) * 0.42 + Math.cos(angle * 13 - t * 0.25) * 0.18;
      const scallop = Math.sin(v * Math.PI * 7 + sample.z * 0.16 + t * 0.3) * 0.28;
      const radius = v * (4.5 + petals * Math.sin(v * Math.PI)) + scallop * v;
      const z = Math.sin(angle * 6 - v * Math.PI * 10 + t) * 0.34 * Math.sin(v * Math.PI) + sample.z * 0.045;

      positions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, z);
      uvs.push(u, v);

      if (ir < rings && ia < radialSegments) {
        const row = radialSegments + 1;
        const a = ir * row + ia;
        indices.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function appendSegmentPrism(
  positions: number[],
  uvs: number[],
  indices: number[],
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  uvBase: number
) {
  const direction = end.clone().sub(start);
  if (direction.lengthSq() < 1e-8) return;
  direction.normalize();
  const up = Math.abs(direction.dot(new THREE.Vector3(0, 0, 1))) > 0.92
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(0, 0, 1);
  const side = new THREE.Vector3().crossVectors(direction, up).normalize().multiplyScalar(radius);
  const normal = new THREE.Vector3().crossVectors(side, direction).normalize().multiplyScalar(radius);
  const base = positions.length / 3;
  const corners = [
    start.clone().add(side).add(normal),
    start.clone().sub(side).add(normal),
    start.clone().sub(side).sub(normal),
    start.clone().add(side).sub(normal),
    end.clone().add(side).add(normal),
    end.clone().sub(side).add(normal),
    end.clone().sub(side).sub(normal),
    end.clone().add(side).sub(normal)
  ];

  corners.forEach((corner, index) => {
    positions.push(corner.x, corner.y, corner.z);
    uvs.push(uvBase, index < 4 ? 0 : 1);
  });

  indices.push(
    base, base + 1, base + 5, base, base + 5, base + 4,
    base + 1, base + 2, base + 6, base + 1, base + 6, base + 5,
    base + 2, base + 3, base + 7, base + 2, base + 7, base + 6,
    base + 3, base, base + 4, base + 3, base + 4, base + 7
  );
}

function createLatticeGeometry(points: THREE.Vector3[], t: number) {
  const grid = 12;
  const spacing = 0.86;
  const nodes: THREE.Vector3[][] = [];
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let y = 0; y < grid; y++) {
    const row: THREE.Vector3[] = [];
    for (let x = 0; x < grid; x++) {
      const u = x / Math.max(1, grid - 1);
      const v = y / Math.max(1, grid - 1);
      const sample = points[(x * 17 + y * 29) % points.length];
      const px = (x - (grid - 1) / 2) * spacing + sample.x * 0.04;
      const py = (y - (grid - 1) / 2) * spacing + sample.y * 0.04;
      const weave = Math.sin(x * 0.9 + t) * Math.cos(y * 0.75 - t * 0.45);
      const pz = weave * 0.7 + sample.z * 0.08 + Math.sin((u + v) * Math.PI * 4 + t) * 0.22;
      row.push(new THREE.Vector3(px, py, pz));
    }
    nodes.push(row);
  }

  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < grid; x++) {
      const uvBase = (x + y) / (grid * 2);
      if (x < grid - 1) appendSegmentPrism(positions, uvs, indices, nodes[y][x], nodes[y][x + 1], 0.035, uvBase);
      if (y < grid - 1) appendSegmentPrism(positions, uvs, indices, nodes[y][x], nodes[y + 1][x], 0.035, uvBase);
      if (x < grid - 1 && y < grid - 1 && (x + y) % 2 === 0) {
        appendSegmentPrism(positions, uvs, indices, nodes[y][x], nodes[y + 1][x + 1], 0.026, uvBase);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createRippleGeometry(points: THREE.Vector3[], t: number) {
  const radialSegments = 96;
  const rings = 32;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let ir = 0; ir <= rings; ir++) {
    const v = ir / rings;
    for (let ia = 0; ia <= radialSegments; ia++) {
      const u = ia / radialSegments;
      const angle = u * Math.PI * 2;
      const sample = points[(ir * 19 + ia * 11) % points.length];
      const radius = v * 5.2 + Math.sin(v * Math.PI * 18 - t * 1.15 + sample.x * 0.08) * 0.1;
      const ringWave = Math.sin(v * Math.PI * 22 - t * 1.35 + sample.z * 0.18) * 0.62;
      const crossWave = Math.cos(angle * 5 + t * 0.32 + sample.y * 0.1) * 0.18;
      const z = (ringWave + crossWave) * Math.sin(v * Math.PI);

      positions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, z);
      uvs.push(u, v);

      if (ir < rings && ia < radialSegments) {
        const row = radialSegments + 1;
        const a = ir * row + ia;
        indices.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function appendHexColumn(
  positions: number[],
  uvs: number[],
  indices: number[],
  center: THREE.Vector2,
  radius: number,
  height: number,
  rotation: number,
  uvBase: number
) {
  const base = positions.length / 3;
  const bottom = -height * 0.5;
  const top = height * 0.5;

  for (let layer = 0; layer < 2; layer++) {
    const z = layer === 0 ? bottom : top;
    for (let i = 0; i < 6; i++) {
      const angle = rotation + (i / 6) * Math.PI * 2;
      positions.push(center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius, z);
      uvs.push(i / 6, layer);
    }
  }

  positions.push(center.x, center.y, bottom, center.x, center.y, top);
  uvs.push(uvBase, 0, uvBase, 1);
  const bottomCenter = base + 12;
  const topCenter = base + 13;

  for (let i = 0; i < 6; i++) {
    const next = (i + 1) % 6;
    const b0 = base + i;
    const b1 = base + next;
    const t0 = base + 6 + i;
    const t1 = base + 6 + next;
    indices.push(b0, b1, t0, b1, t1, t0, bottomCenter, b0, b1, topCenter, t1, t0);
  }
}

function createPrismGeometry(points: THREE.Vector3[], t: number) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const spacing = 1.18;
  let columnIndex = 0;

  for (let gy = -4; gy <= 4; gy++) {
    for (let gx = -4; gx <= 4; gx++) {
      const x = (gx + (gy % 2) * 0.5) * spacing;
      const y = gy * spacing * 0.86;
      if (Math.sqrt(x * x + y * y) > 4.9) continue;

      const sample = points[(columnIndex * 23) % points.length];
      const pulse = 0.5 + 0.5 * Math.sin(columnIndex * 0.73 + t + sample.z * 0.16);
      const height = 0.55 + pulse * 2.5 + Math.abs(sample.z) * 0.08;
      const radius = 0.34 + pulse * 0.08;
      appendHexColumn(
        positions,
        uvs,
        indices,
        new THREE.Vector2(x + sample.x * 0.035, y + sample.y * 0.035),
        radius,
        height,
        t * 0.1 + columnIndex * 0.18,
        columnIndex / 48
      );
      columnIndex++;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createVortexGeometry(points: THREE.Vector3[], t: number) {
  const lengthSegments = 150;
  const crossSegments = 16;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= lengthSegments; i++) {
    const alpha = i / lengthSegments;
    const sample = points[Math.floor(alpha * (points.length - 1))];
    const angle = alpha * Math.PI * 9.5 + t * 0.28;
    const radius = 4.8 - alpha * 3.35 + Math.sin(alpha * Math.PI * 7 + t + sample.x * 0.1) * 0.42;
    const radial = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
    const tangent = new THREE.Vector3(-Math.sin(angle), Math.cos(angle), 0);

    for (let j = 0; j <= crossSegments; j++) {
      const beta = j / crossSegments;
      const fold = (beta - 0.5) * (1.3 + Math.sin(alpha * Math.PI * 5 + t) * 0.32);
      const crest = Math.sin(beta * Math.PI * 2 + alpha * Math.PI * 12 - t) * 0.26;
      const z = (alpha - 0.5) * 9.8 + sample.z * 0.18 + crest;
      const position = radial.clone()
        .multiplyScalar(radius + fold * 0.22)
        .add(tangent.clone().multiplyScalar(fold))
        .add(new THREE.Vector3(sample.x * 0.04, sample.y * 0.04, z));

      positions.push(position.x, position.y, position.z);
      uvs.push(alpha, beta);

      if (i < lengthSegments && j < crossSegments) {
        const row = crossSegments + 1;
        const a = i * row + j;
        indices.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildGeometry(formula: Formula, compiled: CompiledFormula, t: number, show3D: boolean, webgpuGeometry: WebGPUGeometryProfile) {
  if (formula.parametric && show3D && compiled.valid && compiled.x) {
    try {
      return buildParametricGeometry(formula, compiled as { x: any; y: any; z: any }, t);
    } catch (error) {
      console.warn('Unable to build parametric surface for WebGPU path:', error);
    }
  }

  const points = samplePoints(compiled, t, show3D, formula.parametric ? surfaceMidQ(formula) : 0);
  const mode = geometryModeForFormula(formula, show3D, webgpuGeometry);

  try {
    if (mode === 'ribbon') return createRibbonGeometry(points, t);
    if (mode === 'surface') return createSurfaceGeometry(points, t);
    if (mode === 'lathe') return createLatheGeometry(points, t);
    if (mode === 'crystal') return createCrystalGeometry(points, t);
    if (mode === 'extrude') return createExtrudeGeometry(points, t);
    if (mode === 'helix') return createHelixGeometry(points, t);
    if (mode === 'shell') return createShellGeometry(points, t);
    if (mode === 'terrain') return createTerrainGeometry(points, t);
    if (mode === 'constellation') return createConstellationGeometry(points, t);
    if (mode === 'knot') return createKnotGeometry(points, t);
    if (mode === 'mandala') return createMandalaGeometry(points, t);
    if (mode === 'lattice') return createLatticeGeometry(points, t);
    if (mode === 'ripple') return createRippleGeometry(points, t);
    if (mode === 'prism') return createPrismGeometry(points, t);
    if (mode === 'vortex') return createVortexGeometry(points, t);

    return createTubeGeometry(points, show3D);
  } catch (error) {
    console.warn(`Unable to build ${mode} geometry for WebGPU path:`, error);
    return createTubeGeometry(points, show3D);
  }
}

function createNodeMaterial(shader: ShaderPreset, showWireframe: boolean, webgpuMaterial: WebGPUMaterialProfile) {
  const [shaderBaseHex, shaderAccentHex, shaderHotHex] = paletteForShader(shader);
  const seed = (hashText(shader.id) % 997) / 997;
  const resolvedProfile = resolveMaterialProfile(shader, webgpuMaterial);
  const settings = materialSettings(resolvedProfile);
  const style = webgpuShaderStyle(shader);
  const [baseHex, accentHex, hotHex] = webgpuMaterial === 'auto'
    ? [shaderBaseHex, shaderAccentHex, shaderHotHex]
    : settings.palette;
  const material = new THREE.MeshStandardNodeMaterial();

  const waveA = positionWorld.x
    .mul(0.24 + seed * 0.28)
    .add(positionWorld.y.mul(0.18 + seed * 0.16))
    .add(tslTime.mul(0.42 + seed * 0.58))
    .sin()
    .mul(0.5)
    .add(0.5);

  const waveB = positionWorld.z
    .mul(0.38 + seed * 0.34)
    .add(positionWorld.x.mul(0.12 + seed * 0.18))
    .sub(tslTime.mul(0.28 + seed * 0.44))
    .cos()
    .mul(0.5)
    .add(0.5);

  const noise = mx_noise_float(positionWorld.mul(0.18 + seed * 0.24).add(tslTime.mul(0.12 + seed * 0.1)));
  let field = waveA.mul(0.36).add(waveB.mul(0.26)).add(noise.mul(0.38)).clamp();

  if (style === 'solar') {
    const solarCells = positionWorld.x.mul(1.15).add(positionWorld.y.mul(0.7)).add(tslTime.mul(0.55)).sin().mul(0.5).add(0.5);
    field = noise.mul(0.5).add(solarCells.mul(0.36)).add(waveB.mul(0.14)).clamp();
  } else if (style === 'neural') {
    const verticalRain = positionWorld.y.mul(2.2).sub(tslTime.mul(1.15)).sin().mul(0.5).add(0.5);
    field = verticalRain.mul(0.44).add(noise.mul(0.34)).add(waveA.mul(0.22)).clamp();
  } else if (style === 'opal') {
    const opalBands = positionWorld.x.mul(0.7).sub(positionWorld.z.mul(1.1)).add(tslTime.mul(0.22)).cos().mul(0.5).add(0.5);
    field = opalBands.mul(0.48).add(noise.mul(0.26)).add(waveB.mul(0.26)).clamp();
  } else if (style === 'lava') {
    const sutures = positionWorld.x.mul(1.8).add(positionWorld.y.mul(1.15)).sub(tslTime.mul(0.72)).sin().mul(0.5).add(0.5);
    field = smoothstep(0.42, 0.82, sutures).mul(0.62).add(noise.mul(0.38)).clamp();
  } else if (style === 'cryo') {
    const frost = positionWorld.z.mul(1.35).add(positionWorld.x.mul(0.42)).add(tslTime.mul(0.18)).cos().mul(0.5).add(0.5);
    field = frost.mul(0.52).add(noise.mul(0.2)).add(waveA.mul(0.28)).clamp();
  } else if (style === 'biome') {
    const weave = positionWorld.x.mul(1.1).sin().mul(positionWorld.y.mul(1.25).add(tslTime.mul(0.28)).cos()).mul(0.5).add(0.5);
    field = weave.mul(0.5).add(noise.mul(0.28)).add(waveB.mul(0.22)).clamp();
  } else if (style === 'circuit') {
    const traceA = positionWorld.x.mul(2.8).add(positionWorld.y.mul(0.7)).sin().mul(0.5).add(0.5);
    const traceB = positionWorld.z.mul(2.1).add(positionWorld.y.mul(0.5)).cos().mul(0.5).add(0.5);
    const traces = traceA.add(traceB).mul(0.5).clamp();
    field = smoothstep(0.64, 0.94, traces).mul(0.72).add(noise.mul(0.28)).clamp();
  } else if (style === 'nebula') {
    const swirl = positionWorld.x.mul(0.45).add(positionWorld.y.mul(0.9)).sub(positionWorld.z.mul(0.55)).add(tslTime.mul(0.16)).sin().mul(0.5).add(0.5);
    field = noise.mul(0.56).add(swirl.mul(0.32)).add(waveA.mul(0.12)).clamp();
  } else if (style === 'carbon') {
    const fiberA = positionWorld.x.mul(3.4).add(positionWorld.y.mul(3.4)).sin().mul(0.5).add(0.5);
    const fiberB = positionWorld.x.mul(3.4).sub(positionWorld.y.mul(3.4)).cos().mul(0.5).add(0.5);
    field = fiberA.mul(0.36).add(fiberB.mul(0.36)).add(noise.mul(0.28)).clamp();
  } else if (style === 'quartz') {
    const fractures = positionWorld.x.mul(1.8).sub(positionWorld.z.mul(1.6)).add(tslTime.mul(0.08)).sin().mul(0.5).add(0.5);
    field = smoothstep(0.18, 0.78, fractures).mul(0.44).add(noise.mul(0.36)).add(waveB.mul(0.2)).clamp();
  }

  const glow = smoothstep(resolvedProfile === 'velvet' ? 0.28 : 0.42, resolvedProfile === 'obsidian' ? 0.78 : 0.92, field);
  const colorRamp = field.mul(resolvedProfile === 'ceramic' ? 0.62 : 0.92).add(resolvedProfile === 'obsidian' ? 0.02 : 0.08).clamp();
  const hotRamp = glow.mul(settings.hotMix);

  material.colorNode = mix(mix(color(baseHex), color(accentHex), colorRamp), color(hotHex), hotRamp).mul(float(settings.colorGain));
  material.emissiveNode = mix(color(accentHex), color(hotHex), glow).mul(field.mul(settings.emissive));
  material.roughnessNode = mix(float(settings.roughHigh), float(settings.roughLow), glow);
  material.metalnessNode = mix(float(settings.metalLow), float(settings.metalHigh), waveB);
  material.opacity = settings.opacity;
  material.transparent = settings.alpha;
  material.depthWrite = !settings.alpha;
  material.blending = settings.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
  material.side = THREE.DoubleSide;
  material.wireframe = showWireframe;

  return material;
}

function applyLighting(current: WebGPURefs, webgpuLighting: number, webgpuLightingPreset: WebGPULightingPreset) {
  const lighting = THREE.MathUtils.clamp(webgpuLighting, 0.45, 3.5);
  const rig = lightingRigSettings(webgpuLightingPreset);

  current.scene.background = new THREE.Color(rig.background);
  current.renderer.setClearColor(rig.background, 1);
  current.renderer.toneMappingExposure = lighting;
  current.ambientLight.color.setHex(rig.ambient);
  current.hemiLight.color.setHex(rig.ambient);
  current.hemiLight.groundColor.setHex(rig.ground);
  current.keyLight.color.setHex(rig.key);
  current.rimLight.color.setHex(rig.rim);
  current.fillLight.color.setHex(rig.fill);
  current.keyLight.position.set(...rig.keyPosition);
  current.rimLight.position.set(...rig.rimPosition);
  current.fillLight.position.set(...rig.fillPosition);
  current.ambientLight.intensity = 0.42 + lighting * rig.ambientScale;
  current.hemiLight.intensity = 0.62 + lighting * rig.hemiScale;
  current.keyLight.intensity = rig.keyScale * lighting;
  current.rimLight.intensity = rig.rimScale * lighting;
  current.fillLight.intensity = rig.fillScale * lighting;
}

function createExtras() {
  const group = new THREE.Group();

  const grid = new THREE.GridHelper(18, 18, 0x334155, 0x111827);
  grid.position.z = -0.04;
  group.add(grid);

  const xAxisGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-9, 0, 0),
    new THREE.Vector3(9, 0, 0)
  ]);
  const yAxisGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, -9, 0),
    new THREE.Vector3(0, 9, 0)
  ]);
  group.add(new THREE.Line(xAxisGeometry, new THREE.LineBasicMaterial({ color: 0x4f46e5, transparent: true, opacity: 0.35 })));
  group.add(new THREE.Line(yAxisGeometry, new THREE.LineBasicMaterial({ color: 0x4f46e5, transparent: true, opacity: 0.25 })));

  return group;
}

function createMirrorPanels() {
  const group = new THREE.Group();
  const configs: Array<[number, number, number, number, number, number, number]> = [
    [-6.6, 0, -4.4, -0.06, 0.3, -0.08, 0x153040],
    [0, 0.1, -5.2, 0.08, 0, 0.05, 0x211c45],
    [6.4, -0.1, -4.6, 0.05, -0.32, 0.08, 0x3a1930]
  ];

  configs.forEach(([x, y, z, rx, ry, rz, tint]) => {
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(5.8, 9.5),
      new THREE.MeshStandardMaterial({
        color: tint,
        metalness: 1,
        roughness: 0.18,
        transparent: true,
        opacity: 0.26,
        side: THREE.DoubleSide
      })
    );
    panel.position.set(x, y, z);
    panel.rotation.set(rx, ry, rz);
    group.add(panel);
  });

  return group;
}

export default function WebGPUView({
  formula,
  shader,
  show3D,
  showWireframe,
  showArtifacts,
  showMirrors,
  webgpuLighting,
  webgpuLightingPreset,
  webgpuGeometry,
  webgpuMaterial,
  speed,
  isPlaying
}: WebGPUViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const refs = useRef<WebGPURefs | null>(null);
  const compiledRef = useRef<CompiledFormula>(compileFormula(formula));
  const formulaRef = useRef(formula);
  const webgpuGeometryRef = useRef<WebGPUGeometryProfile>(webgpuGeometry);
  const speedRef = useRef(speed);
  const isPlayingRef = useRef(isPlaying);
  const show3DRef = useRef(show3D);
  const xrSessionCleanupRef = useRef<(() => void) | null>(null);
  const captureRequestRef = useRef<string | null>(null);

  // PNG capture must read the canvas immediately after a render inside the
  // animation loop; outside it the WebGPU swapchain is already presented.
  useEffect(() => {
    const handleCapture = (event: Event) => {
      captureRequestRef.current = (event as CustomEvent<{ name?: string }>).detail?.name ?? 'capture';
    };
    window.addEventListener(WEBGPU_CAPTURE_EVENT, handleCapture);
    return () => window.removeEventListener(WEBGPU_CAPTURE_EVENT, handleCapture);
  }, []);
  const [status, setStatus] = useState('initializing WebGPU');
  const [webgpuXRStatus, setWebgpuXRStatus] = useState<WebGPUXRStatus>('checking');
  const [webgpuXRMessage, setWebgpuXRMessage] = useState('Checking headset WebGPU XR support');
  const [webgpuXRNotice, setWebgpuXRNotice] = useState<string | null>(null);
  const displayedMode = geometryModeForFormula(formula, show3D, webgpuGeometry);
  const displayedMaterial = resolveMaterialProfile(shader, webgpuMaterial);

  useEffect(() => {
    formulaRef.current = formula;
    compiledRef.current = compileFormula(formula);
  }, [formula]);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    show3DRef.current = show3D;
  }, [show3D]);

  useEffect(() => {
    webgpuGeometryRef.current = webgpuGeometry;
  }, [webgpuGeometry]);

  useEffect(() => {
    const current = refs.current;
    if (!current) return;

    const nextGeometry = buildGeometry(formula, compiledRef.current, getClockTime(), show3D, webgpuGeometry);
    current.mesh.geometry = nextGeometry;
    current.geometry.dispose();
    current.geometry = nextGeometry;
    reportVerts(nextGeometry.getAttribute('position')?.count ?? 0);
  }, [formula, show3D, webgpuGeometry]);

  useEffect(() => {
    const current = refs.current;
    if (!current) return;

    const nextMaterial = createNodeMaterial(shader, showWireframe, webgpuMaterial);
    current.mesh.material = nextMaterial;
    current.material.dispose();
    current.material = nextMaterial;
  }, [shader, showWireframe, webgpuMaterial]);

  useEffect(() => {
    const current = refs.current;
    if (!current) return;
    applyLighting(current, webgpuLighting, webgpuLightingPreset);
  }, [webgpuLighting, webgpuLightingPreset]);

  useEffect(() => {
    if (refs.current) refs.current.extras.visible = showArtifacts;
  }, [showArtifacts]);

  useEffect(() => {
    if (refs.current) refs.current.mirrors.visible = showMirrors && show3D;
  }, [showMirrors, show3D]);

  useEffect(() => {
    let cancelled = false;

    const probeWebGPUXR = async () => {
      if (!('gpu' in navigator)) {
        if (!cancelled) {
          setWebgpuXRStatus('unavailable');
          setWebgpuXRMessage('WebGPU is unavailable in this browser');
        }
        return;
      }

      if (!navigator.xr) {
        if (!cancelled) {
          setWebgpuXRStatus('unavailable');
          setWebgpuXRMessage('WebXR is unavailable in this browser');
        }
        return;
      }

      if (typeof globalThis.XRGPUBinding === 'undefined') {
        if (!cancelled) {
          setWebgpuXRStatus('unavailable');
          setWebgpuXRMessage('WebGPU projection layers are unavailable');
        }
        return;
      }

      try {
        const supported = await navigator.xr.isSessionSupported('immersive-vr');
        if (cancelled) return;
        setWebgpuXRStatus(supported ? 'available' : 'unavailable');
        setWebgpuXRMessage(supported ? 'WebGPU immersive VR can be attempted' : 'Immersive VR is unavailable in this browser');
      } catch (error) {
        console.warn('Unable to probe WebGPU XR support:', error);
        if (!cancelled) {
          setWebgpuXRStatus('unavailable');
          setWebgpuXRMessage('WebGPU XR support check failed');
        }
      }
    };

    probeWebGPUXR();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleWebGPUXRSessionEnded = useCallback(() => {
    xrSessionCleanupRef.current?.();
    xrSessionCleanupRef.current = null;

    const current = refs.current;
    if (current) {
      current.isXRPresenting = false;
      current.xrInputSources.clear();
      current.controls.enabled = true;
      current.renderer.xr.enabled = false;
      restoreWebGPUDesktopContent(current);
    }

    setWebgpuXRStatus('available');
    setWebgpuXRMessage('WebGPU immersive VR can be attempted');
    setStatus('full WebGPU renderer active');
  }, []);

  const enterWebGPUVR = useCallback(async () => {
    const current = refs.current;

    if (!current) {
      setWebgpuXRMessage('WebGPU renderer is still initializing');
      return;
    }

    const activeSession = current.renderer.xr.getSession();
    if (activeSession) {
      await activeSession.end();
      return;
    }

    if (!navigator.xr || !('gpu' in navigator) || typeof globalThis.XRGPUBinding === 'undefined') {
      const reason = !navigator.xr
        ? 'WebXR is unavailable in this browser'
        : !('gpu' in navigator)
          ? 'WebGPU is unavailable in this browser'
          : 'WebGPU projection layers are unavailable';
      setWebgpuXRStatus('unavailable');
      setWebgpuXRMessage(reason);
      setWebgpuXRNotice(`${reason}. Switching to WebGL VR fallback.`);
      reportWebGPUXRUnavailable(reason);
      return;
    }

    setWebgpuXRStatus('starting');
    setWebgpuXRMessage('Requesting WebGPU immersive VR');
    setWebgpuXRNotice('Trying WebGPU VR. Quest Browser must expose WebGPU XR projection layers.');
    setStatus('starting WebGPU XR session');

    try {
      current.renderer.xr.enabled = true;
      current.renderer.xr.setReferenceSpaceType('local');

      let didTimeOut = false;
      const sessionRequest = navigator.xr.requestSession('immersive-vr', {
        requiredFeatures: ['webgpu'],
        optionalFeatures: ['local-floor', 'bounded-floor', 'layers', 'hand-tracking']
      });
      sessionRequest
        .then((lateSession) => {
          if (didTimeOut) lateSession.end().catch(() => undefined);
        })
        .catch(() => undefined);
      let timeoutId: number | undefined;
      const timeout = new Promise<never>((_resolve, reject) => {
        timeoutId = window.setTimeout(() => {
          didTimeOut = true;
          reject(new Error('Quest Browser did not start WebGPU XR within 8 seconds'));
        }, WEBGPU_XR_START_TIMEOUT_MS);
      });
      const session = await Promise.race([sessionRequest, timeout]).finally(() => {
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      });

      const onSessionEnded = () => handleWebGPUXRSessionEnded();
      session.addEventListener('end', onSessionEnded);
      xrSessionCleanupRef.current = () => session.removeEventListener('end', onSessionEnded);

      try {
        await current.renderer.xr.setSession(session);
      } catch (error) {
        xrSessionCleanupRef.current?.();
        xrSessionCleanupRef.current = null;
        await session.end().catch(() => undefined);
        throw error;
      }

      current.isXRPresenting = true;
      current.controls.enabled = false;
      resetWebGPUXRContent(current);
      setWebgpuXRStatus('presenting');
      setWebgpuXRMessage('WebGPU immersive VR active');
      setWebgpuXRNotice(null);
      setStatus('WebGPU XR session active');
    } catch (error) {
      console.warn('Unable to start WebGPU XR session:', error);
      const reason = error instanceof Error && error.message
        ? error.message
        : 'WebGPU XR was refused by this browser';
      current.renderer.xr.enabled = false;
      current.isXRPresenting = false;
      current.controls.enabled = true;
      restoreWebGPUDesktopContent(current);
      setWebgpuXRStatus('available');
      setWebgpuXRMessage('WebGPU XR was refused; use WebGL XR fallback');
      setWebgpuXRNotice(`${reason}. Switching to WebGL VR fallback.`);
      reportWebGPUXRUnavailable(reason);
      setStatus('full WebGPU renderer active');
    }
  }, [handleWebGPUXRSessionEnded]);

  useEffect(() => {
    const handleRequest = (event: Event) => {
      const mode = (event as CustomEvent<{ mode?: string }>).detail?.mode;
      if (mode === 'vr') void enterWebGPUVR();
    };

    window.addEventListener(WEBGPU_XR_REQUEST_EVENT, handleRequest);
    return () => window.removeEventListener(WEBGPU_XR_REQUEST_EVENT, handleRequest);
  }, [enterWebGPUVR]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;

    const start = async () => {
      if (!('gpu' in navigator)) {
        setStatus('WebGPU unavailable in this browser');
        return;
      }

      const renderer = new THREE.WebGPURenderer({
        alpha: false,
        antialias: true,
        samples: 4
      });

      renderer.domElement.className = 'absolute inset-0 h-full w-full';
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x07090d, 1);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.AgXToneMapping;
      renderer.toneMappingExposure = webgpuLighting;
      container.appendChild(renderer.domElement);

      try {
        await renderer.init();
      } catch (error) {
        console.warn('Unable to initialize WebGPU renderer:', error);
        renderer.domElement.remove();
        renderer.dispose();
        setStatus('WebGPU initialization failed');
        return;
      }

      if (cancelled) {
        renderer.dispose();
        renderer.domElement.remove();
        return;
      }

      if (!(renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend) {
        renderer.dispose();
        renderer.domElement.remove();
        setStatus('WebGPU backend unavailable');
        return;
      }

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x07090d);
      const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
      camera.position.set(0, 0.5, 22);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      renderer.xr.enabled = false;

      const ambientLight = new THREE.AmbientLight(0xa9b8ff, 0.86);
      scene.add(ambientLight);
      const hemiLight = new THREE.HemisphereLight(0xcfe8ff, 0x17121d, 1.08);
      scene.add(hemiLight);
      const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
      keyLight.position.set(5, 7, 10);
      scene.add(keyLight);
      const rimLight = new THREE.PointLight(0x22d3ee, 18, 36);
      rimLight.position.set(-6, 2.5, 8);
      scene.add(rimLight);
      const fillLight = new THREE.PointLight(0xff8bd5, 5.8, 32);
      fillLight.position.set(6, -3, 7);
      scene.add(fillLight);

      const contentGroup = new THREE.Group();
      scene.add(contentGroup);

      const material = createNodeMaterial(shader, showWireframe, webgpuMaterial);
      const geometry = buildGeometry(
        formulaRef.current,
        compiledRef.current,
        getClockTime(),
        show3DRef.current,
        webgpuGeometryRef.current
      );
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      contentGroup.add(mesh);

      const extras = createExtras();
      extras.visible = showArtifacts;
      contentGroup.add(extras);

      const mirrors = createMirrorPanels();
      mirrors.visible = showMirrors && show3DRef.current;
      contentGroup.add(mirrors);

      const xrInputSources = new Map<number, XRInputSource>();
      const xrControllerCleanup: Array<() => void> = [];
      for (let i = 0; i < 2; i++) {
        const controller = renderer.xr.getController(i);
        const onConnected = (event: any) => xrInputSources.set(i, event.data);
        const onDisconnected = () => xrInputSources.delete(i);
        const onSqueeze = () => {
          const current = refs.current;
          if (current?.isXRPresenting) resetWebGPUXRContent(current);
        };
        controller.addEventListener('connected', onConnected);
        controller.addEventListener('disconnected', onDisconnected);
        controller.addEventListener('squeeze', onSqueeze);
        scene.add(controller);
        xrControllerCleanup.push(() => {
          controller.removeEventListener('connected', onConnected);
          controller.removeEventListener('disconnected', onDisconnected);
          controller.removeEventListener('squeeze', onSqueeze);
        });
      }

      const resize = () => {
        const width = Math.max(1, container.clientWidth);
        const height = Math.max(1, container.clientHeight);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };

      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(container);
      resize();

      refs.current = {
        renderer,
        scene,
        camera,
        controls,
        contentGroup,
        mesh,
        extras,
        mirrors,
        material,
        geometry,
        ambientLight,
        hemiLight,
        keyLight,
        rimLight,
        fillLight,
        resizeObserver,
        xrInputSources,
        xrControllerCleanup,
        isXRPresenting: false
      };
      applyLighting(refs.current, webgpuLighting, webgpuLightingPreset);
      setStatus('full WebGPU renderer active');

      let activeGeometry = geometry;
      let lastGeometryUpdate = 0;
      let lastFrameTime = performance.now();
      await renderer.setAnimationLoop(() => {
        const now = performance.now();
        const deltaSeconds = Math.min(0.05, (now - lastFrameTime) / 1000);
        lastFrameTime = now;

        if (now - lastGeometryUpdate > 140) {
          lastGeometryUpdate = now;
          const nextGeometry = buildGeometry(
            formulaRef.current,
            compiledRef.current,
            getClockTime(),
            show3DRef.current,
            webgpuGeometryRef.current
          );
          mesh.geometry = nextGeometry;
          activeGeometry.dispose();
          activeGeometry = nextGeometry;
          refs.current!.geometry = nextGeometry;
          reportVerts(nextGeometry.getAttribute('position')?.count ?? 0);
        }

        const motion = isPlayingRef.current ? speedRef.current : 0;
        mesh.rotation.y += 0.003 * motion;
        mesh.rotation.x = Math.sin(getClockTime() * 0.45) * 0.12;
        updateWebGPUXRInput(refs.current!, deltaSeconds);
        if (!refs.current?.isXRPresenting) controls.update();
        renderer.render(scene, camera);

        if (captureRequestRef.current) {
          const name = captureRequestRef.current;
          captureRequestRef.current = null;
          try {
            const link = document.createElement('a');
            link.download = `harmonic-${name}.png`;
            link.href = renderer.domElement.toDataURL('image/png');
            link.click();
          } catch (error) {
            console.warn('Unable to capture WebGPU snapshot:', error);
          }
        }
      });
    };

    start();

    return () => {
      cancelled = true;
      const current = refs.current;
      refs.current = null;

      if (!current) return;

      xrSessionCleanupRef.current?.();
      xrSessionCleanupRef.current = null;
      current.renderer.xr.getSession()?.end().catch(() => undefined);
      current.renderer.setAnimationLoop(null);
      current.resizeObserver.disconnect();
      current.xrControllerCleanup.forEach((cleanup) => cleanup());
      current.controls.dispose();
      current.geometry.dispose();
      current.material.dispose();
      current.extras.traverse((object) => {
        if (object instanceof THREE.Line || object instanceof THREE.Mesh) {
          object.geometry?.dispose();
          if (Array.isArray(object.material)) {
            object.material.forEach((material) => material.dispose());
          } else {
            object.material?.dispose();
          }
        }
      });
      current.mirrors.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          if (Array.isArray(object.material)) {
            object.material.forEach((material) => material.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
      current.renderer.dispose();
      current.renderer.domElement.remove();
    };
  }, []);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-[#050505]">
      <div className="absolute left-4 top-4 z-10 max-w-[270px] rounded-md border border-cyan-400/20 bg-black/55 px-3 py-2 backdrop-blur">
        <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-cyan-300">WebGPU Node Path</div>
        <div className="mt-1 max-w-[260px] truncate text-[10px] text-white/55">{status}</div>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void enterWebGPUVR()}
            disabled={webgpuXRStatus === 'checking' || webgpuXRStatus === 'starting'}
            className="rounded-md border border-cyan-300/25 bg-cyan-400/10 px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-cyan-100 transition-colors hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {webgpuXRStatus === 'presenting'
              ? 'Exit WebGPU VR'
              : webgpuXRStatus === 'starting'
                ? 'Starting VR'
                : webgpuXRStatus === 'checking'
                  ? 'Checking XR'
                  : 'Try WebGPU VR'}
          </button>
          <div className="min-w-0 truncate font-mono text-[8px] uppercase tracking-[0.1em] text-white/35">
            {webgpuXRStatus}
          </div>
        </div>
        <div className="mt-2 max-w-[250px] truncate text-[9px] text-white/40">{webgpuXRMessage}</div>
      </div>
      <div className="pointer-events-none absolute right-4 top-4 z-10 rounded-md border border-white/10 bg-black/55 px-3 py-2 text-right font-mono text-[9px] uppercase tracking-[0.14em] text-white/45 backdrop-blur">
        <div className="text-white/65">{shader.category || 'Core Shader'}</div>
        <div className="mt-1 text-cyan-300">{shader.name}</div>
        <div className="mt-2 text-white/40">
          {displayedMode} / {webgpuMaterialLabel(displayedMaterial)} / {webgpuLightingPreset}
        </div>
      </div>
      {webgpuXRNotice && (
        <div className="pointer-events-none absolute bottom-8 left-1/2 z-20 w-[min(92%,680px)] -translate-x-1/2 rounded-lg border border-cyan-300/35 bg-black/85 px-5 py-4 text-center text-sm font-semibold leading-snug text-cyan-50 shadow-2xl shadow-cyan-950/40 backdrop-blur">
          {webgpuXRNotice}
        </div>
      )}
    </div>
  );
}
