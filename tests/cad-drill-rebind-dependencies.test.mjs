import test from 'node:test';
import assert from 'node:assert/strict';
import loader from '../cad-kernel-build/runtime/formnaro_cad.js';
import {createCadService} from '../src/cad-service.js';
import {createCadProject,parseCadProject,serializeCadProject} from '../src/cad-project.js';
import {createCadTransactions} from '../src/cad-transactions.js';
import {createCadCommandRouter} from '../src/cad-command-router.js';
import {cadEditFormRecipe} from '../src/cad-form-controls.js';
import {updateCadProjectParameters} from '../src/cad-project-parameters-native.js';
import {updateCadAssociative} from '../src/cad-linked-contours-native.js';
import {createCadDrawingSheet,cadDrawingProblems,cadDrawingSourceSignatures} from '../src/cad-drawing-data.js';
import {cadContourLinkProblems} from '../src/cad-linked-contours-data.js';
import {createCadJoint,cadJointProblems} from '../src/cad-joints-data.js';
import {captureCadAISourceReference,cadAIReferenceState} from '../src/cad-ai-feature-references.js';
import {encodeFnpackProject,createFnpackResolver,stripGeometryIdentity} from '../src/cad-fnpack-data.js';
import {fnpackRequestRoots} from '../src/cad-fnpack-controller.js';
import {hasGeometryRefs} from '../src/cad-geometry-ref.js';

const oc=await loader({print:()=>{},printErr:()=>{}}),target=(rootId,path=[])=>({rootId,path});
const options={id:'bore',bindings:[{path:[],reference:{ray:{origin:[0,0,-30],direction:[0,0,1]}}}]};
async function fixture({step=false}={}){
 const service=createCadService({oc}),editRecipe=(node,patch)=>cadEditFormRecipe(node,patch,{oc}),router=createCadCommandRouter({oc,service,editRecipe});
 const native=service.nativeNode({type:'box',size:[40,20,8]},{id:'base'}),base=step?service.stepNode(service.exportStep(createCadProject({nodes:[native]})),{id:'base'}):native;
 let project=createCadProject({nodes:[base,service.nativeNode({type:'box',size:[2,3,4]},{id:'keep'})]});project.nodes[1].transform[12]=100;
 project=(await router.run(project,{kind:'tool',name:'previewDrill',options:{id:'base',resultId:'bore',associative:true,kind:'counterbore',diameter:4,headDiameter:8,headDepth:1,reference:{ray:{origin:[0,0,30],direction:[0,0,-1]}}}})).project;
 project=(await updateCadProjectParameters(project,{version:1,parameters:[{id:'height',name:'height',value:8}],bindings:[{id:'height-binding',parameterId:'height',target:target('bore',['base']),field:'size.2'}],variants:[],activeVariantId:null},{service,editRecipe})).project;
 return {service,router,editRecipe,project};
}
async function linked(f){
 return (await updateCadAssociative(f.project,{kind:'associativeUpdate',create:{id:'profile-link',targetId:'profile',source:target('bore',['base']),selector:{kind:'native-role',role:'box.z.max'},height:2,name:'Linked outline'}},{oc,service:f.service,editRecipe:f.editRecipe})).project;
}
async function drawing(f,project){
 const sheet=createCadDrawingSheet({sourceIds:['bore','profile']}),keep=createCadDrawingSheet({sourceIds:['keep']});project=structuredClone(project);project.drawings={version:1,sheets:[sheet,keep]};
 return (await updateCadAssociative(project,{kind:'associativeUpdate',updateIds:[],drawingSheetIds:[sheet.id,keep.id]},{oc,service:f.service,editRecipe:f.editRecipe})).project;
}

