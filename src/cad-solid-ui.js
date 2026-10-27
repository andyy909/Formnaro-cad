import './cad-solid.css';
import {createSolidSettings,solidLabel,solidShortcut,SOLID_TABS} from './cad-solid-state.js';

const $=id=>document.getElementById(id);
const tabCommands={
  features:[['extrude','cut'],['round','chamfer','drill'],['cad-shell','cad-loft','cad-sweep'],['cad-draft','cad-defeature','cad-revolution','cad-helix'],['cad-surface-fill','cad-surface-transition','cad-surface-sew','cad-surface-relief'],['array','mirror','cad-face-offset'],['cad-edit-modeling','project-parameters']],
  sketch:[['sketch','sketch-on-part'],['cad-contour','linked-contours'],['sketch-templates','project-parameters'],['workplane-set','workplane-top','reset-plane']],
  evaluate:[['measure','ruler'],['section','thickness'],['inspect','model-compare'],['drawing']],
  assembly:[['group','ungroup','bundle'],['align','reference-place','lay-on-face'],['joints','array','mirror'],['assembly-only','assembly-load','assembly-all']],
  mesh:[['mesh-tools','mesh-select','mesh-inspector'],['mesh-repair','mesh-close-hole','mesh-reduce','mesh-curved-reduce'],['mesh-sculpt','mesh-hollow','mesh-features'],['cad-to-mesh','mesh-to-cad','stl-to-step']]
};
const symbols={extrude:'▰',cut:'⊟',round:'◜',chamfer:'◩',drill:'⊙',sketch:'✎','sketch-on-part':'▱','cad-contour':'▧','cad-shell':'⊔','cad-loft':'⌁','cad-sweep':'⤳',array:'▦',mirror:'◀│▶',measure:'↔',ruler:'⌐',section:'◨',inspect:'✓',drawing:'▤',joints:'⚙','project-parameters':'ƒx'};

