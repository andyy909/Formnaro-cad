// Finite millimetre grid: rectangular bounds and stable 10/50 mm spacing.
// Each segment belongs to exactly one colour group (including the axes).
export function cadBedGrid(width,depth){
  if(![width,depth].every(v=>Number.isFinite(v)&&v>=20&&v<=2000))throw Error('Ungültige Arbeitsflächengröße.');
  const minor=[],major=[],axes=[],border=[-width/2,-depth/2,0,width/2,-depth/2,0,width/2,-depth/2,0,width/2,depth/2,0,width/2,depth/2,0,-width/2,depth/2,0,-width/2,depth/2,0,-width/2,-depth/2,0];
  for(let axis=0;axis<2;axis++){
    const extent=(axis===0?width:depth)/2,other=(axis===0?depth:width)/2;
    for(let n=Math.ceil(-extent/10);n<=Math.floor(extent/10);n++){
      const v=n*10;if(Math.abs(v)===extent)continue;
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
