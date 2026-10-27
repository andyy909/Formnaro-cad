import {cadPoint} from './cad-affine.js';
import {DEVIATION_LIMITS} from './model-deviation.js';
// All parts of a root, including CAD face-color display records, are aggregated.
// Callers must request the whole native BRep surface (colored:false), so internal
// interfaces of color-region solids never become measurement surfaces.
export function deviationWorldSurface(records){
 const vertices=[],triangles=[];
 for(const record of records){const mesh=record.mesh,raw=mesh.vertices??mesh.verts,base=vertices.length/3;if((raw.length+vertices.length)/3>DEVIATION_LIMITS.vertices||(mesh.triangles.length+triangles.length)/3>DEVIATION_LIMITS.triangles)throw Error('Modellvergleich: maximal 200.000 Dreiecke je Oberfläche. CAD-Anzeigequalität gröber wählen.');for(let i=0;i<raw.length;i+=3)vertices.push(...cadPoint(record.transform,raw.slice(i,i+3)));for(const id of mesh.triangles)triangles.push(base+id);}
 if(!triangles.length)throw Error('Eine vollständige Vergleichsoberfläche fehlt.');return {vertices,triangles};
}
export function overlaySurfaceCenters(left,right){
 const center=s=>{const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<s.vertices.length;i++){const axis=i%3;min[axis]=Math.min(min[axis],s.vertices[i]);max[axis]=Math.max(max[axis],s.vertices[i]);}return min.map((v,k)=>(v+max[k])/2);},a=center(left),b=center(right),translation=a.map((v,k)=>v-b[k]);
 return {left,right:{vertices:right.vertices.map((v,i)=>v+translation[i%3]),triangles:[...right.triangles]},translation};
}