test('reassigning drill faces updates retained-source contours and affected drawings atomically while preserving joints and saved references',async()=>{
 const f=await fixture();try{
  const p=await drawing(f,await linked(f));p.joints=createCadJoint(p,{id:'joint',name:'Mount',kind:'fixed',parentId:'bore',childId:'keep',origin:[0,0,0],axis:[0,0,1]});
  p.featureReferences={version:1,items:[captureCadAISourceReference(p,target('keep'),{id:'keep-ref'}),captureCadAISourceReference(p,target('bore'),{id:'bore-ref'})]};
  const data=structuredClone(p.projectParameters);data.parameters[0].value=12;
  const store=createCadTransactions({initial:p,build:async(d,c)=>(await f.router.run(d,c.operation,{baseline:c.baseline,signal:c.signal})).project}),before=store.snapshot();
  const proposal=await store.preview({project:before,revision:store.revision(),operation:{kind:'tool',name:'previewRebindDrills',options:{...options,parameterData:data}}});
  assert.deepEqual(store.snapshot(),before);assert.equal(store.state().undo,0);
  const after=proposal.project;assert(Math.abs(after.nodes.find(n=>n.id==='bore').stats.volume-(9600-60*Math.PI))<1e-5);
  assert.deepEqual(cadContourLinkProblems(after),[]);for(const sheet of after.drawings.sheets)assert.deepEqual(cadDrawingProblems(sheet,{sourceSignatures:cadDrawingSourceSignatures(after)}),[]);assert.deepEqual(cadJointProblems(after),[]);
  const profile=after.nodes.find(n=>n.id==='profile');assert(Math.abs(profile.stats.volume-1600)<1e-5);assert.equal(profile.transform[14],8);
  assert.deepEqual(after.joints,before.joints);assert.deepEqual(after.featureReferences,before.featureReferences);assert.deepEqual(after.nodes.find(n=>n.id==='keep'),before.nodes.find(n=>n.id==='keep'));
  assert.deepEqual(after.drawings.sheets[1],before.drawings.sheets[1]);assert.notDeepEqual(after.drawings.sheets[0].views[0].projection.sourceSignatures,before.drawings.sheets[0].views[0].projection.sourceSignatures);
  assert.equal(cadAIReferenceState(after,after.featureReferences.items[0]).status,'current');assert.equal(cadAIReferenceState(after,after.featureReferences.items[1]).status,'stale');
  store.apply(proposal);assert.equal(store.state().undo,1);store.undo();assert.deepEqual(store.snapshot(),before);store.redo();assert.deepEqual(store.snapshot(),after);assert.deepEqual(parseCadProject(serializeCadProject(after)),after);
 }finally{f.service.dispose();}
});

test('geometry-only reassignment refreshes only affected views, retains unrelated contours and reports newly stale saved references',async()=>{
 const f=await fixture();try{
  const p=await drawing(f,await linked(f));p.drawings.sheets[0].views.push(...structuredClone(p.drawings.sheets[1].views).map(v=>({...v,id:v.id+'-other'})));
  p.featureReferences={version:1,items:[captureCadAISourceReference(p,target('bore'),{id:'old-face'})]};
  const before=structuredClone(p),result=await f.router.run(p,{kind:'tool',name:'previewRebindDrills',options});
  assert.deepEqual(p,before);assert.deepEqual(result.project.contourLinks,before.contourLinks);assert.deepEqual(result.project.nodes.find(n=>n.id==='profile'),before.nodes.find(n=>n.id==='profile'));
  assert.deepEqual(result.project.projectParameters,before.projectParameters);assert.equal(result.report.drawingViews.length,3);assert.deepEqual(result.project.drawings.sheets[0].views.slice(3),before.drawings.sheets[0].views.slice(3));
  assert(result.warnings.some(w=>w.includes('ausdrücklich neu auswählen')));assert.deepEqual(result.report.unresolvedReferences.map(r=>r.referenceId),['old-face']);assert.deepEqual(result.project.featureReferences,before.featureReferences);
 }finally{f.service.dispose();}
});

test('an explicitly repicked retained-source contour joins drill reassignment and dependent drawing refresh in the same preview',async()=>{
 const f=await fixture();try{
  const p=await drawing(f,await linked(f)),before=structuredClone(p),result=await f.router.run(p,{kind:'tool',name:'previewRebindDrills',options:{...options,contourBindings:[{id:'profile-link',reference:{ray:{origin:[0,0,-30],direction:[0,0,1]}}}]}});
  assert.deepEqual(p,before);assert.deepEqual(result.report.reboundContourIds,['profile-link']);assert.deepEqual(result.report.updatedLinkIds,['profile-link']);assert.deepEqual(cadContourLinkProblems(result.project),[]);
  const link=result.project.contourLinks.links[0],profile=result.project.nodes.find(n=>n.id==='profile');assert.equal(link.selector.role,'box.z.min');assert.deepEqual(link.source,before.contourLinks.links[0].source);assert.equal(profile.transform[14],-4);assert(Math.abs(profile.stats.volume-1600)<1e-5);
  assert.equal(result.project.nodes[0].drill.feature,'box-face-bottom');assert.equal(result.report.drawingViews.length,3);for(const sheet of result.project.drawings.sheets)assert.deepEqual(cadDrawingProblems(sheet,{sourceSignatures:cadDrawingSourceSignatures(result.project)}),[]);
 }finally{f.service.dispose();}
});

