import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {Worker} from 'node:worker_threads';
import library from '../backend/ai-tool-library.cjs';import freecad from '../backend/freecad.cjs';
import {createCadController} from '../src/cad-controller.js';import {createCadAutomationAccess} from '../src/cad-automation-access.js';
const factory=()=>{const worker=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),adapter={postMessage:v=>worker.postMessage(v),terminate:()=>worker.terminate()};worker.on('message',v=>adapter.onmessage?.({data:v}));worker.on('error',e=>adapter.onerror?.(e));return adapter;};
test('same native FreeCAD script succeeds with a physical data root and its application junction',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-native-junction-')),physical=path.join(root,'physical'),linked=path.join(root,'data-junction');fs.mkdirSync(physical);fs.symlinkSync(physical,linked,process.platform==='win32'?'junction':'dir');
 const previous=globalThis.offlinecadDesktop,volumes=[];
 try{for(const parent of [physical,linked]){
  const tools=library.createToolLibrary(path.join(parent,'KI-Werkzeuge'));assert.equal(tools.status().available,true);
  globalThis.offlinecadDesktop={aiToolLibrary:request=>tools.request(request),runFreeCADReply:async request=>{try{return {ok:true,value:await freecad.run(request)};}catch(error){return {ok:false,error:error.message,code:error.code,feedback:error.feedback};}},cancelFreeCAD:async()=>true};
  const controller=createCadController({createWorker:factory});try{
   const access=createCadAutomationAccess({controller,getModelChecksEnabled:()=>false}),before=controller.serialize(),depth=controller.state().undo;
   const result=await access.preview({revision:controller.revision(),commands:[{op:'tool',engine:'freecad',as:'native',operation:{kind:'build',inputs:[],script:{version:1,name:'Data path regression',code:'result = Part.makeBox(2, 3, 4)'}}}],checks:[]});
   const model=controller.getPreview(result.previewId).project;assert.ok(Math.abs(model.nodes[0].stats.volume-24)<1e-6);volumes.push(model.nodes[0].stats.volume);assert.ok(tools.request({action:'list'}).total>=1);assert.equal(controller.serialize(),before);assert.equal(controller.state().undo,depth);access.discard(result.previewId);
  }finally{controller.dispose();}
 }}finally{globalThis.offlinecadDesktop=previous;}
 assert.equal(volumes.length,2);assert.ok(Math.abs(volumes[0]-volumes[1])<1e-9);
});
