import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import loader from '../cad-kernel-build/runtime/formnaro_cad.js';
import {createCadService} from '../src/cad-service.js';
import {createCadProject,cadProjectSnapshot,cadProjectStoredVersion,parseCadProject,serializeCadProject} from '../src/cad-project.js';
import {createCadTransactions} from '../src/cad-transactions.js';
import {createCadToolsNative} from '../src/cad-tools-native.js';
import {createCadController} from '../src/cad-controller.js';
import {cadDrillSourceProblems} from '../src/cad-drill-source-data.js';
import {createCadCommandRouter} from '../src/cad-command-router.js';
import {cadEditFormRecipe} from '../src/cad-form-controls.js';
import {cadSelectionContext} from '../src/cad-interface-state.js';
import {cadDrillSourceBranch} from '../src/cad-drill-source-branch.js';
import {cadIdentity,cadPoint,multiplyCadMatrices} from '../src/cad-affine.js';
import {updateCadAssociative} from '../src/cad-linked-contours-native.js';
import {cadContourLinkProblems} from '../src/cad-linked-contours-data.js';
import {createCadDrawingNative} from '../src/cad-drawing-native.js';
import {createCadDrawingSheet,updateCadDrawingProjection,cadDrawingProblems,cadDrawingSourceSignatures} from '../src/cad-drawing-data.js';
import {encodeFnpackProject,createFnpackResolver,stripGeometryIdentity} from '../src/cad-fnpack-data.js';
const oc=await loader({print:()=>{},printErr:()=>{}});
async function fixture({step=false,cylinder=false}={}){
 const service=createCadService({oc}),native=service.nativeNode({type:cylinder?'cylinder':'box',size:cylinder?[40,40,8]:[40,20,8]},{id:'base'}),base=step?service.stepNode(service.exportStep(createCadProject({nodes:[native]})),{id:'base'}):native,spare=service.nativeNode({type:'box',size:[3,4,5]},{id:'spare'});spare.transform[12]=80;
 const store=createCadTransactions({initial:createCadProject({nodes:[base,spare]}),build:(p,c)=>service.rebuild(p,{baseline:c.baseline})}),tools=createCadToolsNative({oc,service,transactions:store});store.apply(await tools.previewDrill({id:'base',resultId:'bore',associative:true,diameter:4,reference:{ray:{origin:[-8,0,30],direction:[0,0,-1]}},revision:store.revision()}));return {service,project:store.snapshot()};
}
test('lost drill source identities and missing slots persist explicitly in format30 while direct exports and rebuilds stay blocked',async()=>{
 for(const options of [{},{cylinder:true},{step:true}]){const f=await fixture(options);try{for(const missing of [false,true]){const input=structuredClone(f.project),root=input.nodes.find(n=>n.id==='bore');if(missing)root.children=[];else root.drill.sourceId='lost-source';const lost=cadProjectSnapshot(input);assert.equal(lost.version,30);assert.deepEqual(parseCadProject(serializeCadProject(lost)),lost);assert.equal(cadDrillSourceProblems(lost)[0].code,'CAD_DRILL_SOURCE_REASSIGN_REQUIRED');await assert.rejects(f.service.rebuild(lost));assert.throws(()=>f.service.exportStep(lost),{code:'CAD_DRILL_SOURCE_REASSIGN_REQUIRED'});assert(f.service.exportStep(lost,{ids:['spare']}).length>500);f.service.resetConstructionState();const restored=await f.service.rebuild(lost,{restoreUnresolvedSources:true});assert.equal(restored.nodes.find(n=>n.id==='bore').brep.data,root.brep.data);assert.equal(f.service.constructionState().counts.bore??0,0);assert(cadDrillSourceProblems(restored).length);const pack=encodeFnpackProject(restored),blocks=new Map(pack.blocks.map(b=>[b.sha256,b.bytes])),hydrated=stripGeometryIdentity(await createFnpackResolver({readBlock:h=>blocks.get(h)}).hydrate(pack.project));assert.deepEqual(hydrated,restored);}}finally{f.service.dispose();}}
});
test('only the explicit recovery parser upgrades a legacy lost STEP signature and malformed recipes still reject',async()=>{
 const f=await fixture({step:true});try{const lost=structuredClone(f.project);lost.nodes.find(n=>n.id==='bore').drill.sourceSignature='0'.repeat(64);assert.throws(()=>parseCadProject(lost),/30/);const recovered=parseCadProject(lost,{repairSources:true});assert.equal(recovered.version,30);assert(cadDrillSourceProblems(recovered).length);const bad=structuredClone(lost);bad.nodes.find(n=>n.id==='bore').drill.diameter=-4;assert.throws(()=>parseCadProject(bad,{repairSources:true}));}finally{f.service.dispose();}
});
test('actual worker opens a lost drill with its last native display, blocks affected export and permits an unrelated export',async()=>{
 const f=await fixture(),factory=()=>{const w=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),a={postMessage:m=>w.postMessage(m),terminate:()=>w.terminate()};w.on('message',data=>a.onmessage?.({data}));w.on('error',e=>a.onerror?.(e));return a;},cad=createCadController({createWorker:factory});try{const lost=structuredClone(f.project);lost.nodes.find(n=>n.id==='bore').drill.sourceId='missing';const read=await cad.readProject(JSON.stringify(lost));assert.equal(read.project.version,30);assert(read.warnings.length);await cad.open(JSON.stringify(lost));const before=cad.serialize();assert((await cad.display()).meshes.some(m=>m.id==='bore'||m.rootId==='bore'));await assert.rejects(cad.exportModel({format:'step',ids:['bore']}),{code:'CAD_DRILL_SOURCE_REASSIGN_REQUIRED'});assert((await cad.exportModel({format:'step',ids:['spare']})).data.length>500);assert.equal(cad.serialize(),before);}finally{cad.dispose();f.service.dispose();}
});

