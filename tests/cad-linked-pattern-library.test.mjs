import test from 'node:test';
import assert from 'node:assert/strict';
import loader from '../cad-kernel-build/runtime/formnaro_cad.js';
import {createCadProject,parseCadProject,serializeCadProject} from '../src/cad-project.js';
import {createCadService} from '../src/cad-service.js';
import {createCadCommandRouter} from '../src/cad-command-router.js';
import {createCadTransactions} from '../src/cad-transactions.js';
import {cadTemplateSelection,createCadPersistence} from '../src/cad-persistence.js';
import {cadLinkedPatternProblems,assertCadLinkedPatternExportReady} from '../src/cad-linked-pattern-data.js';
import {captureCadAISourceReference,cadAIReferenceState,upsertCadAIReference} from '../src/cad-ai-feature-references.js';
import {encodeFnpackProject,createFnpackResolver} from '../src/cad-fnpack-data.js';

const oc=await loader({print:()=>{},printErr:()=>{}});
test('pattern library selection, remapping, variants, persistence and undo',async()=>{
 const service=createCadService({oc});try{
  const params={version:1,parameters:[{id:'base',name:'Grundabstand',value:10},{id:'distance',name:'Abstand',value:'Grundabstand * 2'},{id:'unused',name:'NichtBenutzt',value:99}],bindings:[],variants:[{id:'wide',name:'Breit',values:[{parameterId:'base',value:15}],states:[]}],activeVariantId:'wide'};
  const initial=await service.rebuild(createCadProject({nodes:[service.nativeNode({type:'box',size:[5,5,5]},{id:'source'}),service.nativeNode({type:'box',size:[2,2,2]},{id:'other'})],projectParameters:params})),router=createCadCommandRouter({oc,service});
  const pattern={version:1,id:'pattern',sourceId:'source',kind:'line',count:3,step:[30,0,0],excluded:[1],instances:[],bindings:[{field:'step.0',parameterId:'distance'}]};
  const patterned=(await router.run(initial,{kind:'linkedPattern',pattern},{baseline:initial})).project,store=createCadTransactions({initial:patterned,build:(p,c)=>service.rebuild(p,{baseline:c.baseline})}),before=store.snapshot();
  const active=before.linkedPatterns.patterns[0].instances.filter(i=>!before.linkedPatterns.patterns[0].excluded.includes(i.index)).map(i=>i.id),ids=['source',...active];
  assert.throws(()=>cadTemplateSelection(before,['source']),{code:'PATTERN_SELECTION_INCOMPLETE'});assert.throws(()=>cadTemplateSelection(before,[...active]),{code:'PATTERN_SELECTION_INCOMPLETE'});
  for(const mode of ['changed','missing']){const stale=structuredClone(before),id=active[0];if(mode==='changed')stale.nodes.find(n=>n.id===id).name='Edited';else stale.nodes=stale.nodes.filter(n=>n.id!==id);assert.throws(()=>cadTemplateSelection(stale,['source']),{code:'PATTERN_UPDATE_REQUIRED'});}
  const values=new Map();let count=0;const persistence=createCadPersistence({storage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)},transactions:store,verify:p=>service.rebuild(p),makeId:()=>`library-new-${++count}`});
  const entry=persistence.saveTemplate({id:'template',name:'Muster',ids});assert.deepEqual(entry.project.projectParameters.parameters.map(p=>p.id).sort(),['base','distance']);assert.deepEqual(cadLinkedPatternProblems(entry.project,entry.project.linkedPatterns.patterns[0]),[]);
  const proposal=await persistence.previewTemplate({id:'template',revision:store.revision()});assert.deepEqual(store.snapshot(),before);store.apply(proposal);
  const after=store.snapshot(),[original,copy]=after.linkedPatterns.patterns;assert.deepEqual(after.nodes.slice(0,before.nodes.length),before.nodes);assert.notEqual(copy.id,original.id);assert.notEqual(copy.sourceId,original.sourceId);assert.notEqual(copy.instances[0].id,original.instances[0].id);assert.notEqual(copy.bindings[0].parameterId,original.bindings[0].parameterId);assert.deepEqual(cadLinkedPatternProblems(after,original),[]);assert.deepEqual(cadLinkedPatternProblems(after,copy),[]);assert.doesNotThrow(()=>assertCadLinkedPatternExportReady(after));
  const reopened=parseCadProject(serializeCadProject(after));assert.deepEqual(cadLinkedPatternProblems(reopened,reopened.linkedPatterns.patterns[1]),[]);
  const packed=encodeFnpackProject(after),blocks=new Map(packed.blocks.map(b=>[b.sha256,b.bytes]));const hydrated=await createFnpackResolver({readBlock:async key=>blocks.get(key)}).hydrate(packed.project,packed.project.nodes.map(n=>n.id));assert.deepEqual(cadLinkedPatternProblems(hydrated,hydrated.linkedPatterns.patterns[1]),[]);
  store.undo();assert.deepEqual(store.snapshot(),before);store.redo();assert.deepEqual(store.snapshot(),after);
 }finally{service.dispose();}
});

