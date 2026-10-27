import {cadExportTriangleNormal} from './cad-export-triangles.js';

const fail=(message,code='MESH_SIMPLE_REPAIR')=>{throw Object.assign(Error(message),{code});};
const abort=signal=>{if(signal?.aborted)throw Object.assign(Error('Netzreparatur abgebrochen.'),{name:'AbortError'});};
const tick=(i,signal)=>{if(!(i%1024))abort(signal);};
export function validateSimpleRepairOptions(o){
 if(!o||Object.getPrototypeOf(o)!==Object.prototype||Object.keys(o).some(k=>!['method','geometryDigest','removeDegenerate','removeDuplicates','orient','smallTriangleLimit','removeComponents'].includes(k))||o.method!=='simple-v1'||typeof o.geometryDigest!=='string'||!(/^[a-f0-9]{64}$/).test(o.geometryDigest)||['removeDegenerate','removeDuplicates','orient'].some(k=>typeof o[k]!=='boolean')||!Number.isSafeInteger(o.smallTriangleLimit)||o.smallTriangleLimit<0||o.smallTriangleLimit>500000||!Array.isArray(o.removeComponents)||o.removeComponents.length>256||new Set(o.removeComponents).size!==o.removeComponents.length||o.removeComponents.some(i=>!Number.isSafeInteger(i)||i<0||i>=500000))fail('Ungültige Optionen für die gezielte Netzreparatur.');
 return {...o,removeComponents:[...o.removeComponents].sort((a,b)=>a-b)};
}
function dsu(size){const p=Uint32Array.from({length:size},(_,i)=>i);const find=i=>{while(p[i]!==i){p[i]=p[p[i]];i=p[i];}return i;};return {find,join(a,b){a=find(a);b=find(b);if(a!==b)p[Math.max(a,b)]=Math.min(a,b);}};}
function components(topology,signal){
 const links=dsu(topology.triangles);let i=0;
 for(const edge of topology.edges.values()){tick(i++,signal);const faces=edge.incidents;for(let j=1;j<faces.length;j++)links.join(faces[0].face,faces[j].face);}
 const byRoot=new Map();for(let face=0;face<topology.triangles;face++){tick(face,signal);const id=links.find(face);if(!byRoot.has(id))byRoot.set(id,[]);byRoot.get(id).push(face);}
 const list=[...byRoot.values()].sort((a,b)=>b.length-a.length||a[0]-b[0]),owners=new Map(),touching=new Set();
 for(let c=0;c<list.length;c++)for(const face of list[c]){tick(face,signal);for(let k=0;k<3;k++){const v=topology.representatives[topology.mesh.triangles[face*3+k]],old=owners.get(v);if(old===undefined)owners.set(v,c);else if(old!==c){touching.add(old);touching.add(c);}}}
 return {list,touching};
}
/** Bounded pages; identifiers are original first-triangle IDs, bound to SHA. */
export function simpleRepairCatalog(topology,{smallTriangleLimit=20,offset=0,signal}={}){
 if(!Number.isSafeInteger(smallTriangleLimit)||smallTriangleLimit<0||smallTriangleLimit>500000||!Number.isSafeInteger(offset)||offset<0||offset>500000)fail('Ungültige Grenze oder Seite für Nebenbestandteile.');
 const {list,touching}=components(topology,signal),candidates=[];
 for(let index=1;index<list.length;index++)if(list[index].length<=smallTriangleLimit)candidates.push({id:list[index][0],triangleCount:list[index].length,touchesOther:touching.has(index),faces:list[index]});
 const page=candidates.slice(offset,offset+128).map(({faces,...item})=>{const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const face of faces){tick(face,signal);for(let k=0;k<3;k++){const id=topology.mesh.triangles[face*3+k];for(let a=0;a<3;a++){const v=topology.mesh.verts[id*3+a];min[a]=Math.min(min[a],v);max[a]=Math.max(max[a],v);}}}return {...item,bounds:{min,max}};});
 abort(signal);return {format:'FormnaroSimpleRepairCatalog',version:1,geometryDigest:topology.geometryDigest,triangles:topology.triangles,componentCount:list.length,smallTriangleLimit,total:candidates.length,offset,components:page};
}
/** Only remove existing faces or swap two indices. All used coordinates are
 * copied exactly. No fill, weld, T-junction split, outward or volume guessing. */
