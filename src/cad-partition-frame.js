import {cadPoint,inverseCadMatrix} from './cad-affine.js';
import {cadPartitionDirection} from './cad-partition-data.js';

/** Pull back a world plane as a covector. Keep the body's entire affine
 * frame (including reflection/shear), and choose a local origin without an
 * arbitrary large tangential component. Distance remains physical in world. */
export function cadPartitionLocalPlane(origin,normal,matrix){
 const scale=Math.max(...[0,1,2,4,5,6,8,9,10].map(i=>Math.abs(matrix[i]))),raw=[0,1,2].map(column=>normal.reduce((sum,v,row)=>sum+v*(matrix[column*4+row]/scale),0)),unit=cadPartitionDirection(raw),amplification=Math.hypot(...raw)*scale,distance=normal.reduce((sum,v,i)=>sum+v*(origin[i]-matrix[12+i]),0)/amplification;
 if(!Number.isFinite(distance))throw Error('Die Teilungsebene ist in diesem CAD-Bezug nicht endlich darstellbar.');return {origin:unit.map(v=>v*distance),normal:unit};
}
export function cadPartitionWorldPlane(plane,matrix){
 const inverse=inverseCadMatrix(matrix),scale=Math.max(...[0,1,2,4,5,6,8,9,10].map(i=>Math.abs(inverse[i]))),raw=[0,1,2].map(row=>plane.normal.reduce((sum,v,k)=>sum+v*(inverse[row*4+k]/scale),0)),normal=cadPartitionDirection(raw),point=cadPoint(matrix,plane.origin),distance=normal.reduce((sum,v,k)=>sum+v*point[k],0);return {origin:normal.map(v=>v*distance),normal};
}
