import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {Worker} from 'node:worker_threads';
import {defaultModelCheckConfig,validateModelCheckConfig,selectModelChecks,configureModelCheckStorage,readModelCheckConfig,saveModelCheckConfig,MODEL_CHECK_CONFIG_KEY} from '../src/ai-model-check-config.js';
import {createProgramStorage} from '../src/program-storage.js';
import {createCadController} from '../src/cad-controller.js';
import {createCadAutomationAccess} from '../src/cad-automation-access.js';
import {runCadAIRequest} from '../src/cad-ai-request.js';
const require=createRequire(import.meta.url),{createProgramStore}=require('../backend/program-storage.cjs');
const box={op:'create',type:'box',as:'part',size:[60,40,6]},size={kind:'size',target:'$part',space:'edit',expected:[61,40,6]};
function fixture(config){let scene;const cad=createCadController({createWorker:()=>{const w=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),a={postMessage:v=>w.postMessage(v),terminate:()=>w.terminate()};w.on('message',data=>a.onmessage?.({data}));w.on('error',e=>a.onerror?.(e));return a;}}),refresh=async()=>{scene=await cad.describe();},access=createCadAutomationAccess({controller:cad,getScene:()=>scene,refresh,getModelCheckConfig:()=>config});return {cad,access,refresh};}
test('Normal mode defaults and checked selections survive a real portable file reload',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-check-config-'));try{const make=()=>{const store=createProgramStore(dir,{cadOnly:true});return createProgramStorage({getItem:()=>null},{initializeProgramData:v=>store.initialize(v),changeProgramData:v=>store.change(v)},{cadOnly:true});};
 let storage=make();configureModelCheckStorage(storage);assert.equal(readModelCheckConfig().mode,'normal');let c=defaultModelCheckConfig();c.mode='checked';c.checks.volume=false;c.strictness=37;c.maxCorrections=4;saveModelCheckConfig(c);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'modellpruefungen-ki.json'))),c);storage=make();assert.deepEqual(readModelCheckConfig(storage),c);const before=fs.readFileSync(path.join(dir,'modellpruefungen-ki.json'),'utf8');assert.throws(()=>saveModelCheckConfig({...c,maxCorrections:99},storage));assert.equal(fs.readFileSync(path.join(dir,'modellpruefungen-ki.json'),'utf8'),before);
 }finally{configureModelCheckStorage(undefined);fs.rmSync(dir,{recursive:true,force:true});}
});
test('Renderer and stored-task config validators reject the same malformed values',()=>{
 const backend=require('../backend/model-check-config.cjs').validateModelCheckConfig,c=defaultModelCheckConfig();for(const v of [null,[],{...c,extra:true},{...c,mode:'trial'},{...c,strictness:NaN},{...c,checks:{}},{...c,checks:{...c.checks,unknown:true}},{...c,visual:1},{...c,maxCorrections:-1}]){assert.throws(()=>validateModelCheckConfig(v));assert.throws(()=>backend(v));}assert.deepEqual(backend(c),validateModelCheckConfig(c));
});
test('Only selected checks run in actual native MCP previews; Normal mode skips all result checks',async()=>{
 for(const normal of [false,true]){const config=defaultModelCheckConfig();config.mode=normal?'normal':'checked';config.checks.size=false;const {cad,access,refresh}=fixture(config);try{await refresh();const before=cad.serialize(),proposal=await access.preview({revision:cad.revision(),commands:[box],checks:[size,{kind:'solids',target:'$part',expected:1}]});assert.deepEqual(proposal.verification.checks.map(c=>c.kind),normal?[]:['solids']);assert.equal(proposal.verification.skipped,normal?true:undefined);assert.equal(cad.serialize(),before);assert.deepEqual(access.context().modelCheckPolicy.configuration,config);access.discard(proposal.previewId);}finally{cad.dispose();}}
});
test('Configured dimensional strictness is enforced for external preview and Apply',async()=>{
 const config=defaultModelCheckConfig();config.mode='checked';config.strictness=50;const {cad,access,refresh}=fixture(config);try{await refresh();const before=cad.serialize(),request={revision:cad.revision(),commands:[box],checks:[{...size,expected:[60.015,40,6],tolerance:.01}]},p=await access.preview(request);assert.equal(p.verification.passed,false);assert.equal(p.verification.modellingPolicy.accepted,true);await access.apply({previewId:p.previewId,revision:p.revision});cad.undo();assert.equal(cad.serialize(),before);await refresh();config.strictness=100;await assert.rejects(access.preview({...request,revision:cad.revision()}),{code:'AI_RESULT_MISMATCH'});assert.equal(cad.serialize(),before);}finally{cad.dispose();}
});
test('AI workflow respects engine switches, selected requirements and disabled correction attempts',async()=>{
 const config=defaultModelCheckConfig();config.mode='checked';config.checks.size=false;config.freecad=config.photo=config.visual=false;config.autoCorrect=false;const {cad,access,refresh}=fixture(config);try{await refresh();let calls=0,independent=0,visual=0;access.inspectFreeCADPreview=async()=>{independent++;};access.inspectPreview=async()=>{visual++;};const outcome=await runCadAIRequest({input:{prompt:'Teil',modelCheckConfig:config},access,generate:async()=>{calls++;return {revision:cad.revision(),commands:[box],checks:[size,{kind:'solids',target:'$part',expected:2}]};}});assert.equal(calls,1);assert.equal(independent,0);assert.equal(visual,0);assert.deepEqual(outcome.checks.map(c=>c.kind),['solids']);assert.equal(outcome.proposal.verification.passed,false);assert.equal(outcome.correctionAttempts,0);assert.equal(cad.state().undo,0);}finally{cad.dispose();}
});
test('Filtering keeps complete definitions of retained requirements',()=>{const c=defaultModelCheckConfig();c.mode='checked';c.checks.solids=false;assert.deepEqual(selectModelChecks([size,{kind:'solids',target:'$part',expected:2}],c),[size]);});

