import {flags} from './organization.js';
import {validateAffineMatrix} from './cad-project.js';
import {projectObjectGeometryDigest,validateProjectMesh} from './project-objects.js';

export function meshCadSource(project,target){
 if(!target||!Array.isArray(target.path)||target.path.length)throw Error('Genau ein vollständiges Netzteil auswählen, keine einzelne Quelle.');
 const node=project.nodes.find(n=>n.id===target.rootId);
 if(node?.kind!=='mesh'||node.meshRole==='hole')throw Error('Ein bearbeitbares Material-Netzteil auswählen.');
 const state=flags(node,project);if(state.hidden||state.locked)throw Error('Ein sichtbares, entsperrtes Netzteil auswählen.');
 return node;
}
export function meshCadFrame(node){const transform=[1,0,0,0,0,1,0,0,0,0,1,0,...node.transform.slice(12,15),1];validateAffineMatrix(transform);return transform;}

// Bake only the affine linear part. Native conversion then measures real mm,
// including nonuniform scaling and shear, without rounding a large translation.
// ASCII numbers round-trip the original doubles; no float32 display/export mesh.
export function meshCadInput(project,target,revision){
 const node=meshCadSource(project,target),mesh=validateProjectMesh(node.mesh),m=node.transform;validateAffineMatrix(m);
 if(mesh.triangles.length/3>40000)throw Error('Der Konverter unterstützt höchstens 40.000 Dreiecke. Das Netz zuerst ausdrücklich vereinfachen.');
 const det=m[0]*(m[5]*m[10]-m[9]*m[6])-m[4]*(m[1]*m[10]-m[9]*m[2])+m[8]*(m[1]*m[6]-m[5]*m[2]),points=[];
 if(!Number.isFinite(det)||det===0)throw Error('Die Netztransformation ist für eine sichere Konvertierung zu extrem.');
 for(let i=0;i<mesh.verts.length;i+=3){const [x,y,z]=mesh.verts.slice(i,i+3),p=[0,1,2].map(k=>m[k]*x+m[4+k]*y+m[8+k]*z);if(p.some(v=>!Number.isFinite(v)))throw Error('Netzposition ist nicht darstellbar.');points.push(p.map(v=>v===0?0:v).join(' '));}
 const rows=['solid Formnaro'];for(let i=0;i<mesh.triangles.length;i+=3){const face=mesh.triangles.slice(i,i+3);if(det<0)[face[1],face[2]]=[face[2],face[1]];rows.push('facet normal 0 0 0','outer loop',...face.map(id=>'vertex '+points[id]),'endloop','endfacet');}rows.push('endsolid Formnaro');
 const bytes=new TextEncoder().encode(rows.join('\n'));if(bytes.length>50*1024*1024)throw Error('Das Netz überschreitet die Konvertergrenze von 50 MB.');
 const name=node.name.slice(0,180).replace(/[\\/:*?"<>|\r\n]/g,'_').replace(/\.stl$/i,'')+'.stl';
 return {file:new File([bytes],name,{type:'model/stl'}),source:{target:structuredClone(target),digest:projectObjectGeometryDigest(node),revision},triangles:mesh.triangles.length/3};
}
