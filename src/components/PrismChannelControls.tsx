import type { WebGPUMaterialProfile } from '../constants';
import { PHYSICAL_MATERIAL_PROFILES } from '../lib/materials';
import {
  normalizePrismChannels, PRISM_GLB_ASSETS, PRISM_MATERIAL_LABELS, resolvePrismChannel,
  type PrismChannelChoice, type PrismChannelMap, type PrismChannelMaterial,
} from '../lib/prismChannels';
import type { PrismFinish } from '../lib/prismTrail';

export default function PrismChannelControls({ value, onChange, channels, materialProfile = 'auto', finish }: {
  value: PrismChannelMap;
  onChange: (value: PrismChannelMap) => void;
  channels: number[];
  materialProfile?: WebGPUMaterialProfile;
  finish: PrismFinish;
}) {
  const activeChannels = [...new Set(channels.filter(channel => Number.isInteger(channel) && channel >= 0 && channel <= 15))].sort((a, b) => a - b);
  const update = (channel: number, patch: Partial<PrismChannelChoice>) => {
    onChange(normalizePrismChannels({ ...value, [channel]: { ...value[channel], ...patch } }));
  };
  const selectClass = 'mt-1 block w-full rounded-md border border-white/15 bg-slate-950 p-2 text-[11px] text-fuchsia-100';
  return <div data-spatial-section="GLB flight channels" className="space-y-3 rounded-lg border border-cyan-300/15 p-2.5">
    <div className="flex items-center justify-between gap-2">
      <div className="text-xs font-semibold text-cyan-200">Animated channel models</div>
      <button type="button" onClick={() => onChange({})} className="rounded border border-white/15 px-2 py-1 text-[10px] text-white/60 hover:text-white">Reset flight channels</button>
    </div>
    <p className="text-[10px] leading-relaxed text-white/45">Each MIDI channel paints its own animated model. Choose a rig, movement, and finish; Original keeps the model’s authored materials. Auto uses the Output material or a different finish per channel.</p>
    <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
      {activeChannels.map(channel => {
        const resolved = resolvePrismChannel(value, channel, materialProfile, finish);
        const choice = value[channel] ?? {};
        return <div key={channel} className="space-y-2 border-t border-white/10 pt-2">
          <label className="block text-[10px] text-white/70">Channel {channel + 1} model
            <select aria-label={`Flight channel ${channel + 1} GLB model`} className={selectClass} value={choice.asset ?? 'auto'}
              onChange={event => update(channel, { asset: event.target.value === 'auto' ? undefined : event.target.value, movement: undefined })}>
              <option value="auto">Auto → {resolved.asset.file.replace('_model.glb', '')}</option>
              {PRISM_GLB_ASSETS.map(asset => <option key={asset.file} value={asset.file}>{asset.file.replace('_model.glb', '')}</option>)}
            </select>
          </label>
          <label className="block text-[10px] text-white/70">Material
            <select aria-label={`Flight channel ${channel + 1} material`} className={selectClass} value={choice.material ?? 'auto'}
              onChange={event => update(channel, { material: event.target.value as PrismChannelMaterial })}>
              <option value="auto">Auto → {resolved.material === 'original' ? 'Original' : PRISM_MATERIAL_LABELS[resolved.material]}</option>
              <option value="original">Original GLB materials</option>
              {PHYSICAL_MATERIAL_PROFILES.map(profile => <option key={profile} value={profile}>{PRISM_MATERIAL_LABELS[profile]}</option>)}
            </select>
          </label>
          <label className="block text-[10px] text-white/70">Movement
            <select aria-label={`Flight channel ${channel + 1} movement`} className={selectClass} value={choice.movement ?? 'auto'}
              onChange={event => update(channel, { movement: event.target.value === 'auto' ? undefined : event.target.value })}>
              <option value="auto">Auto → {resolved.asset.movements.find(movement => movement.clip === resolved.movement)?.name ?? 'Rest pose'}</option>
              {resolved.asset.movements.map(movement => <option key={movement.clip} value={movement.clip}>{movement.name}</option>)}
            </select>
          </label>
        </div>;
      })}
    </div>
    <p className="text-[10px] leading-relaxed text-white/45">Retained models keep their released pose. Recent history is bounded for animated rigs, including when Trail memory is zero.</p>
  </div>;
}
