import type { WebGPUMaterialProfile } from '../constants';
import { PHYSICAL_MATERIAL_PROFILES } from './materials';
import { MODEL_ASSETS, type ModelAsset } from './modelChannels';
import type { PrismFinish } from './prismTrail';

export type PrismStaticShape = 'spectrum' | 'sphere' | 'crystal' | 'torus' | 'knot';
export type PrismChannelKind = 'glb' | 'obj' | 'shape';
export type PrismChannelMaterial = 'auto' | 'original' | 'spectrum' | WebGPUMaterialProfile;
export type PrismChannelChoice = {
  kind?: PrismChannelKind;
  shape?: PrismStaticShape;
  asset?: string;
  material?: PrismChannelMaterial;
  movement?: string;
};
export type PrismChannelMap = Record<string, PrismChannelChoice>;
type PhysicalMaterial = Exclude<WebGPUMaterialProfile, 'auto'>;
export type ResolvedMixedPrismChannel =
  | { kind: 'glb'; asset: ModelAsset; material: 'original' | PhysicalMaterial; movement?: string }
  | { kind: 'obj'; asset: ModelAsset; material: 'original' | 'spectrum' | PhysicalMaterial }
  | { kind: 'shape'; shape: PrismStaticShape; material: 'spectrum' | PhysicalMaterial };

export const PRISM_GLB_ASSETS: readonly ModelAsset[] = MODEL_ASSETS.filter(asset => asset.kind === 'glb');
export const PRISM_OBJ_ASSETS: readonly ModelAsset[] = MODEL_ASSETS.filter(asset => asset.kind === 'obj');
export const PRISM_STATIC_SHAPES: ReadonlyArray<readonly [PrismStaticShape, string]> = [
  ['spectrum', 'Prism fan'], ['sphere', 'Sphere'], ['crystal', 'Crystal'], ['torus', 'Torus'], ['knot', 'Knot'],
];
export const PRISM_MATERIAL_LABELS: Record<PhysicalMaterial, string> = {
  plasma: 'Plasma', 'liquid-metal': 'Liquid metal', pearl: 'Pearl', glass: 'Glass', velvet: 'Velvet',
  ceramic: 'Ceramic', hologram: 'Hologram', obsidian: 'Obsidian', copper: 'Copper', jade: 'Jade',
  xray: 'X-ray', carbon: 'Carbon', chrome: 'Chrome', ruby: 'Ruby', ice: 'Ice', neon: 'Neon',
  ornament: 'Ornament enamel', gold: 'Champagne gold', 'stained-glass': 'Stained glass', dichroic: 'Dichroic crystal',
};
const MATERIALS = new Set<string>(['auto', 'original', 'spectrum', ...PHYSICAL_MATERIAL_PROFILES]);
const GLASS_PROFILES: readonly PhysicalMaterial[] = ['glass', 'stained-glass', 'dichroic', 'ruby', 'ice', 'jade'];
const METAL_PROFILES: readonly PhysicalMaterial[] = [
  'ornament', 'gold', 'chrome', 'copper', 'pearl', 'liquid-metal', 'ceramic', 'obsidian',
  'jade', 'ruby', 'dichroic', 'ice', 'plasma', 'velvet', 'hologram', 'carbon',
];
const SPECTRAL_PROFILES: readonly PhysicalMaterial[] = ['plasma', 'neon', 'hologram', 'pearl'];

function channelNumber(channel: number) {
  return Number.isInteger(channel) && channel >= 0 && channel <= 15 ? channel : 0;
}

function resolveMaterial(choice: PrismChannelChoice | undefined, channel: number, globalProfile: WebGPUMaterialProfile,
  finish: PrismFinish, kind: PrismChannelKind): 'original' | 'spectrum' | PhysicalMaterial {
  const requested = choice?.material;
  if (requested === 'original' && kind !== 'shape') return 'original';
  if (requested === 'spectrum') return kind === 'glb' ? SPECTRAL_PROFILES[channel % SPECTRAL_PROFILES.length] : 'spectrum';
  if (requested && requested !== 'auto' && requested !== 'original' && MATERIALS.has(requested)) return requested;
  if (globalProfile !== 'auto' && MATERIALS.has(globalProfile)) return globalProfile;
  if (finish === 'spectrum' && kind !== 'glb') return 'spectrum';
  const palette = finish === 'glass' ? GLASS_PROFILES : finish === 'spectrum' ? SPECTRAL_PROFILES : METAL_PROFILES;
  return palette[channel % palette.length];
}

/** The existing Animated GLB mode always resolves a rig, including after a mixed-mode visit. */
export function resolvePrismChannel(
  map: PrismChannelMap | undefined,
  channel: number,
  globalProfile: WebGPUMaterialProfile = 'auto',
  finish: PrismFinish = 'ornament',
): { asset: ModelAsset; material: 'original' | PhysicalMaterial; movement?: string } {
  const index = channelNumber(channel);
  const choice = map?.[index];
  const asset = PRISM_GLB_ASSETS.find(asset => asset.file === choice?.asset)
    ?? PRISM_GLB_ASSETS[index % PRISM_GLB_ASSETS.length];
  if (!asset) throw new Error('The GLB flight library has no available models.');
  const material = resolveMaterial(choice, index, globalProfile, finish, 'glb') as 'original' | PhysicalMaterial;
  const movement = asset.movements.find(movement => movement.clip === choice?.movement)?.clip
    ?? asset.movements[(index * 7) % Math.max(1, asset.movements.length)]?.clip;
  return { asset, material, movement };
}

