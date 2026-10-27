import test from 'node:test';import assert from 'node:assert/strict';import {Worker} from 'node:worker_threads';
import freecad from '../backend/freecad.cjs';
import {createCadController} from '../src/cad-controller.js';
import {createCadAutomationAccess} from '../src/cad-automation-access.js';
import {runCadAIRequest} from '../src/cad-ai-request.js';
const factory=()=>{const w=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),a={postMessage:v=>w.postMessage(v),terminate:()=>w.terminate()};w.on('message',data=>a.onmessage?.({data}));w.on('error',error=>a.onerror?.(error));return a;};
async function setup(t,initial){const cad=createCadController({createWorker:factory,...(initial?{initial}:{})});t.after(()=>cad.dispose());let scene;const refresh=async()=>{scene=await cad.describe();};await refresh();const access=createCadAutomationAccess({controller:cad,getScene:()=>scene,refresh});return {cad,access,refresh};}
const input={prompt:'Preserve the model, measure and construct the part',usageTaskId:'same-task-through-restart'};

test('A resumed real request reads its exact large FreeCAD measurement and complete program from a fresh controller without remeasurement or budget reset',async t=>{
 const previous=globalThis.offlinecadDesktop;let nativeCalls=0;
 globalThis.offlinecadDesktop={runFreeCADReply:async args=>{nativeCalls++;const {requestId,...request}=args;return {ok:true,value:await freecad.run(request)};}};t.after(()=>{globalThis.offlinecadDesktop=previous;});
 const first=await setup(t),before=first.cad.serialize();let current=true,saved;
 const modules={'measurement.py':'def radius(): return 3.125\n'},code="from measurement import radius\ncurve=Part.makeCircle(radius());measurements={'radius':curve.Curve.Radius,'points':[[i,i*i] for i in range(6000)]}";
 await assert.rejects(runCadAIRequest({input,maxSteps:7,visualReview:false,isCurrent:()=>current,access:first.access,onProgress:event=>{if(event.phase==='analysis'){saved=JSON.parse(JSON.stringify(event));current=false;}},generate:async args=>({revision:args.scene.revision,analysis:[{id:'nativeMeasure',engine:'freecad',kind:'inspect',options:{script:{version:1,code,modules}}}]})}),{name:'AbortError'});
 assert.equal(nativeCalls,1);assert.equal(saved.progress.usedSteps,1);assert.equal(first.cad.serialize(),before);const path=saved.analysisResults[0].results[0].value.workspaceResult.path;assert.equal(saved.workspace.files[saved.analysisResults[0].results[0].program.path],code);assert.equal(JSON.parse(saved.workspace.files[path]).measurements.radius,3.125);assert.deepEqual(JSON.parse(saved.workspace.files[saved.analysisResults[0].results[0].program.bundlePath]).options.script.modules,modules);
 const second=await setup(t,JSON.parse(before));let generated=0;
 const outcome=await runCadAIRequest({input,maxSteps:7,resume:saved,visualReview:false,access:{...second.access,inspectFreeCADPreview:undefined},generate:async args=>{generated++;assert.equal(args.context.agentWorkflow.step,2);assert.equal(args.context.agentWorkflow.remainingSteps,5);assert.equal(args.context.agentWorkflow.analysisRounds,1);assert.equal(args.analysisResults[0].results[0].value.workspaceResult.path,path);assert.equal(JSON.parse(second.cad.captureAITaskRuntime().files[path]).measurements.points.length,6000);return {revision:args.scene.revision,commands:[{op:'create',type:'box',as:'part',size:[10,5,3]}],checks:[{kind:'volume',target:'$part',expected:150}]};}});
 assert.equal(generated,1);assert.equal(nativeCalls,1);assert.equal(outcome.taskProgress.usedSteps,2);assert.equal(outcome.analysisRounds,1);assert.equal(outcome.proposal.verification.checks[0].actual,150);assert.equal(second.cad.serialize(),before);second.access.discard(outcome.proposal.previewId);
});

