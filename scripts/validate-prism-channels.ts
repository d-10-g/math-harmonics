import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Window } from 'happy-dom';
import { PHYSICAL_MATERIAL_PROFILES } from '../src/lib/materials';
import { normalizePrismChannels, PRISM_GLB_ASSETS, resolvePrismChannel, type PrismChannelMap } from '../src/lib/prismChannels';
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
  value: { prismShape: 'glb', prismFinish: 'ornament', prismPathSpread: 1, prismTrailLength: 25, prismMesh: 'Star', prismChannels: supplied },
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
assert.equal(item('Prism trail shape').options.length, 7);
assert.ok(item('Animated flight'), 'Animated preset reaches the shared VR menus');
for (const channel of [1, 4, 16]) {
  assert.equal(item(`Flight channel ${channel} GLB model`).options.length, PRISM_GLB_ASSETS.length + 1);
  assert.equal(item(`Flight channel ${channel} material`).options.length, PHYSICAL_MATERIAL_PROFILES.length + 2);
  assert.equal(item(`Flight channel ${channel} movement`).options.length, 33);
}
assert.equal(item('Flight channel 1 material').value, 'original');
assert.equal(item('Flight channel 4 material').value, 'gold');
assert.equal(item('Flight channel 16 GLB model').value, first.file);
assert.ok(item('Reset flight channels'));
await window.happyDOM.close();
console.log('PASS: sparse GLB channel choices, all material profiles, authored materials, deterministic defaults, overrides, invalid maps, and complete shared VR controls.');
