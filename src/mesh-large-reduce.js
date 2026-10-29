import {cadBytesDigest,cadGeometryDigest} from './cad-geometry-digest.js';
import {inspectImportTopology} from './mesh-import-core.js';
import {cadPoint} from './cad-affine.js';
import {MeshoptSimplifier} from 'three/addons/libs/meshopt_simplifier.module.js';
import {meshSelectionGeometryDigest} from './mesh-selection-data.js';

export const LARGE_MESH_LIMITS=Object.freeze({triangles:2000000,vertices:1000000});
const fail=(message,code='LARGE_MESH_REDUCE')=>{throw Object.assign(Error(message),{code});};
const abort=signal=>{if(signal?.aborted)throw Object.assign(Error('Vereinfachung abgebrochen.'),{name:'AbortError'});};
const tick=(i,signal)=>{if(!(i%4096))abort(signal);};
function arrays(mesh){
 if(!mesh||!Array.isArray(mesh.verts)||!Array.isArray(mesh.triangles)||mesh.verts.length%3||mesh.triangles.length%3||mesh.verts.length<9||mesh.triangles.length<3||mesh.verts.length/3>LARGE_MESH_LIMITS.vertices||mesh.triangles.length/3>LARGE_MESH_LIMITS.triangles)fail('Große Netze: höchstens 2 Millionen Dreiecke und 1 Million Punkte.');
 if(mesh.verts.some(v=>!Number.isFinite(v))||mesh.triangles.some(i=>!Number.isSafeInteger(i)||i<0||i>=mesh.verts.length/3))fail('Ungültige Netzkoordinaten oder Dreiecksindizes.');
}
export function largeMeshDigest(mesh){
 arrays(mesh);const v=Float64Array.from(mesh.verts),t=Uint32Array.from(mesh.triangles);
 return cadGeometryDigest(cadBytesDigest(new Uint8Array(v.buffer))+cadBytesDigest(new Uint8Array(t.buffer)));
}
export function validateLargeMeshReduceOptions(o){
 if(!o||Object.getPrototypeOf(o)!==Object.prototype||Object.keys(o).some(k=>!['method','geometryDigest','target','quality','preserveFeatures'].includes(k))||o.method!=='large-v1'||!(/^[a-f0-9]{64}$/).test(o.geometryDigest??'')||!Number.isSafeInteger(o.target)||o.target<4||o.target>LARGE_MESH_LIMITS.triangles||!Number.isInteger(o.quality)||o.quality<0||o.quality>100||typeof o.preserveFeatures!=='boolean')fail('Großnetz-Vereinfachung: Zielzahl ab 4, Qualität 0–100 und gültigen Geometriebezug wählen.');
 return {...o};
}

// Edges use original vertex IDs throughout optimization. Compact numeric keys
// avoid one Map object per edge, and allow exact comparison of old/new defects.
function edgeState(v,t,signal){
 const n=v.length/3,edges=new Float64Array(t.length),bad=new Uint8Array(n),boundary=[],issues=[],degenerate=[];
 for(let i=0;i<t.length;i+=3){tick(i,signal);const a=t[i],b=t[i+1],c=t[i+2],ux=v[b*3]-v[a*3],uy=v[b*3+1]-v[a*3+1],uz=v[b*3+2]-v[a*3+2],wx=v[c*3]-v[a*3],wy=v[c*3+1]-v[a*3+1],wz=v[c*3+2]-v[a*3+2];
  if(a===b||b===c||c===a||Math.hypot(uy*wz-uz*wy,uz*wx-ux*wz,ux*wy-uy*wx)===0){degenerate.push(i/3);bad[a]=bad[b]=bad[c]=1;}
  for(let k=0;k<3;k++){const x=t[i+k],y=t[i+(k+1)%3];edges[i+k]=(Math.min(x,y)*n+Math.max(x,y))*2+(x<y?1:0);}
 }
 edges.sort();
 for(let i=0;i<edges.length;){tick(i,signal);const key=Math.floor(edges[i]/2);let j=i,balance=0;while(j<edges.length&&Math.floor(edges[j]/2)===key){balance+=edges[j]%2?1:-1;j++;}
  if(j-i===1)boundary.push(key);
  else if(j-i!==2||balance!==0){issues.push(key+':'+(j-i)+':'+balance);bad[Math.floor(key/n)]=bad[key%n]=1;}
  i=j;
 }
 return {boundary,issues,bad,degenerate};
}
const same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
// A vertex may join several disconnected triangle fans even when every edge
// has only two incident faces. These pinches must be pinned as well. The
// sortable 64-bit records hold exact edge keys plus original corner indices.
function pinDisjointFans(v,t,locks,signal){
 const n=v.length/3,stride=BigInt(t.length),records=new BigUint64Array(t.length),parents=Uint32Array.from({length:t.length},(_,i)=>i);
 const find=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
 const join=(a,b)=>{a=find(a);b=find(b);if(a!==b)parents[b]=a;};
 for(let i=0;i<t.length;i++){tick(i,signal);const base=i-i%3,a=t[i],b=t[base+(i%3+1)%3];records[i]=BigInt(Math.min(a,b)*n+Math.max(a,b))*stride+BigInt(i);}
 records.sort();
 for(let i=0;i<records.length;){tick(i,signal);const key=records[i]/stride;let end=i+1;while(end<records.length&&records[end]/stride===key)end++;
  if(end-i===2){const a=Number(records[i]%stride),b=Number(records[i+1]%stride),A=a-a%3,B=b-b%3;for(const x of [a,A+(a%3+1)%3]){const y=[b,B+(b%3+1)%3].find(y=>t[y]===t[x]);if(y!==undefined)join(x,y);}}
  i=end;
 }
 const first=new Int32Array(n).fill(-1);for(let i=0;i<t.length;i++){tick(i,signal);const id=t[i],root=find(i);if(first[id]<0)first[id]=root;else if(first[id]!==root)locks[id]=1;}
}
export function largeMeshCatalog(node){arrays(node.mesh);return {geometryDigest:largeMeshDigest(node.mesh),triangles:node.mesh.triangles.length/3,vertices:node.mesh.verts.length/3,protectedTriangles:(node.metadata?.meshProtection?.regions??[]).reduce((n,r)=>n+r.triangleIds.length,0)};}

