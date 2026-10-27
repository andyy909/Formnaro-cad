import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createCadController} from '../src/cad-controller.js';
import {createCadAutomationAccess} from '../src/cad-automation-access.js';
import {cadRecipeForShape} from '../src/cad-form-controls.js';
import {createCadProjectParameters,cadProjectParameterProblems} from '../src/cad-project-parameters-data.js';
import {previewCadProjectParameterCommands,validateCadProjectParameterCommands,cadProjectParametersSummary,cadProjectParameterCatalogSummary,CAD_PROJECT_PARAMETER_COMMAND_SCHEMAS} from '../src/cad-project-parameters-automation.js';
import {queryProgramResources} from '../src/cad-ai-local-tools.js';
import {validateProgramCommand} from '../src/cad-ai-program.js';
import {cadAIContext} from '../src/cad-ai-context.js';
import {createCadDrawingSheet} from '../src/cad-drawing-data.js';
import {previewCadDrawingCommands} from '../src/cad-drawing-automation.js';

function factory(posts,onPost){return ()=>{const worker=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),adapter={onmessage:null,onerror:null,postMessage:message=>{posts.push(message);worker.postMessage(message);onPost?.(message);},terminate:()=>worker.terminate()};worker.on('message',message=>adapter.onmessage?.({data:message}));worker.on('error',error=>adapter.onerror?.(error));return adapter;};}
const runScript=async({code,call})=>vm.runInContext('(async()=>{'+code+'})()',vm.createContext({api:{query:q=>call('query',structuredClone(q)),run:c=>call('run',structuredClone(c))}}),{timeout:1000});
async function fixture(){const posts=[],control={},cad=createCadController({createWorker:factory(posts,message=>control.onPost?.(message)),runScript});await cad.execute({kind:'create',recipe:cadRecipeForShape('shellbox',{size:[30,20,12],params:{wall:1,floor:1,radius:0}}),options:{id:'body',name:'Original'}});await cad.execute({kind:'create',recipe:{type:'box',size:[3,4,5]},options:{id:'unrelated',name:'Unabhängig'}});let scene=await cad.describe();const access=createCadAutomationAccess({controller:cad,getSelection:()=>[{rootId:'body',path:[]}],getScene:()=>scene,refresh:async()=>{scene=await cad.describe();}});return {cad,access,posts,control};}
const target=rootId=>({rootId,path:[]}),put=data=>({op:'parameter',action:'put',data}),update={op:'parameter',action:'update'},select=variantId=>({op:'parameter',action:'selectVariant',variantId}),remove={op:'parameter',action:'remove'};
const definition=()=>({...createCadProjectParameters(),parameters:[{id:'p-wall',name:'wall',value:2},{id:'p-floor',name:'floor',value:'wall'},{id:'p-width',name:'width',value:40}],bindings:[{id:'b-wall',parameterId:'p-wall',target:target('body'),field:'params.wall'},{id:'b-floor',parameterId:'p-floor',target:target('body'),field:'params.floor'},{id:'b-width',parameterId:'p-width',target:target('body'),field:'size.0'}]});
const nativeEdits=posts=>posts.filter(p=>['command','rebuild','create'].includes(p.request?.job));

test('local parameter batch collects all controls into one native construction and one checked Undo',async()=>{
 const {cad,access,posts}=await fixture();try{
  const before=cad.serialize(),undo=cad.state().undo,untouched=cad.snapshot().nodes[1];posts.length=0;
  const proposal=await access.preview({revision:cad.revision(),commands:[put(definition()),update],label:'Wand, Boden und Breite'});assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,undo);assert.equal(nativeEdits(posts).length,1);assert.equal(nativeEdits(posts)[0].request.operation.kind,'projectParameters');assert.deepEqual(proposal.parameterReport.counts,{body:1});assert.deepEqual(proposal.parameterReport.constructedIds,['body']);assert.deepEqual(proposal.parameterReport.affectedIds,['body']);assert.equal(proposal.parameters.parameterCount,3);assert.equal(proposal.parameters.parameters.find(p=>p.name==='floor').resolvedValue,2);assert.equal(proposal.parameters.problemCount,0);
  const draft=access.getPreview(proposal.previewId);assert.equal(draft.version,13);assert.deepEqual(draft.nodes[1],untouched);assert.equal(draft.nodes[0].recipe.params.wall,2);assert.equal(draft.nodes[0].recipe.params.floor,2);
  const applied=await access.apply(proposal);assert.deepEqual(applied.parameterReport.counts,{body:1});assert.equal(cad.state().undo,undo+1);assert.equal(cadProjectParameterProblems(cad.snapshot()).length,0);const after=cad.serialize();cad.undo();assert.equal(cad.serialize(),before);cad.redo();assert.equal(cad.serialize(),after);
 }finally{cad.dispose();}
});

