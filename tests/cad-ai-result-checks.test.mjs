import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {createRequire} from 'node:module';
import {createCadController} from '../src/cad-controller.js';
import {createCadAutomationAccess} from '../src/cad-automation-access.js';
import {validateAIResultChecks,resolveAIResultTarget} from '../src/cad-ai-result-checks.js';
import {runCadAIRequest} from '../src/cad-ai-request.js';
import {aiFeedback,correctionFeedback} from '../src/ai-feedback.js';
import {checkCadAIResultNative} from '../src/cad-ai-result-checks-native.js';
import {aiPreviewErrorMarks,createAIErrorOverlay,AI_ERROR_COLOR} from '../src/cad-ai-preview-errors.js';
const {generate}=createRequire(import.meta.url)('../backend/ai-provider.cjs');

function fixture(){
 let scene;
 const comparison=()=>{const w=new Worker(new URL('./fixtures/model-deviation-node-worker.mjs',import.meta.url)),a={postMessage:v=>w.postMessage(v),terminate:()=>w.terminate()};w.on('message',data=>a.onmessage?.({data}));w.on('error',e=>a.onerror?.(e));return a;};
 const cad=createCadController({createComparisonWorker:comparison,createWorker:()=>{const w=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),adapter={onmessage:null,onerror:null,postMessage:v=>w.postMessage(v),terminate:()=>w.terminate()};w.on('message',v=>adapter.onmessage?.({data:v}));w.on('error',e=>adapter.onerror?.(e));return adapter;}});
 const refresh=async()=>{scene=await cad.describe();};
 const access=createCadAutomationAccess({controller:cad,getScene:()=>scene,refresh});
 return {cad,access,refresh};
}
const box={op:'create',type:'box',as:'part',size:[60,40,6]};
const sizeCheck={kind:'size',target:'$part',space:'worldAxes',expected:[60,40,6]};

test('Review retains all failed and passed measurements, guards acceptance, and restores exact originals with Undo',async()=>{
 const {cad,access,refresh}=fixture();try{
  await refresh();const before=cad.serialize(),undo=cad.state().undo;
  const p=await access.preview({revision:cad.revision(),commands:[box],checks:[{...sizeCheck,expected:[61,40,6]},{kind:'solids',target:'$part',expected:1},{kind:'volume',target:'$part',expected:10},{...sizeCheck,target:'$missing'}]},{retainFailedChecks:true});
  assert.deepEqual(p.verification.checks.map(c=>c.passed),[false,true,false,false]);assert.equal(p.verification.passed,false);assert.equal(p.verification.checks[2].feedback.checkIndex,3);assert.match(p.verification.checks[2].error.message,/Ergebnisprüfung 3/);assert.equal(p.verification.checks[3].actual,null);assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,undo);
  const id=p.previewId,revision=p.revision;p.verification.passed=true;p.verification.checks=[];
  for(const acceptFailedChecks of [undefined,false,'true',1])await assert.rejects(access.apply({previewId:id,revision,acceptFailedChecks}),{code:'AI_RESULT_ACCEPTANCE_REQUIRED'});
  const applied=await access.apply({previewId:id,revision,acceptFailedChecks:true});assert.equal(applied.acceptedFailedChecks,true);assert.equal(applied.verification.checks.length,4);assert.equal(cad.state().undo,undo+1);assert.equal((await cad.describe()).objects[0].volume,14400);cad.undo();assert.equal(cad.serialize(),before);
 }finally{cad.dispose();}
});

