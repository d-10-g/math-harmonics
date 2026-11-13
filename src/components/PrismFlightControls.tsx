import type { PrismFinish, PrismShape } from '../lib/prismTrail';
import type { WebGPUMaterialProfile } from '../constants';
import type { PrismChannelMap } from '../lib/prismChannels';
import PrismChannelControls from './PrismChannelControls';
import FlightEffectsControls from './FlightEffectsControls';
import { normalizeFlightEffects, type FlightEffectsSettings, type FlightShowcase } from '../lib/flightEffects';
import { FLIGHT_CAMERA_STYLES, normalizeFlightCameraStyle, normalizeFlightCameraEnergy, type FlightCameraStyle } from '../lib/flightCameraStyles';
import FlightAutoStatus from './FlightAutoStatus';
import type { ParsedMidi } from '../lib/midi';

export type PrismFlightSettings = {
  prismShape: PrismShape;
  prismFinish: PrismFinish;
  prismPathSpread: number;
  prismTrailLength: number;
  prismMesh: string;
  prismChannels: PrismChannelMap;
  prismEffects: FlightEffectsSettings;
  prismCameraFollow: boolean;
  prismCameraStyle: FlightCameraStyle;
  prismCameraEnergy: number;
  prismAutoDirector: boolean;
};

export type PrismLook = 'spectral' | 'ornaments' | 'glass' | 'sculptures' | 'animated' | 'mixed';

const SHAPES: Array<[PrismShape, string]> = [
  ['spectrum', 'Prism fan'], ['sphere', 'Sphere'], ['crystal', 'Crystal'],
  ['torus', 'Torus'], ['knot', 'Knot'], ['mesh', 'OBJ sculpture'], ['glb', 'Animated GLB'], ['mixed', 'Mixed by channel'],
];
const FINISHES: Array<[PrismFinish, string]> = [
  ['spectrum', 'Luminous spectrum'], ['ornament', 'Polished ornament · PBR'], ['glass', 'Colored glass · PBR'],
];

export default function PrismFlightControls({ value, onChange, onLook, meshLibrary, perChannel, midiChannels = [0, 1, 2, 3], materialProfile = 'auto', onShowcase, midi, getMusicTime }: {
  value: PrismFlightSettings;
  onChange: (patch: Partial<PrismFlightSettings>) => void;
  onLook: (look: PrismLook) => void;
  meshLibrary: string[];
  perChannel: boolean;
  midiChannels?: number[];
  materialProfile?: WebGPUMaterialProfile;
  onShowcase?: (id: FlightShowcase) => void;
  midi?: ParsedMidi | null;
  getMusicTime?: () => { time: number; duration: number };
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
    <div data-spatial-section="Flight camera" className="rounded-lg border border-cyan-300/20 bg-cyan-400/[0.03] p-2.5">
      <label className="mb-2 flex cursor-pointer items-center justify-between gap-3 text-xs font-semibold text-fuchsia-100">
        <span>Auto director</span>
        <input aria-label="Flight auto director" type="checkbox" checked={value.prismAutoDirector}
          onChange={event => onChange({ prismAutoDirector: event.target.checked })}
          className="h-4 w-4 accent-fuchsia-300" />
      </label>
      <p className="mb-3 text-[10px] leading-relaxed text-white/45">Blend visual looks and camera styles in musical phrases. Keeps your channel meshes, materials, and backdrop choices. Manual camera or FX edits take over.</p>
      {value.prismAutoDirector && <FlightAutoStatus midi={midi ?? null} getMusicTime={getMusicTime} />}
      <label className="flex cursor-pointer items-center justify-between gap-3 text-xs font-semibold text-cyan-100">
        <span>Camera follow</span>
        <input aria-label="Camera follow" type="checkbox" checked={value.prismCameraFollow}
          onChange={event => onChange({ prismCameraFollow: event.target.checked, ...(value.prismAutoDirector ? { prismAutoDirector: false } : {}) })}
          className="h-4 w-4 accent-cyan-300" />
      </label>
      <p className="mt-2 text-[10px] leading-relaxed text-white/45">{value.prismCameraFollow
        ? 'A smooth camera operator frames the active notes. Drag or zoom to take over briefly. In VR, the sculpture follows while your head stays in control.'
        : 'Keep the current view, or switch on a camera operator that gently follows the action.'}</p>
      <label className="mt-3 block text-[10px] text-white/70">{value.prismAutoDirector ? 'Manual follow style · change to take over' : 'Follow style'}
        <select aria-label="Camera follow style" value={normalizeFlightCameraStyle(value.prismCameraStyle)}
          disabled={!value.prismCameraFollow}
          onChange={event => onChange({ prismCameraStyle: normalizeFlightCameraStyle(event.target.value), ...(value.prismAutoDirector ? { prismAutoDirector: false } : {}) })}
          className={`${selectClass} disabled:opacity-35`}>
          {FLIGHT_CAMERA_STYLES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
      <label className="mt-3 block text-[10px] text-white/70">
        <span className="flex items-center justify-between gap-2"><span>Musical camera energy</span><span className="font-mono text-cyan-200">{Math.round(normalizeFlightCameraEnergy(value.prismCameraEnergy) * 100)}%</span></span>
        <input aria-label="Camera musical energy" type="range" min={0} max={2} step={0.05}
          disabled={!value.prismCameraFollow || normalizeFlightCameraStyle(value.prismCameraStyle) === 'balanced'}
          value={normalizeFlightCameraEnergy(value.prismCameraEnergy)}
          onChange={event => onChange({ prismCameraEnergy: normalizeFlightCameraEnergy(Number(event.target.value)), ...(value.prismAutoDirector ? { prismAutoDirector: false } : {}) })}
          className="mt-2 w-full accent-cyan-300 disabled:opacity-35" />
        <span className="text-white/40">Score dynamics guide the shot without camera shake. Headsets keep natural head tracking.</span>
      </label>
    </div>
    {value.prismAutoDirector && <p className="text-[10px] leading-relaxed text-fuchsia-100/65">The phrase above names the live look and shot. The FX dials below hold your manual mix; editing one returns to that mix.</p>}
    <FlightEffectsControls value={normalizeFlightEffects(value.prismEffects)} onChange={prismEffects => onChange({ prismEffects, ...(value.prismAutoDirector ? { prismAutoDirector: false } : {}) })} onShowcase={onShowcase} />
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
