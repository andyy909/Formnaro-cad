import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {createCadController} from '../src/cad-controller.js';
import {createCadAutomationAccess} from '../src/cad-automation-access.js';

test('legacy external context without arguments equals the explicit full context and keeps validation',async()=>{
  const controller=createCadController({createWorker:()=>{
    const worker=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url));
    const adapter={postMessage:value=>worker.postMessage(value),terminate:()=>worker.terminate()};
    worker.on('message',value=>adapter.onmessage?.({data:value}));
    worker.on('error',error=>adapter.onerror?.(error));
    return adapter;
  }});
  try{
    const access=createCadAutomationAccess({controller});
    const full=await access.dispatch('context',{});
    assert.deepEqual(await access.dispatch('context'),full);
    assert.equal(full.profile,'full');
    assert.equal((await access.dispatch('context',{profile:'compact'})).profile,'compact');
    for(const invalid of [null,[],{profile:'unknown'},{programHelpOnly:true}]){
      await assert.rejects(access.dispatch('context',invalid),{code:'INVALID_CONTEXT_PROFILE'});
    }
  }finally{controller.dispose();}
});
