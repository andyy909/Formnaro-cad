import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createCadController} from '../src/cad-controller.js';
import {createCadProject,parseCadProject} from '../src/cad-project.js';
import {defaultCadSketch} from '../src/cad-sketch.js';
import {validateCadAIReference,validateCadAIReferences,cadAIReferenceState,cadAIReferenceFields,captureCadAISourceReference,upsertCadAIReference,removeCadAIReference} from '../src/cad-ai-feature-references.js';
import {encodeFnpackProject,createFnpackResolver} from '../src/cad-fnpack-data.js';
import {openFnpack,writeFnpack} from '../backend/fnpack.cjs';
import {createCadRecovery} from '../src/cad-recovery.js';
import {cadTemplateSelection} from '../src/cad-persistence.js';
import {captureCadAIFeatureScope,cadAIFeatureScopeContext,previewCadAIFeatureCommands,validateCadAIFeatureCommands} from '../src/cad-ai-feature-automation.js';
import {createCadAutomationAccess} from '../src/cad-automation-access.js';

const near=(a,b)=>assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function controller(){return createCadController({createWorker:()=>{const worker=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),adapter={postMessage:m=>worker.postMessage(m),terminate:()=>worker.terminate()};worker.on('message',data=>adapter.onmessage?.({data}));worker.on('error',e=>adapter.onerror?.(e));return adapter;}});}
async function fixture(cad,{coincident=false}={}){
 await cad.execute({kind:'batch',commands:[{op:'create',type:'box',size:[40,30,10],as:'base'},{op:'create',type:'cylinder',size:[4,4,20],pos:[-10,0,0],solid:false,as:'holeA'},{op:'create',type:'cylinder',size:[4,4,20],pos:[coincident?-10:10,0,0],solid:false,as:'holeB'},{op:'group',targets:['$base','$holeA','$holeB'],as:'body'},{op:'create',type:'box',size:[5,6,7],pos:[80,0,0],as:'unrelated'}]});
 const project=cad.snapshot(),root=project.nodes[0],a=root.children.find(n=>n.recipe.type==='cylinder');return {root,a,target:{rootId:root.id,path:[a.id]},ids:[root.id],ray:{origin:[-10,0,0],direction:[1,1,0],far:100},before:cad.serialize()};
}

