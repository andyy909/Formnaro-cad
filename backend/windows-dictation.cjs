const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto'),{execFile}=require('node:child_process');
const fallback='Windows-Diktat konnte nicht gestartet werden. Klicke in die Nachricht und drücke Win+H.';
function createWindowsDictation({win,helper=path.join(__dirname,'windows-dictation.exe'),pin,platform=process.platform,execute=execFile,processId=process.pid,canStart=async()=>true}={}){
 let pending=false;
 async function open(){
  if(platform!=='win32')throw Error('Windows-Diktat ist nur unter Windows verfügbar.');
  if(pending)throw Error('Windows-Diktat wird bereits gestartet.');
  if(win.isDestroyed()||!win.isFocused())throw Error('Bitte zuerst das Formnaro-Chatfenster aktivieren.');
  pending=true;
  try{
   const expected=pin??JSON.parse(await fs.readFile(path.join(__dirname,'windows-dictation-pin.json'),'utf8'));
   const bytes=await fs.readFile(helper);
   if(bytes.length!==expected.bytes||createHash('sha256').update(bytes).digest('hex')!==expected.sha256)throw Error('Windows-Diktat-Helfer ist beschädigt.');
   if(win.isDestroyed()||!win.isFocused()||!await canStart())throw Error('Bitte zuerst das Nachrichtenfeld aktivieren.');
   const handle=win.getNativeWindowHandle();
   if(!Buffer.isBuffer(handle)||handle.length!==8||handle.readBigUInt64LE()===0n)throw Error(fallback);
   const systemRoot=process.env.SystemRoot??process.env.WINDIR??'C:\\Windows';
   await new Promise((resolve,reject)=>execute(helper,['--dictate',handle.readBigUInt64LE().toString(16),String(processId)],{
    shell:false,windowsHide:true,timeout:3000,maxBuffer:4096,cwd:path.dirname(process.execPath),
    env:{SystemRoot:systemRoot,WINDIR:systemRoot,PATH:path.join(systemRoot,'System32')+';'+systemRoot}
   },error=>error?reject(Error(error.code===3?'Bitte Formnaro im Vordergrund lassen.':error.code===4?'Bitte die Tastaturtasten loslassen und erneut klicken.':fallback)):resolve()));
   return {requested:true};
  }finally{pending=false;}
 }
 return {open};
}
function installWindowsDictation(win,{ipcMain=require('electron').ipcMain,service,entry}={}){
 const {speechEntryMatches}=require('./speech-permissions.cjs');
 service??=createWindowsDictation({win,canStart:()=>win.webContents.executeJavaScript("(()=>{const e=document.getElementById('ai-chat-prompt');return !!e&&document.activeElement===e&&!e.disabled&&!e.readOnly&&e.getClientRects().length>0;})()")});
 ipcMain.handle('cad-speech:windows-dictation',async(event,args)=>{
  try{
   if(args!==undefined||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||!speechEntryMatches(event.senderFrame?.url,entry))throw Error('Windows-Diktat ist nur im Formnaro-Chat verfügbar.');
   return {ok:true,value:await service.open()};
  }catch(error){return {ok:false,error:error.code==='ENOENT'?fallback:error.message};}
 });
 return service;
}
module.exports={createWindowsDictation,installWindowsDictation};