test('metadata-only parameter definitions use no construction while bound changes require explicit final update',async()=>{
 const {cad,access,posts}=await fixture();try{
  const data={...createCadProjectParameters(),parameters:[{id:'unused',name:'spare',value:12}]},beforeNodes=cad.snapshot().nodes;posts.length=0;const p=await access.preview({revision:cad.revision(),commands:[put(data)]});assert.equal(nativeEdits(posts).length,0);assert.equal(p.parameterReport.metadataOnly,true);assert.deepEqual(p.parameterReport.counts,{});await access.apply(p);assert.deepEqual(cad.snapshot().nodes,beforeNodes);
  const before=cad.serialize();posts.length=0;await assert.rejects(access.preview({revision:cad.revision(),commands:[put(definition())]}),{code:'PARAMETERS_UPDATE_REQUIRED'});assert.equal(nativeEdits(posts).length,0);assert.equal(cad.serialize(),before);
  const staged=definition();staged.parameters[0].value=2.5;const final=definition();final.parameters[0].value=3;const proposal=await access.preview({revision:cad.revision(),commands:[put(staged),put(final),update]});assert.deepEqual(proposal.parameterReport.counts,{body:1});assert.equal(access.getPreview(proposal.previewId).nodes[0].recipe.params.wall,3);cad.discard(proposal.previewId);
 }finally{cad.dispose();}
});

test('variant selection and removal restore captured flags, retain finished bodies and honor shared history',async()=>{
 const {cad,access}=await fixture();try{
  const data=definition();data.variants=[{id:'variant-hidden',name:'Größer verborgen',values:[{parameterId:'p-wall',value:3}],states:[{target:target('body'),hidden:true,suppressed:true}]}];await access.apply(await access.preview({revision:cad.revision(),commands:[put(data),update]}));
  await assert.rejects(access.preview({revision:cad.revision(),commands:[select('variant-hidden')]}),{code:'PARAMETERS_UPDATE_REQUIRED'});const preview=await access.preview({revision:cad.revision(),commands:[select('variant-hidden'),update]});assert.deepEqual(preview.parameterReport.counts,{body:1});assert.equal(access.getPreview(preview.previewId).nodes[0].recipe.params.wall,3);await access.apply(preview);assert.equal(cad.snapshot().nodes[0].suppressed,true);assert.equal(cad.snapshot().nodes[0].hidden,true);
  const before=cad.serialize(),body=cad.snapshot().nodes[0],cleared=await access.preview({revision:cad.revision(),commands:[remove]});assert.equal(cleared.parameterReport.metadataOnly,true);assert.deepEqual(cleared.parameterReport.stateChangedIds,['body']);await access.apply(cleared);const after=cad.snapshot();assert.equal(after.projectParameters.parameters.length,0);assert.equal(after.nodes[0].suppressed,false);assert.equal(after.nodes[0].hidden,false);assert.deepEqual(after.nodes[0].brep,body.brep);assert.deepEqual(after.nodes[0].recipe,body.recipe);cad.undo();assert.equal(cad.serialize(),before);
 }finally{cad.dispose();}
});

test('parameter interface rejects mixed or malformed batches and read-only stamp fabrication',async()=>{
 const {cad,access}=await fixture();try{
  const before=cad.serialize();for(const commands of [[put(definition()),{op:'create',type:'box'}],[put(definition()),{op:'drawing',action:'remove',sheetId:'x'}],[update,put(definition())],[update,update],[{op:'parameter',action:'remove',data:{}}],[{op:'parameter',action:'selectVariant'}],[{op:'parameter',action:'unknown'}]])await assert.rejects(access.preview({revision:cad.revision(),commands}));assert.equal(cad.serialize(),before);
  await assert.rejects(previewCadProjectParameterCommands(cad,{revision:'stale',commands:[put(definition()),update]}),{code:'STALE_REVISION'});const forged=definition();forged.applied={version:1,effectSignature:'0'.repeat(64),inputs:[]};await assert.rejects(access.preview({revision:cad.revision(),commands:[put(forged),update]}),/schreibgeschützt/);
  await access.apply(await access.preview({revision:cad.revision(),commands:[put(definition()),update]}));const current=cad.snapshot().projectParameters;assert.doesNotThrow(()=>validateCadProjectParameterCommands([put(current)]));const roundtrip=await access.preview({revision:cad.revision(),commands:[put(current)]});assert.equal(roundtrip.parameterReport.metadataOnly,true);access.discard(roundtrip.previewId);const modified=structuredClone(current);modified.applied.inputs[0].signature='0'.repeat(64);await assert.rejects(access.preview({revision:cad.revision(),commands:[put(modified)]}),/schreibgeschützt/);
  const fakeBase=structuredClone(current);fakeBase.baseStates=[{target:target('body'),hidden:true,suppressed:false}];await assert.rejects(access.preview({revision:cad.revision(),commands:[put(fakeBase)]}),/schreibgeschützt/);
  for(const kind of ['projectParameters','drawings'])assert.throws(()=>validateProgramCommand({op:'tool',engine:'cad',operation:{kind,data:definition()}}),/homogene Vorschau/);
 }finally{cad.dispose();}
});

