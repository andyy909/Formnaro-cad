import {MeshoptSimplifier} from 'three/addons/libs/meshopt_simplifier.module.js';

// File budgets are independent of project/solid-tool budgets. Large temporary
// buffers stay in the disposable import worker, never in project history.
import {MESH_IMPORT_LIMITS} from './mesh-import-limits.js';
export {MESH_IMPORT_LIMITS};
const fail=(message,code='MESH_IMPORT_INVALID')=>{throw Object.assign(Error(message),{code});};
const abort=signal=>{if(signal?.aborted)throw Object.assign(Error('Netzimport abgebrochen.'),{name:'AbortError'});};
function tick(i,signal){if(!(i%4096))abort(signal);}

/** Strict binary length preflight before allocating; binary headers may say solid. */
export function readImportStl(buffer,{unit=1,signal}={}){
 if(!(buffer instanceof ArrayBuffer)||buffer.byteLength>MESH_IMPORT_LIMITS.bytes)fail('STL-Import: maximal 256 MiB.','MESH_IMPORT_LIMIT');
 if(![1,10,25.4].includes(unit))fail('Ungültige Importeinheit.');
 const view=new DataView(buffer);let positions,triangles;
 const count=buffer.byteLength>=84?view.getUint32(80,true):0,binary=count>0&&84+count*50===buffer.byteLength;
 if(binary){
  if(count>MESH_IMPORT_LIMITS.triangles)fail('STL-Import: maximal 5 Millionen Dreiecke.','MESH_IMPORT_LIMIT');
  positions=new Float32Array(count*9);triangles=count;
  for(let f=0;f<count;f++){tick(f,signal);for(let j=0;j<9;j++)positions[f*9+j]=view.getFloat32(84+f*50+12+j*4,true)*unit;}
 }else{
  if(buffer.byteLength>MESH_IMPORT_LIMITS.asciiBytes)fail('ASCII-STL: maximal 64 MiB; große Dateien als binäre STL speichern.','MESH_IMPORT_LIMIT');
  const text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);
  if(!/^\s*solid\b/i.test(text)||!(/\bendsolid\b/i).test(text))fail('Keine vollständige binäre oder ASCII-STL.');
  const faces=[...text.matchAll(/\bfacet\s+normal\s+[^\r\n]*\s+outer\s+loop\s+([\s\S]*?)\s+endloop\s+endfacet\b/gi)];
  triangles=faces.length;if(!triangles||triangles>MESH_IMPORT_LIMITS.triangles)fail('Leere oder zu große ASCII-STL.');
  if((text.match(/\bfacet\s+normal\b/gi)||[]).length!==triangles)fail('Unvollständige ASCII-STL-Fläche.');
  positions=new Float32Array(triangles*9);
  for(let f=0;f<triangles;f++){tick(f,signal);const vertices=[...faces[f][1].matchAll(/\bvertex\s+(\S+)\s+(\S+)\s+(\S+)/gi)];if(vertices.length!==3)fail('Jede STL-Fläche muss drei Punkte besitzen.');for(let j=0;j<3;j++)for(let k=0;k<3;k++)positions[f*9+j*3+k]=Number(vertices[j][k+1])*unit;}
 }
 for(let i=0;i<positions.length;i++){tick(i,signal);if(!Number.isFinite(positions[i])||Math.abs(positions[i])>100000)fail('STL enthält ungültige oder zu große Koordinaten.');if(positions[i]===0)positions[i]=0;}
 return {positions,inputTriangles:triangles,encoding:binary?'binary':'ascii'};
}

export async function compactImportPositions(positions,{signal}={}){
 abort(signal);await MeshoptSimplifier.ready;abort(signal);
 const remap=MeshoptSimplifier.generatePositionRemap(positions,3),dense=new Uint32Array(remap.length).fill(0xffffffff);let count=0;
 for(let i=0;i<remap.length;i++){tick(i,signal);if(remap[i]===i)dense[i]=count++;}
 const verts=new Float32Array(count*3),triangles=new Uint32Array(remap.length);
 for(let i=0;i<remap.length;i++){tick(i,signal);const id=dense[remap[i]];triangles[i]=id;if(remap[i]===i)verts.set(positions.subarray(i*3,i*3+3),id*3);}
 return {verts,triangles};
}

/** Independent edge incidence, winding, Euler and component check. Sorted typed
 * arrays avoid millions of JS Map objects; this is NOT a self-intersection test. */
