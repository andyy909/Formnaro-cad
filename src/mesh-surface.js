import * as THREE from 'three';
import {prepareReferenceGeometry,referencesAtHit,chooseReference} from './mesh-engine/mesh-reference.js';

const cache=new WeakMap();
export function meshSurfaceGeometry(node){
 let geometry=cache.get(node.mesh);if(!geometry){geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float64Array(node.mesh.verts),3));geometry.setIndex(node.mesh.triangles);geometry.computeBoundingBox();geometry.computeBoundingSphere();if(Object.isFrozen(node.mesh))cache.set(node.mesh,geometry);}return geometry;
}
export function meshSurfaceHit(node,ray){
 const geometry=meshSurfaceGeometry(node),object=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));object.matrixAutoUpdate=false;object.matrixWorld.fromArray(node.transform);
 const caster=new THREE.Raycaster(new THREE.Vector3(...ray.origin),new THREE.Vector3(...ray.direction).normalize(),ray.near??0,ray.far??1e9),hit=caster.intersectObject(object,false)[0];object.material.dispose();
 if(!hit)return null;const ids=node.mesh.triangles.slice(hit.faceIndex*3,hit.faceIndex*3+3),normal=new THREE.Triangle(...ids.map(i=>new THREE.Vector3(...node.mesh.verts.slice(i*3,i*3+3)))).getNormal(new THREE.Vector3()).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(object.matrixWorld));
 return {objectId:node.id,point:hit.point.toArray(),normal:normal.toArray(),triangleIndex:hit.faceIndex,distance:hit.distance};
}
export async function meshReferenceAt(node,hit,{event,projectPoint,mode='surface',signal}={}){
 if(mode==='surface')return {...hit,kind:'surface'};
 const topology=await prepareReferenceGeometry(meshSurfaceGeometry(node),{signal}),references=await referencesAtHit(topology,hit.triangleIndex,new THREE.Matrix4().fromArray(node.transform),{signal}),chosen=chooseReference(references,new THREE.Vector3(...hit.point),new THREE.Vector2(event.clientX,event.clientY),point=>{const p=projectPoint(point.toArray());return new THREE.Vector2(p.x,p.y);},mode);
 if(!chosen)throw Error('Keinen passenden Bezugspunkt getroffen. Näher an eine Ecke, Kante oder einen vollständigen Kreis klicken.');return {...hit,point:chosen.point.toArray(),normal:chosen.normal.toArray(),kind:chosen.kind};
}
