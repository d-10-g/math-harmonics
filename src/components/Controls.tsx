import { useState, useEffect } from 'react';
import { cn } from '../lib/utils';
import {
  Formula,
  ShaderPreset,
  WebGPUGeometryProfile,
  WebGPULightingPreset,
  WebGPUMaterialProfile
} from '../constants';

const WEBGPU_XR_REQUEST_EVENT = 'math-harmonics:webgpu-xr-request';
const WEBGPU_XR_UNAVAILABLE_EVENT = 'math-harmonics:webgpu-xr-unavailable';
const WEBGPU_CYCLE_INTERVAL_MIN = 1;
const WEBGPU_CYCLE_INTERVAL_MAX = 16;

function webgpuCycleIntervalToSliderValue(intervalSeconds: number) {
  return WEBGPU_CYCLE_INTERVAL_MIN + WEBGPU_CYCLE_INTERVAL_MAX - intervalSeconds;
}

function webgpuCycleSliderValueToInterval(sliderValue: number) {
  return WEBGPU_CYCLE_INTERVAL_MIN + WEBGPU_CYCLE_INTERVAL_MAX - sliderValue;
}

interface ControlsProps {
  time: number;
  selectedFormula: Formula;
  onUpdateFormula: (x: string, y: string, z: string) => void;
  selectedShader: ShaderPreset;
  onUpdateShader: (fragmentShader: string) => void;
  activeTab: 'formulas' | 'shaders';
  rendererMode: 'webgl' | 'webgpu';
  setRendererMode: (mode: 'webgl' | 'webgpu') => void;
  webgpuLighting: number;
  setWebgpuLighting: (lighting: number) => void;
  webgpuLightingPreset: WebGPULightingPreset;
  setWebgpuLightingPreset: (preset: WebGPULightingPreset) => void;
  webgpuGeometry: WebGPUGeometryProfile;
  setWebgpuGeometry: (geometry: WebGPUGeometryProfile) => void;
  webgpuMaterial: WebGPUMaterialProfile;
  setWebgpuMaterial: (material: WebGPUMaterialProfile) => void;
  autoCycleWebgpuLighting: boolean;
  setAutoCycleWebgpuLighting: (auto: boolean) => void;
  autoCycleWebgpuGeometry: boolean;
  setAutoCycleWebgpuGeometry: (auto: boolean) => void;
  autoCycleWebgpuMaterial: boolean;
  setAutoCycleWebgpuMaterial: (auto: boolean) => void;
  webgpuLightingCycleSpeed: number;
  setWebgpuLightingCycleSpeed: (speed: number) => void;
  webgpuGeometryCycleSpeed: number;
  setWebgpuGeometryCycleSpeed: (speed: number) => void;
  webgpuMaterialCycleSpeed: number;
  setWebgpuMaterialCycleSpeed: (speed: number) => void;
  show3D: boolean;
  setShow3D: (show: boolean) => void;
  showWireframe: boolean;
  setShowWireframe: (show: boolean) => void;
  showArtifacts: boolean;
  setShowArtifacts: (show: boolean) => void;
  showMirrors: boolean;
  setShowMirrors: (show: boolean) => void;
  speed: number;
  setSpeed: (speed: number) => void;
  autoCycleFormula: boolean;
  setAutoCycleFormula: (auto: boolean) => void;
  autoCycleShader: boolean;
  setAutoCycleShader: (auto: boolean) => void;
  formulaCycleSpeed: number;
  setFormulaCycleSpeed: (speed: number) => void;
  shaderCycleSpeed: number;
  setShaderCycleSpeed: (speed: number) => void;
  audioSync: boolean;
  setAudioSync: (sync: boolean) => void;
  speedQuant: number;
  setSpeedQuant: (q: number) => void;
  formulaQuant: number;
  setFormulaQuant: (q: number) => void;
  shaderQuant: number;
  setShaderQuant: (q: number) => void;
  xrStore: any;
}

