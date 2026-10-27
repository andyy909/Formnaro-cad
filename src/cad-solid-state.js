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

export const SOLID_LABELS={
  'cad-draft':['Entformungsschräge','Draft'],'cad-defeature':['Merkmale entfernen','Defeature'],'cad-revolution':['Rotation','Revolve'],'cad-helix':['Helix','Helix'],
  'cad-surface-fill':['Randkurvenfläche','Boundary surface'],'cad-surface-transition':['Flächenübergang','Surface transition'],'cad-surface-sew':['Flächen vernähen','Sew surfaces'],'cad-surface-relief':['Prägung / Vertiefung','Emboss / engrave'],
  features:['Features','Features'],sketch:['Skizze','Sketch'],evaluate:['Prüfen','Evaluate'],assembly:['Baugruppe','Assembly'],mesh:['Netz & Umwandeln','Mesh & conversion'],
  model:['Modellbaum','Model tree'],properties:['Eigenschaften','Properties'],library:['Grundkörper','Primitives'],workspace:['Dokument','Document'],
  extrude:['Extrudierter Aufsatz','Extruded boss'],cut:['Linearer Schnitt','Extruded cut'],round:['Verrundung','Fillet'],chamfer:['Fase','Chamfer'],
  sketchNew:['Skizze / Extrusion','Sketch / extrusion'],sketchFace:['Skizze auf Fläche','Sketch on face'],
  'cad-contour':['Kontur übernehmen','Convert entities'],'cad-shell':['Wandung','Shell'],'cad-loft':['Ausformung','Loft'],'cad-sweep':['Austragung','Sweep'],
  'cad-face-offset':['Fläche versetzen','Offset face'],'cad-edit-modeling':['Feature bearbeiten','Edit feature'],drill:['Bohrung','Hole'],array:['Muster','Pattern'],mirror:['Spiegeln','Mirror'],
  'project-parameters':['Gleichungen & Maße','Equations & dimensions'],'sketch-templates':['Skizzenvorlagen','Sketch templates'],
  'linked-contours':['Externe Konturbezüge','External contour references'],edges:['Kanten bearbeiten','Edit edges'],
  orientation:['Ansichtsausrichtung','View orientation'],options:['Solid-Einstellungen','Solid settings'],
  file:['Datei','File'],edit:['Bearbeiten','Edit'],view:['Ansicht','View'],insert:['Einfügen','Insert'],extras:['Extras','Tools'],help:['Hilfe','Help']
};
export function solidLabel(key,language='de'){return SOLID_LABELS[key]?.[language==='en'?1:0]??key;}
