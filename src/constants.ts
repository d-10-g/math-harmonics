export interface Formula {
  id: string;
  name: string;
  x: string;
  y: string;
  z?: string;
  geometryMode?: FormulaGeometryMode;
  category?: FormulaCategory;
  description: string;
  // True two-parameter surface: x/y/z are f(p, q, t) and the renderer builds
  // a (p, q) grid mesh directly instead of running a curve through one of the
  // procedural geometry modes.
  parametric?: boolean;
  pRange?: [number, number];
  qRange?: [number, number];
  // Art direction: preferred material + light rig, applied on selection when
  // Auto-Style is enabled.
  style?: { material: Exclude<WebGPUMaterialProfile, 'auto'>; lighting: WebGPULightingPreset };
  // Preferred animation speed, applied with Auto-Style (surfaces breathe
  // slowly; chaotic curves want pace).
  speedHint?: number;
}

export type FormulaGeometryMode =
  | 'tube'
  | 'ribbon'
  | 'extrude'
  | 'lathe'
  | 'crystal'
  | 'surface'
  | 'helix'
  | 'shell'
  | 'terrain'
  | 'constellation'
  | 'knot'
  | 'mandala'
  | 'lattice'
  | 'ripple'
  | 'prism'
  | 'vortex';
export type FormulaCategory = 'Parameter-evolving fractals' | 'Coordinate-dependent formulas' | 'State-dependent rule switching' | 'Formula mutation meta-fractals' | 'Organic root and PDE fields' | 'Parametric surfaces';
export type WebGPUGeometryProfile = 'auto' | FormulaGeometryMode;
export type WebGPULightingPreset = 'studio' | 'aurora' | 'gallery' | 'eclipse' | 'caustic' | 'noir' | 'sunset' | 'laboratory' | 'underlight' | 'prism';
export type WebGPUMaterialProfile =
  | 'auto'
  | 'plasma'
  | 'liquid-metal'
  | 'pearl'
  | 'glass'
  | 'velvet'
  | 'ceramic'
  | 'hologram'
  | 'obsidian'
  | 'copper'
  | 'jade'
  | 'xray'
  | 'carbon'
  | 'chrome'
  | 'ruby'
  | 'ice'
  | 'neon';

export interface ShaderPreset {
  id: string;
  name: string;
  fragmentShader: string;
  category?: ShaderCategory;
  description: string;
}

export type ShaderCategory =
  | 'Parameter-evolving shaders'
  | 'Coordinate-dependent shaders'
  | 'State-dependent shader switching'
  | 'Shader formula mutation meta-shaders'
  | 'Organic PDE shaders'
  | 'R185 TSL Lab shaders'
  | 'WebGPU TSL shaders'
  | 'Volumetric harmonic fields'
  | 'HTMLTexture scene shaders'
  | 'WebGPU XR lighting shaders'
  | 'Audio-reactive shaders';

function formulaNumber(value: number) {
  return value.toFixed(3).replace(/\.?0+$/, '');
}

function createOrganicFormulaVariations(startId: number, count: number): Formula[] {
  const modes: FormulaGeometryMode[] = ['tube', 'surface', 'extrude', 'lathe', 'surface', 'crystal', 'extrude', 'ribbon'];
  const familyNames = [
    'Root Smoke Ring',
    'Reaction Diffusion Medallion',
    'Viscous Fingering Halo',
    'Capillary Wave Medallion',
    'Liminal Blue Corridor Field',
    'Turing Coral Rosette',
    'Root Colony Quadrants',
    'Polynomial Petal Field'
  ];

  return Array.from({ length: count }, (_, index) => {
    const family = index % familyNames.length;
    const variant = index + 1;
    const id = startId + index;
    const lobes = 4 + ((index * 3) % 10);
    const secondary = 7 + ((index * 5) % 17);
    const tertiary = 11 + ((index * 7) % 21);
    const amp = formulaNumber(0.22 + (index % 9) * 0.035);
    const fine = formulaNumber(0.12 + (index % 7) * 0.025);
    const curl = formulaNumber(0.12 + (index % 6) * 0.025);
    const drift = formulaNumber(0.42 + (index % 8) * 0.055);
    const speed = formulaNumber(0.32 + (index % 10) * 0.045);
    const growth = formulaNumber(0.028 + (index % 6) * 0.006);
    const radial = formulaNumber(1.35 + (index % 8) * 0.08);
    const lift = formulaNumber(0.45 + (index % 9) * 0.05);
    let x = '';
    let y = '';
    let z = '';

    if (family === 0) {
      x = `(${radial} + ${amp} * sin(${lobes} * p + ${drift} * sin(t * ${speed} + p)) + ${fine} * sin(${tertiary} * p - t * ${speed})) * cos(p + ${curl} * sin(${secondary} * p - t) + ${fine} * sin(${tertiary} * p + t * ${speed}))`;
      y = `(${radial} + ${amp} * sin(${lobes} * p + ${drift} * sin(t * ${speed} + p)) + ${fine} * sin(${tertiary} * p - t * ${speed})) * sin(p + ${curl} * sin(${secondary} * p - t) + ${fine} * sin(${tertiary} * p + t * ${speed}))`;
      z = `${lift} * sin(${lobes} * p - t * ${speed}) + ${fine} * sin(${tertiary} * p + t * ${drift})`;
    } else if (family === 1) {
      x = `(${radial} + ${growth} * p + ${amp} * sin(${lobes} * p + t + ${drift} * sin(${secondary} * p - t))) * cos(p + ${curl} * sin(${secondary} * p + t * ${speed}))`;
      y = `(${radial} + ${growth} * p + ${amp} * cos(${secondary} * p - t + ${drift} * sin(${lobes} * p + t))) * sin(p + ${curl} * cos(${lobes} * p - t * ${speed}))`;
      z = `${lift} * sin(${secondary} * p + ${drift} * sin(${lobes} * p - t)) + ${fine} * cos(${tertiary} * p - t * ${speed})`;
    } else if (family === 2) {
      x = `(${formulaNumber(1.75 + (index % 6) * 0.07)} + ${amp} * abs(sin(${lobes} * p + t)) + ${fine} * sin(${tertiary} * p - t)) * cos(p + ${curl} * sin(${secondary} * p + t))`;
      y = `(${formulaNumber(1.75 + (index % 6) * 0.07)} + ${amp} * abs(cos(${lobes + 1} * p - t)) + ${fine} * cos(${tertiary + 2} * p + t * ${speed})) * sin(p + ${curl} * cos(${secondary} * p - t))`;
      z = `${formulaNumber(0.8 + (index % 5) * 0.08)} * sin(${lobes + 2} * p + ${drift} * sin(${secondary} * p - t))`;
    } else if (family === 3) {
      x = `(${formulaNumber(1.5 + (index % 5) * 0.06)} + ${amp} * sin(${tertiary} * p - t * ${speed}) + ${fine} * cos(${lobes} * p + t)) * cos(p + ${curl} * sin(${secondary} * p + t))`;
      y = `(${formulaNumber(1.5 + (index % 5) * 0.06)} + ${amp} * cos(${tertiary - 1} * p + t * ${drift}) + ${fine} * sin(${lobes + 1} * p - t)) * sin(p + ${curl} * cos(${secondary} * p - t))`;
      z = `${lift} * sin(${lobes + 3} * p + t) + ${fine} * sin(${tertiary + 5} * p - t * ${speed})`;
    } else if (family === 4) {
      x = `p * ${formulaNumber(0.1 + (index % 6) * 0.012)} * cos(${formulaNumber(1.5 + (index % 5) * 0.2)} * p + ${curl} * sin(t + p * ${speed}))`;
      y = `${formulaNumber(1.45 + (index % 7) * 0.08)} * sin(p + ${drift} * sin(${lobes} * p - t)) + ${fine} * sin(${secondary} * p + t)`;
      z = `${formulaNumber(0.85 + (index % 6) * 0.06)} * cos(${formulaNumber(2.2 + (index % 6) * 0.18)} * p - t) + ${amp} * sin(${secondary} * p + t * ${speed})`;
    } else if (family === 5) {
      x = `(${radial} + ${amp} * sin(${tertiary} * p + t * ${speed}) * sin(${lobes} * p - t)) * cos(p) + ${fine} * cos(${tertiary + 6} * p + t)`;
      y = `(${radial} + ${amp} * cos(${tertiary - 1} * p - t * ${speed}) * sin(${lobes + 1} * p + t)) * sin(p) + ${fine} * sin(${tertiary + 2} * p - t)`;
      z = `${fine} * sin(${tertiary} * p + t) + ${lift} * cos(${lobes} * p - t)`;
    } else if (family === 6) {
      x = `sign(cos(p)) * (${radial} + ${amp} * abs(sin(${lobes} * p + t))) + ${fine} * cos(${secondary} * p + t)`;
      y = `sign(sin(p)) * (${radial} + ${amp} * abs(cos(${lobes + 1} * p - t))) + ${fine} * sin(${secondary + 1} * p - t)`;
      z = `${lift} * sin(${lobes + 2} * p + t) * (${formulaNumber(0.55 + (index % 5) * 0.06)} + ${amp} * cos(${tertiary} * p))`;
    } else {
      x = `cos(${lobes} * p + ${curl} * sin(t)) * (${radial} + ${amp} * cos(p + t) + ${fine} * sin(${tertiary} * p))`;
      y = `sin(${lobes - 1} * p - ${curl} * cos(t)) * (${radial} + ${amp} * sin(p - t) + ${fine} * cos(${tertiary - 1} * p))`;
      z = `sin(${secondary} * p + t + ${drift} * sin(${lobes} * p))`;
    }

    return {
      id: `${id}`,
      name: `Organic ${familyNames[family]} ${variant.toString().padStart(2, '0')}`,
      category: 'Organic root and PDE fields',
      x,
      y,
      z,
      geometryMode: modes[family],
      description: `${familyNames[family]} with ${lobes} primary lobes and a ${secondary}-cycle drift harmonic.`
    };
  });
}