test('locked targets, invalid expressions, cancelled work and stale Apply preserve confirmed sources',async()=>{
 const {cad,access,control}=await fixture();try{
  const bad=definition();bad.parameters[0].value='floor';await assert.rejects(access.preview({revision:cad.revision(),commands:[put(bad),update]}),/Zyklus|zykl/i);
  const snapshot=cad.snapshot();snapshot.layers[0].locked=true;await cad.open(snapshot);let before=cad.serialize();await assert.rejects(access.preview({revision:cad.revision(),commands:[put(definition()),update]}),/gesperrt/);assert.equal(cad.serialize(),before);cad.undo();before=cad.serialize();
  control.onPost=message=>{if(message.request?.operation?.kind==='projectParameters')queueMicrotask(()=>cad.cancel());};await assert.rejects(access.preview({revision:cad.revision(),commands:[put(definition()),update]}),{name:'AbortError'});control.onPost=undefined;assert.equal(cad.serialize(),before);
  const aborted=new AbortController();aborted.abort();await assert.rejects(cad.previewProjectParameters(definition(),{signal:aborted.signal}),{name:'AbortError'});
  const proposal=await access.preview({revision:cad.revision(),commands:[put(definition()),update]});await cad.execute({kind:'batch',commands:[{op:'update',target:'unrelated',set:{name:'Andere Benennung'}}]});before=cad.serialize();await assert.rejects(access.apply(proposal),{code:'STALE_REVISION'});assert.equal(cad.serialize(),before);
  const discarded=await access.preview({revision:cad.revision(),commands:[put(definition()),update]});access.discard(discarded.previewId);await assert.rejects(access.apply(discarded),{code:'UNKNOWN_PREVIEW'});
 }finally{cad.dispose();}
});

test('bounded parameter summaries disclose totals, pages and stale targets without model geometry',async()=>{
 const {cad}=await fixture();try{
  const project=cad.snapshot(),data=createCadProjectParameters();data.parameters=Array.from({length:100},(_,i)=>({id:'p-'+i,name:'p'+i,value:i+1}));data.bindings=Array.from({length:500},(_,i)=>({id:'b-'+i,parameterId:'p-'+i%100,target:target(('missing-'+i+'-').padEnd(200,'x')),field:'size.0'}));data.variants=Array.from({length:32},(_,i)=>({id:'v-'+i,name:'Variante '+i,values:data.parameters.map(p=>({parameterId:p.id,value:2})),states:data.bindings.slice(0,500).map(b=>({target:b.target,hidden:true,suppressed:false}))}));project.projectParameters=data;const text=JSON.stringify(project),summary=cadProjectParametersSummary(project);assert.equal(summary.parameterCount,100);assert.equal(summary.bindingCount,500);assert.equal(summary.variantCount,32);assert.equal(summary.problemCount,500);assert.equal(summary.truncated,true);assert.ok(summary.bindings.length<=200);assert.ok(summary.problems.length<=32);assert.ok(Buffer.byteLength(JSON.stringify(summary))<=128000);assert.doesNotMatch(JSON.stringify(summary),/"brep"|"transform"/);assert.equal(JSON.stringify(project),text);
  const page=cadProjectParametersSummary(project,{parameterOffset:95,parameterLimit:5,bindingOffset:490,bindingLimit:10,variantLimit:1});assert.equal(page.parameters[0].id,'p-95');assert.equal(page.bindings[0].id,'b-490');assert.deepEqual(page.pages.parameters,{offset:95,limit:5,total:100,returned:5});assert.equal(page.truncated,true);for(const options of [{limit:10},{parameterLimit:101},{bindingOffset:-1},{variantLimit:0}])assert.throws(()=>cadProjectParametersSummary(project,options));
  project.nodes=Array.from({length:12},(_,i)=>({...structuredClone(project.nodes[0]),id:'root-'+i}));delete project.projectParameters;const catalog=cadProjectParameterCatalogSummary(project);assert.equal(catalog.targetCount,12);assert.equal(catalog.targets.length,8);assert.equal(catalog.truncated,true);assert.ok(catalog.targets[0].fields.some(f=>f.field==='params.wall'&&f.bindable&&f.value===1));assert.ok(Buffer.byteLength(JSON.stringify(catalog))<=64000);assert.doesNotMatch(JSON.stringify(catalog),/"brep"/);assert.throws(()=>cadProjectParameterCatalogSummary(project,{path:'C:/private'}));
 }finally{cad.dispose();}
});

