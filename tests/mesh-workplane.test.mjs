import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'manifold-3d/manifold';
import * as THREE from 'three';
import {meshWorkplaneGeometryDigest,validateMeshWorkplaneReference,makeMeshWorkplane,resolveMeshWorkplane,synchronizeMeshWorkplane} from '../src/mesh-workplane.js';
import {createMeshEngineAdapter} from '../src/mesh-engine-adapter.js';
import {makeNode,matrixArray} from '../src/mesh-engine/geometry.js';
import {geometryKey,planeFromHit} from '../src/mesh-engine/coordinates.js';
import {defaultOrganization} from '../src/mesh-engine/organization.js';

const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const node=(kind='mesh')=>({id:'open',kind,name:'Offenes Dreieck',transform:[...identity],mesh:{verts:[0,0,0,20,0,0,0,20,0],triangles:[0,1,2]},color:'#109ca9',layerId:'default',folderId:null});
const near=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
const vectorNear=(a,b,tolerance=1e-8)=>a.forEach((x,i)=>near(x,b[i],tolerance));
const axes=plane=>{const q=new THREE.Quaternion(...plane.orientation);return [[1,0,0],[0,1,0],[0,0,1]].map(v=>new THREE.Vector3(...v).applyQuaternion(q));};

test('an open mesh or reference face anchors in local geometry without a body proof',()=>{
  for(const kind of ['mesh','referenceMesh']){const n=node(kind),p=makeMeshWorkplane(n,0,[5,6,0]);assert.equal(p.reference.kind,'mesh');assert.equal(p.reference.objectId,n.id);assert.equal(p.reference.triangleIndex,0);assert.deepEqual(p.reference.point,[5,6,0]);vectorNear(p.origin,[5,6,0]);vectorNear(axes(p)[2].toArray(),[0,0,1]);assert.deepEqual(validateMeshWorkplaneReference(p.reference,{node:n}),p.reference);}
});

test('geometry identity ignores full placement, kind, role and appearance but catches any exact mesh edit',()=>{
  const n=node(),digest=meshWorkplaneGeometryDigest(n),other=structuredClone(n);Object.assign(other,{kind:'referenceMesh',color:'#ffee44',name:'renamed',meshRole:'hole',transform:[-2,.3,0,0,1,3,.4,0,0,.2,.5,0,14,-8,50,1]});assert.equal(meshWorkplaneGeometryDigest(other),digest);delete other.meshRole;
  other.mesh.verts[0]=.0000001;assert.notEqual(meshWorkplaneGeometryDigest(other),digest);other.mesh.verts[0]=0;other.mesh.triangles=[0,2,1];assert.notEqual(meshWorkplaneGeometryDigest(other),digest);
});

test('full affine moves, shear and reflections update point and normal without decomposing the object',()=>{
  const n=node(),p=makeMeshWorkplane(n,0,[5,6,0]),original=structuredClone(p.reference);n.transform=[-2,.3,0,0,1,3,.4,0,.6,.2,.5,0,14,-8,50,1];const moved=resolveMeshWorkplane(p,n),matrix=new THREE.Matrix4().fromArray(n.transform),expectedPoint=new THREE.Vector3(5,6,0).applyMatrix4(matrix),expectedNormal=new THREE.Vector3(0,0,1).applyMatrix3(new THREE.Matrix3().getNormalMatrix(matrix)).normalize();
  vectorNear(moved.origin,expectedPoint.toArray());vectorNear(axes(moved)[2].toArray(),expectedNormal.toArray());near(axes(moved)[0].dot(axes(moved)[2]),0);near(axes(moved)[0].clone().cross(axes(moved)[1]).dot(axes(moved)[2]),1);assert.deepEqual(moved.reference,original);assert.deepEqual(n.transform,matrix.toArray());
});

test('numerically invertible tiny affine scales retain an orthonormal plane, while singular scales reject',()=>{
  const n=node();n.transform=[1e-200,0,0,0,0,2e-200,0,0,0,0,-3e-200,0,0,0,0,1];const p=makeMeshWorkplane(n,0);vectorNear(axes(p)[2].toArray(),[0,0,-1]);near(axes(p)[0].length(),1);n.transform[0]=0;assert.throws(()=>makeMeshWorkplane(n,0),/invertierbar/);
});

test('invalid triangle/anchor/normal/tangent and extra fields are rejected',()=>{
  const n=node(),p=makeMeshWorkplane(n,0,[5,6,0]);
  for(const change of [r=>r.triangleIndex=1,r=>r.point=[30,30,0],r=>r.point=[5,6,1],r=>r.normal=[0,0,-1],r=>r.tangent=[0,0,1],r=>r.normal=[0,0,2],r=>r.geometryDigest='0'.repeat(64),r=>r.kind='cad',r=>r.extra=1,r=>r.point=[NaN,0,0]]){const ref=structuredClone(p.reference);change(ref);assert.throws(()=>validateMeshWorkplaneReference(ref,{node:n}));}
  assert.throws(()=>makeMeshWorkplane(n,5));assert.throws(()=>makeMeshWorkplane(n,0,[30,30,0]));const degenerate=node();degenerate.mesh.verts=[0,0,0,1,0,0,2,0,0];assert.throws(()=>makeMeshWorkplane(degenerate,0));
  const malformed={nodes:[n],workplane:structuredClone(p)};malformed.workplane.reference.extra=1;assert.throws(()=>synchronizeMeshWorkplane(malformed),/Flächenbezug/);
});

