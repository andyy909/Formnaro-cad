import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {createCadController} from '../src/cad-controller.js';

function controller(){return createCadController({createWorker:()=>{const w=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),a={postMessage:d=>w.postMessage(d),terminate:()=>w.terminate()};w.on('message',d=>a.onmessage?.({data:d}));w.on('error',e=>a.onerror?.(e));return a;}});}

test('native bore recognizes a circular cutter after equal radial affine scaling',async()=>{
 const cad=controller();try{
  const p=await cad.preview({kind:'batch',commands:[{op:'create',type:'box',size:[30,30,10],pos:[0,0,5],as:'plate'},{op:'create',type:'cylinder',size:[20,20,20],pos:[0,0,5],solid:false,as:'hole'},{op:'transform',target:'$hole',scale:[.3,.3,1]},{op:'group',targets:['$plate','$hole'],as:'body'}]});
  const result=await cad.checkPreview(p.previewId,[{kind:'bore',target:'$body',from:[0,0,0],to:[0,0,10],diameter:6,minWall:1}]);
  assert.ok(Math.abs(result.checks[0].actual.diameter-6)<1e-7);assert.equal(result.checks[0].actual.clear,true);assert.equal(result.checks[0].actual.surroundingMaterial,true);
  for(const bad of [{diameter:6.2},{to:[0,0,9]},{from:[1,0,0],to:[1,0,10]},{minWall:14}])await assert.rejects(cad.checkPreview(p.previewId,[{kind:'bore',target:'$body',from:[0,0,0],to:[0,0,10],diameter:6,minWall:1,...bad}]),{code:'AI_RESULT_MISMATCH'});
 }finally{cad.dispose();}
});

test('elliptic scaled cuts do not become certified circular bores',async()=>{
 const cad=controller();try{for(const scale of [[.3,.4,1],[.3,.300003,1]]){
  const p=await cad.preview({kind:'batch',commands:[{op:'create',type:'box',size:[30,30,10],pos:[0,0,5],as:'plate'},{op:'create',type:'cylinder',size:[20,20,20],pos:[0,0,5],solid:false,as:'hole'},{op:'transform',target:'$hole',scale},{op:'group',targets:['$plate','$hole'],as:'body'}]});
  await assert.rejects(cad.checkPreview(p.previewId,[{kind:'bore',target:'$body',from:[0,0,0],to:[0,0,10],diameter:6,minWall:1}]),{code:'AI_CHECK_UNAVAILABLE'});cad.discard(p.previewId);
 }}finally{cad.dispose();}
});

test('canonical affine cylinder never substitutes recipe metadata for a different retained BRep',async()=>{
 const {default:loader}=await import('../cad-kernel-build/runtime/formnaro_cad.js'),{createCadService}=await import('../src/cad-service.js'),{affineCadNativeCylinder}=await import('../src/cad-drill-stock-native.js');
 const oc=await loader({print(){},printErr(){}}),service=createCadService({oc});try{
  const n=service.nativeNode({type:'cylinder',size:[20,20,20]}),box=service.nativeNode({type:'box',size:[20,20,20]});n.transform=[.3,0,0,0,0,.3,0,0,0,0,1,0,0,0,0,1];n.brep=box.brep;
  assert.equal(affineCadNativeCylinder(oc,n,box.stats.bounds),null);
 }finally{service.dispose();}
});
