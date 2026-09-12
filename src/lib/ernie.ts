import { copyRotation, rotateCopyPosition, channelPath, copyOffset, DEFAULT_NOTE_LAYOUT, normalizeNoteLayout, type NoteLayoutSettings } from './noteLayout';
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

// Score-ranked channel paths and repeated layers preserve MIDI identity.
export function ernieLayout(cells: ErnieCell[], spacing=1, settings: NoteLayoutSettings=DEFAULT_NOTE_LAYOUT) {
  const { geometry, copies, offset, rotation } = normalizeNoteLayout(settings);
  const channels=[...new Set(cells.map(c=>c.channel))].sort((a,b)=>a-b);
  const rows=channels.map(channel=>cells.filter(c=>c.channel===channel).sort((a,b)=>a.pitch-b.pitch));
  const items = rows.flatMap((row,r)=>row.flatMap((cell,i)=>{
    const path = channelPath(i,row.length,.28*spacing,geometry);
    const position: [number,number,number] = geometry === 'linear'
      ? [path[0],r*.14,((channels.length-1)/2-r)*.62]
      : [path[0],path[1]+r*.75*spacing,path[2]];
    return Array.from({length:copies},(_,copy)=>{
      const yaw=copyRotation(copy,rotation);
      const rotated=rotateCopyPosition(position,yaw);
      rotated[1]+=copyOffset(copy,copies,offset,.75);
      return {cell,copy,yaw,position:rotated};
    });
  }));
  // Preserve the original linear framing. Other layouts are centered in X/Z
  // and grounded in Y so the camera and XR fit use the actual full bounds.
  if(geometry==='linear' && copies===1) return {width:Math.max(1,...rows.map(row=>row.length*.28*spacing)),depth:Math.max(.8,channels.length*.62),height:Math.max(0,(channels.length-1)*.14),items};
  const min=[0,1,2].map(axis=>items.length?Math.min(...items.map(item=>item.position[axis])):0);
  const max=[0,1,2].map(axis=>items.length?Math.max(...items.map(item=>item.position[axis])):0);
  for(const item of items){item.position[0]-=(min[0]+max[0])/2;item.position[1]-=min[1];item.position[2]-=(min[2]+max[2])/2;}
  // Rotated models can be wider than their unrotated footprint. Include the
  // maximum rotated extent in camera/XR framing without changing old layouts.
  const rotated = rotation !== 0 && copies > 1;
  const widthPad = rotated ? Math.max(...items.map(item=>Math.abs(Math.cos(item.yaw))*.28+Math.abs(Math.sin(item.yaw))*.8),.28) : .28;
  const depthPad = rotated ? Math.max(...items.map(item=>Math.abs(Math.sin(item.yaw))*.28+Math.abs(Math.cos(item.yaw))*.8),.62) : .62;
  return {width:Math.max(1,max[0]-min[0]+widthPad),height:max[1]-min[1],depth:Math.max(.8,max[2]-min[2]+depthPad),items};
}
