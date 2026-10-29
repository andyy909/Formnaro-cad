import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Worker} from 'node:worker_threads';
import loader from '../cad-kernel-build/runtime/formnaro_cad.js';
import {createCadProject} from '../src/cad-project.js';
import {createCadService} from '../src/cad-service.js';
import {createCadTransactions} from '../src/cad-transactions.js';
import {createCadToolsNative} from '../src/cad-tools-native.js';
import {createCadController} from '../src/cad-controller.js';
import {encodeFnpackProject,createFnpackResolver} from '../src/cad-fnpack-data.js';
import {openFnpack,writeFnpack} from '../backend/fnpack.cjs';
const oc=await loader({print:()=>{},printErr:()=>{}});
const factory=()=>{const w=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),a={postMessage:m=>w.postMessage(m),terminate:()=>w.terminate()};w.on('message',data=>a.onmessage?.({data}));w.on('error',e=>a.onerror?.(e));return a;};
test('lazy FNPACK export reconstructs a STEP bore and rejects forged face identities',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'formnaro-step-export-'));t.after(async()=>{assert.equal(path.dirname(dir),os.tmpdir());assert.ok(path.basename(dir).startsWith('formnaro-step-export-'));await fs.rm(dir,{recursive:true,force:true});});const service=createCadService({oc});try{
  const source=await service.rebuild(createCadProject({nodes:[service.nativeNode({type:'box',size:[40,20,10]},{id:'source'})]})),step=service.stepNode(service.exportStep(source,{ids:['source']}),{id:'step'}),store=createCadTransactions({initial:createCadProject({nodes:[step]}),build:(p,c)=>service.rebuild(p,{baseline:c.baseline})}),tools=createCadToolsNative({oc,service,transactions:store});store.apply(await tools.previewDrill({id:'step',resultId:'bore',reference:{ray:{origin:[0,0,30],direction:[0,0,-1]}},diameter:4,associative:true,revision:store.revision()}));const valid=store.snapshot();
  for(const mode of ['valid','bad-face','bad-exit']){
   const input=structuredClone(valid);if(mode==='bad-face')input.nodes[0].drill.faceKey='0'.repeat(64);if(mode==='bad-exit')input.nodes[0].drill.exitFaceKey='0'.repeat(64);const encoded=encodeFnpackProject(input),file=path.join(dir,mode+'.fnpack');await writeFnpack(file,{project:encoded.project,blocks:encoded.blocks});const opened=await openFnpack(file),reads=[],resolver=createFnpackResolver({readBlock:async sha=>{reads.push(sha);return opened.read(sha);}}),cad=createCadController({createWorker:factory,resolveGeometry:resolver.hydrate,getDisplayIds:()=>[]});
   try{await cad.open(opened.index.project);assert.equal(reads.length,0);const before=cad.serialize();if(mode==='valid'){
     const exported=await cad.exportModel({format:'step',ids:['bore']}),readback=service.stepNode(exported.data,{id:'readback'});assert.ok(Math.abs(readback.stats.volume-valid.nodes[0].stats.volume)<1e-5);assert.ok(reads.length>0);const svg=await cad.query('svgProjection',{ids:['bore']});assert.ok(svg.svg.includes('<svg'));const drawing=await cad.query('drawingProjection',{ids:['bore'],view:'top'});assert.ok(drawing.curves.length);
    }else{
     await assert.rejects(()=>cad.exportModel({format:'step',ids:['bore']}),{code:'CAD_DRILL_REFERENCE_CHANGED'});await assert.rejects(()=>cad.query('svgProjection',{ids:['bore']}),{code:'CAD_DRILL_REFERENCE_CHANGED'});await assert.rejects(()=>cad.query('drawingProjection',{ids:['bore'],view:'top'}),{code:'CAD_DRILL_REFERENCE_CHANGED'});
    }assert.equal(cad.serialize(),before);
   }finally{cad.dispose();await opened.close();}
  }
 }finally{service.dispose();}
});
