import {makeNode,validNode,SHAPES} from './geometry.js';
const id=/^[a-zA-Z0-9_-]{1,64}$/;
export function label(value,language='de'){return typeof value==='string'?value:value?.[language]||value?.de||value?.en||'';}
function validLabel(value){return typeof value==='string'?value.length>0&&value.length<=200:value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length>0&&Object.keys(value).every(k=>['de','en'].includes(k)&&typeof value[k]==='string'&&value[k].length>0&&value[k].length<=200);}
const keys=['type','size','pos','rot','mirror','solid','color','segments','params'];
export function parsePlugin(value){
  if(!value||value.format!=='OfflineCAD-Plugin'||value.version!==1||typeof value.id!=='string'||!id.test(value.id)||!validLabel(value.name)||!Array.isArray(value.shapes)||!value.shapes.length||value.shapes.length>60)throw new Error('Ungültiges Formnaro-Formenpaket (Format 1).');
  if(Object.keys(value).some(k=>!['format','version','id','name','description','shapes'].includes(k))||value.description!==undefined&&!validLabel(value.description))throw new Error('Das Formenpaket enthält ungültige Angaben.');
  const ids=new Set();
  for(const shape of value.shapes){
    if(!shape||typeof shape.id!=='string'||!id.test(shape.id)||ids.has(shape.id)||!validLabel(shape.name)||shape.description!==undefined&&!validLabel(shape.description)||Object.keys(shape).some(k=>!['id','name','description','nodes'].includes(k))||!Array.isArray(shape.nodes)||!shape.nodes.length||shape.nodes.length>100)throw new Error('Ungültige oder doppelte Formvorlage im Paket.');ids.add(shape.id);
    for(const spec of shape.nodes){
      if(!spec||Object.keys(spec).some(k=>!keys.includes(k))||!SHAPES.some(s=>s[0]===spec.type)||spec.type==='text'||!validNode(makeNode(spec.type,spec.pos,{...spec})))throw new Error('Eine Formvorlage enthält ungültige Geometrieparameter.');
    }
    if(shape.nodes.length>1&&!shape.nodes.some(n=>n.solid!==false&&n.type!=='countersink'))throw new Error('Eine gruppierte Formvorlage benötigt mindestens einen Körper.');
  }
  return structuredClone(value);
}
export function loadPlugins(storage){
  try{const values=JSON.parse(storage.getItem('offlinecad-plugins-v1')||'[]');if(!Array.isArray(values)||values.length>20)return [];
    const ids=new Set();return values.filter(p=>{try{parsePlugin(p.manifest);if(ids.has(p.manifest.id)||typeof p.enabled!=='boolean')return false;ids.add(p.manifest.id);return true;}catch{return false;}});
  }catch{return [];}
}
