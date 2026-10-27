import * as THREE from 'three';
export const AI_ERROR_COLOR='#e93b57';
// A sampled comparison locates measured discrepancies, never an entire faulty
// region. Other checks identify only a part, so color that part explicitly.
export function aiPreviewErrorMarks(verification){
 const rootIds=new Set(),segments=[];
 const point=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
 for(const check of verification?.checks??[]){
  if(check.passed!==false)continue;
  let localized=false;
  if(check.kind==='surfaceDeviation')for(const direction of check.actual?.directions??[])for(const sample of direction.worst??[]){
   if(sample.distance>check.expected&&point(sample.sourcePoint)&&point(sample.targetPoint)){segments.push([...sample.sourcePoint],[...sample.targetPoint]);localized=true;}
  }
  if(!localized&&check.target?.rootId)rootIds.add(check.target.rootId);
 }
 return {rootIds:[...rootIds],segments};
}
export function createAIErrorOverlay(verification){
 const marks=aiPreviewErrorMarks(verification),group=new THREE.Group();group.userData.aiErrorMarks=marks;
 if(marks.segments.length){
  const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(marks.segments.flat(),3));
  const lines=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:AI_ERROR_COLOR,depthTest:false,depthWrite:false}));lines.renderOrder=65;group.add(lines);
  const dots=new THREE.Points(geometry.clone(),new THREE.PointsMaterial({color:AI_ERROR_COLOR,size:9,sizeAttenuation:false,depthTest:false,depthWrite:false}));dots.renderOrder=66;group.add(dots);
 }
 return group;
}
