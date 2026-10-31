import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createCadService} from '../src/cad-service.js';
import {createCadProject,cadProjectSnapshot,parseCadProject,serializeCadProject} from '../src/cad-project.js';
import {createCadTransactions} from '../src/cad-transactions.js';
import {createCadToolsNative} from '../src/cad-tools-native.js';
import {createCadCommandRouter} from '../src/cad-command-router.js';
import {cadIdentity,cadPoint,inverseCadMatrix} from '../src/cad-affine.js';
import {resolveCadAnnotationNative} from '../src/cad-annotations-native.js';
import {cadBoolean,cadVolume} from '../src/cad-native-kernel.js';
import {encodeFnpackProject,createFnpackResolver,stripGeometryIdentity} from '../src/cad-fnpack-data.js';
import {captureCadAISourceReference,cadAIReferenceState} from '../src/cad-ai-feature-references.js';
import {cadProjectParameterProblems,stampCadProjectParameters} from '../src/cad-project-parameters-data.js';
import {createCadJoint,cadJointProblems} from '../src/cad-joints-data.js';
import {cadNativeFaceKeys} from '../src/cad-freecad-node-native.js';
import {partSurfaceDigest,partSurfaceState} from '../src/cad-part-properties.js';
import {updateCadAssociative} from '../src/cad-linked-contours-native.js';
import {cadContourLinkProblems} from '../src/cad-linked-contours-data.js';
import {cadEditFormRecipe} from '../src/cad-form-controls.js';
import {hasGeometryRefs} from '../src/cad-geometry-ref.js';
import {fnpackRequestRoots} from '../src/cad-fnpack-controller.js';
import {updateCadProjectParameters} from '../src/cad-project-parameters-native.js';
const loader=(await import('../cad-kernel-build/runtime/formnaro_cad.js')).default;
const oc=await loader({print:()=>{},printErr:()=>{}}),target=(rootId,path=[])=>({rootId,path});
const options={reference:{ray:{origin:[5,3,30],direction:[0,0,-1]}},kind:'counterbore',through:true,diameter:4,depth:10,headDiameter:8,headDepth:1,angle:90,gap:0};
function all(node,items=[]){items.push(node);for(const child of node.children??[])all(child,items);return items;}
function sameShape(service,a,b){let left,right,missing,added;try{left=service.worldShape(a);right=service.worldShape(b);missing=cadBoolean(oc,'difference',left,right,{allowEmpty:true});added=cadBoolean(oc,'difference',right,left,{allowEmpty:true});assert((missing?cadVolume(oc,missing):0)<1e-7);assert((added?cadVolume(oc,added):0)<1e-7);}finally{added?.delete();missing?.delete();right?.delete();left?.delete();}}
async function fixture({step=false,nested=true}={}){
 const service=createCadService({oc}),body=service.nativeNode({type:'box',size:[40,20,4]},{id:'body'}),source=step?service.stepNode(service.exportStep(createCadProject({nodes:[body]})),{id:'body'}):body;
 const tx=createCadTransactions({initial:createCadProject({nodes:[source]}),build:(p,c)=>service.rebuild(p,{baseline:c.baseline})}),tools=createCadToolsNative({oc,service,transactions:tx});
 tx.apply(await tools.previewDrill({...options,id:'body',resultId:'legacy',revision:tx.revision()}));let project=tx.snapshot();
 if(nested){const legacy=project.nodes[0],[base,...cutters]=legacy.children;legacy.children=[{...structuredClone(base),id:'positive-wrapper',source:'group',operation:'union',children:[base],recipe:undefined,transform:cadIdentity(),metadata:{notes:'Retained positive container',tags:['stock']}},{...structuredClone(cutters[0]),id:'tool-wrapper',source:'group',operation:'union',children:cutters,recipe:undefined,transform:cadIdentity(),metadata:{notes:'Retained nested cutters',tags:['tools']}}];for(const child of legacy.children)delete child.recipe;project=await service.rebuild(project);}
 return {service,project};
}
function storeFor(service,project){const store=createCadTransactions({initial:cadProjectSnapshot(project),build:(p,c)=>service.rebuild(p,{baseline:c.baseline})});return {store,tools:createCadToolsNative({oc,service,transactions:store})};}

