import {cadProjectSnapshot,cadProjectRevision} from './cad-project.js';
import {cadPoint,inverseCadMatrix,multiplyCadMatrices} from './cad-affine.js';
import {cadBoolean,cadVolume} from './cad-native-kernel.js';
import {cadNativeFaceCorrespondence} from './cad-face-correspondence-native.js';
import {cadGeometryDigest} from './cad-geometry-digest.js';
import {partSurfaceDigest,partSurfaceState} from './cad-part-properties.js';
import {resolveCadAnnotationNative} from './cad-annotations-native.js';
import {CAD_ANNOTATION_LIMITS} from './cad-annotations-data.js';
import {cadAIReferenceState} from './cad-ai-feature-references.js';
import {cadProjectParameterProblems} from './cad-project-parameters-data.js';
import {cadContourLinkProblems} from './cad-linked-contours-data.js';
import {cadLinkedPatternProblems} from './cad-linked-pattern-data.js';
import {cadDrawingProblems,cadDrawingSourceSignatures} from './cad-drawing-data.js';
import {prepareCadDrillConversionStock,reparentCadDrillConversionReferences,remapCadDrillConversionBindings} from './cad-drill-conversion-data.js';
import {cadSelectionContext} from './cad-interface-state.js';

const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
const normal=(matrix,n)=>{const inverse=inverseCadMatrix(matrix),v=[0,1,2].map(row=>inverse[row*4]*n[0]+inverse[row*4+1]*n[1]+inverse[row*4+2]*n[2]),length=Math.hypot(...v);return v.map(x=>x/length);};

function preserveRootColors(oc,before,after){
 const metadata=after.metadata;if(!metadata)return {pendingColors:0};
 const colors=before.metadata?.stepFaceColors??[],surfaces=before.metadata?.partProperties?.surfaces;
 if(!colors.length&&!surfaces)return {pendingColors:0};
 const correspondence=cadNativeFaceCorrespondence(oc,before.brep,after.brep,{indices:[...colors.map(color=>color.faceIndex),...(surfaces?.groups??[]).flatMap(group=>group.faceIds)]}),oldKeys=correspondence.beforeKeys,map=correspondence.mapping;
 const pending=[...(metadata.pendingFaceColors??[])],current=[],digest=cadGeometryDigest(before.brep.data);
 for(const color of colors){const faceIndex=map.get(color.faceIndex);if(faceIndex)current.push({...color,faceIndex});else pending.push({...color,sourceDigest:digest,...(oldKeys[color.faceIndex-1]?{faceDigest:oldKeys[color.faceIndex-1]}:{})});}
 if(colors.length){if(current.length)metadata.stepFaceColors=current;else delete metadata.stepFaceColors;}
 if(pending.length)metadata.pendingFaceColors=pending;
 // Full groups remain authored data when even one domain lacks a proof. Their
 // old digest makes that state explicit; never silently renumber stale faces.
 let unresolvedSurfaceGroups=0;
 if(surfaces&&partSurfaceState(before).current){if(surfaces.groups.every(group=>group.faceIds.every(id=>map.has(id))))metadata.partProperties.surfaces={...surfaces,geometryDigest:partSurfaceDigest(after),groups:surfaces.groups.map(group=>({...group,faceIds:group.faceIds.map(id=>map.get(id))}))};else unresolvedSurfaceGroups=surfaces.groups.length;}
 return {pendingColors:pending.length,unresolvedSurfaceGroups,faceDomainProofs:correspondence.proofs};
}