async function interruptedFailure(t){const first=await setup(t);let saved,current=true;await assert.rejects(runCadAIRequest({input,maxSteps:7,visualReview:false,isCurrent:()=>current,access:{...first.access,preview:async()=>{throw Object.assign(Error('Original native route failed'),{code:'NATIVE_FAIL'});}},onProgress:event=>{if(event.phase==='failure'){saved=JSON.parse(JSON.stringify(event));current=false;}},generate:async args=>({revision:args.scene.revision,commands:[]})}),{name:'AbortError'});return {saved,project:JSON.parse(first.cad.serialize())};}

test('Resume keeps cumulative failure counts, the complete correction and the remaining request budget',async t=>{
 const {saved,project}=await interruptedFailure(t),second=await setup(t,project);let generated=0;
 await assert.rejects(runCadAIRequest({input,maxSteps:7,resume:saved,visualReview:false,access:{...second.access,preview:async()=>{throw Object.assign(Error('Original native route failed'),{code:'NATIVE_FAIL'});}},generate:async args=>{generated++;assert.equal(args.context.agentWorkflow.step,generated+1);assert.equal(args.context.taskEvidence.failures[0].occurrences,generated);assert.match(args.correction,/Original native route failed/);return {revision:args.scene.revision,commands:[]};}}),e=>e.code==='AI_TASK_STALLED'&&e.taskProgress.usedSteps===3);
 assert.equal(generated,2);assert.equal(second.cad.state().previews,0);
});
test('Altered project, input, constraints, budget, selection or referenced files block continuation before any reset, provider call or local job',async t=>{
 const {saved,project}=await interruptedFailure(t),second=await setup(t,project);second.cad.beginAITask();await second.cad.analyze([{id:'keep',engine:'workspace',kind:'files',options:{action:'write',path:'keep.txt',text:'Do not erase'}}]);const runtime=second.cad.captureAITaskRuntime();let calls=0;
 const variants=[{input:{...input,prompt:'another task'}},{maxSteps:8},{access:{...second.access,scene:()=>({...second.access.scene(),selectionTargets:[{rootId:'changed',path:[]}]})}},{resume:{...saved,workspace:{...saved.workspace,files:{'../invalid':'escape'}}}},{resume:{...saved,progress:{...saved.progress,usedSteps:7}}}];
 for(const change of variants)await assert.rejects(runCadAIRequest({input,maxSteps:7,resume:saved,visualReview:false,access:second.access,generate:async()=>{calls++;return {};},...change}));assert.equal(calls,0);assert.deepEqual(second.cad.captureAITaskRuntime(),runtime);
 const changed=second.cad.snapshot();changed.name='different project';await second.cad.open(changed);await second.refresh();await assert.rejects(runCadAIRequest({input,maxSteps:7,resume:saved,access:second.access,generate:async()=>{calls++;}}),{code:'STALE_REVISION'});assert.equal(calls,0);
});
test('An older intermediate candidate checkpoint without completed local bookkeeping is refused',async t=>{
 const {saved,project}=await interruptedFailure(t),second=await setup(t,project);let calls=0;
 await assert.rejects(runCadAIRequest({input,maxSteps:7,resume:{...saved,phase:'candidate'},access:second.access,generate:async()=>{calls++;}}),{code:'AI_TASK_RESUME_PENDING_CANDIDATE'});assert.equal(calls,0);
});

