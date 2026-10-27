import {AI_PROGRAM_TOOLS} from './cad-ai-program.js';

export function mountPythonModelling({anchor,value,onChange,preview,cancel}){
 const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Python-Modellierung';details.id='ai-python-panel';details.append(summary);
 const hint=document.createElement('p');hint.className='small-note';hint.textContent='Mit Python Körper und Konturen konstruieren oder vorhandene Teile bearbeiten. Die Berechnung bleibt lokal. Erst die geprüfte Vorschau übernehmen, um das Modell zu ändern.';
 const input=document.createElement('textarea');input.id='ai-python-code';input.rows=12;input.spellcheck=false;input.setAttribute('aria-label','Python-Modellskript');input.value=value;input.oninput=()=>onChange(input.value);
 const actions=document.createElement('div');actions.className='ai-controls';
 for(const [id,label,click]of [['ai-python-example','Beispiel einsetzen',()=>{input.value=AI_PROGRAM_TOOLS.python.example;onChange(input.value);}],['ai-python-preview','Python-Vorschau berechnen',()=>preview(input.value)],['ai-python-cancel','Berechnung abbrechen',cancel]]){
  const button=document.createElement('button');button.id=id;button.textContent=label;button.onclick=click;if(id==='ai-python-preview')button.className='primary';if(id==='ai-python-cancel')button.disabled=true;actions.append(button);
 }
 details.append(hint,input,actions);anchor.after(details);
}

export function appendPythonResults(root,report){
 for(const item of report?.meshOperations??[]){
  if(item.conversion?.engine==='FreeCAD'){
   const details=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');summary.textContent='FreeCAD: Geometrieprüfung und Messungen';pre.textContent=JSON.stringify(item.conversion,null,2);pre.dataset.noTranslate='';details.append(summary,pre);root.append(details);continue;
  }
  if(item.tool!=='python')continue;
  const details=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');summary.textContent='Python-Ausgabe';
  pre.textContent=[item.result?.stdout,item.result?.stderr,item.result?.value===null?'':JSON.stringify(item.result?.value,null,2)].filter(Boolean).join('\n')||'Berechnung erfolgreich.';pre.dataset.noTranslate='';details.append(summary,pre);root.append(details);
 }
}
