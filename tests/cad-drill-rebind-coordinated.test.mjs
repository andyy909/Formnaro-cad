import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {Worker} from 'node:worker_threads';
import runtime from '../backend/freecad-runtime.cjs';
import {createCadController} from '../src/cad-controller.js';
import {createCadAutomationAccess} from '../src/cad-automation-access.js';
import {cadAIContext} from '../src/cad-ai-context.js';
import loader from '../cad-kernel-build/runtime/formnaro_cad.js';
import {createCadService} from '../src/cad-service.js';
import {createCadProject,parseCadProject,serializeCadProject} from '../src/cad-project.js';
import {createCadTransactions} from '../src/cad-transactions.js';
import {createCadToolsNative} from '../src/cad-tools-native.js';
import {createCadCommandRouter} from '../src/cad-command-router.js';
import {updateCadProjectParameters} from '../src/cad-project-parameters-native.js';
import {cadProjectParameterProblems} from '../src/cad-project-parameters-data.js';
import {cadLinkedPatternProblems} from '../src/cad-linked-pattern-data.js';
import {cadEditFormRecipe} from '../src/cad-form-controls.js';
import {encodeFnpackProject,createFnpackResolver,stripGeometryIdentity} from '../src/cad-fnpack-data.js';
import {fnpackRequestRoots} from '../src/cad-fnpack-controller.js';
import {createCadDrawingNative} from '../src/cad-drawing-native.js';
import {createCadDrawingSheet,updateCadDrawingProjection,cadDrawingProblems,cadDrawingSourceSignatures} from '../src/cad-drawing-data.js';

const oc=await loader({print:()=>{},printErr:()=>{}});

test('coordinated drill and thickness updates refresh a retained copy drawing after rebuilding the pattern',async()=>{const f=await fixture();try{const copy=f.project.linkedPatterns.patterns[0].instances[0].id,sheet=createCadDrawingSheet({id:'copy-sheet'});sheet.views=[{id:'copy-top',kind:'top',sourceIds:[copy,'spare'],position:[80,140]}];f.project.drawings={version:1,sheets:[updateCadDrawingProjection(sheet,'copy-top',createCadDrawingNative({oc,service:f.service})(f.project,{ids:[copy,'spare'],view:'top'}))]};const before=structuredClone(f.project),data=structuredClone(before.projectParameters);data.parameters[0].value=12;const result=await f.router.run(before,{kind:'tool',name:'previewRebindDrills',options:{id:'second',bindings:bindings(),parameterData:data}});assert.deepEqual(f.project,before);assert.equal(result.project.nodes.find(node=>node.id===copy).drill.feature,'box-face-bottom');assert.deepEqual(cadDrawingProblems(result.project.drawings.sheets[0],{sourceSignatures:cadDrawingSourceSignatures(result.project)}),[]);assert.deepEqual(result.drawingReport.updatedViewIds,['copy-top']);assert.deepEqual(result.project.nodes.find(n=>n.id==='spare'),before.nodes.find(n=>n.id==='spare'));}finally{f.service.dispose();}});
const ray=(x,bottom=false)=>({ray:{origin:[x,0,bottom?-30:30],direction:[0,0,bottom?1:-1]}});
const bindings=()=>[{path:['first'],reference:ray(-8,true)},{path:[],reference:ray(8,true)}];
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
async function fixture({pattern=true,source='box'}={}){
 const service=createCadService({oc}),native=service.nativeNode({type:source==='cylinder'?'cylinder':'box',size:source==='cylinder'?[40,40,8]:[40,20,8]},{id:'base'}),base=source==='step'?service.stepNode(service.exportStep(createCadProject({nodes:[native]})),{id:'base'}):native,spare=service.nativeNode({type:'box',size:[2,2,2]},{id:'spare'});spare.transform[12]=240;
 const store=createCadTransactions({initial:createCadProject({nodes:[base,spare]}),build:(p,c)=>service.rebuild(p,{baseline:c.baseline})}),tools=createCadToolsNative({oc,service,transactions:store});
 for(const [i,x]of [-8,8].entries())store.apply(await tools.previewDrill({id:i?'first':'base',resultId:i?'second':'first',associative:true,diameter:4,reference:ray(x),...(i?{}:{kind:'counterbore',headDiameter:6,headDepth:1}),revision:store.revision()}));
 const editRecipe=(node,patch)=>cadEditFormRecipe(node,patch,{oc}),router=createCadCommandRouter({oc,service,editRecipe});
 const data={version:1,parameters:[{id:'height',name:'height',value:8},{id:'copies',name:'copies',value:3}],bindings:[{id:'b-height',parameterId:'height',target:{rootId:'second',path:['first','base']},field:'size.2'}],variants:[{id:'thick',name:'Dicke Platte',values:[{parameterId:'height',value:12},{parameterId:'copies',value:4}],states:[]}],activeVariantId:null};
 if(source==='step'){data.parameters.push({id:'position',name:'position',value:0});data.bindings.push({id:'b-position',parameterId:'position',target:{rootId:'second',path:['first','base']},field:'pos.0'});}
 let project=(await updateCadProjectParameters(store.snapshot(),data,{service,editRecipe})).project;
 if(pattern)project=(await router.run(project,{kind:'linkedPattern',pattern:{version:1,id:'plates',sourceId:'second',kind:'line',count:3,step:[60,0,0],excluded:[],instances:[],bindings:[{field:'count',parameterId:'copies'}]}})).project;
 return {service,router,editRecipe,project};
}

