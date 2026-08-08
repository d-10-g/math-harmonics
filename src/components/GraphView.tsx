import { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, MeshReflectorMaterial, OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { compile } from 'mathjs';
import {
  Formula,
  FormulaGeometryMode,
  ShaderPreset,
  PRESET_FORMULAS,
  WebGPUGeometryProfile,
  WebGPULightingPreset,
  WebGPUMaterialProfile
} from '../constants';
import { DEFAULT_VERTEX_SHADER, PRESET_SHADERS } from '../shaders';
import { XR, XROrigin, useXR, useXRInputSourceState } from '@react-three/xr';
import { clockStore, getClockTime, reportVerts } from '../lib/clock';
import { lightingRigSettings } from '../lib/lighting';
import { COMBOS } from '../lib/combos';
import { createPhysicalMaterial } from '../lib/materials';
import { buildParametricGeometry, surfaceMidQ, SURFACE_SEGMENTS_DESKTOP, SURFACE_SEGMENTS_XR } from '../lib/parametricSurface';
import { buildRigEnvironmentScene, disposeEnvironmentScene } from '../lib/environments';

// Dev aid: ?hudpreview renders the spatial console in the desktop scene so
// its layout can be inspected without entering a headset.
const HUD_PREVIEW = typeof location !== 'undefined' && new URLSearchParams(location.search).has('hudpreview');

const XR_THUMBSTICK_DEADZONE = 0.16;
const XR_LOCOMOTION_SPEED = 1.65;
const XR_LOCOMOTION_BOUNDS = 6;

// 3D geometry is rebuilt on this cadence instead of every frame; the material
// time uniform and group motion still animate at full framerate in between.
// Parametric surfaces evaluate ~13k mathjs samples per rebuild, so they get a
// slower cadence.
const GEOMETRY_REBUILD_MS = 100;
const PARAMETRIC_REBUILD_MS = 220;

const Line = 'line' as any;
const GridHelper = 'gridHelper' as any;
import SpatialConsole from './SpatialConsole';
import {
  GEOMETRY_MODES,
  DEFAULT_XR_VISUAL_TRANSFORM,
  GraphGeometrySelection,
  GraphGeometrySelectionSetter,
  XRVisualTransform,
  XRVisualTransformSetter,
  XR_VISUAL_DISTANCE_MAX,
  XR_VISUAL_DISTANCE_MIN,
  XR_VISUAL_SCALE_MAX,
  XR_VISUAL_SCALE_MIN
} from '../lib/xrTypes';

type XRControllerThumbstick = {
  x: number;
  y: number;
  magnitude: number;
  buttonsPressed: boolean;
  handedness?: XRHandedness;
};

type CompiledFormula = {
  valid: boolean;
  x: any;
  y: any;
  z: any;
};

type ScalarTargetField = 'x' | 'y' | 'z' | 'all';

type FormulaScalarTarget = {
  x: string;
  y: string;
  z: string;
  baseScalar: number;
  field: ScalarTargetField;
  match: string;
};

type MirrorPanelConfig = {
  id: string;
  position: [number, number, number];
  rotation: [number, number, number];
  size: [number, number];
  tint: string;
  accent: string;
};

const MIRROR_PANEL_LAYOUT: MirrorPanelConfig[] = [
  {
    id: 'left',
    position: [-8.4, 0.9, -8.2],
    rotation: [THREE.MathUtils.degToRad(-4), THREE.MathUtils.degToRad(20), THREE.MathUtils.degToRad(-7)],
    size: [7.4, 13.2],
    tint: '#182238',
    accent: '#22d3ee'
  },
  {
    id: 'center',
    position: [0, 0.1, -9.1],
    rotation: [THREE.MathUtils.degToRad(6), 0, THREE.MathUtils.degToRad(4)],
    size: [9.2, 14.8],
    tint: '#101827',
    accent: '#a78bfa'
  },
  {
    id: 'right',
    position: [8.2, -0.5, -8.5],
    rotation: [THREE.MathUtils.degToRad(3), THREE.MathUtils.degToRad(-22), THREE.MathUtils.degToRad(8)],
    size: [7.2, 12.8],
    tint: '#171b2d',
    accent: '#f472b6'
  }
];

function hashText(text: string) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function applyThumbstickDeadzone(value: number) {
  const magnitude = Math.abs(value);
  if (magnitude < XR_THUMBSTICK_DEADZONE) return 0;
  const normalized = (magnitude - XR_THUMBSTICK_DEADZONE) / (1 - XR_THUMBSTICK_DEADZONE);
  return Math.sign(value) * THREE.MathUtils.clamp(normalized, 0, 1);
}

function readRawThumbstick(gamepad?: Gamepad | null, handedness?: XRHandedness): XRControllerThumbstick {
  const axes = gamepad?.axes || [];
  const pairs = [
    [2, 3],
    [0, 1]
  ];
  const buttonsPressed = Boolean(gamepad?.buttons?.some((button) => button.pressed));
  let best: XRControllerThumbstick = { x: 0, y: 0, magnitude: 0, buttonsPressed, handedness };

  pairs.forEach(([xIndex, yIndex]) => {
    const x = applyThumbstickDeadzone(axes[xIndex] || 0);
    const y = applyThumbstickDeadzone(axes[yIndex] || 0);
    const magnitude = Math.hypot(x, y);
    if (magnitude > best.magnitude) best = { x, y, magnitude, buttonsPressed, handedness };
  });

  return best;
}

function readThumbstick(controller: any): XRControllerThumbstick {
  const mappedStick = controller?.gamepad?.['xr-standard-thumbstick'];
  const raw = readRawThumbstick(controller?.inputSource?.gamepad, controller?.inputSource?.handedness);
  if (!mappedStick) return raw;

  const x = applyThumbstickDeadzone(mappedStick.xAxis || 0);
  const y = applyThumbstickDeadzone(mappedStick.yAxis || 0);
  const mapped = {
    x,
    y,
    magnitude: Math.hypot(x, y),
    buttonsPressed: raw.buttonsPressed,
    handedness: raw.handedness
  };

  return mapped.magnitude >= raw.magnitude ? mapped : raw;
}

function readSessionThumbsticks(session: XRSession | null): XRControllerThumbstick[] {
  if (!session?.inputSources) return [];

  return Array.from(session.inputSources)
    .filter((source) => source.gamepad)
    .map((source) => readRawThumbstick(source.gamepad, source.handedness));
}

function pickStrongestThumbstick(thumbsticks: XRControllerThumbstick[], requireButtonState?: boolean) {
  return thumbsticks.reduce<XRControllerThumbstick>(
    (best, current) => {
      if (requireButtonState !== undefined && current.buttonsPressed !== requireButtonState) return best;
      return current.magnitude > best.magnitude ? current : best;
    },
    { x: 0, y: 0, magnitude: 0, buttonsPressed: false }
  );
}

function resolveFormulaGeometryMode(formula: Formula): FormulaGeometryMode {
  if (formula.geometryMode) return formula.geometryMode;
  return GEOMETRY_MODES[hashText(`${formula.id}:${formula.name}`) % GEOMETRY_MODES.length];
}

function resolveFormulaScalarTarget(formula: Formula): FormulaScalarTarget {
  const xStr = formula.x;
  const yStr = formula.y;
  const zStr = formula.z || "sin(2 * p + t) * 4";
  const numberRegex = /\b\d+(\.\d+)?\b/g;
  const candidates: { field: 'x' | 'y' | 'z'; index: number; value: number; match: string }[] = [];

  const findCandidates = (str: string, field: 'x' | 'y' | 'z') => {
    let match;
    numberRegex.lastIndex = 0;
    while ((match = numberRegex.exec(str)) !== null) {
      candidates.push({
        field,
        index: match.index,
        value: parseFloat(match[0]),
        match: match[0]
      });
    }
  };

  findCandidates(xStr, 'x');
  findCandidates(yStr, 'y');
  findCandidates(zStr, 'z');

  if (candidates.length === 0) {
    return {
      x: `(${xStr}) * s`,
      y: `(${yStr}) * s`,
      z: `(${zStr}) * s`,
      baseScalar: 1.0,
      field: 'all',
      match: 'scale'
    };
  }

  const chosenIndex = hashText(`${formula.id}:${formula.name}:${xStr}:${yStr}:${zStr}`) % candidates.length;
  const chosen = candidates[chosenIndex];
  const replaceAt = (str: string, index: number, matchLen: number, replacement: string) => {
    return str.substring(0, index) + replacement + str.substring(index + matchLen);
  };

  return {
    x: chosen.field === 'x' ? replaceAt(xStr, chosen.index, chosen.match.length, 's') : xStr,
    y: chosen.field === 'y' ? replaceAt(yStr, chosen.index, chosen.match.length, 's') : yStr,
    z: chosen.field === 'z' ? replaceAt(zStr, chosen.index, chosen.match.length, 's') : zStr,
    baseScalar: chosen.value,
    field: chosen.field,
    match: chosen.match
  };
}

function readNumber(value: any) {
  const n = typeof value === 'number' ? value : value && value.re !== undefined ? value.re : 0;
  if (!Number.isFinite(n) || Number.isNaN(n)) return 0;
  return THREE.MathUtils.clamp(n, -10000, 10000);
}

function sampleFormulaPoints(compiled: CompiledFormula, currentTime: number, scalar: number, resolution: number, qValue = 0) {
  const rawPts: THREE.Vector3[] = [];
  const extents: number[] = [];

  for (let i = 0; i <= resolution; i++) {
    const p = (i / resolution) * Math.PI * 8;
    const scope = { p, t: currentTime, s: scalar, q: qValue };
    let x = 0;
    let y = 0;
    let z = 0;

    if (compiled.valid && compiled.x && compiled.y && compiled.z) {
      x = readNumber(compiled.x.evaluate(scope));
      y = readNumber(compiled.y.evaluate(scope));
      z = readNumber(compiled.z.evaluate(scope));
    } else {
      x = Math.cos(p) * 12;
      y = Math.sin(p) * 12;
      z = Math.sin(p * 2 + currentTime) * 4;
    }

    rawPts.push(new THREE.Vector3(x, y, z));
    extents.push(Math.max(Math.abs(x), Math.abs(y), Math.abs(z) * 0.75));
  }

  extents.sort((a, b) => a - b);
  const robustExtent = Math.max(0.001, extents[Math.floor(extents.length * 0.92)] || 0.001);
  const targetScale = 12 / robustExtent;

  return rawPts.map((point) => {
    point.multiplyScalar(targetScale);
    point.x = THREE.MathUtils.clamp(point.x, -26, 26);
    point.y = THREE.MathUtils.clamp(point.y, -26, 26);
    point.z = THREE.MathUtils.clamp(point.z, -18, 18);
    return point;
  });
}

function buildRibbonGeometry(points: THREE.Vector3[], time: number, hash: number) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(points.length * 2 * 3);
  const uvs = new Float32Array(points.length * 2 * 2);
  const indices: number[] = [];
  const up = new THREE.Vector3(0, 0, 1);
  const altUp = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const tangent = next.clone().sub(prev).normalize();
    let side = new THREE.Vector3().crossVectors(tangent, up);
    if (side.lengthSq() < 0.0001) {
      side = new THREE.Vector3().crossVectors(tangent, altUp);
    }
    side.normalize();

    const width = 0.24 + 0.09 * Math.sin(i * 0.17 + time * 1.4 + hash * 0.01);
    const left = points[i].clone().addScaledVector(side, width);
    const right = points[i].clone().addScaledVector(side, -width);
    const base = i * 6;
    positions.set([left.x, left.y, left.z, right.x, right.y, right.z], base);
    uvs.set([i / (points.length - 1), 0, i / (points.length - 1), 1], i * 4);

    if (i < points.length - 1) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildExtrudeGeometry(points: THREE.Vector3[], time: number, hash: number) {
  const sides = 72;
  const shape = new THREE.Shape();

  for (let i = 0; i < sides; i++) {
    const sample = points[Math.floor((i / sides) * points.length)];
    const angle = (i / sides) * Math.PI * 2;
    const formulaRadius = Math.min(3.1, sample.length() * 0.11 + Math.abs(sample.z) * 0.07);
    const pulse = 0.38 * Math.sin(angle * (3 + (hash % 5)) + time * 1.2);
    const radius = 2.0 + formulaRadius + pulse;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) {
      shape.moveTo(x, y);
    } else {
      shape.lineTo(x, y);
    }
  }
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.8 + (hash % 7) * 0.08,
    bevelEnabled: true,
    bevelSegments: 5,
    bevelSize: 0.16,
    bevelThickness: 0.24,
    curveSegments: 24,
    steps: 2
  });
  geometry.center();
  geometry.computeVertexNormals();
  return geometry;
}

