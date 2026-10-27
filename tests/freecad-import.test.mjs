import {encodeFnpackProject,createFnpackResolver} from '../src/cad-fnpack-data.js';
import {hasGeometryRefs} from '../src/cad-geometry-ref.js';
import {exchangeMainFile} from '../src/exchange-formats.js';
import test from 'node:test';import assert from 'node:assert/strict';import {Worker} from 'node:worker_threads';
import freecad from '../backend/freecad.cjs';
import {createCadController} from '../src/cad-controller.js';
import {freeCADSourceDigest} from '../src/cad-freecad-source.js';
import {inspectFreeCADArchive} from '../src/cad-freecad-import.js';
import {readFreeCADDocument} from '../src/cad-freecad-document.js';
import {parseCadProject} from '../src/cad-project.js';
import {easyImportPolicy} from '../src/cad-easy-domain.js';
const factory=()=>{const w=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),a={postMessage:v=>w.postMessage(v),terminate:()=>w.terminate()};w.on('message',v=>a.onmessage?.({data:v}));w.on('error',e=>a.onerror?.(e));return a;};
let archive;
test.before(async()=>{const made=await freecad.run({inspectOnly:true,script:{version:1,code:"a=doc.addObject('Part::Box','MainBody');a.Length=10;a.Width=5;a.Height=3;a.Placement.Base=App.Vector(25,-10,2)\nb=doc.addObject('Part::Box','Independent');b.Length=2;b.Width=3;b.Height=4;b.Placement.Base=App.Vector(-50,0,0)\nplane=doc.addObject('Part::Feature','Surface');plane.Shape=Part.makePlane(5,5)\ndoc.recompute();doc.saveAs(str(workspace/'external.FCStd'))\nimport base64\nmeasurements={'archive':base64.b64encode((workspace/'external.FCStd').read_bytes()).decode('ascii')}"}});archive=made.measurements.archive;});
async function setup(t,options={}){const previous=globalThis.offlinecadDesktop,calls=[];globalThis.offlinecadDesktop={runFreeCADReply:async args=>{calls.push(args);try{const {requestId,...request}=args;return {ok:true,value:await freecad.run(request)};}catch(e){return {ok:false,error:e.message,code:e.code};}},cancelFreeCAD:async()=>{}};const cad=createCadController({createWorker:factory,...options});t.after(()=>{cad.dispose();globalThis.offlinecadDesktop=previous;});return {cad,calls};}
const request=resultObject=>({documentBase64:archive,sourceDigest:freeCADSourceDigest(archive),resultObject,name:'Original.FCStd'});

test('A standalone FCStd with no Formnaro script exposes native result choices and imports only the explicitly selected body with the original archive intact',async t=>{
 const {cad}=await setup(t),tree=await inspectFreeCADArchive(archive);assert.equal(tree.tree.resultObject,null);assert.equal(tree.tree.objects.length,3);assert(tree.tree.objects.every(o=>!o.properties.some(p=>p.name==='FormnaroPython')));assert(tree.tree.objects.some(o=>o.name==='MainBody'&&!o.staticShape));assert(tree.tree.objects.some(o=>o.name==='Surface'&&o.staticShape));
 await cad.execute({kind:'batch',commands:[{op:'create',type:'box',name:'Keep',size:[3,4,5],pos:[60,0,0]}]});const before=cad.serialize(),old=cad.snapshot(),depth=cad.state().undo,p=await cad.previewFreeCADImport(request('MainBody'));assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,depth);assert.deepEqual(p.project.nodes[0],old.nodes[0]);assert.equal(p.project.nodes.length,2);const imported=p.project.nodes[1],source=imported.metadata.freecadSource;assert.equal(imported.source,'step');assert.equal(source.documentBase64,archive);assert.equal(source.resultObject,'MainBody');assert.equal(source.mode,'native');assert(!Object.hasOwn(source,'script')&&!Object.hasOwn(source,'plan'));assert.equal(p.project.version,22);assert.equal(p.report.freecadImport.stepReadback.check,'passed');assert.deepEqual(p.selectedTargets,[{rootId:imported.id,path:[]}]);assert(Math.abs(imported.stats.volume-150)<1e-7);
 const measured=await cad.checkPreview(p.previewId,[{kind:'volume',target:imported.id,expected:150,tolerance:.00001}]);assert(measured.checks.every(c=>c.passed));cad.apply(p);assert.equal(cad.state().undo,depth+1);const saved=cad.serialize();assert.equal(parseCadProject(saved).nodes[1].metadata.freecadSource.documentDigest,freeCADSourceDigest(archive));cad.undo();assert.equal(cad.serialize(),before);cad.redo();assert.equal(cad.serialize(),saved);
 const native=await readFreeCADDocument(cad.snapshot().nodes[1].metadata.freecadSource);assert.equal(native.tree.resultObject,'MainBody');assert(native.tree.objects.some(o=>o.name==='Independent'));
});

