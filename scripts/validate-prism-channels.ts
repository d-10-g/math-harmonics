import { DEFAULT_FLIGHT_EFFECTS } from '../src/lib/flightEffects';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Window } from 'happy-dom';
import { PHYSICAL_MATERIAL_PROFILES } from '../src/lib/materials';
import { normalizePrismChannels, patchPrismChannel, PRISM_GLB_ASSETS, PRISM_OBJ_ASSETS, PRISM_STATIC_SHAPES, resolvePrismChannel, resolveMixedPrismChannel, type PrismChannelMap } from '../src/lib/prismChannels';
import PrismFlightControls from '../src/components/PrismFlightControls';
import { readSpatialMenus } from '../src/lib/spatialMenu';

assert.ok(PRISM_GLB_ASSETS.length >= 2, 'Independent channel choices include both exported rigs');
const first = PRISM_GLB_ASSETS[0], second = PRISM_GLB_ASSETS[1];
const supplied: PrismChannelMap = {
  0: { asset: first.file, material: 'original', movement: first.movements[3].clip },
  3: { asset: second.file, material: 'gold', movement: second.movements[19].clip },
  15: { asset: first.file, material: 'dichroic', movement: first.movements[31].clip },
};
const canonical = normalizePrismChannels(JSON.parse(JSON.stringify(supplied)));
assert.deepEqual(canonical, supplied, 'Sparse MIDI channel identity, models, authored finish, materials and movements survive serialization');
const copy = JSON.stringify(supplied);
for (const channel of [0, 3, 15]) {
  const choice = resolvePrismChannel(canonical, channel, 'ornament', 'glass');
  assert.equal(choice.asset.file, supplied[channel].asset);
  assert.equal(choice.material, supplied[channel].material, 'Per-channel material overrides global finish');
  assert.equal(choice.movement, supplied[channel].movement);
}
assert.equal(JSON.stringify(supplied), copy, 'Resolving never mutates user settings');
assert.notEqual(resolvePrismChannel({}, 0).asset.file, resolvePrismChannel({}, 1).asset.file, 'Defaults alternate rigs');
assert.notEqual(resolvePrismChannel({}, 0).material, resolvePrismChannel({}, 1).material, 'Auto produces distinct channel finishes');
assert.deepEqual(resolvePrismChannel({}, 15), resolvePrismChannel({}, 15), 'Defaults remain deterministic across reloads');
assert.equal(resolvePrismChannel({}, 3, 'copper', 'glass').material, 'copper', 'Auto inherits an explicit Output material');
assert.equal(resolvePrismChannel({ 3: { material: 'auto' } }, 3, 'copper', 'glass').material, 'copper');
assert.equal(resolvePrismChannel({}, 0, 'auto', 'glass').material, 'glass');
assert.equal(resolvePrismChannel({}, 0, 'auto', 'spectrum').material, 'plasma');
for (const profile of PHYSICAL_MATERIAL_PROFILES) {
  assert.equal(resolvePrismChannel({ 4: { material: profile } }, 4).material, profile, `${profile} can be assigned independently`);
}
for (const invalid of [null, undefined, [], 'bad', 17, false]) assert.deepEqual(normalizePrismChannels(invalid), {});
const invalid = normalizePrismChannels({
  '-1': { material: 'gold' }, 16: { material: 'gold' }, '00': { material: 'gold' },
  0: { asset: '../../private.glb', material: 'missing', movement: 'missing' },
  3: { asset: second.file, material: 'original', movement: first.movements[0].clip },
  15: { asset: first.file, material: 'ruby', unknown: 'discard' },
});
assert.deepEqual(invalid, {
  3: { asset: second.file, material: 'original' },
  15: { asset: first.file, material: 'ruby' },
}, 'Invalid channels, files, profiles, and movements are discarded without losing valid rows');
assert.deepEqual(normalizePrismChannels(JSON.parse('{"__proto__":{"asset":"bad"}}')), {});

