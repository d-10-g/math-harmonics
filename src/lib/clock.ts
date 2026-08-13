import { createStore } from 'zustand/vanilla';
import { useEffect, useState } from 'react';

// The animation clock lives outside React so the tree doesn't re-render per
// frame. Renderers read it inside their own loops (useFrame / setAnimationLoop);
// UI reads a low-rate snapshot via useClockSnapshot.

export const PHASE_RANGE = Math.PI * 4;

export type ActiveNote = {
  id: number; // index into the parsed score's note list — stable identity
  pitch: number; // raw MIDI pitch, for exact lattice matching
  pitch01: number; // normalized to the file's own pitch range
  velocity01: number;
  env: number; // attack -> sustain -> release envelope, 0..1
  // Instrument group (distinct track:channel pairs, largest first, capped) —
  // the constellation gives each group its own formula and material.
  group: number;
};

// One entry per distinct (group, pitch) the score will ever play — the
// "always show" display mode renders this as a persistent lattice that
// note-ons light up.
export type LatticeNote = {
  group: number;
  pitch: number;
  pitch01: number;
};

export type NoteFxMode = 'both' | 'morph' | 'pulse' | 'off';

export type ClockState = {
  time: number;
  isPlaying: boolean;
  speed: number;
  audioSync: boolean;
  bpmInterval: number;
  speedQuant: number;
  fps: number;
  frameMs: number;
  verts: number;
  // Smoothed audio band energies in [0, ~1] while audio sync is active,
  // plus the timestamp of the last detected beat (performance.now()).
  bass: number;
  mid: number;
  treble: number;
  lastBeatAt: number;
  // MIDI note-level signals: melody is the normalized pitch of the latest
  // note (eased, 0..1 across the file's own pitch range), notePulse is a
  // velocity-scaled impulse that decays between note-ons. midiLive gates
  // note-driven morphing so mic mode and silence leave geometry untouched.
  melody: number;
  notePulse: number;
  midiLive: boolean;
  // Currently-sounding MIDI notes with per-note envelopes, for the
  // one-mesh-per-note constellation renderer. Published by the MIDI engine
  // each frame while the music plays; frozen on pause; empty otherwise.
  activeNotes: ActiveNote[];
  noteLattice: LatticeNote[];
  noteGroupCount: number;
  // User dials for the note-driven accents (morph depth, velocity pops).
  noteFxAmount: number; // 0..8, 2 = the tuned default
  noteFxMode: NoteFxMode;
  // Pitch-axis spacing between a channel's note meshes (constellation).
  noteSpread: number; // 0.5..10
  // A/B loop: when both are set, playback wraps inside [loopStart, loopEnd).
  loopStart: number | null;
  loopEnd: number | null;
};

export const clockStore = createStore<ClockState>(() => ({
  time: 0,
  isPlaying: true,
  speed: 0.1,
  audioSync: false,
  bpmInterval: 500,
  speedQuant: 0,
  fps: 0,
  frameMs: 0,
  verts: 0,
  bass: 0,
  mid: 0,
  treble: 0,
  lastBeatAt: 0,
  melody: 0.5,
  notePulse: 0,
  midiLive: false,
  activeNotes: [],
  noteLattice: [],
  noteGroupCount: 1,
  noteFxAmount: 2,
  noteFxMode: 'both',
  noteSpread: 5,
  loopStart: null,
  loopEnd: null
}));

// Dev-only debugging handle: lets a console (or automated test) watch the
// live signal state without touching production bundles.
if (import.meta.env.DEV) (globalThis as any).__harmonicsClock = clockStore;

export const getClockTime = () => clockStore.getState().time;

export const setClockTime = (time: number) => clockStore.setState({ time });

export const setClockPlayback = (
  partial: Partial<Pick<ClockState, 'isPlaying' | 'speed' | 'audioSync' | 'bpmInterval' | 'speedQuant'>>
) => clockStore.setState(partial);

export const reportVerts = (verts: number) => {
  if (clockStore.getState().verts !== verts) clockStore.setState({ verts });
};