test('nested original stock/cutter tree, authored metadata, colors and material survive preview/discard/one Undo and physical files',async()=>{
 const f=await fixture();try{
  const legacy=f.project.nodes[0],old=all(legacy),tool=old.find(node=>node.recipe?.type==='cylinder');tool.metadata={notes:'Do not discard this original tool',tags:['authored'],stepFaceColors:[{faceIndex:1,color:'#aa2244',opacity:.8}]};
  const faceKeys=cadNativeFaceKeys(oc,legacy.brep),bottom=resolveCadAnnotationNative(oc,legacy,{point:[-12,0,-2],normal:[0,0,-1]});assert.equal(bottom.status,'valid');
  legacy.metadata={notes:'Original result notes',tags:['result'],stepFaceColors:[{faceIndex:bottom.faceIndex,color:'#22aa44',opacity:.8}],partProperties:{version:1,surfaces:{kind:'cad',geometryDigest:partSurfaceDigest(legacy),groups:[{name:'bottom',color:'#22aa44',faceIds:[bottom.faceIndex]}]}}};
  legacy.annotations=[{id:'root-mark',version:1,point:[-12,0,-2],normal:[0,0,-1],note:'Keep this mark',color:'#ffbb00',radius:1,status:'valid',faceSignature:bottom.faceSignature}];
  const {store,tools}=storeFor(f.service,f.project),before=store.snapshot(),revision=store.revision(),proposal=await tools.previewConvertDrill({...options,id:'legacy',confirmed:true,revision});
  assert.deepEqual(store.snapshot(),before);sameShape(f.service,before.nodes[0],proposal.project.nodes[0]);assert.equal(store.state().undo,0);assert.equal(proposal.project.nodes[0].transform.join(','),legacy.transform.join(','));
  const retained=all(proposal.project.nodes[0]),byId=new Map(retained.map(node=>[node.id,node]));for(const node of old.slice(1)){assert(byId.has(node.id));assert.equal(byId.get(node.id).name,node.name);assert.deepEqual(byId.get(node.id).recipe,node.recipe);assert.deepEqual(byId.get(node.id).metadata,node.metadata);}
  assert.deepEqual(proposal.project.nodes[0].annotations,before.nodes[0].annotations);const mappedColor=proposal.project.nodes[0].metadata.stepFaceColors?.find(c=>c.color==='#22aa44');assert(mappedColor);assert.equal(cadNativeFaceKeys(oc,proposal.project.nodes[0].brep)[mappedColor.faceIndex-1],faceKeys[bottom.faceIndex-1]);assert.equal(partSurfaceState(proposal.project.nodes[0]).current,true);
  store.discard(proposal.previewId);assert.deepEqual(store.snapshot(),before);const applied=await tools.previewConvertDrill({...options,id:'legacy',confirmed:true,revision});store.apply(applied);const after=store.snapshot();assert.equal(store.state().undo,1);store.undo();assert.deepEqual(store.snapshot(),before);store.redo();assert.deepEqual(store.snapshot(),after);
  const directory=await fs.mkdtemp(path.resolve('work/complex-conversion-')),file=path.join(directory,'converted.ocad');await fs.writeFile(file,serializeCadProject(after));const reopened=parseCadProject(await fs.readFile(file,'utf8'));assert.deepEqual(reopened,after);sameShape(f.service,(await f.service.rebuild(reopened)).nodes[0],before.nodes[0]);
  const encoded=encodeFnpackProject(after),blocks=new Map();for(const block of encoded.blocks){const blockPath=path.join(directory,block.sha256);await fs.writeFile(blockPath,block.bytes);blocks.set(block.sha256,blockPath);}const hydrated=await createFnpackResolver({readBlock:async hash=>new Uint8Array(await fs.readFile(blocks.get(hash)))}).hydrate(encoded.project);assert.deepEqual(stripGeometryIdentity(hydrated),after);
  await fs.writeFile(path.join(directory,'converted.step'),f.service.exportStep(after));
 }finally{f.service.dispose();}
});