test('library preview discards rebuilt geometry changes instead of blessing a stale pattern',async()=>{
 const service=createCadService({oc});try{
  const initial=await service.rebuild(createCadProject({nodes:[service.nativeNode({type:'box',size:[4,4,4]},{id:'source'})]})),router=createCadCommandRouter({oc,service}),pattern={version:1,id:'p',sourceId:'source',kind:'line',count:2,step:[10,0,0],excluded:[],instances:[]};
  const first=(await router.run(initial,{kind:'linkedPattern',pattern},{baseline:initial})).project;
  const store=createCadTransactions({initial:first,build:async(p,c)=>{const result=await service.rebuild(p,{baseline:c.baseline});result.nodes.at(-1).name='Changed during build';return result;}}),values=new Map();let i=0;
  const persistence=createCadPersistence({storage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)},transactions:store,verify:p=>service.rebuild(p),makeId:()=>`fresh-${++i}`});
  persistence.saveTemplate({id:'template',name:'Muster',ids:first.nodes.map(n=>n.id)});const before=store.snapshot();
  await assert.rejects(()=>persistence.previewTemplate({id:'template',revision:store.revision()}),{code:'PATTERN_UPDATE_REQUIRED'});assert.deepEqual(store.snapshot(),before);assert.equal(store.state().previews,0);
 }finally{service.dispose();}
});


test('pattern source with a saved feature reference is refused without changing the confirmed project or library',async()=>{
 const service=createCadService({oc});try{
  const initial=await service.rebuild(createCadProject({nodes:[service.nativeNode({type:'box',size:[4,4,4]},{id:'source'}),service.nativeNode({type:'box',size:[2,2,2]},{id:'other'})]})),router=createCadCommandRouter({oc,service});
  const pattern={version:1,id:'p',sourceId:'source',kind:'line',count:2,step:[10,0,0],excluded:[],instances:[]},patterned=(await router.run(initial,{kind:'linkedPattern',pattern},{baseline:initial})).project;
  const ref=captureCadAISourceReference(patterned,{rootId:'source',path:[]},{id:'saved-source'}),unrelated=captureCadAISourceReference(patterned,{rootId:'other',path:[]},{id:'saved-other'});
  const project={...patterned,featureReferences:upsertCadAIReference(upsertCadAIReference(null,ref),unrelated)},store=createCadTransactions({initial:project,build:(p,c)=>service.rebuild(p,{baseline:c.baseline})});
  const values=new Map();let i=0;const persistence=createCadPersistence({storage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)},transactions:store,verify:p=>service.rebuild(p),makeId:()=>`fresh-${++i}`});
  const before=store.snapshot(),revision=store.revision(),ids=['source',...before.linkedPatterns.patterns[0].instances.map(v=>v.id)];
  assert.equal(cadAIReferenceState(before,ref,{stored:true}).status,'current');assert.throws(()=>persistence.saveTemplate({id:'pattern',name:'Muster',ids}),{code:'PATTERN_FEATURE_REFERENCE_UNSUPPORTED'});
  assert.deepEqual(store.snapshot(),before);assert.equal(store.revision(),revision);assert.equal(store.state().undo,0);assert.equal(persistence.listTemplates().length,0);
  const unrelatedOnly={...before,featureReferences:upsertCadAIReference(null,unrelated)};assert.doesNotThrow(()=>cadTemplateSelection(unrelatedOnly,ids));assert.equal(cadAIReferenceState(store.snapshot(),ref,{stored:true}).status,'current');
 }finally{service.dispose();}
});
