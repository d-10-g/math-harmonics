import type * as THREE from 'three';

// One face of a cube capture per call, so a live mirror can spread its six
// renders across six frames instead of paying for all of them at once.
// Mirrors three's CubeCamera.update() bookkeeping (XR off while capturing,
// render target restored afterwards) and works with both renderers.
// Assumes renderer.autoClear is on, as it is in every loop that calls this.
export type CubeFaceRenderer = {
  coordinateSystem: number;
  xr: { enabled: boolean };
  getRenderTarget(): unknown;
  getActiveCubeFace(): number;
  getActiveMipmapLevel(): number;
  setRenderTarget(target: unknown, activeCubeFace?: number, activeMipmapLevel?: number): void;
  render(scene: THREE.Object3D, camera: THREE.Camera): unknown;
};

export function renderCubeFace(renderer: CubeFaceRenderer, scene: THREE.Scene, cubeCamera: THREE.CubeCamera, face: number): void {
  if (cubeCamera.parent === null) cubeCamera.updateMatrixWorld();
  if (cubeCamera.coordinateSystem !== renderer.coordinateSystem) {
    cubeCamera.coordinateSystem = renderer.coordinateSystem as THREE.CoordinateSystem;
    cubeCamera.updateCoordinateSystem();
  }
  const camera = cubeCamera.children[face] as THREE.Camera | undefined;
  if (!camera) return;
  const currentTarget = renderer.getRenderTarget();
  const currentFace = renderer.getActiveCubeFace();
  const currentMip = renderer.getActiveMipmapLevel();
  const xrEnabled = renderer.xr.enabled;
  renderer.xr.enabled = false;
  renderer.setRenderTarget(cubeCamera.renderTarget, face, cubeCamera.activeMipmapLevel);
  renderer.render(scene, camera);
  renderer.setRenderTarget(currentTarget, currentFace, currentMip);
  renderer.xr.enabled = xrEnabled;
}
