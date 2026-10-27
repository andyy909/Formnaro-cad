import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {createRequire} from 'node:module';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {cadGeometryDigest} from '../src/cad-geometry-digest.js';
import {createCadController} from '../src/cad-controller.js';
import {createCadAutomationAccess} from '../src/cad-automation-access.js';
import {runCadAIRequest} from '../src/cad-ai-request.js';

async function setup(t){
 const cad=createCadController({createWorker:()=>{const w=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),a={postMessage:v=>w.postMessage(v),terminate:()=>w.terminate()};w.on('message',data=>a.onmessage?.({data}));w.on('error',error=>a.onerror?.(error));return a;}});t.after(()=>cad.dispose());
 await cad.execute({kind:'batch',commands:[{op:'create',type:'box',name:'Protected original',size:[2,3,4],pos:[-50,0,0]}]});let scene;const refresh=async()=>{scene=await cad.describe();};await refresh();const access=createCadAutomationAccess({controller:cad,getScene:()=>scene,refresh});return {cad,access};
}
const required=[{kind:'size',target:'$part',space:'worldAxes',expected:[60,40,6]},{kind:'solids',target:'$part',expected:1}];

test('The request checkpoint hook durably saves the actual best native candidate, original constraints and consumed progress without applying it',async t=>{
 const {cad,access}=await setup(t),before=cad.serialize(),directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-ai-task-native-'));
 const {createAITaskStore}=createRequire(import.meta.url)('../backend/ai-tasks.cjs'),journal=createAITaskStore({directory}),provider='synthetic-native-fixture';let loader,record,lease;
 t.after(()=>{if(record?.status==='running'){const latest=journal.request({action:'read',id:record.id},provider);journal.request({action:'finish',id:latest.id,generation:latest.generation,binding:latest.binding,lease,status:'interrupted'},provider);}loader?.close();journal.close();assert(path.resolve(directory).startsWith(path.join(path.resolve(os.tmpdir()),'formnaro-ai-task-native-')));fs.rmSync(directory,{recursive:true,force:true});});
 const binding={revision:cad.revision(),projectDigest:cadGeometryDigest(before),referenceDigest:cadGeometryDigest('[]'),selectionDigest:cadGeometryDigest('[]')},requirements={purpose:'technical',objective:'Plate 60 × 40 × 6 mm',assumptions:[],protectedTargets:[{rootId:cad.snapshot().nodes[0].id,path:[]}],checks:required};
 record=journal.request({action:'start',binding,requirements,input:{prompt:requirements.objective},maxSteps:24},provider);const claimed=journal.request({action:'claim',id:record.id,generation:record.generation,binding},provider);record=claimed;lease=claimed.lease;let generated=0;
 const result=await runCadAIRequest({input:{prompt:requirements.objective},maxSteps:24,visualReview:false,access,onProgress:event=>{const value=structuredClone(event);if(value.candidate)value.candidate.project=structuredClone(access.getPreview(value.candidate.proposal.previewId));record=journal.request({action:'checkpoint',id:record.id,generation:record.generation,binding,lease,value},provider);},generate:async args=>{generated++;return {revision:args.scene.revision,commands:[{op:'create',type:'box',as:'part',size:[40,40,6]}],checks:required};}});
 record=journal.request({action:'finish',id:record.id,generation:record.generation,binding,lease,status:'stopped'},provider);loader=createAITaskStore({directory});const saved=loader.request({action:'read',id:record.id},provider);
 assert.equal(generated,3);assert.equal(saved.checkpoint.progress.usedSteps,3);assert.equal(saved.checkpoint.progress.stop.reason,'repeated-failure');assert.equal(saved.checkpoint.taskEvidence.failures[0].occurrences,3);assert.deepEqual(saved.requirements,requirements);assert.deepEqual(saved.checkpoint.requiredChecks,required);
 assert.deepEqual(saved.checkpoint.candidate.project.nodes[0],cad.snapshot().nodes[0]);assert(Math.abs(saved.checkpoint.candidate.project.nodes.at(-1).stats.volume-9600)<1e-6);assert.deepEqual(saved.checkpoint.candidate.proposal.verification.checks[0].actual,[40,40,6]);assert.equal(cad.serialize(),before);assert.equal(saved.binding.projectDigest,cadGeometryDigest(before));access.discard(result.proposal.previewId);
});

