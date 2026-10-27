import test from 'node:test';
import assert from 'node:assert/strict';
import {Matrix4,Quaternion} from 'three';
import {cadSelectionContext,cadFormLocalDimensions,cadFormOrientation,cadSetFormOrientation,cadFormPosition,cadSetFormPosition,cadResizeForm,cadAssignSource} from '../src/cad-interface-state.js';
import {cadIdentity,cadPoint} from '../src/cad-affine.js';
import {createCadProject} from '../src/cad-project.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} vs ${b}`);
const node=()=>({id:'body',kind:'cad',source:'native',recipe:{type:'box',size:[10,8,6]},name:'body',solid:true,transform:[-2,.2,0,0,.45,1.1,0,0,.3,.1,1.4,0,4,5,6,1],stats:{bounds:{min:[-5,-4,-3],max:[5,4,3]},volume:480,solids:1},brep:{format:'OpenCascade-BRep',data:'isolated DTO fixture',triangulation:false},layerId:'default',folderId:null});
const gram=matrix=>Array.from({length:9},(_,i)=>{const a=Math.floor(i/3),b=i%3;return [0,1,2].reduce((sum,row)=>sum+matrix[a*4+row]*matrix[b*4+row],0);});
test('Inspector rotation preserves native source Gram matrix, handedness and center under full shear',()=>{
  const before=node(),next=cadSetFormOrientation(before,[30,20,-40]);gram(before.transform).forEach((v,i)=>near(v,gram(next.transform)[i]));near(new Matrix4().fromArray(next.transform).determinant(),new Matrix4().fromArray(before.transform).determinant());cadPoint(before.transform,[0,0,0]).forEach((v,i)=>near(v,cadPoint(next.transform,[0,0,0])[i]));cadFormOrientation(next).forEach((v,i)=>near(v,[30,20,-40][i]));assert.deepEqual(before,node());
});
test('Inspector source dimensions and anchored resizing preserve the opposite bottom corner',()=>{
  const before=node(),current=cadFormLocalDimensions(before),next=cadResizeForm(before,[current[0]*1.5,current[1],current[2]]),after=cadFormLocalDimensions(next);near(after[0],current[0]*1.5);near(after[1],current[1]);near(after[2],current[2]);cadPoint(before.transform,[-5,-4,-3]).forEach((v,i)=>near(v,cadPoint(next.transform,[-5,-4,-3])[i]));
  const proportional=cadResizeForm(before,[current[0],current[1]*2,current[2]],{axis:1,proportions:true});cadFormLocalDimensions(proportional).forEach((v,i)=>near(v,current[i]*2));
});
test('Inspector positions use workplane coordinates for roots and parent coordinates for nested sources',()=>{
  const body=node(),project=createCadProject({nodes:[body],coordinateMode:'plane',workplane:{origin:[10,-2,4],orientation:new Quaternion().setFromAxisAngle({x:0,y:0,z:1},Math.PI/2).toArray(),reference:null}}),target={rootId:body.id,path:[]};cadFormPosition(project,target).forEach((v,i)=>near(v,[7,6,2][i]));const moved=cadSetFormPosition(project,target,[3,2,1]);near(moved.transform[12],8);near(moved.transform[13],1);near(moved.transform[14],5);assert.deepEqual(moved.transform.slice(0,12),body.transform.slice(0,12));
  const group={...structuredClone(body),id:'group',source:'group',operation:'union',children:[body]};delete group.recipe;group.transform=cadIdentity();group.transform[4]=.4;group.transform[12]=20;const nested=createCadProject({nodes:[group]}),sourceTarget={rootId:group.id,path:[body.id]};assert.deepEqual(cadFormPosition(nested,sourceTarget),[4,5,6]);const next=cadSetFormPosition(nested,sourceTarget,[8,9,10]);cadAssignSource(nested,sourceTarget,next);assert.deepEqual(cadFormPosition(nested,sourceTarget),[8,9,10]);assert.deepEqual(nested.nodes[0].transform,group.transform);
  nested.layers[0].locked=true;assert.equal(cadSelectionContext(nested,sourceTarget).locked,true);assert.throws(()=>cadSetFormPosition(nested,sourceTarget,[0,0,0]),/gesperrt/);
});
test('Reference mesh inspector retains full affine visual placement without introducing constructive CAD data',()=>{
  const reference={id:'isolated-reference',kind:'referenceMesh',name:'Reference',transform:node().transform,mesh:{verts:[-2,-3,-4,2,-3,-4,-2,3,-4,-2,-3,4],triangles:[0,1,2,0,3,1,0,2,3,1,3,2]}},project=createCadProject({nodes:[reference],coordinateMode:'world'}),target={rootId:reference.id,path:[]},before=cadFormLocalDimensions(reference),scaled=cadResizeForm(reference,[before[0]*2,before[1],before[2]]);
  near(cadFormLocalDimensions(scaled)[0],before[0]*2);cadPoint(reference.transform,[-2,-3,-4]).forEach((v,i)=>near(v,cadPoint(scaled.transform,[-2,-3,-4])[i]));const rotated=cadSetFormOrientation(reference,[10,20,30]);gram(reference.transform).forEach((v,i)=>near(v,gram(rotated.transform)[i]));const moved=cadSetFormPosition(project,target,[2,4,6]);cadAssignSource(project,target,moved);assert.deepEqual(cadFormPosition(project,target),[2,4,6]);assert.equal(project.nodes[0].kind,'referenceMesh');assert.equal(project.nodes[0].brep,undefined);assert.equal(project.nodes[0].recipe,undefined);assert.deepEqual(project.nodes[0].mesh,reference.mesh);
});
