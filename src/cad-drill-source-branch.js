import {cadSelectionContext} from './cad-interface-state.js';
import {cadDrillStockSourceChild} from './cad-associative-drill.js';

const fail=message=>{throw Object.assign(Error(message),{code:'CAD_DRILL_SOURCE_REPLACEMENT_INVALID'});};
function nextSource(node){
 if(node.drill){if(node.children?.length>1)fail('Der Bohrungsquellenbaum ist nicht eindeutig.');return node.children?.[0]??null;}
 return cadDrillStockSourceChild(node);
}

/** Follow only the exact active positive stock spine. Retained ordinary
 * wrappers and their inactive authored siblings never disappear. A selected
 * inner feature belongs to every owning drill above those stock wrappers. */
export function cadDrillSourceBranch(project,target){
 const selected=cadSelectionContext(project,target);if(!selected.node.drill)fail('Einen vorhandenen Bohrungszweig wählen.');
 let first=selected.chain.length-1;for(let index=0;index<selected.chain.length-1;index++)if(selected.chain[index].drill){let owns=true;for(let step=index;step<selected.chain.length-1;step++)if(nextSource(selected.chain[step])?.id!==selected.chain[step+1].id){owns=false;break;}if(owns){first=index;break;}}
 const rootTarget={rootId:target.rootId,path:target.path.slice(0,first)},root=cadSelectionContext(project,rootTarget),drills=[];let current=root;
 for(;;){
  if(current.locked||current.hidden||current.sourceGeometryReadonly||current.chain.some(node=>node.suppressed))fail('Bohrungszweig oder Quelle ist gesperrt oder inaktiv.');
  const node=current.node;
  if(node.drill){
   drills.push({target:structuredClone(current.target),path:[...current.target.path],id:node.id,drill:structuredClone(node.drill),node,world:[...current.world]});const child=nextSource(node);
   if(!child)return {rootTarget,rootNode:root.node,drills,stockTarget:{rootId:target.rootId,path:[...current.target.path,node.drill.sourceId]},stockParentTarget:structuredClone(current.target),stockParentWorld:[...current.world],stockNode:null,stockWorld:null};
   current=cadSelectionContext(project,{rootId:target.rootId,path:[...current.target.path,child.id]});continue;
  }
  if(node.children?.length){const child=nextSource(node);if(!child)fail('Die bisherige Quellenstruktur ist nicht eindeutig. Quellen zuerst ausdrücklich erhalten oder lösen; der Quellenersatz entfernt keine Unterteile.');current=cadSelectionContext(project,{rootId:target.rootId,path:[...current.target.path,child.id]});continue;}
  if(node.source==='group')fail('Die bisherige Quellenstruktur ist nicht eindeutig. Der erhaltene Quellencontainer besitzt keine aktive Quelle.');
  const stockParentTarget={rootId:target.rootId,path:current.target.path.slice(0,-1)},parent=cadSelectionContext(project,stockParentTarget);
  return {rootTarget,rootNode:root.node,drills,stockTarget:structuredClone(current.target),stockParentTarget,stockParentWorld:[...parent.world],stockNode:node,stockWorld:[...current.world]};
 }
}
