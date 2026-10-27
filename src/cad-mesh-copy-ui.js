import {CAD_MESH_COPY_PRESETS,validateMeshCopyQuality,meshCopySource} from './cad-mesh-copy-data.js';
import './cad-tools.css';
export function createCadMeshCopyUI({controller,view,getSelection,select,prepare,showPreview,clearPreview,applyProposal,isolate,toast=()=>{}}){
 const panel=document.createElement('section');panel.id='cad-mesh-copy';panel.className='edge-tool-panel';panel.hidden=true;panel.setAttribute('aria-label','CAD als Netzkopie');view.canvas.parentElement.append(panel);
 panel.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();close();}});
 let active=null,generation=0;const $=id=>panel.querySelector('#mesh-copy-'+id),key=()=>JSON.stringify(getSelection());
 const number=value=>Number(value).toLocaleString('de-DE',{maximumFractionDigits:6});
 function message(text){if($('message'))$('message').textContent=text;}
 function controls(){if(!active)return;const busy=active.busy;for(const input of panel.querySelectorAll('input,select'))input.disabled=busy;$('preview').disabled=busy;$('apply').disabled=busy||!active.proposal;$('compare').disabled=busy||!active.proposal;}
 function discard(){const s=active;if(!s)return;++s.ticket;if(s.busy)controller.cancel();s.busy=false;if(s.proposal){controller.discard(s.proposal.previewId);clearPreview(s.proposal.previewId);}s.proposal=null;controls();}
 function close(){const had=!!active;++generation;discard();active=null;panel.hidden=true;return had;}
 function current(s,ticket){return active===s&&s.ticket===ticket&&s.revision===controller.revision()&&s.selection===key();}
 async function preview(){const s=active;if(!s||s.busy)return;discard();const ticket=s.ticket;s.busy=true;controls();message('Netzkopie wird aus der CAD-Geometrie berechnet …');let proposal;
  try{const quality=validateMeshCopyQuality({deflection:Number($('deflection').value),angleDegrees:Number($('angle').value)});proposal=await controller.preview({kind:'cadToMesh',target:s.target,id:s.id,quality},{revision:s.revision,label:'CAD als Netzkopie'});
   if(!current(s,ticket)){controller.discard(proposal.previewId);return;}s.proposal=proposal;await showPreview(proposal,[s.id],[s.target.rootId]);
   if(!current(s,ticket)){controller.discard(proposal.previewId);clearPreview(proposal.previewId);return;}
   $('compare').value='mesh';const r=proposal.report;$('result').textContent=`${number(r.vertices)} Punkte · ${number(r.triangles)} Dreiecke\nCAD-Volumen ${number(r.cadVolume)} mm³ · Netzvolumen ${number(r.meshVolume)} mm³\nVolumenunterschied ${number(r.volumeDifferencePercent)} %`;
   message('Vorschau bereit. CAD-Quelle unverändert. Erst Übernehmen fügt die Netzkopie hinzu.');
  }catch(error){if(proposal)controller.discard(proposal.previewId);if(active===s&&s.ticket===ticket){s.proposal=null;clearPreview(proposal?.previewId);message(error.message);}}
  finally{if(active===s&&s.ticket===ticket){s.busy=false;controls();}}
 }
 async function apply(){const s=active;if(!s?.proposal||s.busy)return;if(!current(s,s.ticket)){close();throw Error('Projekt oder Auswahl geändert. Die Netzkopie erneut prüfen.');}
  const proposal=s.proposal,onlyCopy=$('isolate').checked;active=null;++generation;panel.hidden=true;
  try{await applyProposal(proposal);select([{rootId:s.id,path:[]}]);if(onlyCopy)isolate([{rootId:s.id,path:[]}]);toast('Bearbeitbare Netzkopie erstellt. Die CAD-Quelle bleibt erhalten.');}
  catch(error){controller.discard(proposal.previewId);clearPreview(proposal.previewId);throw error;}
 }
 function open(){prepare();const selection=getSelection();if(selection.length!==1)throw Error('Für die Netzkopie genau einen fertigen CAD-Körper auswählen.');const project=controller.snapshot(),target=structuredClone(selection[0]),source=meshCopySource(project,target);if(view.allows&&!view.allows(source.id))throw Error('Ein sichtbares CAD-Teil auswählen.');
  active={revision:controller.revision(),target,selection:key(),id:crypto.randomUUID(),proposal:null,busy:false,ticket:0};
  panel.innerHTML='<div class="section-title">CAD als Netzkopie</div><p id="mesh-copy-source" data-no-translate></p><label>Feinheit<select id="mesh-copy-preset"><option value="coarse">Grob · weniger Dreiecke</option><option value="standard" selected>Standard</option><option value="fine">Fein · mehr Details</option><option value="custom">Eigene Werte</option></select></label><label>Vernetzungsziel (mm)<input id="mesh-copy-deflection" type="number" min="0.0001" max="10" step="0.01" value="0.05"></label><label>Winkel (Grad)<input id="mesh-copy-angle" type="number" min="1" max="90" value="8"></label><p class="small-note">Kleinere Werte erzeugen mehr Dreiecke. Dies ist ein Vernetzungsziel, keine geprüfte maximale Abweichung. Kleine Bohrungen und dünne Wände im Ergebnis prüfen.</p><p class="small-note">Lage, Objektfarbe und Deckkraft werden übernommen. CAD-Quellenfarben bleiben im Original. Die Netzkopie ist unabhängig; Änderungen übertragen sich nicht automatisch.</p><label>Vergleich<select id="mesh-copy-compare" disabled><option value="mesh">Netzkopie</option><option value="cad">CAD-Original</option></select></label><p id="mesh-copy-result" class="fit-result" style="white-space:pre-line" data-no-translate></p><label style="display:flex;gap:8px"><input id="mesh-copy-isolate" type="checkbox" checked style="width:auto"> Nach Übernahme nur die Netzkopie anzeigen</label><p class="small-note">Nur die Ansicht wird isoliert. „Isolation beenden“ zeigt wieder alle Teile. Zum Export nur der Netzkopie „Ausgewählte Teile“ wählen.</p><p id="mesh-copy-message" role="status"></p><div class="edge-actions"><button id="mesh-copy-preview">Vorschau berechnen</button><button id="mesh-copy-apply" class="primary" disabled>Übernehmen</button><button id="mesh-copy-cancel">Abbrechen</button></div>';
  $('source').textContent=source.name;panel.hidden=false;const run=fn=>Promise.resolve().then(fn).catch(error=>message(error.message));$('preview').onclick=()=>run(preview);$('apply').onclick=()=>run(apply);$('cancel').onclick=close;
  const changed=()=>{discard();$('result').textContent='';message('Feinheit geändert. Vorschau erneut berechnen.');};
  $('preset').onchange=()=>{const p=CAD_MESH_COPY_PRESETS[$('preset').value];if(p){$('deflection').value=p.deflection;$('angle').value=p.angleDegrees;}changed();};for(const id of ['deflection','angle'])$(id).oninput=()=>{$('preset').value='custom';changed();};
  $('compare').onchange=()=>run(async()=>{const s=active;if(!s?.proposal||s.busy)return;const ticket=s.ticket;s.busy=true;controls();try{if($('compare').value==='cad')clearPreview(s.proposal.previewId);else await showPreview(s.proposal,[s.id],[s.target.rootId]);if(!current(s,ticket))clearPreview(s.proposal.previewId);}finally{if(active===s){s.busy=false;controls();}}});
  controls();message('Feinheit wählen und Vorschau berechnen.');
 }
 return {open,preview,apply,close,state:()=>active?{revision:active.revision,id:active.id,busy:active.busy,hasPreview:!!active.proposal,report:active.proposal?.report??null}:null,selectionChanged:()=>{if(active&&active.selection!==key())close();},revisionChanged:()=>{if(active&&active.revision!==controller.revision())close();},dispose(){close();panel.remove();}};
}
