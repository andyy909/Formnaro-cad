import {cadPermanentlyVisible} from './cad-isolation.js';
import {projectObjectIsHole} from './project-objects.js';
// Explicit material roots only. Unchanged reference objects cannot contaminate
// a newly constructed part's photograph comparison.
export function photoPreviewTriangles(project,before,display){
 const previous=new Map(before.nodes.map(n=>[n.id,n])),changed=project.nodes.filter(n=>!previous.has(n.id)||JSON.stringify(n)!==JSON.stringify(previous.get(n.id))).map(n=>n.id);
 return photoTrianglesForIds(project,display,changed);
}
export function photoTrianglesForIds(project,display,ids){
 const wanted=new Set(ids),triangles=[],targets=[];
 for(const record of display.meshes){const id=record.rootId??record.id,node=project.nodes.find(n=>n.id===id);if(!node||!wanted.has(id)||!cadPermanentlyVisible(node,project)||projectObjectIsHole(node))continue;
  const verts=record.mesh.vertices??record.mesh.verts,indices=record.mesh.triangles,m=record.transform;if(!verts||!indices||m?.length!==16)throw Error('Unvollständige Vorschaugeometrie.');if(triangles.length+indices.length/3>250000)throw Error('Fotoprojektion überschreitet 250.000 Dreiecke.');
  targets.push({id,name:node.name});for(let k=0;k<indices.length;k+=3){const tri=[];for(let j=0;j<3;j++){const o=indices[k+j]*3,x=verts[o],y=verts[o+1],z=verts[o+2],w=m[3]*x+m[7]*y+m[11]*z+m[15];const p=[(m[0]*x+m[4]*y+m[8]*z+m[12])/w,(m[1]*x+m[5]*y+m[9]*z+m[13])/w,(m[2]*x+m[6]*y+m[10]*z+m[14])/w];if(!p.every(Number.isFinite))throw Error('Ungültige Fotoprojektion.');tri.push(p);}triangles.push(tri);}
 }
 if(!triangles.length)throw Error('Keine neuen oder geänderten sichtbaren Materialteile zum Fotovergleich.');return {triangles,targets};
}
