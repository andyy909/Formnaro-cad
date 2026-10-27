import {PROGRAM_ASSISTANT_CONTRACT,PROGRAM_TARGETS,PROGRAM_TOOL_TABS,searchProgramHelp,validateAssistantAction,programQuestion} from './cad-program-help.js';
import './cad-program-assistant.css';
const frame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
const aborted=()=>Object.assign(Error('Bedienhilfe abgebrochen.'),{name:'AbortError',code:'AI_ASSISTANT_ABORTED'});
export function createCadProgramAssistant({access,showPreview,clearPreview,cancelComputation=()=>{},select=()=>{},getMode=()=>document.body.dataset.workbenchMode??'normal',getBusy=()=>false,desktop=window.offlinecadDesktop,language=()=> 'de'}={}){
 let active=null,speed=1000,paused=false,resume=null,lastReport=null;
 const overlay=document.createElement('div');overlay.id='program-assistant-overlay';overlay.setAttribute('popover','manual');overlay.hidden=true;overlay.innerHTML='<div class="assistant-blue-border" aria-hidden="true"></div><div id="program-assistant-pointer" aria-hidden="true"><svg viewBox="0 0 36 44"><path d="M4 3 L4 33 L12 26 L20 40 L27 36 L19 23 L31 22 Z"/></svg><span></span></div><section class="program-assistant-controls" aria-label="Programm-Assistent"><strong>Formnaro-Assistent</strong><span id="program-assistant-caption" role="status" aria-live="polite"></span><div><button id="program-assistant-pause" type="button">Pause</button><select id="program-assistant-speed" aria-label="Vorführgeschwindigkeit"><option value="1600">Langsam</option><option value="1000" selected>Normal</option><option value="500">Schnell</option></select><button id="program-assistant-stop" type="button">Stop · Esc</button></div></section>';document.body.append(overlay);
 const pointer=overlay.querySelector('#program-assistant-pointer'),caption=overlay.querySelector('#program-assistant-caption'),pauseButton=overlay.querySelector('#program-assistant-pause');
 const visible=node=>!!node&&node.getClientRects().length>0&&getComputedStyle(node).visibility!=='hidden';
 function candidates(id){
  const row=PROGRAM_TARGETS.find(t=>t.id===id);if(!row)return [];
  const [kind,key]=id.split(':');let selector;
  if(kind==='tool'){
   const alias={'edit-feature':'cad-edit-modeling','mode-translate':'translate','mode-rotate':'rotate','mode-scale':'scale'}[key];
   selector=key.startsWith('mode-')?`[data-mode="${alias}"]`:`[data-action="${alias??key}"],[data-solid-command="${key}"],[data-fusion-command="${key}"]`;
  }else if(kind==='menu'){const solid={cad:'features',mesh:'mesh',convert:'mesh','view-tools':'evaluate',arrange:'assembly'}[key],fusion={cad:'solid',mesh:'mesh',convert:'mesh','view-tools':'tools',arrange:'tools'}[key];selector=`details[data-tool-category="${key}"] > summary,details[data-solid-menu="${key}"] > summary,details[data-fusion-menu="${key}"] > summary`+(solid?`,[data-solid-tab="${solid}"]`:'')+(fusion?`,[data-fusion-tab="${fusion}"]`:'');}
  else if(kind==='mode')selector=`[data-workbench-mode="${key}"]`;
  else if(kind==='view')selector=`[data-view="${key}"],[data-solid-view="${key}"]`;
  else if(kind==='settings')selector={usage:'#ai-meter-usage-tab',context:'#ai-meter-context-tab','usage-refresh':'#ai-meter-refresh'}[key]??(key==='close'?'dialog[open]:has([data-settings-page]) #modal-close':['theme','language'].includes(key)?'#settings-'+key:`[data-settings-tab="${key}"]`);
  else if(kind==='region')selector={viewport:'#viewport',library:'.shape-library-section',properties:'#inspector',tree:'#object-list','preview-apply':'#ai-chat-apply,#cad-ai-preview-apply','preview-discard':'#ai-chat-discard,#cad-ai-preview-discard'}[key];
  else selector={grid:'#snap',coordinates:'#coordinate-mode'}[id];
  return selector?[...document.querySelectorAll(selector)]:[];
 }
 function location(node){const d=node?.closest('details'),panel=node?.closest('[data-fusion-panel],[data-solid-panel]');return [getMode(),panel?.dataset.fusionPanel??panel?.dataset.solidPanel,d?.querySelector(':scope > summary')?.textContent?.trim()].filter(Boolean).join(' → ');}
 function state(){return {mode:getMode(),active:!!active,targets:PROGRAM_TARGETS.map(t=>{const nodes=candidates(t.id),node=nodes.find(visible)??nodes[0];return {id:t.id,present:!!node,visible:visible(node),disabled:!!node?.disabled,location:node?location(node):undefined,revealVia:t.key?PROGRAM_TOOL_TABS[getMode()]?.[t.key]:undefined};})};}
 function context(){return {...structuredClone(PROGRAM_ASSISTANT_CONTRACT),state:state()};}
 function check(signal){if(signal?.aborted)throw aborted();}
 async function wait(ms,signal){check(signal);await new Promise((resolve,reject)=>{const timer=setTimeout(done,ms);function done(){signal?.removeEventListener('abort',stop);resolve();}function stop(){clearTimeout(timer);signal?.removeEventListener('abort',stop);reject(aborted());}signal?.addEventListener('abort',stop,{once:true});});check(signal);while(paused){await new Promise(resolve=>{resume=resolve;signal?.addEventListener('abort',resolve,{once:true});});check(signal);}}
 function front(){const modal=document.querySelector('dialog[open]');const parent=modal??document.body;if(overlay.parentElement!==parent){try{overlay.hidePopover?.();}catch{}parent.append(overlay);}overlay.hidden=false;try{if(overlay.matches(':popover-open'))overlay.hidePopover();overlay.showPopover?.();}catch{}}
 function start(kind){if(active)throw Error('Die Bedienhilfe läuft bereits.');const controller=new AbortController();active={kind,controller,computing:false};paused=false;pauseButton.textContent='Pause';front();return controller.signal;}
 function end(){document.querySelectorAll('.program-assistant-target').forEach(n=>n.classList.remove('program-assistant-target'));try{overlay.hidePopover?.();}catch{}overlay.hidden=true;document.body.append(overlay);delete overlay.dataset.stage;active=null;paused=false;resume?.();resume=null;}
 function cancel(){if(!active)return false;active.controller.abort();if(active.computing)cancelComputation();paused=false;resume?.();return true;}
 overlay.querySelector('#program-assistant-stop').onclick=cancel;pauseButton.onclick=()=>{paused=!paused;pauseButton.textContent=paused?'Weiter':'Pause';if(!paused){resume?.();resume=null;}};overlay.querySelector('#program-assistant-speed').onchange=e=>{speed=Number(e.target.value);};
 const key=e=>{if(active&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();cancel();}},takeover=e=>{if(active&&e.isTrusted&&!overlay.contains(e.target))cancel();},blur=()=>{if(active)cancel();};window.addEventListener('keydown',key,true);window.addEventListener('pointerdown',takeover,true);window.addEventListener('blur',blur);
 async function reveal(id,signal){
  check(signal);if(id.startsWith('settings:')&&id!=='settings:close'){if(!document.querySelector('dialog[open] [data-settings-page]')){const current=document.querySelector('dialog[open]');if(current&&!current.classList.contains('ai-modal'))throw Error('Den vorhandenen Dialog zuerst abschließen.');const button=document.getElementById('settings-open');if(!button)throw Error('Einstellungen sind nicht verfügbar.');await navigate(button,'Einstellungen öffnen',signal);}const page=id.split(':')[1],tab=['usage','context','usage-refresh'].includes(page)?'ai':['theme','language'].includes(page)?'general':page;const button=document.querySelector(`[data-settings-tab="${tab}"]`);if(button&&document.querySelector(`[data-settings-page="${tab}"]`)?.hidden){await navigate(button,'Einstellungen → '+tab,signal);}front();}
  const mode=getMode(),tab=id.startsWith('tool:')?PROGRAM_TOOL_TABS[mode]?.[id.slice(5)]:null;if(tab&&!candidates(id).some(visible)){const button=document.querySelector(`[data-${mode}-tab="${tab}"]`);if(button)await navigate(button,'Werkzeugregister öffnen',signal);}
  let nodes=candidates(id),node=nodes.find(visible)??nodes[0];if(!node)throw Error('Dieses Bedienziel ist im aktuellen Modus nicht vorhanden: '+id);
  const fusion=node.closest('[data-fusion-panel]'),solid=node.closest('[data-solid-panel]');if(fusion?.hidden){document.querySelector(`[data-fusion-tab="${fusion.dataset.fusionPanel}"]`)?.click();await frame();}if(solid?.hidden){document.querySelector(`[data-solid-tab="${solid.dataset.solidPanel}"]`)?.click();await frame();}
  const details=[];for(let parent=node.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS'&&!parent.open)details.unshift(parent);
  for(const d of details){const summary=d.querySelector(':scope > summary');if(summary)await navigate(summary,summary.textContent.trim(),signal);}
  nodes=candidates(id);node=nodes.find(visible)??node;if(!visible(node))throw Error('Bedienziel ist hier nicht sichtbar. Passenden Bedienmodus öffnen: '+id);node.scrollIntoView({block:'nearest',inline:'nearest'});await frame();check(signal);return node;
 }
 function movePointer(node,text){document.querySelectorAll('.program-assistant-target').forEach(n=>n.classList.remove('program-assistant-target'));node.classList.add('program-assistant-target');caption.textContent=text;const r=node.getBoundingClientRect();pointer.style.transform=`translate(${Math.max(0,Math.min(innerWidth-36,r.left+r.width/2))}px,${Math.max(0,Math.min(innerHeight-44,r.top+r.height/2))}px)`;}
 async function navigate(node,text,signal){if(!visible(node)||node.disabled)throw Error('Navigation ist derzeit nicht verfügbar.');front();node.scrollIntoView({block:'nearest'});movePointer(node,text);await wait(Math.round(speed*.6),signal);pointer.classList.add('assistant-click');node.click();await frame();front();await wait(Math.round(speed*.6),signal);pointer.classList.remove('assistant-click');}
 async function point(id,text,signal){
  front();const node=await reveal(id,signal);movePointer(node,text||PROGRAM_TARGETS.find(t=>t.id===id).label);await wait(Math.round(speed*.6),signal);return node;
 }
 async function execute(value,{isCurrent=()=>true,expectedProviderId}={}){
  value=validateAssistantAction(value);
  if(value.kind==='help')return {kind:'help',documentation:searchProgramHelp(value.query),ui:state(),scope:'Local program documentation and registered UI only; no model or filesystem mutation.'};
  if(value.kind==='note'){if(!desktop?.readAIContextNote||!desktop?.appendAIContextNote)throw Error('Kontextnotizen sind in dieser Ausgabe nicht verfügbar.');const previous=await desktop.readAIContextNote({providerId:expectedProviderId});if(!isCurrent())throw aborted();return desktop.appendAIContextNote({providerId:expectedProviderId,expectedRevision:previous.revision,text:value.text});}
  if(value.kind!=='guide')throw Error('Modellvorführungen über den Vorschauablauf ausführen.');
  const signal=start('guide'),revision=access.scene().revision,steps=[];
  try{for(const s of value.steps){if(!isCurrent()||access.scene().revision!==revision)throw aborted();const node=await point(s.target,s.text,signal);if(s.action==='click'||s.action==='set'){
    if(node.disabled)throw Error('Werkzeug ist deaktiviert. Auswahl und Voraussetzungen beachten: '+s.target);
    if(s.action==='click'){if(s.target.startsWith('tool:'))document.querySelector('dialog[open].ai-modal')?.close();if(s.target.startsWith('tool:')&&getBusy())throw Error('Zuerst die vorhandene Bearbeitung oder Vorschau abschließen.');pointer.classList.add('assistant-click');if(s.target==='settings:close')node.closest('dialog').close();else node.click();}else{node.value=String(s.value);node.dispatchEvent(new Event('change',{bubbles:true}));}
    await frame();front();if(access.scene().revision!==revision)throw Object.assign(Error('Die Bedienhilfe darf keine bestätigte Modelländerung auslösen.'),{code:'AI_ASSISTANT_MODEL_CHANGED'});await wait(speed,signal);pointer.classList.remove('assistant-click');
   }else await wait(speed,signal);steps.push({target:s.target,action:s.action});}
   return lastReport={kind:'guide',completed:true,steps,modelChanged:false};
  }finally{end();}
 }
 async function demonstrate(value,{preview,inspect,checks,isCurrent=()=>true}={}){
  value=validateAssistantAction(value);if(value.kind!=='demonstrate')throw Error('Keine Modellvorführung.');document.querySelector('dialog[open].ai-modal')?.close();if(getBusy())throw Error('Vorhandene Bearbeitung zuerst abschließen.');const signal=start('demonstrate'),revision=access.scene().revision,commands=[];let last=null,keep=false;
  try{for(const menu of document.querySelectorAll('details[data-tool-category][open],details[data-solid-menu][open],details[data-fusion-menu][open],.fusion-group-menu[open]')){const summary=menu.querySelector(':scope > summary');if(summary&&visible(summary))await navigate(summary,'Menü schließen und Konstruktion zeigen',signal);}
   for(const [index,stage]of value.stages.entries()){
    check(signal);if(!isCurrent()||access.scene().revision!==revision)throw aborted();if(last){clearPreview();access.discard(last.previewId);last=null;}commands.push(...stage.commands);caption.textContent=`${index+1}/${value.stages.length} · ${stage.text}`;active.computing=true;
    try{last=await preview({revision,label:value.title,commands:structuredClone(commands),...(index===value.stages.length-1&&checks?.length?{checks}:{})},{retainFailedChecks:true});}finally{if(active)active.computing=false;}
    check(signal);await showPreview(last);overlay.dataset.stage=String(index+1);await point(stage.target??'region:viewport',`${index+1}/${value.stages.length} · ${stage.text}`,signal);await wait(speed,signal);
   }clearPreview();keep=true;lastReport={kind:'demonstrate',completed:true,stages:value.stages.length,modelChanged:false};return {proposal:last,commands:structuredClone(commands),report:lastReport};
  }finally{if(!keep&&last){clearPreview();access.discard(last.previewId);}end();}
 }
 return {context,state,execute,demonstrate,cancel,isProgramQuestion:programQuestion,lastReport:()=>lastReport,dispose(){cancel();window.removeEventListener('keydown',key,true);window.removeEventListener('pointerdown',takeover,true);window.removeEventListener('blur',blur);overlay.remove();}};
}
