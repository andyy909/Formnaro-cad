import {flags} from './organization.js';
export const CAD_MESH_COPY_PRESETS=Object.freeze({coarse:{deflection:.2,angleDegrees:15},standard:{deflection:.05,angleDegrees:8},fine:{deflection:.01,angleDegrees:3}});
export function validateMeshCopyQuality(value){
 if(!value||Object.keys(value).some(k=>!['deflection','angleDegrees'].includes(k))||!Number.isFinite(value.deflection)||value.deflection<.0001||value.deflection>10||!Number.isFinite(value.angleDegrees)||value.angleDegrees<1||value.angleDegrees>90)throw Error('Netzfeinheit: 0,0001–10 mm und 1–90 Grad wählen.');
 return {deflection:value.deflection,angleDegrees:value.angleDegrees};
}
export function meshCopySource(project,target){
 if(!target||!Array.isArray(target.path)||target.path.length)throw Error('Genau einen fertigen CAD-Körper auswählen, keine einzelne Quelle.');
 const node=project.nodes.find(n=>n.id===target.rootId);
 if(!node||node.kind!=='cad'||!node.solid||node.suppressed)throw Error('Für die Netzkopie einen fertigen positiven CAD-Körper auswählen.');
 const state=flags(node,project);if(state.hidden||state.locked)throw Error('Für die Netzkopie einen sichtbaren, entsperrten CAD-Körper wählen.');
 return node;
}
// Exact coordinate sharing only: do not close gaps, move vertices or simplify.
export function compactCadMesh(mesh){
 const verts=[],triangles=[],indices=new Map(),remap=new Map();
 for(const id of mesh.triangles){let index=remap.get(id);if(index===undefined){const point=mesh.vertices.slice(id*3,id*3+3).map(v=>v===0?0:v),key=point.join(',');index=indices.get(key);if(index===undefined){index=verts.length/3;indices.set(key,index);verts.push(...point);}remap.set(id,index);}triangles.push(index);}
 return {verts,triangles};
}
export function meshSignedVolume(mesh){
 const origin=mesh.verts.slice(0,3);let volume=0,correction=0;
 for(let i=0;i<mesh.triangles.length;i+=3){const [a,b,c]=mesh.triangles.slice(i,i+3).map(id=>mesh.verts.slice(id*3,id*3+3).map((v,k)=>v-origin[k])),value=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6-correction,next=volume+value;correction=(next-volume)-value;volume=next;}
 return volume;
}
