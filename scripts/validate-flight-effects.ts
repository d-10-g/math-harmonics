import assert from 'node:assert/strict';
import { createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Window } from 'happy-dom';
import { DEFAULT_FLIGHT_EFFECTS, FLIGHT_MOTIONS, FLIGHT_SHOWCASES, normalizeFlightEffects, type FlightEffectsSettings } from '../src/lib/flightEffects';
import FlightEffectsControls from '../src/components/FlightEffectsControls';
import PrismFlightControls, { type PrismFlightSettings } from '../src/components/PrismFlightControls';
import { readSpatialMenus } from '../src/lib/spatialMenu';

for (const absent of [undefined, null, [], true, 7, 'edited', {}]) {
  assert.deepEqual(normalizeFlightEffects(absent), DEFAULT_FLIGHT_EFFECTS, 'Old links and absent effects preserve the original scene');
}
const supplied: FlightEffectsSettings = { bursts: 1.7, shockwaves: 0.55, lasers: 0.35, tracers: 1.5, auroras: 0.8, constellations: 1.2, gyroscopes: 0.65, lightning: 1.1, petals: 0.35, bubbles: 0.8, ribbons: 0.9, crystals: 0.6, vortexes: 0.35, motion: 'vortex', motionAmount: 1.25, morph: 0.66 };
const serialized = JSON.stringify(supplied);
assert.deepEqual(normalizeFlightEffects(JSON.parse(serialized)), supplied, 'Every setting survives serialization exactly');
assert.deepEqual(normalizeFlightEffects({ bursts: 99, shockwaves: -1, lasers: '1', tracers: NaN, auroras: Infinity, constellations: 8, gyroscopes: -1, lightning: 9, petals: -1, bubbles: '2', ribbons: 99, crystals: -1, vortexes: NaN, motion: 'camera-shake', motionAmount: Infinity, morph: 9, injected: 1 }),
  { ...DEFAULT_FLIGHT_EFFECTS, bursts: 2, constellations: 2, lightning: 2, ribbons: 2, morph: 1 }, 'Invalid values are ignored and numeric bounds apply');
const oldEffects = { bursts: 1, shockwaves: 0.3, lasers: 0.5, tracers: 0.2, motion: 'wave', motionAmount: 0.7, morph: 0.1 };
assert.deepEqual(normalizeFlightEffects(oldEffects), { ...DEFAULT_FLIGHT_EFFECTS, ...oldEffects }, 'Existing FX links retain their look and leave new layers disabled');
const copy = normalizeFlightEffects(supplied);
copy.bursts = 0;
assert.equal(supplied.bursts, 1.7, 'Normalization never mutates stored settings');
assert.equal(JSON.stringify(supplied), serialized);
assert.notEqual(normalizeFlightEffects(undefined), DEFAULT_FLIGHT_EFFECTS, 'Defaults are returned as a private settings object');
assert(Object.isFrozen(DEFAULT_FLIGHT_EFFECTS));
assert.equal(new Set(FLIGHT_SHOWCASES.map(preset => preset.id)).size, 16);
assert.equal(new Set(FLIGHT_SHOWCASES.map(preset => preset.effects.motion)).size, 6, 'Showcases explore different motion fields');
for (const preset of FLIGHT_SHOWCASES) {
  assert.deepEqual(normalizeFlightEffects(preset.effects), preset.effects, `${preset.label} is within the supported ranges`);
  assert.ok(preset.effects.bursts + preset.effects.shockwaves + preset.effects.lasers + preset.effects.tracers + preset.effects.auroras + preset.effects.constellations + preset.effects.gyroscopes + preset.effects.lightning + preset.effects.petals + preset.effects.bubbles + preset.effects.ribbons + preset.effects.crystals + preset.effects.vortexes > 0);
  for (const [key, value] of Object.entries(preset.effects)) {
    if (typeof value === 'number') {
      const step = key === 'morph' ? 0.01 : 0.05;
      assert.ok(Math.abs(value / step - Math.round(value / step)) < 1e-8, `${preset.label}/${key} aligns with the actual slider step`);
    }
  }
}