export const setAudioBands = (bass: number, mid: number, treble: number) =>
  clockStore.setState({ bass, mid, treble });

export const clearAudioBands = () =>
  clockStore.setState({ bass: 0, mid: 0, treble: 0, melody: 0.5, notePulse: 0, midiLive: false, activeNotes: [] });

export const setNoteSignals = (melody: number, notePulse: number) =>
  clockStore.setState({ melody, notePulse, midiLive: true });

export const setActiveNotes = (activeNotes: ActiveNote[]) => clockStore.setState({ activeNotes });

export const setNoteGroupCount = (noteGroupCount: number) => clockStore.setState({ noteGroupCount });

export const setNoteLattice = (noteLattice: LatticeNote[]) => clockStore.setState({ noteLattice });

export const setNoteFx = (noteFxAmount: number, noteFxMode: NoteFxMode) =>
  clockStore.setState({ noteFxAmount, noteFxMode });

export const setNoteSpread = (noteSpread: number) => clockStore.setState({ noteSpread });

export const markBeat = () => clockStore.setState({ lastBeatAt: performance.now() });

export const setLoopPoint = (which: 'start' | 'end') => {
  const state = clockStore.getState();
  if (which === 'start') clockStore.setState({ loopStart: state.time });
  else clockStore.setState({ loopEnd: state.time });
};

export const clearLoop = () => clockStore.setState({ loopStart: null, loopEnd: null });

export function startClock() {
  let raf = 0;
  let last = performance.now();
  let fpsEma = 0;

  const tick = () => {
    const now = performance.now();
    const deltaSeconds = Math.min(0.1, (now - last) / 1000);
    last = now;
    advance(now, deltaSeconds);
  };

  const advance = (now: number, deltaSeconds: number) => {

    if (deltaSeconds > 0) {
      const instant = 1 / deltaSeconds;
      fpsEma = fpsEma === 0 ? instant : fpsEma * 0.95 + instant * 0.05;
    }

    const state = clockStore.getState();
    let nextTime = state.time;

    if (state.isPlaying) {
      let currentSpeed = state.speed;
      if (state.audioSync) {
        // One full phase revolution per beat at 1x, scaled by quantization
        const baseSpeed = 1000 / state.bpmInterval;
        const q = state.speedQuant;
        const mult = q >= 0 ? q + 1 : 1 / (Math.abs(q) + 1);
        currentSpeed = baseSpeed * mult;
      }
      nextTime = (state.time + deltaSeconds * currentSpeed) % PHASE_RANGE;

      // A/B loop wrap (requires a forward window)
      const { loopStart, loopEnd } = state;
      if (loopStart !== null && loopEnd !== null && loopEnd > loopStart + 0.01) {
        if (nextTime >= loopEnd || nextTime < loopStart) {
          nextTime = loopStart + ((nextTime - loopStart) % (loopEnd - loopStart) + (loopEnd - loopStart)) % (loopEnd - loopStart);
        }
      }
    }

    clockStore.setState({ time: nextTime, fps: fpsEma, frameMs: deltaSeconds * 1000 });
  };

  const loop = () => {
    tick();
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  // Watchdog: window.requestAnimationFrame SUSPENDS during immersive WebXR
  // sessions (the headset drives its own frame loop) and in hidden tabs.
  // Timers keep firing, so this keeps the musical clock alive whenever rAF
  // stalls — without it, entering VR froze every time-driven visual.
  const watchdog = window.setInterval(() => {
    if (performance.now() - last > 80) tick();
  }, 33);

  return () => {
    cancelAnimationFrame(raf);
    window.clearInterval(watchdog);
  };
}

export function useClockSnapshot(hz = 10): ClockState {
  const [snapshot, setSnapshot] = useState<ClockState>(() => clockStore.getState());

  useEffect(() => {
    const id = window.setInterval(() => setSnapshot({ ...clockStore.getState() }), 1000 / hz);
    return () => window.clearInterval(id);
  }, [hz]);

  return snapshot;
}
