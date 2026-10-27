// Original format-1 data contract. Geometry validity is checked separately by
// native construction; this parser imports no legacy geometry or mesh builder.
import {CAD_SHAPES} from './cad-shapes.js';
import {defaults,validParameters} from './parameters.js';
export const CAD_PLUGIN=Object.freeze({format:'OfflineCAD-Plugin',version:1,storageKey:'offlinecad-plugins-v1',favoritesKey:'offlinecad-favorites-v1',maxPackages:20,maxShapes:60,maxSources:100});
const id=/^[a-zA-Z0-9_-]{1,64}$/;
export function label(value,language='de'){return typeof value==='string'?value:value?.[language]||value?.de||value?.en||'';}
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
function validLabel(value){return typeof value==='string'?value.length>0&&value.length<=200:object(value)&&Object.keys(value).length>0&&Object.keys(value).every(k=>['de','en'].includes(k)&&typeof value[k]==='string'&&value[k].length>0&&value[k].length<=200);}
const fields=['type','size','pos','rot','mirror','solid','color','segments','params'];
function validSpec(spec){
  if(!object(spec)||Object.keys(spec).some(key=>!fields.includes(key)))return false;
  const definition=CAD_SHAPES.find(shape=>shape.type===spec.type);if(!definition||spec.type==='text')return false;
  const vector=(value,test)=>Array.isArray(value)&&value.length===3&&value.every(v=>typeof v==='number'&&Number.isFinite(v)&&test(v));
  if(Object.hasOwn(spec,'size')&&!vector(spec.size,v=>v>=.01&&v<=10000))return false;
  if(Object.hasOwn(spec,'pos')&&!vector(spec.pos,v=>Math.abs(v)<=100000))return false;
  if(Object.hasOwn(spec,'rot')&&!vector(spec.rot,v=>Math.abs(v)<=100000))return false;
  if(Object.hasOwn(spec,'mirror')&&!vector(spec.mirror,v=>v===1||v===-1))return false;
  if(Object.hasOwn(spec,'color')&&(typeof spec.color!=='string'||!/^#[\da-f]{6}$/i.test(spec.color)))return false;
  if(Object.hasOwn(spec,'solid')&&typeof spec.solid!=='boolean')return false;
  if(spec.segments&&(!Number.isInteger(spec.segments)||spec.segments<3||spec.segments>512))return false;
  const params=Object.hasOwn(spec,'params')?spec.params:defaults(spec.type),node={type:spec.type,...(Object.keys(params||{}).length||Object.hasOwn(spec,'params')?{params}:{})};
  return validParameters(node);
}
export function parsePlugin(value){
  if(!object(value)||value.format!==CAD_PLUGIN.format||value.version!==CAD_PLUGIN.version||typeof value.id!=='string'||!id.test(value.id)||!validLabel(value.name)||!Array.isArray(value.shapes)||!value.shapes.length||value.shapes.length>CAD_PLUGIN.maxShapes)throw Error('Ungültiges Formnaro-Formenpaket (Format 1).');
  if(Object.keys(value).some(key=>!['format','version','id','name','description','shapes'].includes(key))||value.description!==undefined&&!validLabel(value.description))throw Error('Das Formenpaket enthält ungültige Angaben.');
  const ids=new Set();
  for(const shape of value.shapes){
    if(!object(shape)||typeof shape.id!=='string'||!id.test(shape.id)||ids.has(shape.id)||!validLabel(shape.name)||shape.description!==undefined&&!validLabel(shape.description)||Object.keys(shape).some(key=>!['id','name','description','nodes'].includes(key))||!Array.isArray(shape.nodes)||!shape.nodes.length||shape.nodes.length>CAD_PLUGIN.maxSources)throw Error('Ungültige oder doppelte Formvorlage im Paket.');
    ids.add(shape.id);for(const spec of shape.nodes)if(!validSpec(spec))throw Error('Eine Formvorlage enthält ungültige Geometrieparameter.');
    if(shape.nodes.length>1&&!shape.nodes.some(node=>node.solid!==false&&node.type!=='countersink'))throw Error('Eine gruppierte Formvorlage benötigt mindestens einen Körper.');
  }
  return structuredClone(value);
}
export function loadPlugins(storage){
  try{
    const values=JSON.parse(storage.getItem(CAD_PLUGIN.storageKey)||'[]');if(!Array.isArray(values)||values.length>CAD_PLUGIN.maxPackages)return [];
    const ids=new Set(),packages=[];
    for(const value of values){try{const manifest=parsePlugin(value.manifest);if(ids.has(manifest.id)||typeof value.enabled!=='boolean')continue;ids.add(manifest.id);packages.push({...structuredClone(value),manifest});}catch{}}
    return packages;
  }catch{return [];}
}
export {parsePlugin as parseCadPlugin,label as cadPluginLabel,loadPlugins as loadCadPlugins};
