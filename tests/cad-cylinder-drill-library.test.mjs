import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import loader from '../cad-kernel-build/runtime/formnaro_cad.js';
import {createCadProject,parseCadProject,serializeCadProject} from '../src/cad-project.js';
import {createCadService} from '../src/cad-service.js';
import {createCadTransactions} from '../src/cad-transactions.js';
import {createCadToolsNative} from '../src/cad-tools-native.js';
import {createCadPersistence} from '../src/cad-persistence.js';
import {encodeFnpackProject,createFnpackResolver,materializedFnpackProject} from '../src/cad-fnpack-data.js';
import {openFnpack,writeFnpack} from '../backend/fnpack.cjs';
const oc=await loader({print:()=>{},printErr:()=>{}});
test('native cylinder bore survives library v28 remap, OCAD and physical FNPACK roundtrip',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'formnaro-drill-v28-'));t.after(async()=>{assert.equal(path.dirname(dir),os.tmpdir());assert.ok(path.basename(dir).startsWith('formnaro-drill-v28-'));await fs.rm(dir,{recursive:true,force:true});});
 const service=createCadService({oc});try{
  const cylinder=service.nativeNode({type:'cylinder',size:[30,30,10]},{id:'cylinder'}),initial=await service.rebuild(createCadProject({nodes:[cylinder]})),store=createCadTransactions({initial,build:(p,c)=>service.rebuild(p,{baseline:c.baseline})}),tools=createCadToolsNative({oc,service,transactions:store});
  store.apply(await tools.previewDrill({id:'cylinder',resultId:'drilled',reference:{ray:{origin:[0,0,30],direction:[0,0,-1]}},associative:true,diameter:4,revision:store.revision()}));
  const before=store.snapshot();assert.equal(before.version,28);assert.equal(before.nodes[0].drill.version,2);assert.deepEqual(parseCadProject(serializeCadProject(before)),before);
  const values=new Map();let serial=0;const persistence=createCadPersistence({storage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)},transactions:store,verify:p=>service.rebuild(p),makeId:()=>`copy-${++serial}`});
  const entry=persistence.saveTemplate({id:'template',name:'Zylinder',ids:['drilled']}),encoded=persistence.exportLibrary();assert.equal(entry.project.version,28);assert.equal(JSON.parse(encoded).version,28);const wrong=JSON.parse(encoded);wrong.version=27;await assert.rejects(()=>persistence.importLibrary(JSON.stringify(wrong)),/Bibliotheksversion 28/);assert.equal(persistence.exportLibrary(),encoded);
  const proposal=await persistence.previewTemplate({id:'template',revision:store.revision()});assert.deepEqual(store.snapshot(),before);store.apply(proposal);const after=store.snapshot(),copy=after.nodes[1];assert.notEqual(copy.id,'drilled');assert.equal(copy.drill.version,2);assert.equal(copy.drill.sourceId,copy.children[0].id);assert.equal(copy.drill.boxId,copy.children[0].id);assert.notEqual(copy.children[0].id,'cylinder');assert.ok(Math.abs(copy.stats.volume-before.nodes[0].stats.volume)<1e-6);store.undo();assert.deepEqual(store.snapshot(),before);store.redo();assert.deepEqual(store.snapshot(),after);
  const packed=encodeFnpackProject(after),file=path.join(dir,'cylinder.fnpack');await writeFnpack(file,{project:packed.project,blocks:packed.blocks});const opened=await openFnpack(file);try{const hydrated=await createFnpackResolver({readBlock:sha=>opened.read(sha)}).hydrate(opened.index.project,null);assert.deepEqual(materializedFnpackProject(hydrated),after);const rebuilt=await service.rebuild(hydrated);assert.deepEqual(materializedFnpackProject(rebuilt),after);}finally{await opened.close();}
 }finally{service.dispose();}
});
