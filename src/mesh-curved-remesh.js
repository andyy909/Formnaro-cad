import {buildMeshSelectionTopology} from './mesh-selection-data.js';
import {inspectMeshTopology} from './mesh-inspector.js';
import {auditMeshIntersections} from './mesh-smooth.js';
import {placement,bounds,triangleQuality,quality,distance2,surfaceIndex,sampledDeviation} from './mesh-remesh-geometry.js';

export const CURVED_REMESH_LIMIT=30000;
const fail=(message,code='MESH_REMESH')=>{throw Object.assign(Error(message),{code});};
const abort=signal=>{if(signal?.aborted)throw Object.assign(Error('Neuvernetzen abgebrochen.'),{name:'AbortError'});};
const sub=(a,b)=>a.map((v,k)=>v-b[k]),dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],length=a=>Math.hypot(...a);
const mean=ps=>[0,1,2].map(k=>ps.reduce((s,p)=>s+p[k],0)/ps.length);
const edgeKey=(a,b)=>a<b?a+':'+b:b+':'+a;
const faceKey=ids=>[...ids].sort((a,b)=>a-b).join(':');
const normal=(f,ps)=>cross(sub(ps[f[1]],ps[f[0]]),sub(ps[f[2]],ps[f[0]]));
const geometricKey=p=>p.map(v=>v.join(',')).sort().join('|');
function inspect(t,signal){const r=inspectMeshTopology(t,{smallTriangleLimit:0,signal});if(['duplicate','degenerate','orientation','nonmanifoldEdge','nonmanifoldVertex'].some(k=>r.categories[k].count))fail('Das Netz zuerst gezielt reparieren: doppelte, entartete oder nicht mannigfaltige Flächen.');return r;}

function project(p,triangle){
 const [a,b,c]=triangle,n=normal([0,1,2],triangle),n2=dot(n,n),q=p.map((v,k)=>v-n[k]*dot(sub(p,a),n)/n2);
 if([[a,b],[b,c],[c,a]].every(([x,y])=>dot(cross(sub(y,x),sub(q,x)),n)>=0))return q;
 let best=null,d=Infinity;for(const [x,y]of [[a,b],[b,c],[c,a]]){const e=sub(y,x),t=Math.max(0,Math.min(1,dot(sub(p,x),e)/dot(e,e))),v=x.map((v,k)=>v+t*e[k]),dist=length(sub(v,p));if(dist<d){best=v;d=dist;}}return best;
}

/** A covering bound, not a sample maximum. Distance to one fixed convex
 * triangle is convex: its maximum over a source subtriangle is bounded by
 * the largest of its three vertex distances. Longest-edge bisection covers
 * the complete source triangle. Both directions must pass independently. */
export function certifySurfaceDeviation(beforeFaces,beforePoints,afterFaces,afterPoints,tolerance,{signal,numeric=0}={}){
 const a=surfaceIndex(beforeFaces,beforePoints,signal,20000000),b=surfaceIndex(afterFaces,afterPoints,signal,20000000);let cells=0,maximum=0;
 function direction(faces,points,target,targetFaces,targetPoints){
  const exact=new Set(targetFaces.filter(f=>f.alive).map(f=>geometricKey(f.ids.map(v=>targetPoints[v]))));let bound=0;
  function cover(p,depth){
   if((++cells&255)===0)abort(signal);if(cells>400000)fail('Die flächendeckende Formprüfung überschreitet das Arbeitsbudget.','MESH_REMESH_LIMIT');
   const hit=target.closest(mean(p)),upper=Math.max(...p.map(v=>Math.sqrt(distance2(v,...hit.triangle))));
   if(upper<=tolerance+numeric){maximum=Math.max(maximum,upper);return upper;}
   if(hit.distance>tolerance+numeric||depth>=10)fail('Die gewählte Formabweichung ist nicht flächendeckend nachweisbar. Weniger Durchgänge oder eine größere Formgrenze wählen.','MESH_REMESH_DEVIATION');
   const lengths=p.map((v,k)=>length(sub(v,p[(k+1)%3]))),i=lengths.indexOf(Math.max(...lengths)),j=(i+1)%3,k=(i+2)%3,m=mean([p[i],p[j]]);
   return Math.max(cover([p[i],m,p[k]],depth+1),cover([m,p[j],p[k]],depth+1));
  }
  for(const f of faces)if(f.alive){abort(signal);const p=f.ids.map(v=>points[v]);if(!exact.has(geometricKey(p)))bound=Math.max(bound,cover(p,0));}return bound;
 }
 const forwardBound=direction(beforeFaces,beforePoints,b,afterFaces,afterPoints),reverseBound=direction(afterFaces,afterPoints,a,beforeFaces,beforePoints);
 return {method:'bidirectional-convex-triangle-cover',forwardBound,reverseBound,maximum:Math.max(forwardBound,reverseBound),cells,approximate:false,numericalAllowance:numeric};
}

