import {openMeshImport} from './import-dialog.js';
import './style.css';
import './tablet.css';
import {bridge,android} from './platform.js';
import {SHAPES,emptyProject,createNode,validateProject,decodeProject,encodeProject,cloneNodes,renewIds,History,geometryKey,MAX_BYTES} from './model.js';
import {SCHEMAS} from './engine/parameters.js';
import {request,cancelJobs} from './client.js';
import {createViewport} from './renderer.js';
import {openToolMenu,closeToolMenu} from './toolbar.js';
import {combinedBounds,mirrorNodes} from './transform-tools.js';
import {alignNodes,patternNodes,distanceMove} from './quick-tools.js';
import {createLibraryUI} from './library-ui.js';
import {createOwnShapes} from './own-shapes.js';
import {libraryCopies,libraryPlacement,placeLibraryNodes} from './library-placement.js';
const $=id=>document.getElementById(id);
let ai=null,aiLoading=null,aiVisual=false;
function clearAIPreview(){if(!aiVisual)return;aiVisual=false;document.getElementById('ai-preview-banner')?.remove();viewport.sync(project.nodes,new Map([...geometry].map(([id,v])=>[id,v.data])));}
async function loadAI(){
 if(ai)return ai;if(aiLoading)return aiLoading;
 aiLoading=import('./ai.js').then(m=>m.mountMiniAI({snapshot:()=>structuredClone(project),selection:()=>[...selection],busy:()=>busy,request,prepare,cancel:cancelJobs,
  commit:async next=>{if(!await perform('KI-Konstruktion übernehmen',()=>commit(next)))throw Error($('toast').textContent||'Übernahme fehlgeschlagen.');},
  preview:(next,map)=>{viewport.sync(next.nodes,new Map([...map].map(([id,v])=>[id,v.data])));aiVisual=true;let banner=document.getElementById('ai-preview-banner');if(!banner){banner=document.createElement('div');banner.id='ai-preview-banner';document.body.append(banner);}banner.textContent='KI-Vorschau · ursprüngliches Modell bleibt bis zur Übernahme erhalten';},clearPreview:clearAIPreview,
  screenshot:()=>{const src=viewport.previewImage(),bytes=Uint8Array.from(atob(src.split(',')[1]),c=>c.charCodeAt(0));return new File([bytes],'Mini-CAD-Modell.png',{type:'image/png'});},
  export:async(args={})=>{const {format='step',ids}=args;if(!['step','stl'].includes(format)||Object.keys(args).some(k=>!['format','ids'].includes(k))||ids!==undefined&&(!Array.isArray(ids)||!ids.length||ids.length>200||ids.some(id=>typeof id!=='string'||!project.nodes.some(n=>n.id===id))))throw Error('Gültige CAD-Auswahl und STEP oder STL wählen.');const nodes=ids?project.nodes.filter(n=>ids.includes(n.id)):project.nodes;const buffer=await request(format==='step'?'export-step':'export',nodes);let text='';const bytes=new Uint8Array(buffer);for(let i=0;i<bytes.length;i+=16384)text+=String.fromCharCode(...bytes.subarray(i,i+16384));return {format,base64:btoa(text)};}
 })).then(value=>(ai=value)).catch(e=>{aiLoading=null;throw e;});return aiLoading;
}
$('ai-open').onclick=async()=>{try{const value=await loadAI();await value.open();}catch(e){toast('KI konnte nicht geöffnet werden: '+e.message,true);}};
window.offlinecadDesktop?.onAIRequest(async(method,args)=>(await loadAI()).rpc(method,args));

