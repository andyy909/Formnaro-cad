import test from 'node:test';import assert from 'node:assert/strict';import {Worker} from 'node:worker_threads';
import freecad from '../backend/freecad.cjs';
import {createCadController} from '../src/cad-controller.js';
import {parseCadProject} from '../src/cad-project.js';
import {freeCADSourceDigest} from '../src/cad-freecad-source.js';
import {readFreeCADDocument} from '../src/cad-freecad-document.js';
import {cadContourLinkProblems} from '../src/cad-linked-contours-data.js';
import {createCadDrawingSheet} from '../src/cad-drawing-data.js';
import {createCadProjectParameters} from '../src/cad-project-parameters-data.js';
import {cadSelectionContext} from '../src/cad-interface-state.js';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {openFnpack,writeFnpack} from '../backend/fnpack.cjs';
import {encodeFnpackProject,createFnpackResolver,materializedFnpackProject} from '../src/cad-fnpack-data.js';
const factory=()=>{const w=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),a={postMessage:v=>w.postMessage(v),terminate:()=>w.terminate()};w.on('message',v=>a.onmessage?.({data:v}));w.on('error',e=>a.onerror?.(e));return a;};
const code="base=doc.addObject('Part::Box','Base');base.Length=30;base.Width=20;base.Height=6\nbore=doc.addObject('Part::Cylinder','Bore');bore.Radius=3;bore.setExpression('Height','Base.Height + 2 mm');bore.Placement.Base=App.Vector(15,10,-1)\nresult=doc.addObject('Part::Cut','Finished');result.Base=base;result.Tool=bore;doc.recompute()";
function desktop(){const jobs=new Map();return {runFreeCADReply:async args=>{const abort=new AbortController();jobs.set(args.requestId,abort);try{const {requestId,...request}=args;return {ok:true,value:await freecad.run(request,{signal:abort.signal})};}catch(e){return {ok:false,error:e.message,code:e.code};}finally{jobs.delete(args.requestId);}},cancelFreeCAD:async({requestId})=>{jobs.get(requestId)?.abort();return true;}};}
const edit=(node,property='Radius',value=4)=>({target:{rootId:node.id,path:[]},sourceDigest:freeCADSourceDigest(node.metadata.freecadSource.documentBase64),resultObject:'Finished',edits:[{object:property==='Radius'?'Bore':'Base',property,expectedType:'App::PropertyLength',expectedValue:property==='Radius'?3:6,value}]});