export function inspectImportTopology(mesh,{signal,boundaryKeys=false}={}){
 const {verts:v,triangles:t}=mesh,n=v.length/3,edges=new Float64Array(t.length),used=new Uint8Array(n),parents=Uint32Array.from({length:n},(_,i)=>i);
 const find=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
 const join=(a,b)=>{a=find(a);b=find(b);if(a!==b)parents[Math.max(a,b)]=Math.min(a,b);};
 let degenerate=0,volume=0;const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(let f=0;f<t.length;f+=3){tick(f,signal);const a=t[f],b=t[f+1],c=t[f+2],u=[0,1,2].map(k=>v[b*3+k]-v[a*3+k]),w=[0,1,2].map(k=>v[c*3+k]-v[a*3+k]),normal=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]];
  if(a===b||b===c||c===a||Math.hypot(...normal)===0)degenerate++;
  // Relative origin avoids cancellation when geometry is far from world zero.
  const p=[0,1,2].map(k=>v[a*3+k]-v[t[0]*3+k]);volume+=(p[0]*normal[0]+p[1]*normal[1]+p[2]*normal[2])/6;
  for(let k=0;k<3;k++){const x=t[f+k],y=t[f+(k+1)%3];used[x]=1;join(x,y);edges[f+k]=(Math.min(x,y)*n+Math.max(x,y))*2+(x<y?1:0);for(let axis=0;axis<3;axis++){min[axis]=Math.min(min[axis],v[x*3+axis]);max[axis]=Math.max(max[axis],v[x*3+axis]);}}
 }
 abort(signal);edges.sort();abort(signal);let boundary=0,nonmanifold=0,orientation=0,edgeCount=0;const boundaryEdges=boundaryKeys?[]:null;
 for(let i=0;i<edges.length;){tick(i,signal);const key=Math.floor(edges[i]/2);let end=i,balance=0;while(end<edges.length&&Math.floor(edges[end]/2)===key){balance+=edges[end]%2?1:-1;end++;}edgeCount++;if(end-i===1){boundary++;boundaryEdges?.push(edges[i]);}else if(end-i!==2)nonmanifold++;else if(balance)orientation++;i=end;}
 let vertices=0,components=0;for(let i=0;i<n;i++){tick(i,signal);if(used[i]){vertices++;if(find(i)===i)components++;}}
 return {vertices,triangles:t.length/3,edges:edgeCount,boundary,nonmanifold,orientation,degenerate,components,euler:vertices-edgeCount+t.length/3,volume,bounds:{min,max},selfIntersections:'not-checked',solidProven:false,...(boundaryKeys?{boundaryEdges}:{})};
}

function compactIndexed(v,t){const map=new Uint32Array(v.length/3).fill(0xffffffff);let count=0;for(const id of t)if(map[id]===0xffffffff)map[id]=count++;const verts=new Float32Array(count*3),triangles=new Uint32Array(t.length);for(let i=0;i<map.length;i++)if(map[i]!==0xffffffff)verts.set(v.subarray(i*3,i*3+3),map[i]*3);for(let i=0;i<t.length;i++)triangles[i]=map[t[i]];return {verts,triangles};}

// Locked, densely subdivided straight creases can leave exactly collinear
// triangles after simplification. Remove only these zero-area faces, and split
// their one remaining long-edge neighbour at the SAME existing middle point.
// No approximate collinearity, point movement, cap or tolerance relaxation.
function resolveCollapsedFaces(v,t,{signal}={}){
 const edgeKey=(a,b)=>a<b?a+':'+b:b+':'+a,requests=new Map();let faces=[],removed=0;
 for(let i=0;i<t.length;i+=3){tick(i,signal);const ids=[t[i],t[i+1],t[i+2]],p=ids.map(id=>[v[id*3],v[id*3+1],v[id*3+2]]),u=p[1].map((x,k)=>x-p[0][k]),w=p[2].map((x,k)=>x-p[0][k]);
  if(u[1]*w[2]-u[2]*w[1]!==0||u[2]*w[0]-u[0]*w[2]!==0||u[0]*w[1]-u[1]*w[0]!==0){faces.push(ids);continue;}
  if(new Set(ids).size!==3)fail('Vereinfachung erzeugte zusammengefallene Indizes.','MESH_IMPORT_SIMPLIFY_UNSAFE');
  const length=p.map((a,j)=>a.reduce((sum,x,k)=>sum+(x-p[(j+1)%3][k])**2,0)),j=length.indexOf(Math.max(...length)),key=edgeKey(ids[j],ids[(j+1)%3]);
  if(requests.has(key)||++removed>10000)fail('Zu viele oder mehrdeutige kollineare Restflächen.','MESH_IMPORT_SIMPLIFY_UNSAFE');requests.set(key,ids[(j+2)%3]);
 }
 if(!removed)return {indices:t,resolved:0};
 for(let pass=0;requests.size&&pass<32;pass++){
  const next=[];let changed=0;
  for(let i=0;i<faces.length;i++){tick(i,signal);const ids=faces[i];let split=false;
   for(let k=0;k<3;k++){const a=ids[k],b=ids[(k+1)%3],c=ids[(k+2)%3],key=edgeKey(a,b),middle=requests.get(key);if(middle===undefined)continue;if(ids.includes(middle))fail('Mehrdeutige kollineare Restfläche.','MESH_IMPORT_SIMPLIFY_UNSAFE');next.push([a,middle,c],[middle,b,c]);requests.delete(key);changed++;split=true;break;}
   if(!split)next.push(ids);
  }
  faces=next;if(!changed)break;
 }
 if(requests.size)fail('Kollineare Restflächen konnten nicht exakt aufgelöst werden.','MESH_IMPORT_SIMPLIFY_UNSAFE');
 return {indices:Uint32Array.from(faces.flat()),resolved:removed};
}

