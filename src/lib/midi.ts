// Minimal Standard MIDI File parser: extracts note-on events (time, pitch,
// velocity, track, channel), the tempo map, and a quarter-note beat grid in
// seconds. This is the ground truth the audio-reactive system runs on in
// MIDI mode — no beat-detection guesswork.

export type MidiNote = {
  time: number; // seconds
  duration: number; // seconds (note-off matched; fallback when unterminated)
  pitch: number;
  velocity: number; // 1-127
  track: number;
  channel: number;
};

export type ParsedMidi = {
  notes: MidiNote[];
  beats: number[]; // quarter-note grid, seconds
  duration: number; // seconds
  bpm: number; // initial tempo
  trackCount: number;
  // First program (instrument patch) seen per MIDI channel, and the General
  // MIDI name for display. Channel 9 is percussion by convention.
  programs: Record<number, number>;
};

const GM_FAMILIES = [
  'Piano', 'Piano', 'Piano', 'Piano', 'Piano', 'Piano', 'Harpsichord', 'Clavinet',
  'Celesta', 'Glockenspiel', 'Music Box', 'Vibraphone', 'Marimba', 'Xylophone', 'Tubular Bells', 'Dulcimer',
  'Organ', 'Organ', 'Organ', 'Organ', 'Reed Organ', 'Accordion', 'Harmonica', 'Tango Accordion',
  'Nylon Guitar', 'Steel Guitar', 'Jazz Guitar', 'Clean Guitar', 'Muted Guitar', 'Overdrive Guitar', 'Distortion Guitar', 'Guitar Harmonics',
  'Acoustic Bass', 'Finger Bass', 'Pick Bass', 'Fretless Bass', 'Slap Bass', 'Slap Bass', 'Synth Bass', 'Synth Bass',
  'Violin', 'Viola', 'Cello', 'Contrabass', 'Tremolo Strings', 'Pizzicato', 'Harp', 'Timpani',
  'Strings', 'Strings', 'Synth Strings', 'Synth Strings', 'Choir Aahs', 'Voice Oohs', 'Synth Voice', 'Orchestra Hit',
  'Trumpet', 'Trombone', 'Tuba', 'Muted Trumpet', 'French Horn', 'Brass', 'Synth Brass', 'Synth Brass',
  'Soprano Sax', 'Alto Sax', 'Tenor Sax', 'Baritone Sax', 'Oboe', 'English Horn', 'Bassoon', 'Clarinet',
  'Piccolo', 'Flute', 'Recorder', 'Pan Flute', 'Blown Bottle', 'Shakuhachi', 'Whistle', 'Ocarina',
  'Square Lead', 'Saw Lead', 'Calliope', 'Chiff Lead', 'Charang', 'Voice Lead', 'Fifths Lead', 'Bass Lead',
  'New Age Pad', 'Warm Pad', 'Polysynth', 'Choir Pad', 'Bowed Pad', 'Metallic Pad', 'Halo Pad', 'Sweep Pad',
  'Rain FX', 'Soundtrack', 'Crystal', 'Atmosphere', 'Brightness', 'Goblins', 'Echoes', 'Sci-Fi',
  'Sitar', 'Banjo', 'Shamisen', 'Koto', 'Kalimba', 'Bagpipe', 'Fiddle', 'Shanai',
  'Tinkle Bell', 'Agogo', 'Steel Drums', 'Woodblock', 'Taiko', 'Melodic Tom', 'Synth Drum', 'Reverse Cymbal',
  'Fret Noise', 'Breath Noise', 'Seashore', 'Bird Tweet', 'Telephone', 'Helicopter', 'Applause', 'Gunshot'
];

export function gmInstrumentName(channel: number, program: number | undefined): string {
  if (channel === 9) return 'Drums';
  return GM_FAMILIES[program ?? 0] ?? 'Instrument';
}

class Reader {
  private view: DataView;
  offset = 0;

  constructor(buffer: ArrayBuffer, start: number, private end: number) {
    this.view = new DataView(buffer);
    this.offset = start;
  }

  get done() {
    return this.offset >= this.end;
  }

  u8() {
    return this.view.getUint8(this.offset++);
  }

  peek() {
    return this.view.getUint8(this.offset);
  }

  u16() {
    const value = this.view.getUint16(this.offset);
    this.offset += 2;
    return value;
  }

  u32() {
    const value = this.view.getUint32(this.offset);
    this.offset += 4;
    return value;
  }

  vlq() {
    let value = 0;
    for (let i = 0; i < 4; i++) {
      const byte = this.u8();
      value = (value << 7) | (byte & 0x7f);
      if ((byte & 0x80) === 0) break;
    }
    return value;
  }

  skip(count: number) {
    this.offset += count;
  }
}

