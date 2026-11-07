// Inspect final-result labels in the packaged renderer; provider use is forbidden.
const {app,BrowserWindow,ipcMain}=require('electron'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),asar=path.resolve(process.argv[2]),out=path.join(root,'work/completion-ui-'+Date.now());fs.mkdirSync(out,{recursive:true});process.env.FORMNARO_DIAGNOSTIC_HOME=path.join(out,'app');process.argv.push('--formnaro-diagnostics');app.setAppPath(asar);
const wait=ms=>new Promise(r=>setTimeout(r,ms));let providerRequests=0,stage='renderer-ready';const consoleErrors=[];
app.whenReady().then(async()=>{let win;try{
 for(let i=0;i<180;i++){win=BrowserWindow.getAllWindows().find(w=>!w.isDestroyed());if(win&&await win.webContents.executeJavaScript('!!window.__cadReady').catch(()=>false))break;await wait(500);}
 assert.ok(win&&await win.webContents.executeJavaScript('!!window.__cadReady'));win.webContents.on('console-message',(_event,...args)=>{consoleErrors.push(args.map(a=>typeof a==='string'?a:'').join(' ').slice(0,1800));});stage='fixture';
 const directory=path.join(out,'records');fs.mkdirSync(directory);
 const id='151afd6e-c6ac-4592-b682-18e801e053af',source='F:/Formnaro-Testausgaben/KI-Ergaenzung-0.133.0-r3-2026-11-07/data/KI-Diagnose/run-'+id+'.json',r=JSON.parse(fs.readFileSync(source));
 const final=r.events.find(e=>e.type==='monitor-final-result');final.completion='not-met';r.monitor.final.completion='not-met';fs.writeFileSync(path.join(directory,'run-'+id+'.json'),JSON.stringify(r));
 const runner=require(asar+'/backend/ai-diagnostics.cjs').createDiagnostics({app,directory,credentials:()=>({key:'local-ui-fixture',config:{baseUrl:'https://api.deepseek.com',model:'deepseek-flash'}}),provider:{completeModel:async()=>{providerRequests++;throw Error('No provider use allowed');}}});
 ipcMain.removeHandler('cad-ai:diagnostics');ipcMain.handle('cad-ai:diagnostics',async(event,a)=>{assert.equal(event.sender,win.webContents);let value;if(a.action==='state')value=runner.state();else if(a.action==='labPreview')value=runner.labPreview(a.plan);else if(a.action==='read')value=runner.read(a.id);else throw Error('No execution allowed: '+a.action);return {ok:true,value:await value};});
 stage='open-lab';await win.webContents.executeJavaScript("document.querySelector('#ai-diagnostic-open').click()");
 for(let i=0;i<100&&!await win.webContents.executeJavaScript("!!document.querySelector('[data-runs] button')");i++)await wait(100);
 stage='read-result';await win.webContents.executeJavaScript("document.querySelector('[data-tab=results]').click();document.querySelector('[data-runs] button').click()");await wait(700);
 const label=await win.webContents.executeJavaScript("document.querySelector('[data-decision]').textContent");assert.match(label,/Abnahme: nicht erfüllt/);assert.match(label,/Fortsetzungsempfehlung: continue/);assert.equal(providerRequests,0);
 fs.writeFileSync(path.join(out,'Abnahme-und-Fortsetzung.png'),(await win.webContents.capturePage()).toPNG());
 const close=new Promise(resolve=>win.once('closed',resolve));win.close();await Promise.race([close,wait(10000).then(()=>{throw Error('regular close timeout');})]);
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:true,asar,providerRequests,label,regularWindowClose:true,scope:'Packaged UI labels only; local copied record, no model or completion analysis run.'},null,2));console.log(JSON.stringify({passed:true,out,providerRequests}));app.quit();
 }catch(error){fs.writeFileSync(path.join(out,'error.json'),JSON.stringify({message:error.message,stage,consoleErrors},null,2));console.error(stage+': '+error.message);app.exit(1);}});
require(asar+'/electron.cjs');
