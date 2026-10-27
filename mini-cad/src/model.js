import {renewCadSource} from './cad-source-clone.js';
import {makeNode} from './engine/geometry.js';

import {validParameters} from './engine/parameters.js';

import {validateAffineMatrix} from './native/cad-project.js';

export const FORMAT='Formnaro-Mini-CAD';

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

  if(!value||value.format!==FORMAT||![1,2].includes(value.version))throw Error('Bitte ein Mini-CAD-Projekt (.fmcad) öffnen.');

  if(typeof value.name!=='string'||!value.name.trim()||value.name.length>100||!Array.isArray(value.nodes)||value.nodes.length>200)throw Error('Ungültiger Projektname oder zu viele Teile (maximal 200).');

  const ids=new Set();let count=0,brepBytes=0,meshTriangles=0;

  function visit(n,depth=0){

    if(++count>1000||depth>12||!allowed.has(n?.type)||!validNode(n)||ids.has(n.id)||n.id.length>100||typeof n.hidden!=='boolean'||typeof n.locked!=='boolean')throw Error('Das Projekt enthält ungültige oder nicht unterstützte CAD-Teile.');

    ids.add(n.id);if(n.mesh){const m=n.mesh;if(!Array.isArray(m.verts)||!Array.isArray(m.triangles)||m.verts.length<9||m.verts.length%3||m.verts.length>3000000||m.verts.some(v=>!Number.isFinite(v))||!m.triangles.length||m.triangles.length%3||m.triangles.some(v=>!Number.isSafeInteger(v)||v<0||v>=m.verts.length/3))throw Error('Ungültiges Rohnetz.');meshTriangles+=m.triangles.length/3;if(meshTriangles>500000)throw Error('Rohnetze überschreiten 500.000 Dreiecke je Projekt.');}if(n.brep){const bytes=new TextEncoder().encode(n.brep).length;if(bytes>12*1024*1024)throw Error('CAD-Körper ist größer als 12 MB.');brepBytes+=bytes;}

    if(n.folder!==undefined&&(typeof n.folder!=='string'||n.folder.length>100))throw Error('Ungültiger Teileordner.');

    if(n.mesh&&(n.type!=='import'||n.brep)||n.cad||n.edgeFinish||n.partition||n.sketch||n.aiMarks||n.suppressed||n.type==='group'&&!n.children?.length)throw Error('Diese Projektdaten werden von Mini CAD nicht unterstützt.');

    if(brepBytes>24*1024*1024)throw Error('CAD-Daten überschreiten 24 MB.');

    if(n.cadSource!==undefined){if(typeof n.cadSource!=='string'||n.cadSource.length>12*1024*1024||!n.brep)throw Error('Ungültige gespeicherte KI-CAD-Quelle.');let source;try{source=JSON.parse(n.cadSource);}catch{throw Error('Ungültige gespeicherte CAD-Quelle.');}
      const sourceVisit=(v,level=0)=>{if(!v||typeof v!=='object'||v.kind!=='cad'||typeof v.id!=='string'||!v.id||level>12||!Array.isArray(v.transform)||v.transform.length!==16||!v.transform.every(Number.isFinite)||!v.brep||typeof v.brep.data!=='string'||!/^\s*CASCADE Topology V[123],/.test(v.brep.data))throw Error('Ungültiger nativer Quellenbaum.');if(level){if(++count>1000||ids.has(v.id))throw Error('Zu viele oder doppelte CAD-Quellen.');ids.add(v.id);}if(v.children!==undefined){if(!Array.isArray(v.children))throw Error('Ungültige CAD-Kinder.');v.children.forEach(c=>sourceVisit(c,level+1));}};sourceVisit(source);
      brepBytes+=new TextEncoder().encode(n.cadSource).length;if(brepBytes>24*1024*1024)throw Error('CAD-Daten überschreiten 24 MB.');}

    n.children?.forEach(c=>visit(c,depth+1));

    if(n.originalSource){validateAffineMatrix(n.originalSource.transform);visit(n.originalSource.node,depth+1);}

  }

  value.nodes.forEach(n=>visit(n));

  if(value.cadWorkspace!==undefined&&(typeof value.cadWorkspace!=='object'||!value.cadWorkspace||Array.isArray(value.cadWorkspace)||JSON.stringify(value.cadWorkspace).length>100000))throw Error('Ungültiger CAD-Arbeitskontext.');
  return {format:FORMAT,version:value.nodes.some(n=>n.mesh)?2:1,name:value.name,nodes:value.nodes,...(value.cadWorkspace?{cadWorkspace:value.cadWorkspace}:{})};

}

