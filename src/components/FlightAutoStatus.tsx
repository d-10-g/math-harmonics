import { useMemo } from 'react';
import type { ParsedMidi } from '../lib/midi';
import { FLIGHT_SHOWCASES } from '../lib/flightEffects';
import { FLIGHT_CAMERA_STYLES } from '../lib/flightCameraStyles';
import { useFlightAutoDirector } from '../lib/useFlightAutoDirector';
import { createFlightAutoCastPlan } from '../lib/flightAutoCast';
import { PRISM_MATERIAL_LABELS, PRISM_STATIC_SHAPES } from '../lib/prismChannels';

export default function FlightAutoStatus({ midi, getMusicTime, autoCast = false }: {
  midi: ParsedMidi | null; getMusicTime?: () => { time: number; duration: number }; autoCast?: boolean;
}) {
  const shot = useFlightAutoDirector(midi, getMusicTime, true, 500);
  const casts = useMemo(() => autoCast && midi && shot?.plan ? createFlightAutoCastPlan(midi, shot.plan) : null,
    [autoCast, midi, shot?.plan]);
  const name = FLIGHT_SHOWCASES.find(scene => scene.id === shot?.section.scene)?.label;
  const camera = FLIGHT_CAMERA_STYLES.find(([id]) => id === shot?.section.camera)?.[1];
  return <div className="mb-3 rounded border border-fuchsia-300/20 bg-fuchsia-300/5 px-2 py-1.5 text-[10px] text-fuchsia-100">
    <p role="status">{shot ? `Phrase ${shot.index + 1} · ${name} · ${camera}${autoCast ? ' · auto cast' : ''}${shot.blend < 1 ? ' · blending' : ''}` : 'Load a MIDI score to begin the automatic performance.'}</p>
    {casts && shot && <div className="mt-2 max-h-28 space-y-1 overflow-y-auto border-t border-white/10 pt-2 text-white/60">
      <p className="text-amber-100/80">Phrase cast · mesh / surface</p>
      {casts.channels.map(channel => {
        const choice = casts.casts[shot.index][channel];
        const mesh = choice.kind === 'shape' ? PRISM_STATIC_SHAPES.find(([id]) => id === choice.shape)?.[1]
          : choice.asset?.replace(/(?:_model)?\.(?:glb|obj)$/i, '');
        const surface = choice.material === 'spectrum' ? 'Luminous spectrum'
          : PRISM_MATERIAL_LABELS[choice.material as keyof typeof PRISM_MATERIAL_LABELS] ?? choice.material;
        return <p key={channel} data-spatial-status>{`Channel ${channel + 1} · ${mesh} / ${surface}`}</p>;
      })}
    </div>}
  </div>;
}
