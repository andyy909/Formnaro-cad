import './cad-workbench.css';
import {createCadSolidUI} from './cad-solid-ui.js';
import {createCadFusionUI} from './cad-fusion-ui.js';

export const WORKBENCH_MODE_KEY='offlinecad-workbench-mode-v1';
const categories=[
  ['edit','Bearbeiten',['duplicate','copy','paste','delete','bundle']],
  ['arrange','Anordnen',['group','ungroup','align','mirror','center','drop','lay-on-face','reference-place','workplane-set','workplane-top','reset-plane']],
  ['cad','CAD-Werkzeuge',['edges','general-fit','sketch','sketch-on-part','sketch-templates','cad-contour','linked-contours','cad-face-offset','cad-shell','cad-loft','cad-sweep','cad-edit-modeling','joints','drawing','project-parameters','split','extract','drill']],
  ['mesh','Netz-Werkzeuge',['mesh-tools','mesh-select','mesh-inspector','mesh-repair','mesh-close-hole','mesh-connectors','mesh-reduce','mesh-curved-reduce','mesh-remesh','mesh-smooth','mesh-sculpt','mesh-erase-fill','mesh-make-solid','mesh-hollow','mesh-features','mesh-more']],
  ['convert','Umwandeln',['cad-to-mesh','mesh-to-cad','stl-to-step']],
  ['extras','Extras',['marks','functions','help']]
];
const cameraKeys=['view-iso','view-top','view-front','view-right','fit'];
const viewToolKeys=['assembly-only','assembly-load','assembly-all','coordinates','projection','measure','section','thickness','model-compare','inspect','ruler','workplane-set','workplane-top','reset-plane'];
const easyActions=['undo','redo','copy','paste','duplicate','delete','group','ungroup','align','mirror','center','drop'];
const directGroups=[['copy','paste','duplicate','delete'],['undo','redo'],['bundle','group','ungroup'],['align','mirror','center','drop']];
const iconNames={copy:'copy',paste:'clipboard',duplicate:'copy-plus',delete:'trash',undo:'arrow-back-up',redo:'arrow-forward-up',group:'layers-union',ungroup:'layers-linked',align:'align-left',mirror:'flip-horizontal',center:'focus-centered',drop:'box-align-bottom'};
const iconUrls=import.meta.glob('./icons/toolbar/*.svg',{eager:true,query:'?url',import:'default'});
const fileActions=['new','open','save','import','export','settings'];

