import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {createCadController} from '../src/cad-controller.js';
import {Matrix4} from 'three';
function controller(){return createCadController({createWorker:()=>{const native=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),adapter={onmessage:null,onerror:null,postMessage:d=>native.postMessage(d),terminate:()=>native.terminate()};native.on('message',d=>adapter.onmessage?.({data:d}));native.on('error',e=>adapter.onerror?.(e));return adapter;}});}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} vs ${b}`);
test('Native source-axis dimensions and correction evidence cross the real worker without committing',async()=>{
 const cad=controller();try{
  await cad.execute({kind:'create',recipe:{type:'box',size:[60,40,6]},options:{id:'plate'}});
  await cad.execute({kind:'create',recipe:{type:'cylinder',size:[4,4,10]},options:{id:'bore',solid:false}});
  await cad.execute({kind:'batch',commands:[{op:'group',targets:['plate','bore'],as:'g'}]});
  await cad.execute({kind:'create',recipe:{type:'box',size:[2,2,2]},options:{id:'other',locked:true,transform:new Matrix4().makeTranslation(100,0,0).toArray()}});
  const initial=cad.snapshot(),group=initial.nodes[0];group.transform=[-1.25,0,0,0,.2,1,0,0,0,0,.8,0,0,0,3,1];initial.nodes[1].locked=true;await cad.open(initial);
  const before=cad.serialize(),undo=cad.state().undo,scene=await cad.describe(),source=scene.objects.find(o=>o.id==='plate');
  source.measures.geometrySize.forEach((v,i)=>close(v,[60,40,6][i]));source.measures.editSize.forEach((v,i)=>close(v,[60,40,6][i]));source.measures.worldAxisSize.forEach((v,i)=>close(v,[75,40*Math.hypot(.2,1),4.8][i]));assert.notDeepEqual(source.measures.worldAxisSize,source.worldBounds.size);
  const size=[...source.measures.editSize];size[2]=10/source.sizeToWorldAxisFactors[2];close(size[2],12.5);
  const proposal=await cad.preview({kind:'batch',commands:[{op:'update',target:source.target,set:{size}}]}),after=await cad.describe(proposal.project),next=after.objects.find(o=>o.id==='plate');close(next.measures.worldAxisSize[2],10);close(next.worldBounds.min[2],source.worldBounds.min[2]);
  for(const i of [0,1])close(next.measures.editSize[i],source.measures.editSize[i]);assert.deepEqual(proposal.project.nodes[0].transform,group.transform);assert.deepEqual(proposal.project.nodes[0].children[1],initial.nodes[0].children[1]);assert.deepEqual(proposal.project.nodes[1],initial.nodes[1]);assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,undo);cad.discard(proposal.previewId);
  for(const [command,code,index] of [[{op:'update',target:'missing',set:{size:[1,1,1]}},'UNKNOWN_CAD_OBJECT',2],[{op:'update',target:'other',set:{size:[1,1,1]}},'LOCKED_CAD_OBJECT',1],[{op:'update',target:source.target,set:{size:[-1,40,6]}},'CAD_ERROR',1]]){
   const commands=index===2?[{op:'update',target:source.target,set:{color:'#123456'}},command]:[command];await assert.rejects(cad.preview({kind:'batch',commands}),error=>{assert.equal(error.code,code);assert.equal(error.feedback.code,code);assert.equal(error.feedback.commandIndex,index);assert.equal(error.feedback.applied,false);if(code==='LOCKED_CAD_OBJECT')assert.equal(error.feedback.retryable,false);if(command.set.size[0]<0){assert.equal(error.feedback.field,'set.size');assert.deepEqual(error.feedback.range,{min:.01,max:10000});}return true;});assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,undo);
  }
  await assert.rejects(cad.preview({kind:'batch',commands:[{op:'group',targets:[group.id,'other']}]}),e=>{assert.equal(e.code,'LOCKED_CAD_OBJECT');assert.deepEqual(e.feedback.target,{rootId:'other',path:[]});assert.equal(e.feedback.retryable,false);return true;});
  await assert.rejects(cad.preview({kind:'batch',commands:[{op:'duplicate',target:group.id,as:'alias'},{op:'update',target:'$alias',set:{size:[-1,2,3]}}]}),e=>{assert.equal(typeof e.feedback.target.rootId,'string');assert.notEqual(e.feedback.target.rootId,'$alias');return true;});
  cad.apply({previewId:(await cad.preview({kind:'batch',commands:[{op:'update',target:source.target,set:{size}}]})).previewId,revision:cad.revision()});assert.equal(cad.state().undo,undo+1);cad.undo();assert.equal(cad.serialize(),before);cad.redo();close((await cad.describe()).objects.find(o=>o.id==='plate').measures.worldAxisSize[2],10);
 }finally{cad.dispose();}
});
test('Prepared dimensions retain a full rotated/sheared affine ancestry',async()=>{
 const {cadAxisMeasures}=await import('../src/cad-axis-measures.js');const local=[1,.3,0,0,.4,1,0,0,.2,.1,1,0,0,0,0,1],world=new Matrix4().makeRotationZ(.6).multiply(new Matrix4().makeScale(-2,1,.8)).multiply(new Matrix4().fromArray(local)).toArray(),h=cadAxisMeasures({size:[12,8,6]},local,world);
 for(let i=0;i<3;i++){close(h.measures.worldAxisSize[i],h.measures.editSize[i]*h.sizeToWorldAxisFactors[i]);close(Math.hypot(...h.worldAxisDirections[i]),1);}assert.match(h.editFrame,/parent-frame/);
});
test('Late whole-batch failures have no invented command index',async()=>{
 const {createCadCommandRouter}=await import('../src/cad-command-router.js'),{createCadProject}=await import('../src/cad-project.js');
 const router=createCadCommandRouter({oc:{},service:{rebuild:async()=>{throw Object.assign(Error('combined failure'),{code:'CAD_COMBINED_FAILURE'});}}});
 await assert.rejects(router.run(createCadProject(),{kind:'batch',commands:[{op:'layer',name:'fixture'}]}),e=>{assert.equal(e.feedback.commandIndex,undefined);assert.equal(e.feedback.target,undefined);assert.equal(e.feedback.code,e.code);return true;});
});
test('Native drill reports no removed material with its actual command and target',async()=>{
 const cad=controller();try{await cad.execute({kind:'create',recipe:{type:'box',size:[40,30,10]},options:{id:'drill'}});const before=cad.serialize(),undo=cad.state().undo;
 await assert.rejects(cad.preview({kind:'batch',commands:[{op:'drill',target:'drill',reference:{ray:{origin:[0,0,30],direction:[0,0,-1]}},offset:[100,0,0],diameter:4,depth:3,through:false}]}),e=>{assert.equal(e.code,'NO_CAD_DRILL_MATERIAL');assert.equal(e.feedback.commandIndex,1);assert.deepEqual(e.feedback.target,{rootId:'drill',path:[]});assert.equal(e.feedback.retryable,true);return true;});assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,undo);
 }finally{cad.dispose();}
});