test('Chat scope captures only human-attached saved geometry, rejects reassigned IDs and bypass commands before construction, then previews the typed native edit',async()=>{
 const cad=controller();try{const f=await fixture(cad),ref=(await cad.query('featureReference',{action:'pick',kind:'bore',ids:f.ids,ray:f.ray})).reference;
  assert.throws(()=>captureCadAIFeatureScope(cad.snapshot(),[ref.id]),{code:'AI_REFERENCE_MISSING'});
  cad.apply(await cad.previewFeatureReferences(upsertCadAIReference(null,ref)));const before=cad.serialize(),depth=cad.state().undo,revision=cad.revision(),scope=captureCadAIFeatureScope(cad.snapshot(),[ref.id],[ref]),context=cadAIFeatureScopeContext(cad.snapshot(),scope);
  assert.equal(context.restricted,true);assert.deepEqual(context.references[0].fields,[{field:'diameter',value:4,unit:'mm'}]);scope.items[0].name='Only local copy';assert.equal(cad.snapshot().featureReferences.items[0].name,ref.name);
  let describeCalls=0;const access=createCadAutomationAccess({controller:{...cad,describe:async(...args)=>{describeCalls++;return cad.describe(...args);}}});
  for(const commands of [[{op:'delete',target:f.root.id}],[{op:'python',code:'unrelated'}],[{op:'feature',referenceId:ref.id,field:'diameter',value:6},{op:'update',target:f.root.id,size:[1,1,1]}]])await assert.rejects(access.preview({revision,commands},{featureScope:scope}),{code:'AI_FEATURE_SCOPE_VIOLATION'});
  assert.equal(describeCalls,0);assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,depth);
  await assert.rejects(previewCadAIFeatureCommands(cad,{revision,references:scope,commands:[{op:'feature',referenceId:'another',field:'diameter',value:6}]}),{code:'AI_FEATURE_REFERENCE_REQUIRED'});
  assert.throws(()=>validateCadAIFeatureCommands([{op:'feature',referenceId:ref.id,field:'diameter',value:6,target:f.root.id}]),{code:'AI_FEATURE_SCOPE_VIOLATION'});
  const p=await previewCadAIFeatureCommands(cad,{revision,references:scope,commands:[{op:'feature',referenceId:ref.id,field:'diameter',value:6}]});assert.equal(p.report.native[0].actual,6);assert.equal(cad.serialize(),before);cad.discard(p.previewId);
  const renamed={...ref,name:'New visible name'};cad.apply(await cad.previewFeatureReferences(upsertCadAIReference(cad.snapshot().featureReferences,renamed)));assert.equal(captureCadAIFeatureScope(cad.snapshot(),[ref.id],[ref]).items[0].name,renamed.name);
  const other=(await cad.query('featureReference',{action:'pick',kind:'bore',ids:f.ids,ray:{origin:[10,0,0],direction:[1,1,0],far:100}})).reference,reassigned={...other,id:ref.id,name:ref.name};cad.apply(await cad.previewFeatureReferences(upsertCadAIReference(cad.snapshot().featureReferences,reassigned)));
  assert.throws(()=>captureCadAIFeatureScope(cad.snapshot(),[ref.id],[ref]),{code:'AI_REFERENCE_STALE'});assert.equal(cadAIReferenceState(cad.snapshot(),ref,{stored:true}).code,'AI_REFERENCE_REASSIGNED');assert.equal(captureCadAIFeatureScope(cad.snapshot(),[ref.id],[reassigned]).items[0].origin.target.path.at(-1),other.origin.target.path.at(-1));
 }finally{cad.dispose();}
});
test('Actual worker binds an inner cylindrical face to its exact retained cutter and resolves after save/reopen without face indices',async()=>{
 const cad=controller();try{const f=await fixture(cad),depth=cad.state().undo,pick=await cad.query('featureReference',{action:'pick',kind:'bore',ids:f.ids,ray:f.ray});assert.equal(pick.reference.kind,'bore');near(pick.reference.selector.surface.diameter,4);assert.deepEqual(pick.reference.origin.target,f.target);assert.equal(pick.candidates.length,1);assert(pick.display.curves.length);assert(!JSON.stringify(pick.reference).includes('faceIndex'));assert.equal(cad.serialize(),f.before);assert.equal(cad.state().undo,depth);
  const stored=validateCadAIReferences(JSON.parse(JSON.stringify({version:1,items:[pick.reference]})));await cad.open(f.before);const resolved=await cad.query('featureReference',{action:'resolve',reference:stored.items[0]});assert.equal(resolved.state.status,'current');assert(resolved.native.faceIndex>0);assert.deepEqual(resolved.reference,pick.reference);assert.equal(cad.serialize(),f.before);
  const source=await cad.query('featureReference',{action:'source',target:f.target});assert.equal(source.reference.kind,'feature');assert(cadAIReferenceFields(cad.snapshot(),source.reference).some(f=>f.field==='size.0'));assert(source.catalog.items.some(i=>i.target.path.includes(f.a.id)));
 }finally{cad.dispose();}
});
test('Coincident hole sources stay ambiguous; tampered domains, anchors and cylinder measurements cannot be treated as current native proof',async()=>{
 const cad=controller();try{const f=await fixture(cad,{coincident:true}),pick=await cad.query('featureReference',{action:'pick',kind:'bore',ids:f.ids,ray:f.ray});assert.equal(pick.candidates.length,2);assert.equal(pick.reference.origin,undefined);assert.deepEqual(cadAIReferenceFields(cad.snapshot(),pick.reference),[]);
  for(const mutate of [r=>{r.selector.signature='0'.repeat(64);},r=>{r.selector.point[2]+=30;},r=>{r.selector.surface.diameter=99;}]){const bad=structuredClone(pick.reference);mutate(bad);await assert.rejects(cad.query('featureReference',{action:'resolve',reference:bad}));}
  const bad=structuredClone(pick.reference);bad.origin={target:{rootId:f.root.id,path:[f.root.children[0].id]},sourceDigest:pick.candidates[0].sourceDigest};await assert.rejects(cad.query('featureReference',{action:'resolve',reference:bad}),{code:'AI_REFERENCE_STALE'});assert.equal(cad.serialize(),f.before);
 }finally{cad.dispose();}
});
test('Geometry changes invalidate references until explicit repick; Undo restores the exact old correspondence and locks stay authoritative',async()=>{
 const cad=controller();try{const f=await fixture(cad),pick=await cad.query('featureReference',{action:'pick',kind:'bore',ids:f.ids,ray:f.ray});const draft=cad.snapshot();const cutter=draft.nodes[0].children.find(n=>n.id===f.a.id);cutter.recipe.size[0]=cutter.recipe.size[1]=6;cad.apply(await cad.preview(undefined,{project:draft}));assert.equal(cadAIReferenceState(cad.snapshot(),pick.reference).status,'stale');await assert.rejects(cad.query('featureReference',{action:'resolve',reference:pick.reference}),{code:'AI_REFERENCE_STALE'});assert.deepEqual(cadAIReferenceFields(cad.snapshot(),pick.reference),[]);
  const fresh=await cad.query('featureReference',{action:'pick',kind:'bore',ids:f.ids,ray:f.ray});near(fresh.reference.selector.surface.diameter,6);assert.deepEqual(fresh.reference.origin.target,f.target);cad.undo();assert.equal(cad.serialize(),f.before);await cad.query('featureReference',{action:'resolve',reference:pick.reference});
  const locked=cad.snapshot();locked.nodes[0].locked=true;await cad.open(locked);const state=cadAIReferenceState(cad.snapshot(),pick.reference);assert.equal(state.status,'current');assert.equal(state.editable,false);assert.deepEqual(cadAIReferenceFields(cad.snapshot(),pick.reference),[]);await cad.open(createCadProject());assert.equal(cadAIReferenceState(cad.snapshot(),pick.reference).status,'missing');
 }finally{cad.dispose();}
});
test('Native edge domains and sketch/source references remain distinct; invalid persisted selectors cannot contain transient indices',async()=>{
 const cad=controller();try{const f=await fixture(cad),catalog=await cad.query('featureReference',{action:'edges',target:{rootId:f.root.id,path:[]}});assert(catalog.edges.length>12);const selected=catalog.edges.find(e=>e.selector.curveKind==='line'),edge=await cad.query('featureReference',{action:'edge',target:{rootId:f.root.id,path:[]},signature:selected.selector.signature});assert.equal(edge.reference.kind,'edge');await cad.query('featureReference',{action:'resolve',reference:edge.reference});const bad=structuredClone(edge.reference);bad.selector.samples[1][0]+=1;await assert.rejects(cad.query('featureReference',{action:'resolve',reference:bad}));
  assert.throws(()=>validateCadAIReference({...edge.reference,faceIndex:1}),{code:'AI_REFERENCE_INVALID'});assert.throws(()=>validateCadAIReference({...edge.reference,selector:{...edge.reference.selector,faceIndex:1}}),{code:'AI_REFERENCE_INVALID'});assert.throws(()=>validateCadAIReferences({version:1,items:[edge.reference,edge.reference]}),{code:'AI_REFERENCE_INVALID'});
  await cad.execute({kind:'batch',commands:[{op:'sketch',sketch:defaultCadSketch(),as:'profile'}]});const sketch=cad.snapshot().nodes.find(n=>n.recipe?.type==='sketch'),ref=captureCadAISourceReference(cad.snapshot(),{rootId:sketch.id,path:[]},{kind:'sketch'});assert.equal(ref.kind,'sketch');assert(cadAIReferenceFields(cad.snapshot(),ref).some(f=>f.field.startsWith('sketch.')));
  const cylinder=await cad.execute({kind:'batch',commands:[{op:'create',type:'cylinder',size:[10,10,10],pos:[100,0,0],as:'outer'}]});await assert.rejects(cad.query('featureReference',{action:'pick',kind:'bore',ids:[cylinder.aliases.outer],ray:{origin:[130,0,0],direction:[-1,0,0],far:100}}),/Außenmantel/);
 }finally{cad.dispose();}
});