test('locked or hidden necessary contour targets fail without modifying confirmed geometry or an older valid preview',async()=>{
 const f=await fixture();try{
  const p=await linked(f),data=structuredClone(p.projectParameters);data.parameters[0].value=12;
  for(const property of ['locked','hidden']){
   const blocked=structuredClone(p);blocked.nodes.find(n=>n.id==='profile')[property]=true;
   const store=createCadTransactions({initial:blocked,build:async(d,c)=>c.operation?(await f.router.run(d,c.operation,{signal:c.signal})).project:d}),before=store.snapshot();
   const old=await store.preview({project:before,revision:store.revision()});
   await assert.rejects(()=>store.preview({project:before,revision:store.revision(),operation:{kind:'tool',name:'previewRebindDrills',options:{...options,parameterData:data}}}),{code:'CAD_DRILL_DEPENDENCY_LOCKED'});
   assert.deepEqual(store.snapshot(),before);assert.equal(store.state().undo,0);assert.equal(store.state().previews,1);store.apply(old);
  }
 }finally{f.service.dispose();}
});

test('changing a root scale that would invalidate its mounted joint is rejected atomically',async()=>{
 const f=await fixture();try{
  let p=f.project;p.joints=createCadJoint(p,{id:'joint',name:'Mount',kind:'fixed',parentId:'bore',childId:'keep',origin:[0,0,0],axis:[0,0,1]});
  const data=structuredClone(p.projectParameters);data.parameters.push({id:'width',name:'width',value:40});data.bindings.push({id:'width-binding',parameterId:'width',target:target('bore'),field:'size.0'});
  p=(await updateCadProjectParameters(p,data,{service:f.service,editRecipe:f.editRecipe})).project;
  const before=structuredClone(p),changed=structuredClone(p.projectParameters);changed.parameters.find(p=>p.id==='width').value=48;
  await assert.rejects(()=>f.router.run(p,{kind:'tool',name:'previewRebindDrills',options:{...options,parameterData:changed}}),{code:'CAD_DRILL_JOINT_REASSIGN_REQUIRED'});assert.deepEqual(p,before);
 }finally{f.service.dispose();}
});

test('lazy FNPACK hydrates the complete consumer input closure and retains an unavailable unrelated part',async()=>{
 const f=await fixture();try{
  const p=await linked(f),sheet=createCadDrawingSheet({sourceIds:['bore','profile']});p.drawings={version:1,sheets:[sheet]};
  const encoded=encodeFnpackProject(p),blocks=new Map(encoded.blocks.map(b=>[b.sha256,b.bytes])),forbidden=encoded.project.nodes.find(n=>n.id==='keep').brep.sha256,reads=[];
  const data=structuredClone(p.projectParameters);data.parameters[0].value=12;const operation={kind:'tool',name:'previewRebindDrills',options:{...options,parameterData:data}},ids=fnpackRequestRoots(encoded.project,{job:'command',operation});
  assert.deepEqual(new Set(ids),new Set(['bore','profile']));
  const resolver=createFnpackResolver({readBlock:async hash=>{reads.push(hash);assert.notEqual(hash,forbidden);return blocks.get(hash);}}),loaded=await resolver.hydrate(encoded.project,ids),result=await f.router.run(loaded,operation);
  assert(hasGeometryRefs(result.project.nodes.find(n=>n.id==='keep')));assert(!reads.includes(forbidden));assert.deepEqual(cadContourLinkProblems(result.project),[]);
  const pack=encodeFnpackProject(result.project),allBlocks=new Map([...blocks,...pack.blocks.map(b=>[b.sha256,b.bytes])]),roundtrip=await createFnpackResolver({readBlock:async hash=>allBlocks.get(hash)}).hydrate(pack.project);
  assert.deepEqual(cadContourLinkProblems(stripGeometryIdentity(roundtrip)),[]);assert.equal(roundtrip.nodes.find(n=>n.id==='bore').drill.feature,'box-face-bottom');
 }finally{f.service.dispose();}
});

