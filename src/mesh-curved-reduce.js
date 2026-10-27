import {compareModelSurfaces} from './model-deviation.js';
import {buildMeshSelectionTopology} from './mesh-selection-data.js';
import {inspectMeshTopology} from './mesh-inspector.js';
import {validateMeshReduceOptions,MESH_REDUCE_LIMIT} from './mesh-reduce.js';
import {cadPoint} from './cad-affine.js';
const fail=(message,code='MESH_REDUCE')=>{throw Object.assign(Error(message),{code});},abort=signal=>{if(signal?.aborted)throw Object.assign(Error('Vereinfachung abgebrochen.'),{name:'AbortError'});};
const bad=['duplicate','degenerate','orientation','nonmanifoldEdge','nonmanifoldVertex'];
const check=topology=>{const r=inspectMeshTopology(topology,{smallTriangleLimit:0});if(bad.some(k=>r.categories[k].count))fail('Beschädigte oder mehrdeutige Topologie zuerst reparieren.');return r;};
const boundary=topology=>[...topology.edges.values()].filter(e=>e.incidents.length===1).map(e=>e.vertices.map(id=>topology.mesh.verts.slice(id*3,id*3+3).join(',')).sort().join('|')).sort();
const normal=(v,a,b,c)=>{const u=[0,1,2].map(k=>v[b*3+k]-v[a*3+k]),w=[0,1,2].map(k=>v[c*3+k]-v[a*3+k]),n=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]],l=Math.hypot(...n);return n.map(x=>x/l);};
export async function reduceCurvedMesh(node,options,{signal,optimizerFraction=.5,attempt=0}={}){
 if(options?.method!=='curved-v1')fail('Gekrümmte Netzvereinfachung ausdrücklich wählen.');
 const o=validateMeshReduceOptions(options),mesh=node.mesh;abort(signal);
 if(mesh.triangles.length/3>MESH_REDUCE_LIMIT)fail('Gekrümmte Vereinfachung unterstützt höchstens 150.000 Dreiecke.','MESH_REDUCE_LIMIT');
 const topology=buildMeshSelectionTopology(mesh,{signal});if(o.geometryDigest!==topology.geometryDigest)fail('Die Netzgeometrie wurde geändert. Werkzeug und Auswahl erneut öffnen.','MESH_REDUCE_STALE');
 const before=check(topology),count=topology.triangles,regions=node.metadata?.meshProtection?.regions??[],protectedFaces=new Set(),chosen=new Set(o.triangleIds);
 for(const r of regions){if(r.geometryDigest!==topology.geometryDigest||r.triangleIds.some(id=>id>=count))fail('Veralteten Schutzbereich neu festlegen.');for(const id of r.triangleIds)protectedFaces.add(id);}
 if(o.triangleIds.some(id=>id>=count))fail('Die Flächenauswahl ist veraltet.');
 const scope=Array.from({length:count},(_,id)=>o.scope==='all'||chosen.has(id)),scopeCount=scope.filter(Boolean).length,scopeTarget=o.targetMode==='count'?o.target:Math.ceil(scopeCount*o.target/100);
 if(scopeTarget>=scopeCount)fail('Eine kleinere Zielzahl wählen.','MESH_REDUCE_NO_CHANGE');
 const verts=mesh.verts,welded=mesh.triangles.map(id=>topology.representatives[id]),world=new Float64Array(verts.length),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(let i=0;i<verts.length;i+=3){if(!(i%3072))abort(signal);const p=cadPoint(node.transform,verts.slice(i,i+3));if(p.some(v=>!Number.isFinite(v)))fail('Die Objektlage ist nicht auswertbar.');world.set(p,i);for(let k=0;k<3;k++){min[k]=Math.min(min[k],p[k]);max[k]=Math.max(max[k],p[k]);}}
 const center=min.map((v,k)=>(v+max[k])/2),positions=new Float32Array(world.length);let coordinateError=0;for(let i=0;i<world.length;i++){const value=world[i]-center[i%3];positions[i]=value;coordinateError=Math.max(coordinateError,Math.abs(value-positions[i]));}
 if(coordinateError*4>o.maxDeviation)fail('Das Abweichungsbudget ist für die numerische Auflösung dieser Modellgröße zu klein.');
 const lock=new Uint8Array(verts.length/3),selected=[],outside=[],faceMap=new Map();let fixedInScope=0;
 for(let f=0;f<count;f++){if(!(f%1024))abort(signal);const ids=welded.slice(f*3,f*3+3);if(!scope[f]||protectedFaces.has(f)){faceMap.set(f,outside.length/3);outside.push(...ids);ids.forEach(id=>lock[id]=1);if(scope[f])fixedInScope++;}else selected.push(...ids);}
 const normals=Array.from({length:count},(_,i)=>normal(world,...welded.slice(i*3,i*3+3))),cos=Math.cos(35*Math.PI/180);let featureEdges=0;
 for(const e of topology.edges.values()){const incident=e.incidents;if(incident.length!==2||normals[incident[0].face].reduce((s,v,k)=>s+v*normals[incident[1].face][k],0)<cos){e.vertices.forEach(id=>lock[id]=1);featureEdges++;}}
 if(!selected.length)fail('Alle gewählten Dreiecke sind geschützt.','MESH_REDUCE_NO_CHANGE');
 const [{MeshoptSimplifier},{inspectImportTopology}]=await Promise.all([import('three/addons/libs/meshopt_simplifier.module.js'),import('./mesh-import-core.js')]);await MeshoptSimplifier.ready;abort(signal);
 const target=Math.max(1,scopeTarget-fixedInScope)*3,errorBudget=Math.max(0,(o.maxDeviation-coordinateError*4)*optimizerFraction),[candidate,error]=MeshoptSimplifier.simplifyWithAttributes(Uint32Array.from(selected),positions,3,new Float32Array(0),0,[],lock,target,errorBudget,['LockBorder','ErrorAbsolute']);abort(signal);
 if(!Number.isFinite(error)||error>Math.fround(errorBudget))fail('Das geschätzte Abweichungsbudget wurde überschritten.');
 if(candidate.length>=selected.length)fail('Innerhalb von Schutz- und Abweichungsgrenzen keine Reduktion möglich.','MESH_REDUCE_NO_CHANGE');
 const indices=[...outside,...candidate],used=[...new Set(indices)].sort((a,b)=>a-b),map=new Map(used.map((v,i)=>[v,i])),result={verts:used.flatMap(id=>verts.slice(id*3,id*3+3)),triangles:indices.map(id=>map.get(id))},afterTopology=buildMeshSelectionTopology(result,{signal}),after=check(afterTopology),sourceMetrics=inspectImportTopology({verts,triangles:welded}),resultMetrics=inspectImportTopology(result);
 if(before.componentCount!==after.componentCount||sourceMetrics.euler!==resultMetrics.euler||JSON.stringify(boundary(topology))!==JSON.stringify(boundary(afterTopology)))fail('Bestandteile, Topologie oder Öffnungsränder würden verändert.');
 const closed=topology.diagnostics.boundaryCount===0,volumeChange=closed?Math.abs(resultMetrics.volume-sourceMetrics.volume)/Math.abs(sourceMetrics.volume):null;
 if(closed&&(!Number.isFinite(volumeChange)||volumeChange>.01))fail('Die Volumenänderung überschreitet 1 %. Kleineres Abweichungsbudget wählen.');
 // Outside and protected faces were copied verbatim before optimization; verify their ordered coordinates independently of optimizer flags.
 for(const [old,id]of faceMap)for(let j=0;j<3;j++)for(let k=0;k<3;k++)if(verts[mesh.triangles[old*3+j]*3+k]!==result.verts[result.triangles[id*3+j]*3+k])fail('Eine geschützte oder nicht ausgewählte Fläche wurde verändert.');
 const protection=regions.length?{format:'FormnaroMeshProtection',version:1,regions:regions.map(r=>({...structuredClone(r),geometryDigest:afterTopology.geometryDigest,triangleIds:r.triangleIds.map(id=>faceMap.get(id)).sort((a,b)=>a-b)}))}:null,afterCount=indices.length/3,scopeAfter=scopeCount-count+afterCount;
 const deviation=compareModelSurfaces({left:{vertices:Array.from(world),triangles:welded},right:{vertices:used.flatMap(id=>Array.from(world.slice(id*3,id*3+3))),triangles:result.triangles},maxSamples:6000});if(deviation.sampledMaximum>o.maxDeviation+1e-9){if(attempt<3)return reduceCurvedMesh(node,options,{signal,optimizerFraction:optimizerFraction/2,attempt:attempt+1});fail('Die zusätzlich gemessenen Oberflächenabstände ('+deviation.sampledMaximum.toFixed(6)+' mm) überschreiten das Budget ('+o.maxDeviation+' mm). Kleineres Budget wählen.');};const sampledDeviation={...deviation,directions:deviation.directions.map(({values,...stats})=>stats)};
 abort(signal);return {mesh:result,protection,retainedOriginalFaceIds:[...faceMap.keys()],report:{method:o.method,optimizerFraction,adaptiveAttempts:attempt+1,beforeTriangles:count,afterTriangles:afterCount,removedTriangles:count-afterCount,reductionPercent:(count-afterCount)/count*100,scopeBeforeTriangles:scopeCount,scopeAfterTriangles:scopeAfter,requestedScopeTriangles:scopeTarget,targetReached:scopeAfter<=scopeTarget,limitedBySafety:scopeAfter>scopeTarget,coordinatesMoved:false,protectedTriangles:protectedFaces.size,protectedGeometryExact:true,unselectedGeometryExact:true,pinnedVertices:lock.reduce((n,v)=>n+v,0),featureEdges,componentCount:after.componentCount,boundaryEdges:afterTopology.diagnostics.boundaryCount,errorEstimateMm:error+coordinateError*4,requestedErrorMm:o.maxDeviation,errorIsGlobalDistanceProof:false,sampledDeviation,coordinateErrorMm:coordinateError,boundsBefore:{min,max},boundsDifference:null,volumePercentChange:volumeChange===null?null:volumeChange*100,topologyChecked:true}};
}
