import {meshProtectionRegions,validateMeshProtection} from './mesh-protection.js';
import {flags} from './organization.js';
import {createMeshSelectionService,meshSelectionGeometryDigest,validateMeshSelectionBinding} from './mesh-selection-data.js';
import {createMeshSelectionState} from './cad-mesh-selection-state.js';
import './cad-tools.css';
import './cad-mesh-selection.css';

const modes={triangle:'Einzelnes Dreieck',surface:'Zusammenhängende Oberfläche',component:'Ganzer zusammenhängender Bestandteil',boundary:'Öffnungsrand',brush:'Auswahlpinsel',lasso:'Lasso'};
const number=value=>Number(value).toLocaleString('de-DE');
const clone=value=>value==null?null:structuredClone(value);

/** Modeless selection and protection drafts. Selection belongs to workspace;
 * changed protection metadata is committed as one confirmed model operation. */
export function createCadMeshSelectionUI({getProject,getSelection,view,prepare=()=>{},onWorkspaceChange=()=>{},onProtectionCommit,onSessionChange=()=>{},toast=()=>{},service=createMeshSelectionService(),pick}={}){
 if(typeof getProject!=='function'||typeof getSelection!=='function'||!view?.canvas)throw Error('Die Netz-Flächenauswahl benötigt Projekt und gemeinsame Arbeitsfläche.');
 const panel=document.createElement('section');panel.id='cad-mesh-selection';panel.className='edge-tool-panel';panel.hidden=true;panel.setAttribute('aria-label','Flächen im Netz auswählen');view.canvas.parentElement.append(panel);
 const model=createMeshSelectionState(),tasks=new Set();let session=null,generation=0,checkTicket=0,pending=null,disposed=false,stroke=null,strokeOverlay=null;const protectionDigests=new WeakMap();
 const $=id=>panel.querySelector('#mesh-selection-'+id);
 const selectionKey=()=>JSON.stringify(getSelection());
 const nodeFor=id=>getProject().nodes.find(node=>node.id===id);
 const message=(text,warning=false)=>{if($('message')){$('message').textContent=text;$('message').classList.toggle('mesh-selection-warning',warning);}};
 function eligibility(node){
  if(!node||node.kind!=='mesh'||!node.mesh)return 'Ein fertiges Netzteil auswählen. CAD-Körper, Ansichtsvorlagen und gespeicherte Quellen haben hier keine auswählbaren Netzdreiecke.';
  const state=flags(node,getProject());
  if(state.locked)return 'Das Netzteil oder sein Layer/Ordner ist gesperrt. Zum Auswählen zuerst entsperren.';
  if(state.hidden||view.allows&&!view.allows(node.id))return 'Ein sichtbares Netzteil außerhalb ausgeblendeter Layer/Ordner auswählen.';
  return '';
 }
 function source(){
  const selected=getSelection();if(selected.length!==1||selected[0].path?.length)throw Error('Genau ein vollständiges Netzteil auswählen. Gespeicherte Quellen werden nicht verändert.');
  const node=nodeFor(selected[0].rootId),reason=eligibility(node);if(reason)throw Error(reason);return node;
 }
 const task=()=>{const signal=new AbortController();tasks.add(signal);return signal;};
 function finished(signal){tasks.delete(signal);if(pending===signal)pending=null;}
 const geometryDigest=(node,signal)=>service.geometryDigest?service.geometryDigest(node,{signal:signal?.signal}):meshSelectionGeometryDigest(node,{signal:signal?.signal});
 function abort(){endStroke();for(const signal of tasks)signal.abort();tasks.clear();pending=null;if(session){session.ticket++;session.busy=false;}}
 function protectionDraft(){return session&&model.state()?model.state().protections:meshProtectionRegions(nodeFor(session?.objectId));}
 function drawProtections(){
  const values=[];for(const node of getProject().nodes){if(node.kind!=='mesh'||eligibility(node))continue;
   const regions=session?.objectId===node.id&&model.state()?model.state().protections:meshProtectionRegions(node),digest=protectionDigests.get(node.mesh);
   const ids=[...new Set(regions.filter(r=>r.geometryDigest===digest&&r.triangleIds.every(id=>id<node.mesh.triangles.length/3)).flatMap(r=>r.triangleIds))].sort((a,b)=>a-b);
   if(ids.length)values.push({node,binding:{format:'FormnaroMeshSelection',version:1,objectId:node.id,geometryDigest:digest,triangleIds:ids,boundaryEdges:[]}});
  }view.setMeshProtection?.(values);
 }
 const escaped=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function draw(){
  drawProtections();
  const s=model.state(),value=session?s?.draft:model.snapshot(),node=value?nodeFor(value.objectId):null;
  view.setMeshSelection?.(value&&!eligibility(node)?value:null);
  if(!session)return;
  const triangles=s?.draft?.triangleIds.length??0,edges=s?.draft?.boundaryEdges.length??0;
  $('count').textContent=`${number(triangles)} Dreiecke · ${number(edges)} Randkanten ausgewählt`;
  $('apply').disabled=session.busy||!s;$('clear').disabled=session.busy||!s||!s.draft;
  $('undo').disabled=session.busy||!s?.canUndo;$('redo').disabled=session.busy||!s?.canRedo;
  for(const input of panel.querySelectorAll('select,input'))input.disabled=session.busy;
  $('angle-field').hidden=session.mode!=='surface';
  $('radius-field').hidden=session.mode!=='brush';
  const regions=s?.protections??[],selected=$('regions').value,digest=model.state()?.geometryDigest;
  $('regions').innerHTML=regions.map(r=>`<option value="${escaped(r.id)}">${escaped(r.name)} · ${number(r.triangleIds.length)} Dreiecke${r.geometryDigest!==digest||r.triangleIds.some(id=>id>=nodeFor(session.objectId).mesh.triangles.length/3)?' · UNGÜLTIG – neu auswählen':''}</option>`).join('');
  if(regions.some(r=>r.id===selected))$('regions').value=selected;
  $('protect').disabled=session.busy||!s?.draft?.triangleIds.length||regions.length>=32;
  $('unprotect').disabled=$('unprotect-all').disabled=$('recall').disabled=session.busy||!regions.length;
  $('protection-status').textContent=regions.some(r=>r.geometryDigest!==digest||r.triangleIds.some(id=>id>=nodeFor(session.objectId).mesh.triangles.length/3))?'Ungültige Schutzbereiche: Netzgeometrie geändert. Sie werden nicht als geschützte Flächen angezeigt. Entfernen und neu auswählen.':regions.length?'Türkis: Schutzvorschau. Übernehmen speichert Schutzbereiche mit Modell-Rückgängig.':'Noch keine Schutzbereiche. Bohrung oder Anlagefläche auswählen und benennen.';
  panel.setAttribute('aria-busy',String(session.busy));
 }
 function endStroke(){stroke=null;if(strokeOverlay)strokeOverlay.hidden=true;}
 function hide(){endStroke();panel.hidden=true;view.setInteraction?.(null);view.setDragInteraction?.(null);}
 function cancel(){
  const had=!!session;if(!had)return false;
  abort();generation++;checkTicket++;session=null;model.cancel();hide();draw();onSessionChange();return true;
 }
 function changed(){onWorkspaceChange();}
 async function sync(){
  if(disposed)return false;const ticket=++checkTicket,active=session;
  const committed=model.snapshot(),draft=model.state(),ids=[...new Set([committed?.objectId,draft?.objectId,...getProject().nodes.filter(n=>meshProtectionRegions(n).length).map(n=>n.id)].filter(Boolean))];
  if(!ids.length){draw();return true;}
  view.setMeshSelection?.(null);const signal=task();
  try{for(const id of ids){
   const node=nodeFor(id);let digest=null;
   try{if(node?.kind==='mesh'&&node.mesh){digest=await geometryDigest(node,signal);protectionDigests.set(node.mesh,digest);}}catch(error){if(error.name==='AbortError')return false;digest=null;}
   if(disposed||ticket!==checkTicket||session!==active||signal.signal.aborted)return false;
   const result=model.sourceChanged(id,digest);
   if(result.cleared||result.canceled){
    if(result.canceled&&session){abort();session=null;generation++;hide();onSessionChange();}
    if(result.cleared)changed();
    toast('Netz-Flächenauswahl verworfen: Die Netzgeometrie wurde geändert oder entfernt. Bereiche neu auswählen.');
   }
  }
  if(session){const reason=eligibility(nodeFor(session.objectId));if(reason){cancel();toast('Netz-Flächenauswahl beendet. '+reason);return false;}}
  draw();return true;}finally{finished(signal);}
 }
 async function restore(saved){
  const clean=saved==null?null:validateMeshSelectionBinding(saved);
  cancel();abort();checkTicket++;const owner=++generation;model.restore(null);view.setMeshSelection?.(null);
  if(!clean){draw();return null;}
  const signal=pending=task();
  try{
   const node=nodeFor(clean.objectId);if(!node||node.kind!=='mesh')throw Error('Die gespeicherte Netzquelle ist nicht mehr vorhanden.');
   const checked=service.validate?await service.validate(clean,node,{signal:signal.signal}):validateMeshSelectionBinding(clean,{node});
   if(disposed||owner!==generation)return null;
   // A different confirmed project may have arrived during worker validation.
   const current=nodeFor(clean.objectId);if(!current||await geometryDigest(current,signal)!==checked.geometryDigest)throw Error('Die Netzgeometrie wurde während des Öffnens geändert.');
   if(disposed||owner!==generation||signal.signal.aborted)return null;
   model.restore(checked);await sync();draw();return model.snapshot();
  }catch(error){
   if(owner===generation&&error.name!=='AbortError'){model.restore(null);draw();toast('Gespeicherte Netz-Flächenauswahl verworfen. '+error.message);}
   return null;
  }finally{finished(signal);}
 }
 function state(){
  if(!session)return null;const s=model.state(),draft=s?.draft??null;
  return {objectId:session.objectId,mode:session.mode,angleDegrees:session.angleDegrees,busy:session.busy,radius:session.radius,protections:clone(s?.protections??[]),triangleCount:draft?.triangleIds.length??0,boundaryCount:draft?.boundaryEdges.length??0,canUndo:s?.canUndo??false,canRedo:s?.canRedo??false,draft:clone(draft),committed:model.snapshot()};
 }
 function setMode(mode){
  if(!session)return;if(!Object.hasOwn(modes,mode))throw Error('Unbekannte Netz-Auswahlart.');
  abort();view.setDragInteraction?.(null);session.mode=mode;$('mode').value=mode;installInteraction();draw();
  message(mode==='brush'?'Mit gedrückter linker Maustaste malen. Radius in Bildpunkten; sichtbar getroffene Flächen und sichtbare Dreiecksmittelpunkte werden markiert. Umschalt fügt hinzu, Strg entfernt.':mode==='lasso'?'Mit gedrückter linker Maustaste eine Kontur ziehen. Sichtbare Dreiecksmittelpunkte innerhalb der Kontur werden markiert (bei Überschneidungen nach Gerade/Ungerade-Regel).':mode==='boundary'?'Ein Dreieck direkt an einem Öffnungsrand anklicken. Mehrdeutige oder verzweigte Ränder werden nicht geraten.':mode==='surface'?'Eine Oberfläche anklicken. Sie wächst über gemeinsame Kanten bis zum eingestellten Nachbarwinkel.':mode==='component'?'Ein Dreieck anklicken, um seinen ganzen kantenverbundenen Bestandteil auszuwählen.':'Ein sichtbares Dreieck anklicken.');
 }
 function setAngle(value){
  if(!session)return;const angle=Number(value);if(!Number.isFinite(angle)||angle<0||angle>180)throw Error('Der Nachbarwinkel muss zwischen 0 und 180 Grad liegen.');
  abort();session.angleDegrees=angle;$('angle').value=String(angle);draw();message('Nachbarwinkel geändert. Er gilt für den nächsten Oberflächenklick.');
 }
 function clear(){if(!session)return false;abort();model.clear();draw();message('Auswahlvorschau geleert. Übernehmen speichert die leere Auswahl; Abbrechen stellt die vorherige Auswahl wieder her.');return true;}
 function undo(){if(!session)return false;abort();model.undo();draw();message('Letzten Auswahlschritt zurückgenommen. Die Modellhistorie bleibt unverändert.');return true;}
 function redo(){if(!session)return false;abort();model.redo();draw();message('Auswahlschritt wiederhergestellt. Die Modellhistorie bleibt unverändert.');return true;}
 async function handlePick(hit,event={},ray){
  const active=session;if(!active)return false;if(['brush','lasso'].includes(active.mode))return true;
  if(event.button!=null&&event.button!==0)return true;
  const reason=eligibility(nodeFor(active.objectId));if(reason){message(reason,true);return true;}
  if(event.shiftKey&&(event.ctrlKey||event.metaKey)){message('Umschalt fügt hinzu; Strg oder ⌘ entfernt. Bitte jeweils nur eine dieser Tasten verwenden.',true);return true;}
  const node=nodeFor(active.objectId),rootId=hit?.object?.userData?.rootId??hit?.objectId;
  if(rootId!==active.objectId){message('Eine sichtbare Fläche des gewählten Netzteils anklicken.',true);return true;}
  const pickTicket=active.pickTicket=(active.pickTicket??0)+1;
  const exact=pick?await pick({ray,hit,node,event}):view.meshSelectionHit?view.meshSelectionHit(ray,hit,node):{triangleIndex:hit.triangleIndex??hit.faceIndex,point:hit.point?.toArray?.()??hit.point};
  if(session!==active||active.pickTicket!==pickTicket)return true;
  if(!exact||!Number.isSafeInteger(exact.triangleIndex)){message('Keine auswählbare Fläche des gewählten Netzteils getroffen.',true);return true;}
  abort();const ticket=active.ticket,owner=++generation,signal=pending=task();active.busy=true;draw();message('Zusammenhang des Netzes wird geprüft …');
  try{
   const point=exact.point?.toArray?.()??exact.point;
   const result=await service.query(node,{mode:active.mode,triangleIndex:exact.triangleIndex,angleDegrees:active.angleDegrees,...(point?{point}:{})},{signal:signal.signal});
   if(disposed||session!==active||active.ticket!==ticket||generation!==owner)return true;
   if(selectionKey()!==active.selection){cancel();return true;}
   const latest=nodeFor(active.objectId);if(eligibility(latest))throw Error(eligibility(latest));
   const digest=await geometryDigest(latest,signal);
   if(disposed||session!==active||active.ticket!==ticket||generation!==owner)return true;
   if(digest!==result.geometryDigest){await sync();return true;}
   model.update(result,event.ctrlKey||event.metaKey?'subtract':event.shiftKey?'add':'replace');draw();
   const warnings=result.warnings??[];
   message(warnings.length?warnings.join(' '):'Auswahlvorschau bereit. Übernehmen speichert nur die Auswahl. Das Modell bleibt unverändert.',!!warnings.length);
  }catch(error){if(session===active&&active.ticket===ticket&&generation===owner&&error.name!=='AbortError')message(error.message,true);}
  finally{finished(signal);if(session===active&&active.ticket===ticket){active.busy=false;draw();}}
  return true;
 }
 function setRadius(value){if(!session)return;const radius=Number(value);if(!Number.isFinite(radius)||radius<2||radius>150)throw Error('Pinselradius: 2 bis 150 Bildpunkte.');abort();session.radius=radius;$('radius').value=String(radius);draw();}
 function localPoint(event){const r=view.canvas.getBoundingClientRect();return [Math.max(0,Math.min(r.width,event.clientX-r.left)),Math.max(0,Math.min(r.height,event.clientY-r.top))];}
 function strokeDraw(){if(!stroke)return;if(!strokeOverlay){strokeOverlay=document.createElement('div');strokeOverlay.className='mesh-selection-stroke';view.canvas.parentElement.append(strokeOverlay);}const r=view.canvas.getBoundingClientRect();strokeOverlay.hidden=false;strokeOverlay.style.cssText=`left:${view.canvas.offsetLeft}px;top:${view.canvas.offsetTop}px;width:${r.width}px;height:${r.height}px`;const last=stroke.path.at(-1),points=stroke.path.map(p=>p.join(',')).join(' ');strokeOverlay.innerHTML=`<svg width="100%" height="100%" viewBox="0 0 ${r.width} ${r.height}"><polyline points="${points}" fill="${stroke.mode==='lasso'?'#ffc24722':'none'}" stroke="#e29400" stroke-width="2"/>${stroke.mode==='brush'?`<circle cx="${last[0]}" cy="${last[1]}" r="${session.radius}" fill="#ffc24722" stroke="#e29400" stroke-width="2"/>`:''}</svg>`;}
 function strokePoint(event){if(!stroke)return;const p=localPoint(event);if(Math.hypot(p[0]-stroke.path.at(-1)[0],p[1]-stroke.path.at(-1)[1])<2)return;if(stroke.path.length>=2048){endStroke();message('Der Strich ist zu lang. Kürzere Striche verwenden.',true);return;}stroke.path.push(p);strokeDraw();}
 async function finishStroke(event){
  strokePoint(event);const input=stroke,active=session;endStroke();if(!input||!active)return;
  if(view.meshSelectionCameraKey?.()!==input.cameraKey){message('Ansicht während des Strichs geändert. Auswahl erneut zeichnen.',true);return;}
  abort();const ticket=active.ticket,owner=++generation,signal=pending=task();active.busy=true;draw();message('Sichtbare Netzflächen werden ausgewählt …');
  try{const node=nodeFor(active.objectId),result=await service.screen(node,{mode:input.mode,path:input.path,radius:active.radius,context:input.context},{signal:signal.signal});
   if(disposed||session!==active||ticket!==active.ticket||generation!==owner||signal.signal.aborted)return;
   const latest=source();if(latest.id!==node.id||JSON.stringify(latest.transform)!==JSON.stringify(node.transform)||await geometryDigest(latest,signal)!==result.geometryDigest){await sync();return;}
   if(session!==active||ticket!==active.ticket||signal.signal.aborted)return;
   model.update(result,input.operation);draw();message('Strich als ein Auswahlschritt bereit. Gelb: Auswahl. Türkis: Schutzbereiche.');
  }catch(error){if(session===active&&ticket===active.ticket&&error.name!=='AbortError')message(error.message,true);}
  finally{finished(signal);if(session===active&&ticket===active.ticket){active.busy=false;draw();}}
 }
 function installInteraction(){
  if(!session)return;
  if(!['brush','lasso'].includes(session.mode)){view.setInteraction?.((ray,event,hit)=>handlePick(hit,event,ray));return;}
  view.setInteraction?.(()=>true);view.setDragInteraction?.({start:({event})=>{
   if(!session||session.busy||event.button!==0)return false;
   if(event.shiftKey&&(event.ctrlKey||event.metaKey)){message('Bitte nur Umschalt oder Strg zum Verknüpfen verwenden.',true);return true;}
   try{const node=source();stroke={mode:session.mode,path:[localPoint(event)],operation:event.ctrlKey||event.metaKey?'subtract':event.shiftKey?'add':'replace',cameraKey:view.meshSelectionCameraKey?.(),context:view.meshSelectionScreenContext(node)};strokeDraw();return true;}catch(error){endStroke();message(error.message,true);return true;}
  },move:({event})=>strokePoint(event),end:({event})=>finishStroke(event),cancel:()=>{endStroke();if(session)queueMicrotask(()=>{if(session)installInteraction();});}});
 }
 function protect(){
  if(!session||session.busy)return;const draft=model.state()?.draft;if(!draft?.triangleIds.length)throw Error('Zuerst Dreiecke der Bohrung oder Anlagefläche auswählen. Ein Öffnungsrand allein schützt keine Fläche.');
  const purpose=$('purpose').value||'custom',name=$('name').value.trim()||({bore:'Bohrung',contact:'Anlagefläche',custom:'Schutzbereich'}[purpose]);
  const regions=validateMeshProtection({format:'FormnaroMeshProtection',version:1,regions:[...protectionDraft(),{id:crypto.randomUUID(),name,purpose,geometryDigest:draft.geometryDigest,triangleIds:draft.triangleIds}]}).regions;
  model.setProtections(regions);draw();$('regions').value=regions.at(-1).id;message('Schutzbereich als Vorschau ergänzt. Übernehmen speichert; Abbrechen verwirft ihn.');
 }
 function unprotect(all=false){if(!session||session.busy)return;model.setProtections(all?[]:protectionDraft().filter(r=>r.id!==$('regions').value));draw();message('Schutz in der Vorschau entfernt. Erst Übernehmen gibt die Geometrie wieder frei.');}
 function recall(){if(!session||session.busy)return;const region=protectionDraft().find(r=>r.id===$('regions').value);if(!region)return;if(region.geometryDigest!==model.state().geometryDigest||region.triangleIds.some(id=>id>=nodeFor(session.objectId).mesh.triangles.length/3))throw Error('Dieser Schutzbereich ist ungültig. Flächen neu auswählen.');model.update({format:'FormnaroMeshSelection',version:1,objectId:session.objectId,geometryDigest:region.geometryDigest,triangleIds:region.triangleIds,boundaryEdges:[]});draw();}
 async function apply(){
  if(!session||session.busy)return false;
  const active=session;if(!await sync()||session!==active)return false;
  const draft=model.state()?.draft,signal=pending=task(),ticket=active.ticket;active.busy=true;draw();
  try{
   if(draft){if(service.validate)await service.validate(draft,nodeFor(active.objectId),{signal:signal.signal});else validateMeshSelectionBinding(draft,{node:nodeFor(active.objectId)});}
   if(session!==active||active.ticket!==ticket||signal.signal.aborted)return false;
   const current=nodeFor(active.objectId);if(eligibility(current)){await sync();return false;}const digest=await geometryDigest(current,signal);
   if(session!==active||active.ticket!==ticket||signal.signal.aborted)return false;
   if(digest!==model.state().geometryDigest){await sync();return false;}
   const protectionState=model.state(),regions=protectionState.protections;
   if(JSON.stringify(regions)!==JSON.stringify(meshProtectionRegions(current))){
    if(!onProtectionCommit)throw Error('Schutzbereiche können in dieser Arbeitsfläche nicht gespeichert werden.');
    active.committing=true;
    try{await onProtectionCommit({objectId:active.objectId,geometryDigest:digest,regions:clone(regions),signal:signal.signal,current:()=>session===active&&active.ticket===ticket&&!signal.signal.aborted});}finally{active.committing=false;}
    if(session!==active||active.ticket!==ticket||signal.signal.aborted)return false;
   }
   const result=model.commit();abort();session=null;generation++;checkTicket++;hide();draw();onSessionChange();if(result.changed)changed();toast(result.protectionChanged?'Netz-Schutzbereiche und Auswahl übernommen. Schutzbereiche lassen sich mit Modell-Rückgängig wiederherstellen.':result.selection?'Netz-Flächenauswahl übernommen. Die Geometrie bleibt unverändert.':'Netz-Flächenauswahl geleert.');return result.selection;
  }catch(error){if(session===active&&active.ticket===ticket&&error.name!=='AbortError')message(error.message,true);return false;}
  finally{finished(signal);if(session===active&&active.ticket===ticket){active.busy=false;draw();}}
 }
 async function open(){
  prepare();cancel();const node=source(),owner=++generation;
  session={objectId:node.id,selection:selectionKey(),mode:'triangle',angleDegrees:30,radius:24,busy:true,ticket:0};
  panel.innerHTML='<div class="mesh-selection-heading"><strong>Flächen im Netz auswählen</strong><button id="mesh-selection-close" type="button" aria-label="Flächenauswahl abbrechen">×</button></div><p id="mesh-selection-source" data-no-translate></p><label>Auswahlart<select id="mesh-selection-mode"><option value="triangle">Einzelnes Dreieck</option><option value="surface">Zusammenhängende Oberfläche</option><option value="component">Ganzer zusammenhängender Bestandteil</option><option value="boundary">Öffnungsrand</option><option value="brush">Auswahlpinsel</option><option value="lasso">Lasso</option></select></label><label id="mesh-selection-angle-field" hidden>Maximaler Nachbarwinkel (°)<input id="mesh-selection-angle" type="number" min="0" max="180" step="1" value="30"></label><label id="mesh-selection-radius-field" hidden>Pinselradius (Bildpunkte)<input id="mesh-selection-radius" type="number" min="2" max="150" step="1" value="24"></label><p class="small-note">Klick oder Ziehen ersetzt die Auswahl. Umschalt fügt hinzu, Strg (⌘) entfernt. Rechts ziehen dreht die Ansicht.</p><p class="small-note">Gelb: Auswahl · Türkis: Schutzbereich. Pinsel und Lasso wählen sichtbare Flächen.</p><p id="mesh-selection-count" class="mesh-selection-count" role="status"></p><div class="mesh-selection-history"><button id="mesh-selection-undo" type="button">Auswahl rückgängig</button><button id="mesh-selection-redo" type="button">Wiederholen</button></div><p id="mesh-selection-message" role="status"></p><details id="mesh-selection-protection-panel" open><summary>Schutzbereiche · Bohrungen und Anlageflächen</summary><label>Art<select id="mesh-selection-purpose"><option value="bore">Bohrung</option><option value="contact">Anlagefläche</option><option value="custom">Eigener Bereich</option></select></label><label>Name<input id="mesh-selection-name" maxlength="100" placeholder="z. B. Schraubenbohrung M4"></label><button id="mesh-selection-protect" type="button">Ausgewählte Flächen schützen</button><label>Gespeicherte / vorgemerkte Bereiche<select id="mesh-selection-regions"></select></label><div class="mesh-selection-history"><button id="mesh-selection-recall" type="button">Bereich auswählen</button><button id="mesh-selection-unprotect" type="button">Schutz entfernen</button><button id="mesh-selection-unprotect-all" type="button">Alle Schutzbereiche entfernen</button></div><p id="mesh-selection-protection-status" class="small-note" role="status"></p><p class="small-note">Schutz betrifft die Netzgeometrie. Vereinfachen erhält geschützte Dreiecke exakt. Andere Geometriewerkzeuge werden bei Schutzbereichen blockiert. Lage und Farbe bleiben einstellbar. Bohrungen werden manuell markiert; es findet keine automatische Erkennung statt.</p></details><p class="small-note">Die Auswahl wird im Arbeitsplatz, Schutzbereiche werden im Modell gespeichert. Es werden keine Flächen gelöscht, repariert oder umgewandelt. Abbrechen oder Escape stellt die vorherige Auswahl wieder her.</p><div class="edge-actions"><button id="mesh-selection-clear" type="button">Auswahl leeren</button><button id="mesh-selection-apply" type="button" class="primary">Übernehmen</button><button id="mesh-selection-cancel" type="button">Abbrechen</button></div>';
  $('source').textContent=node.name;panel.hidden=false;onSessionChange();
  const run=fn=>Promise.resolve().then(fn).catch(error=>message(error.message,true));
  $('mode').onchange=()=>run(()=>setMode($('mode').value));$('angle').onchange=()=>run(()=>setAngle($('angle').value));
  $('radius').onchange=()=>run(()=>setRadius($('radius').value));$('protect').onclick=()=>run(protect);$('unprotect').onclick=()=>unprotect();$('unprotect-all').onclick=()=>unprotect(true);$('recall').onclick=()=>run(recall);
  $('clear').onclick=clear;$('undo').onclick=undo;$('redo').onclick=redo;$('apply').onclick=()=>run(apply);$('cancel').onclick=$('close').onclick=cancel;
  draw();message('Netzquelle wird geprüft …');
  const signal=task();
  try{
   const digest=await geometryDigest(node,signal);protectionDigests.set(node.mesh,digest);
   if(disposed||!session||owner!==generation)return false;
   const latest=source();if(latest.id!==node.id||await geometryDigest(latest,signal)!==digest){cancel();return false;}
   if(disposed||!session||owner!==generation||signal.signal.aborted)return false;
   if(selectionKey()!==session.selection){cancel();return false;}
   const stale=model.sourceChanged(node.id,digest);if(stale.cleared){changed();toast('Vorherige Flächenauswahl verworfen: Die Netzgeometrie wurde geändert.');}protectionDigests.set(node.mesh,digest);model.begin({objectId:node.id,geometryDigest:digest,protections:meshProtectionRegions(node)});session.busy=false;
   draw();setMode('triangle');return state();
  }catch(error){if(owner===generation){cancel();if(error.name!=='AbortError')throw error;}return false;}
  finally{finished(signal);}
 }
 panel.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();cancel();return;}const key=event.key.toLowerCase();if((event.ctrlKey||event.metaKey)&&['z','y'].includes(key)){event.preventDefault();if(key==='y'||event.shiftKey)redo();else undo();}});
 return {open,close:cancel,cancel,escape:cancel,apply,clear,undo,redo,setMode,setAngle,setRadius,protect,unprotect,recall,handlePick,state,isChecking:()=>tasks.size>0,snapshot:()=>model.snapshot(),restore,sync,revisionChanged(){if(session?.committing)return;abort();void sync();},selectionChanged(){if(session&&session.selection!==selectionKey())cancel();},dispose(){cancel();disposed=true;checkTicket++;service.dispose?.();strokeOverlay?.remove();panel.remove();}};
}
