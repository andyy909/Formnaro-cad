import {Matrix4} from 'three';
export function lidHousing(kernel,{blocked=false,damaged=false,twoOpenings=false}={}){
 const owned=[],own=x=>(owned.push(x),x),M=kernel.Manifold;
 try{
  const outer=own(M.cube([48,72,18])),inner=own(M.cube([44,68,20]).translate([2,2,2]));
  let shell=own(outer.subtract(inner));
  const bosses=[5,67].map(y=>own(M.cylinder(16,4,4,64).translate([24,y,2])));
  shell=own(M.union([shell,...bosses]));
  const bores=[5,67].map(y=>own(M.cylinder(22,1.75,1.75,64).translate([24,y,-1])));
  shell=own(M.difference([shell,...bores]));
  if(blocked)shell=own(M.union([shell,own(M.cube([44,68,1]).translate([2,2,16.5]))]));
  if(twoOpenings)shell=own(M.union([shell,own(M.cube([2,68,16]).translate([23,2,2]))]));
  const data=shell.getMesh(),verts=[];for(let i=0;i<data.vertProperties.length;i+=data.numProp)verts.push(...data.vertProperties.slice(i,i+3));let triangles=Array.from(data.triVerts);
  if(damaged)triangles=triangles.slice(3);
  return {id:'housing',kind:'mesh',name:'Synthetisches Gehäuse',transform:new Matrix4().toArray(),meshRole:'solid',color:'#7ba8bf',opacity:1,hidden:false,locked:false,metadata:{notes:'synthetic fixture'},mesh:{verts,triangles}};
 }finally{for(const x of owned.reverse())x.delete();}
}
