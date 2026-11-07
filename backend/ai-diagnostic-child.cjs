const {spawn}=require('node:child_process'),path=require('node:path'),fs=require('node:fs');
function openDiagnosticChild({app,directory,executable=process.execPath}){
 fs.mkdirSync(directory,{recursive:true});const env={...process.env,FORMNARO_PRACTICE_DIRECTORY:directory};delete env.ELECTRON_RUN_AS_NODE;
 const child=spawn(executable,[...(app.isPackaged?[]:[app.getAppPath()]),'--formnaro-diagnostic-child'],{env,cwd:app.isPackaged?path.dirname(executable):app.getAppPath(),windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
 const observers=new Set(),activityObservers=new Set();const pending=new Map();let seq=0,exited=false,finish;
 const exit=new Promise(resolve=>{finish=resolve;});
 function rejectPending(error){for(const p of pending.values()){clearTimeout(p.timer);p.reject(error);}pending.clear();}
 function ended(value){if(exited)return;exited=true;rejectPending(Error('Testfenster geschlossen.'));finish(value);}
 child.on('message',m=>{if(m?.type==='practice-activity'){if(pending.get(m.callId)?.method==='practice'&&m.value&&['spawned','ready','paused','resumed','input-start','input-finished','result','exit'].includes(m.value.phase)){const value={phase:m.value.phase,elapsedMs:m.value.elapsedMs,...(typeof m.value.target==='string'?{target:m.value.target.slice(0,240)}:{}),...(typeof m.value.reason==='string'?{reason:m.value.reason.slice(0,60)}:{})};for(const observer of activityObservers)observer(value);}return;}if(m?.type==='practice-observation'){
  if(pending.get(m.callId)?.method!=='practice')return;
  Promise.resolve().then(async()=>{const value=require('./practice-observations.cjs').validateObservation(m.value);for(const observer of observers)await observer(value);if(!pending.has(m.callId))throw Error('Übungsauftrag beendet.');send({type:'practice-observation-reply',callId:m.callId,observationId:m.observationId});}).catch(error=>send({type:'practice-observation-reply',callId:m.callId,observationId:m.observationId,error:String(error.message).slice(0,1500)}));return;
 }const p=pending.get(m?.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Object.assign(Error(m.error),{code:m.code})):p.resolve(m.value);});
 child.once('exit',(code,signal)=>ended({code,signal}));
 child.once('error',e=>ended({code:null,signal:'spawn-error',error:e.message}));
 function send(message){if(child.connected)child.send(message,()=>{});}
 function call(method,args={},timeout=180000){if(exited)return Promise.reject(Error('Testfenster beendet.'));return new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('Testfenster-Zeitlimit: '+method));},timeout);pending.set(id,{resolve,reject,timer,method});send({id,method,args});});}
 return {call,onPracticeActivity(callback){activityObservers.add(callback);return ()=>activityObservers.delete(callback);},onPracticeObservation(callback){observers.add(callback);return ()=>observers.delete(callback);},async close(){
  if(exited)return exit;send({id:++seq,method:'close',args:{}});let timer;
  const timeout=new Promise(resolve=>{timer=setTimeout(()=>{child.kill();resolve(null);},10000);});const normal=await Promise.race([exit,timeout]);clearTimeout(timer);if(normal)return normal;
  const forced=await Promise.race([exit,new Promise(resolve=>{timer=setTimeout(()=>resolve({code:null,signal:'exit-unconfirmed'}),5000);})]);clearTimeout(timer);return {...forced,forced:true};
 },cancel(){rejectPending(Object.assign(Error('Testberechnung abgebrochen.'),{name:'AbortError'}));if(!exited)send({id:++seq,method:'cancel',args:{}});}};
}
function installDiagnosticChild(win){
 const js=code=>win.webContents.executeJavaScript(code,true);
 let ready,protectedNodes=[],activeRPC=null,practiceCallId=null,observationId=0;const stepReplies=new Map();const loaded=new Promise(resolve=>win.webContents.once('did-finish-load',resolve));
 async function init(){await loaded;for(let i=0;i<600;i++){if(await js('!!window.__cadTest').catch(()=>false))return;await new Promise(r=>setTimeout(r,100));}throw Error('Testprojekt konnte nicht geladen werden.');}
 ready=init();
 const unsubscribe=require('./practice-observations.cjs').observePractice(win,value=>new Promise((resolve,reject)=>{
  if(practiceCallId===null)return reject(Error('Kein aktiver Diagnose-Übungsauftrag.'));
  const id=++observationId,callId=practiceCallId,timer=setTimeout(()=>{stepReplies.delete(id);reject(Error('Diagnose-Schrittüberwachung antwortet nicht.'));},require('./ai-monitor-timing.cjs').DIAGNOSTIC_STEP_TIMEOUT_MS);stepReplies.set(id,{resolve,reject,timer,callId});process.send?.({type:'practice-observation',callId,observationId:id,value});
 }));
 const unsubscribeActivity=require('./practice-observations.cjs').observePracticeActivity(win,value=>{if(practiceCallId!==null)process.send?.({type:'practice-activity',callId:practiceCallId,value});});
 win.once('closed',()=>{unsubscribe();unsubscribeActivity();for(const p of stepReplies.values()){clearTimeout(p.timer);p.reject(Error('Testfenster geschlossen.'));}stepReplies.clear();});
 process.on('disconnect',()=>{if(!win.isDestroyed())win.close();});
 process.on('message',async m=>{if(m?.type==='practice-observation-reply'){const p=stepReplies.get(m.observationId);if(p&&p.callId===m.callId){stepReplies.delete(m.observationId);clearTimeout(p.timer);m.error?p.reject(Error(m.error)):p.resolve(true);}return;}if(!m||!Number.isSafeInteger(m.id))return;try{
  if(m.method==='close'){process.send?.({id:m.id,value:true});win.close();return;}
  await ready;let value;
  if(m.method==='cancel'){await js(`window.__cadTest.externalAutomation.cancel(${JSON.stringify(activeRPC)});window.__cadTest.cancel();window.offlinecadDesktop.cancelPractice()`);value=true;}
  else if(m.method==='setup'){
   const fixture=require('./ai-test-lab-cases.cjs').taskInstance(m.args.caseId,m.args.dataset??'development');
   value=await js(`(async()=>{const t=window.__cadTest,a=t.access;await t.resetProject();await t.settled();if(${JSON.stringify(!!m.args.project)}){await t.controller.open(${JSON.stringify(m.args.project??null)});await t.refresh();}else{const p=await a.preview({revision:a.scene().revision,label:'Diagnose-Ausgangsmodell',commands:${JSON.stringify(fixture.fixture)}});await a.apply({previewId:p.previewId,revision:p.revision});}await t.settled();const s=a.scene();t.select(s.objects.filter(o=>!o.target.path.length&&o.name!=='Unbeteiligtes Teil'&&(!${JSON.stringify(fixture.selectName??null)}||o.name===${JSON.stringify(fixture.selectName??null)})).map(o=>o.target));a.fitView?.();return {scene:await a.dispatch('scene',{}),project:a.project(),context:await a.dispatch('context',{profile:'compact'}),validationContext:await a.dispatch('context',{profile:'full'})};})()`);
   protectedNodes=value.project.nodes.filter(n=>!value.scene.selectionTargets.some(t=>t.rootId===n.id));
  }else if(m.method==='providerScene')value=await js(`window.__cadTest.access.dispatch('scene',${JSON.stringify(m.args.scope==='selection'?{targets:m.args.targets}:{})})`);
  else if(m.method==='frame')value=await js(`(()=>{const t=window.__cadTest;t.view.fit(${m.args.scope==='selection'?JSON.stringify(m.args.targets):'undefined'});return true;})()`);
  else if(m.method==='practice'){practiceCallId=m.id;try{value=await js(`(async()=>{const d=window.offlinecadDesktop,result=await d.startPractice(${JSON.stringify(m.args)});let project;if(result.resultRef){project=await d.practiceProjectResult({id:result.resultRef,action:'read'});await d.practiceProjectResult({id:result.resultRef,action:'discard'});}return {result,project};})()`);}finally{practiceCallId=null;}}
  else if(m.method==='loadResult')value=await js(`(async()=>{await window.__cadTest.controller.open(${JSON.stringify(m.args.project)});await window.__cadTest.refresh();await window.__cadTest.settled();return true;})()`);
  else if(m.method==='protect')value=await js(`(()=>{const a=window.__cadTest.access,after=a.getPreview(${JSON.stringify(m.args.previewId)});return {passed:${JSON.stringify(protectedNodes)}.every(before=>JSON.stringify(before)===JSON.stringify(after?.nodes.find(n=>n.id===before.id)))};})()`);
  else if(m.method==='capture'){const image=await js(`window.__cadTest.access.dispatch('screenshot',${JSON.stringify(m.args??{})})`);value='data:'+image.mimeType+';base64,'+image.dataBase64;}
  else if(m.method==='undo')value=await js('(async()=>{const t=window.__cadTest;await t.controller.undo();await t.refresh();await t.settled();return true;})()');
  else if(m.method==='snapshot')value=await js('(async()=>{const t=window.__cadTest;await t.settled();return {scene:await t.access.dispatch("scene",{}),project:t.access.project()};})()');
  else if(m.method==='rpc'){
   if(!['context','scene','project','command_info','preview','apply','discard','analysis','screenshot','ui'].includes(m.args.method))throw Error('Werkzeug im Test nicht freigegeben.');
   if(m.args.method==='ui'&&!['state','help','guide'].includes(m.args.args?.action))throw Error('Im API-Test nur lesende UI-Auskunft verwenden; Modellierung über preview.');
   activeRPC=m.id;
   try{value=await js(`window.__cadTest.externalAutomation.run(${JSON.stringify(m.args.method)},${JSON.stringify(m.args.args??{})},${m.id})`);}finally{if(activeRPC===m.id)activeRPC=null;}
  }else throw Error('Unbekannte Testaktion.');
  process.send?.({id:m.id,value});
 }catch(e){process.send?.({id:m.id,error:e.message,code:e.code});}});
}
module.exports={openDiagnosticChild,installDiagnosticChild};
