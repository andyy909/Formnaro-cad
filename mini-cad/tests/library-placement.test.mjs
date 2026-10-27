import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Matrix4} from 'three';
import Module from '../cad-kernel-build/runtime/formnaro_cad.js';
import {createNode,encodeProject,emptyProject} from '../src/model.js';
import {libraryCopies,libraryPlacement,placeLibraryNodes} from '../src/library-placement.js';
import {placementOnSurface} from '../src/placement.js';
import {createOperations} from '../src/operations.js';
import {matrixArray} from '../src/engine/geometry.js';
const module=await Module();const run=createOperations(module);
test('library assembly remains rigid on sloped surfaces with original recipes, holes and hidden sources',async()=>{
  const a=createNode('box'),b=createNode('cylinder'),hole=createNode('cylinder'),hidden=createNode('box');a.pos=[20,-3,7];a.rot=[12,17,28];a.mirror=[-1,1,1];a.notes='M4';b.pos=[44,8,18];hole.pos=[20,-3,-20];hole.size=[4,4,80];hole.solid=false;hidden.hidden=true;hidden.pos=[800,0,-400];
  const source=[a,b,hole,hidden],original=structuredClone(source),nodes=libraryCopies(source,3),rendered=await run('render',nodes),payload=libraryPlacement(nodes,rendered,'Baugruppe'),normal=[.5,0,Math.sqrt(.75)],surface={point:[-30,15,20],normal,origin:[-30,15,20],tangent:[0,1,0]};
  const result=placementOnSurface(payload.node,payload.data,surface,{snap:0}),placed=placeLibraryNodes(nodes,payload.node,result);assert.deepEqual(source,original);assert.equal(placed.length,4);assert.equal(placed[3].hidden,true);assert.equal(placed[2].solid,false);
  const delta=new Matrix4().fromArray(matrixArray({...payload.node,pos:result.pos,rot:result.rot})).multiply(new Matrix4().fromArray(matrixArray(payload.node)).invert());
  placed.forEach((n,i)=>{const expected=delta.clone().multiply(new Matrix4().fromArray(matrixArray(nodes[i]))),actual=new Matrix4().fromArray(matrixArray(n));actual.elements.forEach((v,j)=>assert(Math.abs(v-expected.elements[j])<1e-7));assert.deepEqual(n.params,source[i].params);assert.deepEqual(n.size,source[i].size);assert.notEqual(n.id,source[i].id);});
  let support=Infinity;for(const n of placed.filter(n=>n.solid&&!n.hidden)){const data=rendered.find(r=>r.id===n.id).data,m=new Matrix4().fromArray(matrixArray(n));for(let i=0;i<data.verts.length;i+=3){const v=[0,1,2].map(j=>m.elements[j]*data.verts[i]+m.elements[4+j]*data.verts[i+1]+m.elements[8+j]*data.verts[i+2]+m.elements[12+j]);support=Math.min(support,v.reduce((sum,x,j)=>sum+(x-surface.point[j])*normal[j],0));}}
  assert(Math.abs(support)<1e-6,'solid contact, protruding hole and hidden parts must not lift assembly');encodeProject({...emptyProject(),nodes:placed});
});
test('single library shape keeps local orientation semantics and count failures precede preview',async()=>{
  const node=createNode('tube');node.rot=[25,13,61];node.folder='Rohre';const nodes=libraryCopies([node],0),payload=libraryPlacement(nodes,await run('render',nodes),'Rohr');assert.equal(payload.members,null);assert.deepEqual(payload.node.rot,node.rot);
  const result=placementOnSurface(payload.node,payload.data,{point:[14,22,0],normal:[0,0,1]},{snap:0,align:false}),[placed]=placeLibraryNodes(nodes,payload.node,result);placed.rot.forEach((v,i)=>assert(Math.abs(v-node.rot[i])<1e-8));assert.equal(placed.folder,'Rohre');assert.throws(()=>libraryCopies([node],200));assert.throws(()=>libraryCopies([{...node,hidden:true}],0));
});
