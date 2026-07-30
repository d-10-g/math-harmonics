import * as THREE from 'three';
import { WebGPULightingPreset } from '../constants';
import { lightingRigSettings } from './lighting';

// Per-rig HDR environments: a gradient sky plus emissive "lightformer"
// panels placed at the rig's own light positions, baked to PMREM. This is
// what makes chrome reflect softboxes and glass refract a sunset instead of
// the flat gray procedural room three ships.

export function buildRigEnvironmentScene(preset: WebGPULightingPreset): THREE.Scene {
  const rig = lightingRigSettings(preset);
  const scene = new THREE.Scene();

  // Gradient sky sphere (vertex-colored: ground -> horizon -> zenith).
  const skyGeometry = new THREE.SphereGeometry(50, 48, 32);
  const positions = skyGeometry.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  const ground = new THREE.Color(rig.ground).multiplyScalar(0.55);
  const horizon = new THREE.Color(rig.background).multiplyScalar(1.35);
  const zenith = new THREE.Color(rig.ambient).multiplyScalar(0.4).lerp(new THREE.Color(rig.background), 0.35);
  const scratch = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const y = positions.getY(i) / 50;
    if (y < 0) scratch.copy(horizon).lerp(ground, Math.min(1, -y * 1.7));
    else scratch.copy(horizon).lerp(zenith, Math.pow(y, 0.6));
    colors[i * 3] = scratch.r;
    colors[i * 3 + 1] = scratch.g;
    colors[i * 3 + 2] = scratch.b;
  }
  skyGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  scene.add(new THREE.Mesh(skyGeometry, new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true })));

  // Emissive lightformers at the rig's key/rim/fill positions (HDR values).
  const addFormer = (
    position: [number, number, number],
    colorHex: number,
    intensity: number,
    size: [number, number]
  ) => {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(colorHex).multiplyScalar(intensity),
      side: THREE.DoubleSide
    });
    const former = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), material);
    former.position.set(position[0], position[1], position[2]).multiplyScalar(2.4);
    former.lookAt(0, 0, 0);
    scene.add(former);
  };

  addFormer(rig.keyPosition, rig.key, 7, [20, 13]); // broad soft key
  addFormer(rig.rimPosition, rig.rim, 11, [5, 26]); // tall rim strip
  addFormer(rig.fillPosition, rig.fill, 4.5, [15, 9]); // fill card

  // Ground bounce disc.
  const bounce = new THREE.Mesh(
    new THREE.CircleGeometry(26, 32),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(rig.ground).multiplyScalar(1.6) })
  );
  bounce.rotation.x = -Math.PI / 2;
  bounce.position.y = -17;
  scene.add(bounce);

  return scene;
}

export function disposeEnvironmentScene(scene: THREE.Scene) {
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      const material = object.material as THREE.Material | THREE.Material[];
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material.dispose();
    }
  });
}
