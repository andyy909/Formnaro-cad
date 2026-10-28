import {placement,bounds,triangleQuality,quality,sampledDeviation} from './mesh-remesh-geometry.js';
import {remeshCurvedMesh} from './mesh-curved-remesh.js';
import {buildMeshSelectionTopology} from './mesh-selection-data.js';
import {inspectMeshTopology} from './mesh-inspector.js';

export const MESH_REMESH_LIMIT=150000;
export const MESH_REMESH_OUTPUT_LIMIT=250000;
const fail=(message,code='MESH_REMESH')=>{throw Object.assign(Error(message),{code});};
const abort=signal=>{if(signal?.aborted)throw Object.assign(Error('Neuvernetzen abgebrochen.'),{name:'AbortError'});};
const tick=(i,signal)=>{if(!(i%512))abort(signal);};
const sub=(a,b)=>a.map((v,k)=>v-b[k]);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>Math.hypot(...a);
const ekey=(a,b)=>a<b?a+':'+b:b+':'+a;
const fkey=ids=>[...ids].sort((a,b)=>a-b).join(':');
const mean=points=>[0,1,2].map(k=>points.reduce((s,p)=>s+p[k],0)/points.length);
const bad=['duplicate','degenerate','orientation','nonmanifoldEdge','nonmanifoldVertex'];
function inspect(topology,signal){const r=inspectMeshTopology(topology,{smallTriangleLimit:0,signal});if(bad.some(k=>r.categories[k].count))fail('Das Netz enthält mehrdeutige, doppelte, entartete oder falsch verbundene Flächen. Vor dem Neuvernetzen gezielt reparieren.');return r;}

export function validateMeshRemeshOptions(o){
 const allowed=['method','mode','geometryDigest','scope','triangleIds','targetEdgeLength','iterations','maxDeviation','featureAngle'];
 if(!o||Object.getPrototypeOf(o)!==Object.prototype||Object.keys(o).some(k=>!allowed.includes(k))||!['planar-isotropic-v1','curved-isotropic-v1'].includes(o.method)||!['subdivide','remesh'].includes(o.mode)||!(/^[a-f0-9]{64}$/).test(o.geometryDigest??'')||!['all','selection'].includes(o.scope)||!Array.isArray(o.triangleIds)||o.triangleIds.length>MESH_REMESH_LIMIT||new Set(o.triangleIds).size!==o.triangleIds.length||o.triangleIds.some(i=>!Number.isSafeInteger(i)||i<0||i>=MESH_REMESH_LIMIT)||o.scope==='all'&&o.triangleIds.length||o.scope==='selection'&&!o.triangleIds.length||typeof o.targetEdgeLength!=='number'||!Number.isFinite(o.targetEdgeLength)||o.targetEdgeLength<=0||o.targetEdgeLength>1e6||!Number.isSafeInteger(o.iterations)||o.iterations<1||o.iterations>8||typeof o.maxDeviation!=='number'||!Number.isFinite(o.maxDeviation)||o.maxDeviation<0||o.maxDeviation>1)fail('Ungültige Optionen oder veraltete Flächenauswahl für das Neuvernetzen. Kantenlänge > 0 bis 1.000.000 mm, 1 bis 8 Durchläufe und Abweichung 0 bis 1 mm wählen.');
 if(o.method==='curved-isotropic-v1'&&(o.mode!=='remesh'||typeof o.featureAngle!=='number'||!Number.isFinite(o.featureAngle)||o.featureAngle<1||o.featureAngle>90)||o.method==='planar-isotropic-v1'&&o.featureAngle!==undefined)fail('Für gekrümmte Netze einen Formkantenwinkel von 1 bis 90 Grad wählen.');
 return {...o,triangleIds:[...o.triangleIds].sort((a,b)=>a-b)};
}
/** Conforming edge subdivision preserves the original faceted surface. The
 * remesh mode additionally improves diagonals and interior vertex positions in
 * fixed planar patches; curves, patch contours and scope/mask borders stay fixed.
 * No normal smoothing, curve approximation, coarsening or automatic repair.
 */
