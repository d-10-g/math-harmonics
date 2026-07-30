import { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { MeshReflectorMaterial, OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
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
import { getClockTime, reportVerts } from '../lib/clock';
import { lightingRigSettings } from '../lib/lighting';
import { createPhysicalMaterial } from '../lib/materials';

// 3D geometry is rebuilt on this cadence instead of every frame; the material
// time uniform and group motion still animate at full framerate in between.
const GEOMETRY_REBUILD_MS = 100;

const Line = 'line' as any;
const GridHelper = 'gridHelper' as any;
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

const DEFAULT_XR_VISUAL_TRANSFORM = {
  scale: 0.08,
  distance: 1.8,
  yaw: 0,
  pitch: 0,
  roll: 0,
  autoRotate: true
};

const XR_THUMBSTICK_DEADZONE = 0.16;
const XR_LOCOMOTION_SPEED = 1.65;
const XR_LOCOMOTION_BOUNDS = 6;
const XR_VISUAL_SCALE_MIN = 0.035;
const XR_VISUAL_SCALE_MAX = 0.2;
const XR_VISUAL_DISTANCE_MIN = 0.9;
const XR_VISUAL_DISTANCE_MAX = 3.4;

type XRVisualTransform = typeof DEFAULT_XR_VISUAL_TRANSFORM;
type XRVisualTransformSetter = React.Dispatch<React.SetStateAction<XRVisualTransform>>;
type GraphGeometrySelection = FormulaGeometryMode | 'formula';
type GraphGeometrySelectionSetter = React.Dispatch<React.SetStateAction<GraphGeometrySelection>>;
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

function sampleFormulaPoints(compiled: CompiledFormula, currentTime: number, scalar: number, resolution: number) {
  const rawPts: THREE.Vector3[] = [];
  const extents: number[] = [];

  for (let i = 0; i <= resolution; i++) {
    const p = (i / resolution) * Math.PI * 8;
    const scope = { p, t: currentTime, s: scalar };
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
}

function FormulaLine({
  formula,
  shader,
  show3D,
  showWireframe,
  materialProfile = 'auto',
  geometryMode: geometryModeOverride
}: {
  formula: Formula;
  shader: ShaderPreset;
  show3D: boolean;
  showWireframe: boolean;
  materialProfile?: WebGPUMaterialProfile;
  geometryMode?: FormulaGeometryMode;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const lineRef = useRef<any>(null);
  const resolvedGeometryMode = useMemo(() => resolveFormulaGeometryMode(formula), [formula]);
  const geometryMode = geometryModeOverride ?? resolvedGeometryMode;

  // Track the right hand / controller input sources in VR/AR
  const rightController = useXRInputSourceState('controller', 'right');
  const rightHand = useXRInputSourceState('hand', 'right');

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

  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: { time: { value: getClockTime() } },
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
    const points = sampleFormulaPoints(compiled, t, scalarValue, resolution);
    setGeometry3D(buildFormulaGeometry(points, geometryMode, formula.name, t));
    lastRebuildRef.current = performance.now();
  }, [compiled, formula.name, geometryMode, scalarValue, show3D]);

  useEffect(() => {
    if (geometry3D) reportVerts(geometry3D.getAttribute('position')?.count ?? 0);
    return () => geometry3D?.dispose();
  }, [geometry3D]);

  // Update geometry directly in the render loop without triggering React renders or GC
  useFrame(() => {
    const time = getClockTime();
    if (shaderMaterial) shaderMaterial.uniforms.time.value = time;
    const nextScalar = getSValue();
    const scalarThreshold = Math.max(0.005, Math.abs(scalarTarget.baseScalar) * 0.003);

    if (Math.abs(nextScalar - scalarValueRef.current) > scalarThreshold) {
      scalarValueRef.current = nextScalar;
      setScalarValue(nextScalar);
    }

    // Custom float effect for 3D mode (replaces Drei's Float component to avoid THREE.Clock warnings)
    if (groupRef.current) {
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
      if (now - lastRebuildRef.current >= GEOMETRY_REBUILD_MS) {
        lastRebuildRef.current = now;
        const points = sampleFormulaPoints(compiled, time, nextScalar, resolution);
        setGeometry3D(buildFormulaGeometry(points, geometryMode, formula.name, time));
      }
      return;
    }

    const positions = geometry.attributes.position.array as Float32Array;
    const uvs = geometry.attributes.uv.array as Float32Array;
    const points = sampleFormulaPoints(compiled, time, nextScalar, resolution);
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
      {!show3D && (
        <Line ref={lineRef} geometry={geometry} frustumCulled={false}>
          <primitive object={shaderMaterial} attach="material" />
        </Line>
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

// Procedural PMREM environment (no network fetch) so metals, glass and
// clearcoat profiles have something to reflect on the WebGL path.
function StudioEnvironment() {
  const { gl, scene } = useThree();

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    return () => {
      if (scene.environment === envTexture) scene.environment = null;
      envTexture.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  return null;
}

// Declarative version of the WebGPU path's light rigs (shared data table).
function LightingRig({ preset, intensity }: { preset: WebGPULightingPreset; intensity: number }) {
  const { gl } = useThree();
  const rig = lightingRigSettings(preset);
  const light = THREE.MathUtils.clamp(intensity, 0.45, 3.5);

  useEffect(() => {
    const previousExposure = gl.toneMappingExposure;
    gl.toneMappingExposure = light;
    return () => {
      gl.toneMappingExposure = previousExposure;
    };
  }, [gl, light]);

  return (
    <>
      <ambientLight color={rig.ambient} intensity={0.42 + light * rig.ambientScale} />
      <hemisphereLight color={rig.ambient} groundColor={rig.ground} intensity={0.62 + light * rig.hemiScale} />
      <directionalLight color={rig.key} position={rig.keyPosition} intensity={rig.keyScale * light} />
      <pointLight color={rig.rim} position={rig.rimPosition} intensity={rig.rimScale * light} distance={36} />
      <pointLight color={rig.fill} position={rig.fillPosition} intensity={rig.fillScale * light} distance={32} />
    </>
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

function SpatialWrapper({
  children,
  xrVisualTransform,
  dragOffsetRef
}: {
  children: React.ReactNode;
  xrVisualTransform: XRVisualTransform;
  dragOffsetRef: React.MutableRefObject<THREE.Vector3>;
}) {
  const session = useXR((state) => state.session);
  const isPresenting = !!session;
  const groupRef = useRef<THREE.Group>(null);
  const autoYawRef = useRef(xrVisualTransform.yaw);
  // Pinch/trigger-drag repositions the visual in XR. This is the only way to
  // move it on Apple Vision Pro (gaze + pinch, no thumbsticks); on Quest it
  // complements the sticks. Offset lives in a ref owned by GraphView so the
  // VIEW tab's RESET ALL can clear it.
  const dragStateRef = useRef<{ pointerId: number; start: THREE.Vector3; origin: THREE.Vector3 } | null>(null);

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

  const handlePointerDown = (e: any) => {
    if (!isPresenting || !e.point) return;
    e.stopPropagation();
    dragStateRef.current = {
      pointerId: e.pointerId,
      start: e.point.clone(),
      origin: dragOffsetRef.current.clone()
    };
    e.target?.setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: any) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId || !e.point) return;
    e.stopPropagation();
    const next = drag.origin.clone().add(e.point.clone().sub(drag.start));
    next.x = THREE.MathUtils.clamp(next.x, -2.5, 2.5);
    next.y = THREE.MathUtils.clamp(next.y, -0.8, 1.2);
    next.z = THREE.MathUtils.clamp(next.z, -2.5, 2.5);
    dragOffsetRef.current.copy(next);
  };

  const handlePointerUp = (e: any) => {
    if (dragStateRef.current?.pointerId !== e.pointerId) return;
    dragStateRef.current = null;
    e.target?.releasePointerCapture?.(e.pointerId);
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
      {!isPresenting && <OrbitControls makeDefault enableDamping />}

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

function HUDButton({ 
  position, 
  color, 
  emissive, 
  label, 
  onClick,
  width = 0.16,
  height = 0.06
}: { 
  position: [number, number, number]; 
  color: string; 
  emissive: string; 
  label: string; 
  onClick: () => void;
  width?: number;
  height?: number;
}) {
  const [hovered, setHovered] = useState(false);
  const scale = hovered ? 1.08 : 1.0;

  return (
    <mesh 
      position={position} 
      scale={[scale, scale, scale]}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <boxGeometry args={[width, height, 0.02]} />
      <meshStandardMaterial 
        color={color} 
        emissive={emissive} 
        emissiveIntensity={hovered ? 0.8 : 0.2}
        roughness={0.2}
        metalness={0.8}
      />
      <Text 
        position={[0, 0, 0.012]} 
        fontSize={height * 0.22} 
        color="#ffffff" 
        anchorX="center" 
        anchorY="middle"
      >
        {label}
      </Text>
    </mesh>
  );
}

const formatQuant = (q: number) => q >= 0 ? `${q + 1}x` : `1/${Math.abs(q) + 1}x`;

function ImmersiveHUD({ 
  onNextFormula, 
  onNextShader, 
  isPlaying, 
  onTogglePlay,
  formula,
  shader,
  currentGeometryMode,
  xrGeometrySelection,
  setXrGeometrySelection,
  xrVisualTransform,
  setXrVisualTransform,
  onResetXRViewer,
  show3D,
  setShow3D,
  showWireframe,
  setShowWireframe,
  showArtifacts,
  setShowArtifacts,
  speed,
  setSpeed,
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
  setShaderCycleSpeed
}: {
  onNextFormula?: () => void;
  onNextShader?: () => void;
  isPlaying: boolean;
  onTogglePlay?: () => void;
  formula: Formula;
  shader: ShaderPreset;
  currentGeometryMode: FormulaGeometryMode;
  xrGeometrySelection: GraphGeometrySelection;
  setXrGeometrySelection?: GraphGeometrySelectionSetter;
  xrVisualTransform: XRVisualTransform;
  setXrVisualTransform?: XRVisualTransformSetter;
  onResetXRViewer?: () => void;
  show3D: boolean;
  setShow3D?: (show: boolean) => void;
  showWireframe: boolean;
  setShowWireframe?: (show: boolean) => void;
  showArtifacts: boolean;
  setShowArtifacts?: (show: boolean) => void;
  speed: number;
  setSpeed?: (speed: number) => void;
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
}) {
  const session = useXR((state) => state.session);
  // Without controllers (Apple Vision Pro: gaze + pinch), enlarge the whole
  // console so buttons are comfortable gaze targets.
  const hudLeftController = useXRInputSourceState('controller', 'left');
  const hudRightController = useXRInputSourceState('controller', 'right');
  const hasControllers = Boolean(hudLeftController || hudRightController);
  const hudScale = hasControllers ? 1 : 1.3;
  const [activeTab, setActiveTab] = useState<'control' | 'settings' | 'view' | 'pilot' | 'formulas' | 'shaders'>('control');
  const [formulaPage, setFormulaPage] = useState(0);
  const [shaderPage, setShaderPage] = useState(0);
  const [hudPosition, setHudPosition] = useState<[number, number, number]>([-1.16, 1.22, -1.18]);
  const [isDraggingPanel, setIsDraggingPanel] = useState(false);
  const hudGroupRef = useRef<THREE.Group>(null);
  const dragOffset = useRef(new THREE.Vector3());
  const scalarTarget = useMemo(() => resolveFormulaScalarTarget(formula), [formula]);
  const scalarLabel = scalarTarget.field === 'all'
    ? 'ALL AXES SCALE'
    : `${scalarTarget.field.toUpperCase()} CONST ${scalarTarget.match}`;
  const xrGeometryLabel = xrGeometrySelection === 'formula'
    ? `FORMULA: ${currentGeometryMode.toUpperCase()}`
    : currentGeometryMode.toUpperCase();
  const setXRTransform = (updater: (prev: XRVisualTransform) => XRVisualTransform) => setXrVisualTransform?.(updater);
  const setXRGeometryByOffset = (offset: number) => {
    setXrGeometrySelection?.((prev) => {
      const selections: GraphGeometrySelection[] = ['formula', ...GEOMETRY_MODES];
      const index = selections.indexOf(prev);
      return selections[(index + offset + selections.length) % selections.length];
    });
  };

  const handlePanelPointerDown = (e: any) => {
    e.stopPropagation();
    if (!hudGroupRef.current || !e.point) return;
    dragOffset.current.copy(hudGroupRef.current.position).sub(e.point);
    setIsDraggingPanel(true);
    e.target?.setPointerCapture?.(e.pointerId);
  };

  const handlePanelPointerMove = (e: any) => {
    if (!isDraggingPanel || !e.point) return;
    e.stopPropagation();
    const next = e.point.clone().add(dragOffset.current);
    setHudPosition([
      THREE.MathUtils.clamp(next.x, -1.95, -0.55),
      THREE.MathUtils.clamp(next.y, 0.98, 1.78),
      THREE.MathUtils.clamp(next.z, -1.85, -0.7)
    ]);
  };

  const handlePanelPointerUp = (e: any) => {
    if (!isDraggingPanel) return;
    e.stopPropagation();
    setIsDraggingPanel(false);
    e.target?.releasePointerCapture?.(e.pointerId);
  };

  if (!session) return null;

  return (
    <group
      ref={hudGroupRef}
      position={hudPosition}
      rotation={[-Math.PI / 28, Math.PI / 4, 0]}
      scale={[hudScale, hudScale, hudScale]}
      onPointerMove={handlePanelPointerMove}
      onPointerUp={handlePanelPointerUp}
      onPointerCancel={handlePanelPointerUp}
    >
      {/* Console Backplate */}
      <mesh onPointerDown={handlePanelPointerDown}>
        <boxGeometry args={[0.82, 0.52, 0.02]} />
        <meshPhysicalMaterial 
          color="#1e1b4b" 
          transmission={0.9} 
          roughness={0.15} 
          metalness={0.1}
          clearcoat={1.0}
          transparent
          opacity={0.9}
        />
      </mesh>

      <mesh position={[0, 0.255, 0.018]} onPointerDown={handlePanelPointerDown}>
        <boxGeometry args={[0.48, 0.018, 0.018]} />
        <meshStandardMaterial
          color={isDraggingPanel ? "#14b8a6" : "#4f46e5"}
          emissive={isDraggingPanel ? "#2dd4bf" : "#818cf8"}
          emissiveIntensity={isDraggingPanel ? 0.9 : 0.35}
          roughness={0.22}
          metalness={0.65}
        />
      </mesh>

      {/* Console Border / Emissive Glow */}
      <mesh position={[0, 0, -0.005]}>
        <boxGeometry args={[0.83, 0.53, 0.015]} />
        <meshBasicMaterial color="#6366f1" transparent opacity={0.3} />
      </mesh>

      {/* HUD Header */}
      <Text 
        position={[0, 0.19, 0.015]} 
        fontSize={0.022} 
        color="#818cf8" 
        anchorX="center"
      >
        HARMONIC.OS SPATIAL CONTROL
      </Text>

      {/* Tab Selectors Row */}
      <group position={[0, 0.13, 0.015]}>
        <HUDButton 
          position={[-0.335, 0, 0]} 
          color={activeTab === 'control' ? "#4f46e5" : "#111111"} 
          emissive={activeTab === 'control' ? "#818cf8" : "#333333"} 
          label="CONTROL" 
          onClick={() => setActiveTab('control')}
          width={0.095}
          height={0.035}
        />
        <HUDButton 
          position={[-0.201, 0, 0]} 
          color={activeTab === 'settings' ? "#4f46e5" : "#111111"} 
          emissive={activeTab === 'settings' ? "#818cf8" : "#333333"} 
          label="SETTINGS" 
          onClick={() => setActiveTab('settings')}
          width={0.095}
          height={0.035}
        />
        <HUDButton 
          position={[-0.067, 0, 0]} 
          color={activeTab === 'view' ? "#4f46e5" : "#111111"} 
          emissive={activeTab === 'view' ? "#818cf8" : "#333333"} 
          label="VIEW" 
          onClick={() => setActiveTab('view')}
          width={0.095}
          height={0.035}
        />
        <HUDButton 
          position={[0.067, 0, 0]} 
          color={activeTab === 'pilot' ? "#4f46e5" : "#111111"} 
          emissive={activeTab === 'pilot' ? "#818cf8" : "#333333"} 
          label="PILOT" 
          onClick={() => setActiveTab('pilot')}
          width={0.095}
          height={0.035}
        />
        <HUDButton 
          position={[0.201, 0, 0]} 
          color={activeTab === 'formulas' ? "#4f46e5" : "#111111"} 
          emissive={activeTab === 'formulas' ? "#818cf8" : "#333333"} 
          label="FORMULAS" 
          onClick={() => setActiveTab('formulas')}
          width={0.095}
          height={0.035}
        />
        <HUDButton 
          position={[0.335, 0, 0]} 
          color={activeTab === 'shaders' ? "#4f46e5" : "#111111"} 
          emissive={activeTab === 'shaders' ? "#818cf8" : "#333333"} 
          label="SHADERS" 
          onClick={() => setActiveTab('shaders')}
          width={0.095}
          height={0.035}
        />
      </group>

      {/* TAB CONTENTS */}
      
      {/* 1. CONTROL TAB */}
      {activeTab === 'control' && (
        <group>
          {/* Active Formula Info */}
          <Text 
            position={[0, 0.03, 0.015]} 
            fontSize={0.014} 
            color="#ffffff" 
            anchorX="center"
          >
            {`FORMULA: ${formula.name}`}
          </Text>

          {/* Active Shader Info */}
          <Text 
            position={[0, -0.02, 0.015]} 
            fontSize={0.014} 
            color="#00ffcc" 
            anchorX="center"
          >
            {`SHADER: ${shader.name}`}
          </Text>

          <Text
            position={[0, -0.055, 0.015]}
            fontSize={0.011}
            color="#f472b6"
            anchorX="center"
            maxWidth={0.68}
          >
            {`HAND Y -> SCALAR: ${scalarLabel}`}
          </Text>

          {/* Row of Controls */}
          <HUDButton 
            position={[-0.27, -0.11, 0.015]} 
            color={isPlaying ? "#047857" : "#b45309"} 
            emissive={isPlaying ? "#10b981" : "#f59e0b"} 
            label={isPlaying ? "❚❚ PAUSE" : "▶ PLAY"} 
            onClick={() => onTogglePlay?.()} 
          />

          <HUDButton 
            position={[-0.09, -0.11, 0.015]} 
            color="#4f46e5" 
            emissive="#818cf8" 
            label="FORMULA ▶▶" 
            onClick={() => onNextFormula?.()} 
          />

          <HUDButton 
            position={[0.09, -0.11, 0.015]} 
            color="#7c3aed" 
            emissive="#a78bfa" 
            label="SHADER ▶▶" 
            onClick={() => onNextShader?.()} 
          />

          <HUDButton 
            position={[0.27, -0.11, 0.015]} 
            color="#b91c1c" 
            emissive="#ef4444" 
            label="EXIT VR" 
            onClick={() => session?.end()} 
          />
        </group>
      )}

      {/* 2. SETTINGS TAB */}
      {activeTab === 'settings' && (
        <group>
          {/* Row 1: Visual Toggles */}
          <HUDButton 
            position={[-0.24, 0.04, 0.015]} 
            color={show3D ? "#047857" : "#111111"} 
            emissive={show3D ? "#10b981" : "#333333"} 
            label={show3D ? "3D VOLUME: ON" : "3D VOLUME: OFF"} 
            onClick={() => setShow3D?.(!show3D)}
            width={0.22}
            height={0.045}
          />

          <HUDButton 
            position={[0, 0.04, 0.015]} 
            color={showWireframe ? "#047857" : "#111111"} 
            emissive={showWireframe ? "#10b981" : "#333333"} 
            label={showWireframe ? "WIREFRAME: ON" : "WIREFRAME: OFF"} 
            onClick={() => setShowWireframe?.(!showWireframe)}
            width={0.22}
            height={0.045}
          />

          <HUDButton 
            position={[0.24, 0.04, 0.015]} 
            color={showArtifacts ? "#047857" : "#111111"} 
            emissive={showArtifacts ? "#10b981" : "#333333"} 
            label={showArtifacts ? "GUIDE AXES: ON" : "GUIDE AXES: OFF"} 
            onClick={() => setShowArtifacts?.(!showArtifacts)}
            width={0.22}
            height={0.045}
          />

          {/* Row 2: Audio & Automation Toggles */}
          <HUDButton 
            position={[-0.24, -0.015, 0.015]} 
            color={audioSync ? "#4f46e5" : "#111111"} 
            emissive={audioSync ? "#818cf8" : "#333333"} 
            label={audioSync ? "BEAT SYNC: ON" : "BEAT SYNC: OFF"} 
            onClick={() => setAudioSync?.(!audioSync)}
            width={0.22}
            height={0.045}
          />

          <HUDButton 
            position={[0, -0.015, 0.015]} 
            color={autoCycleFormula ? "#047857" : "#111111"} 
            emissive={autoCycleFormula ? "#10b981" : "#333333"} 
            label={autoCycleFormula ? "AUTO-FORMULA: ON" : "AUTO-FORMULA: OFF"} 
            onClick={() => setAutoCycleFormula?.(!autoCycleFormula)}
            width={0.22}
            height={0.045}
          />

          <HUDButton 
            position={[0.24, -0.015, 0.015]} 
            color={autoCycleShader ? "#047857" : "#111111"} 
            emissive={autoCycleShader ? "#10b981" : "#333333"} 
            label={autoCycleShader ? "AUTO-SHADER: ON" : "AUTO-SHADER: OFF"} 
            onClick={() => setAutoCycleShader?.(!autoCycleShader)}
            width={0.22}
            height={0.045}
          />

          {/* Speed Controls */}
          <group position={[0, -0.08, 0.015]}>
            <HUDButton 
              position={[-0.18, 0, 0]} 
              color="#374151" 
              emissive="#4b5563" 
              label="[-]" 
              onClick={() => setSpeed?.(Math.max(0.1, speed - 0.5))}
              width={0.05}
              height={0.04}
            />
            
            <Text 
              position={[0, 0, 0]} 
              fontSize={0.014} 
              color="#ffffff" 
              anchorX="center"
              anchorY="middle"
            >
              {`ANIMATION SPEED: ${speed.toFixed(1)}x`}
            </Text>

            <HUDButton 
              position={[0.18, 0, 0]} 
              color="#374151" 
              emissive="#4b5563" 
              label="[+]" 
              onClick={() => setSpeed?.(Math.min(5.0, speed + 0.5))}
              width={0.05}
              height={0.04}
            />
          </group>
        </group>
      )}

      {/* 2.5. VIEW TAB */}
      {activeTab === 'view' && (
        <group>
          <group position={[0, 0.055, 0.015]}>
            <HUDButton
              position={[-0.27, 0, 0]}
              color="#374151"
              emissive="#4b5563"
              label="SIZE -"
              onClick={() => setXRTransform((prev) => ({ ...prev, scale: THREE.MathUtils.clamp(prev.scale - 0.01, 0.035, 0.2) }))}
              width={0.1}
              height={0.035}
            />
            <Text fontSize={0.012} color="#ffffff" anchorX="center" anchorY="middle">
              {`SIZE: ${Math.round((xrVisualTransform.scale / DEFAULT_XR_VISUAL_TRANSFORM.scale) * 100)}%`}
            </Text>
            <HUDButton
              position={[0.27, 0, 0]}
              color="#374151"
              emissive="#4b5563"
              label="SIZE +"
              onClick={() => setXRTransform((prev) => ({ ...prev, scale: THREE.MathUtils.clamp(prev.scale + 0.01, 0.035, 0.2) }))}
              width={0.1}
              height={0.035}
            />
          </group>

          <group position={[0, 0.015, 0.015]}>
            <HUDButton
              position={[-0.27, 0, 0]}
              color="#374151"
              emissive="#4b5563"
              label="NEAR"
              onClick={() => setXRTransform((prev) => ({ ...prev, distance: THREE.MathUtils.clamp(prev.distance - 0.15, 0.9, 3.4) }))}
              width={0.1}
              height={0.035}
            />
            <Text fontSize={0.012} color="#ffffff" anchorX="center" anchorY="middle">
              {`ZOOM: ${xrVisualTransform.distance.toFixed(2)}m`}
            </Text>
            <HUDButton
              position={[0.27, 0, 0]}
              color="#374151"
              emissive="#4b5563"
              label="FAR"
              onClick={() => setXRTransform((prev) => ({ ...prev, distance: THREE.MathUtils.clamp(prev.distance + 0.15, 0.9, 3.4) }))}
              width={0.1}
              height={0.035}
            />
          </group>

          <group position={[0, -0.025, 0.015]}>
            <HUDButton
              position={[-0.27, 0, 0]}
              color="#374151"
              emissive="#4b5563"
              label="YAW -"
              onClick={() => setXRTransform((prev) => ({ ...prev, yaw: prev.yaw - THREE.MathUtils.degToRad(15) }))}
              width={0.1}
              height={0.035}
            />
            <Text fontSize={0.012} color="#ffffff" anchorX="center" anchorY="middle">
              {`YAW: ${Math.round(THREE.MathUtils.radToDeg(xrVisualTransform.yaw))}deg`}
            </Text>
            <HUDButton
              position={[0.27, 0, 0]}
              color="#374151"
              emissive="#4b5563"
              label="YAW +"
              onClick={() => setXRTransform((prev) => ({ ...prev, yaw: prev.yaw + THREE.MathUtils.degToRad(15) }))}
              width={0.1}
              height={0.035}
            />
          </group>

          <group position={[0, -0.065, 0.015]}>
            <HUDButton
              position={[-0.27, 0, 0]}
              color="#374151"
              emissive="#4b5563"
              label="PITCH -"
              onClick={() => setXRTransform((prev) => ({ ...prev, pitch: THREE.MathUtils.clamp(prev.pitch - THREE.MathUtils.degToRad(10), THREE.MathUtils.degToRad(-45), THREE.MathUtils.degToRad(45)) }))}
              width={0.1}
              height={0.035}
            />
            <Text fontSize={0.012} color="#ffffff" anchorX="center" anchorY="middle">
              {`PITCH: ${Math.round(THREE.MathUtils.radToDeg(xrVisualTransform.pitch))}deg`}
            </Text>
            <HUDButton
              position={[0.27, 0, 0]}
              color="#374151"
              emissive="#4b5563"
              label="PITCH +"
              onClick={() => setXRTransform((prev) => ({ ...prev, pitch: THREE.MathUtils.clamp(prev.pitch + THREE.MathUtils.degToRad(10), THREE.MathUtils.degToRad(-45), THREE.MathUtils.degToRad(45)) }))}
              width={0.1}
              height={0.035}
            />
          </group>

          <group position={[0, -0.105, 0.015]}>
            <HUDButton
              position={[-0.27, 0, 0]}
              color="#374151"
              emissive="#4b5563"
              label="MODE -"
              onClick={() => setXRGeometryByOffset(-1)}
              width={0.1}
              height={0.035}
            />
            <Text fontSize={0.0095} color="#f472b6" anchorX="center" anchorY="middle" maxWidth={0.38}>
              {xrGeometryLabel}
            </Text>
            <HUDButton
              position={[0.27, 0, 0]}
              color="#374151"
              emissive="#4b5563"
              label="MODE +"
              onClick={() => setXRGeometryByOffset(1)}
              width={0.1}
              height={0.035}
            />
          </group>

          <group position={[0, -0.15, 0.015]}>
            <HUDButton
              position={[-0.17, 0, 0]}
              color={xrVisualTransform.autoRotate ? "#047857" : "#111111"}
              emissive={xrVisualTransform.autoRotate ? "#10b981" : "#333333"}
              label={xrVisualTransform.autoRotate ? "AUTO ROT: ON" : "AUTO ROT: OFF"}
              onClick={() => setXRTransform((prev) => ({ ...prev, autoRotate: !prev.autoRotate }))}
              width={0.24}
              height={0.038}
            />
            <HUDButton
              position={[0.17, 0, 0]}
              color="#7c2d12"
              emissive="#f97316"
              label="RESET ALL"
              onClick={() => {
                setXRTransform(() => DEFAULT_XR_VISUAL_TRANSFORM);
                onResetXRViewer?.();
              }}
              width={0.24}
              height={0.038}
            />
          </group>
        </group>
      )}

      {/* 3. PILOT TAB (Auto-Pilot Controls in VR) */}
      {activeTab === 'pilot' && (
        <group>
          {/* Row 1: Audio Sync & Engine Speed */}
          <HUDButton 
            position={[-0.18, 0.04, 0.015]} 
            color={audioSync ? "#4f46e5" : "#111111"} 
            emissive={audioSync ? "#818cf8" : "#333333"} 
            label={audioSync ? "AUDIO SYNC: ON" : "AUDIO SYNC: OFF"} 
            onClick={() => setAudioSync?.(!audioSync)}
            width={0.32}
            height={0.045}
          />
          
          <group position={[0.08, 0.04, 0.015]}>
            <HUDButton 
              position={[0, 0, 0]} 
              color="#374151" 
              emissive="#4b5563" 
              label="[-]" 
              onClick={() => {
                if (audioSync) {
                  setSpeedQuant?.(Math.max(-10, speedQuant - 1));
                } else {
                  setSpeed?.(Math.max(0.1, speed - 0.5));
                }
              }}
              width={0.05}
              height={0.045}
            />
            
            <Text 
              position={[0.13, 0, 0]} 
              fontSize={0.011} 
              color="#ffffff" 
              anchorX="center"
              anchorY="middle"
            >
              {audioSync ? `BPM: ${formatQuant(speedQuant)}` : `SPD: ${speed.toFixed(1)}x`}
            </Text>

            <HUDButton 
              position={[0.26, 0, 0]} 
              color="#374151" 
              emissive="#4b5563" 
              label="[+]" 
              onClick={() => {
                if (audioSync) {
                  setSpeedQuant?.(Math.min(10, speedQuant + 1));
                } else {
                  setSpeed?.(Math.min(5.0, speed + 0.5));
                }
              }}
              width={0.05}
              height={0.045}
            />
          </group>

          {/* Row 2: Formula Auto-Cycle & Speed/Beat Quant */}
          <HUDButton 
            position={[-0.18, -0.02, 0.015]} 
            color={autoCycleFormula ? "#047857" : "#111111"} 
            emissive={autoCycleFormula ? "#10b981" : "#333333"} 
            label={autoCycleFormula ? "FORMULA CYCLE: ON" : "FORMULA CYCLE: OFF"} 
            onClick={() => setAutoCycleFormula?.(!autoCycleFormula)}
            width={0.32}
            height={0.045}
          />
          
          <group position={[0.08, -0.02, 0.015]}>
            <HUDButton 
              position={[0, 0, 0]} 
              color="#374151" 
              emissive="#4b5563" 
              label="[-]" 
              onClick={() => {
                if (audioSync) {
                  setFormulaQuant?.(Math.max(-10, formulaQuant - 1));
                } else {
                  setFormulaCycleSpeed?.(Math.max(0.5, formulaCycleSpeed - 0.5));
                }
              }}
              width={0.05}
              height={0.045}
            />
            
            <Text 
              position={[0.13, 0, 0]} 
              fontSize={0.011} 
              color="#ffffff" 
              anchorX="center"
              anchorY="middle"
            >
              {audioSync ? `BEAT: ${formatQuant(formulaQuant)}` : `INT: ${formulaCycleSpeed.toFixed(1)}s`}
            </Text>

            <HUDButton 
              position={[0.26, 0, 0]} 
              color="#374151" 
              emissive="#4b5563" 
              label="[+]" 
              onClick={() => {
                if (audioSync) {
                  setFormulaQuant?.(Math.min(10, formulaQuant + 1));
                } else {
                  setFormulaCycleSpeed?.(Math.min(10.0, formulaCycleSpeed + 0.5));
                }
              }}
              width={0.05}
              height={0.045}
            />
          </group>

          {/* Row 3: Shader Auto-Cycle & Speed/Beat Quant */}
          <HUDButton 
            position={[-0.18, -0.08, 0.015]} 
            color={autoCycleShader ? "#047857" : "#111111"} 
            emissive={autoCycleShader ? "#10b981" : "#333333"} 
            label={autoCycleShader ? "SHADER CYCLE: ON" : "SHADER CYCLE: OFF"} 
            onClick={() => setAutoCycleShader?.(!autoCycleShader)}
            width={0.32}
            height={0.045}
          />
          
          <group position={[0.08, -0.08, 0.015]}>
            <HUDButton 
              position={[0, 0, 0]} 
              color="#374151" 
              emissive="#4b5563" 
              label="[-]" 
              onClick={() => {
                if (audioSync) {
                  setShaderQuant?.(Math.max(-10, shaderQuant - 1));
                } else {
                  setShaderCycleSpeed?.(Math.max(0.5, shaderCycleSpeed - 0.5));
                }
              }}
              width={0.05}
              height={0.045}
            />
            
            <Text 
              position={[0.13, 0, 0]} 
              fontSize={0.011} 
              color="#ffffff" 
              anchorX="center"
              anchorY="middle"
            >
              {audioSync ? `BEAT: ${formatQuant(shaderQuant)}` : `INT: ${shaderCycleSpeed.toFixed(1)}s`}
            </Text>

            <HUDButton 
              position={[0.26, 0, 0]} 
              color="#374151" 
              emissive="#4b5563" 
              label="[+]" 
              onClick={() => {
                if (audioSync) {
                  setShaderQuant?.(Math.min(10, shaderQuant + 1));
                } else {
                  setShaderCycleSpeed?.(Math.min(10.0, shaderCycleSpeed + 0.5));
                }
              }}
              width={0.05}
              height={0.045}
            />
          </group>
        </group>
      )}

      {/* 3. FORMULAS TAB */}
      {activeTab === 'formulas' && (
        <group>
          {PRESET_FORMULAS.slice(formulaPage * 4, formulaPage * 4 + 4).map((f, idx) => {
            const row = Math.floor(idx / 2);
            const col = idx % 2;
            const xPos = col === 0 ? -0.19 : 0.19;
            const yPos = row === 0 ? 0.04 : -0.035;
            const isActive = formula.name === f.name;
            return (
              <HUDButton
                key={f.id}
                position={[xPos, yPos, 0.015]}
                color={isActive ? "#4f46e5" : "#111111"}
                emissive={isActive ? "#818cf8" : "#333333"}
                label={f.name.replace(/_/g, ' ')}
                onClick={() => onSelectFormula?.(f)}
                width={0.34}
                height={0.05}
              />
            );
          })}

          {/* Pagination Controls */}
          <group position={[0, -0.10, 0.015]}>
            <HUDButton 
              position={[-0.18, 0, 0]} 
              color="#374151" 
              emissive="#4b5563" 
              label="◀ PREV" 
              onClick={() => setFormulaPage(p => Math.max(0, p - 1))}
              width={0.09}
              height={0.035}
            />
            <Text 
              position={[0, 0, 0]} 
              fontSize={0.012} 
              color="#ffffff" 
              anchorX="center"
              anchorY="middle"
            >
              {`PAGE ${formulaPage + 1} / ${Math.ceil(PRESET_FORMULAS.length / 4)}`}
            </Text>
            <HUDButton 
              position={[0.18, 0, 0]} 
              color="#374151" 
              emissive="#4b5563" 
              label="NEXT ▶" 
              onClick={() => setFormulaPage(p => Math.min(Math.ceil(PRESET_FORMULAS.length / 4) - 1, p + 1))}
              width={0.09}
              height={0.035}
            />
          </group>
        </group>
      )}

      {/* 4. SHADERS TAB */}
      {activeTab === 'shaders' && (
        <group>
          {PRESET_SHADERS.slice(shaderPage * 4, shaderPage * 4 + 4).map((s, idx) => {
            const row = Math.floor(idx / 2);
            const col = idx % 2;
            const xPos = col === 0 ? -0.19 : 0.19;
            const yPos = row === 0 ? 0.04 : -0.035;
            const isActive = shader.name === s.name;
            return (
              <HUDButton
                key={s.id}
                position={[xPos, yPos, 0.015]}
                color={isActive ? "#7c3aed" : "#111111"}
                emissive={isActive ? "#a78bfa" : "#333333"}
                label={s.name.replace(/_/g, ' ')}
                onClick={() => onSelectShader?.(s)}
                width={0.34}
                height={0.05}
              />
            );
          })}

          {/* Pagination Controls */}
          <group position={[0, -0.10, 0.015]}>
            <HUDButton 
              position={[-0.18, 0, 0]} 
              color="#374151" 
              emissive="#4b5563" 
              label="◀ PREV" 
              onClick={() => setShaderPage(p => Math.max(0, p - 1))}
              width={0.09}
              height={0.035}
            />
            <Text 
              position={[0, 0, 0]} 
              fontSize={0.012} 
              color="#ffffff" 
              anchorX="center"
              anchorY="middle"
            >
              {`PAGE ${shaderPage + 1} / ${Math.ceil(PRESET_SHADERS.length / 4)}`}
            </Text>
            <HUDButton 
              position={[0.18, 0, 0]} 
              color="#374151" 
              emissive="#4b5563" 
              label="NEXT ▶" 
              onClick={() => setShaderPage(p => Math.min(Math.ceil(PRESET_SHADERS.length / 4) - 1, p + 1))}
              width={0.09}
              height={0.035}
            />
          </group>
        </group>
      )}

      {/* Informational tip at the very bottom of the HUD */}
      <Text
        position={[0, -0.225, 0.015]}
        fontSize={0.009}
        color="#888888"
        anchorX="center"
      >
        {hasControllers
          ? 'STICK MOVES VIEWER • HOLD TRIGGER/GRIP + STICK ADJUSTS OBJECT • PINCH-DRAG VISUAL TO MOVE IT'
          : 'LOOK + PINCH TO SELECT • PINCH-DRAG THE VISUAL TO MOVE IT • VIEW TAB HAS FINE CONTROLS'}
      </Text>

      {/* 5. SECONDARY DIAGNOSTICS & VECTOR GRAPH PANEL */}
      <group position={[0, -0.56, -0.03]}>
        {/* Console Backplate */}
        <mesh onPointerDown={handlePanelPointerDown}>
          <boxGeometry args={[0.8, 0.44, 0.02]} />
          <meshPhysicalMaterial 
            color="#1e1b4b" 
            transmission={0.9} 
            roughness={0.15} 
            metalness={0.15}
            clearcoat={1.0}
            transparent
            opacity={0.9}
          />
        </mesh>

        {/* Emissive Glow border */}
        <mesh position={[0, 0, -0.005]}>
          <boxGeometry args={[0.81, 0.45, 0.015]} />
          <meshBasicMaterial color="#d946ef" transparent opacity={0.3} />
        </mesh>

        {/* Header */}
        <Text 
          position={[0, 0.16, 0.015]} 
          fontSize={0.022} 
          color="#f472b6" 
          anchorX="center"
        >
          DIAGNOSTICS & SYSTEM MATRIX
        </Text>

        {/* Mathematical Formulas Vector Coordinates */}
        <group position={[-0.34, 0.10, 0.015]}>
          <Text fontSize={0.011} color="#38bdf8" anchorX="left">
            {`X(p,t) = ${formula.x}`}
          </Text>
        </group>
        <group position={[-0.34, 0.05, 0.015]}>
          <Text fontSize={0.011} color="#38bdf8" anchorX="left">
            {`Y(p,t) = ${formula.y}`}
          </Text>
        </group>
        <group position={[-0.34, 0.0, 0.015]}>
          <Text fontSize={0.011} color="#d946ef" anchorX="left">
            {`Z(p,t) = ${formula.z || "sin(2 * p + t) * 4"}`}
          </Text>
        </group>

        {/* Active Profile Info */}
        <group position={[-0.34, -0.06, 0.015]}>
          <Text fontSize={0.012} color="#a78bfa" anchorX="left" fontWeight="bold">
            {`Preset: ${formula.name.replace(/_/g, ' ')}`}
          </Text>
          <Text position={[0, -0.02, 0]} fontSize={0.009} color="#9ca3af" anchorX="left" maxWidth={0.68}>
            {formula.description || "Active mathematical model of resonance harmonics"}
          </Text>
        </group>

        {/* Shader telemetry */}
        <group position={[-0.34, -0.11, 0.015]}>
          <Text fontSize={0.011} color="#00ffcc" anchorX="left">
            {`Active Shader: ${shader.name.replace(/_/g, ' ')}`}
          </Text>
        </group>

        <group position={[-0.34, -0.14, 0.015]}>
          <Text fontSize={0.01} color="#f472b6" anchorX="left" maxWidth={0.68}>
            {`Hand Y Scalar: ${scalarLabel}`}
          </Text>
        </group>

        {/* Hardware Statistics Grid */}
        <group position={[0.22, 0.0, 0.015]}>
          {/* Box around statistics */}
          <mesh position={[0, -0.04, -0.005]}>
            <planeGeometry args={[0.22, 0.28]} />
            <meshBasicMaterial color="#000000" transparent opacity={0.4} />
          </mesh>
          
          <Text position={[-0.09, 0.08, 0]} fontSize={0.009} color="#888888" anchorX="left">
            TELEMETRY DATA:
          </Text>
          <Text position={[-0.09, 0.05, 0]} fontSize={0.01} color="#10b981" anchorX="left">
            FPS: 60.0
          </Text>
          <Text position={[-0.09, 0.02, 0]} fontSize={0.01} color="#3b82f6" anchorX="left">
            VERTS: 1.2K
          </Text>
          <Text position={[-0.09, -0.01, 0]} fontSize={0.01} color="#eab308" anchorX="left">
            {`MODE: ${show3D ? currentGeometryMode.toUpperCase() : "LINEAR"}`}
          </Text>
          <Text position={[-0.09, -0.04, 0]} fontSize={0.01} color="#ec4899" anchorX="left">
            {`SPEED: ${speed.toFixed(1)}x`}
          </Text>
          <Text position={[-0.09, -0.07, 0]} fontSize={0.009} color="#a855f7" anchorX="left" maxWidth={0.18}>
            {`PHASE: ${speed > 0 ? "LOCK" : "STABLE"}`}
          </Text>
          <Text position={[-0.09, -0.11, 0]} fontSize={0.008} color="#6b7280" anchorX="left">
            RENDER: WebGL_v4
          </Text>
        </group>

        {/* Interactive Close VR Info */}
        <Text
          position={[0, -0.175, 0.015]}
          fontSize={0.009}
          color="#888888"
          anchorX="center"
        >
          REAL-TIME MATHEMATICS GRAPH ENGINE • HARMONIC.OS SPATIAL CORE
        </Text>
      </group>
    </group>
  );
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
  setShaderCycleSpeed
}: GraphViewProps) {
  const formulaGeometryMode = useMemo(() => resolveFormulaGeometryMode(formula), [formula]);
  const [xrVisualTransform, setXrVisualTransform] = useState<XRVisualTransform>(DEFAULT_XR_VISUAL_TRANSFORM);
  const [xrGeometrySelection, setXrGeometrySelection] = useState<GraphGeometrySelection>('formula');
  const xrOriginRef = useRef<THREE.Group>(null);
  const xrDragOffsetRef = useRef(new THREE.Vector3());
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
      <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 0, 25], fov: 50 }} gl={{ alpha: true, antialias: true, premultipliedAlpha: false }}>
        <XR store={xrStore}>
          <XRPlayerOrigin originRef={xrOriginRef} />
          <XRJoystickLocomotion originRef={xrOriginRef} />
          <XRVisualThumbstickControls setXrVisualTransform={setXrVisualTransform} />
          <XRAlphaController />
          <StudioEnvironment />
          <SpatialWrapper xrVisualTransform={xrVisualTransform} dragOffsetRef={xrDragOffsetRef}>
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
            <FormulaLine formula={formula} shader={shader} show3D={show3D} showWireframe={showWireframe} materialProfile={webgpuMaterial} geometryMode={geometryMode} />
          </SpatialWrapper>

          <ImmersiveHUD 
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
          />
        </XR>
      </Canvas>
      
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
        <div className="flex justify-between gap-4"><span>RENDER_MODE:</span> <span className="text-indigo-400">{show3D ? geometryMode.toUpperCase() : 'LINEAR'}</span></div>
        <div className="flex justify-between gap-4"><span>COORDS:</span> <span className="text-indigo-400">CARTESIAN_3D</span></div>
        <div className="flex justify-between gap-4"><span>SAMPLING:</span> <span className="text-indigo-400">HIGH_RES</span></div>
      </div>
    </div>
  );
}