test('scene, analysis and sandbox read-only parameter/catalog queries share revision and schedule no CAD jobs',async()=>{
 const {cad,access,posts}=await fixture();try{
  await access.apply(await access.preview({revision:cad.revision(),commands:[put(definition()),update]}));const before=cad.serialize(),undo=cad.state().undo;posts.length=0;
  const report=await access.analyze([{id:'parameters',engine:'app',kind:'projectParameters',options:{bindingLimit:2}},{id:'catalog',engine:'app',kind:'projectParameterCatalog',options:{targets:[target('body')]}}]);assert.equal(posts.length,0);assert.equal(report.revision,cad.revision());assert.equal(report.results[0].value.parameterCount,3);assert.equal(report.results[0].value.bindings.length,2);assert.ok(report.results[1].value.targets[0].fields.some(f=>f.field==='params.wall'));
  const scene=await access.sceneForAI();assert.equal(scene.projectParameters.parameterCount,3);assert.equal(scene.projectParameterCatalog.targets[0].target.rootId,'body');assert.equal(nativeEdits(posts).length,0);
  const script=await cad.preview({kind:'batch',commands:[{op:'script',code:'const p=await api.query({engine:"app",kind:"projectParameters",options:{parameterLimit:2}});const c=await api.query({engine:"app",kind:"projectParameterCatalog",options:{targets:[{rootId:"body",path:[]}]}});return {count:p.parameterCount,first:p.parameters[0].name,field:c.targets[0].fields.find(f=>f.field==="params.wall").value};'}]});const result=script.report.meshOperations.find(r=>r.tool==='script').result;assert.deepEqual(structuredClone(result),{count:3,first:'wall',field:2});cad.discard(script.previewId);assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,undo);
  const aborted=new AbortController();aborted.abort();await assert.rejects(queryProgramResources({project:cad.readSnapshot(),kind:'projectParameters',signal:aborted.signal}),{name:'AbortError'});
 }finally{cad.dispose();}
});

test('all local model and drawing exports reject stale bound results while unrelated roots remain exportable',async()=>{
 const {cad,access}=await fixture();try{
  await access.apply(await access.preview({revision:cad.revision(),commands:[put(definition()),update]}));const sheet=createCadDrawingSheet({id:'sheet',sourceIds:['body']});cad.apply(await previewCadDrawingCommands(cad,{revision:cad.revision(),commands:[{op:'drawing',action:'put',sheet},{op:'drawing',action:'update',sheetId:'sheet'}]}));await cad.execute({kind:'batch',commands:[{op:'update',target:'body',set:{size:[45,20,12]}}]});const before=cad.serialize();
  for(const args of [{format:'step',ids:['body']},{format:'stl',ids:['body']},{format:'svg',ids:['body']},{format:'drawing-svg',sheetId:'sheet'},{format:'drawing-dxf',sheetId:'sheet'},{format:'drawing-pdf',sheetId:'sheet'}])await assert.rejects(access.export(args),{code:'PARAMETERS_UPDATE_REQUIRED'});assert.equal(cad.serialize(),before);assert.equal((await access.export({format:'step',ids:['unrelated']})).mimeType,'application/step');await access.apply(await access.preview({revision:cad.revision(),commands:[update]}));assert.equal(cadProjectParameterProblems(cad.snapshot()).length,0);assert.equal((await access.export({format:'step',ids:['body']})).mimeType,'application/step');
 }finally{cad.dispose();}
});

test('published local AI schemas include strict parameter commands, read-only queries and project format13',()=>{
 const context=cadAIContext(),openapi=JSON.parse(readFileSync(new URL('../ai/OfflineCAD-KI-OpenAPI.json',import.meta.url)));assert.equal(context.projectVersion,24);assert.ok(context.supportedProjectVersions.includes(13));assert.deepEqual(context.commandSchema.properties.commands.items.oneOf.filter(s=>s.properties.op.const==='parameter'),CAD_PROJECT_PARAMETER_COMMAND_SCHEMAS);for(const kind of ['projectParameters','projectParameterCatalog']){assert.ok(context.programTools.queries.app.includes(kind));assert.ok(context.analysisContract.queries.app.includes(kind));}assert.deepEqual(openapi.paths['/v1/preview'].post.requestBody.content['application/json'].schema,context.requestSchema);assert.match(context.projectParametersContract,/final explicit update/);assert.match(context.projectParametersContract,/read-only internal/);
});
