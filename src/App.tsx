/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import GraphView from './components/GraphView';
import WebGPUView from './components/WebGPUView';
import Controls from './components/Controls';
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
import { setClockPlayback, setClockTime, startClock, useClockSnapshot } from './lib/clock';
import { loadSharedState, persistSharedState, resolveInitialFormula, resolveInitialShader } from './lib/urlState';

const APP_VERSION = 'v1.1.21-beta';

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

function isVisionProSafari() {
  if (typeof navigator === 'undefined' || navigator.xr == null) return false;

  return /Vision|visionOS|AppleVision/i.test(navigator.userAgent)
    || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

function isQuestBrowser() {
  return typeof navigator !== 'undefined' && /(OculusBrowser|Quest|Meta Quest)/i.test(navigator.userAgent);
}

function shouldDefaultToWebGLForXR() {
  return typeof navigator !== 'undefined' && navigator.xr != null && (isQuestBrowser() || isVisionProSafari());
}

const xrStore = createXRStore({
  offerSession: false,
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
  return (
    <input
      type="range"
      min="0"
      max="12.566" // 4pi
      step="0.001"
      value={clock.time}
      onChange={(e) => {
        onScrub();
        setClockTime(parseFloat(e.target.value));
      }}
      className="flex-1 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all"
    />
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
  const [autoCycleWebgpuLighting, setAutoCycleWebgpuLighting] = useState(false);
  const [autoCycleWebgpuGeometry, setAutoCycleWebgpuGeometry] = useState(false);
  const [autoCycleWebgpuMaterial, setAutoCycleWebgpuMaterial] = useState(false);
  const [webgpuLightingCycleSpeed, setWebgpuLightingCycleSpeed] = useState(4);
  const [webgpuGeometryCycleSpeed, setWebgpuGeometryCycleSpeed] = useState(5);
  const [webgpuMaterialCycleSpeed, setWebgpuMaterialCycleSpeed] = useState(4.5);
  
  const [autoCycleFormula, setAutoCycleFormula] = useState(false);
  const [autoCycleShader, setAutoCycleShader] = useState(false);
  const [formulaCycleSpeed, setFormulaCycleSpeed] = useState(3); // Seconds
  const [shaderCycleSpeed, setShaderCycleSpeed] = useState(5); // Seconds
  const [audioSync, setAudioSync] = useState(false);
  
  // Quantization (-10 to +10)
  const [speedQuant, setSpeedQuant] = useState(0); 
  const [formulaQuant, setFormulaQuant] = useState(0);
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

  // Audio Reactivity & Quantization Logic
  useEffect(() => {
    if (!audioSync) return;
    
    let audioCtx: AudioContext;
    let analyser: AnalyserNode;
    let source: MediaStreamAudioSourceNode;
    let animationId: number;
    let lastBeatTime = 0;
    let lastAverage = 0;
    
    // Beat counters for skipping beats (positive quantization)
    let fBeatCount = 0;
    let sBeatCount = 0;
    
    const triggerFormula = () => {
      if (autoCycleFormulaRef.current) {
        const r = Math.floor(Math.random() * PRESET_FORMULAS.length);
        setSelectedFormula(PRESET_FORMULAS[r]);
      }
    };
    
    const triggerShader = () => {
      if (autoCycleShaderRef.current) {
        const r = Math.floor(Math.random() * PRESET_SHADERS.length);
        setSelectedShader(PRESET_SHADERS[r]);
      }
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
        
        const detectBeat = () => {
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for(let i = 0; i < 8; i++) sum += dataArray[i];
          const average = sum / 8;
          
          const now = performance.now();
          // Dynamic peak detection: must be loud enough (80) and 15% louder than recent floating average
          if (average > 80 && average > lastAverage * 1.15 && now - lastBeatTime > 300) {
             const interval = lastBeatTime > 0 ? now - lastBeatTime : 500;
             lastBeatTime = now;
             setBpmInterval(interval);
             
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
          
          // Slowly track the floating baseline average
          lastAverage = lastAverage * 0.9 + average * 0.1;
          
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
    };
  }, [audioSync]);

  // Time-based interval (Only runs if Audio Sync is OFF)
  useEffect(() => {
    if (!autoCycleFormula || audioSync) return;
    const interval = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * PRESET_FORMULAS.length);
      setSelectedFormula(PRESET_FORMULAS[randomIndex]);
    }, formulaCycleSpeed * 1000);
    return () => clearInterval(interval);
  }, [autoCycleFormula, formulaCycleSpeed, audioSync]);

  useEffect(() => {
    if (!autoCycleShader || audioSync) return;
    const interval = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * PRESET_SHADERS.length);
      setSelectedShader(PRESET_SHADERS[randomIndex]);
    }, shaderCycleSpeed * 1000);
    return () => clearInterval(interval);
  }, [autoCycleShader, shaderCycleSpeed, audioSync]);

  useEffect(() => {
    if (!autoCycleWebgpuLighting || rendererMode !== 'webgpu') return;
    const interval = setInterval(() => {
      setWebgpuLightingPreset((prev) => {
        const currentIndex = WEBGPU_LIGHTING_PRESETS.indexOf(prev);
        return WEBGPU_LIGHTING_PRESETS[(currentIndex + 1) % WEBGPU_LIGHTING_PRESETS.length];
      });
    }, webgpuLightingCycleSpeed * 1000);
    return () => clearInterval(interval);
  }, [autoCycleWebgpuLighting, webgpuLightingCycleSpeed, rendererMode]);

  useEffect(() => {
    if (!autoCycleWebgpuGeometry || rendererMode !== 'webgpu') return;
    const interval = setInterval(() => {
      setWebgpuGeometry((prev) => {
        const currentIndex = WEBGPU_GEOMETRY_PRESETS.indexOf(prev as Exclude<WebGPUGeometryProfile, 'auto'>);
        return WEBGPU_GEOMETRY_PRESETS[(currentIndex + 1) % WEBGPU_GEOMETRY_PRESETS.length];
      });
    }, webgpuGeometryCycleSpeed * 1000);
    return () => clearInterval(interval);
  }, [autoCycleWebgpuGeometry, webgpuGeometryCycleSpeed, rendererMode]);

  useEffect(() => {
    if (!autoCycleWebgpuMaterial || rendererMode !== 'webgpu') return;
    const interval = setInterval(() => {
      setWebgpuMaterial((prev) => {
        const currentIndex = WEBGPU_MATERIAL_PRESETS.indexOf(prev as Exclude<WebGPUMaterialProfile, 'auto'>);
        return WEBGPU_MATERIAL_PRESETS[(currentIndex + 1) % WEBGPU_MATERIAL_PRESETS.length];
      });
    }, webgpuMaterialCycleSpeed * 1000);
    return () => clearInterval(interval);
  }, [autoCycleWebgpuMaterial, webgpuMaterialCycleSpeed, rendererMode]);

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
  };

  const handleNextFormula = () => {
    setSelectedFormula(prev => {
      const currentIndex = PRESET_FORMULAS.findIndex(f => f.id === prev.id);
      const nextIndex = (currentIndex + 1) % PRESET_FORMULAS.length;
      return PRESET_FORMULAS[nextIndex];
    });
  };

  const handlePrevFormula = () => {
    setSelectedFormula(prev => {
      const currentIndex = PRESET_FORMULAS.findIndex(f => f.id === prev.id);
      const prevIndex = (currentIndex - 1 + PRESET_FORMULAS.length) % PRESET_FORMULAS.length;
      return PRESET_FORMULAS[prevIndex];
    });
  };

  const handleNextShader = () => {
    setSelectedShader(prev => {
      const currentIndex = PRESET_SHADERS.findIndex(s => s.id === prev.id);
      const nextIndex = (currentIndex + 1) % PRESET_SHADERS.length;
      return PRESET_SHADERS[nextIndex];
    });
  };

  const handlePrevShader = () => {
    setSelectedShader(prev => {
      const currentIndex = PRESET_SHADERS.findIndex(s => s.id === prev.id);
      const prevIndex = (currentIndex - 1 + PRESET_SHADERS.length) % PRESET_SHADERS.length;
      return PRESET_SHADERS[prevIndex];
    });
  };

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
      webgpuLighting
    });
  }, [selectedFormula.id, selectedShader.id, rendererMode, show3D, showWireframe, showArtifacts, showMirrors, speed, webgpuGeometry, webgpuMaterial, webgpuLightingPreset, webgpuLighting]);

  // Keyboard transport: Space play/pause, arrows cycle presets, F fullscreen.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          setIsPlaying(p => !p);
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
          <h1 className="text-xl font-medium tracking-tight">Harmonic.OS <span className="text-white/30 font-mono text-xs ml-2 uppercase tracking-widest">{APP_VERSION}</span></h1>
        </div>
        <div className="flex gap-4 items-center">
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
          onSelect={handleSelectPreset}
          selectedShader={selectedShader}
          onSelectShader={handleSelectShader}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />

        {/* Center: Graph View */}
        <section className="min-h-[520px] xl:min-h-0 bg-white/5 border border-white/10 rounded-lg relative overflow-hidden flex flex-col group">
          <div className="flex-1 relative">
            {rendererMode === 'webgpu' ? (
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
            ) : (
              <GraphView
                formula={selectedFormula}
                shader={selectedShader}
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
                isPlaying={isPlaying}
                onTogglePlay={() => setIsPlaying(!isPlaying)}
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
          </div>

          <div className="p-6 bg-[#0a0a0a]/80 border-t border-white/10 backdrop-blur-md">
            <div className="flex justify-between text-[10px] font-mono text-white/40 mb-3 uppercase tracking-tighter">
              <span>Temporal Phase (t)</span>
              <span className="hidden md:inline text-white/25">Space ⏯ · ← → formula · ↑ ↓ shader · F fullscreen</span>
              <TemporalReadout />
            </div>
            <div className="w-full h-8 flex items-center px-2 gap-4">
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="px-3 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/50 rounded text-[9px] font-mono uppercase transition-colors shrink-0"
              >
                {isPlaying ? 'Pause' : 'Play'}
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
          speedQuant={speedQuant}
          setSpeedQuant={setSpeedQuant}
          formulaQuant={formulaQuant}
          setFormulaQuant={setFormulaQuant}
          shaderQuant={shaderQuant}
          setShaderQuant={setShaderQuant}
          xrStore={xrStore}
        />
      </main>

      {/* Footer Info */}
      <footer className="flex justify-between text-[9px] text-white/20 font-mono uppercase tracking-[0.2em] border-t border-white/10 pt-4 shrink-0">
        <div>Engine: {rendererMode === 'webgpu' ? `Three-r185 WebGPU-TSL / ${webgpuLighting.toFixed(2)}x light` : 'Three-r185 WebGL-Harmonics'}</div>
        <div className="flex gap-8">
          <span>Phase t: [0, 4π]</span>
          <FooterVerts />
          <span>Mode: {show3D ? (selectedFormula.geometryMode?.toUpperCase() || 'VARIED_3D') : 'ORTHO_2D'}</span>
        </div>
        <FooterStats />
      </footer>
    </div>
  );
}
