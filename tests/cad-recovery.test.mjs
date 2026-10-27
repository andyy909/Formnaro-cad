import test from 'node:test';
import assert from 'node:assert/strict';
import {createCadProject,serializeCadProject} from '../src/cad-project.js';
import {createCadRecovery,CAD_AUTOSAVE_KEY,CAD_LEGACY_AUTOSAVE_KEY} from '../src/cad-recovery.js';
import {createCadPersistence,CAD_LIBRARY_KEY,CAD_LEGACY_LIBRARY_KEY} from '../src/cad-persistence.js';
const fixture=()=>{const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)},recovery=createCadRecovery(storage);return {values,storage,recovery};};
test('Missing CAD7 autosave permits native-validated CAD5 recovery without changing old bytes',async()=>{
  const f=fixture(),old=serializeCadProject(createCadProject({name:'Old native model'}));f.values.set(CAD_LEGACY_AUTOSAVE_KEY,old);let verified=0;const result=await f.recovery.load(async p=>{verified++;return p;});assert.equal(result.name,'Old native model');assert.equal(verified,1);assert.equal(f.values.get(CAD_AUTOSAVE_KEY),undefined);f.recovery.write(serializeCadProject(result));assert.equal(f.values.get(CAD_LEGACY_AUTOSAVE_KEY),old);assert.equal(f.values.get(CAD_AUTOSAVE_KEY),old);
});
test('Corrupt new autosave never falls back or writes; corrupt old and native rejection also preserve both generations',async()=>{
  for(const mode of ['new','old','native']){const f=fixture(),old=serializeCadProject(createCadProject());f.values.set(CAD_LEGACY_AUTOSAVE_KEY,mode==='old'?'broken-old':old);if(mode==='new')f.values.set(CAD_AUTOSAVE_KEY,'broken-new');const before=new Map(f.values);await assert.rejects(f.recovery.load(async p=>{if(mode==='native')throw Error('invalid solid');return p;}));assert.equal(f.recovery.blocked(),true);assert.equal(f.recovery.write(old),false);assert.deepEqual(f.values,before);}
});
test('A previously verified recovery does not overwrite bytes corrupted later in the same session',async()=>{
  const f=fixture(),old=serializeCadProject(createCadProject());f.values.set(CAD_AUTOSAVE_KEY,old);await f.recovery.load(async p=>p);f.values.set(CAD_AUTOSAVE_KEY,'damaged-after-loading');assert.equal(f.recovery.write(old),false);assert.equal(f.recovery.blocked(),true);assert.equal(f.values.get(CAD_AUTOSAVE_KEY),'damaged-after-loading');
});
test('Legacy library migration verifies every native entry and preserves invalid or stale stores',async()=>{
  const project=createCadProject({nodes:[{id:'body',kind:'cad',name:'Source',source:'native',solid:true,transform:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],recipe:{type:'box',size:[10,10,10]},brep:{format:'OpenCascade-BRep',data:'storage-test-only',triangulation:false},stats:{bounds:{min:[-5,-5,-5],max:[5,5,5]},volume:1000,solids:1}}]});
  for(const invalid of [false,true]){const f=fixture(),old=JSON.stringify({format:'FormnaroCADLibrary',version:5,items:[{id:'old',name:'Existing',project}]}),persistence=createCadPersistence({storage:f.storage,transactions:{snapshot:()=>project,preview:()=>{}},verify:async p=>{if(invalid)throw Error('invalid BRep');return p;},makeId:()=> 'new'});f.values.set(CAD_LEGACY_LIBRARY_KEY,old);if(invalid)await assert.rejects(persistence.saveTemplate({name:'New',ids:['body']}),/invalid BRep/);else{await persistence.saveTemplate({name:'New',ids:['body']});assert.equal(persistence.listTemplates().length,2);assert.equal(JSON.parse(f.values.get(CAD_LIBRARY_KEY)).version,7);}assert.equal(f.values.get(CAD_LEGACY_LIBRARY_KEY),old);if(invalid)assert.equal(f.values.has(CAD_LIBRARY_KEY),false);f.values.set(CAD_LIBRARY_KEY,'broken-new');assert.throws(()=>persistence.listTemplates());assert.throws(()=>persistence.saveTemplate({name:'New',ids:['body']}));assert.equal(f.values.get(CAD_LIBRARY_KEY),'broken-new');}
});
