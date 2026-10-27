import test from 'node:test';
import assert from 'node:assert/strict';
import OCModule from 'replicad-opencascadejs';
import {createCadService} from '../src/cad-service.js';
import {createCadTransactions} from '../src/cad-transactions.js';
import {createCadProject,cadProjectRevision,serializeCadProject,parseCadProject} from '../src/cad-project.js';
import {cadIdentity} from '../src/cad-affine.js';
import {brepHasNoTriangulation,cadVolume,cadNativeCapabilities} from '../src/cad-native-kernel.js';
import {importCadStep} from '../src/cad-step-io.js';
const oc=await OCModule({print:()=>{},printErr:()=>{}});
function boreFixture(service){
  const body=service.nativeNode({type:'cylinder',size:[20,20,20]},{id:'body',name:'Zylinder'}),hole=service.nativeNode({type:'cylinder',size:[6,6,30]},{id:'hole',name:'Bohrung',solid:false});
  const group={id:'group',kind:'cad',name:'Gebohrter Zylinder',source:'group',solid:true,transform:cadIdentity(),operation:'union',children:[body,hole],brep:structuredClone(body.brep),stats:structuredClone(body.stats)};
  return createCadProject({nodes:[group]});
}
const near=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} differs from ${b}`);

test('CAD service source editing remains CAD through Preview/Apply/Undo/Redo and format-5 reopening',async()=>{
  const service=createCadService({oc});try{
    const initial=await service.rebuild(boreFixture(service)),store=createCadTransactions({initial,build:p=>service.rebuild(p)});
    near(initial.nodes[0].stats.volume,Math.PI*(100-9)*20);const draft=store.snapshot();draft.nodes[0].children[1].recipe.size=[8,8,30];
    const p=await store.preview({revision:store.revision(),project:draft});near(store.snapshot().nodes[0].stats.volume,initial.nodes[0].stats.volume);
    const result=store.apply(p);near(result.project.nodes[0].stats.volume,Math.PI*(100-16)*20);assert.equal(result.project.nodes[0].children[1].id,'hole');assert.ok(brepHasNoTriangulation(result.project.nodes[0].brep.data));
    near(store.undo().project.nodes[0].stats.volume,initial.nodes[0].stats.volume);near(store.redo().project.nodes[0].stats.volume,result.project.nodes[0].stats.volume);
    const reopened=await service.rebuild(parseCadProject(serializeCadProject(store.snapshot())));near(reopened.nodes[0].stats.volume,result.project.nodes[0].stats.volume);assert.equal(reopened.nodes[0].mesh,undefined);assert.equal(reopened.nodes[0].children[0].recipe.type,'cylinder');
  }finally{service.dispose();}
});

test('Display quality leaves CAD unchanged; print meshes require the native double export interface',async()=>{
  const service=createCadService({oc});try{
    const project=await service.rebuild(boreFixture(service)),before=serializeCadProject(project),revision=cadProjectRevision(project),coarse=service.display(project,{deflection:.5,angleDegrees:30}),fine=service.display(project,{deflection:.005,angleDegrees:3});
    assert.ok(fine[0].mesh.triangles.length>coarse[0].mesh.triangles.length);assert.ok(fine[0].mesh.faceGroups.length);assert.equal(fine[0].mesh.normals.length,fine[0].mesh.vertices.length);
    if(cadNativeCapabilities(oc).doubleExportMesh){const export1=service.exportMeshes(project);service.display(project,{deflection:1,angleDegrees:45});const export2=service.exportMeshes(project);assert.deepEqual(export1,export2);}else assert.throws(()=>service.exportMeshes(project),/Double-Tessellierung/);
    assert.equal(serializeCadProject(project),before);assert.equal(cadProjectRevision(project),revision);
    const step1=importCadStep(oc,service.exportStep(project));service.display(project,{deflection:.5,angleDegrees:30});const step2=importCadStep(oc,service.exportStep(project));near(step1.stats.volume,project.nodes[0].stats.volume);assert.deepEqual(step1.stats,step2.stats);assert.equal(cadProjectRevision(project),revision);
    const shape=service.worldShape(project.nodes[0]);try{near(cadVolume(oc,shape),project.nodes[0].stats.volume);}finally{shape.delete();}
  }finally{service.dispose();}
});

test('Reference meshes are storable and visible but excluded from CAD production exports and groups',async()=>{
  const service=createCadService({oc});try{
    const fixture=boreFixture(service),reference={id:'reference',kind:'referenceMesh',name:'STL-Referenz',transform:cadIdentity(),mesh:{verts:[0,0,0,1,0,0,0,1,0],triangles:[0,1,2]}};fixture.nodes.push(reference);
    const project=await service.rebuild(fixture);assert.equal(service.display(project).length,2);assert.equal(importCadStep(oc,service.exportStep(project)).stats.solids,1);if(cadNativeCapabilities(oc).doubleExportMesh)assert.equal(service.exportMeshes(project).length,1);else assert.throws(()=>service.exportMeshes(project),/Double-Tessellierung/);assert.deepEqual(parseCadProject(serializeCadProject(project)).nodes[1].mesh,reference.mesh);assert.throws(()=>service.worldShape(project.nodes[1]),/Netzreferenzen/);
    const illegal=structuredClone(project);illegal.nodes[0].children.push(reference);await assert.rejects(service.rebuild(illegal),/Referenzmesh/);
    const enormous=structuredClone(project);enormous.nodes[1].mesh.verts[0]=1e308;await assert.rejects(service.rebuild(enormous),/darstellbare/);enormous.nodes[1].mesh.verts[0]=100000;await assert.rejects(service.rebuild(enormous),/Arbeitsbereich/);
  }finally{service.dispose();}
});

test('CAD failures preserve the confirmed model and bounded native caches across repeated rebuilds',async()=>{
  const service=createCadService({oc,maxEntries:4,maxBytes:1024*1024});try{
    const project=await service.rebuild(boreFixture(service)),store=createCadTransactions({initial:project,build:p=>service.rebuild(p)}),draft=store.snapshot();draft.nodes[0].children[1].recipe.size=[30,30,30];
    await assert.rejects(store.preview({revision:store.revision(),project:draft}),/CAD-Körper/);assert.deepEqual(store.snapshot(),project);assert.equal(store.state().undo,0);
    for(let i=0;i<30;i++){const changed=structuredClone(project);changed.nodes[0].children[1].recipe.size=[3+i*.1,3+i*.1,30];await service.rebuild(changed);assert.ok(service.cacheState().entries<=4);assert.ok(service.cacheState().bytes<=1024*1024);}
    const blocked=store.snapshot();blocked.nodes[0].transform[0]=2;await assert.rejects(store.preview({revision:store.revision(),project:blocked}),/GTransform/);assert.deepEqual(store.snapshot(),project);
  }finally{service.dispose();assert.equal(service.cacheState().entries,0);}
});
