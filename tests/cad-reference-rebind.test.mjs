import test from 'node:test';
import assert from 'node:assert/strict';
import loader from '../cad-kernel-build/runtime/formnaro_cad.js';
import {createCadService} from '../src/cad-service.js';
import {createCadProject,cadProjectSnapshot,serializeCadProject,parseCadProject} from '../src/cad-project.js';
import {createCadCommandRouter} from '../src/cad-command-router.js';
import {createCadTransactions} from '../src/cad-transactions.js';
import {createCadAIReferencesNative} from '../src/cad-ai-feature-references-native.js';
import {captureCadAISourceReference,cadAIReferenceState} from '../src/cad-ai-feature-references.js';
import {createCadJoint,cadJointProblems,compileCadJointMotion,applyCadJointRequest} from '../src/cad-joints-data.js';
import {defaultCadSketch,cadSketchRecipe} from '../src/cad-sketch.js';
import {encodeFnpackProject,createFnpackResolver} from '../src/cad-fnpack-data.js';
import {fnpackRequestRoots} from '../src/cad-fnpack-controller.js';
import {hasGeometryRefs} from '../src/cad-geometry-ref.js';
import {nativeRecipeForInput} from '../src/cad-form-runtime.js';
import {Worker} from 'node:worker_threads';
import {createCadController} from '../src/cad-controller.js';
import {createCadAutomationAccess} from '../src/cad-automation-access.js';
import {updateCadProjectParameters} from '../src/cad-project-parameters-native.js';
import {cadEditFormRecipe} from '../src/cad-form-controls.js';
import {pickCadFeatureEdge} from '../src/cad-ai-feature-picking.js';
const oc=await loader({print:()=>{},printErr:()=>{}}),target=(rootId,path=[])=>({rootId,path}),top={origin:[0,0,30],direction:[0,0,-1]};
function fixture(){
 const service=createCadService({oc}),router=createCadCommandRouter({oc,service,makeRecipe:(type,input)=>nativeRecipeForInput(oc,type,input)}),references=createCadAIReferencesNative({oc,service});
 const p=createCadProject({nodes:[service.nativeNode({type:'box',size:[40,20,8]},{id:'base'}),service.nativeNode({type:'cylinder',size:[8,8,6]},{id:'child'}),service.nativeNode({type:'box',size:[2,3,4]},{id:'keep'})]});p.nodes[1].transform[12]=50;p.nodes[2].transform[12]=100;
 p.joints=createCadJoint(p,{id:'joint',name:'Achse',kind:'revolute',parentId:'base',childId:'child',origin:[50,0,0],axis:[0,0,1],limits:{min:-30,max:60}});
 p.featureReferences={version:1,items:[references(p,{action:'pick',kind:'face',ids:['base'],ray:top,id:'face',name:'Oberseite'}).reference,captureCadAISourceReference(p,target('child'),{id:'source',name:'Radquelle'}),captureCadAISourceReference(p,target('keep'),{id:'keep-ref'})]};
 p.nodes[0].transform[0]=1.25;return {service,router,references,project:cadProjectSnapshot(p)};
}

test('explicit feature and joint reassignment repairs one atomic proposal without moving or reconstructing any body',async()=>{
 const f=fixture();try{
  const before=structuredClone(f.project),store=createCadTransactions({initial:before,build:async(p,c)=>(await f.router.run(p,c.operation,{signal:c.signal})).project});assert(cadJointProblems(before).length);assert.equal(cadAIReferenceState(before,before.featureReferences.items[0]).status,'stale');
  const request={features:[{id:'face',target:target('base'),ray:top},{id:'source',target:target('base')}],joints:[{jointId:'joint',origin:[50,0,0],axis:[0,0,1]}]};
  const proposal=await store.preview({project:before,revision:store.revision(),operation:{kind:'referenceRebind',request}});assert.deepEqual(store.snapshot(),before);assert.equal(store.state().undo,0);assert.deepEqual(proposal.project.nodes,before.nodes);assert.deepEqual(cadJointProblems(proposal.project),[]);
  for(const reference of proposal.project.featureReferences.items)assert.equal(cadAIReferenceState(proposal.project,reference).status,'current');assert.deepEqual(proposal.project.featureReferences.items[2],before.featureReferences.items[2]);
  const joint=proposal.project.joints.joints[0];for(const key of ['id','name','kind','value','limits','parentId','childId'])assert.deepEqual(joint[key],before.joints.joints[0][key]);
  store.apply(proposal);assert.equal(store.state().undo,1);const after=store.snapshot();store.undo();assert.deepEqual(store.snapshot(),before);store.redo();assert.deepEqual(store.snapshot(),after);assert.deepEqual(parseCadProject(serializeCadProject(after)),after);assert.equal(compileCadJointMotion(after).preview([{jointId:'joint',value:10}]).placements.length,1);
 }finally{f.service.dispose();}
});

