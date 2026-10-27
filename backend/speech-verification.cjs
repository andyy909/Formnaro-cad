const fs=require('node:fs'),path=require('node:path');
exports.verifySpeech=async function(win,{directory,tempDirectory}){
 const checks=[],run=code=>win.webContents.executeJavaScript(code),pause=ms=>new Promise(r=>setTimeout(r,ms));
 const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
 async function until(expr,timeout=120000){const start=Date.now();while(!await run(expr)){if(Date.now()-start>timeout)throw Error('Timeout: '+expr);await pause(100);}}
 const click=selector=>run(`document.querySelector(${JSON.stringify(selector)}).click()`);
 const shot=async name=>{await run('window.__cadTest.view.renderReady()');await pause(200);fs.writeFileSync(path.join(directory,name+'.png'),(await win.webContents.capturePage()).toPNG());};
 try{
  await run('window.__cadTest.aiUI.chat.open()');await until("!document.getElementById('ai-chat-mic').disabled");
  await click('#ai-chat-tools > summary');await until("document.getElementById('ai-chat-tools').open");await pause(200);
  check(await run("document.getElementById('ai-chat-mic').getBoundingClientRect().width>0"),'Speech controls become visible through the images, references and speech category');
  const status=await run('window.offlinecadDesktop.getSpeechStatus()');check(status.available&&status.local&&status.engine==='Whisper large-v3-turbo','Bundled verified local Whisper is available without an API key');
  await run(`window.__speechBefore=window.__cadTest.serialize();window.__speechStreams=[];const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async options=>{const s=await get(options);window.__speechStreams.push(s);return s;};document.getElementById('ai-chat-prompt').value='Vorhandener Auftrag.';`);
  await click('#ai-chat-mic');await until("document.getElementById('ai-chat-mic').getAttribute('aria-pressed')==='true'");
  check(await run("document.getElementById('ai-chat-send').disabled&&document.getElementById('ai-chat-prompt').disabled"),'Recording blocks sending and protects existing draft');
  await shot('recording');await click('#ai-chat-mic-cancel');
  check(await run("!window.__cadTest.aiUI.chat.state().speechBusy&&window.__speechStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))&&document.getElementById('ai-chat-prompt').value==='Vorhandener Auftrag.'"),'Discard stops every microphone track and preserves draft');
  await click('#ai-chat-mic');await until("document.getElementById('ai-chat-mic').getAttribute('aria-pressed')==='true'");await pause(8300);await click('#ai-chat-mic');
  await until("!window.__cadTest.aiUI.chat.state().speechBusy",600000);
  const text=await run("document.getElementById('ai-chat-prompt').value"),message=await run("document.getElementById('ai-chat-speech-status').textContent");
  check(text.startsWith('Vorhandener Auftrag.\n')&&/Wange/i.test(text)&&/Ring/i.test(text)&&/Grundplatte/i.test(text)&&/8\s*(mm|Millimeter)/i.test(text),'Real MediaRecorder → resampling → IPC → Whisper → draft recognizes German parts and 8 mm: '+text+' / '+message);
  check(await run('window.__cadTest.aiUI.chat.state().historyCount===0&&window.__cadTest.serialize()===window.__speechBefore'),'Dictation never sends a provider request or changes the project');
  check(await run("window.__speechStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))"),'Successful recognition releases microphone');
  check(!fs.existsSync(tempDirectory)||fs.readdirSync(tempDirectory).length===0,'Temporary recording and transcript are deleted after recognition');
  await shot('transcribed');
  await click('#ai-chat-mic');await until("document.getElementById('ai-chat-mic').getAttribute('aria-pressed')==='true'");await pause(1800);await click('#ai-chat-mic');await until("document.getElementById('ai-chat-speech-status').textContent.includes('lokal erkannt')");await pause(500);await click('#ai-chat-mic-cancel');await pause(1200);
  check(await run("document.getElementById('ai-chat-prompt').value")===text,'Cancel during transcription preserves previous draft');
  check(!fs.existsSync(tempDirectory)||fs.readdirSync(tempDirectory).length===0,'Cancelled transcription removes temporary audio');
  await run(`window.__speechOriginalGet=navigator.mediaDevices.getUserMedia;navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Denied','NotAllowedError');};void 0;`);await click('#ai-chat-mic');await until("!window.__cadTest.aiUI.chat.state().speechBusy");
  check(await run("document.getElementById('ai-chat-speech-status').textContent.includes('Mikrofonzugriff nicht erlaubt')&&!document.getElementById('ai-chat-send').disabled"),'Permission refusal explains recovery and unlocks chat');
  await run('navigator.mediaDevices.getUserMedia=window.__speechOriginalGet;void 0');
  win.setSize(1000,680);await pause(300);
  for(const id of ['ai-chat-mic','ai-chat-speech-language','ai-chat-send']){
   await run(`document.getElementById(${JSON.stringify(id)}).scrollIntoView({block:'nearest'})`);await pause(100);
   check(await run(`(()=>{const e=document.getElementById(${JSON.stringify(id)}),r=e.getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})()`),'Minimum window: '+id+' is reachable through the chat scroll area');
  }
  await shot('compact');
  return {ok:true,checks,transcript:text,fixture:'Synthetic German Windows Hedda speech; Chromium fake audio device. No physical microphone or cloud recognizer.',cloudRequests:0};
 }catch(error){await shot('failed').catch(()=>{});fs.writeFileSync(path.join(directory,'failure.json'),JSON.stringify({error:error.message,checks},null,2));throw error;}
};
