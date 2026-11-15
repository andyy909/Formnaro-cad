export const SOLID_SETTINGS_KEY='offlinecad-solid-settings-v1';
export const SOLID_TABS=['features','sketch','evaluate','assembly','mesh'];
export const SOLID_DEFAULTS=Object.freeze({version:1,navigation:true,shortcuts:true,defaultTab:'features'});

export function validateSolidSettings(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!Object.hasOwn(SOLID_DEFAULTS,key)))throw Error('Ungültige Solid-Einstellungen.');
  const result={...SOLID_DEFAULTS,...value};
  if(result.version!==1||typeof result.navigation!=='boolean'||typeof result.shortcuts!=='boolean'||!SOLID_TABS.includes(result.defaultTab))throw Error('Ungültige Solid-Einstellungen.');
  return result;
}
export function createSolidSettings(storage){
  let current;try{current=validateSolidSettings(JSON.parse(storage.getItem(SOLID_SETTINGS_KEY)||'{}'));}catch{current={...SOLID_DEFAULTS};}
  return {get:()=>({...current}),set:value=>{const next=validateSolidSettings(value);storage.setItem(SOLID_SETTINGS_KEY,JSON.stringify(next));current=next;return {...current};}};
}

// Z remains Formnaro's vertical axis. Front/top/right therefore keep their
// existing meaning in saved views, workplanes and exports.
export function solidShortcut(event){
  if(event.altKey||event.shiftKey)return null;
  const key=event.key.toLowerCase();
  if(event.ctrlKey||event.metaKey){const view={'1':'front','2':'back','3':'left','4':'right','5':'top','6':'bottom','7':'iso'}[key];return view?{view}:null;}
  if(key===' ')return {orientation:true};
  if(key==='s')return {shortcuts:true};
  if(key==='f')return {fit:true};
  return null;
}

export {SOLID_LABELS,solidLabel} from '../ai/formnaro-solid-labels.mjs';
