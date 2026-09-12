import assert from "node:assert/strict";
import * as THREE from "three";
import {
  channelPath,
  DEFAULT_NOTE_LAYOUT,
  NOTE_LAYOUTS,
  normalizeNoteLayout,
  copyOffset,
} from "../src/lib/noteLayout";
import { ernieCells, ernieLayout } from "../src/lib/ernie";
import { syncVisualCopy } from "../src/components/VisualCopies";
const near = (a: number, b: number) =>
  assert(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const cells = ernieCells(
  [0, 3].flatMap((channel) =>
    Array.from({ length: 9 }, (_, i) => ({
      channel,
      pitch: 48 + i,
      track: 0,
      time: 0,
      duration: 1,
      velocity: 96,
    })),
  ),
);
const legacy = ernieLayout(cells);
assert.deepEqual(legacy.items[0].position, [-4 * 0.28, 0, 0.31]);
assert.deepEqual(legacy.items[9].position, [-4 * 0.28, 0.14, -0.31]);
assert.equal(legacy.items.length, 18);
for (const geometry of NOTE_LAYOUTS) {
  assert.deepEqual(channelPath(0, 1, 1, geometry), [0, 0, 0]);
  assert.equal(
    ernieLayout([], 1, { ...DEFAULT_NOTE_LAYOUT, geometry }).items.length,
    0,
  );
  const positions = Array.from({ length: 9 }, (_, i) =>
    channelPath(i, 9, 0.28, geometry),
  );
  assert.equal(
    new Set(positions.map((p) => p.join(","))).size,
    9,
    `${geometry} does not repeat an endpoint`,
  );
  for (let i = 0; i < 9; i++) {
    const doubled = channelPath(i, 9, 0.56, geometry);
    positions[i].forEach((v, axis) => near(doubled[axis], 2 * v));
  }
  const layout = ernieLayout(cells, 1, { geometry, copies: 3, offset: 1.5 });
  assert.equal(layout.items.length, cells.length * 3);
  assert.equal(
    new Set(layout.items.map((item) => `${item.cell.key}:${item.copy}`)).size,
    layout.items.length,
  );
  for (const cell of cells) {
    const copies = layout.items.filter((item) => item.cell === cell);
    assert.equal(
      copies.length,
      3,
      "Copies retain the original MIDI cell and timing",
    );
    near(copies[1].position[1] - copies[0].position[1], 1.5 * 0.75);
    near(copies[2].position[1] - copies[1].position[1], 1.5 * 0.75);
  }
  for (const {
    position: [x, y, z],
  } of layout.items) {
    assert([x, y, z].every(Number.isFinite));
    assert(
      Math.abs(x) <= layout.width / 2 &&
        y >= 0 &&
        y <= layout.height + 1e-8 &&
        Math.abs(z) <= layout.depth / 2,
      "Camera bounds enclose every duplicate",
    );
  }
  const overlap = ernieLayout(cells, 1, { geometry, copies: 2, offset: 0 });
  assert.deepEqual(overlap.items[0].position, overlap.items[1].position);
}
const ring = Array.from({ length: 9 }, (_, i) =>
  channelPath(i, 9, 1, "circle"),
);
ring.forEach((p) => near(Math.hypot(p[0], p[2]), 9 / (2 * Math.PI)));
assert.deepEqual(normalizeNoteLayout(), DEFAULT_NOTE_LAYOUT);
assert.deepEqual(
  normalizeNoteLayout({ geometry: "bad" as any, copies: 99, offset: -2 }),
  { geometry: "linear", copies: 8, offset: 0 },
);
assert.deepEqual(
  normalizeNoteLayout({ copies: NaN, offset: Infinity }),
  DEFAULT_NOTE_LAYOUT,
);
near(copyOffset(2, 3, 1) - copyOffset(1, 3, 1), 1);
// Repeated formulas share GPU resources and receive geometry swaps, visibility,
// transforms and changing idle-lattice topology without extra evaluations.
const source = new THREE.Group(),
  geometry = new THREE.BoxGeometry(),
  material = new THREE.MeshBasicMaterial();
const mesh: THREE.Mesh = new THREE.Mesh(geometry, material);
source.add(mesh);
const mirror = source.clone(true);
mesh.position.set(2, 3, 4);
mesh.visible = false;
const replacement = new THREE.SphereGeometry();
mesh.geometry = replacement;
syncVisualCopy(source, mirror);
const mirrored = mirror.children[0] as THREE.Mesh;
assert.equal(mirrored.geometry, replacement);
assert.equal(mirrored.material, material);
assert.deepEqual(mirrored.position.toArray(), [2, 3, 4]);
assert.equal(mirrored.visible, false);
source.add(new THREE.Group());
syncVisualCopy(source, mirror);
assert.equal(mirror.children.length, 2);
source.remove(mesh);
syncVisualCopy(source, mirror);
assert.equal(mirror.children.length, 1);
geometry.dispose();
replacement.dispose();
material.dispose();
console.log(
  "PASS: all layouts, spacing, empty/single-note paths, distinct endpoints, MIDI identity, copy offsets, bounds, legacy defaults, input normalization and shared formula resources.",
);
