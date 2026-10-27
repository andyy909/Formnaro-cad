import {cadPermanentlyVisible} from './cad-isolation.js';
import {createModelComparisonService,compactModelComparison} from './model-deviation-service.js';
import './model-deviation.css';
export function createCadModelComparisonUI({controller,view,getSelection,getQuality,prepare,toast=()=>{}}={}){
 const panel=document.createElement('section');panel.id='model-comparison-panel';panel.className='edge-tool-panel';panel.hidden=true;view.canvas.parentElement.append(panel);
 const entry=document.createElement('button');entry.id='model-comparison-preview';entry.textContent='Vorschau vergleichen';entry.hidden=true;view.canvas.parentElement.append(entry);
 const service=createModelComparisonService();let active=null,offer=null;
 const $=name=>panel.querySelector('#compare-'+name),fmt=v=>Number(v.toFixed(5)).toLocaleString('de-DE'),valid=s=>active===s&&s.revision===controller.revision();
 const message=text=>{if($('status'))$('status').textContent=text;};
 function stop(){if(active){active.abort?.abort();active.abort=null;active.busy=false;active.ticket++;}}
 function close(){if(!active)return false;stop();active=null;panel.hidden=true;view.clearComparison();view.setInteraction(null);return true;}
 const state=()=>active?{revision:active.revision,busy:active.busy,previewId:active.previewId,leftId:$('left').value,rightId:$('right').value,result:active.data?compactModelComparison(active.data.result):null}:null;
 function invalidate(){stop();if(active)active.data=null;view.clearComparison();$('result').textContent='';message('Einstellungen geändert. Vergleich erneut berechnen.');}
 function recolor(){const s=active;if(!s?.data)return;try{view.setComparison({...s.data,direction:$('direction').value,maxDistance:Number($('range').value),showOriginal:$('ghost').checked},[s.leftId,s.rightId]);message('Blau: 0 mm · Rot: obere Farbgrenze · Grau: ungeprüft. Kamera bleibt bedienbar.');}catch(error){message(error.message);}}
 async function calculate(){
  const s=active;if(!s)return false;invalidate();const ticket=s.ticket;s.abort=new AbortController();s.busy=true;message('Vergleichsoberflächen vorbereiten …');
  try{const baseline=controller.readSnapshot(),candidate=s.previewId?controller.getPreview(s.previewId)?.project:baseline;if(!candidate)throw Error('Die Bearbeitungsvorschau ist nicht mehr verfügbar.');s.leftId=$('left').value;s.rightId=$('right').value;
   const leftRecords=await controller.surfaceForComparison(baseline,s.leftId,getQuality(),{signal:s.abort.signal}),rightRecords=await controller.surfaceForComparison(candidate,s.rightId,getQuality(),{signal:s.abort.signal});
   if(!valid(s)||s.ticket!==ticket)return false;
   const data=await service.compare({leftRecords,rightRecords,maxSamples:Number($('samples').value),alignCenters:$('align').checked},{signal:s.abort.signal,onProgress:value=>message('Abstände messen · '+Math.round(value*100)+' %')});
   if(!valid(s)||s.ticket!==ticket)return false;s.data=data;s.busy=false;s.abort=null;
   $('result').textContent=data.result.directions.map(d=>(d.direction==='left-to-right'?'A → B':'B → A')+': '+d.sampledTriangles+' / '+d.triangles+' Dreiecke, '+d.samplePoints+' Messpunkte\nStichproben: '+fmt(d.sampledMinimum)+' – '+fmt(d.sampledMaximum)+' mm · Mittel '+fmt(d.mean)+' mm · RMS '+fmt(d.rms)+' mm\nUngeprüft: '+d.unmeasuredTriangles).join('\n\n')+'\n\nLage: '+(data.result.alignment.mode==='world'?'unveränderte Weltkoordinaten':'B nur für Ansicht um '+data.result.alignment.rightTranslation.map(fmt).join(' / ')+' mm verschoben');
   recolor();return true;
  }catch(error){if(valid(s)&&s.ticket===ticket&&error.name!=='AbortError'){s.busy=false;s.abort=null;message(error.message);toast(error.message);}return false;}
 }
 function open(preview=null){
  if(!preview){prepare();}close();const baseline=controller.readSnapshot(),candidate=preview?controller.getPreview(preview.previewId)?.project:baseline;if(!candidate)throw Error('Bearbeitungsvorschau fehlt.');
  const allowed=(n,p)=>['cad','mesh'].includes(n.kind)&&cadPermanentlyVisible(n,p)&&view.allows(n.id)&&(n.kind==='cad'?n.solid:n.meshRole!=='hole'),left=baseline.nodes.filter(n=>allowed(n,baseline)),right=candidate.nodes.filter(n=>allowed(n,candidate)||preview?.ids?.includes(n.id));
  if(!left.length||!right.length)throw Error('Zwei Materialoberflächen für den Vergleich erforderlich.');
  active={revision:controller.revision(),selection:JSON.stringify(getSelection()),previewId:preview?.previewId??null,ticket:0,busy:false,data:null};panel.hidden=false;
  panel.innerHTML='<div class="inspection-heading"><strong>Modellvergleich</strong><button id="compare-close" aria-label="Schließen">×</button></div><label>A · Ausgangsmodell<select id="compare-left"></select></label><label>B · Vergleichsmodell<select id="compare-right"></select></label><label>Stichprobendreiecke je Richtung<input id="compare-samples" type="number" min="1" max="12000" value="6000"></label><label class="check"><input id="compare-align" type="checkbox">Mittelpunkte nur für die Ansicht überlagern</label><p class="small-note">Standard: tatsächliche Lage in Millimetern. Eine Überlagerung verändert kein Modell.</p><div class="two-buttons"><button id="compare-run">Vergleich berechnen</button><button id="compare-stop">Abbrechen</button></div><label>Farben auf<select id="compare-direction"><option value="right-to-left">B → A</option><option value="left-to-right">A → B</option></select></label><label>Obere Farbgrenze (mm)<input id="compare-range" type="number" min="0.000001" step="0.01" value="0.02"></label><label class="check"><input id="compare-ghost" type="checkbox" checked>Andere Oberfläche durchsichtig anzeigen</label><div class="compare-legend" aria-hidden="true"></div><p class="small-note">Blau 0 · Grün halbe Farbgrenze · Rot ab Farbgrenze · Grau ungeprüft.</p><div id="compare-result" class="inspection-result"></div><details><summary>Messverfahren und Grenzen</summary><p>Beide Richtungen messen ungerichtete kürzeste Abstände zur Dreiecksoberfläche. Je ausgewähltem Dreieck werden drei Ecken und der Schwerpunkt geprüft. Gleichmäßige Auswahl nach Dreiecksindex, keine Flächengewichtung. Nur geprüfte Dreiecke werden eingefärbt. Stichproben sind kein garantierter globaler Maximalfehler. CAD wird mit der aktuellen Anzeigequalität angenähert; maximal 200.000 Dreiecke pro Modell. Aus Berechnung oder Überlagerung entstehen keine Modelländerungen.</p></details><p id="compare-quality" class="small-note"></p><p id="compare-status" role="status" aria-live="polite"></p>';
  for(const [name,nodes]of [['left',left],['right',right]])for(const n of nodes){const option=document.createElement('option');option.value=n.id;option.textContent=n.name+' · '+n.kind;$(name).append(option);}
  const ids=getSelection().filter(s=>!s.path.length).map(s=>s.rootId),a=preview?.replaceIds?.find(id=>left.some(n=>n.id===id))??ids.find(id=>left.some(n=>n.id===id))??left[0].id,b=preview?.ids?.find(id=>right.some(n=>n.id===id))??ids.find(id=>id!==a&&right.some(n=>n.id===id))??right.find(n=>n.id!==a)?.id??right[0].id;$('left').value=a;$('right').value=b;
  $('quality').textContent='CAD-Anzeigequalität: '+getQuality().deflection+' mm / '+getQuality().angleDegrees+'°.';
  $('close').onclick=close;$('run').onclick=calculate;$('stop').onclick=()=>{stop();message('Abgebrochen. Modelle und Bearbeitungsvorschau bleiben erhalten.');};
  for(const name of ['left','right','samples','align'])$(name).onchange=invalidate;for(const name of ['direction','range','ghost'])$(name).onchange=recolor;
  view.setInteraction(()=>{});message('Berechnung startet erst mit „Vergleich berechnen“.');return state();
 }
 entry.onclick=()=>{try{open(offer);}catch(error){toast(error.message);}};
 function offerPreview(value){offer=value;entry.hidden=!value;if(active?.previewId&&active.previewId!==value?.previewId)close();}
 return {open,close,state,calculate,offerPreview,revisionChanged:()=>{if(active&&!valid(active))close();},selectionChanged:()=>{if(active&&active.selection!==JSON.stringify(getSelection()))close();},dispose(){close();service.dispose();panel.remove();entry.remove();}};
}
