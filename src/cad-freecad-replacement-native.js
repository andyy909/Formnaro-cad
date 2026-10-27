import {cadProjectSnapshot} from './cad-project.js';
import {cadSelectionContext} from './cad-interface-state.js';
import {freeCADSourceDigest,validateFreeCADSource} from './cad-freecad-source.js';
import {planCadAIFeatureDependencies} from './cad-ai-feature-dependencies.js';
import {assertCadAISpatialInputsCurrent} from './cad-ai-feature-structure-native.js';
import {updateCadAssociative} from './cad-linked-contours-native.js';
import {cadJointProblems} from './cad-joints-data.js';
import {preserveColors} from './cad-freecad-node-native.js';
import {assertFreeCADReplacementProgram} from './cad-freecad-rerun.js';

const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v,same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const fail=(m,code='FREECAD_REPLACEMENT_INVALID')=>{throw Object.assign(Error(m),{code});},omit=(v,fields)=>Object.fromEntries(Object.entries(v??{}).filter(([k])=>!fields.includes(k)));
/** Geometry and dependency rebuild after an actual desktop FreeCAD job.
 * No externally supplied list can broaden the affected model family. */
export async function replaceFreeCADDocumentNative(input,operation,{oc,service,editRecipe,signal,freecadRun}={}){
 if(Object.keys(operation).some(k=>!['kind','target','expectedSourceDigest','source','bytes','nativeReport'].includes(k)))fail('Unbekannte Felder der FreeCAD-Übernahme.');
 const before=cadProjectSnapshot(input),context=cadSelectionContext(before,operation.target),original=context.node;
 if(original.kind!=='cad'||original.source!=='step'||context.locked||context.hidden||context.sourceGeometryReadonly)fail('Die gewählte FreeCAD-Quelle ist nicht editierbar.','FREECAD_SOURCE_LOCKED');
 const old=validateFreeCADSource(original.metadata?.freecadSource),source=validateFreeCADSource(operation.source);
 if(freeCADSourceDigest(old.documentBase64)!==operation.expectedSourceDigest)fail('Die FreeCAD-Quellrevision wurde geändert.','STALE_REVISION');
 assertFreeCADReplacementProgram(old,source);
 assertCadAISpatialInputsCurrent(before,operation.target.rootId);
 const plan=planCadAIFeatureDependencies(before,[],{targets:[operation.target]}),unresolved=[],imported=service.stepNode(operation.bytes),style=preserveColors(oc,original,imported,source),chain=new Set(context.chain.map(n=>n.id));
 const replacement={...structuredClone(original),brep:imported.brep,stats:imported.stats,metadata:{...original.metadata,freecadSource:style.source}};delete replacement.geometryIdentity;
 if(style.colors!==undefined){if(style.colors.length)replacement.metadata.stepFaceColors=style.colors;else delete replacement.metadata.stepFaceColors;}
 if(style.pending.length)unresolved.push({kind:'face-color',message:style.pending.length+' Flächenfarben behalten ihre Originalzuordnung als offenen Bezug. Veränderte Flächen ausdrücklich neu zuordnen.'});
 if(source.mode!=='native'&&old.version===2&&old.mode==='native')unresolved.push({kind:'native-reset',message:'Der Programm-Neulauf ersetzt alle nativen Dokumentänderungen seit dem letzten Skript-/Planlauf. Die ursprüngliche Konstruktion wird mit den gewählten Parametern neu aufgebaut.'});
 const result=await updateCadAssociative(before,{kind:'associativeUpdate',updateIds:plan.contourIds,drawingSheetIds:[...new Set(plan.drawingViews.map(v=>v.sheetId))]},{oc,service,editRecipe,signal,freecadRun,boundSubset:{seedTargets:[operation.target],targets:plan.targets,bindings:[],parameterBindingIds:plan.parameterBindingIds,drawingViews:plan.drawingViews,
  beforeNode:node=>{if(node.id===original.id)return structuredClone(replacement);if(chain.has(node.id)&&node.metadata?.freecadSource?.documentBase64===old.documentBase64)return {...node,metadata:{...node.metadata,freecadSource:style.source}};return node;},
  onRefreshError:(error,link)=>{if(error.code!=='CONTOUR_REBIND_REQUIRED')return false;unresolved.push({kind:'contour',linkId:link.id,message:'Konturbezug '+link.id+' ausdrücklich neu zuordnen: '+error.message});return true;}
 }});
 const followups=result.report.freecad??[],rebuiltPrograms=new Set(followups.map(r=>r.target.path.at(-1)??r.target.rootId));for(const message of result.report.freecadWarnings??[])unresolved.push({kind:'freecad-followup',message});
 const after=cadProjectSnapshot(result.project),allowed=new Set();for(const target of plan.targets)for(const n of cadSelectionContext(before,target).chain)allowed.add(n.id);
 function authored(a){return a?.map(v=>omit(v,['status','reason','normal','faceSignature']));}
 function visit(a,b){if(!b||a.id!==b.id)fail('Quellenbaum geändert.');if(!allowed.has(a.id)){if(!same(a,b))fail('Unbeteiligte Quelle verändert.');return;}
  if(!same(omit(a,['brep','stats','children','recipe','transform','geometryIdentity','metadata','annotations','constructionBudget']),omit(b,['brep','stats','children','recipe','transform','geometryIdentity','metadata','annotations','constructionBudget']))||!same(authored(a.annotations),authored(b.annotations))||!same((a.children??[]).map(n=>n.id),(b.children??[]).map(n=>n.id)))fail('Geschützte Quelleneigenschaften geändert.');
  const meta=n=>omit(n.metadata,chain.has(n.id)?['freecadSource',...(n.id===original.id?['stepFaceColors']:[])]:rebuiltPrograms.has(n.id)?['freecadSource','stepFaceColors']:[]);if(!same(meta(a),meta(b)))fail('Unbeteiligte Metadaten geändert.');
  for(const [i,child]of(a.children??[]).entries())visit(child,b.children[i]);
 }
 if(!same(before.nodes.map(n=>n.id),after.nodes.map(n=>n.id)))fail('Teile hinzugefügt oder entfernt.');before.nodes.forEach((n,i)=>visit(n,after.nodes[i]));
 if(!same(omit(before,['nodes','version','projectParameters','contourLinks','drawings','workplane']),omit(after,['nodes','version','projectParameters','contourLinks','drawings','workplane'])))fail('Unbeteiligte Projekteigenschaften geändert.');
 if(!same(omit(before.projectParameters,['applied']),omit(after.projectParameters,['applied'])))fail('Projektparameterdefinitionen oder Varianten geändert.');
 const affectedRoots=new Set(plan.targets.map(t=>t.rootId));if(!affectedRoots.has(before.workplane.reference?.objectId)&&!same(before.workplane,after.workplane))fail('Unbeteiligte Arbeitsebene geändert.');
 for(const sheet of before.drawings?.sheets??[]){const next=after.drawings.sheets.find(s=>s.id===sheet.id);for(const view of sheet.views)if(!plan.drawingViews.some(v=>v.sheetId===sheet.id&&v.viewId===view.id)&&!same(view,next.views.find(v=>v.id===view.id)))fail('Unbeteiligte Zeichnungsansicht geändert.');}
 for(const link of before.contourLinks?.links??[]){const next=after.contourLinks.links.find(l=>l.id===link.id);if(!same(plan.contourIds.includes(link.id)?omit(link,['snapshot']):link,plan.contourIds.includes(link.id)?omit(next,['snapshot']):next))fail('Unbeteiligte Konturdefinition geändert.');}
 if(before.workplane.reference&& !after.workplane.reference)unresolved.push({kind:'workplane',message:'Die bisherige Arbeitsebenenfläche wurde geändert. Fläche ausdrücklich neu wählen.'});
 const priorJoints=cadJointProblems(before);for(const p of cadJointProblems(after))if(!priorJoints.some(old=>same(old,p)))unresolved.push({kind:'joint',message:p.message});
 function annotations(n){for(const a of n.annotations??[])if(a.status!=='current'&&a.status!=='valid')unresolved.push({kind:'annotation',message:'Flächenmarkierung an '+n.name+' ausdrücklich neu zuordnen.'});n.children?.forEach(annotations);}for(const root of after.nodes)if(plan.targets.some(t=>t.rootId===root.id))annotations(root);
 for(const view of plan.drawingViews){const sheet=after.drawings.sheets.find(s=>s.id===view.sheetId);for(const a of sheet.annotations)if(a.viewId===view.viewId&&a.unresolved)unresolved.push({kind:'drawing',message:'Zeichnungsmaß '+a.id+' ausdrücklich neu zuordnen.'});}
 const review={...plan.review,unresolved,requiresAcceptance:!!(plan.review.requiresAcceptance||unresolved.length||source.changes.some(c=>c.derived))};
 return {...result,project:after,report:{...result.report,freecad:operation.nativeReport,freecadFollowups:followups,freecadDependencies:review,unrelatedSourcesExact:true},warnings:[...new Set(unresolved.map(p=>p.message))],changes:[{op:'freecadDocument',target:operation.target}],selectedTargets:[operation.target]};
}
