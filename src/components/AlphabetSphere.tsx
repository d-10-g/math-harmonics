import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useXR } from '@react-three/xr';
import * as THREE from 'three';
import { clockStore } from '../lib/clock';
import {
  ALPHABET_DESIGN_DISTANCE,
  ALPHABET_FRAMES,
  ALPHABET_LETTERS,
  alphabetStatus,
  getAlphabetCloud,
  setAlphabetIndex,
  type AlphabetSettings
} from '../lib/alphabetSphere';

// The Alphabet Sphere stage (see lib/alphabetSphere.ts for the geometry).
//
// Desktop: the sphere sits at the origin and the camera orbits it at a fixed
// distance, exactly like the standalone page — the A→Z tour flies the camera
// from axis to axis, dragging orbits by hand, and the stereo views render the
// scene twice through off-axis eye cameras. Headset: the camera is the
// viewer's head, so the tour turns the sphere instead, continuously aiming
// the current letter's axis at the head (the viewer may walk, and the
// spatial wrapper may be auto-rotating). The letter badge and bar follow the
// shared alphabetStatus store in both cases.

const DESKTOP_RADIUS = 6; // scene units
const DESKTOP_FOV = 28;
// Metres. At the wrapper's default 1.8 m stand-off this puts the head ~4.3
// radii out, the distance the depth cues are tuned for.
const XR_RADIUS = 0.42;
const TRANSITION_RATE = 0.72; // fraction of the flight per second (eased)
const HOLD_SECONDS = 1.35;
const LETTER_COUNT = ALPHABET_LETTERS.length;

const VERTEX_SHADER = /* glsl */ `
  uniform vec3 uFrameU[${LETTER_COUNT}];
  uniform vec3 uFrameW[${LETTER_COUNT}];
  uniform vec3 uFrameV[${LETTER_COUNT}];
  uniform vec3 uViewDir;
  uniform float uCamDist;
  uniform float uWorldRadius;
  uniform float uPointSize;
  uniform float uPixelRatio;
  uniform float uCollimation;
  uniform float uRelief;
  uniform float uPulse;

  attribute float aSculptZ;
  attribute float aLetter;
  attribute float aEdgeWeight;

  varying float vAlpha;
  varying float vFocus;

  void main() {
    int letter = int(aLetter + 0.5);
    vec3 fu = uFrameU[letter];
    vec3 fw = uFrameW[letter];
    vec3 fv = uFrameV[letter];

    // Perspective pre-compensation from the live camera distance: a point z
    // radii along the axis toward the camera projects like one on the glyph
    // plane when its lateral offset shrinks by (D - z) / D.
    float dist = max(uCamDist, 1.2);
    float cloudFactor = (dist - position.z) / dist;
    vec3 cloud = fu * (position.x * cloudFactor) + fw * (position.y * cloudFactor) + fv * position.z;
    float radial = dot(cloud, cloud);
    if (radial > 0.99) cloud *= 0.995 * inversesqrt(radial);

    float reliefFactor = (dist - aSculptZ) / dist;
    vec3 relief = fu * (position.x * reliefFactor) + fw * (position.y * reliefFactor) + fv * aSculptZ;

    // Alignment lobe around the letter's axis, evaluated against the head /
    // centre camera direction so both eyes see the same resolved letter.
    float alignDot = dot(fv, uViewDir);
    float lobe = smoothstep(0.912, 0.9985, alignDot);
    float sharp = pow(lobe, 2.1);

    vec3 finalPos = mix(cloud, relief, sharp * uRelief);
    vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Depth cue in sphere radii: nearer points shine a little brighter.
    float camDist = -mvPosition.z / max(uWorldRadius, 1e-4);
    float depthCue = clamp((5.2 - camDist) / 2.0, 0.45, 1.25);

    float baseAlpha = mix(0.50, 0.16, uCollimation);
    float targetAlpha = mix(baseAlpha, 1.0, sharp);
    vAlpha = clamp(targetAlpha * aEdgeWeight * depthCue * (1.0 + 0.3 * uPulse * sharp), 0.02, 1.0);
    vFocus = sharp;

    float sizeBoost = (1.0 + 0.45 * sharp * aEdgeWeight) * (1.0 + 0.35 * uPulse * sharp);
    gl_PointSize = uPointSize * uPixelRatio * sizeBoost * (${ALPHABET_DESIGN_DISTANCE.toFixed(1)} / max(camDist, 0.5));
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uTint;
  varying float vAlpha;
  varying float vFocus;

  void main() {
    vec2 cxy = 2.0 * gl_PointCoord - 1.0;
    float r2 = dot(cxy, cxy);
    if (r2 > 1.0) discard;
    float core = exp(-r2 * 2.5);
    vec3 colour = mix(vec3(0.80, 0.87, 1.0), vec3(1.0), vFocus);
    gl_FragColor = vec4(colour * uTint, vAlpha * core);
  }
`;

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Scratch objects for the frame loop.
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const scratch = {
  head: new THREE.Vector3(),
  local: new THREE.Vector3(),
  dir: new THREE.Vector3(),
  right: new THREE.Vector3(),
  up: new THREE.Vector3(),
  scale: new THREE.Vector3(),
  src: new THREE.Matrix4(),
  dst: new THREE.Matrix4(),
  rot: new THREE.Matrix4(),
  aim: new THREE.Quaternion(),
  lookCamera: new THREE.PerspectiveCamera()
};

