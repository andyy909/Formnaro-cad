import * as THREE from 'three';
import {fromMesh,worldManifold,meshData,matrixArray,immutableMeshSnapshot,validNode} from './geometry.js';
import {splitMeshParts,extractMeshBodies} from './mesh-partition.js';
import {cachedMeshJSON} from './render-data.js';
// Imported sources are identical across the derived bodies, apart from location.
// Keep bounded plain mesh DTOs, never native handles, keyed by exact source data.
const extractionCache=new Map();let extractionCacheBytes=0;
function extractedSourceBodies(source){
 if(source.type!=='import'||source.children||!source.mesh)return extractMeshBodies(source);
 const key=(cachedMeshJSON(source.mesh)??JSON.stringify(source.mesh))+'|'+JSON.stringify([source.size,source.rot,source.mirror]);
 let entry=extractionCache.get(key);
 if(entry){extractionCache.delete(key);extractionCache.set(key,entry);}
 else{const result=extractMeshBodies({...source,pos:[0,0,0]}),bytes=key.length*2+result.nodes.reduce((sum,n)=>sum+(n.mesh.verts.length+n.mesh.triangles.length)*8,0);entry={result,bytes};
  if(bytes<=32*1024*1024){while(extractionCache.size&&(extractionCache.size>=4||extractionCacheBytes+bytes>32*1024*1024)){const oldest=extractionCache.keys().next().value;extractionCacheBytes-=extractionCache.get(oldest).bytes;extractionCache.delete(oldest);}extractionCache.set(key,entry);extractionCacheBytes+=bytes;}
 }
 return {...entry.result,nodes:entry.result.nodes.map(n=>({...n,pos:n.pos.map((v,i)=>v+source.pos[i])}))};
}
const stamps=new WeakMap();
export function sourceStamp(n){
 const mesh=n.mesh;if(mesh&&immutableMeshSnapshot(mesh)&&stamps.has(mesh))return stamps.get(mesh);
 const text=JSON.stringify(mesh||[n.type,n.params,n.size,n.segments,n.text]);let a=2166136261,b=2246822519;for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b^text.charCodeAt(i),3266489917);}const stamp=(a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');if(mesh&&immutableMeshSnapshot(mesh))stamps.set(mesh,stamp);return stamp;
}
function copySource(original,keepIds){const copy=structuredClone(original);function visit(n){if(!keepIds)n.id=crypto.randomUUID();n.children?.forEach(visit);}visit(copy);return copy;}
export function derivePartitionParts(original,kind,plane){
 if(!['split','bodies'].includes(kind))throw Error('Unbekanntes Teilungswerkzeug.');
 if(!original.solid)throw Error('Einen Volumenkörper auswählen.');const result=kind==='split'?splitMeshParts(original,plane):extractMeshBodies(original);
 if(kind==='bodies'&&result.count<2)throw Error('Das Teil enthält nur einen unabhängigen Materialkörper. Hohlräume werden nicht als Körper herausgelöst.');
 const stamp=kind==='bodies'?sourceStamp(original):null,inverse=new THREE.Matrix4().fromArray(matrixArray(original)).invert();
 result.nodes=result.nodes.map((n,i)=>{const source=copySource(original,i===0);source.pos=source.pos.map((v,k)=>v-n.pos[k]);
  let partition;if(kind==='split'){const normal=result.plane.normal;partition={version:1,kind:'plane',normal:[...normal],offset:result.plane.offset-normal.reduce((sum,v,k)=>sum+v*n.pos[k],0),side:result.sides[i]==='positive'?1:-1};}
  else{const m=worldManifold(n);let local;try{local=m.transform(inverse.elements);partition={version:1,kind:'body',sourceStamp:stamp,bodyCount:result.count,bodyMesh:meshData(local)};immutableMeshSnapshot(partition.bodyMesh);}finally{m.delete();local?.delete();}}
  const part={...n,type:'group',operation:'partition',partition,children:[source],baseSize:[...n.size],multicolor:!!original.multicolor,layerId:original.layerId,folderId:original.folderId};delete part.aiMarks;if(!validNode(part))throw Error('Das Ergebnis überschreitet die erlaubte Historie oder Abmessungen.');return part;
 });return result;
}
export function partitionManifold(node){
 const source=node.children[0],p=node.partition;
 if(p.kind==='plane'){const m=worldManifold(source);try{return m.trimByPlane(p.normal.map(v=>v*p.side),p.offset*p.side);}finally{m.delete();}}
 if(sourceStamp(source)!==p.sourceStamp)throw Error('Die Originalgeometrie des herausgelösten Körpers wurde geändert. Körper erneut herauslösen; bisheriges Ergebnis bleibt erhalten.');
 const local=fromMesh(p.bodyMesh);let reference;try{reference=local.transform(matrixArray(source));}finally{local.delete();}
 let selected=null;try{const bodies=extractedSourceBodies(source);if(bodies.count!==p.bodyCount)throw Error('Körperzuordnung geändert. Körper erneut herauslösen.');
  for(const body of bodies.nodes){const candidate=worldManifold(body);let a,b;try{a=reference.subtract(candidate);b=candidate.subtract(reference);const tolerance=Math.max(reference.volume()*3e-5,1e-10);if(a.status()==='NoError'&&b.status()==='NoError'&&Math.abs(a.volume())<=tolerance&&Math.abs(b.volume())<=tolerance){if(selected){selected.delete();selected=null;throw Error('Körperzuordnung ist mehrdeutig. Körper erneut herauslösen.');}selected=candidate;continue;}}finally{a?.delete();b?.delete();if(candidate!==selected)candidate.delete();}}
  if(!selected)throw Error('Der gespeicherte Körperbezug passt nicht mehr. Körper erneut herauslösen.');return selected;
 }catch(e){selected?.delete();throw e;}finally{reference.delete();}
}