export function repairSimpleTopology(topology,options,{signal}={}){
 const o=validateSimpleRepairOptions(options);abort(signal);if(o.geometryDigest!==topology.geometryDigest)fail('Der Reparaturbezug ist veraltet. Das aktuelle Netz erneut prüfen.','MESH_REPAIR_STALE');
 const {mesh,representatives}=topology,{list,touching}=components(topology,signal),removed=new Set(),selected=new Set(o.removeComponents);
 for(let index=0;index<list.length;index++)if(selected.has(list[index][0])){
  if(index===0||list[index].length>o.smallTriangleLimit||touching.has(index))fail('Nur ausdrücklich gewählte kleine, vollständig getrennte Nebenbestandteile entfernen. Der Hauptbestandteil bleibt erhalten.');
  selected.delete(list[index][0]);for(const face of list[index])removed.add(face);
 }
 if(selected.size)fail('Ein gewählter Nebenbestandteil ist nicht mehr vorhanden. Erneut auswählen.');
 const removedPartFaces=removed.size,faces=[],originalIds=[],seen=new Set(),bad=[];let removedDegenerate=0,removedDuplicates=0;
 for(let face=0;face<topology.triangles;face++){
  tick(face,signal);if(removed.has(face))continue;
  const ids=mesh.triangles.slice(face*3,face*3+3),logical=ids.map(i=>representatives[i]),normal=cadExportTriangleNormal(...ids.map(i=>mesh.verts.slice(i*3,i*3+3))),key=[...logical].sort((a,b)=>a-b).join(',');
  if(!normal&&o.removeDegenerate){removedDegenerate++;continue;}
  if(normal&&o.removeDuplicates&&seen.has(key)){removedDuplicates++;continue;}
  if(normal)seen.add(key);faces.push(ids);originalIds.push(face);bad.push(!normal);
 }
 if(!faces.length)fail('Die Reparatur würde alle Flächen entfernen. Das Original bleibt erhalten.');
 const edges=new Map(),faceLinks=dsu(faces.length),duplicateOwners=new Map();
 for(let i=0;i<faces.length;i++){tick(i,signal);const ids=faces[i].map(v=>representatives[v]),key=[...ids].sort((a,b)=>a-b).join(',');if(duplicateOwners.has(key)){bad[i]=bad[duplicateOwners.get(key)]=true;}else duplicateOwners.set(key,i);
  for(let k=0;k<3;k++){const a=ids[k],b=ids[(k+1)%3];if(a===b)continue;const key=a<b?a+':'+b:b+':'+a;if(!edges.has(key))edges.set(key,[]);edges.get(key).push({face:i,direction:a<b?1:-1});}
 }
 const neighbors=Array.from({length:faces.length},()=>[]);let step=0;
 for(const edge of edges.values()){tick(step++,signal);for(let j=1;j<edge.length;j++)faceLinks.join(edge[0].face,edge[j].face);if(edge.length>2)for(const e of edge)bad[e.face]=true;else if(edge.length===2){const [a,b]=edge,same=a.direction===b.direction;neighbors[a.face].push([b.face,same]);neighbors[b.face].push([a.face,same]);}}
 const groups=new Map();for(let i=0;i<faces.length;i++){tick(i,signal);const root=faceLinks.find(i);if(!groups.has(root))groups.set(root,[]);groups.get(root).push(i);}
 const flippedOriginalIds=[];let skippedOrientationComponents=0;
 if(o.orient){const parity=new Int8Array(faces.length).fill(-1);
  for(const group of groups.values()){
   abort(signal);if(group.some(i=>bad[i])){skippedOrientationComponents++;continue;}
   const queue=[group[0]];parity[group[0]]=0;let conflict=false,ones=0;
   for(let head=0;head<queue.length;head++){tick(head,signal);const face=queue[head];ones+=parity[face];for(const [next,same]of neighbors[face]){const want=parity[face]^(same?1:0);if(parity[next]!==-1){if(parity[next]!==want)conflict=true;}else{parity[next]=want;queue.push(next);}}}
   if(conflict||queue.length!==group.length){skippedOrientationComponents++;continue;}
   const invert=ones>group.length-ones;for(const face of group)if(parity[face]^(invert?1:0)){[faces[face][1],faces[face][2]]=[faces[face][2],faces[face][1]];flippedOriginalIds.push(originalIds[face]);}
  }
 }
 if(!removedPartFaces&&!removedDegenerate&&!removedDuplicates&&!flippedOriginalIds.length)fail(skippedOrientationComponents?'Keine geeignete Änderung. Die betroffenen Orientierungsbereiche sind mehrdeutig oder enthalten weitere Fehler.':'Keine Änderung für die gewählten Reparaturschritte gefunden.','MESH_REPAIR_NO_CHANGE');
 const used=new Uint8Array(mesh.verts.length/3);for(let i=0;i<faces.length;i++){tick(i,signal);for(const id of faces[i])used[id]=1;}
 const verts=[],map=new Uint32Array(used.length);for(let i=0;i<used.length;i++){tick(i,signal);if(used[i]){map[i]=verts.length/3;verts.push(...mesh.verts.slice(i*3,i*3+3));}}
 const triangles=[];for(let i=0;i<faces.length;i++){tick(i,signal);for(const id of faces[i])triangles.push(map[id]);}
 abort(signal);return {mesh:{verts,triangles},report:{removedDegenerate,removedDuplicates,removedComponents:o.removeComponents.length,removedComponentFaces:removedPartFaces,flippedFaces:flippedOriginalIds.length,skippedOrientationComponents,removedUnusedVertices:used.length-verts.length/3,beforeTriangles:topology.triangles,afterTriangles:faces.length,coordinatesMoved:false,holesFilled:0,scope:'existing-faces-only'}};
}
