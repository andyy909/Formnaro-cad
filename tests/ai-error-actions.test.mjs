import test from 'node:test';import assert from 'node:assert/strict';
import {aiFeedback} from '../src/ai-feedback.js';
import {createCadWorkerRuntime} from '../src/cad-worker-runtime.js';
import {createCadProject} from '../src/cad-project.js';
test('failure action distinguishes invalid input, prerequisites and a retired kernel',()=>{
 for(const [code,nextAction,retryable]of [['INVALID_COMMAND','change_input',true],['AI_TOOL_LIBRARY_PATH','fix_prerequisite',false],['FREECAD_RUNTIME_INVALID','fix_prerequisite',false],['CAD_KERNEL_FATAL','stop',false],['ABORTED','stop',false]]){
  const feedback=aiFeedback({code,message:'failure',feedback:{phase:'construction'} });assert.equal(feedback.code,code);assert.equal(feedback.nextAction,nextAction);assert.equal(feedback.retryable,retryable);assert.equal(feedback.phase,'construction');assert.equal(feedback.applied,false);
 }
});
test('native fatal response gives the same stop action in message and structured feedback',async()=>{
 let receive;const reply=new Promise(resolve=>{receive=resolve;});const runtime=createCadWorkerRuntime({createKernel:async()=>{throw new WebAssembly.RuntimeError('injected trap');},postMessage:receive});
 runtime.receive({type:'initialize',generation:1,confirmed:createCadProject()});runtime.receive({type:'compute',generation:1,id:1,revision:'r',request:{job:'scene'}});
 const error=await reply;assert.equal(error.code,'CAD_KERNEL_FATAL');assert.equal(error.feedback.nextAction,'stop');assert.equal(error.feedback.retryable,false);assert.doesNotMatch(error.message,/erneut versuchen/);assert.equal(error.message,error.feedback.message);runtime.dispose();
});
