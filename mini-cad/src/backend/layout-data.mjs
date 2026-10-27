// Shared by the renderer and the native file bridge. Contains only UI data.
export const LAYOUT_DEFAULTS={version:1,librarySide:'left',viewSide:'left',modePosition:'top',libraryCollapsed:false,inspectorCollapsed:false,libraryWidth:null,inspectorWidth:null,shapeLibraryHeight:null,chatHeight:null,hiddenTools:[],objectsFirst:false,workspaceFirst:false,zones:{
  header:['new','open','save','projects','import','stl-to-step','export','ai','settings'],
  toolbar:['undo','redo','duplicate','copy','paste','delete','bundle','group','ungroup','align','mirror','edges','general-fit','drop','lay-on-face','reference-place','sketch','split','extract','drill','mesh-tools','mesh-select','mesh-inspector','mesh-repair','mesh-close-hole','mesh-connectors','mesh-reduce','mesh-remesh','mesh-smooth','mesh-sculpt','mesh-erase-fill','mesh-make-solid','mesh-hollow','mesh-more','cad-to-mesh','mesh-to-cad','marks','functions','help'],
  view:['view-iso','view-top','view-front','view-right','coordinates','measure','section','inspect','ruler','fit','projection','workplane-set','workplane-top','reset-plane'],
  mode:['mode-translate','mode-scale','mode-rotate','magnet']
}};
export const defaultLayout=()=>structuredClone(LAYOUT_DEFAULTS);
export function validateLayout(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!Object.hasOwn(LAYOUT_DEFAULTS,k))||value.version!==1||!['left','right'].includes(value.librarySide)||!['left','right'].includes(value.viewSide)||!['top','bottom'].includes(value.modePosition))throw Error('Ungültige Oberflächenanordnung.');
  value=structuredClone(value);const z=value.zones;
  if(!z||typeof z!=='object'||Array.isArray(z)||Object.keys(z).length!==4||Object.keys(LAYOUT_DEFAULTS.zones).some(k=>!Array.isArray(z[k])))throw Error('Ungültige Oberflächenanordnung.');
  // Upgrade old named layouts without discarding their existing positions.
  const added=['stl-to-step','drill','mesh-tools','mesh-select','mesh-inspector','mesh-repair','mesh-close-hole','mesh-connectors','mesh-reduce','mesh-remesh','mesh-smooth','mesh-sculpt','mesh-erase-fill','mesh-make-solid','mesh-hollow','mesh-more','cad-to-mesh','mesh-to-cad','workplane-set','workplane-top','reset-plane'];
  for(const key of added)if(!Object.values(z).some(keys=>keys.includes(key))){const zone=Object.keys(LAYOUT_DEFAULTS.zones).find(zone=>LAYOUT_DEFAULTS.zones[zone].includes(key));z[zone].push(key);}
  if(![...z.header,...z.toolbar].includes('marks')){const index=z.toolbar.indexOf('functions');z.toolbar.splice(index<0?z.toolbar.length:index,0,'marks');}
  // Existing portable layouts gain the new shortcut beside Save.
  if(![...z.header,...z.toolbar].includes('projects')){const zone=z.header.includes('save')?z.header:z.toolbar,index=zone.indexOf('save');zone.splice(index<0?zone.length:index+1,0,'projects');}
  if(![...z.header,...z.toolbar].includes('functions')){const index=z.toolbar.indexOf('help');z.toolbar.splice(index<0?z.toolbar.length:index,0,'functions');}
  if(![...z.header,...z.toolbar].includes('lay-on-face')){const zone=z.header.includes('drop')?z.header:z.toolbar,index=zone.indexOf('drop');zone.splice(index<0?zone.length:index+1,0,'lay-on-face');}
  if(![...z.header,...z.toolbar].includes('reference-place')){const zone=z.header.includes('lay-on-face')?z.header:z.toolbar,index=zone.indexOf('lay-on-face');zone.splice(index<0?zone.length:index+1,0,'reference-place');}
  if(![...z.header,...z.toolbar].includes('sketch')){const index=z.toolbar.indexOf('functions');z.toolbar.splice(index<0?z.toolbar.length:index,0,'sketch');}
  if(![...z.header,...z.toolbar].includes('split')){const index=z.toolbar.indexOf('sketch');z.toolbar.splice(index<0?z.toolbar.length:index+1,0,'split');}
  if(![...z.header,...z.toolbar].includes('extract')){const index=z.toolbar.indexOf('split');z.toolbar.splice(index<0?z.toolbar.length:index+1,0,'extract');}
  for(const keys of [['header','toolbar','view'],['mode']]){
    const expected=keys.flatMap(k=>LAYOUT_DEFAULTS.zones[k]),actual=keys.flatMap(k=>z[k]);
    if(actual.length!==expected.length||new Set(actual).size!==actual.length||actual.some(k=>!expected.includes(k)))throw Error('Ungültige Oberflächenanordnung.');
  }
  if(['libraryCollapsed','inspectorCollapsed'].some(key=>value[key]!==undefined&&typeof value[key]!=='boolean'))throw Error('Ungültiger Einklappzustand.');
  for(const key of ['objectsFirst','workspaceFirst']){if(value[key]!==undefined&&typeof value[key]!=='boolean')throw Error('Ungültige Bereichsreihenfolge.');value[key]??=false;}
  const all=Object.values(LAYOUT_DEFAULTS.zones).flat();value.hiddenTools??=[];
  if(!Array.isArray(value.hiddenTools)||new Set(value.hiddenTools).size!==value.hiddenTools.length||value.hiddenTools.some(key=>!all.includes(key)||key==='settings'))throw Error('Ungültige Werkzeugauswahl.');
  for(const [key,min,max]of [['libraryWidth',180,640],['inspectorWidth',240,640],['shapeLibraryHeight',100,1600],['chatHeight',240,1200]]){
    const size=value[key]??null;if(size!==null&&(!Number.isInteger(size)||size<min||size>max))throw Error('Ungültige Bereichsgröße.');value[key]=size;
  }
  return {...structuredClone(value),libraryCollapsed:value.libraryCollapsed??false,inspectorCollapsed:value.inspectorCollapsed??false};
}
export function layoutName(value){
  if(typeof value!=='string')throw Error('Bitte einen Namen für das Layout eingeben.');
  const name=value.normalize('NFC').trim();
  if(!name||name.length>80||/[\x00-\x1f\x7f]/.test(name))throw Error('Layoutnamen müssen 1 bis 80 Zeichen lang sein.');
  return name;
}
export const emptyLayouts=(current=defaultLayout())=>({format:'Formnaro-Layouts',version:1,current:validateLayout(current),activeId:null,profiles:[]});
export function validateLayouts(value){
  const keys=['format','version','current','activeId','profiles'];
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||Object.keys(value).some(k=>!keys.includes(k))||value.format!=='Formnaro-Layouts'||value.version!==1||!Array.isArray(value.profiles)||value.profiles.length>100)throw Error('Ungültige Layoutdatei.');
  const current=validateLayout(value.current),ids=new Set(),names=new Set();
  const profiles=value.profiles.map(p=>{
    if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).length!==3||Object.keys(p).some(k=>!['id','name','layout'].includes(k))||typeof p.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(p.id)||ids.has(p.id))throw Error('Ungültige Layoutdatei.');
    const name=layoutName(p.name),folded=name.toLowerCase();if(names.has(folded))throw Error('Ein Layout mit diesem Namen existiert bereits.');ids.add(p.id);names.add(folded);
    return {id:p.id,name,layout:validateLayout(p.layout)};
  });
  if(value.activeId!==null&&(!ids.has(value.activeId)||JSON.stringify(profiles.find(p=>p.id===value.activeId).layout)!==JSON.stringify(current)))throw Error('Ungültige Layoutdatei.');
  return {format:'Formnaro-Layouts',version:1,current,activeId:value.activeId,profiles};
}
export function changeLayouts(value,command,makeId){
  const next=validateLayouts(value),fields={current:['layout'],save:['name','layout'],load:['id'],replace:['id','layout'],rename:['id','name'],delete:['id'],reset:[]};
  if(!command||typeof command!=='object'||Array.isArray(command)||!Object.hasOwn(fields,command.action)||Object.keys(command).some(k=>k!=='action'&&!fields[command.action].includes(k))||fields[command.action].some(k=>!Object.hasOwn(command,k)))throw Error('Ungültiger Layoutbefehl.');
  const profile=next.profiles.find(p=>p.id===command.id);
  if(['load','replace','rename','delete'].includes(command.action)&&!profile)throw Error('Dieses Layout ist nicht mehr vorhanden.');
  if(['save','rename'].includes(command.action)){
    const name=layoutName(command.name);if(next.profiles.some(p=>p.id!==profile?.id&&p.name.toLowerCase()===name.toLowerCase()))throw Error('Ein Layout mit diesem Namen existiert bereits.');
    if(command.action==='save'){if(next.profiles.length>=100)throw Error('Maximal 100 Layouts können gespeichert werden.');const p={id:makeId(),name,layout:validateLayout(command.layout)};next.profiles.push(p);next.current=structuredClone(p.layout);next.activeId=p.id;}
    else profile.name=name;
  }else if(command.action==='load'){next.current=structuredClone(profile.layout);next.activeId=profile.id;}
  else if(command.action==='replace'){profile.layout=validateLayout(command.layout);next.current=structuredClone(profile.layout);next.activeId=profile.id;}
  else if(command.action==='delete'){next.profiles=next.profiles.filter(p=>p.id!==command.id);if(next.activeId===command.id)next.activeId=null;}
  else {next.current=command.action==='reset'?defaultLayout():validateLayout(command.layout);if(next.activeId&&JSON.stringify(next.profiles.find(p=>p.id===next.activeId).layout)!==JSON.stringify(next.current))next.activeId=null;}
  return validateLayouts(next);
}
