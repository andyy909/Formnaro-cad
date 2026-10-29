import {cadFormLocalDimensions,cadFormPosition} from './cad-interface-state.js';

// Runs only in the separately provisioned practice window. All edits go through
// the visible product controls and the child process's bounded input bridge.
export function installCadPracticeRunner({desktop,controller,getSelection,settled}){
 if(!desktop?.onPracticePlan||!desktop?.practiceInput||!desktop?.submitPracticeResult||!desktop?.practiceReady)return false;
 let running=false,stopped=false,paused=false,unpause=null,expectedInput=null,captionBeforePause='',completedSteps=[],pauseError=null,statusQueue=Promise.resolve(),pauseGeneration=0,mainGeneration=0;
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const overlay=document.createElement('div');overlay.id='practice-overlay';
 overlay.style.cssText='position:fixed;inset:0;z-index:2147483000;pointer-events:none;font-family:system-ui,sans-serif';
 overlay.innerHTML='<div id="practice-pointer" aria-hidden="true" style="position:fixed;left:0;top:0;width:30px;height:38px;filter:drop-shadow(1px 2px 2px #0008);transition:transform .65s ease;display:none"><svg width="30" height="38" viewBox="0 0 30 38"><path d="M2 2 L2 28 L9 22 L17 35 L22 32 L15 20 L27 19 Z" fill="white" stroke="#0075d3" stroke-width="3"/></svg></div><section style="pointer-events:auto;position:fixed;left:20px;bottom:54px;max-width:420px;background:white;border:2px solid #1686d6;border-radius:12px;box-shadow:0 4px 20px #0005;padding:12px;color:#15304a"><strong>Übungsmodus · eigenes Testprojekt</strong><div id="practice-caption" style="margin:7px 0"></div><button id="practice-pause" type="button">Pause</button> <button id="practice-stop" type="button">Stop · Esc</button></section>';
 document.body.append(overlay);const pointer=overlay.querySelector('#practice-pointer'),caption=overlay.querySelector('#practice-caption'),pauseButton=overlay.querySelector('#practice-pause');
 const stop=()=>{stopped=true;paused=false;unpause?.();void desktop.practiceAbort?.().catch(()=>{});};overlay.querySelector('#practice-stop').onclick=stop;
 function notifyPause(value,generation){
  statusQueue=statusQueue.then(async()=>{if(!desktop.practiceStatus)throw Error('Pausensteuerung ist nicht verfügbar.');const result=await desktop.practiceStatus(value?{paused:true}:{paused:false,generation});if(result?.ok===false)throw Error(result.reason||result.error||'Pausensteuerung fehlgeschlagen.');if(Number.isSafeInteger(result?.generation))mainGeneration=Math.max(mainGeneration,result.generation);}).catch(error=>{pauseError=Error('Übung konnte nicht sicher pausiert oder fortgesetzt werden: '+String(error?.message||error));caption.textContent=pauseError.message;stop();});
  return statusQueue;
 }
 function enterPause(message){if(!running||paused)return;captionBeforePause=caption.textContent;paused=true;pauseGeneration++;pauseButton.textContent='Weiter';if(message)caption.textContent=message;void notifyPause(true);}
 pauseButton.onclick=()=>{if(!running)return;if(!paused){enterPause('Übung pausiert. Mit Weiter fortsetzen.');return;}const generation=pauseGeneration;pauseButton.disabled=true;void (async()=>{await statusQueue;if(stopped||generation!==pauseGeneration)return;await notifyPause(false,mainGeneration);if(stopped||generation!==pauseGeneration)return;paused=false;pauseButton.textContent='Pause';if(captionBeforePause)caption.textContent=captionBeforePause;unpause?.();})().finally(()=>{pauseButton.disabled=false;});};
 function onFocusLost(event){if(Number.isSafeInteger(event?.generation))mainGeneration=Math.max(mainGeneration,event.generation);if(running){if(paused){pauseGeneration++;void notifyPause(true);caption.textContent='Pausiert: Übungsfenster wieder öffnen und Weiter wählen.';}else enterPause('Pausiert: Übungsfenster wieder öffnen und Weiter wählen.');}}
 window.addEventListener('blur',onFocusLost);desktop.onPracticeBlur?.(onFocusLost);
 // Native injected input and user input both arrive as trusted events. Only
 // allow events at the currently sequenced target; a click elsewhere stops the
 // exercise before it can change its selection or invalidate the next action.
 window.addEventListener('pointerdown',event=>{if(!running||!event.isTrusted||overlay.contains(event.target))return;if(!paused&&expectedInput?.contains(event.target))return;if(!paused)stop();event.preventDefault();event.stopImmediatePropagation();},true);
 window.addEventListener('keydown',event=>{if(!running||!event.isTrusted)return;if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();stop();return;}if(overlay.contains(event.target))return;if(paused||!expectedInput?.contains(event.target)){if(!paused)stop();event.preventDefault();event.stopImmediatePropagation();}},true);
 async function checkpoint(){await statusQueue;if(pauseError)throw pauseError;if(stopped)throw Object.assign(Error('Übung abgebrochen.'),{code:'PRACTICE_CANCELLED'});while(paused){await new Promise(resolve=>{unpause=resolve;});unpause=null;await statusQueue;if(pauseError)throw pauseError;if(stopped)throw Object.assign(Error('Übung abgebrochen.'),{code:'PRACTICE_CANCELLED'});}}
 async function waitFor(predicate,label){let elapsed=0;while(elapsed<45000){await checkpoint();const started=Date.now();await settled();if(predicate())return;await pause(80);elapsed+=Date.now()-started;}throw Error('Übung: '+label+' wurde nicht bestätigt.');}
 const project=()=>controller.readSnapshot(),revision=()=>controller.revision();
 const selected=()=>getSelection().filter(s=>!s.path.length).map(s=>s.rootId);
 const node=id=>project().nodes.find(n=>n.id===id);
 function element(target,rootId){
  let list;if(target==='tree')list=[...document.querySelectorAll('#object-list [data-root-id]')].filter(e=>e.dataset.rootId===rootId&&e.dataset.path==='[]').map(row=>row.querySelector('.object-label')).filter(Boolean);
  else if(target.startsWith('shape:'))list=[...document.querySelectorAll('.shape-tile[data-type]')].filter(e=>e.dataset.type===target.slice(6)&&!e.dataset.plugin);
  else if(target==='group')list=[...document.querySelectorAll('[data-action="group"],[data-solid-command="group"],[data-fusion-command="group"]')];
  else if(target==='fit')list=[...document.querySelectorAll('button[data-action="fit"]')];
  else list=[document.getElementById(target==='chat-toggle'?'ai-chat-toggle':target)].filter(Boolean);
  return list.find(e=>e.getClientRects().length&&!e.disabled&&getComputedStyle(e).visibility!=='hidden');
 }
 async function input(spec,text){
  await checkpoint();const target=element(spec.target,spec.rootId);if(!target)throw Error('Bedienelement im Übungsfenster nicht verfügbar: '+spec.target);
  target.scrollIntoView({block:'nearest',inline:'nearest'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));await checkpoint();
  const box=target.getBoundingClientRect();pointer.style.display='block';pointer.style.transform=`translate(${Math.max(0,box.left+box.width/2)}px,${Math.max(0,box.top+box.height/2)}px)`;caption.textContent=text;await pause(1300);await checkpoint();
  expectedInput=target;try{await desktop.practiceInput(spec);}finally{expectedInput=null;}await checkpoint();await pause(300);
 }
 const setFields=new Set(['size-0','size-1','size-2','pos-0','pos-1','pos-2']);
 async function run(plan){
  if(running)throw Error('Übung läuft bereits.');if(project().nodes.length)throw Error('Übungsprojekt muss leer sein.');
  if(!plan||plan.version!==1||!Array.isArray(plan.actions)||plan.actions.length<1||plan.actions.length>50)throw Error('Ungültiger Übungsplan.');
  running=true;stopped=false;paused=false;pauseError=null;statusQueue=Promise.resolve();overlay.hidden=false;const aliases=new Map(),checks=[];completedSteps=checks;
  try{const chat=document.getElementById('ai-chat-toggle');if(chat?.getAttribute('aria-expanded')==='true'){await input({target:'chat-toggle',action:'click'},'KI-Chat einklappen, damit die Maßeingaben sichtbar sind.');await waitFor(()=>chat.getAttribute('aria-expanded')==='false','KI-Chat einklappen');}
  for(let i=0;i<plan.actions.length;i++){
   await checkpoint();const action=plan.actions[i],prefix=`${i+1}/${plan.actions.length} · `;
   if(action.kind==='shape'){
    if(!['box','cylinder'].includes(action.type)||typeof action.as!=='string'||aliases.has(action.as))throw Error('Unzulässige Form oder Alias.');
    const before=new Set(project().nodes.map(n=>n.id));await input({target:'shape:'+action.type,action:'click'},prefix+'Grundform '+(action.type==='box'?'Quader':'Zylinder')+' anklicken.');
    await waitFor(()=>project().nodes.filter(n=>!before.has(n.id)).length===1,'Form hinzufügen');const added=project().nodes.find(n=>!before.has(n.id));
    if(!added||added.kind!=='cad'||added.recipe?.type!==action.type||!selected().includes(added.id))throw Error('Neue Form oder Auswahl stimmt nicht mit dem Auftrag überein.');aliases.set(action.as,added.id);checks.push({kind:'shape',alias:action.as,id:added.id});if(before.size===0)await input({target:'fit',action:'click'},'Modell einpassen, damit das Teil gut zu sehen ist.');
   }else if(action.kind==='set'){
    if(!setFields.has(action.field)||!Number.isFinite(action.value)||Math.abs(action.value)>100000||action.field.startsWith('size-')&&action.value<=0)throw Error('Unzulässiger Wert im Übungsplan.');
    const ids=selected();if(ids.length!==1||!node(ids[0]))throw Error('Ein einzelnes Übungsteil auswählen.');const id=ids[0],axis=Number(action.field.slice(-1)),size=action.field.startsWith('size-');
    const measured=()=>size?cadFormLocalDimensions(node(id))[axis]:cadFormPosition(project(),{rootId:id,path:[]})[axis];
    const before=measured();await input({target:action.field,action:'set',value:String(action.value)},prefix+(size?'Größe ':'Position ')+('XYZ'[axis])+' = '+action.value+' mm eingeben.');
    await waitFor(()=>!!node(id)&&Math.abs(measured()-action.value)<1e-5,'Eingabewert');checks.push({kind:'set',field:action.field,expected:action.value,actual:measured(),previous:before});if(size&&action.value>before*1.3)await input({target:'fit',action:'click'},'Größeres Teil erneut in die Ansicht einpassen.');
   }else if(action.kind==='role'){
    if(!['solid','hole'].includes(action.value))throw Error('Unzulässige Rolle.');const ids=selected();if(ids.length!==1)throw Error('Für die Rolle genau ein Teil auswählen.');const id=ids[0];
    await input({target:action.value==='hole'?'hole-btn':'solid-btn',action:'click'},prefix+(action.value==='hole'?'Als Lochform markieren.':'Als Körper markieren.'));
    await waitFor(()=>node(id)?.solid===(action.value==='solid'),'Körper-/Lochrolle');checks.push({kind:'role',value:action.value,id});
   }else if(action.kind==='select'){
    if(!Array.isArray(action.targets)||!action.targets.length||action.targets.length>8||new Set(action.targets).size!==action.targets.length)throw Error('Ungültige Auswahl.');
    const ids=action.targets.map(alias=>aliases.get(alias));if(ids.some(id=>!id||!node(id)))throw Error('Übungsteil für Auswahl fehlt.');const flags=ids.map(id=>({hidden:!!node(id).hidden,locked:!!node(id).locked}));
    for(let n=0;n<ids.length;n++){await input({target:'tree',action:'click',rootId:ids[n],append:n>0},prefix+(n?'Mit Umschalt zusätzlich auswählen.':'Teil im Objektbaum auswählen.'));await waitFor(()=>ids.slice(0,n+1).every(id=>selected().includes(id))&&selected().length===n+1,'Auswahl');}
    if(ids.some((id,i)=>!!node(id)?.hidden!==flags[i].hidden||!!node(id)?.locked!==flags[i].locked))throw Error('Auswahl hat Sichtbarkeit oder Sperre unerwartet verändert.');checks.push({kind:'select',targets:action.targets,visibilityAndLocksUnchanged:true});
   }else if(action.kind==='group'){
    if(typeof action.as!=='string'||aliases.has(action.as)||selected().length<2)throw Error('Mindestens zwei Übungsteile für Gruppierung auswählen.');const ids=selected(),before=revision();
    await input({target:'group',action:'click'},prefix+'Auswahl gruppieren und Lochformen abziehen.');
    await waitFor(()=>revision()!==before&&selected().length===1&&!!node(selected()[0]),'Gruppierung');const result=node(selected()[0]);
    if(!ids.every(id=>result.children?.some(child=>child.id===id)))throw Error('Gruppierung enthält nicht die ausgewählten Quellen.');aliases.set(action.as,result.id);checks.push({kind:'group',id:result.id,sources:ids,solids:result.stats?.solids,volume:result.stats?.volume});await input({target:'fit',action:'click'},'Fertiges Teil für eine gute Ansicht einpassen.');
   }else throw Error('Nicht freigegebener Übungsschritt.');
  }
  caption.textContent='Übung abgeschlossen. Alle Schritte wurden im getrennten Testprojekt ausgeführt.';pointer.style.display='none';return {ok:true,steps:checks,report:{revision:revision(),objectCount:project().nodes.length,selectionCount:selected().length}};
  }finally{running=false;paused=false;unpause?.();}
 }
 desktop.onPracticePlan(plan=>{void run(plan).then(result=>desktop.submitPracticeResult(result),error=>{const reason=String((pauseError||error).message);caption.textContent=reason;pointer.style.display='none';return desktop.submitPracticeResult({ok:false,reason,steps:completedSteps});});});
 desktop.onPracticeCancel?.(stop);void desktop.practiceReady();return true;
}
