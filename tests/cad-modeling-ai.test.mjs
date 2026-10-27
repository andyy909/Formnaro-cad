import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import vm from 'node:vm';
import {cadAIContext} from '../src/cad-ai-context.js';
import {COMMAND_SCHEMA} from '../src/command-schema.js';
import {AI_PROGRAM_TOOLS,validateProgramCommand,resolveProgramAliases} from '../src/cad-ai-program.js';
import {AI_ANALYSIS_QUERIES} from '../src/cad-ai-analysis.js';
import {createCadController} from '../src/cad-controller.js';

const factory=file=>()=>{const worker=new Worker(new URL(file,import.meta.url)),adapter={postMessage:value=>worker.postMessage(value),terminate:()=>worker.terminate()};worker.on('message',data=>adapter.onmessage?.({data}));worker.on('error',error=>adapter.onerror?.(error));return adapter;};
const runScript=async({code,call})=>{const context=vm.createContext({api:Object.freeze({model:()=>call('model'),query:value=>call('query',structuredClone(value)),run:value=>call('run',structuredClone(value))})});return await vm.runInContext('(async()=>{'+code+'})()',context,{timeout:1000});};
const fixture=()=>createCadController({createWorker:factory('./fixtures/cad-node-worker.mjs'),createMeshWorker:factory('./fixtures/mesh-engine-node-worker.mjs'),runScript});
const batch=commands=>({kind:'batch',commands}),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-4,`${a} != ${b}`);

test('AI schema publishes bounded root-only modeling and editing while preserving the existing API',()=>{
 const context=cadAIContext(),schemas=context.commandSchema.properties.commands.items.oneOf,find=op=>schemas.find(schema=>schema.properties.op.const===op);
 assert.equal(context.apiVersion,1);assert.equal(context.projectVersion,24);assert.deepEqual(context.supportedProjectVersions,[5,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24]);
 for(const op of ['modeling','editModeling','profileModeling'])assert.ok(find(op),op);
 const create=find('modeling'),edit=find('editModeling'),profiles=find('profileModeling');assert.equal(create.additionalProperties,false);assert.equal(create.properties.target.oneOf[1].properties.path.maxItems,0);
 assert.deepEqual(create.properties.operation.oneOf.map(schema=>schema.properties.kind.const),['face-offset','shell']);assert.deepEqual(edit.properties.operation.oneOf.map(schema=>schema.properties.kind.const),['face-offset','shell','loft','sweep']);
 const offset=create.properties.operation.oneOf[0].properties.offset.oneOf;assert.equal(offset[0].maximum,-.01);assert.equal(offset[1].minimum,.01);
 const faces=create.properties.operation.oneOf[1].properties.faceIndices;assert.equal(faces.maxItems,8);assert.equal(faces.uniqueItems,true);assert.equal(profiles.oneOf[0].properties.targets.minItems,2);assert.equal(profiles.oneOf[0].properties.targets.maxItems,8);assert.equal(profiles.oneOf[1].properties.targets.maxItems,1);assert.ok(profiles.oneOf[1].required.includes('path'));
 assert.ok(COMMAND_SCHEMA.properties.commands.items.oneOf.some(schema=>schema.properties.op.const==='transform'));
 assert.ok(!COMMAND_SCHEMA.properties.commands.items.oneOf.some(schema=>schema.properties.op.const==='modeling'));
});