test('geometry change detaches to the resolved last confirmed plane and keeps unrelated CAD/mesh nodes',()=>{
  const n=node(),plane=makeMeshWorkplane(n,0,[5,6,0]);n.transform[12]=20;const cad={id:'native',kind:'cad',recipe:{type:'box'}},baseline={nodes:[n,cad],workplane:plane,name:'project'},candidate=structuredClone(baseline);candidate.nodes[0].mesh.verts[0]=1;candidate.nodes[0].transform[12]=100;candidate.workplane.origin=[999,999,999];
  const before=structuredClone(candidate),result=synchronizeMeshWorkplane(candidate,baseline);assert.equal(result.detached,true);assert.equal(result.project.workplane.reference,null);vectorNear(result.project.workplane.origin,[25,6,0]);assert.equal(result.warnings.length,1);assert.deepEqual(result.project.nodes,before.nodes);assert.deepEqual(candidate,before);assert.equal(result.project.nodes,candidate.nodes);
});

test('deleting a mesh reference target detaches, while native planes and free planes remain untouched',()=>{
  const n=node(),plane=makeMeshWorkplane(n,0,[5,6,0]),baseline={nodes:[n],workplane:plane},removed={nodes:[],workplane:structuredClone(plane)},result=synchronizeMeshWorkplane(removed,baseline);assert.equal(result.detached,true);assert.equal(result.project.workplane.reference,null);assert.deepEqual(result.project.workplane.origin,plane.origin);
  for(const reference of [null,{objectId:'native',topology:{kind:'face'}}]){const project={nodes:[],workplane:{origin:[0,0,0],orientation:[0,0,0,1],reference}};assert.equal(synchronizeMeshWorkplane(project).project,project);}
});

test('synchronization follows a transformed geometry-only identity and changes no history source',()=>{
  const n=node(),project={nodes:[n],workplane:makeMeshWorkplane(n,0,[5,6,0])};assert.equal(synchronizeMeshWorkplane(project).project,project);const moved=structuredClone(project);moved.nodes[0].transform[14]=12;moved.nodes[0].meshRole='hole';moved.nodes[0].color='#112233';const result=synchronizeMeshWorkplane(moved);assert.equal(result.detached,false);assert.equal(result.warnings.length,0);vectorNear(result.project.workplane.origin,[5,6,12]);assert.deepEqual(result.project.workplane.reference,project.workplane.reference);
});

const kernel=await Module({wasmBinary:fs.readFileSync(new URL('../node_modules/manifold-3d/manifold.wasm',import.meta.url))});kernel.setup();const engine=createMeshEngineAdapter({kernel});
function legacy(){const body={...makeNode('box',[30,-12,7],{id:'box',size:[20,10,8],rot:[0,0,30]}),layerId:'default',folderId:null},point=new THREE.Vector3(0,0,.5).applyMatrix4(new THREE.Matrix4().fromArray(matrixArray(body))),workplane=planeFromHit(body,point,new THREE.Vector3(0,0,1));return {format:'OfflineCAD',version:4,name:'Legacy face',nodes:[body],bed:[200,200],workplane,coordinateMode:'plane',...defaultOrganization(),ruler:null,workspace:{projection:'orthographic',position:[120,-130,90],target:[20,0,4],zoom:2.5,section:null}};}

test('legacy mesh face and common camera activate only with matching source identity and exact archive',()=>{
  const input=legacy(),before=structuredClone(input),encoded=JSON.stringify(input),result=engine.importLegacy(encoded),p=result.project;assert.deepEqual(input,before);assert.equal(p.migrationSource.data,encoded);assert.equal(p.workplane.reference.kind,'mesh');assert.equal(p.workplane.reference.objectId,'box');vectorNear(p.workplane.origin,input.workplane.origin);vectorNear(axes(p.workplane)[2].toArray(),axes(input.workplane)[2].toArray());assert.deepEqual(p.workspace.view,{projection:'orthographic',position:[120,-130,90],target:[20,0,4],up:[0,0,1],zoom:2.5});assert.equal(result.warnings.length,1);assert.equal(geometryKey(input.nodes[0]),input.workplane.reference.geometryKey);
});

test('legacy stale keys keep the last fixed plane; invalid views remain archived while valid old section views become shared view state',()=>{
  const input=legacy();input.workplane.reference.geometryKey='stale';input.workspace.section=[0,0,1,-4];const encoded=JSON.stringify(input),result=engine.importLegacy(encoded);assert.equal(result.project.workplane.reference,null);assert.deepEqual(result.project.workplane.origin,input.workplane.origin);assert.ok(result.warnings.some(v=>v.includes('Netzflächenbezug')));assert.equal(result.project.workspace.version,3);assert.deepEqual(result.project.workspace.section,{normal:[0,0,1],offset:4,side:'positive',ids:['box']});assert.equal(result.project.migrationSource.data,encoded);assert.ok(result.project.workspace);
  const invalid=legacy();invalid.workspace.position=[0,0,0];invalid.workspace.target=[0,0,0];const fallback=engine.importLegacy(JSON.stringify(invalid));assert.equal(fallback.project.workspace,undefined);assert.ok(fallback.warnings.some(v=>v.includes('Netz-Ansicht')));
});
