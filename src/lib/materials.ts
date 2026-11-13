import * as THREE from 'three';
import type { WebGPUMaterialProfile } from '../constants';

// Physically-based material profiles for the WebGL path (the only path that
// currently reaches XR headsets). Mirrors the WebGPU node-material profiles
// so both backends use the same transmission, clearcoat, thin-film and
// volume-absorption settings. The WebGPU path adds its animated TSL colors.

type PhysicalProfile = {
  color: number;
  emissive: number;
  emissiveIntensity: number;
  metalness: number;
  roughness: number;
  opacity: number;
  transparent: boolean;
  additive?: boolean;
  transmission?: number;
  thickness?: number;
  ior?: number;
  iridescence?: number;
  iridescenceIOR?: number;
  sheen?: number;
  sheenColor?: number;
  sheenRoughness?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  envMapIntensity?: number;
  dispersion?: number;
  attenuationColor?: number;
  attenuationDistance?: number;
  iridescenceThicknessRange?: [number, number];
  specularIntensity?: number;
};

const PHYSICAL_PROFILES: Record<Exclude<WebGPUMaterialProfile, 'auto'>, PhysicalProfile> = {
  plasma: {
    color: 0x8b5cf6, emissive: 0x22d3ee, emissiveIntensity: 0.55,
    metalness: 0.1, roughness: 0.22, opacity: 1, transparent: false, envMapIntensity: 1.1
  },
  'liquid-metal': {
    color: 0xa8b9cb, emissive: 0x0b1220, emissiveIntensity: 0.12,
    metalness: 1.0, roughness: 0.07, opacity: 1, transparent: false,
    clearcoat: 0.6, clearcoatRoughness: 0.08, envMapIntensity: 1.4
  },
  pearl: {
    // Near-white bases blow out under the default light level + bloom; the
    // pearl look survives on a cooler mid-gray with the iridescence intact.
    color: 0xa9b9cd, emissive: 0xa5b4fc, emissiveIntensity: 0.08,
    metalness: 0.05, roughness: 0.34, opacity: 1, transparent: false,
    iridescence: 1.0, iridescenceIOR: 1.3, sheen: 0.45, sheenColor: 0xf9a8d4, sheenRoughness: 0.4,
    envMapIntensity: 0.6
  },
  glass: {
    color: 0x9fd8ff, emissive: 0x0a2438, emissiveIntensity: 0.1,
    metalness: 0.0, roughness: 0.05, opacity: 1, transparent: false,
    transmission: 1.0, thickness: 1.2, ior: 1.45, envMapIntensity: 1.4,
    dispersion: 0.35, attenuationColor: 0xb8e4ff, attenuationDistance: 3.5,
    clearcoat: 0.7, clearcoatRoughness: 0.04
  },
  velvet: {
    color: 0x7c2d12, emissive: 0x30061a, emissiveIntensity: 0.25,
    metalness: 0.0, roughness: 1.0, opacity: 1, transparent: false,
    sheen: 1.0, sheenColor: 0xf0abfc, sheenRoughness: 0.5, envMapIntensity: 0.5
  },
  ceramic: {
    color: 0xcfd9e8, emissive: 0x22d3ee, emissiveIntensity: 0.04,
    metalness: 0.0, roughness: 0.36, opacity: 1, transparent: false,
    clearcoat: 1.0, clearcoatRoughness: 0.14, envMapIntensity: 0.7
  },
  hologram: {
    color: 0x155e75, emissive: 0xf472b6, emissiveIntensity: 0.65,
    metalness: 0.0, roughness: 0.12, opacity: 0.72, transparent: true,
    iridescence: 0.8, iridescenceIOR: 1.6, envMapIntensity: 0.8
  },
  obsidian: {
    color: 0x14161c, emissive: 0xff2e2e, emissiveIntensity: 0.35,
    metalness: 0.3, roughness: 0.24, opacity: 1, transparent: false,
    clearcoat: 0.85, clearcoatRoughness: 0.2, envMapIntensity: 1.2
  },
  copper: {
    color: 0xc46a28, emissive: 0x2a1106, emissiveIntensity: 0.15,
    metalness: 1.0, roughness: 0.32, opacity: 1, transparent: false, envMapIntensity: 1.3
  },
  jade: {
    color: 0x10b981, emissive: 0x052e1c, emissiveIntensity: 0.2,
    metalness: 0.0, roughness: 0.4, opacity: 1, transparent: false,
    transmission: 0.55, thickness: 1.5, ior: 1.6, envMapIntensity: 0.9,
    attenuationColor: 0x2ca76d, attenuationDistance: 2.2
  },
  xray: {
    color: 0x1d4ed8, emissive: 0x93c5fd, emissiveIntensity: 0.55,
    metalness: 0.0, roughness: 0.2, opacity: 0.5, transparent: true,
    envMapIntensity: 0.45
  },
  carbon: {
    color: 0x1f2937, emissive: 0xf97316, emissiveIntensity: 0.18,
    metalness: 0.35, roughness: 0.82, opacity: 1, transparent: false,
    clearcoat: 0.5, clearcoatRoughness: 0.3, envMapIntensity: 0.8
  },
  chrome: {
    color: 0xb7bdc6, emissive: 0x111827, emissiveIntensity: 0.05,
    metalness: 1.0, roughness: 0.03, opacity: 1, transparent: false, envMapIntensity: 1.25
  },
  ruby: {
    color: 0xbe123c, emissive: 0x2a050b, emissiveIntensity: 0.25,
    metalness: 0.0, roughness: 0.12, opacity: 1, transparent: false,
    transmission: 0.7, thickness: 1.6, ior: 1.76, envMapIntensity: 1.3,
    dispersion: 0.45, attenuationColor: 0xcc2855, attenuationDistance: 1.7,
    clearcoat: 1.0, clearcoatRoughness: 0.06
  },
  ice: {
    color: 0x92c5e4, emissive: 0x082f49, emissiveIntensity: 0.15,
    metalness: 0.0, roughness: 0.26, opacity: 1, transparent: false,
    transmission: 0.95, thickness: 1.0, ior: 1.31, envMapIntensity: 0.85,
    dispersion: 0.12, attenuationColor: 0xbeeafa, attenuationDistance: 4.0
  },
  neon: {
    color: 0x0e7490, emissive: 0xf0abfc, emissiveIntensity: 0.7,
    metalness: 0.0, roughness: 0.18, opacity: 0.92, transparent: true,
    envMapIntensity: 0.7
  },
  ornament: {
    // A lacquered colored metal: the body tint stays saturated while the
    // clearcoat contributes a separate white studio-light reflection.
    color: 0xc71f55, emissive: 0x260510, emissiveIntensity: 0.025,
    metalness: 0.96, roughness: 0.14, opacity: 1, transparent: false,
    clearcoat: 1.0, clearcoatRoughness: 0.045, envMapIntensity: 1.25,
    iridescence: 0.16, iridescenceIOR: 1.4, iridescenceThicknessRange: [180, 300]
  },
  gold: {
    color: 0xe8b84d, emissive: 0x2a1603, emissiveIntensity: 0.025,
    metalness: 1.0, roughness: 0.16, opacity: 1, transparent: false,
    clearcoat: 0.8, clearcoatRoughness: 0.055, envMapIntensity: 1.2
  },
  'stained-glass': {
    color: 0xe4c4ff, emissive: 0x130820, emissiveIntensity: 0.025,
    metalness: 0.0, roughness: 0.09, opacity: 1, transparent: false,
    transmission: 0.94, thickness: 1.1, ior: 1.52, dispersion: 0.55,
    attenuationColor: 0x9b46dd, attenuationDistance: 2.3,
    clearcoat: 1.0, clearcoatRoughness: 0.035, envMapIntensity: 1.05
  },
  dichroic: {
    color: 0xc4edf1, emissive: 0x071a20, emissiveIntensity: 0.025,
    metalness: 0.0, roughness: 0.1, opacity: 1, transparent: false,
    transmission: 0.82, thickness: 0.8, ior: 1.48, dispersion: 0.65,
    iridescence: 1.0, iridescenceIOR: 1.45, iridescenceThicknessRange: [140, 650],
    attenuationColor: 0x83d8d4, attenuationDistance: 3.0,
    clearcoat: 1.0, clearcoatRoughness: 0.045, envMapIntensity: 1.1
  },
  'oil-slick': {
    // A dark conductor underneath an oxide film: reflections carry the
    // shifting petrol colors rather than an emissive rainbow painted on top.
    color: 0x65747d, emissive: 0x020b12, emissiveIntensity: 0.015,
    metalness: 1, roughness: 0.19, opacity: 1, transparent: false,
    iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [90, 820],
    clearcoat: 1, clearcoatRoughness: 0.055, envMapIntensity: 1.3
  },
  'opal-glass': {
    // The softer body lobe and colored absorption keep this distinct from
    // clear dichroic glass, while a crisp shell retains moving light glints.
    color: 0xb1d9ce, emissive: 0x062018, emissiveIntensity: 0.018,
    metalness: 0, roughness: 0.27, opacity: 1, transparent: false,
    transmission: 0.78, thickness: 1.8, ior: 1.46, dispersion: 0.5,
    attenuationColor: 0x65c5b9, attenuationDistance: 2.1,
    iridescence: 0.9, iridescenceIOR: 1.35, iridescenceThicknessRange: [240, 590],
    sheen: 0.25, sheenColor: 0xf3b6e8, sheenRoughness: 0.6,
    clearcoat: 1, clearcoatRoughness: 0.035, envMapIntensity: 1.1
  },
  'solar-gold': {
    color: 0xe3a235, emissive: 0x261003, emissiveIntensity: 0.018,
    metalness: 1, roughness: 0.2, opacity: 1, transparent: false,
    clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.25,
    iridescence: 0.2, iridescenceIOR: 1.5, iridescenceThicknessRange: [170, 290]
  }
};