const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-5,`${actual} != ${expected}`);
async function replacementFixture({kind='box',lost=false,two=false}={}){
 const f=await fixture();
 if(two){const store=createCadTransactions({initial:f.project,build:(p,c)=>f.service.rebuild(p,{baseline:c.baseline})}),tools=createCadToolsNative({oc,service:f.service,transactions:store});store.apply(await tools.previewDrill({id:'bore',resultId:'second',associative:true,diameter:4,reference:{ray:{origin:[8,0,30],direction:[0,0,-1]}},revision:store.revision()}));f.project=store.snapshot();}
 const native=f.service.nativeNode({type:kind==='cylinder'?'cylinder':'box',size:kind==='cylinder'?[60,60,10]:[60,30,10]},{id:'replacement'}),source=kind==='step'?f.service.stepNode(f.service.exportStep(createCadProject({nodes:[native]})),{id:'replacement'}):native;
 source.transform[12]=90;f.project.nodes.push(source);if(lost){const root=f.project.nodes.find(n=>n.id===(two?'second':'bore'));if(two)root.children[0].children=[];else root.children=[];}f.project=cadProjectSnapshot(f.project);
 f.router=createCadCommandRouter({oc,service:f.service,editRecipe:(node,patch)=>cadEditFormRecipe(node,patch,{oc})});
 f.operation={kind:'tool',name:'previewRebindDrills',options:{id:two?'second':'bore',sourceReplacement:{path:[],source:{rootId:'replacement',path:[]}},bindings:[{path:[],reference:{ray:{origin:[two?98:82,0,30],direction:[0,0,-1]}}},...(two?[{path:['bore'],reference:{ray:{origin:[82,0,30],direction:[0,0,-1]}}}]:[])]}};return f;
}
for(const kind of ['box','cylinder','step'])test(`explicit ${kind} replacement repairs a missing stock, preserves chosen source, and persists current native construction`,async()=>{
 const f=await replacementFixture({kind,lost:true});try{
  const before=structuredClone(f.project),result=await f.router.run(f.project,f.operation),root=result.project.nodes.find(n=>n.id==='bore');
  assert.deepEqual(f.project,before);assert.deepEqual(result.project.nodes.find(n=>n.id==='replacement'),before.nodes.find(n=>n.id==='replacement'));assert.deepEqual(result.project.nodes.find(n=>n.id==='spare'),before.nodes.find(n=>n.id==='spare'));
  assert.equal(root.children[0].id,'base');assert.equal(root.drill.version,kind==='box'?1:kind==='cylinder'?2:3);assert.equal(root.drill.sourceId,'base');assert.equal(root.drill.boxId,'base');assert.deepEqual(cadDrillSourceProblems(result.project),[]);near(root.stats.volume,kind==='cylinder'?8960*Math.PI:18000-40*Math.PI);
  near(cadSelectionContext(result.project,{rootId:'bore',path:['base']}).world[12],90);assert.deepEqual(await f.service.rebuild(parseCadProject(serializeCadProject(result.project))),result.project);
  const pack=encodeFnpackProject(result.project),blocks=new Map(pack.blocks.map(b=>[b.sha256,b.bytes])),loaded=await createFnpackResolver({readBlock:async h=>blocks.get(h)}).hydrate(pack.project);assert.deepEqual(stripGeometryIdentity(loaded),{...result.project,version:cadProjectStoredVersion(result.project)});assert(f.service.exportStep(result.project,{ids:['bore']}).length>1000);
 }finally{f.service.dispose();}
});
test('replacement preserves source-slot metadata and keeps unmatched authored face colors explicitly unresolved',async()=>{
 const f=await replacementFixture();try{
  const stock=f.project.nodes[0].children[0];stock.name='Retained construction slot';stock.color='#123456';stock.metadata={notes:'Authored slot note',tags:['fixture'],stepFaceColors:[{faceIndex:1,color:'#ff1122',opacity:.7}]};
  const source=f.project.nodes.find(n=>n.id==='replacement');source.metadata={notes:'Candidate remains independent',stepFaceColors:[{faceIndex:2,color:'#11ff22',opacity:1}]};const before=structuredClone(f.project);
  const result=await f.router.run(f.project,f.operation),after=result.project.nodes[0].children[0];assert.equal(after.id,stock.id);assert.equal(after.name,stock.name);assert.equal(after.color,stock.color);assert.equal(after.metadata.notes,stock.metadata.notes);assert.deepEqual(after.metadata.tags,stock.metadata.tags);assert.deepEqual(after.metadata.stepFaceColors,source.metadata.stepFaceColors);assert.equal(after.metadata.pendingFaceColors.length,1);assert.equal(after.metadata.pendingFaceColors[0].color,'#ff1122');assert.match(after.metadata.pendingFaceColors[0].sourceDigest,/^[a-f0-9]{64}$/);assert.equal(result.report.requiresFreeCADAcceptance,true);assert.deepEqual(f.project,before);assert.deepEqual(parseCadProject(serializeCadProject(result.project)),result.project);
 }finally{f.service.dispose();}
});
test('candidate validation, explicit free rays and cancellation preserve the prior model',async()=>{
 const f=await replacementFixture();try{
  for(const damage of [p=>p.nodes.find(n=>n.id==='replacement').locked=true,p=>p.nodes.find(n=>n.id==='replacement').hidden=true,p=>p.nodes.find(n=>n.id==='replacement').recipe.size[0]+=1]){const p=structuredClone(f.project);damage(p);const before=structuredClone(p);await assert.rejects(()=>f.router.run(p,f.operation));assert.deepEqual(p,before);}
  const token=structuredClone(f.operation);token.options.bindings[0].reference={faceIndex:1};await assert.rejects(()=>f.router.run(f.project,token),{code:'CAD_DRILL_REBIND_REQUIRED'});
  const stop=new AbortController();stop.abort();await assert.rejects(()=>f.router.run(f.project,f.operation,{signal:stop.signal}),{code:'ABORTED'});
 }finally{f.service.dispose();}
});
test('nested replacement keeps the chosen complete affine world frame and unrelated siblings',async()=>{
 const f=await replacementFixture();try{
  const bore=f.project.nodes[0],wrapper={...structuredClone(bore),id:'holder',source:'group',operation:'union',transform:[1,.2,0,0,0,1,0,0,0,0,1,0,20,12,0,1],children:[bore]};delete wrapper.drill;
  const source=f.project.nodes.find(n=>n.id==='replacement');source.transform=[1,.3,0,0,.2,1,0,0,0,0,1,0,90,10,0,1];f.project.nodes[0]=wrapper;f.project=await f.service.rebuild(f.project);const before=structuredClone(f.project),frame=cadSelectionContext(before,{rootId:'replacement',path:[]}).world,origin=cadPoint(frame,[-8,0,30]);
  const operation=structuredClone(f.operation);operation.options.id='holder';operation.options.sourceReplacement.path=['bore'];operation.options.bindings=[{path:['bore'],reference:{ray:{origin,direction:[0,0,-1]}}}];const result=await f.router.run(f.project,operation),after=cadSelectionContext(result.project,{rootId:'holder',path:['bore','base']}).world;after.forEach((v,i)=>near(v,frame[i]));assert.deepEqual(result.project.nodes.find(n=>n.id==='replacement'),before.nodes.find(n=>n.id==='replacement'));assert.deepEqual(result.project.nodes.find(n=>n.id==='spare'),before.nodes.find(n=>n.id==='spare'));assert.deepEqual(cadDrillSourceProblems(result.project),[]);
 }finally{f.service.dispose();}
});
test('replacement never drops an unexpected stored subtree or accepts a suppressed candidate ancestor',async()=>{
 const f=await replacementFixture();try{
  const nested=structuredClone(f.project),stock=nested.nodes[0].children[0],child=structuredClone(stock);child.id='unexpected-saved-child';delete child.metadata;stock.source='group';stock.children=[child,{...structuredClone(child),id:'second-positive-child'}];stock.operation='union';delete stock.recipe;const before=structuredClone(nested);await assert.rejects(()=>f.router.run(nested,f.operation),{code:'CAD_DRILL_SOURCE_REPLACEMENT_INVALID'});assert.deepEqual(nested,before);
  const p=structuredClone(f.project),candidate=p.nodes.find(n=>n.id==='replacement'),middle={...structuredClone(candidate),id:'inactive-container',source:'group',operation:'union',suppressed:true,children:[candidate],transform:cadIdentity()};delete middle.recipe;const top={...structuredClone(middle),id:'candidate-root',suppressed:false,children:[middle]};p.nodes=p.nodes.filter(n=>n.id!=='replacement');p.nodes.push(top);const op=structuredClone(f.operation);op.options.sourceReplacement.source={rootId:'candidate-root',path:['inactive-container','replacement']};await assert.rejects(()=>f.router.run(p,op),{code:'CAD_DRILL_SOURCE_REPLACEMENT_INVALID'});
 }finally{f.service.dispose();}
});
test('replacement retains a converted stock spine and its inactive authored cutters across stock types',async()=>{
 const f=await replacementFixture({kind:'cylinder'});try{
  const root=f.project.nodes[0],base=root.children[0],tool=f.service.nativeNode({type:'cylinder',size:[4,4,20]},{id:'retained-tool',solid:false});tool.suppressed=true;tool.metadata={notes:'Authored legacy cutter',tags:['retain']};const stock={...structuredClone(base),id:'retained-stock',name:'Original source tree',source:'group',operation:'union',children:[base,tool],metadata:{notes:'Stock wrapper'}};delete stock.recipe;root.children=[stock];root.drill.sourceId=stock.id;f.project=await f.service.rebuild(f.project);const before=structuredClone(f.project),result=await f.router.run(f.project,f.operation),after=result.project.nodes[0];
  assert.equal(after.drill.version,2);assert.equal(after.drill.sourceId,'retained-stock');assert.equal(after.drill.boxId,'base');assert.equal(after.children[0].children.length,2);assert.deepEqual(after.children[0].children.find(n=>n.id==='retained-tool'),before.nodes[0].children[0].children.find(n=>n.id==='retained-tool'));assert.deepEqual(after.children[0].metadata,before.nodes[0].children[0].metadata);assert.deepEqual(result.report.sourceReplacement.stockTarget,{rootId:'bore',path:['retained-stock','base']});near(after.stats.volume,8960*Math.PI);assert.deepEqual(await f.service.rebuild(parseCadProject(serializeCadProject(result.project))),result.project);
 }finally{f.service.dispose();}
});

