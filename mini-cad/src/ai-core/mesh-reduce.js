import {buildMeshSelectionTopology,meshSelectionGeometryDigest} from './mesh-selection-data.js';
import {inspectMeshTopology} from './mesh-inspector.js';

export const MESH_REDUCE_LIMIT=150000;
const fail=(message,code='MESH_REDUCE')=>{throw Object.assign(Error(message),{code});};
const abort=signal=>{if(signal?.aborted)throw Object.assign(Error('Vereinfachung abgebrochen.'),{name:'AbortError'});};
const tick=(i,signal)=>{if(!(i%1024))abort(signal);};
export function validateMeshReduceOptions(o){
 if(!o||Object.getPrototypeOf(o)!==Object.prototype||Object.keys(o).some(k=>!['method','geometryDigest','scope','triangleIds','targetMode','target','maxDeviation'].includes(k))||o.method!=='planar-v1'||!(/^[a-f0-9]{64}$/).test(o.geometryDigest??'')||!['all','selection'].includes(o.scope)||!['percent','count'].includes(o.targetMode)||!Number.isFinite(o.target)||!Number.isFinite(o.maxDeviation)||o.maxDeviation<0||o.maxDeviation>1||!Array.isArray(o.triangleIds)||o.triangleIds.length>MESH_REDUCE_LIMIT||new Set(o.triangleIds).size!==o.triangleIds.length||o.triangleIds.some(i=>!Number.isSafeInteger(i)||i<0||i>=MESH_REDUCE_LIMIT)||o.scope==='all'&&o.triangleIds.length||o.scope==='selection'&&!o.triangleIds.length)fail('Ungültige Optionen oder veraltete Flächenauswahl für die Vereinfachung.');
 if(o.targetMode==='percent'&&(o.target<1||o.target>=100)||o.targetMode==='count'&&(!Number.isSafeInteger(o.target)||o.target<1||o.target>MESH_REDUCE_LIMIT))fail('Ziel: 1 bis unter 100 % verbleibende Dreiecke oder eine positive ganze Dreieckszahl.');
 return {...o,triangleIds:[...o.triangleIds].sort((a,b)=>a-b)};
}
const sub=(a,b)=>a.map((v,k)=>v-b[k]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const length=a=>Math.hypot(...a);
const edgeKey=(a,b)=>a<b?a+':'+b:b+':'+a;
const faceKey=ids=>[...ids].sort((a,b)=>a-b).join(':');
const badCategories=['duplicate','degenerate','orientation','nonmanifoldEdge','nonmanifoldVertex'];
function inspection(topology,signal){const result=inspectMeshTopology(topology,{smallTriangleLimit:0,signal});if(badCategories.some(k=>result.categories[k].count))fail('Das Netz enthält mehrdeutige, doppelte, entartete oder falsch verbundene Flächen. Vor dem Vereinfachen gezielt reparieren.');return result;}
function point(mesh,id,m){const i=id*3;return [0,1,2].map(k=>m[k]*mesh.verts[i]+m[k+4]*mesh.verts[i+1]+m[k+8]*mesh.verts[i+2]+m[k+12]);}
function worldBounds(points){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const p of points)if(p)for(let k=0;k<3;k++){min[k]=Math.min(min[k],p[k]);max[k]=Math.max(max[k],p[k]);}return {min,max};}
function boundaryCoordinates(topology){const keys=[];for(const edge of topology.edges.values())if(edge.incidents.length===1)keys.push(edge.vertices.map(id=>topology.mesh.verts.slice(id*3,id*3+3).join(',')).sort().join('|'));return keys.sort();}

/** Remove only interior vertices of a fixed coplanar patch, collapsing onto an
 * existing neighbor. Fixed patch boundaries include every curve facet and bore
 * outline. A link test and positive projected faces preserve the patch domain.
 * Source coordinates are never moved. Protected/unselected triangles stay exact.
 */
