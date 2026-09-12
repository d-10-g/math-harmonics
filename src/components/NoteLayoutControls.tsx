import { NOTE_LAYOUTS, type NoteLayoutSettings } from "../lib/noteLayout";
export default function NoteLayoutControls({
  value,
  onChange,
}: {
  value: NoteLayoutSettings;
  onChange: (value: NoteLayoutSettings) => void;
}) {
  return (
    <div
      data-spatial-section="Object layout"
      className="space-y-3 rounded-lg border border-fuchsia-400/20 p-3 text-xs text-white/75"
    >
      <label className="block">
        Channel geometry
        <select
          aria-label="Channel geometry"
          value={value.geometry}
          onChange={(event) =>
            onChange({
              ...value,
              geometry: event.target.value as NoteLayoutSettings["geometry"],
            })
          }
          className="mt-1 block w-full rounded bg-slate-800 p-2"
        >
          {NOTE_LAYOUTS.map((layout) => (
            <option key={layout} value={layout}>
              {layout[0].toUpperCase() + layout.slice(1)}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        Copies per note: {value.copies}
        <input
          aria-label="Copies per note"
          className="mt-1 w-full accent-fuchsia-500"
          type="range"
          min="1"
          max="8"
          step="1"
          value={value.copies}
          onChange={(event) =>
            onChange({ ...value, copies: +event.target.value })
          }
        />
      </label>
      <label className="block">
        Copy offset: {value.offset.toFixed(1)}
        <input
          aria-label="Copy offset"
          className="mt-1 w-full accent-fuchsia-500"
          type="range"
          min="0"
          max="4"
          step="0.1"
          disabled={value.copies === 1}
          value={value.offset}
          onChange={(event) =>
            onChange({ ...value, offset: +event.target.value })
          }
        />
      </label>
      <p className="text-[10px] leading-relaxed text-white/40">
        Spacing spreads notes along the selected path. Copies include the
        original; offset stacks them vertically. Audio plays once.
      </p>
    </div>
  );
}
