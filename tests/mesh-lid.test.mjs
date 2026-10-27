import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import {Matrix4,Vector3} from 'three';
import {analyzeMeshLids,createMeshLid,validateMeshLidOptions} from '../src/mesh-lid.js';
import {lidHousing} from './fixtures/mesh-lid-fixtures.mjs';
import {projectObjectGeometryDigest,meshTopologyClass} from '../src/project-objects.js';
const kernel=await Module();kernel.setup();
const options=(node,extra={})=>{const a=analyzeMeshLids(node),c=a.candidates.find(c=>c.normal[2]>.9)??a.candidates[0];assert.ok(c);return {geometryDigest:a.geometryDigest,candidateId:c.candidateId,normal:c.normal,...extra};};
function manifold(mesh,transform){let m=new kernel.Manifold(new kernel.Mesh({numProp:3,vertProperties:new Float32Array(mesh.verts),triVerts:new Uint32Array(mesh.triangles)}));if(transform){const w=m.transform(transform);m.delete();m=w;}return m;}

test('STL opening analysis measures both screw axes without exposing source contours or changing arrays',()=>{
 const n=lidHousing(kernel),before=structuredClone(n),a=analyzeMeshLids(n);assert.deepEqual(n,before);
 const c=a.candidates.find(c=>c.normal[2]>.99);assert.ok(c);assert.equal(c.fasteners.length,2);assert.ok(c.fasteners.every(h=>Math.abs(h.sourceBoreDiameter-3.5)<.01));
 const centers=c.fasteners.map(h=>h.center).sort((a,b)=>a[1]-b[1]);assert.ok(Math.abs(centers[0][0]-24)<.001);assert.ok(Math.abs(centers[0][1]-5)<.001);assert.ok(Math.abs(centers[1][1]-67)<.001);assert.ok(centers.every(p=>Math.abs(p[2]-18)<.001));
 assert.ok(!/verts|triangles|outer|inner|contours/.test(JSON.stringify(a)));assert.equal(a.geometryDigest,projectObjectGeometryDigest(n));
});
test('New cap is a single positive solid, has two through holes, and has zero intersection volume with the source',()=>{
 const n=lidHousing(kernel),before=structuredClone(n),r=createMeshLid(n,options(n),{kernel});assert.deepEqual(n,before);assert.equal(meshTopologyClass(r.mesh).type,'closedMesh');assert.equal(r.report.fasteners.length,2);assert.equal(r.report.physicalFitTested,false);
 const cap=manifold(r.mesh),body=manifold(n.mesh),overlap=cap.intersect(body),parts=cap.decompose();try{assert.equal(cap.status(),'NoError');assert.ok(cap.volume()>0);assert.equal(parts.length,1);assert.ok(Math.abs(overlap.volume())<1e-5);
  const cut=cap.slice(19);try{const polygons=cut.toPolygons();assert.equal(polygons.length,3);for(const h of r.report.fasteners){const core=kernel.CrossSection.circle(2.24,64).translate(h.center.slice(0,2)),hit=cut.intersect(core);try{assert.ok(hit.area()<1e-6);}finally{core.delete();hit.delete();}}}finally{cut.delete();}
 }finally{cap.delete();body.delete();overlap.delete();parts.forEach(p=>p.delete());}
});
test('Open source geometry can supply a new cap; it is never silently repaired',()=>{
 const n=lidHousing(kernel,{damaged:true}),before=JSON.stringify(n),r=createMeshLid(n,options(n),{kernel});assert.equal(JSON.stringify(n),before);assert.equal(r.report.sourceSolidProven,false);assert.equal(r.report.solidProven,true);
});
test('Transforms, nonuniform scales and reflection preserve physical thickness; deformed bores are not invented as circles',()=>{
 const cases=[new Matrix4().makeRotationX(.43),new Matrix4().makeScale(-1.2,.9,1.4),new Matrix4().set(1,.2,.1,20,0,1,0,-10,0,0,1.3,4,0,0,0,1)];
 for(const matrix of cases){const n=lidHousing(kernel);n.transform=matrix.toArray();const a=analyzeMeshLids(n),expectedNormal=new Vector3(0,0,1).transformDirection(matrix).normalize();
  const c=a.candidates.find(c=>new Vector3(...c.normal).dot(expectedNormal)>.8);assert.ok(c);const r=createMeshLid(n,{geometryDigest:a.geometryDigest,candidateId:c.candidateId,normal:c.normal},{kernel});
  const points=[];for(let i=0;i<r.mesh.verts.length;i+=3)points.push(new Vector3(...r.mesh.verts.slice(i,i+3)).applyMatrix4(matrix));const normal=new Vector3(...c.normal),max=Math.max(...points.map(p=>p.dot(normal))),plane=new Vector3(...c.planePoint).dot(normal);assert.ok(Math.abs(max-plane-2.5)<1e-4);
  assert.equal(c.fasteners.length,matrix===cases[0]?2:0);
  for(const h of c.fasteners){const distances=[5,67].map(y=>new Vector3(24,y,18).applyMatrix4(matrix).distanceTo(new Vector3(...h.center)));assert.ok(Math.min(...distances)<.01);}
  const m=manifold(r.mesh);try{assert.equal(m.status(),'NoError');assert.ok(m.volume()>0);}finally{m.delete();}
 }
});
test('Changed source geometry or placement invalidates the exact opening identity',()=>{
 const n=lidHousing(kernel),o=options(n);for(const mutate of [n=>{n.transform[12]+=1;},n=>{n.mesh.verts[0]+=.01;}]){const copy=structuredClone(n);mutate(copy);assert.throws(()=>createMeshLid(copy,o,{kernel}),{code:'MESH_LID_STALE'});}
 assert.throws(()=>createMeshLid(n,{...o,candidateId:'lid-'+'0'.repeat(24)},{kernel}),{code:'MESH_LID_STALE'});
});
test('Inner obstructions and oversized holes are rejected without changing the original',()=>{
 const n=lidHousing(kernel,{blocked:true}),before=JSON.stringify(n);assert.throws(()=>createMeshLid(n,options(n),{kernel}),{code:'MESH_LID_BLOCKED'});assert.equal(JSON.stringify(n),before);
 const good=lidHousing(kernel);assert.throws(()=>createMeshLid(good,options(good,{holeDiameter:16}),{kernel}),/Schraubenloch/);
});
test('Multiple similar openings and a solid block never become guessed lid candidates',()=>{
 const split=lidHousing(kernel,{twoOpenings:true});assert.equal(analyzeMeshLids(split).candidates.filter(c=>c.normal[2]>.9).length,0);
 const block=kernel.Manifold.cube([30,30,30]);try{const raw=block.getMesh(),n=lidHousing(kernel);n.mesh={verts:Array.from(raw.vertProperties),triangles:Array.from(raw.triVerts)};assert.equal(analyzeMeshLids(n).candidates.length,0);}finally{block.delete();}
});
test('Untrusted executable fields, malformed identities, nonfinite values and excessive triangle input are rejected',()=>{
 const n=lidHousing(kernel),o=options(n);for(const extra of [{script:'x'},{normal:[0,0,0]},{thickness:NaN},{lipHeight:0},{clearance:0},{holeDiameter:100},{candidateId:'unmeasured'}])assert.throws(()=>validateMeshLidOptions({...o,...extra}));
 const huge=structuredClone(n);huge.mesh.triangles=Array(300003).fill(0);assert.throws(()=>analyzeMeshLids(huge),{code:'MESH_LID_LIMIT'});
});
