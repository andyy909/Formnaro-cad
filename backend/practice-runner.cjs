const {spawn}=require('node:child_process');
const {createHash,randomBytes}=require('node:crypto');
const path=require('node:path');
const fs=require('node:fs'),os=require('node:os');
const practiceChildren=new Map();
function cleanupPractice(directory){const record=practiceChildren.get(directory);if(!record)return;try{const resolved=fs.realpathSync(directory),root=fs.realpathSync(record.tempRoot);if(fs.lstatSync(directory).isSymbolicLink()||path.dirname(resolved)!==root||!/^formnaro-practice-[A-Za-z0-9]+$/.test(path.basename(resolved)))return;fs.rmSync(resolved,{recursive:true,force:true,maxRetries:4,retryDelay:50});practiceChildren.delete(directory);}catch(error){if(error.code==='ENOENT')practiceChildren.delete(directory);}}
process.once('exit',()=>{for(const [directory,record]of practiceChildren){try{if(record.child&&!record.child.killed)record.child.kill();}catch{}cleanupPractice(directory);}});
const SHAPES=new Set(require('../ai/OfflineCAD-KI-Kontext.json').shapes.map(s=>s.type));
const {isPracticeUICommand}=require('./practice-ui-policy.cjs');
const {validatePracticeProjectCopy,validatePracticeResultProject}=require('./practice-project-copy.cjs');
const {validatePracticeFiles}=require('./practice-files.cjs');
const {validatePracticeQuality}=require('./practice-quality.cjs');
const ALIAS=/^[a-z][a-z0-9_-]{0,40}$/;
const sketchPoint=value=>Array.isArray(value)&&value.length===2&&[value[0],value[1]].every(n=>Number.isFinite(n)&&Math.abs(n)<=10000);
const photoPoints=value=>Array.isArray(value)&&value.length>=1&&value.length<=16&&value.every(point=>
 Array.isArray(point)&&point.length===2&&point.every(n=>
  typeof n==='number'&&n>=0&&n<=16000000&&/^\d+(?:\.\d{1,6})?$/.test(String(n))));