export function decodeProject(text){if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_BYTES)throw Error('Projekt ist größer als 32 MB.');return validateProject(JSON.parse(text));}

export function encodeProject(project){const text=JSON.stringify(validateProject(project));if(new TextEncoder().encode(text).length>MAX_BYTES)throw Error('Projekt ist größer als 32 MB.');return text;}

export function cloneNodes(nodes){return structuredClone(nodes);}

export function renewIds(node){node.id=crypto.randomUUID();node.children?.forEach(renewIds);if(node.cadSource)node.cadSource=JSON.stringify(renewCadSource(JSON.parse(node.cadSource),node.id));if(node.originalSource)renewIds(node.originalSource.node);return node;}

export class History{

  constructor(){this.past=[];this.future=[];this.bytes=0;}

  push(text){if(this.past.at(-1)===text)return;this.past.push(text);this.future=[];this.bytes+=text.length*2;while(this.past.length>60||this.bytes>24*1024*1024&&this.past.length>1)this.bytes-=this.past.shift().length*2;}

  undo(current){if(!this.past.length)return null;this.future.push(current);const text=this.past.pop();this.bytes-=text.length*2;return text;}

  redo(current){if(!this.future.length)return null;const next=this.future.pop();this.past.push(current);this.bytes+=current.length*2;return next;}

  clear(){this.past=[];this.future=[];this.bytes=0;}

}

export function geometryKey(n){return JSON.stringify([n.type,n.params||null,n.brep||null,n.baseSize||null,n.mesh?null:n.size,n.segments,n.mesh||null]);}



function validNode(n){

  if(!n||typeof n.id!=='string'||!n.id||typeof n.name!=='string'||!n.name.trim()||n.name.length>200)return false;

  if(!['size','pos','rot'].every(k=>Array.isArray(n[k])&&n[k].length===3&&n[k].every(v=>typeof v==='number'&&Number.isFinite(v))))return false;

  if(n.size.some(v=>v<.01||v>10000)||n.pos.some(v=>Math.abs(v)>100000)||n.rot.some(v=>Math.abs(v)>100000))return false;

  if(!/^#[\da-f]{6}$/i.test(n.color)||typeof n.solid!=='boolean'||!validParameters(n))return false;

  if(n.mirror&&(!Array.isArray(n.mirror)||n.mirror.length!==3||n.mirror.some(v=>v!==1&&v!==-1)))return false;

  if(![32,64,128].includes(n.segments)||n.notes!==undefined&&(typeof n.notes!=='string'||n.notes.length>4000))return false;

  if(n.brep!==undefined&&(typeof n.brep!=='string'||!/^\s*CASCADE Topology V[123],/.test(n.brep)||!Array.isArray(n.baseSize)||n.baseSize.length!==3||n.baseSize.some(v=>!Number.isFinite(v)||v<.01||v>10000)))return false;

  if(['import','group'].includes(n.type)&&!n.brep&&!(n.type==='import'&&n.mesh))return false;

  if(n.type==='group'&&(!['union','intersection'].includes(n.operation)||!Array.isArray(n.children)||!n.children.length))return false;

  if(n.children&&n.type!=='group')return false;

  return true;

}