function preserveToolMarks(oc,before,after,{target,beforeRoot=before,afterRoot=after,relative}={}){
 const migrated=[],unresolved=[];
 const authored=new Map();function index(node){for(const annotation of node.annotations??[])authored.set(annotation.id,annotation);for(const child of node.children??[])index(child);}index(before);
 function visit(node,path,matrix,suppressed){
  suppressed||=!!node.suppressed;
  if(suppressed&&node.annotations?.length){const retained=[];
   for(const retainedAnnotation of node.annotations){const annotation=authored.get(retainedAnnotation.id)??retainedAnnotation,point=cadPoint(matrix,annotation.point),n=normal(matrix,annotation.normal),rootPoint=cadPoint(relative,point),rootNormal=normal(relative,n),old=resolveCadAnnotationNative(oc,beforeRoot,{point:rootPoint,normal:rootNormal}),fresh=resolveCadAnnotationNative(oc,afterRoot,{point:rootPoint,normal:rootNormal});
    if(annotation.status==='valid'&&old.status==='valid'&&fresh.status==='valid'&&(after.annotations?.length??0)<CAD_ANNOTATION_LIMITS.perNode){
     after.annotations??=[];const {reason,...copy}=annotation;after.annotations.push({...copy,point,normal:normal(inverseCadMatrix(relative),fresh.normal),status:'valid',faceSignature:fresh.faceSignature});migrated.push({id:annotation.id,from:{rootId:target.rootId,path:[...target.path,...path]},to:structuredClone(target)});
    }else{retained.push(retainedAnnotation);unresolved.push({kind:'annotation',id:annotation.id,target:{rootId:target.rootId,path:[...target.path,...path]}});}
   }
   if(retained.length)node.annotations=retained;else delete node.annotations;
  }
  for(const child of node.children??[])visit(child,[...path,child.id],multiplyCadMatrices(matrix,child.transform),suppressed);
 }
 for(const child of after.children)visit(child,[child.id],child.transform,false);
 return {migrated,unresolved};
}

/** Native geometry conversion works in an isolated stock-only draft. The
 * complete original project is restored before any proposal can be published. */
