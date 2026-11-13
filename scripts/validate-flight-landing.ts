import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Window } from 'happy-dom';
import SceneBackdropControls from '../src/components/SceneBackdropControls';
import PrismFlightControls from '../src/components/PrismFlightControls';
import { flightLandingState } from '../src/lib/flightLanding';
import { DEFAULT_LANDING_SCORE_ID, MIDI_LIBRARY } from '../src/lib/musicLibrary';
import { flightScene } from '../src/lib/flightScenes';
import { normalizeFlightCameraStyle, normalizeFlightCameraEnergy } from '../src/lib/flightCameraStyles';
import { readSpatialMenus } from '../src/lib/spatialMenu';
import { parseMidi } from '../src/lib/midi';

const defaults = flightLandingState({}), jelly = flightScene('cosmic-jelly');
assert.equal(defaults.noteSource, 'prism');
assert.equal(defaults.prismShape, 'mixed');
assert.deepEqual(defaults.prismChannels, jelly.channels);
assert.deepEqual(defaults.prismEffects, jelly.effects);
assert.equal(defaults.prismCameraFollow, true);
assert.equal(defaults.prismCameraStyle, 'balanced');
assert.equal(defaults.prismCameraEnergy, 1);
assert.equal(defaults.showStarfield, false);
assert.equal(defaults.webgpuLightingPreset, jelly.lighting);
assert.equal(defaults.autoStyle, false, 'Formula auto-style cannot replace the landing scene');
const preferences = { noteSource: 'formula' as const, prismCameraFollow: false, prismCameraStyle: 'orbit' as const,
  prismCameraEnergy: 0.65, showStarfield: true, showEnvironment: false, audioSource: 'mic' as const };
const returning = flightLandingState(preferences);
for (const [key, value] of Object.entries(preferences)) assert.equal(returning[key], value, 'Saved settings and share links take precedence');
assert.equal(flightLandingState({ showEnvironment: true }).showStarfield, false, 'Legacy backdrop preference never enables stars');
defaults.prismChannels![0].material = 'gold';
assert.deepEqual(flightLandingState({}).prismChannels, jelly.channels, 'Landing channels have independent ownership');
assert.equal(normalizeFlightCameraStyle('edited'), 'balanced');
assert.equal(normalizeFlightCameraEnergy(NaN), 1);
assert.equal(normalizeFlightCameraEnergy(20), 2);
assert.equal(normalizeFlightCameraEnergy(-1), 0);

assert.equal(MIDI_LIBRARY[0].id, DEFAULT_LANDING_SCORE_ID);
const mars = MIDI_LIBRARY.find(entry => entry.id === DEFAULT_LANDING_SCORE_ID)!;
assert.match(mars.name, /Holst.*Mars/);
for (const asset of [mars.mid, mars.audio]) assert(existsSync(`public/${asset.replace(/^\.\//, '')}`));
const bytes = readFileSync(`public/${mars.mid.replace(/^\.\//, '')}`);
const midi = parseMidi(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
assert(midi.duration > 380 && midi.duration < 400 && midi.notes.length > 9000, 'The default is the full Mars movement');
assert.equal(new Set(MIDI_LIBRARY.map(entry => entry.id)).size, MIDI_LIBRARY.length);

function elements(node: ReactNode): any[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement(node)) return [];
  return [node, ...elements((node.props as any).children)];
}
let changedSky: boolean | undefined, changedDome: boolean | undefined;
const props = { showEnvironment: true, onEnvironmentChange: (value: boolean) => { changedDome = value; },
  showStarfield: false, onStarfieldChange: (value: boolean) => { changedSky = value; } };
const tree = SceneBackdropControls(props);
elements(tree).find(element => element.props['aria-label'] === 'Starfield')!.props.onClick();
assert.equal(changedSky, true); assert.equal(changedDome, undefined, 'Stars never toggle the backdrop');
changedSky = undefined;
elements(tree).find(element => element.props['aria-label'] === 'Cosmos backdrop')!.props.onClick();
assert.equal(changedDome, false); assert.equal(changedSky, undefined, 'Backdrop never toggles stars');

const window = new Window();
for (const key of ['HTMLButtonElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement', 'HTMLMediaElement',
  'HTMLAudioElement', 'HTMLVideoElement', 'HTMLOptGroupElement', 'Event']) (globalThis as any)[key] = (window as any)[key];
const renderMenus = (follow: boolean, style: 'balanced' | 'cinematic') => {
  const flight = { ...flightLandingState({}), prismCameraFollow: follow, prismCameraStyle: style } as any;
  window.document.body.innerHTML = `<aside data-spatial-menu="Controls">${renderToStaticMarkup(createElement(SceneBackdropControls, props))}${renderToStaticMarkup(createElement(PrismFlightControls, {
    value: flight, onChange() {}, onLook() {}, meshLibrary: ['Star'], perChannel: true,
  }))}</aside>`;
  return readSpatialMenus(window.document as unknown as Document).flatMap(section => section.items);
};
let items = renderMenus(true, 'cinematic');
assert.equal(items.find(item => item.label === 'Starfield')!.active, false);
assert.equal(items.find(item => item.label === 'Cosmos backdrop')!.active, true);
assert.equal(items.find(item => item.label === 'Camera follow style')!.options.length, 4);
assert.equal(items.find(item => item.label === 'Camera musical energy')!.disabled, false);
items = renderMenus(false, 'cinematic');
assert.equal(items.find(item => item.label === 'Camera follow style')!.disabled, true);
assert.equal(items.find(item => item.label === 'Camera musical energy')!.disabled, true);
items = renderMenus(true, 'balanced');
assert.equal(items.find(item => item.label === 'Camera musical energy')!.disabled, true);
await window.happyDOM.close();
console.log('PASS: Mars assets, Cosmic Jelly landing, saved/share precedence, independent starfield/backdrop state, camera styles, and exact shared VR controls.');
