import test from 'node:test';import assert from 'node:assert/strict';import {Worker} from 'node:worker_threads';
import {createCadController} from '../src/cad-controller.js';
test('mixed native sub-batches report the original outer command index',async()=>{
 const steps=[],controller=createCadController({onBuildPreview:()=>{},onOperationProgress:value=>{if(value?.phase==='command'&&Number.isInteger(value.commandIndex))steps.push(value.commandIndex);},createWorker:()=>{const worker=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),adapter={postMessage:v=>worker.postMessage(v),terminate:()=>worker.terminate()};worker.on('message',v=>adapter.onmessage?.({data:v}));worker.on('error',e=>adapter.onerror?.(e));return adapter;}});
 try{await controller.preview({kind:'batch',commands:[0,1,2].map(i=>({op:'create',type:'box',size:[2,3,4],pos:[i*10,0,0]}))},{livePreview:true});assert.ok(steps.includes(3));for(let i=1;i<steps.length;i++)assert.ok(steps[i]>=steps[i-1],JSON.stringify(steps));}finally{controller.dispose();}
});
