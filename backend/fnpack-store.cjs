const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {openFnpack,writeFnpack,geometryReferences}=require('./fnpack.cjs');
const stamp=stat=>[stat.dev,stat.ino,stat.size,stat.mtimeMs,stat.ctimeMs].join('/');
/** Window-owned capabilities. No paths or capabilities enter the file index. */
function createFnpackStore({recoveryFile,sourceDirectory=path.join(path.dirname(recoveryFile),'Paketquellen'),onRead=()=>{}}={}){
 const sources=new Map(),backups=[];let recoveryChecked=false,recoveryBlocked=false,queue=Promise.resolve(),closing=null,used=false;
 const serial=fn=>{if(closing)throw Error('Paketzugriffe sind beendet.');const result=queue.then(fn);queue=result.catch(()=>{});return result;};
 async function preserve(file){
  const matching=[...sources.values()].filter(r=>r.reader.sourcePath()===path.resolve(file));if(!matching.length)return;
  await fs.mkdir(sourceDirectory,{recursive:true});const backup=path.join(sourceDirectory,'source-'+crypto.randomUUID()+'.fnpack'),before=await fs.stat(file);await fs.copyFile(file,backup,require('node:fs').constants.COPYFILE_EXCL);backups.push(backup);if(stamp(before)!==stamp(await fs.stat(file)))throw Error('Geometriepaket wurde während des Speicherns geändert.');
  for(const record of matching)record.reader.retarget(backup);
 }
 async function open(file,{withinWrite=false}={}){
  if(closing&&!withinWrite)throw Error('Paketzugriffe sind beendet.');const before=await fs.stat(file),reader=await openFnpack(file,{onRead}),after=await fs.stat(file);if(stamp(before)!==stamp(after)||closing&&!withinWrite){await reader.close();throw Error('Geometriepaket wurde während des Öffnens geändert oder geschlossen.');}
  const current=new Map(reader.index.blocks.map(b=>[b.sha256,b])),reusable=[...sources].reverse().find(([,record])=>path.resolve(record.file)===path.resolve(file)&&record.reader.index.blocks.every(b=>current.get(b.sha256)?.bytes===b.bytes&&current.get(b.sha256)?.kind===b.kind));
  if(!reusable&&sources.size>=128){await reader.close();throw Error('Höchstens 128 verschiedene Paketquellen je Sitzung. Projekt speichern und Anwendung neu öffnen.');}
  const sourceId=reusable?.[0]??crypto.randomUUID(),previous=reusable?.[1].reader,previousPath=previous?.sourcePath();sources.set(sourceId,{reader,file,stamp:stamp(after)});used=true;
  if(previous){await previous.close();if(backups.includes(previousPath)&&![...sources.values()].some(r=>r.reader.sourcePath()===previousPath)){await fs.rm(previousPath,{force:true});backups.splice(backups.indexOf(previousPath),1);}}
  return {project:structuredClone(reader.index.project),fnpack:{sourceId,blocks:reader.index.blocks.map(({sha256,kind,bytes})=>({sha256,kind,bytes})),identity:reader.identity}};
 }
 function source(ids=[]){
  if(!Array.isArray(ids)||ids.length>128||new Set(ids).size!==ids.length)throw Error('Ungültige Paketquellen.');
  const readers=ids.map(id=>{const record=sources.get(id);if(!record)throw Error('Geöffnetes Geometriepaket fehlt.');return record.reader;}),blocks=new Map(),owners=new Map();
  for(const reader of readers)for(const block of reader.index.blocks){const old=blocks.get(block.sha256);if(old&&(old.kind!==block.kind||old.bytes!==block.bytes))throw Error('Widersprüchliche Paketquellen.');blocks.set(block.sha256,block);owners.set(block.sha256,reader);}
  return {index:{blocks:[...blocks.values()]},copy:async(hash,target,options)=>{const reader=owners.get(hash);if(!reader)throw Error('Erforderlicher Geometrieblock fehlt.');return reader.copy(hash,target,options);}};
 }
 async function save(file,args){
  if(!args||!Array.isArray(args.blocks)||args.blocks.length>20000)throw Error('Ungültige Paketdaten.');
  return serial(async()=>{const refs=geometryReferences(args.project),reuse=[...sources.values()].some(record=>path.resolve(record.file)===path.resolve(file)&&record.reader.index.blocks.every(b=>refs.get(b.sha256)?.bytes===b.bytes&&refs.get(b.sha256)?.kind===b.kind));if(!reuse&&sources.size>=128)throw Error('Höchstens 128 verschiedene Paketquellen je Sitzung. Projekt als vollständige .ocad-Datei speichern und Anwendung neu öffnen.');await preserve(file);await writeFnpack(file,{project:args.project,blocks:args.blocks,source:source(args.sourceIds),signal:args.signal});return open(file,{withinWrite:true});});
 }
 async function readBlock(args){const record=sources.get(args?.sourceId);if(!record||typeof args.sha256!=='string'||!/^[a-f0-9]{64}$/.test(args.sha256))throw Error('Geöffneten Geometrieblock auswählen.');return serial(async()=>new Uint8Array(await record.reader.read(args.sha256)));}
 async function unchanged(sourceId,file){const record=sources.get(sourceId);return !!record&&path.resolve(record.file)===path.resolve(file)&&record.stamp===stamp(await fs.stat(file));}
 async function openRecovery(){
  if(!recoveryFile)throw Error('Paket-Autosicherung ist nicht eingerichtet.');try{const result=await open(recoveryFile);recoveryChecked=true;return {opened:true,...result};}catch(error){if(error.code==='ENOENT'){recoveryChecked=true;return {opened:false};}recoveryBlocked=true;throw error;}
 }
 async function saveRecovery(args){
  if(!recoveryFile)throw Error('Paket-Autosicherung ist nicht eingerichtet.');if(recoveryBlocked)return {saved:false};
  if(!recoveryChecked){const checked=await openRecovery();if(checked.fnpack){const entry=sources.get(checked.fnpack.sourceId);sources.delete(checked.fnpack.sourceId);await entry.reader.close();}}
  return serial(async()=>{await fs.mkdir(path.dirname(recoveryFile),{recursive:true});await preserve(recoveryFile);await writeFnpack(recoveryFile,{project:args.project,blocks:args.blocks,source:source(args.sourceIds),signal:args.signal});return {saved:true};});
 }
 function close(){return closing??=(async()=>{await queue;const records=[...sources.values()];sources.clear();await Promise.all(records.map(r=>r.reader.close()));for(const backup of backups){if(path.dirname(backup)!==path.resolve(sourceDirectory)||!/^source-[a-f0-9-]+\.fnpack$/.test(path.basename(backup)))throw Error('Ungültiger privater Quellpfad.');await fs.rm(backup,{force:true});}})();}
 return {open,save,readBlock,unchanged,openRecovery,saveRecovery,close,sourceCount:()=>sources.size,used:()=>used};
}
module.exports={createFnpackStore};