// Tileable micro-dents break the solar gold's reflected softboxes into a
// hand-hammered surface. CPU pixels are made once; each material owns its GPU
// texture, so deleting a flight pool cannot damage another pool or cached GLB.
let hammeredNormalPixels: Uint8Array | undefined;
function hammeredNormals() {
  if (hammeredNormalPixels) return hammeredNormalPixels;
  const side = 64, cells = 8;
  const height = new Float32Array(side * side);
  const hash = (x: number, y: number, salt: number) => {
    const value = Math.sin(x * 127.1 + y * 311.7 + salt) * 43758.5453;
    return value - Math.floor(value);
  };
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const u = x * cells / side, v = y * cells / side;
    let nearest = Infinity;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = Math.floor(u) + dx, cy = Math.floor(v) + dy;
      const wrappedX = (cx + cells) % cells, wrappedY = (cy + cells) % cells;
      const px = cx + 0.18 + 0.64 * hash(wrappedX, wrappedY, 1);
      const py = cy + 0.18 + 0.64 * hash(wrappedX, wrappedY, 7);
      nearest = Math.min(nearest, (u - px) ** 2 + (v - py) ** 2);
    }
    height[y * side + x] = Math.exp(-nearest * 3.8);
  }
  const pixels = new Uint8Array(side * side * 4);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const dx = height[y * side + (x + 1) % side] - height[y * side + (x + side - 1) % side];
    const dy = height[((y + 1) % side) * side + x] - height[((y + side - 1) % side) * side + x];
    const nx = -dx * 2.4, ny = -dy * 2.4, length = Math.hypot(nx, ny, 1);
    const offset = (y * side + x) * 4;
    pixels[offset] = Math.round((nx / length * 0.5 + 0.5) * 255);
    pixels[offset + 1] = Math.round((ny / length * 0.5 + 0.5) * 255);
    pixels[offset + 2] = Math.round((1 / length * 0.5 + 0.5) * 255);
    pixels[offset + 3] = 255;
  }
  return hammeredNormalPixels = pixels;
}