let touchMode='edit',multiSelect=false;
let project=emptyProject(),selection=new Set(),busy=false,geometry=new Map(),savedText='',saveTimer,savePromise=Promise.resolve(),autosaveError=null,toastTimer,dragStart=null,operationSerial=0,paletteSession=null;
const history=new History(),stats={started:performance.now(),readyMs:0,operations:0,lastOperationMs:0};
let clipboardNodes=[],pasteCount=0,measurePoints=[];const collapsedFolders=new Set();
const viewport=createViewport($('viewport'),{
  select(id,add){if(busy)return;if(!add)selection.clear();if(id){if(add&&selection.has(id))selection.delete(id);else selection.add(id);}updateUI();},
  selectMany(ids,add){if(busy)return;if(!add)selection.clear();for(const id of ids)selection.add(id);updateUI();},
  measured:points=>showPoints(points),
  options:()=>({snap:Number($('snap').value),align:$('surface-align').checked,touchMode,multiSelect,touchUI:android}),
  placed:result=>{const session=paletteSession;return perform('Teil auf Oberfläche ablegen',()=>applyPlacement(result,session));},
  placementChanged:active=>{$('place').classList.toggle('active',active);$('place').setAttribute('aria-pressed',String(active));$('placement-hint').hidden=!active;$('welcome').hidden=active||!!project.nodes.length;},
  transformStart(){if(!busy)dragStart=encodeProject(project);},
  transformCancel(){dragStart=null;},
  transformEnd(changes){
    if(!dragStart)return;const start=dragStart;dragStart=null;
    const next=structuredClone(project);for(const change of changes){const n=next.nodes.find(n=>n.id===change.id);if(n&&!n.locked){n.pos=change.pos;n.rot=change.rot;if(change.size)n.size=change.size;}}
    perform('Änderung übernehmen',()=>commit(next,{before:start}));
  },
});
function toast(message,error=false){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').classList.toggle('error',error);$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,error?9000:3500);}
function selected(){return project.nodes.filter(n=>selection.has(n.id));}
function editable(){const nodes=selected();if(!nodes.length)throw Error('Bitte zuerst ein Teil auswählen.');if(nodes.some(n=>n.locked))throw Error('Bitte gesperrte Teile zuerst über das Schloss freigeben.');return nodes;}
function setBusy(value,label='Berechne …'){
  busy=value;$('busy-label').textContent=label;$('busy').hidden=!value;viewport.enabled(!value);
  for(const e of document.querySelectorAll('button,input,select,textarea'))if(e.id!=='cancel'&&!e.closest('dialog,#ai-chat')&&e.disabled!==value)e.disabled=value;
  if(!value)updateUI();
}
function stopPlacement(){paletteSession=null;viewport.cancelInteraction();$('placement-hint').hidden=true;}
async function perform(label,fn,{keepPlacement=false}={}){
  if(busy)return false;clearAIPreview();closeToolMenu();const id=++operationSerial,t0=performance.now();setBusy(true,label);
  if(!keepPlacement)stopPlacement();
  try{await fn();stats.operations++;stats.lastOperationMs=performance.now()-t0;return true;}catch(e){viewport.sync(project.nodes,new Map([...geometry].map(([id,v])=>[id,v.data])));toast(e.message||String(e),true);return false;}finally{if(id===operationSerial)setBusy(false);}
}
async function applyPlacement(result,session=null){
  if(!result)throw Error('Bitte über der Arbeitsfläche oder einer sichtbaren Körperoberfläche ablegen.');
  const next=structuredClone(project);
  if(result.existing){const n=next.nodes.find(n=>n.id===result.node.id);if(!n||n.locked||n.hidden)throw Error('Dieses Teil kann gerade nicht platziert werden.');const [placed]=await request('place',{nodes:[result.node],anchor:result.anchor,normal:result.normal});n.pos=[...placed.pos];n.rot=[...placed.rot];}
  else if(session?.nodes){const copies=await request('place',{nodes:placeLibraryNodes(session.nodes,session.node,result.node),anchor:result.anchor,normal:result.normal});next.nodes.push(...copies);await commit(next);selection=new Set(copies.map(n=>n.id));updateUI();return;}
  else {const [placed]=await request('place',{nodes:[result.node],anchor:result.anchor,normal:result.normal});next.nodes.push(placed);}
  await commit(next);selection=new Set([result.node.id]);updateUI();
}
async function prepare(next){
  validateProject(next);const changed=next.nodes.filter(n=>geometry.get(n.id)?.key!==geometryKey(n));
  const result=changed.length?await request('render',changed):[];
  const nextGeometry=new Map(geometry);for(const {id,data}of result){const node=next.nodes.find(n=>n.id===id);nextGeometry.set(id,{key:geometryKey(node),data});}
  const keep=new Set(next.nodes.map(n=>n.id));for(const id of nextGeometry.keys())if(!keep.has(id))nextGeometry.delete(id);
  return nextGeometry;
}
async function commit(next,{before,record=true}={}){
  next=validateProject(next);
  const text=encodeProject(next),previous=before||encodeProject(project);if(text===previous)return;
  const nextGeometry=await prepare(next);
  if(record)history.push(previous);project=next;geometry=nextGeometry;selection=new Set([...selection].filter(id=>project.nodes.some(n=>n.id===id)));
  viewport.sync(project.nodes,new Map([...geometry].map(([id,v])=>[id,v.data])));updateUI();scheduleSave(text);
}
function scheduleSave(text=encodeProject(project)){
  savedText=text;clearTimeout(saveTimer);$('save-state').textContent='Änderungen werden gesichert …';
  if(android)void flushSave();else saveTimer=setTimeout(()=>flushSave(),300);
}
async function flushSave(){
  clearTimeout(saveTimer);if(!savedText)return savePromise;const text=savedText;savedText='';
  savePromise=savePromise.catch(()=>{}).then(async()=>{
    try{const result=await bridge.autosave(text);if(!result.ok)throw Error(result.error);autosaveError=null;if(!savedText)$('save-state').textContent='Lokal automatisch gesichert';}
    catch(e){autosaveError=e;$('save-state').textContent='Sicherung fehlgeschlagen · bitte Projekt speichern';toast('Automatische Sicherung fehlgeschlagen: '+e.message,true);}
  });return savePromise;
}
async function confirm(title,text){const d=$('confirm');$('confirm-title').textContent=title;$('confirm-text').textContent=text;d.showModal();return new Promise(resolve=>{const finish=value=>{d.close();$('confirm-yes').onclick=null;$('confirm-no').onclick=null;d.oncancel=null;resolve(value);};$('confirm-yes').onclick=()=>finish(true);$('confirm-no').onclick=()=>finish(false);d.oncancel=e=>{e.preventDefault();finish(false);};});}
const iconPaths={
  box:'<path d="M6 11 23 3 39 11 22 20Z" fill="C"/><path d="M6 11v20l16 10V20Z" fill="C" opacity=".8"/><path d="M22 20 39 11v20L22 41Z" fill="C" opacity=".55"/>',
  cylinder:'<path d="M8 11v22c0 10 30 10 30 0V11" fill="C" opacity=".75"/><ellipse cx="23" cy="11" rx="15" ry="7" fill="C"/>',
  sphere:'<circle cx="23" cy="23" r="17" fill="C"/><ellipse cx="19" cy="16" rx="9" ry="6" fill="white" opacity=".18"/>',
  cone:'<path d="M6 34Q23 48 40 34L23 3Z" fill="C"/><path d="m23 3 17 31q-7 9-17 8Z" fill="#364854" opacity=".15"/>',
  roundbox:'<path d="M9 11Q23 0 37 11q4 3 4 7v13q0 4-4 6-14 12-28 0-4-2-4-6V18q0-4 4-7Z" fill="C"/><path d="M6 16 23 25 40 16v17q-17 15-34 0Z" fill="#374c5a" opacity=".15"/>',
  tube:'<path d="M7 12v21c0 12 32 12 32 0V12Z" fill="C" opacity=".75"/><ellipse cx="23" cy="12" rx="16" ry="9" fill="C"/><ellipse cx="23" cy="12" rx="9" ry="5" fill="#7b8e9b"/>',
  hexagon:'<path d="m7 12 16-9 16 9v21l-16 9L7 33Z" fill="C"/><path d="m7 12 16 9 16-9v21l-16 9L7 33Z" fill="#334652" opacity=".15"/>',
  pyramid:'<path d="M23 3 3 32l20 11 20-11Z" fill="C"/><path d="m23 3 20 29-20 11Z" fill="#334652" opacity=".2"/>',
  torus:'<ellipse cx="23" cy="24" rx="17" ry="12" fill="none" stroke="C" stroke-width="9"/>',
  star:'<path d="m23 2 6 13 14 2-10 11 3 15-13-7-13 7 3-15L2 17l15-2Z" fill="C"/>',
  heart:'<path d="M23 40 6 24C-7 9 14-4 23 11 32-4 53 9 40 24Z" fill="C"/>',
};
const DRAG_TYPE='application/x-formnaro-mini-shape';
for(const[type,name,icon,color]of SHAPES){
  const button=document.createElement('button');button.className='shape';button.dataset.shape=type;button.draggable=true;button.title=name+' auf die Arbeitsfläche oder auf ein Teil ziehen';button.innerHTML=`<svg viewBox="0 0 46 46" aria-hidden="true">${iconPaths[icon].replaceAll('="C"',`="${color}"`)}</svg><span>${name}</span>`;
  button.onclick=()=>android?perform('Form zum Platzieren vorbereiten',async()=>{const node=createNode(type,Number($('quality').value)),result=await request('render',[node]);viewport.beginPlacement(node,result[0].data,{click:true});toast('Auf Arbeitsfläche oder Körper tippen · Zurück bricht ab');document.documentElement.classList.add('hide-shapes');$('tablet-shapes').setAttribute('aria-pressed','false');},{keepPlacement:true}):actions.add(type);
  button.ondragstart=event=>startPaletteDrag(event,type,async()=>{const node=createNode(type,Number($('quality').value)),result=await request('render',[node]);return {node,data:result[0].data};});
  button.ondragend=()=>{if(!paletteSession?.dropped)stopPlacement();};$('palette').append(button);
}
function showPlacement(session,{click=false}={}){viewport.beginPlacement(session.node,session.data,{click,members:session.members});if(session.point)viewport.updatePlacement(session.point);}
function startPaletteDrag(event,key,prepare){
  if(busy){event.preventDefault();return;}stopPlacement();const session={key,node:null,data:null,point:null,dropped:false};paletteSession=session;
  event.dataTransfer.setData(DRAG_TYPE,key);event.dataTransfer.setData('text/plain',key);event.dataTransfer.effectAllowed='copy';const image=document.createElement('canvas');image.width=1;image.height=1;event.dataTransfer.setDragImage(image,0,0);$('placement-hint').hidden=false;
  session.ready=Promise.resolve().then(prepare).then(payload=>{if(paletteSession!==session)return null;Object.assign(session,payload);showPlacement(session);return session.data;}).catch(error=>{if(paletteSession===session){stopPlacement();toast(error.message,true);}return null;});
}
async function loadLibraryPlacement(id){
  const result=await bridge.libraryLoad(id);if(!result.ok)throw Error(result.error);const saved=decodeProject(result.text),nodes=libraryCopies(saved.nodes,project.nodes.length),rendered=await request('render',nodes);
  return {...libraryPlacement(nodes,rendered,saved.name),nodes};
}
function libraryDrag(event,id){startPaletteDrag(event,'library:'+id,()=>loadLibraryPlacement(id));}
function libraryPlace(id){
  return perform('Eigene Form zum Ablegen vorbereiten',async()=>{stopPlacement();const session={point:null,dropped:false};paletteSession=session;const prepared=await loadLibraryPlacement(id);if(paletteSession!==session)return;Object.assign(session,prepared);showPlacement(session,{click:true});toast(android?'Auf Arbeitsfläche oder Körper tippen · Zurück bricht ab':'Auf Arbeitsfläche oder Körper klicken · Esc bricht ab');if(android){document.documentElement.classList.add('hide-shapes');$('tablet-shapes').setAttribute('aria-pressed','false');}},{keepPlacement:true});
}
$('viewport').addEventListener('dragover',event=>{
  if(!paletteSession||busy&&!paletteSession.dropped)return;event.preventDefault();event.dataTransfer.dropEffect='copy';paletteSession.point={clientX:event.clientX,clientY:event.clientY};if(paletteSession.data){if(!viewport.placement())showPlacement(paletteSession);viewport.updatePlacement(paletteSession.point);}
});
$('viewport').addEventListener('dragleave',event=>{
  const r=$('viewport').getBoundingClientRect();
  if(event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom)return;
  if(paletteSession&&!$('viewport').contains(event.relatedTarget)){paletteSession.point=null;viewport.cancelInteraction();$('placement-hint').hidden=false;}
});
$('viewport').addEventListener('drop',event=>{
  event.preventDefault();const session=paletteSession;if(!session||busy||event.dataTransfer.getData(DRAG_TYPE)!==session.key){stopPlacement();return;}
  session.dropped=true;session.point={clientX:event.clientX,clientY:event.clientY};
  void perform('Form ablegen',async()=>{
    const data=await session.ready;if(!data||paletteSession!==session)throw Error('Platzierung abgebrochen.');
    if(!viewport.placement())showPlacement(session);viewport.updatePlacement(session.point);const result=viewport.finishPlacement();paletteSession=null;await applyPlacement(result,session);
  },{keepPlacement:true});
});
for(const[id,label,unit]of [['dimensions','Maße','mm'],['positions','Position · Mittelpunkt','mm'],['rotations','Drehung','°']]){
  const title=document.createElement('div');title.className='triplet-title';title.innerHTML=`${label}<span>${unit}</span>`;const fields=document.createElement('div');fields.className='triplet';
  ['X','Y','Z'].forEach((axis,i)=>{const l=document.createElement('label');l.textContent=axis;const input=document.createElement('input');input.type='number';input.step=id==='rotations'?'1':'.1';input.id=`${id}-${i}`;input.setAttribute('aria-label',`${label} ${axis}`);if(id==='dimensions'){input.min='.01';input.max='10000';}l.append(input);fields.append(l);input.onchange=()=>actions.change(id==='dimensions'?'size':id==='positions'?'pos':'rot',i,Number(input.value));});$(id).append(title,fields);
}
function updateUI(){
  $('project-name').value=project.name;$('welcome').hidden=!!project.nodes.length||!!viewport.placement();$('object-empty').hidden=!!project.nodes.length;$('object-count').textContent=project.nodes.length;
  const chosen=selected(),single=chosen.length===1?chosen[0]:null;
  $('selection-count').textContent=chosen.length===1?'1 TEIL':chosen.length?chosen.length+' TEILE':'KEINE AUSWAHL';
  $('no-selection').hidden=!!single;$('inspector').hidden=!single;
  if(!single){$('no-selection').querySelector('h3').textContent=chosen.length?'Gemeinsam bearbeiten':'Dein Teil im Detail';$('no-selection').querySelector('p').textContent=chosen.length?'Die Auswahl lässt sich bewegen, drehen, verbinden und ausrichten.':'Wähle ein Teil, um Maße, Position und Farbe zu ändern.';}
  $('object-list').replaceChildren();const term=$('object-search').value.trim().toLocaleLowerCase(),listed=project.nodes.filter(n=>(n.name+' '+(n.folder||'')+' '+(n.notes||'')).toLocaleLowerCase().includes(term));
  for(const folder of [...new Set(listed.map(n=>n.folder||''))].sort((a,b)=>a.localeCompare(b,'de'))){
    if(folder){const heading=document.createElement('button');heading.className='folder-heading';heading.textContent=(collapsedFolders.has(folder)?'▸ ':'▾ ')+folder;heading.setAttribute('aria-expanded',String(!collapsedFolders.has(folder)));heading.onclick=()=>{collapsedFolders.has(folder)?collapsedFolders.delete(folder):collapsedFolders.add(folder);updateUI();};$('object-list').append(heading);}
    if(folder&&collapsedFolders.has(folder)&&!term)continue;
    for(const n of listed.filter(n=>(n.folder||'')===folder)){
    const row=document.createElement('div');row.className='object-row'+(selection.has(n.id)?' selected':'');row.tabIndex=0;row.setAttribute('role','button');row.setAttribute('aria-label',n.name+(n.solid?'':' · Lochform'));row.setAttribute('aria-pressed',String(selection.has(n.id)));
    const dot=document.createElement('span');dot.className='dot';dot.style.background=n.solid?n.color:'#a8bdca';const name=document.createElement('span');name.className='name';name.textContent=n.name;name.style.opacity=n.hidden?'.4':'1';row.append(dot,name);
    const eye=document.createElement('button');eye.textContent=n.hidden?'○':'◉';eye.title=n.hidden?'Einblenden':'Ausblenden';eye.onclick=e=>{e.stopPropagation();actions.toggle(n.id,'hidden');};
    const lock=document.createElement('button');lock.textContent=n.locked?'▣':'▫';lock.title=n.locked?'Entsperren':'Sperren';lock.onclick=e=>{e.stopPropagation();actions.toggle(n.id,'locked');};row.append(eye,lock);
    row.onclick=e=>{if(busy)return;if(!(e.shiftKey||e.ctrlKey))selection.clear();if((e.shiftKey||e.ctrlKey)&&selection.has(n.id))selection.delete(n.id);else selection.add(n.id);updateUI();};row.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();row.click();}};$('object-list').append(row);
  }
  }
  const oldRef=$('align-reference').value;$('align-reference').replaceChildren(new Option('Gesamte Auswahl',''));for(const n of chosen)$('align-reference').add(new Option(n.name,n.id));if(chosen.some(n=>n.id===oldRef))$('align-reference').value=oldRef;
  $('assign-folder').disabled=busy||!chosen.length||chosen.some(n=>n.locked);$('pattern-open').disabled=busy||!chosen.length||chosen.some(n=>n.locked||n.hidden);
  if(single){
    $('part-notes').value=single.notes||'';
    $('part-name').value=single.name;$('part-color').value=single.color;$('solid').classList.toggle('active',single.solid);$('hole').classList.toggle('active',!single.solid);
    for(const[id,key]of [['dimensions','size'],['positions','pos'],['rotations','rot']])for(let i=0;i<3;i++)$(id+'-'+i).value=Number(single[key][i].toFixed(4));
    $('parameters').replaceChildren();const fields=single.brep?[]:(SCHEMAS[single.type]||[]).filter(f=>f.key!=='edgeSteps');
    if(fields.length){const h=document.createElement('h3');h.textContent='Form einstellen';$('parameters').append(h);}
    for(const field of fields){const label=document.createElement('label');label.className='parameter';const span=document.createElement('span');span.textContent=field.label;let input;
      if(field.options){input=document.createElement('select');for(const[value,title]of field.options){const option=new Option(title,value);input.add(option);}input.value=single.params[field.key];}
      else{input=document.createElement('input');input.type='number';input.min=field.min;input.max=field.max;input.step=field.step;input.value=single.params[field.key];}
      input.dataset.parameter=field.key;input.onchange=()=>actions.parameter(field.key,field.options?input.value:Number(input.value));label.append(span,input);$('parameters').append(label);
    }
    {const label=document.createElement('label');label.className='parameter';label.textContent='Anzeigequalität';const quality=document.createElement('select');quality.dataset.parameter='segments';for(const q of [32,64,128])quality.add(new Option(({32:'Schnell',64:'Standard',128:'Fein'})[q],String(q)));quality.value=single.segments;quality.onchange=()=>actions.property('segments',Number(quality.value));label.append(quality);$('parameters').append(label);}
    const d=geometry.get(single.id)?.data;$('part-stats').textContent=d?`${Math.round(d.triangles.length/3).toLocaleString('de-DE')} Anzeigedreiecke · ${(Math.abs(d.volume*single.size.reduce((a,b)=>a*b,1))/1000).toLocaleString('de-DE',{maximumFractionDigits:2})} cm³${single.children?' · Quellen erhalten':''}`:'';
    for(const e of $('inspector').querySelectorAll('input,select,button,textarea'))e.disabled=busy||single.locked;
  }
  const locked=chosen.some(n=>n.locked),noSelection=!chosen.length;
  $('undo').disabled=busy||!history.past.length;$('redo').disabled=busy||!history.future.length;
  for(const id of ['copy','delete','duplicate','drop','move','rotate','mirror-tool'])$(id).disabled=busy||noSelection||locked;
  $('paste').disabled=busy||!clipboardNodes.length;$('measure').disabled=busy||noSelection;
  $('align-tool').disabled=busy||chosen.length<2||locked;
  for(const e of document.querySelectorAll('[data-mirror]'))e.disabled=busy||noSelection||locked;
  const hidden=project.nodes.some(n=>n.hidden);
  for(const id of ['show-all','show-all-menu'])$(id).disabled=busy||!hidden;
  $('hide-selected').disabled=busy||noSelection||chosen.every(n=>n.hidden);
  $('visibility-tool').disabled=busy||!project.nodes.length;
  $('place').disabled=busy||!single||locked||single.hidden;$('select-all').disabled=busy||!project.nodes.some(n=>!n.hidden);
  for(const id of ['group','intersection'])$(id).disabled=busy||chosen.length<2||locked;
  $('ungroup').disabled=busy||!single?.children?.length||locked;
  for(const e of document.querySelectorAll('[data-align]'))e.disabled=busy||chosen.length<2||locked;
  $('export').disabled=busy;
  $('export').title=chosen.length?'Markierte Teile als STEP oder STL exportieren':'Bitte zuerst die zu exportierenden Teile markieren';
  const triangles=[...geometry.values()].reduce((a,v)=>a+v.data.triangles.length/3,0);$('scene-stats').textContent=`${project.nodes.length} Teile · ${triangles.toLocaleString('de-DE')} Dreiecke`;
  $('footer-note').textContent=chosen.length>1?`${chosen.length} Teile gemeinsam ausgewählt`:chosen.length?'Teil ziehen zum Bewegen · Auf Fläche zum Absetzen':'Auswahlrahmen ziehen · Shift-Klick ergänzt Teile';
  viewport.selection(selection,project.nodes);
}
const actions={
  copy:()=>{if(busy)return;try{stopPlacement();clipboardNodes=cloneNodes(editable());pasteCount=0;toast(clipboardNodes.length===1?'Teil kopiert.':'Auswahl kopiert.');updateUI();}catch(e){toast(e.message,true);}},
  paste:()=>perform('Auswahl einfügen',async()=>{
    if(!clipboardNodes.length)throw Error('Bitte zuerst Teile in Mini kopieren.');
    const copies=cloneNodes(clipboardNodes),offset=10*(pasteCount+1),next=structuredClone(project);
    for(const n of copies){renewIds(n);n.pos[0]+=offset;n.pos[1]+=offset;n.name=(n.name+' Kopie').slice(0,200);}next.nodes.push(...copies);
    await commit(next);pasteCount++;selection=new Set(copies.map(n=>n.id));updateUI();
  }),
  mirror:axis=>perform('Auswahl spiegeln',async()=>{const nodes=editable(),bounds=await request('bounds',nodes),mirrored=mirrorNodes(nodes,bounds,axis),next=structuredClone(project);next.nodes=next.nodes.map(n=>mirrored.find(m=>m.id===n.id)||n);await commit(next);}),
  visibility:show=>perform(show?'Alle Teile einblenden':'Auswahl ausblenden',async()=>{const next=structuredClone(project);for(const n of next.nodes)if(show||selection.has(n.id))n.hidden=!show;await commit(next);}),
  measure:async()=>{let measured;const ok=await perform('Auswahl messen',async()=>{measured=combinedBounds(await request('bounds',selected()));});if(!ok)return;$('measurement').replaceChildren();for(const [i,axis]of ['X','Y','Z'].entries()){const label=document.createElement('dt'),value=document.createElement('dd');label.textContent=axis;value.textContent=measured.size[i].toLocaleString('de-DE',{maximumFractionDigits:3})+' mm';$('measurement').append(label,value);}openToolMenu('measure-menu',$('measure'));},
  place:()=>{if(busy)return;try{const ns=editable();if(ns.length!==1||ns[0].hidden)throw Error('Bitte genau ein sichtbares Teil auswählen.');stopPlacement();viewport.beginPlacement(ns[0],geometry.get(ns[0].id).data,{existing:true,click:true});}catch(e){toast(e.message,true);}},
  selectAll:()=>{if(busy)return;stopPlacement();selection=new Set(project.nodes.filter(n=>!n.hidden).map(n=>n.id));updateUI();},
  add:type=>perform('Form erstellen',async()=>{const next=structuredClone(project),n=createNode(type,Number($('quality').value));next.nodes.push(n);selection=new Set([n.id]);await commit(next);}),
  change:(key,index,value)=>perform('Maß übernehmen',async()=>{const source=editable();if(source.length!==1)throw Error('Bitte genau ein Teil auswählen.');const next=structuredClone(project);next.nodes.find(n=>n.id===source[0].id)[key][index]=value;await commit(next);}),
  property:(key,value)=>perform('Teil ändern',async()=>{const source=editable();const next=structuredClone(project);for(const n of next.nodes)if(source.some(s=>s.id===n.id))n[key]=value;await commit(next);}),
  parameter:(key,value)=>perform('Form berechnen',async()=>{const source=editable();if(source.length!==1||source[0].brep)throw Error('Bitte eine Grundform auswählen.');const next=structuredClone(project);next.nodes.find(n=>n.id===source[0].id).params[key]=value;await commit(next);}),
  toggle:(id,key)=>perform('Teil ändern',async()=>{const next=structuredClone(project),n=next.nodes.find(n=>n.id===id);n[key]=!n[key];await commit(next);}),
  undo:()=>perform('Rückgängig',async()=>{const current=encodeProject(project),text=history.past.at(-1);if(!text)return;await commit(decodeProject(text),{record:false});history.undo(current);updateUI();}),
  redo:()=>perform('Wiederholen',async()=>{const current=encodeProject(project),text=history.future.at(-1);if(!text)return;await commit(decodeProject(text),{record:false});history.redo(current);updateUI();}),
  delete:()=>perform('Auswahl löschen',async()=>{editable();const next=structuredClone(project);next.nodes=next.nodes.filter(n=>!selection.has(n.id));await commit(next);}),
  duplicate:()=>perform('Auswahl duplizieren',async()=>{const copies=cloneNodes(editable()).map(n=>{renewIds(n);n.pos[0]+=10;n.pos[1]+=10;n.name=(n.name+' Kopie').slice(0,200);return n;});const next=structuredClone(project);next.nodes.push(...copies);selection=new Set(copies.map(n=>n.id));await commit(next);}),
  group:operation=>perform('Teile verbinden',async()=>{const nodes=editable();if(nodes.length<2)throw Error('Mindestens zwei Teile auswählen.');if(nodes.some(n=>n.hidden))throw Error('Bitte ausgeblendete Teile zuerst einblenden.');const group=await request('group',{nodes,operation});const next=structuredClone(project);next.nodes=next.nodes.filter(n=>!selection.has(n.id));next.nodes.push(group);selection=new Set([group.id]);await commit(next);}),
  ungroup:()=>perform('Quellen wiederherstellen',async()=>{const nodes=editable();if(nodes.length!==1)throw Error('Bitte eine Gruppe auswählen.');const parts=await request('ungroup',nodes[0]),next=structuredClone(project);next.nodes=next.nodes.filter(n=>n.id!==nodes[0].id);next.nodes.push(...parts);selection=new Set(parts.map(n=>n.id));await commit(next);}),
  drop:()=>perform('Auf Boden setzen',async()=>{const nodes=editable(),bounds=await request('bounds',nodes),next=structuredClone(project);for(const b of bounds)next.nodes.find(n=>n.id===b.id).pos[2]-=b.min[2];await commit(next);}),
  align:(axis,edge='center',reference='')=>perform('Auswahl ausrichten',async()=>{const nodes=editable(),aligned=alignNodes(nodes,await request('bounds',nodes),axis,edge,reference),next=structuredClone(project);next.nodes=next.nodes.map(n=>aligned.find(a=>a.id===n.id)||n);await commit(next);}),
  pattern:config=>perform('Teile wiederholen',async()=>{const nodes=editable();if(nodes.some(n=>n.hidden))throw Error('Bitte ausgeblendete Teile zuerst einblenden.');const copies=patternNodes(nodes,config,project.nodes.length),next=structuredClone(project);next.nodes.push(...copies);await commit(next);selection=new Set([...nodes,...copies].map(n=>n.id));updateUI();}),
  distance:(points,value)=>perform('Genauen Abstand einstellen',async()=>{const next=structuredClone(project);next.nodes=distanceMove(points,value,next.nodes);await commit(next);}),
  librarySave:({scope='selection',name,folder='',favorite=false})=>perform('In Bibliothek speichern',async()=>{const nodes=scope==='project'?project.nodes:selected();if(!nodes.length)throw Error('Bitte zuerst Teile markieren.');const item={...emptyProject(),name,nodes:cloneNodes(nodes)},text=encodeProject(item),image=viewport.thumbnail(nodes.map(n=>n.id)),result=await bridge.librarySave({text,image,name,folder,favorite});if(!result.ok)throw Error(result.error);toast('Mit Vorschaubild in der Bibliothek gespeichert.');ownShapes.invalidate();}),
  libraryLoad:(id,open=false)=>perform(open?'Bibliotheksteil öffnen':'Bibliotheksteil einfügen',async()=>{const result=await bridge.libraryLoad(id);if(!result.ok)throw Error(result.error);const saved=decodeProject(result.text);let next;if(open)next=saved;else{next=structuredClone(project);const copies=cloneNodes(saved.nodes);for(const n of copies){renewIds(n);n.pos[0]+=10;n.pos[1]+=10;}next.nodes.push(...copies);saved.nodes=copies;}await commit(next);selection=new Set(saved.nodes.map(n=>n.id));updateUI();viewport.fit();}),
  export:(format='stl')=>perform('CAD-Auswahl exportieren',async()=>{const nodes=selected().filter(n=>!n.hidden);if(!nodes.length)throw Error('Bitte zuerst die zu exportierenden Teile markieren.');if(!nodes.some(n=>n.solid))throw Error('Bitte mindestens einen sichtbaren Körper markieren.');const buffer=await request(format==='step'?'export-step':'export',nodes),name=nodes.length===1?nodes[0].name:project.name+' Auswahl',result=await bridge.saveExport(name,buffer,format);if(result.ok)toast('Auswahl als '+format.toUpperCase()+' gespeichert · Millimeter');else if(result.error)throw Error(result.error);}),
  save:()=>perform('Projekt speichern',async()=>{const result=await bridge.saveProject(project.name,encodeProject(project));if(result.ok){await flushSave();toast('Mini-Projekt gespeichert.');}else if(result.error)throw Error(result.error);}),
  open:()=>perform('Projekt öffnen',async()=>{const result=await bridge.openProject();if(result.error)throw Error(result.error);if(!result.ok)return;const next=decodeProject(result.text);await commit(next);selection.clear();viewport.fit();}),
  new:async()=>{if(busy)return;if(project.nodes.length&&!await confirm('Neues Projekt beginnen?','Dein aktueller Stand bleibt über Rückgängig erreichbar. Speichere eine Projektdatei, wenn du ihn dauerhaft behalten möchtest.'))return;return perform('Neues Projekt',async()=>{await commit(emptyProject());selection.clear();viewport.fit();});},
  import:()=>perform('Datei prüfen und laden',async()=>{const result=await bridge.openSTL();if(result.error)throw Error(result.error);if(!result.ok)return;const originalProject=project;let prepared;if(/\.stl$/i.test(result.name)){prepared=await openMeshImport({name:result.name,buffer:result.buffer,cad:true});if(!prepared)return;}if(project!==originalProject)throw Error('Projekt während des Imports geändert. Erneut laden.');const node=await request('import',{name:result.name,...(prepared?{prepared}:{buffer:result.buffer})}),next=structuredClone(project);next.nodes.push(node);selection=new Set([node.id]);await commit(next);viewport.fit();toast(node.mesh?'STL-Netz geladen. Importbericht in den Objektnotizen.':'CAD-Körper geladen.');}),
  demo:()=>perform('Lochplatte erstellen',async()=>{
    const next=structuredClone(project),plate=createNode('roundbox');plate.size=[60,40,6];plate.pos=[0,0,3];plate.params.edgeSize=4;
    const nodes=[plate];for(const x of [-21,21])for(const y of [-11,11]){const hole=createNode('cylinder');hole.size=[5,5,10];hole.pos=[x,y,3];hole.solid=false;nodes.push(hole);}
    const group=await request('group',{nodes});group.name='Lochplatte';next.nodes.push(group);selection=new Set([group.id]);await commit(next);viewport.fit();
  }),
};
for(const id of ['new','open','save','undo','redo','copy','paste','delete','duplicate','ungroup','drop','export','import','demo','measure'])$(id).onclick=()=>actions[id]();
for(const [id,menu]of [['visibility-tool','visibility-menu'],['align-tool','align-menu'],['mirror-tool','mirror-menu']])$(id).onclick=()=>openToolMenu(menu,$(id));
for(const id of ['show-all','show-all-menu'])$(id).onclick=()=>actions.visibility(true);
$('hide-selected').onclick=()=>actions.visibility(false);
for(const e of document.querySelectorAll('[data-mirror]'))e.onclick=()=>actions.mirror(Number(e.dataset.mirror));
$('group').onclick=()=>actions.group('union');$('intersection').onclick=()=>actions.group('intersection');
$('place').onclick=()=>actions.place();$('select-all').onclick=()=>actions.selectAll();
$('solid').onclick=()=>actions.property('solid',true);$('hole').onclick=()=>actions.property('solid',false);
$('part-name').onchange=()=>actions.property('name',$('part-name').value.trim());$('part-color').onchange=()=>actions.property('color',$('part-color').value);
$('project-name').onchange=()=>perform('Projekt umbenennen',()=>commit({...project,name:$('project-name').value.trim()}));
for(const e of document.querySelectorAll('[data-align]'))e.onclick=()=>actions.align(Number(e.dataset.align),$('align-edge').value,$('align-reference').value);
for(const e of document.querySelectorAll('[data-close]'))e.onclick=()=>{if(!busy)$(e.dataset.close).close();};
for(const d of document.querySelectorAll('dialog'))d.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
$('object-search').oninput=updateUI;
$('assign-folder').onclick=()=>actions.property('folder',$('selection-folder').value.trim());
$('part-notes').onchange=()=>actions.property('notes',$('part-notes').value);
const libraryUI=createLibraryUI({bridge,actions,snapshot:()=>project,selected,busy:()=>busy,stop:stopPlacement,onChange:()=>ownShapes.invalidate()});
const ownShapes=createOwnShapes({bridge,busy:()=>busy,stop:stopPlacement,drag:libraryDrag,place:libraryPlace,endDrag:()=>{if(!paletteSession?.dropped)stopPlacement();},android});
function showPoints(points){
  measurePoints=points||[];$('point-panel').hidden=points===null;
  if(points===null)return;$('point-instruction').textContent=points.length===0?'Ersten Punkt anklicken':points.length===1?'Zweiten Punkt anklicken':'Abstand zwischen den Punkten';
  $('point-values').textContent='';$('point-distance').value='';$('point-apply').disabled=true;
  if(points.length===2){const delta=points[1].point.map((v,i)=>v-points[0].point[i]),length=Math.hypot(...delta);$('point-distance').value=Number(length.toFixed(6));$('point-values').textContent=length.toLocaleString('de-DE',{maximumFractionDigits:3})+' mm · '+delta.map((v,i)=>'Δ'+['X','Y','Z'][i]+' '+v.toLocaleString('de-DE',{maximumFractionDigits:3})).join(' · ');const b=project.nodes.find(n=>n.id===points[1].id);$('point-apply').disabled=!b||b.locked||b.hidden||points[0].id===points[1].id||length<1e-8;}
}
$('point-measure').onclick=()=>{if(!busy){stopPlacement();viewport.beginMeasurement();}};
$('point-close').onclick=()=>{stopPlacement();updateUI();};$('point-reset').onclick=()=>viewport.beginMeasurement();
$('point-apply').onclick=()=>actions.distance(structuredClone(measurePoints),$('point-distance').valueAsNumber);
function patternFields(){const kind=$('pattern-kind').value;$('pattern-linear').hidden=kind==='circle';$('pattern-grid').hidden=kind!=='grid';$('pattern-circle').hidden=kind!=='circle';}
$('pattern-kind').onchange=patternFields;
$('pattern-open').onclick=()=>{if(busy)return;try{const nodes=editable(),center=combinedBounds(viewport.bounds(nodes.map(n=>n.id))).center;stopPlacement();['x','y','z'].forEach((a,i)=>$('pattern-c'+a).value=Number((center[i]-(i===0?30:0)).toFixed(4)));patternFields();$('pattern-dialog').showModal();}catch(e){toast(e.message,true);}};
$('pattern-form').onsubmit=async event=>{event.preventDefault();const number=id=>Number($(id).value),config={kind:$('pattern-kind').value,count:number('pattern-count'),rows:number('pattern-rows'),step:['x','y','z'].map(a=>number('pattern-'+a)),rowStep:number('pattern-row-step'),center:['x','y','z'].map(a=>number('pattern-c'+a)),axis:number('pattern-axis'),sweep:number('pattern-sweep'),rotate:$('pattern-rotate').checked};if(await actions.pattern(config))$('pattern-dialog').close();else $('pattern-status').textContent=$('toast').textContent;};
function mode(value){viewport.mode(value);$('move').classList.toggle('active',value==='translate');$('rotate').classList.toggle('active',value==='rotate');}
$('move').onclick=()=>mode('translate');$('rotate').onclick=()=>mode('rotate');$('fit').onclick=()=>viewport.fit();$('top').onclick=()=>viewport.fit('top');$('iso').onclick=()=>viewport.fit();
$('cancel').onclick=()=>{stopPlacement();cancelJobs();};
function saveSettings(){bridge.settings({quality:Number($('quality').value),snap:Number($('snap').value),surfaceAlign:$('surface-align').checked}).catch(e=>toast(e.message,true));}
$('quality').onchange=saveSettings;$('snap').onchange=()=>{viewport.snap(Number($('snap').value));saveSettings();};$('surface-align').onchange=saveSettings;
window.addEventListener('keydown',e=>{
  if(document.querySelector('dialog[open]'))return;
  if(e.key==='Escape'&&!$('confirm').open){const was=!!paletteSession||viewport.interacting();stopPlacement();dragStart=null;if(was){e.preventDefault();return;}}
  if($('confirm').open||['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)||busy)return;
  const key=e.key.toLowerCase(),mod=e.ctrlKey||e.metaKey;let action;
  if(mod&&key==='z')action=e.shiftKey?actions.redo:actions.undo;else if(mod&&key==='y')action=actions.redo;else if(mod&&key==='s')action=actions.save;else if(mod&&key==='o')action=actions.open;else if(mod&&key==='d')action=actions.duplicate;else if(mod&&key==='c')action=actions.copy;else if(mod&&key==='v')action=actions.paste;
  else if(key==='delete'||key==='backspace')action=actions.delete;else if(mod&&key==='a')action=actions.selectAll;else if(key==='f')action=()=>viewport.fit();else if(key==='w')action=()=>mode('translate');else if(key==='e')action=()=>mode('rotate');else if(key==='p')action=actions.place;else if(key==='escape')action=()=>{selection.clear();updateUI();};
  if(action){e.preventDefault();action();}
});
bridge.onClose(async()=>{ai?.access.cancel();stopPlacement();if(busy){cancelJobs();while(busy)await new Promise(r=>setTimeout(r,20));}await flushSave();bridge.closeReady(autosaveError?.message||null);});
async function boot(){
  setBusy(true,'Mini wird bereit …');
  try{
    const restored=await bridge.restore();if(restored.settings?.quality)$('quality').value=restored.settings.quality;if(restored.settings?.snap!==undefined)$('snap').value=String(restored.settings.snap);if(restored.settings?.surfaceAlign!==undefined)$('surface-align').checked=restored.settings.surfaceAlign;viewport.snap(Number($('snap').value));
    if(restored.text){const next=decodeProject(restored.text);geometry=await prepare(next);project=next;viewport.sync(project.nodes,new Map([...geometry].map(([id,v])=>[id,v.data])));$('save-state').textContent='Letzten Mini-Stand wiederhergestellt';viewport.fit();}
    if(restored.error)toast(restored.error,true);
    // Test hooks are absent during normal launches and never read Formnaro data.
    if(restored.verification){window.__mini={loadAI,aiLoaded:()=>!!ai,actions,snapshot:()=>structuredClone(project),select:ids=>{selection=new Set(ids);updateUI();},selected:()=>[...selection],history:()=>({past:history.past.length,future:history.future.length}),settled:async()=>{while(busy)await new Promise(r=>setTimeout(r,10));},replace:next=>perform('Prüfprojekt',()=>commit(next)),measurement:()=>structuredClone(measurePoints),stats:()=>({...stats,viewport:viewport.stats()}),point:p=>viewport.point(p),handlePoint:()=>viewport.handlePoint(),rect:id=>viewport.rect(id),placement:()=>viewport.placement(),previewImage:()=>viewport.previewImage(),request,flushSave,fit:view=>viewport.fit(view),isBusy:()=>busy};}
    stats.readyMs=performance.now()-stats.started;window.__miniReady=true;
  }catch(e){window.__miniError=e.message;toast('Mini konnte nicht laden: '+e.message,true);}finally{setBusy(false);}
}
if(android){
  const controls=document.createElement('div');controls.className='tablet-controls';controls.setAttribute('aria-label','Tablet-Bedienung');
  for(const [id,label,pressed]of [['shapes','Formen',true],['properties','Eigenschaften',false],['view','Ansicht drehen',false],['multi','Mehrfachauswahl',false]]){const b=document.createElement('button');b.id='tablet-'+id;b.textContent=label;b.setAttribute('aria-pressed',String(pressed));controls.append(b);}
  const hint=document.createElement('small');hint.textContent='1 Finger: bearbeiten · 2 Finger: verschieben / zoomen';controls.append(hint);document.querySelector('main').before(controls);
  document.documentElement.classList.add('hide-properties');
  for(const id of ['shapes','properties'])$('tablet-'+id).onclick=()=>{const hidden=document.documentElement.classList.toggle('hide-'+id);$('tablet-'+id).setAttribute('aria-pressed',String(!hidden));if(innerWidth<=760&&!hidden){const other=id==='shapes'?'properties':'shapes';document.documentElement.classList.add('hide-'+other);$('tablet-'+other).setAttribute('aria-pressed','false');}};
  $('tablet-view').onclick=()=>{stopPlacement();touchMode=touchMode==='edit'?'view':'edit';$('tablet-view').setAttribute('aria-pressed',String(touchMode==='view'));$('tablet-view').textContent=touchMode==='view'?'Ansicht aktiv':'Ansicht drehen';updateUI();};
  $('tablet-multi').onclick=()=>{stopPlacement();multiSelect=!multiSelect;$('tablet-multi').setAttribute('aria-pressed',String(multiSelect));updateUI();};
  document.querySelector('.left>.subtle').textContent='Form antippen, dann auf der Arbeitsfläche platzieren.';
  document.querySelector('.local-note').textContent='Offline · Projekte und Bibliothek auf diesem Gerät';
  document.querySelector('#welcome p').textContent='Tippe links auf eine Form und dann auf die Arbeitsfläche.';
  window.addEventListener('mini-background',()=>{stopPlacement();void flushSave();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stopPlacement();void flushSave();}});
  window.addEventListener('mini-back',async()=>{
    const dialog=document.querySelector('dialog[open]');if(dialog){if(!busy)dialog.dispatchEvent(new Event('cancel',{cancelable:true}));if(!busy&&dialog.open)dialog.close();return;}
    if(viewport.interacting()){stopPlacement();return;}
    closeToolMenu();if(busy){cancelJobs();return;}await flushSave();bridge.closeReady(autosaveError?.message||null);
  });
}
$('export').onclick=()=>selected().some(n=>!n.hidden&&n.solid)?openToolMenu('export-menu',$('export')):actions.export('step');
$('export-step').onclick=()=>actions.export('step');
$('export-stl').onclick=()=>actions.export('stl');
boot();
