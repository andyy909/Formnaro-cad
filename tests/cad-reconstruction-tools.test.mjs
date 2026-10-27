import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {createCadController} from '../src/cad-controller.js';
import {createCadAutomationAccess} from '../src/cad-automation-access.js';
import {aiFeedback} from '../src/ai-feedback.js';
const adapter=file=>()=>{const w=new Worker(new URL(file,import.meta.url)),a={postMessage:v=>w.postMessage(v),terminate:()=>w.terminate()};w.on('message',data=>a.onmessage?.({data}));w.on('error',e=>a.onerror?.(e));return a;};
async function fixture(options={}){let scene;const cad=createCadController({createWorker:adapter('./fixtures/cad-node-worker.mjs'),createComparisonWorker:adapter('./fixtures/model-deviation-node-worker.mjs'),...options});const refresh=async()=>{scene=await cad.describe();},access=createCadAutomationAccess({controller:cad,getScene:()=>scene,refresh});await refresh();const original=await access.preview({revision:cad.revision(),commands:[{op:'create',type:'box',as:'original',size:[10,20,8]}]});await access.apply(original);return {cad,access,refresh,id:original.aliases.original};}
test('Candidate surface comparison passes equal bodies before Apply and rejects a visible dimensional error atomically',async()=>{
 const {cad,access,id}=await fixture();try{
  const before=cad.serialize(),depth=cad.state().undo,request={revision:cad.revision(),commands:[{op:'create',type:'box',as:'copy',size:[10,20,8]}],checks:[{kind:'surfaceDeviation',target:'$copy',other:id,expected:.001}]};
  const good=await access.preview(request),report=good.verification.checks[0];assert.equal(report.passed,true);assert.equal(report.globalGuarantee,false);assert.ok(report.actual.sampledMaximum<1e-10);assert.equal(report.actual.draft,true);assert.deepEqual(report.actual.cadTessellationTarget,{deflection:.01,angleDegrees:5});assert.equal(cad.serialize(),before);cad.discard(good.previewId);
  await assert.rejects(access.preview({...request,commands:[{op:'create',type:'box',as:'copy',size:[12,20,8]}]}),e=>{assert.equal(e.code,'AI_RESULT_MISMATCH');const f=aiFeedback(e);assert.equal(f.checkKind,'surfaceDeviation');assert.equal(f.expected,.001);assert.ok(f.actual.sampledMaximum>=1);assert.equal(f.actual.directions.length,2);assert.ok(f.actual.directions[0].worst[0].sourcePoint.length===3);return true;});assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,depth);assert.equal(cad.state().previews,0);
 }finally{cad.dispose();}
});
test('Surface checks refuse new fake reference geometry and comparing a root with itself',async()=>{
 const {cad,access,id}=await fixture();try{
  const commands=[{op:'create',type:'box',as:'copy',size:[12,20,8]}];
  await assert.rejects(access.preview({revision:cad.revision(),commands:[...commands,{op:'create',type:'box',as:'fake',size:[12,20,8]}],checks:[{kind:'surfaceDeviation',target:'$copy',other:'$fake',expected:0}]}),/bestätigten/);
  await assert.rejects(access.preview({revision:cad.revision(),commands,checks:[{kind:'surfaceDeviation',target:id,other:id,expected:0}]}),/unterschiedliche/);assert.equal(cad.state().previews,0);
 }finally{cad.dispose();}
});
test('A local script can compare its newly built draft, without an intermediate Apply or Undo',async()=>{
 let measured;const {cad,access,id}=await fixture({runScript:async({call})=>{measured=await call('query',{engine:'app',kind:'modelComparison',options:{leftId:'$copy',rightId:id,maxSamples:12}});return {sampledMaximum:measured.sampledMaximum};}});try{
  const before=cad.serialize(),depth=cad.state().undo;
  const proposal=await access.preview({revision:cad.revision(),commands:[{op:'create',type:'box',as:'copy',size:[10,20,8]},{op:'script',code:'test'}]});
  // This fixture exercises the real controller query callback with a bounded
  // supplied script runner; browser coverage separately uses the opaque Worker.
  assert.ok(measured.sampledMaximum<1e-10);assert.equal(measured.draft,true);cad.discard(proposal.previewId);assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,depth);
 }finally{cad.dispose();}
});
test('Cancelling a preview surface check terminates its isolated worker and leaves no applyable candidate',async()=>{
 let posted,terminated=0;const started=new Promise(r=>posted=r),{cad,access,id}=await fixture({createComparisonWorker:()=>({postMessage:()=>posted(),terminate:()=>terminated++})});
 try{const before=cad.serialize(),depth=cad.state().undo,pending=access.preview({revision:cad.revision(),commands:[{op:'create',type:'box',as:'copy',size:[10,20,8]}],checks:[{kind:'surfaceDeviation',target:'$copy',other:id,expected:.01}]});const rejection=assert.rejects(pending,{code:'ABORTED'});await started;assert.equal(cad.cancel(),true);await rejection;assert.equal(terminated,1);assert.equal(cad.state().previews,0);assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,depth);}finally{cad.dispose();}
});
