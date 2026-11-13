import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { MidiControlSampler, notesWithSustain, parseMidi, SustainMap } from '../src/lib/midi';
import { ernieCells, sampleErnie } from '../src/lib/ernie';

const near = (actual: number, expected: number) => assert(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const vlq = (value: number) => {
  const bytes = [value & 127];
  while ((value >>>= 7)) bytes.unshift((value & 127) | 128);
  return bytes;
};
const event = (delta: number, ...bytes: number[]) => [...vlq(delta), ...bytes];
const track = (...events: number[][]) => {
  const body = events.flat();
  return [0x4d, 0x54, 0x72, 0x6b, ...u32(body.length), ...body];
};
const file = (chunks: number[][], count = chunks.length, format = count === 1 ? 0 : 1) => Uint8Array.from([
  0x4d, 0x54, 0x68, 0x64, ...u32(6), 0, format, count >>> 8, count & 255, 1, 224, ...chunks.flat()
]).buffer;
const end = (delta = 0) => event(delta, 0xff, 0x2f, 0);

// A final long-held note must fit the path table and score duration.
const long = parseMidi(file([track(event(0, 0x90, 60, 100), event(7680, 0x80, 60, 0), end())]));
near(long.duration, 8);
near(long.notes[0].duration, 8);
assert.equal(long.beats.length, 17);

// End-of-track delta time carries real trailing silence, even with no later notes.
const trailingRest = parseMidi(file([track(event(0, 0x90, 60, 100), event(480, 0x80, 60, 0), end(3360))]));
near(trailingRest.duration, 4);
assert.equal(trailingRest.beats.length, 9);

// Default 120 BPM remains the initial tempo when a later change starts at beat one.
const changing = parseMidi(file([track(
  event(0, 0x90, 60, 100), event(480, 0xff, 0x51, 3, 0x0f, 0x42, 0x40),
  event(480, 0x80, 60, 0), end()
)]));
assert.equal(changing.bpm, 120);
near(changing.notes[0].duration, 1.5);
assert.deepEqual(changing.beats, [0, 0.5, 1.5]);

// Running status, velocity-zero release and overlapping repeated notes retain identity.
const repeated = parseMidi(file([track(
  event(0, 0x92, 60, 96), event(240, 60, 80), event(240, 60, 0), event(240, 60, 0), end()
)]));
assert.equal(repeated.notes.length, 2);
near(repeated.notes[0].duration, 0.5);
near(repeated.notes[1].duration, 0.5);
assert.equal(repeated.notes[1].channel, 2);

// Unknown chunks do not count as one of the declared musical tracks.
const unknown = [0x4a, 0x55, 0x4e, 0x4b, ...u32(3), 1, 2, 3];
assert.equal(parseMidi(file([unknown, track(end())], 1)).trackCount, 1);

// Bounds must be enforced per chunk, so malformed events cannot consume the next track.
assert.throws(() => parseMidi(new ArrayBuffer(2)), /Truncated MIDI/);
assert.throws(() => parseMidi(file([track(event(0, 0x90, 60))])), /Truncated MIDI/);
assert.throws(() => parseMidi(file([track(end())], 2)), /missing track/);
assert.throws(() => parseMidi(file([track([0x81, 0x80, 0x80, 0x80, 0])])), /four bytes/);
assert.throws(() => parseMidi(file([track(event(0, 0x90, 60, 0xff))])), /data byte/);
assert.throws(() => parseMidi(file([track(event(0, 0xff, 0x51, 3, 0, 0, 0), end())])), /tempo/);
assert.throws(() => parseMidi(file([track(end())], 1, 2)), /independent sequences/);
const truncatedChunk = new Uint8Array(file([track(end())]));
truncatedChunk[21] = 127;
assert.throws(() => parseMidi(truncatedChunk.buffer), /track extends/);

// Controller and pedal state rewind deterministically along with a score seek.
const controls = [
  { time: 0.2, channel: 2, kind: 'sustain' as const, value: 1 },
  { time: 0.4, channel: 2, kind: 'expression' as const, value: 0.4 },
  { time: 2, channel: 2, kind: 'sustain' as const, value: 0 }
];
const sampler = new MidiControlSampler(controls);
near(sampler.at(1)[2].expression, 0.4);
near(sampler.at(0.1)[2].expression, 1);
const sustain = new SustainMap(controls);
near(sustain.holdUntil(2, 0.5, 1), 1.5);
near(sustain.holdUntil(2, 1.5, 1), 2);
near(sustain.holdUntil(2, 2, 1), 2);
const continuousPedal = new SustainMap([
  { time: 0, channel: 0, kind: 'sustain', value: 1 },
  { time: 0.5, channel: 0, kind: 'sustain', value: 0.8 },
  { time: 1, channel: 0, kind: 'sustain', value: 0.6 },
  { time: 1.5, channel: 0, kind: 'sustain', value: 0 },
  { time: 2, channel: 0, kind: 'sustain', value: 1 }
]);
near(continuousPedal.holdUntil(0, 0.25, 2), 1.5);
near(continuousPedal.holdUntil(0, 1.75, 2), 1.75);
near(continuousPedal.holdUntil(0, 2.25, 1), 3.25);
const releasedNote = { time: 0, duration: 0.5, pitch: 60, velocity: 96, channel: 2, track: 0 };
const sustained = notesWithSustain({ notes: [releasedNote], controls });
near(releasedNote.duration, 0.5);
near(sustained[0].duration, 1.7);
const cells = ernieCells(sustained);
assert(sampleErnie(cells[0], 1).weight > 0, 'Model animation stays active while the pedal holds the note');
assert.equal(sampleErnie(cells[0], 2).weight, 0, 'Bounded pedal hold releases the model');

let libraryCount = 0;
for (const name of readdirSync('public/demo/library').filter(name => /\.midi?$/i.test(name))) {
  const bytes = readFileSync(`public/demo/library/${name}`);
  const midi = parseMidi(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  assert(Number.isFinite(midi.duration) && midi.duration >= 0, name);
  assert(midi.notes.every(note => Number.isFinite(note.time) && Number.isFinite(note.duration) && note.duration > 0), name);
  libraryCount++;
}
console.log(`PASS: MIDI duration, trailing rests, tempo changes, running status, overlapping notes, malformed chunk bounds, controller rewind, sustain, and ${libraryCount} library scores.`);
