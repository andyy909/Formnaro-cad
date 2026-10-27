import * as THREE from 'three';
import './cad-tools.css';

export function createEdgeTools({scene,viewport,canvas,getCamera,getNode,getRevision,run,cancelRun,commit,showPreview,clearPreview,setPicking,safe,toast,getLanguage=()=>'de'}){
  const panel=document.createElement('section');panel.className='edge-tool-panel';panel.hidden=true;panel.setAttribute('aria-label','Kanten bearbeiten');
  panel.innerHTML=`<div class="section-title">Kanten bearbeiten</div><p>Kanten anklicken oder mit gedrückter linker Maustaste einen Rahmen ziehen.</p><p class="small-note">Rahmen: ersetzt die Auswahl. Umschalt: hinzufügen. Alt: entfernen. Vollständig eingeschlossene Kanten werden ausgewählt, auch auf der Rückseite. Maximal 128 Kanten.</p>
    <label class="dialog-label">Operation<select id="edge-kind"><option value="round">Abrundung</option><option value="chamfer">Fase</option></select></label>
    <label class="dialog-label">Radius / Fasenmaß (mm)<input id="edge-amount" inputmode="decimal" value="1"></label>
    <p class="small-note">Bei bereits bearbeiteten Gruppen gilt das Maß vor deren Skalierung. Quellen bleiben im Objektbaum bearbeitbar.</p>
    <div class="two-buttons"><button id="edge-all">Alle Kanten</button><button id="edge-none">Auswahl leeren</button></div>
    <p id="edge-count" role="status"></p><p id="edge-history" class="small-note"></p>
    <button id="edge-remove">Letzte Kantenoperation entfernen</button>
    <div class="edge-actions"><button id="edge-preview">Vorschau berechnen</button><button id="edge-apply" class="primary" disabled>Übernehmen</button><button id="edge-cancel">Abbrechen</button></div>`;
  viewport.append(panel);const $=id=>panel.querySelector('#'+id),overlay=new THREE.Group();scene.add(overlay);let state=null,generation=0;
  function clearLines(){for(const line of [...overlay.children]){overlay.remove(line);line.geometry.dispose();line.material.dispose();}}
  const marquee=document.createElement('div');marquee.className='edge-marquee';marquee.hidden=true;viewport.append(marquee);let gesture=null;
  function endGesture(){const g=gesture;gesture=null;marquee.hidden=true;if(g&&canvas.hasPointerCapture(g.id))canvas.releasePointerCapture(g.id);}
  function close(){if(!state)return false;endGesture();state=null;generation++;cancelRun();clearLines();panel.hidden=true;clearPreview();setPicking(false);canvas.style.cursor='';return true;}
  function valid(){if(!state)throw Error('Kantenbearbeitung geschlossen.');if(getRevision()!==state.revision){close();throw Error('Modell geändert. Kantenbearbeitung erneut öffnen.');}return state;}
  function discard(){generation++;cancelRun();if(state)state.preview=null;clearPreview();$('edge-apply').disabled=true;}
  function draw(){
    clearLines();if(!state)return;
    for(const e of state.edges){const positions=[];for(let i=1;i<e.points.length;i++)positions.push(...e.points[i-1],...e.points[i]);const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      const chosen=state.selected.has(e.id),line=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:chosen?'#ff9d21':'#087f99',depthTest:!chosen,transparent:true,opacity:chosen?1:.7}));line.renderOrder=21;overlay.add(line);}
    $('edge-count').textContent=state.selected.size+' von '+state.edges.length+' Kanten ausgewählt';$('edge-history').textContent=state.node.edgeFinish?state.node.edgeFinish.steps.map((s,i)=>(i+1)+'. '+(s.kind==='round'?'Radius':'Fase')+' '+s.amount.toLocaleString(getLanguage()==='en'?'en-GB':'de-DE')+' mm').join(' · '):'';
    $('edge-remove').hidden=!state.node.edgeFinish;$('edge-preview').disabled=!state.selected.size;
  }
  async function open(){
    close();const node=structuredClone(getNode());if(!node.solid)throw Error('Eine fertige Körperform für die Kantenbearbeitung auswählen.');
    const token=++generation,revision=getRevision();state={node,revision,edges:[],selected:new Set(),preview:null};panel.hidden=false;$('edge-count').textContent='Kanten werden vorbereitet …';$('edge-remove').hidden=true;$('edge-preview').disabled=true;$('edge-apply').disabled=true;setPicking(true);
    const edges=await run({job:'cad-edges',node,revision},'CAD-Kanten');if(token!==generation||!state)return;valid();state.edges=edges;draw();canvas.style.cursor='crosshair';
  }
  function toggle(id){const s=valid();if(!s.edges.some(e=>e.id===id))throw Error('Kante nicht gefunden.');discard();if(s.selected.has(id))s.selected.delete(id);else{if(s.selected.size>=128)throw Error('Maximal 128 Kanten je Operation.');s.selected.add(id);}draw();}
  async function preview(remove=false){
    const s=valid(),amount=Number($('edge-amount').value.replace(',','.')),kind=$('edge-kind').value;
    if(!remove&&(!s.selected.size||!Number.isFinite(amount)||amount<.01||amount>1000))throw Error('Kanten auswählen und Radius/Fase zwischen 0,01 und 1000 mm eingeben.');
    discard();const token=generation,request={kind,amount,edges:s.edges.filter(e=>s.selected.has(e.id)).map(e=>e.anchor),remove};
    const result=await run({job:'cad-finish',node:s.node,request,revision:s.revision},'Kantenvorschau');if(token!==generation||!state)return;valid();s.preview=result;showPreview(result.node,s.node.id);$('edge-apply').disabled=false;return result;
  }
  async function apply(){const s=valid();if(s.applying)return;if(!s.preview)throw Error('Zuerst die Vorschau berechnen.');s.applying=true;$('edge-apply').disabled=true;try{await commit(s.preview,s.node.id,s.revision);close();toast('Kantenbearbeitung übernommen.');}finally{s.applying=false;}}
  function pick(e){
    const camera=getCamera(),rect=canvas.getBoundingClientRect(),pointer=new THREE.Vector2(e.clientX-rect.left,e.clientY-rect.top);let best=null,distance=12,depth=Infinity;
    for(const edge of state?.edges||[]){for(let i=1;i<edge.points.length;i++){
      const a=new THREE.Vector3(...edge.points[i-1]).project(camera),b=new THREE.Vector3(...edge.points[i]).project(camera);if(a.z< -1||a.z>1||b.z< -1||b.z>1)continue;
      const p=new THREE.Vector2((a.x+1)*rect.width/2,(1-a.y)*rect.height/2),q=new THREE.Vector2((b.x+1)*rect.width/2,(1-b.y)*rect.height/2),delta=q.clone().sub(p),t=THREE.MathUtils.clamp(pointer.clone().sub(p).dot(delta)/(delta.lengthSq()||1),0,1),d=pointer.distanceTo(p.addScaledVector(delta,t)),z=a.z+(b.z-a.z)*t;
      if(d<distance-.15||(Math.abs(d-distance)<=.15&&z<depth)){distance=d;depth=z;best=edge.id;}
    }}return best;
  }
  function selectRegion(g,e){
    const s=valid(),r=canvas.getBoundingClientRect(),camera=getCamera(),minX=Math.min(g.x,e.clientX),maxX=Math.max(g.x,e.clientX),minY=Math.min(g.y,e.clientY),maxY=Math.max(g.y,e.clientY);
    const ids=s.edges.filter(edge=>edge.points.length>1&&edge.points.every(point=>{const p=new THREE.Vector3(...point).project(camera),x=r.left+(p.x+1)*r.width/2,y=r.top+(1-p.y)*r.height/2;return p.z>=-1&&p.z<=1&&x>=minX&&x<=maxX&&y>=minY&&y<=maxY;})).map(edge=>edge.id);
    const next=g.mode==='replace'?new Set():new Set(s.selected);for(const id of ids){if(g.mode==='remove')next.delete(id);else next.add(id);}
    if(next.size>128)throw Error('Maximal 128 Kanten je Operation; einen kleineren Ausschnitt markieren.');
    discard();s.selected=next;draw();
  }
  canvas.addEventListener('pointerdown',e=>{if(!state||e.button!==0||gesture)return;e.preventDefault();e.stopImmediatePropagation();safe(()=>{valid();gesture={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false,mode:e.altKey?'remove':e.shiftKey?'add':'replace'};canvas.setPointerCapture(e.pointerId);});},true);
  canvas.addEventListener('pointermove',e=>{if(!state)return;if(gesture&&gesture.id===e.pointerId){e.preventDefault();e.stopImmediatePropagation();const g=gesture;g.moved ||= Math.hypot(e.clientX-g.x,e.clientY-g.y)>4;if(g.moved){const r=viewport.getBoundingClientRect();marquee.hidden=false;Object.assign(marquee.style,{left:Math.min(g.x,e.clientX)-r.left+'px',top:Math.min(g.y,e.clientY)-r.top+'px',width:Math.abs(e.clientX-g.x)+'px',height:Math.abs(e.clientY-g.y)+'px'});}return;}canvas.style.cursor=pick(e)!==null?'pointer':'crosshair';},true);
  canvas.addEventListener('pointerup',e=>{if(!gesture||gesture.id!==e.pointerId)return;e.preventDefault();e.stopImmediatePropagation();const g=gesture;endGesture();safe(()=>{if(g.moved)selectRegion(g,e);else{valid();const id=pick(e);if(id!==null)toggle(id);}});},true);
  canvas.addEventListener('pointercancel',e=>{if(gesture?.id===e.pointerId)endGesture();},true);
  canvas.addEventListener('lostpointercapture',e=>{if(gesture?.id===e.pointerId)endGesture();},true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&state){e.preventDefault();e.stopImmediatePropagation();close();}},true);
  $('edge-all').onclick=()=>safe(()=>{const s=valid();if(s.edges.length>128)throw Error('Maximal 128 Kanten je Operation; einen kleineren Ausschnitt markieren.');discard();s.selected=new Set(s.edges.map(e=>e.id));draw();});
  $('edge-none').onclick=()=>safe(()=>{valid().selected.clear();discard();draw();});
  $('edge-kind').onchange=discard;$('edge-amount').oninput=discard;$('edge-preview').onclick=()=>safe(()=>preview());$('edge-remove').onclick=()=>safe(()=>preview(true));$('edge-apply').onclick=()=>safe(apply);$('edge-cancel').onclick=close;
  return {open,close,toggle,preview,apply,isActive:()=>!!state,selectionChanged:()=>{if(state){try{if(getNode().id!==state.node.id)close();}catch{close();}}},revisionChanged:()=>{if(state&&getRevision()!==state.revision){close();toast('Modell geändert: Kantenbearbeitung geschlossen.');}},state:()=>state?{edges:structuredClone(state.edges),selected:[...state.selected],preview:!!state.preview,revision:state.revision}:null};
}
