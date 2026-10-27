import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import freecad from '../backend/freecad.cjs';
import {createCadController} from '../src/cad-controller.js';
import {createCadAutomationAccess} from '../src/cad-automation-access.js';
import {runCadAIRequest} from '../src/cad-ai-request.js';
import {parseCadProject} from '../src/cad-project.js';
import {runFreeCADPlan} from '../src/cad-freecad.js';
const factory=()=>{const w=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),a={postMessage:v=>w.postMessage(v),terminate:()=>w.terminate()};w.on('message',v=>a.onmessage?.({data:v}));w.on('error',e=>a.onerror?.(e));return a;};
const plan={version:1,name:'Prüfhalter',parameters:{width:40},steps:[{id:'base',op:'box',size:[{param:'width'},30,5]},{id:'bore',op:'cylinder',radius:3,height:7,origin:[20,15,-1]},{id:'result',op:'cut',source:'base',tool:'bore'}],output:'result'};
test('FreeCAD travels through real CAD workers, checks, source persistence, Preview/Apply/Undo',async()=>{
 const previous=globalThis.offlinecadDesktop;globalThis.offlinecadDesktop={runFreeCADReply:async args=>{try{return {ok:true,value:await freecad.run(args)};}catch(e){return {ok:false,error:e.message,code:e.code};}},cancelFreeCAD:async()=>true};
 const cad=createCadController({createWorker:factory});let scene;
 const refresh=async()=>{scene=await cad.describe();},access=createCadAutomationAccess({controller:cad,getScene:()=>scene,refresh});
 try{
  await refresh();const original=cad.serialize();const proposal=await access.preview({revision:scene.revision,commands:[{op:'tool',engine:'freecad',as:'result',operation:{kind:'build',inputs:[],plan}}],checks:[{kind:'solids',target:'$result',expected:1},{kind:'bounds',edge:'size',target:'$result',expected:[40,30,5]}]});
  assert.ok(proposal.verification.checks.every(c=>c.passed!==false));assert.equal(cad.serialize(),original);const independent=await cad.inspectFreeCADPreview(proposal.previewId);assert.equal(independent.passed,true);assert.equal(independent.geometry.solids,1);
  await access.apply({previewId:proposal.previewId,revision:proposal.revision});const built=cad.serialize(),node=parseCadProject(built).nodes[0];assert.deepEqual(node.metadata.freecadSource.plan,plan);assert.match(node.metadata.freecadSource.documentBase64,/^UEs/);assert.equal(cad.state().undo,1);assert.ok(!JSON.stringify(await cad.describe()).includes(node.metadata.freecadSource.documentBase64));
  await cad.undo();assert.equal(cad.serialize(),original);await cad.redo();assert.equal(cad.serialize(),built);
  await refresh();const inspect=await cad.analyze([{id:'check',engine:'freecad',kind:'inspect',options:{inputs:[{name:'source',target:node.id}],plan:{version:1,steps:[{id:'topology',op:'inspect',source:'source'}],output:'source'}}}]);assert.equal(inspect.results[0].value.geometry.valid,true);assert.equal(cad.serialize(),built);
 }finally{cad.dispose();globalThis.offlinecadDesktop=previous;}
});
test('Extended workflow measures more than two rounds and fixes more than two times',async()=>{
 let calls=0,previews=0;const input={prompt:'A measured part'},scene=()=>({revision:'r',selectionTargets:[]});
 const r=await runCadAIRequest({input,maxSteps:24,visualReview:false,access:{scene,context:()=>({}),analyze:async()=>({results:[{value:{feature:calls,length:10+calls}}]}),preview:async()=>{if(++previews<5)throw Object.assign(Error('Construction needs another correction'),{feedback:{checkIndex:1,checkKind:'size',expected:[60,40,6],actual:[40+previews,40,6]}});return {previewId:'good'};}},generate:async args=>{assert.equal(args.prompt,input.prompt);assert.equal(args.context.agentWorkflow.maxSteps,24);return ++calls<=4?{revision:'r',analysis:[{id:'measure'+calls,engine:'app',kind:'bounds',options:{}}]}:{revision:'r',commands:[]};}});
 assert.equal(r.analysisRounds,4);assert.equal(r.correctionAttempts,4);assert.equal(r.proposal.previewId,'good');assert.equal(calls,9);
});
test('Hidden, locked legacy STL sources can be read through a private export copy',async()=>{
 const project={nodes:[{id:'source',kind:'referenceMesh',hidden:true,locked:true,mesh:{verts:[0,0,0],triangles:[]}}],layers:[{id:'default',hidden:true}],folders:[]},before=structuredClone(project);
 const r=await runFreeCADPlan({project,operation:{kind:'inspect',inputs:[{name:'source',target:'source'}],plan:{version:1,steps:[{id:'measurement',op:'inspect',source:'source'}],output:'source'}},exportGeometry:async(p,o)=>{assert.equal(o.format,'stl');assert.equal(p.nodes[0].kind,'mesh');assert.equal(p.nodes[0].hidden,false);assert.equal(p.nodes[0].locked,true);assert.equal(p.layers[0].hidden,false);return {data:Uint8Array.of(1,2,3)};},desktop:{runFreeCADReply:async args=>{assert.equal(args.inspectOnly,true);return {ok:true,value:{engineVersion:'test',report:{valid:true},measurements:[]}};}}});assert.equal(r.geometry.valid,true);assert.deepEqual(project,before);
});
test('A worse final candidate cannot replace a better usable draft; cancellation discards it',async()=>{
 let calls=0;const discarded=[],check=()=>({passed:false,error:{code:'AI_RESULT_MISMATCH',message:'Mismatch'}}),scene=()=>({revision:'r'});
 const result=await runCadAIRequest({input:{},maxSteps:8,visualReview:false,access:{scene,context:()=>({}),preview:async()=>({previewId:'p'+calls,verification:{passed:false,checks:Array.from({length:calls},check)}}),discard:id=>discarded.push(id)},generate:async()=>({revision:'r',commands:[],label:String(++calls)})});
 assert.equal(result.proposal.previewId,'p1');assert.equal(calls,7);assert.ok(!discarded.includes('p1'));assert.equal(discarded.length,6);assert.equal(result.proposal.correctionError.code,'AI_TASK_STALLED');assert.equal(result.taskProgress.stop.reason,'no-progress');assert.match(result.proposal.correctionError.message,/Mismatch/);
});
