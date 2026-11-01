import test from 'node:test';import assert from 'node:assert/strict';import {Worker} from 'node:worker_threads';
import {createCadController} from '../src/cad-controller.js';import {createCadAutomationAccess} from '../src/cad-automation-access.js';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {startBridge} from '../backend/api-bridge.cjs';

test('external discard clears only its completed native preview and frees another attempt without applying geometry',async()=>{
 let scene,displayed=null;const cad=createCadController({createWorker:()=>{const w=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),a={postMessage:v=>w.postMessage(v),terminate:()=>w.terminate()};w.on('message',data=>a.onmessage?.({data}));w.on('error',e=>a.onerror?.(e));return a;}});
 const refresh=async()=>{scene=await cad.describe();},access=createCadAutomationAccess({controller:cad,getScene:()=>scene,refresh,isBusy:()=>displayed!==null,onDiscardPreview:id=>{if(displayed===id)displayed=null;}});
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-discard-')),bridge=await startBridge({directory,rpc:(method,args)=>access.dispatch(method,args)});
 try{await refresh();const before=cad.serialize(),request={revision:cad.revision(),commands:[{op:'create',type:'box',size:[20,30,4]}]},p=await access.preview(request);displayed=p.previewId;
  await assert.rejects(access.preview(request),/laufende Bearbeitung/);
  await assert.rejects(access.dispatch('discard',{previewId:p.previewId,revision:'old'}),{code:'STALE_REVISION'});
  await assert.rejects(access.dispatch('discard',{previewId:'foreign',revision:p.revision}),{code:'PREVIEW_MISSING'});assert.equal(displayed,p.previewId);assert(cad.getPreview(p.previewId));
  const reply=await fetch(bridge.descriptor.url+'/v1/discard',{method:'POST',headers:{Authorization:'Bearer '+bridge.descriptor.token,'Content-Type':'application/json'},body:JSON.stringify({previewId:p.previewId,revision:p.revision})});assert.equal(reply.status,200);
  assert.deepEqual(await reply.json(),{discarded:true,previewId:p.previewId,revision:p.revision});assert.equal(displayed,null);assert.equal(cad.getPreview(p.previewId),undefined);
  const retry=await access.preview(request);assert(retry.previewId);access.discard(retry.previewId);assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,0);assert.equal(cad.state().previews,0);
  const measurements=await fetch(bridge.descriptor.url+'/v1/analysis',{method:'POST',headers:{Authorization:'Bearer '+bridge.descriptor.token,'Content-Type':'application/json'},body:JSON.stringify({revision:cad.revision(),queries:[{id:'joints',engine:'app',kind:'joints'}]})});assert.equal(measurements.status,200);assert.equal((await measurements.json()).results.length,1);
  await assert.rejects(access.dispatch('analysis',{revision:'old',queries:[{id:'joints',engine:'app',kind:'joints'}]}),{code:'STALE_REVISION'});
  await assert.rejects(access.dispatch('analysis',{revision:cad.revision(),queries:[{id:'code',engine:'python',kind:'run',options:{code:'result=1'}}]}),/Extern nur native/);assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,0);
  const built=await access.preview({revision:cad.revision(),commands:[{op:'create',type:'box',size:[10,10,10],pos:[0,0,5],as:'a'},{op:'create',type:'box',size:[10,10,10],pos:[8,0,5],as:'b'}]});await access.apply({previewId:built.previewId,revision:built.revision});const confirmed=cad.serialize(),depth=cad.state().undo;
  const measured=await access.dispatch('analysis',{revision:cad.revision(),queries:[{id:'overlap',engine:'cad',kind:'collision',options:{leftId:built.aliases.a,rightId:built.aliases.b}}]});assert(Math.abs(measured.results[0].value.volume-200)<1e-5,JSON.stringify(measured));assert.equal(cad.serialize(),confirmed);assert.equal(cad.state().undo,depth);
 }finally{await bridge.close();fs.rmSync(directory,{recursive:true,force:true});cad.dispose();}
});