export function reducePlanarMesh(node,options,{signal}={}){
 const o=validateMeshReduceOptions(options),mesh=node.mesh;abort(signal);
 if(mesh.triangles.length/3>MESH_REDUCE_LIMIT)fail('Vereinfachen unterstützt bis zu 150.000 Dreiecke je Netz. Ein kleineres Netz auswählen.','MESH_REDUCE_LIMIT');
 const topology=buildMeshSelectionTopology(mesh,{signal});if(o.geometryDigest!==topology.geometryDigest)fail('Die Netzgeometrie wurde geändert. Vereinfachung und Flächenauswahl erneut öffnen.','MESH_REDUCE_STALE');
 const before=inspection(topology,signal),regions=node.metadata?.meshProtection?.regions??[];
 for(const r of regions)if(r.geometryDigest!==topology.geometryDigest||r.triangleIds.some(id=>id>=topology.triangles))fail('Ein Schutzbereich gehört nicht mehr zur aktuellen Geometrie. Schutzflächen vor der Vereinfachung erneut festlegen.');
 const chosen=new Set(o.triangleIds);if(o.triangleIds.some(i=>i>=topology.triangles))fail('Die Flächenauswahl ist veraltet.');
 const protectedFaces=new Set(regions.flatMap(r=>r.triangleIds)),count=topology.triangles;
 const eligible=Array.from({length:count},(_,i)=>o.scope==='all'||chosen.has(i));
 const scopeCount=eligible.reduce((n,b)=>n+Number(b),0),scopeTarget=o.targetMode==='count'?o.target:Math.ceil(scopeCount*o.target/100);
 if(scopeTarget>=scopeCount)fail('Das Ziel enthält bereits mindestens so viele Dreiecke wie der gewählte Bereich. Eine kleinere Zielzahl wählen.','MESH_REDUCE_NO_CHANGE');
 const target=count-scopeCount+scopeTarget,positions=new Array(topology.vertices),faces=new Array(count),at=Array.from({length:topology.vertices},()=>new Set()),normals=new Array(count);
 for(let i=0;i<topology.vertices;i++){tick(i,signal);if(topology.representatives[i]===i){positions[i]=point(mesh,i,node.transform);if(positions[i].some(v=>!Number.isFinite(v)))fail('Die Objektlage überschreitet den auswertbaren Zahlenbereich.');}}
 for(let i=0;i<count;i++){tick(i,signal);const ids=mesh.triangles.slice(i*3,i*3+3).map(v=>topology.representatives[v]),n=cross(sub(positions[ids[1]],positions[ids[0]]),sub(positions[ids[2]],positions[ids[0]])),len=length(n);if(!len||!Number.isFinite(len))fail('Eine Fläche ist in dieser Objektlage nicht eindeutig auswertbar.');normals[i]=n.map(v=>v/len);faces[i]={ids,alive:true,patch:-1};ids.forEach(v=>at[v].add(i));}
 const planarTolerance=Math.min(1e-8,o.maxDeviation/2),patches=[];
 // Every member is compared with the fixed seed plane. Pairwise chaining could
 // otherwise slowly merge an entire curved bore into a false planar patch.
 for(let i=0;i<count;i++)if(faces[i].patch<0){const id=patches.length,p={normal:normals[i],origin:positions[faces[i].ids[0]],deviation:0,changed:false,axisExact:false};p.deviation=Math.max(...faces[i].ids.map(v=>Math.abs(dot(sub(positions[v],p.origin),p.normal))));p.axisExact=p.normal.filter(v=>v!==0).length===1&&Math.max(...p.normal.map(Math.abs))===1;patches.push(p);faces[i].patch=id;const queue=[i];
  for(let head=0;head<queue.length;head++){tick(head,signal);const face=queue[head];for(let k=0;k<3;k++){const next=topology.neighbors[face*3+k];if(p.deviation>planarTolerance||next<0||faces[next].patch>=0||dot(p.normal,normals[next])<1-1e-12)continue;let deviation=0;for(const v of faces[next].ids)deviation=Math.max(deviation,Math.abs(dot(sub(positions[v],p.origin),p.normal)));if(deviation>planarTolerance)continue;p.deviation=Math.max(p.deviation,deviation);faces[next].patch=id;queue.push(next);}}
 }
 const pinned=new Uint8Array(topology.vertices),geometricEdges=[];
 for(let i=0;i<count;i++)if(protectedFaces.has(i)||!eligible[i])faces[i].ids.forEach(v=>pinned[v]=1);
 for(const edge of topology.edges.values())if(edge.incidents.length!==2||faces[edge.incidents[0].face].patch!==faces[edge.incidents[1].face].patch){edge.vertices.forEach(v=>pinned[v]=1);geometricEdges.push([...edge.vertices]);}
 const originalPinned=pinned.reduce((n,b)=>n+b,0),initialBounds=worldBounds(positions),keys=new Map();for(let i=0;i<count;i++)keys.set(faceKey(faces[i].ids),i);
 const neighbors=v=>{const ids=new Set();for(const f of at[v])for(const id of faces[f].ids)if(id!==v)ids.add(id);return ids;};
 let remaining=count,removedVertices=0,passes=0,attempts=0,budgetHit=false;
 function collapse(from,to){
  if(pinned[from]||!at[from].size||at[from].size>256||at[to].size>256)return false;
  const incident=[...at[from]],shared=incident.filter(f=>faces[f].ids.includes(to));if(shared.length!==2)return false;
  const patch=faces[incident[0]].patch;if(incident.some(f=>faces[f].patch!==patch||!eligible[f]||protectedFaces.has(f)))return false;
  const a=neighbors(from),b=neighbors(to),common=[...a].filter(v=>b.has(v)),opposite=new Set(shared.flatMap(f=>faces[f].ids.filter(v=>v!==from&&v!==to)));
  if(common.length!==2||opposite.size!==2||common.some(v=>!opposite.has(v)))return false;
  const replacements=[],newKeys=new Set(),removed=new Set(incident);
  for(const f of incident){if(shared.includes(f))continue;const ids=faces[f].ids.map(v=>v===from?to:v),u=sub(positions[ids[1]],positions[ids[0]]),v=sub(positions[ids[2]],positions[ids[0]]),area=dot(cross(u,v),patches[patch].normal),scale=Math.max(dot(u,u),dot(v,v));
   if(area<=Math.max(Number.MIN_VALUE,scale*Number.EPSILON*128))return false;
   const key=faceKey(ids),old=keys.get(key);if(newKeys.has(key)||old!==undefined&&!removed.has(old))return false;newKeys.add(key);replacements.push([f,ids]);
  }
  for(const f of incident){keys.delete(faceKey(faces[f].ids));faces[f].ids.forEach(v=>at[v].delete(f));}
  for(const f of shared)faces[f].alive=false;
  for(const [f,ids]of replacements){faces[f].ids=ids;ids.forEach(v=>at[v].add(f));keys.set(faceKey(ids),f);}
  patches[patch].changed=true;remaining-=2;removedVertices++;return true;
 }
 for(passes=0;passes<16&&remaining-2>=target;passes++){let changed=0;
  for(let v=0;v<positions.length&&remaining-2>=target;v++){tick(v,signal);if(pinned[v]||!at[v].size||at[v].size>256)continue;
   const choices=[...neighbors(v)].sort((a,b)=>{const d1=sub(positions[a],positions[v]),d2=sub(positions[b],positions[v]);return dot(d1,d1)-dot(d2,d2)||a-b;});
   for(const to of choices){if(++attempts>count*80){budgetHit=true;break;}if(collapse(v,to)){changed++;break;}}if(budgetHit)break;
  }
  if(!changed||budgetHit)break;
 }
 if(!removedVertices)fail('Keine sicher entfernbaren Dreiecke gefunden. Kurvenfacetten, Bohrungskonturen, Kanten, Schutzflächen und nicht ausgewählte Bereiche bleiben erhalten.','MESH_REDUCE_NO_CHANGE');
 const used=new Set();for(const f of faces)if(f.alive)f.ids.forEach(v=>used.add(v));const oldVertices=[...used].sort((a,b)=>a-b),vertexMap=new Map(oldVertices.map((v,i)=>[v,i])),verts=oldVertices.flatMap(v=>mesh.verts.slice(v*3,v*3+3)),triangles=[],faceMap=new Map();
 for(let i=0;i<faces.length;i++){tick(i,signal);if(faces[i].alive){faceMap.set(i,triangles.length/3);triangles.push(...faces[i].ids.map(v=>vertexMap.get(v)));}}
 const result={verts,triangles},afterTopology=buildMeshSelectionTopology(result,{signal}),after=inspection(afterTopology,signal);
 if(before.componentCount!==after.componentCount||JSON.stringify(boundaryCoordinates(topology))!==JSON.stringify(boundaryCoordinates(afterTopology)))fail('Die Vereinfachung würde Bestandteile oder Öffnungsränder verändern. Das Original bleibt erhalten.');
 const resultEdges=new Set([...afterTopology.edges.values()].map(e=>edgeKey(...e.vertices)));
 for(const edge of geometricEdges)if(!resultEdges.has(edgeKey(...edge.map(v=>vertexMap.get(v)))))fail('Eine ursprüngliche Formkante konnte nicht erhalten werden.');
 const outputDigest=afterTopology.geometryDigest,protection=regions.length?{format:'FormnaroMeshProtection',version:1,regions:regions.map(r=>({...structuredClone(r),geometryDigest:outputDigest,triangleIds:r.triangleIds.map(id=>{const mapped=faceMap.get(id);if(mapped===undefined)fail('Eine Schutzfläche würde entfernt.');return mapped;}).sort((a,b)=>a-b)}))}:null;
 const extent=Math.hypot(...initialBounds.max.map((v,k)=>v-initialBounds.min[k])),numericalAllowance=extent*Number.EPSILON*256;const deviationBound=2*patches.filter(p=>p.changed).reduce((n,p)=>Math.max(n,p.axisExact&&p.deviation===0?0:p.deviation*(1+1e-12)+numericalAllowance),0);if(deviationBound>o.maxDeviation)fail('Die geprüfte Abweichungsgrenze würde überschritten.');
 const outputBounds=worldBounds(oldVertices.map(v=>positions[v])),boundsDifference=Math.max(...initialBounds.min.map((v,k)=>Math.abs(v-outputBounds.min[k])),...initialBounds.max.map((v,k)=>Math.abs(v-outputBounds.max[k])));
 if(boundsDifference>o.maxDeviation)fail('Die Außenmaße überschreiten die gewählte Abweichungsgrenze.');
 // Exact face lineage is exposed only in this transient worker result, never
 // as an authority flag in the saved project or the protection transaction.
 abort(signal);return {mesh:result,protection,report:{method:o.method,beforeTriangles:count,afterTriangles:remaining,removedTriangles:count-remaining,reductionPercent:(count-remaining)/count*100,scopeBeforeTriangles:scopeCount,scopeAfterTriangles:scopeCount-count+remaining,requestedScopeTriangles:scopeTarget,targetReached:scopeCount-count+remaining<=scopeTarget,coordinatesMoved:false,protectedTriangles:protectedFaces.size,protectedRegions:regions.map(r=>({id:r.id,name:r.name,purpose:r.purpose,triangles:r.triangleIds.length})),protectedGeometryExact:true,unselectedGeometryExact:true,curveAndFeatureEdges:geometricEdges.length,pinnedVertices:originalPinned,removedVertices,patches:patches.length,maximumSurfaceDeviationBound:deviationBound,boundsDifference,boundsBefore:initialBounds,boundsAfter:outputBounds,componentCount:after.componentCount,boundaryEdges:afterTopology.diagnostics.boundaryCount,passes,attempts,limitedBySafety:scopeCount-count+remaining>scopeTarget,budgetHit},retainedOriginalFaceIds:[...faceMap.keys()]};
}

