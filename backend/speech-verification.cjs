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
  let status=await run('window.offlinecadDesktop.getSpeechStatus()');
  if(!status.available){
   check(status.downloadRequired&&!status.downloading,'Missing optional model does not start a network download');
   check(await run("!document.getElementById('ai-chat-speech-download').hidden"),'Optional model download is offered inside the program');
   await run("document.getElementById('ai-chat-speech-download').scrollIntoView({block:'nearest'});void 0");
   check(await run("(()=>{const e=document.getElementById('ai-chat-speech-download'),r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})()"),'Download button is reachable in the visible chat scroll area');
   await click('#ai-chat-speech-download');await until("window.offlinecadDesktop.getSpeechStatus().then(s=>s.downloading||s.available)");await shot('model-download');
   await until("window.offlinecadDesktop.getSpeechStatus().then(s=>{if(s.downloadError&&!s.downloading)throw Error(s.downloadError);return s.available;})",1800000);
   check(fs.existsSync(path.join(directory,'portable-data','Sprachmodelle','ggml-large-v3-turbo-q5_0.bin')),'Verified downloaded model is stored in portable data');
   status=await run('window.offlinecadDesktop.getSpeechStatus()');
  }
  check(status.available&&status.local&&status.engine==='Whisper large-v3-turbo','Verified local Whisper model is available without an API key');
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
  const realFetch=global.fetch;let onlineCalls=0;
  try{
   global.fetch=async(url,options)=>{if(!String(url).startsWith('https://api.deepgram.com/v1/listen?'))return realFetch(url,options);onlineCalls++;check(options.method==='POST'&&options.body.length>44&&options.headers['Content-Type']==='audio/wav','Online recognition sends actual recorded audio through the fixed provider endpoint');return new Response(JSON.stringify({results:{channels:[{alternatives:[{transcript:'Online erkannt: Bohrung 8 mm.'}]}]}}));};
   await run("document.getElementById('ai-chat-speech-setup').open=true;document.getElementById('ai-chat-speech-key').value='synthetic-speech-test-key';document.getElementById('ai-chat-speech-key-save').click();void 0");await until("document.getElementById('ai-chat-speech-mode').value==='online'");
   const saved=fs.readFileSync(path.join(directory,'portable-data','Sprache-Online.json'),'utf8');check(!saved.includes('synthetic-speech-test-key')&&saved.includes('encryptedKey'),'Online provider key is saved encrypted in the isolated profile');
   await run("document.getElementById('ai-chat-speech-key').scrollIntoView({block:'nearest'});void 0");await pause(100);check(await run("(()=>{const e=document.getElementById('ai-chat-speech-key'),r=e.getBoundingClientRect();return r.width>0&&r.top>=0&&r.bottom<=innerHeight&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})()"),'Online key entry is reachable through the chat scroll area');await shot('online-setup');
   await click('#ai-chat-mic');await until("document.getElementById('ai-chat-mic').getAttribute('aria-pressed')==='true'");await pause(1800);await click('#ai-chat-mic');await until("!window.__cadTest.aiUI.chat.state().speechBusy");
   check(onlineCalls===1&&await run("document.getElementById('ai-chat-prompt').value.includes('Online erkannt: Bohrung 8 mm.')"),'Actual recorder and IPC insert the online transcript without submitting the chat');
   check(await run('window.__cadTest.serialize()===window.__speechBefore&&window.__cadTest.aiUI.chat.state().historyCount===0'),'Online dictation leaves the project and chat history unchanged');
   await click('#ai-chat-speech-key-clear');await until("document.getElementById('ai-chat-speech-mode').value==='local'");check(!fs.existsSync(path.join(directory,'portable-data','Sprache-Online.json')),'Removing the speech key removes its isolated settings file');
  }finally{global.fetch=realFetch;}
  win.setSize(1000,680);await pause(300);
  for(const id of ['ai-chat-mic','ai-chat-speech-language','ai-chat-speech-mode','ai-chat-send']){
   await run(`document.getElementById(${JSON.stringify(id)}).scrollIntoView({block:'nearest'})`);await pause(100);
   check(await run(`(()=>{const e=document.getElementById(${JSON.stringify(id)}),r=e.getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})()`),'Minimum window: '+id+' is reachable through the chat scroll area');
  }
  await shot('compact');
  return {ok:true,checks,transcript:text,fixture:'Synthetic German Windows Hedda speech; Chromium fake audio device. No physical microphone or cloud recognizer.',cloudRequests:0};
 }catch(error){await shot('failed').catch(()=>{});fs.writeFileSync(path.join(directory,'failure.json'),JSON.stringify({error:error.message,checks},null,2));throw error;}
};
