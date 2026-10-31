import {cadProjectSnapshot} from './cad-project.js';
import {createCadDrawingNative} from './cad-drawing-native.js';
import {updateCadDrawingProjection,cadDrawingDimension} from './cad-drawing-data.js';
import {cadDrawingUpdatedPosition} from './cad-drawing-layout.js';
import {cadProjectParameterExportProblems} from './cad-project-parameters-export.js';
import {cadContourLinkProblems} from './cad-linked-contours-data.js';
import {assertCadLinkedPatternExportReady} from './cad-linked-pattern-data.js';
import {evaluateCadProjectParameters} from './cad-project-parameters-data.js';
import {flags} from './organization.js';

/** Run after copied bodies are rebuilt and stamped. No unrelated contour,
 * program, view or annotation is refreshed as a side effect of projection. */
export function updateCadPatternDrawings(project,views,{oc,service,signal}={}){
 if(!views.length)return {project,report:{updatedSheetIds:[],updatedViewIds:[],updatedViews:[],unresolvedDimensions:[]},warnings:[]};
 const draft=cadProjectSnapshot(project),projectView=createCadDrawingNative({oc,service}),updated=[],unresolved=[],deferredViews=[],states=new Map(project.projectParameters?evaluateCadProjectParameters(project.projectParameters).states.filter(state=>!state.target.path.length).map(state=>[state.target.rootId,state]):[]);
 for(const target of views){signal?.throwIfAborted();const index=draft.drawings.sheets.findIndex(sheet=>sheet.id===target.sheetId),sheet=draft.drawings.sheets[index],view=sheet?.views.find(view=>view.id===target.viewId);if(!view)throw Error('Die betroffene Muster-Zeichnungsansicht fehlt.');
  const options={ids:view.sourceIds,format:'step',includeHidden:true},problems=[...cadProjectParameterExportProblems(draft,options),...cadContourLinkProblems(draft,draft.contourLinks,options)];if(problems.length)throw Object.assign(Error('Eine weitere Quelle der Musterzeichnung ist veraltet oder verloren. '+problems[0].message),{code:'PATTERN_DRAWING_INPUTS_UNRESOLVED',problems});assertCadLinkedPatternExportReady(draft,options);
  for(const id of view.sourceIds){const node=draft.nodes.find(node=>node.id===id),state=states.get(id);if(!node||node.kind!=='cad'||!node.solid||flags({...node,hidden:false},draft).hidden||node.hidden&&state?.hidden!==true||node.suppressed&&state?.suppressed!==true)throw Object.assign(Error('Eine notwendige Zeichnungsquelle fehlt oder ist nicht vollständig darstellbar.'),{code:'PATTERN_DRAWING_SOURCE_LOST'});}
  const inactive=view.sourceIds.filter(id=>{const node=draft.nodes.find(node=>node.id===id);return node?.suppressed||node?.hidden;});
  if(inactive.length&&inactive.every(id=>{const node=draft.nodes.find(node=>node.id===id),state=states.get(id);return (!node.hidden||state?.hidden===true)&&(!node.suppressed||state?.suppressed===true);})){deferredViews.push({...target,inactiveSourceIds:inactive});continue;}
  const projection=projectView(draft,{ids:view.sourceIds,view:view.kind,...(view.kind==='section'?{section:view.section}:{})}),position=cadDrawingUpdatedPosition(view.position,view.projection,projection,sheet.scale),next=updateCadDrawingProjection(sheet,view.id,projection);next.views.find(v=>v.id===view.id).position=position;
  if(view.sourceIds.some(id=>!projection.sourceSignatures.some(source=>source.id===id)))throw Object.assign(Error('Eine notwendige Zeichnungsquelle fehlt oder ist nicht vollständig darstellbar.'),{code:'PATTERN_DRAWING_SOURCE_LOST'});
  for(const annotation of next.annotations)if(annotation.kind!=='label'&&annotation.viewId===view.id)try{cadDrawingDimension(next,annotation);}catch{annotation.unresolved=true;}
  for(const annotation of next.annotations)if(annotation.kind!=='label'&&annotation.viewId===view.id&&annotation.unresolved&&!sheet.annotations.find(old=>old.id===annotation.id)?.unresolved)unresolved.push({...target,annotationId:annotation.id});draft.drawings.sheets[index]=next;updated.push(target);
 }
 return {project:cadProjectSnapshot(draft),report:{updatedSheetIds:[...new Set(updated.map(v=>v.sheetId))],updatedViewIds:updated.map(v=>v.viewId),updatedViews:updated,unresolvedDimensions:unresolved,...(deferredViews.length?{deferredViews}:{})},warnings:[...unresolved.map(item=>'Zeichnungsmaß '+item.annotationId+' nach der Musteränderung ausdrücklich neu zuordnen. Der gespeicherte Bezug bleibt erhalten.'),...deferredViews.map(item=>'Zeichnungsansicht '+item.viewId+': Eine Quelle ist in der gewählten Variante ausgeblendet oder unterdrückt. Die bisherige Projektion bleibt gespeichert; Quelle aktivieren und Ansicht aktualisieren.')]};
}