test('Targeted bore diameter rebuilds the analytic cutter, preserves its axis/depth, the second hole and unrelated source, and applies with one exact Undo',async()=>{
 const cad=controller();try{const f=await fixture(cad),ref=(await cad.query('featureReference',{action:'pick',kind:'bore',ids:f.ids,ray:f.ray})).reference,before=cad.snapshot(),depth=cad.state().undo,second=before.nodes[0].children.find(n=>n.recipe.type==='cylinder'&&n.id!==f.a.id),operation={kind:'featureEdits',references:{version:1,items:[ref]},edits:[{referenceId:ref.id,field:'diameter',value:6}]};const siblingRef=captureCadAISourceReference(before,{rootId:f.root.id,path:[second.id]});
  const p=await cad.preview(operation);assert.equal(cad.serialize(),f.before);assert.equal(cad.state().undo,depth);assert(p.report.unrelatedSourcesExact);assert.equal(p.report.native[0].actual,6);assert(Object.values(p.report.counts).every(n=>n===1));assert.deepEqual(p.project.nodes[1],before.nodes[1]);assert.deepEqual(p.project.nodes[0].children.find(n=>n.id===second.id),second);
  const changed=p.project.nodes[0].children.find(n=>n.id===f.a.id);assert.deepEqual(changed.transform,f.a.transform);assert.equal(changed.recipe.size[2],f.a.recipe.size[2]);assert.deepEqual(changed.recipe.size.slice(0,2),[6,6]);assert.equal(cadAIReferenceState(p.project,siblingRef).status,'current');assert.equal(cadAIReferenceState(p.project,ref).status,'stale');near(before.nodes[0].stats.volume-p.project.nodes[0].stats.volume,50*Math.PI);
  cad.apply(p);const saved=cad.serialize(),native=await cad.query('featureReference',{action:'pick',kind:'bore',ids:f.ids,ray:f.ray});near(native.reference.selector.surface.diameter,6);const untouched=await cad.query('featureReference',{action:'pick',kind:'bore',ids:f.ids,ray:{origin:[10,0,0],direction:[1,1,0],far:100}});near(untouched.reference.selector.surface.diameter,4);assert.equal(cad.state().undo,depth+1);cad.undo();assert.equal(cad.serialize(),f.before);cad.redo();assert.equal(cad.serialize(),saved);
  const step=await cad.exportModel({format:'step',ids:f.ids});assert(step.data.length>1000);await cad.open(saved);near((await cad.query('featureReference',{action:'pick',kind:'bore',ids:f.ids,ray:f.ray})).reference.selector.surface.diameter,6);
 }finally{cad.dispose();}
});

