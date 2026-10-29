const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module'),{EventEmitter}=require('node:events');
const {installProgramStorage}=require('../backend/program-storage.cjs');
const {installFiles}=require('../backend/files.cjs');
const {installErrorLog}=require('../backend/error-log.cjs');

function setup(t){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-audit-ipc-'));
 t.after(()=>{assert.equal(path.dirname(directory),os.tmpdir());assert.ok(path.basename(directory).startsWith('formnaro-audit-ipc-'));fs.rmSync(directory,{recursive:true,force:true});});
 const win=new EventEmitter();win.webContents=new EventEmitter();win.webContents.mainFrame={id:'main'};win.isDestroyed=()=>false;
 const handlers=new Map(),listeners=new Map();return {directory,win,handlers,listeners,ipcMain:{handle:(n,f)=>handlers.set(n,f),on:(n,f)=>listeners.set(n,f)},right:{sender:win.webContents,senderFrame:win.webContents.mainFrame},child:{sender:win.webContents,senderFrame:{id:'child'}}};
}
test('Portable data IPC rejects same-window subframes before reading, writing or opening data',async t=>{
 const f=setup(t),directory=path.join(f.directory,'Daten');let opened=0;
 installProgramStorage(f.win,{directory,ipcMain:f.ipcMain,shell:{openPath:async()=>{opened++;return '';}}});
 f.listeners.get('cad-data:initialize')(f.child,{});assert.equal(f.child.returnValue.ok,false);assert.equal(fs.existsSync(directory),false);
 f.listeners.get('cad-data:initialize')(f.right,{});assert.equal(f.right.returnValue.ok,true);
 f.listeners.get('cad-data:change')(f.child,{key:'offlinecad-settings-v1',value:'{}',revision:'missing'});assert.equal(f.child.returnValue.ok,false);
 assert.equal((await f.handlers.get('cad-data:folder')(f.child)).ok,false);assert.equal(opened,0);
});
test('File IPC rejects a foreign frame with a structured error and never opens a dialog',async t=>{
 const f=setup(t);let opened=0;
 installFiles(f.win,{ipcMain:f.ipcMain,dialog:{showSaveDialog:async()=>{opened++;return {canceled:true};}}});
 const args={filename:'audit.ocad',bytes:new Uint8Array([1])};
 assert.equal((await f.handlers.get('cad-file:save')(f.child,args)).ok,false);
 assert.equal((await f.handlers.get('cad-file:save')({sender:{}},args)).ok,false);
 assert.equal(opened,0);
 assert.equal((await f.handlers.get('cad-file:save')(f.right,args)).ok,true);assert.equal(opened,1);
});
test('Error-log IPC rejects subframe writes, status and folder access',async t=>{
 const f=setup(t);installErrorLog(f.win,{directory:f.directory,ipcMain:f.ipcMain,shell:{openPath:async()=>''},processEvents:new EventEmitter()});
 for(const name of ['write','status','folder'])assert.equal((await f.handlers.get('cad-log:'+name)(f.child,{message:'blocked'})).ok,false);
 assert.equal(fs.readdirSync(f.directory).length,0);
});
test('Projects, layouts, PDF and tool-library IPC also reject subframes before any file operation',async t=>{
 const f=setup(t),shell={openPath:async()=>assert.fail('A foreign frame opened a folder')},dialog={showSaveDialog:async()=>assert.fail('A foreign frame opened a dialog')};
 require('../backend/projects.cjs').installProjects(f.win,{directory:path.join(f.directory,'projects'),ipcMain:f.ipcMain,shell,dialog});
 require('../backend/layouts.cjs').installLayouts(f.win,{directory:path.join(f.directory,'layouts'),ipcMain:f.ipcMain,shell});
 require('../backend/drawing-pdf.cjs').installDrawingPdf(f.win,{ipcMain:f.ipcMain,dialog});
 require('../backend/ai-tool-library.cjs').installToolLibrary(f.win,{directory:path.join(f.directory,'tools'),ipcMain:f.ipcMain});
 for(const name of ['cad-project:list','cad-layout:get','cad-drawing:pdf','cad-ai-tools:request']){
  assert.ok(f.handlers.has(name),'Expected real handler '+name);
  assert.equal((await f.handlers.get(name)(f.child,{})).ok,false,name);
 }
});
test('Desktop AI validates empty requests before configuration or network access and ignores subframe replies',async t=>{
 const f=setup(t),file=path.resolve(__dirname,'../backend/desktop-ai.cjs'),local=createRequire(file),module={exports:{}};let sent,ready;
 const request=new Promise(resolve=>{ready=resolve;});f.win.webContents.send=(_name,value)=>{sent=value;ready();};
 const electron={app:{getPath:()=>f.directory},ipcMain:f.ipcMain,safeStorage:{isEncryptionAvailable:()=>false}};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:name=>name==='electron'?electron:local(name),module,Buffer,URL,AbortController,setTimeout,clearTimeout},{filename:file});
 const installed=module.exports.installDesktopAI(f.win,{settingsFile:path.join(f.directory,'ai-settings.json')});
 for(const args of [undefined,null,[],42,'invalid']){const r=await f.handlers.get('cad-ai:generate')(f.right,args);assert.equal(r.ok,false);assert.equal(r.code,'INVALID_AI_REQUEST');}
 const save=f.handlers.get('cad-ai:save');
 try{
  assert.equal((await save(f.right,{config:{bridgeEnabled:true},clearKey:true})).ok,true);
  const descriptor=JSON.parse(fs.readFileSync(path.join(f.directory,'ai-bridge.json'),'utf8'));
  const response=fetch(descriptor.url+'/v1/context',{headers:{Authorization:'Bearer '+descriptor.token}});await request;
  f.listeners.get('cad-ai:reply')(f.child,{id:sent.id,value:{marker:'forged'}});
  f.listeners.get('cad-ai:reply')(f.right,{id:sent.id,value:{marker:'accepted'}});
  assert.equal((await (await response).json()).marker,'accepted');
 }finally{await save(f.right,{config:{bridgeEnabled:false},clearKey:true});await installed.syncBridge();f.win.emit('closed');}
});