test('AI documentation exposes independent face copying without broadening permissions or analysis rounds',()=>{
 const context=cadAIContext();assert.ok(AI_PROGRAM_TOOLS.queries.cad.includes('faceSketch'));assert.ok(!AI_ANALYSIS_QUERIES.cad.includes('faceSketch'));assert.deepEqual(context.nativeModelingContract,AI_PROGRAM_TOOLS.nativeModeling);
 assert.match(context.faceSketchContract,/independent/);assert.match(context.faceSketchContract,/right-handed/);assert.match(context.nativeModelingContract.editing,/guarded retained construction source/);assert.match(context.nativeModelingContract.editing,/canonical/);assert.match(context.nativeModelingContract.performance,/explicit preview/);
 const command={op:'tool',engine:'cad',operation:{kind:'batch',commands:[{op:'modeling',target:'$part',operation:{kind:'shell',faceIndices:[6],thickness:2}}]}};assert.doesNotThrow(()=>validateProgramCommand(command));assert.equal(resolveProgramAliases(command,{part:'actual-root'}).operation.commands[0].target,'actual-root');
 assert.throws(()=>validateProgramCommand({...command,path:'C:/unrelated'}));assert.throws(()=>validateProgramCommand({...command,engine:'desktop'}));assert.match(AI_PROGRAM_TOOLS.boundary,/unrelated files/);
});

test('A local AI script measures a face, copies its sketch and shells the original in one atomic proposal',async()=>{
 const cad=fixture();try{
  const created=await cad.execute(batch([{op:'tool',engine:'cad',as:'body',operation:{kind:'create',recipe:{type:'box',size:[20,30,40]},options:{name:'Body'}}}])),id=created.aliases.body,before=cad.serialize(),undo=cad.state().undo;
  assert.equal(typeof id,'string');const proposal=await cad.preview(batch([{op:'script',code:`
   const id=${JSON.stringify(id)};
   const hit=await api.query({engine:'cad',kind:'rayPick',options:{ids:[id],ray:{origin:[0,0,100],direction:[0,0,-1],far:1000}}});
   const copy=await api.query({engine:'cad',kind:'faceSketch',options:{nodeId:id,faceIndex:hit.faceIndex}});
   await api.run({op:'sketch',sketch:copy.sketch,frame:copy.frame,as:'copy'});
   await api.run({op:'modeling',target:id,operation:{kind:'shell',faceIndices:[hit.faceIndex],thickness:2},as:'shell'});
   return {area:copy.area,faceIndex:copy.faceIndex};
  `}]));
  assert.equal(cad.serialize(),before);assert.equal(proposal.project.nodes.length,2);const shell=proposal.project.nodes.find(node=>node.id===id);assert.equal(shell.source,'modeling');assert.equal(shell.modeling.kind,'shell');near(shell.stats.volume,20*30*40-16*26*38);assert.ok(proposal.project.nodes.find(node=>node.id===proposal.aliases.copy).recipe.sketch.version===2);
  cad.apply(proposal);assert.equal(cad.state().undo,undo+1);cad.undo();assert.equal(cad.serialize(),before);
 }finally{cad.dispose();}
});

test('The generic native batch edits stored modeling parameters and rejects changing the tool kind atomically',async()=>{
 const cad=fixture();try{
  const created=await cad.execute(batch([{op:'tool',engine:'cad',as:'body',operation:{kind:'create',recipe:{type:'box',size:[20,30,40]},options:{name:'Body'}}}])),id=created.aliases.body,hit=await cad.query('rayPick',{ids:[id],ray:{origin:[0,0,100],direction:[0,0,-1],far:1000}});
  await cad.execute(batch([{op:'modeling',target:id,operation:{kind:'face-offset',faceIndex:hit.faceIndex,offset:2}}]));const before=cad.serialize(),original=structuredClone(cad.snapshot().nodes[0].children[0]);
  const proposal=await cad.preview(batch([{op:'tool',engine:'cad',operation:{kind:'batch',commands:[{op:'editModeling',target:id,operation:{kind:'face-offset',faceIndex:hit.faceIndex,offset:5}}]}}]));near(proposal.project.nodes[0].stats.volume,20*30*45);assert.deepEqual(proposal.project.nodes[0].children[0],original);assert.equal(cad.serialize(),before);
  await assert.rejects(cad.preview(batch([{op:'editModeling',target:id,operation:{kind:'shell',faceIndices:[hit.faceIndex],thickness:2}}])),/dasselbe/);assert.equal(cad.serialize(),before);
 }finally{cad.dispose();}
});
