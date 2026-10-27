import * as THREE from 'three';
import {planeFromHit,frame} from './coordinates.js';
export function createWorkplaneTools({scene,getNodes,commit,updateSelection}){
  let placing=false,candidate=null;const preview=new THREE.Group();scene.add(preview);const patches=new WeakMap(),status=document.getElementById('status'),defaultStatus=status.textContent;
  function clear(){for(const obj of [...preview.children]){preview.remove(obj);obj.geometry?.dispose();obj.material?.dispose();}}
  function refresh(){const button=document.querySelector('[data-action="workplane-set"]');button.classList.toggle('active',placing);button.setAttribute('aria-pressed',String(placing));status.textContent=placing?'Arbeitsebene: Fläche anklicken · Escape bricht ab':defaultStatus;}
  function surfacePatch(g,hit){
    let cache=patches.get(g);if(!cache){cache=new Map();patches.set(g,cache);}const n=hit.face.normal,a=g.getAttribute('position'),root=new THREE.Vector3().fromBufferAttribute(a,hit.face.a),distance=n.dot(root),base=n.toArray().map(v=>v.toFixed(5)).join(',')+':'+distance.toFixed(5),key=base+':'+hit.faceIndex;if(cache.has(key))return cache.get(key);
    const index=g.index,tri=new THREE.Triangle(),normal=new THREE.Vector3(),faces=[],edges=new Map();
    for(let i=0;i<(index?index.count:a.count);i+=3){const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k);tri.a.fromBufferAttribute(a,ids[0]);tri.b.fromBufferAttribute(a,ids[1]);tri.c.fromBufferAttribute(a,ids[2]);if(tri.getNormal(normal).dot(n)<.99999||Math.abs(n.dot(tri.a)-distance)>1e-5)continue;const face={ids,index:i/3,points:[tri.a.clone(),tri.b.clone(),tri.c.clone()]},id=faces.length;faces.push(face);for(let k=0;k<3;k++){const edge=[ids[k],ids[(k+1)%3]].sort((a,b)=>a-b).join(':');if(!edges.has(edge))edges.set(edge,[]);edges.get(edge).push(id);}}
    const start=faces.findIndex(f=>f.ids.includes(hit.face.a)&&f.ids.includes(hit.face.b)&&f.ids.includes(hit.face.c)),seen=new Set(),queue=start<0?[]:[start],points=[];while(queue.length){const id=queue.pop();if(seen.has(id))continue;seen.add(id);const f=faces[id];points.push(...f.points);for(let k=0;k<3;k++){const edge=[f.ids[k],f.ids[(k+1)%3]].sort((a,b)=>a-b).join(':');queue.push(...edges.get(edge).filter(i=>!seen.has(i)));}}for(const id of seen)cache.set(base+':'+faces[id].index,points);return points;
  }
  function begin(){placing=true;candidate=null;clear();refresh();updateSelection();}
  function hover(hit){clear();candidate=null;if(!placing||!hit?.face)return;const node=getNodes().find(n=>n.id===hit.object.userData.id);if(!node)return;candidate=planeFromHit(node,hit.point,hit.face.normal);
    const g=hit.object.geometry,points=surfacePatch(g,hit).map(p=>p.clone().applyMatrix4(hit.object.matrixWorld));
    const face=new THREE.Mesh(new THREE.BufferGeometry().setFromPoints(points),new THREE.MeshBasicMaterial({color:0xffbb48,transparent:true,opacity:.65,side:THREE.DoubleSide,depthTest:false}));face.renderOrder=30;preview.add(face);
    const f=frame(candidate),plane=new THREE.Mesh(new THREE.PlaneGeometry(45,45),new THREE.MeshBasicMaterial({color:0xf7b64b,transparent:true,opacity:.22,side:THREE.DoubleSide,depthTest:false}));plane.position.copy(f.origin);plane.quaternion.copy(f.q);plane.renderOrder=29;preview.add(plane);const axes=new THREE.AxesHelper(18);axes.position.copy(f.origin);axes.quaternion.copy(f.q);preview.add(axes);
  }
  function accept(hit){hover(hit);if(!candidate)return false;const p=structuredClone(candidate);placing=false;clear();refresh();commit(p);return true;}
  function escape(){if(!placing)return false;placing=false;candidate=null;clear();refresh();updateSelection();return true;}
  return {begin,hover,accept,escape,isPlacing:()=>placing};
}