const BASE_PRESET_FORMULAS: Formula[] = [
  {
    id: "1",
    name: "Lissajous Primary",
    x: "sin(3 * p + t)",
    y: "sin(2 * p)",
    z: "sin(4 * p + t) * cos(2 * p)",
    geometryMode: "ribbon",
    style: { material: "pearl", lighting: "studio" },
    description: "Classic harmonic resonance pattern."
  },
  {
    id: "2",
    name: "Butterfly Curve",
    x: "sin(p) * (exp(cos(p)) - 2 * cos(4 * p) - sin(p / 12)^5)",
    y: "cos(p) * (exp(cos(p)) - 2 * cos(4 * p) - sin(p / 12)^5)",
    z: "sin(3 * p + t) * (1 + 0.25 * cos(8 * p))",
    geometryMode: "extrude",
    description: "Complex transcendental curve with biological symmetry."
  },
  {
    id: "3",
    name: "Spirograph Alpha",
    x: "8 * cos(p) + 3 * cos(8/3 * p + t)",
    y: "8 * sin(p) - 3 * sin(8/3 * p + t)",
    z: "2.4 * sin(11/3 * p + t * 0.7)",
    geometryMode: "crystal",
    description: "Hypotrochoid generated by rolling circles."
  },
  {
    id: "4",
    name: "Heart Rhythm",
    x: "16 * sin(p)^3",
    y: "13 * cos(p) - 5 * cos(2 * p) - 2 * cos(3 * p) - cos(4 * p) + sin(t)",
    z: "2.0 * sin(p + t) + 0.5 * sin(5 * p)",
    geometryMode: "extrude",
    description: "Beating algebraic heart curve."
  },
  {
    id: "5",
    name: "Rose Curve",
    x: "cos(5 * p + t) * cos(p)",
    y: "cos(5 * p + t) * sin(p)",
    z: "sin(10 * p + t) * 0.8",
    geometryMode: "lathe",
    description: "A rhodonea curve with k=5."
  },
  {
    id: "6",
    name: "Maurer Rose",
    x: "sin(7 * p) * cos(p + t)",
    y: "sin(7 * p) * sin(p + t)",
    z: "cos(14 * p + t) * 0.9",
    geometryMode: "ribbon",
    description: "Simple rose variant with time phase."
  },
  {
    id: "7",
    name: "Hypotrochoid Duo",
    x: "5 * cos(p) + 2 * cos(7 * p / 2 + t)",
    y: "5 * sin(p) - 2 * sin(7 * p / 2 + t)",
    z: "sin(9 * p / 2 + t) * 1.7",
    geometryMode: "tube",
    description: "Complex interlocking loops."
  },
  {
    id: "8",
    name: "Lissajous Knot",
    x: "sin(5 * p + t)",
    y: "sin(4 * p)",
    z: "sin(3 * p + t * 0.8)",
    geometryMode: "crystal",
    description: "Higher order frequency ratios."
  },
  {
    id: "9",
    name: "Spiral Sine",
    x: "p * cos(p + t)",
    y: "p * sin(p + t)",
    z: "sin(p * 1.5 + t) * sqrt(p)",
    geometryMode: "surface",
    description: "Archimedean spiral with rotational shift."
  },
  {
    id: "10",
    name: "Oscillating Torus",
    x: "(2 + cos(8 * p + t)) * cos(p)",
    y: "(2 + cos(8 * p + t)) * sin(p)",
    z: "sin(8 * p + t) * 1.4",
    geometryMode: "lathe",
    description: "Cross-section of a pulsing torus."
  },
  {
    id: "11",
    name: "Lemniscate of Bernoulli",
    x: "cos(p) / (1 + sin(p)^2) * (1 + 0.5 * sin(t))",
    y: "sin(p) * cos(p) / (1 + sin(p)^2) * (1 + 0.5 * sin(t))",
    z: "sin(2 * p + t) / (1 + sin(p)^2)",
    geometryMode: "ribbon",
    description: "Infinite loop with scale pulsation."
  },
  {
    id: "12",
    name: "Epitrochoid Glow",
    x: "11 * cos(p) - 4 * cos(11/3 * p + t)",
    y: "11 * sin(p) - 4 * sin(11/3 * p + t)",
    z: "3 * cos(14/3 * p + t * 0.5)",
    geometryMode: "crystal",
    description: "External circle rotation pattern."
  },
  {
    id: "13",
    name: "Star Pulse",
    x: "cos(p) * (2 + sin(5 * p + t))",
    y: "sin(p) * (2 + sin(5 * p + t))",
    z: "cos(5 * p + t) * 1.2",
    geometryMode: "extrude",
    description: "Pulsating star-like polygon."
  },
  {
    id: "14",
    name: "Wave Interference",
    x: "p - 10",
    y: "sin(p + t) + sin(1.5 * p + t * 0.5)",
    z: "cos(2.5 * p - t) + 0.5 * sin(4 * p + t)",
    geometryMode: "surface",
    description: "Superposition of two sine waves."
  },
  {
    id: "15",
    name: "Spiral Galaxy",
    x: "sqrt(p) * cos(sqrt(p) * 10 + t)",
    y: "sqrt(p) * sin(sqrt(p) * 10 + t)",
    z: "0.35 * p + sin(sqrt(p) * 8 + t)",
    geometryMode: "surface",
    description: "Logarithmic spiral approximation."
  },
  {
    id: "16",
    name: "Clover Fold",
    x: "cos(3 * p) * cos(p + t)",
    y: "cos(3 * p) * sin(p + t)",
    z: "sin(6 * p + t) * 0.7",
    geometryMode: "lathe",
    description: "A 3-petaled rose curve."
  },
  {
    id: "17",
    name: "Diamond Mesh",
    x: "sin(p) + 0.5 * sin(7 * p + t)",
    y: "cos(p) + 0.5 * cos(7 * p + t)",
    z: "sin(4 * p + t) * cos(3 * p)",
    geometryMode: "crystal",
    description: "Interference on a unit circle."
  },
  {
    id: "18",
    name: "Infinity Swirl",
    x: "sin(p) * cos(p + t)",
    y: "sin(2 * p)",
    z: "cos(p) * sin(2 * p + t)",
    geometryMode: "ribbon",
    description: "Figure eight with phase offset."
  },
  {
    id: "19",
    name: "Zigzag Orbit",
    x: "p * sin(t)",
    y: "sin(p * 5 + t)",
    z: "cos(p * 3 - t) * (1 + 0.08 * p)",
    geometryMode: "surface",
    description: "Linear sweep with high frequency oscillation."
  },
  {
    id: "20",
    name: "Chaos Pendulum",
    x: "sin(p + t) + 0.5 * sin(2 * p + t * 2)",
    y: "cos(p + t) + 0.5 * cos(2 * p + t * 2)",
    z: "sin(3 * p - t) + 0.35 * cos(5 * p + t)",
    geometryMode: "crystal",
    description: "Simulated double pendulum trace."
  }
,
    {
    id: "21",
    name: "Golden Spiral",
    x: "cos(p + t) * exp(0.16 * p)",
    y: "sin(p + t) * exp(0.16 * p)",
    z: "0.35 * exp(0.16 * p) * sin(2 * p + t) * 0.6",
    geometryMode: "tube",
    style: { material: "copper", lighting: "sunset" },
    description: "Logarithmic spiral with golden-ratio growth, rotating with phase."
  },
    {
    id: "22",
    name: "Quantum String",
    x: "cos(p) * (3 + 0.5 * sin(8 * p - 2 * t))",
    y: "sin(p) * (3 + 0.5 * sin(8 * p - 2 * t))",
    z: "0.8 * sin(8 * p - 2 * t) + 0.3 * sin(13 * p + t)",
    geometryMode: "ribbon",
    description: "Standing wave on a closed string with an eighth-harmonic vibration mode."
  },
    {
    id: "23",
    name: "Magnetic Field",
    x: "4 * sin(p)^2 * cos(p + 0.3 * t)",
    y: "4 * sin(p)^2 * sin(p + 0.3 * t)",
    z: "1.5 * cos(p) * sin(2 * p + t)",
    geometryMode: "tube",
    description: "Dipole field-line lobes: r = L sin^2(theta), slowly precessing."
  },
    {
    id: "24",
    name: "Pulsar Beam",
    x: "cos(0.5 * p + 4 * t) * p * 0.16",
    y: "sin(0.5 * p + 4 * t) * p * 0.16",
    z: "2.2 * cos(p) + 0.6 * sin(12 * p + 6 * t)",
    geometryMode: "vortex",
    description: "Lighthouse sweep: a fast-rotating beam spiraling out from the core."
  },
    {
    id: "25",
    name: "Orbital Decay",
    x: "(6 - 0.21 * p) * cos(p * (1 + 0.04 * p) + t)",
    y: "(6 - 0.21 * p) * sin(p * (1 + 0.04 * p) + t)",
    z: "0.24 * (6 - 0.21 * p) * sin(6 * p + 2 * t)",
    geometryMode: "tube",
    description: "Inspiral: radius decays while angular frequency chirps upward."
  },
    {
    id: "26",
    name: "Torus Knot 3,8",
    x: "(3 + cos(2 * p + t)) * cos(0.75 * p)",
    y: "(3 + cos(2 * p + t)) * sin(0.75 * p)",
    z: "sin(2 * p + t)",
    geometryMode: "tube",
    style: { material: "liquid-metal", lighting: "studio" },
    description: "A true (3,8) torus knot: three toroidal loops, eight poloidal windings."
  },
    {
    id: "27",
    name: "Chladni Plate",
    x: "cos(p) * (2.5 + 1.2 * cos(5 * p) * cos(3 * p + t))",
    y: "sin(p) * (2.5 + 1.2 * cos(5 * p) * cos(3 * p + t))",
    z: "1.4 * sin(5 * p) * sin(3 * p + t)",
    geometryMode: "terrain",
    description: "Nodal-line rosette of a vibrating plate in a (5,3) resonance mode."
  },
    {
    id: "28",
    name: "Lorenz Butterfly (2D)",
    x: "3.8 * cos(p + 0.3 * sin(3 * p + t)) / (1 + sin(p)^2)",
    y: "3.4 * sin(p + 0.3 * sin(3 * p + t)) * cos(p) / (1 + sin(p)^2)",
    z: "1.2 * sin(2 * p + t)",
    geometryMode: "ribbon",
    style: { material: "ruby", lighting: "noir" },
    description: "Two-lobed lemniscate wings with chaotic phase wobble, after Lorenz."
  },
    {
    id: "29",
    name: "Strange Loop",
    x: "(2.4 + 1.1 * cos(1.5 * p + 0.5 * t)) * cos(p)",
    y: "(2.4 + 1.1 * cos(1.5 * p + 0.5 * t)) * sin(p)",
    z: "1.1 * sin(1.5 * p + 0.5 * t)",
    geometryMode: "tube",
    description: "A closed loop that threads itself: 3:2 winding with slow phase drift."
  },
    {
    id: "30",
    name: "Harmonic Oscillator",
    x: "0.32 * p - 4",
    y: "3.2 * exp(-0.09 * p) * cos(3 * p + t)",
    z: "1.9 * exp(-0.09 * p) * sin(3 * p + t)",
    geometryMode: "ribbon",
    description: "Damped oscillation: exponential envelope over a rotating phasor."
  },
    {
    id: "31",
    name: "Mobius Strip Edge",
    x: "(3 + 0.9 * cos(0.25 * p + 0.2 * t)) * cos(0.5 * p)",
    y: "(3 + 0.9 * cos(0.25 * p + 0.2 * t)) * sin(0.5 * p)",
    z: "0.9 * sin(0.25 * p + 0.2 * t)",
    geometryMode: "ribbon",
    description: "The single boundary edge of a Mobius band: two turns, one half-twist."
  },
    {
    id: "32",
    name: "Event Horizon",
    x: "3.1 * cos(p) / (1 + 0.25 * sin(6 * p + t)^2)",
    y: "3.1 * sin(p) / (1 + 0.25 * sin(6 * p + t)^2)",
    z: "0.5 * sin(6 * p + t) / (1 + 0.3 * cos(3 * p))",
    geometryMode: "lathe",
    description: "Photon-ring circle warped by six-fold frame-dragging ripples."
  },
    {
    id: "33",
    name: "Synapse Spark",
    x: "4 * cos(p) + 0.45 * sin(17 * p + 5 * t)",
    y: "2.2 * sin(2 * p + t) + 0.4 * sin(23 * p - 4 * t)",
    z: "1.2 * sin(9 * p + 3 * t) * cos(2 * p)",
    geometryMode: "constellation",
    speedHint: 1.4,
    description: "Neural arc with high-frequency jitter riding a slow carrier loop."
  },
    {
    id: "34",
    name: "Gravitational Wave",
    x: "0.3 * p - 3.8",
    y: "(0.5 + 0.09 * p) * sin(0.8 * p * (1 + 0.09 * p) + 2 * t)",
    z: "0.7 * (0.5 + 0.09 * p) * cos(0.8 * p * (1 + 0.09 * p) + 2 * t)",
    geometryMode: "ripple",
    description: "Binary-merger chirp: amplitude and frequency rise together."
  },
    {
    id: "35",
    name: "Bessel Function",
    x: "cos(p) * (2 + 1.6 * cos(2.4 * p - t) / sqrt(0.4 * p + 1))",
    y: "sin(p) * (2 + 1.6 * cos(2.4 * p - t) / sqrt(0.4 * p + 1))",
    z: "1.8 * sin(2.4 * p - t) / sqrt(0.4 * p + 1)",
    geometryMode: "ripple",
    description: "Radially decaying oscillation ~ J0: cos(kr)/sqrt(r) drumhead rings."
  },
    {
    id: "36",
    name: "String Theory",
    x: "(3 + 0.8 * cos(6 * p + t)) * cos(p) + 0.2 * sin(25 * p)",
    y: "(3 + 0.8 * cos(6 * p + t)) * sin(p) + 0.2 * cos(25 * p)",
    z: "0.8 * sin(6 * p + t) + 0.2 * sin(25 * p + 2 * t)",
    geometryMode: "helix",
    description: "A macroscopic loop with a compactified micro-dimension wound 25 times."
  },
    {
    id: "37",
    name: "Electron Cloud",
    x: "3.4 * sin(2 * p) * cos(3 * p + t)",
    y: "3.4 * sin(2 * p) * sin(3 * p + t)",
    z: "3.4 * cos(2 * p) * sin(p + 0.5 * t)",
    geometryMode: "constellation",
    description: "Orbital lobes traced on a sphere: a spherical Lissajous d-shell."
  },
    {
    id: "38",
    name: "Supernova Core",
    x: "cos(11 * p) * (1.2 + 2.6 * abs(sin(0.5 * p + 0.5 * t)))",
    y: "sin(11 * p) * (1.2 + 2.6 * abs(sin(0.5 * p + 0.5 * t)))",
    z: "1.5 * sin(7 * p - t) * abs(sin(0.5 * p))",
    geometryMode: "crystal",
    description: "Shockfront burst: eleven-fold shell breathing between core and blast."
  },
    {
    id: "39",
    name: "Stellar Nursery",
    x: "3 * cos(p + 0.8 * sin(2 * p + 0.3 * t)) + 0.5 * cos(5 * p)",
    y: "3 * sin(p + 0.8 * cos(3 * p - 0.3 * t))",
    z: "1.3 * sin(4 * p + 0.4 * t) + 0.5 * cos(2 * p)",
    geometryMode: "shell",
    description: "Billowing molecular-cloud folds with slow internal churn."
  },
    {
    id: "40",
    name: "Wormhole Geometry",
    x: "1.4 * cosh(0.8 * (0.25 * p - 3.1416)) * cos(2 * p + t)",
    y: "1.4 * cosh(0.8 * (0.25 * p - 3.1416)) * sin(2 * p + t)",
    z: "2.2 * (0.25 * p - 3.1416)",
    geometryMode: "lathe",
    style: { material: "chrome", lighting: "eclipse" },
    description: "Hyperboloid throat: a geodesic winding through the narrow neck."
  },
    {
    id: "41",
    name: "Navier-Stokes Flow",
    x: "0.28 * p - 3.5 + 0.9 * cos(2 * p + t)",
    y: "1.8 * sin(2 * p + t) + 0.5 * sin(5 * p - t)",
    z: "0.8 * cos(3 * p + 0.5 * t)",
    geometryMode: "vortex",
    description: "Von Karman vortex street: alternating eddies shed downstream."
  },
    {
    id: "42",
    name: "Fibonacci Sequence",
    x: "0.62 * sqrt(3 * p) * cos(7.19988 * p + 0.2 * t)",
    y: "0.62 * sqrt(3 * p) * sin(7.19988 * p + 0.2 * t)",
    z: "0.5 * sin(3 * p + t)",
    geometryMode: "constellation",
    style: { material: "jade", lighting: "caustic" },
    description: "Phyllotaxis: seeds placed by the golden angle, r ~ sqrt(n)."
  },
    {
    id: "43",
    name: "Schrodinger Wave Packet",
    x: "0.3 * p - 3.8",
    y: "3 * exp(-0.03 * (p - 12.57)^2) * cos(3 * p - 2 * t)",
    z: "3 * exp(-0.03 * (p - 12.57)^2) * sin(3 * p - 2 * t)",
    geometryMode: "ribbon",
    description: "A Gaussian wave packet: complex phasor under a bell envelope."
  },
    {
    id: "44",
    name: "Plasma Toroid",
    x: "(3.2 + 0.9 * cos(3.5 * p + t)) * cos(0.5 * p)",
    y: "(3.2 + 0.9 * cos(3.5 * p + t)) * sin(0.5 * p)",
    z: "0.9 * sin(3.5 * p + t)",
    geometryMode: "tube",
    description: "Tokamak confinement: helical field line winding a torus 7:2."
  },
    {
    id: "45",
    name: "Fusion Core",
    x: "cos(p) * (2 + 1.3 * sin(6 * p) * sin(2 * t))",
    y: "sin(p) * (2 + 1.3 * sin(6 * p) * sin(2 * t))",
    z: "1.6 * cos(6 * p) * sin(2 * t + p)",
    geometryMode: "crystal",
    description: "Six-lobed core pulsing radially at twice the phase rate."
  },
    {
    id: "46",
    name: "Mandelbrot Edge",
    x: "2.6 * (cos(p) / 2 - cos(2 * p) / 4) + 0.12 * sin(15 * p + t)",
    y: "2.6 * (sin(p) / 2 - sin(2 * p) / 4) + 0.12 * cos(15 * p + t)",
    z: "0.4 * sin(8 * p + t)",
    geometryMode: "extrude",
    style: { material: "obsidian", lighting: "prism" },
    description: "The main cardioid boundary of the Mandelbrot set, with edge shimmer."
  },
    {
    id: "47",
    name: "Julia Set Orbit",
    x: "3 * cos(2 * p + 1.2 * sin(3 * p - t))",
    y: "3 * sin(2 * p + 1.2 * cos(3 * p - t))",
    z: "1.2 * cos(5 * p + t)",
    geometryMode: "mandala",
    description: "Phase-modulated orbit echoing Julia-set spiral arms."
  },
    {
    id: "48",
    name: "Chaos Attractor",
    x: "3 * cos(p + 0.2 * t) + 1.3 * cos(2.718 * p)",
    y: "3 * sin(p + 0.2 * t) + 1.3 * sin(3.1416 * p)",
    z: "1.5 * sin(1.618 * p + t)",
    geometryMode: "tube",
    speedHint: 1.2,
    description: "Quasi-periodic torus flow with incommensurate frequencies (e, pi, phi)."
  },
    {
    id: "49",
    name: "Dark Matter Halo",
    x: "3.6 * sin(5 * p) * cos(8 * p + 0.2 * t)",
    y: "3.6 * sin(5 * p) * sin(8 * p + 0.2 * t)",
    z: "3.6 * cos(5 * p)",
    geometryMode: "constellation",
    description: "A spherical Lissajous shell sampling an invisible halo."
  },
    {
    id: "50",
    name: "Fractal Canopy",
    x: "2.2 * sin(p) + 1.1 * sin(2 * p + 0.3 * t) + 0.55 * sin(4 * p + 0.6 * t) + 0.28 * sin(8 * p + t)",
    y: "2.2 * cos(p) + 1.1 * cos(2 * p + 0.3 * t) + 0.55 * cos(4 * p + 0.6 * t) + 0.28 * cos(8 * p + t)",
    z: "0.5 * sin(16 * p + t) + 0.8 * cos(3 * p)",
    geometryMode: "lattice",
    style: { material: "velvet", lighting: "aurora" },
    description: "Weierstrass-style self-similar sum: each octave adds finer branches."
  },
  {
    id: "51",
    name: "Quantum Foam Orbit",
    x: "sin(7 * p + t) * exp(cos(4 * p))",
    y: "cos(7 * p + t) * exp(sin(4 * p))",
    z: "1.4 * sin(4 * p - t) * exp(0.4 * cos(7 * p))",
    geometryMode: "constellation",
    description: "Froth of virtual loops: exponential envelopes over fast orbits."
  },
  {
    id: "52",
    name: "Magnetic Flux",
    x: "p * sin(4 * p) + 1.5 * cos(t)",
    y: "p * cos(4 * p) + 1.5 * sin(t)",
    description: "Complex magnetic flux mathematical simulation."
  },
  {
    id: "53",
    name: "Graviton Spiral",
    x: "sin(5 * p + t) + 0.5 * sin(12 * p + t*2)",
    y: "cos(7 * p + t) + 0.5 * cos(5 * p + t*2)",
    description: "Complex graviton spiral mathematical simulation."
  },
  {
    id: "54",
    name: "Singularity Event",
    x: "sin(12 * p + t) * exp(cos(2 * p))",
    y: "cos(9 * p + t) * exp(sin(2 * p))",
    description: "Complex singularity event mathematical simulation."
  },
  {
    id: "55",
    name: "Tachyon Trail",
    x: "p * sin(8 * p) + 1.5 * cos(t)",
    y: "p * cos(4 * p) + 1.5 * sin(t)",
    description: "Complex tachyon trail mathematical simulation."
  },
  {
    id: "56",
    name: "Neutrino Oscillation",
    x: "sin(10 * p + t) + 0.5 * sin(4 * p + t*2)",
    y: "cos(6 * p + t) + 0.5 * cos(10 * p + t*2)",
    description: "Complex neutrino oscillation mathematical simulation."
  },
  {
    id: "57",
    name: "Plasma Filament",
    x: "sin(14 * p + t) * exp(cos(4 * p))",
    y: "cos(11 * p + t) * exp(sin(4 * p))",
    description: "Complex plasma filament mathematical simulation."
  },
  {
    id: "58",
    name: "Solar Corona",
    x: "p * sin(11 * p) + 0.3 * cos(t)",
    y: "p * cos(3 * p) + 0.3 * sin(t)",
    description: "Complex solar corona mathematical simulation."
  },
  {
    id: "59",
    name: "Pulsar Binary",
    x: "sin(12 * p + t) + 0.5 * sin(9 * p + t*2)",
    y: "cos(2 * p + t) + 0.5 * cos(12 * p + t*2)",
    description: "Complex pulsar binary mathematical simulation."
  },
  {
    id: "60",
    name: "Superstring Loop",
    x: "sin(7 * p + t) * exp(cos(5 * p))",
    y: "cos(1 * p + t) * exp(sin(5 * p))",
    description: "Complex superstring loop mathematical simulation."
  },
  {
    id: "61",
    name: "Dark Energy Expansion",
    x: "p * sin(7 * p) + 2.0 * cos(t)",
    y: "p * cos(4 * p) + 2.0 * sin(t)",
    description: "Complex dark energy expansion mathematical simulation."
  },
  {
    id: "62",
    name: "Hawking Radiation",
    x: "sin(9 * p + t) + 0.5 * sin(2 * p + t*2)",
    y: "cos(8 * p + t) + 0.5 * cos(9 * p + t*2)",
    description: "Complex hawking radiation mathematical simulation."
  },
  {
    id: "63",
    name: "Warp Bubble",
    x: "sin(4 * p + t) * exp(cos(8 * p))",
    y: "cos(10 * p + t) * exp(sin(8 * p))",
    description: "Complex warp bubble mathematical simulation."
  },
  {
    id: "64",
    name: "Einstein-Rosen Bridge",
    x: "p * sin(6 * p) + 1.9 * cos(t)",
    y: "p * cos(3 * p) + 1.9 * sin(t)",
    description: "Complex einstein-rosen bridge mathematical simulation."
  },
  {
    id: "65",
    name: "Chronosphere",
    x: "sin(12 * p + t) + 0.5 * sin(3 * p + t*2)",
    y: "cos(8 * p + t) + 0.5 * cos(12 * p + t*2)",
    description: "Complex chronosphere mathematical simulation."
  },
  {
    id: "66",
    name: "Hyperspace Jump",
    x: "sin(3 * p + t) * exp(cos(3 * p))",
    y: "cos(9 * p + t) * exp(sin(3 * p))",
    description: "Complex hyperspace jump mathematical simulation."
  },
  {
    id: "67",
    name: "Event Horizon Flare",
    x: "p * sin(1 * p) + 1.4 * cos(t)",
    y: "p * cos(3 * p) + 1.4 * sin(t)",
    description: "Complex event horizon flare mathematical simulation."
  },
  {
    id: "68",
    name: "Cosmic Microwave",
    x: "sin(7 * p + t) + 0.5 * sin(2 * p + t*2)",
    y: "cos(7 * p + t) + 0.5 * cos(7 * p + t*2)",
    description: "Complex cosmic microwave mathematical simulation."
  },
  {
    id: "69",
    name: "Quasar Jet",
    x: "sin(3 * p + t) * exp(cos(1 * p))",
    y: "cos(5 * p + t) * exp(sin(1 * p))",
    description: "Complex quasar jet mathematical simulation."
  },
  {
    id: "70",
    name: "Nebular Web",
    x: "p * sin(3 * p) + 0.5 * cos(t)",
    y: "p * cos(9 * p) + 0.5 * sin(t)",
    description: "Complex nebular web mathematical simulation."
  },
  {
    id: "71",
    name: "Bose-Einstein Condensate",
    x: "sin(13 * p + t) + 0.5 * sin(1 * p + t*2)",
    y: "cos(4 * p + t) + 0.5 * cos(13 * p + t*2)",
    description: "Complex bose-einstein condensate mathematical simulation."
  },
  {
    id: "72",
    name: "Fermion Path",
    x: "sin(9 * p + t) * exp(cos(3 * p))",
    y: "cos(7 * p + t) * exp(sin(3 * p))",
    description: "Complex fermion path mathematical simulation."
  },
  {
    id: "73",
    name: "Boson Field",
    x: "p * sin(12 * p) + 0.3 * cos(t)",
    y: "p * cos(8 * p) + 0.3 * sin(t)",
    description: "Complex boson field mathematical simulation."
  },
  {
    id: "74",
    name: "Hadron Collider",
    x: "sin(14 * p + t) + 0.5 * sin(12 * p + t*2)",
    y: "cos(3 * p + t) + 0.5 * cos(14 * p + t*2)",
    description: "Complex hadron collider mathematical simulation."
  },
  {
    id: "75",
    name: "Higgs Mechanism",
    x: "sin(7 * p + t) * exp(cos(2 * p))",
    y: "cos(2 * p + t) * exp(sin(2 * p))",
    description: "Complex higgs mechanism mathematical simulation."
  },
  {
    id: "76",
    name: "Gluon Mesh",
    x: "p * sin(5 * p) + 0.9 * cos(t)",
    y: "p * cos(3 * p) + 0.9 * sin(t)",
    description: "Complex gluon mesh mathematical simulation."
  },
  {
    id: "77",
    name: "Photon Trajectory",
    x: "sin(15 * p + t) + 0.5 * sin(4 * p + t*2)",
    y: "cos(6 * p + t) + 0.5 * cos(15 * p + t*2)",
    description: "Complex photon trajectory mathematical simulation."
  },
  {
    id: "78",
    name: "Strange Quark",
    x: "sin(13 * p + t) * exp(cos(5 * p))",
    y: "cos(4 * p + t) * exp(sin(5 * p))",
    description: "Complex strange quark mathematical simulation."
  },
  {
    id: "79",
    name: "Charm Quark",
    x: "p * sin(14 * p) + 1.4 * cos(t)",
    y: "p * cos(6 * p) + 1.4 * sin(t)",
    description: "Complex charm quark mathematical simulation."
  },
  {
    id: "80",
    name: "Top Quark",
    x: "sin(9 * p + t) + 0.5 * sin(5 * p + t*2)",
    y: "cos(1 * p + t) + 0.5 * cos(9 * p + t*2)",
    description: "Complex top quark mathematical simulation."
  },
  {
    id: "81",
    name: "Bottom Quark",
    x: "sin(1 * p + t) * exp(cos(4 * p))",
    y: "cos(6 * p + t) * exp(sin(4 * p))",
    description: "Complex bottom quark mathematical simulation."
  },
  {
    id: "82",
    name: "Up Quark",
    x: "p * sin(6 * p) + 0.8 * cos(t)",
    y: "p * cos(14 * p) + 0.8 * sin(t)",
    description: "Complex up quark mathematical simulation."
  },
  {
    id: "83",
    name: "Down Quark",
    x: "sin(14 * p + t) + 0.5 * sin(6 * p + t*2)",
    y: "cos(2 * p + t) + 0.5 * cos(14 * p + t*2)",
    description: "Complex down quark mathematical simulation."
  },
  {
    id: "84",
    name: "Antimatter Annihilation",
    x: "sin(1 * p + t) * exp(cos(6 * p))",
    y: "cos(15 * p + t) * exp(sin(6 * p))",
    description: "Complex antimatter annihilation mathematical simulation."
  },
  {
    id: "85",
    name: "Positron Spiral",
    x: "p * sin(7 * p) + 0.5 * cos(t)",
    y: "p * cos(13 * p) + 0.5 * sin(t)",
    description: "Complex positron spiral mathematical simulation."
  },
  {
    id: "86",
    name: "Muon Decay",
    x: "sin(14 * p + t) + 0.5 * sin(11 * p + t*2)",
    y: "cos(4 * p + t) + 0.5 * cos(14 * p + t*2)",
    description: "Complex muon decay mathematical simulation."
  },
  {
    id: "87",
    name: "Tau Lepton",
    x: "sin(5 * p + t) * exp(cos(6 * p))",
    y: "cos(2 * p + t) * exp(sin(6 * p))",
    description: "Complex tau lepton mathematical simulation."
  },
  {
    id: "88",
    name: "Pion Exchange",
    x: "p * sin(13 * p) + 0.8 * cos(t)",
    y: "p * cos(12 * p) + 0.8 * sin(t)",
    description: "Complex pion exchange mathematical simulation."
  },
  {
    id: "89",
    name: "Kaon Oscillation",
    x: "sin(8 * p + t) + 0.5 * sin(13 * p + t*2)",
    y: "cos(2 * p + t) + 0.5 * cos(8 * p + t*2)",
    description: "Complex kaon oscillation mathematical simulation."
  },
  {
    id: "90",
    name: "J/psi Meson",
    x: "sin(7 * p + t) * exp(cos(5 * p))",
    y: "cos(15 * p + t) * exp(sin(5 * p))",
    description: "Complex j/psi meson mathematical simulation."
  },
  {
    id: "91",
    name: "Upsilon Particle",
    x: "p * sin(5 * p) + 1.6 * cos(t)",
    y: "p * cos(15 * p) + 1.6 * sin(t)",
    description: "Complex upsilon particle mathematical simulation."
  },
  {
    id: "92",
    name: "W Boson Interaction",
    x: "sin(9 * p + t) + 0.5 * sin(3 * p + t*2)",
    y: "cos(5 * p + t) + 0.5 * cos(9 * p + t*2)",
    description: "Complex w boson interaction mathematical simulation."
  },
  {
    id: "93",
    name: "Z Boson Decay",
    x: "sin(5 * p + t) * exp(cos(3 * p))",
    y: "cos(7 * p + t) * exp(sin(3 * p))",
    description: "Complex z boson decay mathematical simulation."
  },
  {
    id: "94",
    name: "Sterile Neutrino",
    x: "p * sin(11 * p) + 0.5 * cos(t)",
    y: "p * cos(11 * p) + 0.5 * sin(t)",
    description: "Complex sterile neutrino mathematical simulation."
  },
  {
    id: "95",
    name: "Dark Matter Web",
    x: "sin(6 * p + t) + 0.5 * sin(15 * p + t*2)",
    y: "cos(4 * p + t) + 0.5 * cos(6 * p + t*2)",
    description: "Complex dark matter web mathematical simulation."
  },
  {
    id: "96",
    name: "Axion Field",
    x: "sin(11 * p + t) * exp(cos(5 * p))",
    y: "cos(6 * p + t) * exp(sin(5 * p))",
    description: "Complex axion field mathematical simulation."
  },
  {
    id: "97",
    name: "WIMP Collision",
    x: "p * sin(4 * p) + 1.6 * cos(t)",
    y: "p * cos(15 * p) + 1.6 * sin(t)",
    description: "Complex wimp collision mathematical simulation."
  },
  {
    id: "98",
    name: "MACHO Orbit",
    x: "sin(5 * p + t) + 0.5 * sin(11 * p + t*2)",
    y: "cos(7 * p + t) + 0.5 * cos(5 * p + t*2)",
    description: "Complex machos orbit mathematical simulation."
  },
  {
    id: "99",
    name: "Monopole Defect",
    x: "sin(14 * p + t) * exp(cos(4 * p))",
    y: "cos(12 * p + t) * exp(sin(4 * p))",
    description: "Complex monopole defect mathematical simulation."
  },
  {
    id: "100",
    name: "Cosmic String",
    x: "p * sin(14 * p) + 0.1 * cos(t)",
    y: "p * cos(6 * p) + 0.1 * sin(t)",
    description: "Complex cosmic string mathematical simulation."
  },
  ...createOrganicFormulaVariations(101, 100)
];

