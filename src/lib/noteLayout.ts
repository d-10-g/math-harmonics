export const NOTE_LAYOUTS = [
  "linear",
  "circle",
  "spiral",
  "wave",
  "helix",
] as const;
export type NoteLayoutGeometry = (typeof NOTE_LAYOUTS)[number];
export interface NoteLayoutSettings {
  geometry: NoteLayoutGeometry;
  copies: number;
  offset: number;
  rotation: number;
}
export const DEFAULT_NOTE_LAYOUT: NoteLayoutSettings = {
  geometry: "linear",
  copies: 1,
  offset: 1,
  rotation: 0,
};
export function normalizeNoteLayout(
  value?: Partial<NoteLayoutSettings> | null,
): NoteLayoutSettings {
  return {
    rotation: Number.isFinite(value?.rotation) ? Math.max(-180, Math.min(180, value!.rotation!)) : 0,
    geometry: NOTE_LAYOUTS.includes(value?.geometry as NoteLayoutGeometry)
      ? value!.geometry!
      : "linear",
    copies: Number.isFinite(value?.copies)
      ? Math.max(1, Math.min(8, Math.round(value!.copies!)))
      : 1,
    offset: Number.isFinite(value?.offset)
      ? Math.max(0, Math.min(4, value!.offset!))
      : 1,
  };
}
/** Position along one channel. Rank is score-wide, never the live-note count,
 * so releasing a note cannot rearrange the remaining objects. */
export function channelPath(
  index: number,
  count: number,
  gap: number,
  geometry: NoteLayoutGeometry,
): [number, number, number] {
  if (count <= 1) return [0, 0, 0];
  const u = index / (count - 1),
    x = (index - (count - 1) / 2) * gap;
  const angle = (2 * Math.PI * index) / count;
  const radius = (gap * count) / (2 * Math.PI);
  switch (geometry) {
    case "circle":
      return [Math.cos(angle) * radius, 0, Math.sin(angle) * radius];
    case "spiral": {
      // Square-root progress avoids packing most notes into the center.
      const progress = Math.sqrt(u);
      const theta = progress * Math.PI * 4;
      const r = gap * (0.5 + count * 0.15 * progress);
      return [Math.cos(theta) * r, 0, Math.sin(theta) * r];
    }
    case "wave":
      return [x, 0, Math.sin(u * Math.PI * 4) * gap * 2];
    case "helix":
      return [
        Math.cos(u * Math.PI * 4) * radius,
        (u - 0.5) * gap * count * 0.5,
        Math.sin(u * Math.PI * 4) * radius,
      ];
    default:
      return [x, 0, 0];
  }
}
export function copyOffset(
  copy: number,
  count: number,
  offset: number,
  unit = 1,
) {
  return (copy - (count - 1) / 2) * offset * unit;
}

/** Per-copy yaw increment; copy zero always retains the original orientation. */
export function copyRotation(copy: number, degrees: number) {
  return copy * degrees * Math.PI / 180;
}
export function rotateCopyPosition(position: [number, number, number], angle: number): [number, number, number] {
  const [x,y,z] = position, c = Math.cos(angle), s = Math.sin(angle);
  return [x*c + z*s, y, z*c - x*s];
}
