import * as THREE from 'three';

/** Tiny display-only boxes. Hidden proxy material still supports ray picking;
 * it is never an export mesh or a substitute for source geometry. */
export function createCadAssemblyBoxes(){
 const group=new THREE.Group(),proxies=[];let signature=null;
 function clear(){signature=null;for(const child of [...group.children]){child.geometry.dispose();child.material.dispose();group.remove(child);}proxies.length=0;}
 function set(values){
  const next=JSON.stringify(values);if(signature===next)return;
  clear();for(const value of values){const {min,max}=value.bounds,box=new THREE.Box3(new THREE.Vector3(...min),new THREE.Vector3(...max)),shape=new THREE.BoxGeometry(...box.getSize(new THREE.Vector3()).toArray().map(v=>Math.max(v,1e-6))),wire=new THREE.EdgesGeometry(shape);shape.dispose();wire.translate(...box.getCenter(new THREE.Vector3()).toArray());const frame=new THREE.LineSegments(wire,new THREE.LineBasicMaterial({color:value.locked?0x8390a0:0x72899b}));frame.matrixAutoUpdate=false;frame.userData={rootId:value.rootId,simplified:true};group.add(frame);
   const size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3()),proxy=new THREE.Mesh(new THREE.BoxGeometry(Math.max(size.x,1e-6),Math.max(size.y,1e-6),Math.max(size.z,1e-6)),new THREE.MeshBasicMaterial({visible:false,side:THREE.DoubleSide}));proxy.position.copy(center);proxy.updateMatrix();proxy.matrixAutoUpdate=false;proxy.userData={rootId:value.rootId,simplified:true,assemblyFrame:frame};group.add(proxy);proxies.push(proxy);
  }signature=next;
 }
 function visibility(allows){for(const child of group.children)child.visible=allows(child.userData.rootId);}
 return {group,proxies,set,clear,visibility,objectsForRoot:id=>group.children.filter(child=>child.userData.rootId===id),state:()=>({parts:proxies.length,vertices:proxies.reduce((n,p)=>n+p.geometry.attributes.position.count,0)})};
}
