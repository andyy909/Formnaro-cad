import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import loader from '../cad-kernel-build/runtime/formnaro_cad.js';
import {createCadService} from '../src/cad-service.js';
import {createCadProject,serializeCadProject,cadProjectRevision} from '../src/cad-project.js';
import {createCadDrawingNative,cadDrawingViewFrame} from '../src/cad-drawing-native.js';
import {cadIdentity} from '../src/cad-affine.js';
import {cadSourceGeometryDigest} from '../src/cad-geometry-digest.js';
import {createCadWorkerClient} from '../src/cad-worker-client.js';
import {buildCadContours} from '../src/cad-recipes.js';
import {validateCadSolid,writeCadBrep} from '../src/cad-native-kernel.js';
import {validateCadDrawingProjection} from '../src/cad-drawing-data.js';
const oc=await loader({print:()=>{},printErr:()=>{}});
const near=(a,b,tolerance=1e-6)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
const size=projection=>projection.bounds.max.map((v,k)=>v-projection.bounds.min[k]);
function fromNativeShape(shape,id){const checked=validateCadSolid(oc,shape);return {id,kind:'cad',name:id,source:'step',solid:true,transform:cadIdentity(),brep:{format:'OpenCascade-BRep',data:writeCadBrep(oc,shape),triangulation:false},stats:{bounds:{min:checked.bounds.min,max:checked.bounds.max},volume:checked.volume,solids:checked.solids}};}

async function bored(service){
 const body=service.nativeNode({type:'cylinder',size:[20,20,20]},{id:'body'}),hole=service.nativeNode({type:'cylinder',size:[6,6,32]},{id:'hole',solid:false});
 return service.rebuild(createCadProject({nodes:[{id:'group',kind:'cad',name:'Bore',source:'group',solid:true,transform:cadIdentity(),operation:'union',children:[body,hole],brep:structuredClone(body.brep),stats:structuredClone(body.stats)}]}));
}

test('drawing orthographic frames keep model millimetres and native sources exactly unchanged',()=>{
 const service=createCadService({oc});try{
  const project=createCadProject({nodes:[service.nativeNode({type:'box',size:[20,30,40]},{id:'body'})]}),before=serializeCadProject(project),query=createCadDrawingNative({oc,service});
  for(const [view,expected] of [['front',[20,40]],['side',[30,40]],['top',[20,30]]]){
   const result=query(project,{ids:['body'],view});size(result).forEach((v,k)=>near(v,expected[k]));assert.equal(result.approximation,'exact-native-curves');assert.equal(result.curves.length,4,'coincident hidden rear edges must not mask visible silhouette');assert.ok(result.curves.every(c=>c.kind==='line'&&!c.hidden));assert.deepEqual(result.sourceSignatures,[{id:'body',signature:cadSourceGeometryDigest(project.nodes[0])}]);assert.deepEqual(result,query(project,{ids:['body'],view}));
  }
  assert.equal(serializeCadProject(project),before);
 }finally{service.dispose();}
});

test('native technical drawing preserves exact bore circles and true cut geometry',async()=>{
 const service=createCadService({oc});try{
  const project=await bored(service),before=serializeCadProject(project),query=createCadDrawingNative({oc,service}),top=query(project,{ids:['group'],view:'top'}),circles=top.curves.filter(c=>c.kind==='circle');
  assert.ok(circles.some(c=>Math.abs(c.radius-10)<1e-8));assert.ok(circles.some(c=>Math.abs(c.radius-3)<1e-8));
  const cut=query(project,{ids:['group'],view:'section',section:{axis:2,offset:0}});assert.ok(cut.curves.some(c=>c.kind==='circle'&&Math.abs(c.radius-3)<1e-8));size(cut).forEach(v=>near(v,20));
  const front=query(project,{ids:['group'],view:'front'});assert.ok(front.curves.some(c=>c.hidden),'real interior hidden bore edges must remain');for(const c of front.curves.filter(c=>c.hidden))assert.ok(!front.curves.some(v=>!v.hidden&&JSON.stringify({...v,id:null,hidden:null})===JSON.stringify({...c,id:null,hidden:null})),'hidden duplicate masks visible edge');
  const sideCut=query(project,{ids:['group'],view:'section',section:{axis:1,offset:0}});assert.ok(sideCut.curves.filter(c=>c.kind==='line').length>=6);size(sideCut).forEach(v=>near(v,20));assert.equal(serializeCadProject(project),before);
 }finally{service.dispose();}
});

test('mirrored and sheared native parts preserve full projection and stable geometry references',()=>{
 const service=createCadService({oc});try{
  const node=service.nativeNode({type:'cylinder',size:[20,20,20]},{id:'body',transform:[-2,.2,0,0,.5,1,0,0,0,0,1,0,5,3,0,1]}),project=createCadProject({nodes:[node]}),before=serializeCadProject(project),query=createCadDrawingNative({oc,service}),result=query(project,{ids:['body'],view:'top'});
  near(size(result)[0],2*Math.hypot(20,5),3e-6);near(size(result)[1],2*Math.hypot(2,10),3e-6);assert.ok(result.curves.some(c=>c.kind==='bezier'&&c.weights.some(w=>Math.abs(w-1)>1e-8)));assert.ok(result.curves.every(c=>c.kind!=='polyline'));assert.equal(new Set(result.curves.map(c=>c.id)).size,result.curves.length);assert.deepEqual(validateCadDrawingProjection(result),result);
  const recolored=structuredClone(project);recolored.nodes[0].color='#ff0000';recolored.nodes[0].name='Other';assert.deepEqual(query(recolored,{ids:['body'],view:'top'}),result);
  const shifted=structuredClone(project);shifted.nodes[0].transform[12]+=1;const changed=query(shifted,{ids:['body'],view:'top'});assert.notEqual(changed.sourceSignatures[0].signature,result.sourceSignatures[0].signature);assert.ok(changed.curves.every(c=>!result.curves.some(old=>old.id===c.id)));assert.equal(serializeCadProject(project),before);
 }finally{service.dispose();}
});