test('replacement gathers every drill across an ordinary retained stock wrapper even when the inner drill is selected',async()=>{
 const f=await replacementFixture({kind:'cylinder',two:true});try{
  const root=f.project.nodes.find(node=>node.id==='second'),inner=root.children[0],retained=f.service.nativeNode({type:'cylinder',size:[4,4,20]},{id:'retained-original-tool',solid:false});retained.suppressed=true;retained.metadata={notes:'Keep this inactive original tool'};
  const wrapper={...structuredClone(inner),id:'intermediate-stock',source:'group',operation:'union',transform:[1,.15,0,0,.1,1,0,0,0,0,1,0,3,2,0,1],children:[inner,retained],metadata:{notes:'Retain wrapper and frame'}};delete wrapper.drill;root.children=[wrapper];root.drill.sourceId=wrapper.id;f.project=await f.service.rebuild(f.project);const before=structuredClone(f.project),branch=cadDrillSourceBranch(f.project,{rootId:'second',path:['intermediate-stock','bore']});
  assert.deepEqual(branch.rootTarget,{rootId:'second',path:[]});assert.deepEqual(branch.drills.map(entry=>entry.path),[[],['intermediate-stock','bore']]);assert.deepEqual(branch.stockTarget,{rootId:'second',path:['intermediate-stock','bore','base']});
  const operation=structuredClone(f.operation);operation.options.sourceReplacement.path=['intermediate-stock','bore'];operation.options.bindings[1].path=['intermediate-stock','bore'];const incomplete=structuredClone(operation);incomplete.options.bindings.shift();await assert.rejects(()=>f.router.run(f.project,incomplete),{code:'CAD_DRILL_SOURCE_REPLACEMENT_INVALID'});assert.deepEqual(f.project,before);
  const result=await f.router.run(f.project,operation),after=result.project.nodes.find(node=>node.id==='second'),kept=after.children[0];assert.equal(after.drill.version,2);assert.equal(kept.children[0].drill.version,2);assert.equal(after.drill.sourceId,'intermediate-stock');assert.equal(kept.children[0].drill.sourceId,'base');assert.deepEqual(kept.transform,wrapper.transform);assert.deepEqual(kept.metadata,wrapper.metadata);assert.deepEqual(kept.children.find(node=>node.id===retained.id),before.nodes.find(node=>node.id==='second').children[0].children.find(node=>node.id===retained.id));near(after.stats.volume,(9000-40*(1+(1-.15*.1)))*Math.PI);near(cadSelectionContext(result.project,branch.stockTarget).world[12],90);assert.deepEqual(cadDrillSourceProblems(result.project),[]);assert.deepEqual(await f.service.rebuild(parseCadProject(serializeCadProject(result.project))),result.project);assert.deepEqual(f.project,before);
 }finally{f.service.dispose();}
});
test('replacement refreshes retained source contour chains and shared drawing inputs in the same atomic result',async()=>{
 const f=await replacementFixture();try{
  const editRecipe=(node,patch)=>cadEditFormRecipe(node,patch,{oc}),update=(p,create)=>updateCadAssociative(p,{kind:'associativeUpdate',create},{oc,service:f.service,editRecipe});
  f.project=(await update(f.project,{id:'first-link',targetId:'first-contour',source:{rootId:'bore',path:['base']},selector:{kind:'native-role',role:'box.z.max'},height:2})).project;
  f.project=(await update(f.project,{id:'second-link',targetId:'second-contour',source:{rootId:'first-contour',path:[]},selector:{kind:'native-role',role:'sketch.cap.max'},height:1})).project;
  const sheet=createCadDrawingSheet({id:'replacement-sheet'});sheet.views=[{id:'top',kind:'top',sourceIds:['second-contour','spare'],position:[80,140]}];f.project.drawings={version:1,sheets:[updateCadDrawingProjection(sheet,'top',createCadDrawingNative({oc,service:f.service})(f.project,{ids:['second-contour','spare'],view:'top'}))]};const before=structuredClone(f.project),result=await f.router.run(f.project,f.operation);
  assert.deepEqual(f.project,before);const first=result.project.nodes.find(n=>n.id==='first-contour');near(first.stats.volume,3600);near(result.project.nodes.find(n=>n.id==='second-contour').stats.volume,1800);near(cadPoint(first.transform,first.stats.bounds.min.map((v,i)=>(v+first.stats.bounds.max[i])/2))[0],90);assert.deepEqual(cadContourLinkProblems(result.project),[]);assert.deepEqual(new Set(result.report.updatedLinkIds),new Set(['first-link','second-link']));assert.deepEqual(cadDrawingProblems(result.project.drawings.sheets[0],{sourceSignatures:cadDrawingSourceSignatures(result.project)}),[]);assert.deepEqual(result.project.nodes.find(n=>n.id==='spare'),before.nodes.find(n=>n.id==='spare'));
 }finally{f.service.dispose();}
});
test('all retained drill recipes require explicit replacement faces and apply as one undoable transaction',async()=>{
 const f=await replacementFixture({two:true,lost:true});try{
  const before=structuredClone(f.project),store=createCadTransactions({initial:before,build:async(p,c)=>(await f.router.run(p,c.operation,{baseline:c.baseline,signal:c.signal})).project});
  const incomplete=structuredClone(f.operation);incomplete.options.bindings.pop();await assert.rejects(()=>store.preview({project:before,revision:store.revision(),operation:incomplete}),{code:'CAD_DRILL_SOURCE_REPLACEMENT_INVALID'});assert.deepEqual(store.snapshot(),before);
  const preview=await store.preview({project:before,revision:store.revision(),operation:f.operation});assert.deepEqual(store.snapshot(),before);near(preview.project.nodes[0].stats.volume,18000-80*Math.PI);assert.equal(preview.project.nodes[0].drill.sourceId,'bore');assert.equal(preview.project.nodes[0].children[0].drill.boxId,'base');
  store.apply(preview);assert.equal(store.state().undo,1);store.undo();assert.deepEqual(store.snapshot(),before);store.redo();assert.deepEqual(store.snapshot(),preview.project);
 }finally{f.service.dispose();}
});
