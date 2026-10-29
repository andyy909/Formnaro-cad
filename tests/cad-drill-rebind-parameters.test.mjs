import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import runtime from '../backend/freecad-runtime.cjs';
import loader from '../cad-kernel-build/runtime/formnaro_cad.js';
import {createCadService} from '../src/cad-service.js';
import {createCadProject,parseCadProject,serializeCadProject} from '../src/cad-project.js';
import {createCadTransactions} from '../src/cad-transactions.js';
import {createCadToolsNative} from '../src/cad-tools-native.js';
import {createCadCommandRouter} from '../src/cad-command-router.js';
import {createCadProjectParameters,cadProjectParameterProblems,stampCadProjectParameters} from '../src/cad-project-parameters-data.js';
import {updateCadProjectParameters} from '../src/cad-project-parameters-native.js';
import {cadEditFormRecipe} from '../src/cad-form-controls.js';
import {encodeFnpackProject,createFnpackResolver,stripGeometryIdentity} from '../src/cad-fnpack-data.js';
import {cadBoolean,cadVolume} from '../src/cad-native-kernel.js';

const oc=await loader({print:()=>{},printErr:()=>{}});
const ray=(x,bottom=false)=>({ray:{origin:[x,0,bottom?-30:30],direction:[0,0,bottom?1:-1]}});
const choices=[{path:[],reference:ray(-12,true)}];
// Scaled cylindrical OCCT surfaces have a bounded integration error.
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-4,`${a} != ${b}`);
function independentStep(bytes,volume){
 const {available,root}=runtime.resolveRuntime();assert.equal(available,true,'Bundled independent STEP reader is required');
 const parent=path.resolve('work/drill-step-independent');fs.mkdirSync(parent,{recursive:true});const directory=fs.mkdtempSync(path.join(parent,'run-')),file=path.join(directory,'model.step');fs.writeFileSync(file,bytes);
 const report=execFileSync(path.join(root,'bin/python.exe'),[path.resolve('tests/fixtures/cad-drill-step-check.py'),root,file,String(volume)],{encoding:'utf8',windowsHide:true,timeout:30000,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
 fs.writeFileSync(path.join(directory,'reader.json'),report);assert.equal(JSON.parse(report).ok,true);
}
async function fixture(){
 const service=createCadService({oc}),base=service.nativeNode({type:'box',size:[40,20,8]},{id:'base'});
 const build=(p,c)=>service.rebuild(p,{baseline:c.baseline}),initial=createCadTransactions({initial:createCadProject({nodes:[base]}),build});
 const tools=createCadToolsNative({oc,service,transactions:initial});
 initial.apply(await tools.previewDrill({id:'base',resultId:'bore',associative:true,kind:'counterbore',diameter:4,headDiameter:6,headDepth:1,reference:ray(-12),revision:initial.revision()}));
 initial.apply(await tools.previewEditDrill({id:'bore',patch:{pattern:{version:1,kind:'line',count:2,step:[12,0],skip:[]}},revision:initial.revision()}));
 const definition={...createCadProjectParameters(),parameters:[{id:'height',name:'height',value:8},{id:'count',name:'count',value:2}],bindings:[{id:'b-height',parameterId:'height',target:{rootId:'bore',path:['base']},field:'size.2'},{id:'b-count',parameterId:'count',target:{rootId:'bore',path:[]},field:'drill.pattern.count'}],variants:[{id:'thick',name:'Dicke Platte',values:[{parameterId:'height',value:12},{parameterId:'count',value:3}],states:[]}]};
 const editRecipe=(node,patch)=>cadEditFormRecipe(node,patch,{oc}),updated=await updateCadProjectParameters(initial.snapshot(),definition,{service,editRecipe});
 const store=createCadTransactions({initial:updated.project,build});
 return {service,store,build,editRecipe,tools:createCadToolsNative({oc,service,transactions:store})};
}

test('reassigned parameter-bound bore pattern retains bindings and supports later source and variant updates',async()=>{
 const f=await fixture();try{
  const before=f.store.snapshot(),proposal=await f.tools.previewRebindDrills({id:'bore',bindings:choices,revision:f.store.revision()});
  assert.deepEqual(f.store.snapshot(),before);assert.deepEqual(proposal.project.projectParameters,before.projectParameters);
  assert.deepEqual(cadProjectParameterProblems(proposal.project),[]);near(proposal.project.nodes[0].stats.volume,6400-74*Math.PI);
  f.store.apply(proposal);assert.equal(f.store.state().undo,1);const rebound=f.store.snapshot();
  assert.equal(rebound.nodes[0].drill.feature,'box-face-bottom');
  const changed=await updateCadProjectParameters(rebound,rebound.projectParameters,{service:f.service,editRecipe:f.editRecipe,variantId:'thick'});
  near(changed.project.nodes[0].stats.volume,9600-159*Math.PI);assert.equal(changed.project.nodes[0].drill.pattern.count,3);
  assert.equal(changed.project.nodes[0].drill.feature,'box-face-bottom');assert.deepEqual(cadProjectParameterProblems(changed.project),[]);
  assert.deepEqual(changed.project.projectParameters.bindings,rebound.projectParameters.bindings);
  assert.deepEqual(await f.service.rebuild(parseCadProject(serializeCadProject(changed.project))),changed.project);
  const pack=encodeFnpackProject(changed.project),blocks=new Map(pack.blocks.map(b=>[b.sha256,b.bytes]));
  const loaded=await createFnpackResolver({readBlock:async h=>blocks.get(h)}).hydrate(pack.project);assert.deepEqual(stripGeometryIdentity(loaded),changed.project);
  f.store.undo();assert.deepEqual(f.store.snapshot(),before);f.store.redo();assert.deepEqual(f.store.snapshot(),rebound);
 }finally{f.service.dispose();}
});

test('stale parameter values and lost targets reject without preview, parameter restamping or undo',async()=>{
 const f=await fixture();try{
  for(const damage of [p=>p.projectParameters.parameters[0].value=12,p=>p.projectParameters.bindings[0].target.path=['missing']]){
   const input=f.store.snapshot();damage(input);
   const store=createCadTransactions({initial:input,build:f.build}),tools=createCadToolsNative({oc,service:f.service,transactions:store});
   assert.throws(()=>tools.previewRebindDrills({id:'bore',bindings:choices,revision:store.revision()}),{code:'CAD_DRILL_PARAMETERS_UNRESOLVED'});
   assert.deepEqual(store.snapshot(),input);assert.equal(store.state().previews,0);assert.equal(store.state().undo,0);
  }
 }finally{f.service.dispose();}
});

test('parameter-bound rebind reaches the native router and invalid bore placement leaves no candidate',async()=>{
 const f=await fixture();try{
  const input=f.store.snapshot(),router=createCadCommandRouter({oc,service:f.service});
  const proposal=await router.run(input,{kind:'tool',name:'previewRebindDrills',options:{id:'bore',bindings:choices}});
  assert.equal(proposal.project.nodes[0].drill.feature,'box-face-bottom');assert.deepEqual(proposal.project.projectParameters,input.projectParameters);
  await assert.rejects(()=>f.tools.previewRebindDrills({id:'bore',bindings:[{path:[],reference:ray(12,true)}],revision:f.store.revision()}));
  assert.deepEqual(f.store.snapshot(),input);assert.equal(f.store.state().previews,0);assert.equal(f.store.state().undo,0);
 }finally{f.service.dispose();}
});

test('unrelated locked parameter target and its variants remain byte-identical',async()=>{
 const f=await fixture();try{
  const input=f.store.snapshot(),spare=f.service.nativeNode({type:'box',size:[2,2,2]},{id:'spare'});spare.transform[12]=60;spare.locked=true;input.nodes.push(spare);
  input.projectParameters.parameters.push({id:'spare-width',name:'spareWidth',value:2});
  input.projectParameters.bindings.push({id:'b-spare',parameterId:'spare-width',target:{rootId:'spare',path:[]},field:'size.0'});
  // Initialize the newly introduced binding through the same public updater.
  spare.locked=false;const ready=await updateCadProjectParameters(input,input.projectParameters,{service:f.service,editRecipe:f.editRecipe});ready.project.nodes[1].locked=true;
  const store=createCadTransactions({initial:ready.project,build:f.build}),tools=createCadToolsNative({oc,service:f.service,transactions:store});
  const proposal=await tools.previewRebindDrills({id:'bore',bindings:choices,revision:store.revision()});
  assert.deepEqual(proposal.project.nodes[1],ready.project.nodes[1]);assert.deepEqual(proposal.project.projectParameters,ready.project.projectParameters);
  assert.deepEqual(cadProjectParameterProblems(proposal.project),[]);
 }finally{f.service.dispose();}
});

for(const source of ['cylinder','step'])test(`${source} retained source supports parameter-bound face reassignment without changing its recipe`,async()=>{
 const service=createCadService({oc});try{
  const native=service.nativeNode({type:source==='cylinder'?'cylinder':'box',size:source==='cylinder'?[40,40,8]:[40,20,8]},{id:'base'});
  const base=source==='step'?service.stepNode(service.exportStep(createCadProject({nodes:[native]})),{id:'base'}):native;
  const build=(p,c)=>service.rebuild(p,{baseline:c.baseline}),store=createCadTransactions({initial:createCadProject({nodes:[base]}),build});
  const tools=createCadToolsNative({oc,service,transactions:store});
  store.apply(await tools.previewDrill({id:'base',resultId:'bore',associative:true,diameter:4,reference:ray(0),revision:store.revision()}));
  const definition={...createCadProjectParameters(),parameters:[{id:'height',name:'height',value:8}],bindings:[{id:'binding',parameterId:'height',target:{rootId:'bore',path:['base']},field:'size.2'}]};
  const updated=await updateCadProjectParameters(store.snapshot(),definition,{service,editRecipe:(node,patch)=>cadEditFormRecipe(node,patch,{oc})});
  if(source==='step')updated.project.nodes[0].drill.faceKey='0'.repeat(64);
  const current=createCadTransactions({initial:updated.project,build}),editor=createCadToolsNative({oc,service,transactions:current});
  const proposal=await editor.previewRebindDrills({id:'bore',bindings:[{path:[],reference:ray(0,true)}],revision:current.revision()});
  assert.deepEqual(proposal.project.nodes[0].children[0],updated.project.nodes[0].children[0]);assert.deepEqual(proposal.project.projectParameters,updated.project.projectParameters);
  assert.deepEqual(proposal.project.nodes[0].drill.anchor.normal,[0,0,-1]);assert.deepEqual(cadProjectParameterProblems(proposal.project),[]);
  near(proposal.project.nodes[0].stats.volume,(source==='cylinder'?3200*Math.PI:6400)-32*Math.PI);
 }finally{service.dispose();}
});

test('changed FreeCAD input correspondence rejects before evicting an existing valid preview',async()=>{
 const f=await fixture();try{
  const project=f.store.snapshot(),base=project.nodes[0].children[0];
  const follower=f.service.stepNode(f.service.exportStep(createCadProject({nodes:[base]})),{id:'follower'});follower.transform[12]=60;
  // Synthetic retained program metadata tests correspondence only. No Python
  // interpreter or saved document is executed by this regression.
  follower.metadata={freecadSource:{version:1,engineVersion:'test',documentBase64:'UEs=',script:{version:1,parameters:{height:8},code:'# correspondence fixture only'}}};project.nodes.push(follower);
  const target={rootId:'follower',path:[]},data={...structuredClone(project.projectParameters),version:2};
  data.parameters.push({id:'f-height',name:'fHeight',value:8});data.bindings.push({id:'f-binding',parameterId:'f-height',target,field:'freecad.parameters.height'});
  data.freecad=[{target,inputs:[{name:'raw',target:{rootId:'bore',path:[]}}]}];
  project.projectParameters=stampCadProjectParameters(project,data,{freecadTargets:[target]});
  const store=createCadTransactions({initial:project,build:f.build,previewLimit:1}),editor=createCadToolsNative({oc,service:f.service,transactions:store});
  const before=store.snapshot(),old=await store.preview({project:before,revision:store.revision()});assert.deepEqual(cadProjectParameterProblems(before),[]);
  await assert.rejects(()=>editor.previewRebindDrills({id:'bore',bindings:choices,revision:store.revision()}),{code:'CAD_DRILL_PARAMETERS_UNRESOLVED'});
  assert.deepEqual(store.snapshot(),before);assert.equal(store.state().undo,0);assert.equal(store.state().previews,1);
  store.apply(old);assert.deepEqual(store.snapshot(),before);
 }finally{f.service.dispose();}
});

test('result correspondence validation remains cancellable without publishing or evicting a proposal',async()=>{
 const store=createCadTransactions({initial:createCadProject(),build:p=>p,previewLimit:1}),before=store.snapshot();
 const old=await store.preview({project:before,revision:store.revision()});
 let entered,release;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 const pending=store.preview({project:before,revision:store.revision(),validateResult:result=>{assert.ok(Object.isFrozen(result));entered();return gate;}});
 await started;assert.equal(store.cancel(),true);await assert.rejects(pending,{code:'ABORTED'});release();
 assert.deepEqual(store.snapshot(),before);assert.equal(store.state().previews,1);assert.equal(store.state().undo,0);store.apply(old);
});

test('thickness variant STEP retains the same physical solid as an independently constructed plate and bores',async()=>{
 const f=await fixture();let imported,expected,common,missing,excess;try{
  f.store.apply(await f.tools.previewRebindDrills({id:'bore',bindings:choices,revision:f.store.revision()}));
  const rebound=f.store.snapshot(),changed=await updateCadProjectParameters(rebound,rebound.projectParameters,{service:f.service,editRecipe:f.editRecipe,variantId:'thick'});
  const reference=f.service.nativeNode({type:'box',size:[40,20,12]},{id:'reference'});reference.transform[14]=2;
  const store=createCadTransactions({initial:createCadProject({nodes:[reference]}),build:f.build}),tools=createCadToolsNative({oc,service:f.service,transactions:store});
  store.apply(await tools.previewDrill({id:'reference',resultId:'exact',associative:true,kind:'counterbore',diameter:4,headDiameter:6,headDepth:1,reference:ray(-12,true),revision:store.revision()}));
  store.apply(await tools.previewEditDrill({id:'exact',patch:{pattern:{version:1,kind:'line',count:3,step:[12,0],skip:[]}},revision:store.revision()}));
  const bytes=f.service.exportStep(changed.project);independentStep(bytes,9600-159*Math.PI);
  imported=f.service.worldShape(f.service.stepNode(bytes,{id:'roundtrip'}));expected=f.service.worldShape(store.snapshot().nodes[0]);
  common=cadBoolean(oc,'intersection',imported,expected,{allowEmpty:true});assert.ok(common,'STEP and independently constructed solid must share their full material');
  near(cadVolume(oc,common),9600-159*Math.PI);
  missing=cadBoolean(oc,'difference',expected,imported,{allowEmpty:true});excess=cadBoolean(oc,'difference',imported,expected,{allowEmpty:true});
  near((missing?cadVolume(oc,missing):0)+(excess?cadVolume(oc,excess):0),0);
 }finally{excess?.delete();missing?.delete();common?.delete();expected?.delete();imported?.delete();f.service.dispose();}
});

test('mirrored sheared sharp stock retains its full matrix and exports its physical bore volume',async()=>{
 const f=await fixture();let sourceShape,roundtrip,common,missing,excess;try{
  const p=f.store.snapshot();delete p.projectParameters;
  const matrix=[-1,.1,.05,0,.2,1,.1,0,.3,.15,1.5,0,2,3,2,1];p.nodes[0].children[0].transform=[...matrix];
  const source=structuredClone(p.nodes[0].children[0]),built=await f.service.rebuild(p,{baseline:f.store.snapshot()});
  assert.deepEqual(built.nodes[0].children[0],source);
  // det(A)=-1.5255; |cross(Ax,Ay)|=sqrt(1.0541). The stock
  // thickness along the face normal is 8*|det(A)|/|cross(Ax,Ay)|.
  const thickness=8*1.5255/Math.sqrt(1.0541),volume=6400*1.5255-(8*thickness+10)*Math.PI;
  near(built.nodes[0].stats.volume,volume);
  sourceShape=f.service.worldShape(built.nodes[0]);roundtrip=f.service.worldShape(f.service.stepNode(f.service.exportStep(built),{id:'roundtrip'}));
  common=cadBoolean(oc,'intersection',sourceShape,roundtrip,{allowEmpty:true});assert.ok(common);near(cadVolume(oc,common),volume);
  missing=cadBoolean(oc,'difference',sourceShape,roundtrip,{allowEmpty:true});excess=cadBoolean(oc,'difference',roundtrip,sourceShape,{allowEmpty:true});
  near((missing?cadVolume(oc,missing):0)+(excess?cadVolume(oc,excess):0),0);
 }finally{excess?.delete();missing?.delete();common?.delete();roundtrip?.delete();sourceShape?.delete();f.service.dispose();}
});

test('cylinder thickness parameter STEP retains the full through bore and exact head depth',async()=>{
 const service=createCadService({oc});let imported,expected,common,missing,excess;try{
  const build=(p,c)=>service.rebuild(p,{baseline:c.baseline}),base=service.nativeNode({type:'cylinder',size:[40,40,8]},{id:'base'});
  const store=createCadTransactions({initial:createCadProject({nodes:[base]}),build}),tools=createCadToolsNative({oc,service,transactions:store});
  store.apply(await tools.previewDrill({id:'base',resultId:'bore',associative:true,kind:'counterbore',diameter:4,headDiameter:6,headDepth:1,reference:ray(0),revision:store.revision()}));
  const data={...createCadProjectParameters(),parameters:[{id:'height',name:'height',value:12}],bindings:[{id:'binding',parameterId:'height',target:{rootId:'bore',path:['base']},field:'size.2'}]};
  const changed=await updateCadProjectParameters(store.snapshot(),data,{service,editRecipe:(node,patch)=>cadEditFormRecipe(node,patch,{oc})});
  assert.deepEqual(changed.project.nodes[0].children[0].recipe,base.recipe);
  const reference=service.nativeNode({type:'cylinder',size:[40,40,12]},{id:'reference'});reference.transform[14]=2;
  const exact=createCadTransactions({initial:createCadProject({nodes:[reference]}),build}),cutter=createCadToolsNative({oc,service,transactions:exact});
  exact.apply(await cutter.previewDrill({id:'reference',resultId:'exact',associative:true,kind:'counterbore',diameter:4,headDiameter:6,headDepth:1,reference:ray(0),revision:exact.revision()}));
  const bytes=service.exportStep(changed.project);independentStep(bytes,(4800-53)*Math.PI);
  expected=service.worldShape(exact.snapshot().nodes[0]);imported=service.worldShape(service.stepNode(bytes,{id:'roundtrip'}));
  near(cadVolume(oc,imported),(4800-53)*Math.PI);common=cadBoolean(oc,'intersection',imported,expected,{allowEmpty:true});assert.ok(common);near(cadVolume(oc,common),(4800-53)*Math.PI);
  missing=cadBoolean(oc,'difference',expected,imported,{allowEmpty:true});excess=cadBoolean(oc,'difference',imported,expected,{allowEmpty:true});near((missing?cadVolume(oc,missing):0)+(excess?cadVolume(oc,excess):0),0);
 }finally{excess?.delete();missing?.delete();common?.delete();expected?.delete();imported?.delete();service.dispose();}
});

test('radially stretched circular source retains an exact ellipse and physical circular bore',async()=>{
 const service=createCadService({oc});let stock,bore,head,cut,expected,imported,common,missing,excess;try{
  const build=(p,c)=>service.rebuild(p,{baseline:c.baseline}),base=service.nativeNode({type:'cylinder',size:[40,40,8]},{id:'base'});
  const store=createCadTransactions({initial:createCadProject({nodes:[base]}),build}),tools=createCadToolsNative({oc,service,transactions:store});
  store.apply(await tools.previewDrill({id:'base',resultId:'bore',associative:true,kind:'counterbore',diameter:4,headDiameter:6,headDepth:1,reference:ray(0),revision:store.revision()}));
  const data={...createCadProjectParameters(),parameters:[{id:'width',name:'width',value:50},{id:'height',name:'height',value:12}],bindings:[{id:'b-width',parameterId:'width',target:{rootId:'bore',path:['base']},field:'size.0'},{id:'b-height',parameterId:'height',target:{rootId:'bore',path:['base']},field:'size.2'}]};
  const changed=await updateCadProjectParameters(store.snapshot(),data,{service,editRecipe:(node,patch)=>cadEditFormRecipe(node,patch,{oc})});
  const reference=service.nativeNode({type:'cylinder',size:[50,40,12]},{id:'reference'});reference.transform[12]=5;reference.transform[14]=2;
  // Width changes preserve the old lower corner, so the ellipse center moves
  // to x=5. The bore stays at its saved source-local center (also world x=5).
  const boreNode=service.nativeNode({type:'cylinder',size:[4,4,14]},{id:'tool'});boreNode.transform[12]=5;boreNode.transform[14]=2;
  const headNode=service.nativeNode({type:'cylinder',size:[6,6,1]},{id:'head'});headNode.transform[12]=5;headNode.transform[14]=7.5;
  stock=service.worldShape(reference);bore=service.worldShape(boreNode);head=service.worldShape(headNode);cut=cadBoolean(oc,'difference',stock,bore);expected=cadBoolean(oc,'difference',cut,head);
  const bytes=service.exportStep(changed.project);independentStep(bytes,(6000-53)*Math.PI);imported=service.worldShape(service.stepNode(bytes,{id:'roundtrip'}));
  common=cadBoolean(oc,'intersection',imported,expected,{allowEmpty:true});assert.ok(common);near(cadVolume(oc,common),(6000-53)*Math.PI);
  missing=cadBoolean(oc,'difference',expected,imported,{allowEmpty:true});excess=cadBoolean(oc,'difference',imported,expected,{allowEmpty:true});near((missing?cadVolume(oc,missing):0)+(excess?cadVolume(oc,excess):0),0);
  assert.deepEqual(changed.project.nodes[0].children[0].recipe,base.recipe);
 }finally{excess?.delete();missing?.delete();common?.delete();imported?.delete();expected?.delete();cut?.delete();head?.delete();bore?.delete();stock?.delete();service.dispose();}
});