/** Shared by WebGL/XR and WebGPU; dispose follows the owning material. */
export function applyPhysicalSurfaceDetail(material: Pick<THREE.MeshPhysicalMaterial, 'normalMap' | 'normalScale' | 'addEventListener'>,
  profile: Exclude<WebGPUMaterialProfile, 'auto'>) {
  if (profile !== 'solar-gold') return;
  const texture = new THREE.DataTexture(hammeredNormals().slice(), 64, 64, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.repeat.set(3, 3);
  texture.needsUpdate = true;
  material.normalMap = texture;
  material.normalScale.set(0.55, 0.55);
  // Three can upload a disposed texture again when its material is reused
  // (including React StrictMode's cleanup/setup cycle). Forward EVERY release
  // so a later GPU allocation is freed as well. Texture disposal itself is
  // safe when no GPU allocation exists; a permanent guard would leak reuse.
  material.addEventListener('dispose', () => texture.dispose());
}

export const PHYSICAL_MATERIAL_PROFILES: readonly Exclude<WebGPUMaterialProfile, 'auto'>[] = Object.freeze(
  Object.keys(PHYSICAL_PROFILES) as Exclude<WebGPUMaterialProfile, 'auto'>[]
);

export function physicalProfileSettings(profile: Exclude<WebGPUMaterialProfile, 'auto'>): Readonly<PhysicalProfile> {
  return PHYSICAL_PROFILES[profile];
}

export function createPhysicalMaterial(
  profile: Exclude<WebGPUMaterialProfile, 'auto'>,
  wireframe: boolean
): THREE.MeshPhysicalMaterial {
  const settings = PHYSICAL_PROFILES[profile];
  const material = new THREE.MeshPhysicalMaterial({
    color: settings.color,
    emissive: settings.emissive,
    emissiveIntensity: settings.emissiveIntensity,
    metalness: settings.metalness,
    roughness: settings.roughness,
    opacity: settings.opacity,
    transparent: settings.transparent,
    side: THREE.DoubleSide,
    wireframe
  });

  if (settings.transmission !== undefined) material.transmission = settings.transmission;
  if (settings.thickness !== undefined) material.thickness = settings.thickness;
  if (settings.ior !== undefined) material.ior = settings.ior;
  if (settings.iridescence !== undefined) material.iridescence = settings.iridescence;
  if (settings.iridescenceIOR !== undefined) material.iridescenceIOR = settings.iridescenceIOR;
  if (settings.sheen !== undefined) material.sheen = settings.sheen;
  if (settings.sheenColor !== undefined) material.sheenColor = new THREE.Color(settings.sheenColor);
  if (settings.sheenRoughness !== undefined) material.sheenRoughness = settings.sheenRoughness;
  if (settings.clearcoat !== undefined) material.clearcoat = settings.clearcoat;
  if (settings.clearcoatRoughness !== undefined) material.clearcoatRoughness = settings.clearcoatRoughness;
  if (settings.envMapIntensity !== undefined) material.envMapIntensity = settings.envMapIntensity;
  if (settings.dispersion !== undefined) material.dispersion = settings.dispersion;
  if (settings.attenuationColor !== undefined) material.attenuationColor = new THREE.Color(settings.attenuationColor);
  if (settings.attenuationDistance !== undefined) material.attenuationDistance = settings.attenuationDistance;
  if (settings.iridescenceThicknessRange !== undefined) material.iridescenceThicknessRange = [...settings.iridescenceThicknessRange];
  if (settings.specularIntensity !== undefined) material.specularIntensity = settings.specularIntensity;
  if (settings.additive) {
    material.blending = THREE.AdditiveBlending;
    material.depthWrite = false;
  }

  applyPhysicalSurfaceDetail(material, profile);

  return material;
}
