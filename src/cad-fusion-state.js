export const FUSION_SETTINGS_KEY='offlinecad-fusion-settings-v1';
export const FUSION_TABS=['solid','sketch','mesh','tools'];
export const FUSION_DEFAULTS=Object.freeze({version:1,navigation:true,shortcuts:true,defaultTab:'solid'});
export function validateFusionSettings(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!Object.hasOwn(FUSION_DEFAULTS,k)))throw Error('Ungültige Fusion-Einstellungen.');
  const next={...FUSION_DEFAULTS,...value};
  if(next.version!==1||typeof next.navigation!=='boolean'||typeof next.shortcuts!=='boolean'||!FUSION_TABS.includes(next.defaultTab))throw Error('Ungültige Fusion-Einstellungen.');
  return next;
}
export function createFusionSettings(storage){
  let current;try{current=validateFusionSettings(JSON.parse(storage.getItem(FUSION_SETTINGS_KEY)||'{}'));}catch{current={...FUSION_DEFAULTS};}
  return {get:()=>({...current}),set:value=>{const next=validateFusionSettings(value);storage.setItem(FUSION_SETTINGS_KEY,JSON.stringify(next));current=next;return {...current};}};
}
export function fusionShortcut(event){
  if(event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return null;
  return ({s:'search',e:'extrude',f:'round',h:'drill',m:'mode-translate',i:'measure',j:'joints'})[event.key.toLowerCase()]??null;
}
export const FUSION_LABELS={
  solid:['Volumenkörper','Solid'],sketch:['Skizze','Sketch'],mesh:['Netz','Mesh'],tools:['Werkzeuge','Tools'],
  model:['Browser','Browser'],properties:['Eigenschaften','Properties'],library:['Einfügen','Insert'],workspace:['Dokument','Document'],
  create:['Erstellen','Create'],modify:['Ändern','Modify'],assemble:['Zusammenfügen','Assemble'],construct:['Konstruieren','Construct'],inspect:['Prüfen','Inspect'],insert:['Einfügen','Insert'],
  extrude:['Extrusion','Extrude'],cut:['Extrusion · Ausschneiden','Extrude · Cut'],round:['Abrunden','Fillet'],chamfer:['Fase','Chamfer'],drill:['Bohrung','Hole'],
  'cad-shell':['Schale','Shell'],'cad-loft':['Erhebung','Loft'],'cad-sweep':['Sweeping','Sweep'],'cad-contour':['Projizieren / Kontur','Project / contour'],
  'cad-face-offset':['Fläche versetzen','Offset face'],'cad-edit-modeling':['Element bearbeiten','Edit feature'],array:['Anordnung','Pattern'],mirror:['Spiegeln','Mirror'],
  'project-parameters':['Parameter ändern','Change parameters'],'sketch-on-part':['Skizze auf Fläche','Sketch on face'],
  'sketch-templates':['Skizzenvorlagen','Sketch templates'],'linked-contours':['Verknüpfte Projektion','Linked projection'],
  'mode-translate':['Verschieben / Kopieren','Move / Copy'],measure:['Messen','Measure'],section:['Schnittanalyse','Section analysis'],
  orientation:['Ansicht ausrichten','View orientation'],options:['Fusion-Einstellungen','Fusion settings'],file:['Datei','File'],edit:['Bearbeiten','Edit'],view:['Ansicht','View'],extras:['Dienstprogramme','Utilities'],help:['Hilfe','Help']
};
export const fusionLabel=(key,language='de')=>FUSION_LABELS[key]?.[language==='en'?1:0]??key;

// The strip represents retained construction sources, in dependency order.
// It neither invents chronological history nor reorders/replays operations.
export function fusionSourceSteps(project,{limit=500}={}){
  const steps=[];
  function visit(node,rootId,path,locked=false,depth=0){
    if(depth>12||steps.length>=limit)return;
    const blocked=locked||!!node.locked||!!node.hidden||!!node.suppressed;
    for(const child of node.children??[])visit(child,rootId,[...path,child.id],blocked,depth+1);
    if(steps.length>=limit)return;
    steps.push({target:{rootId,path},name:node.name||node.type||node.kind,type:node.modeling?.kind||node.recipe?.type||node.source||node.kind,locked:blocked});
  }
  for(const node of project.nodes??[])visit(node,node.id,[]);
  return steps;
}