test('saved descendant source, parameters, contour and joint keep exact authored addresses; changed result reference stays explicitly stale',async()=>{
 const f=await fixture();try{
  const keep=f.service.nativeNode({type:'box',size:[2,3,4]},{id:'keep'});keep.transform[12]=100;f.project.nodes.push(keep);
  const bodyTarget=target('legacy',['positive-wrapper','body']);f.project.projectParameters={version:1,parameters:[{id:'height',name:'height',value:4}],bindings:[{id:'height-binding',parameterId:'height',target:bodyTarget,field:'size.2'}],variants:[],activeVariantId:null};f.project.projectParameters=stampCadProjectParameters(f.project,f.project.projectParameters);
  f.project=(await updateCadAssociative(f.project,{kind:'associativeUpdate',create:{id:'outline',targetId:'contour',source:bodyTarget,selector:{kind:'native-role',role:'box.z.min'},height:1}},{oc,service:f.service,editRecipe:(node,patch)=>cadEditFormRecipe(node,patch,{oc})})).project;
  f.project.featureReferences={version:1,items:[captureCadAISourceReference(f.project,bodyTarget,{id:'body-ref'}),captureCadAISourceReference(f.project,target('legacy'),{id:'result-ref'}),captureCadAISourceReference(f.project,target('keep'),{id:'keep-ref'})]};
  f.project.joints=createCadJoint(f.project,{id:'joint',kind:'fixed',parentId:'legacy',childId:'keep',origin:[0,0,0]});const before=structuredClone(f.project),{store,tools}=storeFor(f.service,f.project),proposal=await tools.previewConvertDrill({...options,id:'legacy',confirmed:true,revision:store.revision()}),after=proposal.project,stockId=proposal.report.stockId;
  const expected=target('legacy',[stockId,'positive-wrapper','body']);assert.deepEqual(after.projectParameters.bindings[0].target,expected);assert.deepEqual(cadProjectParameterProblems(after),[]);assert.deepEqual(after.contourLinks.links[0].source,expected);assert.deepEqual(cadContourLinkProblems(after),[]);
  assert.deepEqual(after.joints,before.joints);assert.deepEqual(cadJointProblems(after),[]);assert.deepEqual(after.nodes.find(n=>n.id==='keep'),before.nodes.find(n=>n.id==='keep'));assert.deepEqual(after.nodes.find(n=>n.id==='contour'),before.nodes.find(n=>n.id==='contour'));
  assert.deepEqual(after.featureReferences.items[0].target,expected);assert.equal(cadAIReferenceState(after,after.featureReferences.items[0]).status,'current');assert.equal(cadAIReferenceState(after,after.featureReferences.items[1]).status,'stale');assert.equal(cadAIReferenceState(after,after.featureReferences.items[2]).status,'current');assert(proposal.report.unresolvedReferences.some(r=>r.kind==='feature'&&r.id==='result-ref'));assert(proposal.warnings.length);
 }finally{f.service.dispose();}
});

test('valid marks on a nested removed cutter move by the exact frame to the retained final root',async()=>{
 const f=await fixture();try{
  const root=f.project.nodes[0],group=root.children[1],tool=group.children[0],point=[7,3,0],proof=resolveCadAnnotationNative(oc,root,{point,normal:[-1,0,0]});assert.equal(proof.status,'valid');
  tool.annotations=[{id:'tool-mark',version:1,point:cadPoint(inverseCadMatrix(tool.transform),point),normal:[1,0,0],note:'Inner wall',color:'#2244aa',radius:1,status:'valid',faceSignature:proof.faceSignature}];
  f.project=await f.service.rebuild(f.project);assert.equal(f.project.nodes[0].children[1].children[0].annotations[0].status,'valid');const {store,tools}=storeFor(f.service,f.project),proposal=await tools.previewConvertDrill({...options,id:'legacy',confirmed:true,revision:store.revision()}),mark=proposal.project.nodes[0].annotations.find(a=>a.id==='tool-mark');
  assert.deepEqual(mark.point,point);assert.equal(mark.status,'valid');assert.equal(mark.note,'Inner wall');assert.equal(proposal.report.migratedAnnotations[0].id,'tool-mark');assert(!all(proposal.project.nodes[0]).find(node=>node.id===tool.id).annotations);
  assert.deepEqual(await f.service.rebuild(proposal.project),proposal.project);
 }finally{f.service.dispose();}
});

