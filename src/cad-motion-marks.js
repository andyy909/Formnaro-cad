import * as THREE from 'three';
export function createMotionMarks(view){
 const group=new THREE.Group();view.groups.motionMarks.add(group);
 const clear=()=>{for(const o of [...group.children]){o.geometry?.dispose();o.material?.dispose();group.remove(o);}view.invalidate('motion-marks');};
 function show(hit){clear();for(const id of [hit.leftId,hit.rightId])for(const object of view.groups.bodies.children.filter(o=>o.userData.rootId===id)){object.updateWorldMatrix(true,true);const box=new THREE.Box3().setFromObject(object);if(!box.isEmpty()){const helper=new THREE.Box3Helper(box,0xe34a32);helper.material.depthTest=false;helper.renderOrder=45;group.add(helper);}}
  if(hit.points){const geometry=new THREE.BufferGeometry().setFromPoints([hit.points.from,hit.points.to].map(p=>new THREE.Vector3(...p))),line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0xe34a32,depthTest:false}));line.renderOrder=46;group.add(line);const points=new THREE.Points(geometry.clone(),new THREE.PointsMaterial({color:0xffaa00,size:9,sizeAttenuation:false,depthTest:false}));points.renderOrder=47;group.add(points);}view.invalidate('motion-marks');
 }
 return {show,clear,state:()=>({objects:group.children.length}),dispose:()=>{clear();group.removeFromParent();}};
}