/** Independent protection contract, used after worker results are validated.
 * Every region keeps the same meaning and exact ordered triangle coordinates;
 * only IDs bound to the new geometry digest may change. No trusted worker flag.
 */
export function exactReductionProtectionRemap(before,after){
 const a=before?.metadata?.meshProtection,b=after?.metadata?.meshProtection;if(!a?.regions.length||!b||before.id!==after.id||after.kind!=='mesh'||a.format!==b.format||a.version!==b.version||a.regions.length!==b.regions.length)return false;
 const beforeDigest=meshSelectionGeometryDigest(before),afterDigest=meshSelectionGeometryDigest(after),mapped=new Map(),used=new Map();
 const face=(n,id)=>n.mesh.triangles.slice(id*3,id*3+3).map(v=>n.mesh.verts.slice(v*3,v*3+3));
 for(let i=0;i<a.regions.length;i++){const r=a.regions[i],s=b.regions[i];if(r.id!==s.id||r.name!==s.name||r.purpose!==s.purpose||r.geometryDigest!==beforeDigest||s.geometryDigest!==afterDigest||r.triangleIds.length!==s.triangleIds.length)return false;
  // Surviving faces retain original order. This gives an unambiguous mapping
  // without matching rounded coordinates or trusting an unverified face map.
  for(let j=0;j<r.triangleIds.length;j++){const old=r.triangleIds[j],next=s.triangleIds[j];if(next>=after.mesh.triangles.length/3||mapped.has(old)&&mapped.get(old)!==next||used.has(next)&&used.get(next)!==old||JSON.stringify(face(before,old))!==JSON.stringify(face(after,next)))return false;mapped.set(old,next);used.set(next,old);}
 }
 return true;
}
