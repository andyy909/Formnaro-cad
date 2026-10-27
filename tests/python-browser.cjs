const {app,BrowserWindow,session}=require('electron'),path=require('node:path'),fs=require('node:fs');
const work=path.resolve(process.env.FORMNARO_PYTHON_BROWSER_WORK??'work/python-api');fs.mkdirSync(work,{recursive:true});app.setPath('userData',fs.mkdtempSync(path.join(work,'browser-profile-')));
app.whenReady().then(async()=>{
 const external=[],errors=[],consoleLines=[];session.defaultSession.webRequest.onBeforeRequest((d,done)=>{if(/^https?:/.test(d.url)){external.push(d.url);done({cancel:true});}else done({});});
 const win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
 win.webContents.on('console-message',(_e,_level,message)=>{consoleLines.push(message);fs.writeFileSync(path.join(work,'browser-console.json'),JSON.stringify(consoleLines,null,2));});win.webContents.on('render-process-gone',(_e,d)=>errors.push(d.reason));
 try{await win.loadFile(path.join(work,'browser-dist/tests/fixtures/python-browser.html'));const result=await win.webContents.executeJavaScript('window.runPythonProof()');if(!result.ok||external.length||errors.length)throw Error('Python browser proof failed');
  fs.writeFileSync(path.join(work,'python-native.step'),Buffer.from(result.artifacts.step));fs.writeFileSync(path.join(work,'python-native.stl'),Buffer.from(result.artifacts.stl));fs.writeFileSync(path.join(work,'python-native.ocad'),JSON.stringify(result.artifacts.project));delete result.artifacts;
  fs.writeFileSync(path.join(work,'browser-result.json'),JSON.stringify({ok:true,result,external,errors,consoleLines},null,2));console.log(JSON.stringify({ok:true,checks:result.checks.length}));app.exit(0);}
 catch(error){fs.writeFileSync(path.join(work,'browser-result.json'),JSON.stringify({ok:false,message:error.message,external,errors,consoleLines},null,2));console.error(error.message);app.exit(1);}
});