test('STEP stock survives preserved wrappers and a retained original tool cannot be accidentally reactivated',async()=>{
 const f=await fixture({step:true,nested:false});try{
  const {store,tools}=storeFor(f.service,f.project),proposal=await tools.previewConvertDrill({...options,id:'legacy',confirmed:true,revision:store.revision()});assert.equal(proposal.project.nodes[0].drill.version,3);sameShape(f.service,proposal.project.nodes[0],f.project.nodes[0]);
  const invalid=structuredClone(proposal.project);invalid.nodes[0].children[0].children.find(node=>!node.solid).suppressed=false;await assert.rejects(f.service.rebuild(invalid));
 }finally{f.service.dispose();}
});

test('mirrored and sheared result placement is preserved together with nested authored source frames',async()=>{
 const f=await fixture();try{
  const frame=[-1.2,.1,0,0,.2,.8,0,0,.15,0,1.5,0,17,-8,10,1];f.project.nodes[0].transform=frame;f.project=await f.service.rebuild(f.project);
  const ray={origin:cadPoint(frame,[5,3,30]),direction:[-frame[8],-frame[9],-frame[10]]},before=structuredClone(f.project),{store,tools}=storeFor(f.service,f.project),proposal=await tools.previewConvertDrill({...options,reference:{ray},id:'legacy',confirmed:true,revision:store.revision()});
  assert.deepEqual(proposal.project.nodes[0].transform,frame);sameShape(f.service,before.nodes[0],proposal.project.nodes[0]);const prior=new Map(all(before.nodes[0]).map(n=>[n.id,n]));for(const node of all(proposal.project.nodes[0]).slice(2))assert.deepEqual(node.transform,prior.get(node.id).transform);
 }finally{f.service.dispose();}
});

test('multiple positive construction sources reject without replacing an older valid preview',async()=>{
 const f=await fixture();try{
  const second=f.service.nativeNode({type:'box',size:[2,2,2]},{id:'other-stock'});second.transform[12]=19;f.project.nodes[0].children.push(second);f.project=await f.service.rebuild(f.project);
  const {store,tools}=storeFor(f.service,f.project),before=store.snapshot(),old=await store.preview({project:before,revision:store.revision()});
  await assert.rejects(tools.previewConvertDrill({...options,id:'legacy',confirmed:true,revision:store.revision()}),{code:'INVALID_CAD_DRILL_CONVERSION'});assert.deepEqual(store.snapshot(),before);assert.equal(store.state().previews,1);store.apply(old);assert.equal(store.state().undo,0);
 }finally{f.service.dispose();}
});

test('one-positive intersection stock retains its authored operation while the drill uses the canonical wrapper',async()=>{
 const f=await fixture();try{
  f.project.nodes[0].operation='intersection';f.project=await f.service.rebuild(f.project);const {store,tools}=storeFor(f.service,f.project),proposal=await tools.previewConvertDrill({...options,id:'legacy',confirmed:true,revision:store.revision()});
  assert.equal(proposal.project.nodes[0].operation,'union');assert.equal(proposal.project.nodes[0].children[0].operation,'intersection');sameShape(f.service,f.project.nodes[0],proposal.project.nodes[0]);
 }finally{f.service.dispose();}
});

test('lazy FNPACK conversion reads only the selected nested source tree and preserves unavailable unrelated geometry',async()=>{
 const f=await fixture();try{
  const keep=f.service.nativeNode({type:'box',size:[3,4,5]},{id:'keep'});keep.transform[12]=100;f.project.nodes.push(keep);const encoded=encodeFnpackProject(f.project),blocks=new Map(encoded.blocks.map(block=>[block.sha256,block.bytes])),forbidden=encoded.project.nodes[1].brep.sha256,reads=[],operation={kind:'tool',name:'previewConvertDrill',options:{...options,id:'legacy',confirmed:true}},ids=fnpackRequestRoots(encoded.project,{job:'command',operation});assert.deepEqual(ids,['legacy']);
  const loaded=await createFnpackResolver({readBlock:async hash=>{reads.push(hash);assert.notEqual(hash,forbidden);return blocks.get(hash);}}).hydrate(encoded.project,ids),beforeKeep=structuredClone(loaded.nodes[1]),router=createCadCommandRouter({oc,service:f.service}),result=await router.run(loaded,operation);
  assert(reads.length);assert.equal(hasGeometryRefs(result.project.nodes[1]),true);assert.deepEqual(result.project.nodes[1],beforeKeep);assert(result.project.nodes[0].drill);sameShape(f.service,result.project.nodes[0],f.project.nodes[0]);
 }finally{f.service.dispose();}
});

