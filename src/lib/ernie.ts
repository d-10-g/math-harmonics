import type { MidiNote } from './midi';

export const ERNIE_MOVEMENTS = [
  'Head nod', 'Look left', 'Look right', 'Head tilt left', 'Head tilt right', 'Chin lift', 'Sniff', 'Meow',
  'Left ear flick', 'Right ear flick', 'Ears perk', 'Ears relax', 'Left paw tap', 'Right paw tap',
  'Left paw lift', 'Right paw lift', 'Left paw reach', 'Right paw reach', 'Knead left', 'Knead right',
  'Back left step', 'Back right step', 'Back left toe', 'Back right toe', 'Tail left', 'Tail right',
  'Tail tip curl', 'Tail ripple', 'Shoulder sway', 'Blink', 'Wink left', 'Wink right',
];
export const ERNIE_RELEASE = .16;
export type ErnieCell = { key: string; channel: number; pitch: number; notes: MidiNote[]; prefixEnd: number[]; movement: number };
export function ernieCells(notes: MidiNote[]): ErnieCell[] {
  const cells = new Map<string, ErnieCell>();
  for (const n of notes) {
    const key = `${n.channel}:${n.pitch}`;
    if (!cells.has(key)) cells.set(key, { key, channel: n.channel, pitch: n.pitch, notes: [], prefixEnd: [], movement: (n.pitch + n.channel * 7) % 32 });
    cells.get(key)!.notes.push(n);
  }
  return [...cells.values()].sort((a, b) => a.channel - b.channel || a.pitch - b.pitch).map(c => {
    c.notes.sort((a,b) => a.time-b.time);
    let end = -Infinity;
    c.prefixEnd = c.notes.map(n => end = Math.max(end, n.time+n.duration+ERNIE_RELEASE));
    return c;
  });
}
// Absolute score time makes seek, pause and loops deterministic. Latest sounding
// retrigger wins; an earlier overlapping voice resumes after it ends.
export function sampleErnie(cell: ErnieCell, time: number) {
  let lo=0, hi=cell.notes.length;
  while(lo<hi) { const mid=(lo+hi)>>>1; if(cell.notes[mid].time<=time) lo=mid+1; else hi=mid; }
  let release: MidiNote | undefined;
  for(let i=lo-1;i>=0 && cell.prefixEnd[i]>time;i--) {
    const n=cell.notes[i];
    if(time<n.time+n.duration) return erniePose(n,time);
    if(!release && time<n.time+n.duration+ERNIE_RELEASE) release=n;
  }
  return release ? erniePose(release,time) : { phase:0, weight:0 };
}
// Reach the gesture peak inside short notes; held notes repeat at a slower
// cadence after the initial accent. Release freezes phase and blends to rest.
export function erniePose(n: MidiNote,time: number) {
  const age=Math.max(0,time-n.time), held=Math.min(age,n.duration);
  const v=Math.max(0,Math.min(1,n.velocity/127));
  const attack=Math.min(.025,Math.max(.001,n.duration*.25));
  const peakTime=Math.max(.001,Math.min(.16,n.duration*.55));
  const phase=held<=peakTime ? .5*held/peakTime : (.5+(held-peakTime)*(.9+.7*v))%1;
  const weight=Math.pow(v,.7)*Math.min(1,age/attack)*Math.max(0,1-Math.max(0,age-n.duration)/ERNIE_RELEASE);
  return {phase,weight};
}

// Compact centered rows: note rank within each channel, not global pitch.
export function ernieLayout(cells: ErnieCell[], spacing=1) {
  const channels=[...new Set(cells.map(c=>c.channel))].sort((a,b)=>a-b);
  const rows=channels.map(channel=>cells.filter(c=>c.channel===channel).sort((a,b)=>a.pitch-b.pitch));
  return {width:Math.max(1,...rows.map(row=>row.length*.28*spacing)),depth:Math.max(.8,channels.length*.62),height:Math.max(0,(channels.length-1)*.14),
    items:rows.flatMap((row,r)=>row.map((cell,i)=>({cell,position:[(i-(row.length-1)/2)*.28*spacing,r*.14,((channels.length-1)/2-r)*.62] as [number,number,number]}))),
  };
}
