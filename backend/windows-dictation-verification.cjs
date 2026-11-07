const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{promisify}=require('node:util'),{execFile}=require('node:child_process');
exports.verifyWindowsDictation=async(win,{directory})=>{
 const {app,ipcMain}=require('electron'),run=code=>win.webContents.executeJavaScript(code),pause=ms=>new Promise(r=>setTimeout(r,ms)),checks=[];
 const check=(ok,label)=>{assert(ok,label);checks.push(label);};
 const shot=async name=>{await run('window.__cadTest.view.renderReady()');await pause(250);fs.writeFileSync(path.join(directory,name+'.png'),(await win.webContents.capturePage()).toPNG());};
 async function click(id){const point=await run(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=Math.round(r.x+r.width/2),y=Math.round(r.y+r.height/2);if(e.disabled||!e.contains(document.elementFromPoint(x,y)))throw Error('Covered '+e.id);return {x,y};})()`);for(const type of ['mouseMove','mouseDown','mouseUp'])win.webContents.sendInputEvent({type,...point,button:'left',clickCount:1});await pause(120);}
 let calls=0,fail=false;
 await promisify(execFile)(path.join(app.getAppPath(),'backend/windows-dictation.exe'),['--self-test'],{windowsHide:true,cwd:path.dirname(process.execPath),timeout:3000});
 check(true,'Actual helper executes from the delivered app/ASAR and validates its native x64 INPUT layout');
 ipcMain.removeHandler('cad-speech:windows-dictation');
 require('./windows-dictation.cjs').installWindowsDictation(win,{entry:path.join(app.getAppPath(),'dist/index.html'),service:{async open(){calls++;check(await run("document.activeElement===document.getElementById('ai-chat-prompt')"),'Real preload and main-frame IPC see the focused chat field');if(fail)throw Error('Synthetic Windows launcher failure. Please use Win+H.');return {requested:true};}}});
 await run('window.__cadTest.aiUI.chat.open()');await pause(250);
 const original=await run('window.__cadTest.serialize()'),undo=await run('window.__cadTest.undoDepth()'),speechBefore=await run('window.offlinecadDesktop.getOnlineSpeechStatus()');
 check(await run("!document.getElementById('ai-chat-tools').open&&!!document.getElementById('ai-chat-windows-dictation')&&document.getElementById('ai-chat-windows-dictation').getClientRects().length>0"),'Windows dictation is directly visible below the chat field with speech tools collapsed');
 check(await run("document.getElementById('ai-chat-windows-dictation').title.includes('Microsoft')&&document.getElementById('ai-chat-windows-dictation').title.includes('Internet')"),'Button explains Windows online speech processing without requiring a model or API key');
 await run("const p=document.getElementById('ai-chat-prompt');p.value='Vorhandener Entwurf, 8 mm.';p.focus();p.setSelectionRange(10,10);void 0");
 await click('ai-chat-windows-dictation');
 check(calls===1&&await run("document.getElementById('ai-chat-prompt').value==='Vorhandener Entwurf, 8 mm.'&&document.getElementById('ai-chat-prompt').selectionStart===10&&window.__cadTest.aiUI.chat.state().windowsDictationActive"),'Native-button click preserves existing text and caret and enters manual-send mode');
 for(const type of ['keyDown','char','keyUp'])win.webContents.sendInputEvent({type,keyCode:type==='char'?'\r':'Enter'});await pause(150);
 check(await run("window.__cadTest.aiUI.chat.state().historyCount===0&&document.getElementById('ai-chat-prompt').value.includes('\\n')"),'Enter during Windows dictation inserts a new line without sending a provider request');
 await run('window.__cadTest.aiUI.chat.setBusy(true)');
 check(await run("document.getElementById('ai-chat-windows-dictation').disabled"),'Busy chat blocks the dictation launcher');
 await run("document.getElementById('ai-chat-windows-dictation').click();window.__cadTest.aiUI.chat.setBusy(false);void 0");
 check(calls===1,'Disabled dictation button starts no additional native request');
 await click('ai-chat-new');
 check(await run('!window.__cadTest.aiUI.chat.state().windowsDictationActive'),'New chat resets Windows dictation manual-send mode');
 fail=true;await click('ai-chat-windows-dictation');
 check(calls===2&&await run("document.getElementById('ai-chat-status').textContent.includes('Win+H')&&!document.getElementById('ai-chat-windows-dictation').disabled&&!window.__cadTest.aiUI.chat.state().windowsDictationActive"),'Launcher failure offers Win+H and restores an enabled idle button');
 check(await run('window.__cadTest.serialize()')===original&&await run('window.__cadTest.undoDepth()')===undo,'Dictation controls and failures preserve confirmed project and Undo');
 const speechAfter=await run('window.offlinecadDesktop.getOnlineSpeechStatus()');
 check(JSON.stringify(speechAfter)===JSON.stringify(speechBefore)&&await run("!!document.getElementById('ai-chat-mic')"),'Windows dictation preserves the separate Deepgram recorder and configuration');
 for(const theme of ['light','dark']){
  await run(`window.__cadTest.ui.settings.open();document.getElementById('settings-theme').value=${JSON.stringify(theme)};document.getElementById('settings-theme').dispatchEvent(new Event('change'));document.getElementById('modal').close();void 0`);
  win.setSize(theme==='dark'?1000:1400,theme==='dark'?680:900);await pause(300);
  await run("document.getElementById('ai-chat-windows-dictation').scrollIntoView({block:'nearest'});void 0");
  check(await run("(()=>{const e=document.getElementById('ai-chat-windows-dictation'),r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})()"),theme+' window keeps Windows dictation reachable');
  await shot('windows-dictation-'+theme);
 }
 fs.writeFileSync(path.join(directory,'windows-dictation-proof.json'),JSON.stringify({ok:true,checks,calls,cloudRequests:0,microphoneActivated:false,scope:'Actual chat button, preload, main-frame IPC, failure recovery, preserved caret, manual-send Enter and packaged helper self-test. Successful launch IPC is stubbed; native Win+H delivery is separately captured and swallowed. Windows cloud recognition and physical microphone are not used.'},null,2));
 return {ok:true,checks,cloudRequests:0};
};
