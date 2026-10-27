import {cadPoint} from './cad-affine.js';
import {flags} from './organization.js';

export function validateCadLoadSet(value){
 if(value===null)return null;
 if(!Array.isArray(value)||value.length>500||new Set(value).size!==value.length||value.some(id=>typeof id!=='string'||!id||id.length>200))throw Error('Ungültiges Ladeset der Baugruppenanzeige.');
 return [...value];
}

/** Workspace preference only. Visibility and the confirmed geometry are never
 * mutated, and a missing part cannot become loaded through an ID collision. */
export function createCadAssemblyDisplay(){
 let loaded=null,generation=0;const meshBounds=new WeakMap();
 const rootIds=project=>new Set(project.nodes.map(n=>n.id));
 function restore(value,project){const input=validateCadLoadSet(value),roots=rootIds(project);loaded=input===null?null:new Set(input.filter(id=>roots.has(id)));generation++;return state(project);}
 function ids(project){if(loaded===null)return null;return project.nodes.filter(n=>loaded.has(n.id)).map(n=>n.id);}
 function choose(values,project){const roots=rootIds(project),selected=validateCadLoadSet(values);if(!selected?.length||selected.some(id=>!roots.has(id)))throw Error('Mindestens ein vorhandenes fertiges Teil auswählen.');return selected;}
 function only(values,project){return restore(choose(values,project),project);}
 function load(values,project){const selected=choose(values,project);if(loaded!==null){for(const id of selected)loaded.add(id);generation++;}return state(project);}
 function sync(project){if(loaded!==null){const roots=rootIds(project);for(const id of loaded)if(!roots.has(id)){loaded.delete(id);generation++;}}return state(project);}
 function state(project){return {generation,loadSet:ids(project),total:project.nodes.length,loaded:loaded===null?project.nodes.length:ids(project).length};}
 function localBounds(node){
  if(node.stats?.bounds)return node.stats.bounds;
  if(node.mesh?.format==='Formnaro-GeometryRef')return node.mesh.bounds;
  const mesh=node.mesh;if(!mesh)return null;
  let bounds=meshBounds.get(mesh);if(!bounds){if(!mesh.verts?.length)return null;const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<mesh.verts.length;i++){const k=i%3;min[k]=Math.min(min[k],mesh.verts[i]);max[k]=Math.max(max[k],mesh.verts[i]);}bounds={min,max};meshBounds.set(mesh,bounds);}return bounds;
 }
 function boxes(project){if(loaded===null)return [];return project.nodes.filter(n=>!loaded.has(n.id)&&!flags(n,project).hidden&&!n.suppressed).flatMap(node=>{const local=localBounds(node);if(!local)return [];const points=Array.from({length:8},(_,i)=>cadPoint(node.transform,[0,1,2].map(k=>i&(1<<k)?local.max[k]:local.min[k]))),min=[0,1,2].map(k=>Math.min(...points.map(p=>p[k]))),max=[0,1,2].map(k=>Math.max(...points.map(p=>p[k])));return [{rootId:node.id,name:node.name,kind:node.kind,locked:flags(node,project).locked,bounds:{min,max}}];});}
 function displayIds(project,confirmed=project){
  if(loaded===null)return null;const existing=rootIds(confirmed);
  // New preview results must be visible before their explicit Apply. Existing
  // omitted roots keep their boxes until the user requests loading them.
  return project.nodes.filter(n=>(loaded.has(n.id)||!existing.has(n.id))&&!flags(n,project).hidden&&!n.suppressed).map(n=>n.id);
 }
 return {ids,state,restore,only,load,sync,all:project=>restore(project.nodes.map(n=>n.id),project),boxes,displayIds,isLoaded:id=>loaded===null||loaded.has(id)};
}
