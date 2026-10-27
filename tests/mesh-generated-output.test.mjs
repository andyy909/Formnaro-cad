import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'manifold-3d/manifold';
import {createMeshEngineAdapter} from '../src/mesh-engine-adapter.js';
import {createCadProject} from '../src/cad-project.js';
import {makeNode,localManifold,meshData} from '../src/mesh-engine/geometry.js';
import {buildMeshSelectionTopology} from '../src/mesh-selection-data.js';
import {inspectMeshTopology} from '../src/mesh-inspector.js';
const kernel=await Module({wasmBinary:fs.readFileSync(new URL('../node_modules/manifold-3d/manifold.wasm',import.meta.url))});kernel.setup();
const engine=createMeshEngineAdapter({kernel});
const points=mesh=>new Set(Array.from({length:mesh.verts.length/3},(_,i)=>mesh.verts.slice(i*3,i*3+3).join(',')));
test('generated nut rims lose only collapsed output faces and remain valid at three qualities',async()=>{
 for(const segments of [32,64,96]){
  const legacy=makeNode('nut',[0,0,3],{segments}),m=localManifold(legacy);let raw,volume;
  try{raw=meshData(m);volume=m.volume()*15*13*6;}finally{m.delete();}
  const zero=inspectMeshTopology(buildMeshSelectionTopology(raw)).categories.degenerate.count;assert.ok(zero>0);
  const result=await engine.edit({project:createCadProject(),operation:{type:'mesh-create',shape:'nut',segments}}),node=result.project.nodes[0],proof=engine.inspectSolid(node);
  assert.equal(proof.ok,true);assert.equal(node.mesh.triangles.length,raw.triangles.length-zero*3);assert.ok(Math.abs(proof.volume-volume)<Math.abs(volume)*1e-6);
  const original=points(raw);for(const point of points(node.mesh))assert.ok(original.has(point),'used coordinates must remain exact');
  assert.deepEqual(node.meshSource.node.params,legacy.params);assert.equal(node.meshSource.node.segments,segments);
 }
});
test('clean generated output retains its original vertices and triangle order; unrelated raw mesh is untouched',async()=>{
 const legacy=makeNode('box'),m=localManifold(legacy);let raw;try{raw=meshData(m);}finally{m.delete();}
 const p=createCadProject(),imported={id:'raw',kind:'mesh',name:'Original',mesh:{verts:[0,0,0,1,0,0,0,1,0],triangles:[0,1,2]},transform:[1,0,0,0,0,1,0,0,0,0,1,0,40,0,0,1],layerId:p.activeLayerId,folderId:null,color:'#448899'};p.nodes.push(imported);
 const out=await engine.edit({project:p,operation:{type:'mesh-create',shape:'box',id:'box'}});assert.deepEqual(out.project.nodes[1].mesh,raw);assert.deepEqual(out.project.nodes[0],imported);
});
test('nut parameters remain editable after output cleanup with full source parameters and affine placement',async()=>{
 const created=await engine.edit({project:createCadProject(),operation:{type:'mesh-create',shape:'nut',id:'nut',position:[8,12,4]}}),before=created.project.nodes[0];
 const edited=await engine.edit({project:created.project,operation:{type:'mesh-source-edit',id:'nut',path:[],set:{params:{...before.meshSource.node.params,pitch:1.5}}}}),node=edited.project.nodes[0];
 assert.equal(engine.inspectSolid(node).ok,true);assert.equal(node.meshSource.node.params.pitch,1.5);assert.deepEqual(node.transform.slice(12,15),before.transform.slice(12,15));assert.equal(before.meshSource.node.params.pitch,1.25);
});
