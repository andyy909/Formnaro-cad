import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {Worker} from 'node:worker_threads';
import freecad from '../backend/freecad.cjs';import library from '../backend/ai-tool-library.cjs';
import {createCadController} from '../src/cad-controller.js';import {parseCadProject} from '../src/cad-project.js';import {cadAIContext} from '../src/cad-ai-context.js';import {aiToolEditorCode} from '../src/cad-ai-tool-editor.js';
const factory=()=>{const w=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),a={postMessage:v=>w.postMessage(v),terminate:()=>w.terminate()};w.on('message',v=>a.onmessage?.({data:v}));w.on('error',e=>a.onerror?.(e));return a;};
test('Full native API is discoverable in the shared provider contract and library editor routes it correctly',()=>{
 const context=cadAIContext();assert(context.programTools.freecadPython);assert.match(context.programTools.freecadPython.discovery,/ImportGui/);assert.match(context.programTools.freecadPython.helpers,/sewShape/);
 const tool={name:'Native helper',language:'python',code:'import FreeCADGui as Gui\nresult=Part.makeBox(4,5,6)',tags:['FreeCAD','GUI'],modules:{'helper.py':'value=42'}};
 const loaded=aiToolEditorCode(tool);assert.match(loaded,/engine/);assert.match(loaded,/freecad/);assert.match(loaded,/await model.flush/);assert(!loaded.startsWith('import FreeCADGui'));
 assert.equal(aiToolEditorCode({...tool,tags:[]}),tool.code);
});
test('Native Python travels through real workers, read-only analysis, archive, source persistence and single Undo',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-native-library-')),tools=library.createToolLibrary(dir),previous=globalThis.offlinecadDesktop;
 globalThis.offlinecadDesktop={aiToolLibrary:async a=>tools.request(a),runFreeCADReply:async args=>{try{return {ok:true,value:await freecad.run(args)};}catch(e){return {ok:false,error:e.message,code:e.code,feedback:e.feedback};}},cancelFreeCAD:async()=>true};
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const cad=createCadController({createWorker:factory,runScript:async args=>new AsyncFunction('api',args.code)({query:q=>args.call('query',q)})});
 try{
  const before=cad.serialize();cad.beginAITask();
  const measured=await cad.analyze([{id:'catalogue',engine:'freecad',kind:'inspect',options:{script:{version:1,name:'Native discovery',code:"from formnaro_freecad import api\nmeasurements=api('Part','makeShell')"}}}]);
  assert.equal(measured.results[0].value.measurements.members[0].name,'makeShell');assert.equal(cad.serialize(),before);
  const large=await cad.analyze([{id:'large',engine:'freecad',kind:'inspect',options:{script:{version:1,code:"measurements={'values':list(range(5000))}"}}}]);assert(large.results[0].value.workspaceResult.complete);
  const exact=await cad.analyze([{id:'read',engine:'javascript',kind:'run',options:{code:'const text=await api.query({engine:"workspace",kind:"files",options:{action:"read",path:'+JSON.stringify(large.results[0].value.workspaceResult.path)+'}});const v=JSON.parse(text).measurements.values;return {length:v.length,last:v.at(-1)};'}}]);assert.equal(exact.results[0].value.length,5000);assert.equal(exact.results[0].value.last,4999);
  const code="base=doc.addObject('Part::Cylinder','Base');base.Radius=parameters['r'];base.Height=8;doc.recompute()\nresult=base";
  const proposal=await cad.preview({kind:'batch',commands:[{op:'tool',engine:'freecad',as:'result',operation:{kind:'build',script:{version:1,name:'Native cylinder',code,parameters:{r:5},gui:true}}}]},{revision:cad.revision()});
  const proof=await cad.checkPreview(proposal.previewId,[{kind:'solids',target:'$result',expected:1},{kind:'volume',target:'$result',expected:200*Math.PI,tolerance:.001}]);assert(proof.checks.every(c=>c.passed));assert.equal(cad.serialize(),before);
  assert.equal((await cad.inspectFreeCADPreview(proposal.previewId)).passed,true);
  await cad.apply({previewId:proposal.previewId,revision:proposal.revision});const saved=cad.serialize(),node=parseCadProject(saved).nodes[0];assert.equal(node.metadata.freecadSource.script.code,code);assert.equal(node.metadata.freecadSource.script.parameters.r,5);assert.equal(cad.state().undo,1);
  const scene=await cad.describe();assert(!JSON.stringify(scene).includes(code));assert(JSON.stringify(scene).includes('codeAvailable'));
  const entries=tools.request({action:'search',search:'Native cylinder'});assert.equal(entries.total,1);const archived=tools.request({action:'read',revision:entries.tools[0].revision});assert.equal(archived.tool.code,code);assert(archived.tool.tags.includes('FreeCAD'));assert(archived.tool.tags.includes('GUI'));assert(aiToolEditorCode(archived.tool).includes('gui'));
  await cad.undo();assert.equal(cad.serialize(),before);await cad.redo();assert.equal(cad.serialize(),saved);
  await assert.rejects(cad.analyze([{id:'bad',engine:'freecad',kind:'inspect',options:{script:{version:1,name:'Failed native source',code:"raise ValueError('keep my full source')"}}}]),/keep my full source/);
  assert.equal(tools.request({action:'search',search:'Failed native source'}).total,1);assert.equal(cad.serialize(),saved);
 }finally{cad.dispose();globalThis.offlinecadDesktop=previous;fs.rmSync(dir,{recursive:true,force:true});}
});
