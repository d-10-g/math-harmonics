import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useXR } from '@react-three/xr';
import * as THREE from 'three';
import type { FlightEffectsSettings } from '../lib/flightEffects';
import type { PrismScoreData } from '../lib/prismTrail';
import { normalizeFlightCameraEnergy, normalizeFlightCameraStyle, type FlightCameraStyle } from '../lib/flightCameraStyles';
import { beginFlightCameraGesture, createFlightCameraGate, createFlightFocus, createFlightFocusIndex, createFlightFitWorkspace,
  createFlightCameraShot, createFlightDirectionWorkspace, dampFlightDirection, dampFlightVector,
  endFlightCameraGesture, flightCameraMayMove, flightCameraTimeline, projectedFlightFitDistance,
  sampleFlightCameraShot, sampleFlightFocus, FLIGHT_CAMERA_SETTLE_SECONDS } from '../lib/flightCamera';

type Orbit = { target: THREE.Vector3; update(): void; enableDamping: boolean;
  addEventListener(name: string, fn: () => void): void; removeEventListener(name: string, fn: () => void): void };

/** The director runs after OrbitControls (-1) and the guide pose (-.5).
 * It writes the desktop camera only when idle. XR reframes a child stage;
 * headset cameras and the user's outer grab/scale transform stay untouched. */
