import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useXR } from '@react-three/xr';
import * as THREE from 'three';
import { renderCubeFace } from '../lib/mirrorCapture';

// A live mirror environment: an inverted sphere whose inner surface reflects
// a cube-camera capture of the scene. Planar reflector panels need the render
// camera and fall apart under WebXR's array camera; a cube capture behaves
// identically on desktop and in immersive sessions.
//
// One cube face is captured per frame (a full refresh every six frames), so
// the cost stays flat instead of spiking. The dome hides itself during
// capture so it never feeds back into its own reflection.

const DESKTOP_SIZE = 384;
const XR_SIZE = 256;

export default function MirrorDome({
  radius,
  xrRadius = radius,
  center = [0, 0, 0],
  anchorRef,
  tint = '#d9dfea',
  captureOffset = 0,
  xrCaptureOffset = captureOffset
}: {
  radius: number;
  xrRadius?: number;
  center?: [number, number, number];
  // Optional object whose WORLD position the dome follows each frame. Mount
  // the dome at the scene root when using this.
  anchorRef?: React.RefObject<THREE.Object3D | null>;
  tint?: string;
  // How far BEHIND the visual (away from the viewer) the capture point sits.
  // Env-map lookups are direction-only, so a capture from inside the visual
  // can never show it on the wall you face. A real mirror shows the far side
  // of what stands in front of it: capturing from behind puts the mirrored
  // back of the scene on the facing wall, and the point follows the viewer
  // around the visual.
  captureOffset?: number;
  xrCaptureOffset?: number;
}) {
  const { gl, scene } = useThree();
  const session = useXR((state) => state.session);
  const blend = session?.environmentBlendMode;
  const passthrough = blend === 'alpha-blend' || blend === 'additive';
  const size = session ? XR_SIZE : DESKTOP_SIZE;
  const offset = session ? xrCaptureOffset : captureOffset;

  const target = useMemo(
    () =>
      new THREE.WebGLCubeRenderTarget(size, {
        type: THREE.HalfFloatType,
        generateMipmaps: false,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter
      }),
    [size]
  );
  const cubeCamera = useMemo(() => new THREE.CubeCamera(0.05, 600, target), [target]);
  useEffect(() => () => target.dispose(), [target]);
  const scratch = useMemo(() => ({ eye: new THREE.Vector3(), dir: new THREE.Vector3() }), []);

  const meshRef = useRef<THREE.Mesh>(null);
  const faceRef = useRef(0);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh || passthrough) return;
    if (anchorRef?.current) anchorRef.current.getWorldPosition(mesh.position);
    mesh.getWorldPosition(cubeCamera.position);
    if (offset > 0) {
      state.camera.getWorldPosition(scratch.eye);
      scratch.dir.copy(cubeCamera.position).sub(scratch.eye);
      if (scratch.dir.lengthSq() > 1e-6) cubeCamera.position.addScaledVector(scratch.dir.normalize(), offset);
    }
    mesh.visible = false;
    renderCubeFace(gl, scene, cubeCamera, faceRef.current);
    mesh.visible = true;
    faceRef.current = (faceRef.current + 1) % 6;
  });

  // Passthrough sessions keep the real room; an opaque mirror ball would
  // swallow it.
  if (passthrough) return null;

  return (
    // Drawn after the backdrop sphere (which never writes depth) so the
    // mirror wins the wall; stars still float in front of it.
    <mesh ref={meshRef} position={center} renderOrder={10}>
      <sphereGeometry args={[session ? xrRadius : radius, 96, 48]} />
      <meshBasicMaterial
        color={tint}
        envMap={target.texture}
        combine={THREE.MultiplyOperation}
        reflectivity={1}
        side={THREE.BackSide}
      />
    </mesh>
  );
}
