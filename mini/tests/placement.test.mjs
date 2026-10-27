import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import Module from 'manifold-3d/manifold';
import {createOperations} from '../src/operations.js';
import {createNode,SHAPES} from '../src/model.js';
import {placementOnSurface,rectangleHits} from '../src/placement.js';
import {matrixArray} from '../src/engine/geometry.js';
let run;
before(async()=>{const k=await Module();k.setup();run=createOperations(k);});
function contact(node,data,result,point,normal){
  const n=new THREE.Vector3(...normal).normalize(),p=new THREE.Vector3(...point),m=new THREE.Matrix4().fromArray(matrixArray({...node,...result}));let min=Infinity;
  for(let i=0;i<data.verts.length;i+=3){const v=new THREE.Vector3().fromArray(data.verts,i).applyMatrix4(m);min=Math.min(min,v.sub(p).dot(n));}return min;
}
test('all primitive bottoms touch the ground at dragged coordinates without penetrating it',async()=>{
  for(const [type]of SHAPES){const node=createNode(type),[{data}]=await run('render',[node]),surface={point:[37.4,-18.2,0],normal:[0,0,1],origin:[0,0,0],tangent:[1,0,0]};const placed=placementOnSurface(node,data,surface);assert.equal(placed.pos[0],37);assert.equal(placed.pos[1],-18);assert(Math.abs(contact(node,data,placed,surface.point,surface.normal))<1e-8,type);}
});
test('rotated sloping and vertical planes align local up and exact mesh support',async()=>{
  const node=createNode('roundbox'),[{data}]=await run('render',[node]);
  for(const normal of [[0,0,1],[1,0,0],[0,-1,0],[0,0,-1],[.3,.5,.8],[-.2,.6,-.7]]){
    const p={point:[21,8,33],normal};const result=placementOnSurface(node,data,p,{snap:0,align:true});assert(Math.abs(contact(node,data,result,p.point,normal))<1e-7);
    const rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(...result.rot.map(v=>v*Math.PI/180),'ZYX')),up=new THREE.Vector3(0,0,1).applyQuaternion(rotation);assert(up.dot(new THREE.Vector3(...normal).normalize())>1-1e-10);
  }
});
test('surface raster stays on a tilted plane rather than rounding world Z',async()=>{
  const node=createNode('box'),[{data}]=await run('render',[node]),normal=new THREE.Vector3(0,.6,.8),u=new THREE.Vector3(1,0,0),v=new THREE.Vector3().crossVectors(normal,u),origin=new THREE.Vector3(10,20,30),point=origin.clone().addScaledVector(u,2.44).addScaledVector(v,-3.62);
  const result=placementOnSurface(node,data,{point:point.toArray(),normal:normal.toArray(),origin:origin.toArray(),tangent:u.toArray()},{snap:1});const delta=new THREE.Vector3(...result.anchor).sub(origin);assert(Math.abs(delta.dot(normal))<1e-9);assert(Math.abs(delta.dot(u)-2)<1e-9);assert(Math.abs(delta.dot(v)+4)<1e-9);assert(Math.abs(contact(node,data,result,origin.toArray(),normal.toArray()))<1e-8);
});
test('disabled alignment preserves rotation and still touches plane; mirrors remain valid',async()=>{
  const node=createNode('cone');node.rot=[23,41,12];node.mirror=[-1,1,1];const [{data}]=await run('render',[node]);const normal=[.4,.5,.7],point=[10,20,30],result=placementOnSurface(node,data,{point,normal},{snap:0,align:false});result.rot.forEach((v,i)=>assert(Math.abs(v-node.rot[i])<1e-8));assert(Math.abs(contact(node,data,result,point,normal))<1e-8);
});
test('placement is pure and does not modify sources, holes or input geometry',async()=>{
  const n=createNode('cylinder');n.solid=false;n.params.edgeSize=2;const [{data}]=await run('render',[n]),before=JSON.stringify({n,data});const result=placementOnSurface(n,data,{point:[2,3,9],normal:[0,0,1]});assert(result.pos[2]>9);assert.equal(JSON.stringify({n,data}),before);
});
test('invalid normals and empty geometry are rejected; rectangle intersection includes touched parts',async()=>{
  const n=createNode('box'),[{data}]=await run('render',[n]);assert.throws(()=>placementOnSurface(n,data,{point:[0,0,0],normal:[0,0,0]}));assert.throws(()=>placementOnSurface(n,{verts:[]},{point:[0,0,0],normal:[0,0,1]}));assert(rectangleHits({left:0,right:10,top:0,bottom:10},{left:9,right:20,top:9,bottom:20}));assert(!rectangleHits({left:0,right:10,top:0,bottom:10},{left:11,right:20,top:11,bottom:20}));
});
