import {worldManifold,meshData,fromMesh} from './geometry.js';
import {coloredParts} from './exports.js';
export function sectionGeometry(nodes,{normal,offset},progress=()=>{}){
  if(!Array.isArray(normal)||normal.length!==3||!normal.every(Number.isFinite)||Math.abs(Math.hypot(...normal)-1)>1e-6||!Number.isFinite(offset))throw Error('Ungültige Schnittebene.');
  const results=[];
  for(let i=0;i<nodes.length;i++){
    const node=nodes[i],source=worldManifold(node);let cut;
    try{
      cut=source.trimByPlane(normal,offset);if(cut.isEmpty())continue;
      const data=meshData(cut),caps={verts:data.verts,triangles:[]},surface={verts:data.verts,triangles:[]},tolerance=Math.max(1e-5,Math.abs(offset)*2e-7);
      const onPlane=(d,tri)=>tri.every(index=>Math.abs(normal.reduce((s,v,k)=>s+v*d.verts[index*3+k],0)-offset)<tolerance);
      for(let t=0;t<data.triangles.length;t+=3){const tri=data.triangles.slice(t,t+3);(onPlane(data,tri)?caps:surface).triangles.push(...tri);}
      let parts=null;if(node.multicolor&&node.children){parts=[];for(const p of coloredParts(node)){const m=fromMesh(p.data);let trimmed;try{trimmed=m.trimByPlane(normal,offset);if(!trimmed.isEmpty()){const d=meshData(trimmed),triangles=[];for(let t=0;t<d.triangles.length;t+=3){const tri=d.triangles.slice(t,t+3);if(!onPlane(d,tri))triangles.push(...tri);}parts.push({...p,data:{verts:d.verts,triangles}});}}finally{m.delete();trimmed?.delete();}}}
      results.push({id:node.id,surface,caps,parts,volume:cut.volume(),status:cut.status()});
    }finally{source.delete();cut?.delete();progress((i+1)/nodes.length);}
  }
  return results;
}
