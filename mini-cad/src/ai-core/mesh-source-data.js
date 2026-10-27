import {validateMeshLidOptions} from './mesh-lid.js';
import {validateCounterpartOptions} from './mesh-counterpart.js';
import {validateMeshHollowOptions} from './mesh-hollow.js';
import {validateMeshMakeSolidOptions} from './mesh-make-solid.js';
import {validateMeshEraseFillOptions} from './mesh-erase-fill.js';
import {validateMeshSculptOptions} from './mesh-sculpt.js';
import {validateMeshSmoothOptions} from './mesh-smooth.js';
import {validateMeshRemeshOptions} from './mesh-remesh.js';
import {validateMeshReduceOptions} from './mesh-reduce.js';
import {validateConnectorOptions,validateConnectorReference} from './mesh-connectors.js';
import {validateHoleFillOptions} from './mesh-hole-fill.js';
import {validNode} from './mesh-engine/geometry.js';
import {validateSimpleRepairOptions} from './mesh-simple-repair.js';

/** The legacy reader's recipes and nested sources are archived independently of
 * the current world transform. No kernel handles or cached render buffers. */
export function validateMeshSource(value,{validateSourceNode}={}){
  if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).some(k=>!['format','version','node',...(value.version>=2?['sources','operation']:[]),...(value.version===3?['appearance']:[])].includes(k))||value.format!=='Formnaro-MeshSource'||![1,2,3].includes(value.version)||!validNode(value.node))throw Error('Ungültige erhaltene Netzquelle.');
  const active=new Set();let count=0;
  function plain(v,depth=0){
    if(++count>10000000||depth>40)throw Error('Erhaltene Netzquelle ist zu groß oder zu tief.');
    if(v===null||typeof v==='string'||typeof v==='boolean')return v;
    if(typeof v==='number'&&Number.isFinite(v))return v===0?0:v;
    if(!v||typeof v!=='object'||active.has(v)||!([Object.prototype,null].includes(Object.getPrototypeOf(v))||Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype))throw Error('Ungültige Daten in der Netzquelle.');
    active.add(v);const out=Array.isArray(v)?v.map(x=>plain(x,depth+1)):Object.fromEntries(Object.entries(v).map(([k,x])=>{if(['__proto__','constructor','prototype'].includes(k))throw Error('Ungültiger Schlüssel in der Netzquelle.');return [k,plain(x,depth+1)];}));active.delete(v);return out;
  }
  const clean=plain(value),out={format:value.format,version:value.version,node:clean.node};
  if(value.version===3&&clean.appearance!==undefined){if(!clean.appearance||Object.keys(clean.appearance).length!==1||typeof clean.appearance.multicolor!=='boolean')throw Error('Ungültige gespeicherte Netzfarben.');out.appearance=clean.appearance;}
  if(value.version===2||value.version===3&&(clean.sources!==undefined||clean.operation!==undefined)){
    if(typeof validateSourceNode!=='function'||!Array.isArray(clean.sources)||!clean.sources.length||clean.sources.length>500)throw Error('Die Netzoperation benötigt erhaltene Originalteile.');
    const op=clean.operation;
    if(!op||Array.isArray(op)||Object.keys(op).some(k=>!['type','mode','plane','reference','options','edgeIds','part','suppressedIds'].includes(k))||!['group','drill','split','bodies','finish','repair','connectors','reduce','remesh','smooth','sculpt','erase-fill','make-solid','hollow','lid','counterpart'].includes(op.type))throw Error('Ungültiges erhaltenes Netzverfahren.');
    if(op.type==='repair'&&value.version!==3)throw Error('Die erhaltene Reparatur benötigt Netzquellformat 3.');
    if(op.suppressedIds!==undefined&&(!Array.isArray(op.suppressedIds)||op.suppressedIds.length>500||new Set(op.suppressedIds).size!==op.suppressedIds.length||op.suppressedIds.some(id=>typeof id!=='string'||!id||id.length>200||!clean.sources.some(source=>source.id===id))))throw Error('Ungültige unterdrückte Netzquellen.');
    if(op.part!==undefined&&(!Number.isInteger(op.part)||op.part<0||op.part>499))throw Error('Ungültiger erhaltener Netzbestandteil.');
    if(op.mode!==undefined&&!['union','intersection','difference'].includes(op.mode))throw Error('Ungültige Netz-Gruppenoperation.');
    const vector=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
    if(op.plane!==undefined&&(!op.plane||Object.keys(op.plane).some(k=>!['normal','offset'].includes(k))||!vector(op.plane.normal)||Math.hypot(...op.plane.normal)<1e-12||!Number.isFinite(op.plane.offset)))throw Error('Ungültige erhaltene Netz-Schnittebene.');
    if(op.reference!==undefined&&(!op.reference||Object.keys(op.reference).some(k=>!['point','normal'].includes(k))||!vector(op.reference.point)||!vector(op.reference.normal)||Math.hypot(...op.reference.normal)<1e-12))throw Error('Ungültiger erhaltener Netz-Bohrbezug.');
    if(op.options!==undefined&&(!op.options||Array.isArray(op.options)||Object.getPrototypeOf(op.options)!==Object.prototype))throw Error('Ungültige erhaltene Netzparameter.');
    if(op.type==='repair'&&op.options?.method!==undefined){if(op.options.method==='planar-cap-v1')validateHoleFillOptions(op.options);else validateSimpleRepairOptions(op.options);}
    if(op.type==='reduce'){if(value.version!==3||clean.sources.length!==1||Object.keys(op).some(k=>!['type','options'].includes(k)))throw Error('Ungültige erhaltene Vereinfachung.');validateMeshReduceOptions(op.options);}
    if(op.type==='remesh'){if(value.version!==3||clean.sources.length!==1||Object.keys(op).some(k=>!['type','options'].includes(k)))throw Error('Ungültige erhaltene Neuvernetzung.');validateMeshRemeshOptions(op.options);}
    if(op.type==='sculpt'){if(value.version!==3||clean.sources.length!==1||Object.keys(op).some(k=>!['type','options'].includes(k)))throw Error('Ungültiger erhaltener Pinselstrich.');validateMeshSculptOptions(op.options);}
    if(op.type==='smooth'){if(value.version!==3||clean.sources.length!==1||Object.keys(op).some(k=>!['type','options'].includes(k)))throw Error('Ungültige erhaltene Glättung.');validateMeshSmoothOptions(op.options);}
    if(op.type==='erase-fill'){if(value.version!==3||clean.sources.length!==1||Object.keys(op).some(k=>!['type','options'].includes(k)))throw Error('Ungültiges erhaltenes Bereichsersetzen.');validateMeshEraseFillOptions(op.options);}
    if(op.type==='make-solid'){if(value.version!==3||clean.sources.length!==1||Object.keys(op).some(k=>!['type','options'].includes(k)))throw Error('Ungültige erhaltene geschlossene Annäherung.');validateMeshMakeSolidOptions(op.options);}
    if(op.type==='lid'){if(value.version!==3||clean.sources.length!==1||Object.keys(op).some(k=>!['type','options'].includes(k)))throw Error('Ungültiger erhaltener Deckel.');validateMeshLidOptions(op.options);}
    if(op.type==='counterpart'){if(value.version!==3||clean.sources.length!==1||Object.keys(op).some(k=>!['type','options'].includes(k)))throw Error('Ungültiges erhaltenes Gegenstück.');validateCounterpartOptions(op.options);}
    if(op.type==='hollow'){if(value.version!==3||clean.sources.length!==1||Object.keys(op).some(k=>!['type','options'].includes(k)))throw Error('Ungültiges erhaltenes Aushöhlen.');validateMeshHollowOptions(op.options);}
    if(op.type==='connectors'){if(value.version!==3||clean.sources.length!==2||new Set(clean.sources.map(n=>n.id)).size!==2||![0,1].includes(op.part)||op.mode!==undefined||op.plane!==undefined||op.edgeIds!==undefined||op.suppressedIds!==undefined)throw Error('Ungültige erhaltene Steckverbindung.');validateConnectorReference(op.reference);validateConnectorOptions(op.options);}
    if(op.edgeIds!==undefined&&(!Array.isArray(op.edgeIds)||op.edgeIds.length>128||op.edgeIds.some(id=>typeof id!=='string'||!id||id.length>200)))throw Error('Ungültige erhaltene Netzkanten.');
    out.sources=clean.sources.map(source=>{if(source?.kind!=='mesh')throw Error('Netzquellen müssen originale Netzteile sein.');return validateSourceNode(source);});out.operation=op;
  }
  return out;
}

export function validateMigrationSource(value){
  if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).some(k=>!['format','version','data'].includes(k))||value.format!=='OfflineCAD'||![1,2,3,4,6].includes(value.version)||typeof value.data!=='string'||new TextEncoder().encode(value.data).length>50*1024*1024)throw Error('Ungültige Originalprojekt-Sicherung.');
  const original=JSON.parse(value.data);if(original.format!==value.format||original.version!==value.version||!Array.isArray(original.nodes))throw Error('Originalprojekt-Sicherung widerspricht der Projektversion.');
  return {format:value.format,version:value.version,data:value.data};
}
