import * as THREE from 'three';
import { Formula } from '../constants';

// Builds a true (p, q) surface mesh for formulas flagged `parametric`.
// Shared by both renderer paths (three core classes are identical across
// 'three' and 'three/webgpu' thanks to the vite dedupe).

export const DEFAULT_P_RANGE: [number, number] = [0, Math.PI * 2];
export const DEFAULT_Q_RANGE: [number, number] = [0, Math.PI * 2];

// mathjs evaluation is the cost driver: segsP * segsQ * 3 evals per rebuild.
// 96x44 keeps a rebuild in the tens of milliseconds on desktop; XR asks for
// a smaller grid to protect 90 Hz frame budgets on headsets.
export const SURFACE_SEGMENTS_DESKTOP = { segsP: 96, segsQ: 44 };
export const SURFACE_SEGMENTS_XR = { segsP: 72, segsQ: 34 };

type CompiledAxes = { x: any; y: any; z: any };

function readNumber(value: any): number {
  const n = typeof value === 'number' ? value : value?.re;
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0;
  return THREE.MathUtils.clamp(n, -10000, 10000);
}

export function surfaceRanges(formula: Formula): { pRange: [number, number]; qRange: [number, number] } {
  return {
    pRange: formula.pRange ?? DEFAULT_P_RANGE,
    qRange: formula.qRange ?? DEFAULT_Q_RANGE
  };
}

export function surfaceMidQ(formula: Formula): number {
  const { qRange } = surfaceRanges(formula);
  return (qRange[0] + qRange[1]) / 2;
}

export function buildParametricGeometry(
  formula: Formula,
  compiled: CompiledAxes,
  t: number,
  scalar = 1,
  segments = SURFACE_SEGMENTS_DESKTOP
): THREE.BufferGeometry {
  const SEGMENTS_P = segments.segsP;
  const SEGMENTS_Q = segments.segsQ;
  const { pRange, qRange } = surfaceRanges(formula);
  const vertsPerRow = SEGMENTS_P + 1;
  const vertCount = vertsPerRow * (SEGMENTS_Q + 1);
  const positions = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const indices: number[] = [];
  const extents: number[] = [];
  const scope = { p: 0, q: 0, t, s: scalar };

  for (let iq = 0; iq <= SEGMENTS_Q; iq++) {
    const v = iq / SEGMENTS_Q;
    scope.q = qRange[0] + v * (qRange[1] - qRange[0]);
    for (let ip = 0; ip <= SEGMENTS_P; ip++) {
      const u = ip / SEGMENTS_P;
      scope.p = pRange[0] + u * (pRange[1] - pRange[0]);

      let x = 0;
      let y = 0;
      let z = 0;
      try {
        x = readNumber(compiled.x.evaluate(scope));
        y = readNumber(compiled.y.evaluate(scope));
        z = readNumber(compiled.z.evaluate(scope));
      } catch {
        // Leave the vertex at origin; a mid-edit formula shouldn't crash.
      }

      const offset = (iq * vertsPerRow + ip) * 3;
      positions[offset] = x;
      positions[offset + 1] = y;
      positions[offset + 2] = z;
      uvs[(iq * vertsPerRow + ip) * 2] = u;
      uvs[(iq * vertsPerRow + ip) * 2 + 1] = v;
      extents.push(Math.max(Math.abs(x), Math.abs(y), Math.abs(z)));

      if (ip < SEGMENTS_P && iq < SEGMENTS_Q) {
        const a = iq * vertsPerRow + ip;
        indices.push(a, a + 1, a + vertsPerRow, a + 1, a + vertsPerRow + 1, a + vertsPerRow);
      }
    }
  }

  // Robust fit (92nd percentile) so a few extreme vertices don't shrink the
  // whole surface — same policy as the curve sampler.
  extents.sort((a, b) => a - b);
  const robustExtent = Math.max(0.001, extents[Math.floor(extents.length * 0.92)] || 0.001);
  const fit = 7.5 / robustExtent;
  for (let i = 0; i < positions.length; i++) {
    positions[i] = THREE.MathUtils.clamp(positions[i] * fit, -22, 22);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
