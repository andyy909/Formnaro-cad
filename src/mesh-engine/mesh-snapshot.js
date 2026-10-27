// Undo owns independent editable fields; validated frozen geometry can be shared.
// Public/export snapshots still use structuredClone and remain fully independent.
import {immutableMesh} from './render-data.js';
export function cloneHistoryNodes(nodes){
  function copy(node){
    const fields={...node};
    if(Object.hasOwn(node,'mesh'))fields.mesh=null;
    if(Object.hasOwn(node,'children'))fields.children=null;
    const result=structuredClone(fields);
    if(Object.hasOwn(node,'mesh'))result.mesh=immutableMesh(node.mesh)?node.mesh:structuredClone(node.mesh);
    if(Object.hasOwn(node,'children'))result.children=Array.isArray(node.children)?node.children.map(copy):structuredClone(node.children);
    return result;
  }
  return nodes.map(copy);
}
