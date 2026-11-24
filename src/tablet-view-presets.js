import {validateCadView} from './cad-workspace.js';

const key='offlinecad-tablet-views-v1';
const fileId=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);

export function createTabletViewPresets(storage){
  function all(){
    storage.checkReadable?.(key);
    const data=JSON.parse(storage.getItem(key)??'{}');
    if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(id=>!fileId(id)))
      throw Error('Die gespeicherten Blickwinkel sind beschädigt.');
    return data;
  }
  function rows(data,id){
    const values=data[id]??[];
    if(!Array.isArray(values)||values.length>12||values.some(entry=>!entry||typeof entry.id!=='string'||
      typeof entry.name!=='string'||!entry.name.trim()||entry.name.length>60))
      throw Error('Die Blickwinkel für dieses Projekt sind beschädigt.');
    return values;
  }
  function apply(id,action,value,view){
    if(!fileId(id))throw Error('Projekt am PC speichern, um eigene Blickwinkel zu merken.');
    const data=all(),list=rows(data,id);
    if(action==='view-save'){
      const name=value.trim();
      if(!name||name.length>60)throw Error('Einen Namen bis 60 Zeichen eingeben.');
      if(list.some(entry=>entry.name===name))throw Error('Dieser Name ist schon vergeben.');
      if(list.length>=12)throw Error('Es sind bereits zwölf Blickwinkel für dieses Projekt gespeichert.');
      data[id]=[...list,{id:crypto.randomUUID(),name,view:validateCadView(view)}];
    }else if(action==='view-restore'||action==='view-remove'){
      const entry=list.find(entry=>entry.id===value);
      if(!entry)throw Error('Der Blickwinkel ist nicht mehr verfügbar.');
      if(action==='view-restore')return validateCadView(entry.view);
      const remaining=list.filter(item=>item!==entry);
      if(remaining.length)data[id]=remaining;
      else delete data[id];
    }else{
      throw Error('Eine unbekannte Blickwinkel-Aktion wurde abgewiesen.');
    }
    storage.setItem(key,JSON.stringify(data));
    return null;
  }
  return {list(id){return fileId(id)?rows(all(),id).map(({id,name})=>({id,name})):null;},apply};
}
