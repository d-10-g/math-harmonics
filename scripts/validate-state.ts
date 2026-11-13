import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadSharedState, persistSharedState, type SharedState } from '../src/lib/urlState';
import PrismFlightControls from '../src/components/PrismFlightControls';
import { DEFAULT_FLIGHT_EFFECTS } from '../src/lib/flightEffects';
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
  webgpuLightingPreset: 'studio', webgpuLighting: 1.15, autoStyle: false, showEnvironment: true, showStarfield: true, lineWidth: 0.14,
  cycleFavoritesOnly: false, autoPilotShuffle: false, postFX: true, bloomIntensity: 0.25, audioSource: 'midi',
  noteMeshes: true, noteFxAmount: 2, noteFxMode: 'both', noteSpread: 5,
  noteLayout: { geometry: 'helix', copies: 2, offset: 1, rotation: 25 },
  noteSource: 'prism', meshUseMtl: false, meshAssign: 'random', noteDisplay: 'sounding',
  prismColor: 'chroma', prismSlice: 0.14, prismPerChannel: true, prismShape: 'mesh', prismFinish: 'glass',
  prismPathSpread: 0.8, prismTrailLength: 25, prismMesh: 'Star',
  prismEffects: { bursts: 0.8, shockwaves: 1.2, lasers: 1.1, tracers: 0.7, auroras: 0.55, constellations: 1.1, gyroscopes: 0.8, lightning: 0.7, petals: 0.4, bubbles: 0.9, ribbons: 0.8, crystals: 0.7, vortexes: 0.4, motion: 'butterfly', motionAmount: 0.9, morph: 0.6 },
  prismCameraFollow: true, prismCameraStyle: 'cinematic', prismCameraEnergy: 1.25,
  prismChannels: {
    0: { asset: 'Ernie_model.glb', material: 'ornament', movement: '01_Head_nod' },
    1: { asset: 'Kira_model.glb', material: 'glass', movement: 'Kira_08_Little_chirp' },
  },
  alphabet: { stereo: 'mono', baseline: 0.28, relief: 0.88, collimation: 0.86, pointSize: 2.6, tour: true, rings: true },
};
persistSharedState(state);
const roundTrip = loadSharedState();
assert.deepEqual(roundTrip, state, 'Every shared control survives save/reload');
window.localStorage.clear();
assert.deepEqual(loadSharedState(), state, 'A copied link works without prior storage');
const mixedState: Required<SharedState> = { ...state, prismShape: 'mixed', prismChannels: {
  0: { kind: 'glb', asset: 'Ernie_model.glb', material: 'gold', movement: '01_Head_nod' },
  4: { kind: 'obj', asset: 'Star.obj', material: 'spectrum' },
  15: { kind: 'shape', shape: 'torus', material: 'dichroic' },
} };
persistSharedState(mixedState);
assert.deepEqual(loadSharedState(), mixedState, 'Mixed source kinds, shape ids, meshes, materials, and GLB movements round-trip');
window.localStorage.clear();
assert.deepEqual(loadSharedState(), mixedState, 'Mixed flights reproduce from a link without prior storage');
persistSharedState(state);

window.location.hash = '#sf=0&pcs=chase&pce=99';
assert.equal(loadSharedState().showStarfield, false, 'An explicit starfield Off wins over saved preferences');
assert.equal(loadSharedState().prismCameraStyle, 'chase');
assert.equal(loadSharedState().prismCameraEnergy, 2, 'Musical camera energy is bounded');
window.location.hash = '#sf=wrong&pcs=wrong&pce=NaN';
assert.equal(loadSharedState().showStarfield, true, 'Invalid flags preserve saved starfield choice');
assert.equal(loadSharedState().prismCameraStyle, 'cinematic');
assert.equal(loadSharedState().prismCameraEnergy, 1.25);
window.localStorage.clear();
window.location.hash = '#env=1';
assert.equal(loadSharedState().showStarfield, undefined, 'Legacy backdrop flags never opt in to stars');
persistSharedState(state);

