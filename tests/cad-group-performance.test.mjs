import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCadKernel} from '../src/cad-kernel-loader.js';
import {createCadService} from '../src/cad-service.js';
import {createCadTransactions} from '../src/cad-transactions.js';
import {createCadToolsNative} from '../src/cad-tools-native.js';
import {createCadProject,parseCadProject,serializeCadProject} from '../src/cad-project.js';
import {cadIdentity} from '../src/cad-affine.js';
import {cadFuseMany,cadBoolean,cadVolume,validateCadSolid,writeCadBrep} from '../src/cad-native-kernel.js';
const oc=await loadCadKernel({print:()=>{},printErr:()=>{}}),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
// OCCT marks a TShape non-free when it becomes a compound child. This
// ownership flag is not geometry; all other bytes must remain unchanged.
const geometryBytes=shape=>writeCadBrep(oc,shape).replace(/\n[01]([01]{6})\n/g,'\n$1\n');
function fixture(service,{spacing=3,affine=false,holes=false}={}){
 return createCadProject({nodes:Array.from({length:7},(_,i)=>{
  const transform=affine?[-1.2,0,0,0,.3,.8,0,0,.1,.2,1.1,0,-i*spacing,0,0,1]:cadIdentity();if(!affine)transform[12]=i*spacing;
  return service.nativeNode({type:'box',size:[4,4,4]},{id:'p'+i,transform,solid:!holes,color:i%2?'#ff7700':'#3366aa'});
 })});
}
test('Balanced native union preserves material, bounds and operands for overlaps, contacts, gaps and affine frames',()=>{
 const service=createCadService({oc});try{for(const spacing of [3,4,12])for(const affine of [false,true]){
  const p=fixture(service,{spacing,affine}),shapes=p.nodes.map(service.worldShape),before=shapes.map(geometryBytes);let result,reference;
  try{
   result=cadFuseMany(oc,shapes,{balanced:true});reference=cadFuseMany(oc,shapes);const actual=validateCadSolid(oc,result),expected=validateCadSolid(oc,reference);near(actual.volume,expected.volume);assert.equal(actual.solids,expected.solids);assert.deepEqual(actual.bounds,expected.bounds);
   for(const [left,right] of [[result,reference],[reference,result]]){const difference=cadBoolean(oc,'difference',left,right,{allowEmpty:true});try{assert.ok(!difference||cadVolume(oc,difference)<1e-7);}finally{difference?.delete();}}
   assert.deepEqual(shapes.map(geometryBytes),before);
  }finally{result?.delete();reference?.delete();shapes.forEach(s=>s.delete());}
 }}finally{service.dispose();}
});
test('Group preview, source editing, suppression, dissolve, reload and Undo preserve exact source data',async()=>{
 const service=createCadService({oc});try{for(const holes of [false,true]){
  const p=await service.rebuild(fixture(service,{holes})),store=createCadTransactions({initial:p,build:p=>service.rebuild(p)}),tools=createCadToolsNative({oc,service,transactions:store}),before=store.serialize();
  const preview=await tools.previewGroup({ids:p.nodes.map(n=>n.id),id:'g',revision:store.revision()});assert.equal(store.serialize(),before);store.apply(preview);const grouped=store.serialize(),root=store.snapshot().nodes[0];near(root.stats.volume,352);assert.equal(root.solid,!holes);assert.deepEqual(root.children,p.nodes);assert.equal(store.state().undo,1);
  store.undo();assert.equal(store.serialize(),before);store.redo();assert.equal(store.serialize(),grouped);
  assert.equal(serializeCadProject(await service.rebuild(parseCadProject(grouped))),grouped);
  store.apply(await tools.previewSuppressSource({groupId:'g',path:['p3'],suppressed:true,revision:store.revision()}));near(store.snapshot().nodes[0].stats.volume,320);store.undo();assert.equal(store.serialize(),grouped);
  store.apply(await tools.previewEditSource({groupId:'g',path:['p0'],patch:{recipe:{type:'box',size:[6,4,4]}},revision:store.revision()}));assert.ok(store.snapshot().nodes[0].stats.volume>352);store.undo();assert.equal(store.serialize(),grouped);
  store.apply(await tools.previewDissolve({id:'g',revision:store.revision()}));assert.equal(store.serialize(),before);
 }}finally{service.dispose();}
});
test('Failed balanced calculation falls back; persistent failures leave the confirmed transaction unchanged',async()=>{
 const service=createCadService({oc});try{
  const p=await service.rebuild(fixture(service)),store=createCadTransactions({initial:p,build:p=>service.rebuild(p)}),tools=createCadToolsNative({oc,service,transactions:store}),before=store.serialize(),original=oc.BRepAlgoAPI_Fuse.prototype.Build;let calls=0;
  try{oc.BRepAlgoAPI_Fuse.prototype.Build=function(...args){if(++calls===3)throw Error('Injected group failure');return original.apply(this,args);};const preview=await tools.previewGroup({ids:p.nodes.map(n=>n.id),id:'g',revision:store.revision()});assert.ok(calls>3);near(preview.project.nodes[0].stats.volume,352);}
  finally{oc.BRepAlgoAPI_Fuse.prototype.Build=original;}
  const fresh=createCadService({oc}),failedStore=createCadTransactions({initial:p,build:p=>fresh.rebuild(p)}),failedTools=createCadToolsNative({oc,service:fresh,transactions:failedStore});
  try{oc.BRepAlgoAPI_Fuse.prototype.Build=function(){throw Error('Persistent group failure');};await assert.rejects(failedTools.previewGroup({ids:p.nodes.map(n=>n.id),id:'g',revision:failedStore.revision()}),/Persistent group failure/);assert.equal(failedStore.serialize(),before);assert.equal(failedStore.state().undo,0);assert.equal(failedStore.state().busy,false);}
  finally{oc.BRepAlgoAPI_Fuse.prototype.Build=original;fresh.dispose();}
  assert.equal(store.serialize(),before);assert.equal(store.state().undo,0);assert.equal(store.state().busy,false);store.apply(await tools.previewGroup({ids:p.nodes.map(n=>n.id),id:'g',revision:store.revision()}));near(store.snapshot().nodes[0].stats.volume,352);
 }finally{service.dispose();}
});
