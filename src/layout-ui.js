import './layout.css';
import {mountLayoutCustomize} from './layout-customize.js';
import {LAYOUT_DEFAULTS,defaultLayout,loadLayout,validateLayout,moveLayoutItem} from './layout-preferences.js';
import {createLayoutLibrary} from './layout-library.js';
import {createSidebarSizing} from './sidebar-sizing.js';

// Move the existing controls so their handlers, enabled state and IDs survive.
// The editor handles are separate buttons, including handles for disabled tools.
export function createLayoutUI({storage,desktop=window.offlinecadDesktop,safe,toast,prepare=()=>{},isBusy=()=>false,t=v=>v}){
  const zones={header:document.querySelector('.file-actions'),toolbar:document.querySelector('.tools'),view:document.querySelector('.view-controls'),mode:document.querySelector('.mode-switch')};
  const selectors={ai:'#ai-open',settings:'#settings-open',coordinates:'#coordinate-mode',magnet:'#magnet-mode'};
  const items=new Map();
  for(const keys of Object.values(LAYOUT_DEFAULTS.zones))for(const key of keys){
    const selector=selectors[key]||(key.startsWith('view-')?`[data-view="${key.slice(5)}"]`:key.startsWith('mode-')?`[data-mode="${key.slice(5)}"]`:`[data-action="${key}"]`);
    const node=document.querySelector(selector);if(!node){if(['stl-to-step','drill','mesh-tools','mesh-select','mesh-inspector','mesh-repair','mesh-close-hole','mesh-connectors','mesh-reduce','mesh-remesh','mesh-smooth','mesh-sculpt','mesh-erase-fill','mesh-make-solid','mesh-hollow','mesh-more','cad-to-mesh','mesh-to-cad','workplane-set','workplane-top','reset-plane'].includes(key))continue;throw Error('Layout-Werkzeug fehlt: '+key);}
    node.dataset.layoutKey=key;items.set(key,node);
  }
  zones.toolbar.querySelectorAll('i').forEach(n=>n.remove());
  for(const [key,node]of Object.entries(zones))node.dataset.layoutZone=key;
  let saved=loadLayout(storage),draft=null,overlay=null,gesture=null,scheduled=false,lastFocus=null;
  let busy=false,loaded=false,lastError='',settingsRoot=null;
  const viewport=document.getElementById('viewport'),main=document.querySelector('main');
  const sidePanels={library:document.querySelector('.left-panel'),inspector:document.querySelector('.right-panel')},sideContents={},sideButtons={};
  for(const [key,panel]of Object.entries(sidePanels)){const content=document.createElement('div');content.id='sidebar-'+key+'-content';content.className='sidebar-content';while(panel.firstChild)content.append(panel.firstChild);panel.append(content);sideContents[key]=content;const toggle=button('','sidebar-toggle');toggle.id='collapse-'+key;toggle.setAttribute('aria-controls',content.id);toggle.onclick=()=>safe(()=>togglePanel(key));panel.append(toggle);sideButtons[key]=toggle;}
  const propertySection=document.createElement('section');propertySection.className='inspector-properties-section';
  const workspaceSection=sideContents.inspector.querySelector('.workspace-settings');
  while(sideContents.inspector.firstChild&&sideContents.inspector.firstChild!==workspaceSection)propertySection.append(sideContents.inspector.firstChild);
  sideContents.inspector.prepend(propertySection);
  let customize=null;
  const inertRoots=[document.querySelector('header'),document.querySelector('.toolbar'),main],previousInert=new Map();
  const library=createLayoutLibrary({storage,desktop,onChange:value=>{saved=value;if(!draft)apply(saved);}});
  const sizing=createSidebarSizing({panels:sidePanels,contents:sideContents,t,canResize:()=>loaded&&!busy&&!draft&&!isBusy(),getLayout:()=>saved,onCommit:next=>run(async()=>{try{await library.change({action:'current',layout:next});}finally{apply(saved);}})});
  async function run(fn){
    if(busy)return false;busy=true;lastError='';refreshManager();
    try{await fn();return true;}catch(e){lastError=e.message;toast(e.message);return false;}
    finally{busy=false;refreshManager();}
  }
  const ready=run(async()=>{await library.reload();}).then(()=>{loaded=true;refreshManager();});
  function apply(value){
    for(const [zone,keys]of Object.entries(value.zones))for(const key of keys)if(items.has(key))zones[zone].append(items.get(key));
    for(const [key,node]of items)node.dataset.layoutHidden=String(value.hiddenTools.includes(key));
    const shapes=sideContents.library.querySelector('.shape-library-section'),objects=sideContents.library.querySelector('.sidebar-object-section'),divider=document.getElementById('resize-shapeLibraryHeight');
    if(shapes&&objects){const order=(value.objectsFirst?[objects,divider,shapes]:[shapes,divider,objects]).filter(Boolean);if(order.some((node,index)=>sideContents.library.children[index]!==node))sideContents.library.append(...order);}
    const inspectorOrder=value.workspaceFirst?[workspaceSection,propertySection]:[propertySection,workspaceSection];if(inspectorOrder.some((node,index)=>sideContents.inspector.children[index]!==node))sideContents.inspector.append(...inspectorOrder);
    document.body.dataset.librarySide=value.librarySide;document.body.dataset.viewSide=value.viewSide;document.body.dataset.modePosition=value.modePosition;
    for(const key of ['library','inspector']){const collapsed=value[key+'Collapsed']??false,side=key==='library'?value.librarySide:value.librarySide==='left'?'right':'left',toggle=sideButtons[key];sidePanels[key].classList.toggle('sidebar-collapsed',collapsed);sideContents[key].inert=collapsed;toggle.textContent=(side==='left')!==collapsed?'‹':'›';toggle.setAttribute('aria-expanded',String(!collapsed));toggle.title=t(collapsed?'Seitenleiste ausklappen':'Seitenleiste einklappen');toggle.setAttribute('aria-label',toggle.title);document.body.dataset[key+'Collapsed']=String(collapsed);const top=document.getElementById(key==='library'?'toggle-left':'toggle-right');top?.setAttribute('aria-expanded',String(!collapsed));}
    // Chat stays in the physical right sidebar when the two panel contents swap.
    const chat=document.getElementById('ai-chat'),right=sidePanels[value.librarySide==='right'?'library':'inspector'];if(chat&&chat.parentElement!==right)right.append(chat);
    // Regroup the restored controls before measuring: the temporary flat tool
    // row can otherwise shrink the available sidebar height during this call.
    window.dispatchEvent(new Event('formnaro-layout-change'));
    sizing.apply(value);
    customize?.refresh();
    window.dispatchEvent(new Event('resize'));
    schedule();
  }
  function togglePanel(key,open){if(busy||!loaded||draft)return;if(open!==undefined&&saved[key+'Collapsed']===!open)return true;if(isBusy()&&open!==true)throw Error('Bearbeitung zuerst abschließen oder abbrechen.');if(open!==true)prepare();return run(async()=>{const next=structuredClone(saved);next[key+'Collapsed']=open===undefined?!next[key+'Collapsed']:!open;await library.change({action:'current',layout:next});if(open===undefined)sideButtons[key].focus({preventScroll:true});});}
  function schedule(){if(!draft||scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;if(draft&&!gesture)renderHandles();});}
  function rect(node){return node.getBoundingClientRect();}
  function place(node,r){Object.assign(node.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});}
  function contains(r,x,y){return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;}
  function label(key){const node=items.get(key);return (node.getAttribute('aria-label')||node.title||node.textContent).trim();}
  function button(text,className){const b=document.createElement('button');b.type='button';b.className=className;b.textContent=t(text);return b;}
  function renderHandles(focusKey){
    const handles=overlay.querySelector('.layout-handles'),focused=focusKey||document.activeElement?.dataset.layoutItem||document.activeElement?.dataset.layoutBlock;handles.replaceChildren();
    for(const [zone,keys]of Object.entries(draft.zones)){
      const clip=rect(zone==='toolbar'?document.querySelector('.toolbar'):zones[zone]);
      for(const key of keys){
        if(!items.has(key))continue;
        const r=rect(items.get(key)),left=Math.max(r.left,clip.left),right=Math.min(r.right,clip.right),top=Math.max(r.top,clip.top),bottom=Math.min(r.bottom,clip.bottom);
        if(right-left<8||bottom-top<8)continue;
        const b=button('','layout-item-handle');b.dataset.layoutItem=key;b.title=label(key);b.setAttribute('aria-label',t('Werkzeug verschieben')+': '+label(key));
        place(b,{left,top,width:right-left,height:bottom-top});handles.append(b);
      }
    }
    const v=rect(viewport),m=rect(main);
    for(const [key,name,r]of [
      ['library','Formen und Objekte',rect(document.querySelector('.left-panel'))],
      ['inspector','Eigenschaften',rect(document.querySelector('.right-panel'))],
      ['view','Ansichtswerkzeuge',rect(zones.view)],['mode','Bewegungswerkzeuge',rect(zones.mode)]
    ]){
      const b=button('⠿ '+t(name),'layout-block-handle');b.dataset.layoutBlock=key;b.title=t('Bereich an einen markierten Platz ziehen');
      // On narrow windows the panels are drawers; the two handles stay reachable.
      let left=r.width?r.left+8:key==='library'?(draft.librarySide==='left'?m.left+8:m.right-190):(draft.librarySide==='left'?m.right-190:m.left+8);
      let top=['library','inspector'].includes(key)?m.top+8:r.top+r.height+7;
      if(key==='view'){left=draft.viewSide==='left'?v.left+10:v.right-190;top=v.top+(innerWidth<=1000?36:8);}
      if(key==='mode'){left=draft.viewSide==='left'?v.right-198:v.left+8;top=draft.modePosition==='bottom'?r.top-34:r.bottom+7;}
      b.style.left=Math.max(8,Math.min(innerWidth-198,left))+'px';b.style.top=Math.max(m.top+8,Math.min(innerHeight-38,top))+'px';handles.append(b);
    }
    if(focused){const node=[...handles.children].find(n=>n.dataset.layoutItem===focused||n.dataset.layoutBlock===focused);node?.focus({preventScroll:true});}
  }
  function showTargets(kind){
    const root=overlay.querySelector('.layout-targets');root.replaceChildren();
    if(kind==='item')return;
    const v=rect(viewport),m=rect(main);
    for(const side of ['left','right']){
      const mode=kind==='mode',r=mode?{left:draft.viewSide==='left'?v.right-220:v.left+12,top:side==='left'?v.top+12:v.bottom-102,width:208,height:58}:{left:side==='left'?(kind==='view'?v.left+8:m.left+8):(kind==='view'?v.right-150:m.right-150),top:(kind==='view'?v.top:m.top)+Math.min(170,m.height/3),width:142,height:Math.max(100,Math.min(220,m.height-300))};
      const value=mode?(side==='left'?'top':'bottom'):side,b=button(mode?(value==='top'?'Oben andocken':'Unten andocken'):(side==='left'?'Links andocken':'Rechts andocken'),'layout-dock-target');
      b.dataset.dockValue=value;place(b,r);root.append(b);
    }
  }
  function targetAt(x,y){
    if(!gesture)return null;
    if(gesture.block){const b=[...overlay.querySelectorAll('.layout-dock-target')].find(b=>contains(rect(b),x,y));return b?{block:gesture.block,value:b.dataset.dockValue}:null;}
    const source=Object.keys(draft.zones).find(z=>draft.zones[z].includes(gesture.key));
    const candidates=['header','toolbar','view'].includes(source)?['header','toolbar','view']:[source];
    for(const zone of candidates){
      const clip=rect(zone==='toolbar'?document.querySelector('.toolbar'):zones[zone]);if(!contains(clip,x,y))continue;
      const keys=draft.zones[zone],vertical=zone==='view',coordinate=vertical?y:x;
      let index=keys.findIndex(k=>{if(!items.has(k))return false;const r=rect(items.get(k));return zone==='mode'?y<=r.bottom&&(y<r.top||x<r.left+r.width/2):coordinate<(vertical?r.top+r.height/2:r.left+r.width/2);});if(index<0)index=keys.length;
      return {zone,index,vertical};
    }
    return null;
  }
  function markTarget(target){
    overlay.querySelectorAll('.layout-dock-target').forEach(b=>b.classList.toggle('active',!!target?.block&&b.dataset.dockValue===target.value));
    const marker=overlay.querySelector('.layout-insert-marker');marker.hidden=!target?.zone;
    if(!target?.zone)return;
    const keys=draft.zones[target.zone],anchor=items.get(keys[target.index]||keys.at(-1)),r=anchor?rect(anchor):rect(zones[target.zone]),end=target.index===keys.length;
    place(marker,target.vertical?{left:r.left,top:end?r.bottom+2:r.top-3,width:r.width,height:4}:{left:end?r.right+2:r.left-3,top:r.top,width:4,height:r.height});
  }
  function abortGesture(){
    if(!gesture)return;const id=gesture.pointerId;gesture=null;overlay.querySelector('.layout-drag-ghost').hidden=true;overlay.querySelector('.layout-insert-marker').hidden=true;overlay.querySelector('.layout-targets').replaceChildren();
    if(overlay.hasPointerCapture(id))overlay.releasePointerCapture(id);renderHandles();
  }
  function pointerDown(e){
    if(busy)return;
    const handle=e.target.closest('[data-layout-item],[data-layout-block]');if(!handle||e.button!==0)return;
    e.preventDefault();gesture={key:handle.dataset.layoutItem,block:handle.dataset.layoutBlock,pointerId:e.pointerId,x:e.clientX,y:e.clientY,moved:false,target:null};
    const ghost=overlay.querySelector('.layout-drag-ghost');ghost.textContent=gesture.key?label(gesture.key):handle.textContent;showTargets(gesture.block||'item');overlay.setPointerCapture(e.pointerId);
  }
  function pointerMove(e){
    if(!gesture||gesture.pointerId!==e.pointerId)return;e.preventDefault();if(Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)>4)gesture.moved=true;
    if(!gesture.moved)return;
    const ghost=overlay.querySelector('.layout-drag-ghost');ghost.hidden=false;ghost.style.left=Math.max(0,Math.min(innerWidth-180,e.clientX+12))+'px';ghost.style.top=Math.max(0,Math.min(innerHeight-42,e.clientY+12))+'px';
    // Scroll either top row when a dragged button reaches its visible edge.
    if(gesture.key){const source=Object.keys(draft.zones).find(z=>draft.zones[z].includes(gesture.key));for(const zone of ['header','toolbar'].includes(source)?['header','toolbar']:[source]){const node=zone==='toolbar'?document.querySelector('.toolbar'):zones[zone],r=rect(node);if(contains(r,e.clientX,e.clientY)){if(zone==='view')node.scrollTop+=e.clientY<r.top+24?-14:e.clientY>r.bottom-24?14:0;else node.scrollLeft+=e.clientX<r.left+30?-24:e.clientX>r.right-30?24:0;}}}
    gesture.target=targetAt(e.clientX,e.clientY);markTarget(gesture.target);
  }
  function dock(block,value){
    if(block==='library')draft.librarySide=value;else if(block==='inspector')draft.librarySide=value==='left'?'right':'left';else if(block==='view')draft.viewSide=value;else draft.modePosition=value;
    apply(draft);
  }
  function pointerUp(e){
    if(!gesture||gesture.pointerId!==e.pointerId)return;const g=gesture,target=g.moved?targetAt(e.clientX,e.clientY):null;abortGesture();
    if(target?.zone){draft=moveLayoutItem(draft,g.key,target.zone,target.index);apply(draft);renderHandles(g.key);}
    else if(target?.block){dock(target.block,target.value);renderHandles(target.block);}
  }
  function close(){abortGesture();draft=null;customize=null;document.body.classList.remove('layout-editing');window.dispatchEvent(new Event('formnaro-layout-change'));overlay.remove();overlay=null;for(const node of inertRoots)node.inert=previousInert.get(node);previousInert.clear();lastFocus?.focus({preventScroll:true});}
  function cancel(){if(!draft||busy)return;apply(saved);close();}
  async function finish(){
    if(!draft||busy)return;const next=validateLayout(draft),name=overlay.querySelector('#layout-editor-name').value.trim();
    await run(async()=>{await library.change(name?{action:'save',name,layout:next}:{action:'current',layout:next});close();toast('Oberflächenanordnung gespeichert.');});
  }
  function begin(){
    if(draft)return;if(busy||!loaded)throw Error('Layouts werden gerade geladen oder gespeichert.');if(isBusy())throw Error('Bearbeitung zuerst abschließen oder abbrechen.');prepare();lastFocus=document.getElementById('settings-open');draft=structuredClone(saved);document.getElementById('modal').close();document.body.classList.add('layout-editing');apply(draft);
    document.body.classList.remove('left-open','right-open');for(const id of ['toggle-left','toggle-right'])document.getElementById(id).setAttribute('aria-expanded','false');
    for(const node of inertRoots){previousInert.set(node,node.inert);node.inert=true;}
    overlay=document.createElement('div');overlay.id='layout-editor';overlay.setAttribute('aria-label',t('Oberfläche anordnen'));
    overlay.innerHTML='<div class="layout-handles"></div><div class="layout-targets"></div><div class="layout-insert-marker" hidden></div><div class="layout-drag-ghost" hidden></div><section class="layout-editor-bar"><strong>Oberfläche anordnen</strong><p>Taster ziehen und an der Markierung loslassen. Bereiche am Griff in einen Andockplatz ziehen. Pfeiltasten verschieben den fokussierten Griff.</p><label class="layout-name-label">Als neues Layout (optional)<input id="layout-editor-name" maxlength="80" placeholder="Layoutname"></label><p class="layout-storage-error" role="alert" hidden></p><div><button id="layout-default">Standardanordnung</button><button id="layout-cancel">Abbrechen</button><button id="layout-done" class="primary">Anordnung speichern</button></div></section>';
    document.body.append(overlay);overlay.querySelector('#layout-default').onclick=()=>{abortGesture();draft=defaultLayout();apply(draft);renderHandles();};overlay.querySelector('#layout-cancel').onclick=cancel;overlay.querySelector('#layout-done').onclick=()=>safe(finish);
    overlay.addEventListener('pointerdown',pointerDown);overlay.addEventListener('pointermove',pointerMove);overlay.addEventListener('pointerup',pointerUp);overlay.addEventListener('pointercancel',abortGesture);overlay.addEventListener('lostpointercapture',()=>{if(gesture)abortGesture();});
    overlay.addEventListener('keydown',e=>e.stopPropagation());
    overlay.addEventListener('wheel',e=>{const node=[document.querySelector('.toolbar'),zones.header,zones.view].find(n=>contains(rect(n),e.clientX,e.clientY));if(node){e.preventDefault();if(node===zones.view)node.scrollTop+=e.deltaY;else node.scrollLeft+=e.deltaY||e.deltaX;schedule();}},{passive:false});
    customize=mountLayoutCustomize(overlay,{items,getDraft:()=>draft,change:value=>{draft=validateLayout(value);apply(draft);renderHandles();},t});
    renderHandles();refreshManager();overlay.querySelector('#layout-done').focus();
  }
  document.addEventListener('keydown',e=>{
    if(!draft)return;
    const active=document.activeElement;
    if(!busy&&active?.closest('.layout-customize')&&e.key!=='Escape'&&e.key!=='Tab')return;
    // Let native input editing/button activation reach their target, then stop
    // bubbling at the editor. Capture interception would swallow typed text.
    if(!busy&&active?.tagName==='INPUT'&&!['Escape','Tab','Enter'].includes(e.key))return;
    if(!busy&&active?.closest('.layout-editor-bar')&&active.tagName==='BUTTON'&&['Enter',' '].includes(e.key))return;
    e.stopImmediatePropagation();if(busy){e.preventDefault();return;}if(e.key==='Escape'){e.preventDefault();cancel();return;}
    if(e.key==='Tab'){
      e.preventDefault();const buttons=[...overlay.querySelectorAll('button,input,select,summary')].filter(b=>!b.disabled&&b.getClientRects().length&&!b.closest('[hidden],.layout-targets'));
      const index=buttons.indexOf(document.activeElement);buttons[(index+(e.shiftKey?-1:1)+buttons.length)%buttons.length]?.focus({preventScroll:true});return;
    }
    if(document.activeElement?.tagName==='INPUT'){if(e.key==='Enter'){e.preventDefault();void finish();}return;}
    const key=document.activeElement?.dataset.layoutItem,block=document.activeElement?.dataset.layoutBlock;
    if(!key&&!block){if(!['Tab','Enter',' '].includes(e.key))e.preventDefault();return;}
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){if(e.key!=='Tab')e.preventDefault();return;}
    e.preventDefault();abortGesture();
    if(block){dock(block,block==='mode'?(e.key==='ArrowUp'||e.key==='ArrowLeft'?'top':'bottom'):(e.key==='ArrowLeft'||e.key==='ArrowUp'?'left':'right'));renderHandles(block);return;}
    const zone=Object.keys(draft.zones).find(z=>draft.zones[z].includes(key)),index=draft.zones[zone].indexOf(key),forward=['ArrowRight','ArrowDown'].includes(e.key);
    if(e.ctrlKey&&['header','toolbar','view'].includes(zone)){const options=['header','toolbar','view'],other=options[(options.indexOf(zone)+1)%options.length];draft=moveLayoutItem(draft,key,other,draft.zones[other].length);}
    else draft=moveLayoutItem(draft,key,zone,Math.max(0,Math.min(draft.zones[zone].length,index+(forward?2:-1))));
    apply(draft);items.get(key).scrollIntoView({block:'nearest',inline:'nearest'});renderHandles(key);
  },true);
  document.addEventListener('focusin',e=>{if(draft&&overlay&&!overlay.contains(e.target))overlay.querySelector('#layout-done').focus();},true);
  document.addEventListener('click',e=>{if(draft&&overlay&&!overlay.contains(e.target)){e.preventDefault();e.stopImmediatePropagation();}},true);
  // Model handlers and browser file drops never run through the editor veil.
  for(const event of ['dragstart','dragover','drop'])document.addEventListener(event,e=>{if(draft){e.preventDefault();e.stopImmediatePropagation();}},true);
  const observer=new ResizeObserver(schedule);for(const node of [...Object.values(zones),viewport,main])observer.observe(node);window.addEventListener('resize',()=>{if(gesture)abortGesture();schedule();});
  for(const node of [document.querySelector('.toolbar'),...Object.values(zones)])node.addEventListener('scroll',schedule);
  function refreshManager(){
    if(settingsRoot?.isConnected){
      const select=settingsRoot.querySelector('#layout-profiles'),old=select.value,data=library.data();select.replaceChildren();
      const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent=t('Layout auswählen …');select.append(placeholder);
      for(const p of data.profiles){const option=document.createElement('option');option.value=p.id;option.textContent=p.name;option.dataset.noTranslate='';select.append(option);}
      select.value=data.profiles.some(p=>p.id===old)?old:data.activeId||'';
      for(const id of ['layout-load','layout-update','layout-rename','layout-delete'])settingsRoot.querySelector('#'+id).disabled=busy||!loaded||!select.value;
      for(const id of ['layout-save-new','layout-start','layout-reset','layout-reload','layout-swap-sides'])settingsRoot.querySelector('#'+id).disabled=busy||!loaded;
      const status=settingsRoot.querySelector('.layout-storage-error');status.textContent=t(lastError);status.hidden=!lastError;
      const note=settingsRoot.querySelector('#layout-storage-note');note.textContent=t(library.native?'Layouts liegen im Ordner „Layouts“ neben Formnaro.exe. Diesen Ordner beim PC-Wechsel mitkopieren.':'Layouts werden in diesem Browser gespeichert.');
      note.title=library.directory()||'';settingsRoot.querySelector('#layout-folder').hidden=!library.native;settingsRoot.querySelector('#layout-folder').disabled=busy;
    }
    if(overlay){
      for(const node of overlay.querySelectorAll('.layout-editor-bar button,.layout-editor-bar input,.layout-editor-bar select'))node.disabled=busy;
      if(!busy)customize?.refresh();
      const status=overlay.querySelector('.layout-storage-error');status.textContent=t(lastError);status.hidden=!lastError;
    }
  }
  function mountSettings(root){
    settingsRoot=root;
    root.innerHTML='<p>Mehrere Anordnungen unter eigenen Namen speichern und jederzeit wechseln.</p><label class="dialog-label">Gespeicherte Layouts<select id="layout-profiles"></select></label><div class="two-buttons"><button id="layout-load">Layout laden</button><button id="layout-start" class="primary">Oberfläche anordnen …</button></div><label class="dialog-label">Layoutname<input id="layout-profile-name" maxlength="80" placeholder="Zum Beispiel: Modellieren"></label><button id="layout-save-new">Aktuelle Anordnung als neues Layout speichern</button><div class="layout-profile-actions"><button id="layout-update">Aktualisieren</button><button id="layout-rename">Umbenennen</button><button id="layout-delete">Löschen</button></div><p class="layout-storage-error" role="alert" hidden></p><p id="layout-storage-note" class="small-note"></p><div class="layout-profile-actions"><button id="layout-folder">Layoutordner öffnen</button><button id="layout-reload">Erneut laden</button><button id="layout-reset">Anordnung zurücksetzen</button></div><p class="small-note">Abbrechen oder Escape im Anordnungsmodus stellt die vorherige Anordnung wieder her. Gespeicherte Layouts bleiben beim Zurücksetzen erhalten.</p>';
    const select=root.querySelector('#layout-profiles'),name=root.querySelector('#layout-profile-name'),remove=root.querySelector('#layout-delete');let deleteId=null;
    const swap=button('Seiten links/rechts tauschen','layout-swap-sides');swap.id='layout-swap-sides';root.querySelector('#layout-start').parentElement.after(swap);swap.onclick=()=>run(async()=>{if(isBusy())throw Error('Bearbeitung zuerst abschließen oder abbrechen.');prepare();await library.change({action:'current',layout:{...saved,librarySide:saved.librarySide==='left'?'right':'left'}});toast('Seitenleisten getauscht.');});
    select.onchange=()=>{deleteId=null;remove.textContent=t('Löschen');refreshManager();name.value=library.data().profiles.find(p=>p.id===select.value)?.name||'';};
    root.querySelector('#layout-start').onclick=()=>safe(begin);
    root.querySelector('#layout-load').onclick=()=>run(async()=>{if(isBusy())throw Error('Bearbeitung zuerst abschließen oder abbrechen.');prepare();await library.change({action:'load',id:select.value});toast('Layout geladen.');});
    root.querySelector('#layout-save-new').onclick=()=>run(async()=>{await library.change({action:'save',name:name.value,layout:saved});select.value=library.data().activeId;name.value='';toast('Layout gespeichert.');});
    root.querySelector('#layout-update').onclick=()=>run(async()=>{await library.change({action:'replace',id:select.value,layout:saved});toast('Layout aktualisiert.');});
    root.querySelector('#layout-rename').onclick=()=>run(async()=>{await library.change({action:'rename',id:select.value,name:name.value});toast('Layout umbenannt.');});
    remove.onclick=()=>{if(deleteId!==select.value){deleteId=select.value;remove.textContent=t('Löschen bestätigen');return;}void run(async()=>{await library.change({action:'delete',id:deleteId});deleteId=null;remove.textContent=t('Löschen');toast('Layout gelöscht.');});};
    root.querySelector('#layout-reset').onclick=()=>run(async()=>{if(isBusy())throw Error('Bearbeitung zuerst abschließen oder abbrechen.');prepare();await library.change({action:'reset'});toast('Standardanordnung wiederhergestellt.');});
    root.querySelector('#layout-reload').onclick=()=>run(()=>library.reload());root.querySelector('#layout-folder').onclick=()=>run(()=>library.openFolder());refreshManager();
  }
  apply(saved);
  return {mountSettings,begin,cancel,togglePanel,openPanel:key=>togglePanel(key,true),syncPanels:()=>apply(draft||saved),ready:()=>ready,isSaving:()=>busy,isActive:()=>!!draft,state:()=>structuredClone(draft||saved),restore:async value=>{await library.change({action:'current',layout:validateLayout(value)});},profiles:()=>library.data().profiles};
}
