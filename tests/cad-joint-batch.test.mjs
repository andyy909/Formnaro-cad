import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {createCadController} from '../src/cad-controller.js';
import {createCadAutomationAccess} from '../src/cad-automation-access.js';
import {runCadAIRequest} from '../src/cad-ai-request.js';
import {readFileSync} from 'node:fs';

function fixture(initial,onBuildPreview){
 const cad=createCadController({initial,onBuildPreview,createWorker:()=>{const w=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),a={postMessage:v=>w.postMessage(v),terminate:()=>w.terminate()};w.on('message',data=>a.onmessage?.({data}));w.on('error',e=>a.onerror?.(e));return a;}});
 return {cad,access:createCadAutomationAccess({controller:cad})};
}
const commands=[
 {op:'create',type:'box',as:'house',size:[50,50,30],pos:[0,0,15]},
 {op:'create',type:'box',as:'door',size:[10,2,20],pos:[0,26,10]},
 {op:'joint',action:'create',joint:{id:'doorHinge',kind:'revolute',parentId:'$house',childId:'$door',origin:[-5,26,0],axis:[0,0,1],limits:{min:0,max:90}}}
];
test('geometry and door hinge share one checked, revision-bound preview, Apply and Undo',async()=>{
 const {cad,access}=fixture();try{
  const before=cad.serialize(),revision=cad.revision();
  const p=await access.preview({revision,commands,checks:[{kind:'size',target:'$house',space:'worldAxes',expected:[50,50,null]}]});
  assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,0);assert.equal(p.verification.checks[0].passed,true);
  assert.equal(p.joints.total,1);assert.equal(p.aliases.house,p.joints.joints[0].parentId);assert.equal(p.aliases.door,p.joints.joints[0].childId);
  assert.equal(p.after.length,2);await cad.apply({previewId:p.previewId,revision});assert.equal(cad.state().undo,1);
  const closed=cad.serialize(),motion=await access.preview({revision:cad.revision(),commands:[{op:'joint',action:'move',values:[{jointId:'doorHinge',value:60}]}]});
  assert.equal(motion.displayPlacements.length,1);assert.equal(cad.serialize(),closed);access.discard(motion.previewId);
  cad.undo();assert.equal(cad.serialize(),before);
 }finally{cad.dispose();}
});

test('create and multiple movements stay transient until one Apply and use stable joint IDs',async()=>{
 const {cad,access}=fixture();try{
  const before=cad.serialize(),p=await access.preview({revision:cad.revision(),commands:[...commands,{op:'joint',action:'move',values:[{jointId:'doorHinge',value:60}]},{op:'joint',action:'move',values:[{jointId:'doorHinge',value:30}]}]});
  assert.equal(p.joints.joints[0].value,30);assert.equal(p.displayPlacements.length,1);assert.equal(p.jointReport.actions,3);assert.equal(cad.serialize(),before);
  cad.apply(p);assert.equal(cad.snapshot().joints.joints[0].value,30);assert.equal(cad.state().undo,1);cad.undo();assert.equal(cad.serialize(),before);
 }finally{cad.dispose();}
});

test('a late invalid hinge, limits violation or unresolved alias rejects the entire geometry proposal',async()=>{
 const {cad,access}=fixture();try{
  const before=cad.serialize();
  for(const bad of [
   {...commands[2],joint:{...commands[2].joint,childId:'$missing'}},
   {...commands[2],joint:{...commands[2].joint,childId:'$house'}},
   {...commands[2],unexpected:true},
  ]){await assert.rejects(access.preview({revision:cad.revision(),commands:[...commands.slice(0,2),bad]}));assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,0);assert.equal(cad.state().previews,0);}
  await assert.rejects(access.preview({revision:cad.revision(),commands:[...commands,{op:'joint',action:'move',values:[{jointId:'doorHinge',value:100}]}]}),e=>e.code==='JOINT_LIMIT');assert.equal(cad.serialize(),before);
 }finally{cad.dispose();}
});

test('retained sources cannot be used as rigid hinge roots and failed result checks still block Apply',async()=>{
 const {cad,access}=fixture();try{
  await assert.rejects(access.preview({revision:cad.revision(),commands:[...commands.slice(0,2),{op:'create',type:'box',as:'extra',size:[2,2,2]},{op:'group',targets:['$house','$extra'],as:'group'},commands[2]]}),e=>e.code==='JOINT_TARGET');
  assert.equal(cad.state().previews,0);assert.equal(cad.state().undo,0);
  const p=await access.preview({revision:cad.revision(),commands,checks:[{kind:'size',target:'$house',space:'worldAxes',expected:[51,50,null]}]},{retainFailedChecks:true});
  assert.equal(p.verification.passed,false);await assert.rejects(access.apply(p),e=>e.code==='AI_RESULT_ACCEPTANCE_REQUIRED');assert.equal(cad.snapshot().nodes.length,0);access.discard(p.previewId);
 }finally{cad.dispose();}
});

