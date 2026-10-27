import {buildMeshSelectionTopology} from './repair-core/mesh-selection-data.js';
import {inspectMeshTopology} from './repair-core/mesh-inspector.js';
import {repairSimpleTopology} from './repair-core/mesh-simple-repair.js';
import {repairStlMesh} from './repair-core/mesh-stl-repair.js';
import {fromMesh} from './engine/geometry.js';

const defects=['boundary','duplicate','degenerate','orientation','nonmanifoldEdge','nonmanifoldVertex'];
export function inspectMiniMesh(mesh){
 const topology=buildMeshSelectionTopology(mesh),report=inspectMeshTopology(topology,{smallTriangleLimit:0});
 return {topology,report,counts:Object.fromEntries(defects.map(k=>[k,report.categories[k].count]))};
}
function prove(mesh){
 const {counts}=inspectMiniMesh(mesh);
 if(Object.values(counts).some(Boolean))throw Error('Das Netz enthält weiterhin offene oder mehrdeutige Verbindungen.');
 const m=fromMesh(mesh);
 try{if(m.isEmpty()||!Number.isFinite(m.volume())||m.volume()<=0)throw Error('Kein geschlossener Materialkörper mit positivem Volumen.');return m.volume();}finally{m.delete();}
}
/** Same bounded repair stages as Formnaro Easy. Never remove components,
 * move coordinates, invent a tolerance or use a voxel/hull reconstruction. */
export function autoRepairMiniMesh(mesh){
 const before=inspectMiniMesh(mesh);
 try{return {mesh,status:'healthy',report:{changed:false,volume:prove(mesh),before:before.counts,after:before.counts}};}catch{/* Check both candidates against the untouched input. */}
 const options={method:'simple-v1',geometryDigest:before.topology.geometryDigest,removeDegenerate:true,removeDuplicates:true,orient:true,smallTriangleLimit:0,removeComponents:[]};
 const errors=[];
 try{
  const fixed=repairSimpleTopology(before.topology,options),volume=prove(fixed.mesh);
  return {...fixed,status:'repaired',report:{...fixed.report,changed:true,volume,before:before.counts,after:inspectMiniMesh(fixed.mesh).counts}};
 }catch(e){errors.push(e.message);}
 try{
  // Per-shell outward guessing could turn an intended cavity into material.
  // The conservative fallback is therefore limited to a single source shell.
  if(before.report.componentCount!==1)throw Error('Mehrere beschädigte Hüllen benötigen eine gezielte Prüfung.');
  const fixed=repairStlMesh(mesh,{fillSmallHoles:true}),volume=prove(fixed.mesh);
  return {...fixed,status:'repaired',report:{...fixed.report,changed:true,volume,before:before.counts,after:inspectMiniMesh(fixed.mesh).counts}};
 }catch(e){errors.push(e.message);}
 throw Object.assign(Error('Automatische Reparatur konnte keinen geschlossenen Körper bestätigen. '+errors.at(-1)),{code:'MINI_REPAIR_UNRESOLVED'});
}
