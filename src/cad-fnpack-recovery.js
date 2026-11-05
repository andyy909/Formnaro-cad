import {cadProjectSnapshot} from './cad-project.js';
import {hasGeometryRefs} from './cad-geometry-ref.js';
export const PACK_RECOVERY_KIND='offlinecad-recovery-kind';
export function createFnpackRecovery({desktop,storage,files,legacy,getProject,preferPack=()=>false}={}){
 let blocked=false,writing=false,latest=null;
 const packageMode=()=>preferPack()||hasGeometryRefs(getProject());
 async function load(verify){
  try{storage.checkReadable?.(PACK_RECOVERY_KIND);}catch(error){blocked=true;throw error;}
  if(storage.getItem(PACK_RECOVERY_KIND)!=='fnpack')return legacy.load(verify);
  try{const result=await desktop?.openPackRecovery?.();if(!result?.opened)throw Error('Die Paket-Autosicherung fehlt.');files.register(result.fnpack);return await verify(result.project);}catch(error){blocked=true;throw error;}
 }
 async function save({format,data,options}){
  if(blocked)return false;
  const prepared=options?.prepare?await options.prepare(format,data):undefined;
  let saved;
  if(format==='fnpack'){
   if(!desktop?.savePackRecovery)throw Error('Geometriepakete benötigen die lokale Paket-Autosicherung.');
   const payload=options?.prepare?files.completeEncoding(prepared):files.encode(typeof data==='string'?JSON.parse(data):data);
   try{
    saved=(await desktop.savePackRecovery(payload)).saved;
    if(!saved)blocked=true;
   }catch(error){blocked=true;throw error;}
  }else saved=await legacy.write(options?.prepare?prepared:data,options);
  if(saved&&storage.getItem(PACK_RECOVERY_KIND)!==format)storage.setItem(PACK_RECOVERY_KIND,format);
  return !!saved;
 }
 async function drain(){
  writing=true;
  try{
   while(latest){
    const job=latest;
    latest=null;
    try{job.resolve(await save(job));}catch(error){job.reject(error);}
   }
  }finally{writing=false;}
 }
 function write(encoded,options){
  if(blocked)return false;
  const format=packageMode()?'fnpack':'ocad';
  const data=!options?.prepare&&format==='fnpack'&&typeof encoded!=='string'?cadProjectSnapshot(encoded):encoded;
  return new Promise((resolve,reject)=>{
   latest?.resolve(false);
   latest={format,data,options,resolve,reject};
   if(!writing)void drain();
  });
 }
 return {load,write,blocked:()=>blocked||legacy.blocked(),isWriting:()=>!!writing,packageMode};
}