/** Only existing vertex positions; pin pronounced creases and all extrema.
 * LockBorder keeps open contours. No sloppy/prune/permissive/update mode. */
export async function simplifyImportMesh(mesh,{targetTriangles=MESH_IMPORT_LIMITS.targetTriangles,maxError=.02,signal}={}){
 if(!Number.isSafeInteger(targetTriangles)||targetTriangles<4||targetTriangles>MESH_IMPORT_LIMITS.workingTriangles||!Number.isFinite(maxError)||maxError<0||maxError>1)fail('Vereinfachung: 4–500.000 Dreiecke und 0–1 mm Fehlerwert wählen.');
 const before=inspectImportTopology(mesh,{signal,boundaryKeys:true});
 if(before.degenerate||before.nonmanifold||before.orientation)fail('Großes beschädigtes Netz zuerst bereinigen; eine topologisch unklare Quelle wird nicht automatisch vereinfacht.','MESH_IMPORT_SIMPLIFY_UNSAFE');
 if(before.triangles<=targetTriangles)return {mesh,report:{changed:false,beforeTriangles:before.triangles,afterTriangles:before.triangles,targetReached:true}};
 await MeshoptSimplifier.ready;abort(signal);
 const {verts:v,triangles:t}=mesh,lock=new Uint8Array(v.length/3),seed=new Float32Array(v.length),seen=new Uint8Array(v.length/3),cos=Math.cos(35*Math.PI/180);
 for(let i=0;i<t.length;i+=3){tick(i,signal);const a=t[i]*3,b=t[i+1]*3,c=t[i+2]*3,ux=v[b]-v[a],uy=v[b+1]-v[a+1],uz=v[b+2]-v[a+2],vx=v[c]-v[a],vy=v[c+1]-v[a+1],vz=v[c+2]-v[a+2],nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,len=Math.hypot(nx,ny,nz),normal=[nx/len,ny/len,nz/len];
  for(let k=0;k<3;k++){const id=t[i+k];if(!seen[id]){seen[id]=1;seed.set(normal,id*3);}else if(seed[id*3]*normal[0]+seed[id*3+1]*normal[1]+seed[id*3+2]*normal[2]<cos)lock[id]=1;}
 }
 const extremes=new Uint8Array(6);for(let i=0;i<v.length;i+=3){tick(i,signal);for(let k=0;k<3;k++)for(let side=0;side<2;side++){const slot=k*2+side;if(!extremes[slot]&&v[i+k]===(side?before.bounds.max[k]:before.bounds.min[k])){lock[i/3]=1;extremes[slot]=1;}}}
 const [candidate,error]=MeshoptSimplifier.simplifyWithAttributes(t,v,3,new Float32Array(0),0,[],lock,targetTriangles*3,maxError,['LockBorder','ErrorAbsolute']);
 const {indices,resolved}=resolveCollapsedFaces(v,candidate,{signal});
 abort(signal);const after=inspectImportTopology({verts:v,triangles:indices},{signal,boundaryKeys:true});
 if(!Number.isFinite(error)||error>Math.fround(maxError)||after.degenerate||after.nonmanifold||after.orientation||before.components!==after.components||before.euler!==after.euler||before.boundary!==after.boundary||before.boundaryEdges.some((v,i)=>v!==after.boundaryEdges[i])||JSON.stringify(before.bounds)!==JSON.stringify(after.bounds))throw Object.assign(Error('Vereinfachtes Netz hat die unabhängige Topologieprüfung nicht bestanden.'),{code:'MESH_IMPORT_SIMPLIFY_UNSAFE',feedback:{error,maxError,before:{...before,boundaryEdges:undefined},after:{...after,boundaryEdges:undefined}}});
 const retained=new Uint8Array(v.length/3);for(const id of indices)retained[id]=1;for(let i=0;i<lock.length;i++)if(lock[i]&&!retained[i])fail('Ein gesperrter Merkmalspunkt fehlt nach der Vereinfachung.','MESH_IMPORT_SIMPLIFY_UNSAFE');
 delete before.boundaryEdges;delete after.boundaryEdges;const output=compactIndexed(v,indices);
 return {mesh:output,report:{method:'meshoptimizer-locked-v1',changed:indices.length<t.length,beforeTriangles:before.triangles,afterTriangles:after.triangles,targetTriangles,targetReached:after.triangles<=targetTriangles,errorEstimateMm:error,requestedErrorMm:maxError,errorIsGlobalDistanceProof:false,boundariesLocked:true,creaseAngle:35,exactCollinearResolutions:resolved,topologyChecked:true,before,after}};
}