export async function reduceLargeMesh(node,options,{signal}={}){
 const o=validateLargeMeshReduceOptions(options),mesh=node.mesh;arrays(mesh);abort(signal);
 if(largeMeshDigest(mesh)!==o.geometryDigest)fail('Das Netz wurde geändert. Werkzeug erneut öffnen.','MESH_REDUCE_STALE');
 const count=mesh.triangles.length/3;if(o.target>=count)fail('Eine kleinere Zielzahl wählen.','MESH_REDUCE_NO_CHANGE');
 const verts=mesh.verts,t=Uint32Array.from(mesh.triangles),before=inspectImportTopology({verts,triangles:t},{signal}),state=edgeState(verts,t,signal),world=new Float64Array(verts.length),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(let i=0;i<verts.length;i+=3){tick(i,signal);const p=cadPoint(node.transform,verts.slice(i,i+3));world.set(p,i);for(let k=0;k<3;k++){min[k]=Math.min(min[k],p[k]);max[k]=Math.max(max[k],p[k]);}}
 const center=min.map((v,k)=>(v+max[k])/2),positions=new Float32Array(world.length);let precision=0;
 for(let i=0;i<world.length;i++){const x=world[i]-center[i%3];positions[i]=x;precision=Math.max(precision,Math.abs(x-positions[i]));}
 const maxDeviation=.001*Math.pow(1000,(100-o.quality)/100);
 if(precision*4>=maxDeviation)fail('Qualität ist für die numerische Auflösung dieses Modells zu hoch. Qualität etwas verringern.');
 const fixed=new Uint8Array(count),locks=state.bad.slice(),regions=node.metadata?.meshProtection?.regions??[];pinDisjointFans(verts,t,locks,signal);
 // Existing damaged neighborhoods are copied exactly, rather than claiming a
 // repair or silently allowing additional nonmanifold connections.
 for(let i=0;i<t.length;i+=3)if(locks[t[i]]||locks[t[i+1]]||locks[t[i+2]])fixed[i/3]=1;
 const protectionDigest=regions.length?meshSelectionGeometryDigest(mesh):null;for(const region of regions){if(region.geometryDigest!==protectionDigest)fail('Veralteter Schutzbereich.');for(const id of region.triangleIds){if(!Number.isSafeInteger(id)||id<0||id>=count)fail('Veralteter Schutzbereich.');fixed[id]=1;}}
 const outside=[],selected=[],faceMap=new Map();
 for(let i=0;i<t.length;i+=3){tick(i,signal);const ids=[t[i],t[i+1],t[i+2]];if(fixed[i/3]){faceMap.set(i/3,outside.length/3);outside.push(...ids);ids.forEach(id=>locks[id]=1);}else selected.push(...ids);}
 if(o.preserveFeatures){
  const seed=new Float32Array(world.length),seen=new Uint8Array(locks.length),cos=Math.cos(35*Math.PI/180);
  for(let i=0;i<t.length;i+=3){tick(i,signal);const a=t[i]*3,b=t[i+1]*3,c=t[i+2]*3,ux=world[b]-world[a],uy=world[b+1]-world[a+1],uz=world[b+2]-world[a+2],wx=world[c]-world[a],wy=world[c+1]-world[a+1],wz=world[c+2]-world[a+2],n=[uy*wz-uz*wy,uz*wx-ux*wz,ux*wy-uy*wx],len=Math.hypot(...n);if(!len)continue;
   for(const id of [t[i],t[i+1],t[i+2]]){if(!seen[id]){seen[id]=1;seed.set(n.map(v=>v/len),id*3);}else if(n.reduce((s,v,k)=>s+v/len*seed[id*3+k],0)<cos)locks[id]=1;}
  }
 }
 await MeshoptSimplifier.ready;abort(signal);
 let candidate,error,attempts=0,combined,after,post;
 const target=Math.max(3,(o.target-outside.length/3)*3),budget=maxDeviation-precision*4;
 for(;attempts<5;attempts++){
  [candidate,error]=MeshoptSimplifier.simplifyWithAttributes(Uint32Array.from(selected),positions,3,new Float32Array(0),0,[],locks,Math.min(selected.length,target),budget,['LockBorder','ErrorAbsolute']);abort(signal);
  combined=new Uint32Array(outside.length+candidate.length);combined.set(outside);combined.set(candidate,outside.length);
  after=inspectImportTopology({verts,triangles:combined},{signal});post=edgeState(verts,combined,signal);
  if(same(state.boundary,post.boundary)&&same(state.issues,post.issues)&&state.degenerate.length===post.degenerate.length&&before.components===after.components&&before.euler===after.euler)break;
  // A collapse can expose a pinched vertex in a damaged input. Pin the
  // implicated original vertices and their source one-ring, then recompute.
  const pin=post.bad.slice();pinDisjointFans(verts,combined,pin,signal);for(const key of post.boundary){pin[Math.floor(key/locks.length)]=pin[key%locks.length]=1;}
  for(let i=0;i<t.length;i+=3)if(pin[t[i]]||pin[t[i+1]]||pin[t[i+2]])locks[t[i]]=locks[t[i+1]]=locks[t[i+2]]=1;
 }
 if(attempts===5)throw Object.assign(Error('Die Nachprüfung findet neue Verbindungsfehler. Höhere Qualität oder Kantenschutz wählen.'),{code:'LARGE_MESH_TOPOLOGY',feedback:{before,after,oldIssues:state.issues.slice(0,30),newIssues:post.issues.slice(0,30),oldBoundary:state.boundary.length,newBoundary:post.boundary.length,pinned:locks.reduce((s,v)=>s+v,0)}});
 if(candidate.length>=selected.length)fail('Innerhalb der gewählten Qualität und Schutzbereiche keine Reduktion möglich.','MESH_REDUCE_NO_CHANGE');
 if(!Number.isFinite(error)||error>Math.fround(budget))fail('Optimiererschätzung überschreitet das gewählte Budget.');
 const remap=new Int32Array(verts.length/3).fill(-1),result={verts:[],triangles:new Array(combined.length)};for(let i=0;i<combined.length;i++){const id=combined[i];if(remap[id]<0){remap[id]=result.verts.length/3;result.verts.push(verts[id*3],verts[id*3+1],verts[id*3+2]);}result.triangles[i]=remap[id];}
 let protection=null;if(regions.length){const digest=meshSelectionGeometryDigest(result);protection={format:'FormnaroMeshProtection',version:1,regions:regions.map(r=>({...structuredClone(r),geometryDigest:digest,triangleIds:r.triangleIds.map(id=>faceMap.get(id)).sort((a,b)=>a-b)}))};}
 abort(signal);return {mesh:result,protection,report:{method:'large-v1',beforeTriangles:count,afterTriangles:combined.length/3,target:o.target,targetReached:combined.length/3<=o.target,quality:o.quality,maxDeviation,errorEstimateMm:error+precision*4,errorIsGlobalDistanceProof:false,coordinatesMoved:false,protectedGeometryExact:true,topologyChecked:true,existingDefectsPreserved:true,sourceDefects:{boundary:before.boundary,nonmanifold:before.nonmanifold,degenerate:before.degenerate},before,after,attempts:attempts+1,solidProven:false}};
}