export default function FlightCameraDirector({ enabled, data, trailRef, stageRef, framingRef, getMusicTime, effects, manualUntilRef,
  style = 'balanced', energy = 1 }: {
  enabled: boolean; data: PrismScoreData; trailRef: RefObject<THREE.Group | null>;
  stageRef: RefObject<THREE.Group | null>; framingRef: RefObject<THREE.Group | null>;
  getMusicTime?: () => { time: number; duration: number }; effects: FlightEffectsSettings;
  manualUntilRef?: RefObject<number>;
  style?: FlightCameraStyle; energy?: number;
}) {
  const { camera, gl, controls: rawControls } = useThree();
  const controls = rawControls as unknown as Orbit | undefined;
  const session = useXR(state => state.session);
  const index = useMemo(() => createFlightFocusIndex(data), [data]);
  const state = useMemo(() => ({ focus: createFlightFocus(), gate: createFlightCameraGate(),
    local: new THREE.Vector3(), world: new THREE.Vector3(), previous: new THREE.Vector3(),
    lookahead: new THREE.Vector3(), target: new THREE.Vector3(), destination: new THREE.Vector3(),
    direction: new THREE.Vector3(0, 0, 1), savedPosition: new THREE.Vector3(), savedTarget: new THREE.Vector3(),
    shot: createFlightCameraShot(), shotDirection: new THREE.Vector3(0, 0, 1), heading: new THREE.Vector3(0, 0, 1),
    desiredDirection: new THREE.Vector3(), directionWork: createFlightDirectionWorkspace(), orbitOffset: new THREE.Quaternion(),
    xrRotation: new THREE.Quaternion(), rotationMatrix: new THREE.Matrix4(), origin: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0),
    xrPosition: new THREE.Vector3(), saved: false, lastTime: NaN, settling: 0, zoom: 1, lastDistance: 25,
    pointToWorld: new THREE.Matrix4(), fitWork: createFlightFitWorkspace(),
    savedCamera: null as THREE.Camera | null,
    previousEnabled: false, previousXR: Boolean(session), manual: false }), []);
  const live = useRef({ enabled, controls, xr: Boolean(session) }); live.current = { enabled, controls, xr: Boolean(session) };
  useEffect(() => {
    state.lastTime = NaN; state.settling = FLIGHT_CAMERA_SETTLE_SECONDS;
  }, [data, style, energy, state]);
  useEffect(() => {
    const start = () => {
      if (!live.current.enabled && !state.saved) return;
      beginFlightCameraGesture(state.gate, performance.now() / 1000); state.manual = true;
    };
    const end = () => { if (live.current.enabled || state.saved) endFlightCameraGesture(state.gate, performance.now() / 1000); };
    const reset = () => { if (live.current.enabled) { start(); end(); } };
    controls?.addEventListener('start', start); controls?.addEventListener('end', end);
    // Double click remains an explicit user framing gesture. Pointer capture
    // also handles XR grabs: do not animate the sculpture under a held hand.
    gl.domElement.addEventListener('dblclick', reset);
    gl.domElement.addEventListener('pointerdown', start);
    gl.domElement.addEventListener('pointerup', end);
    gl.domElement.addEventListener('pointercancel', end);
    return () => {
      controls?.removeEventListener('start', start); controls?.removeEventListener('end', end);
      gl.domElement.removeEventListener('dblclick', reset);
      gl.domElement.removeEventListener('pointerdown', start);
      gl.domElement.removeEventListener('pointerup', end);
      gl.domElement.removeEventListener('pointercancel', end);
    };
  }, [controls, gl, state]);
  useEffect(() => () => {
    // Source changes unmount the director before the regular formula view.
    // Never leave the ordinary view looking at an off-center flight target.
    if (state.saved && !live.current.xr && state.savedCamera) {
      state.savedCamera.position.copy(state.savedPosition); live.current.controls?.target.copy(state.savedTarget);
      state.savedCamera.lookAt(state.savedTarget);
    }
  }, [state]);

  useFrame((_, rawDelta) => {
    const framing = framingRef.current, trail = trailRef.current, stage = stageRef.current;
    if (!framing || !trail || !stage) return;
    const xr = Boolean(session), delta = Math.min(0.05, Math.max(0, rawDelta));
    const wall = performance.now() / 1000;
    const rawTime = getMusicTime?.().time ?? 0;
    const time = Number.isFinite(rawTime) ? Math.max(0, rawTime) : 0;
    if (xr !== state.previousXR) {
      if (!xr) {
        if (state.saved && state.savedCamera) {
          state.savedCamera.position.copy(state.savedPosition); controls?.target.copy(state.savedTarget);
          state.savedCamera.lookAt(state.savedTarget); state.saved = false;
        }
        // XR framing belongs only to the virtual sculpture. Re-enter the
        // ordinary desktop coordinate frame and capture its idle orbit anew.
        framing.position.set(0, 0, 0); framing.scale.setScalar(1); framing.quaternion.identity();
        state.previousEnabled = false;
      }
      state.gate.dragging = false; state.gate.until = -Infinity;
      state.lastTime = NaN; state.settling = FLIGHT_CAMERA_SETTLE_SECONDS; state.previousXR = xr;
    }
    if (enabled && !state.previousEnabled) {
      state.lastTime = NaN; state.settling = FLIGHT_CAMERA_SETTLE_SECONDS; state.manual = false;
      state.gate.dragging = false; state.gate.until = -Infinity;
      if (!xr) {
        state.savedCamera = camera;
        state.savedPosition.copy(camera.position); state.savedTarget.copy(controls?.target ?? new THREE.Vector3());
        state.target.copy(state.savedTarget); state.direction.copy(camera.position).sub(state.target).normalize();
        state.shotDirection.copy(state.direction);
        state.orbitOffset.setFromUnitVectors(state.desiredDirection.set(0, 0, 1), state.direction);
        state.zoom = THREE.MathUtils.clamp(camera.position.distanceTo(state.target) / 25, 0.55, 1.8);
        state.saved = true;
      }
    }
    state.previousEnabled = enabled;
    if (!enabled) {
      state.lastTime = NaN;
      if (xr && (manualUntilRef?.current ?? 0) > wall) return;
      framing.position.lerp(state.xrPosition.set(0, 0, 0), 1 - Math.exp(-delta * 4));
      const scale = THREE.MathUtils.damp(framing.scale.x, 1, 4, delta); framing.scale.setScalar(scale);
      state.xrRotation.identity();
      const returnAngle = framing.quaternion.angleTo(state.xrRotation);
      if (returnAngle > 1e-8) framing.quaternion.slerp(state.xrRotation,
        Math.min(1 - Math.exp(-delta * 3), delta * 0.35 / returnAngle));
      if (framing.position.lengthSq() < 1e-8 && Math.abs(scale - 1) < 1e-5 && framing.quaternion.angleTo(state.xrRotation) < 1e-5) {
        framing.position.set(0, 0, 0); framing.scale.setScalar(1); framing.quaternion.identity();
      }
      if (!xr && state.saved) {
        if (!flightCameraMayMove(state.gate, wall)) { state.saved = false; return; }
        dampFlightVector(camera.position, state.savedPosition, delta, 5, 35);
        dampFlightVector(state.target, state.savedTarget, delta, 5, 35);
        controls?.target.copy(state.target); camera.lookAt(state.target);
        if (camera.position.distanceToSquared(state.savedPosition) < 0.0001 && state.target.distanceToSquared(state.savedTarget) < 0.0001) {
          camera.position.copy(state.savedPosition); controls?.target.copy(state.savedTarget); camera.lookAt(state.savedTarget); state.saved = false;
        }
      }
      return;
    }
    sampleFlightFocus(data, index, time, effects, state.focus);
    // Transform into the fixed stage frame before the XR centering transform.
    trail.updateMatrix(); stage.updateMatrix();
    state.local.copy(state.focus.center).applyMatrix4(trail.matrix).applyMatrix4(stage.matrix);
    const radius = state.focus.radius * stage.scale.x;
    state.heading.set(0, 0, 1).transformDirection(stage.matrix);
    sampleFlightCameraShot(normalizeFlightCameraStyle(style), time, state.focus.energy,
      normalizeFlightCameraEnergy(energy), state.heading, state.shot);
    if (!flightCameraMayMove(state.gate, wall) || (xr && (manualUntilRef?.current ?? 0) > wall)) {
      if (!xr) {
        state.target.copy(controls?.target ?? state.target);
        state.direction.copy(camera.position).sub(state.target).normalize();
      }
      state.previous.copy(state.local); state.lastTime = time; return;
    }
    if (state.manual && !xr) {
      state.target.copy(controls?.target ?? state.target);
      state.direction.copy(camera.position).sub(state.target).normalize();
      state.orbitOffset.setFromUnitVectors(state.shot.direction, state.direction);
      state.shotDirection.copy(state.direction);
      state.zoom *= camera.position.distanceTo(state.target) / Math.max(1, state.lastDistance);
      state.zoom = THREE.MathUtils.clamp(state.zoom, 0.55, 1.8); state.manual = false;
      state.settling = 0.8;
    }
    const timeline = flightCameraTimeline(state.lastTime, state.settling, time, delta);
    const { moved, jump } = timeline;
    if (!timeline.active) return;
    state.settling = timeline.settling;
    if (!state.focus.notes) { state.lastTime = time; return; }
    if (xr) {
      // Reframe the virtual sculpture; there is no forced head translation,
      // roll or look direction. The outer SpatialWrapper still owns placement.
      const fit = THREE.MathUtils.clamp(10 / Math.max(10, radius) / state.shot.distance, 0.35, 1);
      const scale = THREE.MathUtils.damp(framing.scale.x, fit, 1.2, delta);
      framing.scale.setScalar(scale);
      state.rotationMatrix.lookAt(state.shot.direction, state.origin, state.up);
      state.xrRotation.setFromRotationMatrix(state.rotationMatrix).invert();
      const angle = framing.quaternion.angleTo(state.xrRotation);
      if (angle > 1e-8) framing.quaternion.slerp(state.xrRotation, Math.min(1 - Math.exp(-delta * 1.2), delta * 0.25 / angle));
      state.xrPosition.copy(state.local).applyQuaternion(framing.quaternion).multiplyScalar(-scale);
      dampFlightVector(framing.position, state.xrPosition, delta, 1.2, 5);
      if (!moved && framing.position.distanceToSquared(state.xrPosition) < 0.0001
        && angle < 0.002 && Math.abs(scale - fit) < 0.001) state.settling = 0;
    } else if (camera instanceof THREE.PerspectiveCamera) {
      // A bounded prediction in the present score frame anticipates phrase
      // travel, without looking ahead to notes that have not sounded.
      state.lookahead.set(0, 0, 0);
      if (!jump && moved && Number.isFinite(state.lastTime)) {
        const dt = Math.max(0.01, time - state.lastTime);
        state.lookahead.copy(state.local).sub(state.previous).multiplyScalar(0.45 / dt).clampLength(0, 2);
      }
      state.world.copy(state.local).add(state.lookahead);
      state.world.addScaledVector(state.heading, state.shot.lead * stage.scale.x);
      framing.updateWorldMatrix(true, false); state.world.applyMatrix4(framing.matrixWorld);
      state.pointToWorld.multiplyMatrices(framing.matrixWorld, stage.matrix).multiply(trail.matrix);
      state.desiredDirection.copy(state.shot.direction).applyQuaternion(state.orbitOffset).normalize();
      dampFlightDirection(state.shotDirection, state.desiredDirection, delta, state.directionWork);
      const distance = THREE.MathUtils.clamp(projectedFlightFitDistance(index.samples, state.focus.notes,
        state.pointToWorld, state.world, state.shotDirection, camera.fov, camera.aspect,
        3.4 * stage.scale.x, state.fitWork) * state.zoom * state.shot.distance, 10, 66);
      dampFlightVector(state.target, state.world, delta, 1.5, 9);
      state.destination.copy(state.shotDirection).multiplyScalar(distance).add(state.target);
      dampFlightVector(camera.position, state.destination, delta, 1.1, 11);
      controls?.target.copy(state.target); camera.lookAt(state.target); state.lastDistance = camera.position.distanceTo(state.target);
      if (!moved && camera.position.distanceToSquared(state.destination) < 0.0001
        && state.target.distanceToSquared(state.world) < 0.0001
        && state.shotDirection.angleTo(state.desiredDirection) < 0.002) state.settling = 0;
    }
    state.previous.copy(state.local); state.lastTime = time;
  });
  return null;
}
