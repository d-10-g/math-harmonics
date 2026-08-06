/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { compile } from 'mathjs';
import Sidebar from './components/Sidebar';
import GraphView from './components/GraphView';
import Controls from './components/Controls';
import ErrorBoundary from './components/ErrorBoundary';

// The WebGPU path (three/webgpu + TSL) is a large chunk; load it only when
// the WebGPU renderer is actually selected. Headsets default to WebGL.
const WebGPUView = lazy(() => import('./components/WebGPUView'));
import {
  PRESET_FORMULAS,
  Formula,
  ShaderPreset,
  WebGPUGeometryProfile,
  WebGPULightingPreset,
  WebGPUMaterialProfile
} from './constants';
import { PRESET_SHADERS } from './shaders';
import { createXRStore } from '@react-three/xr';
import { clearAudioBands, clearLoop, markBeat, setAudioBands, setClockPlayback, setClockTime, setLoopPoint, setNoteSignals, startClock, useClockSnapshot } from './lib/clock';
import { loadSharedState, persistSharedState, resolveInitialFormula, resolveInitialShader } from './lib/urlState';
import { isVisionProSafari, shouldDefaultToWebGLForXR } from './lib/platform';
import { COMBOS, Combo } from './lib/combos';
import { parseMidi, ParsedMidi } from './lib/midi';

const APP_VERSION = `v${__APP_VERSION__}`;

const WEBGPU_LIGHTING_PRESETS: WebGPULightingPreset[] = ['studio', 'aurora', 'gallery', 'eclipse', 'caustic', 'noir', 'sunset', 'laboratory', 'underlight', 'prism'];
const WEBGPU_GEOMETRY_PRESETS: Exclude<WebGPUGeometryProfile, 'auto'>[] = [
  'ribbon',
  'surface',
  'lathe',
  'crystal',
  'extrude',
  'tube',
  'helix',
  'shell',
  'terrain',
  'constellation',
  'knot',
  'mandala',
  'lattice',
  'ripple',
  'prism',
  'vortex'
];
const WEBGPU_MATERIAL_PRESETS: Exclude<WebGPUMaterialProfile, 'auto'>[] = [
  'plasma',
  'liquid-metal',
  'pearl',
  'glass',
  'velvet',
  'ceramic',
  'hologram',
  'obsidian',
  'copper',
  'jade',
  'xray',
  'carbon',
  'chrome',
  'ruby',
  'ice',
  'neon'
];

const xrStore = createXRStore({
  // One-tap "Enter VR" offer from the browser chrome where supported
  // (Quest browser); harmlessly ignored elsewhere.
  offerSession: 'immersive-vr',
  domOverlay: false,
  frameRate: isVisionProSafari() ? 'mid' : 'high',
  frameBufferScaling: (maxFramebufferScale: number) => isVisionProSafari() ? Math.min(1, maxFramebufferScale) : maxFramebufferScale,
  foveation: 0,
  anchors: false,
  // visionOS 2+ Safari exposes WebXR hand input; it is an optional feature,
  // so requesting it is harmless where unsupported.
  handTracking: true,
  layers: false,
  hitTest: false,
  planeDetection: false,
  meshDetection: false,
  depthSensing: false
});

// Clock-driven UI lives in leaf components so ticking never re-renders App.
function TemporalReadout() {
  const clock = useClockSnapshot(10);
  return <span className="text-indigo-400">t = {clock.time.toFixed(3)} rad</span>;
}

function TimeScrubber({ onScrub }: { onScrub: () => void }) {
  const clock = useClockSnapshot(30);
  const PHASE_MAX = 12.566; // 4pi
  const hasLoop = clock.loopStart !== null && clock.loopEnd !== null;

  return (
    <>
      <div className="relative flex-1 flex items-center">
        {clock.loopStart !== null && (
          <div
            className="pointer-events-none absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-emerald-400"
            style={{ left: `${(clock.loopStart / PHASE_MAX) * 100}%` }}
            title="Loop start"
          />
        )}
        {clock.loopEnd !== null && (
          <div
            className="pointer-events-none absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-rose-400"
            style={{ left: `${(clock.loopEnd / PHASE_MAX) * 100}%` }}
            title="Loop end"
          />
        )}
        <input
          type="range"
          min="0"
          max={PHASE_MAX}
          step="0.001"
          value={clock.time}
          onChange={(e) => {
            onScrub();
            setClockTime(parseFloat(e.target.value));
          }}
          className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all"
        />
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => setLoopPoint('start')}
          className="px-2 py-1 rounded border border-emerald-400/30 bg-emerald-500/10 text-[9px] font-mono text-emerald-300 hover:bg-emerald-500/25 transition-colors"
          title="Set loop start (A) at current phase"
        >
          A
        </button>
        <button
          onClick={() => setLoopPoint('end')}
          className="px-2 py-1 rounded border border-rose-400/30 bg-rose-500/10 text-[9px] font-mono text-rose-300 hover:bg-rose-500/25 transition-colors"
          title="Set loop end (B) at current phase"
        >
          B
        </button>
        <button
          onClick={clearLoop}
          disabled={!hasLoop && clock.loopStart === null && clock.loopEnd === null}
          className="px-2 py-1 rounded border border-white/10 bg-white/5 text-[9px] font-mono text-white/45 hover:bg-white/15 transition-colors disabled:opacity-30"
          title="Clear A/B loop"
        >
          ✕
        </button>
      </div>
    </>
  );
}

function FooterStats() {
  const clock = useClockSnapshot(2);
  return <div>{clock.fps.toFixed(0)} fps / {clock.frameMs.toFixed(1)} ms</div>;
}

function FooterVerts() {
  const clock = useClockSnapshot(2);
  const verts = clock.verts >= 1000 ? `${(clock.verts / 1000).toFixed(1)}K` : `${clock.verts}`;
  return <span>Verts: {verts}</span>;
}

// Read once at module load: URL hash > localStorage > defaults.
const initialShared = loadSharedState();

// A truly fresh visit (base URL, nothing saved) opens on the demo scene:
// Neon Reactor staged with the bundled sonata, ready for one-tap playback.
// The welcome overlay's Play button provides the autoplay gesture browsers
// require. Share links and returning visitors are untouched.
const DEMO_MIDI_URL = './demo/martina-sonata.mid';
const DEMO_AUDIO_URL = './demo/martina-sonata.mp3';
const FIRST_VISIT = (() => {
  try {
    return !location.hash && !localStorage.getItem('harmonics.state.v1');
  } catch {
    return false;
  }
})();

// The welcome overlay shows once per person (not just per pristine browser):
// gated by its own flag so users whose saved state predates the demo still
// get the intro exactly once. `?demo` in the URL forces it any time.
const WELCOMED_KEY = 'harmonics.welcomed.v2';
const SHOW_WELCOME = (() => {
  try {
    if (new URLSearchParams(location.search).has('demo')) return true;
    if (location.hash) return false; // share links go straight to their scene
    return !localStorage.getItem(WELCOMED_KEY);
  } catch {
    return false;
  }
})();

function markWelcomed() {
  try {
    localStorage.setItem(WELCOMED_KEY, '1');
  } catch {
    // Storage unavailable; the overlay may show again next visit.
  }
}

