import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Matrix4} from 'three';
import {createNode,validateProject,emptyProject} from '../src/model.js';
import {matrixArray} from '../src/engine/geometry.js';
import {selectionFrame,resizeSelection,rotateSelection,rotationSnap} from '../src/manipulation.js';
const near=(a,b)=>a.forEach((v,i)=>assert(Math.abs(v-b[i])<1e-7,`${a} != ${b}`));
test('rotation inside circle snaps to 15 degrees, outside stays fine and Shift forces stops',()=>{
  for(const [angle,target]of [[14,15],[44,45],[89,90],[-44,-45],[-89,-90],[359,360],[404,405]])assert.deepEqual(rotationSnap(angle,true),{degrees:target,step:15});
  assert.deepEqual(rotationSnap(44.2,false),{degrees:44,step:1});assert.deepEqual(rotationSnap(44.2,false,true),{degrees:45,step:15});assert.throws(()=>rotationSnap(NaN,true));
});
test('corner resize uses rotated local axes and holds opposite bottom corner fixed',()=>{
  const n=createNode('roundbox');n.rot=[23,41,-17];n.mirror=[-1,1,1];const original=JSON.stringify(n),frame=selectionFrame([n]),anchor=new Vector3(-n.size[0]/2,-n.size[1]/2,-n.size[2]/2).applyMatrix4(frame.matrix);
  const [resized]=resizeSelection([n],frame,{point:[30,40,-n.size[2]/2],snap:0});near(resized.size,[30+n.size[0]/2,40+n.size[1]/2,n.size[2]]);const next=selectionFrame([resized]),held=new Vector3(-resized.size[0]/2,-resized.size[1]/2,-resized.size[2]/2).applyMatrix4(next.matrix);near(held.toArray(),anchor.toArray());assert.deepEqual(resized.params,n.params);assert.deepEqual(resized.mirror,n.mirror);assert.equal(JSON.stringify(n),original);
});
test('height resize anchors bottom and uniform multiple-part resize avoids shearing',()=>{
  const a=createNode('box'),b=createNode('cylinder');a.rot=[11,22,33];b.pos=[50,0,10];b.rot=[-21,17,0];const f=selectionFrame([a]);const [high]=resizeSelection([a],f,{kind:'z',point:[0,0,30],snap:0});assert.equal(high.size[2],40);near(high.pos,new Vector3(0,0,10).applyMatrix4(f.matrix).toArray());
  const frame=selectionFrame([a,b]),size=frame.size.toArray(),point=[1.5*size[0],1.5*size[1],-size[2]/2],resized=resizeSelection([a,b],frame,{point,snap:0});
  resized.forEach((n,i)=>{near(n.size,[a,b][i].size.map(v=>v*2));assert.deepEqual(n.rot,[a,b][i].rot);});near(resized[1].pos.map((v,i)=>v-resized[0].pos[i]),b.pos.map((v,i)=>(v-a.pos[i])*2));
});
test('resize clamps positive dimensions without flipping and rejects invalid gestures',()=>{
  const n=createNode('box'),f=selectionFrame([n]);for(const point of [[-100,-100,0],[1e9,1e9,0]]){const [next]=resizeSelection([n],f,{point});validateProject({...emptyProject(),nodes:[next]});assert(next.size.every(v=>v>=.01&&v<=10000));assert.deepEqual(next.mirror,n.mirror);}assert.throws(()=>resizeSelection([n],f,{point:[NaN,2,3]}));assert.throws(()=>resizeSelection([n],f,{point:[2]}));
});
test('axis rotation preserves sources and dimensions and rotates selection rigidly',()=>{
  const a=createNode('box'),b=createNode('cone');a.rot=[13,22,-9];a.children=[structuredClone(b)];b.pos=[50,20,30];const originals=JSON.stringify([a,b]),f=selectionFrame([a,b]);
  for(const axis of [0,1,2]){const result=rotateSelection([a,b],f,axis,90);near(result[1].size,b.size);assert.deepEqual(result[0].children,a.children);const undo=rotateSelection(result,f,axis,-90);undo.forEach((n,i)=>near(matrixArray(n),matrixArray([a,b][i])));const distance=(p,q)=>new Vector3(...p).distanceTo(new Vector3(...q));assert(Math.abs(distance(result[0].pos,result[1].pos)-distance(a.pos,b.pos))<1e-7);}assert.equal(JSON.stringify([a,b]),originals);assert.throws(()=>rotateSelection([a],f,5,30));
});
