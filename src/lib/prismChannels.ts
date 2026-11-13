import type { WebGPUMaterialProfile } from '../constants';
import { PHYSICAL_MATERIAL_PROFILES } from './materials';
import { MODEL_ASSETS, type ModelAsset } from './modelChannels';
import type { PrismFinish } from './prismTrail';

export type PrismChannelMaterial = 'auto' | 'original' | WebGPUMaterialProfile;
export type PrismChannelChoice = {
  asset?: string;
  material?: PrismChannelMaterial;
  movement?: string;
};
export type PrismChannelMap = Record<string, PrismChannelChoice>;
export const PRISM_GLB_ASSETS: readonly ModelAsset[] = MODEL_ASSETS.filter(asset => asset.kind === 'glb');
export const PRISM_MATERIAL_LABELS: Record<Exclude<WebGPUMaterialProfile, 'auto'>, string> = {
  plasma: 'Plasma', 'liquid-metal': 'Liquid metal', pearl: 'Pearl', glass: 'Glass', velvet: 'Velvet',
  ceramic: 'Ceramic', hologram: 'Hologram', obsidian: 'Obsidian', copper: 'Copper', jade: 'Jade',
  xray: 'X-ray', carbon: 'Carbon', chrome: 'Chrome', ruby: 'Ruby', ice: 'Ice', neon: 'Neon',
  ornament: 'Ornament enamel', gold: 'Champagne gold', 'stained-glass': 'Stained glass', dichroic: 'Dichroic crystal',
};
const MATERIALS = new Set<string>(['auto', 'original', ...PHYSICAL_MATERIAL_PROFILES]);
const GLASS_PROFILES: readonly Exclude<WebGPUMaterialProfile, 'auto'>[] = ['glass', 'stained-glass', 'dichroic', 'ruby', 'ice', 'jade'];
const METAL_PROFILES: readonly Exclude<WebGPUMaterialProfile, 'auto'>[] = [
  'ornament', 'gold', 'chrome', 'copper', 'pearl', 'liquid-metal', 'ceramic', 'obsidian',
  'jade', 'ruby', 'dichroic', 'ice', 'plasma', 'velvet', 'hologram', 'carbon',
];
const SPECTRAL_PROFILES: readonly Exclude<WebGPUMaterialProfile, 'auto'>[] = ['plasma', 'neon', 'hologram', 'pearl'];

function channelNumber(channel: number) {
  return Number.isInteger(channel) && channel >= 0 && channel <= 15 ? channel : 0;
}

export function resolvePrismChannel(
  map: PrismChannelMap | undefined,
  channel: number,
  globalProfile: WebGPUMaterialProfile = 'auto',
  finish: PrismFinish = 'ornament',
): { asset: ModelAsset; material: 'original' | Exclude<WebGPUMaterialProfile, 'auto'>; movement?: string } {
  const index = channelNumber(channel);
  const choice = map?.[index];
  const asset = PRISM_GLB_ASSETS.find(asset => asset.file === choice?.asset)
    ?? PRISM_GLB_ASSETS[index % PRISM_GLB_ASSETS.length];
  if (!asset) throw new Error('The GLB flight library has no available models.');
  const palettes = finish === 'glass' ? GLASS_PROFILES : finish === 'spectrum' ? SPECTRAL_PROFILES : METAL_PROFILES;
  const requested = choice?.material;
  const material = requested === 'original' ? 'original'
    : requested && requested !== 'auto' && MATERIALS.has(requested) ? requested
    : globalProfile !== 'auto' && MATERIALS.has(globalProfile) ? globalProfile
    : palettes[index % palettes.length];
  const movement = asset.movements.find(movement => movement.clip === choice?.movement)?.clip
    ?? asset.movements[(index * 7) % Math.max(1, asset.movements.length)]?.clip;
  return { asset, material, movement };
}

/** Validate both URL and local-storage mappings without admitting asset URLs. */
export function normalizePrismChannels(value: unknown): PrismChannelMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: PrismChannelMap = {};
  for (const [key, row] of Object.entries(value)) {
    if (!/^(?:[0-9]|1[0-5])$/.test(key) || !row || typeof row !== 'object' || Array.isArray(row)) continue;
    const saved = row as Record<string, unknown>;
    const choice: PrismChannelChoice = {};
    if (typeof saved.asset === 'string' && PRISM_GLB_ASSETS.some(asset => asset.file === saved.asset)) choice.asset = saved.asset;
    if (typeof saved.material === 'string' && MATERIALS.has(saved.material)) choice.material = saved.material as PrismChannelMaterial;
    const asset = resolvePrismChannel({ [key]: choice }, Number(key)).asset;
    if (typeof saved.movement === 'string' && asset.movements.some(movement => movement.clip === saved.movement)) choice.movement = saved.movement;
    if (Object.keys(choice).length) result[key] = choice;
  }
  return result;
}
