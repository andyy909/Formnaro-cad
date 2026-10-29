/** File geometry references carry no native handle, path or display buffers. */
export const GEOMETRY_REF_FORMAT='Formnaro-GeometryRef';
export const isGeometryRef=value=>value?.format===GEOMETRY_REF_FORMAT;
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export function validateGeometryRef(value,kind){
 const fields=['format','kind','sha256','bytes',...(kind==='mesh'?['bounds','vertices','triangles','topology']:[])];
 if(!value||!['brep','mesh'].includes(kind)||value.format!==GEOMETRY_REF_FORMAT||value.kind!==kind||Object.keys(value).some(k=>!fields.includes(k))||!hash(value.sha256)||!Number.isSafeInteger(value.bytes)||value.bytes<1||value.bytes>(kind==='brep'?12:128)*1024*1024)throw Error('Ungültiger Geometrieblock-Verweis.');
 const out={format:GEOMETRY_REF_FORMAT,kind,sha256:value.sha256,bytes:value.bytes};
 if(kind==='mesh'){
  if(!value.bounds||Object.keys(value.bounds).some(k=>!['min','max'].includes(k))||!['min','max'].every(k=>Array.isArray(value.bounds[k])&&value.bounds[k].length===3&&value.bounds[k].every(Number.isFinite))||value.bounds.min.some((v,k)=>v>value.bounds.max[k])||!Number.isInteger(value.vertices)||value.vertices<3||value.vertices>1000000||!Number.isInteger(value.triangles)||value.triangles<1||value.triangles>2000000||!['closedMesh','openMesh','damagedMesh','referenceMesh'].includes(value.topology))throw Error('Ungültiger Netzblock-Katalog.');
  Object.assign(out,{bounds:structuredClone(value.bounds),vertices:value.vertices,triangles:value.triangles,topology:value.topology});
 }
 return out;
}
export function validateGeometryIdentity(value){
 if(!value||Object.keys(value).sort().join(',')!=='objectDigest,objectKey,shapeDigest,shapeKey,sourceDigest,sourceKey'||Object.values(value).some(v=>!hash(v)))throw Error('Ungültige Quellenidentität im Geometriekatalog.');
 return {...value};
}
export function hasGeometryRefs(value){
 if(isGeometryRef(value))return true;
 if(Array.isArray(value))return value.some(child=>child&&typeof child==='object'&&hasGeometryRefs(child));
 return !!value&&typeof value==='object'&&Object.values(value).some(hasGeometryRefs);
}
export function geometryRefs(value,result=new Map()){
 if(isGeometryRef(value)){const checked=validateGeometryRef(value,value.kind),old=result.get(checked.sha256);if(old&&(old.bytes!==checked.bytes||old.kind!==checked.kind))throw Error('Widersprüchlicher Geometrieblock.');result.set(checked.sha256,checked);}
 else if(Array.isArray(value)){for(const child of value)if(child&&typeof child==='object')geometryRefs(child,result);}
 else if(value&&typeof value==='object')for(const child of Object.values(value))geometryRefs(child,result);
 return result;
}
/** Same metadata key before and after moving payloads into file blocks. */
export function normalizeGeometryPayloads(value,digest){
 if(isGeometryRef(value))return {geometryKind:value.kind,sha256:value.sha256};
 if(value?.format==='OpenCascade-BRep'&&typeof value.data==='string')return {geometryKind:'brep',sha256:digest(value.data)};
 if(Array.isArray(value?.verts)&&Array.isArray(value?.triangles))return {geometryKind:'mesh',sha256:digest(JSON.stringify({verts:value.verts,triangles:value.triangles}))};
 if(Array.isArray(value))return value.map(v=>normalizeGeometryPayloads(v,digest));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalizeGeometryPayloads(v,digest)]));
 return value;
}
/** Reuse only unchanged deferred geometry with ordinary presentation edits.
 * Stats, anchors, references, identities and source metadata remain exact. */
export function sameDeferredGeometry(before,after){
 if(!before||!hasGeometryRefs(after))return false;
 const view=new Set(['name','color','opacity','hidden','locked','layerId','folderId']);
 const source=node=>Object.fromEntries(Object.entries(node).filter(([key])=>!view.has(key)).map(([key,value])=>[key,key==='children'?value.map(source):value]));
 return JSON.stringify(source(before))===JSON.stringify(source(after));
}
