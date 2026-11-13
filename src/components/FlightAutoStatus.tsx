import type { ParsedMidi } from '../lib/midi';
import { FLIGHT_SHOWCASES } from '../lib/flightEffects';
import { FLIGHT_CAMERA_STYLES } from '../lib/flightCameraStyles';
import { useFlightAutoDirector } from '../lib/useFlightAutoDirector';

export default function FlightAutoStatus({ midi, getMusicTime }: {
  midi: ParsedMidi | null; getMusicTime?: () => { time: number; duration: number };
}) {
  const shot = useFlightAutoDirector(midi, getMusicTime, true, 500);
  const name = FLIGHT_SHOWCASES.find(scene => scene.id === shot?.section.scene)?.label;
  const camera = FLIGHT_CAMERA_STYLES.find(([id]) => id === shot?.section.camera)?.[1];
  return <p role="status" className="mb-3 rounded border border-fuchsia-300/20 bg-fuchsia-300/5 px-2 py-1.5 text-[10px] text-fuchsia-100">
    {shot ? `Phrase ${shot.index + 1} · ${name} · ${camera}${shot.blend < 1 ? ' · blending' : ''}` : 'Load a MIDI score to begin the automatic performance.'}
  </p>;
}