test('A later generation failure retains the computed candidate, while cancellation and selection changes discard it',async()=>{
 for(const mode of ['transport','cancel','selection','native','question']){
  const {cad,access,refresh}=fixture();try{
   await refresh();const original=cad.serialize();let calls=0,active=true,selection=[];const wrapped={...access,scene:()=>({...access.scene(),selectionTargets:selection})};
   const promise=runCadAIRequest({input:{},access:wrapped,isCurrent:()=>active,generate:async()=>{
    calls++;if(calls===1)return {revision:cad.revision(),commands:[box],checks:[{...sizeCheck,expected:[61,40,6]}]};
    if(mode==='cancel'){active=false;throw Object.assign(Error('cancel'),{name:'AbortError'});}
    if(mode==='selection'){selection=[{rootId:'other',path:[]}];throw Error('selection changed');}
    if(mode==='native')return {revision:cad.revision(),commands:[{...box,size:[-1,0,0]}]};
    if(mode==='question')return {message:'Bitte Maße nennen.'};
    throw Object.assign(Error('Provider connection closed'),{code:'AI_TRANSPORT'});
   }});
   if(['cancel','selection'].includes(mode)){await assert.rejects(promise);assert.equal(cad.state().previews,0);}
   else{const result=await promise;assert.equal(result.proposal.verification.passed,false);assert.equal(cad.state().previews,1);assert(result.proposal.correctionError.message);assert.equal(result.commands[0].size[0],60);access.discard(result.proposal.previewId);}
   assert.equal(cad.serialize(),original);assert.equal(cad.state().undo,0);
  }finally{cad.dispose();}
 }
});

test('Failed candidates still reject stale commits and technically uncomputable commands produce no preview',async()=>{
 const {cad,access,refresh}=fixture();try{
  await refresh();const p=await access.preview({revision:cad.revision(),commands:[box],checks:[{...sizeCheck,expected:[61,40,6]}]},{retainFailedChecks:true});
  await cad.execute({kind:'batch',commands:[{...box,size:[2,2,2]}]});await refresh();const changed=cad.serialize();await assert.rejects(access.apply({previewId:p.previewId,revision:p.revision,acceptFailedChecks:true}),{code:'STALE_REVISION'});assert.equal(cad.serialize(),changed);
  access.discard(p.previewId);await assert.rejects(access.preview({revision:cad.revision(),commands:[{...box,size:[-1,0,0]}]},{retainFailedChecks:true}));assert.equal(cad.state().previews,0);
 }finally{cad.dispose();}
});

test('Real surface failure locates only measured samples; part-level marks never alter native colors or geometry',async()=>{
 const {cad,access,refresh}=fixture();try{
  await cad.execute({kind:'batch',commands:[{...box,as:'ref',size:[10,10,10]}]});await refresh();const reference=cad.snapshot().nodes[0].id,before=cad.serialize();
  const p=await access.preview({revision:cad.revision(),commands:[{...box,size:[12,10,10]}],checks:[{kind:'surfaceDeviation',target:'$part',other:reference,expected:.01,maxSamples:200},{kind:'volume',target:'$part',expected:1}]},{retainFailedChecks:true});
  const surface=p.verification.checks[0],marks=aiPreviewErrorMarks({checks:[surface]});assert.equal(surface.passed,false);assert(marks.segments.length>0);assert.deepEqual(marks.rootIds,[]);assert.equal(aiPreviewErrorMarks(p.verification).rootIds.length,1);
  const overlay=createAIErrorOverlay(p.verification);assert.equal(overlay.children.length,2);assert.equal('#'+overlay.children[0].material.color.getHexString(),AI_ERROR_COLOR);overlay.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
  assert.deepEqual(aiPreviewErrorMarks({checks:[{...surface,actual:null}]}).rootIds,[surface.target.rootId]);assert.deepEqual(aiPreviewErrorMarks({checks:[{...surface,passed:true}]}),{rootIds:[],segments:[]});assert.equal(cad.serialize(),before);assert.equal(cad.getPreview(p.previewId).project.nodes[0].color,cad.snapshot().nodes[0].color);access.discard(p.previewId);
 }finally{cad.dispose();}
});

