const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const MAX_BYTES=1024*1024,ARCHIVES=4;
function redact(value,max=12000){
 return String(value??'').replace(/\b(?:sk-[A-Za-z0-9_-]{8,}|Bearer\s+[^\s"'<>]+)\b/gi,'[entfernt]')
  .replace(/((?:api[_-]?key|access[_-]?token|authorization|password|secret|token)\s*[=:]\s*["']?)[^\s,;"'}]+/gi,'$1[entfernt]')
  .replace(/\b[0-9a-f]{64}\b/gi,'[entfernt]')
  .replace(/(https?:\/\/[^\s?#"']+)\?[^\s"']*/gi,'$1?[entfernt]')
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').slice(0,max);
}
function createErrorLog({directory,version='unknown',maxBytes=MAX_BYTES,archives=ARCHIVES,now=()=>new Date()}={}){
 const file=path.join(path.resolve(directory),'formnaro-fehler.jsonl'),session=crypto.randomUUID();let lastError=null,lastKey=null,lastTime=0,lastMessage=null;
 function append(value={}){
  try{
   if(value.name==='AbortError'||value.code==='ABORTED')return {written:false,cancelled:true};
   const entry={time:now().toISOString(),version,session,source:redact(value.source||'application',80),name:redact(value.name||'Error',80),code:redact(value.code,80),message:redact(value.message,4000),stack:redact(value.stack)};
   for(const key of ['job','operation','action','phase'])if(typeof value[key]==='string')entry[key]=redact(value[key],160);
   for(const key of ['nodeCount','selectionCount','heapBytes','elapsedMs'])if(Number.isSafeInteger(value[key])&&value[key]>=0)entry[key]=value[key];
   const key=JSON.stringify([entry.source,entry.code,entry.message,entry.job,entry.operation,entry.phase]),time=Date.parse(entry.time);
   if(key===lastKey&&time-lastTime<2000)return {written:false,duplicate:true};
   const message=entry.message.replace(/^(?:Uncaught(?: \(in promise\))?\s+)?(?:\w*Error):\s*/,'');
   if(entry.source==='renderer-console'&&message===lastMessage&&time-lastTime<2000)return {written:false,duplicate:true};
   fs.mkdirSync(directory,{recursive:true});const bytes=Buffer.from(JSON.stringify(entry)+'\n');
   if(fs.existsSync(file)&&fs.statSync(file).size+bytes.length>maxBytes){
    for(let i=archives;i>=1;i--){const target=file+'.'+i;if(i===archives){if(fs.existsSync(target))fs.unlinkSync(target);}else if(fs.existsSync(target))fs.renameSync(target,file+'.'+(i+1));}
    fs.renameSync(file,file+'.1');
   }
   const fd=fs.openSync(file,'a');try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
   lastKey=key;lastTime=time;lastMessage=message;lastError=null;return {written:true};
  }catch{lastError='Das Fehlerprotokoll konnte nicht geschrieben werden.';return {written:false,error:lastError};}
 }
 return {append,status:()=>({directory:path.resolve(directory),file,maxBytes,archives,error:lastError})};
}
function installErrorLog(win,{directory,version,ipcMain=require('electron').ipcMain,shell=require('electron').shell,processEvents=process}={}){
 const log=createErrorLog({directory,version});
 ipcMain.handle('cad-log:write',(event,value)=>{
  if(event.sender!==win.webContents)return {ok:false,error:'Invalid window.'};
  if(!value||typeof value!=='object'||Array.isArray(value)||JSON.stringify(value).length>24000)return {ok:false,error:'Invalid log entry.'};
  return {ok:true,value:log.append(value)};
 });
 ipcMain.handle('cad-log:folder',async event=>{
  if(event.sender!==win.webContents)return {ok:false,error:'Invalid window.'};
  try{fs.mkdirSync(directory,{recursive:true});const error=await shell.openPath(path.resolve(directory));if(error)throw Error(error);return {ok:true,value:{opened:true,...log.status()}};}catch{return {ok:false,error:'Der Fehlerprotokollordner konnte nicht geöffnet werden.'};}
 });
 ipcMain.handle('cad-log:status',event=>event.sender===win.webContents?{ok:true,value:log.status()}:{ok:false,error:'Invalid window.'});
 const consoleError=details=>{if(details.level==='error')log.append({source:'renderer-console',message:details.message});};
 const rendererGone=(_event,details)=>log.append({source:'renderer-process',code:String(details.exitCode),message:details.reason});
 const loadFailed=(_event,code,description,_url,main)=>{if(main&&code!==-3)log.append({source:'page-load',code:String(code),message:description});};
 const fatal=error=>log.append({source:'main-process',name:error.name,code:error.code,message:error.message,stack:error.stack});
 win.webContents.on('console-message',consoleError);win.webContents.on('render-process-gone',rendererGone);win.webContents.on('did-fail-load',loadFailed);processEvents.on('uncaughtExceptionMonitor',fatal);
 win.on('closed',()=>{processEvents.removeListener('uncaughtExceptionMonitor',fatal);});
 return log;
}
module.exports={createErrorLog,installErrorLog,redact};
