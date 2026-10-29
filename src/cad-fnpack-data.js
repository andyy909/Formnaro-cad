import {cadProjectSnapshot,validateCadProject,cadProjectStoredVersion} from './cad-project.js';
import {cadGeometryDigest,cadSourceGeometryDigest,cadSourceGeometryKey} from './cad-geometry-digest.js';
import {projectObjectGeometryDigest,projectObjectGeometryKey,projectObjectType,validateProjectMesh} from './project-objects.js';
import {GEOMETRY_REF_FORMAT,isGeometryRef,validateGeometryRef,geometryRefs,hasGeometryRefs} from './cad-geometry-ref.js';
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
function meshBytes(mesh){return JSON.stringify({verts:mesh.verts,triangles:mesh.triangles});}
function localBounds(mesh){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<mesh.verts.length;i++){const k=i%3;min[k]=Math.min(min[k],mesh.verts[i]);max[k]=Math.max(max[k],mesh.verts[i]);}return {min,max};}
export function stripGeometryIdentity(value){
 if(isGeometryRef(value))throw Error('Geometrie vor dem Übertragen vollständig laden.');
 if(Array.isArray(value))return value.map(stripGeometryIdentity);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>k!=='geometryIdentity').map(([k,v])=>[k,stripGeometryIdentity(v)]));return value;
}
export function materializedFnpackProject(project){if(hasGeometryRefs(project))throw Error('Unvollständigen Geometriekatalog nicht als normale Vorlage ausgeben.');const clean=stripGeometryIdentity(project);clean.version=cadProjectStoredVersion(clean);return cadProjectSnapshot(clean);}
/** Save constructs a catalogue without modifying the confirmed project. */
export function encodeFnpackProject(input){
 const project=cadProjectSnapshot(input),blocks=new Map();project.version=Math.max(17,cadProjectStoredVersion(project));
 function identity(node){
  if(node.children)for(const child of node.children)identity(child);
  if(node.meshSource?.sources)for(const source of node.meshSource.sources)identity(source);
  const shape={...node,transform:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]};delete shape.suppressed;
  node.geometryIdentity={sourceKey:cadSourceGeometryKey(node),sourceDigest:cadSourceGeometryDigest(node),shapeKey:cadSourceGeometryKey(shape),shapeDigest:cadSourceGeometryDigest(shape),objectKey:projectObjectGeometryKey(node),objectDigest:projectObjectGeometryDigest(node)};
 }
 for(const node of project.nodes)identity(node);
 function block(value,kind,metadata={}){const text=kind==='brep'?value.data:meshBytes(value),sha256=cadGeometryDigest(text),bytes=encoder.encode(text);if(!blocks.has(sha256))blocks.set(sha256,{sha256,bytes});return validateGeometryRef({format:GEOMETRY_REF_FORMAT,kind,sha256,bytes:bytes.length,...metadata},kind);}
 function visit(value){
  if(isGeometryRef(value))return validateGeometryRef(value,value.kind);
  if(value?.format==='OpenCascade-BRep')return block(value,'brep');
  if(Array.isArray(value?.verts)&&Array.isArray(value?.triangles)){const mesh=validateProjectMesh(value);return block(mesh,'mesh',{bounds:localBounds(mesh),vertices:mesh.verts.length/3,triangles:mesh.triangles.length/3,topology:projectObjectType({kind:'mesh',mesh})});}
  if(Array.isArray(value))return value.map(visit);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,visit(v)]));
  return value;
 }
 return {project:validateCadProject(visit(project)),blocks:[...blocks.values()]};
}
/** A private resolver cache belongs to the opened package, never model/Undo.
 * Each requested root includes its retained source tree. Duplicate instances
 * share one verified block read; an unsuccessful read cannot poison the cache. */
export function createFnpackResolver({readBlock,maxBytes=128*1024*1024,maxBlocks=256}={}){
 if(typeof readBlock!=='function'||!Number.isSafeInteger(maxBytes)||maxBytes<1||!Number.isSafeInteger(maxBlocks)||maxBlocks<1)throw Error('Geometrieblock-Leser oder Cachegrenze fehlt.');const cache=new Map(),inflight=new Map(),boundsCache=new WeakMap();let reads=0,bytes=0,residentBytes=0,evictions=0;
 function remember(hash,value){const cost=value.format==='OpenCascade-BRep'?value.data.length*2+256:(value.verts.length+value.triangles.length)*8+256;if(cost>maxBytes)return;while(cache.size&&(cache.size>=maxBlocks||residentBytes+cost>maxBytes)){const key=cache.keys().next().value;residentBytes-=cache.get(key).cost;cache.delete(key);evictions++;}cache.set(hash,{value,cost});residentBytes+=cost;}
 async function load(ref,{signal}={}){
  validateGeometryRef(ref,ref.kind);if(signal?.aborted)throw new DOMException('Laden abgebrochen.','AbortError');const cached=cache.get(ref.sha256);let content=cached?.value;if(cached){cache.delete(ref.sha256);cache.set(ref.sha256,cached);}
  if(!content){let pending=inflight.get(ref.sha256);if(!pending){pending=(async()=>{const raw=await readBlock(ref.sha256);const data=raw instanceof Uint8Array?raw:new Uint8Array(raw);if(data.length!==ref.bytes)throw Error('Geometrieblock hat eine falsche Größe.');const text=decoder.decode(data);if(cadGeometryDigest(text)!==ref.sha256)throw Error('Geometrieblock-Prüfsumme stimmt nicht.');const value=ref.kind==='brep'?{format:'OpenCascade-BRep',triangulation:false,data:text}:validateProjectMesh(JSON.parse(text));remember(ref.sha256,value);reads++;bytes+=data.length;return value;})();inflight.set(ref.sha256,pending);pending.finally(()=>inflight.delete(ref.sha256)).catch(()=>{});}content=await pending;}
  if((content.format==='OpenCascade-BRep')!==(ref.kind==='brep'))throw Error('Geometrieblock-Art stimmt nicht mit dem Katalog überein.');
  if(ref.kind==='mesh'){let bounds=boundsCache.get(content);if(!bounds){bounds=localBounds(content);boundsCache.set(content,bounds);}if(content.verts.length/3!==ref.vertices||content.triangles.length/3!==ref.triangles||['min','max'].some(key=>bounds[key].some((v,k)=>v!==ref.bounds[key][k])))throw Error('Netzblock stimmt nicht mit seinen Katalogmaßen überein.');}
  if(signal?.aborted)throw new DOMException('Laden abgebrochen.','AbortError');return structuredClone(content);
 }
 async function hydrate(project,ids=null,{signal}={}){
  const selected=ids===null?null:new Set(ids);if(selected&&[...selected].some(id=>!project.nodes.some(n=>n.id===id)))throw Error('Geometrie zum Nachladen fehlt im Katalog.');
  async function visit(value){if(isGeometryRef(value))return load(value,{signal});if(Array.isArray(value)){if(!value.some(child=>child&&typeof child==='object'))return value;return Promise.all(value.map(visit));}if(value&&typeof value==='object'){const pairs=await Promise.all(Object.entries(value).map(async([k,v])=>[k,await visit(v)]));return Object.fromEntries(pairs);}return value;}
  const nodes=[];for(const node of project.nodes)nodes.push(selected&&!selected.has(node.id)?node:await visit(node));return cadProjectSnapshot({...project,nodes});
 }
 return {hydrate,stats:()=>({reads,bytes,blocks:cache.size,residentBytes,evictions,maxBytes}),has:hash=>cache.has(hash),refs:geometryRefs};
}
