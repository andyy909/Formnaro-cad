import {cadSelectionContext} from './cad-interface-state.js';
export function resolveFreeCADDocumentTarget(project,target,{write=false}={}){
 let context=cadSelectionContext(project,target);const archive=context.node.metadata?.freecadSource?.documentBase64;
 if(!archive)throw Error('Die gewählte Quelle enthält kein archiviertes FreeCAD-Dokument.');
 if(context.node.source!=='step'){
  const found=[];function visit(n,path){if(n.source==='step'&&n.metadata?.freecadSource?.documentBase64===archive)found.push({rootId:target.rootId,path});for(const child of n.children??[])visit(child,[...path,child.id]);}visit(context.node,[...target.path]);
  if(found.length!==1)throw Error('Die FreeCAD-Quelle ist nicht eindeutig. Eine erhaltene STEP-Quelle im Modellbaum auswählen.');context=cadSelectionContext(project,found[0]);
 }
 if(context.node.kind!=='cad'||context.node.source!=='step')throw Error('Eine erhaltene FreeCAD-STEP-Quelle auswählen.');
 if(write&&(context.locked||context.hidden||context.sourceGeometryReadonly))throw Object.assign(Error('Die FreeCAD-Quelle oder ihr Container ist gesperrt, ausgeblendet oder geometrisch geschützt.'),{code:'FREECAD_SOURCE_LOCKED'});
 return context;
}
