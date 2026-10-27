import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import initialize from '../cad-kernel-build/runtime/formnaro_cad.js';
import {createCadService} from '../src/cad-service.js';
import {createCadToolsNative} from '../src/cad-tools-native.js';
import {createCadCommandRouter} from '../src/cad-command-router.js';
import {createCadTransactions} from '../src/cad-transactions.js';
import {createCadController} from '../src/cad-controller.js';
import {createCadProject,parseCadProject,serializeCadProject} from '../src/cad-project.js';
import {cadIdentity} from '../src/cad-affine.js';

const oc=await initialize({print:()=>{},printErr:()=>{}});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-4,`${a} vs ${b}`);
function pose(x=0){const m=cadIdentity();m[12]=x;return m;}
function nativeFixture(service){return createCadProject({nodes:[
  service.nativeNode({type:'box',size:[30,20,10]},{id:'body'}),
  ...[-5,5].map((x,i)=>service.nativeNode({type:'box',size:[4,4,20]},{id:'h'+i,solid:false,transform:pose(x)}))
]});}

test('native hole group stays a cutter through source edit, reload, nested subtraction and Undo/Redo',async()=>{
 const service=createCadService({oc});try{
  const initial=await service.rebuild(nativeFixture(service)),store=createCadTransactions({initial,build:p=>service.rebuild(p)}),tools=createCadToolsNative({oc,service,transactions:store}),before=store.serialize();
  const preview=await tools.previewGroup({ids:['h0','h1'],id:'holes',revision:store.revision()});assert.equal(store.serialize(),before);store.apply(preview);
  const holes=store.snapshot().nodes.find(n=>n.id==='holes');assert.equal(holes.solid,false);assert.equal(holes.stats.solids,2);near(holes.stats.volume,640);assert(holes.children.every(n=>!n.solid));
  const grouped=store.serialize();store.undo();assert.equal(store.serialize(),before);store.redo();assert.equal(store.serialize(),grouped);
  assert.equal(serializeCadProject(await service.rebuild(parseCadProject(grouped))),grouped);
  store.apply(await tools.previewEditSource({groupId:'holes',path:['h0'],patch:{recipe:{type:'box',size:[6,4,20]}},revision:store.revision()}));assert.equal(store.snapshot().nodes[1].solid,false);near(store.snapshot().nodes[1].stats.volume,800);
  store.apply(await tools.previewGroup({ids:['body','holes'],id:'cut',revision:store.revision()}));near(store.snapshot().nodes[0].stats.volume,5600);assert.equal(store.snapshot().nodes[0].solid,true);
  store.apply(await tools.previewDissolve({id:'cut',revision:store.revision()}));store.apply(await tools.previewDissolve({id:'holes',revision:store.revision()}));assert.deepEqual(store.snapshot().nodes.slice(1).map(n=>n.solid),[false,false]);assert.deepEqual(store.snapshot().nodes.slice(1).map(n=>n.transform),initial.nodes.slice(1).map(n=>n.transform));
 }finally{service.dispose();}
});

test('automation groups hole sources and failed hole intersections leave confirmed model intact',async()=>{
 const service=createCadService({oc});try{
  const initial=await service.rebuild(nativeFixture(service)),router=createCadCommandRouter({oc,service}),result=await router.run(initial,{kind:'batch',commands:[{op:'group',targets:['h0','h1'],as:'holes'}]},{baseline:initial});
  const holes=result.project.nodes.find(n=>n.source==='group');assert.ok(result.aliases.holes);assert.equal(holes.solid,false);near(holes.stats.volume,640);
  const store=createCadTransactions({initial,build:p=>service.rebuild(p)}),tools=createCadToolsNative({oc,service,transactions:store}),before=store.serialize();await assert.rejects(tools.previewGroup({ids:['h0','h1'],operation:'intersection',revision:store.revision()}));assert.equal(store.serialize(),before);assert.equal(store.state().undo,0);
  const draft=structuredClone(initial);draft.nodes=[{...draft.nodes[0],id:'bad',source:'group',operation:'union',children:[{...draft.nodes[0],suppressed:true},draft.nodes[1]]}];delete draft.nodes[0].recipe;await assert.rejects(service.rebuild(draft),/aktive Körperquelle/);
 }finally{service.dispose();}
});

