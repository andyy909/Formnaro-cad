import * as THREE from 'three';
const Z=new THREE.Vector3(0,0,1);
export function placementOnSurface(node,data,surface,{snap=1,align=true}={}){
  const point=new THREE.Vector3(...surface.point),normal=new THREE.Vector3(...surface.normal);
  if(!point.toArray().every(Number.isFinite)||!normal.toArray().every(Number.isFinite)||normal.lengthSq()<.5||!data?.verts?.length)throw Error('Keine gültige Ablagefläche.');
  normal.normalize();
  const origin=surface.origin?new THREE.Vector3(...surface.origin):point.clone();
  const tangent=surface.tangent?new THREE.Vector3(...surface.tangent):new THREE.Vector3(1,0,0);
  tangent.addScaledVector(normal,-tangent.dot(normal));if(tangent.lengthSq()<1e-10)tangent.set(0,1,0).addScaledVector(normal,-normal.y);tangent.normalize();
  const bitangent=new THREE.Vector3().crossVectors(normal,tangent).normalize();
  if(snap>0){const d=point.clone().sub(origin),u=d.dot(tangent),v=d.dot(bitangent);point.addScaledVector(tangent,Math.round(u/snap)*snap-u).addScaledVector(bitangent,Math.round(v/snap)*snap-v);}
  const rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(...node.rot.map(v=>v*Math.PI/180),'ZYX'));
  if(align){const up=Z.clone().applyQuaternion(rotation);rotation.premultiply(new THREE.Quaternion().setFromUnitVectors(up,normal));}
  const euler=new THREE.Euler().setFromQuaternion(rotation,'ZYX');
  // Contact uses the exact Euler pose we persist, including its finite
  // precision near a 90-degree orientation.
  const matrix=new THREE.Matrix4().compose(new THREE.Vector3(),new THREE.Quaternion().setFromEuler(euler),new THREE.Vector3(...node.size.map((v,i)=>v*(node.mirror?.[i]||1))));
  let min=Infinity;const vertex=new THREE.Vector3();
  for(let i=0;i<data.verts.length;i+=3){vertex.fromArray(data.verts,i).applyMatrix4(matrix);min=Math.min(min,vertex.dot(normal));}
  if(!Number.isFinite(min))throw Error('Die Form hat keine gültige Auflage.');
  const position=point.clone().addScaledVector(normal,-min);
  return {pos:position.toArray(),rot:[euler.x,euler.y,euler.z].map(v=>v*180/Math.PI),anchor:point.toArray(),normal:normal.toArray(),targetId:surface.targetId||null};
}
export function rectangleHits(rect,box){return box.right>=rect.left&&box.left<=rect.right&&box.bottom>=rect.top&&box.top<=rect.bottom;}
