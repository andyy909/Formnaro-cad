import {cadProjectSnapshot} from './cad-project.js';
import {hasGeometryRefs} from './cad-geometry-ref.js';
export const PACK_RECOVERY_KIND='offlinecad-recovery-kind';
/** Package autosaves are independent files, not dangling catalogue pointers.
 * Ordinary projects retain the existing synchronous recovery contract. */
export function createFnpackRecovery({desktop,storage,files,legacy,getProject,preferPack=()=>false}={}){
 let blocked=false,writing=null;
 const packageMode=()=>preferPack()||hasGeometryRefs(getProject());
 async function load(verify){
  try{storage.checkReadable?.(PACK_RECOVERY_KIND);}catch(error){blocked=true;throw error;}
  if(storage.getItem(PACK_RECOVERY_KIND)!=='fnpack')return legacy.load(verify);
  try{const result=await desktop?.openPackRecovery?.();if(!result?.opened)throw Error('Die Paket-Autosicherung fehlt.');files.register(result.fnpack);return await verify(result.project);}catch(error){blocked=true;throw error;}
 }
 function write(encoded,options){
  if(blocked)return false;
  if(!packageMode()){const result=legacy.write(encoded,options);if(result&&storage.getItem(PACK_RECOVERY_KIND)!=='ocad')storage.setItem(PACK_RECOVERY_KIND,'ocad');return result;}
  if(!desktop?.savePackRecovery)throw Error('Geometriepakete benötigen die lokale Paket-Autosicherung.');
  // Capture before queueing: large models need no oversized JSON intermediate.
  const captured=typeof encoded==='string'?JSON.parse(encoded):cadProjectSnapshot(encoded);
  const save=async()=>{const data=files.encode(captured);try{const result=await desktop.savePackRecovery(data);if(!result.saved){blocked=true;return false;}if(storage.getItem(PACK_RECOVERY_KIND)!=='fnpack')storage.setItem(PACK_RECOVERY_KIND,'fnpack');return true;}catch(error){blocked=true;throw error;}};
  const pending=writing?writing.then(save):save();writing=pending;pending.finally(()=>{if(writing===pending)writing=null;}).catch(()=>{});return pending;
 }
 return {load,write,blocked:()=>blocked||legacy.blocked(),isWriting:()=>!!writing,packageMode};
}
