import {remapFreeCADParameterRuns} from './cad-freecad-parameter-data.js';
import {cadProjectSnapshot} from './cad-project.js';
import {cadSelectionContext} from './cad-interface-state.js';
import {cadSourceGeometryDigest} from './cad-geometry-digest.js';
import {cadPoint,inverseCadMatrix,multiplyCadMatrices} from './cad-affine.js';
import {cadProjectParameterProblems,refreshCadProjectParameterCorrespondence,validateCadProjectParameters} from './cad-project-parameters-data.js';
import {cadContourLinkProblems,reparentCadContourLinks} from './cad-linked-contours-data.js';
import {cadJointProblems,validateCadJoints} from './cad-joints-data.js';
import {rebindCadWorkplaneNative} from './cad-topology-native.js';
import {updateCadAssociative} from './cad-linked-contours-native.js';

const key=t=>JSON.stringify([t.rootId,t.path]),canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const fail=(message,code='AI_FEATURE_STRUCTURE_INVALID')=>{throw Object.assign(Error('Merkmalszuordnung: '+message),{code});};
const omit=(v,keys)=>v&&Object.fromEntries(Object.entries(v).filter(([k])=>!keys.includes(k)));
const unit=p=>{const l=Math.hypot(...p);if(!l||!Number.isFinite(l))fail('Ungültiger Quellenrahmen.');return p.map(v=>v/l);};
const affineField=f=>/^(?:size|pos)\.[012]$/.test(f);
const authoredAnnotations=(values,{cloned=false}={})=>values?.map(a=>omit(a,['status','reason','faceSignature','normal',...(cloned?['id']:[])]));

export function assertCadAISpatialInputsCurrent(project,rootId){
 const bindings=new Set(project.projectParameters?.bindings.filter(b=>b.target.rootId===rootId).map(b=>b.id)??[]);
 if(cadProjectParameterProblems(project).some(p=>bindings.has(p.bindingId)||p.target?.rootId===rootId))fail('Parameter der gewählten Konstruktion sind bereits veraltet oder verloren. Zuerst aktualisieren oder ausdrücklich neu zuordnen.','AI_FEATURE_DEPENDENCY_STALE');
 const links=new Set(project.contourLinks?.links.filter(l=>l.source.rootId===rootId||l.target.rootId===rootId).map(l=>l.id)??[]);
 if(cadContourLinkProblems(project).some(p=>links.has(p.linkId)))fail('Ein Konturbezug der gewählten Konstruktion ist bereits veraltet. Zuerst aktualisieren oder neu zuordnen.','AI_FEATURE_DEPENDENCY_STALE');
}

/** Follows the actual wrapper/clone structure produced by the native router.
 * Every original source keeps its BRep, construction data and world placement.
 * No face number, nearest surface or guessed geometric matching is used. */
