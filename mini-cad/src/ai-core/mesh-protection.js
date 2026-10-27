import {meshSelectionGeometryDigest} from './mesh-selection-data.js';
import {exactReductionProtectionRemap} from './mesh-reduce.js';

const fail=message=>{throw Object.assign(Error(message),{code:'MESH_PROTECTION'});};
export function validateMeshProtection(value){
 if(!value||Object.keys(value).some(k=>!['format','version','regions'].includes(k))||value.format!=='FormnaroMeshProtection'||value.version!==1||!Array.isArray(value.regions)||value.regions.length>32)fail('Ungültige Netz-Schutzbereiche.');
 const ids=new Set();let count=0;
 const regions=value.regions.map(r=>{
  if(!r||Object.keys(r).some(k=>!['id','name','purpose','geometryDigest','triangleIds'].includes(k))||typeof r.id!=='string'||!r.id||r.id.length>200||ids.has(r.id)||typeof r.name!=='string'||!r.name.trim()||r.name.length>100||!['bore','contact','custom'].includes(r.purpose)||typeof r.geometryDigest!=='string'||!(/^[a-f0-9]{64}$/).test(r.geometryDigest)||!Array.isArray(r.triangleIds)||!r.triangleIds.length||r.triangleIds.length>500000)fail('Ungültiger Netz-Schutzbereich.');
  ids.add(r.id);const faces=new Set();for(const id of r.triangleIds){if(!Number.isSafeInteger(id)||id<0||id>=500000||faces.has(id))fail('Ungültige Schutz-Dreiecksnummer.');faces.add(id);}count+=faces.size;if(count>1000000)fail('Die Schutzbereiche enthalten zusammen zu viele Dreiecke.');
  return {id:r.id,name:r.name.trim(),purpose:r.purpose,geometryDigest:r.geometryDigest,triangleIds:[...faces].sort((a,b)=>a-b)};
 });return {format:'FormnaroMeshProtection',version:1,regions};
}
export const meshProtectionRegions=node=>node?.metadata?.meshProtection?.regions??[];
export function meshProtectionStatus(node,digest=meshSelectionGeometryDigest(node)){
 return meshProtectionRegions(node).map(r=>({...r,valid:r.geometryDigest===digest&&r.triangleIds.every(id=>id<node.mesh.triangles.length/3)}));
}
// Other global geometry tools still refuse local masks. Explicit planar
// reduction/remeshing/smoothing/patch replacement may remap independently verified identical face coordinates.
// Explicit project replacement (Open/New) and model Undo restore whole states.
export function assertMeshProtectionChange(before,after,{replaceProject=false,protectionDraft,reduceTarget=null}={}){
 const preserved=(old,next)=>(typeof reduceTarget==='string'?old?.id===reduceTarget:Array.isArray(reduceTarget)&&reduceTarget.includes(old?.id))&&exactReductionProtectionRemap(old,next);
 if(protectionDraft)for(const node of protectionDraft.nodes){
  if(node.kind!=='mesh')continue;const next=after.nodes.find(n=>n.id===node.id),expected=node.metadata?.meshProtection,actual=next?.metadata?.meshProtection;
  if(JSON.stringify(expected)!==JSON.stringify(actual)&&!preserved(before.nodes.find(n=>n.id===node.id),next))fail('Die Berechnung würde Schutzbereiche unbemerkt ändern. Schutzbereiche nur ausdrücklich in der Flächenauswahl bearbeiten.');
 }
 if(replaceProject)return;
 for(const old of before.nodes){
  if(old.kind!=='mesh'||!meshProtectionRegions(old).length)continue;
  const next=after.nodes.find(n=>n.id===old.id);
  if((!next||next.kind!=='mesh'||JSON.stringify(next.mesh)!==JSON.stringify(old.mesh))&&!preserved(old,next))fail(`„${old.name}“ enthält Schutzbereiche. Dieses Werkzeug kann sie noch nicht erhalten. Schutzbereiche im Werkzeug „Netzflächen auswählen“ ausdrücklich entfernen, bevor die Geometrie geändert oder das Teil gelöscht wird.`);
 }
 for(const node of after.nodes){
  const regions=meshProtectionRegions(node);if(!regions.length)continue;
  const old=before.nodes.find(n=>n.id===node.id);
  if(JSON.stringify(old?.metadata?.meshProtection)===JSON.stringify(node.metadata.meshProtection)&&JSON.stringify(old?.mesh)===JSON.stringify(node.mesh))continue;
  if(meshProtectionStatus(node).some(r=>!r.valid))fail('Neue Schutzbereiche müssen zur aktuellen Netzgeometrie gehören. Flächen erneut auswählen.');
 }
}