window.location.hash = '#pcf=0';
assert.equal(loadSharedState().prismCameraFollow, false, 'An explicit Off overrides a saved camera preference');
window.location.hash = '#pcf=maybe';
assert.equal(loadSharedState().prismCameraFollow, true, 'Invalid camera flags retain a valid saved preference');
persistSharedState({ ...state, prismCameraFollow: false });
window.localStorage.clear();
assert.equal(loadSharedState().prismCameraFollow, false, 'Camera Off survives Copy Link without storage');
window.location.hash = '#r=webgl';
assert.equal(loadSharedState().prismCameraFollow, undefined, 'Old links leave follow to the landing default');
persistSharedState(state);

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
window.location.hash = '#psh=glb&pch=%7Bbad';
assert.deepEqual(loadSharedState().prismChannels, state.prismChannels, 'Malformed channel JSON preserves stored choices');
window.location.hash = '#psh=glb&pch=' + encodeURIComponent(JSON.stringify({
  0: { asset: '../private.glb', material: 'unknown', movement: 'nope' },
  15: { asset: 'Kira_model.glb', material: 'original', movement: 'Kira_08_Little_chirp' },
  16: { asset: 'Ernie_model.glb', material: 'gold' },
}));
assert.equal(loadSharedState().prismShape, 'glb');
assert.deepEqual(loadSharedState().prismChannels, {15: { asset: 'Kira_model.glb', material: 'original', movement: 'Kira_08_Little_chirp' }}, 'Channel maps restrict asset ids, materials, movements, and channel bounds');
window.location.hash = '#pch=' + encodeURIComponent(' '.repeat(8193));
assert.deepEqual(loadSharedState().prismChannels, state.prismChannels, 'Oversized maps cannot replace valid settings');
window.location.hash = '#pfx=' + encodeURIComponent('{bad');
assert.deepEqual(loadSharedState().prismEffects, state.prismEffects, 'Malformed FX JSON preserves saved effects');
window.location.hash = '#pfx=' + encodeURIComponent(JSON.stringify({bursts: -5, lasers: 99, shockwaves: 'bad', morph: 20, motion: 'unknown'}));
assert.deepEqual(loadSharedState().prismEffects, {...DEFAULT_FLIGHT_EFFECTS, lasers: 2, morph: 1}, 'FX settings clamp ranges and reject invalid values');
window.location.hash = '#pfx=' + encodeURIComponent(' '.repeat(1025));
assert.deepEqual(loadSharedState().prismEffects, state.prismEffects, 'Oversized FX payloads cannot replace saved effects');
window.location.hash = '';
for (const corrupt of ['null', '[]', '"wrong type"', '{', '{"webgpuMaterial":"deleted","prismShape":"nope","speed":"NaN"}']) {
  window.localStorage.setItem(storageKey, corrupt);
  assert.deepEqual(loadSharedState(), {}, `Corrupt settings are ignored: ${corrupt}`);
}

window.document.body.innerHTML = `<aside data-spatial-menu="Controls"><div data-spatial-section="Prism canvas">${renderToStaticMarkup(createElement(PrismFlightControls, {
  value: state, onChange() {}, onLook() {}, meshLibrary: ['Star', 'Cat'], perChannel: true,
}))}</div></aside>`;
// Happy DOM does not consistently apply SSR selected attributes on native
// selects; mirror browser hydration before adapting them to the VR menu.
for (const select of window.document.querySelectorAll('select')) {
  const selected = select.querySelector('option[selected]');
  if (selected) select.value = selected.getAttribute('value')!;
}
const items = readSpatialMenus(window.document as unknown as Document).flatMap(section => section.items);
const item = (label: string) => items.find(i => i.label === label)!;
assert.equal(item('Prism trail shape').options.length, 8);
assert.equal(item('Prism surface').options.length, 3);
assert.equal(item('Prism sculpture').options.length, 2);
assert.equal(item('Prism flight divergence').max, 2);
assert.equal(item('Prism trail memory').max, 120);
assert.equal(item('Camera follow').kind, 'toggle');
assert.equal(item('Camera follow').active, true, 'VR reads the exact desktop camera-follow state');
assert.deepEqual(item('Camera follow style').options.map(option => option.value), ['balanced', 'chase', 'orbit', 'cinematic']);
assert.equal(item('Camera follow style').value, 'cinematic');
assert.equal(item('Camera musical energy').min, 0);
assert.equal(item('Camera musical energy').max, 2);
assert.equal(item('Camera musical energy').step, 0.05);
assert.equal(Number(item('Camera musical energy').value), 1.25);
for (const label of ['Spectral ribbons', 'Ornament parade', 'Glass constellations', 'Sculpture flight', 'Animated flight', 'Mixed flight']) assert.ok(item(label), `${label} reaches VR`);
await window.happyDOM.close();
console.log('PASS: share-link round trip, stored-state validation, precedence, numeric bounds, mesh ids, and flight studio VR controls.');
