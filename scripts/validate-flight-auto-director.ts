import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMidi, type ParsedMidi, type MidiNote } from '../src/lib/midi';
import { FLIGHT_SHOWCASES, normalizeFlightEffects } from '../src/lib/flightEffects';
import {
  createFlightAutoPlan, sampleFlightAutoPlan, blendFlightAutoEffects,
  FLIGHT_AUTO_TRANSITION_SECONDS, FLIGHT_AUTO_MIN_SECTION_SECONDS, FLIGHT_AUTO_MAX_SECTION_SECONDS,
} from '../src/lib/flightAutoDirector';

const bytes = readFileSync('public/demo/library/mars.mid');
const mars = parseMidi(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const plan = createFlightAutoPlan(mars);
assert.deepEqual(plan, createFlightAutoPlan(mars), 'The same score creates the same complete performance');
assert(Object.isFrozen(plan) && Object.isFrozen(plan.sections) && plan.sections.every(Object.isFrozen));
assert.equal(plan.sections[0].scene, 'cosmic-jelly', 'The opening complements the current landing look');
assert.equal(plan.sections[0].camera, 'cinematic');
assert(plan.sections.length >= 9 && plan.sections.length <= 20, 'Mars has measured phrase changes, never per-beat preset flicker');
assert(new Set(plan.sections.map(section => section.scene)).size >= 5, 'A complete movement explores varied looks');
assert(new Set(plan.sections.map(section => section.camera)).size >= 3, 'A complete movement explores multiple camera styles');
const beats = new Set(mars.beats);
const ids = new Set(FLIGHT_SHOWCASES.map(scene => scene.id));
for (const [i, section] of plan.sections.entries()) {
  assert(ids.has(section.scene), `The director selects a real showcase: ${section.scene}`);
  assert(Number.isFinite(section.energy) && section.energy >= 0 && section.energy <= 1);
  assert(section.end > section.time);
  assert(section.end - section.time >= FLIGHT_AUTO_MIN_SECTION_SECONDS);
  assert(section.end - section.time <= FLIGHT_AUTO_MAX_SECTION_SECONDS);
  if (i) {
    assert.equal(section.time, plan.sections[i - 1].end, 'There are no gaps in the performance');
    assert.notEqual(section.scene, plan.sections[i - 1].scene, 'Adjacent phrases explore different looks');
    assert(beats.has(section.time), 'Mars transitions land on its actual variable-tempo quarter-note grid');
    const start = sampleFlightAutoPlan(plan, section.time);
    assert.equal(start.index, i);
    assert.equal(start.previous, plan.sections[i - 1]);
    assert.equal(start.blend, 0, 'A boundary begins at the preceding optical state');
    const halfway = sampleFlightAutoPlan(plan, section.time + FLIGHT_AUTO_TRANSITION_SECONDS / 2);
    assert(Math.abs(halfway.blend - 0.5) < 1e-10);
    assert.equal(sampleFlightAutoPlan(plan, section.time + FLIGHT_AUTO_TRANSITION_SECONDS).blend, 1);
  }
}
assert.equal(plan.sections.at(-1)!.end, mars.duration, 'The final phrase reaches the score ending');
const late = sampleFlightAutoPlan(plan, mars.duration - 10);
const early = sampleFlightAutoPlan(plan, 42.123);
assert.deepEqual(sampleFlightAutoPlan(plan, mars.duration - 10), late, 'Repeat samples do not advance state');
assert.deepEqual(sampleFlightAutoPlan(plan, 42.123), early, 'A backward seek restores the exact earlier transition');
assert.equal(sampleFlightAutoPlan(plan, -100).index, 0);
assert.equal(sampleFlightAutoPlan(plan, NaN).index, 0);
assert.equal(sampleFlightAutoPlan(plan, Infinity).index, 0);
assert.equal(sampleFlightAutoPlan(plan, mars.duration + 100).index, plan.sections.length - 1);

const note = (time: number, velocity: number, pitch = 60): MidiNote => ({ time, duration: 0.2, velocity, pitch, channel: 0, track: 0 });
const fixture = (velocity: number, dense: boolean): Pick<ParsedMidi, 'notes' | 'beats' | 'duration'> => ({
  notes: Array.from({ length: 240 }, (_, i) => Array.from({ length: dense ? 5 : 1 }, (_, chord) => note(i / 2, velocity, 60 + chord * 3))).flat(),
  // Explicit tempo change from half-second to one-second quarter notes.
  beats: Array.from({ length: 120 }, (_, i) => i / 2).concat(Array.from({ length: 61 }, (_, i) => 60 + i)), duration: 120,
});
const quiet = createFlightAutoPlan(fixture(18, false));
const loud = createFlightAutoPlan(fixture(126, true));
assert(loud.sections[1].energy > quiet.sections[1].energy + 0.3, 'Dynamics and chord activity materially influence the director');
assert.notEqual(loud.sections[1].scene, quiet.sections[1].scene, 'Quiet and intense phrases use different visual families');
assert.notEqual(loud.sections[1].camera, quiet.sections[1].camera, 'Energetic music invites a chase shot');
for (const score of [null, { notes: [], beats: [], duration: 3 }, { notes: [], beats: [], duration: NaN },
  { notes: [note(NaN, NaN), note(-3, 127)], beats: [NaN, -20, Infinity], duration: 100 }]) {
  const empty = createFlightAutoPlan(score);
  assert(empty.sections.length > 0);
  assert(Number.isFinite(empty.duration) && empty.duration > 0);
  for (const section of empty.sections) assert(Number.isFinite(section.time) && Number.isFinite(section.energy));
  assert(Number.isFinite(sampleFlightAutoPlan(empty, 0).blend));
}
for (let duration = 1; duration < 180; duration += 0.7) {
  const synthetic = createFlightAutoPlan({ notes: [], beats: [], duration });
  for (const section of synthetic.sections) {
    assert(section.end - section.time <= FLIGHT_AUTO_MAX_SECTION_SECONDS + 1e-8);
    if (synthetic.sections.length > 1) assert(section.end - section.time >= FLIGHT_AUTO_MIN_SECTION_SECONDS - 1e-8,
      'A score ending cannot leave a tiny final preset fragment');
  }
}

const from = normalizeFlightEffects({ auroras: 1.2, motion: 'helix', motionAmount: 1.5, morph: 0.2 });
const to = normalizeFlightEffects({ lasers: 1.7, motion: 'butterfly', motionAmount: 0.9, morph: 0.8 });
const originals = JSON.stringify([from, to]);
assert.deepEqual(blendFlightAutoEffects(from, to, 0), from);
assert.deepEqual(blendFlightAutoEffects(from, to, 1), to);
const mid = blendFlightAutoEffects(from, to, 0.5);
assert.equal(mid.motionAmount, 0, 'A different motion field changes only at a complete rest');
assert.equal(mid.motion, to.motion);
assert(Math.abs(mid.auroras - 0.6) < 1e-12 && Math.abs(mid.lasers - 0.85) < 1e-12,
  'Both optical layers coexist at the midpoint rather than cutting');
assert.equal(mid.morph, 0.5);
for (const blend of [0.49999, 0.50001]) assert(blendFlightAutoEffects(from, to, blend).motionAmount < 1e-8,
  'Motion remains continuous on both sides of the enum change');
const sameMotion = { ...to, motion: from.motion };
assert.equal(blendFlightAutoEffects(from, sameMotion, 0.5).motionAmount, 1.2, 'Unchanged fields continue moving during an optical dissolve');
assert.equal(JSON.stringify([from, to]), originals, 'Blending cannot mutate preset definitions');
assert.deepEqual(blendFlightAutoEffects(from, to, NaN), from);
assert.deepEqual(blendFlightAutoEffects(from, to, -10), from);
assert.deepEqual(blendFlightAutoEffects(from, to, 10), to);
console.log(`PASS: music-driven direction across ${plan.sections.length} Mars phrases; real tempo-grid boundaries, deterministic seek/pause, varied looks/shots, dynamics response, bounded pacing and continuous six-second optical/motion dissolves.`);
