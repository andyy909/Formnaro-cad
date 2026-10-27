const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {writeAtomic}=require('./files.cjs');
const schema=import('./layout-data.mjs');
const MAX_BYTES=512*1024;
function layoutDirectory(app,{root,verificationPath}={}){
  return verificationPath?path.join(path.dirname(verificationPath),'portable-layouts'):path.join(root||(app.isPackaged?path.dirname(app.getPath('exe')):path.resolve(__dirname,'..')),'Layouts');
}
function createLayoutStore(directory,{write=writeAtomic}={}){
  const filename=path.join(path.resolve(directory),'layouts.json');let busy=false;
  async function read(){
    const {emptyLayouts,validateLayouts}=await schema;let bytes;
    try{const stat=await fs.stat(filename);if(stat.size>MAX_BYTES)throw Error('Layoutdatei ist zu groß.');bytes=await fs.readFile(filename);}
    catch(e){if(e.code==='ENOENT')return {data:emptyLayouts(),revision:'missing',exists:false,directory:path.dirname(filename)};throw Error('Layoutdatei konnte nicht gelesen werden: '+e.message);}
    try{if(bytes.length>MAX_BYTES)throw Error('Layoutdatei ist zu groß.');const data=validateLayouts(JSON.parse(bytes.toString('utf8')));return {data,revision:crypto.createHash('sha256').update(bytes).digest('hex'),exists:true,directory:path.dirname(filename)};}
    catch{throw Error('Die Layoutdatei ist beschädigt oder nicht kompatibel. Die Datei wurde nicht verändert.');}
  }
  async function change(args){
    if(busy)throw Error('Layouts werden gerade gespeichert.');busy=true;
    try{
      if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).length!==2||typeof args.revision!=='string'||args.revision.length>80||!args.command)throw Error('Ungültiger Layoutbefehl.');
      const previous=await read();if(args.revision!==previous.revision)throw Error('Die Layoutdatei wurde inzwischen geändert. Bitte erneut laden.');
      const {changeLayouts}=await schema,data=changeLayouts(previous.data,args.command,()=>crypto.randomUUID()),bytes=Buffer.from(JSON.stringify(data,null,2)+'\n');if(bytes.length>MAX_BYTES)throw Error('Layoutdatei ist zu groß.');
      if(args.command.action==='current'&&previous.exists&&JSON.stringify(data)===JSON.stringify(previous.data))return previous;
      try{await fs.mkdir(path.dirname(filename),{recursive:true});await write(filename,bytes);}catch(error){throw Error('Layouts konnten nicht im Programmordner gespeichert werden. Bitte einen beschreibbaren Ordner verwenden.'+(typeof error.code==='string'?' ('+error.code+')':''),{cause:error});}
      return {data,revision:crypto.createHash('sha256').update(bytes).digest('hex'),exists:true,directory:path.dirname(filename)};
    }finally{busy=false;}
  }
  return {read,change,directory:path.dirname(filename)};
}
function installLayouts(win,{directory,ipcMain,shell}={}){
  const electron=(!ipcMain||!shell)?require('electron'):null;ipcMain||=electron.ipcMain;shell||=electron.shell;
  const store=createLayoutStore(directory);
  for(const [channel,handler]of [
    ['cad-layout:get',()=>store.read()],['cad-layout:change',args=>store.change(args)],
    ['cad-layout:folder',async()=>{await fs.mkdir(store.directory,{recursive:true});const error=await shell.openPath(store.directory);if(error)throw Error(error);return true;}]
  ])ipcMain.handle(channel,async(event,args)=>{
    if(event.sender!==win.webContents)return {ok:false,error:'Invalid window.'};
    try{return {ok:true,value:await handler(args)};}catch(e){return {ok:false,error:e.message};}
  });
  return store;
}
module.exports={layoutDirectory,createLayoutStore,installLayouts};
