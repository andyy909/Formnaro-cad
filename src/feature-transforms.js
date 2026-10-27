import * as THREE from 'three';
import {matrixArray} from './geometry.js';
const DEG=Math.PI/180;
export function parentMatrix(context){
  const matrix=new THREE.Matrix4();
  for(const parent of context.chain.slice(0,-1))matrix.multiply(new THREE.Matrix4().fromArray(matrixArray({...parent,size:parent.size.map((v,i)=>v/parent.baseSize[i])})));
  return matrix;
}
export function featureMatrix(context){return parentMatrix(context).multiply(new THREE.Matrix4().fromArray(matrixArray(context.node)));}
export function localDelta(worldDelta,parent){return worldDelta.clone().applyMatrix4(new THREE.Matrix4().copy(parent).invert()).sub(new THREE.Vector3().applyMatrix4(new THREE.Matrix4().copy(parent).invert()));}
export function rotateLocal(node,delta){
  const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...node.rot.map(v=>v*DEG),'ZYX')).multiply(delta).normalize();
  node.rot=new THREE.Euler().setFromQuaternion(q,'ZYX').toArray().slice(0,3).map(v=>v/DEG);
}
// Manipulate the original TRS, never decompose an affine world delta into a
// sheared child. Ancestor nonuniform scaling and mirrors remain untouched.
export function transformFeature(node,original,parent,start,current,mode){
  node.pos=[...original.pos];node.size=[...original.size];node.rot=[...original.rot];node.mirror=[...original.mirror];
  if(mode==='translate')node.pos=new THREE.Vector3(...original.pos).add(localDelta(current.position.clone().sub(start.position),parent)).toArray();
  else if(mode==='rotate')rotateLocal(node,start.quaternion.clone().invert().multiply(current.quaternion));
  else if(mode==='scale')node.size=original.size.map((v,i)=>v*current.scale.getComponent(i)/start.scale.getComponent(i));
}
