import test from 'node:test';import assert from 'node:assert/strict';
import {createAIWorkspace} from '../src/cad-ai-workspace.js';
import {validateAIAnalysis,localAIAnalysisResult} from '../src/cad-ai-analysis.js';
import {runCadAIRequest} from '../src/cad-ai-request.js';
import {aiFeedback} from '../src/ai-feedback.js';
import {createCadController} from '../src/cad-controller.js';
import {Worker} from 'node:worker_threads';

test('Large Python reports stay complete in task files and can be read without remeasurement',async()=>{
 const large={value:{details:'measured contour '.repeat(2000),points:Array.from({length:4000},(_,i)=>[i,i*i])},stdout:'',stderr:'',pythonVersion:'3.14'};
 let runs=0,path;
 const factory=()=>{const w=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),a={postMessage:v=>w.postMessage(v),terminate:()=>w.terminate()};w.on('message',v=>a.onmessage?.({data:v}));w.on('error',e=>a.onerror?.(e));return a;};
 const cad=createCadController({createWorker:factory,runPython:async({call})=>{runs++;if(runs===1)return large;const text=await call('query',{engine:'workspace',kind:'files',options:{action:'read',path}});assert.deepEqual(JSON.parse(text),large);return {value:{count:JSON.parse(text).value.points.length}};}});
 try{
  const before=cad.serialize(),q={id:'survey',engine:'python',kind:'run',options:{code:'complete numerical survey',name:'Survey'}};
  const first=await cad.analyze([q]);path=first.results[0].value.workspaceResult.path;
  assert.equal(first.results[0].value.workspaceResult.complete,true);
  const source=await cad.analyze([{id:'source',engine:'workspace',kind:'files',options:{action:'read',path:first.results[0].program.path}}]);assert.equal(source.results[0].value,q.options.code);
  const second=await cad.analyze([{...q,id:'summary',options:{code:'read saved survey'}}]);assert.equal(second.results[0].value.value.count,4000);assert.equal(runs,2);assert.equal(cad.serialize(),before);
 }finally{cad.dispose();}
});

test('Large atomic geometry and report schemas fit the budget without changing any coordinates',()=>{
 for(const value of [{kind:'meshSectionContours',loops:[{elements:Array.from({length:4000},(_,i)=>({point:[i,i+0.123,0]}))}]},{value:Object.fromEntries(Array.from({length:24},(_,i)=>['key'+i,Object.fromEntries(Array.from({length:24},(_,j)=>['veryLongFieldName'+j,'x'.repeat(50)]))]))}]){
  let exact;const r=localAIAnalysisResult(value,{atomic:true,budget:1600,save:text=>{exact=text;return 'results/full.json';}});assert.deepEqual(JSON.parse(exact),value);assert.ok(JSON.stringify(r).length<=1600);assert.equal(r.workspaceResult.complete,true);
 }
});

test('Successful measurement sources use local references and clear obsolete correction feedback',async()=>{
 let calls=0;const scene=()=>({revision:'r'}),program={name:'survey',language:'python',path:'analysis-programs/survey.py'};
 const r=await runCadAIRequest({input:{},maxSteps:8,visualReview:false,access:{scene,context:()=>({}),analyze:async()=>({results:[{id:'survey',program,value:{count:10}}]}),preview:async()=>({previewId:'p'})},generate:async args=>{
  calls++;if(calls===1)return {revision:'r',analysis:[{id:'bad',engine:'invalid',kind:'run'}]};
  if(calls===2){assert.ok(args.correction);return {revision:'r',analysis:[{id:'survey',engine:'python',kind:'run',options:{code:'result = expensive_measurement()'}}]};}
  assert.equal(args.correction,'');assert.equal(args.analysisResults[0].requests[0].options,undefined);assert.deepEqual(args.analysisResults[0].requests[0].program,program);return {revision:'r',commands:[]};
 }});assert.equal(r.proposal.previewId,'p');assert.equal(calls,3);
});

