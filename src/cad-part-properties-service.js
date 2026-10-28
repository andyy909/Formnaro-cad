import {flags} from './organization.js';
import {partSurfaceDigest,partSurfaceState,summarizeParts} from './cad-part-properties.js';
/** Bounded cache belongs to this live controller/engine session. Full geometry,
 * placement, material settings and algorithm version participate in identity. */
export function createPartPropertiesService(controller){
 const cache=new Map();let hits=0,misses=0;
 async function measure({ids=null}={}){
  if(ids!==null&&(!Array.isArray(ids)||!ids.length||ids.length>500||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!controller.readSnapshot().nodes.some(n=>n.id===id))))throw Error('Gültige vollständige Teilkennungen wählen.');
  const revision=controller.revision(),source=await controller.materialize(ids),selected=ids&&new Set(ids),rows=[];
  if(controller.revision()!==revision)throw Error('Projekt während der Teileprüfung geändert.');
  for(const node of source.nodes){if(selected&&!selected.has(node.id)||flags(node,source).hidden||node.suppressed||node.kind==='referenceMesh'||node.kind==='cad'&&!node.solid||node.kind==='mesh'&&node.meshRole==='hole')continue;
   const material=node.metadata?.partProperties?.material,row={id:node.id,name:node.name,kind:node.kind,material:material?.name??null,densityGcm3:material?.densityGcm3??null,volumeMm3:null,massG:null,centerMm:null,status:'Nicht geprüft',surfaceGroups:partSurfaceState(node)};
   try{
    const key=JSON.stringify(['part-properties-v1',node.kind,partSurfaceDigest(node),node.transform,node.metadata?.partProperties??null]);let value=cache.get(key);
    if(value){hits++;cache.delete(key);cache.set(key,value);}else{misses++;value=node.kind==='cad'?await controller.query('partProperties',{id:node.id}):await controller.meshQuery('toolsQuery',{kind:'partProperties',id:node.id});if(controller.revision()!==revision)throw Error('Projekt während der Teileprüfung geändert.');cache.set(key,structuredClone(value));while(cache.size>64)cache.delete(cache.keys().next().value);}
    Object.assign(row,value);row.massG=row.densityGcm3===null?null:row.volumeMm3*row.densityGcm3/1000;row.status=row.massG===null?'Volumen/Schwerpunkt geprüft; Dichte fehlt':'Geprüft';
   }catch(error){if(controller.revision()!==revision)throw error;row.status=error.message;}
   rows.push(row);
  }
  if(controller.revision()!==revision)throw Error('Projekt während der Teileprüfung geändert.');return {...summarizeParts(rows),revision};
 }
 return {measure,state:()=>({entries:cache.size,hits,misses,engineScope:'this controller session',version:1}),clear:()=>cache.clear()};
}
