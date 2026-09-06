import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { BACKGROUNDS, type BackgroundChoice } from '../lib/modelChannels';
export type HdriFile={url:string;name:string};
export default function ModelBackdrop({choice,hdri,onError}:{choice:BackgroundChoice;hdri:HdriFile|null;onError:(s:string)=>void}){
 const {scene,gl}=useThree();
 useEffect(()=>{
  let disposed=false;let texture:THREE.Texture|undefined,target:THREE.WebGLRenderTarget|undefined;
  scene.background=new THREE.Color(choice==='hdri'?'#101a20':BACKGROUNDS[choice]);
  if(choice==='hdri'&&hdri){
   const loader=hdri.name.toLowerCase().endsWith('.exr')?new EXRLoader():new RGBELoader();
   loader.load(hdri.url,t=>{if(disposed){t.dispose();return;}texture=t;t.mapping=THREE.EquirectangularReflectionMapping;const pmrem=new THREE.PMREMGenerator(gl);target=pmrem.fromEquirectangular(t);pmrem.dispose();scene.environment=target.texture;scene.background=t;onError('');},undefined,()=>{if(!disposed)onError('Could not load this HDRI. Choose a valid equirectangular .hdr or .exr image.');});
  }
  return ()=>{disposed=true;scene.environment=null;scene.background=null;texture?.dispose();target?.dispose();};
 },[choice,hdri,scene,gl,onError]);
 return choice==='cosmos'?<Stars radius={70} depth={30} count={1400} factor={3} fade speed={0}/>:null;
}