test('pending dimensions, face choices and body pattern update in one preview and one undo',async()=>{
 const f=await fixture();try{
  const data=structuredClone(f.project.projectParameters);data.parameters[0].value=12;data.parameters[1].value=4;
  const store=createCadTransactions({initial:f.project,build:async(p,c)=>(await f.router.run(p,c.operation,{baseline:c.baseline})).project}),before=store.snapshot();
  const proposal=await store.preview({project:before,revision:store.revision(),operation:{kind:'tool',name:'previewRebindDrills',options:{id:'second',bindings:bindings(),parameterData:data}}});
  assert.deepEqual(store.snapshot(),before);assert.equal(store.state().undo,0);
  const after=proposal.project,pattern=after.linkedPatterns.patterns[0],source=after.nodes.find(n=>n.id==='second');
  assert.equal(pattern.count,4);assert.deepEqual(pattern.instances.slice(0,2),before.linkedPatterns.patterns[0].instances);
  for(const id of ['second',...pattern.instances.map(i=>i.id)]){const node=after.nodes.find(n=>n.id===id);near(node.stats.volume,9600-101*Math.PI);assert.equal(node.drill.feature,'box-face-bottom');assert.equal(node.children[0].drill.feature,'box-face-bottom');}
  assert.deepEqual(source.children[0].children[0].recipe,before.nodes[0].children[0].children[0].recipe);
  assert.deepEqual(after.projectParameters.bindings,before.projectParameters.bindings);assert.deepEqual(after.nodes.find(n=>n.id==='spare'),before.nodes.find(n=>n.id==='spare'));
  assert.deepEqual(cadProjectParameterProblems(after),[]);assert.deepEqual(cadLinkedPatternProblems(after,pattern),[]);
  store.apply(proposal);assert.equal(store.state().undo,1);store.undo();assert.deepEqual(store.snapshot(),before);store.redo();assert.deepEqual(store.snapshot(),after);
  assert.deepEqual(await f.service.rebuild(parseCadProject(serializeCadProject(after))),after);
  const pack=encodeFnpackProject(after),blocks=new Map(pack.blocks.map(b=>[b.sha256,b.bytes])),loaded=await createFnpackResolver({readBlock:async h=>blocks.get(h)}).hydrate(pack.project);assert.deepEqual(stripGeometryIdentity(loaded),after);
 }finally{f.service.dispose();}
});

test('cancellation during coordinated construction leaves older proposal and confirmed history intact',async()=>{
 const f=await fixture();try{
  const original=f.service.rebuildSubset;let entered,release;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
  f.service.rebuildSubset=async(...args)=>{entered();await gate;return original(...args);};
  const store=createCadTransactions({initial:f.project,build:async(p,c)=>c.operation?(await f.router.run(p,c.operation,{baseline:c.baseline,signal:c.signal})).project:p}),before=store.snapshot();
  const old=await store.preview({project:before,revision:store.revision()}),pending=store.preview({project:before,revision:store.revision(),operation:{kind:'tool',name:'previewRebindDrills',options:{id:'second',bindings:bindings(),variantId:'thick'}}});
  await started;assert.equal(store.cancel(),true);await assert.rejects(pending,{code:'ABORTED'});release();
  assert.deepEqual(store.snapshot(),before);assert.equal(store.state().undo,0);assert.equal(store.state().previews,1);store.apply(old);
 }finally{f.service.dispose();}
});