test('mixed joint previews reject stale revisions and preserve unrelated locked bodies',async()=>{
 const {cad,access}=fixture();try{
  const existing=await cad.preview({kind:'batch',commands:[{op:'create',type:'box',as:'keep',size:[3,4,5],pos:[100,0,0],name:'Unbeteiligt'}]});cad.apply(existing);
  const before=cad.serialize(),node=structuredClone(cad.snapshot().nodes[0]),stale=cad.revision();
  const p=await access.preview({revision:stale,commands});assert.deepEqual(cad.getPreview(p.previewId).project.nodes.find(n=>n.id===node.id),node);cad.apply(p);
  await assert.rejects(access.preview({revision:stale,commands}),e=>e.code==='STALE_REVISION');cad.undo();assert.equal(cad.serialize(),before);
  const locked=cad.snapshot();locked.nodes[0].locked=true;const protectedFixture=fixture(locked);try{
   const protectedState=protectedFixture.cad.serialize();await assert.rejects(protectedFixture.access.preview({revision:protectedFixture.cad.revision(),commands:[commands[0],{op:'joint',action:'create',joint:{kind:'fixed',parentId:'$house',childId:node.id,origin:[0,0,0]}}]}),e=>e.code==='LOCKED_JOINT_TARGET');assert.equal(protectedFixture.cad.serialize(),protectedState);
  }finally{protectedFixture.cad.dispose();}
 }finally{cad.dispose();}
});

test('explicit unchecked trial skips every automatic result/FreeCAD/image check and quality retry',async()=>{
 const {cad}=fixture();let scene,calls=0;const access=createCadAutomationAccess({controller:cad,getScene:()=>scene});try{
  scene=await cad.describe();const before=cad.serialize(),result=await runCadAIRequest({input:{prompt:'Probe ohne Modellprüfungen',modelStrictness:100,modelChecks:false},access:{...access,inspectFreeCADPreview:()=>{throw Error('Must skip independent model check');},inspectPreview:()=>{throw Error('Must skip visual model check');}},generate:async args=>{calls++;assert.equal(args.context.modellingPolicy.checksEnabled,false);return {revision:cad.revision(),commands,checks:[{kind:'solids',target:'$missing',expected:42}]};}});
  assert.equal(calls,1);assert.equal(result.correctionAttempts,0);assert.equal(result.proposal.verification.skipped,true);assert.equal(result.proposal.verification.passed,undefined);assert.deepEqual(result.proposal.verification.checks,[]);assert.equal(result.proposal.joints.total,1);assert.equal(cad.serialize(),before);
  cad.apply(result.proposal);assert.equal(cad.state().undo,1);cad.undo();assert.equal(cad.serialize(),before);
 }finally{cad.dispose();}
});

test('a calculated candidate is exposed before another correction or visual review starts',async()=>{
 const {cad}=fixture();let scene,calls=0;const shown=[],access=createCadAutomationAccess({controller:cad,getScene:()=>scene});try{
  scene=await cad.describe();const before=cad.serialize(),result=await runCadAIRequest({input:{prompt:'50 mm breit',modelStrictness:100},access,visualReview:false,maxCorrections:1,onCandidate:async p=>{assert(cad.getPreview(p.previewId));assert.equal(cad.serialize(),before);shown.push(p.previewId);},generate:async()=>{calls++;if(calls===2)assert.equal(shown.length,1,'first native candidate must be visible during correction');return {revision:cad.revision(),commands:[{op:'create',type:'box',as:'part',size:[calls===1?49:50,50,30]}],checks:[{kind:'size',target:'$part',space:'edit',expected:[50,50,null]}]};}});
  assert.equal(calls,2);assert.equal(shown.length,2);assert.equal(shown[1],result.proposal.previewId);assert.equal(cad.serialize(),before);access.discard(result.proposal.previewId);
 }finally{cad.dispose();}
});

test('native house fixture produces one hollow house/roof body, a separate door and a working hinge',async()=>{
 const {cad,access}=fixture();try{
  const design=JSON.parse(readFileSync(new URL('./fixtures/cad-house-joint.json',import.meta.url))),before=cad.serialize(),p=await access.preview({...design,revision:cad.revision()},{retainFailedChecks:true});
  assert.equal(p.verification.passed,true);assert.equal(p.joints.total,1);assert.equal(p.after.length,2);assert.equal(cad.serialize(),before);cad.apply(p);
  const motion=await access.preview({revision:cad.revision(),commands:[{op:'joint',action:'move',values:[{jointId:'doorHinge',value:75}]}]});assert.equal(motion.displayPlacements.length,1);assert.equal(motion.joints.joints[0].value,75);access.discard(motion.previewId);cad.undo();assert.equal(cad.serialize(),before);
 }finally{cad.dispose();}
});