const ORGANIC_FLOW_FORMULAS: Formula[] = [
  {
    id: "organic-root-ring-01",
    name: "Polynomial Root Smoke Ring",
    category: "Organic root and PDE fields",
    x: "(2.15 + 0.42 * sin(6 * p + 0.7 * sin(t + p)) + 0.18 * sin(13 * p - t * 0.6)) * cos(p + 0.24 * sin(5 * p - t) + 0.12 * sin(11 * p + t * 0.4))",
    y: "(2.15 + 0.42 * sin(6 * p + 0.7 * sin(t + p)) + 0.18 * sin(13 * p - t * 0.6)) * sin(p + 0.24 * sin(5 * p - t) + 0.12 * sin(11 * p + t * 0.4))",
    z: "0.9 * sin(6 * p - t) + 0.32 * sin(13 * p + t * 0.6)",
    geometryMode: "tube",
    description: "A time-varying root-locus ring with smoky orbital curls and uneven polynomial lobes."
  },
  {
    id: "organic-pde-02",
    name: "Reaction Diffusion Medallion",
    category: "Organic root and PDE fields",
    x: "(1.35 + 0.05 * p + 0.34 * sin(8 * p + t + 0.55 * sin(3 * p - t))) * cos(p)",
    y: "(1.35 + 0.05 * p + 0.34 * cos(7 * p - t + 0.45 * sin(4 * p + t))) * sin(p)",
    z: "0.72 * sin(9 * p + 1.1 * sin(2 * p - t)) + 0.28 * cos(15 * p - t * 0.7)",
    geometryMode: "surface",
    description: "PDE-like stripe competition folded into a radial medallion that slowly crawls."
  },
  {
    id: "organic-fingering-03",
    name: "Viscous Fingering Halo",
    category: "Organic root and PDE fields",
    x: "(2.0 + 0.65 * abs(sin(3 * p + t)) + 0.25 * sin(17 * p - t)) * cos(p + 0.2 * sin(9 * p + t))",
    y: "(2.0 + 0.65 * abs(cos(4 * p - t)) + 0.25 * cos(15 * p + t * 0.7)) * sin(p + 0.2 * cos(8 * p - t))",
    z: "1.2 * sin(5 * p + 0.8 * sin(7 * p - t))",
    geometryMode: "extrude",
    description: "A radial instability model with swelling fingers, pinched gaps, and capillary motion."
  },
  {
    id: "organic-capillary-04",
    name: "Capillary Wave Medallion",
    category: "Organic root and PDE fields",
    x: "(1.7 + 0.32 * sin(16 * p - t) + 0.18 * cos(5 * p + t)) * cos(p + 0.16 * sin(10 * p + t))",
    y: "(1.7 + 0.32 * cos(14 * p + t * 0.8) + 0.18 * sin(6 * p - t)) * sin(p + 0.16 * cos(9 * p - t))",
    z: "0.7 * sin(8 * p + t) + 0.35 * sin(21 * p - t * 0.4)",
    geometryMode: "lathe",
    description: "Nested capillary waves become a soft, vibrating annular relief."
  },
  {
    id: "organic-blue-05",
    name: "Liminal Blue Corridor Field",
    category: "Organic root and PDE fields",
    x: "p * 0.16 * cos(2 * p + 0.35 * sin(t + p))",
    y: "1.8 * sin(p + 0.5 * sin(4 * p - t)) + 0.35 * sin(9 * p + t)",
    z: "1.1 * cos(3 * p - t) + 0.55 * sin(6 * p + t * 0.35)",
    geometryMode: "surface",
    description: "A mirrored corridor field with slow blue-shader-friendly ridges and deep central voids."
  },
  {
    id: "organic-coral-06",
    name: "Turing Coral Rosette",
    category: "Organic root and PDE fields",
    x: "(1.45 + 0.4 * sin(12 * p + t * 0.5) * sin(5 * p - t)) * cos(p) + 0.22 * cos(23 * p + t)",
    y: "(1.45 + 0.4 * cos(11 * p - t * 0.4) * sin(4 * p + t)) * sin(p) + 0.22 * sin(19 * p - t)",
    z: "0.5 * sin(18 * p + t) + 0.8 * cos(4 * p - t)",
    geometryMode: "crystal",
    description: "A coral-growth rosette driven by competing Turing-scale oscillators."
  },
  {
    id: "organic-colony-07",
    name: "Root Colony Quadrants",
    category: "Organic root and PDE fields",
    x: "sign(cos(p)) * (1.25 + 0.35 * abs(sin(5 * p + t))) + 0.45 * cos(10 * p + t)",
    y: "sign(sin(p)) * (1.25 + 0.35 * abs(cos(4 * p - t))) + 0.45 * sin(9 * p - t)",
    z: "0.8 * sin(6 * p + t) * (0.65 + 0.35 * cos(12 * p))",
    geometryMode: "extrude",
    description: "Four root colonies face inward like paired PDE glyphs with synchronized curling edges."
  },
  {
    id: "organic-petal-08",
    name: "Polynomial Petal Field",
    category: "Organic root and PDE fields",
    x: "cos(4 * p + 0.4 * sin(t)) * (1.4 + 0.5 * cos(p + t) + 0.2 * sin(14 * p))",
    y: "sin(3 * p - 0.4 * cos(t)) * (1.4 + 0.5 * sin(p - t) + 0.2 * cos(13 * p))",
    z: "sin(7 * p + t + 0.4 * sin(5 * p))",
    geometryMode: "ribbon",
    description: "Polynomial-root petals cross through each other with soft, organic phase drift."
  }
];

