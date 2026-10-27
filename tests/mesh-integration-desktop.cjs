const {app,BrowserWindow,session,ipcMain}=require('electron'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=path.resolve(__dirname,'..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-mesh-tools-')),profile=path.join(out,'profile');
fs.mkdirSync(profile);app.setPath('userData',profile);app.setPath('sessionData',profile);
app.whenReady().then(async()=>{
 const errors=[],external=[],win=new BrowserWindow({show:false,width:1500,height:950,webPreferences:{sandbox:true,contextIsolation:true,offscreen:true,backgroundThrottling:false,preload:path.join(root,'preload.cjs'),additionalArguments:['--formnaro-portable-data','--formnaro-error-log']}}),proof=require('../backend/mesh-integration-verification.cjs'),dialogs=proof.verificationDialogs(out);
 session.defaultSession.webRequest.onBeforeRequest((d,cb)=>{if(/^https?:/.test(d.url))external.push(d.url);cb({cancel:/^https?:/.test(d.url)});});
 win.webContents.on('console-message',e=>{if(e.level==='error')errors.push(e.message);});
 require('../backend/program-storage.cjs').installProgramStorage(win,{directory:path.join(out,'Daten'),cadOnly:true});
 require('../backend/layouts.cjs').installLayouts(win,{directory:path.join(out,'Layouts')});
 require('../backend/desktop-ai.cjs').installDesktopAI(win,{settingsFile:path.join(out,'Daten/ai-settings.json')});
 require('../backend/projects.cjs').installProjects(win,{directory:path.join(out,'Projekte'),dialog:dialogs.projectDialog});
 require('../backend/files.cjs').installFiles(win,{ipcMain,dialog:dialogs.exportDialog});
 require('../backend/error-log.cjs').installErrorLog(win,{directory:path.join(out,'errors'),version:require('../package.json').version});
 const timer=setTimeout(()=>{console.error(JSON.stringify({out,error:'Mesh tools UI timeout',errors}));app.exit(1);},240000);
 try{
  await win.loadFile(path.join(root,'dist/index.html'),{query:{test:'1'}});
  await win.webContents.executeJavaScript(`new Promise((r,j)=>{const start=Date.now(),timer=setInterval(()=>{if(window.__cadTest){clearInterval(timer);r();}else if(window.__cadError||Date.now()-start>60000){clearInterval(timer);j(Error(window.__cadError||'Start timeout'));}},30);})`);
  const result=await proof.verifyMeshIntegration(win,{directory:out,files:dialogs.files});
  if(errors.length||external.length)throw Error(JSON.stringify({errors,external}));
  const report={...result,errors,external,version:require('../package.json').version,sourceManifest:(await import('../scripts/stl-integration-manifest.mjs')).integrationManifest()};
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));
  const target=process.env.FORMNARO_MESH_PROOF??path.join(root,'work/mesh-integration/checks/source-ui.json');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify({out,...report},null,2));
  console.log(JSON.stringify({out,ok:true,checks:result.checks.length}));clearTimeout(timer);app.exit(0);
 }catch(error){
  const phase=await win.webContents.executeJavaScript('window.__meshIntegrationPhase').catch(()=>null);
  const diagnostic=await win.webContents.executeJavaScript(`(()=>{const a=window.__cadTest,p=window.__meshIntegration;return {project:a?.getModel(),state:a?.meshTools?.state(),beforeUnion:p?.beforeUnion&&JSON.parse(p.beforeUnion),afterUnion:p?.afterUnion&&JSON.parse(p.afterUnion)};})()`).catch(()=>null);
  if(diagnostic)fs.writeFileSync(path.join(out,'diagnostic.json'),JSON.stringify(diagnostic,null,2));
  fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({ok:false,error:error.stack,phase,errors,external},null,2));
  fs.writeFileSync(path.join(out,'failure.png'),(await win.webContents.capturePage()).toPNG());
  console.error(JSON.stringify({out,error:error.message,phase,errors,external}));clearTimeout(timer);app.exit(1);
 }
});