test('live native construction exposes each real intermediate project without committing it, and can be switched off',async()=>{
 const steps=[],{cad}=fixture(undefined,async value=>{assert.equal(cad.snapshot().nodes.length,0);assert.equal(cad.state().undo,0);assert.equal(cad.state().previews,0);const display=await cad.display(value.project);assert(display.meshes.length>0);steps.push({step:value.completed,roots:value.project.nodes.length});}),access=createCadAutomationAccess({controller:cad});try{
  const design=JSON.parse(readFileSync(new URL('./fixtures/cad-house-joint.json',import.meta.url))),p=await access.preview({...design,revision:cad.revision()});assert.deepEqual(steps.map(s=>s.step),[1,2,3,4,5,6,7,8,9]);assert.equal(steps[0].roots,1);assert.equal(steps[6].roots,1);access.discard(p.previewId);
  const off=createCadAutomationAccess({controller:cad,getLivePreviewEnabled:()=>false,getModelChecksEnabled:()=>false});const unchecked=await off.preview({...design,checks:[{kind:'solids',target:'$missing',expected:99}],revision:cad.revision()});assert.equal(steps.length,9);assert.equal(unchecked.verification.skipped,true);assert.equal(off.context().modelCheckPolicy.enabled,false);access.discard(unchecked.previewId);
 }finally{cad.dispose();}
});

test('an interrupted real build can restore and apply its captured partial state with one Undo',async()=>{
 let captured;const {cad}=fixture(undefined,async value=>{if(value.completed===2){captured=cad.getBuildPreview();throw Object.assign(Error('User stopped'),{name:'AbortError',code:'ABORTED'});}});let scene;const access=createCadAutomationAccess({controller:cad,getScene:()=>scene,refresh:async()=>{scene=await cad.describe();}});try{
  scene=await cad.describe();const before=cad.serialize(),design=JSON.parse(readFileSync(new URL('./fixtures/cad-house-joint.json',import.meta.url)));
  await assert.rejects(access.preview({...design,revision:cad.revision()}),e=>e.name==='AbortError');assert.equal(cad.serialize(),before);assert.equal(captured.project.nodes.length,2);
  const p=await access.restoreCandidate({project:captured.project,proposal:{aliases:captured.aliases},result:{label:'So übernehmen'}},{checks:[],revision:captured.revision});await access.apply({previewId:p.previewId,revision:p.revision,acceptFeatureDependencies:true});assert.equal(cad.snapshot().nodes.length,2);assert.equal(cad.state().undo,1);cad.undo();assert.equal(cad.serialize(),before);
 }finally{cad.dispose();}
});

test('So übernehmen restores grouped source aliases and the hinge from an already calculated candidate',async()=>{
 const {cad}=fixture(undefined,async()=>{});let scene;const access=createCadAutomationAccess({controller:cad,getScene:()=>scene,refresh:async()=>{scene=await cad.describe();}});try{
  scene=await cad.describe();const before=cad.serialize(),design=JSON.parse(readFileSync(new URL('./fixtures/cad-house-joint.json',import.meta.url))),first=await access.preview({...design,revision:cad.revision()}),captured=cad.getBuildPreview();access.discard(first.previewId);
  assert.equal(typeof captured.aliases.outer,'object');const {validateTaskCandidate}=await import('../src/cad-ai-task-candidate.js');
  for(const invalid of [{rootId:captured.aliases.door,path:[captured.aliases.outer.path[0]]},{rootId:captured.aliases.outer.rootId,path:['missing']},{...captured.aliases.outer,selector:'outside'},['missing']])assert.throws(()=>validateTaskCandidate(captured.project,{bad:invalid}),e=>e.code==='AI_TASK_CANDIDATE_INVALID');
  assert.deepEqual(validateTaskCandidate(captured.project,{parts:[captured.aliases.outer,captured.aliases.door]}).aliases.parts,[captured.aliases.outer,captured.aliases.door]);
  const p=await access.restoreCandidate({project:captured.project,proposal:{aliases:captured.aliases}},{checks:[],revision:captured.revision});await access.apply({previewId:p.previewId,revision:p.revision,acceptFeatureDependencies:true});assert.equal(cad.snapshot().joints.joints.length,1);assert.equal(cad.state().undo,1);cad.undo();assert.equal(cad.serialize(),before);
 }finally{cad.dispose();}
});

test('full practice modelling catalogue builds three actual native gears and couples every follower',async()=>{
 const {cad,access}=fixture();try{
  const plan=JSON.parse(readFileSync(new URL('./fixtures/practice-three-gears.json',import.meta.url)));
  for(const step of plan.actions){const p=await access.preview({...Object.fromEntries(Object.entries(step).filter(([k])=>k!=='kind')),revision:cad.revision()},{retainFailedChecks:true});assert.notEqual(p.verification.passed,false);cad.apply(p);}
  const project=cad.snapshot();assert.equal(project.nodes.filter(n=>n.recipe?.type==='gear').length,3);assert.equal(project.joints.joints.length,3);assert.equal(project.joints.gears.length,2);
  const p=await access.preview({revision:cad.revision(),commands:[{op:'joint',action:'move',values:[{jointId:'gear-a',value:60}]}]});assert.deepEqual(p.joints.joints.map(j=>j.value),[60,-40,60]);assert.equal(p.displayPlacements.length,3);access.discard(p.previewId);
  for(const n of project.nodes.filter(n=>n.recipe?.type==='gear'))assert.equal(n.recipe.params.module,1.5);
 }finally{cad.dispose();}
});
