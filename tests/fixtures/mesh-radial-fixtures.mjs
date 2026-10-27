import {Matrix4} from 'three';
export function radialFixture(kernel,{gap=.3,insertShape='cone'}={}){
 const owned=[],own=v=>(owned.push(v),v),M=kernel.Manifold;
 const node=(body,id)=>{const raw=body.getMesh();return {id,kind:'mesh',name:id,transform:new Matrix4().toArray(),meshRole:'solid',layerId:'default',folderId:null,mesh:{verts:Array.from(raw.vertProperties),triangles:Array.from(raw.triVerts)}};};
 try{
  const outside=own(M.cylinder(26,20,20,256)),cavity=own(M.cylinder(22,16,14,256)),placed=own(cavity.translate([0,0,2])),housing=own(outside.subtract(placed));
  // Cavity radius at world z is 16-(z-2)/11. Known analytical reference.
  const bottom=16-14/11-gap,top=insertShape==='cone'?14-gap:bottom,insert0=own(M.cylinder(8,bottom,top,256)),insert=own(insert0.translate([0,0,16]));
  return [node(housing,'housing'),node(insert,'insert')];
 }finally{for(const v of owned.reverse())v.delete();}
}