test('lost part identities can be explicitly replaced while saved reference and joint identities remain stable',async()=>{
 const f=fixture();try{
  const p=structuredClone(f.project);p.nodes=p.nodes.filter(n=>n.id!=='base');const before=structuredClone(p);
  const result=await f.router.run(p,{kind:'referenceRebind',request:{features:[{id:'face',target:target('keep'),ray:{...top,origin:[100,0,30]}}],joints:[{jointId:'joint',parentId:'keep',origin:[50,0,0],axis:[0,0,1]}]}});
  assert.deepEqual(p,before);assert.deepEqual(result.project.nodes,before.nodes);assert.equal(result.project.featureReferences.items[0].id,'face');assert.equal(result.project.featureReferences.items[0].name,'Oberseite');assert.equal(result.project.featureReferences.items[0].target.rootId,'keep');assert.deepEqual(result.project.joints.bases,['keep']);assert.equal(result.project.joints.joints[0].parentId,'keep');assert.deepEqual(cadJointProblems(result.project),[]);
 }finally{f.service.dispose();}
});

test('nonzero joint values, full mirrored/sheared body maps and limits survive a deliberately changed world axis',async()=>{
 const f=fixture();try{
  const p=structuredClone(f.project);p.nodes[0].transform[0]=1;applyCadJointRequest(p,{action:'move',values:[{jointId:'joint',value:17}]});p.nodes[0].transform[0]=-1.25;p.nodes[0].transform[4]=.2;
  const before=structuredClone(p),result=await f.router.run(p,{kind:'referenceRebind',request:{joints:[{jointId:'joint',origin:[10,5,0],axis:[0,1,0]}]}});
  assert.deepEqual(result.project.nodes,before.nodes);assert.equal(result.project.joints.joints[0].value,17);assert.deepEqual(result.project.joints.joints[0].limits,{min:-30,max:60});assert.deepEqual(cadJointProblems(result.project),[]);assert.equal(compileCadJointMotion(result.project).preview([{jointId:'joint',value:25}]).placements.length,1);
 }finally{f.service.dispose();}
});

test('a missing hit, duplicate request, forged proof or locked connection rejects all selected repairs without evicting an older proposal',async()=>{
 const f=fixture();try{
  for(const request of [{features:[{id:'face',target:target('base'),ray:{origin:[200,200,30],direction:[0,0,-1]}}],joints:[{jointId:'joint',origin:[50,0,0],axis:[0,0,1]}]},{features:[{id:'source',target:target('base'),selector:{}}]},{features:[{id:'source',target:target('base')},{id:'source',target:target('keep')}]},{features:[{id:'gone',target:target('base')}]},{joints:[{jointId:'joint',origin:[0,0,0],axis:[0,0,0]}]},{joints:[{jointId:'joint',parentId:'child',origin:[0,0,0],axis:[0,0,1]}]}]){
   const before=structuredClone(f.project),store=createCadTransactions({initial:before,previewLimit:1,build:async(p,c)=>c.operation?(await f.router.run(p,c.operation)).project:p}),old=await store.preview({project:before,revision:store.revision()});
   await assert.rejects(()=>store.preview({project:before,revision:store.revision(),operation:{kind:'referenceRebind',request}}));assert.deepEqual(store.snapshot(),before);assert.equal(store.state().previews,1);assert.equal(store.state().undo,0);store.apply(old);
  }
  const locked=structuredClone(f.project);locked.nodes.find(n=>n.id==='child').locked=true;const before=structuredClone(locked);await assert.rejects(()=>f.router.run(locked,{kind:'referenceRebind',request:{features:[{id:'face',target:target('base'),ray:top}],joints:[{jointId:'joint',origin:[50,0,0],axis:[0,0,1]}]}}),{code:'LOCKED_JOINT_TARGET'});assert.deepEqual(locked,before);
 }finally{f.service.dispose();}
});