const SELF_MODIFYING_FORMULAS: Formula[] = [
  {
    id: "self-param-01",
    name: "Param Fractal: Breathing Mandel Power",
    category: "Parameter-evolving fractals",
    x: "cos((2 + 0.35 * sin(t + 0.13 * p)) * p) * (1.2 + 0.45 * cos((3 + 0.2 * sin(t)) * p))",
    y: "sin((2 + 0.35 * sin(t + 0.13 * p)) * p) * (1.2 + 0.45 * sin((4 + 0.2 * cos(t)) * p))",
    z: "sin((4 + 0.4 * sin(t + p * 0.11)) * p + t) * (0.8 + 0.3 * cos(p))",
    geometryMode: "ribbon",
    description: "A Mandelbrot-style power term breathes as the exponent drifts across p and time."
  },
  {
    id: "self-param-02",
    name: "Param Fractal: Adaptive Julia Drift",
    category: "Parameter-evolving fractals",
    x: "(1 + 0.3 * sin(t + p * 0.2)) * cos(p + 0.55 * sin((2 + 0.4 * sin(t)) * p))",
    y: "(1 + 0.3 * cos(t + p * 0.17)) * sin(p + 0.55 * cos((3 + 0.3 * cos(t)) * p))",
    z: "sin((2.5 + 0.5 * sin(t + p)) * p) * cos(p * 0.5 + t)",
    geometryMode: "tube",
    description: "A Julia-orbit curve whose constant and angular feedback drift every frame."
  },
  {
    id: "self-param-03",
    name: "Param Fractal: Evolving Phoenix Spiral",
    category: "Parameter-evolving fractals",
    x: "exp(0.12 * cos((2 + 0.25 * sin(t)) * p)) * cos((1.6 + 0.25 * sin(t + p * 0.08)) * p)",
    y: "exp(0.12 * sin((2 + 0.25 * cos(t)) * p)) * sin((1.9 + 0.25 * cos(t + p * 0.08)) * p)",
    z: "sin(p * (3 + 0.35 * cos(t + p * 0.2)) + t) * 1.2",
    geometryMode: "crystal",
    description: "A phoenix-style feedback spiral with an evolving gain and frequency pair."
  },
  {
    id: "self-param-04",
    name: "Param Fractal: Lambda Pulse Orbit",
    category: "Parameter-evolving fractals",
    x: "(1 + 0.5 * sin((1 + 0.2 * sin(t)) * p)) * cos(p * (2 + 0.3 * sin(t + p * 0.15)))",
    y: "(1 + 0.5 * cos((1 + 0.2 * cos(t)) * p)) * sin(p * (2 + 0.3 * cos(t + p * 0.15)))",
    z: "0.9 * sin((5 + 0.4 * sin(t)) * p + 0.3 * sin(p * p * 0.03))",
    geometryMode: "lathe",
    description: "A lambda parameter pulses the orbit between compact and stretched lobes."
  },
  {
    id: "self-param-05",
    name: "Param Fractal: Power Cascade Bloom",
    category: "Parameter-evolving fractals",
    x: "cos(p)^3 * (2 + 0.4 * sin(t + p)) + 0.7 * cos((5 + 0.5 * sin(t)) * p)",
    y: "sin(p)^3 * (2 + 0.4 * cos(t + p)) + 0.7 * sin((6 + 0.5 * cos(t)) * p)",
    z: "sin((3 + 0.7 * sin(t + p * 0.12)) * p) * (1 + 0.25 * cos(4 * p))",
    geometryMode: "extrude",
    description: "The cascade shifts the power-lobe frequency while keeping a stable core curve."
  },
  {
    id: "self-param-06",
    name: "Param Fractal: Parameter Tide Lattice",
    category: "Parameter-evolving fractals",
    x: "sin((3 + 0.5 * sin(t + p * 0.1)) * p) + 0.4 * sin((8 + 0.6 * cos(t)) * p)",
    y: "cos((4 + 0.5 * cos(t + p * 0.1)) * p) + 0.4 * cos((7 + 0.6 * sin(t)) * p)",
    z: "sin(p * (2 + 0.4 * sin(t + p * 0.2))) * cos(p * 0.5 - t)",
    geometryMode: "surface",
    description: "Nested frequencies act like evolving fractal parameters across a tidal lattice."
  },
  {
    id: "self-param-07",
    name: "Param Fractal: Mutable Logistic Ring",
    category: "Parameter-evolving fractals",
    x: "(1 + 0.35 * sin(p * (2.6 + 0.4 * sin(t)))) * cos(p + 0.4 * sin(t + p * p * 0.02))",
    y: "(1 + 0.35 * cos(p * (2.9 + 0.4 * cos(t)))) * sin(p + 0.4 * cos(t + p * p * 0.02))",
    z: "1.1 * sin((1 + 0.35 * sin(t)) * p + sin(3 * p))",
    geometryMode: "tube",
    description: "A logistic-map-inspired ring with a time-evolving growth parameter."
  },
  {
    id: "self-param-08",
    name: "Param Fractal: Sinusoidal Degree Knot",
    category: "Parameter-evolving fractals",
    x: "sign(cos(p)) * abs(cos(p))^(1 + 0.35 * sin(t + p * 0.09)) * (2 + 0.35 * sin(5 * p + t))",
    y: "sign(sin(p)) * abs(sin(p))^(1 + 0.35 * cos(t + p * 0.08)) * (2 + 0.35 * cos(4 * p - t))",
    z: "sin((2 + 0.5 * sin(t + p * 0.07)) * p) * 1.4",
    geometryMode: "crystal",
    description: "The apparent exponent mutates smoothly, tightening and loosening the knot."
  },
  {
    id: "self-param-09",
    name: "Param Fractal: Orbit Trap Breather",
    category: "Parameter-evolving fractals",
    x: "cos(p + 0.5 * sin((2 + 0.4 * sin(t + p * 0.1)) * p)) * (1 + 0.6 / (1 + abs(sin(3 * p + t))))",
    y: "sin(p + 0.5 * cos((2 + 0.4 * cos(t + p * 0.1)) * p)) * (1 + 0.6 / (1 + abs(cos(4 * p - t))))",
    z: "sin((6 + 0.5 * sin(t)) * p) / (1 + 0.3 * abs(sin(p + t)))",
    geometryMode: "ribbon",
    description: "Orbit-trap distance terms breathe by changing their internal harmonic parameters."
  },
  {
    id: "self-param-10",
    name: "Param Fractal: Drifted Newton Petal",
    category: "Parameter-evolving fractals",
    x: "cos((3 + 0.4 * sin(t + p * 0.1)) * p) / (1 + 0.35 * abs(sin(p * (2 + 0.2 * cos(t)))))",
    y: "sin((3 + 0.4 * cos(t + p * 0.1)) * p) / (1 + 0.35 * abs(cos(p * (2 + 0.2 * sin(t)))))",
    z: "1.2 * sin(p + t) * cos((5 + 0.3 * sin(t)) * p)",
    geometryMode: "lathe",
    description: "Newton-petal denominators drift so the basin-like folds keep rebalancing."
  },
  {
    id: "self-coord-01",
    name: "Coordinate Hybrid: Split Power Plane",
    category: "Coordinate-dependent formulas",
    x: "cos(p) > 0 ? cos(2 * p + t) * (1.6 + 0.3 * sin(5 * p)) : cos(3 * p - t) * (1.2 + 0.5 * cos(4 * p))",
    y: "cos(p) > 0 ? sin(2 * p + t) * (1.6 + 0.3 * cos(5 * p)) : sin(3 * p - t) * (1.2 + 0.5 * sin(4 * p))",
    z: "cos(p) > 0 ? sin(6 * p + t) : cos(5 * p - t)",
    geometryMode: "ribbon",
    description: "Right-side samples use a quadratic orbit; left-side samples switch to cubic motion."
  },
  {
    id: "self-coord-02",
    name: "Coordinate Hybrid: Quadrant Rule Mesh",
    category: "Coordinate-dependent formulas",
    x: "sin(p) > 0 ? (cos(p) > 0 ? cos(4 * p + t) : 0.8 * cos(2 * p - t)) : (cos(p) > 0 ? 1.3 * cos(3 * p + t) : 0.9 * cos(5 * p - t))",
    y: "sin(p) > 0 ? (cos(p) > 0 ? sin(4 * p + t) : 1.2 * sin(2 * p - t)) : (cos(p) > 0 ? 0.7 * sin(3 * p + t) : 1.4 * sin(5 * p - t))",
    z: "sin(p) > 0 ? sin(3 * p + t) : -cos(4 * p - t)",
    geometryMode: "surface",
    description: "Each quadrant of the parametric plane receives a different harmonic rule."
  },
  {
    id: "self-coord-03",
    name: "Coordinate Hybrid: Radial Gate Weave",
    category: "Coordinate-dependent formulas",
    x: "abs(sin(2 * p)) > 0.55 ? cos(6 * p + t) * (1 + 0.3 * sin(p)) : cos(p + t) * (2 + 0.2 * cos(7 * p))",
    y: "abs(sin(2 * p)) > 0.55 ? sin(5 * p - t) * (1 + 0.3 * cos(p)) : sin(p + t) * (2 + 0.2 * sin(7 * p))",
    z: "abs(sin(2 * p)) > 0.55 ? 0.8 * sin(9 * p) : 1.1 * cos(3 * p + t)",
    geometryMode: "crystal",
    description: "Radial bands alternate between tight weave and open orbit equations."
  },
  {
    id: "self-coord-04",
    name: "Coordinate Hybrid: Checkerboard Orbit",
    category: "Coordinate-dependent formulas",
    x: "mod(floor(p * 1.2), 2) < 1 ? cos(p + t) * (1.8 + 0.4 * sin(3 * p)) : sin(2 * p - t) * (1.4 + 0.3 * cos(5 * p))",
    y: "mod(floor(p * 1.2), 2) < 1 ? sin(p + t) * (1.8 + 0.4 * cos(3 * p)) : cos(2 * p - t) * (1.4 + 0.3 * sin(5 * p))",
    z: "mod(floor(p * 1.2), 2) < 1 ? sin(4 * p + t) : -sin(6 * p - t)",
    geometryMode: "tube",
    description: "A coordinate checkerboard swaps formulas across alternating sample cells."
  },
  {
    id: "self-coord-05",
    name: "Coordinate Hybrid: Polar Hemisphere Fold",
    category: "Coordinate-dependent formulas",
    x: "sin(p + t * 0.2) > 0 ? cos(2 * p) * (1 + abs(sin(5 * p))) : cos(p)^3 * 2.4",
    y: "sin(p + t * 0.2) > 0 ? sin(3 * p) * (1 + abs(cos(4 * p))) : sin(p)^3 * 2.4",
    z: "sin(p + t * 0.2) > 0 ? sin(7 * p + t) : cos(5 * p - t)",
    geometryMode: "extrude",
    description: "The active formula folds over the moving polar hemisphere boundary."
  },
  {
    id: "self-coord-06",
    name: "Coordinate Hybrid: Diagonal Switchback",
    category: "Coordinate-dependent formulas",
    x: "sin(p) + cos(p) > 0 ? p * 0.12 * cos(4 * p + t) : 1.8 * cos(p - t) + 0.35 * cos(8 * p)",
    y: "sin(p) + cos(p) > 0 ? p * 0.12 * sin(3 * p - t) : 1.8 * sin(p - t) - 0.35 * sin(8 * p)",
    z: "sin(p) + cos(p) > 0 ? sin(p * 0.7 + t) : sin(5 * p - t) * 0.9",
    geometryMode: "surface",
    description: "The diagonal boundary switches between spiral growth and bounded loop rules."
  },
  {
    id: "self-coord-07",
    name: "Coordinate Hybrid: Annular Power Slices",
    category: "Coordinate-dependent formulas",
    x: "mod(floor(abs(sin(p)) * 5), 2) < 1 ? sign(cos(p)) * abs(cos(p))^1.5 * 2.2 : cos(4 * p + t) * 1.4",
    y: "mod(floor(abs(sin(p)) * 5), 2) < 1 ? sign(sin(p)) * abs(sin(p))^1.5 * 2.2 : sin(5 * p - t) * 1.4",
    z: "mod(floor(abs(sin(p)) * 5), 2) < 1 ? cos(6 * p + t) : sin(2 * p - t)",
    geometryMode: "lathe",
    description: "Annular coordinate slices toggle between powered lobes and fast oscillators."
  },
  {
    id: "self-coord-08",
    name: "Coordinate Hybrid: Sector Resonance Fan",
    category: "Coordinate-dependent formulas",
    x: "mod(floor((p + t * 0.3) / 1.0472), 3) < 1 ? cos(7 * p) * 1.1 : cos(2 * p + t) * (1.5 + 0.3 * sin(p))",
    y: "mod(floor((p + t * 0.3) / 1.0472), 3) < 1 ? sin(4 * p) * 1.1 : sin(2 * p + t) * (1.5 + 0.3 * cos(p))",
    z: "mod(floor((p + t * 0.3) / 1.0472), 3) < 1 ? sin(8 * p + t) : cos(3 * p - t)",
    geometryMode: "crystal",
    description: "Rotating angular sectors decide which resonance equation is active."
  },
  {
    id: "self-coord-09",
    name: "Coordinate Hybrid: Mirror Loom",
    category: "Coordinate-dependent formulas",
    x: "cos(p * 0.5) > 0 ? cos(3 * p + t) + 0.4 * sin(9 * p) : -cos(5 * p - t) + 0.4 * sin(2 * p)",
    y: "cos(p * 0.5) > 0 ? sin(2 * p + t) + 0.4 * cos(7 * p) : -sin(4 * p - t) + 0.4 * cos(3 * p)",
    z: "cos(p * 0.5) > 0 ? sin(p + t) : -sin(p - t)",
    geometryMode: "ribbon",
    description: "Mirrored coordinate halves weave two asymmetric formula families together."
  },
  {
    id: "self-coord-10",
    name: "Coordinate Hybrid: Boundary Inversion Map",
    category: "Coordinate-dependent formulas",
    x: "abs(cos(p)) > abs(sin(p)) ? cos(2 * p + t) / (0.6 + abs(sin(3 * p))) : sin(3 * p - t) * (1.4 + 0.2 * cos(5 * p))",
    y: "abs(cos(p)) > abs(sin(p)) ? sin(2 * p + t) / (0.6 + abs(cos(3 * p))) : cos(3 * p - t) * (1.4 + 0.2 * sin(5 * p))",
    z: "abs(cos(p)) > abs(sin(p)) ? cos(4 * p + t) : sin(6 * p - t)",
    geometryMode: "tube",
    description: "A boundary test inverts the orbit near dominant x-coordinates and expands elsewhere."
  },
  {
    id: "self-state-01",
    name: "State Switch: Orbit Radius Gate",
    category: "State-dependent rule switching",
    x: "abs(sin(3 * p + t) + 0.4 * cos(5 * p - t)) < 0.8 ? cos(2 * p + t) * 1.8 : cos(p - t) / (0.45 + abs(sin(4 * p)))",
    y: "abs(sin(3 * p + t) + 0.4 * cos(5 * p - t)) < 0.8 ? sin(2 * p + t) * 1.8 : sin(p - t) / (0.45 + abs(cos(4 * p)))",
    z: "abs(sin(3 * p + t) + 0.4 * cos(5 * p - t)) < 0.8 ? sin(5 * p) : cos(3 * p + t)",
    geometryMode: "crystal",
    description: "Low-radius states follow a quadratic loop; high-radius states invert into reciprocal motion."
  },
  {
    id: "self-state-02",
    name: "State Switch: Escape Inversion",
    category: "State-dependent rule switching",
    x: "abs(sin(2 * p + t)) + abs(cos(3 * p - t)) < 1.25 ? cos(4 * p + t) * (1 + 0.2 * sin(p)) : cos(p) / (0.35 + abs(sin(p + t)))",
    y: "abs(sin(2 * p + t)) + abs(cos(3 * p - t)) < 1.25 ? sin(4 * p + t) * (1 + 0.2 * cos(p)) : sin(p) / (0.35 + abs(cos(p - t)))",
    z: "abs(sin(2 * p + t)) + abs(cos(3 * p - t)) < 1.25 ? sin(7 * p - t) : -cos(5 * p + t)",
    geometryMode: "lathe",
    description: "The orbit watches its own escape energy and switches into inversion outside the gate."
  },
  {
    id: "self-state-03",
    name: "State Switch: Velocity Rule Switch",
    category: "State-dependent rule switching",
    x: "abs(cos(3 * p + t) - sin(2 * p)) < 0.7 ? p * 0.1 * cos(5 * p) : 1.6 * cos(p + 0.6 * sin(4 * p + t))",
    y: "abs(cos(3 * p + t) - sin(2 * p)) < 0.7 ? p * 0.1 * sin(4 * p) : 1.6 * sin(p + 0.6 * cos(3 * p - t))",
    z: "abs(cos(3 * p + t) - sin(2 * p)) < 0.7 ? sin(p + t) : cos(8 * p - t) * 0.8",
    geometryMode: "surface",
    description: "A velocity-like state estimate decides between spiral growth and bounded phase warping."
  },
  {
    id: "self-state-04",
    name: "State Switch: Phase Lock Toggle",
    category: "State-dependent rule switching",
    x: "abs(sin(p + t)) < abs(cos(2 * p - t)) ? cos(3 * p + t) * 1.7 : cos(p - t) * (1 + 0.5 * sin(6 * p))",
    y: "abs(sin(p + t)) < abs(cos(2 * p - t)) ? sin(3 * p + t) * 1.7 : sin(p - t) * (1 + 0.5 * cos(6 * p))",
    z: "abs(sin(p + t)) < abs(cos(2 * p - t)) ? sin(4 * p) : cos(5 * p + t)",
    geometryMode: "tube",
    description: "The formula flips when the local phase loses lock against the secondary oscillator."
  },
  {
    id: "self-state-05",
    name: "State Switch: Energy Well Rules",
    category: "State-dependent rule switching",
    x: "sin(p)^2 + cos(3 * p + t)^2 < 1.1 ? cos(5 * p + t) * 1.2 : sign(cos(p)) * abs(cos(p))^0.55 * 2.1",
    y: "sin(p)^2 + cos(3 * p + t)^2 < 1.1 ? sin(4 * p - t) * 1.2 : sign(sin(p)) * abs(sin(p))^0.55 * 2.1",
    z: "sin(p)^2 + cos(3 * p + t)^2 < 1.1 ? sin(9 * p) * 0.8 : cos(2 * p + t) * 1.1",
    geometryMode: "extrude",
    description: "A local energy well chooses between fine orbit filaments and broad powered lobes."
  },
  {
    id: "self-state-06",
    name: "State Switch: Trap Then Reciprocal",
    category: "State-dependent rule switching",
    x: "abs(sin(2 * p + t)) < 0.35 ? cos(7 * p) * 1.1 : cos(p + t) / (0.4 + abs(sin(5 * p)))",
    y: "abs(sin(2 * p + t)) < 0.35 ? sin(6 * p) * 1.1 : sin(p - t) / (0.4 + abs(cos(5 * p)))",
    z: "abs(sin(2 * p + t)) < 0.35 ? cos(3 * p + t) : sin(4 * p - t)",
    geometryMode: "ribbon",
    description: "Trap states get a tight oscillator; everything else is pulled through reciprocal curvature."
  },
  {
    id: "self-state-07",
    name: "State Switch: Momentum Fold State",
    category: "State-dependent rule switching",
    x: "sin(p + t) * cos(2 * p - t) > 0 ? cos(2 * p + t) * (1.5 + 0.2 * sin(8 * p)) : -sin(3 * p - t) * (1.2 + 0.3 * cos(5 * p))",
    y: "sin(p + t) * cos(2 * p - t) > 0 ? sin(2 * p + t) * (1.5 + 0.2 * cos(8 * p)) : cos(3 * p - t) * (1.2 + 0.3 * sin(5 * p))",
    z: "sin(p + t) * cos(2 * p - t) > 0 ? sin(6 * p) : -cos(4 * p + t)",
    geometryMode: "crystal",
    description: "A momentum sign estimate folds the rule set between attractor and reflector modes."
  },
  {
    id: "self-state-08",
    name: "State Switch: Attractor Repeller",
    category: "State-dependent rule switching",
    x: "abs(sin(p) + sin(4 * p + t)) < 0.8 ? cos(p) * (2 + 0.4 * sin(5 * p + t)) : -cos(3 * p - t) * 1.3",
    y: "abs(sin(p) + sin(4 * p + t)) < 0.8 ? sin(p) * (2 + 0.4 * cos(5 * p + t)) : -sin(3 * p - t) * 1.3",
    z: "abs(sin(p) + sin(4 * p + t)) < 0.8 ? sin(7 * p - t) : cos(2 * p + t)",
    geometryMode: "lathe",
    description: "The orbit self-classifies into attractor and repeller states from its harmonic sum."
  },
  {
    id: "self-state-09",
    name: "State Switch: Threshold Julia Bloom",
    category: "State-dependent rule switching",
    x: "abs(sin(2 * p + t)) + abs(cos(3 * p)) < 1.2 ? cos(6 * p + t) * 1.1 : cos(p + 0.5 * sin(2 * p)) * 2.0",
    y: "abs(sin(2 * p + t)) + abs(cos(3 * p)) < 1.2 ? sin(5 * p - t) * 1.1 : sin(p + 0.5 * cos(2 * p)) * 2.0",
    z: "abs(sin(2 * p + t)) + abs(cos(3 * p)) < 1.2 ? sin(8 * p) : cos(4 * p - t)",
    geometryMode: "tube",
    description: "A Julia-like threshold blossoms into a larger rule when the local state crosses escape."
  },
  {
    id: "self-state-10",
    name: "State Switch: Hysteresis Ribbon",
    category: "State-dependent rule switching",
    x: "mod(floor((abs(sin(p + t)) + abs(cos(2 * p))) * 3), 2) < 1 ? cos(3 * p + t) * 1.5 : cos(p - t) * (1.8 + 0.3 * sin(4 * p))",
    y: "mod(floor((abs(sin(p + t)) + abs(cos(2 * p))) * 3), 2) < 1 ? sin(4 * p - t) * 1.5 : sin(p - t) * (1.8 + 0.3 * cos(4 * p))",
    z: "mod(floor((abs(sin(p + t)) + abs(cos(2 * p))) * 3), 2) < 1 ? sin(5 * p) : -sin(7 * p + t)",
    geometryMode: "ribbon",
    description: "A banded internal state approximates hysteresis by switching on accumulated amplitude."
  },
  {
    id: "self-mutation-01",
    name: "Formula Mutation: Exponent Roulette",
    category: "Formula mutation meta-fractals",
    x: "mod(floor(p * 0.8 + t), 3) < 1 ? sign(cos(p)) * abs(cos(p))^1.2 * 2 : (mod(floor(p * 0.8 + t), 3) < 2 ? cos(p)^3 * 2.4 : cos(5 * p + t) * 1.3)",
    y: "mod(floor(p * 0.8 + t), 3) < 1 ? sign(sin(p)) * abs(sin(p))^1.2 * 2 : (mod(floor(p * 0.8 + t), 3) < 2 ? sin(p)^3 * 2.4 : sin(4 * p - t) * 1.3)",
    z: "mod(floor(p * 0.8 + t), 3) < 1 ? sin(3 * p) : (mod(floor(p * 0.8 + t), 3) < 2 ? cos(6 * p + t) : sin(8 * p - t))",
    geometryMode: "crystal",
    description: "The formula mutates its exponent and active oscillator in deterministic roulette bands."
  },
  {
    id: "self-mutation-02",
    name: "Formula Mutation: Operation Swap Spiral",
    category: "Formula mutation meta-fractals",
    x: "mod(floor(p * 0.6 + t * 1.2), 3) < 1 ? cos(p) + 0.5 * cos(6 * p + t) : (mod(floor(p * 0.6 + t * 1.2), 3) < 2 ? cos(p) * (1.4 + 0.5 * sin(5 * p)) : cos(p) / (0.5 + abs(sin(4 * p))))",
    y: "mod(floor(p * 0.6 + t * 1.2), 3) < 1 ? sin(p) + 0.5 * sin(5 * p - t) : (mod(floor(p * 0.6 + t * 1.2), 3) < 2 ? sin(p) * (1.4 + 0.5 * cos(5 * p)) : sin(p) / (0.5 + abs(cos(4 * p))))",
    z: "mod(floor(p * 0.6 + t * 1.2), 3) < 1 ? sin(3 * p + t) : (mod(floor(p * 0.6 + t * 1.2), 3) < 2 ? cos(4 * p - t) : sin(7 * p))",
    geometryMode: "tube",
    description: "Addition, multiplication, and reciprocal operations swap as the mutation phase advances."
  },
  {
    id: "self-mutation-03",
    name: "Formula Mutation: Hash Noise Bloom",
    category: "Formula mutation meta-fractals",
    x: "cos(p + 0.45 * sin(floor(p * 5 + t * 3) * 12.9898)) * (1.5 + 0.35 * sin(4 * p + t))",
    y: "sin(p + 0.45 * sin(floor(p * 5 + t * 3) * 78.233)) * (1.5 + 0.35 * cos(3 * p - t))",
    z: "sin(6 * p + t + 0.6 * sin(floor(p * 4 + t * 2) * 37.719))",
    geometryMode: "surface",
    description: "Deterministic hash-like perturbations inject mutation noise without unstable randomness."
  },
  {
    id: "self-mutation-04",
    name: "Formula Mutation: Blend Matrix",
    category: "Formula mutation meta-fractals",
    x: "(0.5 + 0.5 * sin(floor(p * 0.7 + t) * 1.7)) * cos(2 * p + t) + (0.5 - 0.5 * sin(floor(p * 0.7 + t) * 1.7)) * cos(5 * p - t)",
    y: "(0.5 + 0.5 * sin(floor(p * 0.7 + t) * 1.7)) * sin(3 * p - t) + (0.5 - 0.5 * sin(floor(p * 0.7 + t) * 1.7)) * sin(p + t)",
    z: "(0.5 + 0.5 * sin(floor(p * 0.7 + t) * 1.7)) * sin(4 * p) + (0.5 - 0.5 * sin(floor(p * 0.7 + t) * 1.7)) * cos(6 * p + t)",
    geometryMode: "ribbon",
    description: "A mutation matrix blends between two formula families by stepping its weights."
  },
  {
    id: "self-mutation-05",
    name: "Formula Mutation: Trig Operator Mutator",
    category: "Formula mutation meta-fractals",
    x: "mod(floor(p + t * 0.8), 3) < 1 ? sin(3 * p + t) * 1.6 : (mod(floor(p + t * 0.8), 3) < 2 ? cos(4 * p - t) * 1.4 : tan(sin(2 * p + t)) * 1.2)",
    y: "mod(floor(p + t * 0.8), 3) < 1 ? cos(2 * p + t) * 1.6 : (mod(floor(p + t * 0.8), 3) < 2 ? sin(5 * p - t) * 1.4 : tan(cos(3 * p - t)) * 1.2)",
    z: "mod(floor(p + t * 0.8), 3) < 1 ? sin(5 * p) : (mod(floor(p + t * 0.8), 3) < 2 ? cos(7 * p + t) : sin(2 * p - t) * cos(3 * p))",
    geometryMode: "lathe",
    description: "The operator mutates across sin, cos, and bounded tan-based transforms."
  },
  {
    id: "self-mutation-06",
    name: "Formula Mutation: Reciprocal Gene Knot",
    category: "Formula mutation meta-fractals",
    x: "mod(floor(p * 1.1 - t), 4) < 2 ? cos(p) * (2 + 0.25 * sin(6 * p)) : cos(3 * p + t) / (0.45 + abs(sin(p)))",
    y: "mod(floor(p * 1.1 - t), 4) < 2 ? sin(p) * (2 + 0.25 * cos(6 * p)) : sin(2 * p - t) / (0.45 + abs(cos(p)))",
    z: "mod(floor(p * 1.1 - t), 4) < 2 ? sin(4 * p + t) : -cos(5 * p - t)",
    geometryMode: "extrude",
    description: "Mutation genes alternate ordinary lobes with reciprocal orbit fragments."
  },
  {
    id: "self-mutation-07",
    name: "Formula Mutation: Time-Coded Gene Chain",
    category: "Formula mutation meta-fractals",
    x: "mod(floor(t * 1.5), 4) < 1 ? cos(2 * p) * 1.7 : (mod(floor(t * 1.5), 4) < 2 ? sin(3 * p + t) * 1.5 : (mod(floor(t * 1.5), 4) < 3 ? cos(p) * (2 + 0.4 * sin(5 * p)) : p * 0.08 * cos(4 * p)))",
    y: "mod(floor(t * 1.5), 4) < 1 ? sin(2 * p) * 1.7 : (mod(floor(t * 1.5), 4) < 2 ? cos(3 * p - t) * 1.5 : (mod(floor(t * 1.5), 4) < 3 ? sin(p) * (2 + 0.4 * cos(5 * p)) : p * 0.08 * sin(4 * p)))",
    z: "mod(floor(t * 1.5), 4) < 1 ? sin(6 * p) : (mod(floor(t * 1.5), 4) < 2 ? cos(5 * p + t) : (mod(floor(t * 1.5), 4) < 3 ? sin(p + t) : cos(3 * p - t)))",
    geometryMode: "surface",
    description: "Whole formulas mutate by time-coded genes, making the preset visibly change modes."
  },
  {
    id: "self-mutation-08",
    name: "Formula Mutation: Opcode Walker",
    category: "Formula mutation meta-fractals",
    x: "mod(floor(p * 0.9 + t * 0.5), 3) < 1 ? cos(p + sin(4 * p)) * 1.8 : (mod(floor(p * 0.9 + t * 0.5), 3) < 2 ? abs(cos(3 * p + t)) * sign(cos(p)) * 2 : cos(p) / (0.55 + abs(cos(5 * p))))",
    y: "mod(floor(p * 0.9 + t * 0.5), 3) < 1 ? sin(p + cos(3 * p)) * 1.8 : (mod(floor(p * 0.9 + t * 0.5), 3) < 2 ? abs(sin(2 * p - t)) * sign(sin(p)) * 2 : sin(p) / (0.55 + abs(sin(5 * p))))",
    z: "mod(floor(p * 0.9 + t * 0.5), 3) < 1 ? sin(3 * p + t) : (mod(floor(p * 0.9 + t * 0.5), 3) < 2 ? abs(cos(6 * p)) : -sin(4 * p - t))",
    geometryMode: "crystal",
    description: "Opcode-like switches jump between additive feedback, absolute fold, and reciprocal rules."
  },
  {
    id: "self-mutation-09",
    name: "Formula Mutation: Stochastic Hash Petal",
    category: "Formula mutation meta-fractals",
    x: "(sin(floor(p * 6 + t * 2) * 19.19) > 0 ? 1 : -1) * cos(p) * (1.6 + 0.45 * abs(sin(5 * p + t)))",
    y: "(sin(floor(p * 5 + t * 2) * 23.73) > 0 ? 1 : -1) * sin(p) * (1.6 + 0.45 * abs(cos(4 * p - t)))",
    z: "(sin(floor(p * 4 + t * 2) * 31.41) > 0 ? 1 : -1) * sin(6 * p + t)",
    geometryMode: "tube",
    description: "Pseudo-random mutation signs create a repeatable stochastic petal map."
  },
  {
    id: "self-mutation-10",
    name: "Formula Mutation: Meta Blend Breather",
    category: "Formula mutation meta-fractals",
    x: "(0.5 + 0.5 * sin(t + p * 0.2)) * cos(2 * p + t) * (1.5 + 0.2 * sin(5 * p)) + (0.5 - 0.5 * sin(t + p * 0.2)) * sign(cos(p)) * abs(cos(p))^0.7 * 2",
    y: "(0.5 + 0.5 * sin(t + p * 0.2)) * sin(3 * p - t) * (1.5 + 0.2 * cos(5 * p)) + (0.5 - 0.5 * sin(t + p * 0.2)) * sign(sin(p)) * abs(sin(p))^0.7 * 2",
    z: "(0.5 + 0.5 * sin(t + p * 0.2)) * sin(4 * p + t) + (0.5 - 0.5 * sin(t + p * 0.2)) * cos(7 * p - t)",
    geometryMode: "ribbon",
    description: "A meta-formula continuously mutates by blending harmonic and powered-lobe grammars."
  }
];

