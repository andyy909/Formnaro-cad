const {app,BrowserWindow,session}=require('electron');
const path=require('node:path'),fs=require('node:fs');
const out=path.resolve('work/ai-program/browser-result.json');fs.mkdirSync(path.dirname(out),{recursive:true});app.setPath('userData',fs.mkdtempSync(path.join(path.dirname(out),'isolated-profile-')));
app.whenReady().then(async()=>{
 const external=[],errors=[];session.defaultSession.webRequest.onBeforeRequest((d,done)=>{if(/^https?:/.test(d.url)){external.push(d.url);done({cancel:true});}else done({});});
 const win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
 win.webContents.on('render-process-gone',(_e,d)=>errors.push(d.reason));
 try{await win.loadFile(path.resolve('work/ai-program/browser-dist/tests/fixtures/ai-program-browser.html'));
  const result=await win.webContents.executeJavaScript('window.runProgramProof()');if(external.length||errors.length)throw Error('Unexpected external access or process failure');
  fs.writeFileSync(out,JSON.stringify({...result,external,errors},null,2));console.log(JSON.stringify({ok:true,checks:result.checks.length,external:external.length}));app.exit(0);
 }catch(e){fs.writeFileSync(out,JSON.stringify({ok:false,message:e.message,external,errors},null,2));console.error(e);app.exit(1);}
});
