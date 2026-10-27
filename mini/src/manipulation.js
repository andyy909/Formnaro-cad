import {Vector3,Quaternion,Euler,Matrix4,Box3} from 'three';
import {matrixArray} from './engine/geometry.js';
const axes=[0,1,2],radians=Math.PI/180;
export function rotationSnap(angle,insideCircle,forceSnap=false){
  if(!Number.isFinite(angle))throw Error('Ungültiger Drehwinkel.');
  const step=insideCircle||forceSnap?15:1;return {degrees:Math.round(angle/step)*step,step};
}
export function selectionFrame(nodes){
  if(!nodes.length)throw Error('Bitte zuerst ein Teil auswählen.');
  let center,size,quaternion=new Quaternion();
  if(nodes.length===1){const n=nodes[0];center=new Vector3(...n.pos);size=new Vector3(...n.size);quaternion.setFromEuler(new Euler(...n.rot.map(v=>v*radians),'ZYX'));}
  else{
    const bounds=new Box3();for(const node of nodes){const matrix=new Matrix4().fromArray(matrixArray(node));for(const x of [-.5,.5])for(const y of [-.5,.5])for(const z of [-.5,.5])bounds.expandByPoint(new Vector3(x,y,z).applyMatrix4(matrix));}
    center=bounds.getCenter(new Vector3());size=bounds.getSize(new Vector3());
  }
  const matrix=new Matrix4().compose(center,quaternion,new Vector3(1,1,1));return {center,size,quaternion,matrix,inverse:matrix.clone().invert()};
}
export function resizeSelection(nodes,frame,{kind='xy',sign=[1,1],point,uniform=false,snap=1}){
  if(!nodes.length||!['xy','z'].includes(kind)||!Array.isArray(point)||point.length!==3||!point.every(Number.isFinite)||!sign.every(v=>v===1||v===-1))throw Error('Ungültige Skalierung.');
  const dimensions=frame.size.toArray(),anchor=kind==='xy'?new Vector3(-sign[0]*dimensions[0]/2,-sign[1]*dimensions[1]/2,-dimensions[2]/2):new Vector3(0,0,-dimensions[2]/2),factors=[1,1,1];
  const rounded=value=>snap>0?Math.round(value/snap)*snap:value;
  if(uniform||nodes.length>1){
    const span=[sign[0]*dimensions[0],sign[1]*dimensions[1]],delta=[point[0]-anchor.x,point[1]-anchor.y];
    let f=kind==='z'?(point[2]-anchor.z)/dimensions[2]:(span[0]*delta[0]+span[1]*delta[1])/(span[0]**2+span[1]**2);
    const reference=Math.max(...dimensions);f=rounded(reference*f)/reference;
    const min=Math.max(...nodes.flatMap(n=>n.size.map(v=>.01/v))),max=Math.min(...nodes.flatMap(n=>n.size.map(v=>10000/v)));f=Math.max(min,Math.min(max,f));factors.fill(f);
  }else{
    for(const axis of kind==='z'?[2]:[0,1]){const wanted=rounded((axis===2?1:sign[axis])*(point[axis]-anchor.getComponent(axis)));factors[axis]=Math.max(.01,Math.min(10000,wanted))/dimensions[axis];}
  }
  return structuredClone(nodes).map(n=>{const local=new Vector3(...n.pos).applyMatrix4(frame.inverse).sub(anchor).multiply(new Vector3(...factors)).add(anchor).applyMatrix4(frame.matrix);n.pos=local.toArray();n.size=n.size.map((v,i)=>Math.max(.01,Math.min(10000,v*factors[i])));return n;});
}
export function rotateSelection(nodes,frame,axis,degrees){
  if(!axes.includes(axis)||!Number.isFinite(degrees))throw Error('Ungültiger Drehwinkel.');
  const direction=new Vector3().setComponent(axis,1).applyQuaternion(frame.quaternion),delta=new Quaternion().setFromAxisAngle(direction,degrees*radians);
  return structuredClone(nodes).map(n=>{n.pos=new Vector3(...n.pos).sub(frame.center).applyQuaternion(delta).add(frame.center).toArray();const q=new Quaternion().setFromEuler(new Euler(...n.rot.map(v=>v*radians),'ZYX')).premultiply(delta),e=new Euler().setFromQuaternion(q,'ZYX');n.rot=[e.x,e.y,e.z].map(v=>v/radians);return n;});
}