export function remeshPlanarMesh(node,options,{signal}={}){
 const o=validateMeshRemeshOptions(options);if(o.method==='curved-isotropic-v1')return remeshCurvedMesh(node,o,{signal});const mesh=node?.mesh;abort(signal);
 if(mesh?.triangles?.length/3>MESH_REMESH_LIMIT)fail('Neuvernetzen unterstützt bis zu 150.000 Ausgangsdreiecke je Netz. Ein kleineres Netz auswählen.','MESH_REMESH_LIMIT');
 const topology=buildMeshSelectionTopology(mesh,{signal}),before=inspect(topology,signal),transform=placement(node.transform);if(o.geometryDigest!==topology.geometryDigest)fail('Die Netzgeometrie wurde geändert. Neuvernetzen und Flächenauswahl erneut öffnen.','MESH_REMESH_STALE');
 const regions=node.metadata?.meshProtection?.regions??[],protectedIds=new Set();for(const r of regions){if(r.geometryDigest!==topology.geometryDigest||!Array.isArray(r.triangleIds)||r.triangleIds.some(v=>!Number.isSafeInteger(v)||v<0||v>=topology.triangles))fail('Ein Schutzbereich gehört nicht mehr zur aktuellen Geometrie. Schutzflächen erneut festlegen.');r.triangleIds.forEach(v=>protectedIds.add(v));}
 if(o.triangleIds.some(v=>v>=topology.triangles))fail('Die Flächenauswahl ist veraltet.');
 const chosen=new Set(o.triangleIds),positions=[],local=[],faces=[],at=[],pinned=[],edges=new Map(),faceKeys=new Map();let scopeBeforeTriangles=0;
 for(let i=0;i<topology.vertices;i++){tick(i,signal);if(topology.representatives[i]===i){local[i]=mesh.verts.slice(i*3,i*3+3);positions[i]=transform.world(local[i]);if(positions[i].some(v=>!Number.isFinite(v)))fail('Die Objektlage überschreitet den auswertbaren Zahlenbereich.');at[i]=new Set();pinned[i]=false;}}
 for(let i=0;i<topology.triangles;i++){const eligible=o.scope==='all'||chosen.has(i);if(eligible)scopeBeforeTriangles++;faces.push({ids:mesh.triangles.slice(i*3,i*3+3).map(v=>topology.representatives[v]),patch:-1,alive:true,editable:eligible&&!protectedIds.has(i),ancestor:i,original:i});}
 const beforeFaces=structuredClone(faces),beforePoints=structuredClone(positions),beforeBounds=bounds(positions),extent=norm(sub(beforeBounds.max,beforeBounds.min)),numericalAllowance=Math.max(1,...beforeBounds.min.map(Math.abs),...beforeBounds.max.map(Math.abs),extent)*Number.EPSILON*512;
 const normals=faces.map(f=>{const p=f.ids.map(v=>positions[v]),n=cross(sub(p[1],p[0]),sub(p[2],p[0])),l=norm(n);if(!l||!Number.isFinite(l))fail('Eine Fläche ist in dieser Objektlage nicht eindeutig auswertbar.');return n.map(v=>v/l);}),patches=[];
 const planarTolerance=Math.min(1e-8,o.maxDeviation/4);
 for(let i=0;i<faces.length;i++)if(faces[i].patch<0){const p={normal:normals[i],origin:positions[faces[i].ids[0]],deviation:0,changed:false},id=patches.length;patches.push(p);faces[i].patch=id;const queue=[i];for(let head=0;head<queue.length;head++){tick(head,signal);const f=queue[head];for(const v of faces[f].ids)p.deviation=Math.max(p.deviation,Math.abs(dot(sub(positions[v],p.origin),p.normal)));for(let k=0;k<3;k++){const next=topology.neighbors[f*3+k];if(next<0||faces[next].patch>=0||dot(p.normal,normals[next])<1-1e-12)continue;const d=Math.max(...faces[next].ids.map(v=>Math.abs(dot(sub(positions[v],p.origin),p.normal))));if(d>planarTolerance)continue;faces[next].patch=id;queue.push(next);}}}
 for(const f of faces)if(!f.editable)f.ids.forEach(v=>pinned[v]=true);
 const fixedEdges=[];for(const e of topology.edges.values())if(e.incidents.length!==2||faces[e.incidents[0].face].patch!==faces[e.incidents[1].face].patch){e.vertices.forEach(v=>pinned[v]=true);fixedEdges.push([...e.vertices]);}
 // Track every original boundary segment through subdivision. This proves its
 // geometric domain without requiring unchanged segment numbering/counts.
 const boundaryLineage=new Map();for(const e of topology.edges.values())if(e.incidents.length===1)boundaryLineage.set(ekey(...e.vertices),e.vertices.map(v=>positions[v]));
 function remove(id){const f=faces[id];f.ids.forEach(v=>at[v].delete(id));faceKeys.delete(fkey(f.ids));for(let k=0;k<3;k++){const key=ekey(f.ids[k],f.ids[(k+1)%3]),e=edges.get(key);e.faces.delete(id);if(!e.faces.size)edges.delete(key);}f.alive=false;}
 function add(f,id=faces.length){f.alive=true;faces[id]=f;f.ids.forEach(v=>at[v].add(id));faceKeys.set(fkey(f.ids),id);for(let k=0;k<3;k++){const a=f.ids[k],b=f.ids[(k+1)%3],key=ekey(a,b);let e=edges.get(key);if(!e){e={a:Math.min(a,b),b:Math.max(a,b),faces:new Set()};edges.set(key,e);}e.faces.add(id);}return id;}
 for(let i=0;i<faces.length;i++)add(faces[i],i);
 const qualityBefore=quality(faces,positions);let splitEdges=0,flippedEdges=0,relaxedVertices=0,alive=faces.length,attempts=0,budgetHit=false,passes=0,coordinatesMoved=false;
 const budget=Math.min(5000000,Math.max(20000,topology.triangles*100));
 function work(){if(++attempts>budget){budgetHit=true;return false;}tick(attempts,signal);return true;}
 function positive(ids,patch){const p=ids.map(v=>positions[v]),a=sub(p[1],p[0]),b=sub(p[2],p[0]),area=dot(cross(a,b),patches[patch].normal),scale=Math.max(dot(a,a),dot(b,b));return area>Math.max(Number.MIN_VALUE,scale*Number.EPSILON*128);}
 function split(e){
  const incident=[...e.faces].map(id=>[id,faces[id]]);if(!incident.length||incident.length>2||incident.some(([,f])=>!f.editable)||o.mode==='remesh'&&(incident.length!==2||incident[0][1].patch!==incident[1][1].patch))return false;
  if(alive+incident.length>MESH_REMESH_OUTPUT_LIMIT){budgetHit=true;return false;}
  const v=positions.length,p=mean([local[e.a],local[e.b]]),world=transform.world(p);if(world.some(x=>!Number.isFinite(x))||world.every((x,k)=>x===positions[e.a][k])||world.every((x,k)=>x===positions[e.b][k]))return false;
  local[v]=p;positions[v]=world;at[v]=new Set();pinned[v]=o.mode==='subdivide';const replacements=[];
  for(const [id,f]of incident){const side=f.ids.findIndex((x,k)=>ekey(x,f.ids[(k+1)%3])===ekey(e.a,e.b)),a=f.ids[side],b=f.ids[(side+1)%3],c=f.ids[(side+2)%3],pairs=[[a,v,c],[v,b,c]];if(pairs.some(ids=>!positive(ids,f.patch))){local.pop();positions.pop();at.pop();pinned.pop();return false;}replacements.push([id,f,pairs]);}
  const line=boundaryLineage.get(ekey(e.a,e.b));if(line){boundaryLineage.delete(ekey(e.a,e.b));boundaryLineage.set(ekey(e.a,v),line);boundaryLineage.set(ekey(v,e.b),line);}
  for(const [id,f,pairs]of replacements){remove(id);add({...f,ids:pairs[0],original:-1},id);add({...f,ids:pairs[1],original:-1});patches[f.patch].changed=true;}alive+=incident.length;splitEdges++;return true;
 }
 function flip(e){
  if(e.faces.size!==2)return false;const [a,b]=[...e.faces],f=faces[a],g=faces[b];if(!f.editable||!g.editable||f.patch!==g.patch)return false;
  const side=f.ids.findIndex((x,k)=>ekey(x,f.ids[(k+1)%3])===ekey(e.a,e.b)),u=f.ids[side],v=f.ids[(side+1)%3],x=f.ids[(side+2)%3],y=g.ids.find(z=>z!==u&&z!==v);if(x===y||edges.has(ekey(x,y)))return false;
  const n=[[x,y,v],[y,x,u]];if(n.some(ids=>!positive(ids,f.patch)))return false;
  const old=[triangleQuality(f.ids,positions).quality,triangleQuality(g.ids,positions).quality],next=n.map(ids=>triangleQuality(ids,positions).quality);if(Math.min(...next)<=Math.min(...old)+1e-8||next[0]+next[1]<old[0]+old[1]+1e-8)return false;
  remove(a);remove(b);add({...f,ids:n[0],original:-1},a);add({...g,ids:n[1],original:-1},b);patches[f.patch].changed=true;flippedEdges++;return true;
 }
 function relax(v){
  if(pinned[v]||!at[v]?.size||at[v].size>128)return false;const incident=[...at[v]].map(id=>[id,faces[id]]),patch=incident[0][1].patch;if(incident.some(([,f])=>!f.editable||f.patch!==patch))return false;
  const neighbor=new Set(incident.flatMap(([,f])=>f.ids.filter(x=>x!==v)));if(neighbor.size!==incident.length)return false;const center=mean([...neighbor].map(id=>positions[id])),old=positions[v],oldLocal=local[v],p=old.map((x,k)=>x+(center[k]-x)*.45),plane=patches[patch],distance=dot(sub(p,plane.origin),plane.normal),candidate=p.map((x,k)=>x-distance*plane.normal[k]);
  if(norm(sub(candidate,old))<=numericalAllowance)return false;
  const oldQuality=incident.map(([,f])=>triangleQuality(f.ids,positions).quality);local[v]=transform.local(candidate);positions[v]=transform.world(local[v]);
  const nextQuality=incident.map(([,f])=>triangleQuality(f.ids,positions).quality),ok=local[v].every(Number.isFinite)&&positions[v].every(Number.isFinite)&&incident.every(([,f])=>positive(f.ids,patch))&&Math.min(...nextQuality)>=Math.min(...oldQuality)-1e-10&&nextQuality.reduce((n,x)=>n+x,0)>oldQuality.reduce((n,x)=>n+x,0)+1e-8;
  if(!ok){positions[v]=old;local[v]=oldLocal;return false;}for(const [,f]of incident)f.original=-1;plane.changed=true;relaxedVertices++;if(beforePoints[v])coordinatesMoved=true;return true;
 }
 for(passes=0;passes<o.iterations&&!budgetHit;passes++){let changes=0;const candidates=[...edges.values()].filter(e=>norm(sub(positions[e.a],positions[e.b]))>o.targetEdgeLength*4/3).sort((a,b)=>norm(sub(positions[b.a],positions[b.b]))-norm(sub(positions[a.a],positions[a.b]))||a.a-b.a||a.b-b.b);
  for(const old of candidates){if(!work())break;const e=edges.get(ekey(old.a,old.b));if(e&&split(e))changes++;if(budgetHit)break;}
  if(o.mode==='remesh'&&!budgetHit){for(const old of [...edges.values()]){if(!work())break;const e=edges.get(ekey(old.a,old.b));if(e&&flip(e))changes++;}for(let v=0;v<positions.length&&!budgetHit;v++){if(!work())break;if(positions[v]&&relax(v))changes++;}}
  if(!changes)break;
 }
 if(!splitEdges&&!flippedEdges&&!relaxedVertices)fail('Keine sicher verbesserbare Vernetzung gefunden. Schutzflächen, Auswahlränder und im Neuverteilungsmodus Kurvenfacetten sowie Formkanten bleiben erhalten. Eine andere Kantenlänge oder Unterteilen wählen.','MESH_REMESH_NO_CHANGE');
 const used=new Set();for(const f of faces)if(f.alive)f.ids.forEach(v=>used.add(v));const vertices=[...used].sort((a,b)=>a-b),vertexMap=new Map(vertices.map((v,i)=>[v,i])),verts=vertices.flatMap(v=>local[v]),triangles=[],faceMap=new Map(),retainedOriginalFaceIds=[];
 for(let i=0;i<faces.length;i++){tick(i,signal);const f=faces[i];if(f.alive){if(f.original>=0)faceMap.set(f.original,triangles.length/3);retainedOriginalFaceIds.push(f.original);triangles.push(...f.ids.map(v=>vertexMap.get(v)));}}
 const originalFaceIds=faces.filter(f=>f.alive).map(f=>f.ancestor);
 const result={verts,triangles},afterTopology=buildMeshSelectionTopology(result,{signal}),after=inspect(afterTopology,signal);
 if(after.componentCount!==before.componentCount)fail('Die Neuvernetzung würde die Anzahl der Bestandteile verändern.');
 const finalBoundary=[...edges.values()].filter(e=>e.faces.size===1);if(finalBoundary.length!==boundaryLineage.size||finalBoundary.some(e=>!boundaryLineage.has(ekey(e.a,e.b))))fail('Ein ursprünglicher Öffnungsrand würde verändert.');
 // Boundary children must stay on their immutable original line segment.
 for(const e of finalBoundary){const [a,b]=boundaryLineage.get(ekey(e.a,e.b)),d=sub(b,a),length2=dot(d,d);for(const v of [e.a,e.b]){const p=sub(positions[v],a),t=dot(p,d)/length2,q=p.map((x,k)=>x-t*d[k]);if(t< -1e-12||t>1+1e-12||norm(q)>numericalAllowance)fail('Ein Öffnungsrand würde geometrisch verschoben.');}}
 if(o.mode==='remesh')for(const [a,b]of fixedEdges)if(!edges.has(ekey(a,b)))fail('Eine ursprüngliche Formkante würde verändert.');
 const survivingFaces=faces.filter(f=>f.alive);
 for(let i=0;i<beforeFaces.length;i++)if(!beforeFaces[i].editable){const mapped=faceMap.get(i);if(mapped===undefined)fail('Eine Schutzfläche oder nicht gewählte Fläche würde verändert.');const f=survivingFaces[mapped];if(JSON.stringify(f.ids.map(v=>local[v]))!==JSON.stringify(beforeFaces[i].ids.map(v=>mesh.verts.slice(v*3,v*3+3))))fail('Eine Schutzfläche oder nicht gewählte Fläche würde verschoben.');}
 let planeDeviation=0;for(const f of faces)if(f.alive&&patches[f.patch].changed){const p=patches[f.patch];for(const v of f.ids)planeDeviation=Math.max(planeDeviation,p.deviation+Math.abs(dot(sub(positions[v],p.origin),p.normal)));}
 // Positive planar triangulations retain the same patch boundary/domain. Their
 // bidirectional distance is bounded by the two distances from the fixed plane.
 // Subdivision has zero ideal geometric deviation; finite arithmetic is exposed
 // separately and conservatively included when comparing sampled distances.
 const maximumSurfaceDeviationBound=o.mode==='subdivide'?0:planeDeviation;
 if(maximumSurfaceDeviationBound>o.maxDeviation+numericalAllowance)fail('Die geprüfte Abweichungsgrenze würde überschritten.');
 const afterBounds=bounds(vertices.map(v=>positions[v])),boundsDifference=Math.max(...beforeBounds.min.map((x,k)=>Math.abs(x-afterBounds.min[k])),...beforeBounds.max.map((x,k)=>Math.abs(x-afterBounds.max[k])));if(boundsDifference>o.maxDeviation+numericalAllowance)fail('Die Außenmaße überschreiten die gewählte Abweichungsgrenze.');
 const sampledSurfaceDeviation=sampledDeviation(beforeFaces,beforePoints,faces,positions,signal);if(sampledSurfaceDeviation.maximum>maximumSurfaceDeviationBound+numericalAllowance)fail('Die unabhängigen Oberflächenstichproben widersprechen der analytischen Formgrenze.');
 const protection=regions.length?{format:'FormnaroMeshProtection',version:1,regions:regions.map(r=>({...structuredClone(r),geometryDigest:afterTopology.geometryDigest,triangleIds:r.triangleIds.map(id=>{const mapped=faceMap.get(id);if(mapped===undefined)fail('Eine Schutzfläche würde entfernt.');return mapped;}).sort((a,b)=>a-b)}))}:null;
 const qualityAfter=quality(faces,positions),longEdges=[...edges.values()].filter(e=>norm(sub(positions[e.a],positions[e.b]))>o.targetEdgeLength*4/3).length;
 abort(signal);return {mesh:result,protection,retainedOriginalFaceIds,originalFaceIds,report:{method:o.method,mode:o.mode,beforeTriangles:topology.triangles,afterTriangles:alive,scopeBeforeTriangles,scopeAfterTriangles:scopeBeforeTriangles+alive-topology.triangles,qualityBefore,qualityAfter,targetEdgeLength:o.targetEdgeLength,coordinatesMoved,insertedVertices:splitEdges,splitEdges,flippedEdges,relaxedVertices,protectedTriangles:protectedIds.size,protectedRegions:regions.map(r=>({id:r.id,name:r.name,purpose:r.purpose,triangles:r.triangleIds.length})),protectedGeometryExact:true,unselectedGeometryExact:true,maximumSurfaceDeviationBound,numericalAllowance,sampledSurfaceDeviation,boundsDifference,boundsBefore:beforeBounds,boundsAfter:afterBounds,componentCount:after.componentCount,boundaryEdges:afterTopology.diagnostics.boundaryCount,curveAndFeatureEdges:fixedEdges.length,patches:patches.length,passes,attempts,budgetHit,limitedBySafety:!!longEdges,longEdgesRemaining:longEdges,curvedSurfaceApproximation:false,coarsening:false}};
}
