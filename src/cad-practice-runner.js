import {practiceStepObservation} from './cad-practice-observation.js';
import {locatePracticeSketchGesture} from './cad-practice-sketch.js';
import {cadDrawingDimension} from './cad-drawing-data.js';
import {installPracticeGearDrag} from './cad-practice-gear-drag.js';
import {installPracticeEdge} from './cad-practice-edge.js';
import {installPracticeFace,practiceReferenceMarker} from './cad-practice-face.js';
import {practiceControl,practiceTarget,practiceDialogState,practiceOptionIndex,installPracticeControlBridge} from './cad-practice-controls.js';
import {createPracticeModelUI} from './cad-practice-model-ui.js';
import {createPracticePlayback} from './cad-practice-playback.js';
import {CAD_SHAPES} from './cad-shapes.js';
import {cadFormLocalDimensions,cadFormPosition} from './cad-interface-state.js';
import {createPracticeFraming,practiceSceneExtent} from './cad-practice-framing.js';

import {readPhotoDetail} from './cad-photo-detail.js';
import {photoEvidence} from './cad-photo-data.js';
import {checkPracticeResult,validatePracticeNativeCriteria} from './cad-practice-quality.js';

// Runs only in the separately provisioned practice window. All edits go through
// the visible product controls and the child process's bounded input bridge.
export function installCadPracticeRunner({desktop,controller,access,getSelection,select,settled,view,getPreferences,getFacePickState=()=>null,getDrillState=()=>null,getEdgeState=()=>null,getInspectionState=()=>null,getAlignmentState=()=>null,openPracticeFile,getPracticeConverterState=()=>null,getSketchFeedback=()=>null,openSketchDraft,modelUIFactory=createPracticeModelUI}){
 if(!desktop?.onPracticePlan||!desktop?.practiceInput||!desktop?.submitPracticeResult||!desktop?.practiceReady)return false;
 let running=false,waiting=false,stopped=false,closing=false,paused=false,unpause=null,expectedInput=null,captionBeforePause='',completedSteps=[],pauseError=null,statusQueue=Promise.resolve(),pauseGeneration=0,mainGeneration=0;
 window.__formnaroPracticeSketch=spec=>locatePracticeSketchGesture(document,spec);
 installPracticeControlBridge(document,window,{onLocate:positionNotice});if(view){window.__formnaroPracticeGearPreferences=getPreferences;installPracticeGearDrag({controller,view});installPracticeFace({controller,view,getFacePickState,getDrillState,getInspectionState,getAlignmentState});installPracticeEdge({controller,view,getEdgeState});}
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const overlay=document.createElement('div');overlay.id='practice-overlay';overlay.hidden=true;
 overlay.style.cssText='position:fixed;inset:0;z-index:2147483000;pointer-events:none;font-family:system-ui,sans-serif';
 overlay.innerHTML='<div id="practice-pointer" aria-hidden="true" style="position:fixed;left:0;top:0;width:30px;height:38px;filter:drop-shadow(1px 2px 2px #0008);transition:transform .65s ease;display:none"><svg width="30" height="38" viewBox="0 0 30 38"><path d="M2 2 L2 28 L9 22 L17 35 L22 32 L15 20 L27 19 Z" fill="white" stroke="#0075d3" stroke-width="3"/></svg></div><style>.practice-active-target{outline:3px solid #087fca!important;outline-offset:4px!important}</style><section style="pointer-events:auto;position:fixed;left:20px;bottom:54px;max-width:420px;background:white;border:2px solid #1686d6;border-radius:12px;box-shadow:0 4px 20px #0005;padding:12px;color:#15304a"><strong>Übungsmodus · eigenes Testprojekt</strong><strong id="practice-interaction-warning" role="note" aria-live="polite" style="display:block;margin:10px 0;padding:10px 12px;background:#fff0b3;border:2px solid #b87800;border-radius:7px;color:#503000;font-size:18px;font-weight:800;line-height:1.35">Vorführung läuft. Tempo, Pause und Stop kannst du jederzeit bedienen.</strong><span style="display:block;font-size:13px;font-weight:600">Wegklicken pausiert. Mit Weiter fortsetzen oder Übung beenden.</span><label style="display:block;margin:8px 0">Tempo <output id="practice-speed-output">50 %</output><input id="practice-speed" aria-label="Übungstempo in Prozent" type="range" min="10" max="300" step="5" value="50" style="display:block;width:100%;min-width:280px;padding:8px 0"><span style="display:flex;justify-content:space-between;font-size:12px"><span>10 % · langsam</span><span>300 % · schnell</span></span></label><div id="practice-caption" style="margin:7px 0"></div><button id="practice-pause" type="button">Pause</button> <button id="practice-stop" type="button">Übung beenden · Esc</button></section>';
 document.body.classList?.add('formnaro-practice');document.title='Formnaro · Übungsfenster';
 const sessionBar=document.createElement('aside');sessionBar.id='practice-session';sessionBar.style.cssText='position:fixed;left:12px;bottom:8px;z-index:2147482999;display:flex;gap:8px;align-items:center;background:white;color:#15304a;border:1px solid #1686d6;border-radius:8px;padding:6px 10px;font:13px system-ui';
 sessionBar.innerHTML='<style>body.formnaro-practice #ai-chat,body.formnaro-practice #ai-open,body.formnaro-practice [data-settings-tab="ai"],body.formnaro-practice [data-settings-page="ai"]{display:none!important}</style><strong>Eigenes Übungsfenster</strong><span>KI-Zugang und Chat bleiben im Hauptfenster.</span><button id="practice-main" type="button">Zum Hauptfenster</button><button id="practice-end" type="button">Übung beenden</button>';
 document.body.append(sessionBar);document.body.append(overlay);const pointer=overlay.querySelector('#practice-pointer'),caption=overlay.querySelector('#practice-caption'),pauseButton=overlay.querySelector('#practice-pause'),interactionWarning=overlay.querySelector('#practice-interaction-warning');
 function syncOverlayLayer(){
  if(!overlay.showPopover)return;
  const dialog=!overlay.hidden&&[...document.querySelectorAll('dialog:modal')].at(-1);
  const parent=dialog||document.body;
  if(overlay.parentElement===parent&&(!dialog||overlay.matches(':popover-open')))return;
  if(overlay.matches(':popover-open'))overlay.hidePopover();
  if(overlay.parentElement!==parent)parent.append(overlay);
  if(dialog){
   overlay.setAttribute('popover','manual');
   Object.assign(overlay.style,{width:'auto',height:'auto',maxWidth:'none',maxHeight:'none',
    margin:'0',padding:'0',border:'0',background:'transparent',overflow:'visible'});
   overlay.showPopover();
  }else overlay.removeAttribute('popover');
 }
 function computationNotice(computing){interactionWarning.textContent=computing?'Modell wird aufgebaut. Bitte nicht ins Modell klicken. Tempo, Pause und Stop kannst du jederzeit bedienen.':'Vorführung läuft. Tempo, Pause und Stop kannst du jederzeit bedienen.';interactionWarning.setAttribute?.('data-phase',computing?'building':'playback');Object.assign(interactionWarning.style,{background:computing?'#fff0b3':'#eef7fb',borderColor:computing?'#b87800':'#badbe4',color:computing?'#503000':'#24485a',fontSize:computing?'18px':'14px',fontWeight:computing?'800':'600'});}
 const stop=()=>{waiting=false;overlay.hidden=true;qualityAbort?.abort();controller.cancel();stopped=true;paused=false;unpause?.();void desktop.practiceAbort?.().catch(()=>{});};
 const endSession=()=>{closing=typeof desktop.practiceClose==='function';stop();void desktop.practiceClose?.().catch(()=>{});};overlay.querySelector('#practice-stop').onclick=endSession;
 sessionBar.querySelector('#practice-end').onclick=endSession;sessionBar.querySelector('#practice-main').onclick=()=>{enterPause('Pausiert. Zum Fortsetzen dieses Übungsfenster öffnen und Weiter wählen.');void desktop.practiceParent?.().catch(()=>{});};
 function notifyPause(value,generation){
  statusQueue=statusQueue.then(async()=>{if(!desktop.practiceStatus)throw Error('Pausensteuerung ist nicht verfügbar.');const result=await desktop.practiceStatus(value?{paused:true}:{paused:false,generation});if(result?.ok===false)throw Error(result.reason||result.error||'Pausensteuerung fehlgeschlagen.');if(Number.isSafeInteger(result?.generation))mainGeneration=Math.max(mainGeneration,result.generation);}).catch(error=>{pauseError=Error('Übung konnte nicht sicher pausiert oder fortgesetzt werden: '+String(error?.message||error));caption.textContent=pauseError.message;stop();});
  return statusQueue;
 }
 function enterPause(message){if((!running&&!waiting)||paused)return;captionBeforePause=caption.textContent;paused=true;pauseGeneration++;pauseButton.textContent='Weiter';if(message)caption.textContent=message;syncOverlayLayer();void notifyPause(true);}
 pauseButton.onclick=()=>{if(!running&&!waiting)return;if(!paused){enterPause('Übung pausiert. Mit Weiter fortsetzen.');return;}const generation=pauseGeneration;pauseButton.disabled=true;void (async()=>{await statusQueue;if(stopped||generation!==pauseGeneration)return;await notifyPause(false,mainGeneration);if(stopped||generation!==pauseGeneration)return;paused=false;pauseButton.textContent='Pause';if(captionBeforePause)caption.textContent=captionBeforePause;unpause?.();})().finally(()=>{pauseButton.disabled=false;});};
 function onFocusLost(event){if(Number.isSafeInteger(event?.generation))mainGeneration=Math.max(mainGeneration,event.generation);if(running||waiting){if(paused){syncOverlayLayer();pauseGeneration++;void notifyPause(true);caption.textContent='Pausiert: Übungsfenster wieder öffnen und Weiter wählen.';}else enterPause('Pausiert: Übungsfenster wieder öffnen und Weiter wählen.');}}
 window.addEventListener('blur',onFocusLost);desktop.onPracticeBlur?.(onFocusLost);
 // Native injected input and user input both arrive as trusted events. Only
 // allow events at the currently sequenced target; a click elsewhere pauses the
 // exercise before it can change its selection or invalidate the next action.
 window.addEventListener('pointerdown',event=>{if((!running&&!waiting)||!event.isTrusted||(overlay.contains(event.target)||sessionBar.contains(event.target)))return;if(!waiting&&!paused&&expectedInput?.contains(event.target))return;if(!waiting&&!paused)enterPause('Pausiert, weil du außerhalb der Vorführung geklickt hast. Mit Weiter fortsetzen oder Übung beenden.');event.preventDefault();event.stopImmediatePropagation();},true);
 window.addEventListener('keydown',event=>{if((!running&&!waiting)||!event.isTrusted)return;if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();endSession();return;}if((overlay.contains(event.target)||sessionBar.contains(event.target)))return;if(waiting||paused||!expectedInput?.contains(event.target)){if(!waiting&&!paused)enterPause('Pausiert wegen eigener Tasteneingabe. Mit Weiter fortsetzen oder Übung beenden.');event.preventDefault();event.stopImmediatePropagation();}},true);
 // A pause must not commit a half-typed property when a control takes focus.
 for(const name of ['blur','change'])window.addEventListener(name,event=>{if(running&&paused&&event.target instanceof Node&&expectedInput?.contains(event.target))event.stopImmediatePropagation();},true);
 async function checkpoint(){await statusQueue;if(pauseError)throw pauseError;if(stopped)throw Object.assign(Error('Übung abgebrochen.'),{code:'PRACTICE_CANCELLED'});while(paused){await new Promise(resolve=>{unpause=resolve;});unpause=null;await statusQueue;if(pauseError)throw pauseError;if(stopped)throw Object.assign(Error('Übung abgebrochen.'),{code:'PRACTICE_CANCELLED'});}}
 async function waitFor(predicate,label,timeout=45000){let elapsed=0;while(elapsed<timeout){await checkpoint();const started=Date.now();await settled();if(predicate())return;await pause(80);elapsed+=Date.now()-started;}throw Error('Übung: '+label+' wurde nicht bestätigt.');}
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
 function positionNotice(target){const panel=overlay.querySelector('section'),box=target.getBoundingClientRect(),overlaps=r=>r.left<box.right&&r.right>box.left&&r.top<box.bottom&&r.bottom>box.top;panel.style.left='20px';panel.style.right='auto';panel.style.bottom='54px';panel.style.top='auto';if(overlaps(panel.getBoundingClientRect())){panel.style.left='auto';panel.style.right='20px';if(overlaps(panel.getBoundingClientRect())){panel.style.top='20px';panel.style.bottom='auto';}}sessionBar.style.bottom='8px';sessionBar.style.top='auto';if(overlaps(sessionBar.getBoundingClientRect())){sessionBar.style.bottom='auto';sessionBar.style.top='8px';}}
 async function input(spec,text){
  spec={...spec,target:practiceTarget(spec.target)};syncOverlayLayer();
  await checkpoint();const gearDrag=spec.target==='gear-mesh',faceClick=spec.target==='cad-face',edgeClick=spec.target==='cad-edge',sketch=spec.target==='sketch-board',canvasInput=gearDrag||faceClick||edgeClick||sketch,target=sketch?document.getElementById('sketch-board'):canvasInput?document.querySelector('#canvas-host canvas'):spec.target?.startsWith('ui:')?practiceControl(document,spec.target):element(spec.target,spec.rootId);if(!target)throw Error('Bedienelement im Übungsfenster nicht verfügbar: '+spec.target);
  if(spec.action==='choose'&&['joint-parent','joint-child'].includes(target.id)&&modelUI.rootAlias(spec.value))spec={...spec,value:modelUI.rootAlias(spec.value)};
  if(spec.action==='choose')practiceOptionIndex(target,spec.value);
  target.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});await playback.delay(500);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));await checkpoint();
  const box=sketch?locatePracticeSketchGesture(document,spec,{checkHit:false}):gearDrag?window.__formnaroPracticeGearDrag(spec):faceClick?await window.__formnaroPracticeFace(spec):edgeClick?window.__formnaroPracticeEdge(spec):target.getBoundingClientRect();
  const hitTarget=box.markerId?practiceReferenceMarker(document,box.markerId):target;
  if(!hitTarget)throw Error('Der sichtbare Bezugspunkt wurde geändert.');
  pointer.style.display='block';pointer.style.transform=`translate(${Math.max(0,(canvasInput?box.x:box.left+box.width/2))}px,${Math.max(0,(canvasInput?box.y:box.top+box.height/2))}px)`;caption.textContent=text;positionNotice(canvasInput?{getBoundingClientRect:()=>({left:Math.min(box.x,box.to?.x??box.x)-12,right:Math.max(box.x,box.to?.x??box.x)+12,top:Math.min(box.y,box.to?.y??box.y)-12,bottom:Math.max(box.y,box.to?.y??box.y)+12})}:target);hitTarget.classList.add('practice-active-target');try{await playback.delay(1300);await checkpoint();
  // Electron may acknowledge the IPC before its queued native events reach the DOM.
  // Keep the registered target armed through the existing input-settle interval.
  if(spec.action==='drag'){let x,y;if(gearDrag||sketch){x=box.to.x;y=box.to.y;}else if(spec.target.startsWith('shape:')){const r=document.querySelector('#canvas-host canvas').getBoundingClientRect();x=r.left+r.width*.6;y=r.top+r.height*.4;}else{x=box.left+8+(Number(spec.value)-Number(target.min||0))/(Number(target.max||100)-Number(target.min||0))*(box.width-16);y=(gearDrag?box.y:box.top+box.height/2);}pointer.style.transitionDuration=(1.4*playback.multiplier())+'s';pointer.style.transform=`translate(${x}px,${y}px)`;}
  let actual;expectedInput=hitTarget;try{actual=await desktop.practiceInput({...spec,tempo:playback.multiplier()});await pause(300);syncOverlayLayer();}finally{expectedInput=null;}await checkpoint();return actual;}finally{hitTarget.classList.remove('practice-active-target');pointer.style.transitionDuration=(.65*playback.multiplier())+'s';}
 }
 const playback=createPracticePlayback({checkpoint});const speed=overlay.querySelector('#practice-speed');speed.oninput=()=>{playback.setTempo(100/Number(speed.value));const out=overlay.querySelector('#practice-speed-output');if(out)out.textContent=speed.value+' %';pointer.style.transitionDuration=(.65*playback.multiplier())+'s';};speed.onchange=speed.oninput;pointer.style.transitionDuration='1.3s';
 const aliases=new Map(),modelUI=modelUIFactory({controller,access,input,waitFor,checkpoint,settled,document,aliases});
 const setFields=new Set(['size-0','size-1','size-2','pos-0','pos-1','pos-2']);
 const fileButtons=new Map(),photoAliases=new Map();
 let opening=null,failedAction=null,confirmedCount=0,waitingRevision=null,hasProjectCopy=false,lastSavedPhoto=null;
 let quality,qualityReport,qualityAbort,initialRoots,advisoryResult=null,advisoryOffered=false;
 function qualityTarget(alias){
  if(alias!=='new')return modelUI.rootAlias(alias);
  const roots=project().nodes.filter(root=>!initialRoots.has(root.id));
  return roots.length===1?roots[0].id:null;
 }
 window.__formnaroPracticePhotoDetail=()=>waiting&&revision()===waitingRevision
  ?readPhotoDetail(document.querySelector('#photo-assistant[open]')):null;
 window.__formnaroPracticeFeedbackRevision=()=>waiting&&revision()===waitingRevision?waitingRevision:null;
 if(new URLSearchParams(window.location?.search).get('practiceAudit')==='1')window.__formnaroPracticeAuditSnapshot=async expected=>{
  if(closing||!hasProjectCopy||expected!==qualityReport?.revision||expected!==revision())return null;
  const snapshot=await controller.transactions.materialize();
  return !closing&&expected===revision()?snapshot:null;
 };
 function removeFileButtons(){for(const button of fileButtons.keys())button.remove();fileButtons.clear();}
 function continuationState(){
  const known=[...aliases.keys()];
  const roots=new Map(known.map(alias=>[alias,modelUI.rootAlias(alias)]).filter(([,id])=>id&&node(id)));
  const selectedAliases=selected().map(id=>[...roots].find(([,rootId])=>rootId===id)?.[0]).filter(Boolean);
  return {known,selectable:[...roots.keys()],selected:selectedAliases};
 }
 let reviewedPhotoMarks;
 async function reportExecuted(action,index,total,ok,error){const value=practiceStepObservation({action,index,total,revision:revision(),ok,error,scene:access.scene(),project:project(),selected:selected(),view:view?.viewState?.(),undo:controller.state().undo,visible:[...new Set((view?.groups?.bodies?.children??[]).filter(o=>o.visible).map(o=>o.userData.rootId))],aliases:modelUI.aliasState()});await desktop.practiceObservation(value);}

 async function run(plan,projectCopy,files=[],{continuing=false,recover=false,vision=false,observe=false,quality:initialQuality}={}){
  if(!continuing)reviewedPhotoMarks=undefined;
  if(running)throw Error('Übung läuft bereits.');
  if(continuing?(!waiting||revision()!==waitingRevision):project().nodes.length)throw Error('Übungszwischenstand ist nicht mehr verfügbar.');
  if(!plan||plan.version!==1||!Array.isArray(plan.actions)||plan.actions.length<1||plan.actions.length>50)throw Error('Ungültiger Übungsplan.');
  if(!continuing&&initialQuality)validatePracticeNativeCriteria(initialQuality);
  running=true;waiting=false;overlay.hidden=false;computationNotice(false);
  if(!continuing){stopped=false;paused=false;pauseError=null;statusQueue=Promise.resolve();modelUI.reset();photoAliases.clear();lastSavedPhoto=null;hasProjectCopy=!!projectCopy;quality=initialQuality;}
  qualityReport=null;
  const checks=[],framing=createPracticeFraming();completedSteps=checks;
  try{
  for(const [index,file] of files.entries()){
   const button=document.createElement('button');
   button.id='practice-file-'+(index+1);button.type='button';
   button.textContent=(file.kind==='photo'?'Foto vermessen: ':'STL öffnen: ')+file.name;
   button.style.cssText='max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
   button.title=file.name;
   button.onclick=()=>{
    if(paused||expectedInput!==button)return;
    const state={file,index,error:null};
    opening=state;
    state.operation=Promise.resolve().then(()=>openPracticeFile(file)).catch(error=>{state.error=error;});
   };
   fileButtons.set(button,file);
   sessionBar.append(button);
  }
  if(projectCopy){
    await checkpoint();
    computationNotice(true);
    caption.textContent='Projektkopie für die Übung öffnen …';
    await controller.open(projectCopy.project,{label:'Projektkopie für Übung öffnen'});
    await checkpoint();
    await settled();
    select(projectCopy.selection);
    projectCopy.selection.forEach(({rootId}, index) => aliases.set('existing-' + (index + 1), rootId));
    if(projectCopy.sketchDraft){
     await settled();
     await checkpoint();
     openSketchDraft(projectCopy.sketchDraft);
     syncOverlayLayer();
    }
    await checkpoint();
  }
  if(!continuing)initialRoots=new Set(project().nodes.map(root=>root.id));
  for(let i=0;i<plan.actions.length;i++){
   await checkpoint();const action=plan.actions[i];
   failedAction={index:i+1,kind:action.kind,...(action.target?{target:action.target}:{}),...(action.action?{action:action.action}:{}),...(action.field?{field:action.field}:{}),...(action.value===undefined?{}:{value:action.value}),...(action.as?{alias:action.as}:{})};
   computationNotice(['shape','set','role','group'].includes(action.kind)||action.kind==='model'&&action.commands?.some(c=>c.op!=='joint'));const prefix=`${i+1}/${plan.actions.length} · `;
   if(action.kind==='shape'){
    if(!CAD_SHAPES.some(s=>s.type===action.type)||typeof action.as!=='string'||aliases.has(action.as))throw Error('Unzulässige Form oder Alias.');
    const before=new Set(project().nodes.map(n=>n.id));await input({target:'shape:'+action.type,action:'drag'},prefix+'Grundform '+(CAD_SHAPES.find(s=>s.type===action.type)?.name??action.type)+' aus der Formenleiste auf die Arbeitsfläche ziehen.');
    await waitFor(()=>project().nodes.filter(n=>!before.has(n.id)).length===1,'Form hinzufügen');const added=project().nodes.find(n=>!before.has(n.id));
    if(!added||added.kind!=='cad'||!selected().includes(added.id))throw Error('Neue Form oder Auswahl stimmt nicht mit dem Auftrag überein.');aliases.set(action.as,added.id);checks.push({kind:'shape',alias:action.as,id:added.id});
   }else if(action.kind==='set'){
    if(!setFields.has(action.field)||!Number.isFinite(action.value)||Math.abs(action.value)>100000||action.field.startsWith('size-')&&action.value<=0)throw Error('Unzulässiger Wert im Übungsplan.');
    const ids=selected();if(ids.length!==1||!node(ids[0]))throw Error('Ein einzelnes Übungsteil auswählen.');const id=ids[0],axis=Number(action.field.slice(-1)),size=action.field.startsWith('size-');
    const measured=()=>size?cadFormLocalDimensions(node(id))[axis]:cadFormPosition(project(),{rootId:id,path:[]})[axis];
    const before=measured(),unchanged=Math.abs(before-action.value)<1e-5;if(!unchanged)await input({target:action.field,action:'set',value:String(action.value)},prefix+(size?'Größe ':'Position ')+('XYZ'[axis])+' = '+action.value+' mm eingeben.');
    await waitFor(()=>!!node(id)&&Math.abs(measured()-action.value)<1e-5,'Eingabewert');checks.push({kind:'set',field:action.field,expected:action.value,actual:measured(),previous:before,...(unchanged?{unchanged:true}: {})});
   }else if(action.kind==='role'){
    if(!['solid','hole'].includes(action.value))throw Error('Unzulässige Rolle.');const ids=selected();if(ids.length!==1)throw Error('Für die Rolle genau ein Teil auswählen.');const id=ids[0];
    await input({target:action.value==='hole'?'hole-btn':'solid-btn',action:'click'},prefix+(action.value==='hole'?'Als Lochform markieren.':'Als Körper markieren.'));
    await waitFor(()=>node(id)?.solid===(action.value==='solid'),'Körper-/Lochrolle');checks.push({kind:'role',value:action.value,id});
   }else if(action.kind==='select'){
    if(!Array.isArray(action.targets)||!action.targets.length||action.targets.length>8||new Set(action.targets).size!==action.targets.length)throw Error('Ungültige Auswahl.');
    const ids=action.targets.map(alias=>modelUI.rootAlias(alias));if(ids.some(id=>!id||!node(id)))throw Error('Übungsteil für Auswahl fehlt.');const flags=ids.map(id=>({hidden:!!node(id).hidden,locked:!!node(id).locked}));
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
   }else if(action.kind==='sketch-gesture'){
    await input({target:'sketch-board',action:action.to?'drag':'click',point:action.point,to:action.to,add:action.add},action.text??prefix+'Auf der Skizzenfläche zeichnen oder auswählen.');
    // A polyline is intentionally open between points. The editor's message
    // is feedback during drawing. Its actual preview gates extrusion.
    const feedback=document.getElementById('sketch-message')?.textContent?.slice(0,300);
    checks.push({kind:'sketch-gesture',point:action.point,...(action.to?{to:action.to}:{}),...(feedback?{feedback}:{})});
   }else if(action.kind==='face'){
    const rootId=modelUI.rootAlias(action.target);if(!rootId)throw Error('Körperalias für Flächenauswahl fehlt.');const before=revision();
    if(getDrillState()?.id===rootId)await waitFor(()=>getDrillState()?.ready,'Bohrbezugspunkte');
    const inspection=getInspectionState(),measurementPoints=inspection?.points?.length;
    const hit=await input({target:'cad-face',action:'click',rootId,side:action.side},action.text??'Die Fläche '+action.side+' am ausgewählten Körper sichtbar anklicken.');
    if(inspection?.kind==='measure')await waitFor(()=>getInspectionState()?.kind==='measure'&&getInspectionState()?.points?.length!==measurementPoints&&!getInspectionState()?.busy,'native Messfläche');
    else if(getAlignmentState())await waitFor(()=>getAlignmentState()?.referenceId===rootId,'tatsächliche Ausrichtreferenz');
    else if(hit?.markerId)await waitFor(()=>getDrillState()?.target?.reference?.token===hit.markerId,'nativen Bohrbezug wählen');
    else await waitFor(()=>getFacePickState()?.picked?.faceIndex===hit?.faceIndex&&!getFacePickState()?.picking,'native Flächenauswahl');
    if(revision()!==before)throw Error('Flächenauswahl hat unerwartet das Modell geändert.');
    checks.push({kind:'face',target:action.target,side:action.side,faceIndex:hit.faceIndex,point:hit.point,normal:hit.normal});
   }else if(action.kind==='edge'){
    const rootId=modelUI.rootAlias(action.target);if(!rootId)throw Error('Körperalias für Kantenauswahl fehlt.');const before=revision();
    await waitFor(()=>getEdgeState()?.nodeId===rootId&&getEdgeState()?.edges?.length,'native Kanten');
    const hit=await input({target:'cad-edge',action:'click',rootId,sides:action.sides},action.text??'Die Kante zwischen '+action.sides.join(' und ')+' sichtbar anklicken.');
    await waitFor(()=>getEdgeState()?.selected?.includes(hit.edgeToken),'tatsächliche Kantenauswahl');
    if(revision()!==before)throw Error('Kantenauswahl hat unerwartet das Modell geändert.');
    checks.push({kind:'edge',target:action.target,sides:action.sides,edgeToken:hit.edgeToken});
   }else if(action.kind==='gear-snap'){
    const rootId=modelUI.rootAlias(action.moving),anchorId=modelUI.rootAlias(action.anchor);if(!rootId||!anchorId)throw Error('Zahnradalias fehlt.');
    if(!document.getElementById('gear-snap').checked)await input({target:'ui:id:gear-snap',action:'click'},'Zahnräder einrasten einschalten.');
    await input({target:'ui:label:Oben',action:'click'},'Für das Einrasten die Zahnräder von oben zeigen.');
    if(!checks.some(s=>s.kind==='gear-snap'))await input({target:'fit',action:'click'},'Alle Zahnräder einmal in die Ansicht einpassen.');
    if(selected().length!==1||selected()[0]!==rootId)await input({target:'tree',action:'click',rootId},'Das lose Zahnrad einzeln auswählen.');
    await waitFor(()=>!document.getElementById('toast')?.getClientRects().length,'Einrasthinweis abwarten');
    const before=new Set(project().joints?.gears?.map(g=>g.id)??[]);await input({target:'gear-mesh',action:'drag',rootId,anchorId,value:String(action.angle)},action.text??'Das lose Zahnrad heranziehen. Innerhalb 1 mm rastet es passend ein; die Drehung wird automatisch gekoppelt.');
    await waitFor(()=>project().joints?.gears?.some(g=>!before.has(g.id)),'Zahnrad einrasten und Drehung koppeln');checks.push({kind:'gear-snap',moving:rootId,anchor:anchorId,angle:action.angle,automaticCoupling:true});
   }else if(action.kind==='photo-points'){
    for(const [index,point] of action.points.entries()){
     failedAction.pointIndex=index+1;failedAction.point=point;
     for(const [axisIndex,axis] of ['x','y'].entries()){
      const id='photo-point-'+axis,value=String(point[axisIndex]);
      const field=document.getElementById(id);
      if(field?.value===value)continue;
      await input({target:'ui:id:'+id,action:'set',value},prefix+'Originalpixel '+axis.toUpperCase()+' eingeben: '+value);
     }
     await input({target:'ui:id:photo-add-point',action:'click'},action.text??prefix+'Bildpunkt '+(index+1)+' setzen.');
     const error=document.querySelector('#photo-status.ai-error');
     if(error)throw Error(error.textContent);
    }
    checks.push({kind:'photo-points',count:action.points.length});
   }else if(action.kind==='ui'){
    if(action.action==='click'&&action.target==='ui:id:photo-set-preview'&&document.getElementById('photo-set-preview')?.disabled){
     const diagnosis=document.getElementById('photo-set-diagnosis');
     const rows=[...(diagnosis?.querySelectorAll('[data-issue],p')??[])].map(node=>node.textContent.trim());
     const reason=rows.length?rows.join('\n'):diagnosis?.innerText.trim();
     if(reason)throw Error(reason.slice(0,1000));
    }
    if(lastSavedPhoto&&!document.querySelector('#photo-assistant[open]')&&/^ui:id:photo-(?:mode(?:-|$)|point-|add-point$|finish$|save$|remove-measure-)/.test(action.target))
     throw Error('Der Foto-Assistent ist nach dem Speichern geschlossen. Öffne '+lastSavedPhoto+' erneut, um dieses Foto weiter zu vermessen.');
    if(action.target==='ui:id:sketch-profile-enable'&&document.querySelector('#sketch-profile-controls:not([hidden])'))
     throw Error('Der Modus Konturen mit Öffnungen ist bereits aktiv. Wähle jetzt die Konturrolle und Zeichenform im offenen Skizzeneditor.');
    if(['menu:cad','ui:menu:cad'].includes(action.target)&&document.querySelector('#modal[open] #sketch-board'))
     throw Error('Der Skizzeneditor ist bereits offen und verdeckt das CAD-Menü. Fahre mit den sichtbaren Skizzenwerkzeugen fort.');
    if(action.action==='click'&&document.querySelector('#modal[open] #stl-workbench')){
     if(/^(?:(?:ui:)?menu:convert|ui:id:practice-file-[1-4])$/.test(action.target))
      throw Error('Der STL-Konverter ist bereits offen. Fahre mit den verfügbaren Bedienelementen in diesem Dialog fort.');
     if(action.target==='ui:id:converter-import'&&document.getElementById('converter-import')?.disabled&&getPracticeConverterState()?.hasResult===false)
      throw Error('Die CAD-Übernahme ist erst nach erfolgreicher Konvertierung verfügbar. Verwende im offenen STL-Konverter converter-run.');
    }
    let control;
    for(let opening=0;opening<3;opening++){
     try{control=practiceControl(document,action.target);break;}
     catch(error){
      if(action.action!=='click'||!error.nextAction)throw error;
      await input(error.nextAction,'Werkzeugmenü für '+action.target+' sichtbar öffnen.');await settled();
     }
    }
    if(!control)throw Error('Das Werkzeug bleibt nach dem Öffnen des Menüs nicht sichtbar: '+action.target);
    const before=revision();
    if(vision&&action.action==='click'&&control.id==='photo-save'&&document.querySelector('#photo-measures li')){
     const svg=document.getElementById('photo-canvas');
     const marks=JSON.stringify([opening?.index,document.getElementById('photo-mm')?.value,svg?.innerHTML]);
     if(marks!==reviewedPhotoMarks){
      if(!recover)throw Error('Für die Sichtprüfung der Fotomessung ist keine weitere Runde verfügbar.');
      reviewedPhotoMarks=marks;
      document.getElementById('photo-fit')?.click();
      throw Object.assign(Error('Fotomessung wartet auf Sichtprüfung: Prüfe die nummerierten Messpunkte im Bild gegen die verlangten Merkmale. Korrigiere falsch gewählte Punkte. Nur bei passender Zuordnung mit photo-save fortsetzen.'),{code:'PRACTICE_PHOTO_REVIEW'});
     }
    }
    const drawingSheetId=control.id==='drawing-apply'?document.getElementById('drawing-sheet')?.value:null;
    await input({target:action.target,action:action.action==='point'?'locate':action.action,...(action.value===undefined?{}:{value:action.value})},action.text??prefix+'Formnaro-Bedienelement: '+action.target);await settled();
    if(action.action==='click'&&control.id==='cad-ref-preview'&&getDrillState()){
     await waitFor(()=>!!getDrillState()?.preview&&!document.getElementById('cad-ref-apply')?.disabled||
      !!document.querySelector('#cad-ref-status.ai-error'),'Bohrvorschau');
     if(document.querySelector('#cad-ref-status.ai-error'))throw Error(document.getElementById('cad-ref-status').textContent);
    }
    if(action.action==='click'&&control.id==='cad-ref-apply'&&getDrillState())await waitFor(()=>revision()!==before&&!getDrillState(),'Bohrung übernehmen');
    if(action.action==='click'&&control.id==='cad-modeling-preview'){await waitFor(()=>{const state=getFacePickState();return !!state?.preview||!!state&&!state.running&&!!document.querySelector('[data-modeling-status].ai-error');},'Werkzeugvorschau');if(!getFacePickState()?.preview)throw Error(document.querySelector('[data-modeling-status]')?.textContent||'Werkzeugvorschau fehlgeschlagen.');}
    if(action.action==='click'&&/^(?:align-[xyz]-(?:min|center|max)|mirror-[xyz]|array-apply)$/.test(control.id)){
     await waitFor(()=>revision()!==before,'Werkzeugänderung bestätigen');
    }
    if(action.action==='click'&&control.id==='cad-modeling-apply')await waitFor(()=>revision()!==before&&!getFacePickState(),'Werkzeug übernehmen');
    if(action.action==='click'&&control.id==='sketch-profile-close'){
     const error=document.querySelector('#sketch-message.ai-error');
     if(error)throw Error(error.textContent);
    }
    if(action.action==='click'&&control.id==='sketch-preview'){
     await waitFor(()=>!document.getElementById('sketch-apply')?.disabled||!!document.querySelector('#sketch-message.ai-error'),'Skizzenvorschau');
     const applySketch=document.getElementById('sketch-apply');
     if(!applySketch||applySketch.disabled)throw Error(document.getElementById('sketch-message')?.textContent||'Skizzenvorschau wurde nicht bestätigt.');
    }
    if(action.action==='click'&&control.id==='sketch-apply')await waitFor(()=>revision()!==before,'Skizze übernehmen');
    const result={kind:'ui',target:action.target,action:action.action};
    if(action.action==='click'&&fileButtons.has(control)){
     const file=fileButtons.get(control);
     if(opening?.file!==file)throw Error('Übungsdatei wurde nicht geöffnet.');
     const id=file.kind==='photo'?'photo-assistant':'stl-workbench';
     await waitFor(()=>opening.error||document.getElementById(id),'Übungsdatei öffnen');
     if(opening.error)throw opening.error;
     if(file.kind==='stl')await waitFor(()=>!getPracticeConverterState()?.busy,'STL analysieren',180000);
     syncOverlayLayer();
     result.file={name:file.name,kind:file.kind};
     const dialog=practiceDialogState(document);
     if(dialog)result.dialog={...dialog,controls:dialog.controls.slice(0,16),truncated:dialog.truncated||dialog.controls.length>16};
     if(file.kind==='stl')result.feedback=document.getElementById('converter-status')?.textContent.slice(0,600);
    }
    if(action.action==='click'&&['photo-add-point','photo-finish','photo-rectify'].includes(control.id)){
     const status=document.getElementById('photo-status');
     if(status?.classList.contains('ai-error'))throw Error(status.textContent);
     if(control.id==='photo-rectify'&&document.getElementById('photo-rectified-panel')?.hidden)throw Error('Entzerrte Fotoansicht wurde nicht erzeugt.');
     result.feedback=status?.textContent.slice(0,500);
    }
    if(action.action==='click'&&['photo-save','photo-cancel'].includes(control.id)&&opening?.file.kind==='photo'){
     await waitFor(()=>!document.querySelector('#photo-assistant[open]')||document.querySelector('#photo-status.ai-error'),'Fotoreferenz bestätigen');
     const error=document.querySelector('#photo-assistant[open] #photo-status.ai-error');
     if(error)throw Error(error.textContent);
     const reference=await opening.operation;
     if(opening.error)throw opening.error;
     if(control.id==='photo-save'){
      if(!reference||revision()===before)throw Error('Fotoreferenz wurde nicht im Übungsprojekt gespeichert.');
      reviewedPhotoMarks=undefined;
      const {mmPerPx,dimensions,scope}=photoEvidence(reference);
      photoAliases.set('photo-'+(opening.index+1),reference.imageId);
      lastSavedPhoto='ui:id:practice-file-'+(opening.index+1);
      result.photo={name:reference.name,view:reference.view,scaleMm:reference.scale.mm,mmPerPx,dimensions:dimensions.slice(0,12),scope};
     }
     opening=null;
    }
    if(action.action==='click'&&['converter-run','converter-import','converter-apply'].includes(control.id)){
     await waitFor(()=>!getPracticeConverterState()?.busy,'STL bearbeiten',180000);
     const state=getPracticeConverterState(),message=document.getElementById('converter-status')?.textContent;
     const confirmed=control.id==='converter-run'?state?.hasResult:control.id==='converter-import'?state?.projectPreview:revision()!==before&&state?.sourceApplied;
     if(!confirmed)throw Error(message||'STL-Schritt wurde nicht bestätigt.');
     result.feedback=[message,document.getElementById('converter-result')?.textContent].filter(Boolean).join(' · ').slice(0,600);
    }
    if(action.action==='click'&&['photo-set-preview','photo-set-apply','photo-set-save'].includes(control.id)){
     await waitFor(()=>!document.querySelector('#photo-multiview[open]')||document.getElementById('photo-set-stop')?.hidden,'Ansichtssatz verarbeiten',180000);
     const status=document.getElementById('photo-set-status'),summary=status?.textContent?.trim();
     if(status?.classList.contains('ai-error'))throw Error(summary||'Technische Ansichten konnten nicht geprüft werden.');
     if(control.id==='photo-set-preview'){
      const report=document.getElementById('photo-set-report');
      if(report?.dataset.passed!=='true')throw Error(summary||'Geprüfte CAD-Vorschau wurde nicht bestätigt.');
      result.reconstruction={passed:true,views:[...report.querySelectorAll('[data-photo-review-view]')].map(row=>({view:row.dataset.photoReviewView,passed:row.dataset.passed==='true'}))};
     }else if(before===revision())throw Error(summary||'Ansichtssatz wurde nicht im Projekt gespeichert.');
     if(summary)result.feedback=summary.slice(0,500);
    }
    if(action.action==='click'&&['drawing-update','drawing-auto','drawing-apply'].includes(control.id)){
     const panel=document.getElementById('cad-drawing-panel');
     const message=()=>panel.querySelector('[data-drawing-status]');
     await waitFor(()=>panel.hidden||!document.getElementById('drawing-update')?.disabled,'Zeichnung bearbeiten');
     if(message()?.classList.contains('ai-error'))throw Error(message().textContent);
     if(control.id==='drawing-apply'){
      const sheet=project().drawings?.sheets.find(sheet=>sheet.id===drawingSheetId);
      if(!panel.hidden||!sheet)throw Error('Zeichnungsblatt wurde nicht übernommen.');
      result.drawing={name:sheet.name,views:sheet.views.map(view=>view.kind),annotationCount:sheet.annotations.length,
       dimensions:sheet.annotations.filter(annotation=>annotation.kind!=='label').slice(0,12).map(annotation=>{
        try{return {id:annotation.id,text:cadDrawingDimension(sheet,annotation).text};}
        catch{return {id:annotation.id,status:'reference-lost'};}
       })};
     }else{
      result.feedback=[message()?.textContent,panel.querySelector('[data-drawing-freshness]')?.textContent].filter(Boolean).join(' · ').slice(0,500);
     }
    }
    const activeDialog=practiceDialogState(document);
    if(activeDialog&&!result.dialog)result.dialog=activeDialog;
    checks.push(result);
   }else throw Error('Nicht freigegebener Übungsschritt.');
   await settled();
   if(checks.length){const p=project();checks.at(-1).observation={nodes:p.nodes.map(n=>({id:n.id,hidden:!!n.hidden,locked:!!n.locked})),workplane:structuredClone(p.workplane),joints:structuredClone(p.joints),view:view?.viewState?.(),undo:controller.state().undo,scene:access.scene().objects.filter(o=>!o.target.path.length).map(o=>({id:o.id,worldBounds:o.worldBounds,volume:o.volume,solids:o.solids})),measurement:[...document.querySelectorAll('#inspection-result, #modal:has(#point-distance) p, #modal .measure-result, #cad-tools-panel [data-result]')].map(e=>e.textContent).join('\n'),visible:[...new Set((view?.groups?.bodies?.children??[]).filter(o=>o.visible).map(o=>o.userData.rootId))]};}
   if(observe)await reportExecuted(action,i,plan.actions.length,true);
   confirmedCount++;failedAction=null;
   computationNotice(false);const boundary=i===plan.actions.length-1||plan.actions[i+1].kind!=='set';
   if(framing.consider({step:i,total:plan.actions.length,boundary,size:practiceSceneExtent(project().nodes),blocked:!!practiceDialogState(document)}))await input({target:'fit',action:'click'},'Ansicht nach den Maßänderungen einpassen.');
  }
  if(reviewedPhotoMarks!==undefined){
   failedAction={kind:'ui',action:'click',target:'ui:id:photo-save'};
   throw Error('Die zur Sichtprüfung angehaltene Fotomessung wurde nicht gespeichert.');
  }
  if(quality){
   caption.textContent='Ergebnis der Übung prüfen …';
   qualityAbort=new AbortController();
   try{qualityReport=await checkPracticeResult(controller,quality,{resolve:qualityTarget,
    resolvePhoto:alias=>project().photos?.items.find(item=>item.reference.imageId===photoAliases.get(alias))?.reference,
    checkpoint,signal:qualityAbort.signal});}
   finally{qualityAbort=null;}
   if(qualityReport.blocked){
    failedAction={kind:'quality'};
    throw Error('Die optionale Ergebnisprüfung hat eine bestätigte Sollabweichung festgestellt.');
   }
  }
  caption.textContent='Übung abgeschlossen. Alle Schritte wurden im getrennten Testprojekt ausgeführt.';pointer.style.display='none';return {ok:true,steps:checks,report:{confirmedCount,...(qualityReport?{quality:qualityReport}:{}),aliases:modelUI.aliasState(),revision:revision(),objectCount:project().nodes.length,selectionCount:selected().length,nativeGearCount:project().nodes.filter(n=>n.kind==='cad'&&n.recipe?.type==='gear').length,nativeGears:project().nodes.filter(n=>n.kind==='cad'&&n.recipe?.type==='gear').map(n=>({id:n.id,teeth:n.recipe.params.teeth,module:n.recipe.params.module,scale:[0,1,2].map(k=>Math.hypot(...n.transform.slice(k*4,k*4+3))),center:n.transform.slice(12,15)})),jointCount:project().joints?.joints.length??0,couplingCount:project().joints?.gears?.length??0,driveCount:project().joints?.drives?.length??0}};
  }finally{running=false;unpause?.();pointer.style.display='none';}
 }
 async function finishResult(result){
  waiting=false;
  removeFileButtons();overlay.hidden=true;syncOverlayLayer();
  if(closing)return;
  if(!hasProjectCopy){await desktop.submitPracticeResult(result);return;}
  const candidate=await controller.transactions.materialize();
  if(closing)return;
  if(revision()!==result.report.revision)throw Error('Übungsmodell wurde nach Abschluss geändert.');
  await desktop.submitPracticeResult({value:result,project:candidate});
 }
 desktop.onPracticePlan((plan,projectCopy,files,phase={})=>{
  void (async()=>{
   try{
    failedAction=null;
    if(phase.accept){
     if(!waiting||!advisoryResult||revision()!==waitingRevision)throw Error('Übungsprüfung ist veraltet.');
     await checkpoint();
     if(revision()!==waitingRevision)throw Error('Übungsprüfung ist veraltet.');
     await finishResult(advisoryResult);
     return;
    }
    const result=await run(plan,projectCopy,files,phase);
    if(phase.recover&&!advisoryOffered&&qualityReport?.mode==='report'&&qualityReport.items.some(item=>item.status==='failed')){
     advisoryResult=result;advisoryOffered=true;
     waiting=true;waitingRevision=revision();
     interactionWarning.textContent='Prüfhinweis. Der Übungsstand kann erhalten bleiben.';
     caption.textContent='Die KI erhält den Messbefund und kann bei Bedarf nachbessern.';
     syncOverlayLayer();
     await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
     if(!closing)await desktop.submitPracticeResult({ok:true,steps:completedSteps,report:{
      ...result.report,review:true,state:continuationState(),dialog:practiceDialogState(document)
     }});
     return;
    }
    await finishResult(result);
   }catch(error){
    if(closing)return;
    const reason=String((pauseError||error).message).slice(0,1500);
    if(phase.observe&&failedAction)try{await settled();await reportExecuted(failedAction,Math.min(confirmedCount,plan.actions.length-1),plan.actions.length,false,reason);}catch{/* Original step failure remains authoritative. */}
    waiting=!!(phase.recover&&failedAction&&!pauseError&&!stopped);
    waitingRevision=revision();
    overlay.hidden=!waiting;
    if(!waiting)removeFileButtons();
    computationNotice(false);
    if(waiting)interactionWarning.textContent=error.code==='PRACTICE_PHOTO_REVIEW'?'Messpunkte vor dem Speichern prüfen.':'Schritt fehlgeschlagen. Die KI erhält den Zwischenstand.';
    caption.textContent=reason;pointer.style.display='none';syncOverlayLayer();
    if(waiting)await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if(closing)return;
    const sketch=waiting?getSketchFeedback():null;
    await desktop.submitPracticeResult({ok:false,reason,steps:completedSteps,report:{
     ...(sketch?{sketch}:{}),...(error.code==='PRACTICE_PHOTO_REVIEW'?{checkpoint:'photo-review'}:{}),
     dialog:practiceDialogState(document),aliases:modelUI.aliasState(),...(qualityReport?{quality:qualityReport}:{}),
     ...(waiting?{failedAction,state:continuationState(),revision:waitingRevision,confirmedCount}:{})
    }});
   }
  })().catch(async error=>{
   // A failed large-result transfer must not be presented as a user stop.
   try{await desktop.submitPracticeResult({ok:false,reason:'Übungsergebnis konnte nicht übertragen werden: '+String(error.message).slice(0,1000),steps:[]});}
   catch{await desktop.practiceClose?.().catch(()=>{});}
  });
 });
 desktop.onPracticeCancel?.(endSession);void desktop.practiceReady();return {isRunning:()=>running,onBuildPreview:async({completed,total})=>{if(!running)return;caption.textContent='Live-Aufbau · Schritt '+completed+' / '+total;pointer.style.display='none';await playback.delay(650);}};
}
