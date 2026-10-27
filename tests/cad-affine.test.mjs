import test from 'node:test';
import assert from 'node:assert/strict';
import {Matrix4,Euler} from 'three';
import {cadPoint,inverseCadMatrix,multiplyCadMatrices,cadFrameSources,dissolveCadGroup,resizeCadAtCorner} from '../src/cad-affine.js';
const close=(a,b)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-9,`${a} != ${b}`));
const source=transform=>({id:'source',kind:'cad',name:'Quelle',source:'native',solid:true,transform,recipe:{type:'box',size:[20,10,8]},brep:{format:'OpenCascade-BRep',data:'Schema-Fixture',triangulation:false},stats:{bounds:{min:[-10,-5,-4],max:[10,5,4]},volume:1600,solids:1}});
function affine(){return new Matrix4().makeTranslation(5,-3,8).multiply(new Matrix4().makeRotationFromEuler(new Euler(.3,.5,-.2))).multiply(new Matrix4().makeScale(-2,.4,1.2)).multiply(new Matrix4().makeRotationZ(.7)).toArray();}

test('Dissolving a mirrored nonuniform rotated CAD group preserves shear and every original CAD source',()=>{
  const frame=affine(),node=source(new Matrix4().makeTranslation(7,2,3).multiply(new Matrix4().makeRotationX(.4)).toArray());
  const group={kind:'cad',source:'group',transform:frame,children:[node],layerId:'test',folderId:null},before=structuredClone(group),released=dissolveCadGroup(group)[0];
  assert.deepEqual(group,before);assert.deepEqual(released.recipe,node.recipe);assert.deepEqual(released.brep,node.brep);assert.equal(released.id,node.id);assert.equal(released.mesh,undefined);
  for(const p of [[0,0,0],[-10,-5,-4],[10,5,4],[3,-2,1]])close(cadPoint(released.transform,p),cadPoint(frame,cadPoint(node.transform,p)));
  const regrouped=cadFrameSources([released],frame)[0];close(regrouped.transform,node.transform);
  assert.throws(()=>cadFrameSources([{kind:'referenceMesh'}],frame),/Netzreferenzen/);
  const disabled=structuredClone(group);disabled.children[0].suppressed=true;const hidden=dissolveCadGroup(disabled)[0];assert.equal(hidden.hidden,true);assert.equal(hidden.suppressed,undefined);
});

test('CAD corner dimensions retain the opposite corner and bottom under affine shear/mirror',()=>{
  const original=source(affine()),anchor=[10,-5,-4],target=[40,25,9],next=resizeCadAtCorner(original,target,{corner:[-1,1,1]});
  close(cadPoint(next.transform,anchor),cadPoint(original.transform,anchor));
  const dimensions=[20,10,8].map((d,i)=>d*Math.hypot(...next.transform.slice(i*4,i*4+3)));close(dimensions,target);
  assert.deepEqual(next.brep,original.brep);assert.deepEqual(next.recipe,original.recipe);
  assert.throws(()=>resizeCadAtCorner(original,[0,1,1]),/CAD-Maße/);
});

test('CAD transforms never accept singular or projective matrices',()=>{
  const singular=new Matrix4().makeScale(1,0,1).toArray(),projective=new Matrix4().toArray();projective[3]=.1;
  assert.throws(()=>multiplyCadMatrices(affine(),singular));assert.throws(()=>multiplyCadMatrices(affine(),projective));
  const tiny=new Matrix4().makeScale(1e-120,1e-120,1e-120).toArray();close(multiplyCadMatrices(tiny,inverseCadMatrix(tiny)),new Matrix4().toArray());
});