if (FIRST_VISIT) {
  Object.assign(initialShared, {
    formulaId: 'surf-02', // Klein Bottle (Smoked Sunset Glass combo)
    // The WebGL path carries the audio-reactive rendering (bloom pulse,
    // light pulses, scale pulse) — the demo needs it.
    rendererMode: 'webgl',
    show3D: true,
    webgpuMaterial: 'glass',
    webgpuLightingPreset: 'sunset',
    postFX: true,
    bloomIntensity: 1.1,
    speed: 0.4,
    audioSource: 'midi'
  } satisfies Partial<typeof initialShared>);
}

// Favorites live in the Sidebar's localStorage set as `formula-<id>` /
// `shader-<id>` keys; cycling reads them fresh each step so stars toggled
// mid-session take effect immediately.
const FAVORITES_KEY = 'harmonics.favorites.v1';

// First run only (no favorites saved yet): seed the stars with the curated
// combo ingredients so the best of the library is one filter away. Runs at
// module load so the Sidebar's initial read already sees it.
try {
  if (!localStorage.getItem(FAVORITES_KEY)) {
    const seeds = new Set<string>();
    COMBOS.forEach((combo) => {
      seeds.add(`formula-${combo.formulaId}`);
      if (combo.shaderId) seeds.add(`shader-${combo.shaderId}`);
    });
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...seeds]));
  }
} catch {
  // Storage unavailable; favorites just start empty.
}

function favoriteIdSet(kind: 'formula' | 'shader'): Set<string> {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (raw) {
      return new Set(
        (JSON.parse(raw) as string[])
          .filter((key) => key.startsWith(`${kind}-`))
          .map((key) => key.slice(kind.length + 1))
      );
    }
  } catch {
    // Unreadable favorites fall back to the full library.
  }
  return new Set();
}

function cyclePool<T extends { id: string }>(all: T[], favoritesOnly: boolean, kind: 'formula' | 'shader'): T[] {
  if (!favoritesOnly) return all;
  const favorites = favoriteIdSet(kind);
  if (favorites.size === 0) return all;
  const pool = all.filter((item) => favorites.has(item.id));
  return pool.length > 0 ? pool : all;
}

