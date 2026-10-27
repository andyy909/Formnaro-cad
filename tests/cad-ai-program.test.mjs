import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import vm from 'node:vm';
import {createCadController} from '../src/cad-controller.js';
import {createCadProject,parseCadProject} from '../src/cad-project.js';
import {cadAIContext} from '../src/cad-ai-context.js';
import {validateProgramCommand,AI_PROGRAM_TOOLS} from '../src/cad-ai-program.js';
import {createCadAutomationAccess} from '../src/cad-automation-access.js';
import {queryProgramResources,runModelConversion} from '../src/cad-ai-local-tools.js';
const factory=file=>()=>{const w=new Worker(new URL(file,import.meta.url)),api={postMessage:v=>w.postMessage(v),terminate:()=>w.terminate()};w.on('message',data=>api.onmessage?.({data}));w.on('error',e=>api.onerror?.(e));return api;};
// Node harness for transaction tests only. Actual isolation/CSP is separately
// exercised in Chromium using the production sandbox implementation.
const runScript=async({code,call})=>{
 const context=vm.createContext({api:Object.freeze({model:()=>call('model'),query:q=>call('query',structuredClone(q)),run:c=>call('run',structuredClone(c))})});
 return await vm.runInContext('(async()=>{'+code+'})()',context,{timeout:1000});
};
const fixture=initial=>createCadController({initial,createWorker:factory('./fixtures/cad-node-worker.mjs'),createMeshWorker:factory('./fixtures/mesh-engine-node-worker.mjs'),runScript});
const batch=commands=>({kind:'batch',commands});
const tool=(engine,operation,as)=>({op:'tool',engine,operation,...(as?{as}:{})});
const mesh=operation=>tool('mesh',operation);
const create=(id='a')=>mesh({type:'mesh-create',id,shape:'box',size:[20,20,20],position:[0,0,10]});
const script=code=>({op:'script',code});

