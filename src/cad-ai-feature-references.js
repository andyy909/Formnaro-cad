import {cadSelectionContext} from './cad-interface-state.js';
import {projectObjectGeometryDigest} from './project-objects.js';
import {cadProjectParameterCatalog} from './cad-project-parameters-catalog.js';
import {validateCadAIReference,validateCadAIReferenceTarget,cadAIReferenceFrameDigest,cadAIReferenceBindingKey} from './cad-ai-feature-reference-data.js';
export * from './cad-ai-feature-reference-data.js';
const fail=(message,code='AI_REFERENCE_INVALID')=>{throw Object.assign(Error('Merkmalsbezug: '+message),{code});};

// A source ID is an address, never proof of geometry correspondence. Any
// changed finished geometry or placement invalidates spatial references. An
// explicit fresh pick/rebind is required; there is no nearest-face fallback.
export function cadAIReferenceState(project,value,{stored=false}={}){
 const reference=validateCadAIReference(value);let context;
 if(stored){const current=project.featureReferences?.items.find(r=>r.id===reference.id);if(!current)return {reference,status:'missing',code:'AI_REFERENCE_MISSING',message:'Gespeicherter Bezug fehlt. Einen aktuellen Bezug bewusst neu anhängen.'};if(cadAIReferenceBindingKey(current)!==cadAIReferenceBindingKey(reference))return {reference,status:'stale',code:'AI_REFERENCE_REASSIGNED',message:'Dieser Bezug wurde neu zugeordnet. Die aktuelle Zuordnung bewusst erneut anhängen.'};}
 try{context=cadSelectionContext(project,reference.target);}catch{return {reference,status:'missing',code:'AI_REFERENCE_MISSING',message:'Teil oder Quellenmerkmal fehlt. Bezug neu zuordnen.'};}
 if(context.node.kind!=='cad')return {reference,status:'unsupported',code:'AI_REFERENCE_UNSUPPORTED',message:'Der Bezug ist kein natives CAD-Merkmal.'};
 if(reference.selector&&projectObjectGeometryDigest(context.root)!==reference.rootDigest||projectObjectGeometryDigest(context.node)!==reference.sourceDigest||cadAIReferenceFrameDigest(context.world)!==reference.frameDigest)return {reference,status:'stale',code:'AI_REFERENCE_STALE',message:'Geometrie oder Lage wurde geändert. Bezug ausdrücklich neu zuordnen.'};
 let origin=context;
 if(reference.origin){try{origin=cadSelectionContext(project,reference.origin.target);}catch{return {reference,status:'missing',code:'AI_REFERENCE_MISSING',message:'Die gewählte Merkmalsquelle fehlt. Neu zuordnen.'};}if(projectObjectGeometryDigest(origin.node)!==reference.origin.sourceDigest)return {reference,status:'stale',code:'AI_REFERENCE_STALE',message:'Merkmalsquelle wurde geändert. Bezug neu zuordnen.'};}
 const blocked=origin.locked?'Teil, Quelle oder Container ist gesperrt.':origin.hidden?'Die gewählte Quelle ist ausgeblendet.':origin.sourceGeometryReadonly?'Diese erhaltene Quelle ist geometrisch geschützt.':null;
 return {reference,status:'current',editable:!blocked,reason:blocked,requiresNativeResolution:!!reference.selector,target:reference.origin?.target??reference.target};
}
export function captureCadAISourceReference(project,target,{kind='feature',id='ref-'+crypto.randomUUID(),name}={}){
 if(!['feature','sketch'].includes(kind))fail('Ein Quellenmerkmal oder eine Skizze wählen.');
 const c=cadSelectionContext(project,validateCadAIReferenceTarget(target));if(c.node.kind!=='cad'||kind==='sketch'&&c.node.recipe?.type!=='sketch')fail('Die gewählte Quelle ist keine passende native CAD-Konstruktion.');
 return validateCadAIReference({version:1,id,name:name??c.node.name.slice(0,160),kind,target,rootDigest:projectObjectGeometryDigest(c.root),sourceDigest:projectObjectGeometryDigest(c.node),frameDigest:cadAIReferenceFrameDigest(c.world)});
}
export function cadAIReferenceFields(project,value){
 const state=cadAIReferenceState(project,value);if(state.status!=='current'||!state.editable)return [];
 // A surface without a uniquely chosen editable origin does not grant
 // permission to scale its whole body. Native face/edge operations are
 // resolved separately against the exact retained domain.
 if(state.reference.selector&&!state.reference.origin)return [];
 return cadProjectParameterCatalog(project,{targets:[state.target]})[0].fields;
}
export function cadAISourceReferenceCatalog(project,{rootIds=project.nodes.filter(n=>n.kind==='cad').map(n=>n.id),limit=200}={}){
 if(!Array.isArray(rootIds)||rootIds.length>1000||!Number.isSafeInteger(limit)||limit<1||limit>500)fail('Ungültige Merkmalskataloggrenze.');
 const wanted=new Set(rootIds),items=[];let total=0;
 function visit(node,target){if(node.kind!=='cad')return;total++;if(items.length<limit){const c=cadSelectionContext(project,target);items.push({target,name:node.name,kind:node.recipe?.type==='sketch'?'sketch':'feature',source:node.source,recipeType:node.recipe?.type??null,locked:c.locked,hidden:c.hidden,sourceGeometryReadonly:c.sourceGeometryReadonly,fields:cadProjectParameterCatalog(project,{targets:[target]})[0].fields});}for(const child of node.children??[])visit(child,{rootId:target.rootId,path:[...target.path,child.id]});}
 for(const node of project.nodes)if(wanted.has(node.id))visit(node,{rootId:node.id,path:[]});
 return {items,total,truncated:total>items.length};
}
