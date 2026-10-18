import * as THREE from 'three';
import { createStore } from 'zustand/vanilla';

// Alphabet sphere: 70,000 points inside a unit sphere, 26 Fibonacci-spaced
// viewing axes, one capital letter per axis. Each letter's points are placed
// along that axis at random depths, with their lateral position pre-shrunk by
// the perspective factor (D − z) / D, so from a camera D radii out on the axis
// they all project onto the glyph and the letter snaps into focus; from any
// other angle they are just part of the cloud. A second, coherent position
// per point (a shallow beveled relief floating in front of the centre) is
// blended in while the view is aligned, which gives the letter real depth for
// stereo viewing and headsets. The perspective factor is applied in the
// vertex shader from the live camera distance, so the letters stay crisp
// whether the viewer is at the desktop orbit distance or walking up to the
// sphere in a headset.

export const ALPHABET_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
export const ALPHABET_POINTS = 70000;
// Design viewing distance in sphere radii: the desktop orbit sits here and
// the depth cues are tuned around it.
export const ALPHABET_DESIGN_DISTANCE = 4.2;
const GLYPH_SCALE = 0.65;
const GLYPH_RASTER = 256;

export type AlphabetStereoMode = 'mono' | 'crosseye' | 'parallel' | 'anaglyph' | 'wiggle';

export type AlphabetSettings = {
  stereo: AlphabetStereoMode;
  // Eye separation for the desktop stereo tricks, in sphere radii.
  baseline: number; // 0..0.65
  // How far aligned points move from their cloud depth to the coherent relief.
  relief: number; // 0..1
  // Contrast between the aligned letter and the rest of the cloud.
  collimation: number; // 0..1
  pointSize: number; // 1..5 px
  tour: boolean;
  rings: boolean;
};

export const DEFAULT_ALPHABET_SETTINGS: AlphabetSettings = {
  stereo: 'mono',
  baseline: 0.28,
  relief: 0.88,
  collimation: 0.86,
  pointSize: 2.6,
  tour: true,
  rings: true
};

export const ALPHABET_STEREO_MODES: ReadonlyArray<{ id: AlphabetStereoMode; label: string; hint: string }> = [
  { id: 'mono', label: 'Mono', hint: 'Plain 3D: drag to orbit, or let the tour carry you from A to Z. A headset gets true stereo through Enter Immersive Space.' },
  { id: 'crosseye', label: 'Cross', hint: 'Right view on the left: cross your eyes until the two guide dots merge into a third, centred sphere.' },
  { id: 'parallel', label: 'Parallel', hint: 'Left view on the left: relax your gaze into the distance (or use a side-by-side viewer) until the halves fuse.' },
  { id: 'anaglyph', label: 'Anaglyph', hint: 'Red–cyan glasses, red lens over the left eye.' },
  { id: 'wiggle', label: 'Wiggle', hint: 'No glasses: the viewpoint rocks sideways so motion parallax carries the depth.' }
];

// Live state shared between the stage, the on-canvas letter bar and the
// keyboard: which letter the view is aligned with (or flying to), and letter
// requests from the UI. Lives outside React so the frame loop can update it.
export type AlphabetStatus = {
  index: number;
  request: { index: number; nonce: number } | null;
};

export const alphabetStatus = createStore<AlphabetStatus>(() => ({ index: 0, request: null }));

export const setAlphabetIndex = (index: number) => {
  if (alphabetStatus.getState().index !== index) alphabetStatus.setState({ index });
};

export const requestAlphabetLetter = (index: number) => {
  const count = ALPHABET_LETTERS.length;
  const wrapped = ((index % count) + count) % count;
  const previous = alphabetStatus.getState().request;
  alphabetStatus.setState({ request: { index: wrapped, nonce: (previous?.nonce ?? 0) + 1 } });
};

export type ViewFrame = {
  letter: string;
  index: number;
  // v points out of the sphere along the viewing axis; u is the glyph's
  // right, w its up. All unit length and mutually perpendicular.
  v: THREE.Vector3;
  u: THREE.Vector3;
  w: THREE.Vector3;
  theta: number;
  phi: number;
};

// Fibonacci-spiral axes, kept off the exact poles so a world-up camera stays
// well conditioned on every letter.
export function buildViewFrames(): ViewFrame[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const up = new THREE.Vector3(0, 1, 0);
  return ALPHABET_LETTERS.map((letter, k) => {
    const y = 1 - ((k + 0.5) / ALPHABET_LETTERS.length) * 1.88;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * k;
    const v = new THREE.Vector3(ring * Math.cos(theta), y, ring * Math.sin(theta)).normalize();
    const u = new THREE.Vector3().crossVectors(up, v).normalize();
    const w = new THREE.Vector3().crossVectors(v, u).normalize();
    return { letter, index: k, v, u, w, theta, phi: Math.acos(y) };
  });
}

export const ALPHABET_FRAMES = buildViewFrames();

export function frameAngles(index: number) {
  const frame = ALPHABET_FRAMES[index] ?? ALPHABET_FRAMES[0];
  return {
    theta: Math.round(((frame.theta * 180) / Math.PI) % 360),
    phi: Math.round((frame.phi * 180) / Math.PI)
  };
}

type GlyphSample = { x: number; y: number; bevel: number };

