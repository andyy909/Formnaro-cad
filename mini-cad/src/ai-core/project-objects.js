import {cadGeometryDigest} from './cad-geometry-digest.js';

/** Persistent mesh data is independent of either solid kernel. In particular,
 * valid arrays do not assert a closed, oriented, non-intersecting solid. */
export const PROJECT_OBJECT_KINDS=Object.freeze(['cad','mesh','referenceMesh']);
export function validateProjectMesh(value,{vertices=1000000,triangles=2000000,path='mesh'}={}){
  const fail=message=>{throw Error(`Projekt ${path}: ${message}`);};
  if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Object.keys(value).some(k=>!['verts','triangles'].includes(k)))fail('Nur originale Punkte und Dreiecke erwartet.');
  if(!Array.isArray(value.verts)||value.verts.length<9||value.verts.length%3||value.verts.length>vertices*3||!Array.isArray(value.triangles)||value.triangles.length<3||value.triangles.length%3||value.triangles.length>triangles*3)fail('Ungültige Netzgröße.');
  const verts=value.verts.map(v=>{if(typeof v!=='number'||!Number.isFinite(v))fail('Endliche Punktkoordinaten erwartet.');return v===0?0:v;});
  const indices=value.triangles.map(v=>{if(!Number.isSafeInteger(v)||v<0||v>=verts.length/3)fail('Ungültiger Dreiecksindex.');return v===0?0:v;});
  return {verts,triangles:indices};
}

/** A source link is a historical identity, not an implicit dependency/rebuild.
 * The referenced object may subsequently be removed. A revision is always tied
 * to the complete source geometry AND placement, never its name or color. */
export function validateSourceReference(value){
  if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Object.keys(value).some(k=>!['objectId','geometryDigest','operation'].includes(k))||typeof value.objectId!=='string'||!value.objectId.trim()||value.objectId.length>200||typeof value.geometryDigest!=='string'||!/^([a-f0-9]{64})$/.test(value.geometryDigest)||!['cad-to-mesh','mesh-to-cad','mesh-copy','mesh-edit','legacy-import'].includes(value.operation))throw Error('Ungültiger Quellenverweis.');
  return {objectId:value.objectId,geometryDigest:value.geometryDigest,operation:value.operation};
}

function ordered(value){if(Array.isArray(value))return value.map(ordered);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,ordered(value[k])]));return value===0?0:value;}
export function projectObjectGeometryDigest(node){
  if(!PROJECT_OBJECT_KINDS.includes(node?.kind))throw Error('Unbekannte Objektart.');
  // Include native saved geometry even when it also has a parametric recipe.
  // This is an exact source identity, not an approximate shape equivalence.
  function geometry(n){
    const out={kind:n.kind,transform:n.transform};
    if(n.kind==='cad'){
      for(const key of ['brep','recipe','source','solid','suppressed','operation','finish','partition','extraction'])if(n[key]!==undefined)out[key]=n[key];
      if(n.children)out.children=n.children.map(geometry);
    }else{out.mesh=n.mesh;if(n.meshRole!==undefined)out.meshRole=n.meshRole;}
    return out;
  }
  return cadGeometryDigest(JSON.stringify(ordered(geometry(node))));
}

/** Cheap topological classification for presentation only. Weld EXACT duplicate
 * coordinates logically, without modifying saved vertices. Self intersections,
 * intersecting shells and material nesting require a separate kernel proof. */
export function meshTopologyClass(mesh){
  const {verts,triangles}=mesh,vertices=new Map(),ids=new Array(verts.length/3),edges=new Map(),faces=new Set();let defects=false;
  for(let i=0;i<verts.length;i+=3){const key=verts.slice(i,i+3).join(',');if(!vertices.has(key))vertices.set(key,vertices.size);ids[i/3]=vertices.get(key);}
  for(let i=0;i<triangles.length;i+=3){
    const raw=triangles.slice(i,i+3),face=raw.map(v=>ids[v]),key=[...face].sort((a,b)=>a-b).join(',');
    if(new Set(face).size!==3||faces.has(key))defects=true;faces.add(key);
    const [a,b,c]=raw.map(v=>verts.slice(v*3,v*3+3)),u=b.map((v,k)=>v-a[k]),v=c.map((n,k)=>n-a[k]);
    if(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])===0)defects=true;
    for(let j=0;j<3;j++){const a=face[j],b=face[(j+1)%3],key=a<b?a+','+b:b+','+a,edge=edges.get(key)??{count:0,balance:0};edge.count++;edge.balance+=a<b?1:-1;edges.set(key,edge);}
  }
  let boundaryEdges=0;
  for(const edge of edges.values()){if(edge.count===1)boundaryEdges++;else if(edge.count!==2||edge.balance!==0)defects=true;}
  return {type:defects?'damagedMesh':boundaryEdges?'openMesh':'closedMesh',boundaryEdges,solidProven:false};
}

const topologyCache=new WeakMap();
export function projectObjectType(node){
  if(node.kind==='cad')return 'cad';
  if(node.kind==='referenceMesh')return 'referenceMesh';
  if(node.kind!=='mesh')throw Error('Unbekannte Objektart.');
  // Only immutable confirmed payloads can own a cache entry. Mutable drafts
  // must be reclassified after any point/index edit.
  const immutable=Object.isFrozen(node.mesh)&&Object.isFrozen(node.mesh.verts)&&Object.isFrozen(node.mesh.triangles);
  let result=immutable&&topologyCache.get(node.mesh);if(!result){result=meshTopologyClass(node.mesh);if(immutable)topologyCache.set(node.mesh,result);}return result.type;
}

export function projectObjectCapabilities(node,{solidProof}={}){
  const native=node.kind==='cad',mesh=node.kind==='mesh';
  const proven=mesh&&solidProof?.ok===true&&solidProof.geometryDigest===projectObjectGeometryDigest(node);
  return {transform:true,style:true,cad:native,mesh,reference:node.kind==='referenceMesh',solidTools:native||!!proven,convertToMesh:native&&node.solid===true&&!node.suppressed,convertToCad:mesh&&node.meshRole!=='hole'};
}
export function projectObjectIsHole(node){return node.kind==='cad'?node.solid===false:node.kind==='mesh'&&node.meshRole==='hole';}