const window = new Window();
for (const name of ['HTMLButtonElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement',
  'HTMLMediaElement', 'HTMLAudioElement', 'HTMLVideoElement', 'HTMLOptGroupElement', 'Event']) {
  (globalThis as any)[name] = (window as any)[name];
}
window.document.body.innerHTML = `<aside data-spatial-menu="Controls"><div data-spatial-section="Prism canvas">${renderToStaticMarkup(createElement(PrismFlightControls, {
  value: { prismShape: 'glb', prismFinish: 'ornament', prismPathSpread: 1, prismTrailLength: 25, prismMesh: 'Star', prismChannels: supplied, prismEffects: {...DEFAULT_FLIGHT_EFFECTS}, prismCameraFollow: false, prismCameraStyle: 'balanced', prismCameraEnergy: 1, prismAutoDirector: false, prismAutoCast: false, prismCastStyle: 'ripple' },
  onChange() {}, onLook() {}, meshLibrary: ['Star'], perChannel: true, midiChannels: [15, 0, 3],
}))}</div></aside>`;
// React sets controlled select values on mount. Happy DOM retains SSR
// selected attributes but can leave stale selectedIndex values while parsing
// adjacent selects, so initialize the same values before reading the VR menu.
for (const select of window.document.querySelectorAll('select')) {
  const selected = select.querySelector('option[selected]');
  if (selected) select.value = selected.getAttribute('value')!;
}
const sections = readSpatialMenus(window.document as unknown as Document);
const items = sections.flatMap(section => section.items);
const item = (label: string) => items.find(item => item.label === label)!;
assert.ok(sections.some(section => section.label === 'Controls · GLB flight channels'));
assert.equal(item('Prism trail shape').options.length, 8);
assert.ok(item('Animated flight'), 'Animated preset reaches the shared VR menus');
for (const channel of [1, 4, 16]) {
  assert.equal(item(`Flight channel ${channel} GLB model`).options.length, PRISM_GLB_ASSETS.length + 1);
  assert.equal(item(`Flight channel ${channel} material`).options.length, PHYSICAL_MATERIAL_PROFILES.length + 3);
  assert.equal(item(`Flight channel ${channel} movement`).options.length, 33);
}
assert.equal(item('Flight channel 1 material').value, 'original');
assert.equal(item('Flight channel 4 material').value, 'gold');
assert.equal(item('Flight channel 16 GLB model').value, first.file);
assert.ok(item('Reset flight channels'));
const mixed: PrismChannelMap = {
  0: { kind: 'glb', asset: first.file, material: 'original', movement: first.movements[3].clip },
  1: { kind: 'obj', asset: 'Teapot.obj', material: 'gold' },
  2: { kind: 'shape', shape: 'knot', material: 'spectrum' },
  3: { kind: 'glb', asset: second.file, material: 'dichroic', movement: second.movements[19].clip },
};
assert.deepEqual(normalizePrismChannels(JSON.parse(JSON.stringify(mixed))), mixed, 'Mixed source types and choices survive serialization');
assert.deepEqual([0, 1, 2, 3, 4, 5].map(channel => resolveMixedPrismChannel({}, channel).kind), ['glb', 'obj', 'shape', 'glb', 'obj', 'shape']);
assert.deepEqual(resolveMixedPrismChannel({}, 15), resolveMixedPrismChannel({}, 15), 'Mixed defaults are deterministic');
assert.equal(resolveMixedPrismChannel({}, 1).kind, 'obj');
assert.equal((resolveMixedPrismChannel({}, 1) as { asset: { file: string } }).asset.file, 'Star.obj');
assert.equal((resolveMixedPrismChannel({}, 4) as { asset: { file: string } }).asset.file, 'Teapot.obj');
for (const channel of [0, 3, 15]) {
  const legacy = resolveMixedPrismChannel(supplied, channel);
  assert.equal(legacy.kind, 'glb');
  assert.deepEqual({ asset: legacy.kind === 'glb' ? legacy.asset : undefined, material: legacy.material,
    movement: legacy.kind === 'glb' ? legacy.movement : undefined }, resolvePrismChannel(supplied, channel), 'Legacy asset-only maps retain their rigs and finishes in Mixed mode');
}
const legacyMovementOnly = {1: {movement: second.movements[7].clip}};
assert.deepEqual(normalizePrismChannels(legacyMovementOnly), legacyMovementOnly);
const legacyMovementResolved = resolveMixedPrismChannel(legacyMovementOnly, 1);
assert.equal(legacyMovementResolved.kind, 'glb', 'Movement-only legacy GLB assignments do not become an OBJ default');
assert.equal(legacyMovementResolved.kind === 'glb' ? legacyMovementResolved.movement : undefined, second.movements[7].clip);
assert.equal(resolveMixedPrismChannel(mixed, 0, 'chrome').material, 'original');
assert.equal(resolveMixedPrismChannel(mixed, 1, 'chrome').material, 'gold');
assert.equal(resolveMixedPrismChannel(mixed, 2, 'chrome').material, 'spectrum', 'Explicit prism shader wins over Output material');
assert.equal(resolveMixedPrismChannel({2: {kind: 'shape', shape: 'sphere'}}, 2, 'ruby').material, 'ruby');
assert.equal(resolveMixedPrismChannel({2: {kind: 'shape', shape: 'sphere'}}, 2, 'auto', 'spectrum').material, 'spectrum');
assert.equal(resolveMixedPrismChannel({1: {kind: 'obj', asset: 'Star.obj', material: 'original'}}, 1).material, 'original');
assert.notEqual(resolveMixedPrismChannel({0: {kind: 'glb', material: 'spectrum'}}, 0).material, 'spectrum', 'GLB spectrum stays skin-aware physical material');
assert.notEqual(resolvePrismChannel({1: {kind: 'obj', asset: 'Star.obj', material: 'spectrum'}}, 1).asset.kind, 'obj', 'Animated GLB mode still resolves a rig after a mixed visit');
for (const asset of PRISM_OBJ_ASSETS) {
  const resolved = resolveMixedPrismChannel({7: {kind: 'obj', asset: asset.file}}, 7);
  assert.equal(resolved.kind, 'obj');
  assert.equal(resolved.kind === 'obj' ? resolved.asset.file : undefined, asset.file, 'Every bundled OBJ is selectable');
}
for (const [shape] of PRISM_STATIC_SHAPES) {
  const resolved = resolveMixedPrismChannel({8: {kind: 'shape', shape}}, 8);
  assert.equal(resolved.kind, 'shape');
  assert.equal(resolved.kind === 'shape' ? resolved.shape : undefined, shape);
}
assert.deepEqual(normalizePrismChannels({
  0: {kind: 'obj', asset: first.file, movement: first.movements[0].clip, material: 'gold'},
  1: {kind: 'shape', shape: 'torus', asset: 'Star.obj', movement: 'missing', material: 'original'},
  2: {kind: 'glb', shape: 'sphere', asset: '../../secret.glb', material: 'missing'},
  3: {asset: 'Star.obj', material: 'original'},
}), {
  0: {kind: 'obj', material: 'gold'},
  1: {kind: 'shape', shape: 'torus'},
  2: {kind: 'glb'},
  3: {asset: 'Star.obj', material: 'original'},
}, 'Source type checks reject incompatible assets, shapes, gestures and authored finishes');

