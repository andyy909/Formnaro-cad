import {Matrix4,Vector3,Quaternion,Euler} from 'three';
import {matrixArray} from './engine/geometry.js';

export function combinedBounds(bounds){
  if(!bounds.length)throw Error('Bitte zuerst ein Teil auswählen.');
  const min=[0,1,2].map(i=>Math.min(...bounds.map(b=>b.min[i]))),max=[0,1,2].map(i=>Math.max(...bounds.map(b=>b.max[i])));
  return {min,max,center:min.map((v,i)=>(v+max[i])/2),size:min.map((v,i)=>max[i]-v)};
}
// Reflect about the common world-space center; keep each parametric source intact.
export function mirrorNodes(nodes,bounds,axis){
  if(![0,1,2].includes(axis))throw Error('Ungültige Spiegelachse.');
  const center=combinedBounds(bounds).center,sign=[1,1,1];sign[axis]=-1;
  const reflection=new Matrix4().makeScale(...sign);reflection.elements[12+axis]=2*center[axis];
  return structuredClone(nodes).map(node=>{
    const matrix=new Matrix4().multiplyMatrices(reflection,new Matrix4().fromArray(matrixArray(node))),position=new Vector3(),rotation=new Quaternion(),scale=new Vector3();
    matrix.decompose(position,rotation,scale);const euler=new Euler().setFromQuaternion(rotation,'ZYX');
    node.pos=position.toArray();node.rot=[euler.x,euler.y,euler.z].map(v=>v*180/Math.PI);node.mirror=scale.toArray().map(v=>v<0?-1:1);return node;
  });
}
