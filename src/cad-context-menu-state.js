export const CONTEXT_MENU_KEY='offlinecad-context-menu-v1';
// Requirements describe the selection, not a second implementation of commands.
// Execution always returns to the existing application actions and their guards.
export const CONTEXT_COMMANDS=Object.freeze({
 'edit-feature':['Feature bearbeiten','Edit feature','oneEditable'],properties:['Eigenschaften','Properties','selected'],
 'sketch-on-part':['Skizze auf Fläche','Sketch on face','material'],extrude:['Extrudierter Aufsatz','Extruded boss','always'],cut:['Linearer Schnitt','Extruded cut','material'],
 round:['Verrundung','Fillet','oneEditable'],chamfer:['Fase','Chamfer','oneEditable'],drill:['Bohrung','Hole','material'],
 'cad-shell':['Wandung','Shell','cad'],'cad-face-offset':['Fläche versetzen','Offset face','cad'],'cad-contour':['Kontur übernehmen','Convert entities','cad'],
 duplicate:['Duplizieren','Duplicate','editable'],copy:['Kopieren','Copy','selected'],paste:['Einfügen','Paste','always'],delete:['Löschen','Delete','editable'],
 hide:['Ausblenden','Hide','editable'],'show-all':['Alle einblenden','Show all','always'],lock:['Sperren / entsperren','Lock / unlock','selected'],isolate:['Isolieren','Isolate','selected'],'end-isolation':['Isolierung beenden','End isolation','always'],
 group:['Gruppieren / vereinigen','Group / combine','multiple'],ungroup:['Gruppe auflösen','Ungroup','oneEditable'],align:['Ausrichten','Align','multiple'],mirror:['Spiegeln','Mirror','editable'],array:['Muster','Pattern','editable'],
 center:['Zur Mitte','Center','editable'],drop:['Auf Arbeitsebene absetzen','Drop to workplane','editable'],'lay-on-face':['Auf Fläche legen','Lay on face','oneEditable'],'reference-place':['An Bezugspunkt','Place by reference','oneEditable'],
 measure:['Messen','Measure','always'],inspect:['Modell prüfen','Inspect model','always'],section:['Schnittansicht','Section view','always'],thickness:['Wanddickenkarte','Thickness map','selected'],'model-compare':['Modellvergleich','Model comparison','selected'],
 sketch:['Skizze / Extrusion','Sketch / extrusion','always'],'edit-sketch':['Skizze bearbeiten','Edit sketch','sketch'],'project-parameters':['Gleichungen & Maße','Equations & dimensions','always'],drawing:['Technische Zeichnung','Technical drawing','always'],
 split:['Mit Ebene teilen','Split by plane','oneEditable'],extract:['Körper herauslösen','Extract bodies','oneEditable'],
 'cad-to-mesh':['CAD in Netz umwandeln','Convert CAD to mesh','cad'],'mesh-to-cad':['Netz in CAD umwandeln','Convert mesh to CAD','mesh'],
 'mesh-tools':['Netz-Werkzeuge','Mesh tools','mesh'],'mesh-select':['Netzflächen auswählen','Select mesh surfaces','mesh'],'mesh-repair':['Netz reparieren','Repair mesh','mesh'],'mesh-reduce':['Netz reduzieren','Reduce mesh','mesh'],'mesh-sculpt':['Modellierpinsel','Sculpt mesh','mesh'],'mesh-hollow':['Netz aushöhlen','Hollow mesh','mesh'],
 functions:['Funktionen …','Functions …','always'],'stl-to-step':['STL zu STEP','STL to STEP','always'],
 undo:['Rückgängig','Undo','always'],redo:['Wiederholen','Redo','always'],fit:['Einpassen','Zoom to fit','always'],
 'view-iso':['Isometrisch','Isometric','always'],'view-front':['Vorne','Front','always'],'view-top':['Oben','Top','always'],'view-right':['Rechts','Right','always'],projection:['Perspektive / Orthografisch','Perspective / Orthographic','always'],
 'workplane-set':['Arbeitsebene setzen','Set workplane','always'],'workplane-top':['Ebene auf Auswahloberseite','Plane on top of selection','oneEditable'],'reset-plane':['Grundebene','Ground plane','always'],
 'mode-translate':['Verschieben','Move','editable'],'mode-rotate':['Drehen','Rotate','editable'],'mode-scale':['Größe','Scale','editable']
});
export const CONTEXT_MODES=['easy','normal','solid','fusion'];
export const CONTEXT_DEFAULTS=Object.freeze({
 easy:Object.freeze(['duplicate','copy','paste','delete','group','ungroup','align','mirror','drop','properties']),
 normal:Object.freeze(['properties','duplicate','copy','paste','delete','hide','lock','group','ungroup','align','mirror','measure','functions']),
 fusion:Object.freeze(['extrude','sketch-on-part','cut','round','chamfer','drill','cad-shell','mode-translate','copy','paste','delete','hide','isolate','measure','properties']),
 solid:Object.freeze(['edit-feature','sketch-on-part','cut','round','chamfer','drill','copy','paste','delete','hide','isolate','show-all','measure','section','properties'])
});
export const isFunctionCommand=key=>typeof key==='string'&&/^function:[a-zA-Z0-9_-]{1,64}:[a-zA-Z0-9_-]{1,64}$/.test(key);
export const isContextCommand=key=>typeof key==='string'&&(Object.hasOwn(CONTEXT_COMMANDS,key)||isFunctionCommand(key));
export const defaultContextSettings=()=>({version:1,modes:structuredClone(CONTEXT_DEFAULTS)});
export function validateContextSettings(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['version','modes'].includes(k))||value.version!==1||!value.modes||typeof value.modes!=='object'||Array.isArray(value.modes)||Object.keys(value.modes).some(mode=>!CONTEXT_MODES.includes(mode))||['easy','normal','solid'].some(mode=>!Object.hasOwn(value.modes,mode)))throw Error('Ungültige Rechtsklick-Einstellungen.');
 for(const keys of Object.values(value.modes))if(!Array.isArray(keys)||keys.length>32||keys.some(key=>!isContextCommand(key))||new Set(keys).size!==keys.length)throw Error('Rechtsklick: höchstens 32 unterschiedliche bekannte Funktionen pro Modus.');
 return {...structuredClone(value),modes:{...structuredClone(CONTEXT_DEFAULTS),...structuredClone(value.modes)}};
}
export function createContextSettings(storage){
 let current;try{current=validateContextSettings(JSON.parse(storage.getItem(CONTEXT_MENU_KEY)||'null'));}catch{current=defaultContextSettings();}
 return {get:()=>structuredClone(current),set:value=>{const next=validateContextSettings(value);storage.setItem(CONTEXT_MENU_KEY,JSON.stringify(next));current=next;return structuredClone(current);}};
}
export function contextCommandAllowed(key,selection){
 if(isFunctionCommand(key))return true;
 const rule=CONTEXT_COMMANDS[key]?.[2],one=selection.length===1?selection[0]:null,editable=selection.length>0&&selection.every(n=>!n.locked&&!n.hidden);
 return rule==='always'||rule==='selected'&&selection.length>0||rule==='editable'&&editable||rule==='oneEditable'&&editable&&!!one||rule==='multiple'&&editable&&selection.length>1||rule==='material'&&editable&&one?.root&&['cad','mesh'].includes(one.kind)&&one.solid||rule==='cad'&&editable&&one?.kind==='cad'||rule==='mesh'&&editable&&one?.kind==='mesh'||rule==='sketch'&&editable&&one?.sketch||false;
}
