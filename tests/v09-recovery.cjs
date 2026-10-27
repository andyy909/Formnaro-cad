const {app,BrowserWindow,session}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const profile=process.argv.at(-2),mode=process.argv.at(-1),out=path.dirname(profile);app.setPath('userData',profile);app.setPath('sessionData',profile);
app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,offscreen:true,backgroundThrottling:false}}),js=c=>w.webContents.executeJavaScript(c);
 try{await w.loadFile(path.resolve(__dirname,'../dist/index.html'),{query:{test:'1'}});await js(`(async()=>{while(!window.__cadReady)await new Promise(r=>setTimeout(r,20));})()`);
  if(mode==='writer'){
   await js(`window.__cadTest.loadDemo();document.getElementById('project-name').value='Autosicherung ä 日本語';document.getElementById('project-name').oninput();`);await new Promise(r=>setTimeout(r,900));
   const baseline=await js('window.__cadTest.snapshot()');fs.writeFileSync(path.join(out,'baseline.json'),JSON.stringify(baseline));
   await js(`(()=>{const a=window.__cadTest,g=a.snapshot().nodes[0];a.editFeature(g.id,[g.children.find(n=>!n.solid).id]);const run=a.calculations.run;a.calculations.run=async(...args)=>{const r=await run(...args);await new Promise(resolve=>setTimeout(resolve,60000));return r;};const input=document.getElementById('size-0');input.value='8';input.onchange();})()`);
   await new Promise(r=>setTimeout(r,800));assert.equal(await js('window.__cadTest.edits.isActive()'),true);assert.deepEqual(await js('window.__cadTest.confirmedSnapshot()'),baseline);assert.deepEqual(await js(`JSON.parse(localStorage.getItem('offlinecad-autosave-v4'))`),baseline);
   session.defaultSession.flushStorageData();fs.writeFileSync(path.join(out,'crash-ready.json'),JSON.stringify({pid:process.pid,profile,unconfirmedEdit:true}));
  }else{assert.deepEqual(await js('window.__cadTest.snapshot()'),JSON.parse(fs.readFileSync(path.join(out,'baseline.json'),'utf8')));fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({ok:true,forcedOwnProcessCrash:true,lastCompleteAutosave:true,unconfirmedDraftExcluded:true,profile}));app.exit(0);}
 }catch(e){console.error(e.stack);app.exit(1);}
});
