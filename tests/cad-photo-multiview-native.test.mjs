import test from 'node:test';import assert from 'node:assert/strict';import {Worker} from 'node:worker_threads';
import {createCadController} from '../src/cad-controller.js';
import {createCadProject,cadProjectSnapshot,parseCadProject,serializeCadProject} from '../src/cad-project.js';
import {polygonContains,PHOTO_VIEWS} from '../src/cad-photo-data.js';
import {multiViewFixture} from './photo-multiview-fixtures.mjs';
import {importCadStep} from '../src/cad-step-io.js';
import load from '../cad-kernel-build/runtime/formnaro_cad.js';
const near=(a,b)=>assert(Math.abs(a-b)<1e-5,a+' != '+b),cross=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
function projectedReports({plan,items,geometry}){
 return plan.views.map(v=>{
  const r=items.find(i=>i.reference.imageId===v.imageId).reference,axes=PHOTO_VIEWS[v.view],dot=(a,b)=>a.reduce((n,x,k)=>n+x*b[k],0),map=p=>[(p[0]-v.origin[0])*.1,(v.origin[1]-p[1])*.1],outline=r.outline.map(map),holes=r.holes.map(h=>h.map(map));
  const triangles=geometry.triangles.map(t=>t.map(p=>{const local=p.map((n,k)=>n-plan.placement[k]);return [dot(local,axes.right),dot(local,axes.up)];})).filter(t=>Math.abs(cross(...t))>1e-9);
  const inside=(p,t)=>{const signs=[0,1,2].map(k=>cross(t[k],t[(k+1)%3],p));return signs.every(n=>n>=-1e-9)||signs.every(n=>n<=1e-9);};
  const max=[0,1].map(k=>Math.max(...outline.map(p=>p[k]))),min=[0,1].map(k=>Math.min(...outline.map(p=>p[k])));let union=0,both=0;
  for(let y=0;y<73;y++)for(let x=0;x<97;x++){const p=[min[0]-1+(max[0]-min[0]+2)*(x+.5)/97,min[1]-1+(max[1]-min[1]+2)*(y+.5)/73],a=polygonContains(outline,p)&&!holes.some(h=>polygonContains(h,p)),b=triangles.some(t=>inside(p,t));if(a||b)union++;if(a&&b)both++;}
  const iou=both/union;assert(iou>.995,'Independent projection mismatch '+v.view+' '+iou);return {imageId:v.imageId,view:v.view,registration:'common-origin',matches:iou>.995,iou};
 });
}
function controller(initial){return createCadController({initial,createWorker:()=>{const worker=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),adapter={postMessage:m=>worker.postMessage(m),terminate:()=>worker.terminate()};worker.on('message',data=>adapter.onmessage?.({data}));worker.on('error',e=>adapter.onerror?.(e));return adapter;}});}
test('Real native profiles, three registered silhouettes, shared dimensions, STEP and one Undo preserve an unrelated locked source',async()=>{
 const f=multiViewFixture({stepped:true,holes:true}),cad=controller();
 try{
  await cad.execute({kind:'batch',commands:[{op:'create',type:'box',as:'old',size:[5,7,9],pos:[-50,0,4.5]}]});
  const initial=cad.snapshot();initial.nodes[0].locked=true;initial.photos=f.photos;await cad.open(initial);
  const before=cad.serialize(),old=cad.snapshot().nodes[0],depth=cad.state().undo,preview=await cad.previewPhotoReconstruction(f.plan,{review:projectedReports});
  assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,depth);assert(preview.photoReconstructionReview.passed);assert(preview.photoReconstructionReview.native.passed);assert(preview.photoReconstructionReview.nativeExtras.passed);assert.equal(preview.photoReconstructionReview.nativeExtras.checks.length,1);
  const root=preview.project.nodes.find(n=>n.id===preview.photoReconstructionReport.rootId);near(root.stats.volume,f.expected.volume);assert.equal(root.children.length,3);assert(root.children.every(n=>n.recipe.sketch.version===2));assert.deepEqual(preview.project.nodes[0],old);assert.equal(preview.project.projectParameters.bindings.length,9);
  cad.apply(preview);assert.equal(cad.state().undo,depth+1);const saved=cad.serialize();cad.undo();assert.equal(cad.serialize(),before);cad.redo();assert.equal(cad.serialize(),saved);
  await cad.open(saved);assert.deepEqual(cad.snapshot().nodes[0],old);const id=root.id;
  const step=await cad.exportModel({format:'step',ids:[id]}),oc=await load({print:()=>{},printErr:()=>{}});near(importCadStep(oc,step.data).stats.volume,f.expected.volume);
  const params=cad.snapshot().projectParameters;for(const [axis,amount]of [['x',50],['y',25],['z',35]])params.parameters.find(p=>p.name.endsWith('_'+axis)).value=amount;const resized=await cad.previewProjectParameters(params);cad.apply(resized);
  const changed=(await cad.describe()).objects.find(n=>n.id===id&&!n.target.path.length);near(changed.measures.worldAxisSize[0],50);near(changed.measures.worldAxisSize[1],25);near(changed.measures.worldAxisSize[2],35);near(changed.volume,35546.875);assert.deepEqual(cad.snapshot().nodes[0],old);
 }finally{cad.dispose();}
});
test('Native failures, incomplete/missing view review, stale references and cancellation never authorize Apply',async()=>{
 const f=multiViewFixture(),cad=controller(cadProjectSnapshot({...createCadProject(),photos:f.photos}));try{
  const before=cad.serialize();const unchecked=await cad.preview({kind:'photoReconstruction',plan:f.plan});delete unchecked.photoReconstructionReport;assert.throws(()=>cad.apply(unchecked),{code:'PHOTO_RECONSTRUCTION_UNCHECKED'});cad.discard(unchecked.previewId);await assert.rejects(cad.previewPhotoReconstruction(f.plan),/unabhängige Prüfung/);assert.equal(cad.serialize(),before);
  const rejected=await cad.previewPhotoReconstruction(f.plan,{review:async input=>projectedReports(input).map((r,i)=>i===1?{...r,matches:false}:r)});assert.equal(rejected.photoReconstructionReview.passed,false);rejected.photoReconstructionReview.passed=true;assert.throws(()=>cad.apply(rejected),{code:'PHOTO_RECONSTRUCTION_UNCHECKED'});cad.discard(rejected.previewId);
  await assert.rejects(cad.previewPhotoReconstruction(f.plan,{review:async input=>projectedReports(input).slice(1)}),/genau einmal/);
  await assert.rejects(cad.previewPhotoReconstruction(f.plan,{signal:AbortSignal.abort(),review:projectedReports}),{code:'ABORTED'});
  const changed=structuredClone(f.plan);changed.dimensions[0].mm=41;changed.dimensions[0].toleranceMm=.1;await assert.rejects(cad.previewPhotoReconstruction(changed,{review:projectedReports}),{code:'PHOTO_SET_INCOMPLETE'});
  assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,0);
  await assert.rejects(cad.previewPhotoReconstruction(f.plan,{review:async input=>{const next=cad.snapshot().photos;next.items[0].reference.name='Während der Prüfung geändert';cad.apply(await cad.previewPhotos(next));return projectedReports(input);}}),{code:'STALE_REVISION'});assert.equal(cad.snapshot().nodes.length,0);cad.undo();assert.equal(cad.serialize(),before);
 }finally{cad.dispose();}
});

test('Native functional clearance and true bore checks reject geometry even when every silhouette and outside dimension passes',async()=>{
 const f=multiViewFixture({stepped:true,holes:true}),cad=controller(cadProjectSnapshot({...createCadProject(),photos:f.photos}));try{
  const before=cad.serialize();for(const kind of ['clearance','bore']){const plan=structuredClone(f.plan);plan.functionalChecks[0].kind=kind;if(kind==='clearance')plan.functionalChecks[0].diameter=6;else plan.functionalChecks[0].minWall=1;
   const p=await cad.previewPhotoReconstruction(plan,{review:projectedReports}),r=p.photoReconstructionReview;assert(r.native.passed);assert(r.views.every(v=>v.matches));assert.equal(r.nativeExtras.passed,false);assert.equal(r.passed,false);assert.throws(()=>cad.apply(p),{code:'PHOTO_RECONSTRUCTION_UNCHECKED'});cad.discard(p.previewId);assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,0);
  }
 }finally{cad.dispose();}
});
