import { useStore } from 'zustand';
import { cn } from '../lib/utils';
import { ALPHABET_LETTERS, alphabetStatus, frameAngles, type AlphabetSettings } from '../lib/alphabetSphere';

// Flat-screen furniture for the Alphabet Sphere: the aligned-letter badge,
// the A–Z bar and the fusion guides for the side-by-side stereo views. The
// bar is a spatial menu root, so a headset gets the same 26 buttons.

export default function AlphabetOverlay({ settings, onPickLetter }: {
  settings: AlphabetSettings;
  onPickLetter: (index: number) => void;
}) {
  const index = useStore(alphabetStatus, (state) => state.index);
  const { theta, phi } = frameAngles(index);
  const sideBySide = settings.stereo === 'crosseye' || settings.stereo === 'parallel';
  const leftTag = settings.stereo === 'crosseye' ? 'Right eye (cross)' : 'Left eye (parallel)';
  const rightTag = settings.stereo === 'crosseye' ? 'Left eye (cross)' : 'Right eye (parallel)';

  return (
    <div data-spatial-menu="Alphabet" className="contents">
      {sideBySide && (
        <div className="pointer-events-none absolute inset-0 z-[5]" aria-hidden="true">
          <div className="absolute inset-y-0 left-1/2 w-px bg-gradient-to-b from-transparent via-white/15 to-transparent" />
          {[
            { left: '25%', tag: leftTag },
            { left: '75%', tag: rightTag }
          ].map(({ left, tag }) => (
            <div key={left} className="absolute top-7 flex -translate-x-1/2 flex-col items-center gap-2" style={{ left }}>
              <div className="h-2.5 w-2.5 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.9)]" />
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">{tag}</div>
            </div>
          ))}
        </div>
      )}

      <div className="pointer-events-none absolute left-4 top-4 rounded-lg border border-white/10 bg-black/60 px-3 py-1.5 backdrop-blur">
        <div className="text-[10px] font-mono uppercase tracking-widest text-indigo-400">Alphabet Sphere</div>
        <div className="text-[8px] font-mono text-white/30">70,000 points · 26 viewing axes · drag to orbit</div>
      </div>

      <div
        data-spatial-status
        className="pointer-events-none absolute right-4 top-4 min-w-[118px] rounded-xl border border-white/15 bg-[#0c0f18]/85 px-5 py-3 text-center backdrop-blur"
      >
        <div className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Aligned 3D glyph</div>
        <div className="my-0.5 text-[40px] font-extrabold leading-[1.1] text-white [text-shadow:0_0_18px_rgba(255,255,255,0.55)]">
          {ALPHABET_LETTERS[index]}
        </div>
        <div className="font-mono text-[10.5px] text-slate-400">θ {theta}° · φ {phi}°</div>
      </div>

      <div className="absolute bottom-3 left-1/2 flex max-w-[94%] -translate-x-1/2 flex-wrap justify-center gap-1 rounded-lg border border-white/15 bg-[#0c0f18]/85 px-2.5 py-1.5 backdrop-blur">
        {ALPHABET_LETTERS.map((letter, i) => (
          <button
            key={letter}
            onClick={() => onPickLetter(i)}
            aria-pressed={i === index}
            aria-label={`Letter ${letter}`}
            title={`Fly to ${letter}`}
            className={cn(
              'h-7 w-7 rounded-md text-[11px] font-bold transition-colors',
              i === index ? 'bg-white text-[#05060a]' : 'bg-white/[0.09] text-slate-200 hover:bg-white/20'
            )}
          >
            {letter}
          </button>
        ))}
      </div>
    </div>
  );
}
