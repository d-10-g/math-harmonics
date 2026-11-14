import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { WebGPUMaterialProfile } from '../constants';
import type { ParsedMidi } from '../lib/midi';
import { clockStore } from '../lib/clock';
import { makePrismUniforms, createPrismMaterial, createPrismGeometry, updatePrismEffectsUniforms } from '../lib/prismRender';
import { isValidMeshName, loadMeshGeometry } from '../lib/meshLibrary';
import type { PrismColorMode } from '../lib/urlState';
import AnimatedGlbFlight from './AnimatedGlbFlight';
import MixedFlight from './MixedFlight';
import AutoCastFlight from './AutoCastFlight';
import FlightFireworks from './FlightFireworks';
import FlightSculptures from './FlightSculptures';
import FlightSpectacle from './FlightSpectacle';
import FlightPhenomena from './FlightPhenomena';
import FlightCameraDirector from './FlightCameraDirector';
import type { FlightCameraStyle } from '../lib/flightCameraStyles';
import { DEFAULT_FLIGHT_EFFECTS, FLIGHT_SHOWCASES, type FlightEffectsSettings } from '../lib/flightEffects';
import { blendFlightAutoEffects } from '../lib/flightAutoDirector';
import { useFlightAutoDirector } from '../lib/useFlightAutoDirector';
import type { FlightCastStyle } from '../lib/flightAutoCastSettings';
import type { PrismChannelMap } from '../lib/prismChannels';
import { buildPrismScore, prismInstanceBudget, prismVisibleRange, samplePrismPose, type PrismFinish, type PrismShape } from '../lib/prismTrail';

const showcaseEffects = new Map(FLIGHT_SHOWCASES.map(scene => [scene.id, scene.effects]));

export default function PrismStage({ midi, getMusicTime, noteSpread, colorMode = 'full', sliceWidth = 0.14,
  perChannel = false, shape: manualShape = 'spectrum', finish = 'spectrum', pathSpread = 1, trailLength = 0,
  materialProfile = 'auto', meshId = 'Star', showWireframe = false, channelMap, onStatus, effects: manualEffects = DEFAULT_FLIGHT_EFFECTS,
  cameraFollow = false, cameraStyle: manualCameraStyle = 'balanced', cameraEnergy = 1, manualUntilRef, autoDirector = false,
  autoCast = false, castStyle = 'ripple' }: {
  midi: ParsedMidi | null; getMusicTime?: () => { time: number; duration: number }; noteSpread: number;
  colorMode?: PrismColorMode; sliceWidth?: number; perChannel?: boolean; shape?: PrismShape; finish?: PrismFinish;
  pathSpread?: number; trailLength?: number; materialProfile?: WebGPUMaterialProfile; meshId?: string; showWireframe?: boolean; channelMap?: PrismChannelMap; onStatus?: (status: string) => void; effects?: FlightEffectsSettings;
  cameraFollow?: boolean; manualUntilRef?: RefObject<number>;
  cameraStyle?: FlightCameraStyle; cameraEnergy?: number;
  autoDirector?: boolean;
  autoCast?: boolean; castStyle?: FlightCastStyle;
}) {
  const auto = useFlightAutoDirector(midi, getMusicTime, autoDirector);
  const shape = auto && autoCast ? 'mixed' : manualShape;
  const effects = useMemo(() => auto
    ? blendFlightAutoEffects(showcaseEffects.get(auto.previous.scene)!, showcaseEffects.get(auto.section.scene)!, auto.blend)
    : manualEffects, [auto, manualEffects]);
  const cameraStyle = auto?.section.camera ?? manualCameraStyle;
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
  const stageRef = useRef<THREE.Group>(null);
  const framingRef = useRef<THREE.Group>(null);
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
    updatePrismEffectsUniforms(uniforms, effects);
    uniforms.uPrismTime.value = time;
    uniforms.uPrismLength.value = length;
    uniforms.uPrismFan.value = shape === 'spectrum' ? 1 : 0;
    uniforms.uPrismSlice.value = colorMode === 'full' ? 0 : 1;
    uniforms.uPrismSliceWidth.value = sliceWidth;
    const clock = clockStore.getState();
    uniforms.uPrismFx.value = clock.noteFxMode === 'off' ? 0 : Math.min(3, clock.noteFxAmount) / 2;
  }, -0.5);
  if (!data) return null;
  return <group ref={framingRef}><group ref={stageRef} rotation={[0.3, 0, 0]} scale={1.15 * data.fit}>
    <group ref={trailRef}>
      {(effects.bursts > 0 || effects.shockwaves > 0 || effects.lasers > 0 || effects.tracers > 0) && <FlightFireworks data={data} getMusicTime={getMusicTime} settings={effects} />}
      {(effects.auroras > 0 || effects.constellations > 0 || effects.gyroscopes > 0) && <FlightSculptures data={data} getMusicTime={getMusicTime} settings={effects} />}
      {(effects.lightning > 0 || effects.petals > 0 || effects.bubbles > 0) && <FlightSpectacle data={data} getMusicTime={getMusicTime} settings={effects} />}
      {(effects.ribbons > 0 || effects.crystals > 0 || effects.vortexes > 0) && <FlightPhenomena data={data} getMusicTime={getMusicTime} settings={effects} />}
      {auto && autoCast && midi ? <AutoCastFlight midi={midi} data={data} plan={auto.plan} index={auto.index}
        getMusicTime={getMusicTime} materialProfile={materialProfile} finish={finish} showWireframe={showWireframe}
        trailLength={trailLength} effects={effects} onStatus={onStatus} colorMode={colorMode} sliceWidth={sliceWidth} transitionStyle={castStyle} />
        : shape === 'mixed' ? <MixedFlight data={data} getMusicTime={getMusicTime} channelMap={channelMap ?? {}} materialProfile={materialProfile} finish={finish} showWireframe={showWireframe} trailLength={trailLength} effects={effects} onStatus={onStatus} colorMode={colorMode} sliceWidth={sliceWidth} /> : shape === 'glb' ? <AnimatedGlbFlight data={data} getMusicTime={getMusicTime} channelMap={channelMap ?? {}} materialProfile={materialProfile} finish={finish} showWireframe={showWireframe} trailLength={trailLength} effects={effects} onStatus={onStatus} /> : mesh && <primitive object={mesh.instances} dispose={null} />}
    </group>
  </group><FlightCameraDirector enabled={autoDirector || cameraFollow} style={cameraStyle} energy={cameraEnergy} data={data} trailRef={trailRef} stageRef={stageRef} framingRef={framingRef} getMusicTime={getMusicTime} effects={effects} manualUntilRef={manualUntilRef} /></group>;
}
