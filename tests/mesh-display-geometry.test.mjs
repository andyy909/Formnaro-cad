import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {cadDisplayGeometry} from '../src/cad-renderer-geometry.js';
import {meshDisplayMatches,meshDisplayEdges} from '../src/mesh-display-geometry.js';

function data(g){return {verts:Array.from(g.attributes.position.array),triangles:Array.from(g.index.array)};}
test('Welded cube keeps planar normals and only twelve real edges, preserving data and triangle IDs',()=>{
  const box=new THREE.BoxGeometry(10,10,10);box.deleteAttribute('normal');box.deleteAttribute('uv');
  const welded=mergeVertices(box),source=data(welded),before=structuredClone(source),g=cadDisplayGeometry(source,true);
  for(let i=0;i<g.attributes.normal.count;i++){
    const n=new THREE.Vector3().fromBufferAttribute(g.attributes.normal,i).toArray();
    assert.equal(n.filter(v=>Math.abs(v)>.999).length,1);
  }
  assert.equal(meshDisplayEdges(g).geometry.attributes.position.count,24);
  assert.ok(meshDisplayMatches(g,source));assert.deepEqual(source,before);
  const changed=structuredClone(source);changed.verts[0]+=1;assert.equal(meshDisplayMatches(g,changed),false);
  const ray=new THREE.Raycaster(new THREE.Vector3(1,2,20),new THREE.Vector3(0,0,-1));
  const hit=geometry=>ray.intersectObject(new THREE.Mesh(geometry,new THREE.MeshBasicMaterial()),false).map(h=>[h.faceIndex,h.distance,h.point.toArray()]);
  assert.deepEqual(hit(g),hit(welded));
});
test('Cylinder sides remain smooth while caps stay planar, including duplicated STL corners',()=>{
  const cylinder=new THREE.CylinderGeometry(10,10,8,64),expanded=cylinder.toNonIndexed();
  const source={verts:Array.from(expanded.attributes.position.array),triangles:Array.from({length:expanded.attributes.position.count},(_,i)=>i)};
  const g=cadDisplayGeometry(source,true),p=g.attributes.position,n=g.attributes.normal;
  let caps=0,sides=0;
  for(let i=0;i<p.count;i+=3){
    const a=new THREE.Vector3().fromBufferAttribute(p,i),b=new THREE.Vector3().fromBufferAttribute(p,i+1),c=new THREE.Vector3().fromBufferAttribute(p,i+2);
    const cap=Math.abs(b.clone().sub(a).cross(c.clone().sub(a)).normalize().y)>.99;
    for(let k=0;k<3;k++){const v=new THREE.Vector3().fromBufferAttribute(n,i+k);if(cap){assert.ok(Math.abs(v.y)>.999);caps++;}else{const radial=new THREE.Vector3(p.getX(i+k),0,p.getZ(i+k)).normalize();assert.ok(v.dot(radial)>.998);assert.ok(Math.abs(v.y)<1e-6);sides++;}}
  }
  assert.ok(caps&&sides);assert.equal(meshDisplayEdges(g).geometry.attributes.position.count,256);
});