function buildLatheGeometry(points: THREE.Vector3[], time: number, hash: number) {
  const profile: THREE.Vector2[] = [];
  const count = 128;

  for (let i = 0; i < count; i++) {
    const sample = points[Math.floor((i / (count - 1)) * (points.length - 1))];
    const y = -5.8 + (i / (count - 1)) * 11.6;
    const formulaRadius = Math.abs(sample.x) * 0.07 + Math.abs(sample.z) * 0.06;
    const lobe = Math.sin(i * 0.22 + time + hash * 0.01) * 0.35;
    profile.push(new THREE.Vector2(0.65 + formulaRadius + Math.abs(sample.y) * 0.025 + lobe, y));
  }

  const geometry = new THREE.LatheGeometry(profile, 112);
  geometry.center();
  geometry.computeVertexNormals();
  return geometry;
}

function buildCrystalGeometry(points: THREE.Vector3[], time: number, hash: number) {
  const hullPoints: THREE.Vector3[] = [];
  const stride = Math.max(3, Math.floor(points.length / 54));

  for (let i = 0; i < points.length; i += stride) {
    const p = points[i].clone().multiplyScalar(0.42);
    const lift = new THREE.Vector3(
      Math.sin(i * 0.37 + hash) * 0.55,
      Math.cos(i * 0.29 + time) * 0.55,
      Math.sin(i * 0.19 + time * 1.3) * 1.2
    );
    hullPoints.push(p.add(lift));
  }

  hullPoints.push(new THREE.Vector3(0, 0, 5.6));
  hullPoints.push(new THREE.Vector3(0, 0, -5.6));

  const geometry = new ConvexGeometry(hullPoints);
  geometry.center();
  geometry.computeVertexNormals();
  return geometry;
}

