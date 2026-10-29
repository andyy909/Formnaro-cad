const {spawn}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const path=require('node:path');
const ALIAS=/^[a-z][a-z0-9_-]{0,40}$/;
const FIELDS=new Set(['size-0','size-1','size-2','pos-0','pos-1','pos-2']);
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
function validatePracticePlan(value){
 if(!exact(value,['version','title','actions'])||value.version!==1||typeof value.title!=='string'||!value.title.trim()||value.title.length>200||!Array.isArray(value.actions)||!value.actions.length||value.actions.length>50)throw Error('Ungültiger Übungsplan.');
 const aliases=new Set(),used=new Set();let selected=[];
 const add=v=>{if(typeof v!=='string'||!ALIAS.test(v)||used.has(v))throw Error('Ungültiger oder doppelter Übungsalias.');aliases.add(v);used.add(v);selected=[v];};
 for(const a of value.actions){
  if(!a||typeof a!=='object'||Array.isArray(a))throw Error('Ungültiger Übungsschritt.');
  if(a.kind==='shape'){if(!exact(a,['kind','type','as'])||!['box','cylinder'].includes(a.type))throw Error('Unbekannte Übungsform.');add(a.as);}
  else if(a.kind==='set'){if(!exact(a,['kind','field','value'])||!FIELDS.has(a.field)||typeof a.value!=='number'||!Number.isFinite(a.value)||Math.abs(a.value)>10000||!/^[-]?(?:\d+)(?:\.\d{1,6})?$/.test(String(a.value))||a.field.startsWith('size-')&&a.value<=0||selected.length!==1)throw Error('Ungültiges Übungsmaß oder keine Einzelauswahl.');}
  else if(a.kind==='role'){if(!exact(a,['kind','value'])||!['solid','hole'].includes(a.value)||selected.length!==1)throw Error('Ungültige Übungsrolle.');}
  else if(a.kind==='select'){if(!exact(a,['kind','targets'])||!Array.isArray(a.targets)||!a.targets.length||a.targets.length>8||new Set(a.targets).size!==a.targets.length||a.targets.some(x=>!aliases.has(x)))throw Error('Ungültige Übungsauswahl.');selected=[...a.targets];}
  else if(a.kind==='group'){if(!exact(a,['kind','as'])||selected.length<2)throw Error('Zum Gruppieren mindestens zwei Übungsformen wählen.');for(const alias of selected)aliases.delete(alias);add(a.as);}
  else throw Error('Nicht freigegebener Übungsschritt.');
 }
 return structuredClone(value);
}
function installPracticeRunner(win,{ipcMain,app,spawnChild=spawn,timeoutMs=600000}={}){
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>3600000)throw Error('Ungültiges Übungszeitlimit.');
 let active=null;
 const trusted=e=>e.sender===win.webContents&&e.senderFrame===win.webContents.mainFrame&&!win.isDestroyed();
 const done=(value)=>({ok:true,value}),fail=e=>({ok:false,error:String(e.message)});
 ipcMain.handle('cad-practice:start',async(e,input)=>{try{
  if(!trusted(e))throw Error('Ungültiges Fenster.');if(active)throw Error('Eine Übung läuft bereits.');const plan=validatePracticePlan(input),nonce=randomBytes(24).toString('hex');
  const env={};for(const key of ['SystemRoot','SYSTEMROOT','WINDIR','ComSpec','COMSPEC','TEMP','TMP','PATH','PATHEXT','USERPROFILE','APPDATA','LOCALAPPDATA','PROGRAMDATA','ProgramFiles','ProgramFiles(x86)'])if(process.env[key])env[key]=process.env[key];
  const args=app.isPackaged?['--formnaro-practice-child']: [app.getAppPath(),'--formnaro-practice-child'];
  const child=spawnChild(process.execPath,args,{cwd:app.isPackaged?path.dirname(process.execPath):app.getAppPath(),env,windowsHide:false,stdio:['ignore','ignore','ignore','ipc']});
  const result=await new Promise((resolve,reject)=>{
   let finished=false,timer=null,started=Date.now(),remaining=timeoutMs,paused=false;
   const finish=(err,value)=>{if(finished)return;finished=true;if(timer)clearTimeout(timer);err?reject(err):resolve(value);};
   const startClock=()=>{started=Date.now();timer=setTimeout(()=>{try{child.kill();}catch{}finish(Error('Übung hat das aktive Zeitlimit erreicht und wurde beendet.'));},Math.max(1,remaining));};
   const pauseClock=()=>{if(paused||finished)return;paused=true;if(timer)clearTimeout(timer);timer=null;remaining=Math.max(1,remaining-(Date.now()-started));};
   const resumeClock=()=>{if(!paused||finished)return;paused=false;startClock();};startClock();
   active={child,nonce,finish,ready:false,cancelRequested:false};child.once('error',err=>{if(active?.child===child)active=null;finish(err);});child.once('exit',()=>{if(active?.child===child)active=null;finish(Error('Übungsfenster wurde vor dem Ergebnis geschlossen.'));});
   child.on('message',msg=>{if(!msg||typeof msg!=='object')return;if(msg.type==='ready'){if(active?.child!==child||active.ready)return;active.ready=true;child.send({type:'plan',nonce,plan});if(active.cancelRequested)child.send({type:'cancel',nonce});}else if(msg.type==='status'&&msg.nonce===nonce&&typeof msg.paused==='boolean'){if(msg.paused)pauseClock();else resumeClock();}else if(msg.type==='result'&&msg.nonce===nonce){if(!exact(msg.value,['ok','steps','report','reason'])||typeof msg.value.ok!=='boolean'||JSON.stringify(msg.value).length>30000)return finish(Error('Ungültiger Übungsbericht.'));finish(null,msg.value);}});
  });return done(result);
 }catch(error){return fail(error);}});
 const cancel=()=>{if(!active)return false;active.cancelRequested=true;if(active.ready)active.child.send({type:'cancel',nonce:active.nonce});return true;};
 ipcMain.handle('cad-practice:cancel',async(e)=>{try{if(!trusted(e))throw Error('Ungültiges Fenster.');return done(cancel());}catch(error){return fail(error);}});
 return {cancel};
}
module.exports={validatePracticePlan,installPracticeRunner};
