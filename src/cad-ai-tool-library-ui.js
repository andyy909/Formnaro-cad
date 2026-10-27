import {aiToolEditorCode} from './cad-ai-tool-editor.js';
export function mountAIToolLibrary({anchor,desktop,download,loadPython,getPython}){
 if(!anchor||!desktop?.aiToolLibrary)return;
 const panel=document.createElement('details');panel.id='ai-tool-library';
 const summary=document.createElement('summary');summary.textContent='Gespeicherte KI-Werkzeuge';panel.append(summary);
 const note=document.createElement('p');note.className='small-note';note.textContent='Vollständige Skripte und Hilfsfunktionen bleiben im lokalen Datenordner erhalten. Jede Änderung speichert eine eigene Version. Mit FreeCAD markierte Werkzeuge laufen in der nativen FreeCAD-Umgebung. Frühere Berechnungen sind kein Prüfnachweis für ein neues Teil.';panel.append(note);
 const search=document.createElement('input');search.type='search';search.placeholder='Werkzeug suchen';search.setAttribute('aria-label','Werkzeug suchen');
 const name=document.createElement('input');name.placeholder='Name für das Python-Werkzeug';name.setAttribute('aria-label','Werkzeugname');
 const refresh=document.createElement('button');refresh.textContent='Suchen';
 const save=document.createElement('button');save.textContent='Python-Code als Werkzeug speichern';
 const list=document.createElement('div'),status=document.createElement('p');status.role='status';const more=document.createElement('button');more.textContent='Weitere Versionen';more.hidden=true;let nextOffset=null;
 async function show(offset=0){
  try{const result=await desktop.aiToolLibrary({action:'search',search:search.value,offset,limit:20});if(!offset)list.replaceChildren();nextOffset=result.nextOffset;more.hidden=nextOffset===null;status.textContent=result.total+' gespeicherte Versionen';
   for(const item of result.tools){const row=document.createElement('details'),title=document.createElement('summary');title.textContent=item.name+' · '+item.language+' · '+item.revision.slice(0,10);row.append(title);let loaded=false;
    row.addEventListener('toggle',async()=>{if(!row.open||loaded)return;try{const r=await desktop.aiToolLibrary({action:'read',revision:item.revision});loaded=true;const description=document.createElement('p');description.textContent=r.tool.description;const source=document.createElement('textarea');source.readOnly=true;source.rows=10;source.spellcheck=false;source.value=r.tool.code;source.setAttribute('aria-label','Gespeicherter Werkzeugcode');const exportButton=document.createElement('button');exportButton.textContent='Werkzeug exportieren';exportButton.onclick=()=>download(JSON.stringify(r,null,2),'Formnaro-Werkzeug-'+item.revision.slice(0,12)+'.json','application/json');row.append(description,source,exportButton);if(r.tool.language==='python'){const use=document.createElement('button');use.textContent=r.tool.tags?.includes('FreeCAD')?'Als FreeCAD-Auftrag laden':'In Python-Editor laden';use.onclick=()=>loadPython(aiToolEditorCode(r.tool));row.append(use);}}catch(e){status.textContent=e.message;}});list.append(row);}
  }catch(e){status.textContent=e.message;}
 }
 refresh.onclick=()=>show();more.onclick=()=>show(nextOffset);search.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();void show();}};
 save.onclick=async()=>{try{await desktop.aiToolLibrary({action:'save',tool:{name:name.value,language:'python',code:getPython(),description:'Gespeichert aus der Python-Werkstatt.',tags:['Werkzeug']}});await show();}catch(e){status.textContent=e.message;}};
 let initialized=false;panel.addEventListener('toggle',()=>{if(panel.open&&!initialized){initialized=true;void show();}});
 panel.append(search,refresh,name,save,status,list,more);anchor.after(panel);
}