test('An interrupted candidate review recreates fresh views and native proofs with the same visual and provider budget',async t=>{
 const first=await setup(t);let current=true,saved,firstCaptures=0;
 await assert.rejects(runCadAIRequest({input,maxSteps:7,isCurrent:()=>current,access:{...first.access,inspectFreeCADPreview:undefined,inspectPreview:async()=>{firstCaptures++;throw Error('Capture must follow the durable candidate checkpoint');}},onProgress:event=>{if(event.phase==='candidate'){saved=JSON.parse(JSON.stringify(event));saved.candidate.project=first.access.getPreview(event.candidate.proposal.previewId);current=false;}},generate:async args=>({revision:args.scene.revision,commands:[{op:'create',type:'box',as:'part',size:[10,5,3]}],checks:[{kind:'volume',target:'$part',expected:150}]})}),{name:'AbortError'});
 assert.equal(firstCaptures,0);assert.equal(saved.candidateSettled,true);assert.equal(saved.counters.visualReviews,1);assert.equal(saved.progress.candidates[0].count,1);
 const second=await setup(t,first.cad.snapshot()),before=second.cad.serialize();let captures=0,independent=0,generated=0,freshId;
 const outcome=await runCadAIRequest({input,maxSteps:7,resume:saved,access:{...second.access,inspectFreeCADPreview:async()=>{independent++;return {status:'checked',passed:true};},inspectPreview:async previewId=>{captures++;freshId=previewId;return {previewId,revision:second.cad.revision(),images:[],views:[]};}},generate:async args=>{generated++;assert.equal(args.context.agentWorkflow.step,2);assert.equal(args.visualFeedback.previewId,freshId);assert.notEqual(freshId,saved.candidate.proposal.previewId);assert.equal(args.visualFeedback.independentCheck.passed,true);assert.equal(args.visualFeedback.verification.checks[0].actual,150);return {revision:args.scene.revision,review:{previewId:freshId,accepted:true,observations:'Fresh restored views accepted'}};}});
 assert.equal(generated,1);assert.equal(captures,1);assert.equal(independent,1);assert.equal(outcome.visualReviews,1);assert.equal(outcome.taskProgress.usedSteps,2);assert.equal(outcome.proposal.visualReview.status,'reviewed');assert.equal(outcome.proposal.independentCheck.passed,true);assert.equal(second.cad.serialize(),before);second.access.discard(outcome.proposal.previewId);
});

test('A fresh controller rebuilds the saved native candidate with new identity and fresh failed checks, preserving cumulative progress and one explicit Apply',async t=>{
 const first=await setup(t);await first.cad.execute({kind:'batch',commands:[{op:'create',type:'box',name:'Protected original',size:[3,4,5],pos:[-50,0,0]}]});await first.refresh();const original=first.cad.snapshot().nodes[0];let saved,current=true;
 const checks=[{kind:'size',target:'$part',space:'worldAxes',expected:[60,40,6]}];
 const requirements={purpose:'technical',objective:'60 by 40 by 6 mm, preserve original',checks,assumptions:[],protectedTargets:[{rootId:original.id,path:[]}]};
 await assert.rejects(runCadAIRequest({input,requirements,maxSteps:7,visualReview:false,isCurrent:()=>current,access:first.access,onProgress:event=>{if(event.phase==='failure'){saved=JSON.parse(JSON.stringify(event));saved.candidate.project=first.access.getPreview(event.candidate.proposal.previewId);current=false;}},generate:async args=>({revision:args.scene.revision,commands:[{op:'create',type:'box',as:'part',size:[55,40,6]}],checks})}),{name:'AbortError'});
 const second=await setup(t,first.cad.snapshot()),before=second.cad.serialize(),undo=second.cad.state().undo;let calls=0;
 // Public cached measurements must not authorize fresh Apply.
 saved.candidate.proposal.verification={version:1,passed:true,checks:[{...checks[0],actual:[60,40,6],passed:true}]};
 const outcome=await runCadAIRequest({input,requirements,maxSteps:7,resume:saved,visualReview:false,access:second.access,generate:async args=>{calls++;return {revision:args.scene.revision,commands:[{op:'create',type:'box',as:'part',size:[55,40,6]}]};}});
 assert.equal(calls,2);assert.equal(outcome.taskProgress.usedSteps,3);assert.equal(outcome.taskProgress.stop.reason,'repeated-failure');assert.notEqual(outcome.proposal.previewId,saved.candidate.proposal.previewId);assert.equal(outcome.proposal.verification.passed,false);assert.deepEqual(outcome.proposal.verification.checks[0].actual,[55,40,6]);assert.equal(second.cad.serialize(),before);assert.equal(second.cad.state().undo,undo);assert.equal(second.cad.state().previews,1);
 await assert.rejects(second.access.apply({previewId:saved.candidate.proposal.previewId,revision:second.cad.revision()}),{code:'UNKNOWN_PREVIEW'});
 await assert.rejects(second.access.apply({previewId:outcome.proposal.previewId,revision:second.cad.revision()}),{code:'AI_RESULT_ACCEPTANCE_REQUIRED'});
 assert.deepEqual(second.access.getPreview(outcome.proposal.previewId).nodes[0],original);
 await second.access.apply({previewId:outcome.proposal.previewId,revision:second.cad.revision(),acceptFailedChecks:true});assert.equal(second.cad.state().undo,undo+1);second.cad.undo();assert.equal(second.cad.serialize(),before);
});

