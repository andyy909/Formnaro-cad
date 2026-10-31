import test from 'node:test';
import assert from 'node:assert/strict';
import loader from '../cad-kernel-build/runtime/formnaro_cad.js';
import {createCadProject,parseCadProject,serializeCadProject} from '../src/cad-project.js';
import {createCadService} from '../src/cad-service.js';
import {createCadCommandRouter} from '../src/cad-command-router.js';
import {createCadTransactions} from '../src/cad-transactions.js';
import {planCadParameterPatterns} from '../src/cad-linked-pattern-update-data.js';
import {updateCadParameterPatterns} from '../src/cad-linked-pattern-update-native.js';
import {cadLinkedPatternProblems} from '../src/cad-linked-pattern-data.js';
import {cadEditFormRecipe} from '../src/cad-form-controls.js';
import {encodeFnpackProject,createFnpackResolver} from '../src/cad-fnpack-data.js';
import {fnpackRequestRoots} from '../src/cad-fnpack-controller.js';

const oc=await loader({print:()=>{},printErr:()=>{}});
async function fixture(service){
 const params={version:1,parameters:[{id:'n',name:'Anzahl',value:3},{id:'d',name:'Abstand',value:20}],bindings:[],variants:[{id:'v',name:'Breiter',values:[{parameterId:'n',value:4},{parameterId:'d',value:30}],states:[]}],activeVariantId:null};
 const initial=await service.rebuild(createCadProject({nodes:[service.nativeNode({type:'box',size:[5,5,5]},{id:'source'}),service.nativeNode({type:'box',size:[2,2,2]},{id:'other'})],projectParameters:params})),router=createCadCommandRouter({oc,service});
 return (await router.run(initial,{kind:'linkedPattern',pattern:{version:1,id:'pattern',sourceId:'source',kind:'line',count:3,step:[20,0,0],excluded:[],instances:[],bindings:[{field:'count',parameterId:'n'},{field:'step.0',parameterId:'d'}]}},{baseline:initial})).project;
}
test('parameter variant updates pattern in one preview, undo and FNPACK',async()=>{
 const service=createCadService({oc});try{
  const initial=await fixture(service),editRecipe=(node,patch)=>cadEditFormRecipe(node,patch,{oc}),store=createCadTransactions({initial,build:async(p,c)=>(await updateCadParameterPatterns(p,c.operation,{oc,service,editRecipe})).project}),data=initial.projectParameters,op={kind:'projectParameters',data,variantId:'v'};
  assert.equal(planCadParameterPatterns(initial,data,{variantId:'v'}).patterns.length,1);const before=store.snapshot(),proposal=await store.preview({project:before,revision:store.revision(),operation:op});assert.deepEqual(store.snapshot(),before);assert.equal(proposal.project.linkedPatterns.patterns[0].count,4);assert.equal(proposal.project.linkedPatterns.patterns[0].step[0],30);assert.equal(proposal.project.nodes.length,5);assert.deepEqual(cadLinkedPatternProblems(proposal.project,proposal.project.linkedPatterns.patterns[0]),[]);
  store.apply(proposal);const after=store.snapshot();assert.deepEqual(after.nodes.find(n=>n.id==='other'),before.nodes.find(n=>n.id==='other'));store.undo();assert.deepEqual(store.snapshot(),before);store.redo();assert.deepEqual(store.snapshot(),after);assert.deepEqual(parseCadProject(serializeCadProject(after)),after);
  const packed=encodeFnpackProject(initial),roots=fnpackRequestRoots(packed.project,{job:'command',operation:op});assert.ok(roots.includes('source'));for(const i of initial.linkedPatterns.patterns[0].instances)assert.ok(roots.includes(i.id));assert.ok(!roots.includes('other'));
  const blocks=new Map(packed.blocks.map(b=>[b.sha256,b.bytes])),hydrated=await createFnpackResolver({readBlock:async key=>blocks.get(key)}).hydrate(packed.project,roots),out=await updateCadParameterPatterns(hydrated,op,{oc,service,editRecipe});assert.deepEqual(cadLinkedPatternProblems(out.project,out.project.linkedPatterns.patterns[0]),[]);assert.equal(out.project.linkedPatterns.patterns[0].count,4);
 }finally{service.dispose();}
});
test('modified copy and inherited lock reject atomically',async()=>{
 const service=createCadService({oc});try{const initial=await fixture(service),op={kind:'projectParameters',data:initial.projectParameters,variantId:'v'},editRecipe=(n,p)=>cadEditFormRecipe(n,p,{oc});for(const mode of ['modified','locked']){const draft=structuredClone(initial);if(mode==='modified')draft.nodes.find(n=>n.id===draft.linkedPatterns.patterns[0].instances[0].id).name='User edit';else draft.layers[0].locked=true;const store=createCadTransactions({initial:draft,build:async(p)=>(await updateCadParameterPatterns(p,op,{oc,service,editRecipe})).project}),before=store.snapshot();await assert.rejects(()=>store.preview({project:before,revision:store.revision(),operation:op}));assert.deepEqual(store.snapshot(),before);assert.equal(store.state().undo,0);}}
 finally{service.dispose();}
});
import {Worker} from 'node:worker_threads';
import {createCadController} from '../src/cad-controller.js';
import {stampCadProjectParameters} from '../src/cad-project-parameters-data.js';
function worker(){const w=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),a={postMessage:m=>w.postMessage(m),terminate:()=>w.terminate()};w.on('message',data=>a.onmessage?.({data}));w.on('error',e=>a.onerror?.(e));return a;}
test('real controller and worker update pattern values and source geometry in one accepted preview',async()=>{
 const service=createCadService({oc});try{
  let initial=await fixture(service),data=structuredClone(initial.projectParameters);data.parameters.push({id:'height',name:'Hoehe',value:5});data.bindings.push({id:'height-binding',parameterId:'height',target:{rootId:'source',path:[]},field:'size.2'});data.variants[0].values.push({parameterId:'height',value:8});initial.projectParameters=stampCadProjectParameters(initial,data);
  const cad=createCadController({initial,createWorker:worker});try{
   const before=cad.snapshot(),abort=new AbortController();abort.abort();await assert.rejects(()=>cad.previewProjectParameters(data,{variantId:'v',signal:abort.signal}),{code:'ABORTED'});assert.deepEqual(cad.snapshot(),before);
   const preview=await cad.previewProjectParameters(data,{variantId:'v'});assert.deepEqual(cad.snapshot(),before);const pattern=preview.project.linkedPatterns.patterns[0];assert.equal(pattern.count,4);assert.equal(pattern.step[0],30);assert.deepEqual(cadLinkedPatternProblems(preview.project,pattern),[]);for(const n of preview.project.nodes.filter(n=>n.id==='source'||pattern.instances.some(i=>i.id===n.id)))assert.ok(Math.abs(n.stats.volume* Math.abs(n.transform[0]*n.transform[5]*n.transform[10])-200)<1e-5);
   cad.apply(preview);const after=cad.snapshot();cad.undo();assert.deepEqual(cad.snapshot(),before);cad.redo();assert.deepEqual(cad.snapshot(),after);
  }finally{cad.dispose();}
 }finally{service.dispose();}
});
import {createCadDrawingSheet} from '../src/cad-drawing-data.js';
test('downstream drawing references update with a pattern variant without committing the preview',async()=>{
 const service=createCadService({oc});try{const initial=await fixture(service),copy=initial.linkedPatterns.patterns[0].instances[0].id,sheet=createCadDrawingSheet({id:'drawing',sourceIds:[copy]});initial.drawings={version:1,sheets:[sheet]};const store=createCadTransactions({initial,build:async(p,c)=>(await updateCadParameterPatterns(p,c.operation,{oc,service,editRecipe:(n,x)=>cadEditFormRecipe(n,x,{oc})})).project}),before=store.snapshot(),proposal=await store.preview({project:before,revision:store.revision(),operation:{kind:'projectParameters',data:before.projectParameters,variantId:'v'}});assert(proposal.project.drawings.sheets[0].views.every(view=>view.projection?.curves.length));assert.deepEqual(store.snapshot(),before);assert.equal(store.state().undo,0);}finally{service.dispose();}
});
test('cancelling an in-flight combined preview never publishes the finished result',async()=>{
 const service=createCadService({oc});try{const initial=await fixture(service);let release,started;const ready=new Promise(r=>started=r),gate=new Promise(r=>release=r),store=createCadTransactions({initial,build:async(p,c)=>{started();await gate;return (await updateCadParameterPatterns(p,c.operation,{oc,service,editRecipe:(n,x)=>cadEditFormRecipe(n,x,{oc})})).project;}}),before=store.snapshot(),pending=store.preview({project:before,revision:store.revision(),operation:{kind:'projectParameters',data:before.projectParameters,variantId:'v'}});await ready;assert.equal(store.cancel(),true);release();await assert.rejects(pending,{code:'ABORTED'});assert.deepEqual(store.snapshot(),before);assert.equal(store.state().undo,0);assert.equal(store.state().previews,0);}finally{service.dispose();}
});
test('one scalar updates two independent patterns in one native preview',async()=>{
 const service=createCadService({oc});try{const first=await fixture(service),router=createCadCommandRouter({oc,service});const second=(await router.run(first,{kind:'linkedPattern',pattern:{version:1,id:'second',sourceId:'other',kind:'line',count:3,step:[0,15,0],excluded:[],instances:[],bindings:[{field:'count',parameterId:'n'}]}},{baseline:first})).project,op={kind:'projectParameters',data:second.projectParameters,variantId:'v'},out=await updateCadParameterPatterns(second,op,{oc,service,editRecipe:(n,p)=>cadEditFormRecipe(n,p,{oc})});assert.deepEqual(out.report.updatedPatternIds.sort(),['pattern','second']);for(const p of out.project.linkedPatterns.patterns){assert.equal(p.count,4);assert.deepEqual(cadLinkedPatternProblems(out.project,p),[]);}}
 finally{service.dispose();}
});
test('bound circle radius moves original and copies together under the same preview',async()=>{
 const service=createCadService({oc});try{const data={version:1,parameters:[{id:'r',name:'Radius',value:10}],bindings:[],variants:[{id:'v',name:'Gross',values:[{parameterId:'r',value:20}],states:[]}],activeVariantId:null},initial=await service.rebuild(createCadProject({nodes:[service.nativeNode({type:'box',size:[2,2,2]},{id:'source'})],projectParameters:data})),router=createCadCommandRouter({oc,service}),first=(await router.run(initial,{kind:'linkedPattern',pattern:{version:1,id:'circle',sourceId:'source',kind:'circle',count:4,center:[0,0,0],radius:10,startAngle:0,angle:360,rotateCopies:false,excluded:[],instances:[],bindings:[{field:'radius',parameterId:'r'}]}},{baseline:initial})).project,out=await updateCadParameterPatterns(first,{kind:'projectParameters',data,variantId:'v'},{oc,service,editRecipe:(n,p)=>cadEditFormRecipe(n,p,{oc})});assert.equal(out.project.linkedPatterns.patterns[0].radius,20);for(const n of out.project.nodes){const c=n.stats.bounds.min.map((v,k)=>(v+n.stats.bounds.max[k])/2),x=n.transform[12]+c[0],y=n.transform[13]+c[1];assert.ok(Math.abs(Math.hypot(x,y)-20)<1e-6);}assert.deepEqual(cadLinkedPatternProblems(out.project,out.project.linkedPatterns.patterns[0]),[]);}finally{service.dispose();}
});
