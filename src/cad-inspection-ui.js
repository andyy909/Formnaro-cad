import * as THREE from 'three';
import {inspectionPlane,inspectionRange} from './inspection-math.js';
import {cadPermanentlyVisible} from './cad-isolation.js';
import {commonBounds} from './common-tool-operations.js';
import {meshSurfaceHit} from './mesh-surface.js';
import './cad-inspection.css';

const fmt=v=>v.toLocaleString(document.documentElement.lang==='en'?'en-GB':'de-DE',{maximumFractionDigits:6,useGrouping:false});
const numeric=v=>{const s=String(v).trim(),n=s?Number(s.replace(',','.')):NaN;if(!Number.isFinite(n)||Math.abs(n)>200000)throw Error('Endlichen Wert zwischen −200000 und 200000 mm eingeben.');return n;};
export function createCadInspectionUI({controller,view,getSelection,getScene,prepare,toast,getQuality,legacyMeasure}){
 const panel=document.createElement('section');panel.id='cad-inspection';panel.className='edge-tool-panel';panel.hidden=true;view.canvas.parentElement.append(panel);
 let active=null,sectionState=null,sequence=0;const project=()=>controller.readSnapshot(),$=id=>panel.querySelector('#'+id),en=()=>document.documentElement.lang==='en',tr=(de,english)=>en()?english:de;
 const status=text=>{if($('inspection-status'))$('inspection-status').textContent=text;};
 const run=fn=>{const failed=error=>{if(active){status(error.message);toast(error.message);}};try{return Promise.resolve(fn()).catch(failed);}catch(error){failed(error);return Promise.resolve();}};
 function nodes({selected=false}={}){const p=project(),ids=new Set(getSelection().map(t=>t.rootId));return p.nodes.filter(n=>cadPermanentlyVisible(n,p)&&view.allows(n.id)&&(n.kind==='cad'?n.solid:n.kind==='mesh'&&n.meshRole!=='hole')&&(!selected||!ids.size||ids.has(n.id)));}
 function valid(s,ticket){return active===s&&s.revision===controller.revision()&&(ticket===undefined||ticket===s.ticket);}
 function line(points){const group=view.groups.measurements;for(const child of [...group.children]){child.geometry?.dispose();child.material?.dispose();child.removeFromParent();}if(points.length){const geometry=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p))),material=new THREE.LineBasicMaterial({color:'#e49b27',depthTest:false}),marks=new THREE.Line(geometry,material);marks.renderOrder=43;group.add(marks);const dots=new THREE.Points(geometry.clone(),new THREE.PointsMaterial({color:'#e49b27',size:7,sizeAttenuation:false,depthTest:false}));dots.renderOrder=44;group.add(dots);}view.invalidate('click-measurement');}
 function clearSection(){sectionState=null;view.sectionPreview.clear();view.clearSection();}
 function close(){if(!active&&!sectionState)return false;const s=active;active=null;sequence++;if(s?.timer)clearTimeout(s.timer);panel.hidden=true;view.setInteraction(null);line([]);clearSection();return true;}
 function begin(kind){prepare();close();active={kind,revision:controller.revision(),ticket:0,points:[],busy:false,result:null,selection:JSON.stringify(getSelection())};panel.hidden=false;panel.scrollTop=0;return active;}
 function shell(title,contents){panel.setAttribute('aria-label',title);panel.innerHTML='<div class="inspection-heading"><strong>'+title+'</strong><button id="inspection-close" aria-label="'+tr('Schließen','Close')+'">×</button></div>'+contents+'<p id="inspection-status" role="status" aria-live="polite"></p>';$('inspection-close').onclick=close;}
 function openMeasure(){
  const s=begin('measure');shell(tr('Klickmessung','Click measurement'),'<label>'+tr('Messung','Measurement')+'<select id="inspection-measure-mode"><option value="auto">'+tr('Durchmesser / Radius','Diameter / radius')+'</option><option value="points">'+tr('Zwei Punkte','Two points')+'</option><option value="faces">'+tr('Zwei CAD-Flächen','Two CAD faces')+'</option></select></label><p id="inspection-instruction"></p><div id="inspection-result" class="inspection-result"></div><div class="two-buttons"><button id="inspection-reset">'+tr('Neue Messung','New measurement')+'</button><button id="inspection-legacy">'+tr('Weitere Messwerkzeuge','More measurement tools')+'</button></div><p class="small-note">'+tr('CAD-Maße stammen aus der nativen Geometrie. Netzpunkte liegen auf den gespeicherten Dreiecken.','CAD measurements use native geometry. Mesh points lie on the saved triangles.')+'</p>');
  const reset=()=>{s.ticket++;s.points=[];s.result=null;$('inspection-result').textContent='';line([]);const mode=$('inspection-measure-mode').value;$('inspection-instruction').textContent=mode==='auto'?tr('Eine CAD-Zylinderfläche anklicken: Bohrung oder Außenmantel.','Click a CAD cylindrical face: bore or outer wall.'):mode==='faces'?tr('Zwei CAD-Flächen anklicken. Gemessen wird ihr kleinster Abstand, auch innerhalb desselben Teils.','Click two CAD faces. Measures their shortest distance, including faces on the same part.'):tr('Zwei Punkte auf sichtbaren Modellflächen anklicken.','Click two points on visible model surfaces.');status('');};
  $('inspection-measure-mode').onchange=reset;$('inspection-reset').onclick=reset;$('inspection-legacy').onclick=()=>{close();legacyMeasure();};reset();
  view.setInteraction(async(ray,event,hint)=>{
   if(!valid(s)||s.busy)return;s.busy=true;const ticket=s.ticket,mode=$('inspection-measure-mode').value;
   try{const visible=nodes(),hintNode=visible.find(n=>n.id===hint?.object.userData.rootId),mesh=hintNode?.kind==='mesh'?meshSurfaceHit(hintNode,ray):null,ids=visible.filter(n=>n.kind==='cad').map(n=>n.id),limited=mesh?{...ray,far:Math.min(ray.far??1e9,Math.max(0,mesh.distance-1e-7))}:ray,native=ids.length&&(limited.far??1e9)>(limited.near??0)?await controller.query('clickSurface',{ray:limited,ids}):null;
    if(!valid(s,ticket))return;const hit=mesh&&(!native||mesh.distance<native.t-1e-7)?{...mesh,mesh:true}:native;
    if(!hit)throw Error(tr('Eine sichtbare Modellfläche anklicken.','Click a visible model surface.'));
    if(mode==='auto'){
     if(hit.surface?.kind!=='cylinder'){s.result=null;line([]);$('inspection-result').textContent='';throw Error(tr('Hier ist keine native Kreis-Zylinderfläche. Für Netze oder freie Flächen „Zwei Punkte“ wählen.','This is not a native circular cylindrical surface. Choose “Two points” for meshes or free-form surfaces.'));}
     s.result={...hit.surface,kind:'diameter',point:hit.point,objectId:hit.objectId};const n=new THREE.Vector3(...hit.surface.axis),v=new THREE.Vector3(...hit.point).sub(new THREE.Vector3(...hit.surface.center)),center=new THREE.Vector3(...hit.surface.center).addScaledVector(n,v.dot(n)),opposite=center.clone().multiplyScalar(2).sub(new THREE.Vector3(...hit.point));line([hit.point,opposite.toArray()]);
     $('inspection-result').textContent=tr('Durchmesser','Diameter')+' Ø '+fmt(hit.surface.diameter)+' mm\n'+tr('Radius','Radius')+' R '+fmt(hit.surface.radius)+' mm';status(tr('Native CAD-Zylinderfläche · nächste Fläche anklicken.','Native CAD cylindrical surface · click the next face.'));return;
    }
    if(mode==='faces'&&hit.mesh)throw Error(tr('Für den Flächenabstand zwei CAD-Flächen wählen. Netzdateien unterstützen „Zwei Punkte“.','Choose two CAD faces for face distance. Use “Two points” for mesh files.'));
    if(s.points.length===2){s.points=[];s.result=null;$('inspection-result').textContent='';}s.points.push(hit);line(s.points.map(p=>p.point));
    if(s.points.length===1){status(tr('Zweite Fläche / zweiten Punkt anklicken.','Click the second face / point.'));return;}
    const [a,b]=s.points;
    if(mode==='faces'){const result=await controller.query('clickSurfaceDistance',{from:{objectId:a.objectId,faceIndex:a.faceIndex},to:{objectId:b.objectId,faceIndex:b.faceIndex}});if(!valid(s,ticket))return;s.result=result;line([result.from,result.to]);}
    else{const delta=b.point.map((v,k)=>v-a.point[k]);s.result={kind:'point-distance',distance:Math.hypot(...delta),delta,from:a.point,to:b.point};}
    $('inspection-result').textContent=(mode==='faces'?tr('Kleinster Flächenabstand','Shortest face distance'):tr('Punktabstand','Point distance'))+': '+fmt(s.result.distance)+' mm'+(s.result.delta?'\nΔX / ΔY / ΔZ: '+s.result.delta.map(fmt).join(' / ')+' mm':'');status(tr('Messung fertig · der nächste Klick beginnt ein neues Paar.','Measurement complete · the next click starts a new pair.'));
   }catch(error){if(valid(s,ticket))status(error.message);}finally{if(active===s)s.busy=false;}
  });
 }
 function config(s){const plane=inspectionPlane($('section-axis').value,numeric($('section-offset').value),project().workplane);return {...plane,side:$('section-side').value,ids:s.nodes.map(n=>n.id)};}
 function previewSection(s,offset,commit=false){
  if(!valid(s))return;if(offset!==undefined)$('section-offset').value=fmt(offset);const c=config(s);s.ticket++;s.config=c;s.result=null;sectionState=null;
  const plane=inspectionPlane($('section-axis').value,0,project().workplane),range=inspectionRange(s.bounds,plane.normal,plane.offset);s.range=range;
  const slider=$('section-slider');slider.min=range.min;slider.max=range.max;slider.step=Math.max(.000001,(range.max-range.min)/2000);slider.value=numeric($('section-offset').value);
  const center=s.bounds.reduce((acc,b)=>acc.map((v,k)=>v+b.center[k]/s.nodes.length),[0,0,0]),size=Math.max(5,...s.bounds.map(b=>Math.hypot(...b.size)))*1.3;
  view.clearSection();view.sectionPreview.start({...c,center,size,min:range.min+plane.offset,max:range.max+plane.offset,onMove:(absolute,final)=>{if(!valid(s))return;const relative=absolute-plane.offset;$('section-offset').value=fmt(relative);$('section-slider').value=relative;s.config={...config(s)};s.ticket++;s.result=null;sectionState=null;view.clearSection();view.sectionPreview.update(absolute);status(tr('Schnelle Schnittvorschau · beim Loslassen genau berechnen.','Fast section preview · calculates precisely on release.'));if(final)void run(()=>calculate(s));}});
  status(tr('Schnelle Schnittvorschau · gelben Griff oder Schieberegler ziehen.','Fast section preview · drag the yellow handle or slider.'));if(commit)return calculate(s);
 }
 function openSection(){
  const s=begin('section');s.nodes=nodes({selected:true});if(!s.nodes.length){close();throw Error(tr('Sichtbare Materialkörper auswählen.','Select visible solid bodies.'));}s.bounds=s.nodes.map(n=>commonBounds(n));
  shell(tr('Verschiebbare Schnittebene','Movable section plane'),'<label>'+tr('Schnittebene','Section plane')+'<select id="section-axis"><option value="plane">'+tr('Arbeitsebene','Workplane')+'</option><option value="2">Z</option><option value="0">X</option><option value="1">Y</option></select></label><label>'+tr('Versatz (mm)','Offset (mm)')+'<input id="section-offset" inputmode="decimal" value="0"></label><label>'+tr('Ebene verschieben','Move plane')+'<input id="section-slider" type="range" aria-label="'+tr('Schnittebene verschieben','Move section plane')+'"></label><label>'+tr('Behaltene Seite','Retained side')+'<select id="section-side"><option value="negative">'+tr('Negative Seite','Negative side')+'</option><option value="positive">'+tr('Positive Seite','Positive side')+'</option></select></label><div class="two-buttons"><button id="section-apply">'+tr('Genau berechnen','Calculate precisely')+'</button><button id="section-off">'+tr('Schnitt ausschalten','Turn section off')+'</button></div><p class="small-note">'+tr('Ansicht ohne Modelländerung. Beim Ziehen offene Grafikvorschau; nach Loslassen genaue Schnittflächen. Export bleibt vollständig.','View without model changes. Open graphical preview while dragging; precise section faces on release. Export remains complete.')+'</p>');
  $('section-off').onclick=close;
  const input=()=>{try{previewSection(s);}catch(error){s.ticket++;clearSection();status(error.message);}};
  $('section-offset').oninput=input;$('section-offset').onchange=()=>run(()=>{previewSection(s);return calculate(s);});
  $('section-axis').onchange=()=>run(()=>{previewSection(s);return calculate(s);});$('section-side').onchange=()=>run(()=>{previewSection(s);return calculate(s);});
  $('section-slider').oninput=()=>{try{previewSection(s,Number($('section-slider').value));}catch(error){status(error.message);}};
  $('section-slider').onchange=()=>run(()=>calculate(s));$('section-apply').onclick=()=>run(()=>{previewSection(s);return calculate(s);});
  // Disable modelling clicks while the section tool is open. Camera controls
  // remain available; the plane's handle owns its own captured drag.
  view.setInteraction(()=>{});previewSection(s);return state();
 }
 async function calculate(s=active){
  if(!s||!valid(s)||s.kind!=='section')return;const ticket=s.ticket,c=s.config;
  // One active calculation and one latest request; never queue every slider step.
  if(s.busy){s.pending=true;return;}s.busy=true;s.pending=false;status(tr('Genauen Schnitt berechnen …','Calculating precise section …'));
  try{const negative=c.side==='negative',meshes=s.nodes.filter(n=>n.kind==='mesh'),results=[];
   if(meshes.length)results.push(...await controller.meshQuery('toolsQuery',{kind:'section',ids:meshes.map(n=>n.id),options:{plane:{normal:c.normal.map(v=>v*(negative?-1:1)),offset:c.offset*(negative?-1:1)}}}));
   for(const n of s.nodes.filter(n=>n.kind==='cad')){if(!valid(s,ticket))return;results.push(await controller.query('section',{nodeId:n.id,frame:c.frame,side:c.side,display:true,displayQuality:getQuality()}));}
   if(!valid(s,ticket))return;view.sectionPreview.finish();view.setSectionDisplay(results);s.result={count:results.length,volume:results.reduce((sum,r)=>sum+r.clipVolume,0)};sectionState={revision:s.revision,results,config:{normal:c.normal,offset:c.offset,side:c.side,ids:c.ids}};status(tr('Genauer Schnitt','Precise section')+' · '+fmt(s.result.volume)+' mm³ · '+tr('Griff erneut ziehen oder Wert eingeben.','Drag the handle again or enter an offset.'));
  }catch(error){if(valid(s,ticket)){sectionState=null;s.result=null;status(error.message);}}
  finally{if(active===s){s.busy=false;if(s.pending){s.pending=false;void run(()=>calculate(s));}}}
 }
 function state(){return active?{kind:active.kind,revision:active.revision,busy:active.busy,ticket:active.ticket,points:structuredClone(active.points),result:structuredClone(active.result),config:active.config?structuredClone(active.config):null}:null;}
 return {openMeasure,openSection,close,state,sectionState:()=>sectionState,storedSection:()=>sectionState?structuredClone(sectionState.config):null,revisionChanged:()=>{if(active&&active.revision!==controller.revision())close();},selectionChanged:()=>{if(active?.kind==='section'&&active.selection!==JSON.stringify(getSelection()))close();},dispose:()=>{close();panel.remove();}};
}