test('A tangent but different cylinder is not mistaken for the measured native bore source',async()=>{
 const cad=controller();try{await cad.execute({kind:'batch',commands:[{op:'create',type:'box',size:[40,30,10],as:'base'},{op:'create',type:'cylinder',size:[4,4,20],pos:[-10,0,0],solid:false,as:'tangent'},{op:'create',type:'cylinder',size:[8,8,20],pos:[-12,0,0],solid:false,as:'actual'},{op:'group',targets:['$base','$tangent','$actual'],as:'body'}]});const root=cad.snapshot().nodes[0],actual=root.children.find(n=>n.recipe?.size?.[0]===8),pick=await cad.query('featureReference',{action:'pick',kind:'bore',ids:[root.id],ray:{origin:[-10,0,0],direction:[1,0,0],far:100}});near(pick.reference.selector.surface.diameter,8);assert.equal(pick.candidates.length,1);assert.deepEqual(pick.reference.origin.target,{rootId:root.id,path:[actual.id]});
 }finally{cad.dispose();}
});

test('Reference metadata uses format21, exact one Undo, real indexed package and recovery; lost references stay diagnosable and templates do not copy project references',async t=>{
 const cad=controller();await fs.mkdir(path.resolve('work'),{recursive:true});const dir=await fs.mkdtemp(path.join(path.resolve('work'),'feature-references-'));t.after(async()=>{assert.equal(path.dirname(dir),path.resolve('work'));assert(path.basename(dir).startsWith('feature-references-'));await fs.rm(dir,{recursive:true,force:true});});
 try{const f=await fixture(cad),ref=(await cad.query('featureReference',{action:'pick',kind:'bore',ids:f.ids,ray:f.ray})).reference,before=cad.serialize(),nodes=cad.snapshot().nodes,depth=cad.state().undo,refs=upsertCadAIReference(null,ref),proposal=await cad.previewFeatureReferences(refs);assert.equal(cad.serialize(),before);assert.deepEqual(proposal.project.nodes,nodes);cad.apply(proposal);assert.equal(cad.state().undo,depth+1);const saved=cad.serialize(),project=cad.snapshot();assert.equal(project.version,21);assert.deepEqual(parseCadProject(saved),project);assert.throws(()=>parseCadProject({...project,version:20}),/Projektformat 21/);cad.undo();assert.equal(cad.serialize(),before);cad.redo();assert.equal(cad.serialize(),saved);await cad.open(saved);await cad.query('featureReference',{action:'resolve',reference:ref});
  const encoded=encodeFnpackProject(project),file=path.join(dir,'references.fnpack');await writeFnpack(file,encoded);const pack=await openFnpack(file);try{assert.equal(pack.index.project.version,21);assert.deepEqual(pack.index.project.featureReferences,refs);const resolver=createFnpackResolver({readBlock:sha=>pack.read(sha)}),hydrated=await resolver.hydrate(pack.index.project,null);assert.equal(cadAIReferenceState(hydrated,ref).status,'current');}finally{await pack.close();}
  const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},recovery=createCadRecovery(storage);assert(recovery.write(saved,{version:21}));assert.deepEqual((await recovery.load(async p=>p)).featureReferences,refs);assert.equal(cadTemplateSelection(project,f.ids).featureReferences,undefined);
  const bad=cad.snapshot();bad.nodes[1].name='Smuggled';await assert.rejects(cad.preview({kind:'featureReferences'},{project:bad}),/keine Teile/);assert.equal(cad.serialize(),saved);
  const lost=structuredClone(project);lost.nodes=[];await cad.open(lost);assert.equal(cad.snapshot().featureReferences.items.length,1);assert.equal(cadAIReferenceState(cad.snapshot(),ref).status,'missing');assert.equal(removeCadAIReference(refs,ref.id),null);
 }finally{cad.dispose();}
});
test('Targeted shell wall and sketch variable use existing native construction while unrelated fields and parts stay exact',async()=>{
 const cad=controller();try{await cad.execute({kind:'batch',commands:[{op:'create',type:'shellbox',size:[30,20,12],params:{wall:1,floor:1,radius:0},as:'housing'},{op:'sketch',sketch:defaultCadSketch(),as:'sketch'}]});const project=cad.snapshot(),housing=project.nodes[0],sketch=project.nodes[1],a=captureCadAISourceReference(project,{rootId:housing.id,path:[]}),b=captureCadAISourceReference(project,{rootId:sketch.id,path:[]},{kind:'sketch'}),before=cad.serialize();
  const p=await cad.preview({kind:'featureEdits',references:{version:1,items:[a]},edits:[{referenceId:a.id,field:'params.wall',value:2}]});assert.equal(p.project.nodes[0].recipe.params.wall,2);assert.equal(p.project.nodes[0].recipe.params.floor,1);near(p.project.nodes[0].stats.volume,30*20*12-26*16*11);assert.deepEqual(p.project.nodes[1],sketch);assert.equal(cad.serialize(),before);cad.discard(p.previewId);
  const s=await cad.preview({kind:'featureEdits',references:{version:1,items:[b]},edits:[{referenceId:b.id,field:'sketch.variables.hoehe',value:9}]});assert.deepEqual(s.project.nodes[0],housing);near(s.project.nodes[1].stats.bounds.max[2]-s.project.nodes[1].stats.bounds.min[2],9);assert.equal(cad.serialize(),before);cad.discard(s.previewId);
 }finally{cad.dispose();}
});
test('Typed feature edits reject unknown references, unrelated free commands, stale geometry and locked sources without a draft or Undo',async()=>{
 const cad=controller();try{const f=await fixture(cad),ref=(await cad.query('featureReference',{action:'pick',kind:'bore',ids:f.ids,ray:f.ray})).reference,op={kind:'featureEdits',references:{version:1,items:[ref]},edits:[{referenceId:ref.id,field:'diameter',value:6}]},depth=cad.state().undo;
  await assert.rejects(cad.preview({...op,commands:[{op:'delete',target:cad.snapshot().nodes[1].id}]}),{code:'AI_FEATURE_EDIT_INVALID'});await assert.rejects(cad.preview({...op,edits:[{...op.edits[0],referenceId:'not-selected'}]}),{code:'AI_FEATURE_REFERENCE_REQUIRED'});assert.equal(cad.serialize(),f.before);assert.equal(cad.state().undo,depth);
  const locked=cad.snapshot();locked.nodes[0].children.find(n=>n.id===f.a.id).locked=true;await cad.open(locked);await assert.rejects(cad.preview(op),{code:'AI_FEATURE_LOCKED'});
 }finally{cad.dispose();}
});