function buildSurfaceGeometry(points: THREE.Vector3[], time: number, hash: number) {
  const segments = 44;
  const vertCount = (segments + 1) * (segments + 1);
  const positions = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const indices: number[] = [];

  for (let iy = 0; iy <= segments; iy++) {
    for (let ix = 0; ix <= segments; ix++) {
      const u = ix / segments;
      const v = iy / segments;
      const x = (u - 0.5) * 12;
      const y = (v - 0.5) * 12;
      const sample = points[(ix * 7 + iy * 13 + hash) % points.length];
      const harmonic =
        Math.sin(x * (0.45 + (hash % 5) * 0.035) + time + sample.x * 0.04) +
        Math.cos(y * (0.52 + (hash % 7) * 0.025) - time * 0.7 + sample.y * 0.04);
      const z = harmonic * 0.72 + sample.z * 0.08 + Math.sin((x + y) * 0.28 + time * 1.6) * 0.42;
      const offset = (iy * (segments + 1) + ix) * 3;
      positions.set([x, y, z], offset);
      uvs.set([u, v], (iy * (segments + 1) + ix) * 2);

      if (ix < segments && iy < segments) {
        const a = iy * (segments + 1) + ix;
        indices.push(a, a + 1, a + segments + 1, a + 1, a + segments + 2, a + segments + 1);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildTubeGeometry(points: THREE.Vector3[], hash: number) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.35);
  return new THREE.TubeGeometry(curve, Math.min(420, points.length - 1), 0.1 + (hash % 4) * 0.025, 18, false);
}

function buildHelixGeometry(points: THREE.Vector3[], time: number, hash: number) {
  const helixPoints = points.map((source, index) => {
    const alpha = index / Math.max(1, points.length - 1);
    const angle = alpha * Math.PI * (8 + (hash % 5)) + time * 0.28;
    const radius = 2.2 + Math.sin(alpha * Math.PI * 8 + source.z * 0.16 + hash) * 0.62;
    return new THREE.Vector3(
      Math.cos(angle) * radius + source.x * 0.16,
      Math.sin(angle) * radius + source.y * 0.16,
      (alpha - 0.5) * 11 + source.z * 0.24
    );
  });

  const curve = new THREE.CatmullRomCurve3(helixPoints, false, 'centripetal', 0.28);
  return new THREE.TubeGeometry(curve, Math.min(420, points.length - 1), 0.16, 22, false);
}

function buildShellGeometry(points: THREE.Vector3[], time: number, hash: number) {
  const radialSegments = 64;
  const heightSegments = 30;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iy = 0; iy <= heightSegments; iy++) {
    const v = iy / heightSegments;
    const sample = points[Math.floor(v * (points.length - 1))];

    for (let ix = 0; ix <= radialSegments; ix++) {
      const u = ix / radialSegments;
      const angle = u * Math.PI * 2 + v * Math.PI * 1.35 + time * 0.12;
      const taper = 1 - v * 0.64;
      const harmonic =
        Math.sin(u * Math.PI * (10 + (hash % 5)) + sample.x * 0.2 + time) * 0.22 +
        Math.cos(v * Math.PI * 8 + sample.y * 0.2) * 0.18;
      const radius = Math.max(0.18, 4.2 * taper + 0.26 + harmonic + Math.abs(sample.z) * 0.035);
      const z = (v - 0.5) * 9.5 + Math.sin(angle * 2) * 0.28;

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

function buildTerrainGeometry(points: THREE.Vector3[], time: number, hash: number) {
  const segments = 48;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iy = 0; iy <= segments; iy++) {
    for (let ix = 0; ix <= segments; ix++) {
      const u = ix / segments;
      const v = iy / segments;
      const x = (u - 0.5) * 11.5;
      const y = (v - 0.5) * 11.5;
      const sample = points[(ix * 11 + iy * 19 + hash) % points.length];
      const ridge = Math.sin(x * 0.9 + sample.x * 0.18 + time) + Math.cos(y * 0.82 + sample.y * 0.16 - time * 0.7);
      const crater = Math.sin(Math.sqrt(x * x + y * y) * 2.4 - time + sample.z * 0.08);
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

function buildConstellationGeometry(points: THREE.Vector3[], time: number, hash: number) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const count = 82;
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
      source.x * 0.82 + Math.sin(alpha * Math.PI * 18 + time + hash * 0.01) * 0.28,
      source.y * 0.82 + Math.cos(alpha * Math.PI * 15 - time) * 0.28,
      source.z * 0.82
    );
    const scale = 0.12 + 0.14 * (0.5 + 0.5 * Math.sin(alpha * Math.PI * 20 + time + source.z));
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

function buildKnotGeometry(points: THREE.Vector3[], time: number, hash: number) {
  const geometry = new THREE.TorusKnotGeometry(3.0, 0.38, 220, 20, 3 + (hash % 2), 5);
  const position = geometry.getAttribute('position');
  const vertex = new THREE.Vector3();

  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i);
    const sample = points[(i * 23 + hash) % points.length];
    const radial = vertex.clone();
    if (radial.lengthSq() < 1e-8) radial.set(1, 0, 0);
    radial.normalize();
    const warp = Math.sin(vertex.x * 1.7 + vertex.y * 1.2 + sample.z * 0.2 + time) * 0.34;
    vertex.add(radial.multiplyScalar(warp + sample.length() * 0.014));
    position.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function buildMandalaGeometry(points: THREE.Vector3[], time: number, hash: number) {
  const radialSegments = 96;
  const rings = 24;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let ir = 0; ir <= rings; ir++) {
    const v = ir / rings;
    for (let ia = 0; ia <= radialSegments; ia++) {
      const u = ia / radialSegments;
      const angle = u * Math.PI * 2;
      const sample = points[(ir * 13 + ia * 7 + hash) % points.length];
      const petals = Math.sin(angle * (7 + (hash % 5)) + time * 0.45) * 0.42 + Math.cos(angle * 13 - time * 0.25) * 0.18;
      const scallop = Math.sin(v * Math.PI * 7 + sample.z * 0.16 + time * 0.3) * 0.28;
      const radius = v * (4.5 + petals * Math.sin(v * Math.PI)) + scallop * v;
      const z = Math.sin(angle * 6 - v * Math.PI * 10 + time) * 0.34 * Math.sin(v * Math.PI) + sample.z * 0.045;

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

function buildLatticeGeometry(points: THREE.Vector3[], time: number, hash: number) {
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
      const sample = points[(x * 17 + y * 29 + hash) % points.length];
      const px = (x - (grid - 1) / 2) * spacing + sample.x * 0.04;
      const py = (y - (grid - 1) / 2) * spacing + sample.y * 0.04;
      const weave = Math.sin(x * 0.9 + time) * Math.cos(y * 0.75 - time * 0.45);
      const pz = weave * 0.7 + sample.z * 0.08 + Math.sin((u + v) * Math.PI * 4 + time) * 0.22;
      row.push(new THREE.Vector3(px, py, pz));
    }
    nodes.push(row);
  }

  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < grid; x++) {
      const uvBase = (x + y) / (grid * 2);
      if (x < grid - 1) appendSegmentPrism(positions, uvs, indices, nodes[y][x], nodes[y][x + 1], 0.035, uvBase);
      if (y < grid - 1) appendSegmentPrism(positions, uvs, indices, nodes[y][x], nodes[y + 1][x], 0.035, uvBase);
      if (x < grid - 1 && y < grid - 1 && (x + y + hash) % 2 === 0) {
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

function buildRippleGeometry(points: THREE.Vector3[], time: number, hash: number) {
  const radialSegments = 88;
  const rings = 30;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let ir = 0; ir <= rings; ir++) {
    const v = ir / rings;
    for (let ia = 0; ia <= radialSegments; ia++) {
      const u = ia / radialSegments;
      const angle = u * Math.PI * 2;
      const sample = points[(ir * 19 + ia * 11 + hash) % points.length];
      const radius = v * 5.2 + Math.sin(v * Math.PI * 18 - time * 1.15 + sample.x * 0.08) * 0.1;
      const ringWave = Math.sin(v * Math.PI * 22 - time * 1.35 + sample.z * 0.18) * 0.62;
      const crossWave = Math.cos(angle * 5 + time * 0.32 + sample.y * 0.1) * 0.18;
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

function buildPrismGeometry(points: THREE.Vector3[], time: number, hash: number) {
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

      const sample = points[(columnIndex * 23 + hash) % points.length];
      const pulse = 0.5 + 0.5 * Math.sin(columnIndex * 0.73 + time + sample.z * 0.16);
      const height = 0.55 + pulse * 2.5 + Math.abs(sample.z) * 0.08;
      const radius = 0.34 + pulse * 0.08;
      appendHexColumn(
        positions,
        uvs,
        indices,
        new THREE.Vector2(x + sample.x * 0.035, y + sample.y * 0.035),
        radius,
        height,
        time * 0.1 + columnIndex * 0.18,
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

function buildVortexGeometry(points: THREE.Vector3[], time: number, hash: number) {
  const lengthSegments = 136;
  const crossSegments = 14;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= lengthSegments; i++) {
    const alpha = i / lengthSegments;
    const sample = points[Math.floor(alpha * (points.length - 1))];
    const angle = alpha * Math.PI * (8.5 + (hash % 4) * 0.25) + time * 0.28;
    const radius = 4.8 - alpha * 3.35 + Math.sin(alpha * Math.PI * 7 + time + sample.x * 0.1) * 0.42;
    const radial = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
    const tangent = new THREE.Vector3(-Math.sin(angle), Math.cos(angle), 0);

    for (let j = 0; j <= crossSegments; j++) {
      const beta = j / crossSegments;
      const fold = (beta - 0.5) * (1.3 + Math.sin(alpha * Math.PI * 5 + time) * 0.32);
      const crest = Math.sin(beta * Math.PI * 2 + alpha * Math.PI * 12 - time) * 0.26;
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

function buildFormulaGeometry(points: THREE.Vector3[], mode: FormulaGeometryMode, formulaName: string, time: number) {
  const hash = hashText(formulaName);

  try {
    switch (mode) {
      case 'ribbon':
        return buildRibbonGeometry(points, time, hash);
      case 'extrude':
        return buildExtrudeGeometry(points, time, hash);
      case 'lathe':
        return buildLatheGeometry(points, time, hash);
      case 'crystal':
        return buildCrystalGeometry(points, time, hash);
      case 'surface':
        return buildSurfaceGeometry(points, time, hash);
      case 'helix':
        return buildHelixGeometry(points, time, hash);
      case 'shell':
        return buildShellGeometry(points, time, hash);
      case 'terrain':
        return buildTerrainGeometry(points, time, hash);
      case 'constellation':
        return buildConstellationGeometry(points, time, hash);
      case 'knot':
        return buildKnotGeometry(points, time, hash);
      case 'mandala':
        return buildMandalaGeometry(points, time, hash);
      case 'lattice':
        return buildLatticeGeometry(points, time, hash);
      case 'ripple':
        return buildRippleGeometry(points, time, hash);
      case 'prism':
        return buildPrismGeometry(points, time, hash);
      case 'vortex':
        return buildVortexGeometry(points, time, hash);
      case 'tube':
      default:
        return buildTubeGeometry(points, hash);
    }
  } catch (error) {
    console.warn(`Unable to build ${mode} geometry for WebGL path:`, error);
    return buildTubeGeometry(points, hash);
  }
}

interface GraphViewProps {
  formula: Formula;
  shader: ShaderPreset;
  webgpuLighting: number;
  webgpuLightingPreset: WebGPULightingPreset;
  webgpuMaterial: WebGPUMaterialProfile;
  webgpuGeometry: WebGPUGeometryProfile;
  showEnvironment: boolean;
  lineWidth: number;
  postFX: boolean;
  bloomIntensity: number;
  show3D: boolean;
  setShow3D?: (show: boolean) => void;
  showWireframe: boolean;
  setShowWireframe?: (show: boolean) => void;
  showArtifacts: boolean;
  setShowArtifacts?: (show: boolean) => void;
  showMirrors: boolean;
  speed: number;
  setSpeed?: (speed: number) => void;
  xrStore: any;
  onNextFormula?: () => void;
  onNextShader?: () => void;
  isPlaying: boolean;
  onTogglePlay?: () => void;
  onSelectFormula?: (formula: Formula) => void;
  onSelectShader?: (shader: ShaderPreset) => void;
  audioSync: boolean;
  setAudioSync?: (sync: boolean) => void;
  autoCycleFormula: boolean;
  setAutoCycleFormula?: (auto: boolean) => void;
  autoCycleShader: boolean;
  setAutoCycleShader?: (auto: boolean) => void;
  speedQuant: number;
  setSpeedQuant?: (q: number) => void;
  formulaQuant: number;
  setFormulaQuant?: (q: number) => void;
  shaderQuant: number;
  setShaderQuant?: (q: number) => void;
  formulaCycleSpeed: number;
  setFormulaCycleSpeed?: (s: number) => void;
  shaderCycleSpeed: number;
  setShaderCycleSpeed?: (s: number) => void;
  // True while note-constellation mode should replace the single center mesh
  // (toggle on + live MIDI session); App owns the gating.
  noteMeshes?: boolean;
  // The audio page hides the formula/render text overlays — they churn too
  // fast during playback to read.
  showHudInfo?: boolean;
}

function FormulaLine({
  formula,
  shader,
  show3D,
  showWireframe,
  materialProfile = 'auto',
  lineWidth = 0,
  geometryMode: geometryModeOverride
}: {
  formula: Formula;
  shader: ShaderPreset;
  show3D: boolean;
  showWireframe: boolean;
  materialProfile?: WebGPUMaterialProfile;
  lineWidth?: number;
  geometryMode?: FormulaGeometryMode;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const lineRef = useRef<any>(null);
  const resolvedGeometryMode = useMemo(() => resolveFormulaGeometryMode(formula), [formula]);
  const geometryMode = geometryModeOverride ?? resolvedGeometryMode;

  // Track the right hand / controller input sources in VR/AR
  const rightController = useXRInputSourceState('controller', 'right');
  const rightHand = useXRInputSourceState('hand', 'right');
  // Adaptive detail: smaller meshes and a slower rebuild cadence while a
  // headset is presenting, to protect the 90 Hz frame budget.
  const xrSession = useXR((state) => state.session);
  const curveResolution3D = xrSession ? 320 : 500;
  const surfaceSegments = xrSession ? SURFACE_SEGMENTS_XR : SURFACE_SEGMENTS_DESKTOP;
  const parametricCadence = xrSession ? 300 : PARAMETRIC_REBUILD_MS;

  const scalarTarget = useMemo(() => resolveFormulaScalarTarget(formula), [formula]);
  const scalarValueRef = useRef(scalarTarget.baseScalar);
  const [scalarValue, setScalarValue] = useState(scalarTarget.baseScalar);

  const compiled = useMemo(() => {
    try {
      return { 
        x: compile(scalarTarget.x), 
        y: compile(scalarTarget.y), 
        z: compile(scalarTarget.z), 
        valid: true 
      };
    } catch (e) {
      // Silently catch compilation errors (happens normally when user is mid-typing a formula)
      return { valid: false, x: null, y: null, z: null };
    }
  }, [scalarTarget]);

  const getSValue = () => {
    const handPos = rightHand?.object?.position || rightController?.object?.position || null;
    if (handPos) {
      const heightAmount = THREE.MathUtils.clamp((handPos.y - 0.45) / 1.35, 0, 1);
      const handMod = THREE.MathUtils.lerp(0.25, 2.25, heightAmount);
      return scalarTarget.baseScalar * handMod;
    }

    // MIDI note morphing: the melody line steers the same morph handle the
    // XR hand does — pitch reshapes the geometry, note-on velocity kicks it.
    // The Note FX dials scale the depth and can gate the channel entirely.
    const clockState = clockStore.getState();
    const morphOn = clockState.noteFxMode === 'both' || clockState.noteFxMode === 'morph';
    if (clockState.midiLive && morphOn && clockState.noteFxAmount > 0) {
      const amount = clockState.noteFxAmount;
      const melodyMod = 1 + (THREE.MathUtils.lerp(0.78, 1.5, clockState.melody) - 1) * amount;
      return scalarTarget.baseScalar * melodyMod * (1 + clockState.notePulse * 0.16 * amount);
    }

    return scalarTarget.baseScalar;
  };

  useEffect(() => {
    const nextScalar = getSValue();
    scalarValueRef.current = nextScalar;
    setScalarValue(nextScalar);
  }, [scalarTarget.baseScalar, scalarTarget.field, scalarTarget.match]);

  const resolution = 500;

  // Stable geometry that never gets recreated
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((resolution + 1) * 3), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((resolution + 1) * 2), 2));

    // Fill normals with Z-up so 2D lines don't crash the physical shaders
    const normals = new Float32Array((resolution + 1) * 3);
    for (let i = 0; i <= resolution; i++) {
      normals[i * 3 + 2] = 1.0;
    }
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    return geo;
  }, []);

  // Ribbon variant of the 2D line: two vertices per sample offset
  // perpendicular to the curve in the XY plane, so shader presets get a real
  // uv.y across the width. Updated in place each frame, same as the line.
  const ribbonGeometry = useMemo(() => {
    const vertCount = (resolution + 1) * 2;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertCount * 3), 3));
    const uvs = new Float32Array(vertCount * 2);
    const normals = new Float32Array(vertCount * 3);
    const indices: number[] = [];
    for (let i = 0; i <= resolution; i++) {
      uvs[i * 4] = i / resolution;
      uvs[i * 4 + 1] = 0;
      uvs[i * 4 + 2] = i / resolution;
      uvs[i * 4 + 3] = 1;
      normals[i * 6 + 2] = 1;
      normals[i * 6 + 5] = 1;
      if (i < resolution) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setIndex(indices);
    return geo;
  }, []);

  useEffect(() => () => {
    geometry.dispose();
    ribbonGeometry.dispose();
  }, [geometry, ribbonGeometry]);

  const useRibbon = lineWidth >= 0.02;

  const shaderMaterial = useMemo(() => {
    // uBass/uMid/uTreble are supplied for any preset or custom shader that
    // declares them; existing shaders that don't are unaffected.
    return new THREE.ShaderMaterial({
      uniforms: {
        time: { value: getClockTime() },
        uBass: { value: 0 },
        uMid: { value: 0 },
        uTreble: { value: 0 }
      },
      vertexShader: DEFAULT_VERTEX_SHADER,
      fragmentShader: shader.fragmentShader,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      wireframe: showWireframe
    });
  }, [shader.fragmentShader, showWireframe]);

  useEffect(() => {
    return () => shaderMaterial.dispose();
  }, [shaderMaterial]);

  // 'auto' keeps the GLSL preset shader; a concrete profile switches the 3D
  // mesh to a lit MeshPhysicalMaterial (transmission/iridescence/sheen/...),
  // matching the WebGPU path's material picker. 2D lines always use GLSL.
  const physicalMaterial = useMemo(
    () => (materialProfile !== 'auto' ? createPhysicalMaterial(materialProfile, showWireframe) : null),
    [materialProfile, showWireframe]
  );

  useEffect(() => {
    return () => physicalMaterial?.dispose();
  }, [physicalMaterial]);

  const meshMaterial = physicalMaterial ?? shaderMaterial;

  const groupRef = useRef<THREE.Group>(null);

  // 3D geometry is throttled: rebuilt immediately on structural changes, then
  // on a fixed cadence from useFrame — never per React render, never per frame.
  const [geometry3D, setGeometry3D] = useState<THREE.BufferGeometry | null>(null);
  const lastRebuildRef = useRef(0);

  useEffect(() => {
    if (!show3D) {
      setGeometry3D(null);
      return;
    }
    const t = getClockTime();
    if (formula.parametric) {
      if (compiled.valid) setGeometry3D(buildParametricGeometry(formula, compiled, t, scalarValue, surfaceSegments));
    } else {
      const points = sampleFormulaPoints(compiled, t, scalarValue, curveResolution3D);
      setGeometry3D(buildFormulaGeometry(points, geometryMode, formula.name, t));
    }
    lastRebuildRef.current = performance.now();
  }, [compiled, formula, geometryMode, scalarValue, show3D, surfaceSegments, curveResolution3D]);

  useEffect(() => {
    if (geometry3D) reportVerts(geometry3D.getAttribute('position')?.count ?? 0);
    return () => geometry3D?.dispose();
  }, [geometry3D]);

  // Update geometry directly in the render loop without triggering React renders or GC
  useFrame(() => {
    const time = getClockTime();
    const clock = clockStore.getState();
    if (shaderMaterial) {
      shaderMaterial.uniforms.time.value = time;
      shaderMaterial.uniforms.uBass.value = clock.bass;
      shaderMaterial.uniforms.uMid.value = clock.mid;
      shaderMaterial.uniforms.uTreble.value = clock.treble;
    }
    if (physicalMaterial) {
      // Bass drives the emissive pulse while audio sync is running.
      if (physicalMaterial.userData.baseEmissive === undefined) {
        physicalMaterial.userData.baseEmissive = physicalMaterial.emissiveIntensity;
      }
      const base = physicalMaterial.userData.baseEmissive as number;
      const pulseOn = clock.noteFxMode === 'both' || clock.noteFxMode === 'pulse';
      const pulseAmt = pulseOn ? clock.noteFxAmount : 0;
      const emissiveDrive = Math.min(1.2, Math.max(clock.bass, clock.notePulse * 0.75 * pulseAmt));
      physicalMaterial.emissiveIntensity = clock.audioSync ? base + (0.25 + base * 1.8) * emissiveDrive : base;
    }
    const nextScalar = getSValue();
    const scalarThreshold = Math.max(0.005, Math.abs(scalarTarget.baseScalar) * 0.003);

    if (Math.abs(nextScalar - scalarValueRef.current) > scalarThreshold) {
      scalarValueRef.current = nextScalar;
      setScalarValue(nextScalar);
    }

    // Custom float effect for 3D mode (replaces Drei's Float component to avoid THREE.Clock warnings)
    if (groupRef.current) {
      // Universal audio pulse: scales the whole visual with the bass so even
      // unlit GLSL looks visibly react to music.
      const scalePulseAmt = clock.noteFxMode === 'both' || clock.noteFxMode === 'pulse' ? clock.noteFxAmount : 0;
      groupRef.current.scale.setScalar(clock.audioSync ? 1 + clock.bass * 0.055 + clock.notePulse * 0.045 * scalePulseAmt : 1);
      if (show3D) {
        groupRef.current.position.y = Math.sin(time * 2) * 0.5;
        groupRef.current.rotation.x = Math.sin(time * 0.5) * 0.1;
        groupRef.current.rotation.y = time * 0.2;
      } else {
        groupRef.current.position.y = 0;
        groupRef.current.rotation.set(0, 0, 0);
      }
    }

    if (show3D) {
      const now = performance.now();
      const cadence = formula.parametric ? parametricCadence : GEOMETRY_REBUILD_MS;
      if (now - lastRebuildRef.current >= cadence) {
        lastRebuildRef.current = now;
        if (formula.parametric) {
          if (compiled.valid) setGeometry3D(buildParametricGeometry(formula, compiled, time, nextScalar, surfaceSegments));
        } else {
          const points = sampleFormulaPoints(compiled, time, nextScalar, curveResolution3D);
          setGeometry3D(buildFormulaGeometry(points, geometryMode, formula.name, time));
        }
      }
      return;
    }

    const points = sampleFormulaPoints(compiled, time, nextScalar, resolution, formula.parametric ? surfaceMidQ(formula) : 0);

    if (useRibbon) {
      const positions = ribbonGeometry.attributes.position.array as Float32Array;
      // Ribbon breathes with the bass while audio sync is running.
      const audioBoost = clock.audioSync ? 1 + clock.bass * 0.9 : 1;
      const halfWidth = lineWidth * 0.5 * 26 * audioBoost; // scene units (curve spans ~±13)
      for (let i = 0; i <= resolution; i++) {
        const prev = points[Math.max(0, i - 1)];
        const next = points[Math.min(resolution, i + 1)];
        let tx = next.x - prev.x;
        let ty = next.y - prev.y;
        const len = Math.hypot(tx, ty) || 1;
        tx /= len;
        ty /= len;
        const ox = -ty * halfWidth;
        const oy = tx * halfWidth;
        const base = i * 6;
        positions[base] = points[i].x + ox;
        positions[base + 1] = points[i].y + oy;
        positions[base + 2] = points[i].z;
        positions[base + 3] = points[i].x - ox;
        positions[base + 4] = points[i].y - oy;
        positions[base + 5] = points[i].z;
      }
      ribbonGeometry.attributes.position.needsUpdate = true;
      return;
    }

    const positions = geometry.attributes.position.array as Float32Array;
    const uvs = geometry.attributes.uv.array as Float32Array;
    for (let i = 0; i <= resolution; i++) {
      positions[i * 3] = points[i].x;
      positions[i * 3 + 1] = points[i].y;
      positions[i * 3 + 2] = points[i].z;

      uvs[i * 2] = i / resolution;
      uvs[i * 2 + 1] = 0.5;
    }

    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.uv.needsUpdate = true;
  });

  return (
    <group ref={groupRef}>
      {!show3D && !useRibbon && (
        <Line ref={lineRef} geometry={geometry} frustumCulled={false}>
          <primitive object={shaderMaterial} attach="material" />
        </Line>
      )}
      {!show3D && useRibbon && (
        <mesh geometry={ribbonGeometry} frustumCulled={false}>
          <primitive object={shaderMaterial} attach="material" />
        </mesh>
      )}
      {show3D && geometry3D && (
        <mesh ref={meshRef} frustumCulled={false}>
          <primitive object={geometry3D} attach="geometry" />
          <primitive object={meshMaterial} attach="material" />
        </mesh>
      )}
    </group>
  );
}

// One mesh per sounding note: every note-on births an echo of a formula at
// its pitch position (low notes left, high notes right, arced back at the
// edges), sized by velocity, popped in over the attack and shrunk away over
// the release. Multi-instrument scores split into groups (distinct
// track:channel pairs ranked by note count, capped) and each group renders
// as its own formula + material on its own depth layer, so instruments are
// tellable apart at a glance. All meshes in a group share one throttled
// geometry, and rebuilds round-robin one group per tick — four instruments
// cost the same per-frame rebuild budget as one.
const NOTE_GROUP_CAP = 4;
const NOTE_GROUP_POOL = 6; // concurrent meshes per instrument group
const NOTE_GROUP_REBUILD_MS = 240;

// Distinct, tone-safe looks for groups beyond the first; group 0 wears the
// user's selected material.
const NOTE_GROUP_PROFILES: Exclude<WebGPUMaterialProfile, 'auto'>[] = ['glass', 'ruby', 'copper', 'ice', 'jade'];

function NoteConstellation({
  formula,
  showWireframe,
  materialProfile = 'auto',
  geometryMode: geometryModeOverride
}: {
  formula: Formula;
  showWireframe: boolean;
  materialProfile?: WebGPUMaterialProfile;
  geometryMode?: FormulaGeometryMode;
}) {
  // Group 0 plays the selected formula; further instrument groups take
  // distinct formulas from the curated combos so each instrument keeps a
  // recognizable silhouette.
  const groupFormulas = useMemo(() => {
    const list: Formula[] = [formula];
    for (const combo of COMBOS) {
      if (list.length >= NOTE_GROUP_CAP) break;
      const candidate = PRESET_FORMULAS.find((p) => p.id === combo.formulaId);
      if (candidate && !list.some((f) => f.id === candidate.id)) list.push(candidate);
    }
    for (const candidate of PRESET_FORMULAS) {
      if (list.length >= NOTE_GROUP_CAP) break;
      if (!list.some((f) => f.id === candidate.id)) list.push(candidate);
    }
    return list;
  }, [formula]);

  const groupCompiled = useMemo(() => groupFormulas.map((groupFormula) => {
    const scalarTarget = resolveFormulaScalarTarget(groupFormula);
    try {
      return {
        formula: groupFormula,
        scalarTarget,
        x: compile(scalarTarget.x),
        y: compile(scalarTarget.y),
        z: compile(scalarTarget.z),
        valid: true
      };
    } catch {
      return { formula: groupFormula, scalarTarget, x: null, y: null, z: null, valid: false };
    }
  }), [groupFormulas]);

  const groupRef = useRef<THREE.Group>(null);
  const meshRefs = useRef<Array<THREE.Mesh | null>>([]);
  // Per-group note id -> slot maps, so a sustained note keeps its mesh
  // while neighbours come and go.
  const slotMapsRef = useRef(Array.from({ length: NOTE_GROUP_CAP }, () => new Map<number, number>()));

  const materials = useMemo(() => {
    const first = materialProfile !== 'auto' ? materialProfile : 'pearl';
    const profiles: Exclude<WebGPUMaterialProfile, 'auto'>[] = [first];
    for (const profile of NOTE_GROUP_PROFILES) {
      if (profiles.length >= NOTE_GROUP_CAP) break;
      if (!profiles.includes(profile)) profiles.push(profile);
    }
    return profiles.map((profile) => Array.from({ length: NOTE_GROUP_POOL }, () => {
      const material = createPhysicalMaterial(profile, showWireframe);
      material.userData.baseEmissive = material.emissive.clone();
      material.userData.baseEmissiveIntensity = material.emissiveIntensity;
      return material;
    }));
  }, [materialProfile, showWireframe]);

  useEffect(() => () => materials.flat().forEach((m) => m.dispose()), [materials]);

  // Group geometries live in a ref and are swapped from the frame loop; the
  // version bump re-renders so the mesh JSX picks up new objects.
  const geometriesRef = useRef<(THREE.BufferGeometry | null)[]>(Array(NOTE_GROUP_CAP).fill(null));
  const [, setGeometryVersion] = useState(0);
  const lastRebuildRef = useRef(0);
  const rebuildCursorRef = useRef(0);

  const buildGroupGeometry = (g: number, t: number) => {
    const entry = groupCompiled[g];
    if (!entry || !entry.valid) return;
    const geometryMode = g === 0
      ? (geometryModeOverride ?? resolveFormulaGeometryMode(entry.formula))
      : resolveFormulaGeometryMode(entry.formula);
    const built = entry.formula.parametric
      ? buildParametricGeometry(entry.formula, entry, t, entry.scalarTarget.baseScalar, SURFACE_SEGMENTS_XR)
      : buildFormulaGeometry(sampleFormulaPoints(entry, t, entry.scalarTarget.baseScalar, 320), geometryMode, entry.formula.name, t);
    geometriesRef.current[g]?.dispose();
    geometriesRef.current[g] = built;
    setGeometryVersion((v) => v + 1);
  };

  // Formula switches rebuild the lead group immediately; the other groups
  // refresh on the round-robin within a second.
  useEffect(() => {
    buildGroupGeometry(0, getClockTime());
    lastRebuildRef.current = performance.now();
  }, [groupCompiled, geometryModeOverride]);

  useEffect(() => () => {
    geometriesRef.current.forEach((geometry) => geometry?.dispose());
    geometriesRef.current = Array(NOTE_GROUP_CAP).fill(null);
  }, []);

  useFrame(() => {
    const time = getClockTime();
    const clock = clockStore.getState();
    const active = clock.activeNotes;
    const usedGroups = Math.max(1, Math.min(NOTE_GROUP_CAP, clock.noteGroupCount));
    const fxAmount = clock.noteFxAmount;

    const now = performance.now();
    if (now - lastRebuildRef.current >= NOTE_GROUP_REBUILD_MS) {
      lastRebuildRef.current = now;
      const g = rebuildCursorRef.current % usedGroups;
      rebuildCursorRef.current = (rebuildCursorRef.current + 1) % usedGroups;
      buildGroupGeometry(g, time);
    }

    if (groupRef.current) {
      groupRef.current.scale.setScalar(1 + clock.bass * 0.04);
      groupRef.current.position.y = Math.sin(time * 1.4) * 0.35;
    }

    for (let g = 0; g < NOTE_GROUP_CAP; g++) {
      const slots = slotMapsRef.current[g];
      const groupNotes = active.filter((n) => n.group === g);
      const liveIds = new Set(groupNotes.map((n) => n.id));
      for (const [id] of slots) {
        if (!liveIds.has(id)) slots.delete(id);
      }
      const used = new Set(slots.values());
      for (const note of groupNotes) {
        if (slots.has(note.id)) continue;
        for (let slot = 0; slot < NOTE_GROUP_POOL; slot++) {
          if (!used.has(slot)) {
            used.add(slot);
            slots.set(note.id, slot);
            break;
          }
        }
      }

      // Each instrument gets its own depth layer and a gentle vertical
      // stagger so groups read as parallel voices, not one crowd.
      const depth = -g * 2.4;
      const lift = (g - (usedGroups - 1) / 2) * 1.15;

      for (let slot = 0; slot < NOTE_GROUP_POOL; slot++) {
        const mesh = meshRefs.current[g * NOTE_GROUP_POOL + slot];
        if (!mesh) continue;
        const note = groupNotes.find((n) => slots.get(n.id) === slot);
        const material = materials[g]?.[slot];

        if (!note || !material) {
          // Silence means an empty stage: the constellation exists only
          // while notes sound, so rests read as rests.
          mesh.visible = false;
          continue;
        }

        const { pitch01, velocity01, env, id } = note;
        const eased = 1 - Math.pow(1 - env, 3);
        const spread = clock.noteSpread;
        mesh.visible = eased > 0.01;
        mesh.position.set(
          (pitch01 - 0.5) * 17 * spread,
          ((pitch01 - 0.5) * 3.5 + lift) * spread + Math.sin(time * 1.6 + slot * 1.3 + g * 2.1) * 0.5,
          -Math.abs(pitch01 - 0.5) * 6 + depth
        );
        mesh.rotation.set(
          Math.sin(time * 0.7 + id) * 0.18,
          time * (0.35 + pitch01 * 0.45) + id * 0.9,
          0
        );
        // The FX amount dial scales the velocity accent, not the note's
        // core lifecycle — at 0 every note is still born and released.
        mesh.scale.setScalar((0.17 + velocity01 * 0.12 * fxAmount) * eased);

        // Pitch tints the emissive: low notes warm, high notes cool.
        const base = material.userData.baseEmissive as THREE.Color;
        (material.emissive as THREE.Color).copy(base).offsetHSL((pitch01 - 0.5) * 0.22, 0.05, 0);
        material.emissiveIntensity = (material.userData.baseEmissiveIntensity as number) * (0.6 + env * 1.5 * Math.max(0.35, fxAmount));
      }
    }
  });

  return (
    <group ref={groupRef}>
      {Array.from({ length: NOTE_GROUP_CAP }, (_, g) => {
        const geometry = geometriesRef.current[g];
        if (!geometry) return null;
        return (
          <group key={g}>
            {Array.from({ length: NOTE_GROUP_POOL }, (_, slot) => (
              <mesh
                key={slot}
                ref={(mesh) => { meshRefs.current[g * NOTE_GROUP_POOL + slot] = mesh; }}
                geometry={geometry}
                material={materials[g]?.[slot]}
                frustumCulled={false}
                visible={false}
              />
            ))}
          </group>
        );
      })}
    </group>
  );
}

// Per-rig PMREM environment (no network fetch): gradient sky + emissive
// lightformers at the rig's own light positions, so switching rigs reshapes
// every reflection and refraction in the scene.
function RigEnvironment({ preset, intensity }: { preset: WebGPULightingPreset; intensity: number }) {
  const { gl, scene } = useThree();

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const envScene = buildRigEnvironmentScene(preset);
    const envTexture = pmrem.fromScene(envScene, 0.04).texture;
    scene.environment = envTexture;
    return () => {
      if (scene.environment === envTexture) scene.environment = null;
      envTexture.dispose();
      pmrem.dispose();
      disposeEnvironmentScene(envScene);
    };
  }, [gl, scene, preset]);

  useEffect(() => {
    scene.environmentIntensity = 0.45 + THREE.MathUtils.clamp(intensity, 0.45, 3.5) * 0.45;
    return () => {
      scene.environmentIntensity = 1;
    };
  }, [scene, intensity]);

  return null;
}

// Soft grounding shadow under the floating visual — desktop only (XR has a
// real floor reference and a different scale).
function GroundShadows({ show3D }: { show3D: boolean }) {
  const session = useXR((state) => state.session);
  if (session || !show3D) return null;
  return (
    <ContactShadows
      position={[0, -15.5, 0]}
      opacity={0.5}
      scale={46}
      blur={2.4}
      far={34}
      resolution={512}
      frames={Infinity}
      color="#000000"
    />
  );
}

// Bloom + vignette for flat-screen rendering; XR sessions bypass the
// composer entirely (EffectComposer and WebXR layers don't mix).
function PostEffects({ enabled, bloom }: { enabled: boolean; bloom: number }) {
  const session = useXR((state) => state.session);
  // NOTE: do not pass a ref to <Bloom> — @react-three/postprocessing
  // JSON.stringifies effect props to memoize them, and once the ref holds
  // the live effect (which references the scene graph) that stringify hits
  // a circular structure and crashes the canvas on the next re-render.
  // The composer ref is safe; we duck-type the bloom effect out of its
  // passes to drive the bass pulse.
  const composerRef = useRef<any>(null);

  useFrame(() => {
    const composer = composerRef.current;
    if (!composer) return;
    const state = clockStore.getState();
    const target = bloom * (state.audioSync ? 1 + state.bass * 1.5 : 1);
    for (const pass of composer.passes ?? []) {
      for (const effect of (pass as any).effects ?? []) {
        if ('intensity' in effect && (effect as any).luminanceMaterial) {
          (effect as any).intensity = target;
        }
      }
    }
  });

  if (!enabled || session) return null;
  return (
    <EffectComposer ref={composerRef} multisampling={4}>
      {/* Threshold sits above the luminance of a well-lit pale surface so
          bloom only catches emissives and true speculars — a white material
          under the key light must read as a surface, not a flare. */}
      <Bloom intensity={bloom} luminanceThreshold={0.92} luminanceSmoothing={0.18} mipmapBlur radius={0.58} />
      <Vignette eskil={false} offset={0.18} darkness={0.6} />
    </EffectComposer>
  );
}

// Declarative version of the WebGPU path's light rigs (shared data table).
// While audio sync is on, band energies modulate the lights directly in the
// frame loop: bass drives the key, mids the fill, treble the rim.
function LightingRig({ preset, intensity }: { preset: WebGPULightingPreset; intensity: number }) {
  const { gl } = useThree();
  const rig = lightingRigSettings(preset);
  const light = THREE.MathUtils.clamp(intensity, 0.45, 3.5);
  // The WebGL path stacks rig lights + PMREM environment + bloom, so both
  // exposure and the rig's point-light scales run tamer than the raw table
  // (which was tuned for the WebGPU path without an environment).
  const exposure = 0.53 + light * 0.35;
  const keyTame = 0.8;
  const rimTame = 0.55;
  const fillTame = 0.6;
  const keyRef = useRef<THREE.DirectionalLight>(null);
  const rimRef = useRef<THREE.PointLight>(null);
  const fillRef = useRef<THREE.PointLight>(null);

  useEffect(() => {
    const previousExposure = gl.toneMappingExposure;
    gl.toneMappingExposure = exposure;
    return () => {
      gl.toneMappingExposure = previousExposure;
    };
  }, [gl, exposure]);

  useFrame(() => {
    const state = clockStore.getState();
    const active = state.audioSync;
    if (keyRef.current) keyRef.current.intensity = rig.keyScale * light * keyTame * (active ? 1 + state.bass * 1.1 : 1);
    if (rimRef.current) rimRef.current.intensity = rig.rimScale * light * rimTame * (active ? 1 + state.treble * 1.6 : 1);
    if (fillRef.current) fillRef.current.intensity = rig.fillScale * light * fillTame * (active ? 1 + state.mid * 0.9 : 1);
  });

  return (
    <>
      {/* Ambient/hemi are the flatteners: past ~1x light they erase shading
          contrast and pale materials read as blank white. Grow them slower
          than the key/rim/fill so raising the light level adds punch, not fog. */}
      <ambientLight color={rig.ambient} intensity={0.25 + light * rig.ambientScale * 0.5} />
      <hemisphereLight color={rig.ambient} groundColor={rig.ground} intensity={0.4 + light * rig.hemiScale * 0.55} />
      <directionalLight ref={keyRef} color={rig.key} position={rig.keyPosition} intensity={rig.keyScale * light * keyTame} />
      <pointLight ref={rimRef} color={rig.rim} position={rig.rimPosition} intensity={rig.rimScale * light * rimTame} distance={36} />
      <pointLight ref={fillRef} color={rig.fill} position={rig.fillPosition} intensity={rig.fillScale * light * fillTame} distance={32} />
    </>
  );
}

// Beat-synced haptic pulse on whichever controllers are connected (Quest);
// transient-pointer input (Vision Pro hands) has no actuators, so this is a
// silent no-op there.
function XRBeatHaptics() {
  const leftController = useXRInputSourceState('controller', 'left');
  const rightController = useXRInputSourceState('controller', 'right');
  const lastBeatRef = useRef(0);

  useFrame(() => {
    const state = clockStore.getState();
    if (!state.audioSync || state.lastBeatAt === lastBeatRef.current) return;
    lastBeatRef.current = state.lastBeatAt;
    [leftController, rightController].forEach((controller) => {
      const actuator = (controller?.inputSource?.gamepad as any)?.hapticActuators?.[0];
      actuator?.pulse?.(0.55, 70);
    });
  });

  return null;
}

// Immersive-VR surroundings: a rig-tinted dome, a sparse starfield and a
// floor disc + grid so the void has depth and a ground reference. Hidden in
// passthrough modes (the real room is the environment there).
function XREnvironment({ preset, desktopVisible }: { preset: WebGPULightingPreset; desktopVisible: boolean }) {
  const session = useXR((state) => state.session);
  const isPresenting = !!session;
  const blend = session?.environmentBlendMode;
  const isPassthrough = blend === 'alpha-blend' || blend === 'additive';
  const rig = lightingRigSettings(preset);

  // Round sprite for the stars — default point sprites are untextured
  // SQUARES, which read as scattered grey boxes when they catch the eye.
  const starSprite = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.35, 'rgba(255,255,255,0.75)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
  }, []);

  useEffect(() => () => starSprite.dispose(), [starSprite]);

  const stars = useMemo(() => {
    const count = 1200;
    const positions = new Float32Array(count * 3);
    // Deterministic LCG so the sky is identical every session.
    let seed = 1234567;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let i = 0; i < count; i++) {
      const radius = 30 + rand() * 14;
      const theta = rand() * Math.PI * 2;
      const phi = Math.acos(rand() * 2 - 1);
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = Math.abs(radius * Math.cos(phi)) * 0.9 - 2;
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geometry;
  }, []);

  useEffect(() => () => stars.dispose(), [stars]);

  const grid = useMemo(() => {
    const helper = new THREE.GridHelper(14, 28, new THREE.Color(rig.rim), new THREE.Color(rig.ground));
    const material = helper.material as THREE.LineBasicMaterial;
    material.transparent = true;
    material.opacity = 0.22;
    material.depthWrite = false;
    return helper;
  }, [rig.rim, rig.ground]);

  useEffect(() => () => {
    grid.geometry.dispose();
    (grid.material as THREE.Material).dispose();
  }, [grid]);

  if (isPresenting ? isPassthrough : !desktopVisible) return null;

  return (
    <group>
      <mesh>
        <sphereGeometry args={[50, 32, 16]} />
        <meshBasicMaterial color={rig.background} side={THREE.BackSide} depthWrite={false} />
      </mesh>
      <points geometry={stars}>
        <pointsMaterial map={starSprite} alphaTest={0.05} size={0.14} sizeAttenuation color="#cdd8ff" transparent opacity={0.8} depthWrite={false} />
      </points>
      {/* Ground reference only makes sense with a floor-level origin (XR). */}
      {isPresenting && (
        <>
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.002, 0]}>
            <circleGeometry args={[7.5, 48]} />
            <meshBasicMaterial color={rig.ground} transparent opacity={0.5} depthWrite={false} />
          </mesh>
          <primitive object={grid} position={[0, 0.02, 0]} />
        </>
      )}
    </group>
  );
}

function AngledMirrorSurfaces({ show3D }: { show3D: boolean }) {
  if (!show3D) return null;

  return (
    <group position={[0, 0, 0]} renderOrder={-2}>
      {MIRROR_PANEL_LAYOUT.map((panel) => (
        <group
          key={panel.id}
          position={panel.position}
          rotation={panel.rotation}
        >
          <mesh position={[0, 0, -0.04]}>
            <boxGeometry args={[panel.size[0] + 0.42, panel.size[1] + 0.42, 0.08]} />
            <meshStandardMaterial
              color="#070b12"
              emissive={panel.accent}
              emissiveIntensity={0.08}
              metalness={0.85}
              roughness={0.22}
              transparent
              opacity={0.78}
            />
          </mesh>

          <mesh>
            <planeGeometry args={panel.size} />
            <MeshReflectorMaterial
              resolution={512}
              blur={[180, 70]}
              mixBlur={0.28}
              mixStrength={1.05}
              mixContrast={1.12}
              mirror={0.82}
              depthScale={0.32}
              minDepthThreshold={0.18}
              maxDepthThreshold={1}
              color={panel.tint}
              metalness={1}
              roughness={0.04}
              side={THREE.DoubleSide}
            />
          </mesh>

          <mesh position={[0, 0, 0.012]}>
            <planeGeometry args={[panel.size[0] * 0.92, panel.size[1] * 0.92]} />
            <meshBasicMaterial
              color={panel.accent}
              transparent
              opacity={0.055}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

type SpatialPointer = {
  // Ray-object intersection: tracks where the user is "pointing at".
  point: THREE.Vector3;
  // Ray origin: tracks where the hand/controller physically is. Two-hand
  // gestures measure these — hit points slide off the object as hands close
  // together, which made shrinking nearly impossible on device.
  origin: THREE.Vector3;
};

type SpatialGesture = {
  mode: 'move' | 'transform';
  start: THREE.Vector3;
  origin: THREE.Vector3;
  initialDistance: number;
  initialScale: number;
  initialAngle: number;
  initialYaw: number;
};

function SpatialWrapper({
  children,
  xrVisualTransform,
  setXrVisualTransform,
  dragOffsetRef
}: {
  children: React.ReactNode;
  xrVisualTransform: XRVisualTransform;
  setXrVisualTransform?: XRVisualTransformSetter;
  dragOffsetRef: React.MutableRefObject<THREE.Vector3>;
}) {
  const session = useXR((state) => state.session);
  const isPresenting = !!session;
  const groupRef = useRef<THREE.Group>(null);
  const autoYawRef = useRef(xrVisualTransform.yaw);
  // XR grab gestures on the visual itself. One pinch/trigger drags the
  // object (the only way to move it on Vision Pro); two simultaneous pinches
  // scale by hand separation and yaw by hand orbit. Offset lives in a ref
  // owned by GraphView so the VIEW tab's RESET ALL can clear it.
  const activePointersRef = useRef(new Map<number, SpatialPointer>());
  const gestureRef = useRef<SpatialGesture | null>(null);

  useEffect(() => {
    autoYawRef.current = xrVisualTransform.yaw;
  }, [xrVisualTransform.yaw]);

  useFrame(() => {
    if (isPresenting && groupRef.current) {
      autoYawRef.current = xrVisualTransform.autoRotate
        ? autoYawRef.current + 0.005
        : xrVisualTransform.yaw;
      groupRef.current.rotation.set(xrVisualTransform.pitch, autoYawRef.current, xrVisualTransform.roll);
      const offset = dragOffsetRef.current;
      groupRef.current.position.set(offset.x, 1.1 + offset.y, -xrVisualTransform.distance + offset.z);
    }
  });

  const readPointer = (e: any): SpatialPointer | null => {
    if (!e.point) return null;
    return {
      point: e.point.clone(),
      origin: e.ray?.origin ? e.ray.origin.clone() : e.point.clone()
    };
  };

  const beginGesture = () => {
    const pointers = [...activePointersRef.current.values()];
    if (pointers.length >= 2) {
      const [a, b] = pointers;
      // Grabbing with both hands takes manual control: freeze auto-rotate at
      // the current heading so the turn gesture visibly sticks.
      const currentYaw = autoYawRef.current;
      setXrVisualTransform?.((prev) => (prev.autoRotate ? { ...prev, autoRotate: false, yaw: currentYaw } : prev));
      gestureRef.current = {
        mode: 'transform',
        start: new THREE.Vector3(),
        origin: dragOffsetRef.current.clone(),
        initialDistance: Math.max(0.03, a.origin.distanceTo(b.origin)),
        initialScale: xrVisualTransform.scale,
        initialAngle: Math.atan2(b.origin.x - a.origin.x, b.origin.z - a.origin.z),
        initialYaw: currentYaw
      };
    } else if (pointers.length === 1) {
      gestureRef.current = {
        mode: 'move',
        start: pointers[0].point.clone(),
        origin: dragOffsetRef.current.clone(),
        initialDistance: 0,
        initialScale: 0,
        initialAngle: 0,
        initialYaw: 0
      };
    } else {
      gestureRef.current = null;
    }
  };

  const handlePointerDown = (e: any) => {
    if (!isPresenting) return;
    const pointer = readPointer(e);
    if (!pointer) return;
    e.stopPropagation();
    activePointersRef.current.set(e.pointerId, pointer);
    e.target?.setPointerCapture?.(e.pointerId);
    beginGesture();
  };

  const handlePointerMove = (e: any) => {
    const pointers = activePointersRef.current;
    if (!isPresenting || !pointers.has(e.pointerId)) return;
    const pointer = readPointer(e);
    if (!pointer) return;
    e.stopPropagation();
    pointers.set(e.pointerId, pointer);
    const gesture = gestureRef.current;
    if (!gesture) return;

    if (gesture.mode === 'move') {
      const next = gesture.origin.clone().add(pointer.point.clone().sub(gesture.start));
      next.x = THREE.MathUtils.clamp(next.x, -2.5, 2.5);
      next.y = THREE.MathUtils.clamp(next.y, -0.8, 1.2);
      next.z = THREE.MathUtils.clamp(next.z, -2.5, 2.5);
      dragOffsetRef.current.copy(next);
      return;
    }

    const [a, b] = [...pointers.values()];
    if (!a || !b) return;
    // Hand separation drives scale; exponent > 1 widens the travel so a
    // comfortable hand movement covers the full range in either direction.
    const separation = Math.max(0.03, a.origin.distanceTo(b.origin));
    const ratio = Math.pow(separation / gesture.initialDistance, 1.35);
    const deltaYaw = Math.atan2(b.origin.x - a.origin.x, b.origin.z - a.origin.z) - gesture.initialAngle;
    setXrVisualTransform?.((prev) => ({
      ...prev,
      scale: THREE.MathUtils.clamp(gesture.initialScale * ratio, XR_VISUAL_SCALE_MIN, XR_VISUAL_SCALE_MAX),
      yaw: gesture.initialYaw + deltaYaw
    }));
  };

  const handlePointerUp = (e: any) => {
    if (!activePointersRef.current.has(e.pointerId)) return;
    activePointersRef.current.delete(e.pointerId);
    e.target?.releasePointerCapture?.(e.pointerId);
    // Re-anchor so a remaining pointer continues smoothly as a move gesture.
    beginGesture();
  };

  const scale = isPresenting ? xrVisualTransform.scale : 1;
  const position: [number, number, number] = isPresenting
    ? [dragOffsetRef.current.x, 1.1 + dragOffsetRef.current.y, -xrVisualTransform.distance + dragOffsetRef.current.z]
    : [0, 0, 0];
  const rotation: [number, number, number] = isPresenting
    ? [xrVisualTransform.pitch, autoYawRef.current, xrVisualTransform.roll]
    : [0, 0, 0];

  return (
    <>
      {!isPresenting && <DesktopOrbitControls />}

      <group
        ref={groupRef}
        position={position}
        rotation={rotation}
        scale={[scale, scale, scale]}
        onPointerDown={isPresenting ? handlePointerDown : undefined}
        onPointerMove={isPresenting ? handlePointerMove : undefined}
        onPointerUp={isPresenting ? handlePointerUp : undefined}
        onPointerCancel={isPresenting ? handlePointerUp : undefined}
      >
        {children}
      </group>
    </>
  );
}

// Orbit controls with sane zoom bounds; double-click anywhere on the canvas
// snaps the camera back to its starting framing.
function DesktopOrbitControls() {
  const { gl } = useThree();
  const controlsRef = useRef<any>(null);

  useEffect(() => {
    const handleDoubleClick = () => controlsRef.current?.reset();
    gl.domElement.addEventListener('dblclick', handleDoubleClick);
    return () => gl.domElement.removeEventListener('dblclick', handleDoubleClick);
  }, [gl]);

  return <OrbitControls ref={controlsRef} makeDefault enableDamping minDistance={6} maxDistance={70} />;
}

function XRAlphaController() {
  const { gl, scene } = useThree();
  const session = useXR((state) => state.session);
  const mode = useXR((state) => state.mode);

  useEffect(() => {
    if (session) {
      const originalClearAlpha = gl.getClearAlpha();
      const originalClearColor = gl.getClearColor(new THREE.Color());
      const originalAutoClear = gl.autoClear;
      const originalCanvasBackground = gl.domElement.style.background;
      const originalBackground = scene.background;
      const isTransparentPassthrough = session.environmentBlendMode === 'alpha-blend';

      gl.autoClear = true;

      if (isTransparentPassthrough) {
        gl.setClearColor(0x000000, 0);
        gl.setClearAlpha(0);
        gl.domElement.style.background = 'transparent';
        scene.background = null;
      } else {
        gl.setClearColor(0x050505, 1);
        gl.setClearAlpha(1);
        gl.domElement.style.background = '#050505';
        scene.background = new THREE.Color(0x050505);

        if (mode === 'immersive-ar') {
          console.warn(`immersive-ar environmentBlendMode is ${session.environmentBlendMode}; rendering an opaque spatial scene because Safari/device passthrough alpha is unavailable.`);
        }
      }

      return () => {
        gl.setClearColor(originalClearColor, originalClearAlpha);
        gl.autoClear = originalAutoClear;
        gl.domElement.style.background = originalCanvasBackground;
        scene.background = originalBackground;
      };
    }
  }, [gl, mode, scene, session]);

  return null;
}

// 2D-mode cursor → world-coordinate readout, written straight into a DOM
// node so pointer moves never re-render React.
function CursorReadout({ targetRef, enabled }: { targetRef: React.RefObject<HTMLDivElement | null>; enabled: boolean }) {
  const { gl, camera } = useThree();

  useEffect(() => {
    const target = targetRef.current;
    if (!enabled) {
      if (target) target.textContent = '';
      return;
    }
    const element = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const ndc = new THREE.Vector2();
    const hit = new THREE.Vector3();

    const handleMove = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      ndc.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(plane, hit) && targetRef.current) {
        targetRef.current.textContent = `x ${hit.x.toFixed(2)}   y ${hit.y.toFixed(2)}`;
      }
    };
    const handleLeave = () => {
      if (targetRef.current) targetRef.current.textContent = '';
    };

    element.addEventListener('pointermove', handleMove);
    element.addEventListener('pointerleave', handleLeave);
    return () => {
      element.removeEventListener('pointermove', handleMove);
      element.removeEventListener('pointerleave', handleLeave);
    };
  }, [gl, camera, enabled, targetRef]);

  return null;
}

// Photo Mode: progressive path-traced still of the current formula, rendered
// with its own WebGL context (three-gpu-pathtracer, lazy-loaded) so the live
// view keeps running. Builds a studio scene from the active rig: floor,
// directional key and rect-area rim/fill at the rig's light positions.
function PhotoMode({
  formula,
  materialProfile,
  lightingPreset,
  onClose
}: {
  formula: Formula;
  materialProfile: WebGPUMaterialProfile;
  lightingPreset: WebGPULightingPreset;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [samples, setSamples] = useState(0);
  const [status, setStatus] = useState('Loading path tracer…');

  useEffect(() => {
    let disposed = false;
    let raf = 0;
    let renderer: THREE.WebGLRenderer | null = null;
    let pathTracer: any = null;
    let scene: THREE.Scene | null = null;

    (async () => {
      try {
        const { WebGLPathTracer } = await import('three-gpu-pathtracer');
        const canvas = canvasRef.current;
        if (disposed || !canvas) return;

        const width = 960;
        const height = 640;
        renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
        renderer.setSize(width, height, false);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.6;
        // A fresh WebGL canvas is backed by recycled GPU memory and can show
        // garbage (often stale screen contents) until first cleared — which
        // looked like a frozen "bad PNG" when scene build stalled. Clear now,
        // and paint the status line before the synchronous BVH build blocks.
        renderer.setClearColor(0x05060a, 1);
        renderer.clear();
        setStatus('Building path-traced scene…');
        await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
        if (disposed) return;

        const rig = lightingRigSettings(lightingPreset);
        scene = new THREE.Scene();
        // Bright enough that transmission has something to refract.
        scene.background = new THREE.Color(rig.background)
          .lerp(new THREE.Color(rig.ambient), 0.4)
          .multiplyScalar(1.9);

        const t = getClockTime();
        const compiled = {
          valid: true,
          x: compile(formula.x),
          y: compile(formula.y),
          z: compile(formula.z ?? 'sin(2 * p + t) * 4')
        };
        const geometry = formula.parametric
          ? buildParametricGeometry(formula, compiled, t, 1, { segsP: 160, segsQ: 80 })
          : buildFormulaGeometry(
              sampleFormulaPoints(compiled, t, 1, 700),
              resolveFormulaGeometryMode(formula),
              formula.name,
              t
            );
        const profile = materialProfile !== 'auto' ? materialProfile : 'pearl';
        const mesh = new THREE.Mesh(geometry, createPhysicalMaterial(profile, false));
        scene.add(mesh);

        geometry.computeBoundingSphere();
        const radius = Math.max(4, geometry.boundingSphere?.radius ?? 12);

        const floor = new THREE.Mesh(
          new THREE.PlaneGeometry(radius * 14, radius * 14),
          new THREE.MeshStandardMaterial({
            color: new THREE.Color(rig.ground).multiplyScalar(1.15),
            roughness: 0.9,
            metalness: 0
          })
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -radius * 1.18 - 1;
        scene.add(floor);

        const key = new THREE.RectAreaLight(rig.key, 30, 22, 16);
        key.position.set(rig.keyPosition[0], rig.keyPosition[1], rig.keyPosition[2]).multiplyScalar(2.2);
        key.lookAt(0, 0, 0);
        scene.add(key);
        const rim = new THREE.RectAreaLight(rig.rim, 34, 10, 30);
        rim.position.set(rig.rimPosition[0], rig.rimPosition[1], rig.rimPosition[2]).multiplyScalar(2.1);
        rim.lookAt(0, 0, 0);
        scene.add(rim);
        const fill = new THREE.RectAreaLight(rig.fill, 16, 26, 16);
        fill.position.set(rig.fillPosition[0], rig.fillPosition[1], rig.fillPosition[2]).multiplyScalar(2.1);
        fill.lookAt(0, 0, 0);
        scene.add(fill);
        const dome = new THREE.RectAreaLight(rig.ambient, 6, 60, 60);
        dome.position.set(0, 34, 0);
        dome.lookAt(0, 0, 0);
        scene.add(dome);

        // Auto-frame from the actual bounds so every formula fills the shot.
        const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, radius * 40);
        const distance = radius * 2.35;
        camera.position.set(distance * 0.74, distance * 0.46, distance * 0.9);
        camera.lookAt(0, -radius * 0.1, 0);

        pathTracer = new WebGLPathTracer(renderer);
        pathTracer.bounces = 6;
        pathTracer.filterGlossyFactor = 0.5;
        pathTracer.tiles.set(2, 2);
        pathTracer.setScene(scene, camera);
        if (disposed) return;
        setStatus('');

        const loop = () => {
          if (disposed || !pathTracer) return;
          try {
            pathTracer.renderSample();
            setSamples(Math.floor(pathTracer.samples));
          } catch (error: any) {
            console.warn('Path tracer render error:', error);
            setStatus(`Path tracer error: ${error?.message ?? error}`);
            return;
          }
          raf = requestAnimationFrame(loop);
        };
        loop();
      } catch (error: any) {
        console.warn('Photo mode failed:', error);
        if (!disposed) setStatus(`Path tracer unavailable: ${error?.message ?? error}`);
      }
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      try {
        pathTracer?.dispose?.();
      } catch {
        // three-gpu-pathtracer dispose is best-effort
      }
      if (scene) {
        scene.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose();
            (object.material as THREE.Material).dispose();
          }
        });
      }
      renderer?.dispose();
    };
  }, [formula, materialProfile, lightingPreset]);

  const savePng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `harmonic-photo-${formula.id}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-black/85 backdrop-blur-sm p-6">
      <div className="flex w-full max-w-[960px] items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-indigo-300">
          Photo Mode — Path Traced {samples > 0 && `· ${samples} samples`}
        </div>
        <div className="flex gap-2">
          <button
            onClick={savePng}
            disabled={samples === 0}
            className="rounded-md border border-indigo-400/40 bg-indigo-500/20 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-indigo-100 transition-colors hover:bg-indigo-500/35 disabled:opacity-40"
          >
            Save PNG
          </button>
          <button
            onClick={onClose}
            className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white/60 transition-colors hover:bg-white/15"
          >
            Close
          </button>
        </div>
      </div>
      <canvas ref={canvasRef} width={960} height={640} className="max-h-[70vh] w-full max-w-[960px] rounded-lg border border-white/10 bg-black object-contain" />
      <div className="font-mono text-[10px] text-white/40">
        {status || 'Refining continuously — save whenever it looks good. Rig lights + floor are path-traced with real area lights.'}
      </div>
    </div>
  );
}

function XRPlayerOrigin({ originRef }: { originRef: React.RefObject<THREE.Group | null> }) {
  const session = useXR((state) => state.session);
  return <XROrigin ref={originRef} disabled={!session} />;
}

function XRJoystickLocomotion({ originRef }: { originRef: React.RefObject<THREE.Group | null> }) {
  const session = useXR((state) => state.session);
  const leftController = useXRInputSourceState('controller', 'left');
  const rightController = useXRInputSourceState('controller', 'right');
  const forwardRef = useRef(new THREE.Vector3());
  const rightRef = useRef(new THREE.Vector3());
  const movementRef = useRef(new THREE.Vector3());
  const upRef = useRef(new THREE.Vector3(0, 1, 0));

  useFrame((state, delta) => {
    if (!session || !originRef.current) return;

    const activeThumbstick = pickStrongestThumbstick([
      readThumbstick(leftController),
      readThumbstick(rightController),
      ...readSessionThumbsticks(session)
    ], false);
    if (activeThumbstick.magnitude <= 0) return;

    const forward = forwardRef.current;
    const right = rightRef.current;
    const movement = movementRef.current;

    state.camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 0.0001) return;
    forward.normalize();
    right.crossVectors(forward, upRef.current).normalize();

    movement.set(0, 0, 0)
      .addScaledVector(right, activeThumbstick.x)
      .addScaledVector(forward, -activeThumbstick.y);

    if (movement.lengthSq() > 1) movement.normalize();
    originRef.current.position.addScaledVector(movement, XR_LOCOMOTION_SPEED * delta);
    originRef.current.position.x = THREE.MathUtils.clamp(originRef.current.position.x, -XR_LOCOMOTION_BOUNDS, XR_LOCOMOTION_BOUNDS);
    originRef.current.position.z = THREE.MathUtils.clamp(originRef.current.position.z, -XR_LOCOMOTION_BOUNDS, XR_LOCOMOTION_BOUNDS);
  });

  return null;
}

function XRVisualThumbstickControls({ setXrVisualTransform }: { setXrVisualTransform?: XRVisualTransformSetter }) {
  const session = useXR((state) => state.session);

  useFrame((_state, delta) => {
    if (!session || !setXrVisualTransform) return;

    const activeThumbstick = pickStrongestThumbstick(readSessionThumbsticks(session), true);
    if (activeThumbstick.magnitude <= 0) return;

    setXrVisualTransform((prev) => {
      const isLeftHand = activeThumbstick.handedness === 'left';

      if (isLeftHand) {
        return {
          ...prev,
          yaw: prev.yaw + activeThumbstick.x * THREE.MathUtils.degToRad(75) * delta,
          scale: THREE.MathUtils.clamp(
            prev.scale - activeThumbstick.y * 0.07 * delta,
            XR_VISUAL_SCALE_MIN,
            XR_VISUAL_SCALE_MAX
          )
        };
      }

      return {
        ...prev,
        yaw: prev.yaw + activeThumbstick.x * THREE.MathUtils.degToRad(75) * delta,
        distance: THREE.MathUtils.clamp(
          prev.distance + activeThumbstick.y * 1.1 * delta,
          XR_VISUAL_DISTANCE_MIN,
          XR_VISUAL_DISTANCE_MAX
        )
      };
    });
  });

  return null;
}

export default function GraphView({
  formula,
  shader,
  webgpuLighting,
  webgpuLightingPreset,
  webgpuMaterial,
  webgpuGeometry,
  showEnvironment,
  lineWidth,
  postFX,
  bloomIntensity,
  show3D,
  setShow3D,
  showWireframe,
  setShowWireframe,
  showArtifacts,
  setShowArtifacts,
  showMirrors,
  speed,
  setSpeed,
  xrStore,
  onNextFormula,
  onNextShader,
  isPlaying,
  onTogglePlay,
  onSelectFormula,
  onSelectShader,
  audioSync,
  setAudioSync,
  autoCycleFormula,
  setAutoCycleFormula,
  autoCycleShader,
  setAutoCycleShader,
  speedQuant,
  setSpeedQuant,
  formulaQuant,
  setFormulaQuant,
  shaderQuant,
  setShaderQuant,
  formulaCycleSpeed,
  setFormulaCycleSpeed,
  shaderCycleSpeed,
  setShaderCycleSpeed,
  noteMeshes = false,
  showHudInfo = true
}: GraphViewProps) {
  const formulaGeometryMode = useMemo(() => resolveFormulaGeometryMode(formula), [formula]);
  const [xrVisualTransform, setXrVisualTransform] = useState<XRVisualTransform>(() => {
    try {
      const raw = localStorage.getItem('harmonics.xrtransform.v1');
      if (raw) return { ...DEFAULT_XR_VISUAL_TRANSFORM, ...JSON.parse(raw) };
    } catch {
      // Fall through to defaults.
    }
    return DEFAULT_XR_VISUAL_TRANSFORM;
  });

  // Persist the XR view (size/distance/orientation) so re-entering VR
  // restores the last arrangement. Debounced: gestures update at frame rate.
  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        localStorage.setItem('harmonics.xrtransform.v1', JSON.stringify(xrVisualTransform));
      } catch {
        // Storage unavailable; the view just won't persist.
      }
    }, 400);
    return () => window.clearTimeout(id);
  }, [xrVisualTransform]);
  const [xrGeometrySelection, setXrGeometrySelection] = useState<GraphGeometrySelection>('formula');
  const xrOriginRef = useRef<THREE.Group>(null);
  const xrDragOffsetRef = useRef(new THREE.Vector3());
  const readoutRef = useRef<HTMLDivElement>(null);
  const [photoOpen, setPhotoOpen] = useState(false);

  useEffect(() => {
    const open = () => setPhotoOpen(true);
    window.addEventListener('math-harmonics:photo-mode', open);
    return () => window.removeEventListener('math-harmonics:photo-mode', open);
  }, []);
  // Priority: in-XR HUD selection > desktop geometry override > formula default
  const baseGeometryMode = webgpuGeometry !== 'auto' ? webgpuGeometry : formulaGeometryMode;
  const geometryMode = xrGeometrySelection === 'formula' ? baseGeometryMode : xrGeometrySelection;
  const resetXRViewer = () => {
    xrDragOffsetRef.current.set(0, 0, 0);
    if (!xrOriginRef.current) return;
    xrOriginRef.current.position.set(0, 0, 0);
    xrOriginRef.current.rotation.set(0, 0, 0);
  };

  return (
    <div className="w-full h-full bg-transparent relative">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, 0, 25], fov: 50 }}
        gl={{ alpha: true, antialias: true, premultipliedAlpha: false, preserveDrawingBuffer: true }}
        onCreated={({ gl }) => {
          // preventDefault lets three restore the context instead of dying.
          gl.domElement.addEventListener('webglcontextlost', (event) => {
            event.preventDefault();
            console.warn('WebGL context lost — waiting for automatic restore.');
          });
        }}
      >
        <XR store={xrStore}>
          <CursorReadout targetRef={readoutRef} enabled={!show3D} />
          <XRPlayerOrigin originRef={xrOriginRef} />
          <XRJoystickLocomotion originRef={xrOriginRef} />
          <XRVisualThumbstickControls setXrVisualTransform={setXrVisualTransform} />
          <XRBeatHaptics />
          <XRAlphaController />
          <XREnvironment preset={webgpuLightingPreset} desktopVisible={showEnvironment && show3D} />
          <RigEnvironment preset={webgpuLightingPreset} intensity={webgpuLighting} />
          <GroundShadows show3D={show3D} />
          <PostEffects enabled={postFX} bloom={bloomIntensity} />
          <SpatialWrapper xrVisualTransform={xrVisualTransform} setXrVisualTransform={setXrVisualTransform} dragOffsetRef={xrDragOffsetRef}>
            <LightingRig preset={webgpuLightingPreset} intensity={webgpuLighting} />
            
            {showArtifacts && (
              <group>
                {/* Axes */}
                <Line frustumCulled={false}>
                  <bufferGeometry attach="geometry">
                    <float32BufferAttribute
                      attach="attributes-position"
                      args={[new Float32Array([-50, 0, 0, 50, 0, 0]), 3]}
                    />
                  </bufferGeometry>
                  <lineBasicMaterial attach="material" color="#4f46e5" opacity={0.2} transparent />
                </Line>
                <Line frustumCulled={false}>
                  <bufferGeometry attach="geometry">
                    <float32BufferAttribute
                      attach="attributes-position"
                      args={[new Float32Array([0, -50, 0, 0, 50, 0]), 3]}
                    />
                  </bufferGeometry>
                  <lineBasicMaterial attach="material" color="#4f46e5" opacity={0.2} transparent />
                </Line>
              </group>
            )}

            {showMirrors && <AngledMirrorSurfaces show3D={show3D} />}
            {noteMeshes && show3D ? (
              <NoteConstellation formula={formula} showWireframe={showWireframe} materialProfile={webgpuMaterial} geometryMode={geometryMode} />
            ) : (
              <FormulaLine formula={formula} shader={shader} show3D={show3D} showWireframe={showWireframe} materialProfile={webgpuMaterial} lineWidth={lineWidth} geometryMode={geometryMode} />
            )}
          </SpatialWrapper>

          <SpatialConsole
            onNextFormula={onNextFormula}
            onNextShader={onNextShader}
            isPlaying={isPlaying}
            onTogglePlay={onTogglePlay}
            formula={formula}
            shader={shader}
            currentGeometryMode={geometryMode}
            xrGeometrySelection={xrGeometrySelection}
            setXrGeometrySelection={setXrGeometrySelection}
            xrVisualTransform={xrVisualTransform}
            setXrVisualTransform={setXrVisualTransform}
            onResetXRViewer={resetXRViewer}
            show3D={show3D}
            setShow3D={setShow3D}
            showWireframe={showWireframe}
            setShowWireframe={setShowWireframe}
            showArtifacts={showArtifacts}
            setShowArtifacts={setShowArtifacts}
            speed={speed}
            setSpeed={setSpeed}
            onSelectFormula={onSelectFormula}
            onSelectShader={onSelectShader}
            audioSync={audioSync}
            setAudioSync={setAudioSync}
            autoCycleFormula={autoCycleFormula}
            setAutoCycleFormula={setAutoCycleFormula}
            autoCycleShader={autoCycleShader}
            setAutoCycleShader={setAutoCycleShader}
            speedQuant={speedQuant}
            setSpeedQuant={setSpeedQuant}
            formulaQuant={formulaQuant}
            setFormulaQuant={setFormulaQuant}
            shaderQuant={shaderQuant}
            setShaderQuant={setShaderQuant}
            formulaCycleSpeed={formulaCycleSpeed}
            setFormulaCycleSpeed={setFormulaCycleSpeed}
            shaderCycleSpeed={shaderCycleSpeed}
            setShaderCycleSpeed={setShaderCycleSpeed}
            preview={HUD_PREVIEW}
          />
        </XR>
      </Canvas>
      
      {!show3D && (
        <div
          ref={readoutRef}
          className="absolute bottom-4 left-4 min-h-[22px] min-w-[130px] rounded border border-cyan-400/15 bg-black/55 px-2.5 py-1 font-mono text-[10px] text-cyan-200/80 backdrop-blur pointer-events-none"
        />
      )}

      {photoOpen && (
        <PhotoMode
          formula={formula}
          materialProfile={webgpuMaterial}
          lightingPreset={webgpuLightingPreset}
          onClose={() => setPhotoOpen(false)}
        />
      )}

      {showHudInfo && (
        <>
          {/* HUD Info */}
          <div className="absolute top-4 left-4 flex flex-col gap-1 pointer-events-none">
            <div className="bg-black/60 border border-white/10 backdrop-blur px-3 py-1.5 rounded-lg">
              <div className="text-[10px] font-mono text-indigo-400 uppercase tracking-widest">{formula.name}</div>
            </div>
            <div className="bg-black/40 border border-white/5 backdrop-blur px-2 py-1 rounded text-[8px] font-mono text-white/30 truncate max-w-[200px]">
              {formula.description}
            </div>
          </div>

          {/* 3D Indicator */}
          <div className="absolute top-4 right-4 bg-black/40 border border-white/10 backdrop-blur p-3 rounded-lg text-[9px] font-mono text-white/50 space-y-1">
            <div className="flex justify-between gap-4"><span>RENDER_MODE:</span> <span className="text-indigo-400">{show3D ? (formula.parametric ? 'SURFACE(P,Q)' : geometryMode.toUpperCase()) : 'LINEAR'}</span></div>
            <div className="flex justify-between gap-4"><span>COORDS:</span> <span className="text-indigo-400">CARTESIAN_3D</span></div>
            <div className="flex justify-between gap-4"><span>SAMPLING:</span> <span className="text-indigo-400">HIGH_RES</span></div>
          </div>
        </>
      )}
    </div>
  );
}
