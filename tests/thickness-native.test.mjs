import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCadKernel} from '../src/cad-kernel-loader.js';
import {buildCadRecipe} from '../src/cad-recipes.js';
import {cadBoolean,cadDisplayMesh,writeCadBrep} from '../src/cad-native-kernel.js';
import {cadIdentity} from '../src/cad-affine.js';
import {thicknessMap,thicknessWorldInput} from '../src/thickness-map.js';
import {createCadService} from '../src/cad-service.js';
import {stepAssemblyFixture} from '../scripts/step-assembly-fixture.mjs';
import {buildMeshSelectionTopology} from '../src/mesh-selection-data.js';
import {inspectMeshTopology} from '../src/mesh-inspector.js';
const oc=await loadCadKernel({print:()=>{},printErr:()=>{}}),near=(a,b,t=1e-5)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
test('Native hollow box measures material rather than the cavity, preserving exact BRep',()=>{
  const outer=buildCadRecipe(oc,{type:'box',size:[30,20,10]}),inner=buildCadRecipe(oc,{type:'box',size:[26,16,6]});let hollow;
  try{hollow=cadBoolean(oc,'difference',outer,inner);const before=writeCadBrep(oc,hollow),surface=cadDisplayMesh(oc,hollow,{deflection:.02,angleDegrees:8}),r=thicknessMap(thicknessWorldInput(surface,cadIdentity()));near(r.minimum,2);assert.ok(r.measured>=12);assert.ok(Array.from(r.values).filter(v=>Math.abs(v-2)<1e-5).length>=12);assert.equal(writeCadBrep(oc,hollow),before);}
  finally{hollow?.delete();inner.delete();outer.delete();}
});
test('Native curved CAD map is explicitly a finite display approximation',()=>{
  const body=buildCadRecipe(oc,{type:'sphere',size:[20,20,20]});
  try{const mesh=cadDisplayMesh(oc,body,{deflection:.02,angleDegrees:8}),r=thicknessMap({...thicknessWorldInput(mesh,cadIdentity()),maxSamples:2000});assert.ok(r.measured>500);assert.ok(r.minimum>19.8&&r.maximum<=20.01);assert.equal(r.complete,false);}
  finally{body.delete();}
});
test('STEP colours survive coloured mesh export; topology edits do not apply obsolete face indices',async()=>{
  const service=createCadService({oc});
  try{
    const {createCadProject}=await import('../src/cad-project.js'),p=createCadProject();service.stepAssembly(p,stepAssemblyFixture(oc));const project=await service.rebuild(p),plate=project.nodes[0];
    const parts=service.exportMeshes(project,undefined,{ids:[plate.id]});assert.deepEqual(new Set(parts.map(p=>p.color)),new Set(['#1266cc','#ffcc22']));assert.equal(parts.reduce((n,p)=>n+p.mesh.triangles.length/3,0),12);
    const group={...plate,id:'wrapper',source:'group',operation:'union',children:[{...plate,id:'original'}]};const grouped=await service.rebuild({...project,nodes:[group]});assert.equal(service.display(grouped)[0].faceColors,undefined);assert.equal(grouped.nodes[0].children[0].metadata.stepFaceColors.length,1);
  }finally{service.dispose();}
});
test('Mesh preparation preserves full affine world geometry and diagnoses original open boundaries',()=>{
  const mesh={verts:[0,0,0,10,0,0,0,10,0,0,0,10],triangles:[0,2,1,0,1,3,1,2,3,2,0,3]},m=cadIdentity();m[0]=-2;m[10]=.5;m[12]=100;
  const w=thicknessWorldInput(mesh,m);assert.deepEqual(w.vertices.slice(0,6),[100,0,0,80,0,0]);assert.deepEqual(w.triangles.slice(0,3),[0,1,2]);
  const closed=inspectMeshTopology(buildMeshSelectionTopology({verts:w.vertices,triangles:w.triangles}),{smallTriangleLimit:0});assert.equal(closed.categories.boundary.count,0);
  const open=inspectMeshTopology(buildMeshSelectionTopology({...mesh,triangles:mesh.triangles.slice(3)}),{smallTriangleLimit:0});assert.equal(open.categories.boundary.count,3);
});
