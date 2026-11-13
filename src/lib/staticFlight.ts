import * as THREE from 'three';
import type { WebGPUMaterialProfile } from '../constants';
import type { PrismColorMode } from './urlState';
import type { PrismStaticShape } from './prismChannels';
import type { PrismScoreData } from './prismTrail';
import { createPrismGeometry, createPrismMaterial, makePrismUniforms } from './prismRender';

export type StaticFlightOptions = {
  shape: PrismStaticShape | 'mesh';
  geometry?: THREE.BufferGeometry;
  template?: THREE.Object3D;
  material: 'original' | 'spectrum' | Exclude<WebGPUMaterialProfile, 'auto'>;
  wireframe: boolean;
  colorMode?: PrismColorMode;
  sliceWidth?: number;
};

export type StaticFlightActor = {
  root: THREE.Group;
  vertexCount: number;
  assign: (data: PrismScoreData, index: number) => void;
  update: (data: PrismScoreData, index: number, time: number, length: number, fx: number) => void;
  dispose: () => void;
};

export function staticFlightVertexCount(source: THREE.Object3D | THREE.BufferGeometry): number {
  if (source instanceof THREE.BufferGeometry) return source.getAttribute('position')?.count ?? 0;
  let vertices = 0;
  source.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) vertices += mesh.geometry.getAttribute('position')?.count ?? 0;
  });
  return vertices;
}

// OBJ templates own their shared geometry and texture maps. An authored
// actor clones only materials; transforms perform the same held-stroke
// growth as the instanced shader without merging away material groups.
function createAuthoredActor(template: THREE.Object3D, wireframe: boolean): StaticFlightActor {
  const model = template.clone(true);
  const materials = new Map<THREE.Material, THREE.Material>();
  const fade = { value: 1 };
  model.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;
    const cloneMaterial = (source: THREE.Material) => {
      const cached = materials.get(source);
      if (cached) return cached;
      const material = source.clone();
      if ('wireframe' in material) material.wireframe = wireframe;
      material.onBeforeCompile = shader => {
        shader.uniforms.uStaticFlightFade = fade;
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uStaticFlightFade;')
          .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
            if (uStaticFlightFade < fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453)) discard;
          `);
      };
      material.customProgramCacheKey = () => 'static-flight-authored-v1';
      materials.set(source, material);
      return material;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(cloneMaterial) : cloneMaterial(mesh.material);
  });
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const normalization = 1 / Math.max(0.001, size.x, size.y, size.z);
  const root = new THREE.Group(), body = new THREE.Group(), fit = new THREE.Group();
  fit.scale.setScalar(normalization);
  fit.position.copy(center).multiplyScalar(-normalization);
  fit.position.z += 0.5;
  fit.add(model); body.add(fit); root.add(body); root.visible = false;
  const matrix = new THREE.Matrix4();
  let disposed = false;
  return {
    root, vertexCount: staticFlightVertexCount(model),
    assign(data, index) {
      matrix.fromArray(data.matrices, index * 16).decompose(root.position, root.quaternion, root.scale);
      root.visible = true;
    },
    update(data, index, time, length, fx) {
      const age = time - data.birth[index];
      root.visible = age >= 0 && (length <= 0 || age < length);
      if (!root.visible) return;
      const pop = 1 + 0.55 * data.velocity[index] * fx * Math.exp(-age / 0.13);
      const growth = THREE.MathUtils.lerp(0.08, 1, THREE.MathUtils.clamp(age / Math.max(data.duration[index], 0.02), 0, 1));
      body.scale.set(pop, pop, growth);
      fade.value = length > 0 ? THREE.MathUtils.smoothstep(length - age, 0, Math.min(2, length)) : 1;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      materials.forEach(material => material.dispose());
      root.removeFromParent();
    },
  };
}

// A one-instance draw lets mixed channels share the exact prism shader and
// physical growth/normal correction used by the full-score static stage.
// Each pooled actor owns its clone and attributes, so changing a channel's
// model or finish never destroys a cached OBJ or leaks instance buffers.
export function createStaticFlightActor(options: StaticFlightOptions): StaticFlightActor {
  if (options.material === 'original' && options.template) return createAuthoredActor(options.template, options.wireframe);
  const geometry = createPrismGeometry(options.shape, options.geometry ?? null);
  const uniforms = makePrismUniforms();
  uniforms.uPrismSlice.value = options.colorMode && options.colorMode !== 'full' ? 1 : 0;
  uniforms.uPrismSliceWidth.value = options.sliceWidth ?? 0.14;
  uniforms.uPrismFan.value = options.shape === 'spectrum' ? 1 : 0;
  const profile = options.material === 'original' || options.material === 'spectrum' ? 'auto' : options.material;
  const material = createPrismMaterial(options.material === 'spectrum' ? 'spectrum' : 'ornament', profile, options.wireframe, uniforms);
  const names = ['aBirth', 'aDuration', 'aVelocity', 'aHue', 'aCrowd'] as const;
  for (const name of names) geometry.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(1), 1).setUsage(THREE.DynamicDrawUsage));
  const mesh = new THREE.InstancedMesh(geometry, material, 1);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  const root = new THREE.Group(); root.add(mesh); root.visible = false;
  let disposed = false;
  return {
    root, vertexCount: staticFlightVertexCount(geometry),
    assign(data, index) {
      (mesh.instanceMatrix.array as Float32Array).set(data.matrices.subarray(index * 16, index * 16 + 16));
      mesh.instanceMatrix.needsUpdate = true;
      const values = [data.birth, data.duration, data.velocity, data.hue, data.crowd];
      names.forEach((name, attributeIndex) => {
        const attribute = geometry.getAttribute(name) as THREE.InstancedBufferAttribute;
        attribute.setX(0, values[attributeIndex][index]);
        attribute.needsUpdate = true;
      });
      root.visible = true;
    },
    update(data, index, time, length, fx) {
      const age = time - data.birth[index];
      root.visible = age >= 0 && (length <= 0 || age < length);
      uniforms.uPrismTime.value = time;
      uniforms.uPrismLength.value = length;
      uniforms.uPrismFx.value = fx;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      mesh.dispose(); geometry.dispose(); material.dispose();
      root.removeFromParent();
    },
  };
}