test('Published catalog exposes every existing geometry worker operation and isolated code',()=>{
 const context=cadAIContext();assert.ok(context.programTools.meshOperations.includes('mesh-hollow'));assert.ok(context.programTools.nativeOperations.includes('finish'));assert.ok(context.programTools.nativeTools.includes('previewDissolve'));
 for(const op of ['tool','script'])assert.ok(context.commandSchema.properties.commands.items.oneOf.some(s=>s.properties.op.const===op));
 for(const engine of ['cad','mesh'])assert.doesNotThrow(()=>validateProgramCommand(tool(engine,{[engine==='cad'?'kind':'type']:'new-future-worker-tool'})));
 for(const bad of [{op:'tool',engine:'desktop',operation:{kind:'readFile'}},{op:'script',code:'return 1',path:'C:/private'},{op:'script',code:''}])assert.throws(()=>validateProgramCommand(bad));
 assert.match(AI_PROGRAM_TOOLS.boundary,/unrelated files/);
});
test('Generic tools combine native construction, CAD-to-mesh and mesh finishing in one undoable proposal',async()=>{
 const cad=fixture();try{
  const before=cad.serialize(),p=await cad.preview(batch([tool('cad',{kind:'create',recipe:{type:'box',size:[30,20,10]},options:{name:'Platte'}},'plate'),tool('cad',{kind:'cadToMesh',target:'$plate',quality:{deflection:.05,angleDegrees:8}},'copy'),mesh({type:'mesh-role',id:'$copy',role:'hole'})]));
  assert.equal(p.project.nodes.length,2);assert.equal(p.project.nodes.find(n=>n.id===p.aliases.copy).meshRole,'hole');assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,0);cad.apply(p);assert.equal(cad.state().undo,1);cad.undo();assert.equal(cad.serialize(),before);
 }finally{cad.dispose();}
});
test('Local code measures current draft and builds a computed counterpart using all normal commands',async()=>{
 const cad=fixture();try{
  await cad.execute(batch([create()]));const before=cad.serialize(),p=await cad.preview(batch([script(`
   const model=await api.model();const source=model.nodes[0];
   const measurements=await api.query({engine:'mesh',kind:'inspectSolid',options:{id:source.id}});
   const width=Math.cbrt(measurements.volume)+4;
   await api.run({op:'create',type:'box',as:'native',size:[width,width,3],pos:[40,0,1.5]});
   await api.run({op:'transform',target:'$native',translate:[0,5,0]});
   return {width,volume:measurements.volume,files:typeof require};
  `)]));
  assert.equal(cad.serialize(),before);assert.equal(p.project.nodes.length,2);assert.ok(p.aliases.native);const r=p.report.meshOperations.find(r=>r.tool==='script');assert.ok(Math.abs(r.result.width-24)<1e-6);assert.equal(r.result.files,'undefined');cad.apply(p);const saved=cad.serialize();await cad.open(parseCadProject(saved));assert.equal(cad.serialize(),saved);
 }finally{cad.dispose();}
});
test('Code can use observed catalogs to hollow a source with exact original retention',async()=>{
 const cad=fixture();try{
  await cad.execute(batch([create()]));const before=cad.snapshot(),p=await cad.preview(batch([script(`
   const info=await api.query({engine:'mesh',kind:'toolsQuery',options:{id:'a',kind:'hollowCatalog'}});
   await api.run({op:'tool',engine:'mesh',as:'shell',operation:{type:'mesh-hollow',id:'a',options:{method:'signed-distance-shell-v1',geometryDigest:info.geometryDigest,wallThickness:3,resolution:2,drains:[]}}});
   return {originalRetained:true};
  `)]));
  assert.deepEqual(p.project.nodes[0],before.nodes[0]);assert.equal(p.project.nodes.length,2);assert.ok((await cad.inspectMeshSolid(p.project.nodes[1])).volume<8000);assert.deepEqual(cad.snapshot(),before);
 }finally{cad.dispose();}
});
test('New raw computed geometry is independently checked and cannot overwrite existing sources',async()=>{
 const cad=fixture();try{
  await cad.execute(batch([create()]));const original=cad.snapshot().nodes[0],before=cad.serialize();
  const p=await cad.preview(batch([script(`const n=(await api.model()).nodes[0];await api.run({op:'tool',engine:'mesh',as:'computed',operation:{type:'mesh-from-data',mesh:{verts:n.mesh.verts.map(v=>v*0.5),triangles:n.mesh.triangles},transform:n.transform,name:'Berechnet'}});`)]));
  assert.deepEqual(p.project.nodes[0],original);assert.ok(Math.abs((await cad.inspectMeshSolid(p.project.nodes[1])).volume-1000)<1e-6);
  await assert.rejects(cad.preview(batch([mesh({type:'mesh-from-data',id:'a',mesh:original.mesh})])),/eindeutige/);
  await assert.rejects(cad.preview(batch([mesh({type:'mesh-from-data',id:'bad',mesh:{verts:original.mesh.verts,triangles:original.mesh.triangles.slice(3)}})])),/offen|beschädigt/);assert.equal(cad.serialize(),before);
 }finally{cad.dispose();}
});
test('Failure after arbitrary local calculations discards all intermediate tools and keeps undo intact',async()=>{
 const cad=fixture();try{
  const before=cad.serialize();await assert.rejects(cad.preview(batch([script(`await api.run({op:'create',type:'box'});throw Error('Berechnung fehlgeschlagen');`)])),/Berechnung fehlgeschlagen/);assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,0);assert.equal(cad.state().previews,0);
  await assert.rejects(cad.preview(batch([script(`await api.query({engine:'desktop',kind:'readFile',options:{path:'private'}})`)])),/lokale Geometrie/);assert.equal(cad.serialize(),before);
 }finally{cad.dispose();}
});
test('Generic operations cannot bypass inherited locks or source protection',async()=>{
 const cad=fixture();try{
  await cad.execute(batch([create()]));const p=cad.snapshot();p.layers[0].locked=true;await cad.open(p);const before=cad.serialize();
  await assert.rejects(cad.preview(batch([mesh({type:'mesh-role',id:'a',role:'hole'})])),/gesperrt/);
  await assert.rejects(cad.preview(batch([tool('cad',{kind:'create',recipe:{type:'box',size:[2,2,2]},options:{}})])),/entsperrten/);assert.equal(cad.serialize(),before);
 }finally{cad.dispose();}
});
test('Mesh selections and planar hole catalogs are available to code from real geometry',async()=>{
 const cad=fixture();try{
  await cad.execute(batch([create()]));const p=cad.snapshot(),m=p.nodes[0].mesh;m.triangles=m.triangles.filter((v,i)=>{const start=Math.floor(i/3)*3;return !m.triangles.slice(start,start+3).every(id=>m.verts[id*3+2]===.5);});delete p.nodes[0].meshSource;await cad.open(p);
  const q=await cad.preview(batch([script(`
   const catalog=await api.query({engine:'mesh',kind:'holeCatalog',options:{id:'a'}});
   const ring=catalog.rings.find(r=>r.eligible);if(!ring)throw Error(JSON.stringify(catalog));
   await api.run({op:'tool',engine:'mesh',operation:{type:'mesh-close-hole',id:'a',options:{method:'planar-cap-v1',geometryDigest:catalog.geometryDigest,ringId:ring.id}}});
  `)]));assert.ok((await cad.inspectMeshSolid(q.project.nodes[0])).ok);
 }finally{cad.dispose();}
});
test('Automation preview accepts program commands with the same stale/apply/discard guarantees',async()=>{
 const cad=fixture();try{
  const access=createCadAutomationAccess({controller:cad});const p=await access.preview({revision:cad.revision(),commands:[script(`await api.run({op:'create',type:'box',name:'Eigene Berechnung'});return {ok:true};`)]});assert.equal(cad.snapshot().nodes.length,0);access.discard(p.previewId);assert.throws(()=>cad.apply(p));
 }finally{cad.dispose();}
});
test('Existing outline and fit helpers are available without access to arbitrary files',async()=>{
 const cad=fixture();try{
  const p=await cad.preview(batch([script(`
   const paths=await api.query({engine:'app',kind:'textContours',options:{text:'M4',font:'regular'}});
   await api.run({op:'tool',engine:'mesh',as:'letters',operation:{type:'mesh-create-source',shape:'text',text:'M4',font:'regular',paths,height:2}});
   const bounds=await api.query({engine:'app',kind:'bounds',options:{id:'$letters'}});
   await api.run({op:'tool',engine:'app',as:'fit',operation:{kind:'fit',target:'$letters',options:{gap:.2,axes:[0,1],kind:'opening'},copy:true}});
   return {width:bounds.size[0]};
  `)]));
  assert.equal(p.project.nodes.length,2);assert.equal(p.project.nodes[1].meshRole,'hole');assert.ok(p.report.meshOperations.find(r=>r.tool==='script').result.width>0);assert.ok(p.project.nodes[0].meshSource);
  await assert.rejects(queryProgramResources({kind:'readFile',options:{path:'C:/private'}}),/Unbekannte/);
 }finally{cad.dispose();}
});
test('Selected planar mesh tools use measured digests and actual selected face IDs inside code',async()=>{
 const cad=fixture();try{
  await cad.execute(batch([create()]));const before=cad.serialize(),p=await cad.preview(batch([script(`
   const info=await api.query({engine:'mesh',kind:'toolsQuery',options:{id:'a',kind:'remeshCatalog'}});
   await api.run({op:'tool',engine:'mesh',operation:{type:'mesh-remesh',id:'a',options:{method:'planar-isotropic-v1',mode:'subdivide',geometryDigest:info.geometryDigest,scope:'all',triangleIds:[],targetEdgeLength:10,iterations:1,maxDeviation:.1}}});
   const selection=await api.query({engine:'mesh',kind:'selection',options:{id:'a',options:{mode:'surface',triangleIndex:0,angleDegrees:1}}});
   const reduce=await api.query({engine:'mesh',kind:'toolsQuery',options:{id:'a',kind:'reduceCatalog'}});
   let reduction='changed';
   try{await api.run({op:'tool',engine:'mesh',operation:{type:'mesh-reduce',id:'a',options:{method:'planar-v1',geometryDigest:reduce.geometryDigest,scope:'selection',triangleIds:selection.triangleIds,targetMode:'percent',target:80,maxDeviation:.1}}});}
   catch(error){if(error.code!=='MESH_REDUCE_NO_CHANGE')throw error;reduction='preserved';}
   return {selected:selection.triangleIds.length,reduction};
  `)]));
  assert.equal(cad.serialize(),before);assert.ok(p.report.meshOperations.find(r=>r.tool==='script').result.selected>0);assert.ok((await cad.inspectMeshSolid(p.project.nodes[0])).ok);
 }finally{cad.dispose();}
});
test('Converter capability receives only a generated STL from the current model and cancels locally',async()=>{
 const cad=fixture();try{
  await cad.execute(batch([create()]));const project=cad.snapshot(),calls=[];
  const desktop={convertStl:async args=>{calls.push(args);return {bytes:new Uint8Array([1]),report:{valid:true,version:1,input_triangles:12,output_faces:6,solids:1,bodies:[],deviation:{sampled_max_mm:0},tessellation_allowance_mm:0,options:{tolerance:.15}}};},analyseStl:async args=>{calls.push(args);return {analysis:{regions:[{id:'observed'}]}};},cancelStl:async()=>{},onStlProgress:()=>()=>{}};
  const a=await runModelConversion({project,target:{rootId:'a',path:[]},action:'analyze',desktop});assert.equal(a.regions[0].id,'observed');assert.ok(calls[0].bytes instanceof Uint8Array);assert.equal(Object.hasOwn(calls[0],'path'),false);
  const r=await runModelConversion({project,target:{rootId:'a',path:[]},action:'convert',desktop});assert.equal(r.operation.kind,'meshToCad');assert.equal(r.operation.sourceDigest.length,64);assert.deepEqual(project,cad.snapshot());
  await assert.rejects(runModelConversion({project,target:{rootId:'missing',path:[]},action:'convert',desktop}),/Material/);assert.equal(calls.length,2);
 }finally{cad.dispose();}
});
test('Model node aliases, direct catalogs, target shorthand and proven closure have one documented meaning',async()=>{
 const cad=fixture();try{
  await cad.execute(batch([create()]));const before=cad.serialize();
  const p=await cad.preview(batch([script(`
   const model=await api.model();if(model.nodes!==model.objects)throw Error('Model aliases differ');
   const original=model.objects.find(o=>o.id==='a');
   const catalog=await api.query({engine:'mesh',kind:'hollowCatalog',options:{target:original.id}});
   const result=await api.run({op:'tool',engine:'mesh',as:'shell',operation:{type:'mesh-hollow',target:original.id,options:{geometryDigest:catalog.geometryDigest,wallThickness:3,resolution:2,drains:[]}}});
   const proof=await api.query({engine:'mesh',kind:'inspectSolid',options:{target:result.aliases.shell}});
   if(!proof.ok||!proof.closed)throw Error('No proven closed body');return {volume:proof.volume};
  `)]));assert.equal(p.project.nodes.length,2);assert.equal(p.project.nodes[1].meshSource.operation.options.method,'signed-distance-shell-v1');assert.equal(cad.serialize(),before);
  await assert.rejects(cad.preview(batch([mesh({type:'mesh-role',id:'a',target:'other',role:'hole'})])),/eindeutiges/);
 }finally{cad.dispose();}
});
