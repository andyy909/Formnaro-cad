import {makeNode,validNode} from './engine/geometry.js';
export const FORMAT='Formnaro-Mini';
export const MAX_BYTES=32*1024*1024;
export const SHAPES=[
  ['box','Quader','box','#ef8056'],['cylinder','Zylinder','cylinder','#e4ad47'],
  ['sphere','Kugel','sphere','#74a3c7'],['cone','Kegel','cone','#8aac79'],
  ['roundbox','Rundquader','roundbox','#db927c'],['tube','Rohr','tube','#8da2cc'],
  ['hexagon','Sechseck','hexagon','#a18fc2'],['pyramid','Pyramide','pyramid','#bf8aab'],
  ['torus','Ring','torus','#ce8c9b'],['star','Stern','star','#dbb25e'],
  ['heart','Herz','heart','#d68a94'],['halfSphere','Halbkugel','sphere','#8ba991'],
];
const allowed=new Set([...SHAPES.map(s=>s[0]),'group','import']);
export const emptyProject=()=>({format:FORMAT,version:1,name:'Mein Projekt',nodes:[]});
export function createNode(type,quality=64){
  const shape=SHAPES.find(s=>s[0]===type);if(!shape)throw Error('Diese Form ist in Mini nicht verfügbar.');
  return makeNode(type,undefined,{color:shape[3],segments:quality});
}
export function validateProject(value){
  if(!value||value.format!==FORMAT||value.version!==1)throw Error('Bitte ein Formnaro-Mini-Projekt (.fmini) öffnen.');
  if(typeof value.name!=='string'||!value.name.trim()||value.name.length>100||!Array.isArray(value.nodes)||value.nodes.length>200)throw Error('Ungültiger Projektname oder zu viele Teile (maximal 200).');
  const ids=new Set();let count=0,triangles=0;
  function visit(n,depth=0){
    if(++count>1000||depth>12||!allowed.has(n?.type)||!validNode(n)||ids.has(n.id)||n.id.length>100||typeof n.hidden!=='boolean'||typeof n.locked!=='boolean')throw Error('Das Projekt enthält ungültige oder nicht unterstützte Teile.');
    ids.add(n.id);if(n.mesh){triangles+=n.mesh.triangles.length/3;if(!n.mesh.verts.length||!n.mesh.triangles.length)throw Error('Leeres Netz im Projekt.');}
    if(n.repairSource!==undefined){const s=n.repairSource;if(n.type!=='import'&&n.type!=='group'||!s||Object.keys(s).some(k=>!['verts','triangles'].includes(k))||!Array.isArray(s.verts)||!Array.isArray(s.triangles)||!s.verts.length||s.verts.length%3||s.verts.length>3000000||s.verts.some(v=>!Number.isFinite(v))||!s.triangles.length||s.triangles.length%3||s.triangles.some(v=>!Number.isSafeInteger(v)||v<0||v>=s.verts.length/3))throw Error('Ungültige erhaltene Reparaturquelle.');triangles+=s.triangles.length/3;}
    if(n.repairReport!==undefined&&(!n.repairSource||!n.repairReport||Object.getPrototypeOf(n.repairReport)!==Object.prototype||JSON.stringify(n.repairReport).length>12000))throw Error('Ungültiger Reparaturbericht.');
    if(n.folder!==undefined&&(typeof n.folder!=='string'||n.folder.length>100))throw Error('Ungültiger Teileordner.');
    if(n.cad||n.edgeFinish||n.partition||n.sketch||n.aiMarks||n.suppressed||n.type==='group'&&!n.children?.length)throw Error('Diese Projektdaten werden von Mini nicht unterstützt.');
    if(triangles>500000)throw Error('Für Mini sind maximal 500.000 Dreiecke pro Projekt vorgesehen.');
    n.children?.forEach(c=>visit(c,depth+1));
  }
  value.nodes.forEach(n=>visit(n));
  return {format:FORMAT,version:1,name:value.name,nodes:value.nodes};
}
export function decodeProject(text){if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_BYTES)throw Error('Projekt ist größer als 32 MB.');return validateProject(JSON.parse(text));}
export function encodeProject(project){const text=JSON.stringify(validateProject(project));if(new TextEncoder().encode(text).length>MAX_BYTES)throw Error('Projekt ist größer als 32 MB.');return text;}
export function cloneNodes(nodes){return structuredClone(nodes);}
export function renewIds(node){node.id=crypto.randomUUID();node.children?.forEach(renewIds);return node;}
export class History{
  constructor(){this.past=[];this.future=[];this.bytes=0;}
  push(text){if(this.past.at(-1)===text)return;this.past.push(text);this.future=[];this.bytes+=text.length*2;while(this.past.length>60||this.bytes>24*1024*1024&&this.past.length>1)this.bytes-=this.past.shift().length*2;}
  undo(current){if(!this.past.length)return null;this.future.push(current);const text=this.past.pop();this.bytes-=text.length*2;return text;}
  redo(current){if(!this.future.length)return null;const next=this.future.pop();this.past.push(current);this.bytes+=current.length*2;return next;}
  clear(){this.past=[];this.future=[];this.bytes=0;}
}
export function geometryKey(n){return JSON.stringify([n.type,n.params||null,n.mesh||null,n.mesh?null:n.size,n.segments]);}