// Rotation taking the letter frame (u, w, v) onto (right, up, dir): the
// letter's axis points along dir and the glyph stands upright.
function aimQuaternion(index: number, dir: THREE.Vector3, out: THREE.Quaternion) {
  const frame = ALPHABET_FRAMES[index];
  const { right, up, src, dst, rot } = scratch;
  right.crossVectors(WORLD_UP, dir);
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
  right.normalize();
  up.crossVectors(dir, right).normalize();
  dst.makeBasis(right, up, dir);
  src.makeBasis(frame.u, frame.w, frame.v);
  rot.multiplyMatrices(dst, src.transpose());
  return out.setFromRotationMatrix(rot);
}

// Off-axis (asymmetric frustum) eye cameras converging on the sphere centre.
const eyeLeft = new THREE.PerspectiveCamera();
const eyeRight = new THREE.PerspectiveCamera();
const eyeAxis = new THREE.Vector3();

function updateEyeCameras(centre: THREE.Camera, eyeSeparation: number, aspect: number, convergence: number) {
  const cam = centre as THREE.PerspectiveCamera;
  cam.updateMatrixWorld();
  eyeAxis.setFromMatrixColumn(cam.matrixWorld, 0).normalize();
  const near = cam.near;
  const far = cam.far;
  const top = near * Math.tan(THREE.MathUtils.degToRad(cam.fov) * 0.5);
  const halfWidth = top * aspect;
  const shift = eyeSeparation * 0.5 * (near / Math.max(convergence, 1e-3));
  for (const [eye, sign] of [[eyeLeft, -1], [eyeRight, 1]] as const) {
    eye.near = near;
    eye.far = far;
    eye.position.copy(cam.position).addScaledVector(eyeAxis, sign * eyeSeparation * 0.5);
    eye.quaternion.copy(cam.quaternion);
    eye.projectionMatrix.makePerspective(-halfWidth - sign * shift, halfWidth - sign * shift, top, -top, near, far);
    eye.projectionMatrixInverse.copy(eye.projectionMatrix).invert();
    eye.updateMatrixWorld();
  }
}

