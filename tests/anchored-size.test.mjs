import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {makeNode,matrixArray} from '../src/geometry.js';
import {resizeAnchored} from '../src/scene-tools.js';
test('Editing dimensions preserves the opposite corner of a rotated and mirrored part',()=>{
  const n=makeNode('box',[12,18,30],{size:[30,20,10],rot:[23,31,67],mirror:[-1,1,1]});
  for(const corner of [[1,1],[-1,1],[1,-1],[-1,-1]]){
    const node=structuredClone(n),fixedLocal=new THREE.Vector3(-corner[0]/2,-corner[1]/2,-.5),before=fixedLocal.clone().applyMatrix4(new THREE.Matrix4().fromArray(matrixArray(node)));
    resizeAnchored(node,[42.5,27,15],corner);const after=fixedLocal.clone().applyMatrix4(new THREE.Matrix4().fromArray(matrixArray(node)));
    assert.ok(before.distanceTo(after)<1e-9);assert.deepEqual(node.size,[42.5,27,15]);
  }
});
