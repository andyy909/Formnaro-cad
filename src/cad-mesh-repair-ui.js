import {flags} from './organization.js';
import {meshProtectionRegions} from './mesh-protection.js';
import {createMeshSelectionService} from './mesh-selection-data.js';
import {MESH_INSPECTION_CATEGORIES} from './mesh-inspector.js';
import './cad-mesh-repair.css';
const number=n=>Number(n).toLocaleString('de-DE');
export function createCadMeshRepairUI({controller,view,getSelection,select=()=>{},prepare=()=>{},showPreview,clearPreview=()=>{},applyProposal,toast=()=>{},service=createMeshSelectionService()}={}){
 const panel=document.createElement('section');panel.id='cad-mesh-repair';panel.className='edge-tool-panel';panel.hidden=true;panel.setAttribute('aria-label','Netz gezielt reparieren');view.canvas.parentElement.append(panel);
 let active=null;const $=id=>panel.querySelector('#mesh-repair-'+id),key=()=>JSON.stringify(getSelection()),node=()=>controller.readSnapshot().nodes.find(n=>n.id===active?.id);
 const message=text=>{if($('status'))$('status').textContent=text;};
 const current=(s,ticket)=>active===s&&s.ticket===ticket&&s.revision===controller.revision()&&s.selection===key();
 function controls(){if(!active)return;const s=active;for(const e of panel.querySelectorAll('input,select'))e.disabled=s.busy||!!s.blocked;for(const e of panel.querySelectorAll('[data-part-locked]'))e.disabled=true;for(const e of panel.querySelectorAll('[data-focus-part]'))e.disabled=s.busy;
  $('preview').disabled=s.busy||!!s.blocked||!s.catalog;$('apply').disabled=s.busy||!s.proposal;$('compare').disabled=s.busy||!s.proposal;
  $('page-before').disabled=s.busy||!s.catalog||s.catalog.offset===0;$('page-after').disabled=s.busy||!s.catalog||s.catalog.offset+128>=s.catalog.total;
  $('chosen').textContent=`${number(s.parts.size)} Nebenbestandteile ausdrücklich zum Entfernen ausgewählt (höchstens 256).`;
 }
 function discard(){const s=active;if(!s)return;++s.ticket;s.abort?.abort();s.abort=null;if(s.phase==='preview')controller.cancel();s.busy=false;s.phase=null;if(s.proposal){controller.discard(s.proposal.previewId);clearPreview(s.proposal.previewId);}s.proposal=null;controls();}
 function close(){const had=!!active;discard();active=null;service.cancel?.();panel.hidden=true;return had;}
 function changed(){discard();$('result').textContent='';message('Reparaturschritte geändert. Vorschau erneut berechnen.');}
 function focusPart(part){const s=active,n=node();if(!s||!n||s.busy)return;const points=[];for(let i=0;i<8;i++){const p=[0,1,2].map(k=>i&(1<<k)?part.bounds.max[k]:part.bounds.min[k]),m=n.transform;points.push([0,1,2].map(k=>m[k]*p[0]+m[4+k]*p[1]+m[8+k]*p[2]+m[12+k]));}view.focusWorldPoints?.(points);}
 async function loadCatalog(offset=0){
  const s=active;if(!s||s.blocked)return false;discard();const ticket=s.ticket,limit=Number($('limit').value);
  if(!Number.isSafeInteger(limit)||limit<0||limit>500000){s.catalog=null;controls();message('Grenze für Nebenbestandteile: 0 bis 500.000 Dreiecke.');return false;}
  s.busy=true;s.phase='catalog';s.abort=new AbortController();controls();message('Nebenbestandteile werden am unveränderten Original ermittelt …');
  try{const catalog=await service.repairCatalog(node(),{smallTriangleLimit:limit,offset},{signal:s.abort.signal});if(!current(s,ticket))return false;s.catalog=catalog;
   $('parts').innerHTML=catalog.components.map(c=>`<div class="mesh-repair-part"><label><input type="checkbox" data-part="${c.id}" ${s.parts.has(c.id)?'checked':''} ${c.touchesOther?'disabled data-part-locked="1"':''}>Ab Originaldreieck ${number(c.id+1)} · ${number(c.triangleCount)} Dreiecke${c.touchesOther?' · Punktkontakt, bleibt erhalten':''}</label><button data-focus-part="${c.id}" aria-label="Bestandteil ab Dreieck ${c.id+1} ansehen">Ansehen</button></div>`).join('')||'<p>Keine passenden kleinen Nebenbestandteile auf dieser Seite.</p>';
   $('page').textContent=catalog.total?`${number(catalog.offset+1)}–${number(Math.min(catalog.offset+128,catalog.total))} von ${number(catalog.total)} kleinen Nebenbestandteilen`:'Keine kleinen Nebenbestandteile.';
   for(const e of panel.querySelectorAll('[data-part]'))e.onchange=()=>{if(active!==s)return;const id=Number(e.dataset.part);if(e.checked){if(s.parts.size>=256){e.checked=false;message('Höchstens 256 Nebenbestandteile je Reparatur auswählen.');return;}s.parts.add(id);}else s.parts.delete(id);changed();};
   for(const e of panel.querySelectorAll('[data-focus-part]'))e.onclick=()=>focusPart(catalog.components.find(c=>c.id===Number(e.dataset.focusPart)));
   message('Reparaturschritte wählen. Kleine Teile bleiben ohne ausdrückliche Auswahl erhalten.');return true;
  }catch(error){if(current(s,ticket)&&error.name!=='AbortError'){s.catalog=null;message(error.message);}return false;}
  finally{if(current(s,ticket)){s.busy=false;s.phase=null;s.abort=null;controls();}}
 }
 async function preview(){
  const s=active;if(!s||s.busy||s.blocked||!s.catalog)return false;discard();const ticket=s.ticket;s.busy=true;s.phase='preview';controls();message('Gezielte Reparatur wird als Vorschau berechnet …');let proposal;
  try{const options={method:'simple-v1',geometryDigest:s.catalog.geometryDigest,removeDegenerate:$('degenerate').checked,removeDuplicates:$('duplicates').checked,orient:$('orient').checked,smallTriangleLimit:s.catalog.smallTriangleLimit,removeComponents:[...s.parts]};
   proposal=await controller.preview({type:'mesh-simple-repair',id:s.id,options},{revision:s.revision,label:'Netz gezielt reparieren'});
   if(!current(s,ticket)){controller.discard(proposal.previewId);return false;}s.proposal=proposal;await showPreview(proposal,[s.id],[s.id]);
   if(!current(s,ticket)){controller.discard(proposal.previewId);clearPreview(proposal.previewId);return false;}
   const r=proposal.report;$('compare').value='repaired';$('result').textContent=`${number(r.removedDegenerate)} entartete und ${number(r.removedDuplicates)} zusätzliche doppelte Flächen entfernt. ${number(r.flippedFaces)} Flächen ausgerichtet.\n${number(r.removedComponents)} ausgewählte Nebenbestandteile (${number(r.removedComponentFaces)} Flächen) entfernt. ${number(r.removedUnusedVertices)} unbenutzte Punkte entfallen.\n${number(r.beforeTriangles)} → ${number(r.afterTriangles)} Dreiecke. ${number(r.skippedOrientationComponents)} ungeeignete Orientierungsbereiche unverändert.\n\nVerbleibende Diagnose (vorher → nachher):\n`+Object.entries(MESH_INSPECTION_CATEGORIES).map(([k,c])=>`${c.label}: ${number(r.before[k])} → ${number(r.after[k])}`).join('\n');
   message('Vorschau bereit. Original und Reparatur vergleichen, dann übernehmen oder abbrechen. Restfehler bleiben möglich; kein Nachweis eines gültigen Körpers.');return true;
  }catch(error){if(proposal)controller.discard(proposal.previewId);if(current(s,ticket)){s.proposal=null;clearPreview(proposal?.previewId);message(error.message);}return false;}
  finally{if(current(s,ticket)){s.busy=false;s.phase=null;controls();}}
 }
 async function apply(){const s=active;if(!s?.proposal||s.busy)return false;if(!current(s,s.ticket)){close();toast('Projekt oder Auswahl geändert. Reparatur erneut prüfen.');return false;}
  const proposal=s.proposal;active=null;panel.hidden=true;service.cancel?.();
  try{await applyProposal(proposal);select([{rootId:s.id,path:[]}]);toast('Netzreparatur übernommen. Originalquelle erhalten; Rückgängig stellt den vorherigen Stand wieder her.');return true;}
  catch(error){controller.discard(proposal.previewId);clearPreview(proposal.previewId);toast(error.message);return false;}
 }
 async function open(){prepare();close();const selection=getSelection(),p=controller.readSnapshot(),n=selection.length===1&&!selection[0].path.length?p.nodes.find(n=>n.id===selection[0].rootId):null;
  if(!n||n.kind!=='mesh'||flags(n,p).hidden||flags(n,p).locked||view.allows&&!view.allows(n.id))throw Error('Für Reparaturen ein sichtbares, entsperrtes vollständiges Netzteil auswählen.');
  const blocked=meshProtectionRegions(n).length?'Dieses Netz enthält Schutzbereiche. Vor einer Geometrieänderung die Bereiche in „Netzflächen auswählen“ ausdrücklich freigeben.':'';
  active={id:n.id,revision:controller.revision(),selection:key(),busy:false,phase:null,ticket:0,proposal:null,catalog:null,parts:new Set(),blocked,abort:null};
  panel.innerHTML='<div class="mesh-repair-heading"><strong>Netz gezielt reparieren</strong><button id="mesh-repair-x" aria-label="Reparatur abbrechen">×</button></div><p id="mesh-repair-name"></p><label><input id="mesh-repair-degenerate" type="checkbox">Sicher entartete Dreiecke entfernen</label><label><input id="mesh-repair-duplicates" type="checkbox">Zusätzliche doppelte Flächen entfernen</label><p class="small-note">Bei exakt gleichen Dreiecken bleibt die erste Originalfläche erhalten, auch bei Gegenrichtung. Entartete Flächen werden nur bei bestätigtem Flächeninhalt null entfernt.</p><label><input id="mesh-repair-orient" type="checkbox">Geeignete Flächenbereiche einheitlich ausrichten</label><p class="small-note">Weniger Flächen werden umgedreht; bei Gleichstand bleibt die erste Fläche richtungsgebend. Keine automatische Innen-/Außenbestimmung. Mehrdeutige oder weiter beschädigte Bereiche bleiben erhalten.</p><details><summary>Kleine Nebenbestandteile gezielt entfernen</summary><label>Höchstens Dreiecke je Nebenbestandteil<input id="mesh-repair-limit" type="number" min="0" max="500000" step="1" value="20"></label><p class="small-note">Größter Bestandteil bleibt erhalten. Kantenverbundene Bestandteile mit Punktkontakt werden nicht entfernt. Erst „Ansehen“, dann gewünschte Teile ankreuzen. 0 schaltet diese Liste aus.</p><div id="mesh-repair-parts"></div><div class="mesh-repair-page"><button id="mesh-repair-page-before">Zurück</button><span id="mesh-repair-page"></span><button id="mesh-repair-page-after">Weiter</button></div><p id="mesh-repair-chosen"></p></details><p class="small-note">Verwendete Koordinaten bleiben exakt; unbenutzte Punkte entfallen. Öffnungen bleiben offen. Original und bisherige Quellen werden gespeichert. Flächenmarkierungen nach einer Reparatur neu wählen.</p><label>Vergleich<select id="mesh-repair-compare" disabled><option value="repaired">Reparierte Vorschau</option><option value="original">Original</option></select></label><p id="mesh-repair-result"></p><p id="mesh-repair-status" role="status"></p><div class="edge-actions"><button id="mesh-repair-preview">Vorschau</button><button id="mesh-repair-apply" class="primary" disabled>Übernehmen</button><button id="mesh-repair-cancel">Abbrechen</button></div>';
  $('name').textContent=n.name;panel.hidden=false;$('preview').onclick=()=>void preview();$('apply').onclick=()=>void apply();$('cancel').onclick=$('x').onclick=close;
  for(const id of ['degenerate','duplicates','orient'])$(id).onchange=changed;
  $('limit').onchange=()=>{if(active){active.parts.clear();void loadCatalog();}};
  $('page-before').onclick=()=>void loadCatalog(Math.max(0,(active?.catalog?.offset??0)-128));$('page-after').onclick=()=>void loadCatalog((active?.catalog?.offset??0)+128);
  $('compare').onchange=async()=>{const s=active;if(!s?.proposal||s.busy)return;const ticket=s.ticket;s.busy=true;s.phase='compare';controls();try{if($('compare').value==='original')clearPreview(s.proposal.previewId);else await showPreview(s.proposal,[s.id],[s.id]);}catch(error){if(current(s,ticket))message(error.message);}finally{if(current(s,ticket)){s.busy=false;s.phase=null;controls();}else clearPreview(s.proposal.previewId);}};
  controls();if(blocked){message(blocked);return false;}return loadCatalog();
 }
 panel.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();close();}});
 return {open,preview,apply,close,loadCatalog,state:()=>active?{id:active.id,busy:active.busy,phase:active.phase,hasPreview:!!active.proposal,catalog:active.catalog?structuredClone(active.catalog):null,selectedParts:[...active.parts],report:active.proposal?.report??null,blocked:active.blocked}:null,
  revisionChanged(){if(active&&active.revision!==controller.revision())close();},selectionChanged(){if(active&&active.selection!==key())close();},dispose(){close();service.dispose?.();panel.remove();}};
}
