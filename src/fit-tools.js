import {validNode} from './geometry.js';

export function fittedSize(node,{gap,axes=[0,1],kind='opening',parentScale=[1,1,1]}){
  if(!Number.isFinite(gap)||gap<0||gap>5||!['opening','insert'].includes(kind)||!axes.length||axes.some(i=>![0,1,2].includes(i))
    ||parentScale.length!==3||parentScale.some(v=>!Number.isFinite(v)||v<=0))throw Error('Passung: 0–5 mm Spiel je Seite und mindestens eine Achse wählen.');
  const size=[...node.size],direction=kind==='opening'?1:-1;
  for(const axis of new Set(axes))size[axis]+=direction*2*gap/parentScale[axis];
  if(size.some(v=>!Number.isFinite(v)||v<.01||v>10000))throw Error('Die Passung würde das Teil zu klein oder zu groß machen.');return size;
}
export function fitCopy(node,options){
  const copy=structuredClone(node);copy.size=fittedSize(node,options);
  function ids(n){n.id=crypto.randomUUID();(n.children||[]).forEach(ids);}ids(copy);
  copy.solid=false;copy.locked=false;copy.hidden=false;copy.name=('Passung – '+node.name).slice(0,200);
  if(!validNode(copy))throw Error('Die Passungsform ist ungültig.');return copy;
}

export function createFitTools({storage,modal,safe,toast,getNode,getScale,apply,createHole,getLanguage=()=>'de'}){
  let presets=[];try{const data=JSON.parse(storage.getItem('offlinecad-general-fits-v1')||'[]');if(Array.isArray(data))presets=data.filter(p=>p&&typeof p.name==='string'&&Number.isFinite(p.gap)&&p.gap>=0&&p.gap<=5).slice(0,50);}catch{}
  const $=id=>document.getElementById(id);
  function open(){
    const node=structuredClone(getNode()),scale=getScale();
    modal('Passungshilfe',`<p>Spiel je Seite für Zapfen/Bohrung oder Deckel/Aufnahme. Bei 0,2 mm Spiel wird eine Öffnung insgesamt 0,4 mm größer, ein Einsatz 0,4 mm kleiner.</p>
      <label class="dialog-label">Bearbeitung<select id="general-fit-kind"><option value="opening">Bohrung / Aufnahme vergrößern</option><option value="insert">Zapfen / Deckel verkleinern</option></select></label>
      <label class="dialog-label">Spiel je Seite (mm)<input id="general-fit-gap" inputmode="decimal" value="0,2"></label>
      <div class="three-buttons">${['X','Y','Z'].map((v,i)=>`<label><input type="checkbox" id="general-fit-axis-${i}" ${i<2?'checked':''}> ${v}</label>`).join('')}</div>
      <p class="small-note">Ändert die Abmessungen entlang der lokalen Formachsen. Komplexe Konturen werden dabei skaliert. Werte beziehen sich auf das gedruckte Teil, auch unter Gruppenskalierung. Eigene erprobte Druckspiele verwenden.</p>
      <p id="general-fit-result" class="fit-result" role="status"></p>
      <label class="dialog-label">Gespeichertes Druckspiel<select id="general-fit-preset"><option value="">Eigener Wert</option></select></label>
      <label class="dialog-label">Vorlagenname<input id="general-fit-name" maxlength="100" value="Meine Passung"></label>
      <div class="two-buttons"><button id="general-fit-save">Spiel speichern</button><button id="general-fit-remove">Vorlage entfernen</button></div>
      <div class="modal-actions"><button id="general-fit-cancel">Abbrechen</button><button id="general-fit-hole">Lochform als Gegenstück</button><button id="general-fit-apply" class="primary">Maße übernehmen</button></div>`);
    if(getLanguage()==='en'){$('general-fit-gap').value='0.2';$('general-fit-name').value='My fit';}
    const kind=$('general-fit-kind');kind.value=node.solid?'insert':'opening';
    const options=()=>({gap:Number($('general-fit-gap').value.replace(',','.')),kind:kind.value,axes:[0,1,2].filter(i=>$('general-fit-axis-'+i).checked),parentScale:scale});
    const fmt=v=>v.toLocaleString(getLanguage()==='en'?'en-GB':'de-DE',{maximumFractionDigits:4});
    function update(){try{const size=fittedSize(node,options());$('general-fit-result').textContent='Vorher: '+node.size.map((v,i)=>fmt(v*scale[i])).join(' × ')+' mm · Nachher: '+size.map((v,i)=>fmt(v*scale[i])).join(' × ')+' mm';$('general-fit-apply').disabled=false;$('general-fit-hole').disabled=false;}catch(e){$('general-fit-result').textContent=e.message;$('general-fit-apply').disabled=true;$('general-fit-hole').disabled=true;}}
    for(const id of ['general-fit-kind','general-fit-gap',...['0','1','2'].map(i=>'general-fit-axis-'+i)])$(id).oninput=update;
    const select=$('general-fit-preset');for(const p of presets)select.append(new Option(p.name,p.id));select.onchange=()=>{const p=presets.find(p=>p.id===select.value);if(p){$('general-fit-gap').value=fmt(p.gap);$('general-fit-name').value=p.name;update();}};
    function persist(next){storage.setItem('offlinecad-general-fits-v1',JSON.stringify(next));presets=next;}
    $('general-fit-save').onclick=()=>safe(()=>{const gap=options().gap;fittedSize(node,options());const name=$('general-fit-name').value.trim();if(!name)throw Error('Vorlagenname fehlt.');const next=presets.filter(p=>p.id!==select.value);if(next.length>=50)throw Error('Maximal 50 Passungsvorlagen.');persist([...next,{id:select.value||crypto.randomUUID(),name,gap}]);toast('Druckspiel gespeichert.');open();});
    $('general-fit-remove').onclick=()=>safe(()=>{persist(presets.filter(p=>p.id!==select.value));open();});
    $('general-fit-cancel').onclick=()=>document.getElementById('modal').close();
    const unchanged=()=>{if(JSON.stringify(getNode())!==JSON.stringify(node)||JSON.stringify(getScale())!==JSON.stringify(scale))throw Error('Auswahl oder Modell wurde geändert. Passung erneut öffnen.');};
    $('general-fit-apply').onclick=()=>safe(async()=>{unchanged();const size=fittedSize(node,options());await apply(size);document.getElementById('modal').close();toast('Passungsmaße angewendet.');});
    $('general-fit-hole').onclick=()=>safe(async()=>{unchanged();await createHole({...options(),kind:'opening'});document.getElementById('modal').close();toast('Lochform mit Druckspiel erzeugt.');});
    update();
  }
  return {open};
}
