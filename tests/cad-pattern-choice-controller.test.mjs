import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {createCadController} from '../src/cad-controller.js';
import {cadAIReferenceState} from '../src/cad-ai-feature-references.js';
const target=rootId=>({rootId,path:[]});
const factory=()=>{const w=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),adapter={postMessage:value=>w.postMessage(value),terminate:()=>w.terminate()};w.on('message',data=>adapter.onmessage?.({data}));w.on('error',error=>adapter.onerror?.(error));return adapter;};
async function fixture(){
 const cad=createCadController({createWorker:factory});await cad.execute({kind:'create',recipe:{type:'box',size:[10,8,4]},options:{id:'source'}});await cad.execute({kind:'linkedPattern',pattern:{version:1,id:'pattern',sourceId:'source',kind:'line',count:2,step:[20,0,0],instances:[],excluded:[]}});const copy=cad.snapshot().linkedPatterns.patterns[0].instances[0].id;
 const reference=(await cad.query('featureReference',{action:'pick',kind:'face',ids:[copy],ray:{origin:[20,0,30],direction:[0,0,-1]},id:'face',name:'Chosen copied face'})).reference;cad.apply(await cad.previewFeatureReferences({version:1,items:[reference]}));const operation={kind:'linkedPattern',pattern:{...cad.snapshot().linkedPatterns.patterns[0],step:[30,0,0]}};return {cad,copy,operation};
}
test('choice draft queries final copied geometry while no draft identity can enter model history',async()=>{
 const {cad,copy,operation}=await fixture();try{
  const before=cad.serialize(),depth=cad.state().undo;await assert.rejects(()=>cad.preview(operation),{code:'PATTERN_CONSUMER_REASSIGN_REQUIRED'});
  const prepared=await cad.preparePatternConsumerChoices(operation);assert(prepared.draftId);assert.equal(prepared.previewId,undefined);assert.equal(prepared.consumerChoices.partial,false);assert(prepared.consumerChoices.unresolvedReferences.some(reference=>reference.id==='face'&&reference.requiresAssignment));assert(prepared.display.meshes.some(mesh=>(mesh.rootId??mesh.id)===copy));assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,depth);assert.throws(()=>cad.apply({previewId:prepared.draftId,revision:cad.revision()}));
  const ray={origin:[30,0,30],direction:[0,0,-1]},choice=await cad.queryPatternConsumerChoices(prepared.draftId,'featureReference',{action:'pick',kind:'face',ids:[copy],ray,id:'face',name:'Chosen copied face'});assert.equal(choice.reference.target.rootId,copy);assert.equal(cad.serialize(),before);
  await assert.rejects(()=>cad.queryPatternConsumerChoices(prepared.draftId,'featureReference',{action:'pick',kind:'face',ray,id:copy}),{code:'PATTERN_CHOICE_BLOCKED'});await assert.rejects(()=>cad.queryPatternConsumerChoices(prepared.draftId,'featureReference',{action:'edges',target:{rootId:'missing',path:[]},name:copy}),{code:'PATTERN_CHOICE_BLOCKED'});
  prepared.project.nodes.find(node=>node.id===copy).transform[12]=900;const again=await cad.queryPatternConsumerChoices(prepared.draftId,'featureReference',{action:'pick',kind:'face',ids:[copy],ray,id:'face'});assert.equal(again.reference.target.rootId,copy);await assert.rejects(()=>cad.queryPatternConsumerChoices(prepared.draftId,'rayPick',{ids:[copy],ray}),{code:'PATTERN_CHOICE_INVALID'});
  const final=await cad.preview({...operation,consumerBindings:{referenceBindings:{features:[{id:'face',target:target(copy),ray}]}}});assert.equal(cadAIReferenceState(final.project,final.project.featureReferences.items[0]).status,'current');cad.apply(final);assert.equal(cad.state().undo,depth+1);await assert.rejects(()=>cad.queryPatternConsumerChoices(prepared.draftId,'featureReference',{action:'edges',target:target(copy)}),{code:'STALE_REVISION'});cad.undo();assert.equal(cad.serialize(),before);
 }finally{cad.dispose();}
});
test('discard and cancellation invalidate choice queries without discarding an older valid preview',async()=>{
 const {cad,copy,operation}=await fixture();try{
  const before=cad.serialize(),old=await cad.preview({kind:'create',recipe:{type:'box',size:[2,2,2]},options:{id:'independent-old-preview'}});
  const first=await cad.preparePatternConsumerChoices(operation);assert.equal(cad.discardPatternConsumerChoices(first.draftId),true);await assert.rejects(()=>cad.queryPatternConsumerChoices(first.draftId,'featureReference',{action:'edges',target:target(copy)}),{code:'PATTERN_CHOICE_INVALID'});
  const pending=cad.preparePatternConsumerChoices(operation);cad.cancel();await assert.rejects(pending);assert.equal(cad.serialize(),before);cad.apply(old);cad.undo();assert.equal(cad.serialize(),before);
 }finally{cad.dispose();}
});