test('Result check validation rejects unknown executable fields, nonfinite values, loose tolerances and excessive work',()=>{
 assert.deepEqual(validateAIResultChecks([sizeCheck]),[sizeCheck]);
 for(const value of [null,{},Array(33).fill(sizeCheck),[{...sizeCheck,script:'print(1)'}],[{...sizeCheck,expected:[NaN,40,6]}],[{...sizeCheck,tolerance:1}],[{...sizeCheck,space:'worldBounds'}],[{kind:'clearance',target:'a',from:[0,0,0],to:[0,0,0],diameter:4}],[{kind:'solids',target:'a',expected:1,tolerance:.01}],[{kind:'volume',target:'a',expected:0}],[{kind:'bounds',target:{rootId:'a',path:[3]},edge:'min',expected:[0,0,0]}]])assert.throws(()=>validateAIResultChecks(value),{code:'AI_CHECK_INVALID'});
 assert.throws(()=>validateAIResultChecks(Array.from({length:32},()=>({...sizeCheck,target:{rootId:'a',path:Array(12).fill('x'.repeat(200))}}))),/6000/);
});

test('Result targets resolve exact nested aliases and refuse ambiguous arrays, prototype names and suppressed sources',()=>{
 const object={target:{rootId:'g',path:['a','b']}},scene={objects:[object]};
 assert.equal(resolveAIResultTarget(scene,'$selected',{selected:object.target}),object);
 for(const aliases of [{selected:['g','other']},{},{selected:{rootId:'g',path:['b']}},{selected:{rootId:'g',path:['a','b'],script:'x'}}])assert.throws(()=>resolveAIResultTarget(scene,'$selected',aliases),{code:'AI_CHECK_INVALID'});
 assert.throws(()=>resolveAIResultTarget(scene,'$__proto__',{}),{code:'AI_CHECK_INVALID'});
 assert.throws(()=>resolveAIResultTarget({objects:[{...object,suppressed:true}]},object.target),/Unterdrückte/);
});

test('Native preview measures dimensions, world position, volume and solids; failing candidates are discarded without history',async()=>{
 const {cad,access,refresh}=fixture();try{
  await refresh();const before=cad.serialize(),undo=cad.state().undo;
  const request={revision:cad.revision(),commands:[box],checks:[sizeCheck,{kind:'bounds',target:'$part',edge:'min',expected:[-30,-20,0]},{kind:'volume',target:'$part',expected:14400,tolerance:.0001},{kind:'solids',target:'$part',expected:1}]};
  const proposal=await access.preview(request);assert.equal(proposal.verification.checks.length,4);assert.ok(proposal.verification.checks.every(c=>c.passed&&c.evidence==='native-brep'));assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,undo);
  // Mutating the returned proof/candidate cannot change the stored Apply.
  proposal.scene.objects[0].volume=123;proposal.verification.checks[0].actual[0]=999;
  await access.apply({previewId:proposal.previewId,revision:proposal.revision});assert.equal(cad.state().undo,undo+1);assert.equal((await cad.describe()).objects[0].volume,14400);cad.undo();assert.equal(cad.serialize(),before);cad.redo();assert.equal((await cad.describe()).objects[0].measures.worldAxisSize[0],60);cad.undo();await refresh();
  for(const check of [{...sizeCheck,expected:[61,40,6]},{kind:'volume',target:'$part',expected:15000},{kind:'solids',target:'$part',expected:2}]){
   await assert.rejects(access.preview({...request,checks:[check]}),error=>{assert.equal(error.code,'AI_RESULT_MISMATCH');assert.equal(error.feedback.checkIndex,1);assert.equal(error.feedback.checkKind,check.kind);return true;});assert.equal(cad.state().previews,0);assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,undo);
  }
 }finally{cad.dispose();}
});

