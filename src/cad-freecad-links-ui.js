const element=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
export function freeCADLinkLabel(value){
 if(value===null)return 'keine Quelle';
 if(Array.isArray(value))return value.length?value.map(freeCADLinkLabel).join('; '):'keine Quellen';
 if(value&&typeof value==='object'&&Object.hasOwn(value,'object'))return (value.object??'Quelle fehlt')+(value.subelements?.length?' · '+value.subelements.join(', '):'');
 return String(value??'');
}

/** Choices refer to the currently read FCStd revision. The native job checks
 * every chosen object/element again; this editor supplies no geometry proof. */
export function renderFreeCADLinkEditor({object,property,objects,onChange}){
 const host=element('div');host.className='freecad-link-editor';let entries=structuredClone(property.multiple?property.value:property.value?[property.value]:[{object:null,...(property.subelements?{subelements:[]}:{})}]);
 const emit=()=>onChange(property.multiple?structuredClone(entries):entries[0]?.object?structuredClone(entries[0]):null);
 function render(){host.replaceChildren();for(const [index,entry]of entries.entries()){
  const row=element('div'),choice=element('select');choice.required=!!property.multiple;choice.dataset.freecadLinkObject=object.name+'.'+property.name;choice.setAttribute('aria-label',object.label+' · '+property.name+' · Quelle '+(index+1));choice.append(new Option('Quelle ausdrücklich wählen',''));for(const candidate of objects)if(candidate.name!==object.name)choice.append(new Option(candidate.label+' ('+candidate.name+')',candidate.name));if(entry.object&&!objects.some(candidate=>candidate.name===entry.object))choice.append(new Option('Fehlende Quelle · '+entry.object,entry.object));choice.value=entry.object??'';row.append(choice);
  choice.onchange=()=>{entry.object=choice.value||null;if(property.subelements)entry.subelements=[];render();emit();};
  if(property.subelements){
   const selected=objects.find(candidate=>candidate.name===entry.object),parts=entry.subelements??[],list=element('div');if(!parts.length)list.append(element('small','Ganzes gewähltes Objekt'));
   for(const [partIndex,part]of parts.entries()){const tag=element('span',part+' '),remove=element('button','Entfernen');remove.type='button';remove.setAttribute('aria-label',part+' entfernen');remove.onclick=()=>{parts.splice(partIndex,1);render();emit();};tag.append(remove);list.append(tag);}
   const type=element('select'),number=element('input'),add=element('button','Quellelement hinzufügen');type.setAttribute('aria-label','Natives Quellelement');for(const [kind,label,count]of [['Face','Fläche',selected?.topology?.faces],['Edge','Kante',selected?.topology?.edges],['Vertex','Ecke',selected?.topology?.vertices]]){const option=new Option(label+' · '+(count??0),kind);option.disabled=!count;type.append(option);}const first=[...type.options].find(option=>!option.disabled);type.value=first?.value??'Face';number.type='number';number.min='1';number.step='1';number.value='1';number.setAttribute('aria-label','Nummer des nativen Quellelements');number.dataset.freecadLinkNumber='';const limit=()=>{number.max=String(selected?.topology?.[{Face:'faces',Edge:'edges',Vertex:'vertices'}[type.value]]??0);};limit();type.onchange=()=>{number.value='1';limit();};add.type='button';add.disabled=!first||parts.length>=64;add.dataset.freecadLinkUnavailable=String(add.disabled);number.disabled=type.disabled=!first;number.dataset.freecadLinkUnavailable=type.dataset.freecadLinkUnavailable=String(!first);add.dataset.freecadLinkElementAdd='';add.onclick=()=>{if(!number.checkValidity()||!Number.isSafeInteger(Number(number.value)))return;const part=type.value+Number(number.value);if(parts.includes(part))return;entry.subelements=[...parts,part];render();emit();};list.append(type,number,add);row.append(list);
  }
  if(property.multiple){const remove=element('button','Quelle entfernen');remove.type='button';remove.onclick=()=>{entries.splice(index,1);render();emit();};row.append(remove);}host.append(row);
 }
 if(property.multiple){const add=element('button','Weitere Quelle wählen');add.type='button';add.disabled=entries.length>=64;add.dataset.freecadLinkUnavailable=String(add.disabled);add.dataset.freecadLinkAdd='';add.onclick=()=>{entries.push({object:null,...(property.subelements?{subelements:[]}:{})});render();emit();};host.append(add);}
 }
 render();return host;
}
