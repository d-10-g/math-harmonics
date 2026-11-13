import {
  DEFAULT_FLIGHT_EFFECTS, FLIGHT_MOTIONS, FLIGHT_SHOWCASES, normalizeFlightEffects,
  type FlightEffectsSettings, type FlightMotion, type FlightShowcase,
} from '../lib/flightEffects';

type NumericEffect = Exclude<keyof FlightEffectsSettings, 'motion'>;
const DIALS: ReadonlyArray<{ id: NumericEffect; label: string; hint: string; max: number; step: number }> = [
  { id: 'bursts', label: 'Starbursts', hint: 'Particles bloom from note attacks.', max: 2, step: 0.05 },
  { id: 'shockwaves', label: 'Shockwave rings', hint: 'Expanding halos mark each new note.', max: 2, step: 0.05 },
  { id: 'lasers', label: 'Laser filaments', hint: 'Light beams link notes within a channel.', max: 2, step: 0.05 },
  { id: 'tracers', label: 'Ribbon tracers', hint: 'Flowing traces follow the score through space.', max: 2, step: 0.05 },
  { id: 'auroras', label: 'Aurora silk', hint: 'Rippling veils of colored light bloom from the notes.', max: 2, step: 0.05 },
  { id: 'constellations', label: 'Chord constellations', hint: 'Nearby notes from different channels weave luminous webs.', max: 2, step: 0.05 },
  { id: 'gyroscopes', label: 'Orbital gyroscopes', hint: 'Nested hoops rotate around each note like celestial instruments.', max: 2, step: 0.05 },
  { id: 'morph', label: 'Liquid morph', hint: 'Bend static forms and soften rigged models with squash and stretch.', max: 1, step: 0.01 },
];
const GRADIENTS: Record<FlightShowcase, string> = {
  supernova: 'from-rose-500/25 to-amber-400/15',
  'neon-highway': 'from-cyan-400/20 to-fuchsia-500/25',
  'cosmic-jelly': 'from-violet-400/25 to-emerald-400/15',
  stargate: 'from-indigo-400/25 to-sky-400/20',
  'aurora-dream': 'from-emerald-400/25 to-violet-400/20',
  'quantum-garden': 'from-teal-400/20 to-fuchsia-400/25',
  'clockwork-nebula': 'from-amber-400/25 to-indigo-500/20',
};

export default function FlightEffectsControls({ value, onChange, onShowcase }: {
  value: FlightEffectsSettings;
  onChange: (value: FlightEffectsSettings) => void;
  onShowcase?: (id: FlightShowcase) => void;
}) {
  const effects = normalizeFlightEffects(value);
  const patch = (change: Partial<FlightEffectsSettings>) => onChange(normalizeFlightEffects({ ...effects, ...change }));
  return <div data-spatial-section="Flight FX" className="space-y-3 rounded-lg border border-sky-300/20 bg-sky-400/[0.03] p-2.5">
    <div className="flex items-center justify-between gap-2">
      <div className="text-xs font-semibold text-sky-200">Flight FX laboratory</div>
      <button type="button" onClick={() => onChange({ ...DEFAULT_FLIGHT_EFFECTS })}
        className="rounded-md border border-white/15 px-2 py-1 text-[10px] text-white/65 transition-colors hover:border-sky-200/40 hover:text-white">
        Clear flight FX
      </button>
    </div>
    <p className="text-[10px] leading-relaxed text-white/50">Surprise scenes, then your own mix. Effects follow score time, so pause and seeking reproduce the same motion.</p>
    <div className="grid grid-cols-2 gap-1.5">
      {FLIGHT_SHOWCASES.map(showcase => <button key={showcase.id} type="button" aria-label={showcase.label}
        onClick={() => onShowcase ? onShowcase(showcase.id) : onChange({ ...showcase.effects })}
        className={`min-h-[58px] rounded-md border border-white/15 bg-gradient-to-br ${GRADIENTS[showcase.id]} px-2 py-2 text-left transition-colors hover:border-sky-200/45 focus-visible:outline-2 focus-visible:outline-sky-200`}>
        <span className="block text-[11px] font-semibold text-white/90">{showcase.label}</span>
        <span className="mt-1 block text-[9px] leading-snug text-white/50">{showcase.description}</span>
      </button>)}
    </div>
    <p className="text-[10px] leading-relaxed text-white/45">{onShowcase
      ? 'Showcases set the models, materials, lighting, and FX together. Use the dials to combine effects with your current channel choices; Clear flight FX removes only the extra effects.'
      : 'Showcases apply an effect mix. Use the dials to combine your own; Clear flight FX removes only the extra effects.'}</p>
    <div className="space-y-3 pt-1">
      {DIALS.map(dial => <label key={dial.id} className="block text-[10px] text-white/70">
        <span className="flex items-center justify-between gap-2"><span>{dial.label}</span><span className="font-mono text-sky-200">{Math.round(effects[dial.id] * 100)}%</span></span>
        <input aria-label={`Flight ${dial.id}`} type="range" min={0} max={dial.max} step={dial.step}
          value={effects[dial.id]} onChange={event => patch({ [dial.id]: Number(event.target.value) })}
          className="mt-2 w-full accent-sky-300" />
        <span className="text-white/40">{dial.hint}</span>
      </label>)}
      <label className="block text-[10px] text-white/70">Motion field
        <select aria-label="Flight motion" value={effects.motion}
          onChange={event => patch({ motion: event.target.value as FlightMotion })}
          className="mt-1 block w-full rounded-md border border-white/15 bg-slate-950 p-2 text-[11px] text-sky-100">
          {FLIGHT_MOTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
      <label className="block text-[10px] text-white/70">
        <span className="flex items-center justify-between gap-2"><span>Motion strength</span><span className="font-mono text-sky-200">{Math.round(effects.motionAmount * 100)}%</span></span>
        <input aria-label="Flight motion amount" type="range" min={0} max={2} step={0.05}
          disabled={effects.motion === 'none'} value={effects.motionAmount}
          onChange={event => patch({ motionAmount: Number(event.target.value) })}
          className="mt-2 w-full accent-sky-300 disabled:opacity-35" />
        <span className="text-white/40">{effects.motion === 'none' ? 'Choose a motion field to move the note sculptures.' : 'Spread and amplify the movement around each flight path.'}</span>
      </label>
    </div>
  </div>;
}