export async function convertCadLegacyDrill(input,{id,path=[],bindingRemap=[],options},{oc,service,createTools}={}){
 const previous=cadProjectSnapshot(input),target={rootId:id,path:[...path]},context=cadSelectionContext(previous,target),legacy=context.node,plan=prepareCadDrillConversionStock(legacy,{target});
 const isolated=cadProjectSnapshot(previous);for(const key of ['projectParameters','contourLinks','drawings','joints','linkedPatterns','featureReferences'])delete isolated[key];isolated.workplane.reference=null;
 const stock=structuredClone(plan.stock);stock.transform=[...context.world];isolated.nodes=[stock];
 const rebuilt=await service.rebuild(isolated),revision=cadProjectRevision(rebuilt),transactions={snapshot:()=>cadProjectSnapshot(rebuilt),revision:()=>revision,preview:({project})=>({project})};
 const built=await createTools({oc,service,transactions}).previewDrill({...options,id:stock.id,resultId:legacy.id,associative:true,revision});
 const converted={...structuredClone(legacy),operation:'union',drill:built.project.nodes[0].drill,children:[structuredClone(plan.stock)]};
 converted.drill.sourceId=plan.stock.id;delete converted.geometryIdentity;
 let draft=cadProjectSnapshot(previous);Object.assign(cadSelectionContext(draft,target).node,converted);delete cadSelectionContext(draft,target).node.geometryIdentity;
 reparentCadDrillConversionReferences(draft,previous,id,plan.stock.id,plan.moves);
 draft=await service.rebuild(draft,{baseline:previous});const afterContext=cadSelectionContext(draft,target),result=afterContext.node;
 for(const [beforeNode,afterNode]of [[context.root,afterContext.root],...(path.length?[[{...legacy,transform:context.world},{...result,transform:afterContext.world}]]:[])]){
  let a,b,missing,added;try{
   a=service.worldShape(beforeNode);b=service.worldShape(afterNode);missing=cadBoolean(oc,'difference',a,b,{allowEmpty:true});added=cadBoolean(oc,'difference',b,a,{allowEmpty:true});
   const tolerance=Math.max(1e-7,cadVolume(oc,a)*1e-9);if((missing&&cadVolume(oc,missing)>tolerance)||(added&&cadVolume(oc,added)>tolerance))fail('CAD_DRILL_CONVERSION_MISMATCH','Die bestätigten Bohrdaten stimmen geometrisch nicht mit der alten Bohrgruppe überein.');
  }finally{added?.delete();missing?.delete();b?.delete();a?.delete();}
 }
 const oldNodes=new Map();function index(node){oldNodes.set(node.id,node);for(const child of node.children??[])index(child);}index(context.root);
 const colors={pendingColors:0,unresolvedSurfaceGroups:0,faceDomainProofs:[]};function colorTree(node){const old=oldNodes.get(node.id);if(old){const kept=preserveRootColors(oc,old,node);colors.pendingColors+=kept.pendingColors??0;colors.unresolvedSurfaceGroups+=kept.unresolvedSurfaceGroups??0;colors.faceDomainProofs.push(...(kept.faceDomainProofs??[]).map(proof=>({nodeId:node.id,...proof})));}for(const child of node.children??[])colorTree(child);}colorTree(afterContext.root);
 const relative=multiplyCadMatrices(inverseCadMatrix(context.root.transform),context.world),marks=preserveToolMarks(oc,legacy,result,{target,beforeRoot:context.root,afterRoot:afterContext.root,relative}),unresolved=[...marks.unresolved],remappedBindings=remapCadDrillConversionBindings(draft,target,bindingRemap,plan.suppressedIds);
 for(const reference of draft.featureReferences?.items??[])if(cadAIReferenceState(draft,reference).status!=='current')unresolved.push({kind:'feature',id:reference.id,target:reference.target});
 for(const problem of cadProjectParameterProblems(draft))unresolved.push({kind:'parameter',id:problem.bindingId,target:problem.target,message:problem.message});
 for(const problem of cadContourLinkProblems(draft))unresolved.push({kind:'contour',id:problem.linkId,target:problem.target,message:problem.message});
 for(const pattern of draft.linkedPatterns?.patterns??[])for(const problem of cadLinkedPatternProblems(draft,pattern))unresolved.push({kind:'pattern',id:pattern.id,message:problem.message});
 const drawingSignatures=cadDrawingSourceSignatures(draft);for(const sheet of draft.drawings?.sheets??[])for(const problem of cadDrawingProblems(sheet,{sourceSignatures:drawingSignatures}))unresolved.push({kind:'drawing',id:sheet.id,message:problem.message});
 const suppressed=new Set(plan.suppressedIds);function visit(node,path,inactive){inactive||=suppressed.has(node.id);if(inactive)for(const binding of draft.projectParameters?.bindings??[])if(binding.target.rootId===id&&binding.target.path.length===path.length&&binding.target.path.every((part,i)=>part===path[i]))unresolved.push({kind:'retainedToolBinding',id:binding.id,target:binding.target,message:'Diese Bindung bleibt an der stillgelegten ursprünglichen Werkzeugdefinition; Bohrungsmaß ausdrücklich am neuen Merkmal zuordnen.'});for(const child of node.children??[])visit(child,[...path,child.id],inactive);}visit(result,target.path,false);
 const warnings=[];if(unresolved.length)warnings.push(unresolved.length+' erhaltene Bezüge benötigen ausdrückliche Prüfung oder Neuzuordnung; ursprüngliche Daten und Quellen bleiben gespeichert.');if(colors.pendingColors)warnings.push(colors.pendingColors+' Flächenfarben bleiben als offene ursprüngliche Bezüge gespeichert.');if(colors.unresolvedSurfaceGroups)warnings.push(colors.unresolvedSurfaceGroups+' ursprüngliche Flächengruppen bleiben gespeichert und benötigen eine ausdrückliche Neuzuordnung.');
 return {project:cadProjectSnapshot(draft),warnings,report:{convertedDrillId:legacy.id,convertedDrillTarget:target,stockId:stock.id,retainedToolIds:plan.suppressedIds,migratedAnnotations:marks.migrated,remappedBindings,unresolvedReferences:unresolved,...colors}};
}
