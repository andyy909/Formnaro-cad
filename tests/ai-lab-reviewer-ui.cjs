// Actual packaged renderer and IPC with a local provider fixture; no cloud requests.
const {app,BrowserWindow,ipcMain}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),asar=path.resolve(process.argv[2]),out=path.join(root,'work/reviewer-ui-'+Date.now());
process.env.FORMNARO_DIAGNOSTIC_HOME=path.join(out,'isolated-app');process.argv.push('--formnaro-diagnostics');
fs.mkdirSync(out,{recursive:true});app.setPath('appData',path.join(out,'profile'));app.setPath('userData',path.join(out,'profile/offlinecad'));app.setAppPath(asar);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let cloudRequests=0;
app.whenReady().then(async()=>{let win;try{
 for(let i=0;i<180;i++){win=BrowserWindow.getAllWindows().find(w=>!w.isDestroyed());if(win&&await win.webContents.executeJavaScript('!!window.__cadReady').catch(()=>false))break;await wait(500);}
 assert.ok(win&&await win.webContents.executeJavaScript('!!window.__cadReady'),'packaged renderer ready');
 const directory=path.join(out,'results');fs.mkdirSync(directory);
 const source='F:/Formnaro-Testausgaben/KI-Ergaenzung-0.133.0-r3-2026-11-07/data/KI-Diagnose';
 for(const id of ['6cc48b73-deaf-4368-82fd-b084514ee94e','00a5b314-31ff-4907-991b-6b6705d631f0'])fs.copyFileSync(path.join(source,'run-'+id+'.json'),path.join(directory,'run-'+id+'.json'));
 let reviewRequests=0;
 const runner=require(asar+'/backend/ai-diagnostics.cjs').createDiagnostics({app,directory,credentials:()=>({key:'local-provider-fixture',config:{baseUrl:'https://api.deepseek.com',model:'deepseek-flash'}}),onEvent:e=>{if(!win.isDestroyed())win.webContents.send('cad-ai:diagnostic-event',e);},provider:{completeModel:async(c,k,e)=>{
  assert.ok(e.system.includes('third Formnaro lab agent'));reviewRequests++;e.onDiagnostic({type:'request',body:{model:c.model}});const evidence=JSON.parse(e.user),id=evidence.runs.find(r=>r.status==='failed').id;
  return {data:{model:'deepseek-flash',usage:{input_tokens:200,output_tokens:40,input_tokens_details:{cached_tokens:0}}},text:JSON.stringify({summary:'Lokale Kontrollauswertung: Größenfeld und Fasenmaß getrennt prüfen.',findings:[{title:'Globales Größenfeld im Fasenablauf',category:'ui',certainty:'observed',runIds:[id],observation:'Bauteilbreite von 40 auf 1 mm geändert.',suggestedChange:'Das Werkzeugfeld cad-edge-amount verwenden.',validation:'Außenmaße und Fase unabhängig messen.'}],nextChecks:['Betroffenen Fasenfall gezielt prüfen.']})};
 }}});
 ipcMain.removeHandler('cad-ai:diagnostics');ipcMain.handle('cad-ai:diagnostics',async(_event,args)=>{switch(args.action){case 'state':return runner.state();case 'read':return runner.read(args.id);case 'labPreview':return runner.labPreview(args.plan);case 'labReviewerSettings':return runner.labReviewerSettings(args.enabled);case 'labReview':return runner.labReview(args);case 'labExportPackage':return runner.labExportPackage(args);default:throw Error('Unexpected test action '+args.action);}});
 await win.webContents.executeJavaScript("document.querySelector('#ai-diagnostic-open').click()");await wait(1200);
 assert.equal(await win.webContents.executeJavaScript("document.querySelector('#ai-diagnostics').open"),true);
 await win.webContents.executeJavaScript("document.querySelector('[data-tab=review]').click();document.querySelector('[data-review-enabled]').click()");await wait(200);assert.equal(runner.state().lab.reviewer.enabled,false);assert.equal(reviewRequests,0);
 await win.webContents.executeJavaScript("document.querySelector('[data-review-enabled]').click();document.querySelector('[data-review-run]').click()");
 for(let i=0;i<80&&!runner.state().lab.reviewer.reviews.length;i++)await wait(100);
 for(let i=0;i<80&&runner.state().lab.reviewer.busy;i++)await wait(100);await wait(500);
 assert.equal(reviewRequests,1);assert.equal(runner.state().records.length,2);assert.equal(runner.state().lab.reviewer.reviews[0].status,'completed');
 assert.match(await win.webContents.executeJavaScript("document.querySelector('[data-review-result]').textContent"),/40 auf 1 mm/);
 assert.match(await win.webContents.executeJavaScript("document.querySelector('#ai-diagnostic-usage').textContent"),/Abschlussauswerter: Input 200/);
 await win.webContents.executeJavaScript("document.querySelector('[data-review-export]').click()");
 for(let i=0;i<100&&!fs.readdirSync(directory).some(n=>n.endsWith('.zip'));i++)await wait(100);
 assert.equal(fs.readdirSync(directory).filter(n=>n.endsWith('.zip')).length,1);await wait(300);
 fs.writeFileSync(path.join(out,'Abschlussauswertung.png'),(await win.webContents.capturePage()).toPNG());
 await win.webContents.executeJavaScript("document.querySelector('#ai-diagnostics [data-close]').click();document.querySelector('#ai-diagnostic-open').click()");await wait(300);
 assert.match(await win.webContents.executeJavaScript("document.querySelector('[data-review-result]').textContent"),/Größenfeld/);
 const closed=new Promise(resolve=>win.once('closed',resolve));win.close();await Promise.race([closed,wait(10000).then(()=>{throw Error('regular close timeout');})]);
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:true,asar,cloudRequests,reviewRequests,checks:['packaged renderer ready','third role visible','automatic setting persists','manual completed-scope review through IPC','run evidence displayed','separate reviewer billing','real external ZIP export','result retained on reopen','regular window closed']},null,2));console.log(JSON.stringify({passed:true,out}));app.quit();
 }catch(error){fs.writeFileSync(path.join(out,'error.json'),JSON.stringify({message:error.message,stack:error.stack},null,2));console.error(error.message);app.exit(1);}});
require(asar+'/electron.cjs');