test('exact current edges, inner bore walls and sketch sources can be consciously reassigned while retaining their kinds',async()=>{
 const f=fixture();try{
  let p=(await f.router.run(createCadProject(),{kind:'batch',commands:[{op:'create',type:'box',size:[40,30,10],as:'stock'},{op:'create',type:'cylinder',size:[4,4,20],solid:false,as:'tool'},{op:'group',targets:['$stock','$tool'],as:'body'}]})).project;const id=p.nodes[0].id,query=f.references,edge=query(p,{action:'edges',target:target(id)}).edges[0],bore=query(p,{action:'pick',kind:'bore',ids:[id],ray:{origin:[0,0,5],direction:[1,1,0]},id:'bore-ref'}).reference;
  const sketch=f.service.nativeNode(cadSketchRecipe(defaultCadSketch()),{id:'sketch'});p.nodes.push(sketch);p.featureReferences={version:1,items:[query(p,{action:'edge',target:target(id),signature:edge.selector.signature,id:'edge-ref'}).reference,bore,captureCadAISourceReference(p,target('sketch'),{kind:'sketch',id:'sketch-ref'})]};p=cadProjectSnapshot(p);p.nodes[0].transform[12]+=5;
  const currentEdge=query(p,{action:'edges',target:target(id)}).edges[0],before=structuredClone(p),result=await f.router.run(p,{kind:'referenceRebind',request:{features:[{id:'edge-ref',target:target(id),edgeSignature:currentEdge.selector.signature},{id:'bore-ref',target:target(id),ray:{origin:[5,0,5],direction:[1,1,0]}},{id:'sketch-ref',target:target('sketch')}]}});
  assert.deepEqual(result.project.nodes,before.nodes);assert.deepEqual(result.project.featureReferences.items.map(r=>r.kind),['edge','bore','sketch']);for(const r of result.project.featureReferences.items){assert.equal(cadAIReferenceState(result.project,r).status,'current');query(result.project,{action:'resolve',reference:r});}
  await assert.rejects(()=>f.router.run(p,{kind:'referenceRebind',request:{features:[{id:'edge-ref',target:target(id),edgeSignature:'a'.repeat(64)}]}}));
 }finally{f.service.dispose();}
});

test('gear definitions remain intact and reversing only one coupled axis requires explicit coupling repair',async()=>{
 const f=fixture();try{
  const p=structuredClone(f.project);p.nodes[0].transform[0]=1;const other=f.service.nativeNode({type:'cylinder',size:[8,8,6]},{id:'other'});other.transform[12]=80;p.nodes.push(other);p.joints=createCadJoint(p,{id:'joint2',name:'Achse 2',kind:'revolute',parentId:'base',childId:'other',origin:[80,0,0],axis:[0,0,1]});applyCadJointRequest(p,{action:'gear-create',gear:{id:'gear',jointA:'joint',jointB:'joint2',teethA:20,teethB:40,kind:'external'}});p.nodes[0].transform[0]=1.25;
  const bindings=[{jointId:'joint',origin:[50,0,0],axis:[0,0,1]},{jointId:'joint2',origin:[80,0,0],axis:[0,0,1]}],before=structuredClone(p),result=await f.router.run(p,{kind:'referenceRebind',request:{joints:bindings}});assert.deepEqual(result.project.joints.gears,before.joints.gears);assert.deepEqual(cadJointProblems(result.project),[]);assert.equal(compileCadJointMotion(result.project).preview([{jointId:'joint',value:10}]).placements.length,2);
  await assert.rejects(()=>f.router.run(p,{kind:'referenceRebind',request:{joints:[bindings[0],{...bindings[1],axis:[0,0,-1]}]}}),{code:'GEAR_AXIS'});assert.deepEqual(p,before);
 }finally{f.service.dispose();}
});

test('selective FNPACK scope loads only spatial targets; source and joint repairs keep all geometry deferred',async()=>{
 const f=fixture();try{
  const encoded=encodeFnpackProject(f.project),blocks=new Map(encoded.blocks.map(b=>[b.sha256,b.bytes])),reads=[],resolver=createFnpackResolver({readBlock:async h=>{reads.push(h);return blocks.get(h);}});
  for(const request of [{features:[{id:'source',target:target('base')}],joints:[{jointId:'joint',origin:[50,0,0],axis:[0,0,1]}]},{features:[{id:'face',target:target('base'),ray:top}]}]){
   const operation={kind:'referenceRebind',request},ids=fnpackRequestRoots(encoded.project,{job:'command',operation}),spatial=!!request.features[0].ray;assert.deepEqual(ids,spatial?['base']:[]);
   const input=await resolver.hydrate(encoded.project,ids),result=await f.router.run(input,operation);assert.equal(hasGeometryRefs(result.project.nodes.find(n=>n.id==='keep')),true);assert.equal(hasGeometryRefs(result.project.nodes.find(n=>n.id==='child')),true);assert.equal(hasGeometryRefs(result.project.nodes[0]),!spatial);
  }
  assert.equal(reads.length,1);
 }finally{f.service.dispose();}
});

