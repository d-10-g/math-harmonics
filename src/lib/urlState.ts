import {
  Formula,
  PRESET_FORMULAS,
  ShaderPreset,
  WebGPUGeometryProfile,
  WebGPULightingPreset,
  WebGPUMaterialProfile
} from '../constants';
import { PRESET_SHADERS } from '../shaders';

// Shareable state: URL hash wins over localStorage, which wins over defaults.
// Only preset ids and settings are encoded; custom-edited formula/shader
// bodies are intentionally not serialized (v1).

const STORAGE_KEY = 'harmonics.state.v1';

export type SharedState = {
  formulaId?: string;
  shaderId?: string;
  rendererMode?: 'webgl' | 'webgpu';
  show3D?: boolean;
  showWireframe?: boolean;
  showArtifacts?: boolean;
  showMirrors?: boolean;
  speed?: number;
  webgpuGeometry?: WebGPUGeometryProfile;
  webgpuMaterial?: WebGPUMaterialProfile;
  webgpuLightingPreset?: WebGPULightingPreset;
  webgpuLighting?: number;
  autoStyle?: boolean;
  showEnvironment?: boolean;
  lineWidth?: number;
  cycleFavoritesOnly?: boolean;
  autoPilotShuffle?: boolean;
  postFX?: boolean;
  bloomIntensity?: number;
  audioSource?: 'mic' | 'midi';
  noteMeshes?: boolean;
  noteFxAmount?: number;
  noteFxMode?: 'both' | 'morph' | 'pulse' | 'off';
};

const GEOMETRY_VALUES: WebGPUGeometryProfile[] = ['auto', 'tube', 'ribbon', 'extrude', 'lathe', 'crystal', 'surface', 'helix', 'shell', 'terrain', 'constellation', 'knot', 'mandala', 'lattice', 'ripple', 'prism', 'vortex'];
const MATERIAL_VALUES: WebGPUMaterialProfile[] = ['auto', 'plasma', 'liquid-metal', 'pearl', 'glass', 'velvet', 'ceramic', 'hologram', 'obsidian', 'copper', 'jade', 'xray', 'carbon', 'chrome', 'ruby', 'ice', 'neon'];
const LIGHTING_VALUES: WebGPULightingPreset[] = ['studio', 'aurora', 'gallery', 'eclipse', 'caustic', 'noir', 'sunset', 'laboratory', 'underlight', 'prism'];

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return allowed.includes(value as T) ? (value as T) : undefined;
}

function parseParams(params: URLSearchParams): SharedState {
  const state: SharedState = {};
  const read = (key: string) => params.get(key) ?? undefined;

  state.formulaId = read('f');
  state.shaderId = read('s');
  state.rendererMode = oneOf(read('r'), ['webgl', 'webgpu'] as const);
  const flag = (key: string) => (params.has(key) ? params.get(key) === '1' : undefined);
  state.show3D = flag('d3');
  state.showWireframe = flag('wf');
  state.showArtifacts = flag('ax');
  state.showMirrors = flag('mr');
  const speed = read('sp');
  if (speed !== undefined && Number.isFinite(parseFloat(speed))) state.speed = Math.min(5, Math.max(0, parseFloat(speed)));
  state.webgpuGeometry = oneOf(read('geo'), GEOMETRY_VALUES);
  state.webgpuMaterial = oneOf(read('mat'), MATERIAL_VALUES);
  state.webgpuLightingPreset = oneOf(read('rig'), LIGHTING_VALUES);
  const lighting = read('li');
  if (lighting !== undefined && Number.isFinite(parseFloat(lighting))) state.webgpuLighting = Math.min(3.5, Math.max(0.45, parseFloat(lighting)));
  state.autoStyle = flag('as');
  state.showEnvironment = flag('env');
  state.cycleFavoritesOnly = flag('cf');
  state.autoPilotShuffle = flag('sh');
  state.postFX = flag('fx');
  state.audioSource = oneOf(read('asrc'), ['mic', 'midi'] as const);
  state.noteMeshes = flag('nm');
  const noteFx = read('nfa');
  if (noteFx !== undefined && Number.isFinite(parseFloat(noteFx))) state.noteFxAmount = Math.min(2, Math.max(0, parseFloat(noteFx)));
  state.noteFxMode = oneOf(read('nfm'), ['both', 'morph', 'pulse', 'off'] as const);
  const bloom = read('bl');
  if (bloom !== undefined && Number.isFinite(parseFloat(bloom))) state.bloomIntensity = Math.min(3, Math.max(0, parseFloat(bloom)));
  const lineWidth = read('lw');
  if (lineWidth !== undefined && Number.isFinite(parseFloat(lineWidth))) state.lineWidth = Math.min(0.5, Math.max(0, parseFloat(lineWidth)));
  return state;
}

export function loadSharedState(): SharedState {
  let stored: SharedState = {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) stored = JSON.parse(raw) as SharedState;
  } catch {
    // Corrupt storage is ignored; defaults apply.
  }

  const hash = typeof location !== 'undefined' ? location.hash.replace(/^#/, '') : '';
  if (!hash) return stored;
  const fromHash = parseParams(new URLSearchParams(hash));
  return { ...stored, ...Object.fromEntries(Object.entries(fromHash).filter(([, v]) => v !== undefined)) };
}

export function persistSharedState(state: Required<Omit<SharedState, 'formulaId' | 'shaderId'>> & {
  formulaId: string;
  shaderId: string;
}) {
  const params = new URLSearchParams();
  params.set('f', state.formulaId);
  params.set('s', state.shaderId);
  params.set('r', state.rendererMode);
  params.set('d3', state.show3D ? '1' : '0');
  params.set('wf', state.showWireframe ? '1' : '0');
  params.set('ax', state.showArtifacts ? '1' : '0');
  params.set('mr', state.showMirrors ? '1' : '0');
  params.set('sp', state.speed.toFixed(2));
  params.set('geo', state.webgpuGeometry);
  params.set('mat', state.webgpuMaterial);
  params.set('rig', state.webgpuLightingPreset);
  params.set('li', state.webgpuLighting.toFixed(2));
  params.set('as', state.autoStyle ? '1' : '0');
  params.set('env', state.showEnvironment ? '1' : '0');
  params.set('lw', state.lineWidth.toFixed(2));
  params.set('cf', state.cycleFavoritesOnly ? '1' : '0');
  params.set('sh', state.autoPilotShuffle ? '1' : '0');
  params.set('fx', state.postFX ? '1' : '0');
  params.set('bl', state.bloomIntensity.toFixed(2));
  params.set('asrc', state.audioSource);
  params.set('nm', state.noteMeshes ? '1' : '0');
  params.set('nfa', state.noteFxAmount.toFixed(2));
  params.set('nfm', state.noteFxMode);

  try {
    history.replaceState(null, '', `#${params.toString()}`);
  } catch {
    // Some embedded webviews block replaceState; non-fatal.
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage may be unavailable (private mode); non-fatal.
  }
}

export function resolveInitialFormula(state: SharedState): Formula {
  return PRESET_FORMULAS.find((f) => f.id === state.formulaId) ?? PRESET_FORMULAS[0];
}

export function resolveInitialShader(state: SharedState): ShaderPreset {
  return PRESET_SHADERS.find((s) => s.id === state.shaderId) ?? PRESET_SHADERS[0];
}
