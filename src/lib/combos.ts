import { WebGPULightingPreset, WebGPUMaterialProfile } from '../constants';

// Curated scene combos: one click applies formula + material + rig + bloom +
// tempo as a designed whole. These double as the seed set for first-run
// favorites.

export type Combo = {
  id: string;
  name: string;
  formulaId: string;
  shaderId?: string;
  material: WebGPUMaterialProfile;
  lighting: WebGPULightingPreset;
  bloom?: number;
  speed?: number;
  show3D?: boolean;
  lineWidth?: number;
};

export const COMBOS: Combo[] = [
  {
    id: 'combo-smoked-glass',
    name: 'Smoked Sunset Glass',
    formulaId: 'surf-02', // Klein Bottle
    material: 'glass',
    lighting: 'sunset',
    bloom: 1.1,
    speed: 0.4
  },
  {
    id: 'combo-living-ruby',
    name: 'Living Ruby',
    formulaId: 'surf-08', // Harmonic Bloom
    material: 'ruby',
    lighting: 'eclipse',
    bloom: 1.2,
    speed: 0.5
  },
  {
    id: 'combo-chrome-cathedral',
    name: 'Chrome Cathedral',
    formulaId: 'surf-04', // Catenoid-Helicoid Morph
    material: 'chrome',
    lighting: 'gallery',
    bloom: 0.7,
    speed: 0.35
  },
  {
    id: 'combo-neon-reactor',
    name: 'Neon Reactor',
    formulaId: 'surf-12', // Squish Torus
    material: 'neon',
    lighting: 'underlight',
    bloom: 1.8,
    speed: 0.7
  },
  {
    id: 'combo-jade-tide',
    name: 'Jade Tide',
    formulaId: 'surf-16', // Supershape Starfruit
    material: 'jade',
    lighting: 'caustic',
    bloom: 0.9,
    speed: 0.45
  },
  {
    id: 'combo-obsidian-urchin',
    name: 'Obsidian Urchin',
    formulaId: 'surf-17', // Supershape Urchin
    material: 'obsidian',
    lighting: 'noir',
    bloom: 1.0,
    speed: 0.5
  },
  {
    id: 'combo-pearl-shell',
    name: 'Pearl Turret',
    formulaId: 'surf-05', // Turret Seashell
    material: 'pearl',
    lighting: 'prism',
    bloom: 0.8,
    speed: 0.4
  },
  {
    id: 'combo-ice-core',
    name: 'Ice Core',
    formulaId: 'surf-14', // Horn Torus Morph
    material: 'ice',
    lighting: 'laboratory',
    bloom: 1.0,
    speed: 0.5
  },
  {
    id: 'combo-mercury-vessel',
    name: 'Mercury Vessel',
    formulaId: '26', // Torus Knot 3,8
    shaderId: 's1', // restored Mercury Glass GLSL
    material: 'auto',
    lighting: 'studio',
    bloom: 1.0,
    speed: 0.6
  },
  {
    id: 'combo-aurora-ribbon',
    name: 'Aurora Ribbon (2D)',
    formulaId: '1', // Lissajous Primary
    shaderId: 'audio-spectrum-ribbon',
    material: 'auto',
    lighting: 'aurora',
    bloom: 1.6,
    speed: 0.8,
    show3D: false,
    lineWidth: 0.26
  }
];