export default function Controls({
  selectedFormula,
  onUpdateFormula,
  selectedShader,
  onUpdateShader,
  activeTab,
  rendererMode,
  setRendererMode,
  webgpuLighting,
  setWebgpuLighting,
  webgpuLightingPreset,
  setWebgpuLightingPreset,
  webgpuGeometry,
  setWebgpuGeometry,
  webgpuMaterial,
  setWebgpuMaterial,
  autoCycleWebgpuLighting,
  setAutoCycleWebgpuLighting,
  autoCycleWebgpuGeometry,
  setAutoCycleWebgpuGeometry,
  autoCycleWebgpuMaterial,
  setAutoCycleWebgpuMaterial,
  webgpuLightingCycleSpeed,
  setWebgpuLightingCycleSpeed,
  webgpuGeometryCycleSpeed,
  setWebgpuGeometryCycleSpeed,
  webgpuMaterialCycleSpeed,
  setWebgpuMaterialCycleSpeed,
  show3D,
  setShow3D,
  showWireframe,
  setShowWireframe,
  showArtifacts,
  setShowArtifacts,
  showMirrors,
  setShowMirrors,
  speed,
  setSpeed,
  autoCycleFormula,
  setAutoCycleFormula,
  autoCycleShader,
  setAutoCycleShader,
  formulaCycleSpeed,
  setFormulaCycleSpeed,
  shaderCycleSpeed,
  setShaderCycleSpeed,
  audioSync,
  setAudioSync,
  speedQuant,
  setSpeedQuant,
  formulaQuant,
  setFormulaQuant,
  shaderQuant,
  setShaderQuant,
  xrStore
}: ControlsProps) {
  const [isArSupported, setIsArSupported] = useState<boolean | null>(null);
  const [isVrSupported, setIsVrSupported] = useState<boolean | null>(null);
  const [xrActionMessage, setXrActionMessage] = useState<string | null>(null);
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.xr) {
      navigator.xr.isSessionSupported('immersive-ar')
        .then(supported => setIsArSupported(supported))
        .catch(() => setIsArSupported(false));
      navigator.xr.isSessionSupported('immersive-vr')
        .then(supported => setIsVrSupported(supported))
        .catch(() => setIsVrSupported(false));
    } else {
      setIsArSupported(false);
      setIsVrSupported(false);
    }
  }, []);

  useEffect(() => {
    const handleWebGPUXRUnavailable = (event: Event) => {
      const reason = (event as CustomEvent<{ reason?: string }>).detail?.reason || 'WebGPU XR is unavailable on this browser';
      setRendererMode('webgl');
      setXrActionMessage(`${reason}. Switched to WebGL; tap VR again.`);
    };

    window.addEventListener(WEBGPU_XR_UNAVAILABLE_EVENT, handleWebGPUXRUnavailable);
    return () => window.removeEventListener(WEBGPU_XR_UNAVAILABLE_EVENT, handleWebGPUXRUnavailable);
  }, [setRendererMode]);

  const switchToWebGLForXR = (target: 'vr' | 'ar') => {
    setRendererMode('webgl');
    setXrActionMessage(target === 'vr'
      ? 'Switched to WebGL for XR. Tap VR again.'
      : 'Switched to WebGL for XR. Tap passthrough again.'
    );
  };

  const enterVRSpace = async () => {
    try {
      if (rendererMode === 'webgpu') {
        window.dispatchEvent(new CustomEvent(WEBGPU_XR_REQUEST_EVENT, { detail: { mode: 'vr' } }));
        setXrActionMessage('Trying WebGPU VR. If Quest Browser cannot start it, this will switch to WebGL VR fallback.');
        return;
      }

      if (isVrSupported === null) {
        setXrActionMessage("Still checking immersive VR support.");
        return;
      }

      if (isVrSupported !== true) {
        console.warn("immersive-vr is not supported by this browser/device.");
        setXrActionMessage("Immersive VR is not supported by this browser.");
        return;
      }

      setXrActionMessage(null);
      await xrStore.enterVR();
    } catch (err: any) {
      console.warn("Unable to enter immersive VR session:", err);
      setXrActionMessage("Unable to start immersive VR.");
    }
  };

  const enterPassthroughSpace = async () => {
    try {
      if (rendererMode === 'webgpu') {
        switchToWebGLForXR('ar');
        return;
      }

      if (isArSupported) {
        setXrActionMessage(null);
        const session = await xrStore.enterAR();
        if (session?.environmentBlendMode !== 'alpha-blend') {
          console.warn(`immersive-ar started with environmentBlendMode=${session?.environmentBlendMode}; rendering opaque spatial mode because true passthrough requires alpha-blend from the browser/device.`);
        }
        return;
      }

      if (isVrSupported) {
        console.warn("immersive-ar passthrough is not supported by this browser/device; entering immersive-vr fallback.");
        setXrActionMessage(null);
        await xrStore.enterVR();
        return;
      }

      if (isArSupported === null || isVrSupported === null) {
        setXrActionMessage("Still checking passthrough support.");
        return;
      }

      console.warn("immersive-ar passthrough and immersive-vr fallback are not supported by this browser/device.");
      setXrActionMessage("Passthrough is unavailable in this browser.");
    } catch (err: any) {
      console.warn("Unable to enter passthrough AR session:", err);
      setXrActionMessage("Unable to start passthrough mode.");
    }
  };

  const formatQuant = (q: number) => q >= 0 ? `${q + 1}x` : `1/${Math.abs(q) + 1}x`;
  const adjustWebgpuLighting = (delta: number) => {
    const nextLighting = Math.min(3.5, Math.max(0.45, webgpuLighting + delta));
    setWebgpuLighting(Number(nextLighting.toFixed(2)));
  };
  const webgpuGeometryOptions: Array<{ value: WebGPUGeometryProfile; label: string }> = [
    { value: 'auto', label: 'Formula Auto' },
    { value: 'ribbon', label: 'Ribbon' },
    { value: 'surface', label: 'Surface' },
    { value: 'lathe', label: 'Lathe' },
    { value: 'crystal', label: 'Crystal' },
    { value: 'extrude', label: 'Extrude' },
    { value: 'tube', label: 'Tube' },
    { value: 'helix', label: 'Helix Spine' },
    { value: 'shell', label: 'Shell Field' },
    { value: 'terrain', label: 'Terrain Patch' },
    { value: 'constellation', label: 'Constellation' },
    { value: 'knot', label: 'Knot Vessel' },
    { value: 'mandala', label: 'Mandala' },
    { value: 'lattice', label: 'Lattice' },
    { value: 'ripple', label: 'Ripple Sheet' },
    { value: 'prism', label: 'Prism Field' },
    { value: 'vortex', label: 'Vortex Fold' }
  ];
  const webgpuLightingOptions: Array<{ value: WebGPULightingPreset; label: string }> = [
    { value: 'studio', label: 'Studio' },
    { value: 'aurora', label: 'Aurora' },
    { value: 'gallery', label: 'Gallery' },
    { value: 'eclipse', label: 'Eclipse' },
    { value: 'caustic', label: 'Caustic' },
    { value: 'noir', label: 'Noir' },
    { value: 'sunset', label: 'Sunset' },
    { value: 'laboratory', label: 'Laboratory' },
    { value: 'underlight', label: 'Underlight' },
    { value: 'prism', label: 'Prism' }
  ];
  const webgpuMaterialOptions: Array<{ value: WebGPUMaterialProfile; label: string }> = [
    { value: 'auto', label: 'Shader Mapped' },
    { value: 'plasma', label: 'Plasma' },
    { value: 'liquid-metal', label: 'Liquid Metal' },
    { value: 'pearl', label: 'Pearl' },
    { value: 'glass', label: 'Glass' },
    { value: 'velvet', label: 'Velvet' },
    { value: 'ceramic', label: 'Ceramic' },
    { value: 'hologram', label: 'Hologram' },
    { value: 'obsidian', label: 'Obsidian' },
    { value: 'copper', label: 'Copper Patina' },
    { value: 'jade', label: 'Jade' },
    { value: 'xray', label: 'X-Ray' },
    { value: 'carbon', label: 'Carbon Fiber' },
    { value: 'chrome', label: 'Chrome' },
    { value: 'ruby', label: 'Ruby' },
    { value: 'ice', label: 'Ice' },
    { value: 'neon', label: 'Neon' }
  ];

  return (
    <aside className="min-h-[520px] lg:col-span-2 xl:col-span-1 xl:min-h-0 flex flex-col gap-6 overflow-y-auto pr-1 h-full custom-scrollbar text-[#e0e0e0] pb-4">
      {/* Dynamic Editor */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-5 flex flex-col shrink-0">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-300 mb-5">
           {activeTab === 'formulas' ? 'Coordinate Matrix' : 'Shader Core Engine'}
        </h2>
        
        {activeTab === 'formulas' ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[9px] font-mono text-white/40 uppercase tracking-widest">X-Vector (p, t)</label>
              <textarea 
                value={selectedFormula.x}
                onChange={(e) => onUpdateFormula(e.target.value, selectedFormula.y, selectedFormula.z || "sin(2 * p + t) * 4")}
                className="w-full bg-black/40 border border-white/10 rounded-lg p-3 font-mono text-xs text-indigo-100 outline-none focus:border-indigo-500/50 transition-colors h-16 resize-none animate-pulse"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-mono text-white/40 uppercase tracking-widest">Y-Vector (p, t)</label>
              <textarea 
                value={selectedFormula.y}
                onChange={(e) => onUpdateFormula(selectedFormula.x, e.target.value, selectedFormula.z || "sin(2 * p + t) * 4")}
                className="w-full bg-black/40 border border-white/10 rounded-lg p-3 font-mono text-xs text-indigo-100 outline-none focus:border-indigo-500/50 transition-colors h-16 resize-none animate-pulse"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-mono text-[#d946ef] uppercase tracking-widest font-bold">Z-Vector (p, t) <span className="text-white/30 font-normal">[3D Volumetric]</span></label>
              <textarea 
                value={selectedFormula.z || "sin(2 * p + t) * 4"}
                onChange={(e) => onUpdateFormula(selectedFormula.x, selectedFormula.y, e.target.value)}
                placeholder="sin(2 * p + t) * 4"
                className="w-full bg-black/40 border border-white/10 rounded-lg p-3 font-mono text-xs text-[#d946ef] outline-none focus:border-indigo-500/50 transition-colors h-16 resize-none animate-pulse"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <label className="text-[9px] font-mono text-white/40 uppercase tracking-widest">GLSL Fragment Source</label>
            <textarea 
              value={selectedShader.fragmentShader}
              onChange={(e) => onUpdateShader(e.target.value)}
              spellCheck={false}
              className="w-full bg-black/40 border border-white/10 rounded-lg p-3 font-mono text-[10px] text-[#00ffcc] outline-none focus:border-indigo-500/50 transition-colors h-40 resize-none custom-scrollbar"
            />
          </div>
        )}
        
        <div className="mt-4 pt-4 border-t border-white/5 flex gap-2 overflow-hidden">
          <div className="shrink-0 w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1" />
          <div className="text-[9px] text-white/30 italic font-serif">Signal updates are broadcast in real-time to the render node.</div>
        </div>
      </div>

      {/* Rendering Controls */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-5 flex flex-col shrink-0">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-300 mb-5">Output Configuration</h2>
        
        <div className="space-y-6">
          {/* Renderer Path */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-xs font-semibold text-white/80">Renderer Path</div>
                <div className="text-[9px] text-white/30 font-mono">
                  {rendererMode === 'webgpu' ? 'Full WebGPU + TSL Nodes' : 'Stable WebGL ShaderMaterial'}
                </div>
              </div>
              <div className="text-[9px] font-mono uppercase text-cyan-300">
                {rendererMode}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-black/30 p-1">
              <button
                onClick={() => setRendererMode('webgl')}
                aria-pressed={rendererMode === 'webgl'}
                className={cn(
                  "rounded-md px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] transition-colors",
                  rendererMode === 'webgl'
                    ? "bg-indigo-500/30 text-indigo-100"
                    : "text-white/35 hover:bg-white/[0.08] hover:text-white/70"
                )}
                type="button"
              >
                WebGL
              </button>
              <button
                onClick={() => setRendererMode('webgpu')}
                aria-pressed={rendererMode === 'webgpu'}
                className={cn(
                  "rounded-md px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] transition-colors",
                  rendererMode === 'webgpu'
                    ? "bg-cyan-500/25 text-cyan-100"
                    : "text-white/35 hover:bg-white/[0.08] hover:text-white/70"
                )}
                type="button"
              >
                WebGPU
              </button>
            </div>
          </div>

          {rendererMode === 'webgpu' && (
            <div className="space-y-4 rounded-lg border border-cyan-400/15 bg-cyan-400/[0.04] p-3">
              <div className="space-y-3 group">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="text-xs font-semibold text-white/80 group-hover:text-white transition-colors">WebGPU Lighting</div>
                    <div className="text-[9px] text-white/30 font-mono">Tone Map / Scene Light</div>
                  </div>
                  <div className="text-[10px] font-mono text-cyan-300">{webgpuLighting.toFixed(2)}x</div>
                </div>
                <input
                  type="range"
                  min="0.45"
                  max="3.5"
                  step="0.05"
                  value={webgpuLighting}
                  onChange={(e) => setWebgpuLighting(parseFloat(e.target.value))}
                  className="w-full h-1 bg-cyan-500/25 rounded-full appearance-none cursor-pointer accent-cyan-300 hover:accent-cyan-200 transition-all"
                />
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    aria-label="Decrease WebGPU lighting"
                    onClick={() => adjustWebgpuLighting(-0.15)}
                    className="rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/55 transition-colors hover:bg-white/[0.08] hover:text-white"
                  >
                    -
                  </button>
                  <button
                    type="button"
                    aria-label="Increase WebGPU lighting"
                    onClick={() => adjustWebgpuLighting(0.15)}
                    className="rounded-md border border-cyan-300/20 bg-cyan-400/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-100 transition-colors hover:bg-cyan-400/20"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div>
                  <div className="text-xs font-semibold text-white/80">WebGPU Light Rig</div>
                  <div className="text-[9px] text-white/30 font-mono">Preset Light Direction</div>
                </div>
                <select
                  value={webgpuLightingPreset}
                  onChange={(e) => setWebgpuLightingPreset(e.target.value as WebGPULightingPreset)}
                  className="w-full rounded-md border border-white/10 bg-black/45 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.12em] text-cyan-100 outline-none transition-colors focus:border-cyan-300/50"
                >
                  {webgpuLightingOptions.map((option) => (
                    <option key={option.value} value={option.value} className="bg-[#090909] text-cyan-50">
                      {option.label}
                    </option>
                  ))}
                </select>
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-semibold text-white/65">Auto-Cycle Light Rig</div>
                      <div className="text-[8px] text-white/30 font-mono">{webgpuLightingCycleSpeed.toFixed(1)}s interval</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAutoCycleWebgpuLighting(!autoCycleWebgpuLighting)}
                      aria-label="Auto-cycle WebGPU light rig"
                      aria-pressed={autoCycleWebgpuLighting}
                      className={cn(
                        "w-9 h-4 rounded-full transition-all duration-300 relative flex items-center px-0.5",
                        autoCycleWebgpuLighting ? "bg-cyan-500" : "bg-white/10"
                      )}
                    >
                      <div className={cn(
                        "w-3 h-3 bg-white rounded-full transition-all duration-300 shadow-sm",
                        autoCycleWebgpuLighting ? "translate-x-5" : "translate-x-0"
                      )} />
                    </button>
                  </div>
                  <input
                    type="range"
                    min={WEBGPU_CYCLE_INTERVAL_MIN}
                    max={WEBGPU_CYCLE_INTERVAL_MAX}
                    step="0.5"
                    value={webgpuCycleIntervalToSliderValue(webgpuLightingCycleSpeed)}
                    onChange={(e) => setWebgpuLightingCycleSpeed(webgpuCycleSliderValueToInterval(parseFloat(e.target.value)))}
                    disabled={!autoCycleWebgpuLighting}
                    className={cn(
                      "w-full h-1 rounded-full appearance-none cursor-pointer transition-all",
                      autoCycleWebgpuLighting ? "bg-cyan-500/25 accent-cyan-300" : "bg-white/10 opacity-35"
                    )}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div>
                  <div className="text-xs font-semibold text-white/80">WebGPU Geometry</div>
                  <div className="text-[9px] text-white/30 font-mono">Formula Shape Mode</div>
                </div>
                <select
                  value={webgpuGeometry}
                  onChange={(e) => setWebgpuGeometry(e.target.value as WebGPUGeometryProfile)}
                  className="w-full rounded-md border border-white/10 bg-black/45 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.12em] text-cyan-100 outline-none transition-colors focus:border-cyan-300/50"
                >
                  {webgpuGeometryOptions.map((option) => (
                    <option key={option.value} value={option.value} className="bg-[#090909] text-cyan-50">
                      {option.label}
                    </option>
                  ))}
                </select>
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-semibold text-white/65">Auto-Cycle Geometry</div>
                      <div className="text-[8px] text-white/30 font-mono">{webgpuGeometryCycleSpeed.toFixed(1)}s interval</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAutoCycleWebgpuGeometry(!autoCycleWebgpuGeometry)}
                      aria-label="Auto-cycle WebGPU geometry"
                      aria-pressed={autoCycleWebgpuGeometry}
                      className={cn(
                        "w-9 h-4 rounded-full transition-all duration-300 relative flex items-center px-0.5",
                        autoCycleWebgpuGeometry ? "bg-cyan-500" : "bg-white/10"
                      )}
                    >
                      <div className={cn(
                        "w-3 h-3 bg-white rounded-full transition-all duration-300 shadow-sm",
                        autoCycleWebgpuGeometry ? "translate-x-5" : "translate-x-0"
                      )} />
                    </button>
                  </div>
                  <input
                    type="range"
                    min={WEBGPU_CYCLE_INTERVAL_MIN}
                    max={WEBGPU_CYCLE_INTERVAL_MAX}
                    step="0.5"
                    value={webgpuCycleIntervalToSliderValue(webgpuGeometryCycleSpeed)}
                    onChange={(e) => setWebgpuGeometryCycleSpeed(webgpuCycleSliderValueToInterval(parseFloat(e.target.value)))}
                    disabled={!autoCycleWebgpuGeometry}
                    className={cn(
                      "w-full h-1 rounded-full appearance-none cursor-pointer transition-all",
                      autoCycleWebgpuGeometry ? "bg-cyan-500/25 accent-cyan-300" : "bg-white/10 opacity-35"
                    )}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="text-xs font-semibold text-white/80">WebGPU Material</div>
                    <div className="text-[9px] text-white/30 font-mono">Node Surface Profile</div>
                  </div>
                </div>
                <select
                  value={webgpuMaterial}
                  onChange={(e) => setWebgpuMaterial(e.target.value as WebGPUMaterialProfile)}
                  className="w-full rounded-md border border-white/10 bg-black/45 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.12em] text-cyan-100 outline-none transition-colors focus:border-cyan-300/50"
                >
                  {webgpuMaterialOptions.map((option) => (
                    <option key={option.value} value={option.value} className="bg-[#090909] text-cyan-50">
                      {option.label}
                    </option>
                  ))}
                </select>
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-semibold text-white/65">Auto-Cycle Material</div>
                      <div className="text-[8px] text-white/30 font-mono">{webgpuMaterialCycleSpeed.toFixed(1)}s interval</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAutoCycleWebgpuMaterial(!autoCycleWebgpuMaterial)}
                      aria-label="Auto-cycle WebGPU material"
                      aria-pressed={autoCycleWebgpuMaterial}
                      className={cn(
                        "w-9 h-4 rounded-full transition-all duration-300 relative flex items-center px-0.5",
                        autoCycleWebgpuMaterial ? "bg-cyan-500" : "bg-white/10"
                      )}
                    >
                      <div className={cn(
                        "w-3 h-3 bg-white rounded-full transition-all duration-300 shadow-sm",
                        autoCycleWebgpuMaterial ? "translate-x-5" : "translate-x-0"
                      )} />
                    </button>
                  </div>
                  <input
                    type="range"
                    min={WEBGPU_CYCLE_INTERVAL_MIN}
                    max={WEBGPU_CYCLE_INTERVAL_MAX}
                    step="0.5"
                    value={webgpuCycleIntervalToSliderValue(webgpuMaterialCycleSpeed)}
                    onChange={(e) => setWebgpuMaterialCycleSpeed(webgpuCycleSliderValueToInterval(parseFloat(e.target.value)))}
                    disabled={!autoCycleWebgpuMaterial}
                    className={cn(
                      "w-full h-1 rounded-full appearance-none cursor-pointer transition-all",
                      autoCycleWebgpuMaterial ? "bg-cyan-500/25 accent-cyan-300" : "bg-white/10 opacity-35"
                    )}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="h-[1px] bg-white/5" />

          {/* Artifacts Switch */}
          <div className="flex items-center justify-between group">
            <div>
              <div className="text-xs font-semibold text-white/80 group-hover:text-white transition-colors">Show Artifacts</div>
              <div className="text-[9px] text-white/30 font-mono">Axes / Grid / Guides</div>
            </div>
            <button 
              onClick={() => setShowArtifacts(!showArtifacts)}
              className={cn(
                "w-10 h-5 rounded-full transition-all duration-300 relative flex items-center px-1",
                showArtifacts ? "bg-indigo-600" : "bg-white/10"
              )}
            >
              <div className={cn(
                "w-3 h-3 bg-white rounded-full transition-all duration-300 shadow-sm",
                showArtifacts ? "translate-x-5" : "translate-x-0"
              )} />
            </button>
          </div>

          {/* 3D Switch */}
          <div className="flex items-center justify-between group">
              <div>
                <div className="text-xs font-semibold text-white/80 group-hover:text-white transition-colors">3D Volume</div>
                <div className="text-[9px] text-white/30 font-mono">Varied Geometry Mode</div>
              </div>
            <button 
              onClick={() => setShow3D(!show3D)}
              className={cn(
                "w-10 h-5 rounded-full transition-all duration-300 relative flex items-center px-1",
                show3D ? "bg-indigo-600" : "bg-white/10"
              )}
            >
              <div className={cn(
                "w-3 h-3 bg-white rounded-full transition-all duration-300 shadow-sm",
                show3D ? "translate-x-5" : "translate-x-0"
              )} />
            </button>
          </div>

          {/* Wireframe Switch */}
          <div className="flex items-center justify-between group">
            <div>
              <div className="text-xs font-semibold text-white/80 group-hover:text-white transition-colors">Wireframe</div>
              <div className="text-[9px] text-white/30 font-mono">Topological View</div>
            </div>
            <button 
              onClick={() => setShowWireframe(!showWireframe)}
              className={cn(
                "w-10 h-5 rounded-full transition-all duration-300 relative flex items-center px-1",
                showWireframe ? "bg-indigo-600" : "bg-white/10"
              )}
            >
              <div className={cn(
                "w-3 h-3 bg-white rounded-full transition-all duration-300 shadow-sm",
                showWireframe ? "translate-x-5" : "translate-x-0"
              )} />
            </button>
          </div>

          {/* Background Mirrors Switch */}
          <div className="flex items-center justify-between group">
            <div>
              <div className="text-xs font-semibold text-white/80 group-hover:text-white transition-colors">Background Mirrors</div>
              <div className="text-[9px] text-white/30 font-mono">Reflector Panels</div>
            </div>
            <button
              onClick={() => setShowMirrors(!showMirrors)}
              aria-label="Background Mirrors"
              aria-pressed={showMirrors}
              className={cn(
                "w-10 h-5 rounded-full transition-all duration-300 relative flex items-center px-1",
                showMirrors ? "bg-indigo-600" : "bg-white/10"
              )}
            >
              <div className={cn(
                "w-3 h-3 bg-white rounded-full transition-all duration-300 shadow-sm",
                showMirrors ? "translate-x-5" : "translate-x-0"
              )} />
            </button>
          </div>

          <div className="h-[1px] bg-white/5" />

          {/* Speed Slider */}
          <div className="space-y-3 group">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-xs font-semibold text-white/80 group-hover:text-white transition-colors">Animation Speed</div>
                <div className="text-[9px] text-white/30 font-mono">{audioSync ? "BPM Multiplier" : "Temporal Multiplier"}</div>
              </div>
              <div className="text-[10px] font-mono text-indigo-400">{audioSync ? formatQuant(speedQuant) : `${speed.toFixed(1)}x`}</div>
            </div>
            {audioSync ? (
              <input 
                type="range" 
                min="-10" 
                max="10" 
                step="1" 
                value={speedQuant} 
                onChange={(e) => setSpeedQuant(parseInt(e.target.value))}
                className="w-full h-1 bg-indigo-500/30 rounded-full appearance-none cursor-pointer accent-indigo-400 hover:accent-indigo-300 transition-all"
              />
            ) : (
              <input 
                type="range" 
                min="0" 
                max="5" 
                step="0.1" 
                value={speed} 
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all"
              />
            )}
          </div>

          <div className="h-[1px] bg-white/5" />

          {/* Auto-Pilot Controls */}
          <div className="h-[1px] bg-white/5" />
          
          <div className="space-y-4">
            {/* Audio Sync Toggle */}
            <div className="flex items-center justify-between group bg-indigo-500/10 p-2 rounded-lg border border-indigo-500/20">
              <div>
                <div className="text-xs font-semibold text-indigo-300 group-hover:text-indigo-200 transition-colors">Audio Beat Sync</div>
                <div className="text-[9px] text-indigo-400/50 font-mono">Microphone Analysis</div>
              </div>
              <button 
                onClick={() => setAudioSync(!audioSync)}
                className={cn(
                  "w-10 h-5 rounded-full transition-all duration-300 relative flex items-center px-1",
                  audioSync ? "bg-indigo-500" : "bg-white/10"
                )}
              >
                <div className={cn(
                  "w-3 h-3 bg-white rounded-full transition-all duration-300 shadow-sm",
                  audioSync ? "translate-x-5" : "translate-x-0"
                )} />
              </button>
            </div>

            {/* Formula Auto-Cycle */}
            <div className="space-y-3 group">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-white/80 group-hover:text-white transition-colors">Auto-Cycle Formula</div>
                  <div className="text-[9px] text-white/30 font-mono">{audioSync ? `Beat Sync: ${formatQuant(formulaQuant)}` : `Interval: ${formulaCycleSpeed.toFixed(1)}s`}</div>
                </div>
                <button 
                  onClick={() => setAutoCycleFormula(!autoCycleFormula)}
                  className={cn(
                    "w-10 h-5 rounded-full transition-all duration-300 relative flex items-center px-1",
                    autoCycleFormula ? "bg-indigo-600" : "bg-white/10"
                  )}
                >
                  <div className={cn(
                    "w-3 h-3 bg-white rounded-full transition-all duration-300 shadow-sm",
                    autoCycleFormula ? "translate-x-5" : "translate-x-0"
                  )} />
                </button>
              </div>
              {audioSync ? (
                <input 
                  type="range" 
                  min="-10" 
                  max="10" 
                  step="1" 
                  value={formulaQuant} 
                  onChange={(e) => setFormulaQuant(parseInt(e.target.value))}
                  disabled={!autoCycleFormula}
                  className={cn(
                    "w-full h-1 bg-indigo-500/30 rounded-full appearance-none cursor-pointer transition-all",
                    autoCycleFormula ? "accent-indigo-400 hover:accent-indigo-300" : "opacity-30"
                  )}
                />
              ) : (
                <input 
                  type="range" 
                  min="0.5" 
                  max="10" 
                  step="0.5" 
                  value={formulaCycleSpeed} 
                  onChange={(e) => setFormulaCycleSpeed(parseFloat(e.target.value))}
                  disabled={!autoCycleFormula}
                  className={cn(
                    "w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer transition-all",
                    autoCycleFormula ? "accent-indigo-500 hover:accent-indigo-400" : "opacity-30"
                  )}
                />
              )}
            </div>

            {/* Shader Auto-Cycle */}
            <div className="space-y-3 group">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-white/80 group-hover:text-white transition-colors">Auto-Cycle Shader</div>
                  <div className="text-[9px] text-white/30 font-mono">{audioSync ? `Beat Sync: ${formatQuant(shaderQuant)}` : `Interval: ${shaderCycleSpeed.toFixed(1)}s`}</div>
                </div>
                <button 
                  onClick={() => setAutoCycleShader(!autoCycleShader)}
                  className={cn(
                    "w-10 h-5 rounded-full transition-all duration-300 relative flex items-center px-1",
                    autoCycleShader ? "bg-indigo-600" : "bg-white/10"
                  )}
                >
                  <div className={cn(
                    "w-3 h-3 bg-white rounded-full transition-all duration-300 shadow-sm",
                    autoCycleShader ? "translate-x-5" : "translate-x-0"
                  )} />
                </button>
              </div>
              {audioSync ? (
                <input 
                  type="range" 
                  min="-10" 
                  max="10" 
                  step="1" 
                  value={shaderQuant} 
                  onChange={(e) => setShaderQuant(parseInt(e.target.value))}
                  disabled={!autoCycleShader}
                  className={cn(
                    "w-full h-1 bg-indigo-500/30 rounded-full appearance-none cursor-pointer transition-all",
                    autoCycleShader ? "accent-indigo-400 hover:accent-indigo-300" : "opacity-30"
                  )}
                />
              ) : (
                <input 
                  type="range" 
                  min="0.5" 
                  max="10" 
                  step="0.5" 
                  value={shaderCycleSpeed} 
                  onChange={(e) => setShaderCycleSpeed(parseFloat(e.target.value))}
                  disabled={!autoCycleShader}
                  className={cn(
                    "w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer transition-all",
                    autoCycleShader ? "accent-indigo-500 hover:accent-indigo-400" : "opacity-30"
                  )}
                />
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 mt-auto shrink-0">
            <div className="bg-black/40 border border-white/5 p-3 rounded-lg">
              <div className="text-[8px] text-white/30 uppercase tracking-[0.2em] font-mono mb-1">FPS</div>
              <div className="text-lg font-mono text-indigo-400 leading-none">60.0</div>
            </div>
            <div className="bg-black/40 border border-white/5 p-3 rounded-lg">
              <div className="text-[8px] text-white/30 uppercase tracking-[0.2em] font-mono mb-1">Verts</div>
              <div className="text-lg font-mono text-indigo-400 leading-none">1.2K</div>
            </div>
          </div>
        </div>
      </div>

      {/* WebXR Vision Pro Immersive Section */}
      <div className="space-y-4 p-5 bg-gradient-to-br from-indigo-950/40 via-violet-950/20 to-black/40 border border-indigo-500/30 rounded-xl shrink-0 backdrop-blur shadow-2xl">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-xs font-semibold text-indigo-300">Cross-Headset Spatial 3D</div>
            <div className="text-[8px] text-white/30 font-mono">WebXR stereoscopic modes</div>
          </div>
          <div className="px-1.5 py-0.5 bg-indigo-500/20 rounded text-[7px] text-indigo-300 font-mono uppercase tracking-wider font-semibold">WebXR Enabled</div>
        </div>
        
        <div className="pt-1 flex flex-col gap-2.5">
          <button
            onClick={enterVRSpace}
            disabled={rendererMode !== 'webgpu' && isVrSupported === false}
            className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 via-purple-700 to-pink-600 hover:from-indigo-500 hover:via-purple-600 hover:to-pink-500 border border-indigo-400/40 rounded-xl text-[10px] font-bold tracking-widest font-sans uppercase text-white shadow-2xl transition-all duration-300 flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
          >
            {rendererMode === 'webgpu' ? 'Try WebGPU Immersive VR' : isVrSupported === null ? 'Checking Immersive Space' : isVrSupported ? 'Enter Immersive Space (VR)' : 'Immersive Space Unavailable'}
          </button>
          
          <button
            onClick={enterPassthroughSpace}
            disabled={rendererMode !== 'webgpu' && isArSupported === false && isVrSupported === false}
            className="w-full py-3 px-4 bg-gradient-to-r from-teal-600 via-emerald-700 to-cyan-600 hover:from-teal-500 hover:via-emerald-600 hover:to-cyan-500 border border-teal-400/40 rounded-xl text-[10px] font-bold tracking-widest font-sans uppercase text-white shadow-2xl transition-all duration-300 flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
          >
            {rendererMode === 'webgpu' ? 'Switch to WebGL for Passthrough' : isArSupported === null || isVrSupported === null ? 'Checking Passthrough Support' : isArSupported ? 'Enter Passthrough Space (AR)' : isVrSupported ? 'Enter Spatial VR Fallback' : 'Passthrough Unavailable'}
          </button>
        </div>

        {xrActionMessage && (
          <div className="text-[10px] text-cyan-100 leading-normal bg-cyan-500/10 p-3 rounded border border-cyan-400/20">
            {xrActionMessage}
          </div>
        )}
        
        <div className="text-[7.5px] text-white/40 leading-normal bg-black/30 p-2.5 rounded border border-white/5 mt-2">
          <span className="text-indigo-400 font-bold">Passthrough:</span> true room visibility requires browser support for immersive-ar with alpha-blend. If only immersive-vr is available, the headset may dim until the system blend control is adjusted.
        </div>
      </div>

      {xrActionMessage && (
        <div className="fixed bottom-8 left-1/2 z-50 w-[min(92vw,720px)] -translate-x-1/2 rounded-lg border border-cyan-300/35 bg-black/85 px-5 py-4 text-center text-sm font-semibold leading-snug text-cyan-50 shadow-2xl shadow-cyan-950/40 backdrop-blur">
          {xrActionMessage}
        </div>
      )}
    </aside>
  );
}
