const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const output=path.resolve(process.env.FORMNARO_SHUTDOWN_PROOF||'work/renderer-recovery-shutdown');fs.mkdirSync(output,{recursive:true});
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-close-test-'));app.setPath('userData',profile);app.setPath('sessionData',profile);app.disableHardwareAcceleration();
process.setUncaughtExceptionCaptureCallback(error=>{fs.writeFileSync(path.join(output,'uncaught.json'),JSON.stringify({error:error.stack},null,2));app.exit(1);});
app.whenReady().then(async()=>{
 const checks=[];
 for(const action of ['close','destroy']){
  const win=new BrowserWindow({show:false,webPreferences:{offscreen:true,sandbox:true}}),contents=win.webContents,baseline=contents.listenerCount('render-process-gone');
  const recovery=require('../backend/renderer-recovery.cjs').installRendererRecovery(win);
  await win.loadURL('data:text/html,<title>Isolated shutdown check</title>');
  const closed=new Promise(resolve=>win.once('closed',resolve));win[action]();await closed;
  assert(win.isDestroyed());assert.equal(contents.listenerCount('render-process-gone'),baseline);recovery.dispose();checks.push(action+' cleans native window without a destroyed-object exception');
 }
 fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:true,checks,hiddenWindows:true,productionProfilesUsed:false},null,2));app.quit();
}).catch(error=>{fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({error:error.stack},null,2));app.exit(1);});
