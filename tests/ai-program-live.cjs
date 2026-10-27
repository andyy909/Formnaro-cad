// Explicit opt-in only. This test makes a real request to the already configured
// provider using its existing encrypted credentials, held in memory only.
const {app,BrowserWindow,safeStorage,session}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const {createAIProfiles}=require('../backend/ai-profiles.cjs');
const {generate}=require('../backend/ai-provider.cjs');
const out=path.resolve('work/ai-program/live');fs.mkdirSync(out,{recursive:true});
const profile=fs.mkdtempSync(path.join(out,'isolated-profile-'));
// Electron's protected key depends on the profile's OS-encrypted crypt key.
// Copy only that encrypted metadata into this disposable profile, never the
// source profile/cache or a plaintext key. The source files stay read-only.
const statePath=path.join(process.env.APPDATA,'offlinecad','Local State');
if(process.argv.includes('--authorized-real-provider')&&fs.existsSync(statePath)){const state=JSON.parse(fs.readFileSync(statePath,'utf8'));if(state.os_crypt)fs.writeFileSync(path.join(profile,'Local State'),JSON.stringify({os_crypt:state.os_crypt}));}
app.setPath('userData',profile);
app.whenReady().then(async()=>{
 let win;
 try{
  if(process.argv.includes('--replay-saved-answer')){
   session.defaultSession.webRequest.onBeforeRequest((d,done)=>done({cancel:/^https?:/.test(d.url)}));
   win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
   await win.loadFile(path.resolve('work/ai-program/browser-dist/tests/fixtures/ai-program-browser.html'));
   const answer=JSON.parse(fs.readFileSync(path.join(out,'answer-1.json'),'utf8'));
   const input=await win.webContents.executeJavaScript('window.programLiveInput()');answer.revision=input.scene.revision;
   const result=await win.webContents.executeJavaScript('window.programLivePreview('+JSON.stringify(answer)+')');
   fs.writeFileSync(path.join(out,'plate.stl'),Buffer.from(result.stl));delete result.stl;
   fs.writeFileSync(path.join(out,'replay-result.json'),JSON.stringify({...result,model:answer.usage?.model,realGeneratedAnswer:true,replayedLocally:true,additionalProviderRequests:0},null,2));
   console.log(JSON.stringify({ok:true,model:answer.usage?.model,checks:result.checks.length,additionalProviderRequests:0}));app.exit(0);return;
  }
  if(!process.argv.includes('--authorized-real-provider'))throw Error('Explicit authorization required.');
  const source=path.join(process.env.APPDATA,'offlinecad','ai-settings.json');
  let decryptCalls=0,decryptFailed=false;
  const profiles=createAIProfiles({stored:JSON.parse(fs.readFileSync(source,'utf8')),decrypt:encrypted=>{decryptCalls++;try{return safeStorage.decryptString(Buffer.from(encrypted,'base64'));}catch(error){decryptFailed=true;throw error;}},canEncrypt:()=>safeStorage.isEncryptionAvailable(),persist:()=>{throw Error('Read-only credentials');}});
  const {config,key}=profiles.active();if(!key)throw Error('Existing provider credential is unavailable. '+JSON.stringify({provider:new URL(config.baseUrl).hostname,model:config.model,decryptCalls,decryptFailed,canDecrypt:safeStorage.isEncryptionAvailable()}));
  const metadata={provider:new URL(config.baseUrl).hostname,model:config.model,realProvider:true};console.log(JSON.stringify(metadata));
  session.defaultSession.webRequest.onBeforeRequest((d,done)=>done({cancel:/^https?:/.test(d.url)}));
  win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
  await win.loadFile(path.resolve('work/ai-program/browser-dist/tests/fixtures/ai-program-browser.html'));
  const input=await win.webContents.executeJavaScript('window.programLiveInput()');
  const prompt='Konkrete Funktionsprobe an einem leeren künstlichen Testprojekt. Konstruiere genau eine fertige native CAD-Platte 60 x 40 x 4 mm, mittig bei X=0/Y=0, Unterseite Z=0. Zwei durchgehende Bohrungen Durchmesser 4,5 mm bei X=-20 und +20, jeweils Y=0. Verwende für diese Probe einen op:script-Befehl und ein zusätzliches internes ES-Werkzeugmodul in modules, das du mit api.importTool importierst. Benutze darin die normalen CAD-Werkzeuge über api.run. Rechne selbst; keine Dateizugriffe, kein Netz, keine externen Bibliothekspfade. Gib für das fertige Ergebnis einen Alias result aus und passende top-level checks. Kein Übernehmen, keine Rückfrage. Nutze die genaue dokumentierte API. Bericht: kurz auf Deutsch.';
  const attempts=[];let correction='',passed;
  for(let attempt=0;attempt<2;attempt++){
   const answer=await generate(config,key,{...input,prompt,chat:true,correction},AbortSignal.timeout(240000));
   fs.writeFileSync(path.join(out,'answer-'+(attempt+1)+'.json'),JSON.stringify(answer,null,2));
   if(!answer.commands?.some(c=>c.op==='script'&&c.modules))throw Error('Provider did not use the requested internal tool module.');
   try{passed=await win.webContents.executeJavaScript('window.programLivePreview('+JSON.stringify(answer)+')');attempts.push({ok:true,usage:answer.usage});break;}
   catch(error){attempts.push({ok:false,message:error.message,usage:answer.usage});correction='Die lokale Vorschau ist fehlgeschlagen; nichts übernommen. Behalte alle Anforderungen. Lokaler Fehler: '+error.message;}
  }
  if(!passed?.ok)throw Error('No valid result from the real provider: '+JSON.stringify(attempts.map(a=>({ok:a.ok,message:a.message}))));
  fs.writeFileSync(path.join(out,'plate.stl'),Buffer.from(passed.stl));delete passed.stl;fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({...metadata,...passed,attempts},null,2));
  console.log(JSON.stringify({ok:true,provider:metadata.provider,model:metadata.model,attempts:attempts.length,checks:passed.checks.length,undoExact:passed.undoExact}));app.exit(0);
 }catch(error){fs.writeFileSync(path.join(out,process.argv.includes('--replay-saved-answer')?'replay-result.json':'result.json'),JSON.stringify({ok:false,message:String(error.message)},null,2));console.error(String(error.message));app.exit(1);}
});
