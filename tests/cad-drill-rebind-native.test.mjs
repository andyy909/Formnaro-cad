import test from 'node:test';
import assert from 'node:assert/strict';
import loader from '../cad-kernel-build/runtime/formnaro_cad.js';
import {createCadService} from '../src/cad-service.js';
import {createCadProject,parseCadProject,serializeCadProject} from '../src/cad-project.js';
import {createCadTransactions} from '../src/cad-transactions.js';
import {createCadToolsNative} from '../src/cad-tools-native.js';
import {createCadCommandRouter} from '../src/cad-command-router.js';
import {cadClassifyPoint} from '../src/cad-native-kernel.js';
import {encodeFnpackProject,createFnpackResolver,stripGeometryIdentity} from '../src/cad-fnpack-data.js';

const oc=await loader({print:()=>{},printErr:()=>{}});
const top=x=>({ray:{origin:[x,0,30],direction:[0,0,-1]}}),bottom=x=>({ray:{origin:[x,0,-30],direction:[0,0,1]}});
async function fixture({step=false,cylinder=false,plane=false}={}){
 const service=createCadService({oc});
 const native=service.nativeNode({type:cylinder?'cylinder':'box',size:cylinder?[40,40,8]:[40,20,8]},{id:'base'});
 const base=step?service.stepNode(service.exportStep(createCadProject({nodes:[native]})),{id:'base'}):native;
 const spare=service.nativeNode({type:'box',size:[2,2,2]},{id:'spare'});spare.transform[12]=60;
 const build=(p,c)=>service.rebuild(p,{baseline:c.baseline}),store=createCadTransactions({initial:createCadProject({nodes:[base,spare]}),build}),tools=createCadToolsNative({oc,service,transactions:store});
 store.apply(await tools.previewDrill({id:'base',resultId:'first',associative:true,kind:'counterbore',diameter:4,headDiameter:6,headDepth:1,reference:top(-8),...(plane?{termination:'plane',stopReference:bottom(-8)}:{}),revision:store.revision()}));
 store.apply(await tools.previewDrill({id:'first',resultId:'second',associative:true,diameter:4,reference:top(8),revision:store.revision()}));
 return {service,store,tools,build};
}
const choices=()=>[{path:['first'],reference:bottom(-8)},{path:[],reference:bottom(8)}];

test('two native bores reassign together, preserve sources, save and undo as one edit',async()=>{
 const f=await fixture();try{
  const before=f.store.snapshot(),preview=await f.tools.previewRebindDrills({id:'second',bindings:choices(),revision:f.store.revision()});
  assert.deepEqual(f.store.snapshot(),before);assert.equal(preview.project.nodes[0].drill.feature,'box-face-bottom');assert.equal(preview.project.nodes[0].children[0].drill.feature,'box-face-bottom');
  assert.deepEqual(preview.project.nodes[0].children[0].children[0],before.nodes[0].children[0].children[0]);assert.deepEqual(preview.project.nodes[1],before.nodes[1]);
  assert.ok(Math.abs(preview.project.nodes[0].stats.volume-(6400-69*Math.PI))<1e-5);
  const shape=f.service.worldShape(preview.project.nodes[0]);try{assert.equal(cadClassifyPoint(oc,shape,[-10.5,0,-3.5]),'outside');assert.equal(cadClassifyPoint(oc,shape,[-10.5,0,3.5]),'inside');}finally{shape.delete();}
  const depth=f.store.state().undo;f.store.apply(preview);assert.equal(f.store.state().undo,depth+1);const after=f.store.snapshot();
  f.store.undo();assert.deepEqual(f.store.snapshot(),before);f.store.redo();assert.deepEqual(f.store.snapshot(),after);
  assert.deepEqual(await f.service.rebuild(parseCadProject(serializeCadProject(after))),after);
  const pack=encodeFnpackProject(after),blocks=new Map(pack.blocks.map(b=>[b.sha256,b.bytes])),loaded=await createFnpackResolver({readBlock:async h=>blocks.get(h)}).hydrate(pack.project);assert.deepEqual(stripGeometryIdentity(loaded),after);
 }finally{f.service.dispose();}
});

test('all broken STEP identities must be rebound before any dependent bore can build',async()=>{
 const f=await fixture({step:true});try{
  const lost=f.store.snapshot();lost.nodes[0].drill.faceKey='0'.repeat(64);lost.nodes[0].children[0].drill.faceKey='1'.repeat(64);
  const store=createCadTransactions({initial:lost,build:f.build}),tools=createCadToolsNative({oc,service:f.service,transactions:store});
  await assert.rejects(()=>tools.previewRebindDrills({id:'second',bindings:[choices()[0]],revision:store.revision()}),/STEP-Fläche|mehrdeutig/);
  assert.deepEqual(store.snapshot(),lost);
  const preview=await tools.previewRebindDrills({id:'second',bindings:choices(),revision:store.revision()});assert.deepEqual(store.snapshot(),lost);store.apply(preview);
  const current=store.snapshot();assert.notEqual(current.nodes[0].drill.faceKey,lost.nodes[0].drill.faceKey);assert.equal(current.nodes[0].drill.faceKey,current.nodes[0].children[0].drill.faceKey);
  assert.deepEqual(await f.service.rebuild(parseCadProject(serializeCadProject(current))),current);
  store.undo();assert.deepEqual(store.snapshot(),lost);
 }finally{f.service.dispose();}
});

