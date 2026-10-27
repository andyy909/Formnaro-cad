import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Matrix4} from 'three';
import {alignNodes,patternNodes,distanceMove} from '../src/quick-tools.js';
import {createNode,emptyProject,encodeProject,decodeProject} from '../src/model.js';
import {matrixArray} from '../src/engine/geometry.js';
test('edge alignment fixes reference and respects supplied physical rotated bounds',()=>{
  const a=createNode('box'),b=createNode('tube');b.pos=[30,5,12];b.rot=[11,24,35];const before=structuredClone([a,b]),bounds=[{id:a.id,min:[-10,-10,0],max:[10,10,20]},{id:b.id,min:[12,-8,1],max:[48,18,23]}];
  for(const [edge,delta]of [['min',-22],['center',-30],['max',-38]]){const out=alignNodes([a,b],bounds,0,edge,a.id);assert.deepEqual(out[0],a);assert.equal(out[1].pos[0],b.pos[0]+delta);assert.deepEqual(out[1].params,b.params);}
  assert.deepEqual([a,b],before);assert.throws(()=>alignNodes([a,b],bounds,0,'min','missing'));
});
test('patterns preserve recipe, recursive source IDs, mirror and exact transforms',()=>{
  const a=createNode('box');a.rot=[15,24,37];a.mirror=[-1,1,1];a.pos=[20,0,10];a.children=undefined;
  const copies=patternNodes([a],{kind:'circle',count:4,center:[0,0,10]},1);assert.equal(copies.length,3);
  const world=new Matrix4().fromArray(matrixArray(a));copies.forEach((n,i)=>{const expected=new Matrix4().makeTranslation(0,0,10).multiply(new Matrix4().makeRotationZ((i+1)*Math.PI/2)).multiply(new Matrix4().makeTranslation(0,0,-10)).multiply(world),actual=new Matrix4().fromArray(matrixArray(n));actual.elements.forEach((v,j)=>assert(Math.abs(v-expected.elements[j])<1e-8));assert.notEqual(n.id,a.id);assert.deepEqual(n.params,a.params);});
  const grid=patternNodes([a],{kind:'grid',count:3,rows:2,step:[12,0,0],rowStep:17},1);assert.equal(grid.length,5);assert.deepEqual(grid.at(-1).pos,[44,17,10]);
  assert.throws(()=>patternNodes([a],{kind:'grid',count:100,rows:100},1));assert.throws(()=>patternNodes([a],{count:2.5},1));
});
test('exact point spacing moves only unlocked second object and preserves metadata',()=>{
  const a=createNode('box'),b=createNode('tube');a.notes='M4';b.folder='Halter';b.pos=[20,0,10];const nodes=[a,b],points=[{id:a.id,point:[0,0,0]},{id:b.id,point:[3,4,0]}];
  const moved=distanceMove(points,10,nodes);assert.deepEqual(moved[0],a);assert.deepEqual(moved[1].pos,[23,4,10]);assert.equal(moved[1].folder,'Halter');assert.deepEqual(nodes[1].pos,[20,0,10]);assert.throws(()=>distanceMove(points,-1,nodes));assert.throws(()=>distanceMove(points,10,[a,{...b,locked:true}]));assert.throws(()=>distanceMove([{...points[0]},{...points[1],id:a.id}],10,nodes));
  const p={...emptyProject(),nodes:moved};assert.deepEqual(decodeProject(encodeProject(p)),p);assert.throws(()=>encodeProject({...p,nodes:[{...a,folder:42}]}));
});