const DEFAULT_MIX: readonly PrismChannelChoice[] = [
  { kind: 'glb', asset: 'Ernie_model.glb' }, { kind: 'obj', asset: 'Star.obj' }, { kind: 'shape', shape: 'torus' },
  { kind: 'glb', asset: 'Kira_model.glb' }, { kind: 'obj', asset: 'Teapot.obj' }, { kind: 'shape', shape: 'sphere' },
];

export function resolveMixedPrismChannel(
  map: PrismChannelMap | undefined,
  channel: number,
  globalProfile: WebGPUMaterialProfile = 'auto',
  finish: PrismFinish = 'ornament',
): ResolvedMixedPrismChannel {
  const index = channelNumber(channel), choice = map?.[index];
  const preset = DEFAULT_MIX[index % DEFAULT_MIX.length];
  const selectedAsset = MODEL_ASSETS.find(asset => asset.file === choice?.asset);
  const legacyMovement = !choice?.kind && !selectedAsset && !choice?.shape
    && PRISM_GLB_ASSETS[index % PRISM_GLB_ASSETS.length]?.movements.some(movement => movement.clip === choice?.movement);
  const kind = choice?.kind ?? (selectedAsset?.kind) ?? (choice?.shape ? 'shape' : legacyMovement ? 'glb' : preset.kind!);
  if (kind === 'shape') {
    const shape = PRISM_STATIC_SHAPES.some(([id]) => id === choice?.shape) ? choice!.shape!
      : preset.kind === 'shape' ? preset.shape! : 'sphere';
    return { kind, shape, material: resolveMaterial(choice, index, globalProfile, finish, kind) as 'spectrum' | PhysicalMaterial };
  }
  if (kind === 'glb') {
    const asset = PRISM_GLB_ASSETS.find(asset => asset.file === choice?.asset)
      ?? PRISM_GLB_ASSETS.find(asset => asset.file === preset.asset)
      ?? PRISM_GLB_ASSETS[index % PRISM_GLB_ASSETS.length];
    if (!asset) throw new Error('The GLB flight library has no available models.');
    const movement = asset.movements.find(movement => movement.clip === choice?.movement)?.clip
      ?? asset.movements[(index * 7) % Math.max(1, asset.movements.length)]?.clip;
    return { kind, asset, material: resolveMaterial(choice, index, globalProfile, finish, kind) as 'original' | PhysicalMaterial, movement };
  }
  const asset = PRISM_OBJ_ASSETS.find(asset => asset.file === choice?.asset)
    ?? PRISM_OBJ_ASSETS.find(asset => asset.file === preset.asset)
    ?? PRISM_OBJ_ASSETS.find(asset => asset.file === 'Star.obj')
    ?? PRISM_OBJ_ASSETS[0];
  if (!asset) throw new Error('The OBJ flight library has no available models.');
  return { kind: 'obj', asset, material: resolveMaterial(choice, index, globalProfile, finish, 'obj') };
}

/** Validate URL and local mappings without admitting arbitrary asset URLs. */
export function normalizePrismChannels(value: unknown): PrismChannelMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: PrismChannelMap = {};
  for (const [key, row] of Object.entries(value)) {
    if (!/^(?:[0-9]|1[0-5])$/.test(key) || !row || typeof row !== 'object' || Array.isArray(row)) continue;
    const saved = row as Record<string, unknown>;
    const choice: PrismChannelChoice = {};
    if (saved.kind === 'glb' || saved.kind === 'obj' || saved.kind === 'shape') choice.kind = saved.kind;
    if (typeof saved.shape === 'string' && PRISM_STATIC_SHAPES.some(([id]) => id === saved.shape)
      && (!choice.kind || choice.kind === 'shape')) choice.shape = saved.shape as PrismStaticShape;
    const selectedAsset = MODEL_ASSETS.find(asset => asset.file === saved.asset);
    if (selectedAsset && choice.kind !== 'shape' && (!choice.kind || selectedAsset.kind === choice.kind) && !choice.shape) choice.asset = selectedAsset.file;
    const effectiveKind = choice.kind ?? (choice.shape ? 'shape' : selectedAsset && choice.asset ? selectedAsset.kind : undefined);
    if (typeof saved.material === 'string' && MATERIALS.has(saved.material)
      && !(effectiveKind === 'shape' && saved.material === 'original')) choice.material = saved.material as PrismChannelMaterial;
    if (typeof saved.movement === 'string' && effectiveKind !== 'obj' && effectiveKind !== 'shape') {
      // Unspecified legacy choices resolve against the old GLB defaults.
      const asset = choice.asset ? PRISM_GLB_ASSETS.find(asset => asset.file === choice.asset) : resolvePrismChannel({ [key]: choice }, Number(key)).asset;
      if (asset?.movements.some(movement => movement.clip === saved.movement)) choice.movement = saved.movement;
    }
    if (Object.keys(choice).length) result[key] = choice;
  }
  return result;
}

/** Apply a channel edit in the visible mode without leaving incompatible source fields. */
export function patchPrismChannel(map: PrismChannelMap, channel: number, patch: Partial<PrismChannelChoice>, mixed: boolean): PrismChannelMap {
  const glbSource: Partial<PrismChannelChoice> = mixed ? {} : {
    kind: 'glb', shape: undefined,
    ...('movement' in patch ? { asset: resolvePrismChannel(map, channel).asset.file } : {}),
  };
  return normalizePrismChannels({ ...map, [channel]: { ...map[channel], ...glbSource, ...patch } });
}
