// Same isolated sequence for installed baseline and candidate; no user profile.
const {app,BrowserWindow,session}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const output=path.resolve(process.env.FORMNARO_MEMORY_OUTPUT||'work/stl-memory/candidate');
fs.mkdirSync(output,{recursive:true});const profile=fs.mkdtempSync(path.join(output,'profile-'));
app.setPath('userData',profile);app.setPath('sessionData',profile);
app.whenReady().then(async()=>{
 const appRoot=path.resolve(process.env.FORMNARO_MEMORY_APP||'.'),backend=path.join(appRoot,'backend'),errors=[],external=[],samples=[],checks=[];
 session.defaultSession.webRequest.onBeforeRequest((d,cb)=>{if(/^https?:/i.test(d.url))external.push(d.url);cb({cancel:/^https?:/i.test(d.url)});});
 const win=new BrowserWindow({show:false,width:1500,height:950,webPreferences:{offscreen:true,contextIsolation:true,sandbox:true,backgroundThrottling:false,preload:path.join(appRoot,'preload.cjs'),additionalArguments:['--formnaro-portable-data']}});
 require(path.join(backend,'program-storage.cjs')).installProgramStorage(win,{directory:path.join(profile,'Daten'),cadOnly:true});
 require(path.join(backend,'desktop-ai.cjs')).installDesktopAI(win,{settingsFile:path.join(profile,'Daten/ai-settings.json')});
 require(path.join(backend,'layouts.cjs')).installLayouts(win,{directory:path.join(profile,'Layouts')});
 const run=code=>win.webContents.executeJavaScript(code),pause=ms=>new Promise(r=>setTimeout(r,ms));
 win.webContents.on('console-message',d=>{if(d.level==='error')errors.push(d.message);});
 let phase='startup';const started=Date.now(),timer=setInterval(()=>{samples.push({ms:Date.now()-started,phase,MiB:app.getAppMetrics().reduce((sum,p)=>sum+p.memory.workingSetSize,0)/1024});if(samples.length%50===0)fs.writeFileSync(path.join(output,'progress.json'),JSON.stringify({phase,ms:Date.now()-started,MiB:samples.at(-1).MiB}));},100);
 const watchdog=setTimeout(()=>{fs.writeFileSync(path.join(output,'timeout.json'),JSON.stringify({phase,samples}));app.exit(1);},600000);
 try{
  const corpus=JSON.parse(fs.readFileSync('work/stl-cad-v2/corpus-final-v2/report.json','utf8'));
  const entry=path.join(appRoot,process.env.FORMNARO_MEMORY_ENTRY||'dist/index.html'),entrySha256=require('node:crypto').createHash('sha256').update(fs.readFileSync(entry)).digest('hex');
  await win.loadFile(entry,{query:{test:'1'}});
  for(let n=0;n<600&&!(await run('!!window.__cadTest'));n++)await pause(100);
  await run('window.__cadTest.layoutUI.ready()');await pause(1000);
  async function imported(row,options={}){
   const bytes=fs.readFileSync(row.path).toString('base64');row={...row,name:path.basename(row.path)};
   return run(`(async()=>{const a=window.__cadTest,bytes=Uint8Array.from(atob(${JSON.stringify(bytes)}),c=>c.charCodeAt(0));await a.resetProject();const start=performance.now();await a.importFile(new File([bytes],${JSON.stringify(row.name)}),${JSON.stringify({reconstruct:true,...options})});await a.settled();const node=a.getModel().nodes[0];return {ms:performance.now()-start,volume:node.stats.volume,brepBytes:node.brep.data.length,worker:a.controller.state().worker,metadata:node.metadata}})()`);
  }
  phase='large-import';checks.push({name:phase,...await imported(corpus.results[24])});await pause(1500);
  phase='large-step';checks.push({name:phase,...await run(`(async()=>{const a=window.__cadTest,start=performance.now(),step=await a.controller.exportModel({format:'step'});return {ms:performance.now()-start,stepBytes:step.data.length}})()`)});await pause(1500);
  phase='large-undo-redo';await run(`(async()=>{const a=window.__cadTest,before=a.serialize();a.controller.undo();await a.settled();a.controller.redo();await a.settled();if(a.serialize()!==before)throw Error('Undo/redo differs')})()`);
  phase='small-repeats';for(let i=0;i<Number(process.env.FORMNARO_MEMORY_REPEATS||5);i++){checks.push({name:'small-'+i,...await imported(corpus.results[0])});await pause(300);}
  phase='settled-small';await pause(2000);const settledMiB=app.getAppMetrics().reduce((sum,p)=>sum+p.memory.workingSetSize,0)/1024;
  assert.equal(errors.length,0);assert.equal(external.length,0);
  const report={ok:true,entrySha256,checks,errors,external,samples,peakMiB:Math.max(...samples.map(s=>s.MiB)),settledMiB};
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({ok:true,peakMiB:report.peakMiB,settledMiB,checks:checks.length}));
  clearInterval(timer);clearTimeout(watchdog);app.exit(0);
 }catch(error){clearInterval(timer);clearTimeout(watchdog);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:false,error:error.stack,phase,checks,errors,external,samples},null,2));console.error(error);app.exit(1);}
});
