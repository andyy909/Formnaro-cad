import {localManifold,meshData,immutableMeshSnapshot} from './geometry.js';
import {GENERATORS} from './parameters.js';
import {coloredParts} from './exports.js';
const meshSignatures=new WeakMap();
export function immutableMesh(mesh){
  // The shared boundary checks ordinary own numeric array entries once,
  // freezes them and primes geometry validation without a second mesh scan.
  return immutableMeshSnapshot(mesh);
}
export function cachedMeshJSON(mesh){
  if(!immutableMesh(mesh))return null;
  let cache=meshSignatures.get(mesh);
  if(!cache){cache={mesh:JSON.stringify(mesh),results:new Map()};meshSignatures.set(mesh,cache);}
  return cache.mesh;
}
export function geometrySignature(n){
  const mesh=n.mesh,size=n.params&&!GENERATORS.has(n.type)?n.size:null;
  if(n.params?.toJSON!==undefined||size?.toJSON!==undefined)return JSON.stringify([n.id,n.type,n.segments,n.text,mesh,n.params,size]);
  if(cachedMeshJSON(mesh)===null)return JSON.stringify([n.id,n.type,n.segments,n.text,mesh,n.params,size]);
  const cache=meshSignatures.get(mesh);
  const prefix=JSON.stringify([n.id,n.type,n.segments,n.text]),suffix=JSON.stringify([n.params,size]),key=prefix+suffix;
  if(cache.results.has(key)){const result=cache.results.get(key);cache.results.delete(key);cache.results.set(key,result);return result;}
  // Keep the existing exact key, including property order and null handling,
  // so render data arriving from workers uses the same cache protocol.
  const result=prefix.slice(0,-1)+','+cache.mesh+','+suffix.slice(1);cache.results.set(key,result);if(cache.results.size>8)cache.results.delete(cache.results.keys().next().value);return result;
}
export const colorSignature=n=>JSON.stringify(n);
export function computedRenderData(nodes){const renders=[];function visit(n){const m=localManifold(n);try{renders.push({id:n.id,key:geometrySignature(n),data:meshData(m),colorKey:colorSignature(n),parts:n.multicolor&&n.children?coloredParts(n):null});}finally{m.delete();}for(const child of n.children||[])visit(child);}nodes.forEach(visit);return renders;}
