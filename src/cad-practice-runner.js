import {installPracticeGearDrag} from './cad-practice-gear-drag.js';
import {practiceControl,installPracticeControlBridge} from './cad-practice-controls.js';
import {createPracticeModelUI} from './cad-practice-model-ui.js';
import {createPracticePlayback} from './cad-practice-playback.js';
import {CAD_SHAPES} from './cad-shapes.js';
import {cadFormLocalDimensions,cadFormPosition} from './cad-interface-state.js';
import {createPracticeFraming,practiceSceneExtent} from './cad-practice-framing.js';

// Runs only in the separately provisioned practice window. All edits go through
// the visible product controls and the child process's bounded input bridge.
export function installCadPracticeRunner({desktop,controller,access,getSelection,settled,view,getPreferences}){
 if(!desktop?.onPracticePlan||!desktop?.practiceInput||!desktop?.submitPracticeResult||!desktop?.practiceReady)return false;
 let running=false,stopped=false,closing=false,paused=false,unpause=null,expectedInput=null,captionBeforePause='',completedSteps=[],pauseError=null,statusQueue=Promise.resolve(),pauseGeneration=0,mainGeneration=0;
 installPracticeControlBridge(document,window);if(view){window.__formnaroPracticeGearPreferences=getPreferences;installPracticeGearDrag({controller,view});}
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const overlay=document.createElement('div');overlay.id='practice-overlay';overlay.hidden=true;
 overlay.style.cssText='position:fixed;inset:0;z-index:2147483000;pointer-events:none;font-family:system-ui,sans-serif';
 overlay.innerHTML='<div id="practice-pointer" aria-hidden="true" style="position:fixed;left:0;top:0;width:30px;height:38px;filter:drop-shadow(1px 2px 2px #0008);transition:transform .65s ease;display:none"><svg width="30" height="38" viewBox="0 0 30 38"><path d="M2 2 L2 28 L9 22 L17 35 L22 32 L15 20 L27 19 Z" fill="white" stroke="#0075d3" stroke-width="3"/></svg></div><style>.practice-active-target{outline:3px solid #087fca!important;outline-offset:4px!important}</style><section style="pointer-events:auto;position:fixed;left:20px;bottom:54px;max-width:420px;background:white;border:2px solid #1686d6;border-radius:12px;box-shadow:0 4px 20px #0005;padding:12px;color:#15304a"><strong>Übungsmodus · eigenes Testprojekt</strong><strong id="practice-interaction-warning" role="note" aria-live="polite" style="display:block;margin:10px 0;padding:10px 12px;background:#fff0b3;border:2px solid #b87800;border-radius:7px;color:#503000;font-size:18px;font-weight:800;line-height:1.35">Vorführung läuft. Tempo, Pause und Stop kannst du jederzeit bedienen.</strong><span style="display:block;font-size:13px;font-weight:600">Wegklicken pausiert. Mit Weiter fortsetzen oder Übung beenden.</span><label style="display:block;margin:8px 0">Tempo <output id="practice-speed-output">50 %</output><input id="practice-speed" aria-label="Übungstempo in Prozent" type="range" min="10" max="300" step="5" value="50" style="display:block;width:100%;min-width:280px;padding:8px 0"><span style="display:flex;justify-content:space-between;font-size:12px"><span>10 % · langsam</span><span>300 % · schnell</span></span></label><div id="practice-caption" style="margin:7px 0"></div><button id="practice-pause" type="button">Pause</button> <button id="practice-stop" type="button">Übung beenden · Esc</button></section>';
 document.body.classList?.add('formnaro-practice');document.title='Formnaro · Übungsfenster';
 const sessionBar=document.createElement('aside');sessionBar.id='practice-session';sessionBar.style.cssText='position:fixed;left:12px;bottom:8px;z-index:2147482999;display:flex;gap:8px;align-items:center;background:white;color:#15304a;border:1px solid #1686d6;border-radius:8px;padding:6px 10px;font:13px system-ui';
 sessionBar.innerHTML='<style>body.formnaro-practice #ai-chat,body.formnaro-practice #ai-open,body.formnaro-practice [data-settings-tab="ai"],body.formnaro-practice [data-settings-page="ai"]{display:none!important}</style><strong>Eigenes Übungsfenster</strong><span>KI-Zugang und Chat bleiben im Hauptfenster.</span><button id="practice-main" type="button">Zum Hauptfenster</button><button id="practice-end" type="button">Übung beenden</button>';
 document.body.append(sessionBar);document.body.append(overlay);const pointer=overlay.querySelector('#practice-pointer'),caption=overlay.querySelector('#practice-caption'),pauseButton=overlay.querySelector('#practice-pause'),interactionWarning=overlay.querySelector('#practice-interaction-warning');
 function computationNotice(computing){interactionWarning.textContent=computing?'Modell wird aufgebaut. Bitte nicht ins Modell klicken. Tempo, Pause und Stop kannst du jederzeit bedienen.':'Vorführung läuft. Tempo, Pause und Stop kannst du jederzeit bedienen.';interactionWarning.setAttribute?.('data-phase',computing?'building':'playback');Object.assign(interactionWarning.style,{background:computing?'#fff0b3':'#eef7fb',borderColor:computing?'#b87800':'#badbe4',color:computing?'#503000':'#24485a',fontSize:computing?'18px':'14px',fontWeight:computing?'800':'600'});}
 const stop=()=>{overlay.hidden=true;controller.cancel();stopped=true;paused=false;unpause?.();void desktop.practiceAbort?.().catch(()=>{});};
 const endSession=()=>{closing=typeof desktop.practiceClose==='function';stop();void desktop.practiceClose?.().catch(()=>{});};overlay.querySelector('#practice-stop').onclick=endSession;
 sessionBar.querySelector('#practice-end').onclick=endSession;sessionBar.querySelector('#practice-main').onclick=()=>{enterPause('Pausiert. Zum Fortsetzen dieses Übungsfenster öffnen und Weiter wählen.');void desktop.practiceParent?.().catch(()=>{});};
 function notifyPause(value,generation){
  statusQueue=statusQueue.then(async()=>{if(!desktop.practiceStatus)throw Error('Pausensteuerung ist nicht verfügbar.');const result=await desktop.practiceStatus(value?{paused:true}:{paused:false,generation});if(result?.ok===false)throw Error(result.reason||result.error||'Pausensteuerung fehlgeschlagen.');if(Number.isSafeInteger(result?.generation))mainGeneration=Math.max(mainGeneration,result.generation);}).catch(error=>{pauseError=Error('Übung konnte nicht sicher pausiert oder fortgesetzt werden: '+String(error?.message||error));caption.textContent=pauseError.message;stop();});
  return statusQueue;
 }
 function enterPause(message){if(!running||paused)return;captionBeforePause=caption.textContent;paused=true;pauseGeneration++;pauseButton.textContent='Weiter';if(message)caption.textContent=message;void notifyPause(true);}
 pauseButton.onclick=()=>{if(!running)return;if(!paused){enterPause('Übung pausiert. Mit Weiter fortsetzen.');return;}const generation=pauseGeneration;pauseButton.disabled=true;void (async()=>{await statusQueue;if(stopped||generation!==pauseGeneration)return;await notifyPause(false,mainGeneration);if(stopped||generation!==pauseGeneration)return;paused=false;pauseButton.textContent='Pause';if(captionBeforePause)caption.textContent=captionBeforePause;unpause?.();})().finally(()=>{pauseButton.disabled=false;});};
 function onFocusLost(event){if(Number.isSafeInteger(event?.generation))mainGeneration=Math.max(mainGeneration,event.generation);if(running){if(paused){pauseGeneration++;void notifyPause(true);caption.textContent='Pausiert: Übungsfenster wieder öffnen und Weiter wählen.';}else enterPause('Pausiert: Übungsfenster wieder öffnen und Weiter wählen.');}}
 window.addEventListener('blur',onFocusLost);desktop.onPracticeBlur?.(onFocusLost);
 // Native injected input and user input both arrive as trusted events. Only
 // allow events at the currently sequenced target; a click elsewhere pauses the
 // exercise before it can change its selection or invalidate the next action.
 window.addEventListener('pointerdown',event=>{if(!running||!event.isTrusted||(overlay.contains(event.target)||sessionBar.contains(event.target)))return;if(!paused&&expectedInput?.contains(event.target))return;if(!paused)enterPause('Pausiert, weil du außerhalb der Vorführung geklickt hast. Mit Weiter fortsetzen oder Übung beenden.');event.preventDefault();event.stopImmediatePropagation();},true);
 window.addEventListener('keydown',event=>{if(!running||!event.isTrusted)return;if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();endSession();return;}if((overlay.contains(event.target)||sessionBar.contains(event.target)))return;if(paused||!expectedInput?.contains(event.target)){if(!paused)enterPause('Pausiert wegen eigener Tasteneingabe. Mit Weiter fortsetzen oder Übung beenden.');event.preventDefault();event.stopImmediatePropagation();}},true);
 // A pause must not commit a half-typed property when a control takes focus.
 for(const name of ['blur','change'])window.addEventListener(name,event=>{if(running&&paused&&expectedInput?.contains(event.target))event.stopImmediatePropagation();},true);
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
 function positionNotice(target){const panel=overlay.querySelector('section'),box=target.getBoundingClientRect(),overlaps=r=>r.left<box.right&&r.right>box.left&&r.top<box.bottom&&r.bottom>box.top;panel.style.left='20px';panel.style.right='auto';panel.style.bottom='54px';panel.style.top='auto';if(overlaps(panel.getBoundingClientRect())){panel.style.left='auto';panel.style.right='20px';if(overlaps(panel.getBoundingClientRect())){panel.style.top='20px';panel.style.bottom='auto';}}}
 async function input(spec,text){
  await checkpoint();const gearDrag=spec.target==='gear-mesh',target=gearDrag?document.querySelector('#canvas-host canvas'):spec.target?.startsWith('ui:')?practiceControl(document,spec.target):element(spec.target,spec.rootId);if(!target)throw Error('Bedienelement im Übungsfenster nicht verfügbar: '+spec.target);
  target.scrollIntoView({block:'center',inline:'nearest',behavior:'smooth'});await playback.delay(500);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));await checkpoint();
  const box=gearDrag?window.__formnaroPracticeGearDrag(spec):target.getBoundingClientRect();pointer.style.display='block';pointer.style.transform=`translate(${Math.max(0,(gearDrag?box.x:box.left+box.width/2))}px,${Math.max(0,(gearDrag?box.y:box.top+box.height/2))}px)`;caption.textContent=text;positionNotice(gearDrag?{getBoundingClientRect:()=>({left:box.x-12,right:box.x+12,top:box.y-12,bottom:box.y+12})}:target);target.classList.add('practice-active-target');try{await playback.delay(1300);await checkpoint();
  // Electron may acknowledge the IPC before its queued native events reach the DOM.
  // Keep the registered target armed through the existing input-settle interval.
  if(spec.action==='drag'){let x,y;if(gearDrag){x=box.to.x;y=box.to.y;}else if(spec.target.startsWith('shape:')){const r=document.querySelector('#canvas-host canvas').getBoundingClientRect();x=r.left+r.width*.6;y=r.top+r.height*.4;}else{x=box.left+8+(Number(spec.value)-Number(target.min||0))/(Number(target.max||100)-Number(target.min||0))*(box.width-16);y=(gearDrag?box.y:box.top+box.height/2);}pointer.style.transitionDuration=(1.4*playback.multiplier())+'s';pointer.style.transform=`translate(${x}px,${y}px)`;}
  expectedInput=target;try{await desktop.practiceInput({...spec,tempo:playback.multiplier()});await pause(300);}finally{expectedInput=null;}await checkpoint();}finally{target.classList.remove('practice-active-target');pointer.style.transitionDuration=(.65*playback.multiplier())+'s';}
 }
 const playback=createPracticePlayback({checkpoint});const speed=overlay.querySelector('#practice-speed');speed.oninput=()=>{playback.setTempo(100/Number(speed.value));const out=overlay.querySelector('#practice-speed-output');if(out)out.textContent=speed.value+' %';pointer.style.transitionDuration=(.65*playback.multiplier())+'s';};speed.onchange=speed.oninput;pointer.style.transitionDuration='1.3s';
 const modelUI=createPracticeModelUI({controller,access,input,waitFor,checkpoint,settled,document});
 const setFields=new Set(['size-0','size-1','size-2','pos-0','pos-1','pos-2']);
 async function run(plan){
  if(running)throw Error('Übung läuft bereits.');if(project().nodes.length)throw Error('Übungsprojekt muss leer sein.');
  if(!plan||plan.version!==1||!Array.isArray(plan.actions)||plan.actions.length<1||plan.actions.length>50)throw Error('Ungültiger Übungsplan.');
  running=true;stopped=false;paused=false;pauseError=null;statusQueue=Promise.resolve();overlay.hidden=false;computationNotice(false);const aliases=new Map(),checks=[],framing=createPracticeFraming();completedSteps=checks;
  try{
  for(let i=0;i<plan.actions.length;i++){
   await checkpoint();const action=plan.actions[i];computationNotice(['shape','set','role','group'].includes(action.kind)||action.kind==='model'&&action.commands?.some(c=>c.op!=='joint'));const prefix=`${i+1}/${plan.actions.length} · `;
   if(action.kind==='shape'){
    if(!CAD_SHAPES.some(s=>s.type===action.type)||typeof action.as!=='string'||aliases.has(action.as))throw Error('Unzulässige Form oder Alias.');
    const before=new Set(project().nodes.map(n=>n.id));await input({target:'shape:'+action.type,action:'drag'},prefix+'Grundform '+(CAD_SHAPES.find(s=>s.type===action.type)?.name??action.type)+' aus der Formenleiste auf die Arbeitsfläche ziehen.');
    await waitFor(()=>project().nodes.filter(n=>!before.has(n.id)).length===1,'Form hinzufügen');const added=project().nodes.find(n=>!before.has(n.id));
    if(!added||added.kind!=='cad'||!selected().includes(added.id))throw Error('Neue Form oder Auswahl stimmt nicht mit dem Auftrag überein.');aliases.set(action.as,added.id);checks.push({kind:'shape',alias:action.as,id:added.id});
   }else if(action.kind==='set'){
    if(!setFields.has(action.field)||!Number.isFinite(action.value)||Math.abs(action.value)>100000||action.field.startsWith('size-')&&action.value<=0)throw Error('Unzulässiger Wert im Übungsplan.');
    const ids=selected();if(ids.length!==1||!node(ids[0]))throw Error('Ein einzelnes Übungsteil auswählen.');const id=ids[0],axis=Number(action.field.slice(-1)),size=action.field.startsWith('size-');
    const measured=()=>size?cadFormLocalDimensions(node(id))[axis]:cadFormPosition(project(),{rootId:id,path:[]})[axis];
    const before=measured();await input({target:action.field,action:'set',value:String(action.value)},prefix+(size?'Größe ':'Position ')+('XYZ'[axis])+' = '+action.value+' mm eingeben.');
    await waitFor(()=>!!node(id)&&Math.abs(measured()-action.value)<1e-5,'Eingabewert');checks.push({kind:'set',field:action.field,expected:action.value,actual:measured(),previous:before});
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
    if(!ids.every(id=>result.children?.some(child=>child.id===id)))throw Error('Gruppierung enthält nicht die ausgewählten Quellen.');aliases.set(action.as,result.id);checks.push({kind:'group',id:result.id,sources:ids,solids:result.stats?.solids,volume:result.stats?.volume});
   }else if(action.kind==='model'){
    if(!access||!Array.isArray(action.commands)||!action.commands.length||action.commands.length>200)throw Error('Modellierauftrag oder lokale Übungsschnittstelle fehlt.');
    caption.textContent=prefix+(action.label??'Formnaro-Werkzeuge im Übungsprojekt ausführen.');pointer.style.display='none';let proposal;
    const next=plan.actions[i+1],holdMotion=next?.kind==='model'&&next.commands?.every(c=>c.op==='joint'&&c.action==='move');const result=await modelUI.run(action,{holdMotion});checks.push({kind:'model',commands:action.commands.length,objectCount:project().nodes.length,joints:project().joints?.joints.length??0,couplings:project().joints?.gears?.length??0,...result});await playback.delay(650);await checkpoint();
   }else if(action.kind==='gear-snap'){
    const rootId=aliases.get(action.moving)??modelUI.rootAlias(action.moving),anchorId=aliases.get(action.anchor)??modelUI.rootAlias(action.anchor);if(!rootId||!anchorId)throw Error('Zahnradalias fehlt.');
    if(!document.getElementById('gear-snap').checked)await input({target:'ui:id:gear-snap',action:'click'},'Zahnräder einrasten einschalten.');
    await input({target:'ui:label:Oben',action:'click'},'Für das Einrasten die Zahnräder von oben zeigen.');
    if(!checks.some(s=>s.kind==='gear-snap'))await input({target:'fit',action:'click'},'Alle Zahnräder einmal in die Ansicht einpassen.');
    if(selected().length!==1||selected()[0]!==rootId)await input({target:'tree',action:'click',rootId},'Das lose Zahnrad einzeln auswählen.');
    await waitFor(()=>!document.getElementById('toast')?.getClientRects().length,'Einrasthinweis abwarten');
    const before=new Set(project().joints?.gears?.map(g=>g.id)??[]);await input({target:'gear-mesh',action:'drag',rootId,anchorId,value:String(action.angle)},action.text??'Das lose Zahnrad heranziehen. Innerhalb 1 mm rastet es passend ein; die Drehung wird automatisch gekoppelt.');
    await waitFor(()=>project().joints?.gears?.some(g=>!before.has(g.id)),'Zahnrad einrasten und Drehung koppeln');checks.push({kind:'gear-snap',moving:rootId,anchor:anchorId,angle:action.angle,automaticCoupling:true});
   }else if(action.kind==='ui'){
    await input({target:action.target,action:action.action==='point'?'locate':action.action,...(action.value===undefined?{}:{value:action.value})},action.text??prefix+'Formnaro-Bedienelement: '+action.target);await settled();checks.push({kind:'ui',target:action.target,action:action.action});
   }else throw Error('Nicht freigegebener Übungsschritt.');
   computationNotice(false);const boundary=i===plan.actions.length-1||plan.actions[i+1].kind!=='set';
   if(framing.consider({step:i,total:plan.actions.length,boundary,size:practiceSceneExtent(project().nodes)}))await input({target:'fit',action:'click'},'Ansicht nach den Maßänderungen einpassen.');
  }
  caption.textContent='Übung abgeschlossen. Alle Schritte wurden im getrennten Testprojekt ausgeführt.';pointer.style.display='none';return {ok:true,steps:checks,report:{revision:revision(),objectCount:project().nodes.length,selectionCount:selected().length,nativeGearCount:project().nodes.filter(n=>n.kind==='cad'&&n.recipe?.type==='gear').length,nativeGears:project().nodes.filter(n=>n.kind==='cad'&&n.recipe?.type==='gear').map(n=>({id:n.id,teeth:n.recipe.params.teeth,module:n.recipe.params.module,scale:[0,1,2].map(k=>Math.hypot(...n.transform.slice(k*4,k*4+3))),center:n.transform.slice(12,15)})),jointCount:project().joints?.joints.length??0,couplingCount:project().joints?.gears?.length??0}};
  }finally{running=false;paused=false;unpause?.();overlay.hidden=true;pointer.style.display='none';}
 }
 desktop.onPracticePlan(plan=>{void run(plan).then(result=>closing?undefined:desktop.submitPracticeResult(result),error=>{if(closing)return;const reason=String((pauseError||error).message);caption.textContent=reason;pointer.style.display='none';return desktop.submitPracticeResult({ok:false,reason,steps:completedSteps});});});
 desktop.onPracticeCancel?.(endSession);void desktop.practiceReady();return {isRunning:()=>running,onBuildPreview:async({completed,total})=>{if(!running)return;caption.textContent='Live-Aufbau · Schritt '+completed+' / '+total;pointer.style.display='none';await playback.delay(650);}};
}