function elements(node: ReactNode): any[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement(node)) return [];
  return [node, ...elements((node.props as any).children)];
}
let changed: FlightEffectsSettings | undefined;
const tree = FlightEffectsControls({ value: supplied, onChange: value => { changed = value; } });
const control = (label: string) => elements(tree).find(element => element.props['aria-label'] === label)!;
for (const key of ['bursts', 'shockwaves', 'lasers', 'tracers', 'auroras', 'constellations', 'gyroscopes', 'lightning', 'petals', 'bubbles', 'ribbons', 'crystals', 'vortexes', 'morph'] as const) {
  control(`Flight ${key}`).props.onChange({ target: { value: '0.4' } });
  assert.deepEqual(changed, { ...supplied, [key]: 0.4 }, `${key} edits preserve the other effects`);
}
control('Flight motion').props.onChange({ target: { value: 'wave' } });
assert.deepEqual(changed, { ...supplied, motion: 'wave' });
control('Flight motion amount').props.onChange({ target: { value: '0.7' } });
assert.deepEqual(changed, { ...supplied, motionAmount: 0.7 });
for (const preset of FLIGHT_SHOWCASES) {
  control(preset.label).props.onClick();
  assert.deepEqual(changed, preset.effects, 'Without a scene callback, a showcase still applies its complete effects');
  assert.notEqual(changed, preset.effects);
}
const clear = elements(tree).find(element => element.type === 'button' && element.props.children === 'Clear flight FX')!;
clear.props.onClick();
assert.deepEqual(changed, DEFAULT_FLIGHT_EFFECTS);

let showcase: string | undefined;
changed = undefined;
const sceneTree = FlightEffectsControls({ value: supplied, onChange: value => { changed = value; }, onShowcase: id => { showcase = id; } });
elements(sceneTree).find(element => element.props['aria-label'] === 'Stargate')!.props.onClick();
assert.equal(showcase, 'stargate');
assert.equal(changed, undefined, 'The app owns complete scene application when it provides a callback');

const flight: PrismFlightSettings = { prismShape: 'mixed', prismFinish: 'ornament', prismPathSpread: 1,
  prismTrailLength: 25, prismMesh: 'Star', prismChannels: { 0: { kind: 'glb', asset: 'Ernie_model.glb', material: 'gold' } }, prismEffects: supplied, prismCameraFollow: true, prismCameraStyle: 'chase', prismCameraEnergy: 1.25, prismAutoDirector: false, prismAutoCast: false, prismCastStyle: 'ripple' };
let flightPatch: Partial<PrismFlightSettings> | undefined;
const flightTree = PrismFlightControls({ value: flight, onChange: patch => { flightPatch = patch; }, onLook() {}, meshLibrary: ['Star'], perChannel: true });
const child = elements(flightTree).find(element => element.type === FlightEffectsControls)!;
child.props.onChange({ ...DEFAULT_FLIGHT_EFFECTS });
assert.deepEqual(Object.keys(flightPatch!), ['prismEffects'], 'Clearing or editing FX does not replace models, materials, paths, or channel assignments');
assert.deepEqual(flight.prismChannels, { 0: { kind: 'glb', asset: 'Ernie_model.glb', material: 'gold' } });
assert.equal(flight.prismCameraFollow, true, 'Clearing FX retains the independent camera preference');
const cameraControl = elements(flightTree).find(element => element.props['aria-label'] === 'Camera follow')!;
assert.equal(cameraControl.props.checked, true);
cameraControl.props.onChange({ target: { checked: false } });
assert.deepEqual(flightPatch, { prismCameraFollow: false }, 'Camera edits preserve all channel and FX settings');
const cameraStyle = elements(flightTree).find(element => element.props['aria-label'] === 'Camera follow style')!;
cameraStyle.props.onChange({ target: { value: 'cinematic' } });
assert.deepEqual(flightPatch, { prismCameraStyle: 'cinematic' }, 'Style edits retain the follow toggle and scene');
const cameraEnergy = elements(flightTree).find(element => element.props['aria-label'] === 'Camera musical energy')!;
cameraEnergy.props.onChange({ target: { value: '0.8' } });
assert.deepEqual(flightPatch, { prismCameraEnergy: 0.8 }, 'Camera energy changes leave FX untouched');
const directorControl = elements(flightTree).find(element => element.props['aria-label'] === 'Flight auto director')!;
directorControl.props.onChange({ target: { checked: true } });
assert.deepEqual(flightPatch, { prismAutoDirector: true }, 'Auto direction preserves the chosen channel cast');
const castControl = elements(flightTree).find(element => element.props['aria-label'] === 'Flight auto cast')!;
assert.equal(castControl.props.disabled, true, 'Automatic casting requires the music director');
assert.equal(castControl.props.checked, false);
const directedTree = PrismFlightControls({ value: { ...flight, prismAutoDirector: true }, onChange: patch => { flightPatch = patch; }, onLook() {}, meshLibrary: ['Star'], perChannel: true });
const directedCast = elements(directedTree).find(element => element.props['aria-label'] === 'Flight auto cast')!;
assert.equal(directedCast.props.disabled, false);
directedCast.props.onChange({ target: { checked: true } });
assert.deepEqual(flightPatch, { prismAutoCast: true }, 'Automatic casting retains the complete saved manual channel map');
const castTree = PrismFlightControls({ value: { ...flight, prismAutoDirector: true, prismAutoCast: true }, onChange: patch => { flightPatch = patch; }, onLook() {}, meshLibrary: ['Star'], perChannel: true });
const castTransition = elements(castTree).find(element => element.props['aria-label'] === 'Flight cast transition')!;
assert.equal(castTransition.props.disabled, false);
castTransition.props.onChange({ target: { value: 'together' } });
assert.deepEqual(flightPatch, { prismCastStyle: 'together' }, 'Changing cast transition retains the automatic direction and channel choices');
elements(castTree).find(element => element.props['aria-label'] === 'Prism trail shape')!.props.onChange({ target: { value: 'sphere' } });
assert.deepEqual(flightPatch, { prismShape: 'sphere', prismAutoCast: false }, 'Choosing a manual shape releases automatic casting while retaining camera/FX direction');
elements(directedTree).find(element => element.type === FlightEffectsControls)!.props.onChange({ ...supplied, lasers: 0.4 });
assert.deepEqual(flightPatch, { prismEffects: { ...supplied, lasers: 0.4 }, prismAutoDirector: false }, 'Manual FX edits take over from automatic direction');
elements(directedTree).find(element => element.props['aria-label'] === 'Camera follow style')!.props.onChange({ target: { value: 'orbit' } });
assert.deepEqual(flightPatch, { prismCameraStyle: 'orbit', prismAutoDirector: false }, 'Manual camera style takes over from automatic direction');

