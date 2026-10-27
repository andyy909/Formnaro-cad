import test from 'node:test';
import assert from 'node:assert/strict';
import {runCadAIRequest} from '../src/cad-ai-request.js';
import {validateAIAnalysis,compactAIAnalysisResult,pageAIAnalysisResult} from '../src/cad-ai-analysis.js';
import {radialFixture} from './fixtures/mesh-radial-fixtures.mjs';
import {Worker} from 'node:worker_threads';
import Module from 'manifold-3d';
import {createCadController} from '../src/cad-controller.js';
import {createCadProject} from '../src/cad-project.js';
import {createCadAutomationAccess} from '../src/cad-automation-access.js';
import {lidHousing} from './fixtures/mesh-lid-fixtures.mjs';
const q=[{id:'bounds',engine:'app',kind:'bounds',options:{id:'part'}}],scene={revision:'r',selectionTargets:[]};
test('Read-only analysis feeds measured values into construction without intermediate previews or commits',async()=>{
 let calls=0,previews=0;const result=await runCadAIRequest({input:{prompt:'Build'},access:{scene:()=>scene,context:()=>({}),analyze:async r=>{assert.deepEqual(r,q);return {revision:'r',results:[{id:'bounds',value:{size:[40,30,20]}}]};},preview:async r=>{previews++;assert.equal(r.commands[0].size[0],40);return {previewId:'p'};}},generate:async input=>{if(!calls++)return {revision:'r',analysis:q};assert.equal(input.analysisResults[0].results[0].value.size[0],40);return {revision:'r',commands:[{op:'create',type:'box',size:[40,30,20]}]};}});assert.equal(calls,2);assert.equal(previews,1);assert.equal(result.analysisRounds,1);assert.equal(result.correctionAttempts,0);
});
test('Analysis rounds, payloads and capabilities are bounded independently of correction budget',async()=>{
 for(const value of [[{...q[0],engine:'system'}],[{...q[0],kind:'convert'}],[{...q[0],code:'evil'}],[{id:'x',engine:'mesh',kind:'inspectSolid',options:{node:{}}}],[...q,...q]])assert.throws(()=>validateAIAnalysis(value));assert.throws(()=>compactAIAnalysisResult('x'.repeat(32001)));
 let calls=0,measured=0;await assert.rejects(runCadAIRequest({input:{prompt:'x'},access:{scene:()=>scene,context:()=>({}),analyze:async()=>{measured++;return {results:[]};}},generate:async()=>{calls++;return {revision:'r',analysis:q};}}),{code:'AI_ANALYSIS_LIMIT'});assert.equal(calls,3);assert.equal(measured,2);
});
test('Selection/revision change during successful measurements stops further model calls',async()=>{
 let current=scene,calls=0;await assert.rejects(runCadAIRequest({input:{prompt:'x'},access:{scene:()=>current,context:()=>({}),analyze:async()=>{current={...scene,revision:'next'};return {};},preview:()=>assert.fail()},generate:async()=>{calls++;return {revision:'r',analysis:q};}}),{code:'STALE_REVISION'});assert.equal(calls,1);
});
test('An oversized measurement does not contaminate subsequent feedback or mutate the model',async()=>{
 let calls=0,measured=0;const result=await runCadAIRequest({input:{prompt:'x'},access:{scene:()=>scene,context:()=>({}),analyze:async()=>{measured++;return {value:'x'.repeat(33000)};},preview:()=>assert.fail()},generate:async args=>{calls++;if(calls===1)return {revision:'r',analysis:q};assert.equal(args.analysisResults,undefined);assert.match(args.correction,/groß|gross|32000|Messbericht/);return {message:'Messauswahl eingrenzen.'};}});assert.equal(result.message,'Messauswahl eingrenzen.');assert.equal(measured,1);assert.equal(calls,2);
});
test('Large catalogues automatically page and selected pages retain exact measured rows and continuation counts',()=>{
 const value={geometryDigest:'a'.repeat(64),profiles:Array.from({length:200},(_,i)=>({profileId:'p'+i,normal:[0,0,1],measurementPlanePoint:[0,0,i],diameter:20+i,note:'measured'.repeat(30)})),planes:Array.from({length:40},(_,i)=>({id:i,normal:[1,0,0]}))},before=structuredClone(value),page=pageAIAnalysisResult(value);
 assert.ok(JSON.stringify(value).length>32000);assert.ok(JSON.stringify(page).length<12000);assert.equal(page.reportPage.pages.find(p=>p.collection==='profiles').total,200);assert.equal(page.reportPage.pages.find(p=>p.collection==='profiles').nextOffset,4);assert.deepEqual(page.profiles,value.profiles.slice(0,4));
 const next=pageAIAnalysisResult(value,{collection:'profiles',offset:4,limit:3,detail:'full'});assert.deepEqual(next.profiles,value.profiles.slice(4,7));assert.equal(next.planes,undefined);assert.deepEqual(next.reportPage.omittedCollections,['planes']);assert.equal(next.reportPage.pages[0].nextOffset,7);
 const end=pageAIAnalysisResult(value,{collection:'profiles',offset:199,limit:4});assert.equal(end.reportPage.pages[0].nextOffset,null);assert.deepEqual(value,before);
 for(const report of [{offset:-1},{limit:100},{collection:'__proto__'},{collection:'missing'},{detail:'invent'}])assert.throws(()=>pageAIAnalysisResult(value,report));
 assert.deepEqual(pageAIAnalysisResult({size:[2,3,4]}),{size:[2,3,4]});
 const root=pageAIAnalysisResult(Array.from({length:100},(_,id)=>({id})),{offset:3,limit:2});assert.deepEqual(root.items,[{id:3},{id:4}]);assert.equal(root.reportPage.pages[0].nextOffset,5);
 assert.equal(validateAIAnalysis([{id:'q',engine:'mesh',kind:'featureCatalog',options:{id:'x'},report:{collection:'profiles',offset:4,limit:3}}])[0].report.offset,4);
});
test('Eight real worker sections fit one round; catalogue pages and radial query preserve revision and model',async()=>{
 const kernel=await Module();kernel.setup();const initial=createCadProject({version:8,nodes:radialFixture(kernel)}),factory=file=>()=>{const w=new Worker(new URL(file,import.meta.url)),a={postMessage:v=>w.postMessage(v),terminate:()=>w.terminate()};w.on('message',v=>a.onmessage?.({data:v}));w.on('error',e=>a.onerror?.(e));return a;},cad=createCadController({initial,createWorker:factory('./fixtures/cad-node-worker.mjs'),createMeshWorker:factory('./fixtures/mesh-engine-node-worker.mjs')});
 try{
  const before=cad.serialize(),queries=Array.from({length:8},(_,i)=>({id:'z'+i,engine:'mesh',kind:'featureCatalog',options:{id:'housing',options:{normal:[0,0,1],planePoint:[0,0,16+i]}},report:{collection:'profiles',offset:1,limit:1}})),r=await cad.analyze(queries);
  assert.equal(r.results.length,8);assert.ok(JSON.stringify(r).length<16000);for(const row of r.results){assert.equal(row.value.profiles[0].role,'cavity');assert.ok(row.value.profiles[0].measurementPlanePoint);assert.equal(row.value.reportPage.pages[0].offset,1);}
  const radial=await cad.analyze([{id:'gap',engine:'mesh',kind:'radialClearance',options:{id:'insert',options:{other:'housing',from:[0,0,16.5],to:[0,0,23.5],expected:.3}}}]);assert.equal(radial.results[0].value.passed,true);assert.equal(cad.serialize(),before);
  const makeCheck=expected=>({kind:'radialClearance',target:'$insertCopy',other:'housing',from:[0,0,16.5],to:[0,0,23.5],expected});
  // The finished original insert can also be checked in a separate native edit.
  const p=await cad.preview({kind:'batch',commands:[{op:'create',type:'box',as:'unrelated',size:[2,2,2],pos:[100,0,0]}]},{revision:cad.revision()});
  const checks=[{...makeCheck(.3),target:'insert'},{kind:'solids',target:'$unrelated',expected:1}],verified=await cad.checkPreview(p.previewId,checks);assert.equal(verified.checks[0].actual.passed,true);assert.equal(verified.checks[1].evidence,'native-brep');
  await assert.rejects(cad.checkPreview(p.previewId,[{...checks[0],expected:.4}]),{code:'AI_RESULT_MISMATCH'});cad.discard(p.previewId);assert.equal(cad.serialize(),before);
 }finally{cad.dispose();}
});
test('Real worker read-only analysis and mesh result checks coexist in one mixed atomic preview',async()=>{
 const kernel=await Module();kernel.setup();const initial=createCadProject({version:8,nodes:[{...lidHousing(kernel),layerId:'default',folderId:null}]});
 const factory=file=>()=>{const w=new Worker(new URL(file,import.meta.url)),a={postMessage:v=>w.postMessage(v),terminate:()=>w.terminate()};w.on('message',v=>a.onmessage?.({data:v}));w.on('error',e=>a.onerror?.(e));return a;};
 const cad=createCadController({initial,createWorker:factory('./fixtures/cad-node-worker.mjs'),createMeshWorker:factory('./fixtures/mesh-engine-node-worker.mjs')});let scene;const refresh=async()=>{scene=await cad.describe();},access=createCadAutomationAccess({controller:cad,getScene:()=>scene,refresh,getSelection:()=>[{rootId:'housing',path:[]}]});
 try{await refresh();const before=cad.serialize(),measured=await access.analyze([{id:'source',engine:'mesh',kind:'lidCatalog',options:{id:'housing'}}]);assert.equal(cad.serialize(),before);const c=measured.results[0].value.candidates.find(c=>c.normal[2]>.9),a=measured.results[0].value;
  const commands=[{op:'mesh',tool:'lid',target:'housing',as:'lid',options:{geometryDigest:a.geometryDigest,candidateId:c.candidateId,normal:c.normal}},{op:'create',type:'box',size:[2,2,2],pos:[100,0,1],as:'native'}],checks=[{kind:'solids',target:'$lid',expected:1},{kind:'solids',target:'$native',expected:1},...c.fasteners.map(h=>({kind:'clearance',target:'$lid',from:h.center.map((v,k)=>v-c.normal[k]*3),to:h.center.map((v,k)=>v+c.normal[k]*3),diameter:4.5}))];
  const p=await access.preview({revision:cad.revision(),commands,checks});assert.equal(cad.serialize(),before);assert.deepEqual(p.verification.checks.map(c=>c.evidence),['mesh-kernel','native-brep','mesh-kernel','mesh-kernel']);access.discard(p.previewId);
  await assert.rejects(access.preview({revision:cad.revision(),commands,checks:[checks[1],checks[0],{...checks[2],diameter:6}]}),error=>error.code==='AI_RESULT_MISMATCH'&&error.feedback.checkIndex===3&&error.feedback.checkKind==='clearance');assert.equal(cad.state().previews,0);assert.equal(cad.serialize(),before);
 }finally{cad.dispose();}
});
