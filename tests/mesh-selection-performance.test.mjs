import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMeshSelectionTopology,queryMeshSelection} from '../src/mesh-selection-data.js';

const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function folded(){const angle=40*Math.PI/180;return {verts:[0,0,0,1,0,0,0,1,0,0,-Math.cos(angle),Math.sin(angle)],triangles:[0,1,2,1,0,3]};}
const surface=(topology,transform=identity,angleDegrees=20)=>queryMeshSelection(topology,{mode:'surface',triangleIndex:0,angleDegrees},{transform});
function freezeMesh(mesh){Object.freeze(mesh.verts);Object.freeze(mesh.triangles);return Object.freeze(mesh);}

test('Surface selection reads only the reached patch and reuses its normals for the same immutable placement',()=>{
  const mesh={verts:[0,0,0,1,0,0,1,1,0,0,1,0,10,0,0,11,0,0,11,1,0,10,1,0],triangles:[0,1,2,0,2,3,4,5,6,4,6,7]};
  const built=buildMeshSelectionTopology(mesh),reads=[];
  const verts=new Proxy(mesh.verts,{get(target,key,receiver){if(typeof key==='string'&&/^\d+$/.test(key))reads.push(Number(key));return Reflect.get(target,key,receiver);}});
  const topology={...built,mesh:freezeMesh({verts,triangles:mesh.triangles})};
  const before=JSON.stringify(mesh);reads.length=0;
  const first=surface(topology);assert.deepEqual(first.triangleIds,[0,1]);assert.ok(reads.length>0);assert.ok(reads.every(index=>index<12),'Disconnected faces need no transformed normals.');
  reads.length=0;assert.deepEqual(surface(topology),first);assert.deepEqual(reads,[],'The confirmed mesh and unchanged pose reuse exactly the prior face normals.');
  const translated=[...identity];translated[12]=50;surface(topology,translated);assert.ok(reads.length>0,'A different full affine placement invalidates the normal record.');
  assert.equal(JSON.stringify(mesh),before);
});

test('Cached surface normals observe in-place affine edits, mirrored shear and a return to the earlier pose',()=>{
  const mesh=freezeMesh(folded()),topology=buildMeshSelectionTopology(mesh),transform=[...identity];
  assert.deepEqual(surface(topology,transform).triangleIds,[0]);
  transform.splice(0,16,-2,0,0,0,0,1,0,0,0,.4,.2,0,50,-3,2,1);
  assert.deepEqual(surface(topology,transform).triangleIds,[0,1]);
  assert.deepEqual(surface(topology,transform,10).triangleIds,[0]);
  transform.splice(0,16,...identity);assert.deepEqual(surface(topology,transform).triangleIds,[0]);
  const singular=[...identity];singular[0]=0;assert.throws(()=>surface(topology,singular),/nicht invertierbar/);
  const aborted=new AbortController();aborted.abort();assert.throws(()=>queryMeshSelection(topology,{mode:'surface',triangleIndex:0},{signal:aborted.signal}),{name:'AbortError'});
});

test('Mutable topology queries recompute normals after a coordinate edit',()=>{
  const mesh=folded(),topology=buildMeshSelectionTopology(mesh);
  assert.deepEqual(surface(topology).triangleIds,[0]);mesh.verts[11]=0;
  assert.deepEqual(surface(topology).triangleIds,[0,1]);
  mesh.verts[11]=Math.sin(40*Math.PI/180);assert.deepEqual(surface(topology).triangleIds,[0]);
});
