import {DEFAULTS,validatePreferences} from './preferences.js';
import {CAD_QUALITY_DEFAULTS,validateCadQuality} from './cad-quality.js';
import {validateLayout} from '../backend/layout-data.mjs';

export const WORKFLOW_SETTINGS_KEY='offlinecad-workflow-settings-v1';
export const WORKFLOW_SETTINGS_DEFAULTS=Object.freeze({format:'FormnaroWorkflowSettings',version:1,import:Object.freeze({unit:1,meshUse:'mesh',svgHeight:3}),export:Object.freeze({format:'stl',scope:'all'}),conversion:Object.freeze({tolerance:.15,mode:'auto',fallback:true,repair:true,meshRepair:false})});
const copy=value=>structuredClone(value);
function fields(value,keys,label){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||Object.keys(value).some(key=>!keys.includes(key)))throw Error('Ungültige '+label+'.');
}
export function validateWorkflowSettings(value){
  fields(value,['format','version','import','export','conversion'],'Datei- und Konvertereinstellungen');
  if(value.format!=='FormnaroWorkflowSettings'||value.version!==1)throw Error('Unbekanntes Format der Datei- und Konvertereinstellungen.');
  fields(value.import,['unit','meshUse','svgHeight'],'Importeinstellungen');fields(value.export,['format','scope'],'Exporteinstellungen');fields(value.conversion,['tolerance','mode','fallback','repair','meshRepair'],'Konvertereinstellungen');
  const input=value.import,output=value.export,conversion=value.conversion;
  if(![1,10,25.4].includes(input.unit)||!['reference','mesh','cad'].includes(input.meshUse)||!Number.isFinite(input.svgHeight)||input.svgHeight<=0||input.svgHeight>10000)throw Error('Import: gültige Einheit, Verwendung und SVG-Höhe von mehr als 0 bis 10.000 mm wählen.');
  if(!['stl','step','obj','3mf','glb','gltf','svg'].includes(output.format)||!['all','selection'].includes(output.scope))throw Error('Ungültiges Exportformat oder ungültiger Umfang.');
  if(!Number.isFinite(conversion.tolerance)||conversion.tolerance<.0001||conversion.tolerance>100||!['auto','smooth','planar','exact'].includes(conversion.mode)||typeof conversion.fallback!=='boolean'||typeof conversion.repair!=='boolean'||typeof conversion.meshRepair!=='boolean')throw Error('Konverter: Abweichungsbudget von 0,0001 bis 100 mm und gültiges Verfahren wählen.');
  return copy(value);
}
export function createCadWorkflowSettings(storage){
  let current=copy(WORKFLOW_SETTINGS_DEFAULTS);const saved=storage.getItem(WORKFLOW_SETTINGS_KEY);if(saved!==null)current=validateWorkflowSettings(JSON.parse(saved));
  function set(value){const next=validateWorkflowSettings(value);if(JSON.stringify(next)!==JSON.stringify(current))storage.setItem(WORKFLOW_SETTINGS_KEY,JSON.stringify(next));current=next;return copy(current);}
  function update(patch){
    if(!patch||typeof patch!=='object'||Array.isArray(patch)||Object.keys(patch).some(key=>!['import','export','conversion'].includes(key)))throw Error('Ungültige Änderung der Datei- und Konvertereinstellungen.');
    const next=copy(current);for(const [section,values]of Object.entries(patch)){if(!values||typeof values!=='object'||Array.isArray(values))throw Error('Ungültige Änderung der Datei- und Konvertereinstellungen.');next[section]={...next[section],...values};}return set(next);
  }
  return {get:()=>copy(current),set,update,reset:()=>set(WORKFLOW_SETTINGS_DEFAULTS)};
}

// This transferable document deliberately has no provider, key, profile, library,
// model, autosave, file path or workspace camera fields. Layout is only the current
// anonymous control arrangement; named layout profiles stay in the local library.
export function createCadSettingsBundle({preferences=DEFAULTS,quality=CAD_QUALITY_DEFAULTS,workflow=WORKFLOW_SETTINGS_DEFAULTS,layout}={}){
  return validateCadSettingsBundle({format:'FormnaroSettings',version:1,preferences,quality,workflow,...(layout!==undefined?{layout}:{})});
}
export function validateCadSettingsBundle(value){
  const keys=['format','version','preferences','quality','workflow'];
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length+(Object.hasOwn(value,'layout')?1:0)||keys.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>!keys.includes(key)&&key!=='layout')||value.format!=='FormnaroSettings'||value.version!==1)throw Error('Ungültige Formnaro-Einstellungsdatei.');
  return {format:'FormnaroSettings',version:1,preferences:validatePreferences(value.preferences),quality:validateCadQuality(value.quality),workflow:validateWorkflowSettings(value.workflow),...(Object.hasOwn(value,'layout')?{layout:validateLayout(value.layout)}:{})};
}
export async function applyCadSettingsBundle(adapters,value){
  const next=validateCadSettingsBundle(value),withLayout=Object.hasOwn(next,'layout');
  if(withLayout&&(typeof adapters.getLayout!=='function'||typeof adapters.setLayout!=='function'))throw Error('Die Oberflächenanordnung kann hier nicht übernommen werden.');
  const previous=createCadSettingsBundle({preferences:adapters.getPreferences(),quality:adapters.getQuality(),workflow:adapters.workflowSettings.get(),...(withLayout?{layout:adapters.getLayout()}:{})});
  const steps=[['Qualität',()=>adapters.setQuality(next.quality),()=>adapters.setQuality(previous.quality)],['Programmeinstellungen',()=>adapters.setPreferences(next.preferences),()=>adapters.setPreferences(previous.preferences)],['Dateieinstellungen',()=>adapters.workflowSettings.set(next.workflow),()=>adapters.workflowSettings.set(previous.workflow)],...(withLayout?[['Oberfläche',()=>adapters.setLayout(next.layout),()=>adapters.setLayout(previous.layout)]]:[])],attempted=[];
  try{for(const step of steps){attempted.push(step);await step[1]();}}catch(error){
    const failed=[];for(const [label,,restore]of attempted.reverse())try{await restore();}catch{failed.push(label);}
    if(failed.length)throw Error('Einstellungen konnten nicht vollständig übernommen werden: '+error.message+' Vorige Werte bitte prüfen: '+failed.join(', ')+'.');
    throw Error('Einstellungen wurden nicht übernommen; vorige Werte wiederhergestellt. '+error.message);
  }
  return next;
}