export async function preserveCadAISpatialDependencies(before,result,{rootId,field,oc,service,editRecipe,signal,constructionBefore={}}={}){
 let project=cadProjectSnapshot(result.project);const original=before.nodes.find(n=>n.id===rootId),changed=project.nodes.find(n=>n.id===rootId),face=field==='face.offset',wrapped=face||!['group','finish','partition','extraction','modeling'].includes(original.source),routes=[];
 if(!original||!changed||original.id!==changed.id)fail('Der gewählte Wurzelkörper wurde ersetzt.');
 if(wrapped){
  if(changed.children?.length!==1)fail('Die ursprüngliche Konstruktion fehlt unter der neuen Operation.');
  function visit(old,node,oldPath,newPath,first=false){
   if(!node||old.kind!==node.kind||old.source!==node.source||old.brep.data!==node.brep.data||cadSourceGeometryDigest(old)!==cadSourceGeometryDigest(first&&!face?{...node,transform:old.transform}:node)||old.children?.length!==node.children?.length)fail('Eine Originalquelle wurde während der Strukturänderung verändert.','AI_FEATURE_SCOPE_VIOLATION');
   const originalData=n=>({...omit(n,['id','children','finish','annotations',...(first&&!face?['transform']:[])]),annotations:authoredAnnotations(n.annotations,{cloned:true})});if(!same(originalData(old),originalData(node)))fail('Eigenschaften oder Beschriftungen einer Originalquelle wurden verändert.','AI_FEATURE_SCOPE_VIOLATION');
   const from={rootId,path:oldPath},to={rootId,path:newPath},a=cadSelectionContext(before,from),b=cadSelectionContext(project,to);if(!a.world.every((v,k)=>Math.abs(v-b.world[k])<=1e-9*Math.max(1,Math.abs(v))))fail('Die Weltlage einer erhaltenen Quelle wurde verändert.','AI_FEATURE_SCOPE_VIOLATION');routes.push({from,to,name:old.name});for(let i=0;i<(old.children?.length??0);i++)visit(old.children[i],node.children[i],[...oldPath,old.children[i].id],[...newPath,node.children[i].id]);
  }
  visit(original,changed.children[0],[],[changed.children[0].id],true);
 }else{
  if(!same(omit(original,['brep','stats','finish','annotations']),omit(changed,['brep','stats','finish','annotations']))||!same(authoredAnnotations(original.annotations),authoredAnnotations(changed.annotations))||!same(original.finish?.steps??[],changed.finish?.steps.slice(0,-1)??[])||(changed.finish?.steps.length??0)!==(original.finish?.steps.length??0)+1)fail('Die Kantenoperation hat vorhandene Quellen oder Konstruktionsschritte verändert.','AI_FEATURE_SCOPE_VIOLATION');
 }
 const byAddress=new Map(routes.map(r=>[key(r.from),r])),moved=t=>byAddress.get(key(t))?.to??t,review={version:1,parameters:[],sources:[],contours:[],drawingViews:[],bindings:[],jointFrames:[],unresolvedReferences:[]};
 function annotationProblems(node,path=[]){for(const mark of node.annotations??[])if(mark.status==='stale')review.unresolvedReferences.push({kind:'annotation',target:{rootId,path},annotationId:mark.id,message:'Eine gespeicherte Flächenmarkierung liegt nicht mehr eindeutig auf der fertigen Oberfläche. Markierung ausdrücklich neu zuordnen.'});for(const child of node.children??[])annotationProblems(child,[...path,child.id]);}annotationProblems(changed);
 if(before.projectParameters){
  const data=structuredClone(before.projectParameters),ids=[];
  for(const b of data.bindings){const keepOuter=!face&&!b.target.path.length&&affineField(b.field),to=keepOuter?b.target:moved(b.target);if(!same(b.target,to)){review.bindings.push({id:b.id,parameterName:data.parameters.find(p=>p.id===b.parameterId).name,field:b.field,from:b.target,to});b.target=structuredClone(to);ids.push(b.id);}}
  if(data.freecad)data.freecad=remapFreeCADParameterRuns(data.freecad,moved);
  // Visibility/suppression of the root still controls the finished result.
  // Nested states follow their actual retained sources, with no scalar edits.
  for(const variant of data.variants)for(const state of variant.states)if(state.target.path.length)state.target=structuredClone(moved(state.target));for(const state of data.baseStates??[])if(state.target.path.length)state.target=structuredClone(moved(state.target));
  project.projectParameters=refreshCadProjectParameterCorrespondence(project,validateCadProjectParameters(data),{bindingIds:ids});
  const related=new Set(data.bindings.filter(b=>b.target.rootId===rootId).map(b=>b.id));if(cadProjectParameterProblems(project).some(p=>related.has(p.bindingId)))fail('Die neue Operation widerspricht einem gebundenen Außenmaß. Den Bezug zwischen Originalquelle und fertigem Körper ausdrücklich klären.','AI_FEATURE_PARAMETER_REASSIGN_REQUIRED');
 }
 if(before.contourLinks&&routes.length){
  project.contourLinks=reparentCadContourLinks({...project,contourLinks:before.contourLinks},[...routes].sort((a,b)=>b.from.path.length-a.from.path.length),{previousProject:before});
  for(const link of project.contourLinks.links){const old=before.contourLinks.links.find(l=>l.id===link.id);if(!same(old.source,link.source)||!same(old.target,link.target))review.contours.push({id:link.id,name:cadSelectionContext(project,link.target).node.name,source:link.source,target:link.target,retainedOriginal:true});}
  const touched=new Set(review.contours.map(l=>l.id));if(cadContourLinkProblems(project).some(p=>touched.has(p.linkId)))fail('Ein Originalkonturbezug konnte nicht exakt erhalten werden. Bezug ausdrücklich neu zuordnen.','AI_FEATURE_CONTOUR_REASSIGN_REQUIRED');
 }
 // Root-frame changes are coordinate changes only. Keep joint axes and all
 // connected bodies at exactly the same world placement, limits and values.
 if(before.joints&&!same(original.transform,changed.transform)){
  const data=structuredClone(before.joints),delta=multiplyCadMatrices(inverseCadMatrix(changed.transform),original.transform);
  for(const joint of data.joints){let touched=false;for(const [id,frame]of [['parentId','parentFrame'],['childId','childFrame']])if(joint[id]===rootId){joint[frame]=multiplyCadMatrices(delta,joint[frame]);touched=true;}if(touched)review.jointFrames.push({jointId:joint.id,name:joint.name});}project.joints=validateCadJoints(data);
 }
 const oldProblems=cadJointProblems(before);if(cadJointProblems(project).some(p=>!oldProblems.some(old=>old.jointId===p.jointId&&old.code===p.code)))fail('Die Operation verändert einen Gelenkbezug. Bezug ausdrücklich erneuern.','AI_FEATURE_JOINT_REASSIGN_REQUIRED');
 const plane=before.workplane.reference;
 if(plane&&plane.kind!=='mesh'&&plane.objectId===rootId){
  project.workplane=structuredClone(before.workplane);const reference=project.workplane.reference,anchor=reference.topology.anchor,delta=multiplyCadMatrices(inverseCadMatrix(changed.transform),original.transform),inverse=inverseCadMatrix(delta);reference.topology.origin.path=structuredClone(moved({rootId,path:plane.topology.origin.path}).path);anchor.point=cadPoint(delta,anchor.point);if(anchor.samples)anchor.samples=anchor.samples.map(p=>cadPoint(delta,p));if(anchor.normal)anchor.normal=unit([0,1,2].map(row=>inverse[row*4]*anchor.normal[0]+inverse[row*4+1]*anchor.normal[1]+inverse[row*4+2]*anchor.normal[2]));if(anchor.tangent)anchor.tangent=unit([0,1,2].map(row=>delta[row]*anchor.tangent[0]+delta[4+row]*anchor.tangent[1]+delta[8+row]*anchor.tangent[2]));project=rebindCadWorkplaneNative(oc,project);if(!project.workplane.reference)review.unresolvedReferences.push({kind:'workplane',message:'Die bisherige Arbeitsebenenfläche wurde verändert. Arbeitsebene ausdrücklich neu wählen.'});
 }
 const drawingViews=(before.drawings?.sheets??[]).flatMap(s=>s.views.filter(v=>v.sourceIds.includes(rootId)).map(v=>({sheetId:s.id,viewId:v.id})));
 if(drawingViews.length){
  const refreshed=await updateCadAssociative(project,{kind:'associativeUpdate',updateIds:[],drawingSheetIds:[...new Set(drawingViews.map(v=>v.sheetId))]},{oc,service,editRecipe,signal,boundSubset:{seedTargets:[],targets:[],parameterBindingIds:[],bindings:[],drawingViews}});project=refreshed.project;review.drawingViews=drawingViews;
  for(const sheet of project.drawings.sheets)for(const a of sheet.annotations)if(a.unresolved&&drawingViews.some(v=>v.sheetId===sheet.id&&v.viewId===a.viewId))review.unresolvedReferences.push({kind:'drawing',sheetId:sheet.id,annotationId:a.id,message:'Zeichnungsbemaßung nach Topologieänderung ausdrücklich neu zuordnen.'});
 }
 // Strictly retain unrelated model trees and metadata. Changes to parameter
 // addresses, contour frames, joints and views above are derived locally.
 const metadata=p=>omit(p,['nodes','version','projectParameters','contourLinks','joints','drawings','workplane']);if(!same(metadata(before),metadata(project))||!same(before.nodes.map(n=>n.id),project.nodes.map(n=>n.id)))fail('Unbeteiligte Projekteigenschaften verändert.','AI_FEATURE_SCOPE_VIOLATION');for(const n of before.nodes)if(n.id!==rootId&&!same(n,project.nodes.find(x=>x.id===n.id)))fail('Ein unabhängiges Teil wurde verändert.','AI_FEATURE_SCOPE_VIOLATION');
 if(before.drawings)for(const sheet of before.drawings.sheets){const next=project.drawings.sheets.find(s=>s.id===sheet.id);for(const v of sheet.views)if(!drawingViews.some(d=>d.sheetId===sheet.id&&d.viewId===v.id)&&!same(v,next.views.find(n=>n.id===v.id)))fail('Eine unbeteiligte Zeichnungsansicht wurde verändert.','AI_FEATURE_SCOPE_VIOLATION');}
 const counts=Object.fromEntries(Object.entries(service.constructionState().counts).map(([id,n])=>[id,n-(constructionBefore[id]??0)]).filter(([,n])=>n>0));if(Object.values(counts).some(n=>n>1))fail('Eine Quelle wurde in derselben Strukturänderung mehrfach konstruiert.');
 review.requiresAcceptance=!!(review.bindings.length||review.contours.length||review.drawingViews.length||review.jointFrames.length||review.unresolvedReferences.length);
 return {...result,project:cadProjectSnapshot(project),warnings:[...new Set([...(result.warnings??[]),...review.unresolvedReferences.map(p=>p.message)])],report:{...(result.report??{}),counts,constructedIds:Object.keys(counts),featureDependencies:review,retainedSourceMappings:routes,unrelatedSourcesExact:true}};
}
