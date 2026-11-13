import type { SharedState } from './urlState';
import { flightScene } from './flightScenes';

/** Defaults fill absent choices; saved preferences and share links still win. */
export function flightLandingState(saved: SharedState): SharedState {
  const scene = flightScene('cosmic-jelly');
  return {
    rendererMode: 'webgl', show3D: true, showWireframe: false, autoStyle: false,
    webgpuMaterial: 'auto', webgpuLightingPreset: scene.lighting, webgpuLighting: 1.15,
    showEnvironment: true, showStarfield: false, postFX: true, bloomIntensity: scene.bloom,
    audioSource: 'midi', noteMeshes: true, noteSource: 'prism', noteFxAmount: 2, noteFxMode: 'both', noteSpread: 5,
    prismColor: scene.color, prismSlice: 0.14, prismPerChannel: true,
    prismShape: 'mixed', prismFinish: scene.finish, prismPathSpread: scene.spread,
    prismTrailLength: scene.memory, prismMesh: 'Star', prismChannels: scene.channels, prismEffects: scene.effects,
    prismCameraFollow: true, prismCameraStyle: 'balanced', prismCameraEnergy: 1,
    ...saved,
  };
}