test('overlapping native hole intersection stays a hole; export and inherited locks keep their restrictions',async()=>{
 const service=createCadService({oc});try{
  const initial=await service.rebuild(nativeFixture(service));initial.nodes[2].transform=pose(-3);
  const store=createCadTransactions({initial,build:p=>service.rebuild(p)}),tools=createCadToolsNative({oc,service,transactions:store});store.apply(await tools.previewGroup({ids:['h0','h1'],id:'holes',operation:'intersection',revision:store.revision()}));
  const hole=store.snapshot().nodes[1];assert.equal(hole.solid,false);near(hole.stats.volume,160);assert.throws(()=>service.exportStep(createCadProject({nodes:[hole]})));
  const locked=structuredClone(initial);locked.nodes[1].locked=true;const lockedStore=createCadTransactions({initial:locked,build:p=>service.rebuild(p)}),lockedTools=createCadToolsNative({oc,service,transactions:lockedStore});assert.throws(()=>lockedTools.previewGroup({ids:['h0','h1'],revision:lockedStore.revision()}),{code:'LOCKED_CAD_OBJECT'});assert.deepEqual(lockedStore.snapshot(),locked);
 }finally{service.dispose();}
});

function worker(file){return ()=>{const w=new Worker(new URL(file,import.meta.url)),api={onmessage:null,onerror:null,postMessage:data=>w.postMessage(data),terminate:()=>w.terminate()};w.on('message',data=>api.onmessage?.({data}));w.on('error',error=>api.onerror?.(error));return api;};}
const cube=(id,x,role='hole',scale=1)=>({id,kind:'mesh',name:id,meshRole:role,transform:pose(x),mesh:{verts:[-2,-2,-10,2,-2,-10,2,2,-10,-2,2,-10,-2,-2,10,2,-2,10,2,2,10,-2,2,10].map(v=>v*scale),triangles:[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]}});

test('real mesh worker retains hole roles and exact sources through nested grouping, serialization, dissolve and history',async()=>{
 const body=cube('body',0,'solid',4),initial=createCadProject({nodes:[body,cube('h0',-5),cube('h1',5)]}),cad=createCadController({initial,createWorker:worker('./fixtures/cad-node-worker.mjs'),createMeshWorker:worker('./fixtures/mesh-engine-node-worker.mjs')});try{
  const before=cad.serialize(),preview=await cad.preview({type:'mesh-group',ids:['h0','h1'],operation:'union'});assert.equal(cad.serialize(),before);cad.apply(preview);const grouped=cad.serialize(),holes=cad.snapshot().nodes[1];assert.equal(holes.meshRole,'hole');assert.deepEqual(holes.meshSource.sources,initial.nodes.slice(1));near((await cad.meshQuery('inspectSolid',{id:'h0'})).volume,640);
  cad.undo();assert.equal(cad.serialize(),before);cad.redo();assert.equal(cad.serialize(),grouped);await cad.open(parseCadProject(grouped));assert.equal(cad.serialize(),grouped);
  await cad.execute({type:'mesh-source-edit',id:'h0',path:['h1'],set:{size:[6,4,20]}});assert.equal(cad.snapshot().nodes[1].meshRole,'hole');near((await cad.meshQuery('inspectSolid',{id:'h0'})).volume,800);cad.undo();assert.equal(cad.serialize(),grouped);
  await cad.execute({type:'mesh-group',ids:['body','h0'],operation:'union'});assert.equal(cad.snapshot().nodes[0].meshRole,'solid');near((await cad.meshQuery('inspectSolid',{id:'body'})).volume,20480-640);
  const mixed=cad.serialize();await assert.rejects(cad.execute({type:'mesh-source-edit',id:'body',path:['body'],set:{suppressed:true}}),/aktive Materialquelle/);assert.equal(cad.serialize(),mixed);
  await cad.execute({type:'mesh-dissolve',id:'body'});await cad.execute({type:'mesh-dissolve',id:'h0'});assert.deepEqual(cad.snapshot().nodes,initial.nodes);
  const intact=cad.serialize();await assert.rejects(cad.execute({type:'mesh-group',ids:['h0','h1'],operation:'intersection'}));assert.equal(cad.serialize(),intact);
 }finally{cad.dispose();}
});
