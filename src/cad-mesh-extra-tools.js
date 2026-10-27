import * as THREE from 'three';
import {commonFrame,commonBounds,commonEditable,commonFit,commonPattern,meshFloorTransform,commonReferenceTransform,meshMagnetTransform} from './common-tool-operations.js';
import {meshSurfaceHit,meshReferenceAt} from './mesh-surface.js';
import {meshTextPaths,meshSvgPaths} from './mesh-contours.js';
import {cloneCadSources} from './cad-source-clone.js';
import {cadPermanentlyVisible} from './cad-isolation.js';
import {flags} from './organization.js';

const modes=[['measure','Messen'],['ruler','Lineal'],['array','Anordnen'],['fit','Passung'],['reference','An Bezugspunkt platzieren'],['floor','Auf Fläche legen'],['magnet','Magnet: auf Fläche ziehen'],['section','Schnittansicht'],['inspect','Modell prüfen'],['text','Netztext'],['svg','SVG als Netz'],['sketch','Netzskizze'],['plugin','Netz aus Formpaket'],['repair','Bisherige Netzreparatur']];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n).toLocaleString('de-DE',{maximumFractionDigits:5,useGrouping:false});
const selectField=(id,title,values)=>`<label>${title}<select id="extra-${id}">${values.map(([v,s])=>`<option value="${esc(v)}">${esc(s)}</option>`).join('')}</select></label>`;
const field=(id,title,value=0)=>`<label>${title}<input id="extra-${id}" value="${esc(value)}" inputmode="decimal"></label>`;
const vector=(id,title,values=[0,0,0],labels='XYZ')=>`<p>${title}</p><div class="mesh-vector">${values.map((v,k)=>field(id+'-'+k,labels[k],v)).join('')}</div>`;

/** Remaining established mesh workflows. All edits are proposals in the one
 * shared controller; measurements/sections never become model geometry. */