test('Native checks distinguish sheared/mirrored object axes from world AABB and preserve a nested source bottom',async()=>{
 const {cad,access,refresh}=fixture();try{
  await cad.execute({kind:'batch',commands:[box,{op:'create',type:'cylinder',as:'cutter',size:[4,4,20],solid:false},{op:'group',targets:['$part','$cutter'],as:'g'}]});
  const initial=cad.snapshot(),group=initial.nodes[0];group.transform=[-1.25,0,0,0,.2,1,0,0,0,0,.8,0,15,4,3,1];await cad.open(initial);await refresh();
  const before=access.scene(),source=before.objects.find(n=>n.id===group.children[0].id),size=[...source.measures.editSize];size[2]=10/source.sizeToWorldAxisFactors[2];
  const request={revision:cad.revision(),commands:[{op:'update',target:source.target,set:{size}}],checks:[{kind:'size',target:source.target,space:'worldAxes',expected:[75,40*Math.hypot(.2,1),10]},{kind:'bounds',target:source.target,edge:'min',expected:source.worldBounds.min}]};
  const result=await access.preview(request);assert.equal(result.verification.checks.length,2);assert.deepEqual(cad.snapshot(),initial);assert.deepEqual(cad.getPreview(result.previewId).project.nodes[0].children[1],initial.nodes[0].children[1]);
  access.discard(result.previewId);
  await assert.rejects(access.preview({...request,checks:[{...request.checks[0],expected:[83,40,10]}]}),{code:'AI_RESULT_MISMATCH'});
 }finally{cad.dispose();}
});

test('Native distance measures placed BRep surfaces rather than center distance or scene roots',async()=>{
 const {cad,access,refresh}=fixture();try{
  await refresh();const commands=[{op:'create',type:'sphere',size:[4,4,4],pos:[0,0,0],as:'a'},{op:'create',type:'sphere',size:[4,4,4],pos:[10,0,0],as:'b'}],check={kind:'distance',target:'$a',other:'$b',expected:6,tolerance:.0001};
  const p=await access.preview({revision:cad.revision(),commands,checks:[check]});assert.ok(Math.abs(p.verification.checks[0].actual-6)<1e-6);access.discard(p.previewId);
  await assert.rejects(access.preview({revision:cad.revision(),commands,checks:[{...check,expected:10}]}),{code:'AI_RESULT_MISMATCH'});
  const contained=[{op:'create',type:'box',size:[10,10,10],pos:[0,0,0],as:'a'},{op:'create',type:'box',size:[2,2,2],pos:[0,0,0],as:'b'}];
  const q=await access.preview({revision:cad.revision(),commands:contained,checks:[{...check,expected:0}]});assert.equal(q.verification.checks[0].actual,0);access.discard(q.previewId);
 }finally{cad.dispose();}
});

test('Native body count counts disjoint material solids, while cavity shells remain one solid',async()=>{
 const {cad,access,refresh}=fixture();try{
  await refresh();const commands=[{op:'create',type:'box',size:[4,4,4],as:'a'},{op:'create',type:'box',size:[4,4,4],pos:[10,0,0],as:'b'},{op:'group',targets:['$a','$b'],as:'pair'}];
  const p=await access.preview({revision:cad.revision(),commands,checks:[{kind:'solids',target:'$pair',expected:2}]});assert.equal(p.verification.checks[0].actual,2);access.discard(p.previewId);
  const hollow=[{op:'create',type:'box',size:[10,10,10],pos:[0,0,0],as:'a'},{op:'create',type:'box',size:[6,6,6],pos:[0,0,0],solid:false,as:'b'},{op:'group',targets:['$a','$b'],as:'shell'}];
  const q=await access.preview({revision:cad.revision(),commands:hollow,checks:[{kind:'solids',target:'$shell',expected:1},{kind:'volume',target:'$shell',expected:784}]});assert.equal(q.verification.checks[0].actual,1);access.discard(q.previewId);
 }finally{cad.dispose();}
});

