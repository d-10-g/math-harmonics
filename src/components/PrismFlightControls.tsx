import type { PrismFinish, PrismShape } from '../lib/prismTrail';
import type { WebGPUMaterialProfile } from '../constants';
import type { PrismChannelMap } from '../lib/prismChannels';
import PrismChannelControls from './PrismChannelControls';
import FlightEffectsControls from './FlightEffectsControls';
import { normalizeFlightEffects, type FlightEffectsSettings, type FlightShowcase } from '../lib/flightEffects';

export type PrismFlightSettings = {
  prismShape: PrismShape;
  prismFinish: PrismFinish;
  prismPathSpread: number;
  prismTrailLength: number;
  prismMesh: string;
  prismChannels: PrismChannelMap;
  prismEffects: FlightEffectsSettings;
};

export type PrismLook = 'spectral' | 'ornaments' | 'glass' | 'sculptures' | 'animated' | 'mixed';

const SHAPES: Array<[PrismShape, string]> = [
  ['spectrum', 'Prism fan'], ['sphere', 'Sphere'], ['crystal', 'Crystal'],
  ['torus', 'Torus'], ['knot', 'Knot'], ['mesh', 'OBJ sculpture'], ['glb', 'Animated GLB'], ['mixed', 'Mixed by channel'],
];
const FINISHES: Array<[PrismFinish, string]> = [
  ['spectrum', 'Luminous spectrum'], ['ornament', 'Polished ornament · PBR'], ['glass', 'Colored glass · PBR'],
];

export default function PrismFlightControls({ value, onChange, onLook, meshLibrary, perChannel, midiChannels = [0, 1, 2, 3], materialProfile = 'auto', onShowcase }: {
  value: PrismFlightSettings;
  onChange: (patch: Partial<PrismFlightSettings>) => void;
  onLook: (look: PrismLook) => void;
  meshLibrary: string[];
  perChannel: boolean;
  midiChannels?: number[];
  materialProfile?: WebGPUMaterialProfile;
  onShowcase?: (id: FlightShowcase) => void;
}) {
  const selectClass = 'mt-1 block w-full rounded-md border border-white/15 bg-slate-950 p-2 text-[11px] text-fuchsia-100';
  return <div className="space-y-3 border-b border-fuchsia-300/15 pb-3">
    <div>
      <div className="text-xs font-semibold text-fuchsia-200">Flight studio</div>
      <p className="mt-1 text-[10px] leading-relaxed text-white/50">Paint the score through space. Try a look, then mix shapes, surfaces, and flight paths.</p>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {([
          ['spectral', 'Spectral ribbons', 'from-fuchsia-500/25 to-cyan-500/15'],
          ['ornaments', 'Ornament parade', 'from-red-500/25 to-amber-400/20'],
          ['glass', 'Glass constellations', 'from-cyan-400/20 to-violet-500/25'],
          ['sculptures', 'Sculpture flight', 'from-amber-400/20 to-emerald-400/15'],
          ['animated', 'Animated flight', 'from-rose-400/20 to-sky-400/20'],
          ['mixed', 'Mixed flight', 'from-amber-400/20 to-violet-400/20'],
        ] as const).map(([id, name, gradient]) => <button key={id} type="button" onClick={() => onLook(id)}
          className={`min-h-9 rounded-md border border-white/10 bg-gradient-to-br ${gradient} px-2 py-2 text-[10px] font-semibold text-white/85 transition-colors hover:border-white/35 focus-visible:outline-2 focus-visible:outline-fuchsia-300`}>
          {name}
        </button>)}
      </div>
    </div>
    <FlightEffectsControls value={normalizeFlightEffects(value.prismEffects)} onChange={prismEffects => onChange({ prismEffects })} onShowcase={onShowcase} />
    <div className="grid grid-cols-2 gap-2">
      <label className="text-[10px] text-white/65">Trail shape
        <select aria-label="Prism trail shape" className={selectClass} value={value.prismShape}
          onChange={e => onChange({ prismShape: e.target.value as PrismShape })}>
          {SHAPES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
      <label className="text-[10px] text-white/65">{(value.prismShape === 'glb' || value.prismShape === 'mixed') ? 'Auto finish family' : 'Surface'}
        <select aria-label="Prism surface" className={selectClass} value={value.prismFinish}
          onChange={e => onChange({ prismFinish: e.target.value as PrismFinish })}>
          {FINISHES.map(([id, label]) => <option key={id} value={id}>{value.prismShape === 'glb' && id === 'spectrum' ? 'Spectral materials' : label}</option>)}
        </select>
      </label>
    </div>
    {value.prismShape === 'mesh' && <label className="block text-[10px] text-white/65">Sculpture from OBJ library
      <select aria-label="Prism sculpture" className={selectClass} value={value.prismMesh}
        onChange={e => onChange({ prismMesh: e.target.value })}>
        {meshLibrary.map(name => <option key={name} value={name}>{name}</option>)}
      </select>
      <span className="mt-1 block text-white/40">Detailed meshes retain recent notes within the GPU budget.</span>
    </label>}
    {(value.prismShape === 'glb' || value.prismShape === 'mixed') && <PrismChannelControls value={value.prismChannels ?? {}}
      onChange={prismChannels => onChange({ prismChannels })} channels={midiChannels} materialProfile={materialProfile} finish={value.prismFinish} mixed={value.prismShape === 'mixed'} />}
    <label className="block text-[10px] text-white/65">
      <span className="flex justify-between"><span>Flight divergence</span><span className="font-mono text-fuchsia-200">{value.prismPathSpread.toFixed(1)}×</span></span>
      <input aria-label="Prism flight divergence" type="range" min={0} max={2} step={0.1}
        disabled={!perChannel} value={value.prismPathSpread}
        onChange={e => onChange({ prismPathSpread: Number(e.target.value) })}
        className="mt-2 w-full accent-fuchsia-400 disabled:opacity-35" />
      <span className="text-white/40">{perChannel ? 'Spread channel headings, bank angles, and weaving paths.' : 'Choose One Per Channel below to diverge the flight paths.'}</span>
    </label>
    <label className="block text-[10px] text-white/65">
      <span className="flex justify-between"><span>Trail memory</span><span className="font-mono text-fuchsia-200">{value.prismTrailLength === 0 ? 'Whole score' : `${value.prismTrailLength}s`}</span></span>
      <input aria-label="Prism trail memory" type="range" min={0} max={120} step={5}
        value={value.prismTrailLength} onChange={e => onChange({ prismTrailLength: Number(e.target.value) })}
        className="mt-2 w-full accent-fuchsia-400" />
      <span className="text-white/40">Short memories leave room between phrases. Zero keeps history within the mesh budget.</span>
    </label>
    {value.prismShape !== 'glb' && value.prismShape !== 'mixed' && value.prismFinish !== 'spectrum' && <p className="text-[10px] leading-relaxed text-white/45">Uses the Output material profile and light rig. Auto chooses the matching ornament or glass finish.</p>}
  </div>;
}
