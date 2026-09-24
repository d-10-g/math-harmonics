import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { BACKGROUNDS, type BackgroundChoice } from '../lib/modelChannels';
import { buildRigEnvironmentScene, disposeEnvironmentScene } from '../lib/environments';
import type { WebGPULightingPreset } from '../constants';
import MirrorDome from './MirrorDome';
export type HdriFile={url:string;name:string};
export default function ModelBackdrop({choice,hdri,onError,center=[0,0,0],lighting='studio',environment=false}:{choice:BackgroundChoice;hdri:HdriFile|null;onError:(s:string)=>void;center?:[number,number,number];lighting?:WebGPULightingPreset;environment?:boolean}){
 const {scene,gl}=useThree();
 useEffect(()=>{
  let disposed=false;let texture:THREE.Texture|undefined,target:THREE.WebGLRenderTarget|undefined;
  scene.background=new THREE.Color(choice==='hdri'?'#101a20':BACKGROUNDS[choice]);
  if(choice==='hdri'&&hdri){
   const loader=hdri.name.toLowerCase().endsWith('.exr')?new EXRLoader():new RGBELoader();
   loader.load(hdri.url,t=>{if(disposed){t.dispose();return;}texture=t;t.mapping=THREE.EquirectangularReflectionMapping;const pmrem=new THREE.PMREMGenerator(gl);target=pmrem.fromEquirectangular(t);pmrem.dispose();scene.environment=target.texture;scene.background=t;onError('');},undefined,()=>{if(!disposed)onError('Could not load this HDRI. Choose a valid equirectangular .hdr or .exr image.');});
  }
  return ()=>{disposed=true;if(choice==='hdri')scene.environment=null;scene.background=null;texture?.dispose();target?.dispose();};
 },[choice,hdri,scene,gl,onError]);
 // Rig-lit stage: the app's physical profiles (glass, chrome, pearl…) need an
 // environment to reflect. The HDRI choice supplies its own.
 useEffect(()=>{
  if(!environment||choice==='hdri')return;
  const pmrem=new THREE.PMREMGenerator(gl);const envScene=buildRigEnvironmentScene(lighting);const texture=pmrem.fromScene(envScene,.04).texture;
  scene.environment=texture;scene.environmentIntensity=.7;
  return ()=>{if(scene.environment===texture)scene.environment=null;scene.environmentIntensity=1;texture.dispose();pmrem.dispose();disposeEnvironmentScene(envScene);};
 },[environment,choice,lighting,scene,gl]);
 if(choice==='cosmos')return <Stars radius={70} depth={30} count={1400} factor={3} fade speed={0}/>;
 // The dome lives inside the stage wrapper, so it follows XR drag/scale; its
 // capture point sits mid-stage height, just behind the models.
 if(choice==='mirror')return <MirrorDome radius={150} xrRadius={9} center={center} captureOffset={.8}/>;
 return null;
}
