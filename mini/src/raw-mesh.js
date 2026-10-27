import {Matrix4,Vector3} from 'three';
import {matrixArray} from './engine/geometry.js';
export function normalizeRawMesh(mesh){
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const id of mesh.triangles)for(let k=0;k<3;k++){min[k]=Math.min(min[k],mesh.verts[id*3+k]);max[k]=Math.max(max[k],mesh.verts[id*3+k]);}
 const extent=max.map((v,k)=>v-min[k]),size=extent.map(v=>Math.max(.01,v)),center=max.map((v,k)=>(v+min[k])/2);
 if(size.some(v=>!Number.isFinite(v)||v>10000))throw Error('Netz liegt außerhalb des Arbeitsbereichs.');
 return {mesh:{verts:mesh.verts.map((v,k)=>(v-center[k%3])/size[k%3]),triangles:[...mesh.triangles]},size,extent};
}
export function rawBounds(node,extra){const matrix=new Matrix4().fromArray(matrixArray(node));if(extra)matrix.premultiply(extra);const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity],point=new Vector3();for(const id of node.mesh.triangles){point.fromArray(node.mesh.verts,id*3).applyMatrix4(matrix);for(let k=0;k<3;k++){min[k]=Math.min(min[k],point.getComponent(k));max[k]=Math.max(max[k],point.getComponent(k));}}return {min,max,size:max.map((v,k)=>v-min[k]),center:max.map((v,k)=>(v+min[k])/2)};}
export async function rawStl(node){
 const {compactImportPositions,resolveCollapsedFaces,inspectImportTopology}=await import('./import-core/mesh-import-core.js');
 const original=node.mesh,matrix=new Matrix4().fromArray(matrixArray(node)),positions=new Float32Array(original.triangles.length*3),point=new Vector3();
 for(let i=0;i<original.triangles.length;i++){point.fromArray(original.verts,original.triangles[i]*3).applyMatrix4(matrix);positions.set(point.toArray(),i*3);}
 const compact=await compactImportPositions(positions),fixed=resolveCollapsedFaces(compact.verts,compact.triangles),before=inspectImportTopology(original),after=inspectImportTopology({verts:compact.verts,triangles:fixed.indices});
 if(after.degenerate||after.nonmanifold>before.nonmanifold||after.orientation>before.orientation||after.components!==before.components||after.euler!==before.euler||after.boundary!==before.boundary)throw Error('STL-Ausgabe konnte nach Float32-Speicherung nicht sicher bestätigt werden. Das Projekt bleibt erhalten.');
 const v=compact.verts,t=fixed.indices,buffer=new ArrayBuffer(84+t.length/3*50),view=new DataView(buffer);view.setUint32(80,t.length/3,true);
 for(let f=0;f<t.length;f+=3){const p=Array.from(t.slice(f,f+3),id=>new Vector3().fromArray(v,id*3)),n=p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0])).normalize();[...n.toArray(),...p.flatMap(x=>x.toArray())].forEach((x,k)=>view.setFloat32(84+f/3*50+k*4,x,true));}return buffer;
}
