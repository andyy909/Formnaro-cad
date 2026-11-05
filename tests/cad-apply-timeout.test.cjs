const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
test('HTTP Apply timeout returns a known receipt or explicitly unknown status; mismatched receipts are ignored',async()=>{
 const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-apply-timeout-')),handlers=new Map(),mainListeners=new Map(),rendererListeners=new Map(),frame={};let desktop;
 const webContents={mainFrame:frame,send:(name,value)=>rendererListeners.get(name)?.({},value),on:()=>{}},win={webContents,isDestroyed:()=>false,on:()=>{}};
 const electron={app:{getPath:()=>fixture},safeStorage:{isEncryptionAvailable:()=>false},ipcMain:{handle:(name,fn)=>handlers.set(name,fn),on:(name,fn)=>mainListeners.set(name,fn)},ipcRenderer:{on:(name,fn)=>rendererListeners.set(name,fn),removeListener:()=>{},send:(name,value)=>mainListeners.get(name)?.({sender:webContents,senderFrame:frame},value)},contextBridge:{exposeInMainWorld:(name,value)=>{if(name==='offlinecadDesktop')desktop=value;}}};
 function execute(file){const target=path.resolve(file),requireLocal=createRequire(target),module={exports:{}};vm.runInNewContext(fs.readFileSync(target,'utf8'),{require:name=>name==='electron'?electron:requireLocal(name),module,exports:module.exports,process:{argv:[]},Buffer,URL,AbortController,AbortSignal,setTimeout:(fn,ms)=>setTimeout(fn,ms===45000?20:ms),clearTimeout},{filename:target});return module.exports;}
 execute('preload.cjs');const installed=execute('backend/desktop-ai.cjs').installDesktopAI(win,{settingsFile:path.join(fixture,'settings.json')});
 desktop.onAutomation((_method,args,id)=>{if(args.previewId!=='unknown')desktop.automationCommitted({id,previewId:args.previewId==='forged'?'different':args.previewId,requestRevision:args.revision,revision:'b'.repeat(16),changed:true,alreadyApplied:false});return new Promise(()=>{});});
 const event={sender:webContents,senderFrame:frame},save=handlers.get('cad-ai:save');
 try{
  await save(event,{config:{bridgeEnabled:true},clearKey:true});const descriptor=JSON.parse(fs.readFileSync(path.join(fixture,'ai-bridge.json')));
  for(const previewId of ['known','unknown','forged']){
   const response=await fetch(descriptor.url+'/v1/apply',{method:'POST',headers:{Authorization:'Bearer '+descriptor.token,'Content-Type':'application/json'},body:JSON.stringify({previewId,revision:'a'.repeat(16)})}),body=await response.json();
   if(previewId==='known'){assert.equal(response.status,200);assert.equal(body.applied,true);assert.equal(body.revision,'b'.repeat(16));assert.equal(body.refresh.error.code,'CAD_OPERATION_TIMEOUT');assert.equal(body.refresh.nextAction,'repeat');}
   else{assert.equal(body.code,'CAD_OPERATION_TIMEOUT');assert.equal(body.feedback.applied,null);assert.equal(body.feedback.commitStatus,'unknown');assert.equal(body.feedback.nextAction,'repeat');assert.match(body.error,/unbekannt/);}
  }
 }finally{await save(event,{config:{bridgeEnabled:false},clearKey:true});await installed.syncBridge();}
});