test('Normal mode repairs a real failed Boolean without enabling checks or changing the confirmed model',async()=>{
 const config=defaultModelCheckConfig(),{cad,access,refresh}=fixture(config);try{await refresh();const original=cad.serialize();let calls=0,checked=0;const check=cad.checkPreview;cad.checkPreview=(...args)=>{checked++;return check(...args);};
 const outcome=await runCadAIRequest({input:{prompt:'Baue einen Körper.',modelCheckConfig:config},access,generate:async input=>{calls++;if(calls===1)return {revision:cad.revision(),commands:[{op:'create',type:'box',size:[5,5,5],as:'a'},{op:'create',type:'box',size:[5,5,5],pos:[40,0,0],as:'b'},{op:'group',operation:'intersection',targets:['$a','$b'],as:'empty'}]};assert.match(input.correction,/CAD_ERROR/);return {revision:cad.revision(),commands:[box],checks:[size]};}});
 assert.equal(calls,2);assert.equal(outcome.correctionAttempts,1);assert.equal(checked,0);assert.equal(outcome.proposal.verification.skipped,true);assert.deepEqual(outcome.checks,[]);assert.equal(cad.serialize(),original);assert.equal(cad.state().undo,0);
 }finally{cad.dispose();}
});

test('Disabling quality corrections still permits a technical repair but retains a failed result check',async()=>{
 const config=defaultModelCheckConfig();config.mode='checked';config.autoCorrect=false;config.freecad=config.photo=config.visual=false;const {cad,access,refresh}=fixture(config);try{await refresh();let calls=0;const outcome=await runCadAIRequest({input:{prompt:'Teil 61 mm',modelCheckConfig:config},access,generate:async()=>{calls++;return {revision:cad.revision(),commands:[{...box,size:calls===1?[-1,40,6]:box.size}],checks:[size]};}});assert.equal(calls,2);assert.equal(outcome.correctionAttempts,1);assert.equal(outcome.proposal.verification.passed,false);assert.deepEqual(outcome.checks,[size]);assert.equal(cad.state().undo,0);}finally{cad.dispose();}
});

test('Normal-mode technical failures do not retry after cancellation or a protected-source rejection',async()=>{
 for(const code of ['LOCKED','STALE_REVISION','ABORTED']){let calls=0;const scene={revision:'r',selectionTargets:[]};await assert.rejects(runCadAIRequest({input:{prompt:'Test',modelChecks:false},access:{scene:()=>scene,context:()=>({}),preview:async()=>{throw Object.assign(Error(code),{code});}},generate:async()=>{calls++;return {revision:'r',commands:[box]};}}));assert.equal(calls,1);}
});

test('A technical repair does not consume the configured visual correction',async()=>{
 const config=defaultModelCheckConfig();config.mode='checked';config.maxCorrections=1;config.freecad=config.photo=false;
 let calls=0,previews=0;const scene=()=>({revision:'r',selectionTargets:[]});
 const outcome=await runCadAIRequest({input:{modelCheckConfig:config},access:{scene,context:()=>({}),discard(){},preview:async()=>{if(++previews===1)throw Object.assign(Error('Invalid construction'),{code:'CAD_ERROR'});return {previewId:'p'+previews,revision:'r',verification:{passed:true,checks:[]}};},inspectPreview:async previewId=>({previewId,revision:'r',images:[],views:[]})},generate:async args=>{calls++;if(calls===4)return {revision:'r',review:{previewId:args.visualFeedback.previewId,accepted:true,observations:'Accepted'}};return {revision:'r',commands:[box]};}});
 assert.equal(calls,4);assert.equal(previews,3);assert.equal(outcome.correctionAttempts,2);assert.equal(outcome.proposal.visualReview.status,'reviewed');
});