for(const source of ['cylinder','step'])test(`${source} supported pending source parameter and reassignment export a valid independently read STEP`,async()=>{
 const f=await fixture({pattern:false,source});try{
  const data=structuredClone(f.project.projectParameters);data.parameters.find(p=>p.id===(source==='step'?'position':'height')).value=source==='step'?5:12;
  const result=await f.router.run(f.project,{kind:'tool',name:'previewRebindDrills',options:{id:'second',bindings:bindings(),parameterData:data}});
  const expected=source==='cylinder'?(4800-101)*Math.PI:6400-69*Math.PI;near(result.project.nodes[0].stats.volume,expected);
  const {available,root}=runtime.resolveRuntime();assert.equal(available,true);
  const parent=path.resolve('work/drill-rebind-coordinated-2026-10-29/independent-'+source);fs.mkdirSync(parent,{recursive:true});const directory=fs.mkdtempSync(path.join(parent,'run-')),file=path.join(directory,'model.step');fs.writeFileSync(file,f.service.exportStep(result.project,{ids:['second']}));
  const report=execFileSync(path.join(root,'bin/python.exe'),[path.resolve('tests/fixtures/cad-drill-step-check.py'),root,file,String(expected)],{encoding:'utf8',windowsHide:true,timeout:30000,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});fs.writeFileSync(path.join(directory,'reader.json'),report);assert.equal(JSON.parse(report).ok,true);
 }finally{f.service.dispose();}
});

test('unproven STEP stock resize fails atomically under the existing full-footprint validator',async()=>{
 const f=await fixture({pattern:false,source:'step'});try{
  const before=structuredClone(f.project),data=structuredClone(before.projectParameters);data.parameters[0].value=12;
  const store=createCadTransactions({initial:before,build:async(p,c)=>(await f.router.run(p,c.operation,{baseline:c.baseline,signal:c.signal})).project});
  await assert.rejects(()=>store.preview({project:before,revision:store.revision(),operation:{kind:'tool',name:'previewRebindDrills',options:{id:'second',bindings:bindings(),parameterData:data}}}),{code:'CAD_DRILL_REFERENCE_CHANGED'});
  assert.deepEqual(store.snapshot(),before);assert.equal(store.state().undo,0);assert.equal(store.state().previews,0);
 }finally{f.service.dispose();}
});

test('selecting a variant updates source geometry and body count with the same retained identities',async()=>{
 const f=await fixture();try{
  const before=structuredClone(f.project),result=await f.router.run(f.project,{kind:'tool',name:'previewRebindDrills',options:{id:'second',bindings:bindings(),variantId:'thick'}});
  assert.deepEqual(f.project,before);assert.equal(result.project.projectParameters.activeVariantId,'thick');assert.equal(result.project.linkedPatterns.patterns[0].count,4);near(result.project.nodes[0].stats.volume,9600-101*Math.PI);
  assert.deepEqual(result.report.updatedPatternIds,['plates']);assert(result.report.affectedIds.includes('second'));assert.equal(result.report.reboundDrills.length,2);
 }finally{f.service.dispose();}
});

test('geometry-only reassignment rebuilds linked body copies without restamping parameter values',async()=>{
 const f=await fixture();try{
  const before=structuredClone(f.project),result=await f.router.run(f.project,{kind:'tool',name:'previewRebindDrills',options:{id:'second',bindings:bindings()}});
  assert.deepEqual(result.project.projectParameters,before.projectParameters);assert.equal(result.project.linkedPatterns.patterns[0].count,3);
  for(const node of result.project.nodes.filter(n=>n.id!=='spare')){near(node.stats.volume,6400-69*Math.PI);assert.equal(node.drill.feature,'box-face-bottom');}
 }finally{f.service.dispose();}
});

test('locked, edited or externally bound copies abort the entire coordinated change',async()=>{
 const f=await fixture();try{
  const instance=f.project.linkedPatterns.patterns[0].instances[0].id;
  for(const damage of [p=>p.nodes.find(n=>n.id===instance).locked=true,p=>p.nodes.find(n=>n.id===instance).transform[12]+=1,p=>p.projectParameters.bindings.push({id:'bound-copy',parameterId:'height',target:{rootId:instance,path:[]},field:'size.2'})]){
   const input=structuredClone(f.project);damage(input);const before=structuredClone(input),data=structuredClone(input.projectParameters);data.parameters[0].value=12;
   await assert.rejects(()=>f.router.run(input,{kind:'tool',name:'previewRebindDrills',options:{id:'second',bindings:bindings(),parameterData:data}}));assert.deepEqual(input,before);
  }
  await assert.rejects(()=>f.router.run(f.project,{kind:'tool',name:'previewRebindDrills',options:{id:instance,bindings:bindings(),variantId:'thick'}}),{code:'PATTERN_INSTANCE_CONFLICT'});
 }finally{f.service.dispose();}
});