test('Repeated actual OCCT size failures stop at three native previews and preserve the entire confirmed model, protected original and Undo',async t=>{
 const {cad,access}=await setup(t),before=cad.serialize(),depth=cad.state().undo,checkpoints=[];let calls=0;
 const result=await runCadAIRequest({input:{prompt:'Create a 60 by 40 by 6 mm plate'},maxSteps:80,visualReview:false,onProgress:p=>checkpoints.push(structuredClone(p)),access,generate:async args=>({revision:args.scene.revision,label:'attempt '+(++calls),commands:[{op:'create',type:'box',as:'part',size:[40,40,6]}],...(calls===1?{checks:required}:{checks:[{...required[0],expected:[40,40,6]}]})})});
 assert.equal(calls,3);assert.equal(result.proposal.correctionError.code,'AI_TASK_STALLED');assert.deepEqual(result.checks,required);assert.equal(result.proposal.verification.checks[0].actual[0],40);assert.equal(result.proposal.verification.checks[1].passed,true);assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,depth);assert.equal(cad.state().previews,1);
 const savedCandidate=access.getPreview(result.proposal.previewId);assert.equal(savedCandidate.nodes[0].name,'Protected original');assert(Math.abs(savedCandidate.nodes.at(-1).stats.volume-9600)<1e-6);assert.equal(checkpoints.at(-1).progress.usedSteps,3);
 await assert.rejects(access.apply({previewId:result.proposal.previewId,revision:cad.revision()}),{code:'AI_RESULT_ACCEPTANCE_REQUIRED'});assert.equal(cad.serialize(),before);access.discard(result.proposal.previewId);assert.equal(cad.state().previews,0);
});

test('Actual native measurements retain the better 55 mm draft through worse and equal later results without replacing source geometry',async t=>{
 const {cad,access}=await setup(t),before=cad.serialize(),depth=cad.state().undo;let calls=0;
 const result=await runCadAIRequest({input:{},maxSteps:24,visualReview:false,access,generate:async args=>({revision:args.scene.revision,commands:[{op:'create',type:'box',as:'part',name:'candidate '+calls,size:[[40,55,45,55,55][calls++],40,6]}],...(calls===1?{checks:required}:{})})});
 assert.equal(calls,5);assert.equal(result.proposal.verification.checks[0].actual[0],55);assert(Math.abs(access.getPreview(result.proposal.previewId).nodes.at(-1).stats.volume-13200)<1e-6);assert.equal(cad.state().previews,1);assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,depth);access.discard(result.proposal.previewId);
});

