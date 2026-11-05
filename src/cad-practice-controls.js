import {PROGRAM_NAV,PROGRAM_TARGETS} from './cad-program-help.js';
import {PHOTO_SET_LABELS} from './cad-photo-multiview-data.js';
export const practiceTarget=target=>typeof target==='string'&&/^(menu|tool|view):[A-Za-z][A-Za-z0-9_-]{0,199}$/.test(target)?'ui:'+target:target;
const outside=node=>/^(?:converter-(?:assistance|save-step|report)|stl-(?:save-edits|load-edits|repaired-3mf|repaired-stl|preview-save))$/.test(node.id)||!!node.closest('#converter-ai')||/^(?:ai-|script-|python-|function-|plugin-)|freecad.*(?:code|script)/i.test(node.id)||!!node.dataset.plugin||node.dataset.action==='functions'||['file','password','color','hidden'].includes(node.type)||node.tagName==='A'||/(?:login|sign.?in|open.?folder|open.?browser|subscription-open|provider-docs|context-folder|log-folder|layout-folder|project-folder|data-folder)/i.test(node.id)||node.hasAttribute('data-external')||node.hasAttribute('data-drawing-export')||['open','save','save-as','import'].includes(node.dataset.action);
const visibleControl=node=>{if(!node?.getClientRects().length||getComputedStyle(node).visibility==='hidden')return false;for(let parent=node.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS'&&!parent.open&&!parent.querySelector(':scope > summary')?.contains(node))return false;return true;};

// Bounded feedback from the active modelling dialog, excluding account/chat UI.
export function practiceDialogState(document){
 const visible=visibleControl;
 const dialog=[...document.querySelectorAll('dialog[open]')].filter(visible).at(-1)??[...document.querySelectorAll('#cad-modeling-panel,#cad-reference-panel,#align-panel,#mirror-panel,#joint-panel,#cad-drawing-panel')].find(visible);
 if(!dialog||dialog.querySelector('[data-settings-page],#ai-settings,#ai-agent-panel')||/(?:ai|account|login|mistral|provider)/i.test(dialog.id))return null;
 const text=value=>String(value??'').replace(/\s+/g,' ').trim().slice(0,120),controls=[];let bytes=0,truncated=false;
 for(const node of dialog.querySelectorAll('input,select,textarea,button,summary,[role=button]')){
  if(!visible(node)||outside(node)||node.closest('#practice-overlay,#program-assistant-overlay,[data-settings-page],#ai-chat')||/(?:api[-_]?key|token|secret|password|provider|mistral|ai-)/i.test(node.id))continue;
  const label=text(node.getAttribute('aria-label')||[...(node.labels??[])].map(l=>[...l.childNodes].filter(c=>c.nodeType===3).map(c=>c.textContent).join(' ')).join(' ')||(['BUTTON','SUMMARY'].includes(node.tagName)?node.textContent:'')||node.getAttribute('title'));
  const target=/^[A-Za-z][A-Za-z0-9_-]{0,199}$/.test(node.id)?'ui:id:'+node.id:label?'ui:label:'+label:null;if(!target)continue;
  const field={target,label,type:node.tagName==='INPUT'?node.type:node.tagName.toLowerCase(),disabled:!!node.disabled||node.matches(':disabled'),editable:!node.disabled&&!node.readOnly&&!node.matches(':disabled')};
  if(['INPUT','SELECT','TEXTAREA'].includes(node.tagName))field.value=String(node.value??'').slice(0,200);
  if(['checkbox','radio'].includes(node.type))field.checked=!!node.checked;
  if(node.tagName==='SELECT'){field.options=[...node.options].slice(0,24).map(o=>({value:String(o.value).slice(0,200),label:text(o.textContent),disabled:!!o.disabled}));if(node.options.length>24)field.optionsTruncated=true;}
  bytes+=JSON.stringify(field).length;if(controls.length>=40||bytes>8000){truncated=true;break;}controls.push(field);
 }
 const titleBlock=document.getElementById?.('drawing-title-block');
 const nextAction=titleBlock&&dialog.contains(titleBlock)&&visible(titleBlock)&&titleBlock.parentElement?.tagName==='DETAILS'&&!titleBlock.parentElement.open
  ?{blockedTarget:'ui:id:drawing-title',action:'click',target:'ui:id:drawing-title-block',reason:'Titelblock geschlossen'}:undefined;
 return { ...(nextAction?{nextAction}:{}),title:text(dialog.querySelector('h1,h2,h3,legend,header strong')?.textContent),controls,truncated};
}
// Semantic controls inside the current Formnaro document. No caller selectors,
// coordinates, arbitrary keys, window handles or external navigation.
export function practiceControl(document,target){
 target=practiceTarget(target);if(typeof target!=='string'||target.length>240||!/^ui:(id|label|tool|menu|view):[^\r\n\x00]+$/.test(target))throw Error('Ein benanntes Formnaro-Bedienelement wählen.');
 const [,kind,...rest]=target.split(':'),name=kind==='menu'?(PROGRAM_NAV.find(t=>t.id==='menu:'+rest.join(':'))?.label??rest.join(':')):rest.join(':'),normal=s=>String(s??'').replace(/[\s▾⌄]+/g,' ').trim();
 if(!['label','menu'].includes(kind)&&!/^[A-Za-z][A-Za-z0-9_-]{0,199}$/.test(name))throw Error('Ungültige Bedienelementkennung.');
 const visible=n=>visibleControl(n)&&!n.closest('#practice-overlay');
 if(kind==='label'){const view=PROGRAM_TARGETS.find(t=>t.id.startsWith('view:')&&normal(t.label)===normal(name));if(view)return practiceControl(document,'ui:'+view.id);}
 let candidates=[];
 if(kind==='id')candidates=[document.getElementById(name)];
 else if(kind==='tool')candidates=[...document.querySelectorAll('button')].filter(n=>[n.dataset.action,n.dataset.solidCommand,n.dataset.fusionCommand].includes(name));
 else if(kind==='view')candidates=[...document.querySelectorAll('button')].filter(n=>{
  const {view,solidView,fusionView,action,solidCommand,fusionCommand}=n.dataset;
  return [view,solidView,fusionView].includes(name)||name==='fit'&&[action,solidCommand,fusionCommand].includes('fit');
 });
 else {
  const labels=[...document.querySelectorAll('label')].filter(n=>normal(n.childNodes.length?[...n.childNodes].filter(c=>c.nodeType===3).map(c=>c.textContent).join(' '):n.textContent)===normal(name));
  candidates=labels.map(n=>n.control??(n.htmlFor?document.getElementById(n.htmlFor):n.querySelector('input,select,textarea'))).filter(Boolean);
  if(!candidates.length)candidates=[...document.querySelectorAll('button,summary,input,select,textarea,[role=button]')].filter(n=>[n.getAttribute('aria-label'),n.tagName==='INPUT'?n.getAttribute('title'):n.textContent].some(v=>v!=null&&normal(v)===normal(name)));
 }
 candidates=[...new Set(candidates.filter(visible))];
 if(kind==='view'&&name==='fit'&&candidates.length>1)candidates=[candidates[0]];
 if(candidates.length!==1&&kind==='label'){const tools=PROGRAM_TARGETS.filter(t=>t.id.startsWith('tool:')&&normal(t.label)===normal(name));if(tools.length===1)return practiceControl(document,'ui:'+tools[0].id);}
 if(candidates.length>1){const semantic=n=>{const tool=n.dataset.action??n.dataset.solidCommand??n.dataset.fusionCommand,view=n.dataset.view??n.dataset.solidView??n.dataset.fusionView;return tool?'tool:'+tool:view?'view:'+view:null;},key=semantic(candidates[0]);if(key&&candidates.every(n=>semantic(n)===key))candidates=[candidates[0]];}
 if(kind==='id'&&name==='drawing-title'&&!candidates.length&&visible(document.getElementById('drawing-title-block')))throw Error('Titelblock geschlossen. Zuerst ui:id:drawing-title-block öffnen, dann ui:id:drawing-title setzen.');
 if(candidates.length!==1)throw Error('Formnaro-Bedienelement fehlt oder ist mehrdeutig: '+name);
 const node=candidates[0];if(node.disabled)throw Error('Formnaro-Bedienelement ist deaktiviert: '+name);
 // These controls leave this document or address credentials rather than the
 // exercise. Ordinary menus, dialogs, modelling fields and mode controls have
 // no hand-written allowlist.
 if(outside(node))throw Error('Dieses Ziel führt aus dem Formnaro-Übungsfenster heraus.');
 return node;
}
export function practiceOptionIndex(node,value){
 if(node.tagName!=='SELECT')throw Error('Eine echte Auswahlliste wählen.');
 const options=[...node.options],enabled=options.filter(option=>!option.disabled);
 let matches=enabled.filter(option=>option.value===value||option.textContent.trim()===value);
 if(!matches.length&&node.id==='photo-view'){
  const photoView=Object.keys(PHOTO_SET_LABELS).find(view=>PHOTO_SET_LABELS[view]===value);
  if(photoView)matches=enabled.filter(option=>option.value===photoView);
 }
 if(matches.length!==1||options.length>512){
  const choices=enabled.slice(0,6).map(option=>{
   const label=option.textContent.replace(/\s+/g,' ').trim().slice(0,50),value=option.value.slice(0,40);
   return label===value?label:`${value} (${label})`;
  }).join(', ');
  throw Error(`Auswahl „${value}“ fehlt oder ist mehrdeutig in ${node.id}.${choices?' Verfügbar: '+choices+(enabled.length>6?' …':'.'):''}`);
 }
 return options.indexOf(matches[0]);
}
export function installPracticeControlBridge(document,host=window,{onLocate}={}){
 document.addEventListener?.('click',event=>{if(event.target?.tagName==='INPUT'&&['file','color'].includes(event.target.type)){event.preventDefault();event.stopImmediatePropagation();}},true);
 host.__formnaroPracticeControl=(operation,spec,point)=>{
  const node=practiceControl(document,spec.target);
  if(operation==='focused')return document.activeElement===node;
  if(operation==='hit'){const hit=document.elementFromPoint(point.x,point.y);return {ok:!!hit&&(node===hit||node.contains(hit)),hit:hit?hit.tagName+'#'+hit.id:'none'};}
  if(operation!=='locate')throw Error('Unbekannte Bedienelementabfrage.');
  node.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});onLocate?.(node);const r=node.getBoundingClientRect(),result={x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),width:r.width,height:r.height};
  if(spec.action==='drag'){if(node.tagName!=='INPUT'||node.type!=='range')throw Error('Einen Schieberegler wählen.');result.range={min:Number(node.min||0),max:Number(node.max||100),value:Number(node.value)};}
  if(spec.action==='choose')result.optionIndex=practiceOptionIndex(node,spec.value);
  if(spec.action==='set'&&!['INPUT','TEXTAREA'].includes(node.tagName))throw Error('Ein echtes Eingabefeld wählen.');
  return result;
 };
}
