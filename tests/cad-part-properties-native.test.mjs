import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {createCadController} from '../src/cad-controller.js';
import {createPartPropertiesService} from '../src/cad-part-properties-service.js';
import {paintPartFaces} from '../src/cad-part-properties.js';
import {loadCadKernel} from '../src/cad-kernel-loader.js';
import {stepAssemblyFixture} from '../scripts/step-assembly-fixture.mjs';
const worker=file=>()=>{const w=new Worker(new URL(file,import.meta.url)),a={postMessage:m=>w.postMessage(m),terminate:()=>w.terminate()};w.on('message',data=>a.onmessage?.({data}));w.on('error',e=>a.onerror?.(e));return a;};
const make=()=>createCadController({createWorker:worker('./fixtures/cad-node-worker.mjs'),createMeshWorker:worker('./fixtures/mesh-engine-node-worker.mjs')});
const near=(a,b)=>assert(Math.abs(a-b)<1e-5,`${a} != ${b}`);
test('Actual native worker measures volume and first moments with explicit density, exports face color and invalidates cache',async()=>{
 const c=make();try{
  await c.execute({kind:'batch',commands:[{op:'create',type:'box',size:[10,20,30],pos:[40,-10,15],as:'part'}]});let p=c.snapshot();p.nodes[0].metadata={partProperties:{version:1,material:{name:'Prüfmaterial',densityGcm3:2}}};let proposal=await c.preview(undefined,{project:p});c.apply(proposal);const service=createPartPropertiesService(c),before=c.serialize(),depth=c.state().undo,a=await service.measure();assert(a.complete);near(a.rows[0].volumeMm3,6000);near(a.totalMassG,12);a.centerMm.forEach((v,k)=>near(v,[40,-10,15][k]));assert.equal(c.serialize(),before);assert.equal(c.state().undo,depth);assert.equal((await service.measure()).rows[0].faceCount,6);assert.equal(service.state().hits,1);
  p=c.snapshot();paintPartFaces(p.nodes[0],{name:'Rote Fläche',color:'#ff0000',faceIds:[1]});proposal=await c.preview(undefined,{project:p});c.apply(proposal);const exported=await c.exportModel({format:'gltf'}),gltf=JSON.parse(typeof exported.data==='string'?exported.data:new TextDecoder().decode(exported.data));assert(gltf.materials.some(m=>m.pbrMetallicRoughness.baseColorFactor.slice(0,3).join(',')==='1,0,0'));const b=await service.measure();assert.equal(b.rows[0].surfaceGroups.current,true);assert.equal(service.state().misses,2);
  p=c.snapshot();p.nodes[0].transform[12]+=10;proposal=await c.preview(undefined,{project:p});c.apply(proposal);const moved=await service.measure();near(moved.centerMm[0],50);assert.equal(service.state().misses,3);assert(moved.rows[0].surfaceGroups.current);
  c.undo();assert.equal((await service.measure()).centerMm[0],40);
 }finally{c.dispose();}
});
test('Native off-center through-cavity shifts the material centroid away from the bounding-box center',async()=>{
 const c=make();try{await c.execute({kind:'batch',commands:[{op:'create',type:'box',size:[10,10,10],pos:[0,0,5],as:'outer'},{op:'create',type:'box',size:[2,2,12],pos:[3,0,5],solid:false,as:'hole'},{op:'group',targets:['$outer','$hole'],as:'result'}]});const r=await c.query('partProperties',{id:c.snapshot().nodes[0].id});near(r.volumeMm3,960);near(r.centerMm[0],-.125);near(r.centerMm[1],0);near(r.centerMm[2],5);}finally{c.dispose();}
});
test('A different native face can be painted while unselected imported STEP colors survive display and physical STEP roundtrip',async()=>{
 const oc=await loadCadKernel({print:()=>{},printErr:()=>{}}),bytes=stepAssemblyFixture(oc),c=make(),reopen=make();try{
  await c.execute({kind:'importStepAssembly',bytes,options:{name:'Colors.step',id:'colors'}});const p=c.snapshot(),n=p.nodes.find(n=>n.metadata?.stepFaceColors?.some(f=>f.color==='#ffcc22')),original=n.brep.data,old=n.metadata.stepFaceColors.find(f=>f.color==='#ffcc22');assert(n);const selected=old.faceIndex===1?2:1;
  paintPartFaces(n,{name:'Nur diese Fläche',color:'#ff0000',faceIds:[selected]});c.apply(await c.preview(undefined,{project:p}));assert.equal(c.snapshot().nodes.find(v=>v.id===n.id).brep.data,original);const display=await c.display(),colors=display.meshes.find(m=>m.id===n.id).faceColors;assert(colors.some(f=>f.faceIndex===old.faceIndex&&f.color==='#ffcc22'));assert(colors.some(f=>f.faceIndex===selected&&f.color==='#ff0000'));
  const step=await c.exportModel({format:'step',ids:[n.id]});await reopen.execute({kind:'importStepAssembly',bytes:step.data,options:{name:'Roundtrip.step',id:'roundtrip'}});const round=reopen.snapshot().nodes.flatMap(n=>n.metadata?.stepFaceColors??[]);assert(round.some(f=>f.color==='#ffcc22'));assert(round.some(f=>f.color==='#ff0000'));
 }finally{c.dispose();reopen.dispose();}
});
test('Actual mesh worker proves an asymmetric tetrahedron; mirror, density omission and open surface stay honest',async()=>{
 const c=make();try{
  let p=c.snapshot();p.nodes.push({id:'tetra',kind:'mesh',name:'Asymmetrisch',transform:[-2,0,0,0,0,1,0,0,0,0,1,0,10,0,0,1],meshRole:'solid',mesh:{verts:[0,0,0,2,0,0,0,4,0,0,0,6],triangles:[0,2,1,0,1,3,1,2,3,2,0,3]},color:'#8294aa',layerId:'default',folderId:null,metadata:{partProperties:{version:1,material:{name:'Dichte 2',densityGcm3:2}}}});await c.open(p);const service=createPartPropertiesService(c),a=await service.measure();assert(a.complete,JSON.stringify(a));near(a.totalMassG,.032);a.centerMm.forEach((v,k)=>near(v,[9,1,1.5][k]));
  p=c.snapshot();p.nodes[0].metadata.partProperties.material.densityGcm3=null;let proposal=await c.preview(undefined,{project:p});c.apply(proposal);const b=await service.measure();assert.equal(b.complete,false);assert.equal(b.totalMassG,null);near(b.rows[0].volumeMm3,16);
  p=c.snapshot();p.nodes[0].mesh.triangles.splice(0,3);delete p.nodes[0].metadata.partProperties.surfaces;proposal=await c.preview(undefined,{project:p});c.apply(proposal);const open=await service.measure();assert.equal(open.rows[0].volumeMm3,null);assert.equal(open.centerMm,null);
 }finally{c.dispose();}
});
