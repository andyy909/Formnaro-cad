export const DEFAULTS={language:'de',theme:'light',snap:1,rotationSnap:15,handleSize:14,segments:64,gridVisible:true,autosave:true,zoomSpeed:1,meshDisplayStyle:'blue'};
export function validatePreferences(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!Object.hasOwn(DEFAULTS,k)))throw new Error('UngÃƒÂ¼ltige Programmeinstellungen.');
  const s={...DEFAULTS,...value};
  if(!['blue','white','sand','graphite','fusion','solidworks'].includes(s.meshDisplayStyle)||!['de','en'].includes(s.language)||!['light','dark','system'].includes(s.theme)||![0,.1,.25,.5,1,2,5].includes(s.snap)||![0,1,5,15,30,45,90].includes(s.rotationSnap)||![12,24,32,64,96,128,256,512].includes(s.segments)||!Number.isInteger(s.handleSize)||s.handleSize<10||s.handleSize>24||typeof s.gridVisible!=='boolean'||typeof s.autosave!=='boolean'||!Number.isFinite(s.zoomSpeed)||s.zoomSpeed<.3||s.zoomSpeed>3)throw new Error('Programmeinstellungen liegen auÃƒÅ¸erhalb des zulÃƒÂ¤ssigen Bereichs.');
  return s;
}
export function loadPreferences(storage){try{return validatePreferences(JSON.parse(storage.getItem('offlinecad-settings-v1')||'{}'));}catch{return {...DEFAULTS};}}