test('exact trimmed arcs, mirrored traversal and ellipses share the strict export DTO',()=>{
 const service=createCadService({oc}),query=createCadDrawingNative({oc,service});
 const arcShape=buildCadContours(oc,{height:4,contours:[{outer:[{kind:'arc',start:[5,0],through:[0,5],end:[-5,0]},{kind:'line',start:[-5,0],end:[5,0]}]}]}),ellipseShape=buildCadContours(oc,{height:4,contours:[{outer:[{kind:'ellipse',center:[3,4],rx:8,ry:3,rotation:.3,startAngle:0,endAngle:2*Math.PI}]}]});
 try{
  for(const mirror of [1,-1]){
   const arcNode=fromNativeShape(arcShape,'arc');arcNode.transform[0]=mirror;const result=query(createCadProject({nodes:[arcNode]}),{ids:['arc'],view:'top'}),arcs=result.curves.filter(c=>c.kind==='arc');assert.ok(arcs.length);assert.deepEqual(validateCadDrawingProjection(result),result);
   for(const arc of arcs){near(arc.radius,5);const middle=(arc.startAngle+arc.endAngle)/2;assert.ok(arc.center[1]+arc.radius*Math.sin(middle)>=-1e-7);assert.equal(arc.clockwise,arc.endAngle<arc.startAngle);}
   const ellipseNode=fromNativeShape(ellipseShape,'ellipse');ellipseNode.transform[0]=mirror;const ellipses=query(createCadProject({nodes:[ellipseNode]}),{ids:['ellipse'],view:'top'});assert.ok(ellipses.curves.some(c=>c.kind==='ellipse'));assert.deepEqual(validateCadDrawingProjection(ellipses),ellipses);near(size(ellipses)[0],2*Math.hypot(8*Math.cos(.3),3*Math.sin(.3)),1e-6);
  }
 }finally{ellipseShape.delete();arcShape.delete();service.dispose();}
});

test('drawing query rejects invalid scope, unsupported views and empty cuts without a partial result',()=>{
 const service=createCadService({oc});try{
  const project=createCadProject({nodes:[service.nativeNode({type:'box',size:[20,30,40]},{id:'body'})]}),before=serializeCadProject(project),query=createCadDrawingNative({oc,service});
  for(const options of [{ids:[],view:'top'},{ids:['body','body'],view:'top'},{ids:['missing'],view:'top'},{ids:['body'],view:'camera'},{ids:['body'],view:'section',section:{axis:2,offset:NaN}},{ids:['body'],view:'top',section:{axis:2,offset:0}},{ids:['body'],view:'top',tolerance:1},{ids:['body'],view:'top',script:'x'}])assert.throws(()=>query(project,options));
  const hidden=structuredClone(project);hidden.nodes[0].hidden=true;assert.throws(()=>query(hidden,{ids:['body'],view:'top'}),/sichtbare/);
  // The cut keeps the negative local half-space, so this plane is wholly below
  // the body's minimum along the top-view section normal.
  assert.throws(()=>query(project,{ids:['body'],view:'section',section:{axis:2,offset:-1000}}),/leer/);assert.equal(serializeCadProject(project),before);
  assert.deepEqual(cadDrawingViewFrame('top'),cadIdentity());
 }finally{service.dispose();}
});

test('persistent worker exposes revision-bound drawing query and remains reusable after cancellation',async()=>{
 let project=createCadProject(),workers=0;const client=createCadWorkerClient({confirmed:()=>project,createWorker:()=>{workers++;const native=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),adapter={onmessage:null,onerror:null,postMessage:data=>native.postMessage(data),terminate:()=>native.terminate()};native.on('message',data=>adapter.onmessage?.({data}));native.on('error',error=>adapter.onerror?.(error));return adapter;}});
 try{
  project=(await client.run({job:'create',project,recipe:{type:'cylinder',size:[20,20,20]},options:{id:'body'}},{revision:cadProjectRevision(project)})).project;
  const request=()=>({job:'query',project,query:{kind:'drawingProjection',options:{ids:['body'],view:'top'}}}),revision=cadProjectRevision(project),result=await client.run(request(),{revision});assert.ok(result.curves.some(c=>c.kind==='circle'));assert.equal(workers,1);assert.equal(cadProjectRevision(project),revision);
  await assert.rejects(client.run(request(),{revision:'stale'}),{code:'STALE_REVISION'});
  const abort=new AbortController(),pending=client.run(request(),{revision,signal:abort.signal});abort.abort();await assert.rejects(pending,{name:'AbortError'});const next=await client.run(request(),{revision});assert.deepEqual(next,result);assert.equal(workers,2);
 }finally{client.dispose();}
});