test('Restoring an archived FreeCAD body checks its actual STEP sources without executing the saved Python program again',async t=>{
 const previous=globalThis.offlinecadDesktop;let calls=0;globalThis.offlinecadDesktop={runFreeCADReply:async args=>{calls++;const {requestId,...request}=args;return {ok:true,value:await freecad.run(request)};}};t.after(()=>{globalThis.offlinecadDesktop=previous;});
 const first=await setup(t);const outcome=await runCadAIRequest({input,maxSteps:7,visualReview:false,access:{...first.access,inspectFreeCADPreview:undefined},generate:async args=>({revision:args.scene.revision,commands:[{op:'tool',engine:'freecad',as:'part',operation:{kind:'build',script:{version:1,code:'result=Part.makeBox(10,5,3)'}}}],checks:[{kind:'volume',target:'$part',expected:150}]})});
 const saved={result:{label:'Native saved part'},project:first.access.getPreview(outcome.proposal.previewId),proposal:outcome.proposal},second=await setup(t,first.cad.snapshot()),before=second.cad.serialize();assert.equal(calls,1);
 const restored=await second.access.restoreCandidate(JSON.parse(JSON.stringify(saved)),{revision:second.cad.revision(),checks:[{kind:'volume',target:'$part',expected:150}]});assert.equal(calls,1);assert.notEqual(restored.previewId,saved.proposal.previewId);assert(Math.abs(restored.verification.checks[0].actual-150)<1e-7);assert.deepEqual(second.access.getPreview(restored.previewId).nodes[0].metadata.freecadSource,saved.project.nodes[0].metadata.freecadSource);assert.equal(second.cad.serialize(),before);second.access.discard(restored.previewId);
 const corrupt=structuredClone(saved);corrupt.proposal.aliases.part='missing';await assert.rejects(second.access.restoreCandidate(corrupt),{code:'AI_TASK_CANDIDATE_INVALID'});assert.equal(second.cad.state().previews,0);
});

test('A changed archived recipe cannot silently replace its saved BRep during restoration',async t=>{
 const first=await setup(t),proposal=await first.access.preview({revision:first.cad.revision(),commands:[{op:'create',type:'box',as:'part',size:[10,5,3]}]}),project=first.access.getPreview(proposal.previewId),second=await setup(t,first.cad.snapshot()),before=second.cad.serialize();
 const corrupt=structuredClone(project);corrupt.nodes[0].recipe.size[0]=11;
 await assert.rejects(second.access.restoreCandidate({project:corrupt,proposal,result:{}},{revision:second.cad.revision()}),{code:'AI_TASK_CANDIDATE_CHANGED'});assert.equal(second.cad.state().previews,0);assert.equal(second.cad.serialize(),before);assert.equal(second.cad.state().undo,0);
});
