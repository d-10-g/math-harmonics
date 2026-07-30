import { createStore } from 'zustand/vanilla';
import { useEffect, useState } from 'react';

// The animation clock lives outside React so the tree doesn't re-render per
// frame. Renderers read it inside their own loops (useFrame / setAnimationLoop);
// UI reads a low-rate snapshot via useClockSnapshot.

export const PHASE_RANGE = Math.PI * 4;

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
  lastBeatAt: 0
}));

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

export const clearAudioBands = () => clockStore.setState({ bass: 0, mid: 0, treble: 0 });

export const markBeat = () => clockStore.setState({ lastBeatAt: performance.now() });

export function startClock() {
  let raf = 0;
  let last = performance.now();
  let fpsEma = 0;

  const tick = () => {
    const now = performance.now();
    const deltaSeconds = Math.min(0.1, (now - last) / 1000);
    last = now;

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
    }

    clockStore.setState({ time: nextTime, fps: fpsEma, frameMs: deltaSeconds * 1000 });
    raf = requestAnimationFrame(tick);
  };

  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

export function useClockSnapshot(hz = 10): ClockState {
  const [snapshot, setSnapshot] = useState<ClockState>(() => clockStore.getState());

  useEffect(() => {
    const id = window.setInterval(() => setSnapshot({ ...clockStore.getState() }), 1000 / hz);
    return () => window.clearInterval(id);
  }, [hz]);

  return snapshot;
}
