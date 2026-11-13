import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { WebGPUMaterialProfile } from '../constants';
import type { ParsedMidi } from '../lib/midi';
import { clockStore } from '../lib/clock';
import { makePrismUniforms, createPrismMaterial, createPrismGeometry } from '../lib/prismRender';
import { isValidMeshName, loadMeshGeometry } from '../lib/meshLibrary';
import type { PrismColorMode } from '../lib/urlState';
import AnimatedGlbFlight from './AnimatedGlbFlight';
import MixedFlight from './MixedFlight';
import type { PrismChannelMap } from '../lib/prismChannels';
import { buildPrismScore, prismInstanceBudget, prismVisibleRange, samplePrismPose, type PrismFinish, type PrismShape } from '../lib/prismTrail';

export default function PrismStage({ midi, getMusicTime, noteSpread, colorMode = 'full', sliceWidth = 0.14,
  perChannel = false, shape = 'spectrum', finish = 'spectrum', pathSpread = 1, trailLength = 0,
  materialProfile = 'auto', meshId = 'Star', showWireframe = false, channelMap, onStatus }: {
  midi: ParsedMidi | null; getMusicTime?: () => { time: number; duration: number }; noteSpread: number;
  colorMode?: PrismColorMode; sliceWidth?: number; perChannel?: boolean; shape?: PrismShape; finish?: PrismFinish;
  pathSpread?: number; trailLength?: number; materialProfile?: WebGPUMaterialProfile; meshId?: string; showWireframe?: boolean; channelMap?: PrismChannelMap; onStatus?: (status: string) => void;
}) {
  const [sourceGeometry, setSourceGeometry] = useState<{ id: string; geometry: THREE.BufferGeometry } | null>(null);
  useEffect(() => {
    if (shape !== 'mesh' || !isValidMeshName(meshId)) return;
    let active = true;
    void loadMeshGeometry(meshId).then(geometry => {
      if (active) setSourceGeometry(geometry ? { id: meshId, geometry } : null);
    });
    return () => { active = false; };
  }, [shape, meshId]);
  const uniforms = useMemo(makePrismUniforms, []);
  const material = useMemo(() => createPrismMaterial(finish, materialProfile, showWireframe, uniforms), [finish, materialProfile, showWireframe, uniforms]);
  useEffect(() => () => material.dispose(), [material]);
  const data = useMemo(() => midi ? buildPrismScore(midi, noteSpread, perChannel, colorMode, pathSpread, shape) : null,
    [midi, noteSpread, perChannel, colorMode, pathSpread, shape]);
  const geometry = useMemo(() => createPrismGeometry(shape, sourceGeometry?.id === meshId ? sourceGeometry.geometry : null), [shape, sourceGeometry, meshId]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const mesh = useMemo(() => {
    if (!data || shape === 'glb' || shape === 'mixed') return null;
    const capacity = Math.min(data.count, prismInstanceBudget(geometry.getAttribute('position').count));
    // Instance attributes belong to this draw, not the reusable shape.
    // Material/data swaps can replace the draw without orphaning GPU buffers.
    const ownedGeometry = geometry.clone();
    for (const name of ['aBirth', 'aDuration', 'aVelocity', 'aHue', 'aCrowd']) {
      ownedGeometry.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage));
    }
    const instances = new THREE.InstancedMesh(ownedGeometry, material, capacity);
    instances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    instances.count = 0;
    instances.frustumCulled = false;
    return { instances, geometry: ownedGeometry, capacity, start: -1, end: -1 };
  }, [data, geometry, material, shape]);
  useEffect(() => () => {
    mesh?.instances.dispose();
    mesh?.geometry.dispose();
  }, [mesh]);
  const trailRef = useRef<THREE.Group>(null);
  const planePosition = useMemo(() => new THREE.Vector3(), []);
  const planeQuaternion = useMemo(() => new THREE.Quaternion(), []);
  useFrame(() => {
    const trail = trailRef.current;
    if (!trail || !data) return;
    const rawTime = getMusicTime?.().time ?? 0;
    const time = Number.isFinite(rawTime) ? Math.max(0, rawTime) : 0;
    samplePrismPose(data.table, time, planePosition, planeQuaternion);
    trail.quaternion.copy(planeQuaternion).invert();
    trail.position.copy(planePosition).negate().applyQuaternion(trail.quaternion);
    const length = Number.isFinite(trailLength) ? Math.max(0, trailLength) : 0;
    if (mesh) {
      const range = prismVisibleRange(data.birth, time, length, mesh.capacity);
      if (range.start !== mesh.start || range.end !== mesh.end) {
        // Append only new births while the window stays put; shifts/seeks copy
        // the bounded window in one contiguous upload.
        const offset = range.start === mesh.start && range.end > mesh.end ? Math.max(0, mesh.end - range.start) : 0;
        const from = range.start + offset;
        const count = range.end - range.start;
        const matrix = mesh.instances.instanceMatrix;
        (matrix.array as Float32Array).set(data.matrices.subarray(from * 16, range.end * 16), offset * 16);
        matrix.clearUpdateRanges(); matrix.addUpdateRange(offset * 16, (count - offset) * 16); matrix.needsUpdate = true;
        const values = [data.birth, data.duration, data.velocity, data.hue, data.crowd];
        ['aBirth', 'aDuration', 'aVelocity', 'aHue', 'aCrowd'].forEach((name, i) => {
          const attribute = mesh.geometry.getAttribute(name) as THREE.InstancedBufferAttribute;
          (attribute.array as Float32Array).set(values[i].subarray(from, range.end), offset);
          attribute.clearUpdateRanges(); attribute.addUpdateRange(offset, count - offset); attribute.needsUpdate = true;
        });
        mesh.instances.count = count;
        mesh.start = range.start; mesh.end = range.end;
      }
    }
    uniforms.uPrismTime.value = time;
    uniforms.uPrismLength.value = length;
    uniforms.uPrismFan.value = shape === 'spectrum' ? 1 : 0;
    uniforms.uPrismSlice.value = colorMode === 'full' ? 0 : 1;
    uniforms.uPrismSliceWidth.value = sliceWidth;
    const clock = clockStore.getState();
    uniforms.uPrismFx.value = clock.noteFxMode === 'off' ? 0 : Math.min(3, clock.noteFxAmount) / 2;
  });
  if (!data) return null;
  return <group rotation={[0.3, 0, 0]} scale={1.15 * data.fit}>
    <group ref={trailRef}>
      {shape === 'mixed' ? <MixedFlight data={data} getMusicTime={getMusicTime} channelMap={channelMap ?? {}} materialProfile={materialProfile} finish={finish} showWireframe={showWireframe} trailLength={trailLength} onStatus={onStatus} colorMode={colorMode} sliceWidth={sliceWidth} /> : shape === 'glb' ? <AnimatedGlbFlight data={data} getMusicTime={getMusicTime} channelMap={channelMap ?? {}} materialProfile={materialProfile} finish={finish} showWireframe={showWireframe} trailLength={trailLength} onStatus={onStatus} /> : mesh && <primitive object={mesh.instances} dispose={null} />}
    </group>
  </group>;
}