window.document.body.innerHTML = `<aside data-spatial-menu="Controls"><div data-spatial-section="Prism canvas">${renderToStaticMarkup(createElement(PrismFlightControls, {
  value: { prismShape: 'mixed', prismFinish: 'ornament', prismPathSpread: 1, prismTrailLength: 25, prismMesh: 'Star', prismChannels: mixed, prismEffects: {...DEFAULT_FLIGHT_EFFECTS}, prismCameraFollow: false, prismCameraStyle: 'balanced', prismCameraEnergy: 1, prismAutoDirector: false, prismAutoCast: false, prismCastStyle: 'ripple' },
  onChange() {}, onLook() {}, meshLibrary: ['Star'], perChannel: true, midiChannels: [3, 2, 1, 0],
}))}</div></aside>`;
for (const select of window.document.querySelectorAll('select')) {
  const selected = select.querySelector('option[selected]');
  if (selected) select.value = selected.getAttribute('value')!;
}
const mixedSections = readSpatialMenus(window.document as unknown as Document);
const mixedItems = mixedSections.flatMap(section => section.items);
const mixedItem = (label: string) => mixedItems.find(item => item.label === label)!;
assert.ok(mixedSections.some(section => section.label === 'Controls · Flight channels'));
assert.ok(mixedItem('Mixed flight'));
assert.ok(mixedItem('Restore mixed defaults'));
for (const channel of [1, 2, 3, 4]) assert.equal(mixedItem(`Flight channel ${channel} source`).options.length, 4);
assert.equal(mixedItem('Flight channel 1 GLB model').value, first.file);
assert.equal(mixedItem('Flight channel 2 OBJ model').value, 'Teapot.obj');
assert.equal(mixedItem('Flight channel 2 OBJ model').options.length, PRISM_OBJ_ASSETS.length + 1);
assert.equal(mixedItem('Flight channel 3 shape').value, 'knot');
assert.equal(mixedItem('Flight channel 3 shape').options.length, PRISM_STATIC_SHAPES.length + 1);
assert.equal(mixedItem('Flight channel 2 material').value, 'gold');
assert.equal(mixedItem('Flight channel 3 material').value, 'spectrum');
assert.equal(mixedItem('Flight channel 3 material').options.length, PHYSICAL_MATERIAL_PROFILES.length + 2);
assert.equal(mixedItem('Flight channel 2 movement'), undefined);
assert.equal(mixedItem('Flight channel 3 movement'), undefined);
assert.equal(mixedItem('Flight channel 1 movement').options.length, 33);
assert.ok(!mixedItem('Flight channel 3 material').options.some(option => option.value === 'original'), 'Built-in geometry does not offer nonexistent authored materials');
// A GLB-only visit must display valid selects without destroying mixed assignments.
const beforeModeSwitch = JSON.stringify(mixed);
const editObjToGlb = patchPrismChannel(mixed, 1, {asset: second.file, movement: undefined}, false);
assert.deepEqual(editObjToGlb[1], {kind: 'glb', asset: second.file, material: 'gold'}, 'A GLB-only model edit replaces a stale OBJ kind');
assert.equal(mixed[1].kind, 'obj', 'Mode-specific edits do not mutate saved source maps');
const renderedGlb = resolvePrismChannel(mixed, 1);
const editObjMovement = patchPrismChannel(mixed, 1, {movement: renderedGlb.asset.movements[2].clip}, false);
assert.deepEqual(editObjMovement[1], {kind: 'glb', asset: renderedGlb.asset.file, material: 'gold', movement: renderedGlb.asset.movements[2].clip}, 'GLB-only movement edits capture the displayed rig');
const editShapeToGlb = patchPrismChannel(mixed, 2, {asset: first.file}, false);
assert.deepEqual(editShapeToGlb[2], {kind: 'glb', asset: first.file, material: 'spectrum'}, 'GLB-only source edits clear incompatible shape fields');
window.document.body.innerHTML = `<aside data-spatial-menu="Controls"><div data-spatial-section="Prism canvas">${renderToStaticMarkup(createElement(PrismFlightControls, {
  value: { prismShape: 'glb', prismFinish: 'ornament', prismPathSpread: 1, prismTrailLength: 25, prismMesh: 'Star', prismChannels: mixed, prismEffects: {...DEFAULT_FLIGHT_EFFECTS}, prismCameraFollow: false, prismCameraStyle: 'balanced', prismCameraEnergy: 1, prismAutoDirector: false, prismAutoCast: false, prismCastStyle: 'ripple' },
  onChange() {}, onLook() {}, meshLibrary: ['Star'], perChannel: true, midiChannels: [1, 2],
}))}</div></aside>`;
for (const select of window.document.querySelectorAll('select')) {
  const selected = select.querySelector('option[selected]');
  if (selected) select.value = selected.getAttribute('value')!;
}
const switchedItems = readSpatialMenus(window.document as unknown as Document).flatMap(section => section.items);
const switchedItem = (label: string) => switchedItems.find(item => item.label === label)!;
assert.equal(switchedItem('Flight channel 2 GLB model').value, 'auto');
assert.equal(switchedItem('Flight channel 3 GLB model').value, 'auto');
assert.equal(switchedItem('Flight channel 3 material').value, 'spectrum');
assert.equal(JSON.stringify(mixed), beforeModeSwitch, 'Rendering GLB-only controls leaves mixed assignments intact');
await window.happyDOM.close();
console.log('PASS: sparse GLB channel choices, all material profiles, authored materials, deterministic defaults, overrides, invalid maps, and all mixed source types, complete OBJ catalog, prism shaders, legacy GLB compatibility and shared VR controls.');
