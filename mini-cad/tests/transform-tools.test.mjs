import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Matrix4,Vector3} from 'three';
import {createNode} from '../src/model.js';
import {matrixArray} from '../src/engine/geometry.js';
import {combinedBounds,mirrorNodes} from '../src/transform-tools.js';
const bounds=[{min:[-14,-9,3],max:[8,19,25]},{min:[20,2,-7],max:[35,42,51]}];
test('world reflection preserves rotated asymmetric geometry and relative selection positions',()=>{
  const a=createNode('cone'),b=createNode('box');a.pos=[-3,5,17];a.rot=[23,71,-41];a.size=[12,24,39];a.mirror=[1,-1,1];b.pos=[29,23,12];b.rot=[90,0,22];b.children=[structuredClone(a)];
  const source=JSON.stringify([a,b]),center=combinedBounds(bounds).center;
  for(const axis of [0,1,2]){
    const mirrored=mirrorNodes([a,b],bounds,axis);
    mirrored.forEach((n,i)=>{
      const oldMatrix=new Matrix4().fromArray(matrixArray([a,b][i])),newMatrix=new Matrix4().fromArray(matrixArray(n));
      for(const point of [[0,0,0],[.1,-.4,.5],[-.5,.5,-.5]]){
        const expected=new Vector3(...point).applyMatrix4(oldMatrix);expected.setComponent(axis,2*center[axis]-expected.getComponent(axis));
        assert(expected.distanceTo(new Vector3(...point).applyMatrix4(newMatrix))<1e-9);
      }
      assert(Math.abs(Math.abs(newMatrix.determinant())-Math.abs(oldMatrix.determinant()))<1e-7);assert.deepEqual(n.params,[a,b][i].params);assert.deepEqual(n.children,[a,b][i].children);
    });
    const twice=mirrorNodes(mirrored,bounds,axis);twice.forEach((n,i)=>matrixArray(n).forEach((v,j)=>assert(Math.abs(v-matrixArray([a,b][i])[j])<1e-9)));
  }assert.equal(JSON.stringify([a,b]),source);
});
test('common dimensions use actual world bounds across the entire selection',()=>{assert.deepEqual(combinedBounds(bounds),{min:[-14,-9,-7],max:[35,42,51],size:[49,51,58],center:[10.5,16.5,22]});});
test('invalid reflection axis and empty measurements fail before changing sources',()=>{const n=createNode('box'),before=JSON.stringify(n);assert.throws(()=>mirrorNodes([n],bounds,3),/Spiegelachse/);assert.throws(()=>combinedBounds([]),/auswählen/);assert.equal(JSON.stringify(n),before);});