test('Cancelling at a recorded failed native checkpoint disposes the retained candidate and starts no next request',async t=>{
 const {cad,access}=await setup(t),before=cad.serialize(),depth=cad.state().undo;let calls=0,current=true;
 await assert.rejects(runCadAIRequest({input:{},maxSteps:24,visualReview:false,isCurrent:()=>current,onProgress:p=>{if(p.phase==='failure')current=false;},access,generate:async args=>{calls++;return {revision:args.scene.revision,commands:[{op:'create',type:'box',as:'part',size:[40,40,6]}],checks:required};}}),{name:'AbortError'});
 assert.equal(calls,1);assert.equal(cad.state().previews,0);assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,depth);
});
test('An actual geometrically unchanged valid CAD draft cannot cycle through repeated visual corrections under renamed candidate labels',async t=>{
 const {cad,access}=await setup(t),before=cad.serialize();let calls=0,captures=0;
 const outcome=await runCadAIRequest({input:{prompt:'Shape variant'},purpose:'generative',maxSteps:24,access:{...access,inspectPreview:async previewId=>{captures++;return {previewId,revision:cad.revision(),views:[],images:[]};}},generate:async args=>{assert.match(args.context.agentWorkflow.qualityCriteria,/qualitatively/);calls++;return {revision:args.scene.revision,commands:[{op:'create',type:'box',as:'part',name:'renamed valid shape '+calls,size:[40,40,6]}],checks:[{kind:'solids',target:'$part',expected:1},{kind:'volume',target:'$part',expected:9600}]};}});
 assert.equal(calls,3);assert.equal(captures,2);assert.equal(outcome.proposal.verification.passed,true);assert.equal(outcome.taskProgress.stop.reason,'repeated-candidate');assert.equal(outcome.proposal.correctionError.code,'AI_TASK_STALLED');assert.equal(cad.serialize(),before);assert.equal(cad.state().previews,1);access.discard(outcome.proposal.previewId);
});
test('Explicit saved dimensions override a provider that weakens the check in its very first proposal',async t=>{
 const {cad,access}=await setup(t),before=cad.serialize();let calls=0;
 const requirements={purpose:'technical',objective:'60 × 40 × 6 mm',assumptions:['No hidden depth inferred'],checks:required,protectedTargets:[]};
 const outcome=await runCadAIRequest({input:{},requirements,maxSteps:24,visualReview:false,access,generate:async args=>{assert.deepEqual(args.context.agentWorkflow.taskRequirements,requirements);calls++;return {revision:args.scene.revision,commands:[{op:'create',type:'box',as:'part',size:[40,40,6]}],checks:[{...required[0],expected:[40,40,6]}]};}});
 assert.equal(calls,3);assert.deepEqual(outcome.checks,required);assert.equal(outcome.proposal.verification.passed,false);assert.deepEqual(outcome.proposal.verification.checks[0].expected,[60,40,6]);assert.equal(cad.serialize(),before);access.discard(outcome.proposal.previewId);
});
test('A task-protected original is never exposed as an applicable draft even when the model repeatedly edits its otherwise unlocked source',async t=>{
 const {cad,access}=await setup(t),before=cad.serialize(),original=cad.snapshot().nodes[0];let calls=0;
 const requirements={purpose:'technical',objective:'Preserve original and add a plate',assumptions:[],checks:[],protectedTargets:[{rootId:original.id,path:[]}]};
 await assert.rejects(runCadAIRequest({input:{},requirements,maxSteps:24,visualReview:false,access,generate:async args=>{calls++;return {revision:args.scene.revision,commands:[{op:'update',target:original.id,set:{size:[6,4,5]}}]};}}),e=>e.code==='AI_TASK_STALLED'&&e.feedback.lastFailure.code==='AI_TASK_PROTECTION_VIOLATION');
 assert.equal(calls,3);assert.equal(cad.serialize(),before);assert.equal(cad.state().previews,0);
});
test('Task protection also preserves the world placement of an unchanged retained source inside a moved group',async t=>{
 const {cad,access}=await setup(t),original=cad.snapshot().nodes[0];const result=await cad.execute({kind:'batch',commands:[{op:'create',type:'box',as:'sibling',size:[2,2,2],pos:[-30,0,0]},{op:'group',targets:[original.id,'$sibling'],as:'container'}]});
 // The access snapshot must match the newly confirmed group before the task.
 const groupedAccess=createCadAutomationAccess({controller:cad,getScene:()=>groupScene,refresh:async()=>{groupScene=await cad.describe();}});let groupScene=await cad.describe();const before=cad.serialize();let calls=0;
 const requirements={purpose:'technical',objective:'Preserve retained source placement',assumptions:[],checks:[],protectedTargets:[{rootId:result.aliases.container,path:[original.id]}]};
 await assert.rejects(runCadAIRequest({input:{},requirements,maxSteps:24,visualReview:false,access:groupedAccess,generate:async args=>{calls++;return {revision:args.scene.revision,commands:[{op:'transform',target:result.aliases.container,translate:[10,0,0]}]};}}),e=>e.code==='AI_TASK_STALLED'&&e.feedback.lastFailure.code==='AI_TASK_PROTECTION_VIOLATION');
 assert.equal(calls,3);assert.equal(cad.serialize(),before);assert.equal(cad.state().previews,0);
});
