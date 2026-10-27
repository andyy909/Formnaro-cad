import {Vector3,Quaternion,Matrix4} from 'three';
export function inspectionPlane(axis,offset,workplane){
 if(!['plane','0','1','2'].includes(axis)||!Number.isFinite(offset))throw Error('Gültige Schnittebene und endlichen Versatz wählen.');
 const q=axis==='plane'?new Quaternion(...workplane.orientation):axis==='0'?new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.PI/2):axis==='1'?new Quaternion().setFromAxisAngle(new Vector3(1,0,0),-Math.PI/2):new Quaternion(),normal=new Vector3(0,0,1).applyQuaternion(q),origin=axis==='plane'?new Vector3(...workplane.origin):new Vector3();origin.addScaledVector(normal,offset);
 return {normal:normal.toArray(),offset:normal.dot(origin),frame:new Matrix4().makeRotationFromQuaternion(q).setPosition(origin).toArray()};
}
export function inspectionRange(bounds,normal,originOffset=0){
 if(!bounds.length)throw Error('Sichtbare Materialkörper für die Schnittansicht wählen.');
 let min=Infinity,max=-Infinity;
 for(const b of bounds)for(let i=0;i<8;i++){const dot=normal.reduce((s,n,k)=>s+n*(i&(1<<k)?b.max[k]:b.min[k]),0)-originOffset;min=Math.min(min,dot);max=Math.max(max,dot);}
 const margin=Math.max(.5,(max-min)*.02);return {min:min-margin,max:max+margin};
}
// Screen projection of the normal: stable in perspective and orthographic views.
// A nearly end-on normal has no usable screen direction; the slider stays usable.
export function inspectionDrag(start,end,screenAxis){const length=screenAxis.x**2+screenAxis.y**2;if(length<.01)return 0;return ((end.x-start.x)*screenAxis.x+(end.y-start.y)*screenAxis.y)/length;}
