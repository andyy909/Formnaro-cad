import * as THREE from 'three';
/** Touch navigation never commits model transforms. A second finger cancels editing. */
export function installTouchNavigation({canvas,camera,orbit,mode,enabled,cancel,draw}){
  const points=new Map();let navigating=false,start=null;
  function snapshot(){const p=[...points.values()],center=p.reduce((s,v)=>({x:s.x+v.x/p.length,y:s.y+v.y/p.length}),{x:0,y:0});return {center,distance:p.length>1?Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y):0,count:p.length,position:camera.position.clone(),target:orbit.target.clone(),quaternion:camera.quaternion.clone()};}
  function stop(e){e.preventDefault();e.stopImmediatePropagation();}
  canvas.addEventListener('pointerdown',e=>{
    if(e.pointerType!=='touch'||!enabled())return;
    points.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(mode()==='view'||points.size>1||navigating){
      if(!navigating){cancel();navigating=true;}
      start=snapshot();canvas.setPointerCapture(e.pointerId);stop(e);
    }
  },true);
  canvas.addEventListener('pointermove',e=>{
    if(!points.has(e.pointerId))return;points.set(e.pointerId,{x:e.clientX,y:e.clientY});if(!navigating||!start)return;stop(e);
    const current=snapshot(),h=Math.max(1,canvas.clientHeight),dx=current.center.x-start.center.x,dy=current.center.y-start.center.y,offset=start.position.clone().sub(start.target);
    if(points.size===1){
      // Camera uses Z as up. Convert to Y-up for the spherical calculation.
      const q=new THREE.Quaternion().setFromUnitVectors(camera.up,new THREE.Vector3(0,1,0)),s=new THREE.Spherical().setFromVector3(offset.applyQuaternion(q));s.theta-=2*Math.PI*dx/h;s.phi-=2*Math.PI*dy/h;s.makeSafe();offset.setFromSpherical(s).applyQuaternion(q.invert());camera.position.copy(start.target).add(offset);orbit.target.copy(start.target);
    }else{
      const scale=2*offset.length()*Math.tan(camera.fov*Math.PI/360)/h,right=new THREE.Vector3(1,0,0).applyQuaternion(start.quaternion),up=new THREE.Vector3(0,1,0).applyQuaternion(start.quaternion),pan=right.multiplyScalar(-dx*scale).addScaledVector(up,dy*scale);
      orbit.target.copy(start.target).add(pan);const ratio=current.distance>2&&start.distance>2?start.distance/current.distance:1,desired=THREE.MathUtils.clamp(offset.length()*ratio,orbit.minDistance,orbit.maxDistance);offset.setLength(desired);camera.position.copy(orbit.target).add(offset);
    }
    camera.lookAt(orbit.target);orbit.update();draw();
  },true);
  function end(e){if(!points.has(e.pointerId))return;points.delete(e.pointerId);if(navigating){stop(e);if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);if(!points.size){navigating=false;start=null;}else start=snapshot();}}
  canvas.addEventListener('pointerup',end,true);canvas.addEventListener('pointercancel',end,true);
  window.addEventListener('blur',()=>{points.clear();navigating=false;start=null;});
}
