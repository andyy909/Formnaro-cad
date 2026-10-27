import * as THREE from 'three';
import {inspectionDrag} from './inspection-math.js';

// The moving cut changes one shared shader plane. No CAD work, mesh copies,
// tessellation or per-frame triangle traversal occurs during a drag.
export function createCadSectionPreview({renderer,scene,bodies,outlines,getCamera,projectPoint,orbit,invalidate}){
 const group=new THREE.Group();scene.add(group);
 const plane=new THREE.Plane(),raycaster=new THREE.Raycaster(),materials=new Map();let config=null,drag=null,handle=null;
 function release(){for(const [material,old]of materials){material.clippingPlanes=old;material.needsUpdate=true;}materials.clear();}
 function clear(){const captured=drag?.id;drag=null;if(captured!==undefined&&canvas.hasPointerCapture(captured))canvas.releasePointerCapture(captured);release();for(const child of [...group.children]){child.traverse(c=>{c.geometry?.dispose();c.material?.dispose();});child.removeFromParent();}config=null;handle=null;renderer.localClippingEnabled=false;orbit.enabled=true;invalidate('section-clear');}
 function resume(){renderer.localClippingEnabled=true;if(materials.size)return;for(const root of [bodies,outlines])root.traverse(object=>{if(!config.ids.has(object.userData.rootId))return;for(const material of Array.isArray(object.material)?object.material:[object.material])if(material&&!materials.has(material)){materials.set(material,material.clippingPlanes);material.clippingPlanes=[plane];material.needsUpdate=true;}});}
 function update(offset){if(!config||!Number.isFinite(offset))return;resume();config.offset=offset;const n=new THREE.Vector3(...config.normal),sign=config.side==='negative'?-1:1;plane.normal.copy(n).multiplyScalar(sign);plane.constant=-offset*sign;
  const center=new THREE.Vector3(...config.center);center.addScaledVector(n,offset-center.dot(n));group.position.copy(center);group.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),n);group.updateMatrixWorld(true);invalidate('section-drag');
 }
 function start(options){
  const signature=JSON.stringify([options.ids,options.normal,options.center,options.size]);
  if(config?.signature===signature){Object.assign(config,{...options,ids:new Set(options.ids)});update(options.offset);return;}
  clear();config={...options,signature,ids:new Set(options.ids)};
  const size=options.size,fill=new THREE.Mesh(new THREE.PlaneGeometry(size,size),new THREE.MeshBasicMaterial({color:'#3cbcc8',side:THREE.DoubleSide,transparent:true,opacity:.09,depthWrite:false}));fill.renderOrder=24;group.add(fill);
  const border=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[-size/2,-size/2,0],[size/2,-size/2,0],[size/2,size/2,0],[-size/2,size/2,0]].map(p=>new THREE.Vector3(...p))),new THREE.LineBasicMaterial({color:'#288c9f',transparent:true,opacity:.85,depthTest:false}));border.renderOrder=40;group.add(border);
  handle=new THREE.Mesh(new THREE.SphereGeometry(size*.025,12,8),new THREE.MeshBasicMaterial({color:'#ffbb42',depthTest:false}));handle.position.set(-size*.5,0,0);handle.renderOrder=42;group.add(handle);
  const stem=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-size*.5,0,-size*.12),new THREE.Vector3(-size*.5,0,size*.12)]),new THREE.LineBasicMaterial({color:'#ffbb42',depthTest:false}));stem.renderOrder=41;group.add(stem);update(options.offset);
 }
 function finish(){release();renderer.localClippingEnabled=false;invalidate('section-exact');}
 function hit(event){if(!handle||!config)return false;const r=renderer.domElement.getBoundingClientRect();scene.updateMatrixWorld(true);raycaster.setFromCamera(new THREE.Vector2((event.clientX-r.left)/r.width*2-1,1-(event.clientY-r.top)/r.height*2),getCamera());return !!raycaster.intersectObject(handle).length;}
 const canvas=renderer.domElement;
 canvas.addEventListener('pointerdown',event=>{if(event.button!==0||!hit(event))return;event.preventDefault();event.stopImmediatePropagation();const at=handle.getWorldPosition(new THREE.Vector3()),a=projectPoint(at.toArray()),b=projectPoint(at.clone().add(new THREE.Vector3(...config.normal)).toArray());drag={id:event.pointerId,start:{x:event.clientX,y:event.clientY},offset:config.offset,axis:{x:b.x-a.x,y:b.y-a.y}};orbit.enabled=false;canvas.setPointerCapture(event.pointerId);},true);
 canvas.addEventListener('pointermove',event=>{if(!drag||event.pointerId!==drag.id)return;event.preventDefault();event.stopImmediatePropagation();const offset=Math.max(config.min,Math.min(config.max,drag.offset+inspectionDrag(drag.start,{x:event.clientX,y:event.clientY},drag.axis)));config.onMove(offset,false);},true);
 canvas.addEventListener('pointerup',event=>{if(!drag||event.pointerId!==drag.id)return;event.preventDefault();event.stopImmediatePropagation();drag=null;orbit.enabled=true;if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);config?.onMove(config.offset,true);},true);
 for(const name of ['pointercancel','lostpointercapture'])canvas.addEventListener(name,event=>{if(drag?.id!==event.pointerId)return;drag=null;orbit.enabled=true;config?.onMove(config.offset,true);},true);
 return {start,update,finish,clear,group,rebind:()=>{if(config&&materials.size){release();resume();}},state:()=>config?{offset:config.offset,dragging:!!drag,materials:materials.size,handle:handle?.getWorldPosition(new THREE.Vector3()).toArray(),normal:[...config.normal]}:null,dispose:()=>{clear();group.removeFromParent();}};
}
