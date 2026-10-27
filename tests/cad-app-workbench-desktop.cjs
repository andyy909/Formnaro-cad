const {app,BrowserWindow,session}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const output=path.resolve(process.env.FORMNARO_WORKBENCH_OUTPUT||'work/easy-tinker/checks');fs.mkdirSync(output,{recursive:true});
const profile=fs.mkdtempSync(path.join(app.getPath('temp'),'formnaro-workbench-'));app.setPath('userData',profile);app.setPath('sessionData',profile);
app.whenReady().then(async()=>{
 const errors=[],external=[];
 session.defaultSession.webRequest.onBeforeRequest((d,cb)=>{if(/^https?:/.test(d.url))external.push(d.url);cb({cancel:/^https?:/.test(d.url)});});
 const win=new BrowserWindow({show:false,width:1840,height:1015,webPreferences:{offscreen:true,contextIsolation:true,sandbox:true,backgroundThrottling:false,preload:path.resolve('preload.cjs'),additionalArguments:['--formnaro-portable-data']}});
 require(path.resolve('backend/program-storage.cjs')).installProgramStorage(win,{directory:path.join(profile,'Daten'),cadOnly:true});require(path.resolve('backend/desktop-ai.cjs')).installDesktopAI(win,{settingsFile:path.join(profile,'Daten/ai-settings.json')});require(path.resolve('backend/layouts.cjs')).installLayouts(win,{directory:path.join(profile,'Layouts')});
 win.webContents.on('console-message',d=>{if(d.level==='error')errors.push(d.message);});
 try{
  await win.loadFile(path.resolve(process.env.FORMNARO_WORKBENCH_ENTRY||'work/cad-v011/native-app/index.html'),{query:{test:'1'}});
  const result=await require('../backend/workbench-verification.cjs').verifyWorkbench(win,{directory:output,dataPath:path.join(profile,'Daten')});
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({...result,errors,external,profile},null,2));console.log(JSON.stringify(result));app.exit(0);
 }catch(error){fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:false,error:error.message,errors,external},null,2));console.error(error.stack);app.exit(1);}
});