test('Native corridor detects a missing, undersized or blind hole in the finished Boolean result',async()=>{
 const {cad,access,refresh}=fixture();try{
  await refresh();const commands=height=>[{op:'create',type:'box',size:[20,20,10],as:'body'},{op:'create',type:'cylinder',size:[4,4,height],pos:[0,0,height===20?0:4],solid:false,as:'cutter'},{op:'group',targets:['$body','$cutter'],as:'result'}],check={kind:'clearance',target:'$result',from:[0,0,-1],to:[0,0,11],diameter:4,tolerance:.01};
  const p=await access.preview({revision:cad.revision(),commands:commands(20),checks:[check]});assert.equal(p.verification.checks[0].actual.clear,true);assert.equal(p.verification.checks[0].actual.diameterChecked,3.98);access.discard(p.previewId);
  for(const [batch,c] of [[commands(20),{...check,diameter:5}],[commands(4),check],[[{op:'create',type:'box',size:[20,20,10],as:'result'}],check]]){
   await assert.rejects(access.preview({revision:cad.revision(),commands:batch,checks:[c]}),e=>{assert.equal(e.code,'AI_RESULT_MISMATCH');assert.ok(e.feedback.actual>0);return true;});assert.equal(cad.state().previews,0);
  }
  await assert.rejects(access.preview({revision:cad.revision(),commands:commands(20),checks:[{...check,from:[40,0,-6],to:[40,0,6]}]}),{code:'AI_CHECK_INVALID'});
  await assert.rejects(access.preview({revision:cad.revision(),commands:commands(20),checks:[{...check,target:'$cutter'}]}),{code:'AI_CHECK_UNSUPPORTED'});
 }finally{cad.dispose();}
});

test('Automatic correction keeps first expected values and tolerances even if the provider omits or weakens checks',async()=>{
 for(const weakened of [undefined,[{...sizeCheck,expected:[40,40,6],tolerance:.1}]]){
  const {cad,access,refresh}=fixture();try{
   await refresh();const original=cad.serialize(),calls=[];
   const outcome=await runCadAIRequest({input:{prompt:'Platte 60 x 40 x 6 mm'},access,generate:async args=>{calls.push(args);return {revision:args.scene.revision,commands:[{...box,size:calls.length===1?[40,40,6]:[60,40,6]}],...(calls.length===1?{checks:[sizeCheck]}:weakened?{checks:weakened}:{})};}});
   assert.equal(calls.length,2);assert.match(calls[1].correction,/AI_RESULT_MISMATCH/);assert.match(calls[1].correction,/expected/);assert.deepEqual(outcome.checks,[sizeCheck]);assert.equal(outcome.proposal.verification.checks[0].actual[0],60);assert.equal(cad.serialize(),original);assert.equal(cad.state().undo,0);
  }finally{cad.dispose();}
 }
});

test('Persistent wrong geometry keeps the last failed candidate after two corrections for explicit review',async()=>{
 const {cad,access,refresh}=fixture();try{
  await refresh();let calls=0;const before=cad.serialize();const outcome=await runCadAIRequest({input:{prompt:'60 x 40 x 6'},access,generate:async args=>{calls++;return {revision:args.scene.revision,commands:[{...box,size:[40,40,6]}],...(calls===1?{checks:[sizeCheck]}:{})};}});assert.equal(outcome.proposal.verification.passed,false);assert.equal(calls,3);assert.equal(cad.state().previews,1);assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,0);
  await assert.rejects(access.apply({previewId:outcome.proposal.previewId,revision:cad.revision()}),{code:'AI_RESULT_ACCEPTANCE_REQUIRED'});access.discard(outcome.proposal.previewId);assert.equal(cad.state().previews,0);
 }finally{cad.dispose();}
});

test('Result feedback is bounded, carries measured evidence and omits arbitrary secret-bearing fields',()=>{
 const error={code:'AI_RESULT_MISMATCH',message:'dimension mismatch',feedback:{checkIndex:2,checkKind:'size',expected:[60,40,6],actual:[40,40,6],tolerance:.01,secret:'PRIVATE',brep:'PRIVATE'}};
 const f=aiFeedback(error);assert.equal(f.checkIndex,2);assert.deepEqual(f.actual,[40,40,6]);assert.equal(f.applied,false);assert.equal(f.secret,undefined);
 const text=correctionFeedback(error,{commands:[box],checks:[sizeCheck]});assert.ok(text.length<12000);assert.match(text,/checks/);assert.doesNotMatch(text,/PRIVATE/);
});

