import test from 'node:test';
import assert from 'node:assert/strict';
import loader from '../cad-kernel-build/runtime/formnaro_cad.js';
import {createCadProject,serializeCadProject,parseCadProject} from '../src/cad-project.js';
import {createCadService} from '../src/cad-service.js';
import {createCadCommandRouter} from '../src/cad-command-router.js';
import {createCadTransactions} from '../src/cad-transactions.js';
import {cadLinkedPatternProblems} from '../src/cad-linked-pattern-data.js';
import {createCadController} from '../src/cad-controller.js';
import {captureCadLinkedClipboard} from '../src/cad-linked-contours-clipboard.js';
import {encodeFnpackProject,createFnpackResolver} from '../src/cad-fnpack-data.js';
import {cadPoint} from '../src/cad-affine.js';
import {runFreeCADPlan} from '../src/cad-freecad.js';
import {updateCadProjectParameters} from '../src/cad-project-parameters-native.js';
import {cadEditFormRecipe} from '../src/cad-form-controls.js';

const oc=await loader({print:()=>{},printErr:()=>{}});
test('native linked pattern preview, apply, save and undo preserve exact sources',async()=>{
 const service=createCadService({oc});try{
  const source=service.nativeNode({type:'box',size:[10,10,10]},{id:'source'}),initial=await service.rebuild(createCadProject({nodes:[source]})),router=createCadCommandRouter({oc,service}),store=createCadTransactions({initial,build:async(project,context)=>context.operation?(await router.run(project,context.operation,{baseline:context.baseline})).project:service.rebuild(project,{baseline:context.baseline})});
  const pattern={version:1,id:'pattern',sourceId:'source',kind:'line',count:3,step:[20,0,0],excluded:[],instances:[]};
  const proposal=await store.preview({project:store.snapshot(),revision:store.revision(),operation:{kind:'linkedPattern',pattern}});assert.equal(store.snapshot().nodes.length,1);store.apply(proposal);
  const applied=store.snapshot();assert.equal(applied.version,27);assert.equal(applied.nodes.length,3);assert.deepEqual(cadLinkedPatternProblems(applied,applied.linkedPatterns.patterns[0]),[]);assert.deepEqual(parseCadProject(serializeCadProject(applied)).linkedPatterns,applied.linkedPatterns);
  const locked=structuredClone(applied);locked.layers[0].locked=true;await assert.rejects(()=>router.run(locked,{kind:'linkedPattern',pattern:locked.linkedPatterns.patterns[0]},{baseline:locked}),{code:'LOCKED_CAD_OBJECT'});
  const packed=encodeFnpackProject(applied),blocks=new Map(packed.blocks.map(b=>[b.sha256,b.bytes]));assert.deepEqual(cadLinkedPatternProblems(packed.project,packed.project.linkedPatterns.patterns[0]),[]);
  const hydrated=await createFnpackResolver({readBlock:async key=>blocks.get(key)}).hydrate(packed.project,packed.project.nodes.map(n=>n.id));assert.deepEqual(cadLinkedPatternProblems(hydrated,hydrated.linkedPatterns.patterns[0]),[]);
  store.undo();assert.equal(store.snapshot().nodes.length,1);store.redo();assert.equal(store.snapshot().nodes.length,3);
  const old=store.snapshot(),saved=old.linkedPatterns.patterns[0],newPattern={...saved,count:4};
  const second=await store.preview({project:store.snapshot(),revision:store.revision(),operation:{kind:'linkedPattern',pattern:newPattern}});store.apply(second);assert.equal(store.snapshot().nodes.length,4);assert.deepEqual(cadLinkedPatternProblems(store.snapshot(),store.snapshot().linkedPatterns.patterns[0]),[]);
  const beforeDetach=store.snapshot(),detachedId=beforeDetach.linkedPatterns.patterns[0].instances.find(i=>i.index===1).id;
  const detach=await store.preview({project:store.snapshot(),revision:store.revision(),operation:{kind:'linkedPatternDetachInstance',id:'pattern',index:1}});store.apply(detach);
  const independent=store.snapshot();assert.ok(independent.nodes.some(n=>n.id===detachedId));assert.ok(independent.linkedPatterns.patterns[0].excluded.includes(1));assert.deepEqual(cadLinkedPatternProblems(independent,independent.linkedPatterns.patterns[0]),[]);
  const edit=await store.preview({project:store.snapshot(),revision:store.revision(),operation:{kind:'linkedPattern',pattern:{...independent.linkedPatterns.patterns[0],step:[30,0,0]}}});store.apply(edit);
  assert.deepEqual(store.snapshot().nodes.find(n=>n.id===detachedId),independent.nodes.find(n=>n.id===detachedId));
  const stale=store.snapshot();stale.nodes.find(n=>n.id==='source').name='Changed';const linked=stale.linkedPatterns.patterns[0],linkedId=linked.instances.find(i=>!linked.excluded.includes(i.index)).id;
  const controller=createCadController({initial:stale,createWorker:()=>{throw Error('export guard must not start worker');}});try{
   for(const format of ['step','svg','drawing-pdf','drawing-svg','drawing-dxf'])assert.throws(()=>controller.assertExportReady({ids:[linkedId],format}),{code:'PATTERN_UPDATE_REQUIRED'});
   assert.doesNotThrow(()=>controller.assertExportReady({ids:[detachedId],format:'step'}));
  }finally{controller.dispose();}
  assert.throws(()=>captureCadLinkedClipboard(stale,[{rootId:linkedId,path:[]}]),{code:'PATTERN_UPDATE_REQUIRED'});
  await assert.rejects(()=>router.run(stale,{kind:'batch',commands:[{op:'duplicate',target:linkedId}]},{baseline:stale}),{code:'PATTERN_UPDATE_REQUIRED'});
  await assert.rejects(()=>router.run(stale,{kind:'batch',commands:[{op:'pattern',target:linkedId,kind:'line',count:2,step:[10,0,0]}]},{baseline:stale}),{code:'PATTERN_UPDATE_REQUIRED'});
  const confirmed=createCadController({initial:store.snapshot(),createWorker:()=>{throw Error('no worker');}});let exported=false,dispatched=false;
  try{
   assert.doesNotThrow(()=>confirmed.assertExportReady({ids:[linkedId],format:'step'}));
   await assert.rejects(()=>runFreeCADPlan({project:stale,operation:{kind:'inspect',plan:{version:1},inputs:[{name:'source',target:linkedId}]},desktop:{runFreeCADReply:async()=>{dispatched=true;return {ok:true};}},exportGeometry:async()=>{exported=true;return {data:'unexpected'};}}),{code:'PATTERN_UPDATE_REQUIRED'});
   assert.equal(exported,false);assert.equal(dispatched,false);
  }finally{confirmed.dispose();}
 }finally{service.dispose();}
});
test('native source geometry edits mark the pattern stale until a successful rebuild',async()=>{
 const service=createCadService({oc});try{
  const source=service.nativeNode({type:'box',size:[10,10,10]},{id:'source'}),initial=await service.rebuild(createCadProject({nodes:[source]})),router=createCadCommandRouter({oc,service});
  const pattern={version:1,id:'pattern',sourceId:'source',kind:'line',count:3,step:[20,0,0],excluded:[],instances:[]};
  const first=(await router.run(initial,{kind:'linkedPattern',pattern},{baseline:initial})).project,changed=structuredClone(first);changed.nodes.find(n=>n.id==='source').recipe.size[2]=20;
  const rebuilt=await service.rebuild(changed,{baseline:first});assert.equal(cadLinkedPatternProblems(rebuilt,rebuilt.linkedPatterns.patterns[0])[0].code,'PATTERN_UPDATE_REQUIRED');
  const updated=(await router.run(rebuilt,{kind:'linkedPattern',pattern:rebuilt.linkedPatterns.patterns[0]},{baseline:rebuilt})).project;assert.deepEqual(cadLinkedPatternProblems(updated,updated.linkedPatterns.patterns[0]),[]);
  for(const node of updated.nodes)assert.ok(Math.abs(node.stats.volume-2000)<1e-6);
 }finally{service.dispose();}
});
test('a changed or missing copy survives save/reopen and can be explicitly detached without changing other nodes',async()=>{
 const service=createCadService({oc});try{
  const initial=await service.rebuild(createCadProject({nodes:[service.nativeNode({type:'box',size:[10,10,10]},{id:'source'})]})),router=createCadCommandRouter({oc,service});
  const pattern={version:1,id:'pattern',sourceId:'source',kind:'line',count:3,step:[20,0,0],excluded:[],instances:[]};
  const first=(await router.run(initial,{kind:'linkedPattern',pattern},{baseline:initial})).project,copyId=first.linkedPatterns.patterns[0].instances[0].id;
  for(const action of ['changed','missing']){
   const stale=structuredClone(first);if(action==='changed')stale.nodes.find(n=>n.id===copyId).name='Benutzeränderung';else stale.nodes=stale.nodes.filter(n=>n.id!==copyId);
   const reopened=parseCadProject(serializeCadProject(stale)),store=createCadTransactions({initial:reopened,build:async(p,c)=>(await router.run(p,c.operation,{baseline:c.baseline})).project});
   const ctrl=createCadController({initial:reopened,createWorker:()=>{throw Error('no worker');}});try{assert.throws(()=>ctrl.assertExportReady({format:'step'}),{code:'PATTERN_UPDATE_REQUIRED'});}finally{ctrl.dispose();}
   await assert.rejects(()=>router.run(reopened,{kind:'linkedPatternDetach',id:'pattern'},{baseline:reopened}),{code:'PATTERN_UPDATE_REQUIRED'});
   const before=store.snapshot(),proposal=await store.preview({project:before,revision:store.revision(),operation:{kind:'linkedPatternDetach',id:'pattern',confirmConflict:true}});
   assert.deepEqual(store.snapshot(),before);store.apply(proposal);const after=store.snapshot();assert.deepEqual(after.nodes,before.nodes);assert.equal(after.linkedPatterns,undefined);
   const free=createCadController({initial:after,createWorker:()=>{throw Error('no worker');}});try{assert.doesNotThrow(()=>free.assertExportReady({format:'step'}));}finally{free.dispose();}
   store.undo();assert.deepEqual(store.snapshot(),before);
  }
 }finally{service.dispose();}
});
test('circle radius edit moves source and copies together in preview with undo',async()=>{
 const service=createCadService({oc});try{
  const initial=await service.rebuild(createCadProject({nodes:[service.nativeNode({type:'box',size:[2,2,2]},{id:'source'})]})),router=createCadCommandRouter({oc,service}),store=createCadTransactions({initial,build:async(p,c)=>(await router.run(p,c.operation,{baseline:c.baseline})).project});
  const pattern={version:1,id:'circle',sourceId:'source',kind:'circle',count:4,center:[0,0,0],radius:10,startAngle:0,angle:360,rotateCopies:false,excluded:[],instances:[]};
  const first=await store.preview({project:store.snapshot(),revision:store.revision(),operation:{kind:'linkedPattern',pattern}});store.apply(first);const before=store.snapshot();
  const center=n=>cadPoint(n.transform,n.stats.bounds.min.map((v,k)=>(v+n.stats.bounds.max[k])/2));
  assert.ok(Math.abs(center(before.nodes[0])[0]-10)<1e-7);
  const next={...before.linkedPatterns.patterns[0],radius:20},proposal=await store.preview({project:store.snapshot(),revision:store.revision(),operation:{kind:'linkedPattern',pattern:next}});
  assert.deepEqual(store.snapshot(),before);assert.ok(Math.abs(center(proposal.project.nodes[0])[0]-20)<1e-7);store.apply(proposal);
  for(const node of store.snapshot().nodes){const c=center(node);assert.ok(Math.abs(Math.hypot(c[0],c[1])-20)<1e-7);}
  store.undo();assert.deepEqual(store.snapshot(),before);
 }finally{service.dispose();}
});
test('project variant changes block export until bound pattern is updated and reopened',async()=>{
 const service=createCadService({oc});try{
  const params={version:1,parameters:[{id:'n',name:'Anzahl',value:3},{id:'d',name:'Abstand',value:20}],bindings:[],variants:[{id:'v',name:'Breiter',values:[{parameterId:'n',value:4},{parameterId:'d',value:30}],states:[]}],activeVariantId:null};
  const initial=await service.rebuild(createCadProject({nodes:[service.nativeNode({type:'box',size:[5,5,5]},{id:'source'})],projectParameters:params})),router=createCadCommandRouter({oc,service});
  const pattern={version:1,id:'pattern',sourceId:'source',kind:'line',count:3,step:[20,0,0],excluded:[],instances:[],bindings:[{field:'count',parameterId:'n'},{field:'step.0',parameterId:'d'}]};
  const first=(await router.run(initial,{kind:'linkedPattern',pattern},{baseline:initial})).project;assert.equal(first.nodes.length,3);
  const variant=(await updateCadProjectParameters(first,first.projectParameters,{service,editRecipe:(node,patch)=>cadEditFormRecipe(node,patch,{oc}),variantId:'v'})).project;
  assert.ok(cadLinkedPatternProblems(variant,variant.linkedPatterns.patterns[0]).some(v=>v.code==='PATTERN_UPDATE_REQUIRED'));
  const controller=createCadController({initial:variant,createWorker:()=>{throw Error('no worker');}});try{assert.throws(()=>controller.assertExportReady({format:'step'}),{code:'PATTERN_UPDATE_REQUIRED'});}finally{controller.dispose();}
  const updated=(await router.run(variant,{kind:'linkedPattern',pattern:variant.linkedPatterns.patterns[0]},{baseline:variant})).project;assert.equal(updated.nodes.length,4);assert.equal(updated.linkedPatterns.patterns[0].step[0],30);assert.deepEqual(cadLinkedPatternProblems(updated,updated.linkedPatterns.patterns[0]),[]);
  const reopened=parseCadProject(serializeCadProject(updated));assert.deepEqual(cadLinkedPatternProblems(reopened,reopened.linkedPatterns.patterns[0]),[]);
 }finally{service.dispose();}
});
