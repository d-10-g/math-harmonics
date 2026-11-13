import type { WebGPUMaterialProfile } from '../constants';
import { PHYSICAL_MATERIAL_PROFILES } from '../lib/materials';
import {
  patchPrismChannel, PRISM_GLB_ASSETS, PRISM_OBJ_ASSETS, PRISM_STATIC_SHAPES, PRISM_MATERIAL_LABELS,
  resolvePrismChannel, resolveMixedPrismChannel,
  type PrismChannelChoice, type PrismChannelMap, type PrismChannelMaterial, type PrismChannelKind, type PrismStaticShape,
} from '../lib/prismChannels';
import type { PrismFinish } from '../lib/prismTrail';

export default function PrismChannelControls({ value, onChange, channels, materialProfile = 'auto', finish, mixed = false }: {
  value: PrismChannelMap;
  onChange: (value: PrismChannelMap) => void;
  channels: number[];
  materialProfile?: WebGPUMaterialProfile;
  finish: PrismFinish;
  mixed?: boolean;
}) {
  const activeChannels = [...new Set(channels.filter(channel => Number.isInteger(channel) && channel >= 0 && channel <= 15))].sort((a, b) => a - b);
  const update = (channel: number, patch: Partial<PrismChannelChoice>) => {
    onChange(patchPrismChannel(value, channel, patch, mixed));
  };
  const selectClass = 'mt-1 block w-full rounded-md border border-white/15 bg-slate-950 p-2 text-[11px] text-fuchsia-100';
  const kindLabel = (kind: PrismChannelKind) => kind === 'glb' ? 'Animated GLB' : kind === 'obj' ? 'OBJ sculpture' : 'Built-in shape';
  const materialLabel = (material: string) => material === 'original' ? 'Original' : material === 'spectrum' ? 'Luminous spectrum' : PRISM_MATERIAL_LABELS[material as keyof typeof PRISM_MATERIAL_LABELS];
  return <div data-spatial-section={mixed ? 'Flight channels' : 'GLB flight channels'} className="space-y-3 rounded-lg border border-cyan-300/15 p-2.5">
    <div className="flex items-center justify-between gap-2">
      <div className="text-xs font-semibold text-cyan-200">{mixed ? 'Channel visuals' : 'Animated channel models'}</div>
      <button type="button" onClick={() => onChange({})} className="rounded border border-white/15 px-2 py-1 text-[10px] text-white/60 hover:text-white">{mixed ? 'Restore mixed defaults' : 'Reset flight channels'}</button>
    </div>
    <p className="text-[10px] leading-relaxed text-white/45">{mixed
      ? 'Mix animated GLBs, OBJ sculptures, and built-in shapes in one flight. Each MIDI channel has its own visual and finish. Original preserves authored model materials; Luminous spectrum paints static shapes with the prism shader.'
      : 'Each MIDI channel paints its own animated model. Choose a rig, movement, and finish; Original keeps the model’s authored materials. Auto uses the Output material or a different finish per channel.'}</p>
    <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
      {activeChannels.map(channel => {
        const resolved = mixed ? resolveMixedPrismChannel(value, channel, materialProfile, finish)
          : { kind: 'glb' as const, ...resolvePrismChannel(value, channel, materialProfile, finish) };
        const choice = value[channel] ?? {};
        const pool = resolved.kind === 'obj' ? PRISM_OBJ_ASSETS : PRISM_GLB_ASSETS;
        const materialValue = resolved.kind === 'shape' && choice.material === 'original' ? 'auto' : choice.material ?? 'auto';
        return <div key={channel} className="space-y-2 border-t border-white/10 pt-2">
          {mixed && <label className="block text-[10px] text-white/70">Channel {channel + 1} visual type
            <select aria-label={`Flight channel ${channel + 1} source`} className={selectClass} value={choice.kind ?? 'auto'}
              onChange={event => update(channel, { kind: event.target.value === 'auto' ? undefined : event.target.value as PrismChannelKind, asset: undefined, shape: undefined, movement: undefined })}>
              <option value="auto">Auto → {kindLabel(resolved.kind)}</option>
              <option value="glb">Animated GLB</option><option value="obj">OBJ sculpture</option><option value="shape">Built-in shape</option>
            </select>
          </label>}
          {resolved.kind === 'shape' ? <label className="block text-[10px] text-white/70">Shape
            <select aria-label={`Flight channel ${channel + 1} shape`} className={selectClass} value={choice.shape ?? 'auto'}
              onChange={event => update(channel, { kind: 'shape', shape: event.target.value === 'auto' ? undefined : event.target.value as PrismStaticShape, asset: undefined, movement: undefined })}>
              <option value="auto">Auto → {PRISM_STATIC_SHAPES.find(([id]) => id === resolved.shape)?.[1]}</option>
              {PRISM_STATIC_SHAPES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label> : <label className="block text-[10px] text-white/70">{mixed ? 'Model' : `Channel ${channel + 1} model`}
            <select aria-label={`Flight channel ${channel + 1} ${resolved.kind.toUpperCase()} model`} className={selectClass} value={pool.some(asset => asset.file === choice.asset) ? choice.asset : 'auto'}
              onChange={event => update(channel, { asset: event.target.value === 'auto' ? undefined : event.target.value, shape: undefined, movement: undefined })}>
              <option value="auto">Auto → {resolved.asset.file.replace(/_model\.glb$|\.obj$/i, '')}</option>
              {pool.map(asset => <option key={asset.file} value={asset.file}>{asset.file.replace(/_model\.glb$|\.obj$/i, '')}</option>)}
            </select>
          </label>}
          <label className="block text-[10px] text-white/70">Material
            <select aria-label={`Flight channel ${channel + 1} material`} className={selectClass} value={materialValue}
              onChange={event => update(channel, { material: event.target.value as PrismChannelMaterial })}>
              <option value="auto">Auto → {materialLabel(resolved.material)}</option>
              {resolved.kind !== 'shape' && <option value="original">{resolved.kind === 'glb' ? 'Original GLB materials' : 'Original OBJ / MTL materials'}</option>}
              <option value="spectrum">{resolved.kind === 'glb' ? 'Spectral physical materials' : 'Luminous spectrum · prism shader'}</option>
              {PHYSICAL_MATERIAL_PROFILES.map(profile => <option key={profile} value={profile}>{PRISM_MATERIAL_LABELS[profile]}</option>)}
            </select>
          </label>
          {resolved.kind === 'glb' && <label className="block text-[10px] text-white/70">Movement
            <select aria-label={`Flight channel ${channel + 1} movement`} className={selectClass} value={resolved.asset.movements.some(movement => movement.clip === choice.movement) ? choice.movement : 'auto'}
              onChange={event => update(channel, { movement: event.target.value === 'auto' ? undefined : event.target.value })}>
              <option value="auto">Auto → {resolved.asset.movements.find(movement => movement.clip === resolved.movement)?.name ?? 'Rest pose'}</option>
              {resolved.asset.movements.map(movement => <option key={movement.clip} value={movement.clip}>{movement.name}</option>)}
            </select>
          </label>}
        </div>;
      })}
    </div>
    <p className="text-[10px] leading-relaxed text-white/45">{mixed ? 'GLBs retain their released gesture; static visuals grow with held notes. Recent history is shared fairly across channels within the geometry budget, including when Trail memory is zero.' : 'Retained models keep their released pose. Recent history is bounded for animated rigs, including when Trail memory is zero.'}</p>
  </div>;
}