test('A real FreeCAD property update previews/applies on the same affine-placed part, persists format22 and owns one Undo',async()=>{
 const previous=globalThis.offlinecadDesktop;globalThis.offlinecadDesktop=desktop();const cad=createCadController({createWorker:factory});
 try{
  await cad.execute({kind:'batch',commands:[{op:'tool',engine:'freecad',operation:{kind:'build',script:{version:1,name:'Native editable plate',code}}},{op:'create',type:'box',name:'Unrelated source',size:[3,4,5],pos:[-50,0,0]}]});
  const placed=cad.snapshot();placed.nodes[0].transform=[1.2,.1,0,0,.25,1.5,0,0,.1,0,.8,0,50,-20,10,1];placed.nodes[1].locked=true;placed.nodes[0].color='#125634';placed.nodes[0].opacity=.7;await cad.open(placed);const original=cad.serialize(),before=cad.snapshot(),depth=cad.state().undo,node=before.nodes[0];
  const p=await cad.previewFreeCADDocument(edit(node));assert.equal(cad.serialize(),original);assert.equal(p.project.version,22);assert.deepEqual(p.project.nodes[0].transform,node.transform);assert.deepEqual(p.project.nodes[1],before.nodes[1]);assert.equal(p.project.nodes[0].id,node.id);assert.equal(p.project.nodes[0].metadata.freecadSource.script.code,code);assert.equal(p.project.nodes[0].metadata.freecadSource.mode,'native');assert.equal(p.project.nodes[0].metadata.freecadSource.version,2);
  assert.deepEqual(p.selectedTargets,[{rootId:node.id,path:[]}]);
  const proof=await cad.checkPreview(p.previewId,[{kind:'volume',target:node.id,expected:(3600-96*Math.PI)*1.42,tolerance:.0001}]);assert(proof.checks.every(c=>c.passed));
  cad.apply(p);assert.equal(cad.state().undo,depth+1);const saved=cad.serialize();assert.equal(parseCadProject(saved).version,22);assert.throws(()=>parseCadProject({...cad.snapshot(),version:21}),/22/);
  const source=cad.snapshot().nodes[0].metadata.freecadSource;assert.equal(source.documentDigest,freeCADSourceDigest(source.documentBase64));const tree=await readFreeCADDocument(source);assert.equal(tree.tree.objects.find(o=>o.name==='Bore').properties.find(p=>p.name==='Radius').value,4);
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'formnaro-fcstd-package-'));try{const packed=encodeFnpackProject(cad.snapshot()),file=path.join(dir,'native-edit.fnpack');await writeFnpack(file,packed);const opened=await openFnpack(file);try{assert.equal(opened.index.project.version,22);const resolver=createFnpackResolver({readBlock:async hash=>new Uint8Array(await opened.read(hash))}),restored=materializedFnpackProject(await resolver.hydrate(opened.index.project));assert.deepEqual(restored.nodes[0].metadata.freecadSource,source);assert.deepEqual(restored.nodes[0].transform,node.transform);}finally{await opened.close();}}finally{assert.equal(path.dirname(dir),os.tmpdir());await fs.rm(dir,{recursive:true,force:true});}
  cad.undo();assert.equal(cad.serialize(),original);cad.redo();assert.equal(cad.serialize(),saved);
 }finally{cad.dispose();globalThis.offlinecadDesktop=previous;}
});
test('Native dependent driver changes require private explicit acceptance and a stale document request cannot overwrite a later edit',async()=>{
 const previous=globalThis.offlinecadDesktop;globalThis.offlinecadDesktop=desktop();const cad=createCadController({createWorker:factory});
 try{
  await cad.execute({kind:'batch',commands:[{op:'tool',engine:'freecad',operation:{kind:'build',script:{version:1,code}}}]});const node=cad.snapshot().nodes[0],before=cad.serialize(),request=edit(node,'Height',8),p=await cad.previewFreeCADDocument(request);
  assert(p.report.freecadDependencies.requiresAcceptance);assert(p.report.freecad.dependentChanges.some(c=>c.object==='Bore'&&c.property==='Height'&&c.value===10));p.report.freecadDependencies.requiresAcceptance=false;
  assert.throws(()=>cad.apply(p),e=>e.code==='AI_FEATURE_DEPENDENCY_ACCEPTANCE_REQUIRED');assert.equal(cad.serialize(),before);cad.apply({...p,acceptFeatureDependencies:true});const after=cad.serialize();await assert.rejects(cad.previewFreeCADDocument(request),e=>e.code==='STALE_REVISION');assert.equal(cad.serialize(),after);
 }finally{cad.dispose();globalThis.offlinecadDesktop=previous;}
});
test('A replaced STEP contour remains explicitly unresolved, drawing views refresh, bound placement and unrelated sources remain exact',async()=>{
 const previous=globalThis.offlinecadDesktop;globalThis.offlinecadDesktop=desktop();const cad=createCadController({createWorker:factory});
 try{
  await cad.execute({kind:'batch',commands:[{op:'tool',engine:'freecad',operation:{kind:'build',script:{version:1,code}}},{op:'create',type:'box',name:'Keep',size:[3,4,5],pos:[-50,0,0]}]});let root=cad.snapshot().nodes[0];const target={rootId:root.id,path:[]};
  const candidate=await cad.query('linkedFaceCandidate',{source:target,ray:{origin:[5,5,50],direction:[0,0,-1]}}),linked=await cad.previewContourLinks({action:'create',source:target,selector:candidate.selector,height:3});cad.apply(linked);
  const sheet=createCadDrawingSheet({id:'drawing',sourceIds:[root.id]});cad.apply(await cad.previewDrawings({version:1,sheets:[sheet]}));cad.apply(await cad.previewDrawingUpdate(cad.snapshot().drawings,{sheetIds:['drawing']}));
  const data=createCadProjectParameters();data.parameters=[{id:'x',name:'x',value:15}];data.bindings=[{id:'position',parameterId:'x',target,field:'pos.0'}];cad.apply(await cad.previewProjectParameters(data));
  const before=cad.serialize(),old=cad.snapshot(),linkedTarget=old.nodes.find(n=>n.id===linked.aliases.sketch);root=old.nodes[0];assert.equal(cadContourLinkProblems(old).length,0);
  const proposal=await cad.previewFreeCADDocument(edit(root));assert.equal(cad.serialize(),before);assert(proposal.report.freecadDependencies.unresolved.some(p=>p.kind==='contour'));assert(cadContourLinkProblems(proposal.project).length>0);assert.deepEqual(proposal.project.nodes.find(n=>n.id===linkedTarget.id),linkedTarget);assert.deepEqual(proposal.project.nodes[1],old.nodes[1]);assert.deepEqual(proposal.project.nodes[0].transform,root.transform);assert(proposal.report.freecadDependencies.drawingViews.length>0);
  cad.apply({...proposal,acceptFeatureDependencies:true});cad.undo();assert.equal(cad.serialize(),before);
 }finally{cad.dispose();globalThis.offlinecadDesktop=previous;}
});
test('Face colors retain exact native matches or their original pending identities, never an assumed new face index',async()=>{
 const previous=globalThis.offlinecadDesktop;globalThis.offlinecadDesktop=desktop();const cad=createCadController({createWorker:factory});
 try{
  await cad.execute({kind:'batch',commands:[{op:'tool',engine:'freecad',operation:{kind:'build',script:{version:1,code}}}]});const colored=cad.snapshot(),root=colored.nodes[0];root.metadata.stepFaceColors=Array.from({length:root.stats.solids?7:0},(_,i)=>({faceIndex:i+1,color:'#'+(i+1).toString().repeat(6),opacity:.8}));await cad.open(colored);const before=cad.serialize(),node=cad.snapshot().nodes[0],p=await cad.previewFreeCADDocument(edit(node)),updated=p.project.nodes[0],mapped=updated.metadata.stepFaceColors??[],pending=updated.metadata.freecadSource.pendingFaceColors??[];
  assert.equal(mapped.length+pending.length,node.metadata.stepFaceColors.length);assert(pending.length>0);assert(pending.every(c=>c.documentDigest===freeCADSourceDigest(node.metadata.freecadSource.documentBase64)));assert(p.report.freecadDependencies.unresolved.some(r=>r.kind==='face-color'));assert.equal(cad.serialize(),before);cad.apply({...p,acceptFeatureDependencies:true});cad.undo();assert.equal(cad.serialize(),before);
 }finally{cad.dispose();globalThis.offlinecadDesktop=previous;}
});

