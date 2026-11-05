const {app,BrowserWindow,session}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),kind=process.argv[2]||'session',out=path.resolve(process.env.FORMNARO_WELCOME_OUTPUT||'../welcome-proof',kind);
fs.mkdirSync(out,{recursive:true});const profile=fs.mkdtempSync(path.join(out,'profile-'));app.setPath('userData',profile);app.setPath('sessionData',profile);
app.whenReady().then(async()=>{
 const errors=[],external=[],checks=[],win=new BrowserWindow({show:false,width:1500,height:950,webPreferences:{offscreen:true,contextIsolation:true,sandbox:true,backgroundThrottling:false,preload:path.join(root,'preload.cjs'),additionalArguments:['--formnaro-portable-data']}});
 const run=code=>win.webContents.executeJavaScript(code),pause=ms=>new Promise(r=>setTimeout(r,ms));
 require(path.join(root,'backend/program-storage.cjs')).installProgramStorage(win,{directory:path.join(profile,'Daten'),cadOnly:true});
 require(path.join(root,'backend/layouts.cjs')).installLayouts(win,{directory:path.join(profile,'Layouts')});
 require(path.join(root,'backend/desktop-ai.cjs')).installDesktopAI(win,{settingsFile:path.join(profile,'Daten/ai-settings.json')});
 win.webContents.on('console-message',d=>{if(d.level==='error')errors.push(d.message);});
 session.defaultSession.webRequest.onBeforeRequest((d,cb)=>{if(/^https?:/i.test(d.url))external.push(d.url);cb({cancel:/^https?:/i.test(d.url)});});
 async function until(code){const start=Date.now();while(Date.now()-start<180000){if(await run(code))return;await pause(100);}throw Error('Timeout '+code);}
 async function click(selector){const p=await run(`(()=>{const b=document.querySelector(${JSON.stringify(selector)});assertVisible=b&&b.getClientRects().length&&!b.disabled;if(!assertVisible)throw Error('Not clickable');const r=b.getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);for(const type of ['mouseMove','mouseDown','mouseUp'])win.webContents.sendInputEvent({type,...p,button:'left',clickCount:1});await pause(150);}
 const timer=setTimeout(()=>app.exit(2),300000);let result;
 try{
  await win.loadFile(path.join(root,'dist/index.html'),{query:{test:'1'}});await until('!!window.__cadTest');await run('window.__cadTest.settled()');
  await until('!document.getElementById("empty-hint").hidden&&[...document.querySelectorAll(".welcome-example img")].every(i=>i.complete&&i.naturalWidth===240)');
  assert.equal(await run('document.querySelectorAll(".welcome-example").length'),3);checks.push('Three visible offline example cards with decoded 240x160 images');
  const sizes=await run('[...document.querySelectorAll(".welcome-example img")].map(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))');assert(sizes.every(s=>s.width>=130&&s.height>=85));checks.push('Preview images have readable on-screen dimensions');
  fs.writeFileSync(path.join(out,'welcome.png'),(await win.webContents.capturePage()).toPNG());
  if(kind==='session'){
   await click('.welcome-close');assert(await run('document.getElementById("empty-hint").hidden'));checks.push('Close button hides greeting');
   await run('window.__cadTest.settled()');await click('[data-action="new"]');assert(await run('document.getElementById("empty-hint").hidden'));checks.push('New empty project does not bring dismissed greeting back');
   await win.reload();await until('!!window.__cadTest&&!document.getElementById("empty-hint").hidden');checks.push('New renderer startup allows greeting again');
   await run('window.__cadTest.loadDemo()');await run('window.__cadTest.settled()');assert(await run('document.getElementById("empty-hint").hidden'));checks.push('Building first model dismisses greeting');
   await run('window.__cadTest.mutate(p=>{p.nodes=[];})');await run('window.__cadTest.settled()');assert(await run('window.__cadTest.getModel().nodes.length===0&&document.getElementById("empty-hint").hidden'));checks.push('Deleting all model content does not restore greeting');
   await run('window.__cadTest.controller.undo()');await run('window.__cadTest.controller.undo()');await run('window.__cadTest.settled()');assert(await run('window.__cadTest.getModel().nodes.length===0&&document.getElementById("empty-hint").hidden'));checks.push('Undo back to initial empty model does not restore greeting');
   await click('[data-workbench-mode="easy"]');assert(await run('document.getElementById("empty-hint").hidden'));checks.push('Mode change does not restore greeting');
  }else{
   const expected={atlas:144,vise:2,gears:10}[kind];assert(expected);
   await click('[data-example="'+kind+'"]');await until('window.__cadTest.getModel().nodes.length==='+expected);await run('window.__cadTest.settled()');
   assert(await run('document.getElementById("empty-hint").hidden'));assert.equal(await run('window.__cadTest.activeProjectFile()'),null);checks.push('Actual card click opens complete '+kind+' model as separate unsaved example');
   fs.writeFileSync(path.join(out,'loaded.png'),(await win.webContents.capturePage()).toPNG());
  }
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);checks.push('No external requests or renderer errors');result={ok:true,kind,checks,sizes};
 }catch(error){result={ok:false,kind,checks,error:error.stack,errors,external};process.exitCode=1;}
 finally{clearTimeout(timer);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));win.destroy();app.exit(result.ok?0:1);}
});
