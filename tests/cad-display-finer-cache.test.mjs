import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCadKernel} from '../src/cad-kernel-loader.js';
import {createCadService} from '../src/cad-service.js';
import {createCadProject,serializeCadProject} from '../src/cad-project.js';
import {createCadCache} from '../src/cad-worker-client.js';
import {cadPoint} from '../src/cad-affine.js';
const oc=await loadCadKernel({print:()=>{},printErr:()=>{}});

test('A bounded cache finder returns the most recent match and retains one value with ordinary LRU disposal',()=>{
  const disposed=[],cache=createCadCache({maxEntries:2,maxBytes:20,dispose:value=>disposed.push(value)}),a={kind:'mesh'},b={kind:'mesh'},c={kind:'mesh'};
  cache.set('a',a,6);cache.set('b',b,6);assert.equal(cache.find(value=>value.kind==='mesh'),b);assert.deepEqual(cache.state(),{entries:2,bytes:12,maxEntries:2,maxBytes:20});
  assert.equal(cache.find((value,key)=>key==='a'),a);cache.set('c',c,6);assert.deepEqual(disposed,[b]);assert.equal(cache.find((value,key)=>key==='missing'),undefined);assert.equal(cache.get('a'),a);cache.clear();assert.deepEqual(new Set(disposed),new Set([a,b,c]));assert.equal(cache.state().bytes,0);
});

test('Small STEP shrinking and coarser display requests reuse the identical slightly finer buffers without another tessellation',()=>{
  const service=createCadService({oc}),extract=oc.ReplicadMeshExtractor.extract;let calls=0;
  oc.ReplicadMeshExtractor.extract=Object.assign(function(...args){calls++;return extract.apply(this,args);},extract);
  try{
    const source=service.nativeNode({type:'sphere',size:[16,16,16]},{id:'step-source'});source.source='step';delete source.recipe;source.transform[0]=1.04;
    const project=createCadProject({nodes:[source]}),before=serializeCadProject(project),quality={deflection:.02,angleDegrees:8},first=service.display(project,quality)[0],cache=service.displayCacheState();assert.equal(calls,1);
    project.nodes[0].transform[0]=1.02;const smaller=service.display(project,quality)[0];assert.equal(calls,1);assert.deepEqual(smaller.mesh,first.mesh);assert.equal(service.displayCacheState().entries,cache.entries);assert.equal(service.displayCacheState().bytes,cache.bytes);
    // The exact original sphere and its unchanged affine placement provide
    // an independent surface check; no display buffer proves native bounds.
    for(let i=0;i<smaller.mesh.vertices.length;i+=3){const point=cadPoint(smaller.transform,smaller.mesh.vertices.slice(i,i+3));assert.ok(Math.abs(Math.hypot(point[0]/1.02,point[1],point[2])-8)<1e-6);}
    smaller.mesh.vertices[0]=999;assert.notEqual(service.display(project,quality)[0].mesh.vertices[0],999,'Caller mutation corrupted shared cache');
    project.nodes[0].transform[0]=1.04;const coarse=service.display(project,{...quality,deflection:.021})[0];assert.equal(calls,1);assert.deepEqual(coarse.mesh,first.mesh);assert.equal(serializeCadProject(project),before);
    const larger=service.display(project,{...quality,deflection:.023})[0];assert.equal(calls,2,'Mesh more than ten percent finer retained');assert.ok(larger.mesh.triangles.length>0);
  }finally{oc.ReplicadMeshExtractor.extract=extract;service.dispose();}
});

test('Larger scales, angular changes and changed native source bytes require new display meshes; exports remain independent',()=>{
  const service=createCadService({oc}),extract=oc.ReplicadMeshExtractor.extract;let calls=0;
  oc.ReplicadMeshExtractor.extract=Object.assign(function(...args){calls++;return extract.apply(this,args);},extract);
  try{
    const source=service.nativeNode({type:'cylinder',size:[12,12,6]},{id:'body'}),project=createCadProject({nodes:[source]}),before=serializeCadProject(project),quality={deflection:.03,angleDegrees:12},exported=service.exportMeshes(project,{deflection:.02,angleDegrees:8});
    service.display(project,quality);assert.equal(calls,1);project.nodes[0].transform[0]=1.01;service.display(project,quality);assert.equal(calls,2,'A coarser cached mesh survived enlargement');
    project.nodes[0].transform[0]=1;service.display(project,{...quality,angleDegrees:13});assert.equal(calls,3,'Different angular budget reused');
    const replacement=service.nativeNode({type:'cylinder',size:[14,14,6]},{id:'replacement'});project.nodes[0].brep=replacement.brep;service.display(project,quality);assert.equal(calls,4,'Different native source reused');
    project.nodes[0].brep=source.brep;service.display(project,{...quality,deflection:.031});assert.equal(calls,4);assert.equal(serializeCadProject(project),before);assert.deepEqual(service.exportMeshes(project,{deflection:.02,angleDegrees:8}),exported);
  }finally{oc.ReplicadMeshExtractor.extract=extract;service.dispose();}
});
