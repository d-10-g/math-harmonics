import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text, useGLTF } from '@react-three/drei';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import * as THREE from 'three';
import type { ParsedMidi } from '../lib/midi';
import { ernieCells, erniePose, ernieLayout, sampleErnie, type ErnieCell } from '../lib/ernie';
import { resolveChannel, type ModelAsset, type ModelKind, type ModelSettings, type BackgroundChoice } from '../lib/modelChannels';
import { loadMeshGroup } from '../lib/meshLibrary';
import ModelBackdrop, { type HdriFile } from './ModelBackdrop';

type SlotProps={cell:ErnieCell;position:[number,number,number];getTime:()=>number;settings:ModelSettings;display:'sounding'|'all';preview:boolean;asset:ModelAsset;movement?:string};
function GlbSlot(props:SlotProps){const gltf=useGLTF(props.asset.url);return <AnimatedSlot {...props} template={gltf.scene} clips={gltf.animations}/>;}
function ObjSlot(props:SlotProps){
 const [template,setTemplate]=useState<THREE.Group|null>(null),[failed,setFailed]=useState(false);
 useEffect(()=>{let alive=true;setTemplate(null);setFailed(false);void loadMeshGroup(props.asset.file.replace(/\.obj$/,'')).then(t=>{if(alive){setTemplate(t);setFailed(!t);}});return ()=>{alive=false;};},[props.asset.file]);
 return template?<AnimatedSlot {...props} template={template} clips={[]}/>:<Text position={props.position} fontSize={.04}>{failed?'Model unavailable':'Loading…'}</Text>;
}
const NO_CLIPS:THREE.AnimationClip[]=[];
function AnimatedSlot({cell,position,getTime,settings,display,preview,template,clips=NO_CLIPS,movement}:SlotProps&{template:THREE.Object3D;clips:THREE.AnimationClip[]}){
 const model=useMemo(()=>clone(template),[template]);
 const fit=useMemo(()=>{const box=new THREE.Box3().setFromObject(model);const size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());const scale=Math.min(.25/Math.max(size.x,.001),.8/Math.max(size.z,.001),.53/Math.max(size.y,.001));return {scale,offset:[-center.x*scale,-box.min.y*scale,-center.z*scale] as [number,number,number]};},[model]);
 const clip=useMemo(()=>clips.find(c=>c.name===(settings.movement==='channel'?movement:settings.movement))??clips[(cell.channel+settings.seed)%Math.max(1,clips.length)],[clips,movement,settings.movement,settings.seed,cell.channel]);
 const player=useRef<{mixer:THREE.AnimationMixer;action:THREE.AnimationAction}|null>(null),slot=useRef<THREE.Group>(null),body=useRef<THREE.Group>(null);
 const audition=useRef<{start:number;off:number|null}|null>(null);
 useEffect(()=>{if(!clip)return;const mixer=new THREE.AnimationMixer(model),action=mixer.clipAction(clip);action.play();player.current={mixer,action};return ()=>{player.current=null;action.stop();mixer.uncacheRoot(model);};},[model,clip]);
 useEffect(()=>()=>{model.traverse(o=>{if((o as THREE.SkinnedMesh).isSkinnedMesh)(o as THREE.SkinnedMesh).skeleton.dispose();});},[model]);
 useFrame(()=>{
  let p=sampleErnie(cell,getTime());
  if(audition.current){const now=performance.now()/1000,a=audition.current,end=a.off??now;p=erniePose({time:a.start,duration:3600,velocity:settings.velocity,pitch:cell.pitch,channel:cell.channel,track:0},end);p.weight*=Math.max(0,1-(now-end)/.16);if(a.off!==null&&now-a.off>.16)audition.current=null;}
  if(slot.current)slot.current.visible=display==='all'||preview||p.weight>0;
  if(player.current){const {action,mixer}=player.current;action.enabled=true;action.setEffectiveWeight(p.weight);action.time=p.phase*clip!.duration;mixer.update(0);}
  else if(body.current)body.current.scale.setScalar(1+.12*p.weight);
 });
 const off=()=>{if(audition.current&&audition.current.off===null)audition.current.off=performance.now()/1000;};
 return <group ref={slot} position={position}>
  <group ref={body} onPointerDown={(e:any)=>{e.stopPropagation();e.target.setPointerCapture(e.pointerId);audition.current={start:performance.now()/1000,off:null};}} onPointerUp={off} onPointerCancel={off} onLostPointerCapture={off}>
   <group position={fit.offset} scale={fit.scale}><primitive object={model}/></group>
  </group>
  {settings.labels&&<Text position={[0,-.045,.20]} fontSize={.033} color="#93b3c5" anchorX="center">{`${['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][cell.pitch%12]}${Math.floor(cell.pitch/12)-1}`}</Text>}
 </group>;
}
export default function ErnieView({midi,getMusicTime,kind,settings,display,background,hdri,onBackgroundError,spacing}:{midi:ParsedMidi|null;getMusicTime:()=>{time:number;duration:number};kind:ModelKind;settings:ModelSettings;display:'sounding'|'all';background:BackgroundChoice;hdri:HdriFile|null;onBackgroundError:(s:string)=>void;spacing:number}){
 const cells=useMemo(()=>ernieCells(midi?.notes.length?midi.notes:Array.from({length:32},(_,i)=>({channel:Math.floor(i/8),pitch:48+i%8,time:1e10,duration:1,velocity:96,track:0}))),[midi]);
 const layout=useMemo(()=>ernieLayout(cells,spacing),[cells,spacing]);
 return <div className="absolute inset-0 bg-slate-950">
  <Suspense fallback={<div className="p-8 text-white/60">Loading 3D models…</div>}>
   <Canvas camera={{position:[1,1,1.6],fov:42,near:.01,far:300}} gl={{preserveDrawingBuffer:true}} dpr={[1,1.5]}>
    <FrameModels width={layout.width} depth={layout.depth} height={layout.height} solo={settings.solo}/>
    <ModelBackdrop choice={background} hdri={hdri} onError={onBackgroundError}/>
    <ambientLight intensity={.7}/><hemisphereLight args={['#e4f4ff','#414653',1.8]}/><directionalLight position={[3,6,4]} intensity={2.4}/><directionalLight position={[-3,2,-4]} intensity={1.5}/>
    {(settings.solo?layout.items.slice(0,1):layout.items).map(({cell,position})=>{const {asset,movement}=resolveChannel(settings,kind,cell.channel);if(!asset)return null;const Slot=kind==='glb'?GlbSlot:ObjSlot;return <Slot key={`${cell.key}:${asset.file}`} cell={cell} asset={asset} movement={movement} position={settings.solo?[0,0,0]:position} getTime={()=>getMusicTime().time} settings={settings} display={display} preview={!midi} />;})}
    <OrbitControls makeDefault target={[0,settings.solo?.2:layout.height/2,0]} minDistance={.3} maxDistance={250}/>
   </Canvas>
  </Suspense>
  <PlaybackStatus midi={midi} getMusicTime={getMusicTime}/>
  {!midi&&<div className="absolute bottom-3 left-4 text-xs text-slate-400">Audition grid · load a MIDI score for playback</div>}
 </div>;
}
function FrameModels({width,depth,height,solo}:{width:number;depth:number;height:number;solo:boolean}){
 const {camera,size}=useThree();
 useEffect(()=>{
  const aspect=size.width/Math.max(1,size.height),tan=Math.tan(THREE.MathUtils.degToRad(42)/2);
  const direction=new THREE.Vector3(0,.45,.89).normalize(),up=new THREE.Vector3(0,direction.z,-direction.y);
  let distance=0;
  for(const y of [-(height+.65)/2,(height+.65)/2])for(const z of [-(depth+.35)/2,(depth+.35)/2]){
    const corner=new THREE.Vector3(0,y,z);
    distance=Math.max(distance,corner.dot(direction)+Math.max(width/2/(tan*aspect),Math.abs(corner.dot(up))/tan));
  }
  const target=new THREE.Vector3(0,solo?.2:height/2+.24,0);
  if(solo)camera.position.set(.8,.65,1.2);else camera.position.copy(target).addScaledVector(direction,Math.max(1.8,distance*1.12));
  camera.lookAt(target);camera.updateProjectionMatrix();
 },[camera,width,depth,height,solo,size.width,size.height]);return null;
}
function PlaybackStatus({midi,getMusicTime}:{midi:ParsedMidi|null;getMusicTime:()=>{time:number;duration:number}}){const [status,setStatus]=useState('');useEffect(()=>{const id=window.setInterval(()=>{const {time}=getMusicTime(),sounding=midi?.notes.filter(n=>n.time<=time&&time<n.time+n.duration).length??0;setStatus(midi?`Score ${time.toFixed(1)}s · ${sounding} notes sounding`:'No MIDI score loaded');},150);return ()=>clearInterval(id);},[midi,getMusicTime]);return <div className="absolute bottom-8 left-4 text-xs text-cyan-500 pointer-events-none" role="status">{status}</div>;}