test('explicit nested legacy target preserves its outer CSG, locked sibling, poses and exact descendant addresses',async()=>{
 const f=await fixture();try{
  const legacy=f.project.nodes[0],keep=f.service.nativeNode({type:'box',size:[3,4,5]},{id:'locked-sibling',locked:true});keep.transform[12]=60;
  const assembly={...structuredClone(legacy),id:'assembly',name:'Outer unchanged CSG',children:[legacy,keep],transform:cadIdentity(),metadata:{notes:'Outer notes'}};assembly.transform[12]=10;f.project=await f.service.rebuild(createCadProject({nodes:[assembly]}));
  const boundTarget=target('assembly',['legacy','positive-wrapper','body']);f.project.projectParameters={version:1,parameters:[{id:'thickness',name:'thickness',value:4}],bindings:[{id:'bound-stock',parameterId:'thickness',target:boundTarget,field:'size.2'}],variants:[],activeVariantId:null};f.project.projectParameters=stampCadProjectParameters(f.project,f.project.projectParameters);
  const before=cadProjectSnapshot(f.project),{store,tools}=storeFor(f.service,before),proposal=await tools.previewConvertDrill({...options,id:'assembly',path:['legacy'],reference:{ray:{origin:[15,3,30],direction:[0,0,-1]}},confirmed:true,revision:store.revision()}),after=proposal.project,converted=after.nodes[0].children[0];
  sameShape(f.service,before.nodes[0],after.nodes[0]);assert.equal(after.nodes[0].id,'assembly');assert.deepEqual(after.nodes[0].transform,before.nodes[0].transform);assert.deepEqual(after.nodes[0].metadata,before.nodes[0].metadata);assert.deepEqual(after.nodes[0].children[1],before.nodes[0].children[1]);assert.deepEqual(converted.transform,legacy.transform);assert(converted.drill);assert.deepEqual(proposal.report.convertedDrillTarget,target('assembly',['legacy']));
  assert.deepEqual(after.projectParameters.bindings[0].target,target('assembly',['legacy',converted.children[0].id,'positive-wrapper','body']));assert.deepEqual(cadProjectParameterProblems(after),[]);assert.deepEqual(store.snapshot(),before);store.apply(proposal);store.undo();assert.deepEqual(store.snapshot(),before);store.redo();assert.deepEqual(store.snapshot(),after);
  for(const path of [['missing'],['locked-sibling']])await assert.rejects(tools.previewConvertDrill({...options,id:'assembly',path,confirmed:true,revision:store.revision()}));
 }finally{f.service.dispose();}
});

