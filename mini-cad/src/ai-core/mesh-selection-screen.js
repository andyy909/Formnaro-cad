import * as THREE from 'three';
import {meshSelectionGeometryDigest} from './mesh-selection-data.js';

const fail=text=>{throw Error(text);};
const check=signal=>{if(signal?.aborted)throw Object.assign(Error('Auswahl abgebrochen.'),{name:'AbortError'});};
function segmentDistance(p,a,b){const x=b[0]-a[0],y=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*x+(p[1]-a[1])*y)/(x*x+y*y||1)));return Math.hypot(p[0]-a[0]-t*x,p[1]-a[1]-t*y);}
export function insideMeshSelectionPath(p,path,mode,radius){
 if(mode==='brush'){if(path.length===1)return Math.hypot(p[0]-path[0][0],p[1]-path[0][1])<=radius;return path.some((b,i)=>i&&segmentDistance(p,path[i-1],b)<=radius);}
 let inside=false;for(let i=0,j=path.length-1;i<path.length;j=i++){
  const a=path[j],b=path[i];if(segmentDistance(p,a,b)<1e-7)return true;
  if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }return inside;
}
/** Float64 world-space BVH for visibility of original triangle centres. The
 * private worker can be terminated during construction or dense queries. No
 * display triangle number is ever used as a source face ID. */
