import test from 'node:test';import assert from 'node:assert/strict';import {Worker} from 'node:worker_threads';
import {createCadController} from '../src/cad-controller.js';
import {createCadProject} from '../src/cad-project.js';
import {createAITaskEvidence} from '../src/cad-ai-task-evidence.js';
const factory=file=>()=>{const w=new Worker(new URL(file,import.meta.url)),a={postMessage:v=>w.postMessage(v),terminate:()=>w.terminate()};w.on('message',data=>a.onmessage?.({data}));w.on('error',error=>a.onerror?.(error));return a;};
const cube={id:'source',kind:'mesh',name:'Original',layerId:'default',folderId:null,color:'#ee8800',opacity:1,transform:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],mesh:{verts:[0,0,0,2,0,0,0,2,0,0,0,2],triangles:[0,2,1,0,1,3,0,3,2,1,2,3]}};
const converterError=()=>Object.assign(Error('Converter repair rejected on the original mesh'),{code:'CAD_CONVERTER_REPAIR_REJECTED',feedback:{retryable:true,toolFailure:{scope:'converter-only'}}});
function controller(t,extra={}){const cad=createCadController({initial:createCadProject({nodes:[cube]}),createWorker:factory('./fixtures/cad-node-worker.mjs'),createMeshWorker:factory('./fixtures/mesh-engine-node-worker.mjs'),...extra});t.after(()=>cad.dispose());return cad;}
const convert=target=>({kind:'batch',commands:[{op:'tool',engine:'converter',operation:{kind:'convert',target}}]});

