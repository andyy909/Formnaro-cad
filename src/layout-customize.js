// Explicit controls also reach tools that are outside the visible drag area.
export function mountLayoutCustomize(root,{items,getDraft,change,t=v=>v}){
  const section=document.createElement('details');section.className='layout-customize';
  section.innerHTML='<summary>Alle Werkzeuge und Bereiche anpassen</summary><div class="layout-customize-grid"><label>Werkzeug<select id="layout-tool-picker"></select></label><label>Bereich<select id="layout-tool-zone"></select></label><div class="layout-tool-order"><button id="layout-tool-back" type="button">← Früher</button><button id="layout-tool-forward" type="button">Später →</button></div><label class="layout-tool-visible"><input id="layout-tool-visible" type="checkbox"> Werkzeug anzeigen</label><label>Formen und Objekte<select id="layout-library-order"><option value="false">Formen oben</option><option value="true">Objekte oben</option></select></label><label>Eigenschaften<select id="layout-inspector-order"><option value="false">Form bearbeiten oben</option><option value="true">Arbeitsfläche oben</option></select></label></div>';
  root.querySelector('.layout-name-label').before(section);
  const $=id=>section.querySelector('#'+id),picker=$('layout-tool-picker'),zone=$('layout-tool-zone'),visible=$('layout-tool-visible');
  for(const [key,node]of items){const option=document.createElement('option');option.value=key;option.textContent=t((node.getAttribute('aria-label')||node.title||node.textContent).trim());picker.append(option);}
  function refresh(){const draft=getDraft();if(!draft)return;const key=picker.value,current=Object.keys(draft.zones).find(zone=>draft.zones[zone].includes(key));zone.replaceChildren();
    for(const name of current==='mode'?['mode']:['header','toolbar','view']){const option=document.createElement('option');option.value=name;option.textContent=t({header:'Dateileiste oben',toolbar:'Werkzeugleiste',view:'Ansichtswerkzeuge',mode:'Bewegungswerkzeuge'}[name]);zone.append(option);}zone.value=current;
    visible.checked=!draft.hiddenTools.includes(key);visible.disabled=key==='settings';$('layout-library-order').value=String(draft.objectsFirst);$('layout-inspector-order').value=String(draft.workspaceFirst);
  }
  picker.onchange=refresh;
  zone.onchange=()=>{const next=structuredClone(getDraft()),key=picker.value;for(const keys of Object.values(next.zones)){const index=keys.indexOf(key);if(index>=0)keys.splice(index,1);}next.zones[zone.value].push(key);change(next);refresh();};
  function move(delta){const next=structuredClone(getDraft()),keys=next.zones[zone.value],index=keys.indexOf(picker.value),target=Math.max(0,Math.min(keys.length-1,index+delta));[keys[index],keys[target]]=[keys[target],keys[index]];change(next);refresh();}
  $('layout-tool-back').onclick=()=>move(-1);$('layout-tool-forward').onclick=()=>move(1);
  visible.onchange=()=>{const next=structuredClone(getDraft());next.hiddenTools=next.hiddenTools.filter(key=>key!==picker.value);if(!visible.checked)next.hiddenTools.push(picker.value);change(next);refresh();};
  for(const [id,key]of [['layout-library-order','objectsFirst'],['layout-inspector-order','workspaceFirst']])$(id).onchange=()=>{const next=structuredClone(getDraft());next[key]=$(id).value==='true';change(next);refresh();};
  refresh();return {refresh};
}