// Rasterize one letter and run a two-pass chamfer distance transform inside
// its strokes: the normalized distance to the stroke edge becomes the bevel
// height of the relief, and pixels within 1.5 px of the edge form the
// contour pool that gets the denser, crisper sampling.
function sampleGlyph(char: string): { edge: GlyphSample[]; fill: GlyphSample[] } {
  const size = GLYPH_RASTER;
  const empty = { edge: [] as GlyphSample[], fill: [] as GlyphSample[] };
  if (typeof document === 'undefined') return empty;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return empty;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#fff';
  ctx.font = '900 205px "Arial Black", Impact, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(char, size / 2, size / 2 + 8);

  const img = ctx.getImageData(0, 0, size, size).data;
  const mask = new Uint8Array(size * size);
  const dist = new Float32Array(size * size);
  const INF = 9999;
  for (let i = 0; i < size * size; i++) {
    if (img[i * 4] > 128) {
      mask[i] = 1;
      dist[i] = INF;
    }
  }
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const idx = y * size + x;
      if (!mask[idx]) continue;
      dist[idx] = Math.min(
        dist[idx],
        dist[(y - 1) * size + x] + 1,
        dist[y * size + (x - 1)] + 1,
        dist[(y - 1) * size + (x - 1)] + 1.414,
        dist[(y - 1) * size + (x + 1)] + 1.414
      );
    }
  }
  let maxDist = 1;
  for (let y = size - 2; y >= 1; y--) {
    for (let x = size - 2; x >= 1; x--) {
      const idx = y * size + x;
      if (!mask[idx]) continue;
      dist[idx] = Math.min(
        dist[idx],
        dist[(y + 1) * size + x] + 1,
        dist[y * size + (x + 1)] + 1,
        dist[(y + 1) * size + (x + 1)] + 1.414,
        dist[(y + 1) * size + (x - 1)] + 1.414
      );
      if (dist[idx] > maxDist) maxDist = dist[idx];
    }
  }

  const edge: GlyphSample[] = [];
  const fill: GlyphSample[] = [];
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const idx = y * size + x;
      if (!mask[idx]) continue;
      const sample = {
        x: ((x / (size - 1)) * 2 - 1) * GLYPH_SCALE,
        y: (1 - (y / (size - 1)) * 2) * GLYPH_SCALE,
        bevel: Math.min(1, dist[idx] / maxDist)
      };
      if (dist[idx] <= 1.5) edge.push(sample);
      else fill.push(sample);
    }
  }
  return { edge, fill };
}

// Small deterministic PRNG so the cloud is identical on every visit.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type AlphabetCloud = {
  count: number;
  // Per point: x, y on the letter's glyph plane (sphere radii) and z, the
  // depth along the letter's axis in the scattered cloud.
  position: Float32Array;
  // Depth along the axis in the coherent relief.
  sculptZ: Float32Array;
  letter: Float32Array;
  edgeWeight: Float32Array;
};

export function buildAlphabetCloud(seed = 7): AlphabetCloud {
  const random = mulberry32(seed);
  const count = ALPHABET_POINTS;
  const position = new Float32Array(count * 3);
  const sculptZ = new Float32Array(count);
  const letter = new Float32Array(count);
  const edgeWeight = new Float32Array(count);
  const letters = ALPHABET_LETTERS.length;
  const perLetter = Math.floor(count / letters);
  const glyphs = ALPHABET_LETTERS.map(sampleGlyph);
  let index = 0;

  for (let k = 0; k < letters; k++) {
    const { edge, fill } = glyphs[k];
    const share = k === letters - 1 ? count - index : perLetter;
    for (let i = 0; i < share; i++) {
      const useEdge = i < share * 0.46 && edge.length > 0;
      const pool = useEdge ? edge : fill.length ? fill : edge;
      // A glyph that failed to rasterize (no canvas) degrades to a plain
      // sphere of points rather than an empty slot.
      const sample = pool.length ? pool[Math.floor(random() * pool.length)] : { x: (random() - 0.5) * 1.3, y: (random() - 0.5) * 1.3, bevel: 0.5 };
      const jitter = useEdge ? 0.0022 : 0.0055;
      const x = sample.x + (random() - 0.5) * jitter;
      const y = sample.y + (random() - 0.5) * jitter;
      const r2 = x * x + y * y;
      // Depth along the axis, biased toward the shell so the sphere keeps a
      // crisp boundary in stereo; the chord limit keeps the compensated
      // point inside the sphere at the design distance.
      const maxChord = Math.sqrt(Math.max(0.01, 0.96 - r2 * 1.22));
      const u = random() * 2 - 1;
      const zChord = Math.sign(u) * Math.pow(Math.abs(u), 0.72) * maxChord;
      // Relief: floats forward with a beveled profile; contour points get a
      // thicker slab so the stroke walls read as extruded.
      const slab = useEdge ? (random() - 0.5) * 0.11 : (random() - 0.5) * 0.03;
      const zSculpt = 0.34 + 0.14 * sample.bevel + slab;

      position[index * 3] = x;
      position[index * 3 + 1] = y;
      position[index * 3 + 2] = zChord;
      sculptZ[index] = zSculpt;
      letter[index] = k;
      edgeWeight[index] = useEdge ? 1 : 0.68 + 0.25 * sample.bevel;
      index++;
    }
  }
  return { count, position, sculptZ, letter, edgeWeight };
}

let cloudCache: AlphabetCloud | null = null;
export function getAlphabetCloud(): AlphabetCloud {
  if (!cloudCache) cloudCache = buildAlphabetCloud();
  return cloudCache;
}
