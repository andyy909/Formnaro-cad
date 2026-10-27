import './cad-fusion.css';
import {createFusionSettings,fusionLabel,fusionShortcut,FUSION_TABS,fusionSourceSteps} from './cad-fusion-state.js';

const $=id=>document.getElementById(id);
const tabCommands={
  solid:[['create',['extrude','cut','cad-loft','cad-sweep']],['modify',['round','chamfer','drill','cad-shell','cad-face-offset']],['assemble',['group','joints','align']],['construct',['workplane-set']],['inspect',['measure','section']],['insert',['array','mirror','project-parameters']]],
  sketch:[['create',['sketch','sketch-on-part','sketch-templates']],['modify',['cad-contour','linked-contours']],['construct',['workplane-set','workplane-top','reset-plane']]],
  mesh:[['create',['mesh-tools','mesh-select','mesh-inspector']],['modify',['mesh-repair','mesh-close-hole','mesh-reduce','mesh-curved-reduce','mesh-sculpt','mesh-hollow','mesh-features']],['insert',['cad-to-mesh','mesh-to-cad','stl-to-step']]],
  tools:[['inspect',['measure','ruler','section','thickness','inspect','model-compare']],['assemble',['group','ungroup','bundle','align','reference-place','lay-on-face','joints','assembly-only','assembly-load','assembly-all']],['modify',['cad-edit-modeling','project-parameters']],['insert',['drawing','functions']]]
};
const symbols={extrude:'▰',cut:'⊟',round:'◜',chamfer:'◩',drill:'⊙',sketch:'✎','sketch-on-part':'▱','cad-contour':'▧','cad-shell':'⊔','cad-loft':'⌁','cad-sweep':'⤳',array:'▦',mirror:'◀│▶',measure:'↔',ruler:'⌐',section:'◨',inspect:'✓',drawing:'▤',joints:'⚙','project-parameters':'ƒx'};