export function createMeshScreenIndex(node,context,{signal}={}){
 check(signal);const {width,height,viewProjection,occluders=[]}=context??{};
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1||width>20000||height>20000||!Array.isArray(viewProjection)||viewProjection.length!==16||viewProjection.some(n=>!Number.isFinite(n))||!Array.isArray(occluders))fail('Ungültige Ansicht für die Flächenauswahl.');
 const vp=new THREE.Matrix4().fromArray(viewProjection),inv=vp.clone().invert();if(Math.abs(vp.determinant())<1e-25)fail('Die Kamera kann nicht ausgewertet werden.');
 const records=[{mesh:node.mesh,transform:node.transform},...occluders];let total=0;
 for(const r of records){const mesh=r.mesh;if(!mesh||!Array.isArray(mesh.verts)||!Array.isArray(mesh.triangles)||mesh.verts.length%3||mesh.triangles.length%3||!Array.isArray(r.transform)||r.transform.length!==16||r.transform.some(n=>!Number.isFinite(n)))fail('Ungültige Verdeckungsgeometrie.');total+=mesh.triangles.length/3;}
 if(total>1500000||node.mesh.triangles.length/3>500000)fail('Pinsel und Lasso unterstützen bis zu 500.000 Dreiecke im Netz und 1.500.000 sichtbare Dreiecke insgesamt. Andere Teile ausblenden oder isolieren.');
 const positions=new Float64Array(total*9),centres=new Float64Array(total*3),order=Uint32Array.from({length:total},(_,i)=>i),v=new THREE.Vector3();let face=0;
 for(const r of records){const m=new THREE.Matrix4().fromArray(r.transform),{verts,triangles}=r.mesh;
  for(let i=0;i<triangles.length;i+=3,face++){if(!(face%2048))check(signal);
   for(let k=0;k<3;k++){const id=triangles[i+k];if(!Number.isSafeInteger(id)||id<0||id>=verts.length/3)fail('Ungültiges Dreieck in der Ansicht.');v.fromArray(verts,id*3).applyMatrix4(m);if(![v.x,v.y,v.z].every(Number.isFinite))fail('Ungültige Netzkoordinaten.');v.toArray(positions,face*9+k*3);for(let a=0;a<3;a++)centres[face*3+a]+=positions[face*9+k*3+a]/3;}
  }
 }
 function build(lo,hi){
  check(signal);const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=lo;i<hi;i++){const id=order[i];for(let k=0;k<9;k++){const a=k%3,x=positions[id*9+k];min[a]=Math.min(min[a],x);max[a]=Math.max(max[a],x);}}
  const tree={min,max,lo,hi};if(hi-lo<=16)return tree;
  const spans=max.map((x,a)=>x-min[a]),axis=spans.indexOf(Math.max(...spans)),mid=(lo+hi)>>1;
  // In-place quickselect avoids sorting/copying half-million face arrays.
  let left=lo,right=hi-1;while(left<right){const pivot=centres[order[(left+right)>>1]*3+axis];let i=left,j=right;while(i<=j){while(centres[order[i]*3+axis]<pivot)i++;while(centres[order[j]*3+axis]>pivot)j--;if(i<=j){const t=order[i];order[i++]=order[j];order[j--]=t;}}if(mid<=j)right=j;else if(mid>=i)left=i;else break;}
  tree.left=build(lo,mid);tree.right=build(mid,hi);return tree;
 }
 const tree=build(0,total),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),point=new THREE.Vector3();
 function first(ray,far=ray.selectionFar??Infinity){let distance=far,found=-1;
  function box(t){let near=0,end=distance;for(let k=0;k<3;k++){const origin=ray.origin.getComponent(k),direction=ray.direction.getComponent(k);if(Math.abs(direction)<1e-18){if(origin<t.min[k]||origin>t.max[k])return false;}else{let x=(t.min[k]-origin)/direction,y=(t.max[k]-origin)/direction;if(x>y)[x,y]=[y,x];near=Math.max(near,x);end=Math.min(end,y);if(end<near)return false;}}return true;}
  const stack=[tree];while(stack.length){const t=stack.pop();if(!box(t))continue;if(t.left){stack.push(t.left,t.right);continue;}for(let i=t.lo;i<t.hi;i++){const id=order[i];a.fromArray(positions,id*9);b.fromArray(positions,id*9+3);c.fromArray(positions,id*9+6);if(ray.intersectTriangle(a,b,c,false,point)){const d=point.distanceTo(ray.origin);if(d<distance){distance=d;found=id;}}}}
  return {id:found,distance};
 }
 const rayAt=(x,y)=>{const near=new THREE.Vector3(x/width*2-1,1-y/height*2,-1).applyMatrix4(inv),far=new THREE.Vector3(x/width*2-1,1-y/height*2,1).applyMatrix4(inv);const limit=far.distanceTo(near),ray=new THREE.Ray(near,far.sub(near).normalize());ray.selectionFar=limit;return ray;};
 return {node,context,positions,centres,vp,first,rayAt,geometryDigest:meshSelectionGeometryDigest(node),sourceCount:node.mesh.triangles.length/3};
}
export function queryMeshScreenSelection(index,{mode,path,radius=24},{signal}={}){
 if(!['brush','lasso'].includes(mode)||!Array.isArray(path)||!path.length||path.length>2048||path.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)))||!Number.isFinite(radius)||radius<2||radius>150)fail('Ungültiger Auswahlstrich.');
 if(mode==='lasso'){
  // Signed polygon area cancels for valid crossed (even-odd) contours. Only
  // reject a truly flat/tiny trace, not two oppositely traversed lobes.
  const a=path[0],b=path.find(p=>Math.hypot(p[0]-a[0],p[1]-a[1])>1),area=b?Math.max(...path.map(p=>Math.abs((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])))):0;
  if(path.length<3||area<4)fail('Für das Lasso eine Fläche mit mindestens drei Punkten umfahren.');
 }
 const selected=new Set(),p=new THREE.Vector3(),v=new THREE.Vector4(),{width,height}=index.context;
 for(let id=0;id<index.sourceCount;id++){
  if(!(id%512))check(signal);p.fromArray(index.centres,id*3);v.set(p.x,p.y,p.z,1).applyMatrix4(index.vp);
  if(v.w<=0)continue;const x=v.x/v.w,y=v.y/v.w,z=v.z/v.w;if(x< -1||x>1||y< -1||y>1||z< -1||z>1)continue;
  const sx=(x+1)*width/2,sy=(1-y)*height/2;if(!insideMeshSelectionPath([sx,sy],path,mode,radius))continue;
  const ray=index.rayAt(sx,sy),d=p.distanceTo(ray.origin),hit=index.first(ray,d+Math.max(1e-7,d*1e-9));if(hit.id===id)selected.add(id);
 }
 // Brush samples also hit large triangles whose centre lies outside the disk.
 if(mode==='brush')for(const sample of path){check(signal);const hit=index.first(index.rayAt(...sample));if(hit.id>=0&&hit.id<index.sourceCount)selected.add(hit.id);}
 return {format:'FormnaroMeshSelection',version:1,objectId:index.node.id,geometryDigest:index.geometryDigest,triangleIds:[...selected].sort((a,b)=>a-b),boundaryEdges:[]};
}
