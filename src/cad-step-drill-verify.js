import {cadGeometryDigest} from './cad-geometry-digest.js';
import {hasGeometryRefs} from './cad-geometry-ref.js';
export const hasStepDrill=n=>n?.drill?.version===3||(n?.children??[]).some(hasStepDrill);
export const needsStepDrillExportProof=(project,ids)=>project.nodes.some(n=>(!ids||ids.includes(n.id))&&hasStepDrill(n));
// Before exporting a STEP-backed drill, independently reconstruct the complete
// selected CAD tree and compare every derived BRep with the saved result.
// File-provided BReps and hashes are not themselves construction proofs.
export async function verifyStepDrillExports(service,project,{ids}={}){
 const selected=project.nodes.filter(n=>n.kind==='cad'&&(!ids||ids.includes(n.id))),roots=selected.filter(hasStepDrill);if(!roots.length)return {checked:[]};
 const touched=[],geometry=[];function walk(n){if(n.kind!=='cad')return;touched.push(n.id);geometry.push(n.id);for(const child of n.children??[])walk(child);}for(const root of roots){if(hasGeometryRefs(root))throw Object.assign(Error('STEP-Bohrung vor dem Export vollständig laden.'),{code:'GEOMETRY_NOT_LOADED'});walk(root);}
 const rebuilt=await service.rebuildSubset(project,{baseline:project,rootIds:roots.map(n=>n.id),touchedIds:touched,geometryIds:geometry});
 function compare(a,b){if(a.kind==='cad'&&a.children?.length&&cadGeometryDigest(a.brep.data)!==cadGeometryDigest(b.brep.data))throw Object.assign(Error('Gespeicherte STEP-Bohrgeometrie weicht vom nativen Neuaufbau ab. Erst aktualisieren.'),{code:'CAD_DRILL_REBUILD_REQUIRED'});for(let i=0;i<(a.children?.length??0);i++)compare(a.children[i],b.children[i]);}
 for(const root of roots){const next=rebuilt.nodes.find(n=>n.id===root.id);if(!next)throw Object.assign(Error('STEP-Bohrquelle fehlt.'),{code:'CAD_DRILL_REBUILD_REQUIRED'});compare(root,next);}return {checked:roots.map(n=>n.id)};
}