test('binding layout changes, invalid dimensions and colliding reassignment preserve confirmed state',async()=>{
 const f=await fixture();try{
  for(const modify of [d=>d.bindings[0].target.path=['missing'],d=>d.parameters[0].name='renamed',d=>d.parameters[0].value=-1,d=>d.parameters[1].value=2.5]){
   const before=structuredClone(f.project),data=structuredClone(before.projectParameters);modify(data);await assert.rejects(()=>f.router.run(f.project,{kind:'tool',name:'previewRebindDrills',options:{id:'second',bindings:bindings(),parameterData:data}}));assert.deepEqual(f.project,before);
  }
  const before=structuredClone(f.project);await assert.rejects(()=>f.router.run(f.project,{kind:'tool',name:'previewRebindDrills',options:{id:'second',bindings:[{path:['first'],reference:ray(8,true)}],variantId:'thick'}}));assert.deepEqual(f.project,before);
 }finally{f.service.dispose();}
});

test('pending stored values need explicit inclusion and unrelated parameter bindings stay intact',async()=>{
 const f=await fixture();try{
  const p=structuredClone(f.project);p.projectParameters.parameters[0].value=12;p.projectParameters.parameters[1].value=4;
  await assert.rejects(()=>f.router.run(p,{kind:'tool',name:'previewRebindDrills',options:{id:'second',bindings:bindings()}}),{code:'CAD_DRILL_PARAMETERS_UNRESOLVED'});
  const result=await f.router.run(p,{kind:'tool',name:'previewRebindDrills',options:{id:'second',bindings:bindings(),parameterData:p.projectParameters}});
  near(result.project.nodes[0].stats.volume,9600-101*Math.PI);assert.equal(result.project.linkedPatterns.patterns[0].count,4);assert.deepEqual(cadProjectParameterProblems(result.project),[]);
 }finally{f.service.dispose();}
});

test('pending pattern-only values require explicit inclusion even when the source dimensions are current',async()=>{
 const f=await fixture();try{
  const p=structuredClone(f.project);p.projectParameters.parameters.find(v=>v.id==='copies').value=4;
  await assert.rejects(()=>f.router.run(p,{kind:'tool',name:'previewRebindDrills',options:{id:'second',bindings:bindings()}}),{code:'CAD_DRILL_PARAMETERS_UNRESOLVED'});
  const result=await f.router.run(p,{kind:'tool',name:'previewRebindDrills',options:{id:'second',bindings:bindings(),parameterData:p.projectParameters}});
  assert.equal(result.project.linkedPatterns.patterns[0].count,4);assert.equal(result.project.linkedPatterns.patterns[0].instances.length,3);
  for(const node of result.project.nodes.filter(n=>n.id!=='spare'))near(node.stats.volume,6400-69*Math.PI);
  assert.deepEqual(cadLinkedPatternProblems(result.project,result.project.linkedPatterns.patterns[0]),[]);
 }finally{f.service.dispose();}
});