export function parseMidi(buffer: ArrayBuffer): ParsedMidi {
  const header = new Reader(buffer, 0, buffer.byteLength);
  if (header.u32() !== 0x4d546864) throw new Error('Not a MIDI file (missing MThd)');
  const headerLength = header.u32();
  header.u16(); // format
  const trackCount = header.u16();
  const division = header.u16();
  if (division & 0x8000) throw new Error('SMPTE time division is not supported');
  const ticksPerBeat = division || 480;

  type RawNote = { tick: number; durTick: number; pitch: number; velocity: number; track: number; channel: number };
  const rawNotes: RawNote[] = [];
  // Open notes awaiting their note-off, keyed by track:channel:pitch. A stack
  // per key handles (rare) re-struck pitches before the first release.
  const openNotes = new Map<string, number[]>();
  const programs: Record<number, number> = {};
  const tempoEvents: Array<{ tick: number; usPerBeat: number }> = [];
  let maxTick = 0;

  let cursor = 8 + headerLength;
  for (let trackIndex = 0; trackIndex < trackCount; trackIndex++) {
    const view = new DataView(buffer);
    if (cursor + 8 > buffer.byteLength) break;
    const chunkType = view.getUint32(cursor);
    const chunkLength = view.getUint32(cursor + 4);
    const bodyStart = cursor + 8;
    cursor = bodyStart + chunkLength;
    if (chunkType !== 0x4d54726b) continue; // not MTrk

    const reader = new Reader(buffer, bodyStart, bodyStart + chunkLength);
    let tick = 0;
    let runningStatus = 0;

    while (!reader.done) {
      tick += reader.vlq();
      if (reader.done) break;

      let status = reader.peek();
      if (status & 0x80) {
        reader.skip(1);
        if (status < 0xf0) runningStatus = status;
      } else {
        status = runningStatus;
        if (!status) throw new Error('Corrupt MIDI: data byte with no running status');
      }

      if (status === 0xff) {
        const metaType = reader.u8();
        const length = reader.vlq();
        if (metaType === 0x51 && length === 3) {
          const usPerBeat = (reader.u8() << 16) | (reader.u8() << 8) | reader.u8();
          tempoEvents.push({ tick, usPerBeat });
        } else {
          reader.skip(length);
          if (metaType === 0x2f) break; // end of track
        }
      } else if (status === 0xf0 || status === 0xf7) {
        reader.skip(reader.vlq());
      } else {
        const kind = status & 0xf0;
        const channel = status & 0x0f;
        if (kind === 0xc0) {
          const program = reader.u8();
          if (programs[channel] === undefined) programs[channel] = program;
        } else if (kind === 0xd0) {
          reader.skip(1);
        } else {
          const data1 = reader.u8();
          const data2 = reader.u8();
          if (kind === 0x90 && data2 > 0) {
            const key = `${trackIndex}:${channel}:${data1}`;
            let stack = openNotes.get(key);
            if (!stack) openNotes.set(key, (stack = []));
            stack.push(rawNotes.length);
            rawNotes.push({ tick, durTick: 0, pitch: data1, velocity: data2, track: trackIndex, channel });
          } else if (kind === 0x80 || (kind === 0x90 && data2 === 0)) {
            const stack = openNotes.get(`${trackIndex}:${channel}:${data1}`);
            const noteIndex = stack?.shift();
            if (noteIndex !== undefined) rawNotes[noteIndex].durTick = tick - rawNotes[noteIndex].tick;
          }
        }
      }
      if (tick > maxTick) maxTick = tick;
    }
  }

  // Ticks -> seconds via the tempo map (default 120 BPM before first event).
  tempoEvents.sort((a, b) => a.tick - b.tick);
  const segments: Array<{ tick: number; time: number; usPerBeat: number }> = [];
  let currentUs = 500000;
  let segmentTick = 0;
  let segmentTime = 0;
  segments.push({ tick: 0, time: 0, usPerBeat: currentUs });
  for (const event of tempoEvents) {
    segmentTime += ((event.tick - segmentTick) / ticksPerBeat) * (currentUs / 1e6);
    segmentTick = event.tick;
    currentUs = event.usPerBeat;
    segments.push({ tick: segmentTick, time: segmentTime, usPerBeat: currentUs });
  }

  const tickToSeconds = (tick: number) => {
    let segment = segments[0];
    for (const candidate of segments) {
      if (candidate.tick <= tick) segment = candidate;
      else break;
    }
    return segment.time + ((tick - segment.tick) / ticksPerBeat) * (segment.usPerBeat / 1e6);
  };

  const notes = rawNotes
    .map((raw) => {
      const time = tickToSeconds(raw.tick);
      // Unterminated notes (no matching note-off) get half a second.
      const duration = raw.durTick > 0
        ? Math.max(0.05, tickToSeconds(raw.tick + raw.durTick) - time)
        : 0.5;
      return {
        time,
        duration,
        pitch: raw.pitch,
        velocity: raw.velocity,
        track: raw.track,
        channel: raw.channel
      };
    })
    .sort((a, b) => a.time - b.time);

  const beats: number[] = [];
  for (let tick = 0; tick <= maxTick; tick += ticksPerBeat) {
    beats.push(tickToSeconds(tick));
  }

  const duration = (notes.length ? notes[notes.length - 1].time : 0) + 2;
  const bpm = Math.round(60e6 / (tempoEvents[0]?.usPerBeat ?? 500000));

  return { notes, beats, duration, bpm, trackCount, programs };
}
