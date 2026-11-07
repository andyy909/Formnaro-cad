const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {openFnpack,writeFnpack,geometryReferences,combineFnpackSources,fnpackStamp:stamp,fnpackPathStamp}=require('./fnpack.cjs');
const {runStorageWorker}=require('./run-storage-worker.cjs');
/** Window-owned capabilities. No paths or capabilities enter the file index. */
function createFnpackStore({recoveryFile,sourceDirectory=path.join(path.dirname(recoveryFile),'Paketquellen'),onRead=()=>{}}={}){
 const sources=new Map(),backups=[];let recoveryStamp,recoveryBlocked=false,queue=Promise.resolve(),closing=null,used=false;
 const serial=fn=>{if(closing)throw Error('Paketzugriffe sind beendet.');const result=queue.then(fn);queue=result.catch(()=>{});return result;};
 async function preserve(file,expected){
  const matching=[...sources.values()].filter(r=>r.reader.sourcePath()===path.resolve(file));if(!matching.length)return;
  await fs.mkdir(sourceDirectory,{recursive:true});const backup=path.join(sourceDirectory,'source-'+crypto.randomUUID()+'.fnpack'),before=stamp(await fs.stat(file));
  if(expected!==undefined&&before!==expected)throw Error('Paket-Autosicherung wurde inzwischen geändert.');
  await fs.copyFile(file,backup,require('node:fs').constants.COPYFILE_EXCL);backups.push(backup);if(before!==stamp(await fs.stat(file)))throw Error('Geometriepaket wurde während des Speicherns geändert.');
  for(const record of matching)record.reader.retarget(backup);
 }
 async function openInternal(file){
  const before=await fs.stat(file),reader=await openFnpack(file,{onRead});let after;try{after=await fs.stat(file);if(stamp(before)!==stamp(after))throw Error('Geometriepaket wurde während des Öffnens geändert.');}catch(error){await reader.close();throw error;}
  const current=new Map(reader.index.blocks.map(b=>[b.sha256,b])),reusable=[...sources].reverse().find(([,record])=>path.resolve(record.file)===path.resolve(file)&&record.reader.index.blocks.every(b=>current.get(b.sha256)?.bytes===b.bytes&&current.get(b.sha256)?.kind===b.kind));
  if(!reusable&&sources.size>=128){await reader.close();throw Error('Höchstens 128 verschiedene Paketquellen je Sitzung. Projekt speichern und Anwendung neu öffnen.');}
  const sourceId=reusable?.[0]??crypto.randomUUID(),previous=reusable?.[1].reader,previousPath=previous?.sourcePath();sources.set(sourceId,{reader,file,stamp:stamp(after)});used=true;
  if(previous){await previous.close();if(backups.includes(previousPath)&&![...sources.values()].some(r=>r.reader.sourcePath()===previousPath)){await fs.rm(previousPath,{force:true});backups.splice(backups.indexOf(previousPath),1);}}
  return {project:structuredClone(reader.index.project),fnpack:{sourceId,blocks:reader.index.blocks.map(({sha256,kind,bytes})=>({sha256,kind,bytes})),identity:reader.identity}};
 }
 function sourceReaders(ids=[]){
  if(!Array.isArray(ids)||ids.length>128||new Set(ids).size!==ids.length)throw Error('Ungültige Paketquellen.');
  return ids.map(id=>{const record=sources.get(id);if(!record)throw Error('Geöffnetes Geometriepaket fehlt.');return record.reader;});
 }
 const source=ids=>combineFnpackSources(sourceReaders(ids));
 async function save(file,args){
  if(!args||!Array.isArray(args.blocks)||args.blocks.length>20000)throw Error('Ungültige Paketdaten.');
  return serial(async()=>{const refs=geometryReferences(args.project),reuse=[...sources.values()].some(record=>path.resolve(record.file)===path.resolve(file)&&record.reader.index.blocks.every(b=>refs.get(b.sha256)?.bytes===b.bytes&&refs.get(b.sha256)?.kind===b.kind));if(!reuse&&sources.size>=128)throw Error('Höchstens 128 verschiedene Paketquellen je Sitzung. Projekt als vollständige .ocad-Datei speichern und Anwendung neu öffnen.');await preserve(file);await writeFnpack(file,{project:args.project,blocks:args.blocks,source:source(args.sourceIds),signal:args.signal,createOnly:args.createOnly===true,shouldCommit:args.shouldCommit});return openInternal(file);});
 }
 async function readBlock(args){if(typeof args?.sha256!=='string'||!/^[a-f0-9]{64}$/.test(args.sha256))throw Error('Geöffneten Geometrieblock auswählen.');return serial(async()=>{const record=sources.get(args.sourceId);if(!record)throw Error('Geöffneten Geometrieblock auswählen.');return new Uint8Array(await record.reader.read(args.sha256));});}
 async function unchanged(sourceId,file){const record=sources.get(sourceId);return !!record&&path.resolve(record.file)===path.resolve(file)&&record.stamp===stamp(await fs.stat(file));}
 async function openRecoveryInternal(){
  if(!recoveryFile)throw Error('Paket-Autosicherung ist nicht eingerichtet.');try{const result=await openInternal(recoveryFile);recoveryStamp=sources.get(result.fnpack.sourceId).stamp;return {opened:true,...result};}catch(error){if(error.code==='ENOENT'){recoveryStamp='missing';return {opened:false};}recoveryBlocked=true;throw error;}
 }
 async function saveRecovery(args){
  return serial(async()=>{
   if(!recoveryFile)throw Error('Paket-Autosicherung ist nicht eingerichtet.');if(recoveryBlocked)return {saved:false};
   if(recoveryStamp===undefined){const checked=await openRecoveryInternal();if(checked.fnpack){const entry=sources.get(checked.fnpack.sourceId);sources.delete(checked.fnpack.sourceId);await entry.reader.close();}}
   await fs.mkdir(path.dirname(recoveryFile),{recursive:true});
   if(await fnpackPathStamp(recoveryFile)!==recoveryStamp)throw Error('Paket-Autosicherung wurde inzwischen geändert.');
   await preserve(recoveryFile,recoveryStamp);
   const sources=sourceReaders(args.sourceIds).map(reader=>({file:reader.sourcePath(),identity:reader.identity,blocks:reader.index.blocks}));
   const result=await runStorageWorker({kind:'fnpack',file:recoveryFile,sources,expected:recoveryStamp,args:{project:args.project,blocks:args.blocks}},{signal:args.signal});
   recoveryStamp=result.stamp;
   return {saved:true};
  });
 }
 function close(){return closing??=(async()=>{await queue;const records=[...sources.values()];sources.clear();await Promise.all(records.map(r=>r.reader.close()));for(const backup of backups){if(path.dirname(backup)!==path.resolve(sourceDirectory)||!/^source-[a-f0-9-]+\.fnpack$/.test(path.basename(backup)))throw Error('Ungültiger privater Quellpfad.');await fs.rm(backup,{force:true});}})();}
 return {open:file=>serial(()=>openInternal(file)),save,readBlock,unchanged,openRecovery:()=>serial(openRecoveryInternal),saveRecovery,close,sourceCount:()=>sources.size,used:()=>used};
}
module.exports={createFnpackStore};
