import assert from 'node:assert/strict';
import {MODEL_ASSETS,defaultModelSettings,resolveChannel,mappingDocument,parseMapping} from '../src/lib/modelChannels';
const settings=defaultModelSettings();settings.seed=1234;
assert.ok(MODEL_ASSETS.some(a=>a.file==='Kira_model.glb'));
assert.equal(MODEL_ASSETS.find(a=>a.file==='Kira_model.glb')!.movements.length,32);
assert.equal(MODEL_ASSETS.find(a=>a.file==='Ernie_model.glb')!.movements.length,32);
for(const kind of ['glb','obj'] as const){
 const doc=mappingDocument('Pavane',kind,settings,[0,3,15]);
 const loaded=parseMapping(JSON.parse(JSON.stringify(doc)));
 for(const channel of [0,3,15])assert.deepEqual(resolveChannel(settings,kind,channel),resolveChannel({...settings,seed:loaded.seed,channels:loaded.channels},kind,channel),'resolved choices survive save/load');
 assert.throws(()=>parseMapping({...doc,channels:[doc.channels[0],doc.channels[0]]}));
 assert.throws(()=>parseMapping({...doc,channels:[{channel:17,asset:doc.channels[0].asset}]}));
 assert.throws(()=>parseMapping({...doc,channels:[{channel:1,asset:'missing.glb'}]}));
}
settings.channels[0]={asset:'Ernie_model.glb'};
settings.movement='01_Head_nod';
assert.equal(mappingDocument('Override','glb',settings,[0]).channels[0].movement,'01_Head_nod');
assert.throws(()=>parseMapping({...mappingDocument('Bad','glb',settings,[0]),channels:[{channel:1,asset:'Ernie_model.glb',movement:'unknown'}]}));
const kiraDoc=mappingDocument('Kira','glb',{...settings,channels:{0:{asset:'Kira_model.glb',movement:'Kira_20_Groom_left_paw'}},movement:'channel'},[0]);
assert.equal(parseMapping(kiraDoc).channels[0].movement,'Kira_20_Groom_left_paw');
console.log('PASS: catalog, deterministic per-channel choice, exact JSON round trips, override exports, malformed mappings.');