test('Large FreeCAD failures retain source versus operand validity and BOP errors',()=>{
 const report={valid:true,closed:true,solids:1,check:'BOPAlgo SelfIntersect',edgeDetails:Array.from({length:500},(_,i)=>({index:i,note:'x'.repeat(100)})),inputChecks:[{name:'body',check:'passed',valid:true}],operandChecks:[{name:'centralTool',check:'BOPAlgo SelfIntersect',valid:false}]};
 const f=aiFeedback({code:'FREECAD_FAILED',message:'Rejected final cut',feedback:{geometryCheck:report}});assert.equal(f.geometryCheck.check,report.check);assert.equal(f.geometryCheck.inputChecks[0].check,'passed');assert.equal(f.geometryCheck.operandChecks[0].valid,false);assert.equal(f.geometryCheck.topologyOmitted,true);assert.ok(JSON.stringify(f).length<2000);
});

test('A repeated unsuccessful request stops early and reports the concrete last construction error',async()=>{
 await assert.rejects(runCadAIRequest({input:{},maxSteps:8,maxCorrections:8,visualReview:false,access:{scene:()=>({revision:'r'}),context:()=>({}),preview:async()=>{throw Object.assign(Error('Central loft cut failed BOP validation'),{code:'FREECAD_FAILED'});}},generate:async()=>({revision:'r',commands:[]})}),e=>e.code==='AI_TASK_STALLED'&&e.taskProgress.usedSteps===3&&e.message.includes('Central loft cut failed BOP validation')&&e.feedback.lastFailure.code==='FREECAD_FAILED');
});
test('Task files retain exact data atomically and reject escape paths and excessive bytes',()=>{
 const w=createAIWorkspace({maxBytes:100,maxFiles:2});w.request({action:'write',path:'measure/one.json',text:'{"r":3.125}'});assert.equal(w.request({action:'read',path:'measure/one.json'}),'{"r":3.125}');
 for(const path of ['../secret','C:/secret','/secret','a\\b','a/../b'])assert.throws(()=>w.request({action:'write',path,text:'x'}));
 assert.throws(()=>w.request({action:'write',path:'too-large',text:'x'.repeat(101)}));assert.equal(w.request({action:'list'}).length,1);w.clear();assert.equal(w.request({action:'list'}).length,0);
});
test('Large complete analysis programs are permitted; nested capabilities and unsupported fields are not',()=>{
 const code='# measured code\n'.repeat(2000);assert.equal(validateAIAnalysis([{id:'measure',engine:'python',kind:'run',options:{code}}])[0].options.code,code);
 assert.throws(()=>validateAIAnalysis([{id:'measure',engine:'python',kind:'run',options:{code,executable:'python.exe'}}]));assert.throws(()=>validateAIAnalysis([{id:'measure',engine:'python',kind:'run',options:{code:'x'.repeat(100001)}}]));
});
test('Converter route failure permits measured reconstruction while original checks stay pinned',async()=>{
 let calls=0,previews=0,begins=0;const checks=[{kind:'size',target:'$part',expected:[10,20,30],space:'edit'}],scene=()=>({revision:'r',selectionTargets:[]});
 const error=Object.assign(Error('Converter topology rejected; use measured reconstruction'),{code:'CAD_CONVERTER_TOPOLOGY',feedback:{retryable:true,toolFailure:{scope:'converter-only'}}});
 const outcome=await runCadAIRequest({input:{},maxSteps:24,visualReview:false,access:{beginTask:()=>begins++,scene,context:()=>({}),analyze:async()=>({results:[{value:{diameter:4}}]}),preview:async request=>{assert.deepEqual(request.checks,checks);if(++previews===1)throw error;return {previewId:'measured-cad'};}},generate:async input=>{if(++calls===1)return {revision:'r',commands:[{op:'tool',engine:'converter'}],checks};if(calls===2){assert.match(input.correction,/converter-only/);return {revision:'r',analysis:[{id:'measure',engine:'python',kind:'run',options:{code:'result={"diameter":4}'}}]};}return {revision:'r',commands:[{op:'python',code:'reconstruct from measured profiles'}],checks:[]};}});
 assert.equal(outcome.proposal.previewId,'measured-cad');assert.equal(begins,1);assert.equal(outcome.analysisRounds,1);assert.equal(aiFeedback(error).toolFailure.retrySameTool,false);
});
