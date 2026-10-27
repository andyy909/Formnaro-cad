import {combineMeshSelection,validateMeshSelectionBinding} from './mesh-selection-data.js';

const copy=value=>value==null?null:structuredClone(value);
const binding=value=>value==null?null:copy(validateMeshSelectionBinding(value));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

/** Workspace selection is deliberately independent of the model history. Only
 * commit changes the saved binding; a viewport draft can always be discarded. */
export function createMeshSelectionState(initial=null){
 let committed=binding(initial),session=null;
 const snapshot=()=>copy(committed);
 const state=()=>session?{objectId:session.objectId,geometryDigest:session.geometryDigest,draft:copy(session.draft),protections:copy(session.protections),committed:snapshot(),canUndo:!!session.past.length,canRedo:!!session.future.length}:null;
 const weight=value=>(value?.triangleIds.length??0)+(value?.boundaryEdges.length??0)*4;
 function bound(history){let total=0;for(let i=history.length-1;i>=0;i--){total+=weight(history[i].draft)+(history[i].protections??[]).reduce((n,r)=>n+r.triangleIds.length,0);if(history.length-i>24||total>1000000){history.splice(0,i+1);break;}}}
 function current(){return {draft:session.draft,protections:session.protections};}
 function assign(value){session.draft=value.draft;session.protections=value.protections;}
 function push(next,protections=session.protections){if(same(next,session.draft)&&same(protections,session.protections))return;session.past.push(current());bound(session.past);session.future=[];assign({draft:next,protections:copy(protections)});}
 function begin({objectId,geometryDigest,protections=[]}){
  if(typeof objectId!=='string'||!objectId||typeof geometryDigest!=='string'||!geometryDigest)throw Error('Ungültige Netzquelle für die Flächenauswahl.');
  session={objectId,geometryDigest,protections:copy(protections),initialProtections:copy(protections),draft:committed?.objectId===objectId&&committed.geometryDigest===geometryDigest?copy(committed):null,past:[],future:[]};
  return state();
 }
 function update(result,operation='replace'){
  if(!session)throw Error('Die Netz-Flächenauswahl ist nicht geöffnet.');
  if(result?.objectId!==session.objectId||result?.geometryDigest!==session.geometryDigest)throw Error('Die Netzquelle wurde verändert. Die Auswahl erneut öffnen.');
  push(binding(combineMeshSelection(session.draft,result,operation)));
  return state();
 }
 function clear(){if(session)push(null);return state();}
 function undo(){if(session?.past.length){session.future.push(current());bound(session.future);assign(session.past.pop());}return state();}
 function redo(){if(session?.future.length){session.past.push(current());bound(session.past);assign(session.future.pop());}return state();}
 function cancel(){const had=!!session;session=null;return had;}
 function commit(){
  if(!session)throw Error('Die Netz-Flächenauswahl ist nicht geöffnet.');
  const next=copy(session.draft),changed=!same(next,committed);committed=next;const protections=copy(session.protections),protectionChanged=!same(protections,session.initialProtections);session=null;
  return {changed,selection:snapshot(),protections,protectionChanged};
 }
 function restore(value){committed=binding(value);session=null;return snapshot();}
 function sourceChanged(objectId,geometryDigest){
  const cleared=!!committed&&committed.objectId===objectId&&committed.geometryDigest!==geometryDigest;
  const canceled=!!session&&session.objectId===objectId&&session.geometryDigest!==geometryDigest;
  if(cleared)committed=null;if(canceled)session=null;
  return {cleared,canceled};
 }
 function setProtections(value){if(!session)throw Error('Keine aktive Netzauswahl.');push(session.draft,value);return state();}
 return {snapshot,state,begin,update,setProtections,clear,undo,redo,cancel,commit,restore,sourceChanged};
}
