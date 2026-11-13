import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadSharedState, persistSharedState, type SharedState } from '../src/lib/urlState';
import PrismFlightControls from '../src/components/PrismFlightControls';
import { readSpatialMenus } from '../src/lib/spatialMenu';

const window = new Window({ url: 'https://example.test/' });
for (const name of ['localStorage', 'location', 'history', 'HTMLButtonElement', 'HTMLInputElement',
  'HTMLSelectElement', 'HTMLTextAreaElement', 'HTMLMediaElement', 'HTMLAudioElement', 'HTMLVideoElement', 'HTMLOptGroupElement', 'Event']) {
  (globalThis as any)[name] = (window as any)[name];
}
const storageKey = 'harmonics.state.v1';
const state: Required<SharedState> = {
  formulaId: 'surf-02', shaderId: 'rainbow', rendererMode: 'webgl', show3D: true, showWireframe: false,
  showArtifacts: false, showMirrors: false, speed: 1, webgpuGeometry: 'auto', webgpuMaterial: 'dichroic',
  webgpuLightingPreset: 'studio', webgpuLighting: 1.15, autoStyle: false, showEnvironment: true, lineWidth: 0.14,
  cycleFavoritesOnly: false, autoPilotShuffle: false, postFX: true, bloomIntensity: 0.25, audioSource: 'midi',
  noteMeshes: true, noteFxAmount: 2, noteFxMode: 'both', noteSpread: 5,
  noteLayout: { geometry: 'helix', copies: 2, offset: 1, rotation: 25 },
  noteSource: 'prism', meshUseMtl: false, meshAssign: 'random', noteDisplay: 'sounding',
  prismColor: 'chroma', prismSlice: 0.14, prismPerChannel: true, prismShape: 'mesh', prismFinish: 'glass',
  prismPathSpread: 0.8, prismTrailLength: 25, prismMesh: 'Star',
  alphabet: { stereo: 'mono', baseline: 0.28, relief: 0.88, collimation: 0.86, pointSize: 2.6, tour: true, rings: true },
};
persistSharedState(state);
const roundTrip = loadSharedState();
assert.deepEqual(roundTrip, state, 'Every shared control survives save/reload');
window.localStorage.clear();
assert.deepEqual(loadSharedState(), state, 'A copied link works without prior storage');
window.location.hash = '#pfi=ornament&psh=knot&ppd=999&ptl=13&pms=../../missing&mat=invalid&ppc=maybe';
window.localStorage.setItem(storageKey, JSON.stringify({ ...state, speed: -99, webgpuMaterial: 'gold', prismMesh: 'Cat' }));
const merged = loadSharedState();
assert.equal(merged.prismFinish, 'ornament');
assert.equal(merged.prismShape, 'knot');
assert.equal(merged.prismPathSpread, 2);
assert.equal(merged.prismTrailLength, 15);
assert.equal(merged.prismMesh, 'Cat', 'Unknown mesh ids cannot become asset URLs');
assert.equal(merged.webgpuMaterial, 'gold', 'Invalid hash values do not erase valid saved values');
assert.equal(merged.prismPerChannel, true, 'Invalid booleans do not erase valid saved values');
assert.equal(merged.speed, 0, 'Stored settings use the same bounds as shared links');
window.location.hash = '';
for (const corrupt of ['null', '[]', '"wrong type"', '{', '{"webgpuMaterial":"deleted","prismShape":"nope","speed":"NaN"}']) {
  window.localStorage.setItem(storageKey, corrupt);
  assert.deepEqual(loadSharedState(), {}, `Corrupt settings are ignored: ${corrupt}`);
}

window.document.body.innerHTML = `<aside data-spatial-menu="Controls"><div data-spatial-section="Prism canvas">${renderToStaticMarkup(createElement(PrismFlightControls, {
  value: state, onChange() {}, onLook() {}, meshLibrary: ['Star', 'Cat'], perChannel: true,
}))}</div></aside>`;
const items = readSpatialMenus(window.document as unknown as Document).flatMap(section => section.items);
const item = (label: string) => items.find(i => i.label === label)!;
assert.equal(item('Prism trail shape').options.length, 6);
assert.equal(item('Prism surface').options.length, 3);
assert.equal(item('Prism sculpture').options.length, 2);
assert.equal(item('Prism flight divergence').max, 2);
assert.equal(item('Prism trail memory').max, 120);
for (const label of ['Spectral ribbons', 'Ornament parade', 'Glass constellations', 'Sculpture flight']) assert.ok(item(label), `${label} reaches VR`);
await window.happyDOM.close();
console.log('PASS: share-link round trip, stored-state validation, precedence, numeric bounds, mesh ids, and flight studio VR controls.');