// True f(p, q, t) surfaces — rendered as (p, q) grid meshes, not curves.
const PARAMETRIC_SURFACE_FORMULAS: Formula[] = [
  {
    id: "surf-01",
    name: "Torus Pulse",
    category: "Parametric surfaces",
    parametric: true,
    x: "(3 + (1.1 + 0.35 * sin(t)) * cos(q)) * cos(p)",
    y: "(3 + (1.1 + 0.35 * sin(t)) * cos(q)) * sin(p)",
    z: "(1.1 + 0.35 * sin(t)) * sin(q)",
    style: { material: "ceramic", lighting: "studio" },
    speedHint: 0.5,
    description: "A torus whose tube radius breathes with the phase clock."
  },
  {
    id: "surf-02",
    name: "Klein Bottle",
    category: "Parametric surfaces",
    parametric: true,
    pRange: [0, 12.566],
    x: "((2.5 + 0.15 * sin(t)) + cos(0.5 * p) * sin(q) - sin(0.5 * p) * sin(2 * q)) * cos(p)",
    y: "((2.5 + 0.15 * sin(t)) + cos(0.5 * p) * sin(q) - sin(0.5 * p) * sin(2 * q)) * sin(p)",
    z: "sin(0.5 * p) * sin(q) + cos(0.5 * p) * sin(2 * q)",
    style: { material: "copper", lighting: "sunset" },
    speedHint: 0.5,
    description: "Figure-eight immersion of the Klein bottle — a closed surface with no inside."
  },
  {
    id: "surf-03",
    name: "Mobius Band",
    category: "Parametric surfaces",
    parametric: true,
    qRange: [-0.9, 0.9],
    x: "(3 + q * cos(0.5 * p + 0.2 * t)) * cos(p)",
    y: "(3 + q * cos(0.5 * p + 0.2 * t)) * sin(p)",
    z: "q * sin(0.5 * p + 0.2 * t)",
    style: { material: "velvet", lighting: "noir" },
    speedHint: 0.5,
    description: "One-sided band whose half-twist slowly crawls around the ring."
  },
  {
    id: "surf-04",
    name: "Catenoid-Helicoid Morph",
    category: "Parametric surfaces",
    parametric: true,
    pRange: [-3.1416, 3.1416],
    qRange: [-1.6, 1.6],
    x: "cos(0.5 * t) * sinh(q) * sin(p) + sin(0.5 * t) * cosh(q) * cos(p)",
    y: "-cos(0.5 * t) * sinh(q) * cos(p) + sin(0.5 * t) * cosh(q) * sin(p)",
    z: "0.6 * p * cos(0.5 * t) + 1.4 * q * sin(0.5 * t)",
    style: { material: "chrome", lighting: "gallery" },
    speedHint: 0.5,
    description: "The classic isometric deformation between a helicoid and a catenoid, driven by t."
  },
  {
    id: "surf-05",
    name: "Turret Seashell",
    category: "Parametric surfaces",
    parametric: true,
    qRange: [0, 12.566],
    x: "0.62 * (1 - 0.0796 * q) * cos(2 * q) * (1 + cos(p)) + 0.14 * cos(2 * q)",
    y: "0.62 * (1 - 0.0796 * q) * sin(2 * q) * (1 + cos(p)) + 0.14 * sin(2 * q)",
    z: "0.28 * q + 0.62 * (1 - 0.0796 * q) * sin(p) + 0.03 * sin(15 * q + t)",
    style: { material: "pearl", lighting: "sunset" },
    speedHint: 0.5,
    description: "Logarithmic turret shell: a shrinking tube coiled up a rising spiral."
  },
  {
    id: "surf-06",
    name: "Dini Twist",
    category: "Parametric surfaces",
    parametric: true,
    pRange: [0, 12.566],
    qRange: [0.15, 2.0],
    x: "2.6 * cos(p + 0.3 * t) * sin(q)",
    y: "2.6 * sin(p + 0.3 * t) * sin(q)",
    z: "2.6 * (cos(q) + log(tan(q / 2))) + 0.35 * p",
    style: { material: "jade", lighting: "caustic" },
    speedHint: 0.5,
    description: "Dini's surface: constant negative curvature twisted along a helix."
  },
  {
    id: "surf-07",
    name: "Sine Weave",
    category: "Parametric surfaces",
    parametric: true,
    x: "3 * sin(p)",
    y: "3 * sin(q)",
    z: "3 * sin(p + q + 0.5 * t)",
    style: { material: "hologram", lighting: "prism" },
    speedHint: 0.5,
    description: "The sine surface: three orthogonal sines sliding against each other."
  },
  {
    id: "surf-08",
    name: "Harmonic Bloom",
    category: "Parametric surfaces",
    parametric: true,
    qRange: [0.05, 3.09],
    x: "(3 + 0.8 * sin(3 * q) * cos(4 * p + t)) * sin(q) * cos(p)",
    y: "(3 + 0.8 * sin(3 * q) * cos(4 * p + t)) * sin(q) * sin(p)",
    z: "(3 + 0.8 * sin(3 * q) * cos(4 * p + t)) * cos(q)",
    style: { material: "ruby", lighting: "eclipse" },
    speedHint: 0.5,
    description: "A sphere modulated by a rotating spherical harmonic — it blooms as t turns."
  },
  {
    id: "surf-09",
    name: "Interference Pool",
    category: "Parametric surfaces",
    parametric: true,
    pRange: [-5, 5],
    qRange: [-5, 5],
    x: "p",
    y: "q",
    z: "1.1 * sin(2 * sqrt(p^2 + q^2) - 2 * t) + 0.4 * sin(1.7 * p + t) * cos(1.5 * q)",
    style: { material: "ice", lighting: "laboratory" },
    speedHint: 0.5,
    description: "Circular ripples from the center interfering with a diagonal cross-swell."
  },
  {
    id: "surf-10",
    name: "Superquadric Morph",
    category: "Parametric surfaces",
    parametric: true,
    pRange: [-3.1416, 3.1416],
    qRange: [-1.5208, 1.5208],
    x: "3 * sign(cos(q)) * abs(cos(q))^(0.55 + 0.3 * sin(0.5 * t)) * sign(cos(p)) * abs(cos(p))^(0.55 + 0.3 * sin(0.5 * t))",
    y: "3 * sign(cos(q)) * abs(cos(q))^(0.55 + 0.3 * sin(0.5 * t)) * sign(sin(p)) * abs(sin(p))^(0.55 + 0.3 * sin(0.5 * t))",
    z: "3 * sign(sin(q)) * abs(sin(q))^(0.55 + 0.3 * sin(0.5 * t))",
    style: { material: "plasma", lighting: "prism" },
    speedHint: 0.5,
    description: "A superellipsoid whose exponent breathes between rounded cube and pointed star."
  },
  {
    id: "surf-11",
    name: "Corkscrew Spring",
    category: "Parametric surfaces",
    parametric: true,
    pRange: [0, 12.566],
    x: "(2.6 + 0.8 * cos(q)) * cos(p)",
    y: "(2.6 + 0.8 * cos(q)) * sin(p)",
    z: "0.8 * sin(q) + 0.45 * p - 2.8",
    style: { material: "liquid-metal", lighting: "studio" },
    speedHint: 0.5,
    description: "A toroidal tube stretched into a two-turn helical spring."
  },
  {
    id: "surf-12",
    name: "Squish Torus",
    category: "Parametric surfaces",
    parametric: true,
    x: "(3 + (0.55 + 0.45 * cos(2 * t + 3 * p)) * cos(q)) * cos(p)",
    y: "(3 + (0.55 + 0.45 * cos(2 * t + 3 * p)) * cos(q)) * sin(p)",
    z: "(0.55 + 0.45 * sin(2 * t + 3 * p)) * sin(q)",
    style: { material: "neon", lighting: "underlight" },
    speedHint: 0.5,
    description: "A torus whose cross-section squashes and rolls as it travels the ring."
  },
  {
    id: "surf-13",
    name: "Astroidal Ellipsoid",
    category: "Parametric surfaces",
    parametric: true,
    pRange: [-3.1416, 3.1416],
    qRange: [-1.5708, 1.5708],
    x: "3.2 * (cos(p + 0.2 * t) * cos(q))^3",
    y: "3.2 * (sin(p + 0.2 * t) * cos(q))^3",
    z: "3.2 * sin(q)^3",
    style: { material: "obsidian", lighting: "eclipse" },
    speedHint: 0.5,
    description: "Cubed-cosine star ellipsoid: six cusps joined by pinched saddle walls."
  },
  {
    id: "surf-14",
    name: "Horn Torus Morph",
    category: "Parametric surfaces",
    parametric: true,
    x: "((2 + 1.3 * sin(0.4 * t)) + 1.4 * cos(q)) * cos(p)",
    y: "((2 + 1.3 * sin(0.4 * t)) + 1.4 * cos(q)) * sin(p)",
    z: "1.4 * sin(q)",
    style: { material: "glass", lighting: "aurora" },
    speedHint: 0.5,
    description: "The major radius sweeps through ring, horn and spindle torus regimes."
  },
  {
    id: "surf-15",
    name: "Helical Ramp",
    category: "Parametric surfaces",
    parametric: true,
    pRange: [0, 6.2832],
    qRange: [0.6, 3.4],
    x: "q * cos(2 * p)",
    y: "q * sin(2 * p)",
    z: "0.8 * p - 2.5 + 0.2 * sin(6 * q + t)",
    style: { material: "carbon", lighting: "noir" },
    speedHint: 0.5,
    description: "A double-turn spiral ramp with a gentle radial shudder."
  }
];