export function remeshCurvedMesh(node,o,{signal}={}){
 abort(signal);if(node?.mesh?.triangles?.length/3>CURVED_REMESH_LIMIT)fail('Gekrümmte Neuvernetzung unterstützt bis zu 30.000 Dreiecke je Netz.','MESH_REMESH_LIMIT');
 const mesh=node.mesh,t=buildMeshSelectionTopology(mesh,{signal}),before=inspect(t,signal),transform=placement(node.transform);
 if(o.geometryDigest!==t.geometryDigest)fail('Die Netzgeometrie wurde geändert. Die Flächenauswahl erneut öffnen.','MESH_REMESH_STALE');
 if(o.triangleIds.some(v=>v>=t.triangles))fail('Die Flächenauswahl ist veraltet.');
 const protectedIds=new Set(),regions=node.metadata?.meshProtection?.regions??[];
 for(const r of regions){if(r.geometryDigest!==t.geometryDigest||!Array.isArray(r.triangleIds)||r.triangleIds.some(v=>!Number.isSafeInteger(v)||v<0||v>=t.triangles))fail('Ein Schutzbereich ist veraltet. Schutzflächen erneut festlegen.');r.triangleIds.forEach(v=>protectedIds.add(v));}
 const local=[],points=[],at=[],faces=[],edges=new Map(),keys=new Map(),chosen=new Set(o.triangleIds),pinned=new Set(),fixedEdges=[];
 for(let v=0;v<t.vertices;v++)if(t.representatives[v]===v){local[v]=mesh.verts.slice(v*3,v*3+3);points[v]=transform.world(local[v]);at[v]=new Set();if(points[v].some(x=>!Number.isFinite(x)))fail('Die Objektlage ist nicht auswertbar.');}
 for(let f=0;f<t.triangles;f++)faces.push({ids:mesh.triangles.slice(f*3,f*3+3).map(v=>t.representatives[v]),alive:true,editable:(o.scope==='all'||chosen.has(f))&&!protectedIds.has(f),original:f,ancestor:f});
 const beforeFaces=structuredClone(faces),beforePoints=structuredClone(points),beforeBounds=bounds(points),extent=length(sub(beforeBounds.max,beforeBounds.min)),numeric=Math.max(1,extent,...beforeBounds.min.map(Math.abs),...beforeBounds.max.map(Math.abs))*Number.EPSILON*512;
 const normals=faces.map(f=>normal(f.ids,points)),cosine=Math.cos(o.featureAngle*Math.PI/180);
 for(const f of faces)if(!f.editable)f.ids.forEach(v=>pinned.add(v));
 for(const e of t.edges.values())if(e.incidents.length!==2||(()=>{const [a,b]=e.incidents.map(i=>normals[i.face]);return dot(a,b)<length(a)*length(b)*cosine;})()){fixedEdges.push([...e.vertices]);e.vertices.forEach(v=>pinned.add(v));}
 const originalIndex=surfaceIndex(beforeFaces,beforePoints,signal,20000000),qualityBefore=quality(faces,points),inputSafety=auditMeshIntersections(faces.map(f=>f.ids),points,{signal});
 function add(f,id=faces.length){faces[id]=f;f.alive=true;keys.set(faceKey(f.ids),id);for(const v of f.ids)at[v].add(id);for(let k=0;k<3;k++){const a=f.ids[k],b=f.ids[(k+1)%3],key=edgeKey(a,b);if(!edges.has(key))edges.set(key,{a:Math.min(a,b),b:Math.max(a,b),faces:new Set()});edges.get(key).faces.add(id);}}
 function remove(id){const f=faces[id];keys.delete(faceKey(f.ids));for(const v of f.ids)at[v].delete(id);for(let k=0;k<3;k++){const key=edgeKey(f.ids[k],f.ids[(k+1)%3]),e=edges.get(key);e.faces.delete(id);if(!e.faces.size)edges.delete(key);}f.alive=false;}
 for(let f=0;f<faces.length;f++)add(faces[f],f);
 const neighbors=v=>new Set([...at[v]].flatMap(f=>faces[f].ids.filter(w=>w!==v)));
 let splitEdges=0,collapsedEdges=0,flippedEdges=0,relaxedVertices=0,alive=faces.length,attempts=0,budgetHit=false,passes=0;
 const eligible=e=>e.faces.size===2&&[...e.faces].every(f=>faces[f].editable)&&!fixedEdgesSet.has(edgeKey(e.a,e.b));
 const fixedEdgesSet=new Set(fixedEdges.map(e=>edgeKey(...e)));
 function valid(ids,oldNormal){const n=normal(ids,points),p=ids.map(v=>points[v]),scale=Math.max(...p.map((v,k)=>dot(sub(v,p[(k+1)%3]),sub(v,p[(k+1)%3]))));return length(n)>scale*Number.EPSILON*128&&dot(n,oldNormal)>length(n)*length(oldNormal)*.1;}
 function projected(p){return project(p,originalIndex.closest(p).triangle);}
 function split(e){
  if(!eligible(e))return false;if(alive+2>CURVED_REMESH_LIMIT){budgetHit=true;return false;}
  const v=points.length;local[v]=mean([local[e.a],local[e.b]]);points[v]=transform.world(local[v]);at[v]=new Set();
  const replacements=[...e.faces].map(id=>{const f=faces[id],k=f.ids.findIndex((a,k)=>edgeKey(a,f.ids[(k+1)%3])===edgeKey(e.a,e.b)),a=f.ids[k],b=f.ids[(k+1)%3],c=f.ids[(k+2)%3];return {id,f,children:[[a,v,c],[v,b,c]]};});
  if(replacements.some(r=>r.children.some(ids=>!valid(ids,normal(r.f.ids,points))))){local.pop();points.pop();at.pop();return false;}
  for(const {id,f,children}of replacements){remove(id);add({...f,ids:children[0],original:-1},id);add({...f,ids:children[1],original:-1});}alive+=2;splitEdges++;return true;
 }
 function collapse(e){
  if(!eligible(e)||pinned.has(e.a)||pinned.has(e.b))return false;
  const an=neighbors(e.a),bn=neighbors(e.b),common=[...an].filter(v=>bn.has(v)),opposite=new Set([...e.faces].flatMap(f=>faces[f].ids.filter(v=>v!==e.a&&v!==e.b)));
  if(common.length!==2||opposite.size!==2||common.some(v=>!opposite.has(v)))return false;
  const incident=[...new Set([...at[e.a],...at[e.b]])],old=points[e.a],oldLocal=local[e.a],oldNormals=new Map(incident.map(id=>[id,normal(faces[id].ids,points)])),p=projected(mean([points[e.a],points[e.b]]));
  local[e.a]=transform.local(p);points[e.a]=transform.world(local[e.a]);const replacements=[],newKeys=new Set();let ok=true;
  for(const id of incident){const f=faces[id];if(e.faces.has(id))continue;const ids=f.ids.map(v=>v===e.b?e.a:v),key=faceKey(ids),existing=keys.get(key);if(!f.editable||!valid(ids,oldNormals.get(id))||newKeys.has(key)||existing!==undefined&&!incident.includes(existing)){ok=false;break;}newKeys.add(key);replacements.push({id,f,ids});}
  if(!ok){points[e.a]=old;local[e.a]=oldLocal;return false;}
  for(const id of incident)remove(id);for(const {id,f,ids}of replacements)add({...f,ids,original:-1},id);points[e.b]=null;local[e.b]=null;alive-=2;collapsedEdges++;return true;
 }
 function flip(e){
  if(!eligible(e))return false;const [a,b]=[...e.faces],f=faces[a],g=faces[b],k=f.ids.findIndex((v,k)=>edgeKey(v,f.ids[(k+1)%3])===edgeKey(e.a,e.b)),u=f.ids[k],v=f.ids[(k+1)%3],x=f.ids[(k+2)%3],y=g.ids.find(z=>z!==u&&z!==v);
  if(x===y||edges.has(edgeKey(x,y)))return false;const n=[[x,y,v],[y,x,u]],old=[triangleQuality(f.ids,points).quality,triangleQuality(g.ids,points).quality],next=n.map(ids=>triangleQuality(ids,points).quality);
  if(n.some(ids=>!valid(ids,normal(f.ids,points))||!valid(ids,normal(g.ids,points)))||Math.min(...next)<=Math.min(...old)+1e-7||next[0]+next[1]<=old[0]+old[1]+1e-7)return false;
  remove(a);remove(b);add({...f,ids:n[0],original:-1},a);add({...g,ids:n[1],original:-1},b);flippedEdges++;return true;
 }
 function relax(v){
  if(!points[v]||pinned.has(v)||!at[v].size||at[v].size>128)return false;const incident=[...at[v]],ns=incident.map(f=>normal(faces[f].ids,points)),qs=incident.map(f=>triangleQuality(faces[f].ids,points).quality),old=points[v],oldLocal=local[v],p=projected(mean([...neighbors(v)].map(v=>points[v])));
  if(length(sub(p,old))<=numeric)return false;local[v]=transform.local(p);points[v]=transform.world(local[v]);const next=incident.map(f=>triangleQuality(faces[f].ids,points).quality);
  if(incident.some((f,i)=>!valid(faces[f].ids,ns[i]))||Math.min(...next)<Math.min(...qs)-1e-10||next.reduce((a,b)=>a+b,0)<=qs.reduce((a,b)=>a+b,0)+1e-7){points[v]=old;local[v]=oldLocal;return false;}
  incident.forEach(f=>faces[f].original=-1);relaxedVertices++;return true;
 }
 function work(){abort(signal);if(++attempts>Math.min(1500000,Math.max(20000,t.triangles*100))){budgetHit=true;return false;}return true;}
 for(passes=0;passes<o.iterations&&!budgetHit;passes++){
  const start=splitEdges+collapsedEdges+flippedEdges+relaxedVertices;
  for(const old of [...edges.values()]){if(!work()||budgetHit)break;const e=edges.get(edgeKey(old.a,old.b));if(e&&length(sub(points[e.a],points[e.b]))>o.targetEdgeLength*4/3)split(e);}
  for(const old of [...edges.values()]){if(!work()||budgetHit)break;const e=edges.get(edgeKey(old.a,old.b));if(e&&length(sub(points[e.a],points[e.b]))<o.targetEdgeLength*4/5)collapse(e);}
  for(const old of [...edges.values()]){if(!work()||budgetHit)break;const e=edges.get(edgeKey(old.a,old.b));if(e)flip(e);}
  for(let v=0;v<points.length&&!budgetHit;v++){if(!work())break;relax(v);}
  if(start===splitEdges+collapsedEdges+flippedEdges+relaxedVertices)break;
 }
 if(!splitEdges&&!collapsedEdges&&!flippedEdges&&!relaxedVertices)fail('Keine sichere Änderung gefunden. Auswahl, Formkanten und Schutzbereiche begrenzen die Neuvernetzung.','MESH_REMESH_NO_CHANGE');
 const used=[...new Set(faces.filter(f=>f.alive).flatMap(f=>f.ids))].sort((a,b)=>a-b),map=new Map(used.map((v,i)=>[v,i])),surviving=faces.filter(f=>f.alive),result={verts:used.flatMap(v=>local[v]),triangles:surviving.flatMap(f=>f.ids.map(v=>map.get(v)))},afterTopology=buildMeshSelectionTopology(result,{signal}),after=inspect(afterTopology,signal);
 if(after.componentCount!==before.componentCount||afterTopology.diagnostics.boundaryCount!==t.diagnostics.boundaryCount||used.length-edges.size+alive!==new Set(beforeFaces.flatMap(f=>f.ids)).size-t.edges.size+t.triangles)fail('Die Neuvernetzung verletzt die Topologie des Ausgangsnetzes.');
 for(const [a,b]of fixedEdges)if(!edges.has(edgeKey(a,b))||JSON.stringify(local[a])!==JSON.stringify(mesh.verts.slice(a*3,a*3+3))||JSON.stringify(local[b])!==JSON.stringify(mesh.verts.slice(b*3,b*3+3)))fail('Eine Formkante oder ein Öffnungsrand würde verändert.');
 const faceMap=new Map();surviving.forEach((f,i)=>{if(f.original>=0)faceMap.set(f.original,i);});
 for(let i=0;i<beforeFaces.length;i++)if(!beforeFaces[i].editable){const f=surviving[faceMap.get(i)];if(!f||JSON.stringify(f.ids.map(v=>local[v]))!==JSON.stringify(beforeFaces[i].ids.map(v=>mesh.verts.slice(v*3,v*3+3))))fail('Eine Schutzfläche oder nicht gewählte Fläche würde verändert.');}
 const safety=auditMeshIntersections(surviving.map(f=>f.ids),points,{signal}),deviation=certifySurfaceDeviation(beforeFaces,beforePoints,faces,points,o.maxDeviation,{signal,numeric}),sampled=sampledDeviation(beforeFaces,beforePoints,faces,points,signal),afterBounds=bounds(used.map(v=>points[v])),boundsDifference=Math.max(...beforeBounds.min.map((v,k)=>Math.abs(v-afterBounds.min[k])),...beforeBounds.max.map((v,k)=>Math.abs(v-afterBounds.max[k])));
 if(boundsDifference>o.maxDeviation+numeric)fail('Die Außenmaße überschreiten die Formgrenze.','MESH_REMESH_DEVIATION');
 const protection=regions.length?{format:'FormnaroMeshProtection',version:1,regions:regions.map(r=>({...structuredClone(r),geometryDigest:afterTopology.geometryDigest,triangleIds:r.triangleIds.map(id=>faceMap.get(id)).sort((a,b)=>a-b)}))}:null;
 abort(signal);return {mesh:result,protection,originalFaceIds:surviving.map(f=>f.ancestor),retainedOriginalFaceIds:surviving.map(f=>f.original),report:{method:o.method,mode:o.mode,beforeTriangles:t.triangles,afterTriangles:alive,scopeBeforeTriangles:beforeFaces.filter(f=>f.editable).length,scopeAfterTriangles:surviving.filter(f=>f.editable).length,qualityBefore,qualityAfter:quality(faces,points),targetEdgeLength:o.targetEdgeLength,featureAngle:o.featureAngle,splitEdges,collapsedEdges,flippedEdges,relaxedVertices,coordinatesMoved:collapsedEdges+relaxedVertices>0,protectedTriangles:protectedIds.size,protectedGeometryExact:true,unselectedGeometryExact:true,maximumSurfaceDeviationBound:deviation.maximum,numericalAllowance:numeric,deviationCertificate:deviation,sampledSurfaceDeviation:sampled,boundsBefore:beforeBounds,boundsAfter:afterBounds,boundsDifference,componentCount:after.componentCount,boundaryEdges:afterTopology.diagnostics.boundaryCount,curveAndFeatureEdges:fixedEdges.length,passes,attempts,budgetHit,limitedBySafety:budgetHit||[...edges.values()].some(e=>length(sub(points[e.a],points[e.b]))>o.targetEdgeLength*4/3),curvedSurfaceApproximation:true,coarsening:collapsedEdges>0,safety:{input:inputSafety,output:safety}}};
}
