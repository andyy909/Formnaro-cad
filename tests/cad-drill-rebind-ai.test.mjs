import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {createCadController} from '../src/cad-controller.js';
import {createCadAutomationAccess} from '../src/cad-automation-access.js';
import {createCadProjectParameters,cadProjectParameterProblems} from '../src/cad-project-parameters-data.js';
import {cadAIContext} from '../src/cad-ai-context.js';

function factory(file){return ()=>{const worker=new Worker(new URL(file,import.meta.url)),adapter={postMessage:m=>worker.postMessage(m),terminate:()=>worker.terminate()};worker.on('message',m=>adapter.onmessage?.({data:m}));worker.on('error',e=>adapter.onerror?.(e));return adapter;};}
test('local KI reassigns original drill faces through worker preview, explicit apply and one undo',async t=>{
 const cad=createCadController({createWorker:factory('./fixtures/cad-node-worker.mjs'),createMeshWorker:factory('./fixtures/mesh-engine-node-worker.mjs')});t.after(()=>cad.dispose());
 await cad.execute({kind:'create',recipe:{type:'box',size:[40,20,8]},options:{id:'body'}});
 let scene=await cad.describe();const access=createCadAutomationAccess({controller:cad,getScene:()=>scene,refresh:async()=>{scene=await cad.describe();}});
 let proposal=await access.preview({revision:cad.revision(),commands:[{op:'drill',target:'body',reference:{ray:{origin:[0,0,30],direction:[0,0,-1]}},associative:true,kind:'counterbore',headDepth:1}]});await access.apply(proposal);
 const id=cad.snapshot().nodes[0].id,data={...createCadProjectParameters(),parameters:[{id:'height',name:'height',value:8}],bindings:[{id:'b-height',parameterId:'height',target:{rootId:id,path:['body']},field:'size.2'}]};
 await access.apply(await access.preview({revision:cad.revision(),commands:[{op:'parameter',action:'put',data},{op:'parameter',action:'update'}]}));
 const before=cad.serialize(),parameters=cad.snapshot().projectParameters,revision=cad.revision(),depth=cad.state().undo;
 const operation={kind:'tool',name:'previewRebindDrills',options:{id,bindings:[{path:[],reference:{ray:{origin:[0,0,-30],direction:[0,0,1]}}}]}};
 proposal=await access.preview({revision,commands:[{op:'tool',engine:'cad',operation}]});assert.equal(cad.serialize(),before);assert.equal(access.getPreview(proposal.previewId).nodes[0].drill.feature,'box-face-bottom');
 await access.apply(proposal);assert.equal(cad.state().undo,depth+1);assert.equal(cad.snapshot().nodes[0].drill.headDepth,1);assert.deepEqual(cad.snapshot().projectParameters,parameters);assert.deepEqual(cadProjectParameterProblems(cad.snapshot()),[]);cad.undo();assert.equal(cad.serialize(),before);
 await assert.rejects(access.preview({revision:cad.revision(),commands:[{op:'tool',engine:'cad',operation:{...operation,options:{...operation.options,bindings:[{path:[],reference:{faceIndex:1}}]}}}]}));assert.equal(cad.serialize(),before);
 cad.redo();const updated=structuredClone(cad.snapshot().projectParameters);updated.parameters[0].value=12;
 await access.apply(await access.preview({revision:cad.revision(),commands:[{op:'parameter',action:'put',data:updated},{op:'parameter',action:'update'}]}));
 assert.equal(cad.snapshot().nodes[0].drill.feature,'box-face-bottom');assert.ok(Math.abs((cad.snapshot().nodes[0].stats.bounds.max[2]-cad.snapshot().nodes[0].stats.bounds.min[2])-12)<1e-5);assert.deepEqual(cadProjectParameterProblems(cad.snapshot()),[]);
 const context=cadAIContext();assert.ok(context.programTools.nativeTools.includes('previewRebindDrills'));assert.match(context.referenceContract.drill,/original uncut source/);
});