// Dock the real tree, inspector and operation panels. They keep their IDs,
// listeners, focus, selection and controller transactions. Leaving Fusion
// restores each node to its original parent using a placeholder.
export function createCadFusionUI({storage,controls,toolbar,header,tools,safe,t=x=>x,getLanguage=()=> 'de',view,executeCommand=()=>{},openSettings=()=>{},isIdle=()=>true,getProject=()=>({nodes:[]}),getSelection=()=>[],select=()=>{}}){
  const settings=createFusionSettings(storage),moved=[],captions=new Map(),extraControls=new Map();
  let mounted=false,ribbon=null,manager=null,taskPane=null,menubar=null,popup=null,observer=null,managerTab='model',activeTab=settings.get().defaultTab,fusionChatOpen=false,chatState=null,sourceStrip=null,sourceSignature='',navigation=null;
  const label=key=>fusionLabel(key,getLanguage()),word=(de,en)=>getLanguage()==='en'?en:de;
  const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const button=(text,fn)=>{const n=make('button',text);n.type='button';n.onclick=()=>safe(fn);return n;};
  function move(node,parent){if(!node)return;const marker=document.createComment('fusion-dock');node.before(marker);moved.push({node,marker});parent.append(node);}
  function restoreNodes(){for(const {node,marker}of moved.splice(0).reverse()){marker.replaceWith(node);}}
  function control(key){
    if(controls.has(key))return controls.get(key);
    if(extraControls.has(key))return extraControls.get(key);
    const node=button(label(key),()=>{});node.dataset.fusionCommand=key;
    if(['round','chamfer','array'].includes(key)){node.dataset.action=key;node.onclick=null;}
    else node.onclick=()=>safe(()=>executeCommand(key));
    extraControls.set(key,node);return node;
  }
  function decorate(node,key){
    if(!captions.has(node)){
      const fragment=document.createDocumentFragment();fragment.append(...node.childNodes);captions.set(node,{fragment,title:node.getAttribute('title'),aria:node.getAttribute('aria-label')});
      const icon=make('span',symbols[key]??'◇','fusion-command-icon');icon.setAttribute('aria-hidden','true');
      const text=label(key),caption=make('span',text===key?(node.title?.replace(/\s*\([^)]*\)/g,'')||fragment.textContent.trim()):text,'fusion-command-caption');
      node.append(icon,caption);node.classList.add('fusion-command');node.title=caption.textContent;node.setAttribute('aria-label',caption.textContent);
    }
  }
  function selectTab(key,{focus=false}={}){
    if(!FUSION_TABS.includes(key))throw Error('Unbekanntes Fusion-Register.');activeTab=key;
    for(const node of ribbon.querySelectorAll('[data-fusion-tab]')){const chosen=node.dataset.fusionTab===key;node.setAttribute('aria-selected',String(chosen));node.tabIndex=chosen?0:-1;if(chosen&&focus)node.focus();}
    for(const panel of ribbon.querySelectorAll('[data-fusion-panel]'))panel.hidden=panel.dataset.fusionPanel!==key;
    // A real command is shared by several tabs: move it to the current panel.
    const panel=ribbon.querySelector(`[data-fusion-panel="${key}"]`);panel.replaceChildren();
    for(const [name,keys] of tabCommands[key]){
      const group=make('div',undefined,'fusion-command-group'),row=make('div',undefined,'fusion-group-tools'),shown=['assemble','construct','inspect'].includes(name)?1:2;
      const more=keys.length>shown?make('details',undefined,'fusion-group-menu'):null,list=more?make('div',undefined,'fusion-group-menu-panel'):null;
      keys.forEach((key,i)=>{const node=control(key);decorate(node,key);(i<shown?row:list).append(node);});group.append(row);
      if(more){const summary=make('summary',label(name)+' ▾');more.append(summary,list);group.append(more);summary.setAttribute('aria-expanded','false');more.ontoggle=()=>{summary.setAttribute('aria-expanded',String(more.open));if(more.open){for(const other of ribbon.querySelectorAll('.fusion-group-menu'))if(other!==more)other.open=false;const r=summary.getBoundingClientRect();list.style.left=Math.max(6,Math.min(r.left,innerWidth-255))+'px';list.style.top=r.bottom+'px';list.style.maxHeight=Math.max(80,innerHeight-r.bottom-12)+'px';}};list.onclick=e=>{if(e.target.closest('button:not(:disabled)'))more.open=false;};}
      else group.append(make('span',label(name),'fusion-group-title'));panel.append(group);
    }
    closePopup();window.dispatchEvent(new Event('resize'));
  }
  function selectManager(key){
    managerTab=key==='properties'?'model':key;for(const b of manager.querySelectorAll('[data-fusion-manager]')){const chosen=b.dataset.fusionManager===managerTab;b.setAttribute('aria-selected',String(chosen));b.tabIndex=chosen?0:-1;}
    for(const panel of document.querySelectorAll('[data-fusion-manager-panel]'))panel.hidden=panel.dataset.fusionManagerPanel==='properties'?key!=='properties':panel.dataset.fusionManagerPanel!==managerTab;
  }
  function closePopup(){popup?.remove();popup=null;}
  function orientation(){
    closePopup();popup=make('div',undefined,'fusion-popup');popup.id='fusion-orientation';popup.setAttribute('role','dialog');popup.setAttribute('aria-label',label('orientation'));
    for(const [key,de,en]of [['iso','Isometrisch','Isometric'],['front','Vorne','Front'],['back','Hinten','Back'],['top','Oben','Top'],['bottom','Unten','Bottom'],['left','Links','Left'],['right','Rechts','Right']])popup.append(button(word(de,en),()=>{view.setView(key);closePopup();}));
    $('viewport').append(popup);popup.querySelector('button').focus();
  }
  function shortcutBar(){
    closePopup();popup=make('div',undefined,'fusion-popup');popup.id='fusion-search';popup.setAttribute('role','dialog');popup.setAttribute('aria-label',word('Konstruktionswerkzeuge suchen','Search design tools'));
    const input=make('input');input.type='search';input.placeholder=word('Befehl suchen …','Search commands …');input.setAttribute('aria-label',input.placeholder);popup.append(input);
    const list=make('div');popup.append(list);
    const keys=[...new Set([...Object.values(tabCommands).flatMap(groups=>groups.flatMap(([,keys])=>keys)),'fit'])];
    function render(){list.replaceChildren();for(const key of keys){const original=controls.get(key)||extraControls.get(key),text=label(key)===key?(original?.title||key):label(key);if(!text.toLocaleLowerCase().includes(input.value.toLocaleLowerCase()))continue;const b=button(text,()=>{closePopup();invoke(key);});b.disabled=original?.disabled??false;list.append(b);}}
    input.oninput=render;input.onkeydown=e=>{if(e.key==='ArrowDown'){e.preventDefault();list.querySelector('button:not(:disabled)')?.focus();}if(e.key==='Enter'){e.preventDefault();list.querySelector('button:not(:disabled)')?.click();}};render();$('viewport').append(popup);input.focus();
  }
  function invoke(key){if(['extrude','cut'].includes(key))return executeCommand(key);const node=controls.get(key)||control(key);if(!node.disabled)node.click();}
  function refresh(){
    if(!mounted||!sourceStrip)return;
    const steps=fusionSourceSteps(getProject()),selection=getSelection(),signature=JSON.stringify([steps,selection]);if(signature===sourceSignature)return;sourceSignature=signature;
    sourceStrip.replaceChildren(make('strong',word('Konstruktionsschritte','Construction steps')));
    const row=make('div',undefined,'fusion-source-items');row.setAttribute('role','group');row.setAttribute('aria-label',word('Erhaltene Quellen in Abhängigkeitsreihenfolge','Retained sources in dependency order'));sourceStrip.append(row);
    if(!steps.length)row.append(make('span',word('Mit einer Skizze oder einem Körper beginnen','Start with a sketch or body'),'fusion-source-empty'));
    for(const [i,step]of steps.entries()){const b=button(String(i+1)+' · '+step.name,()=>{if(isIdle()){select([step.target]);selectManager('properties');}});b.dataset.fusionSource=JSON.stringify(step.target);b.title=step.name+' · '+step.type;b.setAttribute('aria-pressed',String(selection.some(t=>t.rootId===step.target.rootId&&JSON.stringify(t.path)===JSON.stringify(step.target.path))));row.append(b);}
  }
  function menu(key,entries){
    const details=make('details',undefined,'fusion-menu');details.dataset.fusionMenu=key;const summary=make('summary',label(key)),panel=make('div',undefined,'fusion-menu-panel');
    summary.setAttribute('aria-expanded','false');details.append(summary,panel);menubar.append(details);
    for(const [caption,fn]of entries)panel.append(button(caption,()=>{details.open=false;summary.setAttribute('aria-expanded','false');return fn();}));
    details.addEventListener('toggle',()=>{summary.setAttribute('aria-expanded',String(details.open));if(details.open){for(const other of menubar.querySelectorAll('details'))if(other!==details)other.open=false;const r=summary.getBoundingClientRect();panel.style.left=Math.max(6,Math.min(r.left,innerWidth-250))+'px';panel.style.top=r.bottom+'px';panel.style.maxHeight=Math.max(80,innerHeight-r.bottom-10)+'px';}});
    summary.onkeydown=e=>{if(e.key==='ArrowDown'){e.preventDefault();details.open=true;panel.querySelector('button')?.focus();}};
    panel.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();details.open=false;summary.focus();}};
  }
  function mount(){
    mounted=true;activeTab=settings.get().defaultTab;
    document.body.classList.add('fusion-workbench');
    menubar=make('nav',undefined,'fusion-menubar');menubar.setAttribute('aria-label',word('Hauptmenü','Main menu'));toolbar.before(menubar);
    const act=key=>()=>{const b=controls.get(key)||document.querySelector(`[data-action="${key}"]`);if(b&&!b.disabled)b.click();},tab=key=>()=>selectTab(key);
    menu('file',[[t('Neues Projekt'),act('new')],[t('Öffnen'),act('open')],[t('Speichern'),act('save')],[t('Speichern unter …'),()=>executeCommand('save-as')],[t('Importieren'),act('import')],[t('Exportieren'),act('export')]]);
    menu('edit',[[t('Rückgängig'),act('undo')],[t('Wiederholen'),act('redo')],[t('Kopieren'),act('copy')],[t('Einfügen'),act('paste')],[t('Duplizieren'),act('duplicate')],[t('Entfernen'),act('delete')]]);
    menu('view',[[label('orientation'),orientation],[word('Einpassen','Zoom to fit'),act('fit')],[word('Perspektive / Orthografisch','Perspective / Orthographic'),act('projection')],[t('Schnittansicht'),act('section')],[word('Modellbaum','Model tree'),()=>selectManager('model')],[t('Eigenschaften'),()=>selectManager('properties')]]);
    menu('insert',[[label('extrude'),()=>executeCommand('extrude')],[label('cut'),()=>executeCommand('cut')],[label('sketch'),tab('sketch')],[label('mesh'),tab('mesh')],[t('Technische Zeichnung'),act('drawing')]]);
    const assigned=new Set([...Object.values(tabCommands).flatMap(groups=>groups.flatMap(([,keys])=>keys)),'new','open','save','save-as','projects','import','export','ai','settings','help','undo','redo','copy','paste','duplicate','delete','projection','fit','coordinates','magnet','view-iso','view-top','view-front','view-right','mode-translate','mode-scale','mode-rotate']);
    const remaining=[...controls].filter(([key,node])=>!assigned.has(key)&&node.matches('button')).map(([key,node])=>[node.title||node.textContent.trim(),act(key)]);
    menu('extras',[[label('tools'),tab('tools')],[label('project-parameters'),act('project-parameters')],[label('options'),()=>{openSettings();$('settings-tab-fusion')?.click();}],[t('Einstellungen'),openSettings],...remaining]);
    menu('help',[[word('Fusion-Einstieg','Getting started with Fusion'),()=>selectManager('model')],[t('Hilfe'),act('help')]]);
    const modeNote=make('span',word('KONSTRUKTION','DESIGN'),'fusion-mode-note');menubar.append(modeNote);
    const quick=make('div',undefined,'fusion-quick-tools');tools.append(quick);
    for(const key of ['undo','redo','copy','paste','delete'])if(controls.has(key))quick.append(controls.get(key));
    ribbon=make('section',undefined,'fusion-ribbon');ribbon.setAttribute('aria-label',word('Konstruktionswerkzeuge','Design tools'));toolbar.after(ribbon);
    const tabs=make('div',undefined,'fusion-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label',word('Werkzeugregister','Command tabs'));const workspace=make('span',word('KONSTRUKTION','DESIGN'),'fusion-workspace');tabs.append(workspace);ribbon.append(tabs);
    for(const key of FUSION_TABS){
      const b=button(label(key),()=>selectTab(key));b.id='fusion-tab-'+key;b.dataset.fusionTab=key;b.setAttribute('role','tab');b.setAttribute('aria-controls','fusion-panel-'+key);tabs.append(b);
      const panel=make('div',undefined,'fusion-command-panel');panel.id='fusion-panel-'+key;panel.dataset.fusionPanel=key;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',b.id);ribbon.append(panel);
    }
    tabs.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const i=FUSION_TABS.indexOf(activeTab);selectTab(FUSION_TABS[e.key==='Home'?0:e.key==='End'?FUSION_TABS.length-1:(i+(e.key==='ArrowLeft'?-1:1)+FUSION_TABS.length)%FUSION_TABS.length],{focus:true});};
    const originalLibrary=$('sidebar-library-content'),originalInspector=$('sidebar-inspector-content');
    manager=make('aside',undefined,'fusion-manager');manager.id='fusion-manager';manager.setAttribute('aria-label',word('Modell und Eigenschaften','Model and properties'));document.querySelector('main').prepend(manager);
    const managerTabs=make('div',undefined,'fusion-manager-tabs');managerTabs.setAttribute('role','tablist');managerTabs.setAttribute('aria-label',word('Modellbereiche','Manager tabs'));manager.append(managerTabs);
    for(const key of ['model','library','workspace']){
      const b=button(label(key),()=>selectManager(key));b.dataset.fusionManager=key;b.id='fusion-manager-tab-'+key;b.setAttribute('role','tab');b.setAttribute('aria-controls','fusion-manager-panel-'+key);managerTabs.append(b);
      const panel=make('section',undefined,'fusion-manager-content');panel.id='fusion-manager-panel-'+key;panel.dataset.fusionManagerPanel=key;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',b.id);manager.append(panel);
    }
    managerTabs.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const keys=['model','library','workspace'],i=keys.indexOf(managerTab),next=keys[e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowLeft'?-1:1)+3)%3];selectManager(next);managerTabs.querySelector(`[data-fusion-manager="${next}"]`).focus();};
    const properties=make('section',undefined,'fusion-properties');properties.id='fusion-manager-panel-properties';properties.dataset.fusionManagerPanel='properties';properties.hidden=true;properties.append(button(word('Eigenschaften schließen','Close properties'),()=>selectManager('model')));taskPane=make('aside',undefined,'fusion-task-pane');taskPane.setAttribute('aria-label',word('Eigenschaften und Bearbeitung','Properties and editing'));document.querySelector('main').append(taskPane);taskPane.append(properties);
    const target=key=>document.querySelector(`[data-fusion-manager-panel="${key}"]`);
    const title=make('h2',word('Körper & Komponenten','Bodies & components'));target('model').append(title);
    const planes=make('details',undefined,'fusion-planes');planes.append(make('summary',word('Standardansichten & Ursprung','Standard views & origin')));
    for(const [name,v]of [[word('Vorne ansehen · XZ','Front view · XZ'),'front'],[word('Von oben ansehen · XY','Top view · XY'),'top'],[word('Von rechts ansehen · YZ','Right view · YZ'),'right']])planes.append(button(name,()=>view.setView(v)));
    planes.append(make('p',word('Ursprung: X 0 · Y 0 · Z 0 mm. Neue Skizzen liegen auf der aktiven Arbeitsebene.','Origin: X 0 · Y 0 · Z 0 mm. New sketches use the active workplane.')));target('model').append(planes);
    move(originalLibrary.querySelector('.sidebar-object-section'),target('model'));
    move(originalInspector.querySelector('.inspector-properties-section'),target('properties'));
    move(originalLibrary.querySelector('.shape-library-section'),target('library'));
    move(originalInspector.querySelector('.workspace-settings'),target('workspace'));
    if(controls.has('coordinates')){const line=make('label',word('Koordinatensystem','Coordinate system'),'dialog-label');line.append(controls.get('coordinates'));target('workspace').append(line);}
    
    const chat=$('ai-chat');if(chat){chatState={collapsed:chat.classList.contains('collapsed'),hidden:$('ai-chat-body').hidden,expanded:$('ai-chat-toggle').getAttribute('aria-expanded')};move(chat,taskPane);chat.classList.toggle('collapsed',!fusionChatOpen);$('ai-chat-body').hidden=!fusionChatOpen;$('ai-chat-toggle').setAttribute('aria-expanded',String(fusionChatOpen));}
    target('model').addEventListener('dblclick',event=>{if(event.target.closest('[data-root-id]'))selectManager('properties');});
    const tip=make('p',word('Skizze oder Extrusion starten → Maße festlegen → Vorschau prüfen → Übernehmen. Vorhandene Elemente über ihre erhaltenen Quellen bearbeiten.','Start a sketch or extrusion → set dimensions → check the preview → apply. Edit existing features through their retained sources.'),'fusion-tip');target('model').append(tip);
    const operations=make('div',undefined,'fusion-operation-host');operations.id='fusion-operation-host';taskPane.append(operations);
    // Tool panels are existing viewport children. Modal sketch/AI/file dialogs
    // retain their established transaction and keyboard lifecycle.
    for(const node of $('viewport').querySelectorAll('.edge-tool-panel'))move(node,operations);
    const refreshOperations=()=>{const active=[...operations.children].some(n=>!n.hidden);taskPane.classList.toggle('fusion-operation-active',active);};
    observer=new MutationObserver(refreshOperations);observer.observe(operations,{subtree:true,attributes:true,attributeFilter:['hidden']});refreshOperations();
    navigation=make('nav',undefined,'fusion-navigation');navigation.setAttribute('aria-label',word('Ansichtsnavigation','View navigation'));for(const key of ['fit','projection'])move(controls.get(key),navigation);navigation.append(button(label('orientation'),orientation));$('viewport').append(navigation);
    sourceStrip=make('section',undefined,'fusion-source-strip');sourceStrip.id='fusion-source-strip';sourceStrip.setAttribute('aria-label',word('Konstruktionsschritte aus erhaltenen Quellen','Construction steps from retained sources'));$('viewport').append(sourceStrip);sourceSignature='';refresh();
    selectManager(managerTab);selectTab(activeTab);
    view.setNavigationProfile?.(settings.get().navigation?'fusion':'normal');
  }
  function unmount(){
    if(!mounted)return;mounted=false;observer?.disconnect();observer=null;closePopup();
    const chat=$('ai-chat');if(chat&&chatState){fusionChatOpen=!chat.classList.contains('collapsed');chat.classList.toggle('collapsed',chatState.collapsed);$('ai-chat-body').hidden=chatState.hidden;$('ai-chat-toggle').setAttribute('aria-expanded',chatState.expanded);chatState=null;}
    restoreNodes();
    for(const [node,old]of captions){node.replaceChildren(...old.fragment.childNodes);node.classList.remove('fusion-command');for(const [key,value]of [['title',old.title],['aria-label',old.aria]])if(value===null)node.removeAttribute(key);else node.setAttribute(key,value);}captions.clear();
    for(const node of extraControls.values())node.remove();extraControls.clear();
    ribbon?.remove();manager?.remove();taskPane?.remove();menubar?.remove();navigation?.remove();navigation=null;tools.querySelector('.fusion-quick-tools')?.remove();document.body.classList.remove('fusion-workbench');sourceStrip?.remove();sourceStrip=null;sourceSignature='';view.setNavigationProfile?.('normal');
  }
  function keydown(event){
    if(mounted&&event.key==='Escape'&&popup){event.preventDefault();event.stopImmediatePropagation();closePopup();view.canvas?.focus();return;}
    if(mounted&&event.key==='Escape'&&ribbon.querySelector('.fusion-group-menu[open]')){event.preventDefault();event.stopImmediatePropagation();for(const menu of ribbon.querySelectorAll('.fusion-group-menu'))menu.open=false;return;}
    if(!mounted||!settings.get().shortcuts||event.target.closest('input,textarea,select,summary,[role=treeitem],[role=tab],[contenteditable=true],#cad-context-menu')||$('modal').open||!isIdle())return;
    if(popup&&event.target.closest('#fusion-search'))return;
    const action=fusionShortcut(event);if(!action)return;event.preventDefault();event.stopImmediatePropagation();
    if(action==='search')shortcutBar();else invoke(action);
  }

  document.addEventListener('keydown',keydown,true);
  document.addEventListener('pointerdown',e=>{if(mounted&&!e.target.closest('.fusion-popup,.fusion-menu')){closePopup();for(const n of menubar.querySelectorAll('details'))n.open=false;}if(mounted&&!e.target.closest('.fusion-group-menu'))for(const n of ribbon.querySelectorAll('.fusion-group-menu'))n.open=false;});
  window.addEventListener('resize',closePopup);
  function mountSettings(root){
    const field=make('fieldset');field.id='fusion-settings';field.append(make('legend',label('options')));
    const note=make('p',word('Fusion ist auf den Umstieg von Autodesk Fusion abgestimmt. Werkzeugregister, Modellbaum und Eigenschaften nutzen die vorhandenen Formnaro-Funktionen.','Fusion is designed for users coming from Autodesk Fusion. Command tabs, model tree and properties use the existing Formnaro tools.'));field.append(note);
    for(const [key,de,en]of [['navigation','Mittlere Maustaste: verschieben · Umschalt + mittlere Maustaste: drehen','Middle mouse: pan · Shift + middle mouse: orbit'],['shortcuts','Fusion-Tasten: S Suche · E Extrusion · F Abrunden · H Bohrung · M Verschieben · I Messen · J Gelenk','Fusion keys: S search · E extrude · F fillet · H hole · M move · I measure · J joint']]){
      const line=make('label',undefined,'check-line'),input=make('input');input.type='checkbox';input.id='fusion-setting-'+key;input.checked=settings.get()[key];input.onchange=()=>safe(()=>{try{settings.set({...settings.get(),[key]:input.checked});if(mounted)view.setNavigationProfile?.(settings.get().navigation?'fusion':'normal');}finally{input.checked=settings.get()[key];}});line.append(input,make('span',word(de,en)));field.append(line);
    }
    const line=make('label',word('Startregister','Default tab'),'dialog-label'),select=make('select');select.id='fusion-setting-defaultTab';for(const key of FUSION_TABS)select.append(new Option(label(key),key));select.value=settings.get().defaultTab;select.onchange=()=>safe(()=>{try{settings.set({...settings.get(),defaultTab:select.value});}finally{select.value=settings.get().defaultTab;}});line.append(select);field.append(line);
    const info=make('p',word('Einheiten: mm · Z nach oben. Skizzen werden mit Extrusion erstellt; Schnitte starten mit einer ausgewählten Teilfläche. Fusion ändert die Bedienung. Umfang und Dateiformate entsprechen Formnaro.','Units: mm · Z up. Sketches are created with extrusion; cuts start from a selected part face. Fusion changes the interface. Capabilities and file formats follow Formnaro.'),'small-note');field.append(info);root.append(field);
  }
  return {mount,unmount,selectTab,selectManager,mountSettings,orientation,settings,refresh,activeTab:()=>activeTab};
}
