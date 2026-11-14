import { useEffect, useMemo, useState } from 'react';
import type { ParsedMidi } from './midi';
import { createFlightAutoPlan, sampleFlightAutoPlan, type FlightAutoPlan } from './flightAutoDirector';

type MusicTime = (() => { time: number; duration: number }) | undefined;
const readTime = (getMusicTime: MusicTime) => {
  const raw = getMusicTime?.().time ?? 0;
  return Number.isFinite(raw) ? Math.max(0, raw) : 0;
};

/** Only the flight subtree ticks. The application and its score geometry stay
 * stable while inexpensive shader uniforms dissolve between phrases. */
export function useFlightAutoDirector(midi: ParsedMidi | null, getMusicTime: MusicTime,
  enabled: boolean, interval = 100) {
  const plan = useMemo(() => enabled && midi ? createFlightAutoPlan(midi) : null, [midi, enabled]);
  const [clock, setClock] = useState<{ plan: FlightAutoPlan | null; time: number }>(() => ({ plan, time: readTime(getMusicTime) }));
  useEffect(() => {
    if (!plan) return;
    const tick = () => {
      const time = readTime(getMusicTime);
      setClock(previous => previous.plan === plan && previous.time === time ? previous : { plan, time });
    };
    tick();
    const id = window.setInterval(tick, interval);
    return () => window.clearInterval(id);
  }, [plan, getMusicTime, interval]);
  // A newly loaded score or an enable action must show the current phrase on
  // its first paint, before this plan's first interval/effect callback fires.
  const time = clock.plan === plan ? clock.time : readTime(getMusicTime);
  return useMemo(() => plan ? { ...sampleFlightAutoPlan(plan, time), plan } : null, [plan, time]);
}
