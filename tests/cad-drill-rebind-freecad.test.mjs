import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import freecad from '../backend/freecad.cjs';
import {createCadController} from '../src/cad-controller.js';
import {cadProjectParameterProblems} from '../src/cad-project-parameters-data.js';
import {createCadDrawingSheet,cadDrawingProblems,cadDrawingSourceSignatures} from '../src/cad-drawing-data.js';
import {cadContourLinkProblems} from '../src/cad-linked-contours-data.js';
import {captureCadAISourceReference,cadAIReferenceState} from '../src/cad-ai-feature-references.js';
import {freeCADSourceDigest} from '../src/cad-freecad-source.js';
const target=(rootId,path=[])=>({rootId,path});
const factory=()=>{const worker=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),adapter={postMessage:v=>worker.postMessage(v),terminate:()=>worker.terminate()};worker.on('message',v=>adapter.onmessage?.({data:v}));worker.on('error',e=>adapter.onerror?.(e));return adapter;};
const operation=parameterData=>({kind:'tool',name:'previewRebindDrills',options:{id:'bore',bindings:[{path:[],reference:{ray:{origin:[0,0,-30],direction:[0,0,1]}}}],parameterData}});
async function fixture(t,{fail=false}={}){
 const desktop=globalThis.offlinecadDesktop,calls=[],jobs=new Map();
 globalThis.offlinecadDesktop={runFreeCADReply:async args=>{calls.push(args);const abort=new AbortController();jobs.set(args.requestId,abort);try{const {requestId,...request}=args;return {ok:true,value:await freecad.run(request,{signal:abort.signal})};}catch(e){return {ok:false,code:e.code,error:e.message};}finally{jobs.delete(args.requestId);}},cancelFreeCAD:async({requestId})=>jobs.get(requestId)?.abort()};
 const cad=createCadController({createWorker:factory});t.after(()=>{cad.dispose();globalThis.offlinecadDesktop=desktop;});
 await cad.execute({kind:'create',recipe:{type:'box',size:[40,20,8]},options:{id:'base'}});
 await cad.execute({kind:'tool',name:'previewDrill',options:{id:'base',resultId:'bore',associative:true,kind:'counterbore',diameter:4,headDiameter:8,headDepth:1,reference:{ray:{origin:[0,0,30],direction:[0,0,-1]}}}});
 const script={version:1,name:'Bore volume follower',parameters:{extra:2},code:(fail?"if inputs['raw'].Volume>8000: raise ValueError('REBIND_FOLLOWER_FAIL')\n":'')+"result=doc.addObject('Part::Box','Following');result.Length=inputs['raw'].Volume/1000+parameters['extra'];result.Width=5;result.Height=3;result.Placement.Base=App.Vector(70,0,0);doc.recompute()"};
 await cad.execute({kind:'batch',commands:[{op:'tool',engine:'freecad',operation:{kind:'build',script,inputs:[{name:'raw',target:'bore'}]}}]});const follower=cad.snapshot().nodes.at(-1).id;
 const data={version:2,parameters:[{id:'height',name:'height',value:8},{id:'extra',name:'extra',value:2}],bindings:[{id:'height-binding',parameterId:'height',target:target('bore',['base']),field:'size.2'},{id:'extra-binding',parameterId:'extra',target:target(follower),field:'freecad.parameters.extra'}],variants:[],activeVariantId:null,freecad:[{target:target(follower),inputs:[{name:'raw',target:target('bore')}]}]};
 cad.apply(await cad.previewProjectParameters(data));return {cad,calls,follower,script};
}

test('the actual worker reruns the saved FreeCAD follower once with the freshly rebound stock and keeps one Undo',async t=>{
 const {cad,calls,follower,script}=await fixture(t),sheet=createCadDrawingSheet({sourceIds:['bore',follower]});cad.apply(await cad.previewDrawings({version:1,sheets:[sheet]}));cad.apply(await cad.previewDrawingUpdate({version:1,sheets:[sheet]},{sheetIds:[sheet.id]}));
 const initial=cad.snapshot(),reference=captureCadAISourceReference(initial,target(follower),{id:'follower-ref'});initial.featureReferences={version:1,items:[reference]};await cad.open(initial);
 const before=cad.serialize(),depth=cad.state().undo,count=calls.length,data=cad.snapshot().projectParameters;data.parameters.find(p=>p.id==='height').value=12;
 const p=await cad.preview(operation(data));assert.equal(calls.length-count,1);assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,depth);
 const node=p.project.nodes.find(n=>n.id===follower);assert(Math.abs(node.stats.volume-15*((9600-60*Math.PI)/1000+2))<1e-5);assert.deepEqual(node.metadata.freecadSource.script,script);
 assert.equal(p.report.freecad.length,1);assert.equal(p.report.freecad[0].stepReadback.check,'passed');assert.equal(p.report.drawingViews.length,3);assert.deepEqual(cadProjectParameterProblems(p.project),[]);assert.deepEqual(cadContourLinkProblems(p.project),[]);
 assert.deepEqual(cadDrawingProblems(p.project.drawings.sheets[0],{sourceSignatures:cadDrawingSourceSignatures(p.project)}),[]);assert.equal(cadAIReferenceState(p.project,reference).status,'stale');assert(p.warnings.some(w=>w.includes('ausdrücklich neu auswählen')));
 cad.apply(p);assert.equal(cad.state().undo,depth+1);const after=cad.serialize();cad.undo();assert.equal(cad.serialize(),before);cad.redo();assert.equal(cad.serialize(),after);assert((await cad.exportModel({format:'step',ids:['bore',follower]})).data.length>1000);
});

