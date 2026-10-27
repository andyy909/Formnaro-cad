import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import Module from 'manifold-3d/manifold';
import {setKernel,makeNode,localManifold,meshData,worldManifold} from '../src/geometry.js';
import {horizontalPlane,frame,planeFromHit,resolveReference,referenceOnSurface,validWorkplane,snapPoint,projectedBounds,dropToPlane} from '../src/coordinates.js';
const kernel=await Module({wasmBinary:fs.readFileSync(new URL('../node_modules/manifold-3d/manifold.wasm',import.meta.url))});kernel.setup();setKernel(kernel);
function geometry(n){const m=localManifold(n);try{const d=meshData(m),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(d.verts,3));g.setIndex(d.triangles);return g;}finally{m.delete();}}
const near=(a,b)=>assert.ok(Math.abs(a-b)<.001,`${a} vs ${b}`);
test('Face plane follows tilted/mirrored/nonuniformly scaled reference with outward normal',()=>{
  const n=makeNode('box',[8,-4,12],{rot:[25,15,30],mirror:[1,1,-1]}),matrix=new THREE.Matrix4().compose(new THREE.Vector3(...n.pos),new THREE.Quaternion().setFromEuler(new THREE.Euler(...n.rot.map(v=>v*Math.PI/180),'ZYX')),new THREE.Vector3(20,20,-20));
  const hit=new THREE.Vector3(.1,.1,.5).applyMatrix4(matrix),p=planeFromHit(n,hit,new THREE.Vector3(0,0,1));assert.ok(validWorkplane(p));near(frame(p).axes[2].dot(new THREE.Vector3(0,0,1).applyMatrix3(new THREE.Matrix3().getNormalMatrix(matrix)).normalize()),1);
  n.pos[0]+=11;n.rot[0]+=20;n.size=[35,17,28];const moved=resolveReference(p,n);assert.ok(validWorkplane(moved));assert.ok(new THREE.Vector3(...moved.origin).distanceTo(hit)>5);const f=frame(moved);near(f.axes[0].dot(f.axes[2]),0);near(f.axes[0].clone().cross(f.axes[1]).dot(f.axes[2]),1);
  const g=geometry(n);assert.ok(referenceOnSurface(p.reference,g));g.dispose();n.params.edgeStyle='round';n.params.edgeSize=9;const round=geometry(n);assert.equal(referenceOnSurface({...p.reference,point:[.5,.5,.5]},round),false);round.dispose();
});
test('Plane-local grid and dropping use actual mesh points on inclined and vertical planes',()=>{
  for(const degrees of [37,90]){const p={...horizontalPlane(),origin:[12,3,9],orientation:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),degrees*Math.PI/180).toArray()},f=frame(p);
    const snapped=f.toLocal(snapPoint(f.toWorld(new THREE.Vector3(1.24,-2.74,7.3)),p,.5));near(snapped.x,1);near(snapped.y,-2.5);near(snapped.z,7.3);
    const n=makeNode('cylinder',[20,4,30],{size:[16,12,10],rot:[20,25,40]});const g=geometry(n),get=()=>g;dropToPlane(n,get,p);near(projectedBounds([n],get,p).min.z,0);g.dispose();
  }
});
test('512-segment solids remain closed and export geometry has more triangles',()=>{
  for(const type of ['cylinder','sphere','torus']){const low=worldManifold(makeNode(type)),high=worldManifold(makeNode(type,null,{segments:512}));try{assert.equal(high.status(),'NoError');assert.ok(high.volume()>0);assert.ok(high.numTri()>low.numTri()*3);}finally{low.delete();high.delete();}}
  for(const scope of ['vertical','all']){const n=makeNode('box',null,{params:{edgeStyle:'round',edgeScope:scope,edgeSize:3,edgeSteps:48}}),m=worldManifold(n);assert.equal(m.status(),'NoError');assert.ok(m.volume()>0);m.delete();}
  assert.throws(()=>localManifold(makeNode('thread',null,{segments:512,params:{...makeNode('thread').params,length:300,pitch:.2}})),/komplex/);
});
