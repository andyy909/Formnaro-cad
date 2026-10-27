import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {inspectionPlane,inspectionRange,inspectionDrag} from '../src/inspection-math.js';
import {createCadSectionPreview} from '../src/cad-section-preview.js';
test('Section plane follows arbitrary workplane, offsets and negative axes without model data',()=>{
 const workplane={origin:[10,20,30],orientation:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2).toArray()},p=inspectionPlane('plane',7,workplane);assert.ok(Math.abs(p.normal[1]+1)<1e-12);assert.ok(Math.abs(p.offset+13)<1e-12);assert.throws(()=>inspectionPlane('wrong',0,workplane));assert.throws(()=>inspectionPlane('2',NaN,workplane));
 const range=inspectionRange([{min:[-10,-20,0],max:[10,20,30]}],[1,0,0]);assert.ok(range.min< -10&&range.max>10);assert.equal(inspectionDrag({x:0,y:0},{x:20,y:10},{x:2,y:1}),10);assert.equal(inspectionDrag({x:0,y:0},{x:20,y:10},{x:0,y:0}),0);
});
test('Thousands of live plane updates preserve geometry/material identity and restore every clipping plane',()=>{
 const scene=new THREE.Scene(),bodies=new THREE.Group(),outlines=new THREE.Group(),handlers={},renderer={domElement:{addEventListener:(n,cb)=>{handlers[n]=cb;}},localClippingEnabled:false},orbit={enabled:true},material=new THREE.MeshBasicMaterial(),old=[new THREE.Plane()],otherMaterial=new THREE.MeshBasicMaterial();material.clippingPlanes=old;
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(),material);mesh.userData.rootId='target';bodies.add(mesh);const other=new THREE.Mesh(new THREE.BoxGeometry(),otherMaterial);other.userData.rootId='other';bodies.add(other);const preview=createCadSectionPreview({renderer,scene,bodies,outlines,getCamera:()=>new THREE.PerspectiveCamera(),projectPoint:p=>({x:p[0],y:p[2]}),orbit,invalidate:()=>{}}),base={normal:[0,0,1],offset:0,side:'negative',ids:['target'],center:[0,0,0],size:30,min:-20,max:20,onMove:()=>{}};
 preview.start(base);const geometry=mesh.geometry,handleGeometry=preview.group.children[2].geometry;for(let i=0;i<2000;i++)preview.update(i/100);assert.equal(mesh.geometry,geometry);assert.equal(mesh.material,material);assert.equal(preview.group.children[2].geometry,handleGeometry);assert.equal(otherMaterial.clippingPlanes,null);assert.equal(preview.state().materials,1);assert.ok(material.clippingPlanes[0].normal.z<0);
 preview.finish();assert.equal(material.clippingPlanes,old);assert.equal(renderer.localClippingEnabled,false);preview.start({...base,offset:8});assert.equal(preview.group.children[2].geometry,handleGeometry);assert.equal(material.clippingPlanes[0].constant,8);preview.clear();assert.equal(material.clippingPlanes,old);assert.equal(otherMaterial.clippingPlanes,null);assert.equal(preview.state(),null);assert.equal(orbit.enabled,true);preview.dispose();mesh.geometry.dispose();other.geometry.dispose();material.dispose();otherMaterial.dispose();
});
