import test from 'node:test';import assert from 'node:assert/strict';import {Worker} from 'node:worker_threads';
import {createCadController} from '../src/cad-controller.js';import {createCadAutomationAccess} from '../src/cad-automation-access.js';
const factory=()=>{const worker=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),adapter={postMessage:v=>worker.postMessage(v),terminate:()=>worker.terminate()};worker.on('message',v=>adapter.onmessage?.({data:v}));worker.on('error',e=>adapter.onerror?.(e));return adapter;};
test('per-request final-only display preserves geometry, validation, history and the global preference',async()=>{
 const rows=[],preference={live:true};for(const mode of ['inherit','final']){
  let shown=0;const controller=createCadController({createWorker:factory,onBuildPreview:()=>{shown++;}}),access=createCadAutomationAccess({controller,getLivePreviewEnabled:()=>preference.live});
  try{const before=controller.revision(),proposal=await access.preview({revision:before,intermediateDisplay:mode,commands:[{op:'create',type:'box',size:[10,8,4],as:'base'},{op:'create',type:'cylinder',size:[3,3,8],as:'hole',solid:false},{op:'group',targets:['$base','$hole'],as:'result'}],checks:[]}),model=controller.getPreview(proposal.previewId).project;
   rows.push({volume:model.nodes[0].stats.volume,brep:model.nodes[0].brep.data,verification:proposal.verification});assert.equal(controller.revision(),before);assert.equal(controller.state().undo,0);assert.equal(preference.live,true);if(mode==='final')assert.equal(shown,0);else assert.ok(shown>0);
  }finally{controller.dispose();}
 }
 assert.equal(rows[0].brep,rows[1].brep);assert.equal(rows[0].volume,rows[1].volume);assert.deepEqual(rows[0].verification,rows[1].verification);
});
