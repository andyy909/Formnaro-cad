import {Matrix4,Vector3} from 'three';

export function cadRotationSnap(angle,insideCircle,forceSnap=false){
  if(!Number.isFinite(angle))throw Error('Ungültiger Drehwinkel.');
  const step=insideCircle||forceSnap?15:1;
  return {degrees:Math.round(angle/step)*step||0,step};
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
