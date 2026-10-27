import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCadKernel} from '../src/cad-kernel-loader.js';
import {importCadStepAssembly,exportCadStep} from '../src/cad-step-io.js';
import {createCadService} from '../src/cad-service.js';
import {createCadCommandRouter} from '../src/cad-command-router.js';
import {createCadProject,parseCadProject,serializeCadProject} from '../src/cad-project.js';
import {stepAssemblyFixture} from '../scripts/step-assembly-fixture.mjs';
const oc=await loadCadKernel({print:()=>{},printErr:()=>{}}),fixture=stepAssemblyFixture(oc),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
test('Native XCAF preserves nested names, repeated instances, placement and part/face colours',()=>{
  const tree=importCadStepAssembly(oc,fixture);assert.equal(tree.length,1);assert.equal(tree[0].name,'Prüfbaugruppe');
  assert.equal(tree[0].children.length,2);const [plate,assembly]=tree[0].children;assert.equal(plate.name,'Boden');assert.equal(assembly.name,'Unterbau links');assert.equal(assembly.children.length,2);
  assert.equal(plate.appearance.color,'#1266cc');near(plate.appearance.opacity,.7);assert.ok(plate.faceColors.some(f=>f.appearance.color==='#ffcc22'));
  const [a,b]=assembly.children;assert.equal(a.name,'Stift 1');assert.equal(b.name,'Stift 2');assert.equal(a.appearance.color,'#ee4411');assert.equal(b.appearance.color,'#22bb55');near(b.stats.bounds.min[0]-a.stats.bounds.min[0],12);near(a.stats.bounds.min[0],38);near(a.stats.bounds.min[2],-2);near(plate.stats.volume,400);
});
test('Assembly import is independent CAD leaves and existing folders; persistence, display reuse and selected STEP export',async()=>{
  const service=createCadService({oc}),router=createCadCommandRouter({oc,service});
  try{
    const p=createCadProject(),r=await router.run(p,{kind:'importStepAssembly',bytes:fixture,options:{name:'Fixture.step',id:'imported',metadata:{importedFile:{name:'Fixture.step',type:'step'}}}}),project=r.project;
    assert.equal(project.nodes.length,3);assert.equal(project.folders.length,3);assert.ok(project.nodes.every(n=>n.source==='step'&&!n.children));
    assert.deepEqual(parseCadProject(serializeCadProject(project)),project);
    const displays=service.display(project,undefined,{knownMeshes:[]}),old=project.nodes[0].brep.data;project.nodes[0].transform[12]+=20;
    const reused=service.display(project,undefined,{knownMeshes:displays.map(d=>d.meshToken)});assert.equal(reused[0].meshToken,displays[0].meshToken);assert.equal(reused[0].mesh,undefined);assert.equal(project.nodes[0].brep.data,old);assert.ok(displays[0].faceColors.length);
    const exported=service.exportStep(project,{ids:[project.nodes[0].id]}),round=importCadStepAssembly(oc,exported);assert.equal(round.length,1);const leaf=round[0].children?.[0]??round[0];assert.ok(leaf.faceColors.some(f=>f.appearance.color==='#ffcc22'));near(leaf.stats.volume,400);
    project.folders[0].hidden=true;assert.equal(service.productionNodes(project).length,0);
  }finally{service.dispose();}
});
test('Invalid input and excessive tree names fail atomically',()=>{
  assert.throws(()=>importCadStepAssembly(oc,new Uint8Array()),/30 MB/);assert.throws(()=>importCadStepAssembly(oc,new TextEncoder().encode('not step')),/STEP-Datei/);
});

test('Nested rotated instance frame composes exactly with component translations',()=>{
  const roots=importCadStepAssembly(oc,stepAssemblyFixture(oc,{rotateNested:true})),[a,b]=roots[0].children[1].children;
  near(a.stats.bounds.min[0],38);near(b.stats.bounds.min[0],38);near(b.stats.bounds.min[1]-a.stats.bounds.min[1],12);near(a.stats.volume,Math.PI*4*8);
});

test('Declared inch STEP units are read into millimetres by the assembly reader',()=>{
  const service=createCadService({oc}),node=service.nativeNode({type:'box',size:[1,2,3]}),shape=service.worldShape(node),writer=new oc.STEPControl_Writer(),progress=new oc.Message_ProgressRange(),path='/assembly-inch.step';
  try{oc.Interface_Static.SetCVal('write.step.unit','INCH');writer.Transfer(shape,oc.STEPControl_StepModelType.STEPControl_AsIs,true,progress);writer.Write(path);const tree=importCadStepAssembly(oc,oc.FS.readFile(path).slice()),part=tree[0].children?.[0]??tree[0];near(part.stats.volume,6);for(let k=0;k<3;k++)near(part.stats.bounds.max[k]-part.stats.bounds.min[k],k+1);}
  finally{oc.Interface_Static.SetCVal('write.step.unit','MM');try{oc.FS.unlink(path);}catch{}progress.delete();writer.delete();shape.delete();service.dispose();}
});

test('Rejected folder names and malformed face styles leave confirmed import input intact',async()=>{
  const service=createCadService({oc}),router=createCadCommandRouter({oc,service}),p=createCadProject(),before=serializeCadProject(p);
  try{await assert.rejects(router.run(p,{kind:'importStepAssembly',bytes:fixture,options:{name:'x'.repeat(201)}}),/Ungültiger Text/);assert.equal(serializeCadProject(p),before);
    service.stepAssembly(p,fixture);const bad=structuredClone(p);bad.nodes[0].metadata.stepFaceColors.push({...bad.nodes[0].metadata.stepFaceColors[0]});assert.throws(()=>serializeCadProject(bad),/Flächenfarbe/);
  }finally{service.dispose();}
});
