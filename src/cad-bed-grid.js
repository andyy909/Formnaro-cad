import {cadPoint} from './cad-affine.js';

export function cadAdaptiveBedSize(minimum,objects,worldToPlane){
  const extent=[0,0];
  for(const {target,hidden,worldBounds} of objects){
    if(hidden||target?.path?.length||!worldBounds)continue;
    for(let corner=0;corner<8;corner++){
      const point=[0,1,2].map(axis=>worldBounds[corner&(1<<axis)?'max':'min'][axis]);
      const local=cadPoint(worldToPlane,point);
      for(let axis=0;axis<2;axis++)if(Number.isFinite(local[axis]))extent[axis]=Math.max(extent[axis],Math.abs(local[axis]));
    }
  }
  return extent.map((value,axis)=>Math.max(minimum[axis],Math.ceil((value+Math.max(10,value*.1))/5)*10));
}

// Finite millimetre grid: rectangular bounds and stable 10/50 mm spacing.
// Each segment belongs to exactly one colour group (including the axes).
export function cadBedGrid(width,depth,{adaptive=false}={}){
  if(![width,depth].every(v=>Number.isFinite(v)&&v>=20&&(adaptive||v<=2000)))throw Error('Ungültige Arbeitsflächengröße.');
  const step=10*Math.max(1,Math.ceil(Math.max(width,depth)/2000));
  const minor=[],major=[],axes=[],border=[-width/2,-depth/2,0,width/2,-depth/2,0,width/2,-depth/2,0,width/2,depth/2,0,width/2,depth/2,0,-width/2,depth/2,0,-width/2,depth/2,0,-width/2,-depth/2,0];
  for(let axis=0;axis<2;axis++){
    const extent=(axis===0?width:depth)/2,other=(axis===0?depth:width)/2;
    for(let n=Math.ceil(-extent/step);n<=Math.floor(extent/step);n++){
      const v=n*step;if(Math.abs(v)===extent)continue;
      const group=n===0?axes:n%5===0?major:minor;
      group.push(...(axis===0?[v,-other,0,v,other,0]:[-other,v,0,other,v,0]));
    }
  }
  return {minor,major,axes,border};
}
export function workplaneOnGround(workplane){
  const [x,y]=workplane.orientation;
  return Math.abs(workplane.origin[2])<1e-7&&Math.hypot(x,y)<1e-7;
}
