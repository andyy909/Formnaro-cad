const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {writeAtomic}=require('./files.cjs');
const {createFnpackStore}=require('./fnpack-store.cjs');
const projectExtension=file=>['.ocad','.fnpack'].includes(path.extname(file).toLowerCase());
const MAX_BYTES=50*1024*1024,MAX_RECENT=20;
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const projectId=file=>digest(process.platform==='win32'?file.toLowerCase():file);
function projectDirectory(app,{verificationPath}={}){return verificationPath?path.join(path.dirname(verificationPath),'Projekte'):path.join(app.isPackaged?path.dirname(app.getPath('exe')):path.resolve(__dirname,'..'),'Projekte');}
function createProjectFiles({directory,cacheDirectory=path.join(path.dirname(directory),'Daten','Vorschaubilder'),win,dialog,shell,write=writeAtomic,onPackRead=()=>{}}={}){
  directory=path.resolve(directory);cacheDirectory=path.resolve(cacheDirectory);const index=path.join(directory,'.letzte-projekte.json'),allowed=new Map(),opened=new Map(),packs=createFnpackStore({recoveryFile:path.join(path.dirname(cacheDirectory),'Paket-Autosicherung.fnpack'),onRead:onPackRead});let active=false;
  async function recent(){try{if((await fs.stat(index)).size>65536)throw Error();const value=JSON.parse(await fs.readFile(index,'utf8'));if(value.version!==1||!Array.isArray(value.items)||value.items.length>MAX_RECENT||value.items.some(v=>typeof v.path!=='string'||!path.isAbsolute(v.path)||!Number.isFinite(v.usedAt)||!projectExtension(v.path)))throw Error();return value.items;}catch(e){if(e.code==='ENOENT')return [];throw Error('Die Liste der letzten Projekte konnte nicht gelesen werden.');}}
  async function remember(file){try{const items=(await recent()).filter(v=>projectId(v.path)!==projectId(file));items.unshift({path:file,usedAt:Date.now()});await write(index,Buffer.from(JSON.stringify({version:1,items:items.slice(0,MAX_RECENT)})));return null;}catch(e){return 'Projektdatei ist gespeichert/geöffnet; die Liste konnte nicht aktualisiert werden: '+e.message;}}
  function allow(file){file=path.resolve(file);const id=projectId(file);allowed.set(id,file);return id;}
  async function metadata(file,usedAt){const id=allow(file);let stat;try{stat=await fs.stat(file);}catch(e){if(e.code!=='ENOENT')throw e;}return {id,name:path.basename(file),path:file,exists:!!stat?.isFile(),modifiedAt:stat?.mtimeMs??null,previewStamp:stat?[stat.mtimeMs,stat.ctimeMs,stat.size].join('/'):null,...(usedAt===undefined?{}:{usedAt})};}
  async function list(){await fs.mkdir(directory,{recursive:true});const items=await recent(),last=await Promise.all(items.map(v=>metadata(v.path,v.usedAt)));const files=[];let count=0;const dir=await fs.opendir(directory);for await(const entry of dir){if(entry.isFile()&&projectExtension(entry.name)){if(++count>500)break;files.push(await metadata(path.join(directory,entry.name)));}}files.sort((a,b)=>b.modifiedAt-a.modifiedAt);return {directory,recent:last,files,truncated:count>500};}
  async function open(args={}){
    if(active)throw Error('Eine Projektauswahl ist bereits geöffnet.');active=true;
    try{await fs.mkdir(directory,{recursive:true});let file;
      if(args.id!==undefined){file=allowed.get(args.id);if(!file)throw Error('Projekt zuerst in der Übersicht auswählen.');}
      else{const result=await dialog.showOpenDialog(win,{title:'Projekt öffnen',defaultPath:directory,properties:['openFile'],filters:[{name:'Formnaro-Projekt',extensions:['ocad','fnpack']}]});if(result.canceled||!result.filePaths?.[0])return {opened:false};file=path.resolve(result.filePaths[0]);}
      if(!projectExtension(file))throw Error('Eine .ocad- oder .fnpack-Projektdatei auswählen.');if(path.extname(file).toLowerCase()==='.fnpack'){const result=await packs.open(file),id=allow(file);opened.set(id,{fnpack:result.fnpack.sourceId});const warning=await remember(file);return {opened:true,...result,file:await metadata(file),warning};}const handle=await fs.open(file,'r');let bytes;
      try{const stat=await handle.stat();if(!stat.isFile()||stat.size>MAX_BYTES)throw Error('Projektdatei ist größer als 50 MB oder keine Datei.');bytes=await handle.readFile();if(bytes.length>MAX_BYTES)throw Error('Projektdatei ist größer als 50 MB.');}finally{await handle.close();}
      const id=allow(file);opened.set(id,digest(bytes));const warning=await remember(file);return {opened:true,project:bytes.toString('utf8'),...(bytes[0]===0x1f&&bytes[1]===0x8b?{bytes:new Uint8Array(bytes)}:{}),file:await metadata(file),warning};
    }finally{active=false;}
  }
  async function save(args){
    if(args?.filename?.toLowerCase().endsWith('.fnpack'))return savePack(args);
    if(active)throw Error('Ein Projekt wird bereits gespeichert oder geöffnet.');active=true;
    try{
      if(!args||typeof args.filename!=='string'||args.filename.length>220||/[<>:"/\\|?*\x00-\x1f]/.test(args.filename)||path.extname(args.filename).toLowerCase()!=='.ocad'||!(args.bytes instanceof Uint8Array)||args.bytes.length>MAX_BYTES)throw Error('Ungültige Projektdaten.');
      await fs.mkdir(directory,{recursive:true});let file;
      if(args.id&&!args.saveAs){file=allowed.get(args.id);if(!file||!opened.has(args.id))throw Error('Das Projekt muss vor dem Speichern geöffnet werden.');const current=await fs.readFile(file);if(digest(current)!==opened.get(args.id))throw Error('Die Projektdatei wurde außerhalb von Formnaro geändert. Bitte „Speichern unter …“ verwenden.');}
      else{const previous=allowed.get(args.id),result=await dialog.showSaveDialog(win,{title:'Projekt speichern',defaultPath:previous??path.join(directory,args.filename),filters:[{name:'Formnaro-Projekt',extensions:['ocad']}]});if(result.canceled||!result.filePath)return {saved:false};file=path.resolve(result.filePath);if(path.extname(file).toLowerCase()!=='.ocad')file+='.ocad';}
      await write(file,args.bytes);const id=allow(file);opened.set(id,digest(args.bytes));const warning=await remember(file);return {saved:true,file:await metadata(file),warning};
    }finally{active=false;}
  }
  async function savePack(args){
    if(active)throw Error('Ein Projekt wird bereits gespeichert oder geöffnet.');active=true;
    try{if(typeof args.filename!=='string'||args.filename.length>220||/[<>:"/\\|?*\x00-\x1f]/.test(args.filename)||!args.project||!Array.isArray(args.blocks))throw Error('Ungültige Paketdaten.');await fs.mkdir(directory,{recursive:true});let file;
      if(args.id&&!args.saveAs){file=allowed.get(args.id);const previous=opened.get(args.id);if(!file||!previous?.fnpack||!await packs.unchanged(previous.fnpack,file))throw Error('Die Projektdatei wurde außerhalb von Formnaro geändert. Bitte „Speichern unter …“ verwenden.');}
      else{const previous=allowed.get(args.id),suggested=previous?path.join(path.dirname(previous),path.parse(previous).name+'.fnpack'):path.join(directory,args.filename),result=await dialog.showSaveDialog(win,{title:'Geometriepaket speichern',defaultPath:suggested,filters:[{name:'Formnaro-Geometriepaket',extensions:['fnpack']}]});if(result.canceled||!result.filePath)return {saved:false};file=path.resolve(result.filePath);if(path.extname(file).toLowerCase()!=='.fnpack')file+='.fnpack';}
      const result=await packs.save(file,args),id=allow(file);opened.set(id,{fnpack:result.fnpack.sourceId});const warning=await remember(file);return {saved:true,...result,file:await metadata(file),warning};
    }finally{active=false;}
  }
  async function folder(){await fs.mkdir(directory,{recursive:true});const error=await shell.openPath(directory);if(error)throw Error(error);return true;}
  async function previewInput(args){
    const file=allowed.get(args?.id);if(!file)throw Error('Projekt zuerst in der Übersicht auswählen.');
    if(path.extname(file).toLowerCase()==='.fnpack')return {unloaded:true,token:(await metadata(file)).previewStamp};
    const handle=await fs.open(file,'r');let bytes;
    try{const stat=await handle.stat();if(!stat.isFile()||stat.size>MAX_BYTES)throw Error('Ungültige Projektgröße.');bytes=await handle.readFile();if(bytes.length>MAX_BYTES)throw Error('Ungültige Projektgröße.');}finally{await handle.close();}
    return {bytes,token:digest(bytes)};
  }
  function png(data){
    if(typeof data!=='string'||data.length>350000||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(data))throw Error('Ungültiges Vorschaubild.');
    const bytes=Buffer.from(data.slice(22),'base64');
    if(bytes.length<33||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes.toString('ascii',12,16)!=='IHDR'||bytes.readUInt32BE(16)!==240||bytes.readUInt32BE(20)!==160)throw Error('Ungültiges Vorschaubild.');
    return data;
  }
  async function thumbnail(args){
    const input=await previewInput(args),file=path.join(cacheDirectory,args.id+'.json');if(input.unloaded)return {token:input.token,unloaded:true};
    try{if((await fs.stat(file)).size>350200)throw Error();const cached=JSON.parse(await fs.readFile(file,'utf8'));if(cached.version===1&&cached.token===input.token)return {token:input.token,image:png(cached.image)};}catch{/* Missing/stale/corrupt previews regenerate without changing projects. */}
    return {token:input.token,project:input.bytes.toString('utf8')};
  }
  async function cacheThumbnail(args){
    const image=png(args?.image),input=await previewInput(args);
    if(args.token!==input.token)return {cached:false};
    await fs.mkdir(cacheDirectory,{recursive:true});await write(path.join(cacheDirectory,args.id+'.json'),Buffer.from(JSON.stringify({version:1,token:input.token,image})));return {cached:true};
  }
  return {list,open,save,folder,thumbnail,cacheThumbnail,directory,readBlock:packs.readBlock,openPackRecovery:packs.openRecovery,savePackRecovery:packs.saveRecovery,close:packs.close,hasPackageSources:packs.used};
}
function installProjects(win,{directory,ipcMain,dialog,shell,onPackRead}={}){
  if(!ipcMain||!dialog||!shell){const electron=require('electron');ipcMain||=electron.ipcMain;dialog||=electron.dialog;shell||=electron.shell;}
  const store=createProjectFiles({directory,win,dialog,shell,onPackRead});win.on?.('closed',()=>{void store.close();});for(const name of ['list','open','save','folder','thumbnail','cacheThumbnail','readBlock','openPackRecovery','savePackRecovery'])ipcMain.handle('cad-project:'+name,async(event,args)=>{if(event.sender!==win.webContents)return {ok:false,error:'Invalid window.'};try{return {ok:true,value:await store[name](args)};}catch(e){return {ok:false,error:e.message};}});return store;
}
module.exports={projectDirectory,createProjectFiles,installProjects};