const window = new Window();
for (const name of ['HTMLButtonElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement',
  'HTMLMediaElement', 'HTMLAudioElement', 'HTMLVideoElement', 'HTMLOptGroupElement', 'Event']) (globalThis as any)[name] = (window as any)[name];
const render = (value: FlightEffectsSettings) => {
  window.document.body.innerHTML = `<aside data-spatial-menu="Controls">${renderToStaticMarkup(createElement(FlightEffectsControls, { value, onChange() {} }))}</aside>`;
  for (const select of window.document.querySelectorAll('select')) {
    const selected = select.querySelector('option[selected]');
    if (selected) select.value = selected.getAttribute('value')!;
  }
  return readSpatialMenus(window.document as unknown as Document);
};
const sections = render(supplied);
assert.deepEqual(sections.map(section => section.label), ['Controls · Flight FX']);
const item = (label: string) => sections[0].items.find(item => item.label === label)!;
for (const key of ['bursts', 'shockwaves', 'lasers', 'tracers', 'auroras', 'constellations', 'gyroscopes', 'lightning', 'petals', 'bubbles', 'ribbons', 'crystals', 'vortexes', 'morph'] as const) {
  const dial = item(`Flight ${key}`);
  assert.equal(dial.min, 0);
  assert.equal(dial.max, key === 'morph' ? 1 : 2);
  assert.equal(dial.step, key === 'morph' ? 0.01 : 0.05);
  assert.equal(Number(dial.value), supplied[key]);
}
assert.equal(item('Flight motion').value, 'vortex');
assert.deepEqual(item('Flight motion').options.map(option => option.value), FLIGHT_MOTIONS.map(([id]) => id));
assert.equal(item('Flight motion amount').max, 2);
assert.equal(item('Flight motion amount').step, 0.05);
assert.equal(item('Flight motion amount').disabled, false);
for (const preset of FLIGHT_SHOWCASES) assert.equal(item(preset.label).kind, 'action', 'Every surprise scene is available through the shared VR menus');
assert.equal(item('Clear flight FX').kind, 'action');
const defaults = render(normalizeFlightEffects(undefined));
assert.equal(defaults[0].items.find(item => item.label === 'Flight motion amount')!.disabled, true, 'Motion strength is disabled consistently when the motion field is still');
await window.happyDOM.close();
console.log('PASS: bounded FX settings, old-link defaults, sixteen showcases, isolated edits, camera independence, clear behavior, and exact shared VR controls.');