test('a failing downstream program discards the rebuilt drill and parameter edits and preserves a previous preview',async t=>{
 const {cad,calls}=await fixture(t,{fail:true}),before=cad.serialize(),depth=cad.state().undo,count=calls.length,data=cad.snapshot().projectParameters;data.parameters.find(p=>p.id==='height').value=12;
 const old=await cad.preview({kind:'tool',name:'previewRebindDrills',options:{...operation(data).options,parameterData:undefined}});
 await assert.rejects(()=>cad.preview(operation(data)),/REBIND_FOLLOWER_FAIL/);assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,depth);assert.equal(calls.length-count,2);cad.apply(old);cad.undo();assert.equal(cad.serialize(),before);
});

test('explicit construction stock replacement reruns its saved FreeCAD follower from the fresh replacement once',async t=>{
 const {cad,calls,follower,script}=await fixture(t);await cad.execute({kind:'create',recipe:{type:'box',size:[60,30,12]},options:{id:'replacement',transform:[1,0,0,0,0,1,0,0,0,0,1,0,90,0,0,1]}});const before=cad.serialize(),candidate=structuredClone(cad.snapshot().nodes.find(n=>n.id==='replacement')),count=calls.length,depth=cad.state().undo;
 const op=operation(cad.snapshot().projectParameters);op.options.sourceReplacement={path:[],source:target('replacement')};op.options.bindings=[{path:[],reference:{ray:{origin:[90,0,30],direction:[0,0,-1]}}}];const preview=await cad.preview(op),bore=preview.project.nodes.find(n=>n.id==='bore'),next=preview.project.nodes.find(n=>n.id===follower);
 assert.equal(calls.length-count,1);assert(Math.abs(bore.stats.volume-(14400-44*Math.PI))<1e-5);assert(Math.abs(next.stats.volume-15*(bore.stats.volume/1000+2))<1e-5);assert.deepEqual(next.metadata.freecadSource.script,script);assert.deepEqual(preview.project.nodes.find(n=>n.id==='replacement'),candidate);assert.deepEqual(cadProjectParameterProblems(preview.project),[]);assert.equal(cad.serialize(),before);cad.apply(preview);assert.equal(cad.state().undo,depth+1);cad.undo();assert.equal(cad.serialize(),before);
});

test('failed FreeCAD follower preserves a previous preview and the original stock during replacement',async t=>{
 const {cad}=await fixture(t,{fail:true});await cad.execute({kind:'create',recipe:{type:'box',size:[60,30,12]},options:{id:'replacement',transform:[1,0,0,0,0,1,0,0,0,0,1,0,90,0,0,1]}});const before=cad.serialize(),depth=cad.state().undo,old=await cad.preview(operation(cad.snapshot().projectParameters)),op=operation(cad.snapshot().projectParameters);op.options.sourceReplacement={path:[],source:target('replacement')};op.options.bindings=[{path:[],reference:{ray:{origin:[90,0,30],direction:[0,0,-1]}}}];await assert.rejects(()=>cad.preview(op),/REBIND_FOLLOWER_FAIL/);assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,depth);cad.apply(old);cad.undo();assert.equal(cad.serialize(),before);
});

test('direct and local KI rebind proposals cannot replace native FreeCAD edits without the private dependency acceptance',async t=>{
 const {cad,follower}=await fixture(t),source=cad.snapshot().nodes.find(n=>n.id===follower).metadata.freecadSource;
 const edited=await cad.previewFreeCADDocument({target:target(follower),sourceDigest:freeCADSourceDigest(source.documentBase64),resultObject:'Following',edits:[{object:'Following',property:'Width',expectedType:'App::PropertyLength',expectedValue:5,value:6}]});cad.apply({...edited,acceptFeatureDependencies:true});
 assert.equal(cad.snapshot().nodes.find(n=>n.id===follower).metadata.freecadSource.mode,'native');
 const before=cad.serialize(),depth=cad.state().undo,data=cad.snapshot().projectParameters;data.parameters.find(p=>p.id==='height').value=12;
 for(const mixed of [false,true]){
  const op=operation(data),p=await cad.preview(mixed?{kind:'batch',commands:[{op:'tool',engine:'cad',operation:op}]}:op),report=mixed?p.report.meshOperations[0]:p.report;
  assert.equal(report.requiresFreeCADAcceptance,true);assert.equal(report.freecad[0].replacesNative,true);assert.equal(cad.serialize(),before);
  report.requiresFreeCADAcceptance=false;assert.throws(()=>cad.apply(p),{code:'AI_FEATURE_DEPENDENCY_ACCEPTANCE_REQUIRED'});assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,depth);
  cad.apply({...p,acceptFeatureDependencies:true});assert.equal(cad.state().undo,depth+1);cad.undo();assert.equal(cad.serialize(),before);
 }
});
