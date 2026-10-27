import {MIXED_AUTOSAVE_KEY} from '../src/cad-recovery.js';
// Storage/transaction behavior only. The geometry validator is injected here;
// geometric BRep acceptance is covered by the real CAD service/gate suites.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCadProject,serializeCadProject,cadProjectSnapshot} from '../src/cad-project.js';
import {createCadTransactions} from '../src/cad-transactions.js';
import {cadIdentity} from '../src/cad-affine.js';
import {createCadPersistence,CAD_AUTOSAVE_KEY,MIXED_LIBRARY_KEY,CAD_LIBRARY_KEY,CAD_LEGACY_AUTOSAVE_KEY,CAD_LEGACY_LIBRARY_KEY} from '../src/cad-persistence.js';
function fixture(verify=async p=>p){
  const node={id:'body',kind:'cad',name:'Source',source:'native',solid:true,transform:cadIdentity(),recipe:{type:'box',size:[10,10,10]},brep:{format:'OpenCascade-BRep',data:'BRep-placeholder-for-storage-only',triangulation:false},stats:{bounds:{min:[-5,-5,-5],max:[5,5,5]},volume:1000,solids:1}},initial=createCadProject({nodes:[node]}),transactions=createCadTransactions({initial,build:async p=>p}),values=new Map(),reads=[],writes=[];let fail=false,count=0;
  const storage={getItem:key=>(reads.push(key),values.get(key)??null),setItem:(key,value)=>{if(fail)throw Error('disk failed');writes.push(key);values.set(key,value);}};
  return {initial,transactions,values,reads,writes,setFail:value=>fail=value,persistence:createCadPersistence({storage,transactions,verify,makeId:()=>`new-${++count}`})};
}

test('CAD7 storage and validated CAD5 fallback remain separate from legacy mesh data',async()=>{
  const f=fixture();for(const key of ['offlinecad-autosave-v4','offlinecad-autosave-v3','offlinecad-library-v1'])f.values.set(key,'old immutable model data');const before=new Map(f.values);
  assert.equal(await f.persistence.readAutosave(),null);assert.deepEqual(f.persistence.listTemplates(),[]);f.persistence.autosave();f.persistence.saveTemplate({name:'CAD Teil',ids:['body']});
  for(const [key,value] of before)assert.equal(f.values.get(key),value);assert.ok(f.reads.every(key=>[MIXED_AUTOSAVE_KEY,CAD_AUTOSAVE_KEY,MIXED_LIBRARY_KEY,CAD_LIBRARY_KEY,CAD_LEGACY_AUTOSAVE_KEY,CAD_LEGACY_LIBRARY_KEY].includes(key)));assert.deepEqual(f.writes,[CAD_AUTOSAVE_KEY,CAD_LIBRARY_KEY]);assert.equal(JSON.parse(f.values.get(CAD_AUTOSAVE_KEY)).version,5);
  await assert.rejects(f.persistence.importLibrary(JSON.stringify({format:'OfflineCADLibrary',version:1,items:[]})),/Version 5/);
});

test('Autosave captures the confirmed state during preview, after Abort and across disk errors',async()=>{
  const f=fixture(),draft=f.transactions.snapshot();draft.nodes[0].name='Preview';const preview=await f.transactions.preview({revision:f.transactions.revision(),project:draft});f.persistence.autosave();assert.equal(JSON.parse(f.values.get(CAD_AUTOSAVE_KEY)).nodes[0].name,'Source');
  f.transactions.apply(preview);f.persistence.autosave();assert.equal(JSON.parse(f.values.get(CAD_AUTOSAVE_KEY)).nodes[0].name,'Preview');const saved=f.values.get(CAD_AUTOSAVE_KEY);f.setFail(true);assert.throws(()=>f.persistence.autosave(),/disk failed/);assert.equal(f.values.get(CAD_AUTOSAVE_KEY),saved);assert.equal(f.transactions.snapshot().nodes[0].name,'Preview');
  f.values.set(CAD_AUTOSAVE_KEY,'corrupt');await assert.rejects(f.persistence.readAutosave());assert.equal(f.values.get(CAD_AUTOSAVE_KEY),'corrupt');
});

test('Autosave uses confirmed transaction serialization without copying or rehashing the project',()=>{
  const f=fixture(),revision=f.transactions.revision(),encoded=f.transactions.serialize();
  const transactions={...f.transactions,snapshot:()=>{throw Error('Unexpected full-model copy');}},persistence=createCadPersistence({storage:{getItem:()=>null,setItem:(key,value)=>{assert.equal(key,CAD_AUTOSAVE_KEY);assert.equal(value,encoded);}},transactions,verify:async p=>p});
  assert.deepEqual(persistence.autosave(),{revision});
  const legacy={snapshot:f.transactions.snapshot,preview:f.transactions.preview},values=new Map(),fallback=createCadPersistence({storage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)},transactions:legacy,verify:async p=>p});
  assert.deepEqual(fallback.autosave(),{revision});assert.equal(values.get(CAD_AUTOSAVE_KEY),encoded);
});

test('A template is verified and copied with new source IDs through the same atomic preview/apply/undo',async()=>{
  let checks=0;const f=fixture(async p=>(checks++,p)),template=f.persistence.saveTemplate({name:'CAD Teil',ids:['body']}),before=f.transactions.snapshot(),preview=await f.persistence.previewTemplate({id:template.id,revision:f.transactions.revision()});assert.equal(checks,1);assert.deepEqual(f.transactions.snapshot(),before);
  const applied=f.transactions.apply(preview);assert.equal(applied.project.nodes.length,2);assert.notEqual(applied.project.nodes[1].id,'body');assert.deepEqual(applied.project.nodes[1].recipe,before.nodes[0].recipe);assert.equal(f.transactions.state().undo,1);f.transactions.undo();assert.deepEqual(f.transactions.snapshot(),before);
  const copy=f.persistence.listTemplates();copy[0].project.nodes[0].name='foreign mutation';assert.equal(f.persistence.listTemplates()[0].project.nodes[0].name,'Source');
});

test('Rejected or concurrent library imports preserve stored CAD templates and confirmed history',async()=>{
  let reject=false;const f=fixture(async p=>{if(reject)throw Error('invalid BRep');return p;});f.persistence.saveTemplate({name:'CAD Teil',ids:['body']});const saved=f.values.get(CAD_LIBRARY_KEY),before=f.transactions.snapshot();reject=true;await assert.rejects(f.persistence.importLibrary(saved),/invalid BRep/);assert.equal(f.values.get(CAD_LIBRARY_KEY),saved);assert.deepEqual(f.transactions.snapshot(),before);
  let resume;const blocked=fixture(async p=>{await new Promise(resolve=>resume=resolve);return p;});blocked.persistence.saveTemplate({name:'CAD Teil',ids:['body']});const pending=blocked.persistence.importLibrary(blocked.persistence.exportLibrary());blocked.persistence.saveTemplate({name:'Second',ids:['body']});resume();await assert.rejects(pending,{code:'STALE_LIBRARY'});assert.equal(blocked.persistence.listTemplates().length,2);
});