test('A fresh controller restores exact working files and the failed converter route without running saved programs or repeating the converter',async t=>{
 let calls=0;const cad=controller(t,{convertModel:async()=>{calls++;throw converterError();}});cad.beginAITask();const before=cad.serialize();
 const text='Original measured profile: Äußere Kontur\n'+JSON.stringify({diameter:3.125,points:[[1,2],[3,4]]});await cad.analyze([{id:'save',engine:'workspace',kind:'files',options:{action:'write',path:'measure/original.json',text}}]);await assert.rejects(cad.preview(convert('source')),{code:'CAD_CONVERTER_REPAIR_REJECTED'});const saved=JSON.parse(JSON.stringify(cad.captureAITaskRuntime()));assert.equal(calls,1);assert.equal(cad.serialize(),before);
 const fresh=controller(t,{convertModel:async()=>{calls++;throw converterError();}});assert.equal(fresh.revision(),cad.revision());fresh.restoreAITaskRuntime(saved);assert.deepEqual(fresh.captureAITaskRuntime(),saved);await assert.rejects(fresh.preview(convert({path:[],rootId:'source'})),{code:'CAD_CONVERTER_REPAIR_REJECTED'});assert.equal(calls,1);
 const read=await fresh.analyze([{id:'read',engine:'workspace',kind:'files',options:{action:'read',path:'measure/original.json'}}]);assert.equal(read.results[0].value,text);assert.equal(fresh.serialize(),before);
 fresh.beginAITask();await assert.rejects(fresh.preview(convert('source')));assert.equal(calls,2);
});
test('Invalid, oversized or stale runtime snapshots do not partially erase current files or converter protection',async t=>{
 const cad=controller(t,{convertModel:async()=>{throw converterError();}});cad.beginAITask();await cad.analyze([{id:'write',engine:'workspace',kind:'files',options:{action:'write',path:'keep.txt',text:'last valid task'}}]);await assert.rejects(cad.preview(convert('source')));const original=cad.captureAITaskRuntime();
 for(const altered of [{...original,revision:'another'},{...original,files:{'../host':'denied'}},{...original,files:{'large.txt':'x'.repeat(32*1024*1024+1)}},{...original,blockedConversions:[...original.blockedConversions,...original.blockedConversions]},{...original,blockedConversions:[{key:'invalid',error:{code:'X',message:'invalid'}}]}]){assert.throws(()=>cad.restoreAITaskRuntime(altered));assert.deepEqual(cad.captureAITaskRuntime(),original);}
});
test('Full failure checkpoints preserve long original diagnostic keys and repetition counts across compaction and restart',()=>{
 const evidence=createAITaskEvidence('r'),message='Failure cause '.repeat(110);evidence.failed(1,{code:'NATIVE_FAIL',message},{commands:[{op:'python'}]});evidence.failed(2,{code:'NATIVE_FAIL',message},{commands:[{op:'python'}]});const publicView=evidence.snapshot();assert(publicView.failures[0].message.length<message.length);
 const restored=createAITaskEvidence('r',JSON.parse(JSON.stringify(evidence.checkpoint())));restored.failed(3,{code:'NATIVE_FAIL',message},{commands:[{op:'python'}]});assert.equal(restored.checkpoint().failures.length,1);assert.equal(restored.checkpoint().failures[0].occurrences,3);assert.equal(restored.checkpoint().failures[0].message,message.slice(0,1500));
 for(const value of [{...evidence.checkpoint(),revision:'old'},{...evidence.checkpoint(),failures:[{...evidence.checkpoint().failures[0],secret:'untrusted'}]},{...evidence.checkpoint(),failures:[{...evidence.checkpoint().failures[0],occurrences:80}]}])assert.throws(()=>createAITaskEvidence('r',value),{code:'AI_TASK_EVIDENCE_INVALID'});
});
test('Native bore expected geometry survives full evidence checkpoints even though bulky measured objects stay in the original diagnostic',()=>{
 const memory=createAITaskEvidence('r');memory.failed(1,{code:'AI_RESULT_MISMATCH',message:'Bore mismatch',feedback:{checkIndex:1,checkKind:'bore',expected:{diameter:6,from:[0,0,0],to:[0,0,10],minWall:1},actual:{diameter:4,axis:[0,0,1]}}},{commands:[{op:'feature'}]});const original=JSON.parse(JSON.stringify(memory.checkpoint()));assert.equal(original.failures[0].actual,undefined);const restored=createAITaskEvidence('r',original);assert.deepEqual(JSON.parse(JSON.stringify(restored.checkpoint())),original);
});
test('Measurement artifacts restored from an application snapshot remain read-only through model workspace queries',async t=>{
 const cad=controller(t);cad.beginAITask();const saved=cad.captureAITaskRuntime();saved.files['analysis-programs/program.py']='exact observed source';saved.files['analysis-results/result.json']='{"diameter":3.125}';cad.restoreAITaskRuntime(saved);const original=cad.captureAITaskRuntime();
 for(const options of [{action:'write',path:'analysis-results/result.json',text:'forged'},{action:'remove',path:'analysis-programs/program.py'},{action:'replace',files:{}}])await assert.rejects(cad.analyze([{id:'tamper',engine:'workspace',kind:'files',options}]),{code:'AI_WORKSPACE_READONLY'});assert.deepEqual(cad.captureAITaskRuntime(),original);
});

test('A full working directory rejects a complete analysis artifact bundle atomically without leaving an orphan program',async t=>{
 let executions=0;const cad=controller(t,{runScript:async()=>{executions++;return {diameter:3.125};}});cad.beginAITask();
 const full=cad.captureAITaskRuntime();full.files=Object.fromEntries(Array.from({length:255},(_,i)=>['measure/retained-'+i+'.json',JSON.stringify({i})]));cad.restoreAITaskRuntime(full);const before=cad.serialize();
 await assert.rejects(cad.analyze([{id:'complete',engine:'javascript',kind:'run',options:{code:'return {diameter:3.125};'}}]),{code:'AI_WORKSPACE_INVALID'});
 assert.equal(executions,1);assert.deepEqual(cad.captureAITaskRuntime(),full);assert.equal(cad.serialize(),before);assert.equal(cad.state().busy,false);
});
