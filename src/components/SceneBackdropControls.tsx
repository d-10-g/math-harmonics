export default function SceneBackdropControls({ showEnvironment, onEnvironmentChange, showStarfield, onStarfieldChange }: {
  showEnvironment: boolean; onEnvironmentChange: (value: boolean) => void;
  showStarfield: boolean; onStarfieldChange: (value: boolean) => void;
}) {
  return <div data-spatial-section="Backdrop" className="space-y-4">
    {([
      ['Cosmos backdrop', 'Rig-tinted dome (3D)', showEnvironment, onEnvironmentChange],
      ['Starfield', 'Independent of scenes · off by default', showStarfield, onStarfieldChange],
    ] as const).map(([label, hint, active, change]) => <div key={label} className="flex items-center justify-between gap-3 group">
      <div>
        <div className="text-xs font-semibold text-white/80 group-hover:text-white">{label}</div>
        <div className="text-[9px] text-white/30 font-mono">{hint}</div>
      </div>
      <button type="button" aria-label={label} aria-pressed={active} onClick={() => change(!active)}
        className={`flex h-5 w-10 shrink-0 items-center rounded-full px-1 transition-colors ${active ? 'bg-indigo-600' : 'bg-white/10'}`}>
        <div className={`h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${active ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>)}
  </div>;
}