test('Editing a retained STEP inside an affine group rebuilds its ancestors once and preserves siblings and all source paths',async()=>{
 const previous=globalThis.offlinecadDesktop;globalThis.offlinecadDesktop=desktop();const cad=createCadController({createWorker:factory});
 try{
  await cad.execute({kind:'batch',commands:[{op:'tool',engine:'freecad',operation:{kind:'build',script:{version:1,code}}},{op:'create',type:'box',name:'Group sibling',size:[4,5,6],pos:[60,0,0],as:'sibling'},{op:'create',type:'box',name:'Independent',size:[2,3,4],pos:[-60,0,0],as:'keep'}]});const initial=cad.snapshot(),step=initial.nodes[0],sibling=initial.nodes[1],keep=initial.nodes[2];
  const grouped=await cad.execute({kind:'batch',commands:[{op:'group',targets:[step.id,sibling.id],as:'container'}]}),group=grouped.aliases.container,p=cad.snapshot(),root=p.nodes.find(n=>n.id===group);root.transform=[-1,0,0,0,.2,1,0,0,0,0,1,0,30,-10,7,1];await cad.open(p);
  const before=cad.snapshot(),serialized=cad.serialize(),target={rootId:group,path:[step.id]},old=cadSelectionContext(before,target),request={...edit(old.node),target},proposal=await cad.previewFreeCADDocument(request),changed=cadSelectionContext(proposal.project,target),parent=proposal.project.nodes.find(n=>n.id===group);
  assert.equal(cad.serialize(),serialized);assert.deepEqual(changed.world,old.world);assert.deepEqual(parent.transform,root.transform);assert.deepEqual(parent.children.find(n=>n.id===sibling.id),before.nodes.find(n=>n.id===group).children.find(n=>n.id===sibling.id));assert.deepEqual(proposal.project.nodes.find(n=>n.id===keep.id),before.nodes.find(n=>n.id===keep.id));
  assert.equal(changed.node.metadata.freecadSource.mode,'native');assert(Math.abs(parent.stats.volume-(3600-96*Math.PI+120))<1e-5);assert(Object.values(proposal.report.counts).every(n=>n===1));assert.deepEqual(proposal.selectedTargets,[target]);
  cad.apply({...proposal,acceptFeatureDependencies:true});assert((await cad.exportModel({format:'step',ids:[group]})).data.length>1000);const saved=cad.serialize();await cad.open(saved);assert.equal(cad.serialize(),saved);await cad.open(before);
  const locked=cad.snapshot();locked.nodes.find(n=>n.id===group).locked=true;await cad.open(locked);const protectedBefore=cad.serialize();await assert.rejects(cad.previewFreeCADDocument(request),e=>e.code==='FREECAD_SOURCE_LOCKED');assert.equal(cad.serialize(),protectedBefore);
 }finally{cad.dispose();globalThis.offlinecadDesktop=previous;}
});

test('Aborting an actual native property job preserves the project and Undo and permits a fresh later preview',async()=>{
 const previous=globalThis.offlinecadDesktop;globalThis.offlinecadDesktop=desktop();const cad=createCadController({createWorker:factory});
 try{
  await cad.execute({kind:'batch',commands:[{op:'tool',engine:'freecad',operation:{kind:'build',script:{version:1,code}}}]});const before=cad.serialize(),depth=cad.state().undo,request=edit(cad.snapshot().nodes[0]),abort=new AbortController();
  const promise=cad.previewFreeCADDocument(request,{signal:abort.signal}),timer=setTimeout(()=>abort.abort(),1500);
  try{await assert.rejects(promise,e=>e.name==='AbortError'||e.code==='ABORTED');}finally{clearTimeout(timer);}
  assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,depth);const next=await cad.previewFreeCADDocument(request);assert.equal(next.project.nodes[0].metadata.freecadSource.mode,'native');cad.discard(next.previewId);assert.equal(cad.serialize(),before);
 }finally{cad.dispose();globalThis.offlinecadDesktop=previous;}
});
