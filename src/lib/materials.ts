import * as THREE from 'three';
import { WebGPUMaterialProfile } from '../constants';

// Physically-based material profiles for the WebGL path (the only path that
// currently reaches XR headsets). Mirrors the WebGPU node-material profiles
// so picking "Glass" or "Velvet" looks equivalent on either backend, and uses
// MeshPhysicalMaterial features the node path doesn't have yet: transmission,
// iridescence, sheen, clearcoat.

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
};

const PHYSICAL_PROFILES: Record<Exclude<WebGPUMaterialProfile, 'auto'>, PhysicalProfile> = {
  plasma: {
    color: 0x8b5cf6, emissive: 0x22d3ee, emissiveIntensity: 0.85,
    metalness: 0.1, roughness: 0.22, opacity: 1, transparent: false, envMapIntensity: 1.1
  },
  'liquid-metal': {
    color: 0xb6c7d8, emissive: 0x0b1220, emissiveIntensity: 0.12,
    metalness: 1.0, roughness: 0.07, opacity: 1, transparent: false,
    clearcoat: 0.6, clearcoatRoughness: 0.08, envMapIntensity: 1.6
  },
  pearl: {
    color: 0xf8fafc, emissive: 0xa5b4fc, emissiveIntensity: 0.08,
    metalness: 0.05, roughness: 0.34, opacity: 1, transparent: false,
    iridescence: 1.0, iridescenceIOR: 1.3, sheen: 0.45, sheenColor: 0xf9a8d4, sheenRoughness: 0.4,
    envMapIntensity: 1.2
  },
  glass: {
    color: 0x9fd8ff, emissive: 0x0a2438, emissiveIntensity: 0.1,
    metalness: 0.0, roughness: 0.05, opacity: 1, transparent: true,
    transmission: 1.0, thickness: 1.2, ior: 1.45, envMapIntensity: 1.4
  },
  velvet: {
    color: 0x7c2d12, emissive: 0x30061a, emissiveIntensity: 0.25,
    metalness: 0.0, roughness: 1.0, opacity: 1, transparent: false,
    sheen: 1.0, sheenColor: 0xf0abfc, sheenRoughness: 0.5, envMapIntensity: 0.5
  },
  ceramic: {
    color: 0xf8fafc, emissive: 0x22d3ee, emissiveIntensity: 0.04,
    metalness: 0.0, roughness: 0.36, opacity: 1, transparent: false,
    clearcoat: 1.0, clearcoatRoughness: 0.14, envMapIntensity: 1.0
  },
  hologram: {
    color: 0x22d3ee, emissive: 0xf472b6, emissiveIntensity: 1.2,
    metalness: 0.0, roughness: 0.1, opacity: 0.55, transparent: true, additive: true,
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
    metalness: 0.0, roughness: 0.4, opacity: 1, transparent: true,
    transmission: 0.55, thickness: 1.5, ior: 1.6, envMapIntensity: 0.9
  },
  xray: {
    color: 0x60a5fa, emissive: 0x93c5fd, emissiveIntensity: 1.0,
    metalness: 0.0, roughness: 0.2, opacity: 0.35, transparent: true, additive: true,
    envMapIntensity: 0.4
  },
  carbon: {
    color: 0x1f2937, emissive: 0xf97316, emissiveIntensity: 0.18,
    metalness: 0.35, roughness: 0.82, opacity: 1, transparent: false,
    clearcoat: 0.5, clearcoatRoughness: 0.3, envMapIntensity: 0.8
  },
  chrome: {
    color: 0xe5e7eb, emissive: 0x111827, emissiveIntensity: 0.05,
    metalness: 1.0, roughness: 0.03, opacity: 1, transparent: false, envMapIntensity: 1.8
  },
  ruby: {
    color: 0xbe123c, emissive: 0x2a050b, emissiveIntensity: 0.25,
    metalness: 0.0, roughness: 0.12, opacity: 1, transparent: true,
    transmission: 0.7, thickness: 1.6, ior: 1.76, envMapIntensity: 1.3
  },
  ice: {
    color: 0xbfe8ff, emissive: 0x082f49, emissiveIntensity: 0.15,
    metalness: 0.0, roughness: 0.26, opacity: 1, transparent: true,
    transmission: 0.95, thickness: 1.0, ior: 1.31, envMapIntensity: 1.2
  },
  neon: {
    color: 0x22d3ee, emissive: 0xf0abfc, emissiveIntensity: 1.6,
    metalness: 0.0, roughness: 0.15, opacity: 0.75, transparent: true, additive: true,
    envMapIntensity: 0.6
  }
};

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
  if (settings.additive) {
    material.blending = THREE.AdditiveBlending;
    material.depthWrite = false;
  }

  return material;
}
