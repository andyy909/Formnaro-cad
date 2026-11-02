// Real renderer + preload + desktop RPC + HTTP, with fresh local data only.
const {app,BrowserWindow,ipcMain,session}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const output=path.resolve(process.env.FORMNARO_FOUNDATION_PROOF||'work/foundation-desktop');fs.mkdirSync(output,{recursive:true});
const profile=fs.mkdtempSync(path.join(output,'profile-'));app.setPath('userData',profile);app.setPath('sessionData',profile);
let closed=false,checks=[],result,external=[],errors=[];
app.on('window-all-closed',()=>app.quit());
app.on('quit',(_event,exitCode)=>fs.writeFileSync(path.join(output,'normal-exit.json'),JSON.stringify({closed,exitCode,ok:result?.ok===true&&closed&&exitCode===0})));
app.whenReady().then(async()=>{
 session.defaultSession.webRequest.onBeforeRequest((details,reply)=>{const remote=/^https?:/.test(details.url);if(remote)external.push(details.url);reply({cancel:remote});});
 ipcMain.handle('cad-speech:online-status',()=>({ok:true,value:{hasKey:false}}));ipcMain.handle('cad-speech:status',()=>({ok:true,value:{available:false}}));
 const win=new BrowserWindow({show:false,width:1250,height:850,webPreferences:{contextIsolation:true,sandbox:true,backgroundThrottling:false,preload:path.resolve('preload.cjs'),additionalArguments:['--formnaro-portable-data','--formnaro-error-log']}});
 win.once('closed',()=>{closed=true;});
 require('../backend/program-storage.cjs').installProgramStorage(win,{directory:path.join(profile,'Daten'),cadOnly:true});
 require('../backend/desktop-ai.cjs').installDesktopAI(win,{settingsFile:path.join(profile,'Daten/ai-settings.json')});
 require('../backend/layouts.cjs').installLayouts(win,{directory:path.join(profile,'Layouts')});
 require('../backend/ai-tool-library.cjs').installToolLibrary(win,{directory:path.join(profile,'KI-Werkzeuge'),ipcMain});
 require('../backend/error-log.cjs').installErrorLog(win,{directory:path.join(profile,'Fehlerprotokolle'),version:'foundation-test'});
 win.webContents.on('render-process-gone',(_event,details)=>errors.push(details));
 const run=code=>win.webContents.executeJavaScript(code),delay=ms=>new Promise(r=>setTimeout(r,ms));
 try{
  await win.loadFile(path.resolve('dist/index.html'),{query:{test:'1'}});
  for(let i=0;!await run('!!window.__cadTest');i++){if(i>750)throw Error('Renderer readiness timeout');await delay(80);}
  await run("(async()=>{const s=await window.offlinecadDesktop.getAISettings();await window.offlinecadDesktop.saveAISettings({config:{...s,bridgeEnabled:true}});})()");
  const descriptor=JSON.parse(fs.readFileSync(path.join(profile,'ai-bridge.json')));
  const request=async(method,body)=>{const response=await fetch(descriptor.url+'/v1/'+method,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+descriptor.token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(90000)});const value=await response.json();if(!response.ok)throw Object.assign(Error(value.error),{code:value.code,feedback:value.feedback});return value;};
  let scene=await request('scene'),preview=await request('preview',{revision:scene.revision,commands:[{op:'create',type:'box',size:[10,8,4],as:'a'},{op:'create',type:'box',size:[10,8,4],pos:[25,0,0],as:'b'}],checks:[]});
  let applied=await request('apply',{previewId:preview.previewId,revision:preview.revision});assert.equal(applied.refresh.status,'completed');assert.equal(applied.revision,applied.scene.revision);
  const ids=Object.values(preview.aliases);assert.equal(ids.length,2);checks.push('HTTP preview/apply returns actual revision');
  preview=await request('preview',{revision:applied.revision,commands:[{op:'joint',action:'create',joint:{id:'receipt-joint',kind:'revolute',parentId:ids[0],childId:ids[1],origin:[0,0,0]}}],checks:[]});
  const commit={previewId:preview.previewId,revision:preview.revision},depth=await run('window.__cadTest.undoDepth()');
  await run("window.__savedSetDisplay=window.__cadTest.partPropertiesUI.beforeDisplay;window.__cadTest.partPropertiesUI.beforeDisplay=()=>{throw Object.assign(Error('Injected foundation display failure'),{code:'CAD_KERNEL_FATAL'});};void 0");
  applied=await request('apply',commit);assert.equal(applied.applied,true);assert.equal(applied.refresh.status,'failed');assert.equal(applied.refresh.error.code,'CAD_KERNEL_FATAL');assert.equal(await run('window.__cadTest.undoDepth()'),depth+1);assert.equal(applied.revision,await run('window.__cadTest.controller.revision()'));checks.push('Real view failure after commit retains HTTP success and committed revision');
  await run('window.__cadTest.partPropertiesUI.beforeDisplay=window.__savedSetDisplay;void 0');
  const retried=await request('apply',commit);assert.equal(retried.alreadyApplied,true);assert.equal(retried.refresh.status,'completed');assert.equal(retried.revision,applied.revision);assert.equal(await run('window.__cadTest.undoDepth()'),depth+1);checks.push('Same Apply retries refresh without another Undo');
  preview=await request('preview',{revision:retried.revision,commands:[{op:'joint',action:'move',values:[{jointId:'receipt-joint',value:12}]}],checks:[]});
  applied=await request('apply',{previewId:preview.previewId,revision:preview.revision});assert.equal(await run("window.__cadTest.snapshot().joints.joints.find(j=>j.id==='receipt-joint').value"),12);checks.push('Actual joint value 12 committed');
  preview=await request('preview',{revision:applied.revision,commands:[{op:'joint',action:'move',values:[{jointId:'receipt-joint',value:15}]}],checks:[]});
  const timedCommit={previewId:preview.previewId,revision:preview.revision};
  await run('window.__savedSync=window.__cadTest.meshSelectionUI.sync;window.__cadTest.meshSelectionUI.sync=()=>new Promise(resolve=>{window.__releaseRefresh=resolve;});void 0');
  const timeoutReceipt=await request('apply',timedCommit);assert.equal(timeoutReceipt.applied,true);assert.equal(timeoutReceipt.refresh.error.code,'CAD_OPERATION_TIMEOUT');assert.equal(timeoutReceipt.revision,await run('window.__cadTest.controller.revision()'));assert.equal(await run("window.__cadTest.snapshot().joints.joints.find(j=>j.id==='receipt-joint').value"),15);
  await run('window.__cadTest.meshSelectionUI.sync=window.__savedSync;window.__releaseRefresh();window.__cadTest.settled()');
  const timeoutRetry=await request('apply',timedCommit);assert.equal(timeoutRetry.alreadyApplied,true);assert.equal(timeoutRetry.refresh.status,'completed');checks.push('45-second desktop RPC timeout retains the earlier commit receipt and permits idempotent refresh');
  await run('window.__cadTest.controller.undo();window.__cadTest.refresh()');
  await assert.rejects(request('apply',commit),{code:'STALE_REVISION'});await run('window.__cadTest.controller.undo();window.__cadTest.refresh()');assert.equal(await run("window.__cadTest.snapshot().joints.joints.find(j=>j.id==='receipt-joint').value"),0);checks.push('Stale receipt rejected; Undo restores the original joint value');
  scene=await request('scene');preview=await request('preview',{revision:scene.revision,commands:[{op:'create',type:'thread',size:[16,16,20],pos:[80,0,0],as:'thread',params:{profile:'trapezoid',diameter:16,pitch:4,length:20,leadIn:0}}],checks:[]});
  applied=await request('apply',{previewId:preview.previewId,revision:preview.revision});const threadId=preview.aliases.thread;
  const brep=await run(`window.__cadTest.snapshot().nodes.find(n=>n.id===${JSON.stringify(threadId)}).brep.data`);
  preview=await request('preview',{revision:applied.revision,commands:[{op:'update',target:threadId,set:{rot:[3.004649258303339,0,0]}}],checks:[]});
  await request('apply',{previewId:preview.previewId,revision:preview.revision});assert.equal(await run(`window.__cadTest.snapshot().nodes.find(n=>n.id===${JSON.stringify(threadId)}).brep.data`),brep);checks.push('Real renderer preserves Tr16x4 local BRep at the original failing angle');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);result={ok:true,checks,errors,external,scope:'Isolated source desktop, not a packaged release or general acceptance'};
 }catch(error){result={ok:false,error:error.stack,checks,errors,external};console.error(error.stack);}
 finally{fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));win.close();}
});
