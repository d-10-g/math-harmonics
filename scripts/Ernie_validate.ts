import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ernieCells, ernieLayout, erniePose, sampleErnie, ERNIE_MOVEMENTS } from '../src/lib/ernie';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { AnimationMixer, Bone } from 'three';
import { parseMidi } from '../src/lib/midi';
const n=(time:number,duration:number,velocity=127,channel=0,pitch=60)=>({time,duration,velocity,channel,pitch,track:0});
const cells=ernieCells([n(1,2),n(1.5,.1,64),n(1,1,80,1)]);
assert.equal(cells.length,2,'channel identities must not merge');
assert.equal(sampleErnie(cells[0],0).weight,0);
assert.equal(sampleErnie(cells[0],1.55).weight,Math.pow(64/127,.7));
assert.equal(sampleErnie(cells[0],1.8).weight,1,'earlier held voice resumes');
assert.ok(Math.abs(sampleErnie(cells[0],3.08).weight-.5)<1e-9);
assert.equal(sampleErnie(cells[0],3.2).weight,0);
assert.deepEqual(sampleErnie(cells[0],1.8),sampleErnie(cells[0],1.8),'absolute time is stable on pause/seek');
assert.equal(ernieCells([n(0,1),{...n(0,1),track:2}]).length,1,'tracks sharing channel/pitch share a cat');
// Short musical notes must reach a visible pose before note-off.
for(const duration of [.025,.06,.1,.2]) {
 const p=erniePose(n(0,duration,100),duration*.55);
 assert.ok(p.phase>=.45 && p.weight>.75,'short note reaches its accent');
}
assert.ok(erniePose(n(0,.1,127),.055).weight>erniePose(n(0,.1,32),.055).weight*2);
const grid=ernieLayout(ernieCells([...Array.from({length:25},(_,i)=>n(0,1,100,0,40+i)),n(0,1,100,1,60)]));
assert.equal(new Set(grid.items.filter(i=>i.cell.channel===0).map(i=>i.position[2])).size,1,'a long channel never wraps');
assert.equal(grid.items.find(i=>i.cell.channel===1)!.position[0],0,'single-note channel centers independently');
assert.ok(grid.items.find(i=>i.cell.channel===1)!.position[1]>0,'successive channels rise');
assert.ok(grid.items.find(i=>i.cell.channel===1)!.position[2]<grid.items[0].position[2],'successive channels step back');
assert.ok(Math.abs(grid.items[1].position[0]-grid.items[0].position[0]-.28)<1e-9,'compact note spacing');
// Parse actual exported geometry, skeletons and animations in Three. Exclude
// image decoding only: this Node check does not have a browser image API.
const assetName=process.argv[2]??'Ernie';
assert.ok(['Ernie','Kira'].includes(assetName));
const file=fs.readFileSync(`public/demo/meshes/${assetName}_model.glb`);
const manifest=JSON.parse(fs.readFileSync(`public/demo/meshes/${assetName}_movements.json`,'utf8'));
const size=file.readUInt32LE(12);const json=JSON.parse(file.subarray(20,20+size).toString());
assert.equal(json.animations.length,32);
assert.deepEqual(new Set(json.animations.map(a=>a.name)),new Set(manifest.map(m=>m.clip)));
for(const m of manifest){const anim=json.animations.find(a=>a.name===m.clip);assert.ok(anim);}
assert.ok(json.skins.length>0);
assert.ok(json.meshes[0].primitives[0].attributes.TEXCOORD_0!==undefined);
for(const m of json.materials){if(m.pbrMetallicRoughness)delete m.pbrMetallicRoughness.baseColorTexture;}
json.images=[];json.textures=[];
const j=Buffer.from(JSON.stringify(json));const pad=Buffer.alloc(Math.ceil(j.length/4)*4,32);j.copy(pad);
const bin=file.subarray(20+size);const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(20+pad.length+bin.length,8);header.writeUInt32LE(pad.length,12);header.writeUInt32LE(0x4e4f534a,16);
const buffer=Buffer.concat([header,pad,bin]);const gltf=await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),'');
const a=clone(gltf.scene),b=clone(gltf.scene);const mixer=new AnimationMixer(a);
const signature=(root:any)=>{const values:number[]=[];root.traverse((o:any)=>{if(o instanceof Bone)values.push(...o.quaternion.toArray(),...o.scale.toArray());});return values;};
const rest=signature(a);assert.deepEqual(rest,signature(b));
for(const clip of gltf.animations){
 const action=mixer.clipAction(clip);action.play();action.time=clip.duration*.5;mixer.update(0);
 assert.notDeepEqual(signature(a),rest,`${clip.name} must deform the skeleton`);
 assert.deepEqual(signature(b),rest,'another cat remains still');
 action.setEffectiveWeight(0);mixer.update(0);assert.deepEqual(signature(a),rest,`${clip.name} returns to rest at zero weight`);action.stop();
}
// Simulate StrictMode setup-cleanup-setup and movement/score remounts.
for(let i=0;i<4;i++) {
 const mountedMixer=new AnimationMixer(a),action=mountedMixer.clipAction(gltf.animations[i]);
 action.play();action.time=.5;mountedMixer.update(0);assert.notDeepEqual(signature(a),rest);
 action.stop();mountedMixer.uncacheRoot(a);assert.deepEqual(signature(a),rest);
}
// Drive the actual exported rigs from a real short-note score, not auditions.
const scoreBytes=fs.readFileSync('public/demo/library/bjspreii.mid');
const score=parseMidi(scoreBytes.buffer.slice(scoreBytes.byteOffset,scoreBytes.byteOffset+scoreBytes.byteLength));
let moved=0;
for(const cell of ernieCells(score.notes)) {
 const note=cell.notes[0],p=sampleErnie(cell,note.time+Math.min(.08,note.duration*.55));
 const playbackMixer=new AnimationMixer(a),clip=[...gltf.animations].sort((a,b)=>a.name.localeCompare(b.name))[cell.movement];
 const action=playbackMixer.clipAction(clip).play();action.time=p.phase*clip.duration;action.setEffectiveWeight(p.weight);playbackMixer.update(0);
 if(signature(a).some((v,i)=>Math.abs(v-rest[i])>.01))moved++;
 action.stop();playbackMixer.uncacheRoot(a);
}
assert.ok(moved>20,`${moved} real-score cells visibly deform`);
assert.equal(ERNIE_MOVEMENTS.length,32);
console.log(assetName, 'PASS: 32 exported clips deform independently; UVs/skin present; channel identity, overlapping note-on/off, velocity, release and seek sampling.');
