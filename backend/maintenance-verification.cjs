const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
exports.verifyMaintenance=async(win,{directory,dataPath,startupWriteFailed})=>{
 const checks=[],run=code=>win.webContents.executeJavaScript(code);
 const check=(value,label)=>{assert(value,label);checks.push(label);};
 check(await run('window.__cadReady===true&&!window.__cadError'),'Editor is ready after a failed initial autosave');
 check(startupWriteFailed(),'Initial autosave disk error was actually injected through portable storage IPC');
 check(fs.existsSync(path.join(dataPath,'profil.json'))&&fs.existsSync(path.join(dataPath,'Fehlerprotokolle/formnaro-fehler.jsonl')),'Early error logging directory is adopted without deleting the log');
 const sandbox=await run("window.__cadTest.runLocalScript({code:'return {value:21*2,origin:location.origin,storage:typeof localStorage,desktop:typeof offlinecadDesktop};',call:async()=>null})");
 check(sandbox.value===42&&sandbox.origin==='null'&&sandbox.storage==='undefined'&&sandbox.desktop==='undefined','Local scripts execute under the main CSP with opaque origin and no storage/desktop bridge');
 await run("window.__cadTest.ui.settings.open();document.getElementById('settings-theme').value='dark';document.getElementById('settings-theme').dispatchEvent(new Event('change'));document.getElementById('modal').close()");
 check(await run("document.documentElement.dataset.theme==='dark'&&document.body.dataset.theme==='dark'&&getComputedStyle(document.documentElement).colorScheme==='dark'"),'Dark settings update CSS root, body and browser controls');
 await run('new Promise(r=>setTimeout(r,250))');
 fs.writeFileSync(path.join(directory,'maintenance-dark.png'),(await win.webContents.capturePage()).toPNG());
 win.webContents.debugger.attach('1.3');
 try{
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});
  await run("window.__cadTest.ui.settings.open();document.getElementById('settings-theme').value='system';document.getElementById('settings-theme').dispatchEvent(new Event('change'));document.getElementById('modal').close()");
  check(await run("document.documentElement.dataset.theme==='dark'&&window.__cadTest.getSettings().theme==='system'"),'System resolves a dark OS theme while retaining the System preference');
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});
  await run('new Promise(r=>setTimeout(r,200))');
  check(await run("document.documentElement.dataset.theme==='light'&&document.body.dataset.theme==='light'&&window.__cadTest.getSettings().theme==='system'"),'A live OS theme switch updates the complete interface without changing the preference');
 }finally{win.webContents.debugger.detach();}
 check(await run("!!document.querySelector('meta[http-equiv=\"Content-Security-Policy\"]')"),'Production page has an explicit CSP');
 await run('window.__cadTest.settled()');
 fs.writeFileSync(path.join(directory,'maintenance-system-light.png'),(await win.webContents.capturePage()).toPNG());
 const original=win.webContents.getURL(),target=new URL(original);target.pathname=target.pathname.replace(/index\.html$/,'blocked-audit-navigation.html');let attempted=false;
 const observe=(_event,url)=>{if(url===target.href)attempted=true;};win.webContents.on('will-navigate',observe);
 try{await run(`location.assign(${JSON.stringify(target.href)})`);await run('new Promise(r=>setTimeout(r,200))');}
 finally{win.webContents.removeListener('will-navigate',observe);}
 check(attempted&&win.webContents.getURL()===original&&await run('window.__cadReady===true&&!window.__cadError'),'Real renderer navigation to a different local document is blocked and the editor remains usable');
 const speech=await run('window.offlinecadDesktop.getSpeechStatus()');check(speech.available&&speech.local,'Stream-verified bundled speech remains available through the real main-frame IPC');
 return {ok:true,checks,cloudRequests:0,screenshots:[path.join(directory,'maintenance-dark.png'),path.join(directory,'maintenance-system-light.png')]};
};
