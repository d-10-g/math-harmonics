import { useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { copyRotation, copyOffset, type NoteLayoutSettings } from "../lib/noteLayout";

/** Formula copies share the evaluated geometry/materials. Only transforms and
 * visibility are mirrored; geometry rebuilding and MIDI processing run once. */
export function syncVisualCopy(source: THREE.Object3D, target: THREE.Object3D) {
  target.position.copy(source.position);
  target.quaternion.copy(source.quaternion);
  target.scale.copy(source.scale);
  target.visible = source.visible;
  target.renderOrder = source.renderOrder;
  target.frustumCulled = source.frustumCulled;
  if (source instanceof THREE.Mesh && target instanceof THREE.Mesh) {
    target.geometry = source.geometry;
    target.material = source.material;
  }
  if (
    source.children.length !== target.children.length ||
    source.children.some(
      (child, index) => child.type !== target.children[index]?.type,
    )
  ) {
    target.clear();
    source.children.forEach((child) => target.add(child.clone(true)));
  }
  source.children.forEach((child, index) =>
    syncVisualCopy(child, target.children[index]),
  );
}
export default function VisualCopies({
  settings,
  children,
}: {
  settings: NoteLayoutSettings;
  children: ReactNode;
}) {
  const source = useRef<THREE.Group>(null);
  const holders = useRef<Array<THREE.Group | null>>([]);
  useFrame(() => {
    if (!source.current) return;
    holders.current.forEach((holder, index) => {
      if (!holder) return;
      let mirror = holder.children[0];
      if (!mirror) {
        mirror = source.current!.clone(true);
        holder.add(mirror);
      }
      syncVisualCopy(source.current!, mirror);
      mirror.rotateY(copyRotation(index + 1, settings.rotation));
      mirror.position.y += (index + 1) * settings.offset * 2.4;
    });
  });
  return (
    <group
      scale={1 / (1 + ((settings.copies - 1) * settings.offset * 2.4) / 20)}
    >
      <group
        ref={source}
        position-y={copyOffset(0, settings.copies, settings.offset, 2.4)}
      >
        {children}
      </group>
      {Array.from({ length: settings.copies - 1 }, (_, index) => (
        <group
          key={index}
          ref={(node) => {
            holders.current[index] = node;
          }}
          dispose={null}
        />
      ))}
    </group>
  );
}