// Dock the real tree, inspector and operation panels. They keep their IDs,
// listeners, focus, selection and controller transactions. Leaving Solid
// restores each node to its original parent using a placeholder.
export function createCadSolidUI({storage,controls,toolbar,header,tools,safe,t=x=>x,getLanguage=()=> 'de',view,executeCommand=()=>{},openSettings=()=>{},isIdle=()=>true}){
  const settings=createSolidSettings(storage),moved=[],captions=new Map(),extraControls=new Map();
  let mounted=false,ribbon=null,manager=null,taskPane=null,menubar=null,popup=null,observer=null,managerTab='model',activeTab=settings.get().defaultTab,solidChatOpen=false,chatState=null;
  const label=key=>solidLabel(key,getLanguage()),word=(de,en)=>getLanguage()==='en'?en:de;
  const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const button=(text,fn)=>{const n=make('button',text);n.type='button';n.onclick=()=>safe(fn);return n;};
  function move(node,parent){if(!node)return;const marker=document.createComment('solid-dock');node.before(marker);moved.push({node,marker});parent.append(node);}
  function restoreNodes(){for(const {node,marker}of moved.splice(0).reverse()){marker.replaceWith(node);}}
  function control(key){
    if(controls.has(key))return controls.get(key);
    if(extraControls.has(key))return extraControls.get(key);
    const node=button(label(key),()=>{});node.dataset.solidCommand=key;
    if(['round','chamfer','array'].includes(key)){node.dataset.action=key;node.onclick=null;}
    else node.onclick=()=>safe(()=>executeCommand(key));
    extraControls.set(key,node);return node;
  }
  function decorate(node,key){
    if(!captions.has(node)){
      const fragment=document.createDocumentFragment();fragment.append(...node.childNodes);captions.set(node,{fragment,title:node.getAttribute('title'),aria:node.getAttribute('aria-label')});
      const icon=make('span',symbols[key]??'◇','solid-command-icon');icon.setAttribute('aria-hidden','true');
      const text=label(key),caption=make('span',text===key?(node.title?.replace(/\s*\([^)]*\)/g,'')||fragment.textContent.trim()):text,'solid-command-caption');
      node.append(icon,caption);node.classList.add('solid-command');node.title=caption.textContent;node.setAttribute('aria-label',caption.textContent);
    }
  }
  function selectTab(key,{focus=false}={}){
    if(!SOLID_TABS.includes(key))throw Error('Unbekanntes Solid-Register.');activeTab=key;
    for(const node of ribbon.querySelectorAll('[data-solid-tab]')){const chosen=node.dataset.solidTab===key;node.setAttribute('aria-selected',String(chosen));node.tabIndex=chosen?0:-1;if(chosen&&focus)node.focus();}
    for(const panel of ribbon.querySelectorAll('[data-solid-panel]'))panel.hidden=panel.dataset.solidPanel!==key;
    // A real command is shared by several tabs: move it to the current panel.
    const panel=ribbon.querySelector(`[data-solid-panel="${key}"]`);panel.replaceChildren();
    for(const keys of tabCommands[key]){const group=make('div',undefined,'solid-command-group');for(const key of keys){const node=control(key);decorate(node,key);group.append(node);}panel.append(group);}
    closePopup();window.dispatchEvent(new Event('resize'));
  }
  function selectManager(key){
    managerTab=key;for(const b of manager.querySelectorAll('[data-solid-manager]')){const chosen=b.dataset.solidManager===key;b.setAttribute('aria-selected',String(chosen));b.tabIndex=chosen?0:-1;}
    for(const panel of manager.querySelectorAll('[data-solid-manager-panel]'))panel.hidden=panel.dataset.solidManagerPanel!==key;
  }
  function closePopup(){popup?.remove();popup=null;}
  function orientation(){
    closePopup();popup=make('div',undefined,'solid-popup');popup.id='solid-orientation';popup.setAttribute('role','dialog');popup.setAttribute('aria-label',label('orientation'));
    popup.append(make('strong',label('orientation')));
    for(const [i,key,de,en]of [[1,'front','Vorne','Front'],[2,'back','Hinten','Back'],[3,'left','Links','Left'],[4,'right','Rechts','Right'],[5,'top','Oben','Top'],[6,'bottom','Unten','Bottom'],[7,'iso','Isometrisch','Isometric']]){
      const b=button(word(de,en)+' · Ctrl+'+i,()=>{view.setView(key);closePopup();});b.dataset.solidView=key;popup.append(b);
    }
    popup.append(button(word('Einpassen · F','Zoom to fit · F'),()=>{view.fit();closePopup();}));$('viewport').append(popup);popup.querySelector('button').focus();
  }
  function shortcutBar(){
    closePopup();popup=make('div',undefined,'solid-popup');popup.id='solid-shortcuts';popup.setAttribute('role','dialog');popup.setAttribute('aria-label',word('Schnellwerkzeuge','Shortcut bar'));
    for(const [key,de,en]of [['extrude','Extrudierter Aufsatz','Extruded boss'],['cut','Linearer Schnitt','Extruded cut'],['round','Verrundung','Fillet'],['measure','Messen','Measure']]){
      const b=button(word(de,en),()=>{closePopup();if(['extrude','cut'].includes(key))return executeCommand(key);const node=controls.get(key)||extraControls.get(key);if(node&&!node.disabled)node.click();else if(!node){const original=document.querySelector(`[data-action="${key}"]`);if(original&&!original.disabled)original.click();}});popup.append(b);
    }
    $('viewport').append(popup);popup.querySelector('button').focus();
  }
  function menu(key,entries){
    const details=make('details',undefined,'solid-menu');details.dataset.solidMenu=key;const summary=make('summary',label(key)),panel=make('div',undefined,'solid-menu-panel');
    summary.setAttribute('aria-expanded','false');details.append(summary,panel);menubar.append(details);
    for(const [caption,fn]of entries)panel.append(button(caption,()=>{details.open=false;summary.setAttribute('aria-expanded','false');return fn();}));
    details.addEventListener('toggle',()=>{summary.setAttribute('aria-expanded',String(details.open));if(details.open){for(const other of menubar.querySelectorAll('details'))if(other!==details)other.open=false;const r=summary.getBoundingClientRect();panel.style.left=Math.max(6,Math.min(r.left,innerWidth-250))+'px';panel.style.top=r.bottom+'px';panel.style.maxHeight=Math.max(80,innerHeight-r.bottom-10)+'px';}});
    summary.onkeydown=e=>{if(e.key==='ArrowDown'){e.preventDefault();details.open=true;panel.querySelector('button')?.focus();}};
    panel.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();details.open=false;summary.focus();}};
  }
  function mount(){
    mounted=true;activeTab=settings.get().defaultTab;
    document.body.classList.add('solid-workbench');
    menubar=make('nav',undefined,'solid-menubar');menubar.setAttribute('aria-label',word('Hauptmenü','Main menu'));header.closest('header').before(menubar);
    const act=key=>()=>{const b=controls.get(key)||document.querySelector(`[data-action="${key}"]`);if(b&&!b.disabled)b.click();},tab=key=>()=>selectTab(key);
    menu('file',[[t('Neues Projekt'),act('new')],[t('Öffnen'),act('open')],[t('Speichern'),act('save')],[t('Speichern unter …'),()=>executeCommand('save-as')],[t('Importieren'),act('import')],[t('Exportieren'),act('export')]]);
    menu('edit',[[t('Rückgängig'),act('undo')],[t('Wiederholen'),act('redo')],[t('Kopieren'),act('copy')],[t('Einfügen'),act('paste')],[t('Duplizieren'),act('duplicate')],[t('Entfernen'),act('delete')]]);
    menu('view',[[label('orientation'),orientation],[word('Einpassen','Zoom to fit'),act('fit')],[word('Perspektive / Orthografisch','Perspective / Orthographic'),act('projection')],[t('Schnittansicht'),act('section')],[word('Modellbaum','Model tree'),()=>selectManager('model')],[t('Eigenschaften'),()=>selectManager('properties')]]);
    menu('insert',[[label('extrude'),()=>executeCommand('extrude')],[label('cut'),()=>executeCommand('cut')],[label('features'),tab('features')],[label('sketch'),tab('sketch')],[label('assembly'),tab('assembly')],[t('Technische Zeichnung'),act('drawing')]]);
    const assigned=new Set([...Object.values(tabCommands).flat(2),'new','open','save','save-as','projects','import','export','ai','photo-project-open','ai-feature-open','freecad-document-open','settings','help','undo','redo','copy','paste','duplicate','delete','projection','fit','coordinates','magnet','view-iso','view-top','view-front','view-right','mode-translate','mode-scale','mode-rotate']);
    const remaining=[...controls].filter(([key,node])=>!assigned.has(key)&&node.matches('button')).map(([key,node])=>[node.title||node.textContent.trim(),act(key)]);
    menu('extras',[[label('evaluate'),tab('evaluate')],[label('project-parameters'),act('project-parameters')],[label('options'),()=>{openSettings();$('settings-tab-solid')?.click();}],[t('Einstellungen'),openSettings],[word('KI-Werkstatt','AI workshop'),act('ai')],[t('Projektfotos'),act('photo-project-open')],[t('KI-Merkmalsbezüge'),act('ai-feature-open')],[t('FreeCAD-Merkmale'),act('freecad-document-open')],...remaining]);
    menu('help',[[word('Solid-Einstieg','Getting started with Solid'),()=>selectManager('model')],[t('Hilfe'),act('help')]]);
    const modeNote=make('span',word('TEILE KONSTRUIEREN','PART DESIGN'),'solid-mode-note');menubar.append(modeNote);
    const quick=make('div',undefined,'solid-quick-tools');tools.append(quick);
    for(const key of ['undo','redo','copy','paste','delete'])if(controls.has(key))quick.append(controls.get(key));
    ribbon=make('section',undefined,'solid-ribbon');ribbon.setAttribute('aria-label',word('Konstruktionswerkzeuge','Design tools'));toolbar.after(ribbon);
    const tabs=make('div',undefined,'solid-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label',word('Werkzeugregister','Command tabs'));ribbon.append(tabs);
    for(const key of SOLID_TABS){
      const b=button(label(key),()=>selectTab(key));b.id='solid-tab-'+key;b.dataset.solidTab=key;b.setAttribute('role','tab');b.setAttribute('aria-controls','solid-panel-'+key);tabs.append(b);
      const panel=make('div',undefined,'solid-command-panel');panel.id='solid-panel-'+key;panel.dataset.solidPanel=key;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',b.id);ribbon.append(panel);
    }
    const commandRow=make('div',undefined,'cad-command-row');ribbon.prepend(commandRow);commandRow.append(quick,tabs);
    tabs.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const i=SOLID_TABS.indexOf(activeTab);selectTab(SOLID_TABS[e.key==='Home'?0:e.key==='End'?SOLID_TABS.length-1:(i+(e.key==='ArrowLeft'?-1:1)+SOLID_TABS.length)%SOLID_TABS.length],{focus:true});};
    const originalLibrary=$('sidebar-library-content'),originalInspector=$('sidebar-inspector-content');
    manager=make('aside',undefined,'solid-manager');manager.id='solid-manager';manager.setAttribute('aria-label',word('Modell und Eigenschaften','Model and properties'));document.querySelector('main').prepend(manager);
    const managerTabs=make('div',undefined,'solid-manager-tabs');managerTabs.setAttribute('role','tablist');managerTabs.setAttribute('aria-label',word('Modellbereiche','Manager tabs'));manager.append(managerTabs);
    for(const key of ['model','properties','library','workspace']){
      const b=button(label(key),()=>selectManager(key));b.dataset.solidManager=key;b.id='solid-manager-tab-'+key;b.setAttribute('role','tab');b.setAttribute('aria-controls','solid-manager-panel-'+key);managerTabs.append(b);
      const panel=make('section',undefined,'solid-manager-content');panel.id='solid-manager-panel-'+key;panel.dataset.solidManagerPanel=key;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',b.id);manager.append(panel);
    }
    managerTabs.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const keys=['model','properties','library','workspace'],i=keys.indexOf(managerTab),next=keys[e.key==='Home'?0:e.key==='End'?3:(i+(e.key==='ArrowLeft'?-1:1)+4)%4];selectManager(next);managerTabs.querySelector(`[data-solid-manager="${next}"]`).focus();};
    const target=key=>manager.querySelector(`[data-solid-manager-panel="${key}"]`);
    const title=make('h2',word('Teil / Baugruppe','Part / Assembly'));target('model').append(title);
    const planes=make('details',undefined,'solid-planes');planes.append(make('summary',word('Standardansichten & Ursprung','Standard views & origin')));
    for(const [name,v]of [[word('Vorne ansehen · XZ','Front view · XZ'),'front'],[word('Von oben ansehen · XY','Top view · XY'),'top'],[word('Von rechts ansehen · YZ','Right view · YZ'),'right']])planes.append(button(name,()=>view.setView(v)));
    planes.append(make('p',word('Ursprung: X 0 · Y 0 · Z 0 mm. Neue Skizzen liegen auf der aktiven Arbeitsebene.','Origin: X 0 · Y 0 · Z 0 mm. New sketches use the active workplane.')));target('model').append(planes);
    move(originalLibrary.querySelector('.sidebar-object-section'),target('model'));
    move(originalInspector.querySelector('.inspector-properties-section'),target('properties'));
    move(originalLibrary.querySelector('.shape-library-section'),target('library'));
    move(originalInspector.querySelector('.workspace-settings'),target('workspace'));
    if(controls.has('coordinates')){const line=make('label',word('Koordinatensystem','Coordinate system'),'dialog-label');line.append(controls.get('coordinates'));target('workspace').append(line);}
    taskPane=make('aside',undefined,'solid-task-pane');taskPane.setAttribute('aria-label',word('KI-Assistent','AI assistant'));document.querySelector('main').append(taskPane);
    const chat=$('ai-chat');if(chat){chatState={collapsed:chat.classList.contains('collapsed'),hidden:$('ai-chat-body').hidden,expanded:$('ai-chat-toggle').getAttribute('aria-expanded')};move(chat,taskPane);chat.classList.toggle('collapsed',!solidChatOpen);$('ai-chat-body').hidden=!solidChatOpen;$('ai-chat-toggle').setAttribute('aria-expanded',String(solidChatOpen));}
    target('model').addEventListener('dblclick',event=>{if(event.target.closest('[data-root-id]'))selectManager('properties');});
    const tip=make('p',word('Skizze oder Aufsatz starten → Maße festlegen → Vorschau prüfen → Übernehmen. Vorhandene Features über ihre erhaltenen Quellen bearbeiten.','Start a sketch or boss → set dimensions → check the preview → apply. Edit existing features through their retained sources.'),'solid-tip');target('model').append(tip);
    const operations=make('div',undefined,'solid-operation-host');operations.id='solid-operation-host';manager.append(operations);
    // Tool panels are existing viewport children. Modal sketch/AI/file dialogs
    // retain their established transaction and keyboard lifecycle.
    for(const node of $('viewport').querySelectorAll('.edge-tool-panel'))move(node,operations);
    const refreshOperations=()=>{const active=[...operations.children].some(n=>!n.hidden);manager.classList.toggle('solid-operation-active',active);};
    observer=new MutationObserver(refreshOperations);observer.observe(operations,{subtree:true,attributes:true,attributeFilter:['hidden']});refreshOperations();
    selectManager(managerTab);selectTab(activeTab);
    view.setNavigationProfile?.(settings.get().navigation?'solid':'normal');
  }
  function unmount(){
    if(!mounted)return;mounted=false;observer?.disconnect();observer=null;closePopup();
    const chat=$('ai-chat');if(chat&&chatState){solidChatOpen=!chat.classList.contains('collapsed');chat.classList.toggle('collapsed',chatState.collapsed);$('ai-chat-body').hidden=chatState.hidden;$('ai-chat-toggle').setAttribute('aria-expanded',chatState.expanded);chatState=null;}
    restoreNodes();
    for(const [node,old]of captions){node.replaceChildren(...old.fragment.childNodes);node.classList.remove('solid-command');for(const [key,value]of [['title',old.title],['aria-label',old.aria]])if(value===null)node.removeAttribute(key);else node.setAttribute(key,value);}captions.clear();
    for(const node of extraControls.values())node.remove();extraControls.clear();
    ribbon?.remove();manager?.remove();taskPane?.remove();menubar?.remove();tools.querySelector('.solid-quick-tools')?.remove();document.body.classList.remove('solid-workbench');view.setNavigationProfile?.('normal');
  }
  function keydown(event){
    if(!mounted||!settings.get().shortcuts||event.target.closest('input,textarea,select,summary,[role=treeitem],[role=tab],[contenteditable=true],#cad-context-menu')||$('modal').open||!isIdle())return;
    if(event.key==='Escape'&&popup){event.preventDefault();event.stopImmediatePropagation();closePopup();view.canvas?.focus();return;}
    const action=solidShortcut(event);if(!action)return;event.preventDefault();event.stopImmediatePropagation();
    if(action.view)view.setView(action.view);else if(action.fit)view.fit();else if(action.orientation)orientation();else if(action.shortcuts)shortcutBar();
  }
  document.addEventListener('keydown',keydown,true);
  document.addEventListener('pointerdown',e=>{if(mounted&&!e.target.closest('.solid-popup,.solid-menu')){closePopup();for(const n of menubar.querySelectorAll('details'))n.open=false;}});
  window.addEventListener('resize',closePopup);
  function mountSettings(root){
    const field=make('fieldset');field.id='solid-settings';field.append(make('legend',label('options')));
    const note=make('p',word('Solid ist auf den Umstieg von SolidWorks abgestimmt. Werkzeugregister, Modellbaum und Eigenschaften nutzen die vorhandenen Formnaro-Funktionen.','Solid is designed for users coming from SolidWorks. Command tabs, model tree and properties use the existing Formnaro tools.'));field.append(note);
    for(const [key,de,en]of [['navigation','Mittlere Maustaste: drehen · Strg: verschieben · Umschalt: zoomen','Middle mouse: rotate · Ctrl: pan · Shift: zoom'],['shortcuts','Solid-Tasten: S Schnellwerkzeuge · Leertaste Ansichten · Strg+1…7','Solid keys: S shortcut bar · Space views · Ctrl+1…7']]){
      const line=make('label',undefined,'check-line'),input=make('input');input.type='checkbox';input.id='solid-setting-'+key;input.checked=settings.get()[key];input.onchange=()=>safe(()=>{try{settings.set({...settings.get(),[key]:input.checked});if(mounted)view.setNavigationProfile?.(settings.get().navigation?'solid':'normal');}finally{input.checked=settings.get()[key];}});line.append(input,make('span',word(de,en)));field.append(line);
    }
    const line=make('label',word('Startregister','Default tab'),'dialog-label'),select=make('select');select.id='solid-setting-defaultTab';for(const key of SOLID_TABS)select.append(new Option(label(key),key));select.value=settings.get().defaultTab;select.onchange=()=>safe(()=>{try{settings.set({...settings.get(),defaultTab:select.value});}finally{select.value=settings.get().defaultTab;}});line.append(select);field.append(line);
    const info=make('p',word('Einheiten: mm · Z nach oben. Skizzen werden mit Extrusion erstellt; Schnitte starten mit einer ausgewählten Teilfläche. Solid ändert die Bedienung. Umfang und Dateiformate entsprechen Formnaro.','Units: mm · Z up. Sketches are created with extrusion; cuts start from a selected part face. Solid changes the interface. Capabilities and file formats follow Formnaro.'),'small-note');field.append(info);root.append(field);
  }
  return {mount,unmount,selectTab,selectManager,mountSettings,orientation,settings,activeTab:()=>activeTab};
}
