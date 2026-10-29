const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const entries=require('./program-data.json');
const MARKER='profil.json',FORMAT={format:'Formnaro-Daten',version:1};
const WRITE_ERROR='Daten konnten nicht im Programmordner gespeichert werden. Bitte einen beschreibbaren Ordner verwenden.';
function dataDirectory(app,{root,verificationPath}={}){
  return verificationPath?path.join(path.dirname(verificationPath),'portable-data'):path.join(root||(app.isPackaged?path.dirname(app.getPath('exe')):path.resolve(__dirname,'..')),'Daten');
}
// Settings, credentials and libraries need the same Windows file-lock handling
// as durable tasks. Only the final atomic rename retries; old data stays intact.
function writeAtomicSync(target,value,options){return require('./ai-task-atomic.cjs').writeTaskAtomicSync(target,value,options);}
const revision=bytes=>bytes===null?'missing':crypto.createHash('sha256').update(bytes).digest('hex');
function cadOnlyForVersion(version){const match=String(version).match(/^(\d+)\.(\d+)(?:\.|-|\+|$)/);return !!match&&(Number(match[1])>0||Number(match[2])>=11);}
function createProgramStore(directory,{legacyAIFile,write=writeAtomicSync,cadOnly=false}={}){
  if(typeof cadOnly!=='boolean')throw Error('Ungültige Datenauswahl.');
  directory=path.resolve(directory);let initialized=false;const unavailable={};
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
    if(!fs.existsSync(path.join(directory,MARKER))){
      if(!legacy||typeof legacy!=='object'||Array.isArray(legacy)||Object.keys(legacy).some(k=>!Object.hasOwn(entries,k)))throw Error('Ungültige Datenübernahme.');
      const keys=Object.keys(legacy).filter(allowed);
      if(keys.some(k=>typeof legacy[k]!=='string'||Buffer.byteLength(legacy[k])>entries[k].limit))throw Error('Ungültige Datenübernahme.');
      const stage=path.join(path.dirname(directory),'.formnaro-data-'+crypto.randomUUID());
      try{
        fs.mkdirSync(stage,{recursive:true});
        for(const key of keys)write(path.join(stage,entries[key].file),legacy[key]);
        if(legacyAIFile&&fs.existsSync(legacyAIFile)){
          if(fs.statSync(legacyAIFile).size>65536)throw Object.assign(Error('KI-Einstellungen sind zu groß.'),{code:'INVALID_LEGACY_AI'});
          write(path.join(stage,'ai-settings.json'),fs.readFileSync(legacyAIFile));
        }
        write(path.join(stage,MARKER),JSON.stringify(FORMAT,null,2)+'\n');
        // Commit the complete import; an existing portable folder always wins.
        try{fs.renameSync(stage,directory);migrated=keys.length>0;}
        catch(e){
          if(!fs.statSync(directory).isDirectory())throw e;
          // Logging/AI setup can create Daten before the renderer initializes.
          // Merge only absent files; exclusive copies also work on portable
          // drives/network filesystems without hard-link support.
          for(const name of fs.readdirSync(stage).filter(name=>name!==MARKER).concat(MARKER)){
            try{fs.copyFileSync(path.join(stage,name),path.join(directory,name),fs.constants.COPYFILE_EXCL);}
            catch(error){if(error.code!=='EEXIST')throw error;}
          }
          migrated=keys.length>0;
        }
      }catch(error){if(error.code==='INVALID_LEGACY_AI')throw error;throw Error(WRITE_ERROR,{cause:error});}
      finally{fs.rmSync(stage,{recursive:true,force:true});}
    }
    marker();const values={},revisions={};
    for(const key of Object.keys(unavailable))delete unavailable[key];
    for(const key of Object.keys(entries)){
      if(!allowed(key))continue;
      try{const item=read(key);if(item.value!==null)values[key]=item.value;revisions[key]=item.revision;}
      catch(error){unavailable[key]=error.message;}
    }
    initialized=true;return {values,revisions,directory,migrated,cadOnly,unavailable:{...unavailable}};
  }
  function change(args){
    if(!initialized)throw Error('Portable Daten wurden noch nicht geladen.');marker();
    if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).length!==3||!allowed(args.key)||typeof args.revision!=='string'||(args.value!==null&&typeof args.value!=='string'))throw Error('Ungültiger Datenbefehl.');
    const {key,value}=args;if(value!==null&&Buffer.byteLength(value)>entries[key].limit)throw Error('Daten sind zu groß.');
    if(unavailable[key])throw Error('Diese Datei konnte nicht geladen werden und bleibt zum Schutz der vorhandenen Daten gesperrt. '+unavailable[key]);
    const previous=read(key);if(args.revision!==previous.revision)throw Error('Die portablen Daten wurden inzwischen geändert. Bitte die Anwendung neu starten.');
    // Compare after reading and checking CAS, so an unchanged local write can
    // never hide an external edit or bypass the profile/size checks.
    if(previous.value===value&&previous.revision===revision(value===null?null:Buffer.from(value)))return previous;
    try{const target=path.join(directory,entries[key].file);if(previous.value!==null)write(target+'.vorher',fs.readFileSync(target));if(value===null)fs.rmSync(target,{force:true});else write(target,value);}
    catch{throw Error(WRITE_ERROR);}
    return {value,revision:revision(value===null?null:Buffer.from(value))};
  }
  return {initialize,change,read,directory};
}
function installProgramStorage(win,{directory,legacyAIFile,ipcMain,shell,cadOnly=false}={}){
  const electron=(!ipcMain||!shell)?require('electron'):null;ipcMain||=electron.ipcMain;shell||=electron.shell;
  const store=createProgramStore(directory,{legacyAIFile,cadOnly});
  for(const [name,fn]of [['initialize',args=>store.initialize(args)],['change',args=>store.change(args)]])ipcMain.on('cad-data:'+name,(event,args)=>{
    if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame){event.returnValue={ok:false,error:'Invalid window.'};return;}
    // The renderer already owns the accepted value. Returning a multi-MB
    // autosave again would synchronously encode/copy it back over Electron IPC.
    try{const saved=fn(args);event.returnValue={ok:true,value:name==='change'?{revision:saved.revision}:saved};}catch(e){event.returnValue={ok:false,error:e.message};}
  });
  ipcMain.handle('cad-data:folder',async event=>{
    if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)return {ok:false,error:'Invalid window.'};
    try{const error=await shell.openPath(store.directory);if(error)throw Error(error);return {ok:true,value:true};}catch(e){return {ok:false,error:e.message};}
  });
  return store;
}
module.exports={dataDirectory,createProgramStore,installProgramStorage,writeAtomicSync,cadOnlyForVersion};
