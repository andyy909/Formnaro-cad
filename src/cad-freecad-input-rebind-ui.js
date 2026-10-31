import {isFreeCADParameterField,freeCADTargetKey} from './cad-freecad-parameter-data.js';
import {resolveFreeCADDocumentTarget} from './cad-freecad-target.js';
import {freeCADSourceDigest} from './cad-freecad-source.js';

const element=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
const key=freeCADTargetKey;

export function renderFreeCADInputRebindings(host,{project,target,onChange}){
 const details=element('details'),summary=element('summary','Weitere Programmeingaben gemeinsam neu zuordnen'),select=element('select'),add=element('button','Programm zur gemeinsamen Neuzuordnung hinzufügen'),list=element('div'),rows=new Map(),sources=[];
 details.dataset.freecadInputRebindings='';select.setAttribute('aria-label','Weiteres gespeichertes FreeCAD-Programm');add.type='button';add.dataset.freecadAction='add-input-binding';select.append(new Option('Ein weiteres gespeichertes Programm ausdrücklich wählen',''));
 const programs=[];for(const run of project.projectParameters.freecad??[]){if(key(run.target)===key(target)||!project.projectParameters.bindings.some(b=>isFreeCADParameterField(b.field)&&key(b.target)===key(run.target)))continue;try{const context=resolveFreeCADDocumentTarget(project,run.target,{write:true});programs.push({run,context});select.append(new Option(context.node.name,String(programs.length-1)));}catch{/* Unwritable or missing programs cannot receive new inputs. */}}
 function visit(node,rootId,path,label){if(['cad','mesh','referenceMesh'].includes(node.kind))sources.push({target:{rootId,path},label});for(const child of node.children??[])visit(child,rootId,[...path,child.id],label+' / '+child.name);}for(const node of project.nodes)visit(node,node.id,[],node.name);
 details.append(summary,element('p','Vorhandene Eingabenamen bleiben erhalten. Fehlende Quellen bewusst neu wählen. Alle hier hinzugefügten Programme und ihre notwendigen Folgeänderungen werden mit dem Hauptprogramm in einer Vorschau berechnet.'),select,add,list);host.append(details);
 function update(){add.disabled=rows.size>=32||select.disabled;for(const option of select.options)if(option.value)option.disabled=rows.has(option.value);}
 add.onclick=()=>{const entry=programs[Number(select.value)];if(select.value===''||!entry||rows.has(select.value)||rows.size>=32)return;const index=select.value,section=element('fieldset'),remove=element('button','Dieses Programm entfernen'),inputs=[];section.append(element('legend',entry.context.node.name));
  for(const input of entry.run.inputs){const label=element('label'),choice=element('select');label.append(element('span','Eingabe '+input.name));choice.setAttribute('aria-label',entry.context.node.name+' · '+input.name);choice.required=true;choice.dataset.freecadInputBindingName=input.name;choice.append(new Option('Aktuelle Ersatzquelle ausdrücklich wählen',''));
   for(const source of sources){const s=source.target,t=entry.run.target;if(s.rootId===t.rootId&&s.path.length<=t.path.length&&s.path.every((id,i)=>id===t.path[i]))continue;choice.append(new Option(source.label,JSON.stringify(s)));}
   choice.value=input.unresolved?'':JSON.stringify(input.target);if(choice.selectedIndex<0)choice.value='';if(!choice.value)label.append(element('small','Gespeicherte Quelle fehlt oder ist noch nicht zugeordnet: '+input.target.rootId+(input.target.path.length?' / '+input.target.path.join(' / '):'')));choice.onchange=onChange;label.append(choice);section.append(label);inputs.push({name:input.name,select:choice});
  }
  if(!entry.run.inputs.length)section.append(element('p','Dieses Programm hat keine externen Eingaben.'));remove.type='button';remove.onclick=()=>{rows.delete(index);section.remove();update();onChange();};section.append(remove);list.append(section);rows.set(index,{entry,inputs});select.value='';update();onChange();
 };
 return {read(){return [...rows.values()].map(({entry,inputs})=>({target:structuredClone(entry.run.target),sourceDigest:freeCADSourceDigest(entry.context.node.metadata.freecadSource.documentBase64),inputs:inputs.map(input=>{if(!input.select.checkValidity())throw Error('Alle vorgemerkten FreeCAD-Eingaben ausdrücklich neu wählen.');return {name:input.name,target:JSON.parse(input.select.value)};})}));}};
}