test('STEP bore chain rejects different reassigned entry faces atomically',async()=>{
 const f=await fixture({step:true});try{const before=f.store.snapshot();await assert.rejects(()=>f.tools.previewRebindDrills({id:'second',bindings:[choices()[0]],revision:f.store.revision()}),/unterschiedlichen Flächen/);assert.deepEqual(f.store.snapshot(),before);}finally{f.service.dispose();}
});

test('reassigned bore cannot overlap a later bore; failure preserves the confirmed project',async()=>{
 const f=await fixture();try{const before=f.store.snapshot();await assert.rejects(()=>f.tools.previewRebindDrills({id:'second',bindings:[{path:['first'],reference:top(8)}],revision:f.store.revision()}));assert.deepEqual(f.store.snapshot(),before);}finally{f.service.dispose();}
});

test('Bis Fläche requires both explicit references and validates the opposite target',async()=>{
 const f=await fixture({plane:true});try{const before=f.store.snapshot(),revision=f.store.revision();
  assert.throws(()=>f.tools.previewRebindDrills({id:'second',bindings:[{path:['first'],reference:bottom(-8)}],revision}),/auch.*Zielfläche/);
  await assert.rejects(async()=>f.tools.previewRebindDrills({id:'second',bindings:[{path:['first'],reference:bottom(-8),stopReference:bottom(-8)}],revision}));
  const p=await f.tools.previewRebindDrills({id:'second',bindings:[{path:['first'],reference:bottom(-8),stopReference:top(-8)}],revision});assert.equal(p.project.nodes[0].children[0].drill.stop.feature,'box-face-top');assert.deepEqual(f.store.snapshot(),before);
 }finally{f.service.dispose();}
});

test('cylinder end faces reassign but lateral faces, duplicates and old indices are refused',async()=>{
 const f=await fixture({cylinder:true});try{const before=f.store.snapshot(),revision=f.store.revision();
  const p=await f.tools.previewRebindDrills({id:'second',bindings:choices(),revision});assert.deepEqual(p.project.nodes[0].drill.anchor.normal,[0,0,-1]);
  for(const bindings of [[choices()[0],choices()[0]],[{path:[],reference:{faceIndex:1}}],[{path:['gone'],reference:top(0)}],[{path:[],reference:{ray:{origin:[30,0,0],direction:[-1,0,0]}}}]])assert.throws(()=>f.tools.previewRebindDrills({id:'second',bindings,revision}));
  assert.deepEqual(f.store.snapshot(),before);f.store.apply(p);assert.throws(()=>f.tools.previewRebindDrills({id:'second',bindings:choices(),revision}),{code:'STALE_REVISION'});
 }finally{f.service.dispose();}
});

test('native tool router accepts only named rebind options and respects locked retained sources',async()=>{
 const f=await fixture();try{
  const before=f.store.snapshot(),router=createCadCommandRouter({oc,service:f.service}),operation={kind:'tool',name:'previewRebindDrills',options:{id:'second',bindings:choices()}};
  const result=await router.run(before,operation);assert.equal(result.project.nodes[0].drill.feature,'box-face-bottom');assert.deepEqual(f.store.snapshot(),before);
  await assert.rejects(()=>router.run(before,{...operation,options:{...operation.options,skipValidation:true}}),/Befehlsfelder/);
  before.nodes[0].children[0].children[0].locked=true;await assert.rejects(()=>router.run(before,operation),{code:'LOCKED_CAD_OBJECT'});
 }finally{f.service.dispose();}
});

test('reassignment of a transformed source keeps world normals and source matrices',async()=>{
 const f=await fixture();try{
  const input=f.store.snapshot();input.nodes[0].transform=[0,1,0,0,-1,0,0,0,0,0,1,0,30,20,3,1];
  const store=createCadTransactions({initial:input,build:f.build}),tools=createCadToolsNative({oc,service:f.service,transactions:store});
  const bindings=[{path:['first'],reference:{ray:{origin:[30,12,-30],direction:[0,0,1]}}},{path:[],reference:{ray:{origin:[30,28,-30],direction:[0,0,1]}}}];
  const preview=await tools.previewRebindDrills({id:'second',bindings,revision:store.revision()});
  assert.deepEqual(preview.project.nodes[0].transform,input.nodes[0].transform);assert.deepEqual(preview.project.nodes[0].children[0].children[0],input.nodes[0].children[0].children[0]);assert.deepEqual(preview.project.nodes[0].drill.anchor.point,[8,0,-4]);
  assert.ok(Math.abs(preview.project.nodes[0].stats.volume-(6400-69*Math.PI))<1e-5);
 }finally{f.service.dispose();}
});

test('cancellation and later mutations cannot apply an obsolete joint reassignment',async()=>{
 const f=await fixture();try{
  const before=f.store.snapshot();let release,started;const entered=new Promise(r=>started=r),gate=new Promise(r=>release=r);
  const store=createCadTransactions({initial:before,build:async(p,c)=>{started();await gate;return f.build(p,c);}}),tools=createCadToolsNative({oc,service:f.service,transactions:store});
  const pending=tools.previewRebindDrills({id:'second',bindings:choices(),revision:store.revision()});await entered;assert.equal(store.cancel(),true);await assert.rejects(pending,{code:'ABORTED'});release();
  assert.deepEqual(store.snapshot(),before);assert.equal(store.state().previews,0);assert.equal(store.state().undo,0);
  const preview=await f.tools.previewRebindDrills({id:'second',bindings:choices(),revision:f.store.revision()});f.store.undo();assert.throws(()=>f.store.apply(preview),{code:'STALE_REVISION'});
 }finally{f.service.dispose();}
});
