import {prepareMeshImport} from './import-core/mesh-import-client.js';
import {MESH_IMPORT_LIMITS} from './import-core/mesh-import-limits.js';
import './import-dialog.css';
export function openMeshImport({name,buffer,cad=false}){
 if(buffer.byteLength>MESH_IMPORT_LIMITS.bytes)throw Error('STL-Import: maximal 256 MiB.');
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.className='mesh-import-dialog';dialog.id='mini-import-dialog';dialog.dataset.phase='ready';
  dialog.innerHTML='<h2>STL laden</h2><p id="mini-import-name"></p><p>Auch offene oder beschädigte Teile laden. Sichere Bereinigung schließt keine Öffnungen und entfernt keine Bestandteile.</p><label><input id="mini-import-clean" type="checkbox" checked> Automatisch bereinigen</label><label><input id="mini-import-simplify" type="checkbox" checked> Große Netze bei Bedarf vereinfachen</label><label>Fehlerwert (mm) <input id="mini-import-error" type="number" min="0" max="1" step="0.01" value="0.02"></label>'+(cad?'<label><input id="mini-import-raw" type="checkbox"> Als Rohnetz behalten (keine CAD-Umwandlung)</label>':'')+'<p>Bis 256 MiB binär / 5 Millionen Dreiecke, ASCII bis 64 MiB. Über 500.000 Dreiecken wird eine Arbeitskopie mit Ziel 250.000 versucht. Fehlerwert ist eine Schätzung, kein Maßnachweis. Originaldatei aufbewahren.</p><p id="mini-import-status" role="status"></p><pre id="mini-import-report" hidden></pre><div class="mesh-import-actions"><button id="mini-import-cancel">Abbrechen</button><button id="mini-import-apply" class="primary">Laden</button></div>';
  document.body.append(dialog);const get=id=>dialog.querySelector('#'+id);get('mini-import-name').textContent=name;dialog.showModal();
  const abort=new AbortController();let prepared=null,running=false,finished=false,asRaw=false;
  function finish(value){if(finished)return;finished=true;abort.abort();dialog.close();dialog.remove();resolve(value);}
  get('mini-import-cancel').onclick=()=>finish(null);dialog.oncancel=e=>{e.preventDefault();finish(null);};dialog.addEventListener('close',()=>{if(!finished)finish(null);});
  get('mini-import-apply').onclick=async()=>{
   if(running||finished)return;if(prepared){finish({...prepared,asRaw});return;}running=true;dialog.dataset.phase='working';get('mini-import-status').textContent='Netzdatei wird geprüft …';
   const button=get('mini-import-apply'),inputs=[...dialog.querySelectorAll('input')];button.disabled=true;inputs.forEach(i=>i.disabled=true);
   try{asRaw=cad&&get('mini-import-raw').checked;prepared=await prepareMeshImport(buffer.slice(0),{repair:get('mini-import-clean').checked,simplify:get('mini-import-simplify').checked,maxError:Number(get('mini-import-error').value)},{signal:abort.signal,onProgress:text=>{if(!finished)get('mini-import-status').textContent=text;}});
    if(finished)return;
    if(prepared.report.simplification.changed){dialog.dataset.phase='review';const r=prepared.report;get('mini-import-report').hidden=false;get('mini-import-report').textContent=`Arbeitskopie: ${r.inputTriangles.toLocaleString('de-DE')} → ${r.outputTriangles.toLocaleString('de-DE')} Dreiecke.\nGeschätzter Fehler: ${r.simplification.errorEstimateMm.toLocaleString('de-DE',{maximumFractionDigits:6})} mm.\n`+r.warnings.join('\n');get('mini-import-status').textContent='Arbeitskopie geprüft. Zum Laden bestätigen.';button.textContent='Arbeitskopie laden';}
    else finish({...prepared,asRaw});
   }catch(error){if(!finished){dialog.dataset.phase='error';prepared=null;get('mini-import-status').textContent=error.message;inputs.forEach(i=>i.disabled=false);}}
   finally{running=false;if(!finished)button.disabled=false;}
  };
 });
}
