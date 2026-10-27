const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
async function writeAtomic(target,bytes,{shouldCommit=()=>true,rename=fs.rename,platform=process.platform,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 const temporary=path.join(path.dirname(target),'.formnaro-'+crypto.randomUUID()+'.tmp');let file;
 try{
  file=await fs.open(temporary,'wx');await file.writeFile(bytes);await file.sync();await file.close();file=null;
  // Windows readers can briefly deny replacement. Keep the original intact
  // and retry only the atomic rename; never delete it to make a write succeed.
  const delays=[10,20,40,80,160];
  for(let attempt=0;;attempt++){
   if(!await shouldCommit())throw Object.assign(Error('Dateiausgabe abgebrochen oder Zieldatei inzwischen geändert.'),{code:'ABORTED'});
   try{await rename(temporary,target);break;}
   catch(error){if(platform!=='win32'||!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt>=delays.length)throw error;await wait(delays[attempt]);}
  }
 }finally{await file?.close().catch(()=>{});await fs.rm(temporary,{force:true}).catch(()=>{});}
}
function installFiles(win,{ipcMain,dialog,sequenceFile}=require('electron')){
  let saving=false,loaded=false,activeSave=null;const series=new Map();
  async function loadSeries(){
    if(loaded)return;loaded=true;if(!sequenceFile)return;
    try{const rows=JSON.parse(await fs.readFile(sequenceFile,'utf8'));if(!Array.isArray(rows)||rows.length>200)return;
      for(const row of rows)if(row&&typeof row.key==='string'&&typeof row.directory==='string'&&path.isAbsolute(row.directory)&&typeof row.base==='string'&&row.base&&typeof row.extension==='string'&&!/[<>:"/\\|?*\x00-\x1f]/.test(row.base+row.extension)&&Number.isSafeInteger(row.next)&&row.next>=2)series.set(row.key,row);
    }catch{/* A missing or damaged preference never prevents an export. */}
  }
  async function suggestedName(filename){
    const row=series.get(filename.toLowerCase());if(!row)return {filename};
    let next=row.next;const names=new Set((await fs.readdir(row.directory).catch(()=>[])).map(name=>name.toLowerCase()));
    while(names.has((row.base+next+row.extension).toLowerCase()))next++;
    return {filename:path.join(row.directory,row.base+next+row.extension),row,next};
  }
  async function remember(filename,filePath,suggestion){
    const key=filename.toLowerCase(),actual=path.parse(filePath),same=suggestion.row&&path.resolve(filePath).toLowerCase()===path.resolve(suggestion.filename).toLowerCase();
    series.delete(key);series.set(key,{key,directory:actual.dir,base:same?suggestion.row.base:actual.name,extension:actual.ext,next:same?suggestion.next+1:2});
    while(series.size>200)series.delete(series.keys().next().value);
    if(sequenceFile)try{await fs.mkdir(path.dirname(sequenceFile),{recursive:true});await writeAtomic(sequenceFile,Buffer.from(JSON.stringify([...series.values()])));}catch{/* The model was saved; retain numbering in memory if preferences are unwritable. */}
  }
  ipcMain.handle('cad-file:cancel',async(event,args)=>{
    if(event.sender!==win.webContents)return {ok:false,error:'Invalid window.'};
    if(!args||typeof args.operationId!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(args.operationId))return {ok:false,error:'Ungültige Ausgabekennung.'};
    const canceled=!!activeSave&&activeSave.id===args.operationId;if(canceled)activeSave.canceled=true;return {ok:true,value:{canceled}};
  });
  ipcMain.handle('cad-file:save',async(event,args)=>{
    if(event.sender!==win.webContents)throw Error('Invalid window.');
    if(saving)return {ok:false,error:'Eine Dateiauswahl ist bereits geöffnet.'};
    try{
      if(!args||typeof args.filename!=='string'||args.filename.length>220||/[<>:"/\\|?*\x00-\x1f]/.test(args.filename)||args.numbered!==undefined&&typeof args.numbered!=='boolean'||args.operationId!==undefined&&(typeof args.operationId!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(args.operationId))||!(args.bytes instanceof Uint8Array)||args.bytes.length>400*1024*1024)throw Error('Ungültige Dateidaten.');
      saving=true;activeSave={id:args.operationId,canceled:false};if(args.numbered)await loadSeries();const suggestion=args.numbered?await suggestedName(args.filename):{filename:args.filename};
      const result=await dialog.showSaveDialog(win,{title:'Datei speichern',defaultPath:suggestion.filename,filters:[{name:'Formnaro-Datei',extensions:[args.filename.split('.').at(-1)]}]});
      if(result.canceled||!result.filePath||activeSave.canceled||win.isDestroyed?.())return {ok:true,value:{saved:false,...(args.operationId?{canceled:true}:{})}};
      await writeAtomic(result.filePath,args.bytes,{shouldCommit:()=>!activeSave.canceled&&!win.isDestroyed?.()});if(args.numbered)await remember(args.filename,path.resolve(result.filePath),suggestion);return {ok:true,value:{saved:true}};
    }catch(e){return e.code==='ABORTED'?{ok:true,value:{saved:false,canceled:true}}:{ok:false,error:'Datei nicht gespeichert: '+e.message};}finally{saving=false;activeSave=null;}
  });
}
module.exports={installFiles,writeAtomic};
