import {evaluateCadProjectParameters} from './cad-project-parameters-data.js';

const key=target=>JSON.stringify([target.rootId,target.path]);
const fail=(message,binding)=>{throw Object.assign(Error('Konturmaßbindung: '+message),{code:'CONTOUR_PROFILE_BINDING_LOST',...(binding?{bindingId:binding.id,target:binding.target}:{})});};
export const isCadContourProfileField=field=>typeof field==='string'&&/^sketch\.elements\..+\.(?:diameter|(?:start|through|end|center)\.[01])$/.test(field);
export const cadContourTargetProfileBindings=(bindings,target)=>bindings.filter(binding=>key(binding.target)===key(target)&&binding.field.startsWith('sketch.elements.'));

/** Source element identities remain authoritative. Overlay only explicitly
 * bound coordinates; missing roles never acquire a nearest replacement. */
export function applyCadContourProfileBindings(profile,bindings){
 const result=structuredClone(profile);
 for(const binding of bindings){
  const match=binding.field.match(/^sketch\.elements\.(.+)\.(diameter|start|through|end|center)(?:\.([01]))?$/),element=match&&result.elements.find(element=>element.id===match[1]);
  if(!element||!isCadContourProfileField(binding.field)||!Number.isFinite(binding.value))fail('Das gebundene native Konturelement oder Maß fehlt. Quelle und Bindung ausdrücklich neu wählen.',binding);
  if(match[2]==='diameter'){if(element.type!=='circle'||match[3]!==undefined)fail('Das gebundene Kreismaß passt nicht zur aktuellen Quelle.',binding);element.diameter=binding.value;}
  else{const axis=Number(match[3]),pair=element[match[2]];if(!Array.isArray(pair)||pair.length!==2||match[3]===undefined)fail('Der gebundene Konturpunkt passt nicht zur aktuellen Quelle.',binding);pair[axis]=binding.value;}
 }
 return result;
}

/** Also detects removed bindings: an explicit parameter Update must restore
 * the freshly read source coordinates rather than leaving orphan overrides. */
export function cadContourProfileBindingChangeIds(project,bindings){
 const before=project.projectParameters?evaluateCadProjectParameters(project.projectParameters).bindings:[],shape=(all,target)=>cadContourTargetProfileBindings(all,target).map(({id,parameterId,field,value})=>({id,parameterId,field,value})).sort((a,b)=>a.field.localeCompare(b.field));
 return (project.contourLinks?.links??[]).filter(link=>JSON.stringify(shape(before,link.target))!==JSON.stringify(shape(bindings,link.target))).map(link=>link.id);
}
