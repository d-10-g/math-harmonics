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
const supplied: FlightEffectsSettings = { bursts: 1.7, shockwaves: 0.55, lasers: 0.35, tracers: 1.5, motion: 'vortex', motionAmount: 1.25, morph: 0.66 };
const serialized = JSON.stringify(supplied);
assert.deepEqual(normalizeFlightEffects(JSON.parse(serialized)), supplied, 'Every setting survives serialization exactly');
assert.deepEqual(normalizeFlightEffects({ bursts: 99, shockwaves: -1, lasers: '1', tracers: NaN, motion: 'camera-shake', motionAmount: Infinity, morph: 9, injected: 1 }),
  { bursts: 2, shockwaves: 0, lasers: 0, tracers: 0, motion: 'none', motionAmount: 1, morph: 1 }, 'Invalid values are ignored and numeric bounds apply');
const copy = normalizeFlightEffects(supplied);
copy.bursts = 0;
assert.equal(supplied.bursts, 1.7, 'Normalization never mutates stored settings');
assert.equal(JSON.stringify(supplied), serialized);
assert.notEqual(normalizeFlightEffects(undefined), DEFAULT_FLIGHT_EFFECTS, 'Defaults are returned as a private settings object');
assert(Object.isFrozen(DEFAULT_FLIGHT_EFFECTS));
assert.equal(new Set(FLIGHT_SHOWCASES.map(preset => preset.id)).size, 4);
assert.equal(new Set(FLIGHT_SHOWCASES.map(preset => preset.effects.motion)).size, 4, 'Showcases explore different motion fields');
for (const preset of FLIGHT_SHOWCASES) {
  assert.deepEqual(normalizeFlightEffects(preset.effects), preset.effects, `${preset.label} is within the supported ranges`);
  assert.ok(preset.effects.bursts + preset.effects.shockwaves + preset.effects.lasers + preset.effects.tracers > 0);
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
for (const key of ['bursts', 'shockwaves', 'lasers', 'tracers', 'morph'] as const) {
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
  prismTrailLength: 25, prismMesh: 'Star', prismChannels: { 0: { kind: 'glb', asset: 'Ernie_model.glb', material: 'gold' } }, prismEffects: supplied };
let flightPatch: Partial<PrismFlightSettings> | undefined;
const flightTree = PrismFlightControls({ value: flight, onChange: patch => { flightPatch = patch; }, onLook() {}, meshLibrary: ['Star'], perChannel: true });
const child = elements(flightTree).find(element => element.type === FlightEffectsControls)!;
child.props.onChange({ ...DEFAULT_FLIGHT_EFFECTS });
assert.deepEqual(Object.keys(flightPatch!), ['prismEffects'], 'Clearing or editing FX does not replace models, materials, paths, or channel assignments');
assert.deepEqual(flight.prismChannels, { 0: { kind: 'glb', asset: 'Ernie_model.glb', material: 'gold' } });

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
for (const key of ['bursts', 'shockwaves', 'lasers', 'tracers', 'morph'] as const) {
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
console.log('PASS: bounded FX settings, old-link defaults, four distinct showcases, isolated edits, scene callbacks, clear behavior, and exact shared VR controls.');