// Superformula content: r(v) = (|cos(m v/4)|^n2 + |sin(m v/4)|^n3)^(-1/n1).
const SUPERSHAPE_FORMULAS: Formula[] = [
  {
    id: "surf-16",
    name: "Supershape Starfruit",
    category: "Parametric surfaces",
    parametric: true,
    pRange: [-3.1416, 3.1416],
    qRange: [-1.5708, 1.5708],
    x: "3 * ((abs(cos(1.25 * p)))^2.2 + (abs(sin(1.25 * p)))^1.7)^(-1 / (4 + 2 * sin(0.3 * t))) * cos(p) * ((abs(cos(q)))^1.6 + (abs(sin(q)))^1.6)^(-1 / 6) * cos(q)",
    y: "3 * ((abs(cos(1.25 * p)))^2.2 + (abs(sin(1.25 * p)))^1.7)^(-1 / (4 + 2 * sin(0.3 * t))) * sin(p) * ((abs(cos(q)))^1.6 + (abs(sin(q)))^1.6)^(-1 / 6) * cos(q)",
    z: "3 * ((abs(cos(q)))^1.6 + (abs(sin(q)))^1.6)^(-1 / 6) * sin(q)",
    style: { material: "jade", lighting: "caustic" },
    speedHint: 0.5,
    description: "A five-ribbed superformula solid whose sharpness breathes with t."
  },
  {
    id: "surf-17",
    name: "Supershape Urchin",
    category: "Parametric surfaces",
    parametric: true,
    pRange: [-3.1416, 3.1416],
    qRange: [-1.5708, 1.5708],
    x: "2.8 * ((abs(cos(2 * p)))^5 + (abs(sin(2 * p)))^5)^(-1 / (1 + 0.35 * sin(0.4 * t))) * cos(p) * ((abs(cos(0.5 * q)))^2 + (abs(sin(0.5 * q)))^2)^(-1 / 3) * cos(q)",
    y: "2.8 * ((abs(cos(2 * p)))^5 + (abs(sin(2 * p)))^5)^(-1 / (1 + 0.35 * sin(0.4 * t))) * sin(p) * ((abs(cos(0.5 * q)))^2 + (abs(sin(0.5 * q)))^2)^(-1 / 3) * cos(q)",
    z: "2.8 * ((abs(cos(0.5 * q)))^2 + (abs(sin(0.5 * q)))^2)^(-1 / 3) * sin(q)",
    style: { material: "obsidian", lighting: "underlight" },
    speedHint: 0.5,
    description: "Eight-spined urchin: pointed lobes flex as the exponent oscillates."
  },
  {
    id: "surf-18",
    name: "Supershape Blossom",
    category: "Parametric surfaces",
    parametric: true,
    pRange: [-3.1416, 3.1416],
    qRange: [-1.5708, 1.5708],
    x: "3 * ((abs(cos(1.5 * p)))^(2.5 + 1.5 * sin(0.5 * t)) + (abs(sin(1.5 * p)))^(2.5 - 1.5 * sin(0.5 * t)))^(-1 / 2.4) * cos(p) * ((abs(cos(q)))^2 + (abs(sin(q)))^2)^(-1 / 2) * cos(q)",
    y: "3 * ((abs(cos(1.5 * p)))^(2.5 + 1.5 * sin(0.5 * t)) + (abs(sin(1.5 * p)))^(2.5 - 1.5 * sin(0.5 * t)))^(-1 / 2.4) * sin(p) * ((abs(cos(q)))^2 + (abs(sin(q)))^2)^(-1 / 2) * cos(q)",
    z: "3 * ((abs(cos(q)))^2 + (abs(sin(q)))^2)^(-1 / 2) * sin(q)",
    style: { material: "pearl", lighting: "sunset" },
    speedHint: 0.5,
    description: "Six petals trade fullness in antiphase, like a blossom opening and closing."
  },
  {
    id: "surf-19",
    name: "Supershape Gem",
    category: "Parametric surfaces",
    parametric: true,
    pRange: [-3.1416, 3.1416],
    qRange: [-1.5708, 1.5708],
    x: "3 * ((abs(cos(0.75 * p)))^3 + (abs(sin(0.75 * p)))^3)^(-1 / 1.2) * cos(p) * ((abs(cos(1.5 * q)))^3 + (abs(sin(1.5 * q)))^3)^(-1 / (5 + 2 * sin(0.25 * t))) * cos(q)",
    y: "3 * ((abs(cos(0.75 * p)))^3 + (abs(sin(0.75 * p)))^3)^(-1 / 1.2) * sin(p) * ((abs(cos(1.5 * q)))^3 + (abs(sin(1.5 * q)))^3)^(-1 / (5 + 2 * sin(0.25 * t))) * cos(q)",
    z: "3 * ((abs(cos(1.5 * q)))^3 + (abs(sin(1.5 * q)))^3)^(-1 / (5 + 2 * sin(0.25 * t))) * sin(q)",
    style: { material: "ruby", lighting: "gallery" },
    speedHint: 0.5,
    description: "Triangular superformula cut with ridged latitudes — a slowly re-faceting gem."
  },
  {
    id: "ss-01",
    name: "Supershape Rose 7",
    x: "((abs(cos(1.75 * p)))^2.8 + (abs(sin(1.75 * p)))^1.4)^(-1 / 2.2) * 3 * cos(p + 0.15 * t)",
    y: "((abs(cos(1.75 * p)))^2.8 + (abs(sin(1.75 * p)))^1.4)^(-1 / 2.2) * 3 * sin(p + 0.15 * t)",
    z: "0.8 * sin(3 * p + t)",
    geometryMode: "tube",
    style: { material: "velvet", lighting: "sunset" },
    speedHint: 0.8,
    description: "Seven-petaled superformula rose, slowly precessing."
  },
  {
    id: "ss-02",
    name: "Supershape Star 5",
    x: "((abs(cos(1.25 * p)))^4 + (abs(sin(1.25 * p)))^4)^(-1 / (1 + 0.5 * sin(t))) * 3 * cos(p)",
    y: "((abs(cos(1.25 * p)))^4 + (abs(sin(1.25 * p)))^4)^(-1 / (1 + 0.5 * sin(t))) * 3 * sin(p)",
    z: "0.6 * cos(5 * p - t)",
    geometryMode: "ribbon",
    style: { material: "neon", lighting: "prism" },
    speedHint: 0.8,
    description: "Five-pointed star whose spikes sharpen and relax with the beat of t."
  },
  {
    id: "ss-03",
    name: "Supershape Polygon Drift",
    x: "((abs(cos((1 + 0.5 * sin(0.2 * t)) * p)))^6 + (abs(sin((1 + 0.5 * sin(0.2 * t)) * p)))^6)^(-1 / 9) * 3 * cos(p)",
    y: "((abs(cos((1 + 0.5 * sin(0.2 * t)) * p)))^6 + (abs(sin((1 + 0.5 * sin(0.2 * t)) * p)))^6)^(-1 / 9) * 3 * sin(p)",
    z: "0.5 * sin(2 * p + 0.5 * t)",
    geometryMode: "extrude",
    style: { material: "ceramic", lighting: "gallery" },
    speedHint: 0.8,
    description: "A near-polygon whose symmetry count drifts, so the outline never repeats."
  },
  {
    id: "ss-04",
    name: "Supershape Gear 12",
    x: "((abs(cos(3 * p)))^5 + (abs(sin(3 * p)))^5)^(-1 / 8) * (2.6 + 0.2 * sin(12 * p)) * cos(p)",
    y: "((abs(cos(3 * p)))^5 + (abs(sin(3 * p)))^5)^(-1 / 8) * (2.6 + 0.2 * sin(12 * p)) * sin(p)",
    z: "0.7 * sin(6 * p + t)",
    geometryMode: "lathe",
    style: { material: "carbon", lighting: "noir" },
    speedHint: 0.8,
    description: "Twelve-toothed superformula gear with a wobbling axial ripple."
  }
];

export const PRESET_FORMULAS: Formula[] = [
  ...PARAMETRIC_SURFACE_FORMULAS,
  ...SUPERSHAPE_FORMULAS,
  ...BASE_PRESET_FORMULAS,
  ...ORGANIC_FLOW_FORMULAS,
  ...SELF_MODIFYING_FORMULAS
];
