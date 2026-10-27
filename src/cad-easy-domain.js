import {cadPermanentlyVisible} from './cad-isolation.js';

export const EASY_DOMAIN_KEY='offlinecad-easy-domain-v1';
const valid=kind=>kind==='cad'||kind==='mesh';
export function createEasyDomain(storage){
  let kind='cad';try{const value=JSON.parse(storage.getItem(EASY_DOMAIN_KEY));if(value?.version===1&&valid(value.kind))kind=value.kind;}catch{/* Existing installations start in CAD. */}
  return {get:()=>kind,set:value=>{if(!valid(value))throw Error('Unbekannter Arbeitsbereich.');if(value===kind)return false;storage.setItem(EASY_DOMAIN_KEY,JSON.stringify({version:1,kind:value}));kind=value;return true;}};
}
export const easyDomainAllows=(node,kind)=>!!node&&(!kind||node.kind===kind);
export function easyImportPolicy(extension,kind){
  if(!kind)return null;
  const ext=extension.toLowerCase().replace(/^\./,'');
  if(kind==='mesh'&&['stl','obj','svg','3mf','glb','gltf'].includes(ext))return {asMesh:true,reconstruct:false};
  if(kind==='cad'&&['step','stp','fcstd','svg','stl'].includes(ext))return {asMesh:false,reconstruct:ext==='stl'};
  throw Error(kind==='mesh'?'Diese Datei im CAD-Bereich importieren.':'Diese Datei im Netz-Bereich importieren.');
}
export function easyExportIds(project,kind,ids,format){
  if(!kind)return ids;
  if(kind==='mesh'&&format==='step')throw Error('STEP benötigt CAD-Körper. Zum CAD-Bereich wechseln.');
  if(ids?.some(id=>!easyDomainAllows(project.nodes.find(node=>node.id===id),kind)))throw Error('Die Auswahl gehört zu einem anderen Arbeitsbereich.');
  const result=project.nodes.filter(node=>easyDomainAllows(node,kind)&&cadPermanentlyVisible(node,project)&&(!ids||ids.includes(node.id))).map(node=>node.id);
  if(!result.length)throw Error('In diesem Arbeitsbereich sind keine sichtbaren Teile vorhanden.');
  return result;
}
