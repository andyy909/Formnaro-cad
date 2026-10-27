import {createCadModelComparisonUI} from './model-deviation-ui.js';
import {thicknessWorldInput} from './thickness-map.js';
import {cadPermanentlyVisible} from './cad-isolation.js';
import './cad-thickness.css';

// Lazy one-shot worker and a disposable view. Nothing enters the project,
// source colors, history, save files or production export.
export function createCadThicknessUI({controller,view,getSelection,getQuality,prepare,toast}){
  const panel=document.createElement('section');panel.id='thickness-panel';panel.className='edge-tool-panel';panel.hidden=true;view.canvas.parentElement.append(panel);
  const comparison=createCadModelComparisonUI({controller,view,getSelection,getQuality,prepare,toast});
  let active=null,worker=null;
  const en=()=>document.documentElement.lang==='en',tr=(de,english)=>en()?english:de,$=id=>panel.querySelector('#'+id),fmt=v=>Number(v.toFixed(4)).toString();
  const state=()=>comparison.state()??(active?{revision:active.revision,id:active.id,busy:!!worker||!!active.preparing,result:active.result?{...active.result,values:undefined}:null}:null);
  function stop(){worker?.terminate();worker=null;if(active){active.abort?.abort();active.abort=null;active.preparing=false;active.ticket=(active.ticket??0)+1;}}
  function close(){const compared=comparison.close();if(!active)return compared;stop();active=null;panel.hidden=true;view.clearThickness();view.setInteraction(null);return true;}
  function valid(s){return active===s&&s.revision===controller.revision();}
  function message(text){$('thickness-status').textContent=text;}
  function recolor(){const s=active;if(!s?.result)return;try{view.setThickness(s.id,s.input,s.result,Number($('thickness-low').value),Number($('thickness-high').value));message(tr('Grau = ungeprüft oder kein eindeutiger Materialdurchgang.','Grey = unsampled or no unambiguous material interval.'));}catch(error){message(error.message);}}
  async function calculate(){
    const s=active;if(!s)return;stop();s.result=null;view.clearThickness();$('thickness-result').textContent='';
    try{
      const ticket=s.ticket;s.abort=new AbortController();s.preparing=true;message(tr('Analyseoberfläche vorbereiten …','Preparing analysis surface …'));
      const node=controller.readSnapshot().nodes.find(n=>n.id===s.id);
      const record=node.kind==='cad'?await controller.query('thicknessSurface',{id:s.id,quality:getQuality()},{signal:s.abort.signal}):{mesh:node.mesh,transform:node.transform};
      if(!valid(s)||ticket!==s.ticket)return;s.preparing=false;s.abort=null;
      s.input=thicknessWorldInput(record.mesh,record.transform);const request={...s.input,maxSamples:Number($('thickness-samples').value),validateTopology:node.kind!=='cad'};
      worker=new Worker(new URL('./thickness-worker.js',import.meta.url),{type:'module'});const owned=worker;message(tr('Oberfläche prüfen … Kamera bleibt bedienbar.','Checking surface … Camera remains available.'));
      owned.onmessage=({data})=>{if(!valid(s)||worker!==owned)return;
        if(data.type==='progress'){message(tr('Wanddicken berechnen','Calculating thickness')+' · '+Math.round(data.value*100)+' %');return;}
        stop();if(data.type==='error'){message(data.message);return;}
        s.result=data.result;const r=s.result;
        if(r.measured){$('thickness-low').value=fmt(r.minimum);$('thickness-high').value=fmt(Math.max(r.maximum,r.minimum+.01));recolor();}
        else view.setThickness(s.id,s.input,r,0,1);
        $('thickness-result').textContent=tr('Gemessene Dreiecke: ','Measured triangles: ')+r.measured+' / '+r.triangles+' ('+fmt(r.measured/r.triangles*100)+' %)'+(r.measured?'\n'+tr('Stichprobenbereich: ','Sample range: ')+fmt(r.minimum)+' – '+fmt(r.maximum)+' mm':'');
        message(tr('Fertig. Grau = ungeprüft oder kein eindeutiger Materialdurchgang.','Done. Grey = unsampled or no unambiguous material interval.'));
      };
      owned.onerror=event=>{if(valid(s)&&worker===owned){stop();message(event.message||tr('Analyse fehlgeschlagen.','Analysis failed.'));}};
      owned.postMessage(request);
    }catch(error){if(!valid(s)||error.name==='AbortError')return;stop();message(error.message);toast(error.message);}
  }
  function open(){
    prepare();close();const p=controller.readSnapshot(),selection=getSelection();
    if(selection.length!==1||selection[0].path.length)throw Error(tr('Genau ein vollständiges Teil auswählen.','Select exactly one complete part.'));
    const node=p.nodes.find(n=>n.id===selection[0].rootId);
    if(!node||!cadPermanentlyVisible(node,p)||!view.allows(node.id)||(node.kind==='cad'&&!node.solid)||(node.kind==='mesh'&&node.meshRole==='hole'))throw Error(tr('Ein sichtbares Materialteil auswählen.','Select a visible solid part.'));
    active={id:node.id,revision:controller.revision(),selection:JSON.stringify(selection),input:null,result:null};panel.hidden=false;panel.scrollTop=0;panel.setAttribute('aria-label',tr('Wanddickenkarte','Wall thickness map'));
    panel.innerHTML='<div class="inspection-heading"><strong>'+tr('Wanddickenkarte','Wall thickness map')+'</strong><button id="thickness-close" aria-label="'+tr('Schließen','Close')+'">×</button></div><p id="thickness-name"></p><label>'+tr('Maximale Stichproben','Maximum samples')+'<select id="thickness-samples"><option value="2000">2.000</option><option value="6000" selected>6.000</option><option value="12000">12.000</option></select></label><div class="two-buttons"><button id="thickness-run">'+tr('Karte berechnen','Calculate map')+'</button><button id="thickness-stop">'+tr('Abbrechen','Cancel')+'</button></div><p class="small-note">'+tr('Näherung aus der Anzeigevernetzung · CAD-Abweichung bis ','Approximation from display tessellation · CAD deflection up to ')+getQuality().deflection+' mm. '+tr('Kein globaler Mindestwert.','No global minimum.')+'</p><details><summary>'+tr('Messverfahren und Auflösung','Method and resolution')+'</summary><p class="small-note">'+tr('Normalenabstand ab Dreiecksmitte zur gegenüberliegenden Oberfläche desselben Teils. Nachbarteile zählen nicht als Wand. Für feinere CAD-Flächen die Anzeigequalität vor dem Öffnen erhöhen. Bei Netzen hängt die Genauigkeit von der Datei ab. Offene oder topologisch fehlerhafte Netze zuerst mit dem Netzinspektor prüfen.','Normal distance from triangle centre to the opposite surface of the same part. Neighbouring parts do not count as walls. Increase display quality before opening for finer CAD surfaces. Mesh accuracy depends on the file. Check open or topologically invalid meshes with the mesh inspector first.')+'</p></details><div class="two-buttons"><label>'+tr('Rot bis (mm)','Red at (mm)')+'<input id="thickness-low" type="number" min="0" step="0.1" value="0"></label><label>'+tr('Blau ab (mm)','Blue at (mm)')+'<input id="thickness-high" type="number" min="0" step="0.1" value="5"></label></div><div style="height:14px;background:linear-gradient(to right,#ed2510,#ffbd30,#4acb80,#2175fa);border-radius:4px" aria-hidden="true"></div><p class="small-note">'+tr('Rot: dünner · Blau: dicker · Grau: unbekannt. Nur gemessene Dreiecke werden eingefärbt.','Red: thinner · Blue: thicker · Grey: unknown. Only measured triangles receive colours.')+'</p><div id="thickness-result" class="inspection-result"></div><p id="thickness-status" role="status" aria-live="polite"></p>';
    $('thickness-name').textContent=node.name;$('thickness-close').onclick=close;$('thickness-run').onclick=calculate;
    $('thickness-stop').onclick=()=>{stop();message(tr('Abgebrochen. Das Modell ist unverändert.','Cancelled. The model is unchanged.'));};
    $('thickness-low').onchange=recolor;$('thickness-high').onchange=recolor;
    view.setInteraction(()=>{});message(tr('Berechnung startet erst mit „Karte berechnen“.','Click “Calculate map” to start.'));return state();
  }
  return {open,close,state,calculate,comparison,revisionChanged:()=>{comparison.revisionChanged();if(active&&active.revision!==controller.revision())close();},selectionChanged:()=>{comparison.selectionChanged();if(active&&active.selection!==JSON.stringify(getSelection()))close();},dispose:()=>{close();comparison.dispose();panel.remove();}};
}