test('Legacy previews still work without silently claiming dimensional requirements were measured',async()=>{
 const {cad,access,refresh}=fixture();try{await refresh();const p=await access.preview({revision:cad.revision(),commands:[box]});assert.deepEqual(p.verification.checks,[]);assert.match(p.verification.scope,/No additional/);assert.equal(cad.state().undo,0);}finally{cad.dispose();}
});

test('Both provider protocols carry result requirements unchanged and the converter retains its separate command contract',async()=>{
 const original=global.fetch,bodies=[];
 global.fetch=async(_url,options)=>{const body=JSON.parse(options.body);bodies.push(body);const answer=JSON.stringify({revision:'current',commands:[box],checks:[sizeCheck]});return new Response(JSON.stringify(body.messages?{choices:[{message:{content:answer}}]}:{output:[{type:'message',content:[{type:'output_text',text:answer}]}]}));};
 try{for(const protocol of ['responses','chat']){
  const result=await generate({protocol,baseUrl:'http://127.0.0.1',model:'local-fixture'},'',{prompt:'60 x 40 x 6',context:{resultChecks:{version:1}},scene:{revision:'current'}});assert.deepEqual(result.checks,[sizeCheck]);assert.match(bodies.at(-1).instructions??bodies.at(-1).messages[0].content,/CAD-result-checks\/1/);
  const converter=await generate({protocol,baseUrl:'http://127.0.0.1',model:'local-fixture'},'',{prompt:'Protect region',domain:'converter',context:{},scene:{revision:'current'}});assert.equal(converter.checks,undefined);
 }}finally{global.fetch=original;}
});

test('Raw mesh bounds are identified as source evidence; a supplied CAD volume cannot turn a mesh into a native proof',()=>{
 const scene={revision:'candidate',objects:[{id:'m',kind:'mesh',target:{rootId:'m',path:[]},measures:{worldAxisSize:[3,4,5]},volume:60}]};
 const r=checkCadAIResultNative({project:{},scene,checks:[{kind:'size',target:'m',space:'worldAxes',expected:[3,4,5]}]});assert.equal(r.checks[0].evidence,'source-bounds');
 assert.throws(()=>checkCadAIResultNative({project:{},scene,checks:[{kind:'volume',target:'m',expected:60}]}),{code:'AI_CHECK_UNSUPPORTED'});
});

test('Apply is blocked while proof runs; cancellation or a changed revision discards the late candidate without retry',async()=>{
 for(const change of ['cancel','revision']){
  const {cad,access,refresh}=fixture();try{
   await refresh();let release,arrived,calls=0,active=true;const barrier=new Promise(r=>release=r),started=new Promise(r=>arrived=r),nativeCheck=cad.checkPreview;
   cad.checkPreview=async(id,checks)=>{arrived(id);await barrier;return nativeCheck(id,checks);};
   const task=runCadAIRequest({input:{prompt:'60 x 40 x 6'},access,isCurrent:()=>active,generate:async()=>{calls++;return {revision:cad.revision(),commands:[box],checks:[sizeCheck]};}});
   const id=await started;await assert.rejects(access.apply({previewId:id,revision:cad.revision()}),{code:'BUSY'});
   if(change==='cancel')active=false;else await cad.execute({kind:'batch',commands:[{op:'create',type:'box',size:[2,2,2],as:'other'}]});
   const original=cad.serialize(),depth=cad.state().undo;release();await assert.rejects(task,e=>change==='cancel'?e.name==='AbortError':e.code==='STALE_REVISION');
   assert.equal(cad.serialize(),original);assert.equal(cad.state().undo,depth);assert.equal(cad.state().previews,0);assert.equal(calls,1);
  }finally{cad.dispose();}
 }
});

test('Published plate example proves all four through corridors on its final rounded CAD body',async()=>{
 const {cad,access,refresh}=fixture();try{await refresh();const p=await access.preview({revision:cad.revision(),...access.context().examples[0]});assert.equal(p.verification.checks.length,6);assert.equal(p.verification.checks.filter(c=>c.kind==='clearance'&&c.actual.clear).length,4);assert.equal(cad.state().undo,0);access.discard(p.previewId);}finally{cad.dispose();}
});