export default function App() {
  const [selectedFormula, setSelectedFormula] = useState<Formula>(() => resolveInitialFormula(initialShared));
  const [selectedShader, setSelectedShader] = useState<ShaderPreset>(() => resolveInitialShader(initialShared));
  const [activeTab, setActiveTab] = useState<'formulas'|'shaders'>('formulas');
  const [speed, setSpeed] = useState(initialShared.speed ?? 0.1);
  const [isPlaying, setIsPlaying] = useState(true);
  const [show3D, setShow3D] = useState(initialShared.show3D ?? true);
  const [showWireframe, setShowWireframe] = useState(initialShared.showWireframe ?? false);
  const [showArtifacts, setShowArtifacts] = useState(initialShared.showArtifacts ?? false);
  const [showMirrors, setShowMirrors] = useState(initialShared.showMirrors ?? false);
  const [rendererMode, setRendererMode] = useState<'webgl' | 'webgpu'>(
    () => initialShared.rendererMode ?? (shouldDefaultToWebGLForXR() ? 'webgl' : 'webgpu')
  );
  const [webgpuLighting, setWebgpuLighting] = useState(initialShared.webgpuLighting ?? 1.5);
  const [webgpuLightingPreset, setWebgpuLightingPreset] = useState<WebGPULightingPreset>(initialShared.webgpuLightingPreset ?? 'studio');
  const [webgpuGeometry, setWebgpuGeometry] = useState<WebGPUGeometryProfile>(initialShared.webgpuGeometry ?? 'auto');
  const [webgpuMaterial, setWebgpuMaterial] = useState<WebGPUMaterialProfile>(initialShared.webgpuMaterial ?? 'auto');
  const [autoStyle, setAutoStyle] = useState(initialShared.autoStyle ?? true);
  const [cycleFavoritesOnly, setCycleFavoritesOnly] = useState(initialShared.cycleFavoritesOnly ?? false);
  const cycleFavoritesOnlyRef = useRef(cycleFavoritesOnly);
  useEffect(() => { cycleFavoritesOnlyRef.current = cycleFavoritesOnly; }, [cycleFavoritesOnly]);
  const [autoPilotShuffle, setAutoPilotShuffle] = useState(initialShared.autoPilotShuffle ?? false);
  const autoPilotShuffleRef = useRef(autoPilotShuffle);
  useEffect(() => { autoPilotShuffleRef.current = autoPilotShuffle; }, [autoPilotShuffle]);
  const [showEnvironment, setShowEnvironment] = useState(initialShared.showEnvironment ?? true);
  const [lineWidth, setLineWidth] = useState(initialShared.lineWidth ?? 0.14);
  const [postFX, setPostFX] = useState(initialShared.postFX ?? true);
  const [bloomIntensity, setBloomIntensity] = useState(initialShared.bloomIntensity ?? 0.9);
  const [autoCycleWebgpuLighting, setAutoCycleWebgpuLighting] = useState(false);
  const [autoCycleWebgpuGeometry, setAutoCycleWebgpuGeometry] = useState(false);
  const [autoCycleWebgpuMaterial, setAutoCycleWebgpuMaterial] = useState(false);
  const [webgpuLightingCycleSpeed, setWebgpuLightingCycleSpeed] = useState(4);
  const [webgpuGeometryCycleSpeed, setWebgpuGeometryCycleSpeed] = useState(5);
  const [webgpuMaterialCycleSpeed, setWebgpuMaterialCycleSpeed] = useState(4.5);
  
  const [autoCycleFormula, setAutoCycleFormula] = useState(FIRST_VISIT);
  const [autoCycleShader, setAutoCycleShader] = useState(false);
  const [formulaCycleSpeed, setFormulaCycleSpeed] = useState(3); // Seconds
  const [shaderCycleSpeed, setShaderCycleSpeed] = useState(5); // Seconds
  const [audioSync, setAudioSync] = useState(FIRST_VISIT);
  const audioSyncRef = useRef(audioSync);
  useEffect(() => { audioSyncRef.current = audioSync; }, [audioSync]);
  const [audioSource, setAudioSource] = useState<'mic' | 'midi'>(initialShared.audioSource ?? 'mic');
  const audioSourceRef = useRef(audioSource);
  useEffect(() => { audioSourceRef.current = audioSource; }, [audioSource]);
  const [midiInfo, setMidiInfo] = useState<(ParsedMidi & { name: string }) | null>(null);
  const midiAudioRef = useRef<HTMLAudioElement | null>(null);

  // Unified transport: while a MIDI session is live, Space and the Play/Pause
  // button drive the *music*, and the visual clock follows the audio element
  // (play/pause events below) — pausing the piece freezes the scene with it.
  // Without a MIDI session the button toggles the visual clock as before.
  const [audioPlaying, setAudioPlaying] = useState(false);
  const midiTransportLive = audioSync && audioSource === 'midi' && !!midiInfo;
  const transportShowsPause = midiTransportLive ? audioPlaying : isPlaying;
  const toggleTransport = () => {
    const audio = midiAudioRef.current;
    if (audioSync && audioSource === 'midi' && midiInfo && audio && audio.src) {
      if (audio.paused) void audio.play().catch(() => setIsPlaying((p) => !p));
      else audio.pause();
      return;
    }
    setIsPlaying((p) => !p);
  };
  const toggleTransportRef = useRef(toggleTransport);
  useEffect(() => { toggleTransportRef.current = toggleTransport; });

  useEffect(() => {
    const audio = midiAudioRef.current;
    if (!audio) return;
    const midiTransport = () => audioSyncRef.current && audioSourceRef.current === 'midi';
    const onPlay = () => {
      setAudioPlaying(true);
      if (midiTransport()) setIsPlaying(true);
    };
    // A finished piece fires 'pause' with ended=true — let the scene keep
    // moving on its own clock instead of freezing on the final chord.
    const onPause = () => {
      setAudioPlaying(false);
      if (midiTransport()) setIsPlaying(audio.ended);
    };
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, []);

  // Quantization (-10 to +10)
  const [speedQuant, setSpeedQuant] = useState(0); 
  const [formulaQuant, setFormulaQuant] = useState(FIRST_VISIT ? 3 : 0); // demo: new formula every 4th beat
  const [shaderQuant, setShaderQuant] = useState(0);
  const [bpmInterval, setBpmInterval] = useState(500); // ms

  const autoCycleFormulaRef = useRef(autoCycleFormula);
  useEffect(() => { autoCycleFormulaRef.current = autoCycleFormula; }, [autoCycleFormula]);

  const autoCycleShaderRef = useRef(autoCycleShader);
  useEffect(() => { autoCycleShaderRef.current = autoCycleShader; }, [autoCycleShader]);

  const formulaQuantRef = useRef(formulaQuant);
  useEffect(() => { formulaQuantRef.current = formulaQuant; }, [formulaQuant]);
  
  const shaderQuantRef = useRef(shaderQuant);
  useEffect(() => { shaderQuantRef.current = shaderQuant; }, [shaderQuant]);

  // Audio-reactive shaders are only meaningful (and only visible) while
  // audio sync runs; cycling skips them otherwise.
  const shaderCyclePool = () => {
    const base = audioSyncRef.current
      ? PRESET_SHADERS
      : PRESET_SHADERS.filter((s) => s.category !== 'Audio-reactive shaders');
    return cyclePool(base, cycleFavoritesOnlyRef.current, 'shader');
  };

  // Auto-pilot advance, shared by beat-triggered and timer-based cycling:
  // honors the favorites-only pool and the shuffle toggle.
  const autoAdvanceFormula = () => {
    setSelectedFormula(prev => {
      const pool = cyclePool(PRESET_FORMULAS, cycleFavoritesOnlyRef.current, 'formula');
      if (autoPilotShuffleRef.current) {
        if (pool.length <= 1) return pool[0] ?? prev;
        let next = prev;
        for (let i = 0; i < 8 && next.id === prev.id; i++) {
          next = pool[Math.floor(Math.random() * pool.length)];
        }
        return next;
      }
      const index = pool.findIndex(f => f.id === prev.id);
      return pool[(index + 1) % pool.length];
    });
  };

  const autoAdvanceShader = () => {
    setSelectedShader(prev => {
      const pool = shaderCyclePool();
      if (autoPilotShuffleRef.current) {
        if (pool.length <= 1) return pool[0] ?? prev;
        let next = prev;
        for (let i = 0; i < 8 && next.id === prev.id; i++) {
          next = pool[Math.floor(Math.random() * pool.length)];
        }
        return next;
      }
      const index = pool.findIndex(s => s.id === prev.id);
      return pool[(index + 1) % pool.length];
    });
  };

  // Audio-only content is hidden while sync is off; if an audio shader is
  // still selected when the section closes, step off it.
  useEffect(() => {
    if (audioSync) return;
    setSelectedShader((prev) => {
      if (prev.category !== 'Audio-reactive shaders') return prev;
      return PRESET_SHADERS.find((s) => s.category !== 'Audio-reactive shaders') ?? prev;
    });
  }, [audioSync]);

  // Load a MIDI file (and optionally its audio rendition) for MIDI-driven
  // sync. Also exposed as window.harmonicsMidi.load(midiUrl, audioUrl).
  const loadMidiSource = async (midiSource: File | string, audioSrc?: File | string) => {
    const buffer = typeof midiSource === 'string'
      ? await fetch(midiSource).then((r) => r.arrayBuffer())
      : await midiSource.arrayBuffer();
    const parsed = parseMidi(buffer);
    const name = typeof midiSource === 'string'
      ? midiSource.split('/').pop() ?? 'midi'
      : midiSource.name;
    setMidiInfo({ ...parsed, name });
    if (audioSrc && midiAudioRef.current) {
      midiAudioRef.current.src = typeof audioSrc === 'string' ? audioSrc : URL.createObjectURL(audioSrc);
    }
  };

  useEffect(() => {
    (window as any).harmonicsMidi = {
      load: (midiUrl: string, audioUrl?: string) => {
        setAudioSync(true);
        setAudioSource('midi');
        return loadMidiSource(midiUrl, audioUrl);
      }
    };
    return () => {
      delete (window as any).harmonicsMidi;
    };
  }, []);

  // MIDI-driven sync: ground-truth note events and the tempo-map beat grid
  // drive the same clock-store signals the mic path feeds, so every
  // audio-reactive visual (bands, bloom pulse, beat cycling with quant)
  // works identically — but sample-accurate to the score.
  useEffect(() => {
    if (!audioSync || audioSource !== 'midi' || !midiInfo) return;
    const audio = midiAudioRef.current;
    if (!audio) return;

    let raf = 0;
    let beatIndex = 0;
    let noteIndex = 0;
    let lastTime = -1;
    let bass = 0;
    let mid = 0;
    let treble = 0;
    let fBeatCount = 0;
    let sBeatCount = 0;

    // Band splits adapt to the file's own pitch range (terciles) so every
    // piece exercises all three bands — a notation export that never dips
    // below MIDI 52 would otherwise leave the bass band (and everything it
    // drives: scale pulse, bloom pulse, key light) permanently dark.
    const pitches = midiInfo.notes.map((n) => n.pitch).sort((a, b) => a - b);
    const lowSplit = pitches[Math.floor(pitches.length / 3)] ?? 52;
    const highSplit = pitches[Math.floor((2 * pitches.length) / 3)] ?? 74;
    const minPitch = pitches[0] ?? 0;
    const pitchSpan = Math.max(1, (pitches[pitches.length - 1] ?? 127) - minPitch);
    let melody = 0.5;
    let melodyTarget = 0.5;
    let notePulse = 0;

    const step = () => {
      const t = audio.currentTime;
      if (t < lastTime) {
        // Seek backwards: re-anchor both pointers.
        beatIndex = midiInfo.beats.findIndex((b) => b >= t);
        if (beatIndex < 0) beatIndex = midiInfo.beats.length;
        noteIndex = midiInfo.notes.findIndex((n) => n.time >= t);
        if (noteIndex < 0) noteIndex = midiInfo.notes.length;
      }
      lastTime = t;

      bass *= 0.9;
      mid *= 0.9;
      treble *= 0.9;
      notePulse *= 0.9;
      while (noteIndex < midiInfo.notes.length && midiInfo.notes[noteIndex].time <= t) {
        const note = midiInfo.notes[noteIndex++];
        const energy = Math.min(1, note.velocity / 96);
        if (note.pitch < lowSplit) bass = Math.min(1.2, bass + energy * 0.9);
        else if (note.pitch <= highSplit) mid = Math.min(1.2, mid + energy * 0.7);
        else treble = Math.min(1.2, treble + energy * 0.85);
        melodyTarget = (note.pitch - minPitch) / pitchSpan;
        notePulse = Math.min(1, notePulse + energy * 0.55);
      }
      melody += (melodyTarget - melody) * 0.16;

      if (!audio.paused) {
        setAudioBands(Math.min(1, bass), Math.min(1, mid), Math.min(1, treble));
        setNoteSignals(melody, notePulse);

        while (beatIndex < midiInfo.beats.length && midiInfo.beats[beatIndex] <= t) {
          const beatTime = midiInfo.beats[beatIndex++];
          const nextBeat = midiInfo.beats[beatIndex];
          if (nextBeat !== undefined) setBpmInterval(Math.max(120, (nextBeat - beatTime) * 1000));
          markBeat();

          if (autoCycleFormulaRef.current) {
            const fq = formulaQuantRef.current;
            const fMult = fq >= 0 ? fq + 1 : 1 / (Math.abs(fq) + 1);
            if (fMult >= 1) {
              fBeatCount++;
              if (fBeatCount >= fMult) {
                fBeatCount = 0;
                autoAdvanceFormula();
              }
            } else {
              const subBeats = Math.abs(fq) + 1;
              const interval = ((nextBeat ?? beatTime + 0.5) - beatTime) * 1000;
              autoAdvanceFormula();
              for (let i = 1; i < subBeats; i++) {
                setTimeout(autoAdvanceFormula, (interval / subBeats) * i);
              }
            }
          }

          if (autoCycleShaderRef.current) {
            const sq = shaderQuantRef.current;
            const sMult = sq >= 0 ? sq + 1 : 1 / (Math.abs(sq) + 1);
            if (sMult >= 1) {
              sBeatCount++;
              if (sBeatCount >= sMult) {
                sBeatCount = 0;
                autoAdvanceShader();
              }
            } else {
              const subBeats = Math.abs(sq) + 1;
              const interval = ((nextBeat ?? beatTime + 0.5) - beatTime) * 1000;
              autoAdvanceShader();
              for (let i = 1; i < subBeats; i++) {
                setTimeout(autoAdvanceShader, (interval / subBeats) * i);
              }
            }
          }
        }
      }

      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      clearAudioBands();
    };
  }, [audioSync, audioSource, midiInfo]);

  // Audio Reactivity & Quantization Logic
  useEffect(() => {
    if (!audioSync || audioSource !== 'mic') return;
    
    let audioCtx: AudioContext;
    let analyser: AnalyserNode;
    let source: MediaStreamAudioSourceNode;
    let animationId: number;
    let lastBeatTime = 0;
    let energyFloor = 0;
    
    // Beat counters for skipping beats (positive quantization)
    let fBeatCount = 0;
    let sBeatCount = 0;
    
    const triggerFormula = () => {
      if (autoCycleFormulaRef.current) autoAdvanceFormula();
    };

    const triggerShader = () => {
      if (autoCycleShaderRef.current) autoAdvanceShader();
    };

    const startAudio = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioCtx = new window.AudioContext();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);
        
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let bassEma = 0;
        let midEma = 0;
        let trebleEma = 0;

        const bandAverage = (from: number, to: number) => {
          let total = 0;
          for (let i = from; i < to; i++) total += dataArray[i];
          return total / ((to - from) * 255);
        };

        const detectBeat = () => {
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for(let i = 0; i < 8; i++) sum += dataArray[i];
          const average = sum / 8;

          // Smoothed band energies for audio-reactive materials and lights.
          // Gain-boosted: laptop-mic music typically peaks bands around
          // 0.15-0.35 raw, which read as invisible; soft-clamped 2.2-2.6x
          // brings reactions into the visible range.
          bassEma = bassEma * 0.72 + bandAverage(0, 8) * 0.28;
          midEma = midEma * 0.72 + bandAverage(8, 40) * 0.28;
          trebleEma = trebleEma * 0.72 + bandAverage(40, 116) * 0.28;
          setAudioBands(
            Math.min(1, bassEma * 2.2),
            Math.min(1, midEma * 2.4),
            Math.min(1, trebleEma * 2.6)
          );

          const now = performance.now();
          // Adaptive beat detection: compare against a rolling energy floor
          // instead of a fixed absolute level, so quiet playback (laptop mic
          // across the room) still produces beats.
          energyFloor = energyFloor * 0.94 + average * 0.06;
          const beatThreshold = Math.max(26, energyFloor * 1.32);
          if (average > beatThreshold && now - lastBeatTime > 280) {
             const interval = lastBeatTime > 0 ? now - lastBeatTime : 500;
             lastBeatTime = now;
             setBpmInterval(interval);
             markBeat();
             
             // Formula Cycle
             if (autoCycleFormulaRef.current) {
               const fq = formulaQuantRef.current;
               const fMult = fq >= 0 ? fq + 1 : 1 / (Math.abs(fq) + 1);
               if (fMult >= 1) {
                 fBeatCount++;
                 if (fBeatCount >= fMult) {
                   fBeatCount = 0;
                   triggerFormula();
                 }
               } else {
                 const subBeats = Math.abs(fq) + 1;
                 triggerFormula();
                 for (let i = 1; i < subBeats; i++) {
                   setTimeout(triggerFormula, (interval / subBeats) * i);
                 }
               }
             }

             // Shader Cycle
             if (autoCycleShaderRef.current) {
               const sq = shaderQuantRef.current;
               const sMult = sq >= 0 ? sq + 1 : 1 / (Math.abs(sq) + 1);
               if (sMult >= 1) {
                 sBeatCount++;
                 if (sBeatCount >= sMult) {
                   sBeatCount = 0;
                   triggerShader();
                 }
               } else {
                 const subBeats = Math.abs(sq) + 1;
                 triggerShader();
                 for (let i = 1; i < subBeats; i++) {
                   setTimeout(triggerShader, (interval / subBeats) * i);
                 }
               }
             }
          }
          
          animationId = requestAnimationFrame(detectBeat);
        };
        detectBeat();
      } catch(e) {
        console.error("Audio access denied", e);
        setAudioSync(false);
      }
    };
    startAudio();

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
      if (audioCtx) audioCtx.close();
      clearAudioBands();
    };
  }, [audioSync, audioSource]);

  // Time-based interval (Only runs if Audio Sync is OFF)
  useEffect(() => {
    if (!autoCycleFormula || audioSync) return;
    const interval = setInterval(() => autoAdvanceFormula(), formulaCycleSpeed * 1000);
    return () => clearInterval(interval);
  }, [autoCycleFormula, formulaCycleSpeed, audioSync]);

  useEffect(() => {
    if (!autoCycleShader || audioSync) return;
    const interval = setInterval(() => autoAdvanceShader(), shaderCycleSpeed * 1000);
    return () => clearInterval(interval);
  }, [autoCycleShader, shaderCycleSpeed, audioSync]);

  // Lighting/geometry/material cycling applies to both renderer paths now
  // that the WebGL view consumes the same rigs and material profiles.
  useEffect(() => {
    if (!autoCycleWebgpuLighting) return;
    const interval = setInterval(() => {
      setWebgpuLightingPreset((prev) => {
        const currentIndex = WEBGPU_LIGHTING_PRESETS.indexOf(prev);
        return WEBGPU_LIGHTING_PRESETS[(currentIndex + 1) % WEBGPU_LIGHTING_PRESETS.length];
      });
    }, webgpuLightingCycleSpeed * 1000);
    return () => clearInterval(interval);
  }, [autoCycleWebgpuLighting, webgpuLightingCycleSpeed]);

  useEffect(() => {
    if (!autoCycleWebgpuGeometry) return;
    const interval = setInterval(() => {
      setWebgpuGeometry((prev) => {
        const currentIndex = WEBGPU_GEOMETRY_PRESETS.indexOf(prev as Exclude<WebGPUGeometryProfile, 'auto'>);
        return WEBGPU_GEOMETRY_PRESETS[(currentIndex + 1) % WEBGPU_GEOMETRY_PRESETS.length];
      });
    }, webgpuGeometryCycleSpeed * 1000);
    return () => clearInterval(interval);
  }, [autoCycleWebgpuGeometry, webgpuGeometryCycleSpeed]);

  useEffect(() => {
    if (!autoCycleWebgpuMaterial) return;
    const interval = setInterval(() => {
      setWebgpuMaterial((prev) => {
        const currentIndex = WEBGPU_MATERIAL_PRESETS.indexOf(prev as Exclude<WebGPUMaterialProfile, 'auto'>);
        return WEBGPU_MATERIAL_PRESETS[(currentIndex + 1) % WEBGPU_MATERIAL_PRESETS.length];
      });
    }, webgpuMaterialCycleSpeed * 1000);
    return () => clearInterval(interval);
  }, [autoCycleWebgpuMaterial, webgpuMaterialCycleSpeed]);

  // The animation clock runs outside React (src/lib/clock.ts); playback
  // parameters are mirrored into it so the tick loop never re-renders the tree.
  useEffect(() => startClock(), []);

  useEffect(() => {
    setClockPlayback({ isPlaying, speed, audioSync, bpmInterval, speedQuant });
  }, [isPlaying, speed, audioSync, bpmInterval, speedQuant]);

  const handleUpdateFormula = (x: string, y: string, z: string) => {
    setSelectedFormula(prev => ({
      ...prev,
      x,
      y,
      z,
      id: prev.id.startsWith('custom') ? prev.id : `custom-${Date.now()}`
    }));
  };

  const handleUpdateShader = (fragmentShader: string) => {
    setSelectedShader(prev => ({
      ...prev,
      fragmentShader,
      id: prev.id.startsWith('custom-sh') ? prev.id : `custom-sh-${Date.now()}`
    }));
  };

  const handleSelectPreset = (formula: Formula) => {
    setSelectedFormula(formula);
  };

  const handleSelectShader = (shader: ShaderPreset) => {
    setSelectedShader(shader);
    // Browsing shaders while a PBR material override is active would be
    // invisible in 3D — picking a shader means "show me this shader".
    setWebgpuMaterial('auto');
  };

  const handleNextFormula = () => {
    setSelectedFormula(prev => {
      const pool = cyclePool(PRESET_FORMULAS, cycleFavoritesOnlyRef.current, 'formula');
      const currentIndex = pool.findIndex(f => f.id === prev.id);
      return pool[(currentIndex + 1) % pool.length];
    });
  };

  const handlePrevFormula = () => {
    setSelectedFormula(prev => {
      const pool = cyclePool(PRESET_FORMULAS, cycleFavoritesOnlyRef.current, 'formula');
      const currentIndex = pool.findIndex(f => f.id === prev.id);
      return pool[(currentIndex - 1 + pool.length) % pool.length];
    });
  };

  const handleNextShader = () => {
    setSelectedShader(prev => {
      const pool = shaderCyclePool();
      const currentIndex = pool.findIndex(s => s.id === prev.id);
      return pool[(currentIndex + 1) % pool.length];
    });
  };

  const handlePrevShader = () => {
    setSelectedShader(prev => {
      const pool = shaderCyclePool();
      const currentIndex = pool.findIndex(s => s.id === prev.id);
      return pool[(currentIndex - 1 + pool.length) % pool.length];
    });
  };

  // Combos apply an exact designed scene; the skip ref stops the Auto-Style
  // effect from immediately overriding the combo's material/rig choice.
  const skipAutoStyleRef = useRef(false);
  const applyCombo = (combo: Combo) => {
    const formula = PRESET_FORMULAS.find((f) => f.id === combo.formulaId);
    if (!formula) return;
    // Only skip the auto-style pass if the formula change will re-trigger it.
    if (formula.id !== selectedFormula.id) skipAutoStyleRef.current = true;
    setSelectedFormula(formula);
    if (combo.shaderId) {
      const shader = PRESET_SHADERS.find((s) => s.id === combo.shaderId);
      if (shader) setSelectedShader(shader);
    }
    setWebgpuMaterial(combo.material);
    setWebgpuLightingPreset(combo.lighting);
    if (combo.bloom !== undefined) {
      setBloomIntensity(combo.bloom);
      setPostFX(true);
    }
    if (combo.speed !== undefined) setSpeed(combo.speed);
    setShow3D(combo.show3D ?? true);
    if (combo.lineWidth !== undefined) setLineWidth(combo.lineWidth);
  };

  // Art direction: presets that declare a preferred material + light rig
  // (and optionally a speed) apply them on selection while Auto-Style is on,
  // so cycling the library lands on designed combinations instead of leftovers.
  useEffect(() => {
    if (skipAutoStyleRef.current) {
      skipAutoStyleRef.current = false;
      return;
    }
    if (!autoStyle) return;
    const style = selectedFormula.style;
    if (style) {
      setWebgpuMaterial(style.material);
      setWebgpuLightingPreset(style.lighting);
      // Bloom travels with the material: emissives get headroom, bright
      // diffuse/metal looks get restraint (fixes white washout mid-cycling).
      setBloomIntensity(style.bloom ?? 0.9);
    }
    if (selectedFormula.speedHint !== undefined) {
      setSpeed(selectedFormula.speedHint);
    }
  }, [selectedFormula.id, autoStyle]);

  // Persist shareable state to the URL hash + localStorage (preset ids and
  // settings only; custom-edited expressions are not serialized).
  useEffect(() => {
    persistSharedState({
      formulaId: selectedFormula.id,
      shaderId: selectedShader.id,
      rendererMode,
      show3D,
      showWireframe,
      showArtifacts,
      showMirrors,
      speed,
      webgpuGeometry,
      webgpuMaterial,
      webgpuLightingPreset,
      webgpuLighting,
      autoStyle,
      showEnvironment,
      lineWidth,
      cycleFavoritesOnly,
      autoPilotShuffle,
      postFX,
      bloomIntensity,
      audioSource
    });
  }, [selectedFormula.id, selectedShader.id, rendererMode, show3D, showWireframe, showArtifacts, showMirrors, speed, webgpuGeometry, webgpuMaterial, webgpuLightingPreset, webgpuLighting, autoStyle, showEnvironment, lineWidth, cycleFavoritesOnly, autoPilotShuffle, postFX, bloomIntensity, audioSource]);

  // Keyboard transport: Space play/pause, arrows cycle presets, F fullscreen.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case '?':
          e.preventDefault();
          setShowHelp(h => !h);
          break;
        case 'Escape':
          setShowHelp(false);
          break;
        case ' ':
          e.preventDefault();
          toggleTransportRef.current();
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleNextFormula();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          handlePrevFormula();
          break;
        case 'ArrowUp':
          e.preventDefault();
          handleNextShader();
          break;
        case 'ArrowDown':
          e.preventDefault();
          handlePrevShader();
          break;
        case 'f':
        case 'F':
          toggleFullScreen();
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // Handlers only use functional state updates and document APIs.
  }, []);

  const saveSnapshot = () => {
    if (rendererMode === 'webgpu') {
      // The WebGPU canvas must be captured inside its own render loop.
      window.dispatchEvent(new CustomEvent('math-harmonics:webgpu-capture', { detail: { name: selectedFormula.id } }));
      return;
    }
    const canvas = document.querySelector('section canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    try {
      const link = document.createElement('a');
      link.download = `harmonic-${selectedFormula.id}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.warn('Unable to capture snapshot:', error);
    }
  };

  // Mutate: perturb the current formula's constants into a validated variant.
  const handleMutateFormula = () => {
    const mutateExpression = (expression: string) =>
      expression.replace(/\b\d+(\.\d+)?\b/g, (match) => {
        if (Math.random() < 0.35) return match;
        const value = parseFloat(match);
        const mutated = value * (0.72 + Math.random() * 0.56);
        // Integer frequencies stay integers so curves still close nicely.
        return Number.isInteger(value) && value <= 16
          ? String(Math.max(1, Math.round(mutated)))
          : mutated.toFixed(3);
      });

    for (let attempt = 0; attempt < 6; attempt++) {
      const x = mutateExpression(selectedFormula.x);
      const y = mutateExpression(selectedFormula.y);
      const z = mutateExpression(selectedFormula.z ?? 'sin(2 * p + t) * 4');
      try {
        for (const expression of [x, y, z]) {
          const value = compile(expression).evaluate({ p: 1.234, t: 0.7, s: 1, q: 1.1 });
          const numeric = typeof value === 'number' ? value : value?.re;
          if (typeof numeric !== 'number' || !Number.isFinite(numeric)) throw new Error('non-finite');
        }
        const baseName = selectedFormula.name.replace(/ \(mutated\)$/, '');
        setSelectedFormula((prev) => ({
          ...prev,
          id: `custom-mut-${Date.now()}`,
          name: `${baseName} (mutated)`,
          x,
          y,
          z,
          description: `Mutated variant of ${baseName}.`
        }));
        return;
      } catch {
        // Retry with a fresh roll.
      }
    }
  };

  const [showHelp, setShowHelp] = useState(false);
  const [showWelcome, setShowWelcome] = useState(SHOW_WELCOME);

  // Stages the full demo from ANY state (returning users included), so it
  // also powers the permanent "Sonata Demo" chip in the sidebar.
  const startDemo = () => {
    setShowWelcome(false);
    markWelcomed();
    const opener = COMBOS.find((combo) => combo.id === 'combo-smoked-glass');
    if (opener) applyCombo(opener);
    setRendererMode('webgl'); // audio-reactive rendering lives on this path
    setAutoCycleFormula(true);
    setFormulaQuant(3); // new formula every 4th beat
    setAudioSync(true);
    setAudioSource('midi');
    const audio = midiAudioRef.current;
    if (audio) {
      audio.src = DEMO_AUDIO_URL;
      // Called inside the click gesture, so autoplay is permitted.
      void audio.play().catch((error) => console.warn('Demo playback blocked:', error));
    }
    void loadMidiSource(DEMO_MIDI_URL);
  };

  const skipDemo = () => {
    setShowWelcome(false);
    markWelcomed();
    setAudioSync(false);
  };
  const [copiedLink, setCopiedLink] = useState(false);
  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1500);
    } catch (err) {
      console.warn('Unable to copy share link:', err);
    }
  };

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.warn(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  return (
    <div className="w-full h-screen bg-[#050505] text-[#e0e0e0] font-sans flex flex-col overflow-hidden p-4 lg:p-6 gap-5">
      {/* Header Section */}
      <header className="flex justify-between items-center border-b border-white/10 pb-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-white rounded-sm rotate-45"></div>
          </div>
          <h1 className="text-xl font-medium tracking-tight">Harmonic.OS <span className="text-indigo-300/80 font-mono text-xs ml-2 uppercase tracking-widest">{APP_VERSION}</span></h1>
        </div>
        <div className="flex gap-4 items-center">
          <button
            onClick={() => setShowHelp(true)}
            className="h-7 w-7 rounded-full border border-white/10 hover:bg-white/5 text-[11px] font-mono text-white/50 hover:text-white transition-colors"
            title="Help & shortcuts (?)"
          >
            ?
          </button>
          <button
            onClick={() => window.dispatchEvent(new Event('math-harmonics:photo-mode'))}
            disabled={rendererMode !== 'webgl'}
            className="px-3 py-1 hover:bg-white/5 rounded-full border border-fuchsia-400/25 text-[10px] font-mono text-fuchsia-300/80 hover:text-fuchsia-200 transition-colors uppercase tracking-widest disabled:opacity-35 disabled:cursor-not-allowed"
            title={rendererMode === 'webgl' ? 'Path-traced still of the current formula' : 'Photo mode needs the WebGL renderer'}
          >
            Photo
          </button>
          <button
            onClick={saveSnapshot}
            className="px-3 py-1 hover:bg-white/5 rounded-full border border-white/10 text-[10px] font-mono text-white/50 hover:text-white transition-colors uppercase tracking-widest"
            title="Save the current view as a PNG"
          >
            Save PNG
          </button>
          <button
            onClick={copyShareLink}
            className="px-3 py-1 hover:bg-white/5 rounded-full border border-white/10 text-[10px] font-mono text-white/50 hover:text-white transition-colors uppercase tracking-widest"
            title="Copy a link that restores the current formula, shader and settings"
          >
            {copiedLink ? 'Copied ✓' : 'Copy Link'}
          </button>
          <button
            onClick={toggleFullScreen}
            className="px-3 py-1 hover:bg-white/5 rounded-full border border-white/10 text-[10px] font-mono text-white/50 hover:text-white transition-colors uppercase tracking-widest"
            title="Toggle fullscreen (F)"
          >
            Full Screen
          </button>
          <div className="px-3 py-1 bg-white/5 rounded-full border border-white/10 text-[10px] font-mono text-indigo-400 uppercase">
            Active Signal: Resonance Lock
          </div>
          <div className="text-[10px] text-white/40 uppercase tracking-widest font-semibold font-mono">Real-Time Engine</div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_320px] gap-5 overflow-y-auto xl:overflow-hidden custom-scrollbar">
        
        {/* Left: Formula Library */}
        <Sidebar
          selectedFormula={selectedFormula}
          onApplyCombo={applyCombo}
          onPlayDemo={startDemo}
          audioSync={audioSync}
          onSelect={handleSelectPreset}
          selectedShader={selectedShader}
          onSelectShader={handleSelectShader}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />

        {/* Center: Graph View */}
        <section className="min-h-[520px] xl:min-h-0 bg-white/5 border border-white/10 rounded-lg relative overflow-hidden flex flex-col group">
          <div className="flex-1 relative">
            <ErrorBoundary>
            {rendererMode === 'webgpu' ? (
              <Suspense
                fallback={
                  <div className="flex h-full w-full items-center justify-center font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
                    Loading WebGPU engine…
                  </div>
                }
              >
              <WebGPUView
                formula={selectedFormula}
                shader={selectedShader}
                show3D={show3D}
                showWireframe={showWireframe}
                showArtifacts={showArtifacts}
                showMirrors={showMirrors}
                webgpuLighting={webgpuLighting}
                webgpuLightingPreset={webgpuLightingPreset}
                webgpuGeometry={webgpuGeometry}
                webgpuMaterial={webgpuMaterial}
                speed={speed}
                isPlaying={isPlaying}
              />
              </Suspense>
            ) : (
              <GraphView
                formula={selectedFormula}
                shader={selectedShader}
                webgpuLighting={webgpuLighting}
                webgpuLightingPreset={webgpuLightingPreset}
                webgpuMaterial={webgpuMaterial}
                webgpuGeometry={webgpuGeometry}
                showEnvironment={showEnvironment}
                lineWidth={lineWidth}
                postFX={postFX}
                bloomIntensity={bloomIntensity}
                show3D={show3D}
                setShow3D={setShow3D}
                showWireframe={showWireframe}
                setShowWireframe={setShowWireframe}
                showArtifacts={showArtifacts} 
                setShowArtifacts={setShowArtifacts}
                showMirrors={showMirrors}
                speed={speed}
                setSpeed={setSpeed}
                xrStore={xrStore}
                onNextFormula={handleNextFormula}
                onNextShader={handleNextShader}
                isPlaying={transportShowsPause}
                onTogglePlay={toggleTransport}
                onSelectFormula={handleSelectPreset}
                onSelectShader={handleSelectShader}
                audioSync={audioSync}
                setAudioSync={setAudioSync}
                autoCycleFormula={autoCycleFormula}
                setAutoCycleFormula={setAutoCycleFormula}
                autoCycleShader={autoCycleShader}
                setAutoCycleShader={setAutoCycleShader}
                speedQuant={speedQuant}
                setSpeedQuant={setSpeedQuant}
                formulaQuant={formulaQuant}
                setFormulaQuant={setFormulaQuant}
                shaderQuant={shaderQuant}
                setShaderQuant={setShaderQuant}
                formulaCycleSpeed={formulaCycleSpeed}
                setFormulaCycleSpeed={setFormulaCycleSpeed}
                shaderCycleSpeed={shaderCycleSpeed}
                setShaderCycleSpeed={setShaderCycleSpeed}
              />
            )}
            </ErrorBoundary>
          </div>

          <div className="p-6 bg-[#0a0a0a]/80 border-t border-white/10 backdrop-blur-md">
            <div className="flex justify-between text-[10px] font-mono text-white/40 mb-3 uppercase tracking-tighter">
              <span>Temporal Phase (t)</span>
              <span className="hidden md:inline text-white/25">Space ⏯ · ← → formula · ↑ ↓ shader · F fullscreen</span>
              <TemporalReadout />
            </div>
            <div className="w-full h-8 flex items-center px-2 gap-4">
              <button
                onClick={toggleTransport}
                className="px-3 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/50 rounded text-[9px] font-mono uppercase transition-colors shrink-0"
              >
                {midiTransportLive ? (audioPlaying ? '⏸ Music' : '▶ Music') : transportShowsPause ? 'Pause' : 'Play'}
              </button>
              <TimeScrubber onScrub={() => setIsPlaying(false)} />
            </div>
          </div>
        </section>

        {/* Right: Controls & Editor */}
        <Controls
          selectedFormula={selectedFormula}
          onUpdateFormula={handleUpdateFormula}
          selectedShader={selectedShader}
          onUpdateShader={handleUpdateShader}
          activeTab={activeTab}
          rendererMode={rendererMode}
          setRendererMode={setRendererMode}
          webgpuLighting={webgpuLighting}
          setWebgpuLighting={setWebgpuLighting}
          webgpuLightingPreset={webgpuLightingPreset}
          setWebgpuLightingPreset={setWebgpuLightingPreset}
          webgpuGeometry={webgpuGeometry}
          setWebgpuGeometry={setWebgpuGeometry}
          webgpuMaterial={webgpuMaterial}
          setWebgpuMaterial={setWebgpuMaterial}
          autoCycleWebgpuLighting={autoCycleWebgpuLighting}
          setAutoCycleWebgpuLighting={setAutoCycleWebgpuLighting}
          autoCycleWebgpuGeometry={autoCycleWebgpuGeometry}
          setAutoCycleWebgpuGeometry={setAutoCycleWebgpuGeometry}
          autoCycleWebgpuMaterial={autoCycleWebgpuMaterial}
          setAutoCycleWebgpuMaterial={setAutoCycleWebgpuMaterial}
          webgpuLightingCycleSpeed={webgpuLightingCycleSpeed}
          setWebgpuLightingCycleSpeed={setWebgpuLightingCycleSpeed}
          webgpuGeometryCycleSpeed={webgpuGeometryCycleSpeed}
          setWebgpuGeometryCycleSpeed={setWebgpuGeometryCycleSpeed}
          webgpuMaterialCycleSpeed={webgpuMaterialCycleSpeed}
          setWebgpuMaterialCycleSpeed={setWebgpuMaterialCycleSpeed}
          show3D={show3D}
          setShow3D={setShow3D}
          showWireframe={showWireframe}
          setShowWireframe={setShowWireframe}
          showArtifacts={showArtifacts}
          setShowArtifacts={setShowArtifacts}
          showMirrors={showMirrors}
          setShowMirrors={setShowMirrors}
          speed={speed}
          setSpeed={setSpeed}
          autoCycleFormula={autoCycleFormula}
          setAutoCycleFormula={setAutoCycleFormula}
          autoCycleShader={autoCycleShader}
          setAutoCycleShader={setAutoCycleShader}
          formulaCycleSpeed={formulaCycleSpeed}
          setFormulaCycleSpeed={setFormulaCycleSpeed}
          shaderCycleSpeed={shaderCycleSpeed}
          setShaderCycleSpeed={setShaderCycleSpeed}
          audioSync={audioSync}
          setAudioSync={setAudioSync}
          audioSource={audioSource}
          setAudioSource={setAudioSource}
          midiName={midiInfo ? `${midiInfo.name} · ${midiInfo.notes.length} notes · ${midiInfo.bpm} BPM` : null}
          onLoadMidiFile={(file) => { void loadMidiSource(file); }}
          onLoadAudioFile={(file) => {
            if (midiAudioRef.current) midiAudioRef.current.src = URL.createObjectURL(file);
          }}
          midiAudioRef={midiAudioRef}
          speedQuant={speedQuant}
          setSpeedQuant={setSpeedQuant}
          formulaQuant={formulaQuant}
          setFormulaQuant={setFormulaQuant}
          shaderQuant={shaderQuant}
          setShaderQuant={setShaderQuant}
          autoStyle={autoStyle}
          setAutoStyle={setAutoStyle}
          cycleFavoritesOnly={cycleFavoritesOnly}
          setCycleFavoritesOnly={setCycleFavoritesOnly}
          autoPilotShuffle={autoPilotShuffle}
          setAutoPilotShuffle={setAutoPilotShuffle}
          onMutateFormula={handleMutateFormula}
          showEnvironment={showEnvironment}
          setShowEnvironment={setShowEnvironment}
          lineWidth={lineWidth}
          setLineWidth={setLineWidth}
          postFX={postFX}
          setPostFX={setPostFX}
          bloomIntensity={bloomIntensity}
          setBloomIntensity={setBloomIntensity}
          xrStore={xrStore}
        />
      </main>

      {/* Footer Info */}
      <footer className="flex justify-between text-[9px] text-white/20 font-mono uppercase tracking-[0.2em] border-t border-white/10 pt-4 shrink-0">
        <div>Engine: {rendererMode === 'webgpu' ? `Three-r185 WebGPU-TSL / ${webgpuLighting.toFixed(2)}x light` : 'Three-r185 WebGL-Harmonics'}</div>
        <div className="flex gap-8">
          <span>Phase t: [0, 4π]</span>
          <FooterVerts />
          <span>Mode: {show3D ? (selectedFormula.parametric ? 'SURFACE(P,Q)' : (webgpuGeometry !== 'auto' ? webgpuGeometry : selectedFormula.geometryMode)?.toUpperCase() || 'VARIED_3D') : 'ORTHO_2D'}</span>
        </div>
        <FooterStats />
      </footer>

      {showWelcome && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md" role="dialog" aria-label="Welcome">
          <div className="w-[min(92vw,560px)] rounded-2xl border border-fuchsia-400/25 bg-[#0b0e1a] p-8 text-center shadow-2xl shadow-fuchsia-950/30">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400">
              <svg viewBox="0 0 64 64" className="h-7 w-7"><path d="M8 32 C 14 12, 20 12, 26 32 S 38 52, 44 32 S 54 16, 58 24" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" /></svg>
            </div>
            <h1 className="text-lg font-bold tracking-[0.18em] text-white">
              HARMONIC.OS <span className="ml-1 font-mono text-[11px] font-normal tracking-widest text-indigo-300">{APP_VERSION}</span>
            </h1>
            <p className="mx-auto mt-3 max-w-md text-[13px] leading-relaxed text-white/60">
              A living mathematical instrument. This demo performs{' '}
              <span className="text-fuchsia-300">Martina&apos;s Sonata</span> while the score itself drives the
              visuals — every fourth beat sculpts a new formula, and the music lights the scene.
            </p>
            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
              <button
                onClick={startDemo}
                className="rounded-xl border border-fuchsia-400/40 bg-gradient-to-r from-fuchsia-600/80 to-indigo-600/80 px-6 py-3 text-[12px] font-bold uppercase tracking-[0.18em] text-white transition-all hover:from-fuchsia-500/90 hover:to-indigo-500/90 active:scale-[0.98]"
              >
                ▶ Play the sonata
              </button>
              <button
                onClick={skipDemo}
                className="rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-[12px] font-bold uppercase tracking-[0.18em] text-white/55 transition-colors hover:bg-white/10 hover:text-white/80"
              >
                Explore silently
              </button>
            </div>
            <p className="mt-4 text-[10px] font-mono text-white/30">
              Works in the browser, on Apple Vision Pro, and Meta Quest (WebXR) · press ? for help
            </p>
          </div>
        </div>
      )}

      {showHelp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setShowHelp(false)}
          role="dialog"
          aria-label="Help and shortcuts"
        >
          <div
            className="w-[min(92vw,640px)] max-h-[84vh] overflow-y-auto custom-scrollbar rounded-2xl border border-indigo-400/25 bg-[#0b0e17] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-indigo-300">Help & Shortcuts</h2>
              <button onClick={() => setShowHelp(false)} className="text-white/40 hover:text-white text-xs font-mono">ESC ✕</button>
            </div>

            <div className="mt-4 grid gap-5 sm:grid-cols-2 text-[11px] leading-5 text-white/70">
              <div>
                <div className="mb-1.5 font-bold uppercase tracking-widest text-[9px] text-white/40">Keyboard</div>
                <div><span className="text-indigo-300 font-mono">Space</span> — play / pause</div>
                <div><span className="text-indigo-300 font-mono">← →</span> — previous / next formula</div>
                <div><span className="text-indigo-300 font-mono">↑ ↓</span> — previous / next shader</div>
                <div><span className="text-indigo-300 font-mono">F</span> — fullscreen</div>
                <div><span className="text-indigo-300 font-mono">?</span> — this overlay</div>
                <div className="mt-2 text-white/45">Double-click the 3D view to reset the camera.</div>
              </div>
              <div>
                <div className="mb-1.5 font-bold uppercase tracking-widest text-[9px] text-white/40">Formula variables</div>
                <div><span className="text-indigo-300 font-mono">p</span> — curve parameter (0 … 8π)</div>
                <div><span className="text-indigo-300 font-mono">q</span> — second parameter on surfaces</div>
                <div><span className="text-indigo-300 font-mono">t</span> — time phase (0 … 4π)</div>
                <div><span className="text-indigo-300 font-mono">s</span> — XR hand-height scalar</div>
                <div className="mt-2 text-white/45">Shaders may declare <span className="font-mono">uBass / uMid / uTreble</span> for live band energies.</div>
              </div>
              <div>
                <div className="mb-1.5 font-bold uppercase tracking-widest text-[9px] text-white/40">Vision Pro (gaze + pinch)</div>
                <div>One pinch on the shape drags it.</div>
                <div>Two-hand pinch: spread to scale, orbit to turn.</div>
                <div>Pinch buttons on the floating console to control playback; drag its handle to move it.</div>
              </div>
              <div>
                <div className="mb-1.5 font-bold uppercase tracking-widest text-[9px] text-white/40">Quest (controllers)</div>
                <div>Left stick moves you; trigger-drag moves the shape.</div>
                <div>Two triggers scale &amp; turn it. Squeeze resets the view.</div>
                <div>With Beat Sync on, controllers pulse on the beat.</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