test('explicit retained cutter binding mapping controls the new drill through future parameter and variant rebuilds',async()=>{
 const f=await fixture({nested:false});try{
  const tool=f.project.nodes[0].children[1],oldTarget=target('legacy',[tool.id]);f.project.projectParameters={version:1,parameters:[{id:'bore-size',name:'boreSize',value:4}],bindings:[{id:'old-tool-width',parameterId:'bore-size',target:oldTarget,field:'size.0'}],variants:[{id:'large',name:'Large bore',values:[{parameterId:'bore-size',value:6}],states:[]}],activeVariantId:null};f.project.projectParameters=stampCadProjectParameters(f.project,f.project.projectParameters);
  const {store,tools}=storeFor(f.service,f.project),before=store.snapshot(),proposal=await tools.previewConvertDrill({...options,id:'legacy',bindingRemap:[{bindingId:'old-tool-width',field:'drill.diameter'}],confirmed:true,revision:store.revision()}),after=proposal.project;
  assert.deepEqual(after.projectParameters.bindings,[{id:'old-tool-width',parameterId:'bore-size',target:target('legacy'),field:'drill.diameter'}]);assert.deepEqual(after.projectParameters.parameters,before.projectParameters.parameters);assert.deepEqual(after.projectParameters.variants,before.projectParameters.variants);assert.deepEqual(cadProjectParameterProblems(after),[]);assert.equal(proposal.report.remappedBindings.length,1);assert(!proposal.report.unresolvedReferences.some(item=>item.kind==='retainedToolBinding'&&item.id==='old-tool-width'));sameShape(f.service,before.nodes[0],after.nodes[0]);
  const editRecipe=(node,patch)=>cadEditFormRecipe(node,patch,{oc}),changed=await updateCadProjectParameters(after,after.projectParameters,{service:f.service,editRecipe,variantId:'large'});assert.equal(changed.project.nodes[0].drill.diameter,6);assert(Math.abs(changed.project.nodes[0].stats.volume-(3200-43*Math.PI))<1e-6);assert.deepEqual(cadProjectParameterProblems(changed.project),[]);
  const restored=await updateCadProjectParameters(changed.project,changed.project.projectParameters,{service:f.service,editRecipe,variantId:null});assert.equal(restored.project.nodes[0].drill.diameter,4);sameShape(f.service,before.nodes[0],restored.project.nodes[0]);
  for(const bindingRemap of [[{bindingId:'missing',field:'drill.diameter'}],[{bindingId:'old-tool-width',field:'drill.pattern.count'}],[{bindingId:'old-tool-width',field:'drill.headDiameter'}],[{bindingId:'old-tool-width',field:'drill.diameter'},{bindingId:'old-tool-width',field:'drill.depth'}]]){await assert.rejects(tools.previewConvertDrill({...options,id:'legacy',bindingRemap,confirmed:true,revision:store.revision()}),{code:'INVALID_CAD_DRILL_CONVERSION'});assert.deepEqual(store.snapshot(),before);}
  const invalid=structuredClone(after.projectParameters);invalid.parameters[0].value=10;await assert.rejects(updateCadProjectParameters(after,invalid,{service:f.service,editRecipe}));assert.deepEqual(store.snapshot(),before);
 }finally{f.service.dispose();}
});

test('nested conversion keeps authored trimmed bottom-face colors after floating-point source picking changes serialized face bytes',async()=>{
 const f=await fixture();try{
  const legacy=f.project.nodes[0],bottom=resolveCadAnnotationNative(oc,legacy,{point:[-12,0,-2],normal:[0,0,-1]});legacy.metadata={stepFaceColors:[{faceIndex:bottom.faceIndex,color:'#22aa44',opacity:.8}],partProperties:{version:1,surfaces:{kind:'cad',geometryDigest:partSurfaceDigest(legacy),groups:[{name:'Authored bottom',color:'#22aa44',faceIds:[bottom.faceIndex]}]}}};
  const keep=f.service.nativeNode({type:'box',size:[3,4,5]},{id:'keep'});keep.transform[12]=60;const assembly={...structuredClone(legacy),id:'assembly',name:'Outer CSG',metadata:{notes:'Outer'},children:[legacy,keep],transform:cadIdentity()};assembly.transform[12]=10;f.project=await f.service.rebuild(createCadProject({nodes:[assembly]}));
  const {store,tools}=storeFor(f.service,f.project),proposal=await tools.previewConvertDrill({...options,id:'assembly',path:['legacy'],reference:{ray:{origin:[15.000000000000004,3.000000000000001,30],direction:[0,0,-1]}},confirmed:true,revision:store.revision()}),node=proposal.project.nodes[0].children[0];
  sameShape(f.service,f.project.nodes[0],proposal.project.nodes[0]);assert.equal(partSurfaceState(node).current,true);assert.equal(proposal.report.pendingColors,0);assert(node.metadata.stepFaceColors?.some(color=>color.color==='#22aa44'));assert.equal(node.metadata.partProperties.surfaces.groups[0].name,'Authored bottom');assert(proposal.report.faceDomainProofs.some(proof=>proof.nodeId==='legacy'&&proof.method==='analytic-support-common-and-bidirectional-trimmed-domain-cuts'&&proof.missingArea<=proof.areaTolerance&&proof.addedArea<=proof.areaTolerance));
  assert.deepEqual(store.snapshot(),f.project);
 }finally{f.service.dispose();}
});