const FIELDS=new Set(['size-0','size-1','size-2','pos-0','pos-1','pos-2']);
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
const PRACTICE_CONTINUATION_LIMIT=7;
function practiceAliasState(state){
 const names=list=>Array.isArray(list)&&list.length<=256&&new Set(list).size===list.length&&list.every(name=>typeof name==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(name));
 if(!exact(state,['known','selectable','selected'])||!names(state.known)||!names(state.selectable)||!names(state.selected)||
  !state.selectable.every(name=>state.known.includes(name))||!state.selected.every(name=>state.selectable.includes(name)))throw Error('Ungültiger Übungszwischenstand.');
 return structuredClone(state);
}
function validatePracticePlan(value,initialCount=0,continuation){
 if(!exact(value,['version','title','actions'])||value.version!==1||typeof value.title!=='string'||!value.title.trim()||value.title.length>200||!Array.isArray(value.actions)||!value.actions.length||value.actions.length>50)throw Error('Ungültiger Übungsplan.');
 if(!Number.isSafeInteger(initialCount)||initialCount<0||initialCount>8)throw Error('Ungültige Übungsauswahl.');
 let selected=Array.from({length:initialCount},(_,index)=>'existing-'+(index+1));
 const state=continuation===undefined?null:practiceAliasState(continuation);
 if(state)selected=[...state.selected];
 const aliases=new Set(state?.selectable??selected),used=new Set(state?.known??selected);
 const add=v=>{if(typeof v!=='string'||!ALIAS.test(v)||used.has(v))throw Error('Ungültiger oder doppelter Übungsalias.');aliases.add(v);used.add(v);selected=[v];};
 for(const [index,a] of value.actions.entries()){
  if(!a||typeof a!=='object'||Array.isArray(a))throw Error('Ungültiger Übungsschritt.');
  if(a.kind==='shape'){if(!exact(a,['kind','type','as'])||!SHAPES.has(a.type))throw Error('Unbekannte Übungsform.');add(a.as);}
  else if(a.kind==='set'){if(!exact(a,['kind','field','value'])||!FIELDS.has(a.field)||typeof a.value!=='number'||!Number.isFinite(a.value)||Math.abs(a.value)>10000||!/^[-]?(?:\d+)(?:\.\d{1,6})?$/.test(String(a.value))||a.field.startsWith('size-')&&a.value<=0||selected.length!==1)throw Error('Ungültiges Übungsmaß oder keine Einzelauswahl.');}
  else if(a.kind==='role'){if(!exact(a,['kind','value'])||!['solid','hole'].includes(a.value)||selected.length!==1)throw Error('Ungültige Übungsrolle.');}
  else if(a.kind==='select'){if(!exact(a,['kind','targets'])||!Array.isArray(a.targets)||!a.targets.length||a.targets.length>8||new Set(a.targets).size!==a.targets.length||a.targets.some(x=>!aliases.has(x)))throw Error('Ungültige Übungsauswahl.');selected=[...a.targets];}
  else if(a.kind==='group'){if(!exact(a,['kind','as'])||selected.length<2)throw Error('Zum Gruppieren mindestens zwei Übungsformen wählen.');for(const alias of selected)aliases.delete(alias);add(a.as);}
  else if(a.kind==='ui'){
   const needsValue=['set','choose','drag'].includes(a.action);
   if(needsValue&&typeof a.value!=='string')throw Error(`Übungsschritt ${index+1}: ${a.action} benötigt value als Text. Verwende click ohne value für eine Schaltfläche.`);
   if(needsValue&&a.value.length>200)throw Error(`Übungsschritt ${index+1}: value darf höchstens 200 Zeichen haben (erhalten: ${a.value.length}).`);
   if(!exact(a,['kind','action','target','value','text'])||!['click','point','set','choose','drag'].includes(a.action)||typeof a.target!=='string'||a.target.length>240||!/^(?:ui:(?:id|label|tool|menu|view):[^\r\n\x00]+|(?:menu|tool|view):[A-Za-z][A-Za-z0-9_-]{0,199})$/.test(a.target)||!a.target.startsWith('ui:label:')&&!/^(?:ui:)?(?:id|tool|menu|view):[A-Za-z][A-Za-z0-9_-]{0,199}$/.test(a.target)||!needsValue&&a.value!==undefined||a.text!==undefined&&(typeof a.text!=='string'||a.text.length>600))throw Error('Ungültige sichtbare Formnaro-Bedienung.');
  }
  else if(a.kind==='photo-points'){if(!exact(a,['kind','points','text'])||!photoPoints(a.points)||a.text!==undefined&&(typeof a.text!=='string'||a.text.length>600))throw Error('Ungültige Fotopunkte in Originalpixeln.');}
  else if(a.kind==='sketch-gesture'){if(!exact(a,['kind','point','to','add','text'])||!sketchPoint(a.point)||a.to!==undefined&&!sketchPoint(a.to)||a.add!==undefined&&typeof a.add!=='boolean'||a.text!==undefined&&(typeof a.text!=='string'||a.text.length>600))throw Error('Ungültige Skizzengeste. Punkte in Millimetern angeben.');}
  else if(a.kind==='face'){if(!exact(a,['kind','target','side','text'])||typeof a.target!=='string'||!/^[a-z][a-z0-9_-]{0,40}$/.test(a.target)||!['top','bottom','left','right','front','back'].includes(a.side)||a.text!==undefined&&(typeof a.text!=='string'||a.text.length>600))throw Error('Ungültige semantische Flächenauswahl.');}
  else if(a.kind==='gear-snap'){if(!exact(a,['kind','moving','anchor','angle','text'])||![a.moving,a.anchor].every(v=>typeof v==='string'&&ALIAS.test(v))||a.moving===a.anchor||typeof a.angle!=='number'||!Number.isFinite(a.angle)||Math.abs(a.angle)>360||a.text!==undefined&&(typeof a.text!=='string'||a.text.length>600))throw Error('Ungültige Zahnrad-Ziehvorführung.');}
  else if(a.kind==='model'){if(!Array.isArray(a.commands)||a.commands.some(c=>!isPracticeUICommand(c)))throw Error('Im Übungsauftrag sind nur sichtbar bediente Grundformen und Gelenkdialoge erlaubt; direkte Modellbefehle und Skripte sind gesperrt.');if(!exact(a,['kind','label','commands','checks'])||a.label!==undefined&&(typeof a.label!=='string'||a.label.length>200)||!Array.isArray(a.commands)||!a.commands.length||a.commands.length>200||a.commands.some(c=>!c||typeof c!=='object'||Array.isArray(c)||typeof c.op!=='string')||a.checks!==undefined&&(!Array.isArray(a.checks)||a.checks.length>64)||JSON.stringify(a).length>256000)throw Error('Ungültiger Modellierauftrag im Übungsprojekt.');for(const command of a.commands)if(command.as!==undefined){if(typeof command.as!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(command.as)||used.has(command.as))throw Error('Ungültiger oder doppelter Übungsalias.');aliases.add(command.as);used.add(command.as);}}
  else throw Error('Nicht freigegebener Übungsschritt.');
 }
 return structuredClone(value);
}
function installPracticeRunner(win,{ipcMain,app,spawnChild=spawn,timeoutMs=1800000,auditDirectory,windowTraceFile}={}){
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>3600000)throw Error('Ungültiges Übungszeitlimit.');
 let active=null,retainedResult=null;
 const trusted=e=>e.sender===win.webContents&&e.senderFrame===win.webContents.mainFrame&&!win.isDestroyed();
 const done=(value)=>({ok:true,value}),fail=e=>({ok:false,error:String(e.message)});
 ipcMain.handle('cad-practice:project-result',async(e,input)=>{
  try{
   if(!trusted(e))throw Error('Ungültiges Fenster.');
   if(!exact(input,['id','action'])||!retainedResult||input.id!==retainedResult.id)throw Error('Übungsergebnis fehlt oder wurde bereits geschlossen.');
   if(input.action==='read')return done(retainedResult.project);
   if(input.action==='discard'){retainedResult=null;return done(true);}
   throw Error('Unbekannte Aktion für Übungsergebnis.');
  }catch(error){return fail(error);}
 });
 ipcMain.handle('cad-practice:start',async(e,input)=>{try{
  if(!trusted(e))throw Error('Ungültiges Fenster.');if(active)throw Error('Eine Übung läuft bereits.');
  const wrapped = exact(input, ['plan', 'projectCopy', 'files', 'recovery', 'quality']) && Object.hasOwn(input, 'plan');
  const projectCopy = wrapped ? validatePracticeProjectCopy(input.projectCopy) : undefined;
  const files = wrapped ? validatePracticeFiles(input.files) : [];
  const plan = validatePracticePlan(wrapped ? input.plan : input,projectCopy?.selection.length);
  const recovery=wrapped?input.recovery:undefined;
  const quality=wrapped?validatePracticeQuality(input.quality):undefined;
  if(recovery!==undefined&&!['text','image'].includes(recovery))throw Error('Ungültiger Übungsfortsetzungsmodus.');
  retainedResult=null;
  const nonce = randomBytes(24).toString('hex');
  const env={};for(const key of ['SystemRoot','SYSTEMROOT','WINDIR','ComSpec','COMSPEC','TEMP','TMP','PATH','PATHEXT','USERPROFILE','APPDATA','LOCALAPPDATA','PROGRAMDATA','ProgramFiles','ProgramFiles(x86)'])if(process.env[key])env[key]=process.env[key];
  const auditSession=auditDirectory&&projectCopy&&quality?path.join(auditDirectory,'session-'+randomBytes(6).toString('hex')):null;
  if(auditSession)env.FORMNARO_PRACTICE_AUDIT='1';
  const args=app.isPackaged?['--formnaro-practice-child']: [app.getAppPath(),'--formnaro-practice-child'];
  const tempRoot=app.getPath?.('temp')??os.tmpdir(),profileDirectory=fs.mkdtempSync(path.join(tempRoot,'formnaro-practice-'));env.FORMNARO_PRACTICE_DIRECTORY=profileDirectory;practiceChildren.set(profileDirectory,{tempRoot,child:null});
  let child;try{child=spawnChild(process.execPath,args,{cwd:app.isPackaged?path.dirname(process.execPath):app.getAppPath(),env,windowsHide:false,stdio:['ignore','ignore','ignore','ipc']});practiceChildren.get(profileDirectory).child=child;}catch(error){cleanupPractice(profileDirectory);throw error;}
  const createdAt=Date.now();
  const trace=event=>{
   if(!windowTraceFile)return;
   try{
    fs.appendFileSync(windowTraceFile,JSON.stringify({elapsedMs:Date.now()-createdAt,...event})+'\n');
   }catch{/* Optional private verification trace. */}
  };
  trace({state:'spawned'});
  const operation=new Promise((resolve,reject)=>{
   let finished=false,timer=null,idleTimer=null,started=Date.now(),remaining=timeoutMs,paused=false;
   let reply={resolve,reject},continuation=null,retries=0,closingSketchResult;
   const finish=(err,value)=>{
    if(finished)return;
    finished=true;clearTimeout(timer);clearTimeout(idleTimer);
    if(reply)err?reply.reject(err):reply.resolve(value);
    reply=null;continuation=null;
   };
   const complete=value=>{
    if(projectCopy?.sketchDraft){closingSketchResult=value;return;}
    finish(null,value);
   };
   const startClock=()=>{started=Date.now();timer=setTimeout(()=>{try{child.kill();}catch{}finish(Error('Übung hat das aktive Zeitlimit erreicht und wurde beendet.'));},Math.max(1,remaining));};
   const pauseClock=()=>{if(paused||finished)return;paused=true;if(timer)clearTimeout(timer);timer=null;remaining=Math.max(1,remaining-(Date.now()-started));};
   const resumeClock=()=>{if(!paused||finished)return;paused=false;startClock();};startClock();
   const session={child,nonce,finish,ready:false,cancelRequested:false,resume(input){
    if(finished||session.cancelRequested||!continuation||input.id!==continuation.id)
     throw Error('Übungsfortsetzung fehlt oder wurde bereits verwendet.');
    const accept=input.accept===true;
    if(accept?(!continuation.review||Object.hasOwn(input,'plan')):Object.hasOwn(input,'accept'))
     throw Error('Nur eine beratende Übungsprüfung kann ohne weiteren Schritt bestätigt werden.');
    const next=accept?{accept:true}:{plan:validatePracticePlan(input.plan,0,continuation.state)};
    continuation=null;clearTimeout(idleTimer);retries++;
    return new Promise((resolve,reject)=>{
     reply={resolve,reject};
     try{child.send({type:'continue',nonce,...next});}
     catch(error){finish(error);try{child.kill();}catch{}}
    });
   }};
   active=session;child.once('error',err=>{trace({state:'error',code:err.code});if(active?.child===child)active=null;if(child.pid){try{child.kill();}catch{}}else cleanupPractice(profileDirectory);finish(err);});child.once('exit',code=>{
    trace({state:'exit',code});
    if(active?.child===child)active=null;
    cleanupPractice(profileDirectory);
    if(closingSketchResult&&code===0)finish(null,closingSketchResult);
    else{
     if(closingSketchResult?.resultRef&&closingSketchResult.resultRef===retainedResult?.id)retainedResult=null;
     finish(Error('Übungsfenster wurde vor dem Ergebnis geschlossen.'));
    }
   });
   child.on('message',msg=>{if(!msg||typeof msg!=='object')return;if(msg.type==='ready'){if(active?.child!==child||active.ready)return;trace({state:'ready'});active.ready=true;child.send({type:'plan',nonce,plan,...(projectCopy?{projectCopy}:{}),...(files.length?{files}:{}),...(recovery?{recovery}:{}),...(quality?{quality}:{})});if(active.cancelRequested)child.send({type:'cancel',nonce});}else if(msg.type==='focus-parent'&&msg.nonce===nonce){if(!win.isDestroyed()){win.show?.();win.focus?.();}}else if(msg.type==='status'&&msg.nonce===nonce&&typeof msg.paused==='boolean'){trace({state:msg.paused?'paused':'resumed'});if(msg.paused)pauseClock();else resumeClock();}else if(msg.type==='result'&&msg.nonce===nonce&&!finished&&active?.child===child){
    if(!reply||recovery&&msg.round!==retries)return;
    if(!exact(msg.value,['ok','steps','report','reason'])||typeof msg.value.ok!=='boolean'||JSON.stringify(msg.value).length>30000){
     finish(Error('Ungültiger Übungsbericht.'));
     try{child.send({type:'cancel',nonce});}catch{}
     return;
    }
    trace({state:'result',ok:msg.value.ok,round:retries});
    if(active.cancelRequested)return finish(null,{ok:false,reason:'Übung abgebrochen.',steps:[]});
    const review=quality?.mode==='report'&&msg.value.ok&&msg.value.report?.review===true;
    const measured=msg.value.report?.quality,revision=measured?.revision;
    const stage=msg.project&&msg.value.ok?'completed':review?'advisory':measured?.blocked===true?'blocked':null;
    const auditProject=stage==='completed'?msg.project:msg.auditProject;
    if(auditSession&&stage&&auditProject&&/^[0-9a-f]{16}$/.test(revision??''))try{
     if(msg.value.report.revision!==undefined&&msg.value.report.revision!==revision)throw Error('Audit revision changed.');
     const encoded=JSON.stringify(validatePracticeResultProject(auditProject));
     if(Buffer.byteLength(encoded)>16*1024*1024)throw Error('Audit snapshot exceeds the test limit.');
     const sha256=createHash('sha256').update(encoded).digest('hex');
     fs.mkdirSync(auditSession,{recursive:true});
     const header=JSON.stringify({revision,round:retries,stage,sha256,quality:measured});
     fs.writeFileSync(path.join(auditSession,`round-${retries}-${revision}.json`),header.slice(0,-1)+',"project":'+encoded+'}',{flag:'wx'});
    }catch{/* Verification checks the archive separately. The workflow reply is unchanged. */}
    if(msg.waiting===true&&recovery&&retries<PRACTICE_CONTINUATION_LIMIT&&(review||!msg.value.ok&&msg.value.report?.failedAction)){
     try{
      if(!/^[0-9a-f]{16}$/.test(msg.value.report.revision))throw Error('Ungültige Revision des Übungszwischenstands.');
      const state=practiceAliasState(msg.value.report.state);
      continuation={id:randomBytes(24).toString('hex'),state,review};
      const image=recovery==='image'&&typeof msg.image==='string'&&msg.image.length<=2*1024*1024&&/^[A-Za-z0-9+/]+={0,2}$/.test(msg.image)?msg.image:undefined;
      const pending=reply;reply=null;
      idleTimer=setTimeout(()=>{
       finish(Error('Übung wartet zu lange auf eine Korrektur.'));
       try{child.send({type:'cancel',nonce});}catch{}
      },300000);
      idleTimer.unref?.();
      return pending.resolve({...msg.value,continuationId:continuation.id,...(image?{image}:{})});
     }catch(error){finish(error);try{child.send({type:'cancel',nonce});}catch{}return;}
    }
    if(msg.project!==undefined){
     try{
      if(!projectCopy||!msg.value.ok)throw Error('Unerwartetes Übungsergebnis.');
      retainedResult={id:randomBytes(24).toString('hex'),project:validatePracticeResultProject(msg.project)};
      return complete({...msg.value,resultRef:retainedResult.id});
     }catch(error){return finish(error);}
    }
    complete(msg.value);
   }});
  });return done(await operation);
 }catch(error){return fail(error);}});
 ipcMain.handle('cad-practice:continue',async(e,input)=>{try{
  if(!trusted(e))throw Error('Ungültiges Fenster.');
  if(!active||!exact(input,['id','plan','accept']))throw Error('Keine Übungsfortsetzung verfügbar.');
  return done(await active.resume(input));
 }catch(error){return fail(error);}});
 const cancel=()=>{if(!active)return false;active.cancelRequested=true;if(active.ready)active.child.send({type:'cancel',nonce:active.nonce});return true;};
 win.once?.('closed',()=>{retainedResult=null;const current=active;if(!current)return;try{current.child.kill();}catch{}current.finish(Error('Hauptfenster wurde geschlossen. Übung beendet.'));});
 ipcMain.handle('cad-practice:cancel',async(e)=>{try{if(!trusted(e))throw Error('Ungültiges Fenster.');return done(cancel());}catch(error){return fail(error);}});
 return {cancel};
}
module.exports={PRACTICE_CONTINUATION_LIMIT,validatePracticePlan,installPracticeRunner,sketchPoint,practiceAliasState};