export function createCadMeshExtraTools({controller,view,getSelection,select,prepare,showPreview,clearPreview,applyProposal,toast,getFonts,getPlugins,storage,onSketch,onSection}){
 const panel=document.createElement('section');panel.id='cad-mesh-extra';panel.className='edge-tool-panel';panel.hidden=true;panel.setAttribute('aria-label','Weitere Netz-Werkzeuge');view.canvas.parentElement.append(panel);
 let active=null,generation=0,sectionState=null;
 const project=()=>controller.readSnapshot(),$=id=>panel.querySelector('#extra-'+id),number=id=>{const text=$(id)?.value.trim(),v=text?Number(text.replace(',','.')):NaN;if(!Number.isFinite(v))throw Error('Bitte endliche Zahlen eingeben.');return v;},vec=id=>[0,1,2].map(k=>number(id+'-'+k));
 const message=text=>{if($('status'))$('status').textContent=text;},run=fn=>Promise.resolve().then(fn).catch(error=>{message(error.message);toast(error.message);});
 function valid(){if(!active||active.revision!==controller.revision())throw Error('Projekt geändert. Werkzeug erneut öffnen.');return active;}
 function discard(){const s=active;if(!s)return;s.ticket=(s.ticket??0)+1;if(s.preview)controller.discard(s.preview.previewId);s.preview=null;clearPreview();if($('apply'))$('apply').disabled=true;}
 function close(){if(!active)return false;const s=active;active=null;generation++;if(s.busy)controller.cancel();if(s.preview)controller.discard(s.preview.previewId);s.abort.abort();line([]);clearPreview();panel.hidden=true;if(s.kind==='magnet')view.setDragInteraction(null);view.setInteraction(null);return true;}
 function node(s=valid(),editable=true){const n=editable?commonEditable(project(),s.id):project().nodes.find(n=>n.id===s.id);if(!n)throw Error('Ein fertiges Teil auswählen.');return n;}
 function oneId(){const targets=getSelection();if(targets.length!==1||targets[0].path.length)throw Error('Ein fertiges Teil auswählen.');return targets[0].rootId;}
 function selectedBodies(){const ids=getSelection().filter(t=>!t.path.length).map(t=>t.rootId);return project().nodes.filter(n=>cadPermanentlyVisible(n,project())&&view.allows(n.id)&&(n.kind==='cad'?n.solid:n.kind==='mesh'&&n.meshRole!=='hole')&&(!ids.length||ids.includes(n.id)));}
 function line(points){const group=view.groups.measurements;for(const child of [...group.children]){child.geometry?.dispose();child.material?.dispose();group.remove(child);}if(points.length){const geometry=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p))),object=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:'#bd791f',depthTest:false}));object.renderOrder=31;group.add(object);}view.invalidate('mesh-measurement');}
 async function pickSurface(ray,event,hint,{exclude}={}){
  const p=project(),visible=p.nodes.filter(n=>n.id!==exclude&&cadPermanentlyVisible(n,p)&&view.allows(n.id)),hintNode=visible.find(n=>n.id===hint?.object.userData.rootId),mesh=hintNode&&hintNode.kind!=='cad'?meshSurfaceHit(hintNode,ray):exclude?visible.filter(n=>n.kind!=='cad').map(n=>meshSurfaceHit(n,ray)).filter(Boolean).sort((a,b)=>a.distance-b.distance)[0]??null:null,ids=visible.filter(n=>n.kind==='cad'&&n.solid).map(n=>n.id),limited=mesh?{...ray,far:Math.min(ray.far??1e9,Math.max(0,mesh.distance-1e-7))}:ray;
  const native=ids.length&&(limited.far??1e9)>(limited.near??0)?await controller.query('rayPick',{ray:limited,ids}):null;
  if(native)return {objectId:native.objectId,point:native.point,normal:native.normal,kind:'surface'};
  if(!mesh)throw Error('Eine sichtbare Modellfläche anklicken.');return meshReferenceAt(hintNode??visible.find(n=>n.id===mesh.objectId),mesh,{event,projectPoint:view.projectPoint,mode:$('snap')?.value??'surface',signal:active?.abort.signal});
 }
 async function pick(ray,event,hint){
  const s=active;if(!s||s.busy)return;s.busy=true;const token=generation,ticket=s.ticket;
  try{
   const hit=await pickSurface(ray,event,hint,{exclude:s.kind==='reference'&&s.source?s.id:undefined});if(active!==s||token!==generation)return;discard();
   if(s.kind==='measure'){
    if(s.points.length===2)s.points=[];s.points.push(hit);line(s.points.map(p=>p.point));if(s.points.length===2){const [a,b]=s.points,delta=b.point.map((v,k)=>v-a.point[k]);s.distance=Math.hypot(...delta);$('distance').value=fmt(s.distance);$('distance-row').hidden=false;message('Abstand '+fmt(s.distance)+' mm · ΔX/Y/Z '+delta.map(fmt).join(' / ')+' mm. Das zweite Teil lässt sich entlang der Messstrecke verschieben.');}else message('Zweiten Punkt anklicken.');
   }else if(s.kind==='ruler'){s.rulerPoint=hit.point;const local=new THREE.Vector3(...hit.point).applyMatrix4(new THREE.Matrix4().fromArray(project().coordinateMode==='plane'?commonFrame(project()):new THREE.Matrix4().toArray()).invert()).toArray();local.forEach((v,k)=>$('origin-'+k).value=fmt(v));message('Linealpunkt gewählt. Vorschau berechnen.');}
   else if(s.kind==='floor'){if(hit.objectId!==s.id||hit.triangleIndex===undefined)throw Error('Eine eigene äußere Netzfläche anklicken.');s.hit=hit;await preview(true);}
   else if(s.kind==='reference'){
    if($('anchor').value==='pick'&&!s.source){if(hit.objectId!==s.id)throw Error('Zuerst einen Punkt am ausgewählten Teil anklicken.');s.source=hit.point;message('Quellpunkt gewählt. Jetzt die Zielfläche anklicken.');}
    else{if(hit.objectId===s.id)throw Error('Eine Fläche an einem anderen Teil wählen.');s.hit=hit;await preview(true);}
   }
  }catch(error){if(active===s)message(error.message);}
  finally{if(active===s)s.busy=false;}
 }
 function fields(kind,s){
  const snap=selectField('snap','Punktfang',[['surface','Flächenpunkt'],['auto','Automatisch'],['vertex','Ecke'],['midpoint','Kantenmitte'],['circle','Kreismitte'],['center','Flächenschwerpunkt']]);
  if(kind==='measure')return snap+'<p>Zwei sichtbare Modellpunkte anklicken. Netzpunkte beziehen sich auf die gespeicherten Dreiecke.</p><div id="extra-distance-row" hidden>'+field('distance','Gewünschter Punktabstand (mm)',0)+'</div>';
  if(kind==='ruler')return snap+vector('origin','Ursprung im aktuellen Koordinatensystem (mm)',project().ruler?.origin??[0,0,0])+selectField('ruler-mode','Abstand ab',[['min','Unterkante'],['center','Mittelpunkt']])+vector('ruler-distance','Gewünschte Abstände der Auswahl zum Lineal (mm)')+'<label><input id="extra-ruler-move" type="checkbox"> Auswahl auf diese Abstände verschieben</label><button id="extra-ruler-remove">Lineal entfernen</button>';
  if(kind==='array')return selectField('pattern','Muster',[['line','Reihe'],['grid','Raster'],['circle','Kreis']])+field('count','Anzahl einschließlich Original',3)+selectField('space','Koordinaten',[['plane','Arbeitsebene'],['world','Weltachsen']])+vector('step','Schritt (mm)',[20,0,0])+field('columns','Rasterspalten',3)+field('row','Zeilenabstand (mm)',20)+field('radius','Kreisradius (mm)',30)+field('angle','Gesamtwinkel (°)',360)+'<label><input id="extra-rotate" type="checkbox"> Kreiskopien mitdrehen</label>';
  if(kind==='fit')return selectField('fit-kind','Passung',[['insert','Einsatz verkleinern'],['opening','Öffnung vergrößern']])+field('gap','Spiel je Seite (mm)',.2)+'<div class="mesh-vector">'+[0,1,2].map(k=>`<label><input id="extra-axis-${k}" type="checkbox" ${k<2?'checked':''}> ${'XYZ'[k]}</label>`).join('')+'</div><label><input id="extra-fit-copy" type="checkbox"> Gegenstück als neue Lochform erzeugen</label><p>Komplexe Konturen werden entlang ihrer lokalen Achsen skaliert.</p>'+field('preset-name','Name des Druckspiels','Meine Passung')+'<button id="extra-preset-save">Druckspiel speichern</button>'+selectField('preset','Gespeichertes Druckspiel',[['','Eigener Wert'],...presets().map(p=>[p.id,p.name])])+'<button id="extra-preset-remove">Gewähltes Druckspiel entfernen</button>';
  if(kind==='reference')return snap+selectField('anchor','Eigener Bezug',[['center','Mittelpunkt'],['pick','Punkt am Teil anklicken']])+vector('offset','Versatz am Ziel (mm)',[0,0,0],'UVN')+'<button id="extra-repick">Punkte neu wählen</button><p>Zielfläche anklicken. Ein eigener Punkt wird zuvor am ausgewählten Teil gewählt.</p>';
  if(kind==='magnet')return '<p>Das ausgewählte Netzteil auf eine sichtbare Körperfläche ziehen. Beim Loslassen wird genau eine Änderung übernommen. Escape verwirft die Vorschau.</p>';
  if(kind==='floor')return selectField('floor-plane','Auflage',[['plane','Arbeitsebene'],['ground','Grundebene Z = 0']])+'<p>Eine eigene äußere Netzfläche anklicken. Die vollständige affine Form bleibt erhalten.</p>';
  if(kind==='section')return selectField('section-axis','Schnittebene',[['plane','Arbeitsebene'],['2','Welt Z'],['0','Welt X'],['1','Welt Y']])+field('offset','Versatz (mm)',0)+selectField('side','Behaltene Seite',[['positive','Positive Seite'],['negative','Negative Seite']])+'<button id="extra-section-off">Schnittansicht ausschalten</button><p>Reine Ansicht: Das Projekt und die Exporte bleiben vollständig.</p>';
  if(kind==='inspect')return field('threshold','Mindestwand als Stichprobe (mm)',1)+selectField('quality','Stichproben',[['1500','Bis zu 1.500 je Teil'],['6000','Bis zu 6.000 je Teil']])+'<p>Bestehende Netzprüfung: Kollisionen und Wandstärken-Stichproben. Kein garantierter globaler Mindestwert.</p>';
  if(kind==='repair')return '<p>Vorhandene begrenzte Netzreparatur bis 40.000 Dreiecke: Duplikate, Nullflächen, Orientierung und geeignete Nachbarkanten. Die Originalquelle bleibt erhalten.</p><label><input id="extra-fill" type="checkbox"> Geeignete kleine Lücken schließen</label>';
  const source=project().nodes.find(n=>n.id===s.id)?.meshSource?.node,edit=source&&(kind==='text'&&source.type==='text'||kind==='sketch'&&source.type==='sketch'||kind==='svg'&&source.outlineSource?.shape==='svg');s.edit=!!edit;
  const heading=edit?'<p>Erhaltene Netzquelle bearbeiten. Lage, Farbe und übrige Teile bleiben erhalten.</p>':selectField('frame','Koordinaten',[['plane','Arbeitsebene'],['world','Weltachsen']]);
  if(kind==='text')return heading+field('text','Text',edit?source.text:'TEXT')+selectField('font','Schrift',getFonts().map(f=>[f.id,f.name]))+field('height','Extrusionshöhe (mm)',edit?source.outlineSource?.height??4:4);
  if(kind==='svg')return heading+'<label>SVG-Datei<input id="extra-svg-file" type="file" accept=".svg"></label><label hidden>SVG-Inhalt<textarea id="extra-svg" rows="5" hidden>'+esc(edit?source.outlineSource.svg??'':'')+'</textarea></label>'+field('height','Extrusionshöhe (mm)',edit?source.outlineSource?.height??3:3);
  if(kind==='plugin'){s.templates=getPlugins().filter(p=>p.enabled).flatMap(p=>p.manifest.shapes.map(shape=>({manifest:p.manifest,shape})));return heading+selectField('template','Formpaket-Vorlage',s.templates.map((v,k)=>[String(k),typeof v.shape.name==='string'?v.shape.name:v.shape.name.de??v.shape.id]));}
  return '';
 }
 function presets(){try{return JSON.parse(storage.getItem('offlinecad-general-fits-v1')??'[]').filter(p=>p&&typeof p.id==='string'&&typeof p.name==='string'&&Number.isFinite(p.gap)&&p.gap>=0&&p.gap<=5).slice(0,50);}catch{return [];}}
 function open(kind=sectionState?'section':'measure'){
  if(!modes.some(([k])=>k===kind))throw Error('Unbekanntes Netz-Werkzeug.');if(kind==='sketch')return onSketch();if(sectionState&&['measure','ruler','reference','floor','magnet'].includes(kind))throw Error('Für Flächen- und Punktwerkzeuge zuerst die Schnittansicht ausschalten.');prepare();close();const s=active={kind,revision:controller.revision(),selection:JSON.stringify(getSelection()),id:getSelection().length===1&&!getSelection()[0].path.length?getSelection()[0].rootId:null,preview:null,busy:false,abort:new AbortController(),points:[],source:null,hit:null};generation++;
  try{if(['array','fit','reference','floor','repair','magnet'].includes(kind)){s.id=oneId();const n=node(s,kind!=='measure');if(kind!=='array'&&n.kind!=='mesh'){close();throw Error('Ein bearbeitbares Netzteil auswählen.');}}}catch(error){close();throw error;}
  panel.innerHTML='<strong>Weitere Netz-Werkzeuge</strong>'+selectField('kind','Werkzeug',modes)+'<div id="extra-fields">'+fields(kind,s)+'</div><p id="extra-status" role="status"></p><div id="extra-result"></div><div class="edge-actions"><button id="extra-preview">'+(['section','inspect'].includes(kind)?'Berechnen':'Vorschau')+'</button><button id="extra-apply" class="primary" disabled>Übernehmen</button><button id="extra-cancel">Abbrechen</button></div>';panel.hidden=false;$('kind').value=kind;$('kind').onchange=()=>run(()=>$('kind').value==='section'&&onSection?onSection():open($('kind').value));$('cancel').onclick=close;$('preview').onclick=()=>run(()=>preview());$('apply').onclick=()=>run(apply);
  for(const e of panel.querySelectorAll('#extra-fields input,#extra-fields select,#extra-fields textarea'))e.addEventListener('input',()=>{if(active===s){discard();if(['floor','reference'].includes(kind)){s.hit=null;s.source=null;}}});
  if(['measure','ruler','floor','reference'].includes(kind))view.setInteraction(pick);
  if(kind==='magnet'){
   const queue=()=>{if(s.running)return s.running;s.running=(async()=>{while(s.latest&&active===s){const current=s.latest;s.latest=null;s.busy=true;try{const hit=await pickSurface(current.ray,current.event,null,{exclude:s.id});if(active!==s)return;const transform=meshMagnetTransform(node(s),hit);await previewDraft(d=>{commonEditable(d,s.id).transform=transform;});}catch(error){if(active===s){discard();message(error.message);}}finally{if(active===s)s.busy=false;}}})().finally(()=>{s.running=null;});return s.running;};
   view.setDragInteraction({start:({hit})=>active===s&&hit?.object.userData.rootId===s.id,move:({ray,event})=>{s.latest={ray,event};void queue();},end:async({ray,event,moved})=>{if(!moved||active!==s)return;s.latest={ray,event};await queue();if(active===s&&s.preview)await apply();},cancel:()=>close()});
  }
  if(kind==='measure')message('Ersten Punkt anklicken.');
  if(kind==='ruler')$('ruler-remove').onclick=()=>run(()=>previewDraft(d=>{d.ruler=null;}));
  if(kind==='reference')$('repick').onclick=()=>{discard();s.source=null;s.hit=null;message('Punkte erneut wählen.');};
  if(kind==='section')$('section-off').onclick=()=>{sectionState=null;view.clearSection();close();};
  if(kind==='svg')$('svg-file').onchange=()=>run(async()=>{const file=$('svg-file').files[0];if(file&&file.size<=5*1024*1024){const text=await file.text();if(active===s)$('svg').value=text;}else throw Error('SVG höchstens 5 MB.');});
  if(kind==='text'&&s.edit)$('font').value=node(s,false).meshSource.node.font??'regular';
  if(kind==='fit'){
   const refresh=(id='')=>{$('preset').innerHTML=[['','Eigener Wert'],...presets().map(p=>[p.id,p.name])].map(([value,name])=>`<option value="${esc(value)}">${esc(name)}</option>`).join('');$('preset').value=id;};
   $('preset').onchange=()=>{discard();const p=presets().find(p=>p.id===$('preset').value);if(p){$('gap').value=fmt(p.gap);$('preset-name').value=p.name;}};
   $('preset-save').onclick=()=>run(()=>{const gap=number('gap'),name=$('preset-name').value.trim();commonFit(node(),{gap});if(!name||name.length>100)throw Error('Vorlagenname: 1–100 Zeichen.');const all=presets(),id=crypto.randomUUID();if(all.length>=50)throw Error('Höchstens 50 Druckspiele.');storage.setItem('offlinecad-general-fits-v1',JSON.stringify([...all,{id,name,gap}]));refresh(id);toast('Druckspiel gespeichert.');});
   $('preset-remove').onclick=()=>run(()=>{const id=$('preset').value;if(!id)throw Error('Ein gespeichertes Druckspiel wählen.');storage.setItem('offlinecad-general-fits-v1',JSON.stringify(presets().filter(p=>p.id!==id)));refresh();toast('Druckspiel entfernt.');});
  }
  return state();
 }
 async function previewDraft(change,operation){
  const s=valid(),token=generation;discard();const ticket=s.ticket,draft=controller.snapshot(),before=new Map(draft.nodes.map(n=>[n.id,JSON.stringify(n)]));if(change)await change(draft);if(active!==s||token!==generation||ticket!==s.ticket)return;const proposal=await controller.preview(operation,{project:draft,revision:s.revision,label:'Netz-Werkzeug: '+s.kind});
  if(active!==s||token!==generation||ticket!==s.ticket){controller.discard(proposal.previewId);return;}s.affected=proposal.project.nodes.filter(n=>before.get(n.id)!==JSON.stringify(n)).map(n=>n.id);s.preview=proposal;s.ids=proposal.selectedIds??s.affected;await showPreview(proposal,s.affected,s.affected.filter(id=>before.has(id)));if(active!==s)return;$('apply').disabled=false;message('Vorschau prüfen und übernehmen oder abbrechen.');
 }
 async function preview(fromPick=false){
  const s=valid();if(s.busy&&!fromPick)return;s.busy=true;const token=generation,ticket=s.ticket;
  try{
   if(s.kind==='array')return await previewDraft(d=>{s.ids=commonPattern(d,s.id,{kind:$('pattern').value,count:number('count'),step:vec('step'),columns:number('columns'),rowStep:[0,number('row'),0],radius:number('radius'),angle:number('angle'),rotateCopies:$('rotate').checked,space:$('space').value});});
   if(s.kind==='fit')return await previewDraft(d=>{const original=commonEditable(d,s.id),copy=$('fit-copy').checked,n=copy?cloneCadSources(original):original,result=commonFit(n,{gap:number('gap'),axes:[0,1,2].filter(k=>$('axis-'+k).checked),kind:copy?'opening':$('fit-kind').value});n.transform=result.transform;if(copy){n.meshRole='hole';n.name=('Passung – '+n.name).slice(0,200);d.nodes.push(n);}s.ids=[n.id];});
   if(s.kind==='measure')return await previewDraft(d=>{if(s.points.length!==2||s.distance<1e-8)throw Error('Zwei unterschiedliche Punkte wählen.');const [a,b]=s.points,n=commonEditable(d,b.objectId),distance=number('distance');if(a.objectId===b.objectId||distance<.01||distance>100000)throw Error('Zum Ändern zwei verschiedene Teile und einen gültigen Abstand wählen.');const shift=b.point.map((v,k)=>(v-a.point[k])*(distance/s.distance-1));n.transform=new THREE.Matrix4().makeTranslation(...shift).multiply(new THREE.Matrix4().fromArray(n.transform)).toArray();});
   if(s.kind==='ruler')return await previewDraft(async d=>{const origin=vec('origin');d.ruler={origin,mode:$('ruler-mode').value};if($('ruler-move').checked){const targets=getSelection();if(!targets.length||targets.some(t=>t.path.length))throw Error('Fertige Teile zum Verschieben auswählen.');const frame=d.coordinateMode==='plane'?commonFrame(d):new THREE.Matrix4().toArray(),bounds=await controller.query('bounds',{targets,frame}),current=bounds[d.ruler.mode],desired=vec('ruler-distance'),delta=desired.map((v,k)=>v+origin[k]-current[k]),shift=new THREE.Matrix4().fromArray(frame).multiply(new THREE.Matrix4().makeTranslation(...delta)).multiply(new THREE.Matrix4().fromArray(frame).invert());for(const t of targets){const n=commonEditable(d,t.rootId);n.transform=shift.clone().multiply(new THREE.Matrix4().fromArray(n.transform)).toArray();}}});
   if(s.kind==='floor')return await previewDraft(d=>{if(!s.hit)throw Error('Zuerst eine eigene Netzfläche anklicken.');const n=commonEditable(d,s.id);if($('floor-plane').value==='plane'&&d.workplane.reference?.objectId===n.id)throw Error('Die Arbeitsebene gehört zu diesem Teil. Die Grundebene oder eine fremde Arbeitsebene wählen.');n.transform=meshFloorTransform(n,s.hit.triangleIndex,s.hit.point,$('floor-plane').value==='ground'?{origin:[0,0,0],orientation:[0,0,0,1]}:d.workplane);});
   if(s.kind==='reference')return await previewDraft(d=>{if(!s.hit)throw Error('Zuerst einen Zielbezug anklicken.');const n=commonEditable(d,s.id),source=s.source??commonBounds(n).center;n.transform=commonReferenceTransform(n,source,s.hit,vec('offset'));});
   if(s.kind==='repair')return await previewDraft(null,{type:'mesh-repair',id:s.id,fillSmallHoles:$('fill').checked});
   if(['text','svg','sketch','plugin'].includes(s.kind)){
    if(s.edit)commonEditable(project(),s.id);const op={type:s.edit?'mesh-replace-source':'mesh-create-source',...(s.edit?{id:s.id}:{}),shape:s.kind,...(!s.edit&&$('frame').value==='plane'?{frame:commonFrame(project())}:{})};
    if(s.kind==='text')Object.assign(op,{text:$('text').value,font:$('font').value,height:number('height'),paths:await meshTextPaths($('text').value,$('font').value,getFonts.resources()),name:'Text'});
    else if(s.kind==='svg')Object.assign(op,{svg:$('svg').value,paths:meshSvgPaths($('svg').value),height:number('height')});
    else{const template=s.templates[Number($('template').value)];if(!template)throw Error('Zuerst ein Formpaket in den Einstellungen importieren.');op.manifest=template.manifest;op.shapeId=template.shape.id;}
    if(active!==s||token!==generation||s.ticket!==ticket)return;return await previewDraft(null,op);
   }
   if(s.kind==='inspect'){
    const nodes=selectedBodies(),meshes=nodes.filter(n=>n.kind==='mesh'),native=nodes.filter(n=>n.kind==='cad'),results=[];if(meshes.length)results.push(await controller.meshQuery('toolsQuery',{kind:'inspect',ids:meshes.map(n=>n.id),options:{threshold:number('threshold'),quality:number('quality')}}));
    for(let i=0;i<native.length;i++)for(let j=i+1;j<native.length;j++){const r=await controller.query('collision',{leftId:native[i].id,rightId:native[j].id});if(r.intersects)results.push({native:true,collisions:[{a:native[i].name,b:native[j].name,volume:r.volume}]});}
    if(active!==s||token!==generation||s.ticket!==ticket)return;if(!nodes.length)throw Error('Sichtbare Materialkörper auswählen.');s.result=results;$('result').textContent=results.map(r=>(r.label??'Native CAD-Kollisionen')+' · '+(r.samples??0)+' Stichproben · '+(r.collisions?.length??0)+' Kollisionen'+(r.parts?.map(p=>' · '+p.name+': '+(p.minimum===null?'keine Messung':fmt(p.minimum)+' mm')).join('')??'')).join('\n');message('Prüfung abgeschlossen. Das Projekt wurde nicht verändert. Kollisionen zwischen CAD und Netz werden hier nicht berechnet.');return;
   }
   if(s.kind==='section'){
    const nodes=selectedBodies(),axis=$('section-axis').value,q=axis==='plane'?new THREE.Quaternion(...project().workplane.orientation):axis==='0'?new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2):axis==='1'?new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2):new THREE.Quaternion(),normal=new THREE.Vector3(0,0,1).applyQuaternion(q),origin=axis==='plane'?new THREE.Vector3(...project().workplane.origin):new THREE.Vector3();origin.addScaledVector(normal,number('offset'));const negative=$('side').value==='negative',meshes=nodes.filter(n=>n.kind==='mesh'),results=[];
    if(meshes.length)results.push(...await controller.meshQuery('toolsQuery',{kind:'section',ids:meshes.map(n=>n.id),options:{plane:{normal:normal.clone().multiplyScalar(negative?-1:1).toArray(),offset:normal.dot(origin)*(negative?-1:1)}}}));
    const frame=new THREE.Matrix4().makeRotationFromQuaternion(q).setPosition(origin).toArray();for(const n of nodes.filter(n=>n.kind==='cad'))results.push(await controller.query('section',{nodeId:n.id,frame,side:negative?'negative':'positive',display:true,displayQuality:{deflection:.02,angleDegrees:8}}));
    if(active!==s||token!==generation||s.ticket!==ticket)return;if(!nodes.length)throw Error('Sichtbare Materialkörper auswählen.');view.setSectionDisplay(results);sectionState={revision:s.revision,results,config:{normal:normal.toArray(),offset:normal.dot(origin),side:negative?'negative':'positive',ids:nodes.map(n=>n.id)}};s.result=results;message('Gemeinsame Schnittansicht · '+fmt(results.reduce((sum,r)=>sum+r.clipVolume,0))+' mm³ verbleibend. Projekt und Export unverändert.');return;
   }
  }finally{if(active===s)s.busy=false;}
 }
 async function apply(){const s=valid();if(!s.preview||s.busy)throw Error('Zuerst eine gültige Vorschau berechnen.');const ids=s.ids,proposal=s.preview;await applyProposal(proposal);close();if(ids?.length)select(ids.map(rootId=>({rootId,path:[]})));toast('Netz-Werkzeug übernommen. Rückgängig stellt den vorherigen Projektstand wieder her.');}
 async function restoreSection(config){
  sectionState=null;view.clearSection();if(!config)return;const revision=controller.revision(),p=project(),nodes=p.nodes.filter(n=>config.ids.includes(n.id)&&cadPermanentlyVisible(n,p)),normal=new THREE.Vector3(...config.normal),origin=normal.clone().multiplyScalar(config.offset),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),normal),frame=new THREE.Matrix4().makeRotationFromQuaternion(q).setPosition(origin).toArray(),negative=config.side==='negative',meshes=nodes.filter(n=>n.kind==='mesh'&&n.meshRole!=='hole'),results=[];
  if(meshes.length)results.push(...await controller.meshQuery('toolsQuery',{kind:'section',ids:meshes.map(n=>n.id),options:{plane:{normal:normal.clone().multiplyScalar(negative?-1:1).toArray(),offset:config.offset*(negative?-1:1)}}}));
  for(const n of nodes.filter(n=>n.kind==='cad'&&n.solid))results.push(await controller.query('section',{nodeId:n.id,frame,side:config.side,display:true,displayQuality:{deflection:.02,angleDegrees:8}}));
  if(controller.revision()!==revision)throw Error('Projekt während der Schnittansicht geändert.');view.setSectionDisplay(results);sectionState={revision,results,config:structuredClone(config)};
 }
 function state(){return active?{kind:active.kind,id:active.id,revision:active.revision,busy:active.busy,hasPreview:!!active.preview,points:structuredClone(active.points),hit:structuredClone(active.hit),result:structuredClone(active.result??null)}:null;}
 return {open,close,state,preview,apply,restoreSection,clearSection:()=>{sectionState=null;view.clearSection();},revisionChanged:()=>{if(active&&active.revision!==controller.revision())close();if(sectionState&&sectionState.revision!==controller.revision()){view.clearSection();sectionState=null;}},selectionChanged:()=>{if(active&&JSON.stringify(getSelection())!==active.selection)close();},storedSection:()=>structuredClone(sectionState?.config??null),sectionState:()=>structuredClone(sectionState),dispose:()=>{close();panel.remove();}};
}