export default function AlphabetSphere({ settings, onTourInterrupted }: {
  settings: AlphabetSettings;
  onTourInterrupted: () => void;
}) {
  const { camera, gl } = useThree();
  const session = useXR((state) => state.session);
  const presenting = !!session;
  const presentingRef = useRef(presenting);
  presentingRef.current = presenting;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const sphereRef = useRef<THREE.Group>(null);
  const controlsRef = useRef<any>(null);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;

  const cloud = useMemo(() => getAlphabetCloud(), []);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(cloud.position, 3));
    g.setAttribute('aSculptZ', new THREE.BufferAttribute(cloud.sculptZ, 1));
    g.setAttribute('aLetter', new THREE.BufferAttribute(cloud.letter, 1));
    g.setAttribute('aEdgeWeight', new THREE.BufferAttribute(cloud.edgeWeight, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.2);
    return g;
  }, [cloud]);
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uFrameU: { value: ALPHABET_FRAMES.map((f) => f.u) },
      uFrameW: { value: ALPHABET_FRAMES.map((f) => f.w) },
      uFrameV: { value: ALPHABET_FRAMES.map((f) => f.v) },
      uViewDir: { value: new THREE.Vector3(0, 0, 1) },
      uCamDist: { value: ALPHABET_DESIGN_DISTANCE },
      uWorldRadius: { value: DESKTOP_RADIUS },
      uPointSize: { value: settings.pointSize },
      uPixelRatio: { value: 1 },
      uCollimation: { value: settings.collimation },
      uRelief: { value: settings.relief },
      uPulse: { value: 0 },
      uTint: { value: new THREE.Vector3(1, 1, 1) }
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  // The uniforms are seeded once; the frame loop keeps them current.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);
  const ringGeometry = useMemo(() => {
    const points = new THREE.EllipseCurve(0, 0, 1.02, 1.02, 0, Math.PI * 2, false, 0)
      .getPoints(96)
      .map((p) => new THREE.Vector3(p.x, p.y, 0));
    return new THREE.BufferGeometry().setFromPoints(points);
  }, []);
  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
    ringGeometry.dispose();
  }, [geometry, material, ringGeometry]);

  // Flight state: progress < 1 while flying to `index`; hold counts the
  // dwell on an aligned letter during the tour.
  const flight = useRef({
    index: alphabetStatus.getState().index,
    progress: 1,
    hold: 0,
    start: new THREE.Quaternion(),
    end: new THREE.Quaternion()
  });
  const pulseRef = useRef(0);
  // The frame loop must not read the view until the start pose is applied,
  // or its nearest-letter detection overwrites the stored letter.
  const placedRef = useRef(false);

  const orbitDistance = DESKTOP_RADIUS * ALPHABET_DESIGN_DISTANCE;

  // Orientation that looks at the sphere centre from the letter's axis.
  const desktopPose = (index: number, out: THREE.Quaternion) => {
    const look = scratch.lookCamera;
    look.position.copy(ALPHABET_FRAMES[index].v).multiplyScalar(orbitDistance);
    look.up.set(0, 1, 0);
    look.lookAt(0, 0, 0);
    return out.copy(look.quaternion);
  };

  // Direction from the sphere centre to the head, in the sphere's parent
  // space (the spatial wrapper), so a sphere rotation can aim at it.
  const headDirectionInParent = (out: THREE.Vector3) => {
    const sphere = sphereRef.current;
    const parent = sphere?.parent;
    cameraRef.current.getWorldPosition(scratch.head);
    if (parent) parent.worldToLocal(scratch.head);
    out.copy(scratch.head);
    if (sphere) out.sub(sphere.position);
    return out.lengthSq() > 1e-8 ? out.normalize() : out.set(0, 0, 1);
  };

  const flyTo = (index: number) => {
    const f = flight.current;
    f.index = ((index % LETTER_COUNT) + LETTER_COUNT) % LETTER_COUNT;
    f.progress = 0;
    f.hold = 0;
    if (presentingRef.current) {
      const sphere = sphereRef.current;
      if (sphere) f.start.copy(sphere.quaternion);
      aimQuaternion(f.index, headDirectionInParent(scratch.dir), f.end);
    } else {
      f.start.copy(cameraRef.current.quaternion);
      desktopPose(f.index, f.end);
    }
    setAlphabetIndex(f.index);
  };
  const flyToRef = useRef(flyTo);
  flyToRef.current = flyTo;

  // Letter requests from the bar, the keyboard and the VR menu.
  useEffect(() => alphabetStatus.subscribe((state, previous) => {
    if (state.request && state.request !== previous.request) flyToRef.current(state.request.index);
  }), []);

  // Turning the tour back on moves straight to the next letter.
  useEffect(() => {
    if (settings.tour && flight.current.progress >= 1) flyToRef.current(flight.current.index + 1);
  }, [settings.tour]);

  // Desktop framing: the page's own fixed-distance orbit and narrower lens;
  // in a session the sphere turns instead and the head is the camera. A
  // layout effect so the pose lands before the first frame renders.
  useLayoutEffect(() => {
    const f = flight.current;
    f.progress = 1;
    f.hold = 0;
    const sphere = sphereRef.current;
    if (sphere) sphere.quaternion.identity();
    placedRef.current = true;
    if (presenting) {
      flyToRef.current(f.index);
      return;
    }
    const cam = cameraRef.current;
    if (cam instanceof THREE.PerspectiveCamera) {
      cam.fov = DESKTOP_FOV;
      cam.near = 0.1;
      cam.far = 1000;
      cam.updateProjectionMatrix();
    }
    cam.position.copy(ALPHABET_FRAMES[f.index].v).multiplyScalar(orbitDistance);
    cam.up.set(0, 1, 0);
    cam.lookAt(0, 0, 0);
    const previousColor = gl.getClearColor(new THREE.Color());
    const previousAlpha = gl.getClearAlpha();
    gl.setClearColor(0x030407, 1);
    return () => {
      gl.setClearColor(previousColor, previousAlpha);
      if (cam instanceof THREE.PerspectiveCamera) {
        cam.fov = 50;
        cam.updateProjectionMatrix();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenting, gl]);

  useFrame((state, delta) => {
    const sphere = sphereRef.current;
    if (!sphere) return;
    const current = settingsRef.current;
    const f = flight.current;
    const dt = Math.min(delta, 0.1);
    const cam = state.camera;

    // 1. Flight / tour.
    if (f.progress < 1) {
      f.progress = Math.min(1, f.progress + dt * TRANSITION_RATE);
      const eased = easeInOutCubic(f.progress);
      if (presenting) {
        aimQuaternion(f.index, headDirectionInParent(scratch.dir), f.end);
        sphere.quaternion.slerpQuaternions(f.start, f.end, eased);
      } else {
        cam.quaternion.slerpQuaternions(f.start, f.end, eased);
        cam.position.set(0, 0, 1).applyQuaternion(cam.quaternion).multiplyScalar(orbitDistance);
      }
    } else if (current.tour) {
      if (presenting) {
        // Keep the letter aimed at a moving head during the dwell.
        aimQuaternion(f.index, headDirectionInParent(scratch.dir), scratch.aim);
        sphere.quaternion.slerp(scratch.aim, Math.min(1, dt * 6));
      }
      f.hold += dt;
      if (f.hold >= HOLD_SECONDS) flyTo(f.index + 1);
    }

    // 2. Viewer direction and distance in sphere radii.
    cam.getWorldPosition(scratch.head);
    sphere.worldToLocal(scratch.local.copy(scratch.head));
    const camDist = scratch.local.length();
    scratch.dir.copy(scratch.local).divideScalar(camDist || 1);
    const u = material.uniforms;
    u.uViewDir.value.copy(scratch.dir);
    u.uCamDist.value = camDist;
    sphere.getWorldScale(scratch.scale);
    u.uWorldRadius.value = scratch.scale.x;
    u.uPixelRatio.value = presenting ? 1.6 : gl.getPixelRatio();
    u.uPointSize.value = current.pointSize;
    u.uCollimation.value = current.collimation;
    u.uRelief.value = current.relief;

    // 3. While steering by hand, the badge follows the nearest axis.
    if (placedRef.current && f.progress >= 1 && !current.tour) {
      let best = -1;
      let bestIndex = f.index;
      for (let k = 0; k < LETTER_COUNT; k++) {
        const d = scratch.dir.dot(ALPHABET_FRAMES[k].v);
        if (d > best) {
          best = d;
          bestIndex = k;
        }
      }
      if (bestIndex !== f.index) {
        f.index = bestIndex;
        setAlphabetIndex(bestIndex);
      }
    }

    if (import.meta.env.DEV) {
      (globalThis as any).__alphabetDebug = {
        cam: cam.position.toArray().map((v) => Math.round(v * 100) / 100),
        parent: cam.parent?.type ?? null,
        dist: Math.round(camDist * 100) / 100,
        dir: scratch.dir.toArray().map((v) => Math.round(v * 100) / 100),
        index: f.index,
        progress: f.progress
      };
    }

    // 4. A gentle music pulse on the aligned letter while audio sync runs.
    const clock = clockStore.getState();
    const target = clock.audioSync ? Math.min(1, clock.midiLive ? clock.notePulse : clock.bass) : 0;
    pulseRef.current += (target - pulseRef.current) * Math.min(1, dt * 10);
    u.uPulse.value = pulseRef.current;
  });

  // Desktop stereo views take over rendering: two off-axis eye cameras drawn
  // side by side, as red/cyan layers, or as a rocking single view. Headsets
  // render their own stereo, so the takeover only exists outside a session.
  const takeover = !presenting && settings.stereo !== 'mono';
  useFrame((state, _delta, frame) => {
    if (!takeover) return;
    const { gl: renderer, scene, camera: cam, size, clock } = state;
    void frame;
    const current = settingsRef.current;
    const W = size.width;
    const H = size.height;
    const previousAutoClear = renderer.autoClear;
    const tint = material.uniforms.uTint.value as THREE.Vector3;
    const separation = current.baseline * DESKTOP_RADIUS;
    renderer.autoClear = false;
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, W, H);
    renderer.clear();
    tint.set(1, 1, 1);

    if (current.stereo === 'crosseye' || current.stereo === 'parallel') {
      const halfW = Math.floor(W / 2);
      updateEyeCameras(cam, separation, halfW / H, orbitDistance);
      const [leftHalf, rightHalf] = current.stereo === 'crosseye' ? [eyeRight, eyeLeft] : [eyeLeft, eyeRight];
      renderer.setScissorTest(true);
      renderer.setViewport(0, 0, halfW, H);
      renderer.setScissor(0, 0, halfW, H);
      renderer.render(scene, leftHalf);
      renderer.setViewport(halfW, 0, W - halfW, H);
      renderer.setScissor(halfW, 0, W - halfW, H);
      renderer.render(scene, rightHalf);
      renderer.setScissorTest(false);
    } else if (current.stereo === 'anaglyph') {
      updateEyeCameras(cam, separation, W / H, orbitDistance);
      tint.set(1, 0, 0);
      renderer.render(scene, eyeLeft);
      renderer.clearDepth();
      tint.set(0, 1, 1);
      renderer.render(scene, eyeRight);
    } else {
      const osc = Math.sin(clock.elapsedTime * 3.2 * Math.PI * 2);
      updateEyeCameras(cam, separation * osc, W / H, orbitDistance);
      renderer.render(scene, eyeRight);
    }

    tint.set(1, 1, 1);
    renderer.setViewport(0, 0, W, H);
    renderer.autoClear = previousAutoClear;
  }, takeover ? 1 : 0);

  const ringMaterialProps = { color: '#5577aa', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false } as const;

  return (
    <>
      {!presenting && (
        <OrbitControls
          ref={controlsRef}
          enablePan={false}
          enableZoom={false}
          minDistance={orbitDistance}
          maxDistance={orbitDistance}
          enableDamping
          dampingFactor={0.06}
          onStart={() => {
            // A hand on the sphere ends the tour and any flight in progress.
            flight.current.progress = 1;
            if (settingsRef.current.tour) onTourInterrupted();
          }}
        />
      )}
      <group scale={presenting ? XR_RADIUS : DESKTOP_RADIUS}>
        <group ref={sphereRef}>
          <points geometry={geometry} material={material} frustumCulled={false} />
          <group visible={settings.rings}>
            <lineLoop geometry={ringGeometry}>
              <lineBasicMaterial {...ringMaterialProps} />
            </lineLoop>
            <lineLoop geometry={ringGeometry} rotation={[Math.PI / 2, 0, 0]}>
              <lineBasicMaterial {...ringMaterialProps} />
            </lineLoop>
            <lineLoop geometry={ringGeometry} rotation={[0, Math.PI / 2, 0]}>
              <lineBasicMaterial {...ringMaterialProps} />
            </lineLoop>
          </group>
        </group>
      </group>
    </>
  );
}