test('A native property of an imported external construction remains editable, preserves the other native objects and owns one Undo',async t=>{
 const {cad}=await setup(t);cad.apply(await cad.previewFreeCADImport(request('MainBody')));const before=cad.serialize(),node=cad.snapshot().nodes[0],p=await cad.previewFreeCADDocument({target:{rootId:node.id,path:[]},sourceDigest:freeCADSourceDigest(archive),resultObject:'MainBody',edits:[{object:'MainBody',property:'Length',expectedType:'App::PropertyLength',expectedValue:10,value:14}]});assert.equal(cad.serialize(),before);assert(Math.abs(p.project.nodes[0].stats.volume-210)<1e-7);assert(p.report.freecad.independentObjectsExact.includes('Independent'));assert(!p.project.nodes[0].metadata.freecadSource.script);cad.apply(p);cad.undo();assert.equal(cad.serialize(),before);assert.equal(cad.snapshot().nodes[0].metadata.freecadSource.documentBase64,archive);
});

test('Ambiguous, missing, stale, non-solid and already cancelled imports never replace the confirmed project',async t=>{
 const {cad,calls}=await setup(t),before=cad.serialize();await assert.rejects(cad.previewFreeCADImport({...request('MainBody'),resultObject:undefined}),{code:'FREECAD_IMPORT_INPUT'});await assert.rejects(cad.previewFreeCADImport({...request('MainBody'),sourceDigest:'0'.repeat(64)}),{code:'FREECAD_IMPORT_INPUT'});assert.equal(calls.length,0);await assert.rejects(cad.previewFreeCADImport(request('Missing')),/fehlt|Ergebnis/);await assert.rejects(cad.previewFreeCADImport(request('Surface')),/geschlossen|Volumen|gültig/);assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,0);const abort=new AbortController();abort.abort();const count=calls.length;await assert.rejects(cad.previewFreeCADImport(request('MainBody'),{signal:abort.signal}),e=>e.name==='AbortError');assert.equal(calls.length,count);assert.equal(cad.serialize(),before);assert.deepEqual(easyImportPolicy('FCStd','cad'),{asMesh:false,reconstruct:false});assert.throws(()=>easyImportPolicy('FCStd','mesh'),/CAD-Bereich/);
});


test('The CAD file picker recognizes FCStd explicitly while the generic mesh picker and ambiguous selections stay rejected',()=>{
 const native={name:'Original.FCStd'},step={name:'Other.step'};assert.equal(exchangeMainFile([native],{freecad:true}),native);assert.throws(()=>exchangeMainFile([native]),/Modelldatei/);assert.throws(()=>exchangeMainFile([native,step],{freecad:true}),/genau eine/);
});


test('An external FCStd import preserves the exact saved stats and BRep of an unrelated curved FreeCAD construction',async t=>{
 const {cad,calls}=await setup(t),script={version:1,code:"base=doc.addObject('Part::Box','Base');base.Length=30;base.Width=20;base.Height=6\nbore=doc.addObject('Part::Cylinder','Bore');bore.Radius=3;bore.Height=8;bore.Placement.Base=App.Vector(15,10,-1)\nresult=doc.addObject('Part::Cut','Finished');result.Base=base;result.Tool=bore;doc.recompute()"};await cad.execute({kind:'batch',commands:[{op:'tool',engine:'freecad',operation:{kind:'build',script}}]});const before=cad.serialize(),old=cad.snapshot().nodes[0],count=calls.length,p=await cad.previewFreeCADImport(request('MainBody'));assert.deepEqual(p.project.nodes[0],old);assert.equal(calls.length,count+1);cad.apply(p);cad.undo();assert.equal(cad.serialize(),before);await assert.rejects(cad.preview({kind:'freecadImportStep',bytes:new Uint8Array(),options:{}}),{code:'FREECAD_INTERNAL_OPERATION'});
});


test('An actual native FCStd import adds a verified body without loading unavailable unrelated fnpack geometry',async t=>{
 const made=createCadController({createWorker:factory});let encoded;try{await made.execute({kind:'create',recipe:{type:'box',size:[3,4,5]},options:{id:'deferred-original'}});encoded=encodeFnpackProject(made.snapshot());}finally{made.dispose();}const reads=[],resolver=createFnpackResolver({readBlock:async hash=>{reads.push(hash);throw Error('Unrelated package body unavailable');}}),{cad}=await setup(t,{initial:encoded.project,resolveGeometry:resolver.hydrate,getDisplayIds:()=>[]}),before=cad.serialize(),old=cad.snapshot().nodes[0],p=await cad.previewFreeCADImport(request('MainBody'));assert.deepEqual(reads,[]);assert.deepEqual(p.project.nodes[0],old);assert(hasGeometryRefs(p.project.nodes[0]));assert(!hasGeometryRefs(p.project.nodes[1]));assert(Math.abs(p.project.nodes[1].stats.volume-150)<1e-7);cad.apply(p);cad.undo();assert.equal(cad.serialize(),before);assert.deepEqual(reads,[]);
});
