import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {cadDisplayGeometry,cadVisibleRayHit} from '../src/cad-renderer-geometry.js';

function displayData(geometry){
  return {vertices:Array.from(geometry.attributes.position.array),normals:Array.from(geometry.attributes.normal.array),triangles:Array.from(geometry.index.array),faceGroups:[0,geometry.index.count,1]};
}
function mesh(geometry,z=0){const value=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));value.position.z=z;value.updateMatrixWorld(true);return value;}
function triangleTests(action){
  const original=THREE.Ray.prototype.intersectTriangle;let count=0;
  THREE.Ray.prototype.intersectTriangle=function(...args){count++;return original.apply(this,args);};
  try{return {result:action(),count};}finally{THREE.Ray.prototype.intersectTriangle=original;}
}

test('Display bounds reject dense off-silhouette picking before triangle tests',t=>{
  const source=new THREE.TorusGeometry(20,.5,16,1000),data=displayData(source),before=structuredClone(data),bounded=cadDisplayGeometry(data),unbounded=bounded.clone();unbounded.boundingBox=null;
  const raycaster=new THREE.Raycaster(new THREE.Vector3(-60,0,5),new THREE.Vector3(1,0,0)),previous=triangleTests(()=>raycaster.intersectObject(mesh(unbounded),false)),current=triangleTests(()=>raycaster.intersectObject(mesh(bounded),false));
  assert.deepEqual(current.result,previous.result);assert.equal(previous.count,32000);assert.equal(current.count,0);
  assert.deepEqual(data,before);assert.deepEqual(bounded.userData.cadFaceGroups,data.faceGroups);assert.equal(bounded.attributes.position.count,source.attributes.position.count);
  t.diagnostic(`Dense torus (32,000 triangles): triangle tests ${previous.count} -> ${current.count} for a ray inside the bounding sphere but outside the display bounds.`);
  source.dispose();bounded.dispose();unbounded.dispose();
});

test('Hidden dense bodies receive no raycasts and nearest visible source/body picking is retained',t=>{
  const source=new THREE.TorusGeometry(20,.5,8,320),geometry=cadDisplayGeometry(displayData(source)),hidden=Array.from({length:30},()=>{const value=mesh(geometry);value.visible=false;return value;}),visible=mesh(new THREE.BoxGeometry(2,2,2),10);
  visible.position.x=20;visible.updateMatrixWorld(true);
  const raycaster=new THREE.Raycaster(new THREE.Vector3(20,0,40),new THREE.Vector3(0,0,-1)),previous=triangleTests(()=>raycaster.intersectObjects([...hidden,visible],false).find(hit=>hit.object.visible)),current=triangleTests(()=>cadVisibleRayHit(raycaster,[],[...hidden,visible]));
  assert.equal(previous.result.object,visible);assert.equal(current.result.object,visible);assert.equal(current.result.distance,previous.result.distance);assert.equal(previous.count,30*5120+12);assert.equal(current.count,12);
  const near=mesh(new THREE.BoxGeometry(2,2,2),20);near.position.x=20;near.updateMatrixWorld(true);assert.equal(cadVisibleRayHit(raycaster,[visible],[near]).object,near);
  const coincident=mesh(visible.geometry,10);coincident.position.x=20;coincident.updateMatrixWorld(true);assert.equal(cadVisibleRayHit(raycaster,[coincident],[visible]).object,coincident);
  visible.visible=false;coincident.visible=false;assert.equal(cadVisibleRayHit(raycaster,[coincident],[...hidden,visible]),undefined);
  t.diagnostic(`30 hidden dense displays plus one visible body: triangle tests ${previous.count} -> ${current.count}; nearest hit and source-first tie unchanged.`);
  source.dispose();geometry.dispose();visible.geometry.dispose();near.geometry.dispose();
});

test('Display bounding boxes retain ray hits after affine placement and at reference-mesh boundaries',()=>{
  const source=new THREE.BoxGeometry(10,4,2),data=displayData(source),bounded=cadDisplayGeometry(data),unbounded=bounded.clone();unbounded.boundingBox=null;
  const a=mesh(bounded),b=mesh(unbounded),transform=new THREE.Matrix4().compose(new THREE.Vector3(3,-5,7),new THREE.Quaternion().setFromEuler(new THREE.Euler(.4,.2,-.7)),new THREE.Vector3(-2,3,.5));
  for(const value of [a,b]){value.matrixAutoUpdate=false;value.matrix.copy(transform);value.updateMatrixWorld(true);}
  for(const x of [-5,-2,0,2,5])for(const y of [-2,0,2]){
    const origin=new THREE.Vector3(x,y,20).applyMatrix4(transform),direction=new THREE.Vector3(0,0,-1).transformDirection(transform),raycaster=new THREE.Raycaster(origin,direction),expected=raycaster.intersectObject(b,false),actual=raycaster.intersectObject(a,false);
    assert.deepEqual(actual.map(hit=>[hit.distance,hit.point.toArray(),hit.faceIndex]),expected.map(hit=>[hit.distance,hit.point.toArray(),hit.faceIndex]));
  }
  const reference=cadDisplayGeometry({verts:data.vertices,triangles:data.triangles},true);assert.deepEqual(reference.boundingBox,bounded.boundingBox);assert.ok(reference.attributes.normal);assert.deepEqual(data.vertices,Array.from(bounded.attributes.position.array));
  source.dispose();bounded.dispose();unbounded.dispose();reference.dispose();
});