test('A picked native face offset and a picked edge fillet retain their original sources and operate correctly in a translated frame',async()=>{
 const cad=controller();try{await cad.execute({kind:'batch',commands:[{op:'create',type:'box',size:[20,12,10],pos:[50,0,5],as:'body'},{op:'create',type:'box',size:[3,4,5],pos:[-40,0,0],as:'keep'}]});const original=cad.snapshot(),body=original.nodes[0],keep=original.nodes[1],before=cad.serialize(),face=(await cad.query('featureReference',{action:'pick',kind:'face',ids:[body.id],ray:{origin:[100,2,4],direction:[-1,0,0],far:200}})).reference;
  const offset=await cad.preview({kind:'featureEdits',references:{version:1,items:[face]},edits:[{referenceId:face.id,field:'face.offset',value:2}]});assert.equal(offset.project.nodes[0].source,'modeling');assert.deepEqual(offset.project.nodes[1],keep);assert.equal(cad.serialize(),before);near((await cad.describe(offset.project)).objects.find(n=>n.id===body.id&&!n.target.path.length).measures.worldAxisSize[0],22);cad.discard(offset.previewId);
  const edges=await cad.query('featureReference',{action:'edges',target:{rootId:body.id,path:[]}}),edge=(await cad.query('featureReference',{action:'edge',target:{rootId:body.id,path:[]},signature:edges.edges[0].selector.signature})).reference;
  const fillet=await cad.preview({kind:'featureEdits',references:{version:1,items:[edge]},edits:[{referenceId:edge.id,field:'edge.round',value:1}]});assert(fillet.project.nodes[0].stats.volume<body.stats.volume);assert.deepEqual(fillet.project.nodes[1],keep);assert.equal(cad.serialize(),before);cad.apply(fillet);cad.undo();assert.equal(cad.serialize(),before);
 }finally{cad.dispose();}
});
