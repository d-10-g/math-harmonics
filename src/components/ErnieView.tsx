import { DEFAULT_NOTE_LAYOUT, type NoteLayoutSettings } from '../lib/noteLayout';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text, useGLTF } from '@react-three/drei';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import * as THREE from 'three';
import type { ParsedMidi } from '../lib/midi';
import { ernieCells, erniePose, ernieLayout, sampleErnie, type ErnieCell } from '../lib/ernie';
import { resolveChannel, type ModelAsset, type ModelKind, type ModelSettings, type BackgroundChoice, type ObjFinish } from '../lib/modelChannels';
import { loadMeshGroup, dressObjMaterials } from '../lib/meshLibrary';
import { createPhysicalMaterial } from '../lib/materials';
import type { WebGPULightingPreset, WebGPUMaterialProfile } from '../constants';
import { useXR } from '@react-three/xr';
import ModelBackdrop, { type HdriFile } from './ModelBackdrop';

type SlotProps={yaw?:number;cell:ErnieCell;position:[number,number,number];getTime:()=>number;settings:ModelSettings;display:'sounding'|'all';preview:boolean;asset:ModelAsset;movement?:string;dress?:(model:THREE.Object3D)=>THREE.MeshPhysicalMaterial[]};
// App material profiles for OBJ channels while the Output material profile is
// "auto": one per MIDI channel, the constellation's favourites first.
const STAGE_PROFILES:Exclude<WebGPUMaterialProfile,'auto'>[]=['pearl','glass','ruby','copper','ice','jade','chrome','obsidian','ceramic','plasma','liquid-metal','velvet','carbon','hologram','neon','xray'];
function GlbSlot(props:SlotProps){const gltf=useGLTF(props.asset.url);return <AnimatedSlot {...props} template={gltf.scene} clips={gltf.animations}/>;}
function ObjSlot({finish,profile,...props}:SlotProps&{finish:ObjFinish;profile:WebGPUMaterialProfile}){
 const [template,setTemplate]=useState<THREE.Group|null>(null),[failed,setFailed]=useState(false);
 useEffect(()=>{let alive=true;setTemplate(null);setFailed(false);void loadMeshGroup(props.asset.file.replace(/\.obj$/,'')).then(t=>{if(alive){setTemplate(t);setFailed(!t);}});return ()=>{alive=false;};},[props.asset.file]);
 // Stand-in MTLs (Blender debug green / default gray, or no MTL at all) are
 // dressed in the app's physical profiles; authored MTL colors stay unless the
 // finish says otherwise. Materials are per slot so each note can pulse its own.
 const channel=props.cell.channel;
 const dress=useCallback((model:THREE.Object3D)=>{
  const chosen=profile!=='auto'?profile:STAGE_PROFILES[channel%STAGE_PROFILES.length];
  return dressObjMaterials(model,finish,()=>{const m=createPhysicalMaterial(chosen,false);m.userData.baseEmissiveIntensity=m.emissiveIntensity;return m;});
 },[finish,profile,channel]);
 return template?<AnimatedSlot {...props} template={template} clips={[]} dress={dress}/>:<Text position={props.position} fontSize={.04}>{failed?'Model unavailable':'Loading…'}</Text>;
}
const NO_CLIPS:THREE.AnimationClip[]=[];
function AnimatedSlot({cell,position,yaw=0,getTime,settings,display,preview,template,clips=NO_CLIPS,movement,dress}:SlotProps&{template:THREE.Object3D;clips:THREE.AnimationClip[]}){
 const {model,dressed}=useMemo(()=>{const model=clone(template);return {model,dressed:dress?.(model)??[]};},[template,dress]);
 useEffect(()=>()=>dressed.forEach(m=>m.dispose()),[dressed]);
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
  // App materials glow with the note; MTL colors are the object's own.
  for(const m of dressed)m.emissiveIntensity=(m.userData.baseEmissiveIntensity as number)*(.6+1.4*p.weight);
 });
 const off=()=>{if(audition.current&&audition.current.off===null)audition.current.off=performance.now()/1000;};
 return <group ref={slot} position={position} rotation-y={yaw}>
  <group ref={body} onPointerDown={(e:any)=>{e.stopPropagation();e.target.setPointerCapture(e.pointerId);audition.current={start:performance.now()/1000,off:null};}} onPointerUp={off} onPointerCancel={off} onLostPointerCapture={off}>
   <group position={fit.offset} scale={fit.scale}><primitive object={model}/></group>
  </group>
  {settings.labels&&<Text position={[0,-.045,.20]} fontSize={.033} color="#93b3c5" anchorX="center">{`${['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][cell.pitch%12]}${Math.floor(cell.pitch/12)-1}`}</Text>}
 </group>;
}
export function ModelScene({midi,getMusicTime,kind,settings,display,background,hdri,onBackgroundError,spacing,noteLayout=DEFAULT_NOTE_LAYOUT,materialProfile='auto',lightingPreset='studio'}:{midi:ParsedMidi|null;getMusicTime:()=>{time:number;duration:number};kind:ModelKind;settings:ModelSettings;display:'sounding'|'all';background:BackgroundChoice;hdri:HdriFile|null;onBackgroundError:(s:string)=>void;spacing:number;noteLayout?:NoteLayoutSettings;materialProfile?:WebGPUMaterialProfile;lightingPreset?:WebGPULightingPreset}){
 const finish=settings.finish??'auto';
 const cells=useMemo(()=>ernieCells(midi?.notes.length?midi.notes:Array.from({length:32},(_,i)=>({channel:Math.floor(i/8),pitch:48+i%8,time:1e10,duration:1,velocity:96,track:0}))),[midi]);
 const layout=useMemo(()=>ernieLayout(cells,spacing,noteLayout),[cells,spacing,noteLayout]);
 const session=useXR(state=>state.session);
 return <>
   <Suspense fallback={<Text position={[0,1,-2]} fontSize={.05}>Loading 3D models…</Text>}>
    {!session && <FrameModels width={layout.width} depth={layout.depth} height={layout.height} solo={settings.solo}/>}
    {/* Mirror capture point at mid-model height (the dome offsets it behind
        the stage relative to the viewer). */}
    <ModelBackdrop choice={background} hdri={hdri} onError={onBackgroundError} center={[0,(settings.solo?.53:layout.height)/2+.1,0]} lighting={lightingPreset} environment={kind==='obj'&&finish!=='mtl'}/>
    <ambientLight intensity={.7}/><hemisphereLight args={['#e4f4ff','#414653',1.8]}/><directionalLight position={[3,6,4]} intensity={2.4}/><directionalLight position={[-3,2,-4]} intensity={1.5}/>
    <group scale={session ? settings.solo ? 1 : Math.min(1, 2.5/Math.max(layout.width,layout.height+.53,layout.depth)) : 1}>
    {(settings.solo?layout.items.slice(0,1):layout.items).map(({cell,position,copy,yaw})=>{const {asset,movement}=resolveChannel(settings,kind,cell.channel);if(!asset)return null;const key=`${cell.key}:${copy}:${asset.file}`,common={cell,asset,movement,yaw:settings.solo?0:yaw,position:(settings.solo?[0,0,0]:position) as [number,number,number],getTime:()=>getMusicTime().time,settings,display,preview:!midi};return kind==='glb'?<GlbSlot key={key} {...common}/>:<ObjSlot key={key} {...common} finish={finish} profile={materialProfile}/>;})}
    </group>
    {!session && <OrbitControls makeDefault target={[0,settings.solo?.2:layout.height/2,0]} minDistance={.3} maxDistance={250}/>}
  </Suspense>
 </>;
}

function FrameModels({width,depth,height,solo}:{width:number;depth:number;height:number;solo:boolean}){
 const {camera,size}=useThree();
 useEffect(()=>{
  if (camera instanceof THREE.PerspectiveCamera) { camera.fov=42; camera.near=.01; camera.far=300; }
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
export function PlaybackStatus({midi,getMusicTime}:{midi:ParsedMidi|null;getMusicTime:()=>{time:number;duration:number}}){const [status,setStatus]=useState('');useEffect(()=>{const id=window.setInterval(()=>{const {time}=getMusicTime(),sounding=midi?.notes.filter(n=>n.time<=time&&time<n.time+n.duration).length??0;setStatus(midi?`Score ${time.toFixed(1)}s · ${sounding} notes sounding`:'No MIDI score loaded');},150);return ()=>clearInterval(id);},[midi,getMusicTime]);return <div className="absolute bottom-8 left-4 text-xs text-cyan-500 pointer-events-none" role="status">{status}</div>;}
