import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {createCadController} from '../src/cad-controller.js';

test('A failed local live construction releases its own intermediate preview and preserves confirmed history',async()=>{
 const shown=[],failed=[];
 const cad=createCadController({createWorker:()=>{const native=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),adapter={onmessage:null,onerror:null,postMessage:data=>native.postMessage(data),terminate:()=>native.terminate()};native.on('message',data=>adapter.onmessage?.({data}));native.on('error',error=>adapter.onerror?.(error));return adapter;},onBuildPreview:value=>shown.push(value),onBuildPreviewFailure:value=>failed.push(value)});
 try{
  const before=cad.serialize(),undo=cad.state().undo;
  await assert.rejects(cad.preview({kind:'batch',commands:[{op:'create',type:'box',as:'a',size:[5,5,5]},{op:'create',type:'box',as:'b',size:[5,5,5],pos:[40,0,0]},{op:'group',operation:'intersection',targets:['$a','$b']}]},{livePreview:true}),{code:'CAD_ERROR'});
  assert(shown.length>0,'Actual native intermediate preview required');
  assert.equal(failed.length,1,'Failed local preview must notify the owning view');
  assert.equal(failed[0].ticket,shown.at(-1).ticket);
  assert.equal(cad.hasBuildPreview(),false);
  assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,undo);assert.equal(cad.state().busy,false);
  const next=await cad.preview({kind:'batch',commands:[{op:'create',type:'box',size:[3,4,5]}]},{livePreview:true});assert(next.previewId);assert.equal(failed.length,1,'Successful preview must be retained');
  await assert.rejects(cad.preview({kind:'batch',commands:[]},{revision:'stale'}),{code:'STALE_REVISION'});assert(cad.getPreview(next.previewId));assert.equal(failed.length,1,'An unrelated rejected request must not clear a valid preview');
 }finally{cad.dispose();}
});