for(const consumers of [false,true])test(`a visibility-only variant can reveal an unrelated hidden part without rebuilding it (consumers=${consumers})`,async()=>{
 const f=await fixture();try{
  const p=consumers?await drawing(f,await linked(f)):f.project;p.nodes.find(n=>n.id==='keep').hidden=true;
  const data=structuredClone(p.projectParameters);data.variants.push({id:'reveal',name:'Einblenden',values:[],states:[{target:target('keep'),hidden:false}]});
  // Store the existing variant first; the rebind may select it, not create it.
  p.projectParameters=data;const before=structuredClone(p),result=await f.router.run(p,{kind:'tool',name:'previewRebindDrills',options:{...options,variantId:'reveal'}});
  assert.deepEqual(p,before);assert.deepEqual(result.project.nodes.find(n=>n.id==='keep'),{...before.nodes.find(n=>n.id==='keep'),hidden:false});assert.equal(result.project.projectParameters.activeVariantId,'reveal');assert(!result.report.constructedIds.includes('keep'));
 }finally{f.service.dispose();}
});

test('an explicitly selected variant may reveal a necessary contour together with the source thickness change',async()=>{
 const f=await fixture();try{
  const p=await linked(f);p.nodes.find(n=>n.id==='profile').hidden=true;p.projectParameters.variants.push({id:'reveal',name:'Kontur einblenden',values:[{parameterId:'height',value:12}],states:[{target:target('profile'),hidden:false}]});
  const before=structuredClone(p),result=await f.router.run(p,{kind:'tool',name:'previewRebindDrills',options:{...options,variantId:'reveal'}});
  assert.deepEqual(p,before);assert.equal(result.project.nodes.find(n=>n.id==='profile').hidden,false);assert.equal(result.project.nodes.find(n=>n.id==='profile').transform[14],8);assert.deepEqual(cadContourLinkProblems(result.project),[]);
 }finally{f.service.dispose();}
});

test('a stale unrelated contour sharing an affected drawing view cannot be silently rebuilt',async()=>{
 const f=await fixture();try{
  let p=(await updateCadAssociative(f.project,{kind:'associativeUpdate',create:{id:'other-link',targetId:'other-profile',source:target('keep'),selector:{kind:'native-role',role:'box.z.max'},height:2}},{oc,service:f.service,editRecipe:f.editRecipe})).project;
  const sheet=createCadDrawingSheet({sourceIds:['bore','other-profile']});p.drawings={version:1,sheets:[sheet]};p=(await updateCadAssociative(p,{kind:'associativeUpdate',updateIds:[],drawingSheetIds:[sheet.id]},{oc,service:f.service,editRecipe:f.editRecipe})).project;
  p.nodes.find(n=>n.id==='keep').transform[0]*=2;const before=structuredClone(p);assert(cadContourLinkProblems(p).some(p=>p.linkId==='other-link'));
  await assert.rejects(()=>f.router.run(p,{kind:'tool',name:'previewRebindDrills',options}),{code:'CAD_DRILL_DEPENDENCY_SCOPE_REQUIRED'});assert.deepEqual(p,before);
 }finally{f.service.dispose();}
});

test('an explicit original-stock ray repairs a lost STEP contour face key without replacing source or target identities',async()=>{
 const f=await fixture({step:true});try{
  const {createCadLinkedContoursNative}=await import('../src/cad-linked-contours-native.js'),native=createCadLinkedContoursNative({oc,service:f.service}),source=target('bore',['base']),candidate=native.candidate(f.project,{source,ray:{origin:[0,0,30],direction:[0,0,-1]}});
  let p=(await updateCadAssociative(f.project,{kind:'associativeUpdate',create:{id:'step-link',targetId:'step-profile',source,selector:candidate.selector,height:2}},{oc,service:f.service,editRecipe:f.editRecipe})).project;
  p.contourLinks.links[0].selector.faceKey='a'.repeat(64);const before=structuredClone(p);
  const result=await f.router.run(p,{kind:'tool',name:'previewRebindDrills',options:{...options,contourBindings:[{id:'step-link',reference:{ray:{origin:[0,0,-30],direction:[0,0,1]}}}]}});
  assert.deepEqual(p,before);assert.deepEqual(cadContourLinkProblems(result.project),[]);assert.notEqual(result.project.contourLinks.links[0].selector.faceKey,'a'.repeat(64));assert.deepEqual(result.project.contourLinks.links[0].source,source);assert.deepEqual(result.project.contourLinks.links[0].target,target('step-profile'));
  assert.deepEqual(result.project.nodes[0].children[0],before.nodes[0].children[0]);assert.equal(result.project.nodes.find(n=>n.id==='step-profile').transform[14],-4);
 }finally{f.service.dispose();}
});