test('a lost or ambiguous bore origin needs an explicit current source choice or explicit removal of edit authority',async()=>{
 const f=fixture();try{
  const built=await f.router.run(createCadProject(),{kind:'batch',commands:[{op:'create',type:'box',size:[40,30,10],as:'stock'},{op:'create',type:'cylinder',size:[4,4,20],solid:false,as:'a'},{op:'create',type:'cylinder',size:[4,4,20],solid:false,as:'b'},{op:'group',targets:['$stock','$a','$b'],as:'body'}]}),p=built.project,id=p.nodes[0].id,ray={origin:[0,0,5],direction:[1,1,0]},picked=f.references(p,{action:'pick',kind:'bore',ids:[id],ray,id:'bore'});assert.equal(picked.candidates.length,2);
  p.featureReferences={version:1,items:[{...picked.reference,origin:{target:target(id,['gone']),sourceDigest:picked.candidates[0].sourceDigest}}]};const before=cadProjectSnapshot(p),binding={id:'bore',target:target(id),ray};
  await assert.rejects(()=>f.router.run(before,{kind:'referenceRebind',request:{features:[binding]}}),{code:'REFERENCE_ORIGIN_REASSIGN_REQUIRED'});
  const chosen=await f.router.run(before,{kind:'referenceRebind',request:{features:[{...binding,originTarget:picked.candidates[1].target}]}});assert.deepEqual(chosen.project.featureReferences.items[0].origin.target,picked.candidates[1].target);f.references(chosen.project,{action:'resolve',reference:chosen.project.featureReferences.items[0]});
  const readonly=await f.router.run(before,{kind:'referenceRebind',request:{features:[{...binding,originTarget:null}]}});assert.equal(readonly.project.featureReferences.items[0].origin,undefined);assert.equal(cadAIReferenceState(readonly.project,readonly.project.featureReferences.items[0]).status,'current');assert.deepEqual(before,cadProjectSnapshot(p));
 }finally{f.service.dispose();}
});

test('actual worker and local KI repair the same revision-bound associations and reject old attached references after Apply',async()=>{
 const f=fixture(),factory=()=>{const w=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),a={postMessage:v=>w.postMessage(v),terminate:()=>w.terminate()};w.on('message',v=>a.onmessage?.({data:v}));w.on('error',e=>a.onerror?.(e));return a;},cad=createCadController({initial:f.project,createWorker:factory});
 try{
  const before=cad.serialize(),revision=cad.revision(),depth=cad.state().undo,old=f.project.featureReferences.items[1],request={features:[{id:'source',target:target('base')}],joints:[{jointId:'joint',origin:[50,0,0],axis:[0,0,1]}]},proposal=await cad.previewReferenceRebind(request);assert.equal(cad.serialize(),before);assert.deepEqual(proposal.project.nodes,f.project.nodes);assert.equal(proposal.report.metadataOnly,true);cad.apply(proposal);assert.equal(cad.state().undo,depth+1);assert.equal(cadAIReferenceState(cad.snapshot(),old,{stored:true}).code,'AI_REFERENCE_REASSIGNED');const after=cad.serialize();await assert.rejects(()=>cad.previewReferenceRebind(request,{revision}),{code:'STALE_REVISION'});cad.undo();assert.equal(cad.serialize(),before);cad.redo();assert.equal(cad.serialize(),after);cad.undo();
  let scene=await cad.describe();const access=createCadAutomationAccess({controller:cad,getScene:()=>scene,refresh:async()=>{scene=await cad.describe();}}),result=await access.preview({revision:cad.revision(),commands:[{op:'tool',engine:'cad',operation:{kind:'referenceRebind',request}}]});assert.equal(cad.serialize(),before);await access.apply(result);assert.equal(cadAIReferenceState(cad.snapshot(),old,{stored:true}).code,'AI_REFERENCE_REASSIGNED');cad.undo();assert.equal(cad.serialize(),before);
  const draft=cad.snapshot();draft.nodes[0].transform[12]+=1;await assert.rejects(()=>cad.preview({kind:'referenceRebind',request},{project:draft}),{code:'UNCONFIRMED_PROJECT'});assert.equal(cad.serialize(),before);
  const pending=cad.previewReferenceRebind(request);pending.catch(()=>{});cad.cancel();await assert.rejects(pending,e=>e.code==='ABORTED'||e.name==='AbortError');assert.equal(cad.serialize(),before);const retry=await cad.previewReferenceRebind(request);cad.discard(retry.previewId);assert.equal(cad.serialize(),before);
 }finally{cad.dispose();f.service.dispose();}
});

