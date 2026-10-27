const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const entries=require('./program-data.json');
const MARKER='profil.json',FORMAT={format:'Formnaro-Daten',version:1};
const WRITE_ERROR='Daten konnten nicht im Programmordner gespeichert werden. Bitte einen beschreibbaren Ordner verwenden.';
function dataDirectory(app,{root,verificationPath}={}){
  return verificationPath?path.join(path.dirname(verificationPath),'portable-data'):path.join(root||(app.isPackaged?path.dirname(app.getPath('exe')):path.resolve(__dirname,'..')),'Daten');
}
function writeAtomicSync(target,value){
  const temp=path.join(path.dirname(target),'.formnaro-'+crypto.randomUUID()+'.tmp');let fd;
  try{fd=fs.openSync(temp,'wx',0o600);fs.writeFileSync(fd,value);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;fs.renameSync(temp,target);}
  finally{if(fd!==undefined)fs.closeSync(fd);fs.rmSync(temp,{force:true});}
}
const revision=bytes=>bytes===null?'missing':crypto.createHash('sha256').update(bytes).digest('hex');
function cadOnlyForVersion(version){const match=String(version).match(/^(\d+)\.(\d+)(?:\.|-|\+|$)/);return !!match&&(Number(match[1])>0||Number(match[2])>=11);}
function createProgramStore(directory,{legacyAIFile,write=writeAtomicSync,cadOnly=false}={}){
  if(typeof cadOnly!=='boolean')throw Error('Ungültige Datenauswahl.');
  directory=path.resolve(directory);let initialized=false;
  const allowed=key=>Object.hasOwn(entries,key)&&(!cadOnly||!entries[key].legacyMesh);
  function marker(){
    try{const file=path.join(directory,MARKER);if(fs.statSync(file).size>1024)throw Error();const value=JSON.parse(fs.readFileSync(file,'utf8'));if(value.format!==FORMAT.format||value.version!==FORMAT.version)throw Error();}
    catch{throw Error('Der portable Datenordner ist beschädigt oder nicht kompatibel. Vorhandene Dateien wurden nicht verändert.');}
  }
  function read(key){
    if(!allowed(key))throw Error('Ungültiger Datenbefehl.');const spec=entries[key];let bytes;
    try{const file=path.join(directory,spec.file);if(fs.statSync(file).size>spec.limit)throw Error('Gespeicherte Daten sind zu groß.');bytes=fs.readFileSync(file);if(bytes.length>spec.limit)throw Error('Gespeicherte Daten sind zu groß.');}
    catch(e){if(e.code==='ENOENT')bytes=null;else throw Error('Portable Daten konnten nicht gelesen werden: '+e.message);}
    return {value:bytes?.toString('utf8')??null,revision:revision(bytes)};
  }
  function initialize(legacy={}){
    if(legacy?.format==='FormnaroProgramDataInitialization'){
      if(!legacy||typeof legacy!=='object'||Array.isArray(legacy)||Object.keys(legacy).length!==4||Object.keys(legacy).some(key=>!['format','version','cadOnly','values'].includes(key))||legacy.version!==1||legacy.cadOnly!==true||!legacy.values||typeof legacy.values!=='object'||Array.isArray(legacy.values))throw Error('Ungültige CAD-Datenübernahme.');
      // The new renderer can opt in while the package still has version 0.10.
      // The policy is one-way: later legacy requests cannot re-enable meshes.
      cadOnly=true;legacy=legacy.values;
    }
    let migrated=false;
    if(!fs.existsSync(directory)){
      if(!legacy||typeof legacy!=='object'||Array.isArray(legacy)||Object.keys(legacy).some(k=>!Object.hasOwn(entries,k)))throw Error('Ungültige Datenübernahme.');
      const keys=Object.keys(legacy).filter(allowed);
      if(keys.some(k=>typeof legacy[k]!=='string'||Buffer.byteLength(legacy[k])>entries[k].limit))throw Error('Ungültige Datenübernahme.');
      const stage=path.join(path.dirname(directory),'.formnaro-data-'+crypto.randomUUID());
      try{
        fs.mkdirSync(stage,{recursive:true});
        for(const key of keys)write(path.join(stage,entries[key].file),legacy[key]);
        if(legacyAIFile&&fs.existsSync(legacyAIFile)){
          if(fs.statSync(legacyAIFile).size>65536)throw Error('KI-Einstellungen sind zu groß.');
          write(path.join(stage,'ai-settings.json'),fs.readFileSync(legacyAIFile));
        }
        write(path.join(stage,MARKER),JSON.stringify(FORMAT,null,2)+'\n');
        // Commit the complete import; an existing portable folder always wins.
        try{fs.renameSync(stage,directory);migrated=keys.length>0;}
        catch(e){if(!fs.existsSync(directory))throw e;}
      }catch{throw Error(WRITE_ERROR);}
      finally{fs.rmSync(stage,{recursive:true,force:true});}
    }
    marker();const values={},revisions={};
    for(const key of Object.keys(entries)){if(!allowed(key))continue;const item=read(key);if(item.value!==null)values[key]=item.value;revisions[key]=item.revision;}
    initialized=true;return {values,revisions,directory,migrated,cadOnly};
  }
  function change(args){
    if(!initialized)throw Error('Portable Daten wurden noch nicht geladen.');marker();
    if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).length!==3||!allowed(args.key)||typeof args.revision!=='string'||(args.value!==null&&typeof args.value!=='string'))throw Error('Ungültiger Datenbefehl.');
    const {key,value}=args;if(value!==null&&Buffer.byteLength(value)>entries[key].limit)throw Error('Daten sind zu groß.');
    const previous=read(key);if(args.revision!==previous.revision)throw Error('Die portablen Daten wurden inzwischen geändert. Bitte die Anwendung neu starten.');
    // Compare after reading and checking CAS, so an unchanged local write can
    // never hide an external edit or bypass the profile/size checks.
    if(previous.value===value&&previous.revision===revision(value===null?null:Buffer.from(value)))return previous;
    try{if(value===null)fs.rmSync(path.join(directory,entries[key].file),{force:true});else write(path.join(directory,entries[key].file),value);}
    catch{throw Error(WRITE_ERROR);}
    return {value,revision:revision(value===null?null:Buffer.from(value))};
  }
  return {initialize,change,read,directory};
}
function installProgramStorage(win,{directory,legacyAIFile,ipcMain,shell,cadOnly=false}={}){
  const electron=(!ipcMain||!shell)?require('electron'):null;ipcMain||=electron.ipcMain;shell||=electron.shell;
  const store=createProgramStore(directory,{legacyAIFile,cadOnly});
  for(const [name,fn]of [['initialize',args=>store.initialize(args)],['change',args=>store.change(args)]])ipcMain.on('cad-data:'+name,(event,args)=>{
    if(event.sender!==win.webContents){event.returnValue={ok:false,error:'Invalid window.'};return;}
    // The renderer already owns the accepted value. Returning a multi-MB
    // autosave again would synchronously encode/copy it back over Electron IPC.
    try{const saved=fn(args);event.returnValue={ok:true,value:name==='change'?{revision:saved.revision}:saved};}catch(e){event.returnValue={ok:false,error:e.message};}
  });
  ipcMain.handle('cad-data:folder',async event=>{
    if(event.sender!==win.webContents)return {ok:false,error:'Invalid window.'};
    try{const error=await shell.openPath(store.directory);if(error)throw Error(error);return {ok:true,value:true};}catch(e){return {ok:false,error:e.message};}
  });
  return store;
}
module.exports={dataDirectory,createProgramStore,installProgramStorage,writeAtomicSync,cadOnlyForVersion};
