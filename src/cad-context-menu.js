import './cad-context-menu.css';
import {fusionLabel} from './cad-fusion-state.js';
import {CONTEXT_COMMANDS,CONTEXT_MODES,CONTEXT_DEFAULTS,createContextSettings,isFunctionCommand,contextCommandAllowed} from './cad-context-menu-state.js';
import {label as pluginLabel} from './cad-function-plugins.js';

export function createCadContextMenu({storage,view,getMode,getSelection,getContexts,getRevision,select,runCommand,canRun=()=>true,isIdle=()=>true,safe,toast=()=>{},openSettings,getLanguage=()=> 'de',getFunctions=()=>[]}){
 const settings=createContextSettings(storage),word=(de,en)=>getLanguage()==='en'?en:de,make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
 let active=null,rightGesture=null,sequence=0;
 const signature=()=>JSON.stringify(getSelection()),locale=()=>getLanguage()==='en'?1:0;
 function functionEntries(){return getFunctions().filter(p=>p.enabled).flatMap(p=>p.manifest.functions.map(f=>({key:'function:'+p.manifest.id+':'+f.id,name:pluginLabel(p.manifest.name,getLanguage())+' · '+pluginLabel(f.name,getLanguage()),action:f.action})));}
 function commandName(key){const fusion=getMode()==='fusion'?fusionLabel(key,getLanguage()):key;return fusion!==key?fusion:CONTEXT_COMMANDS[key]?.[locale()]??functionEntries().find(f=>f.key===key)?.name??word('Nicht verfügbare Funktion: ','Unavailable function: ')+key;}
 function close({focus=false}={}){++sequence;if(!active)return;const previous=active.focus;active.node.remove();active=null;if(focus)(previous?.isConnected?previous:view.canvas)?.focus({preventScroll:true});}
 function allowed(key){const contexts=getContexts();if(isFunctionCommand(key)){const f=functionEntries().find(f=>f.key===key);return !!f&&canRun(f.action);}return contextCommandAllowed(key,contexts)&&canRun(key);}
 function choose(key){const s=active;if(!s)return;if(s.revision!==getRevision()||s.selection!==signature()){close();toast(word('Die Auswahl wurde geändert. Rechtsklick-Menü erneut öffnen.','Selection changed. Open the context menu again.'));return;}
  if(!['cancel','apply-active','customize'].includes(key)&&!allowed(key))return;
  const picked={point:s.point,canvas:s.canvas,target:s.target};close();if(key==='customize'){openSettings();document.getElementById('settings-tab-context')?.click();return;}
  const entry=isFunctionCommand(key)?functionEntries().find(f=>f.key===key):null;
  return runCommand(entry?.action??key,picked);
 }
 function row(parent,key,text,enabled=true,icon=false){const b=make('button',text);b.type='button';b.dataset.contextAction=key;b.setAttribute('role','menuitem');b.disabled=!enabled;b.tabIndex=-1;b.title=text;b.onclick=()=>safe(()=>choose(key));if(icon)b.className='context-quick-command';parent.append(b);return b;}
 function show(x,y,{background=false,focus=document.activeElement,canvas=false,target=null}={}){
  close();const mode=getMode(),idle=isIdle(),contexts=getContexts(),menu=make('div',undefined,'cad-context-menu');menu.id='cad-context-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label',word('Rechtsklick-Menü','Context menu'));
  const title=background?word('Ansicht','View'):contexts.length===1?contexts[0].name:contexts.length>1?contexts.length+' '+word('Teile ausgewählt','parts selected'):word('Ansicht','View');menu.append(make('strong',title,'context-heading'));
  active={node:menu,revision:getRevision(),selection:signature(),focus,point:{clientX:x,clientY:y},canvas,target};
  if(!idle){row(menu,'apply-active',word('Vorschau übernehmen','Apply preview'),canRun('apply-active'));row(menu,'cancel',word('Bearbeitung abbrechen','Cancel operation'));row(menu,'fit',commandName('fit'));}
  else{
   if(['solid','fusion'].includes(mode)&&!background&&contexts.length){const quick=make('div',undefined,'context-quick-bar');quick.setAttribute('role','group');quick.setAttribute('aria-label',word('Kontextwerkzeuge','Context toolbar'));for(const [key,icon]of [['edit-feature','✎'],['sketch-on-part','▱'],['hide','◉'],['fit','⛶'],['properties','⚙']]){const b=row(quick,key,icon,allowed(key),true);b.title=commandName(key);b.setAttribute('aria-label',commandName(key));}menu.append(quick);}
   const configured=settings.get().modes[mode]??settings.get().modes.normal;
   const keys=background?[...new Set(['undo','redo','paste','fit','view-iso','view-front','view-top','view-right','show-all',...configured.filter(key=>isFunctionCommand(key)||CONTEXT_COMMANDS[key]?.[2]==='always')])]:configured;
   for(const key of keys)row(menu,key,commandName(key),allowed(key));
   if(!background&&!keys.includes('fit'))row(menu,'fit',commandName('fit'));
   const divider=make('hr');divider.setAttribute('role','separator');menu.append(divider);row(menu,'customize',word('Rechtsklick-Menü anpassen …','Customize context menu …'));
  }
  document.body.append(menu);menu.style.maxHeight=Math.max(100,innerHeight-16)+'px';const r=menu.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(x,innerWidth-r.width-8))+'px';menu.style.top=Math.max(8,Math.min(y,innerHeight-r.height-8))+'px';
  menu.onkeydown=event=>{const buttons=[...menu.querySelectorAll('button:not(:disabled)')],i=buttons.indexOf(document.activeElement);if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close({focus:true});}else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();event.stopPropagation();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(i+(event.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length;buttons[next]?.focus();}else if(['Enter',' '].includes(event.key)&&event.target.matches('button')){event.preventDefault();event.stopPropagation();event.target.click();}};
  menu.querySelector('button:not(:disabled)')?.focus({preventScroll:true});return menu;
 }
 function location(event){
  if(event.target===view.canvas){const hit=view.visualHit(event),data=hit?.object?.userData,id=data?.rootId;return {target:data?.sourceTarget??(id?{rootId:id,path:[]}:null),canvas:true};}
  const row=event.target.closest('#object-list [data-root-id],#object-list [data-mesh-source-root]');if(!row)return null;
  return {target:row.dataset.rootId?{rootId:row.dataset.rootId,path:JSON.parse(row.dataset.path)}:{rootId:row.dataset.meshSourceRoot,path:[]},canvas:false};
 }
 function onContext(event){const place=location(event);if(!place||document.getElementById('modal')?.open||document.body.classList.contains('layout-editing'))return;event.preventDefault();event.stopPropagation();
  if(rightGesture?.moved)return;safe(()=>{if(isIdle()&&place.target&&!getSelection().some(t=>t.rootId===place.target.rootId&&JSON.stringify(t.path)===JSON.stringify(place.target.path)))select([place.target]);show(event.clientX,event.clientY,{background:!place.target,focus:event.target,canvas:place.canvas,target:place.target});});
 }
 document.addEventListener('pointerdown',event=>{if(event.button===2)rightGesture={x:event.clientX,y:event.clientY,moved:false};else rightGesture=null;if(active&&!event.target.closest('#cad-context-menu'))close();},true);
 document.addEventListener('pointermove',event=>{if(rightGesture&&Math.hypot(event.clientX-rightGesture.x,event.clientY-rightGesture.y)>5)rightGesture.moved=true;},true);
 document.addEventListener('contextmenu',onContext,true);
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&active){event.preventDefault();event.stopImmediatePropagation();close({focus:true});return;}if((event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey)&&!event.target.closest('input,textarea,select,[contenteditable=true]')){const place=location(event);if(!place)return;event.preventDefault();rightGesture=null;const r=event.target.getBoundingClientRect();onContext({target:event.target,clientX:r.left+Math.min(r.width/2,80),clientY:r.top+Math.min(r.height/2,80),preventDefault(){},stopPropagation(){}});}},true);
 window.addEventListener('resize',()=>close());window.addEventListener('blur',()=>close());
 function refresh(){if(active&&(active.revision!==getRevision()||active.selection!==signature()))close();}
 function mountSettings(root){
  const field=make('fieldset');field.id='context-menu-settings';field.append(make('legend',word('Rechte Maustaste','Right mouse button')));
  field.append(make('p',word('Wähle die Funktionen und ihre Reihenfolge für jeden Bedienmodus. Rechtsklick auf ein Teil oder im Modellbaum öffnet das Menü. Rechts ziehen dreht weiterhin die Ansicht.','Choose commands and their order for each mode. Right-click a part or the model tree to open the menu. Right-drag still rotates the view.')));
  const modeLabel=make('label',word('Belegung für Modus','Configure mode'),'dialog-label'),mode=make('select');mode.id='context-settings-mode';for(const [key,name]of [['easy','Easy Tinker'],['normal','Normal'],['solid','Solid'],['fusion','Fusion']])mode.append(new Option(name,key));mode.value=getMode();modeLabel.append(mode);field.append(modeLabel);
  const list=make('ol');list.id='context-settings-list';field.append(list);
  const pickLabel=make('label',word('Funktion hinzufügen','Add command'),'dialog-label'),picker=make('select');picker.id='context-settings-command';for(const [key,names]of Object.entries(CONTEXT_COMMANDS))picker.append(new Option(names[locale()],key));for(const f of functionEntries())picker.append(new Option(f.name,f.key));pickLabel.append(picker);field.append(pickLabel);
  const actions=make('div',undefined,'context-settings-actions'),add=make('button',word('Hinzufügen','Add')),reset=make('button',word('Diesen Modus zurücksetzen','Reset this mode'));add.type=reset.type='button';add.id='context-settings-add';reset.id='context-settings-reset';actions.append(add,reset);field.append(actions);
  function change(keys){const value=settings.get();value.modes[mode.value]=keys;try{settings.set(value);}finally{render();}}
  function render(){list.replaceChildren();const keys=settings.get().modes[mode.value];keys.forEach((key,i)=>{const row=make('li'),name=make('span',commandName(key));row.append(name);for(const [text,moveTo]of [['↑',i-1],['↓',i+1],['×',-1]]){const b=make('button',text);b.type='button';b.dataset.contextReorder=text==='↑'?'up':text==='↓'?'down':'remove';b.setAttribute('aria-label',commandName(key)+' · '+(text==='↑'?word('nach oben','move up'):text==='↓'?word('nach unten','move down'):word('entfernen','remove')));b.disabled=text==='↑'&&i===0||text==='↓'&&i===keys.length-1;b.onclick=()=>safe(()=>{const next=[...keys];if(text==='×')next.splice(i,1);else [next[i],next[moveTo]]=[next[moveTo],next[i]];change(next);});row.append(b);}list.append(row);});add.disabled=keys.includes(picker.value)||keys.length>=32;}
  add.onclick=()=>safe(()=>change([...settings.get().modes[mode.value],picker.value]));reset.onclick=()=>safe(()=>change([...CONTEXT_DEFAULTS[mode.value]]));mode.onchange=render;picker.onchange=render;render();root.append(field);
 }
 return {settings,show,close,refresh,mountSettings,state:()=>active?{revision:active.revision,selection:active.selection}:null};
}