export async function prepareImportStl(buffer,{unit=1,repair=true,simplify=true,targetTriangles=MESH_IMPORT_LIMITS.targetTriangles,maxError=.02,signal,onProgress=()=>{}}={}){
 if(typeof repair!=='boolean'||typeof simplify!=='boolean')fail('Ungültige Importoptionen.');
 onProgress('STL lesen …');const source=readImportStl(buffer,{unit,signal});
 const sourceSha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),v=>v.toString(16).padStart(2,'0')).join('');abort(signal);
 onProgress('Identische Punkte zusammenfassen …');let mesh=await compactImportPositions(source.positions,{signal});source.positions=null;
 const report={format:'FormnaroMeshImport',version:1,sourceSha256,inputTriangles:source.inputTriangles,encoding:source.encoding,unit,coordinatesMoved:false,originalFileChanged:false,repair:{status:repair?'pending':'disabled'},simplification:{changed:false},warnings:[]};
 if(repair&&mesh.triangles.length/3<=MESH_IMPORT_LIMITS.workingTriangles){
  onProgress('Netz automatisch bereinigen …');
  const {buildMeshSelectionTopology}=await import('./mesh-selection-data.js'),{repairSimpleTopology}=await import('./mesh-simple-repair.js');
  const original={verts:Array.from(mesh.verts),triangles:Array.from(mesh.triangles)},topology=buildMeshSelectionTopology(original,{signal});
  try{const fixed=repairSimpleTopology(topology,{method:'simple-v1',geometryDigest:topology.geometryDigest,removeDegenerate:true,removeDuplicates:true,orient:true,smallTriangleLimit:0,removeComponents:[]},{signal});mesh={verts:new Float32Array(fixed.mesh.verts),triangles:new Uint32Array(fixed.mesh.triangles)};report.repair={status:'cleaned',...fixed.report};}
  catch(error){if(error.name==='AbortError')throw error;if(error.code!=='MESH_REPAIR_NO_CHANGE')throw error;report.repair={status:'no-change'};}
 }else if(repair){report.repair={status:'deferred',reason:'Zuerst große Arbeitskopie verkleinern.'};}
 if(simplify&&mesh.triangles.length/3>MESH_IMPORT_LIMITS.workingTriangles){onProgress('Großes Netz kontrolliert vereinfachen …');const result=await simplifyImportMesh(mesh,{targetTriangles,maxError,signal});mesh=result.mesh;report.simplification=result.report;}
 if(mesh.triangles.length/3>MESH_IMPORT_LIMITS.workingTriangles)fail('Das Netz bleibt über 500.000 Dreiecken. Vereinfachung einschalten oder Fehlerwert anpassen. Das Original bleibt unverändert.','MESH_IMPORT_WORKING_LIMIT');
 onProgress('Ergebnis prüfen …');report.topology=inspectImportTopology(mesh,{signal});report.outputTriangles=mesh.triangles.length/3;report.outputVertices=mesh.verts.length/3;
 if(report.topology.boundary||report.topology.nonmanifold||report.topology.orientation||report.topology.degenerate)report.warnings.push('Netz enthält offene oder beschädigte Verbindungen. Es wird trotzdem geladen; Körperwerkzeuge benötigen eine Reparatur.');
 if(report.simplification.changed)report.warnings.push('Vereinfachte Arbeitskopie. Fehlerwert ist eine Algorithmusschätzung, kein globaler Maßnachweis. Originaldatei zum erneuten Import behalten.');
 abort(signal);return {mesh:{verts:Array.from(mesh.verts),triangles:Array.from(mesh.triangles)},report};
}
