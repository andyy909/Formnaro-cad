export const LAYOUT_KEY='offlinecad-layout-v1';
import {defaultLayout,validateLayout} from '../backend/layout-data.mjs';
export {LAYOUT_DEFAULTS,defaultLayout,validateLayout} from '../backend/layout-data.mjs';
export function loadLayout(storage){try{return validateLayout(JSON.parse(storage.getItem(LAYOUT_KEY)));}catch{return defaultLayout();}}
export function moveLayoutItem(value,key,zone,index){
  const next=validateLayout(value),source=Object.keys(next.zones).find(k=>next.zones[k].includes(key));
  if(!source||!Object.hasOwn(next.zones,zone))throw Error('Ungültiger Platz für dieses Werkzeug.');
  const compatible=source===zone||['header','toolbar','view'].includes(source)&&['header','toolbar','view'].includes(zone);
  if(!compatible||!Number.isInteger(index)||index<0||index>next.zones[zone]?.length)throw Error('Ungültiger Platz für dieses Werkzeug.');
  const oldIndex=next.zones[source].indexOf(key);next.zones[source].splice(oldIndex,1);
  next.zones[zone].splice(index-(source===zone&&index>oldIndex?1:0),0,key);
  return validateLayout(next);
}
