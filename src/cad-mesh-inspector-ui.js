import {flags} from './organization.js';
import {createMeshSelectionService} from './mesh-selection-data.js';
import {MESH_INSPECTION_CATEGORIES} from './mesh-inspector.js';
import {meshInspectionFindingPoints} from './cad-mesh-inspector-rendering.js';
import './cad-mesh-inspector.css';
const number=n=>Number(n).toLocaleString('de-DE');

/** Ephemeral diagnosis only: no project, protection, selection or Undo writes. */
export function createCadMeshInspectorUI({getProject,getSelection,view,prepare=()=>{},toast=()=>{},service=createMeshSelectionService()}={}){
 const panel=document.createElement('section');panel.id='cad-mesh-inspector';panel.className='edge-tool-panel';panel.hidden=true;panel.setAttribute('aria-label','Netzinspektor');view.canvas.parentElement.append(panel);
 let session=null,sequence=0,disposed=false;const tasks=new Set(),$=id=>panel.querySelector('#mesh-inspector-'+id),node=()=>getProject().nodes.find(n=>n.id===session?.objectId);
 const message=(text,warning=false)=>{if($('status')){$('status').textContent=text;$('status').classList.toggle('mesh-inspector-warning',warning);}};
 const selected=()=>JSON.stringify(getSelection());
 function eligible(n){return n?.kind==='mesh'&&!flags(n,getProject()).hidden&&(!view.allows||view.allows(n.id));}
 function clear(){view.setMeshInspection?.(null);}
 function cancel(){const had=!!session;sequence++;for(const c of tasks)c.abort();tasks.clear();service.cancel?.();session=null;clear();panel.hidden=true;return had;}
 function draw(){
  if(!session)return;const s=session,n=node(),r=s.result;
  $('calculate').disabled=s.busy;$('threshold').disabled=s.busy;$('through').disabled=s.busy;
  $('close').textContent=s.busy?'Abbrechen':'Schließen';panel.setAttribute('aria-busy',String(s.busy));
  $('summary').textContent=r?`${number(r.triangles)} Dreiecke · ${number(r.vertices)} gespeicherte Punkte · ${number(r.componentCount)} kantenverbundene Bestandteile · geprüfte Nebenbestandteil-Grenze: ${number(r.smallTriangleLimit)}`:'Noch keine Diagnose.';
  for(const [kind]of Object.entries(MESH_INSPECTION_CATEGORIES)){$('count-'+kind).textContent=r?number(r.categories[kind].count):'—';$('show-'+kind).disabled=s.busy||!r||!r.categories[kind].count;}
  const kinds=r?Object.keys(MESH_INSPECTION_CATEGORIES).filter(k=>r.categories[k].count):[],old=$('focus-kind').value;
  $('focus-kind').innerHTML=kinds.map(k=>`<option value="${k}">${MESH_INSPECTION_CATEGORIES[k].label}</option>`).join('');if(kinds.includes(old))$('focus-kind').value=old;
  $('next').disabled=$('previous').disabled=$('focus-kind').disabled=s.busy||!kinds.length;
  const c=r?.categories[$('focus-kind').value];$('finding').textContent=c?`Fundstelle ${number((s.focusIndex??0)+1)} von ${number(c.count)}`:'';
  if(!r||s.busy||!eligible(n)){clear();return;}
  try{view.setMeshInspection?.(r,{enabled:[...s.enabled],through:s.through});}catch(error){clear();message(error.message,true);}
  if(view.meshInspectionAvailable?.(n.id)===false)message('Die Diagnose gehört zum vollständigen Netz. Für sichtbare Markierungen Schnittansicht oder Quellenvorschau beenden.',true);
 }
 async function calculate(){
  const s=session;if(!s)return false;const threshold=Number($('threshold').value);if(!Number.isSafeInteger(threshold)||threshold<0||threshold>500000){message('Grenze für Nebenbestandteile: 0 bis 500.000 Dreiecke.',true);return false;}
  for(const c of tasks)c.abort();tasks.clear();const ticket=++sequence,c=new AbortController();tasks.add(c);s.busy=true;s.result=null;clear();draw();message('Originales Netz wird auf topologische Auffälligkeiten geprüft …');
  try{const input=node();if(!eligible(input))throw Error('Ein sichtbares vollständiges Netzteil auswählen.');const result=await service.inspect(input,{smallTriangleLimit:threshold},{signal:c.signal});
   if(disposed||session!==s||ticket!==sequence||c.signal.aborted)return false;
   const current=node(),digest=await service.geometryDigest(current,{signal:c.signal});
   if(session!==s||ticket!==sequence||c.signal.aborted)return false;
   if(!eligible(current)||digest!==result.geometryDigest){cancel();toast('Netzdiagnose verworfen: Die Netzgeometrie wurde geändert oder entfernt. Erneut prüfen.');return false;}
   s.result=result;s.focusIndex=0;message(Object.values(result.categories).some(v=>v.count)?'Auffälligkeiten gefunden. Kategorien einblenden und Fundstellen ansehen. Offene Ränder können beabsichtigt sein.':'Keine Auffälligkeit in den geprüften Topologiekategorien. Dies ist kein Nachweis eines gültigen Materialkörpers.');return true;
  }catch(error){if(session===s&&ticket===sequence&&error.name!=='AbortError')message(error.message,true);return false;}
  finally{tasks.delete(c);if(session===s&&ticket===sequence){s.busy=false;draw();}}
 }
 function focus(step=0){if(!session?.result||session.busy)return false;const kind=$('focus-kind').value,c=session.result.categories[kind];if(!c?.count)return false;session.focusIndex=((session.focusIndex??0)+step+c.count)%c.count;const points=meshInspectionFindingPoints(session.result,node(),kind,session.focusIndex);if(points.length)view.focusWorldPoints?.(points);draw();return points.length>0;}
 function open(){
  prepare();cancel();const targets=getSelection(),p=getProject(),n=targets.length===1&&!targets[0].path.length?p.nodes.find(n=>n.id===targets[0].rootId):null;
  if(!eligible(n))throw Error('Für den Netzinspektor genau ein sichtbares vollständiges Netzteil auswählen. CAD-Körper, Ansichtsvorlagen und gespeicherte Quellen sind keine Netzteile.');
  session={objectId:n.id,selection:selected(),result:null,busy:false,enabled:new Set(Object.keys(MESH_INSPECTION_CATEGORIES)),through:false,focusIndex:0};
  panel.innerHTML='<div class="mesh-inspector-heading"><strong>Netzinspektor</strong><button id="mesh-inspector-x" aria-label="Netzinspektor schließen">×</button></div><p id="mesh-inspector-name"></p><p class="small-note">Reine Diagnose. Das Netz wird weder repariert noch verändert. Auch gesperrte Netzteile können geprüft werden.</p><label>Kleine Nebenbestandteile: höchstens so viele Dreiecke<input id="mesh-inspector-threshold" type="number" min="0" max="500000" step="1" value="20"></label><p class="small-note">Der größte kantenverbundene Bestandteil bleibt Hauptbestandteil. Bei Gleichstand gilt der mit der ersten ursprünglichen Dreiecksnummer. 0 schaltet die Nebenbestandteil-Markierung aus.</p><p id="mesh-inspector-summary" role="status"></p><div class="mesh-inspector-categories">'+Object.entries(MESH_INSPECTION_CATEGORIES).map(([kind,info])=>`<label><input id="mesh-inspector-show-${kind}" type="checkbox" checked><span class="mesh-inspector-swatch" style="background:${info.color}"></span><span>${info.label}</span><strong id="mesh-inspector-count-${kind}">—</strong></label>`).join('')+'</div><label><input id="mesh-inspector-through" type="checkbox"> Markierungen durch das Bauteil zeigen</label><label>Fundstellen ansehen<select id="mesh-inspector-focus-kind"></select></label><div class="mesh-inspector-navigation"><button id="mesh-inspector-previous">Vorherige</button><button id="mesh-inspector-next">Nächste Fundstelle</button></div><p id="mesh-inspector-finding"></p><p id="mesh-inspector-status" role="status"></p><details><summary>Was wird geprüft?</summary><p>Exakt gleiche Koordinaten gelten für diese Topologieprüfung als derselbe Punkt. Gespeicherte Punkte und Dreiecksnummern bleiben erhalten. Doppelte Dreiecke: alle betroffenen Flächen, unabhängig von ihrer Richtung. Entartet: kein eindeutiger Flächeninhalt. Problematische Kanten: mehr als zwei angrenzende Dreiecke. Problematische Punkte: mehrere getrennte Flächenfächer. Bei bereits fehlerhaften Nachbarflächen werden zusätzliche Punktmeldungen unterdrückt.</p><p>Richtung: widersprüchliche Nachbarrichtung an gemeinsamen Kanten. Keine Prüfung auf Selbstüberschneidungen, konsistent nach innen gerichtete Hüllen, Wandstärken oder Druckbarkeit. Kein Körpernachweis; absichtliche Öffnungen und getrennte Teile bleiben erhalten.</p><p>Bis 500.000 Dreiecke und 1.000.000 gespeicherte Punkte je Netz. Ergebnisse und Markierungen sind vorübergehend; nach Öffnen einer Datei erneut berechnen.</p></details><div class="edge-actions"><button id="mesh-inspector-calculate">Neu prüfen</button><button id="mesh-inspector-close" class="primary">Schließen</button></div>';
  $('name').textContent=n.name;panel.hidden=false;
  $('calculate').onclick=()=>void calculate();$('close').onclick=$('x').onclick=cancel;
  for(const kind of Object.keys(MESH_INSPECTION_CATEGORIES))$('show-'+kind).onchange=()=>{if(!session)return;if($('show-'+kind).checked)session.enabled.add(kind);else session.enabled.delete(kind);draw();};
  $('through').onchange=()=>{if(session){session.through=$('through').checked;draw();}};
  $('focus-kind').onchange=()=>{if(session){session.focusIndex=0;focus();}};$('next').onclick=()=>focus(1);$('previous').onclick=()=>focus(-1);
  return calculate();
 }
 async function sync(){
  const s=session;if(!s)return;const n=node();if(!eligible(n)){cancel();return;}
  if(s.busy)return;
  if(!s.result)return;const ticket=++sequence,c=new AbortController();tasks.add(c);clear();
  try{const digest=await service.geometryDigest(n,{signal:c.signal});if(session!==s||ticket!==sequence||c.signal.aborted)return;if(digest!==s.result.geometryDigest){cancel();toast('Netzdiagnose verworfen: Die Netzgeometrie wurde geändert. Erneut prüfen.');return;}draw();}catch(error){if(error.name!=='AbortError'&&session===s){cancel();toast(error.message);}}finally{tasks.delete(c);}
 }
 panel.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();cancel();}});
 return {open,cancel,close:cancel,sync,calculate,focus,state:()=>session?{objectId:session.objectId,busy:session.busy,result:session.result?structuredClone(session.result):null,enabled:[...session.enabled],through:session.through,focusIndex:session.focusIndex}:null,
  revisionChanged(){clear();if(session?.busy){cancel();toast('Netzdiagnose nach einer Projektänderung abgebrochen. Erneut prüfen.');}else void sync();},selectionChanged(){if(session&&session.selection!==selected())cancel();},dispose(){cancel();disposed=true;service.dispose?.();panel.remove();}};
}
