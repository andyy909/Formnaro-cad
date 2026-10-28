import {cadPoint} from './cad-affine.js';
import {meshSurgeryCatalog} from './mesh-surgery.js';

export function meshPartProperties(node,{inspectSolid}){
 const catalog=meshSurgeryCatalog(node);
 if(!catalog.intersections?.complete||catalog.intersections.pairs.length||catalog.topology.boundary||catalog.topology.orientation||catalog.topology.degenerate||catalog.topology.duplicate)throw Error('Masse benötigt ein geschlossenes, orientiertes und vollständig schnittgeprüftes Netz.');
 const proof=inspectSolid(node),ps=Array.from({length:node.mesh.verts.length/3},(_,i)=>cadPoint(node.transform,node.mesh.verts.slice(i*3,i*3+3))),ids=node.mesh.triangles,origin=ps[ids[0]],moments=[0,0,0];let signed=0;
 for(let i=0;i<ids.length;i+=3){const [a,b,c]=ids.slice(i,i+3).map(v=>ps[v].map((x,k)=>x-origin[k])),v=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;signed+=v;for(let k=0;k<3;k++)moments[k]+=v*(a[k]+b[k]+c[k])/4;}
 const volumeMm3=Math.abs(signed),centerMm=moments.map((v,k)=>origin[k]+v/signed);
 if(!Number.isFinite(volumeMm3)||volumeMm3<=0||centerMm.some(v=>!Number.isFinite(v))||Math.abs(volumeMm3-proof.volume)>Math.max(1e-6,proof.volume*3e-5))throw Error('Netzvolumen und unabhängiger Körpernachweis widersprechen sich.');
 const min=[0,1,2].map(k=>Math.min(...ps.map(p=>p[k]))),max=[0,1,2].map(k=>Math.max(...ps.map(p=>p[k])));
 return {volumeMm3,centerMm,faceCount:ids.length/3,bounds:{min,max},method:'Stored triangle volume and first moments; complete intersection audit and Manifold cross-check'};
}
