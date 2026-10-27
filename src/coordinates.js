import * as THREE from 'three';
import {matrixArray} from './geometry.js';

export const horizontalPlane=(z=0)=>({origin:[0,0,z],orientation:[0,0,0,1],reference:null});
export function validWorkplane(p){
  const vec=(v,n,limit)=>Array.isArray(v)&&v.length===n&&v.every(x=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=limit);
  return !!p&&vec(p.origin,3,100000)&&vec(p.orientation,4,1)&&Math.abs(Math.hypot(...p.orientation)-1)<1e-5&&(!p.reference||
    (typeof p.reference.objectId==='string'&&vec(p.reference.point,3,2)&&vec(p.reference.normal,3,1)&&vec(p.reference.tangent,3,1)&&Math.abs(Math.hypot(...p.reference.normal)-1)<1e-5&&Math.abs(Math.hypot(...p.reference.tangent)-1)<1e-5&&Math.abs(new THREE.Vector3(...p.reference.normal).dot(new THREE.Vector3(...p.reference.tangent)))<1e-5&&typeof p.reference.geometryKey==='string'));
}
export function frame(plane){
  const origin=new THREE.Vector3(...plane.origin),q=new THREE.Quaternion(...plane.orientation);
  const matrix=new THREE.Matrix4().compose(origin,q,new THREE.Vector3(1,1,1));
  return {origin,q,matrix,inverse:matrix.clone().invert(),axes:[0,1,2].map(i=>new THREE.Vector3().setFromMatrixColumn(matrix,i)),toLocal:p=>p.clone().sub(origin).applyQuaternion(q.clone().invert()),toWorld:p=>p.clone().applyQuaternion(q).add(origin)};
}
export function snapPoint(point,plane,step,normal=false){const f=frame(plane),p=f.toLocal(point);for(let i=0;i<(normal?3:2);i++)if(step)p.setComponent(i,Math.round(p.getComponent(i)/step)*step);return f.toWorld(p);}
export function projectedBounds(nodes,getGeometry,plane=horizontalPlane()){
  const b=new THREE.Box3(),inverse=frame(plane).inverse,p=new THREE.Vector3();
  for(const n of nodes){const matrix=inverse.clone().multiply(new THREE.Matrix4().fromArray(matrixArray(n))),a=getGeometry(n).getAttribute('position');for(let i=0;i<a.count;i++)b.expandByPoint(p.fromBufferAttribute(a,i).applyMatrix4(matrix));}return b;
}
export function dropToPlane(node,getGeometry,plane){const amount=-projectedBounds([node],getGeometry,plane).min.z,delta=frame(plane).axes[2].multiplyScalar(amount);node.pos=node.pos.map((v,i)=>v+delta.getComponent(i));}
export function geometryKey(n){
  const value=JSON.stringify([n.type,n.segments,n.text,n.params,n.params&&!n.mesh?n.size:null,n.mesh]);let hash=2166136261;for(let i=0;i<value.length;i++)hash=Math.imul(hash^value.charCodeAt(i),16777619);return String(hash>>>0);
}
function orientation(normal,tangent){const u=tangent.clone().addScaledVector(normal,-tangent.dot(normal)).normalize(),v=normal.clone().cross(u).normalize();return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(u,v,normal)).normalize().toArray();}
export function planeFromHit(node,point,localNormal){
  const matrix=new THREE.Matrix4().fromArray(matrixArray(node)),inverse=matrix.clone().invert(),normal=localNormal.clone().normalize();
  let tangent=new THREE.Vector3(1,0,0).addScaledVector(normal,-normal.x);if(tangent.lengthSq()<1e-8)tangent=new THREE.Vector3(0,1,0).addScaledVector(normal,-normal.y);tangent.normalize();
  const reference={objectId:node.id,point:point.clone().applyMatrix4(inverse).toArray(),normal:normal.toArray(),tangent:tangent.toArray(),geometryKey:geometryKey(node)};
  return resolveReference({...horizontalPlane(),reference},node);
}
export function resolveReference(plane,node){
  const r=plane.reference,matrix=new THREE.Matrix4().fromArray(matrixArray(node)),normal=new THREE.Vector3(...r.normal).applyMatrix3(new THREE.Matrix3().getNormalMatrix(matrix)).normalize(),tangent=new THREE.Vector3(...r.tangent).transformDirection(matrix);
  return {...plane,origin:new THREE.Vector3(...r.point).applyMatrix4(matrix).toArray(),orientation:orientation(normal,tangent)};
}
export function referenceOnSurface(reference,geometry){
  const a=geometry.getAttribute('position'),index=geometry.index,count=index?index.count:a.count,p=new THREE.Vector3(...reference.point),normal=new THREE.Vector3(...reference.normal),triangle=new THREE.Triangle(),candidate=new THREE.Vector3();
  for(let i=0;i<count;i+=3){triangle.a.fromBufferAttribute(a,index?index.getX(i):i);triangle.b.fromBufferAttribute(a,index?index.getX(i+1):i+1);triangle.c.fromBufferAttribute(a,index?index.getX(i+2):i+2);if(triangle.getNormal(candidate).dot(normal)<.999)continue;if(triangle.closestPointToPoint(p,candidate).distanceToSquared(p)<4e-6)return true;}return false;
}