for(const definition of [
 {kind:'grid',count:4,columns:2,step:[60,0,0],rowStep:[0,40,0],excluded:[2]},
 {kind:'mirror',count:2,mirrorAxis:'x',mirrorOffset:50,excluded:[]},
 {kind:'circle',count:4,center:[-60,0,0],radius:60,startAngle:0,angle:360,rotateCopies:true,excluded:[2]}
])test(`${definition.kind} body copies retain identities and exclusions during the supported coordinated rebuild`,async()=>{
 const f=await fixture({pattern:false});try{
  const before=(await f.router.run(f.project,{kind:'linkedPattern',pattern:{version:1,id:'plates',sourceId:'second',instances:[],...definition}})).project,old=before.linkedPatterns.patterns[0],options={id:'second',bindings:bindings()};
  if(definition.kind!=='circle'){options.parameterData=structuredClone(before.projectParameters);options.parameterData.parameters[0].value=12;}
  const result=await f.router.run(before,{kind:'tool',name:'previewRebindDrills',options}),pattern=result.project.linkedPatterns.patterns[0];
  assert.deepEqual(pattern.instances,old.instances);assert.deepEqual(pattern.excluded,old.excluded);assert.deepEqual(cadLinkedPatternProblems(result.project,pattern),[]);
  for(const id of [pattern.sourceId,...pattern.instances.filter(i=>!pattern.excluded.includes(i.index)).map(i=>i.id)]){const node=result.project.nodes.find(n=>n.id===id);near(node.stats.volume,definition.kind==='circle'?6400-69*Math.PI:9600-101*Math.PI);assert.equal(node.drill.feature,'box-face-bottom');}
  for(const i of pattern.excluded)assert(!result.project.nodes.some(n=>n.id===pattern.instances.find(v=>v.index===i).id));
  if(definition.kind==='circle'){
   const data=structuredClone(before.projectParameters);data.parameters[0].value=12;
   await assert.rejects(()=>f.router.run(before,{kind:'tool',name:'previewRebindDrills',options:{...options,parameterData:data}}),/externen Bezug/);
  }
 }finally{f.service.dispose();}
});

test('lazy FNPACK reads load the source and existing copies for the joint operation',async()=>{
 const f=await fixture();try{
  const encoded=encodeFnpackProject(f.project),blocks=new Map(encoded.blocks.map(b=>[b.sha256,b.bytes])),data=structuredClone(f.project.projectParameters);data.parameters[0].value=12;data.parameters[1].value=4;
  const operation={kind:'tool',name:'previewRebindDrills',options:{id:'second',bindings:bindings(),parameterData:data}},ids=fnpackRequestRoots(encoded.project,{job:'command',operation});
  assert(ids.includes('second'));for(const instance of f.project.linkedPatterns.patterns[0].instances)assert(ids.includes(instance.id));assert(!ids.includes('spare'));
  const loaded=await createFnpackResolver({readBlock:async h=>blocks.get(h)}).hydrate(encoded.project,ids);
  const result=await f.router.run(loaded,operation);assert.equal(result.project.linkedPatterns.patterns[0].count,4);near(result.project.nodes[0].stats.volume,9600-101*Math.PI);
 }finally{f.service.dispose();}
});

test('real worker and local KI stage and apply the coordinated variant as one revision-bound edit',async()=>{
 const f=await fixture();let cad;try{
  const factory=file=>()=>{const worker=new Worker(new URL(file,import.meta.url)),adapter={postMessage:v=>worker.postMessage(v),terminate:()=>worker.terminate()};worker.on('message',v=>adapter.onmessage?.({data:v}));worker.on('error',v=>adapter.onerror?.(v));return adapter;};
  cad=createCadController({initial:f.project,createWorker:factory('./fixtures/cad-node-worker.mjs'),createMeshWorker:factory('./fixtures/mesh-engine-node-worker.mjs')});
  let scene=await cad.describe();const access=createCadAutomationAccess({controller:cad,getScene:()=>scene,refresh:async()=>{scene=await cad.describe();}}),before=cad.serialize(),revision=cad.revision(),depth=cad.state().undo;
  const operation={kind:'tool',name:'previewRebindDrills',options:{id:'second',bindings:bindings(),variantId:'thick'}};
  const proposal=await access.preview({revision,commands:[{op:'tool',engine:'cad',operation}]});assert.equal(cad.serialize(),before);const staged=access.getPreview(proposal.previewId);assert.equal(staged.linkedPatterns.patterns[0].count,4);near(staged.nodes[0].stats.volume,9600-101*Math.PI);
  await access.apply(proposal);assert.equal(cad.state().undo,depth+1);const after=cad.serialize();cad.undo();assert.equal(cad.serialize(),before);cad.redo();assert.equal(cad.serialize(),after);
  await assert.rejects(()=>access.preview({revision,commands:[{op:'tool',engine:'cad',operation}]}),{code:'STALE_REVISION'});assert.equal(cad.serialize(),after);
  await assert.rejects(()=>cad.preview({...operation,options:{...operation.options,skipValidation:true}}));assert.equal(cad.serialize(),after);
  assert.match(cadAIContext().referenceContract.drill,/options\.parameterData/);assert.match(cadAIContext().referenceContract.drill,/Linked body patterns/);
 }finally{cad?.dispose();f.service.dispose();}
});
