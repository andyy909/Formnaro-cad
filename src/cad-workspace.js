import {validateExplosion} from './cad-part-properties.js';
import {validateCadQuality} from './cad-quality.js';
import {validateLayout} from './layout-preferences.js';
import {validateMeshSelectionBinding} from './mesh-selection-data.js';
import {validateCadLoadSet} from './cad-assembly-display.js';
const object=(value,fields)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!fields.includes(k)))throw Error('Ungültiger gespeicherter Arbeitsplatz.');};
const vector=value=>{if(!Array.isArray(value)||value.length!==3||value.some(v=>!Number.isFinite(v)||Math.abs(v)>1e7))throw Error('Ungültige gespeicherte Ansicht.');return [...value];};
export const cadWorkspaceStoredProjectVersion=(version,workspace)=>workspace?.version===6?Math.max(25,version):workspace?.version===5&&version<8?8:version;
export function validateCadWorkspace(value){
  object(value,['version','view','selection','mode','snap','quality','layout',...(value?.version>=2?['tree']:[]),...(value?.version>=3?['section']:[]),...(value?.version>=4?['meshSelection']:[]),...(value?.version>=5?['loadSet']:[]),...(value?.version>=6?['explosion']:[])]);if(![1,2,3,4,5,6].includes(value.version))throw Error('Unbekannte Arbeitsplatzversion.');
  object(value.view,['projection','position','target','up','zoom']);const v=value.view;
  if(!['perspective','orthographic'].includes(v.projection)||!Number.isFinite(v.zoom)||v.zoom<1e-5||v.zoom>1e5)throw Error('Ungültige gespeicherte Ansicht.');
  const view={projection:v.projection,position:vector(v.position),target:vector(v.target),up:vector(v.up),zoom:v.zoom};
  if(Math.hypot(...view.up)<1e-7||Math.hypot(...view.position.map((n,k)=>n-view.target[k]))<1e-7)throw Error('Ungültige gespeicherte Kamerarichtung.');
  if(!['translate','scale','rotate'].includes(value.mode)||![0,.1,.25,.5,1,2,5].includes(value.snap)||!Array.isArray(value.selection)||value.selection.length>500)throw Error('Ungültiger gespeicherter Arbeitsplatz.');
  const selection=value.selection.map(v=>{object(v,['rootId','path']);if(typeof v.rootId!=='string'||!v.rootId.length||v.rootId.length>200||!Array.isArray(v.path)||v.path.length>12||v.path.some(id=>typeof id!=='string'||!id.length||id.length>200))throw Error('Ungültige gespeicherte Auswahl.');return {rootId:v.rootId,path:[...v.path]};});
  const result={version:value.version,view,selection,mode:value.mode,snap:value.snap,quality:validateCadQuality(value.quality),layout:validateLayout(value.layout)};
  if(value.version>=2){
    object(value.tree,['expanded']);if(!Array.isArray(value.tree.expanded)||value.tree.expanded.length>5000)throw Error('Ungültiger gespeicherter Objektbaum.');const seen=new Set();
    result.tree={expanded:value.tree.expanded.map(item=>{object(item,['kind','rootId','path']);if(!['object','meshSource'].includes(item.kind)||typeof item.rootId!=='string'||!item.rootId||item.rootId.length>200||!Array.isArray(item.path)||item.path.length>40||item.path.some(id=>typeof id!=='string'||!id||id.length>200))throw Error('Ungültiger gespeicherter Quellenpfad.');const key=JSON.stringify([item.kind,item.rootId,item.path]);if(seen.has(key))throw Error('Doppelter gespeicherter Quellenpfad.');seen.add(key);return {kind:item.kind,rootId:item.rootId,path:[...item.path]};})};
  }
  if(value.version===3||value.version>=4&&value.section!==undefined){object(value.section,['normal','offset','side','ids']);const section=value.section;if(!Array.isArray(section.normal)||section.normal.length!==3||section.normal.some(v=>!Number.isFinite(v))||Math.abs(Math.hypot(...section.normal)-1)>1e-8||!Number.isFinite(section.offset)||Math.abs(section.offset)>200000||!['positive','negative'].includes(section.side)||!Array.isArray(section.ids)||!section.ids.length||section.ids.length>500||new Set(section.ids).size!==section.ids.length||section.ids.some(id=>typeof id!=='string'||!id||id.length>200))throw Error('Ungültige gespeicherte Schnittansicht.');result.section={normal:[...section.normal],offset:section.offset,side:section.side,ids:[...section.ids]};}
  if(value.version===4||value.version>=5&&value.meshSelection!==undefined){if(!Object.hasOwn(value,'meshSelection'))throw Error('Gespeicherte Netz-Flächenauswahl fehlt.');result.meshSelection=value.meshSelection===null?null:validateMeshSelectionBinding(value.meshSelection);}
  if(value.version>=5){if(!Object.hasOwn(value,'loadSet'))throw Error('Gespeichertes Baugruppen-Ladeset fehlt.');result.loadSet=validateCadLoadSet(value.loadSet);}
  if(value.version===6){if(!Object.hasOwn(value,'explosion'))throw Error('Gespeicherte Explosionsansicht fehlt.');result.explosion=validateExplosion(value.explosion);}
  return result;
}
