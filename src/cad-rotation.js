import {Matrix4,Vector3} from 'three';

export function cadRotationSnap(angle,insideCircle,forceSnap=false){
  if(!Number.isFinite(angle))throw Error('Ungültiger Drehwinkel.');
  const step=insideCircle||forceSnap?15:1;
  return {degrees:Math.round(angle/step)*step||0,step};
}

export function cadViewRotationAxes(direction,cameraRight){
  const {x,y,z}=direction,step=Math.PI/4,horizontalLength=Math.hypot(x,y);
  const heading=horizontalLength>1e-5?Math.atan2(y,x):Math.atan2(-cameraRight.x,cameraRight.y);
  const azimuth=Math.round(heading/step)*step;
  const elevation=Math.round(Math.atan2(z,Math.hypot(x,y))/step)*step;
  const horizontal=Math.abs(elevation)===Math.PI/2?0:Math.cos(elevation);
  const normal=new Vector3(horizontal*Math.cos(azimuth),horizontal*Math.sin(azimuth),Math.sin(elevation));
  const right=new Vector3(-Math.sin(azimuth),Math.cos(azimuth),0);
  const up=new Vector3().crossVectors(normal,right);
  return [right,normal.clone().negate(),up,normal];
}

// Premultiply the complete affine world matrix; never decompose CAD or mesh
// transforms, which may contain a reflection, nonuniform scale or shear.
export function cadRotationDelta(center,normal,degrees){
  if(![center,normal].every(v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite))||!Number.isFinite(degrees))throw Error('Ungültige Drehung.');
  const axis=new Vector3(...normal);if(axis.lengthSq()<1e-16)throw Error('Ungültige Drehachse.');
  return new Matrix4().makeTranslation(...center)
    .multiply(new Matrix4().makeRotationAxis(axis.normalize(),degrees*Math.PI/180))
    .multiply(new Matrix4().makeTranslation(...center.map(v=>-v))).toArray();
}