test('drill geometry, parameter values and explicitly renewed joint/KI references share one preview and one Undo',async()=>{
 const f=fixture();try{
  let p=createCadProject({nodes:f.project.nodes});p.nodes[0].transform[0]=1;p=(await f.router.run(p,{kind:'tool',name:'previewDrill',options:{id:'base',resultId:'drilled',associative:true,diameter:4,reference:{ray:top}}})).project;p.joints=createCadJoint(p,{id:'mount',name:'Montage',kind:'fixed',parentId:'drilled',childId:'child',origin:[50,0,0],axis:[0,0,1]});p.featureReferences={version:1,items:[f.references(p,{action:'pick',kind:'face',ids:['drilled'],ray:{...top,origin:[10,0,30]},id:'drillface'}).reference]};
  p=(await updateCadProjectParameters(p,{version:1,parameters:[{id:'width',name:'width',value:40}],bindings:[{id:'b-width',parameterId:'width',target:target('drilled'),field:'size.0'}],variants:[],activeVariantId:null},{service:f.service,editRecipe:(n,patch)=>cadEditFormRecipe(n,patch,{oc})})).project;
  const before=structuredClone(p),data=structuredClone(p.projectParameters);data.parameters[0].value=48;
  const options={id:'drilled',bindings:[{path:[],reference:{ray:{origin:[0,0,-30],direction:[0,0,1]}}}],parameterData:data,referenceBindings:{features:[{id:'drillface',target:target('drilled'),ray:{...top,origin:[10,0,30]}}],joints:[{jointId:'mount',origin:[50,0,0],axis:[0,0,1]}]}},store=createCadTransactions({initial:p,build:async(p,c)=>(await f.router.run(p,c.operation)).project});
  const proposal=await store.preview({project:before,revision:store.revision(),operation:{kind:'tool',name:'previewRebindDrills',options}});assert.deepEqual(store.snapshot(),before);assert.deepEqual(cadJointProblems(proposal.project),[]);assert.equal(cadAIReferenceState(proposal.project,proposal.project.featureReferences.items[0]).status,'current');assert.equal(proposal.project.projectParameters.parameters[0].value,48);assert.deepEqual(proposal.project.nodes.find(n=>n.id==='child'),before.nodes.find(n=>n.id==='child'));assert.equal(proposal.project.nodes[0].drill.feature,'box-face-bottom');
  const consumerOptions={...structuredClone(options),consumerBindings:{referenceBindings:structuredClone(options.referenceBindings)}};delete consumerOptions.referenceBindings;const collected=await store.preview({project:before,revision:store.revision(),operation:{kind:'tool',name:'previewRebindDrills',options:consumerOptions}});assert.deepEqual(collected.project,proposal.project);store.discard(collected.previewId);
  const bad=structuredClone(options);bad.referenceBindings.features[0].ray.origin=[200,200,30];await assert.rejects(()=>store.preview({project:before,revision:store.revision(),operation:{kind:'tool',name:'previewRebindDrills',options:bad}}));assert.deepEqual(store.snapshot(),before);assert.equal(store.state().previews,1);store.apply(proposal);assert.equal(store.state().undo,1);store.undo();assert.deepEqual(store.snapshot(),before);
 }finally{f.service.dispose();}
});

test('visually overlapping displayed edge domains remain ambiguous even at different depths',()=>{
 const view={projectPoint:([x,y,z])=>({x,y,z})},front={selector:{signature:'front'},display:{curves:[[[0,0,-.5],[20,0,-.5]]]}},back={selector:{signature:'back'},display:{curves:[[[0,0,.5],[20,0,.5]]]}};
 assert.throws(()=>pickCadFeatureEdge(view,{clientX:10,clientY:0},[front,back]),/Mehrere Kanten/);assert.equal(pickCadFeatureEdge(view,{clientX:10,clientY:0},[front]),front);assert.throws(()=>pickCadFeatureEdge(view,{clientX:10,clientY:30},[front]),/Kante anklicken/);
});
