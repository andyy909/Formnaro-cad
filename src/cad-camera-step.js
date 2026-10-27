// OrbitControls reconstructs spherical coordinates even with no pending input.
// Preserve the exact idle pose after draining its internal damping, so capture,
// workspace inspection and ordinary repaint cannot dirty a saved view.
export function createCadCameraStep({getCamera,orbit}){
 const pose=()=>{const camera=getCamera();return [...camera.position.toArray(),...camera.quaternion.toArray(),...orbit.target.toArray(),camera.zoom];};
 let lastPose=pose();
 return ()=>{
  const before=pose(),changed=orbit.update(),after=pose(),moving=after.some((v,i)=>Math.abs(v-before[i])>Number.EPSILON*32*Math.max(1,Math.abs(v),Math.abs(before[i]))),moved=after.some((v,i)=>v!==lastPose[i]);
  if(!moving&&moved){
   if(orbit.enableDamping){const damping=orbit.enableDamping;orbit.enableDamping=false;orbit.update();orbit.enableDamping=damping;}
   const camera=getCamera();camera.position.fromArray(before);camera.quaternion.fromArray(before,3);orbit.target.fromArray(before,7);camera.zoom=before[10];camera.updateMatrixWorld(true);
  }
  lastPose=pose();return {changed,moving};
 };
}
