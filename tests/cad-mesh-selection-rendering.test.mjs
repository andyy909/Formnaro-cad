import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createMeshSelectionOverlay,meshSelectionSurfaceHit,meshSelectionScreenContext} from '../src/cad-mesh-selection-rendering.js';

const node=()=>({id:'mesh',kind:'mesh',mesh:{verts:[0,0,0,4,0,0,4,3,0,0,3,0],triangles:[0,1,2,0,2,3]},transform:[-2,0,0,0,.5,3,0,0,0,0,1,0,11,-8,7,1]});
const dispose=group=>group.traverse(child=>{child.geometry?.dispose();child.material?.dispose();});
test('Selected original triangle and rim buffers retain full affine world placement without changing the mesh',()=>{
  const n=node(),before=JSON.stringify(n),binding={objectId:n.id,triangleIds:[1],boundaryEdges:[{id:'e:0:1',vertices:[0,1]}]},overlay=createMeshSelectionOverlay(binding,n);
  try{
    assert.equal(overlay.children.length,2);overlay.updateMatrixWorld(true);
    const selected=overlay.children[0],values=selected.geometry.attributes.position;
    assert.equal(values.count,3);
    for(let k=0;k<3;k++)assert.deepEqual(new THREE.Vector3().fromBufferAttribute(values,k).applyMatrix4(selected.matrixWorld).toArray(),new THREE.Vector3(...n.mesh.verts.slice(n.mesh.triangles[3+k]*3,n.mesh.triangles[3+k]*3+3)).applyMatrix4(new THREE.Matrix4().fromArray(n.transform)).toArray());
    assert.deepEqual(Array.from(overlay.children[1].geometry.attributes.position.array),[0,0,0,4,0,0]);
    assert.equal(selected.material.depthTest,true);assert.equal(selected.material.depthWrite,false);assert.equal(overlay.children[1].material.depthTest,true);
    assert.equal(JSON.stringify(n),before);
  }finally{dispose(overlay);}
});
test('Occlusion is established by the first visible object, while the source triangle comes from the original double geometry',()=>{
  const n=node(),localOrigin=new THREE.Vector3(3,1,5),matrix=new THREE.Matrix4().fromArray(n.transform),ray={origin:localOrigin.applyMatrix4(matrix).toArray(),direction:new THREE.Vector3(0,0,-1).transformDirection(matrix).toArray()},hit={faceIndex:999,object:{visible:true,userData:{rootId:n.id,record:{kind:'mesh'}}}};
  const actual=meshSelectionSurfaceHit(ray,hit,n);assert.equal(actual.triangleIndex,0);assert.ok(actual.point.every((value,k)=>Math.abs(value-[5.5,-5,7][k])<1e-10));
  for(const blocked of [ {...hit,object:{...hit.object,visible:false}}, {...hit,object:{...hit.object,userData:{rootId:'front-cad',record:{kind:'cad'}}}}, {...hit,object:{...hit.object,userData:{rootId:n.id,record:{kind:'mesh'},sourceTarget:{rootId:n.id,path:['old-source']}}}}])assert.equal(meshSelectionSurfaceHit(ray,blocked,n),null);
  assert.equal(meshSelectionSurfaceHit(ray,hit,{...n,kind:'referenceMesh'}),null);
});
test('Rim-only marks contain no face overlay and stale original IDs fail without touching the source',()=>{
  const n=node(),before=JSON.stringify(n),overlay=createMeshSelectionOverlay({objectId:n.id,triangleIds:[],boundaryEdges:[{id:'e:0:1',vertices:[0,1]}]},n);
  try{assert.equal(overlay.children.length,1);assert.equal(overlay.children[0].userData.meshSelection,'boundary');}finally{dispose(overlay);}
  for(const binding of [{objectId:n.id,triangleIds:[2],boundaryEdges:[]},{objectId:n.id,triangleIds:[],boundaryEdges:[{vertices:[0,4]}]},{objectId:'other',triangleIds:[0],boundaryEdges:[]}])assert.throws(()=>createMeshSelectionOverlay(binding,n));
  assert.equal(JSON.stringify(n),before);
});

test('Screen selection refuses a substituted/sectioned source and captures only visible model occluders',()=>{const meshNode={id:'screen-source',kind:'mesh',transform:new THREE.Matrix4().toArray(),mesh:{verts:[0,0,0,1,0,0,0,1,0],triangles:[0,1,2]}},bodies=new THREE.Group(),sources=new THREE.Group(),camera=new THREE.PerspectiveCamera(45,1,.1,100),canvas={getBoundingClientRect:()=>({width:200,height:200})};camera.position.z=10;camera.updateMatrixWorld(true);assert.throws(()=>meshSelectionScreenContext(camera,canvas,bodies,sources,meshNode),/Schnittansicht/);const body=new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(meshNode.mesh.verts,3)));body.userData.rootId=meshNode.id;bodies.add(body);const hidden=body.clone();hidden.userData={rootId:'hidden'};hidden.visible=false;bodies.add(hidden);const cover=body.clone();cover.userData={rootId:'cover'};sources.add(cover);const result=meshSelectionScreenContext(camera,canvas,bodies,sources,meshNode);assert.equal(result.occluders.length,1);assert.equal(result.occluders[0].mesh.triangles.length,3);body.visible=false;assert.throws(()=>meshSelectionScreenContext(camera,canvas,bodies,sources,meshNode),/Schnittansicht/);});
