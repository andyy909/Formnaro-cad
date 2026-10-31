import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import loader from '../cad-kernel-build/runtime/formnaro_cad.js';
import {createCadService} from '../src/cad-service.js';
import {createCadProject,cadProjectSnapshot} from '../src/cad-project.js';
import {createCadTransactions} from '../src/cad-transactions.js';
import {createCadToolsNative} from '../src/cad-tools-native.js';
import {stampCadProjectParameters,cadProjectParameterProblems} from '../src/cad-project-parameters-data.js';
import {updateCadProjectParameters} from '../src/cad-project-parameters-native.js';
import {cadEditFormRecipe} from '../src/cad-form-controls.js';
import {createCadController} from '../src/cad-controller.js';
const oc=await loader({print:()=>{},printErr:()=>{}});
async function fixture(service,{pattern=false}={}){
 const store=createCadTransactions({initial:createCadProject({nodes:[service.nativeNode({type:'box',size:[40,20,8]},{id:'stock'})]}),build:(p,c)=>service.rebuild(p,{baseline:c.baseline})}),tools=createCadToolsNative({oc,service,transactions:store});
 for(const [id,resultId,x]of [['stock','inner',-8],['inner','outer',8]])store.apply(await tools.previewDrill({id,resultId,associative:true,diameter:4,reference:{ray:{origin:[x,0,30],direction:[0,0,-1]}},revision:store.revision()}));
 if(pattern)store.apply(await tools.previewEditDrill({id:'outer',patch:{pattern:{version:1,kind:'line',count:2,step:[8,0],skip:[]}},revision:store.revision()}));
 const project=store.snapshot();project.projectParameters=stampCadProjectParameters(project,{version:1,parameters:[{id:'inside',name:'inside',value:4},{id:'outside',name:'outside',value:pattern?2:4}],bindings:[{id:'outer-bound',parameterId:'outside',target:{rootId:'outer',path:[]},field:pattern?'drill.pattern.count':'drill.diameter'},{id:'inner-bound',parameterId:'inside',target:{rootId:'outer',path:['inner']},field:'drill.diameter'}],variants:[{id:'large',name:'Larger inner bore',values:[{parameterId:'inside',value:6}],states:[]}],activeVariantId:null});return cadProjectSnapshot(project);
}
for(const pattern of [false,true])test('unchanged outer '+(pattern?'pattern':'diameter')+' binding retains required ancestor rebuild after an inner diameter change',async()=>{
 const service=createCadService({oc});try{const before=await fixture(service,{pattern}),editRecipe=(n,patch)=>cadEditFormRecipe(n,patch,{oc});service.resetConstructionState();const result=await updateCadProjectParameters(before,before.projectParameters,{service,editRecipe,variantId:'large'}),expected=6400-(pattern?136:104)*Math.PI;assert(Math.abs(result.project.nodes[0].stats.volume-expected)<1e-6);assert.notEqual(result.project.nodes[0].brep.data,before.nodes[0].brep.data);assert.deepEqual(cadProjectParameterProblems(result.project),[]);assert.equal(result.report.counts.inner,1);assert.equal(result.report.counts.outer,1);assert.deepEqual((await service.rebuild(result.project)).nodes,result.project.nodes);const restored=await updateCadProjectParameters(result.project,result.project.projectParameters,{service,editRecipe,variantId:null});assert(Math.abs(restored.project.nodes[0].stats.volume-before.nodes[0].stats.volume)<1e-6);assert.deepEqual(cadProjectParameterProblems(restored.project),[]);}finally{service.dispose();}
});
function createWorker(){const worker=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),adapter={onmessage:null,onerror:null,postMessage:value=>worker.postMessage(value),terminate:()=>worker.terminate()};worker.on('message',data=>adapter.onmessage?.({data}));worker.on('error',error=>adapter.onerror?.(error));return adapter;}
test('actual controller variant stages, applies, exports and reopens both bound bores with exact Undo/Redo',async()=>{
 const service=createCadService({oc});let cad;try{const project=await fixture(service);cad=createCadController({initial:project,createWorker});const before=cad.serialize(),proposal=await cad.previewProjectParameters(project.projectParameters,{variantId:'large'}),expected=6400-104*Math.PI;assert.equal(cad.serialize(),before);assert(Math.abs(proposal.project.nodes[0].stats.volume-expected)<1e-6);assert.deepEqual(cadProjectParameterProblems(proposal.project),[]);cad.apply(proposal);assert.equal(cad.state().undo,1);const after=cad.serialize();cad.undo();assert.equal(cad.serialize(),before);cad.redo();assert.equal(cad.serialize(),after);const exported=await cad.exportModel({format:'step'}),readback=service.stepNode(exported.data);assert(Math.abs(readback.stats.volume-expected)<1e-6);await cad.open(after);assert.equal(cad.serialize(),after);assert.deepEqual(cadProjectParameterProblems(cad.snapshot()),[]);}finally{cad?.dispose();service.dispose();}
});
