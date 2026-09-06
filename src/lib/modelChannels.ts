export type ModelKind='glb'|'obj';
export type Movement={name:string;clip:string};
export type ModelAsset={file:string;url:string;kind:ModelKind;movements:Movement[]};
import { MODEL_FILES, MODEL_MOVEMENTS } from './modelAssetManifest';
export const MODEL_ASSETS:ModelAsset[]=MODEL_FILES.map(file=>{
 const stem=file.replace(/\.[^.]+$/,'').replace(/_model$/,'');
 return {file,url:`./demo/meshes/${encodeURIComponent(file)}`,kind:file.endsWith('.glb')?'glb':'obj',movements:MODEL_MOVEMENTS[`${stem}_movements.json`]??[]};
});
export type ChannelChoice={asset?:string;movement?:string};
export type ModelSettings={seed:number;channels:Record<string,ChannelChoice>;labels:boolean;velocity:number;solo:boolean;movement:string};
export const defaultModelSettings=():ModelSettings=>({seed:Math.floor(Math.random()*0x7fffffff),channels:{},labels:true,velocity:96,solo:false,movement:'channel'});
function randomIndex(seed:number,channel:number,salt:number,length:number){let n=(seed+Math.imul(channel+1,0x9e3779b9)+salt)|0;n=Math.imul(n^(n>>>16),0x45d9f3b);return (n>>>0)%Math.max(1,length);}
export function resolveChannel(settings:ModelSettings,kind:ModelKind,channel:number){
 const pool=MODEL_ASSETS.filter(a=>a.kind===kind),choice=settings.channels[channel];
 const asset=pool.find(a=>a.file===choice?.asset)??pool[randomIndex(settings.seed,channel,17,pool.length)];
 const movement=choice?.movement && choice.movement!=='random'?choice.movement:asset?.movements[randomIndex(settings.seed,channel,971,asset.movements.length)]?.clip;
 return {asset,movement};
}
export function mappingDocument(name:string,kind:ModelKind,settings:ModelSettings,channels:number[]){return {schema:'3D_to_channel_mappings',version:1,name,kind,seed:settings.seed,channels:channels.map(channel=>{const r=resolveChannel(settings,kind,channel);return {channel:channel+1,asset:r.asset?.file,movement:(settings.movement!=='channel'&&r.asset?.movements.some(m=>m.clip===settings.movement)?settings.movement:r.movement)??null};})};}
export function parseMapping(value:unknown):{kind:ModelKind;channels:Record<string,ChannelChoice>;name:string;seed:number}{
 const v=value as any;if(v?.schema!=='3D_to_channel_mappings'||v.version!==1||!['glb','obj'].includes(v.kind)||!Array.isArray(v.channels)||!v.channels.length||v.channels.length>16)throw Error('Expected a version 1 3D_to_channel_mappings file.');
 const channels:Record<string,ChannelChoice>={};
 for(const row of v.channels){
  if(!Number.isInteger(row.channel)||row.channel<1||row.channel>16||channels[row.channel-1])throw Error('Channels must be unique numbers from 1 to 16.');
  const asset=MODEL_ASSETS.find(a=>a.file===row.asset&&a.kind===v.kind);if(!asset)throw Error(`Unavailable ${v.kind} asset: ${row.asset}`);
  if(row.movement!=null && (typeof row.movement!=='string'||!asset.movements.some(m=>m.clip===row.movement)))throw Error(`Unknown movement for ${asset.file}: ${row.movement}`);
  channels[row.channel-1]={asset:asset.file,movement:row.movement??undefined};
 }
 return {kind:v.kind,channels,seed:Number.isInteger(v.seed)&&v.seed>=0?v.seed:0,name:typeof v.name==='string'?v.name:'Imported'};
}
export type BackgroundChoice='cosmos'|'midnight'|'charcoal'|'slate'|'ivory'|'white'|'hdri';
export const BACKGROUNDS:Record<Exclude<BackgroundChoice,'hdri'>,string>={cosmos:'#090c1c',midnight:'#101a20',charcoal:'#24262b',slate:'#627684',ivory:'#ece8de',white:'#ffffff'};
