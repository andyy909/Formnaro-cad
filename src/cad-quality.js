export const CAD_QUALITY_KEY='offlinecad-cad-quality-v1';
export const CAD_QUALITY_DEFAULTS=Object.freeze({format:'FormnaroCADQuality',version:1,display:Object.freeze({deflection:.02,angleDegrees:8}),export:Object.freeze({deflection:.01,angleDegrees:5})});
export function validateCadQuality(value){
  if(!value||value.format!=='FormnaroCADQuality'||value.version!==1||Object.keys(value).some(k=>!['format','version','display','export'].includes(k)))throw Error('Ungültige CAD-Qualitätseinstellungen.');
  const result={format:value.format,version:1};for(const key of ['display','export']){const quality=value[key];if(!quality||Object.keys(quality).some(k=>!['deflection','angleDegrees'].includes(k))||!Number.isFinite(quality.deflection)||quality.deflection<1e-7||quality.deflection>10||!Number.isFinite(quality.angleDegrees)||quality.angleDegrees<=0||quality.angleDegrees>90)throw Error('CAD-Qualität: 0,0000001–10 mm und mehr als 0–90 Grad.');result[key]={deflection:quality.deflection,angleDegrees:quality.angleDegrees};}return result;
}
export function createCadQualitySettings(storage){
  let current=structuredClone(CAD_QUALITY_DEFAULTS);const saved=storage.getItem(CAD_QUALITY_KEY);if(saved)current=validateCadQuality(JSON.parse(saved));
  return {get:()=>structuredClone(current),set:value=>{const checked=validateCadQuality(value);if(JSON.stringify(checked)!==JSON.stringify(current))storage.setItem(CAD_QUALITY_KEY,JSON.stringify(checked));current=checked;return structuredClone(current);}};
}