// This is a presentation of the existing controls. No copied buttons, geometry
// operations, project data or changes to the user's saved layout are involved.
export function createCadWorkbenchUI({storage,layoutUI,safe,t=v=>v,canSwitch=()=>true,onModeChange=()=>{},getDomain=()=> 'cad',setDomain=()=>{},domainCounts=()=>({cad:0,mesh:0}),getCreationMode=()=> 'auto',getCreationKind=()=> 'cad',setCreationMode=()=>{},solidOptions={},fusionOptions={}}){
  const toolbar=document.querySelector('.toolbar'),tools=document.querySelector('.tools'),header=document.querySelector('.file-actions');
  const controls=new Map(),originals=new Map(),groups=[];
  let commandStrip=null,solid=null,fusion=null;const commandCaptions=new Map();
  for(const zone of [header,tools,document.querySelector('.view-controls'),document.querySelector('.mode-switch')])for(const node of zone.querySelectorAll('button,[data-layout-key]')){
    const key=node.dataset.layoutKey||node.dataset.action||node.id;
    controls.set(key,node);originals.set(node,{parent:node.parentElement,next:node.nextSibling});
  }
  const plane=document.querySelector('[data-action="workplane-set"]'),ruler=document.querySelector('[data-action="ruler"]');
  for(const node of [plane,ruler])originals.set(node,{parent:node.parentElement,next:node.nextSibling});
  let mode='normal';try{const saved=storage.getItem(WORKBENCH_MODE_KEY);if(['easy','solid','fusion'].includes(saved))mode=saved;}catch{/* Default to the full workbench. */}
  const switcher=document.createElement('div');switcher.id='workbench-mode';switcher.setAttribute('role','group');switcher.setAttribute('aria-label',t('Bedienmodus'));
  for(const [value,label]of [['easy','Easy Tinker'],['normal','Normal'],['solid','Solid'],['fusion','Fusion 360']]){
    const button=document.createElement('button');button.type='button';button.dataset.workbenchMode=value;button.textContent=t(label);button.onclick=()=>safe(()=>setMode(value));switcher.append(button);
  }
  header.before(switcher);
  const domainSwitcher=document.createElement('div');domainSwitcher.id='easy-domain';domainSwitcher.setAttribute('role','group');domainSwitcher.setAttribute('aria-label',t('Arbeitsbereich'));
  for(const [kind,label]of [['cad','CAD'],['mesh','Netz']]){const button=document.createElement('button');button.type='button';button.dataset.easyDomain=kind;button.textContent=t(label);button.title=t(kind==='cad'?'Nur CAD-Teile bearbeiten und neue CAD-Formen erstellen.':'Nur Netzteile bearbeiten und neue Netzformen erstellen.');button.onclick=()=>safe(()=>setDomain(kind));domainSwitcher.append(button);}
  switcher.after(domainSwitcher);
  const creationSwitcher=document.createElement('div');creationSwitcher.id='creation-domain';
  const creationLabel=document.createElement('label');creationLabel.htmlFor='creation-domain-mode';creationLabel.textContent=t('Neue Formen');
  const creationSelect=document.createElement('select');creationSelect.id='creation-domain-mode';
  for(const [value,label]of [['auto','Automatisch'],['cad','CAD'],['mesh','Netz']]){const option=document.createElement('option');option.value=value;option.textContent=t(label);creationSelect.append(option);}
  const creationStatus=document.createElement('output');creationStatus.id='creation-domain-status';creationStatus.setAttribute('aria-live','polite');creationStatus.setAttribute('aria-atomic','true');creationSelect.setAttribute('aria-describedby',creationStatus.id);
  creationSelect.onchange=()=>safe(()=>{try{setCreationMode(creationSelect.value);}finally{refreshDomain();}});
  creationSwitcher.append(creationLabel,creationSelect,creationStatus);document.querySelector('.shape-library-section').prepend(creationSwitcher);
  function refreshDomain(){fusion?.refresh();const counts=domainCounts();domainSwitcher.hidden=mode!=='easy'||layoutUI.isActive();for(const button of domainSwitcher.children){const kind=button.dataset.easyDomain;button.textContent=(kind==='cad'?'CAD':t('Netz'))+' · '+(counts[kind]??0);button.setAttribute('aria-pressed',String(getDomain()===kind));}document.body.dataset.easyDomain=mode==='easy'?getDomain():'all';
    creationSwitcher.hidden=mode!=='normal'||layoutUI.isActive();creationSelect.value=getCreationMode();const kind=getCreationKind();
    creationStatus.textContent=t(kind==='mesh'?'Erstellt Netzformen':kind==='cad'?'Erstellt CAD-Formen':'Teil auswählen oder CAD/Netz festlegen');creationSwitcher.dataset.kind=kind??'ambiguous';
  }
  const hidden=document.createElement('div');hidden.id='workbench-hidden-controls';hidden.hidden=true;toolbar.append(hidden);
  const planeTools=document.createElement('div');planeTools.className='easy-plane-tools';document.querySelector('.shape-library-section').prepend(planeTools);
  for(const node of document.querySelectorAll('#inspector > .section-title')){
    if(['Position','Drehung','Weitere Operationen','Modellnotiz'].some(label=>node.textContent.startsWith(label))){node.dataset.easyAdvanced='';if(node.nextElementSibling)node.nextElementSibling.dataset.easyAdvanced='';}
  }
  const hint=document.querySelector('#empty-hint p'),originalHint=hint.textContent;
  function restore(){
    solid?.unmount();fusion?.unmount();
    closeMenus();for(const group of groups)group.remove();groups.length=0;
    commandStrip?.remove();commandStrip=null;
    for(const [node,caption]of commandCaptions){node.replaceChildren(...caption.childNodes);node.classList.remove('workbench-command');}commandCaptions.clear();
    // Layout-managed buttons return to their exact saved zones and order.
    const layout=layoutUI.state();
    for(const [zone,keys]of Object.entries(layout.zones)){
      const parent=document.querySelector(`[data-layout-zone="${zone}"]`);
      for(const key of keys){const node=controls.get(key);if(node)parent.append(node);}
    }
    for(const [node,place]of [...originals].reverse())if(!node.dataset.layoutKey){
      place.parent.insertBefore(node,place.next?.parentElement===place.parent?place.next:null);
    }
  }
  function menu(parent,key,label,nodes){
    if(!nodes.length)return;
    const details=document.createElement('details');details.className='workbench-category';details.dataset.toolCategory=key;
    const summary=document.createElement('summary');summary.textContent=t(label);summary.setAttribute('aria-controls','tool-category-'+key);summary.setAttribute('aria-expanded','false');
    const panel=document.createElement('div');panel.id='tool-category-'+key;panel.className='workbench-category-panel';panel.setAttribute('aria-label',t(label));
    for(const node of nodes){if(node.matches('select')){const label=document.createElement('label');label.className='workbench-menu-field';label.append(document.createTextNode(t('Koordinatensystem')),node);panel.append(label);}else panel.append(node);}
    if(key==='view-tools')panel.classList.add('workbench-view-tools');
    details.append(summary,panel);parent.append(details);groups.push(details);
    summary.addEventListener('click',()=>{for(const other of groups)if(other!==details){other.open=false;other.firstElementChild.setAttribute('aria-expanded','false');}});
    details.addEventListener('toggle',()=>{summary.setAttribute('aria-expanded',String(details.open));if(details.open)position(details);});
    panel.addEventListener('click',event=>{if(event.target.closest('button:not(:disabled)')){details.open=false;summary.setAttribute('aria-expanded','false');}});
    panel.addEventListener('change',event=>{if(event.target.matches('select')){details.open=false;summary.setAttribute('aria-expanded','false');summary.focus({preventScroll:true});}});
    summary.addEventListener('keydown',event=>{
      if(!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();event.stopPropagation();if(['ArrowLeft','ArrowRight'].includes(event.key))return;
      details.open=true;summary.setAttribute('aria-expanded','true');position(details);
      const nodes=[...panel.querySelectorAll('button:not(:disabled):not([hidden]),select:not(:disabled):not([hidden])')].filter(node=>node.getClientRects().length);
      (['ArrowUp','End'].includes(event.key)?nodes.at(-1):nodes[0])?.focus();
    });
    panel.addEventListener('keydown',event=>{
      if(!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.stopPropagation();if(event.target.matches('select')||['ArrowLeft','ArrowRight'].includes(event.key))return;
      const buttons=[...panel.querySelectorAll('button:not(:disabled):not([hidden])')].filter(node=>node.getClientRects().length);
      if(!buttons.length)return;event.preventDefault();const i=buttons.indexOf(document.activeElement),next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(i+(event.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length;buttons[next].focus();
    });
  }
  function position(group){const r=group.firstElementChild.getBoundingClientRect(),panel=group.lastElementChild;panel.style.left=Math.max(8,Math.min(r.left,innerWidth-Math.min(panel.classList.contains('workbench-view-tools')?420:300,innerWidth-16)-8))+'px';panel.style.top=r.bottom+6+'px';panel.style.maxHeight=Math.max(80,innerHeight-r.bottom-20)+'px';}
  function directCommands(){
    commandStrip=document.createElement('div');commandStrip.className='workbench-command-strip';commandStrip.setAttribute('role','toolbar');commandStrip.setAttribute('aria-label',t('Bearbeiten und Anordnen'));tools.prepend(commandStrip);
    for(const actions of directGroups){
      const group=document.createElement('div');group.className='workbench-command-group';commandStrip.append(group);
      for(const action of actions){const node=controls.get(action);if(!node)continue;
        const caption=document.createElement('span');caption.className='workbench-command-caption';caption.append(...node.childNodes);commandCaptions.set(node,caption);
        const icon=document.createElement('span');icon.className='workbench-command-icon';icon.setAttribute('aria-hidden','true');const url=iconUrls[`./icons/toolbar/${iconNames[action]}.svg`];
        if(url){const img=document.createElement('img');img.src=url;img.alt='';icon.append(img);}else icon.textContent='▱';
        node.append(icon,caption);node.classList.add('workbench-command');node.setAttribute('aria-label',node.title||caption.textContent.trim());group.append(node);
      }
    }
  }
  function cameraAndViewTools(){
    const side=document.querySelector('.view-controls');side.setAttribute('role','toolbar');side.setAttribute('aria-label',t('Ansichten'));
    // Even controls placed in this zone by an old layout move out of the canvas.
    // The editor still restores all original zones and saved visibility flags.
    for(const node of [...side.children])if(!cameraKeys.includes(node.dataset.layoutKey))tools.append(node);
    for(const key of cameraKeys){const node=controls.get(key);if(node)side.append(node);}
    const nodes=viewToolKeys.map(key=>controls.get(key)).filter(Boolean);menu(tools,'view-tools','Ansicht & Prüfen',nodes);
  }
  function closeMenus(focus=false){for(const group of groups)if(group.open){group.open=false;group.firstElementChild.setAttribute('aria-expanded','false');if(focus)group.firstElementChild.focus();}}
  function sync(){
    restore();const editing=layoutUI.isActive(),easy=mode==='easy'&&!editing;
    document.body.dataset.workbenchMode=editing?'normal':mode;document.body.classList.toggle('workbench-organized',!editing);switcher.hidden=editing;
    for(const button of switcher.children)button.setAttribute('aria-pressed',String(button.dataset.workbenchMode===mode));
    refreshDomain();
    const layout=layoutUI.state();for(const key of ['library','inspector'])document.getElementById('sidebar-'+key+'-content').inert=easy?false:!!layout[key+'Collapsed'];
    hint.textContent=easy?t('Ziehe eine Form von rechts auf die Arbeitsfläche oder klicke auf einen Grundkörper.'):originalHint;
    if(editing)return;
    if(['solid','fusion'].includes(mode)){
      for(const [key,node]of controls)hidden.append(node);
      for(const key of ['new','open','save','projects','import','export','ai','settings']){const node=controls.get(key);if(node)header.append(node);}
      for(const key of cameraKeys){const node=controls.get(key);if(node)document.querySelector('.view-controls').append(node);}
      for(const key of ['mode-translate','mode-rotate','mode-scale']){const node=controls.get(key);if(node)document.querySelector('.mode-switch').append(node);}
      (mode==='solid'?solid:fusion).mount();
      hint.textContent=t('Skizze oder extrudierten Aufsatz starten. Maße festlegen, Vorschau prüfen und übernehmen.');
    }else if(easy){
      for(const [key,node]of controls)hidden.append(node);
      const order=[...layout.zones.header,...layout.zones.toolbar,...layout.zones.view];
      for(const key of order.filter(key=>fileActions.includes(key))){const node=controls.get(key);if(node)header.append(node);}
      for(const key of order.filter(key=>easyActions.includes(key))){const node=controls.get(key);if(node)tools.append(node);}
      for(const key of cameraKeys){const node=controls.get(key);if(node)document.querySelector('.view-controls').append(node);}
      for(const key of ['mode-translate','mode-scale','mode-rotate']){const node=controls.get(key);if(node)document.querySelector('.mode-switch').append(node);}
      menu(tools,'drawing-tools','Zeichnen & Netz',['sketch','sketch-templates','sketch-on-part','cad-contour','linked-contours','cad-face-offset','cad-shell','cad-loft','cad-sweep','cad-edit-modeling','joints','drawing','project-parameters','mesh-select','mesh-features','mesh-reduce','mesh-curved-reduce','mesh-repair'].map(key=>controls.get(key)).filter(Boolean));
      // Read-only inspection and view tools share the same top menu in both modes.
      cameraAndViewTools();
      // Keep the project/file-format entry reachable at compact widths.
      const projects=controls.get('projects');if(projects)tools.append(projects);
    }else{
      directCommands();
      // Present the original controls without rewriting a stored custom layout.
      cameraAndViewTools();
      const toolbarNodes=[...tools.children].filter(node=>node.matches('button')),headerExtras=[...header.querySelectorAll('button')].filter(node=>!['new','open','save','projects','import','export','ai','settings'].includes(node.dataset.layoutKey));
      for(const [key,label,actions]of categories){const nodes=toolbarNodes.filter(node=>actions.includes(node.dataset.action));menu(tools,key,label,nodes);}
      const uncategorized=toolbarNodes.filter(node=>node.parentElement===tools&&!['undo','redo'].includes(node.dataset.action));
      menu(tools,'more','Weitere Werkzeuge',uncategorized);menu(header,'file-extras','Weitere',headerExtras);
      // Undo/redo remain in front of the categories at every width.
      for(const key of ['redo','undo']){const node=controls.get(key);if(node?.parentElement===tools)tools.prepend(node);}
    }
    const viewMenu=groups.find(group=>group.dataset.toolCategory==='view-tools'),extras=groups.find(group=>group.dataset.toolCategory==='extras');if(viewMenu){if(extras)tools.insertBefore(viewMenu,extras);else tools.append(viewMenu);}
    for(const key of ['photo-project-open','ai-feature-open','freecad-document-open']){const node=controls.get(key);if(node)header.append(node);}
    window.dispatchEvent(new Event('resize'));
  }
  function setMode(value){
    if(!['easy','normal','solid','fusion'].includes(value))throw Error('Unbekannter Bedienmodus.');if(value===mode)return;
    if(!canSwitch()||layoutUI.isActive()||layoutUI.isSaving())throw Error('Bearbeitung zuerst abschließen oder abbrechen.');
    storage.setItem(WORKBENCH_MODE_KEY,value);mode=value;sync();onModeChange();
  }
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('.workbench-category'))closeMenus();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&groups.some(group=>group.open)){event.preventDefault();event.stopImmediatePropagation();closeMenus(true);}},true);
  window.addEventListener('resize',()=>{for(const group of groups)if(group.open)position(group);});
  window.addEventListener('formnaro-layout-change',sync);
  solid=createCadSolidUI({storage,controls,toolbar,header,tools,safe,t,...solidOptions});
  fusion=createCadFusionUI({storage,controls,toolbar,header,tools,safe,t,...solidOptions,...fusionOptions});
  sync();return {setMode,mode:()=>mode,sync,refreshDomain,setDomain,domain:getDomain,setCreationMode,creationMode:getCreationMode,solid,fusion};
}
