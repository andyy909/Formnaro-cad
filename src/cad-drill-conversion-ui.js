import {cadSelectionContext} from './cad-interface-state.js';
import {cadDrillConversionCandidates} from './cad-drill-conversion-data.js';
import {CAD_DRILL_SCALAR_FIELDS} from './cad-drill-parameter-fields.js';

/** Explicit branch and old-binding choices for the existing drill dialog. */
export function mountCadDrillConversionEditor({panel,controller,view,getState,run,changed,choose,clearMarkers,initialPath=[]}){
 const snapshot=controller.readSnapshot?.()??controller.snapshot(),state=getState(),candidates=cadDrillConversionCandidates(snapshot,state.id),q=selector=>panel.querySelector(selector),enabled=()=>q('[data-drill-convert]').checked;
 const section=document.createElement('div');section.dataset.drillConversion='';section.innerHTML='<label>Alte Bohrgruppe<select data-conversion-target><option value="">Bohrgruppe ausdrücklich wählen</option></select></label><button data-conversion-pick>Ursprüngliche Eintrittsfläche wählen</button><p class="small-note">Die gewählte Gruppe bleibt mit ihren Quellen, Markierungen und Farben erhalten. Alte Werkzeuge werden stillgelegt. Neue Bohrdaten werden nur bei übereinstimmender Geometrie übernommen.</p><details data-conversion-bindings><summary>Bestehende Werkzeugbindungen zuordnen</summary><p class="small-note">Eine vorhandene Bindung bei Bedarf ausdrücklich einem neuen Bohrungsmaß zuordnen. Parameter und Varianten bleiben erhalten. Ohne Auswahl bleibt die Bindung an der alten Werkzeugdefinition.</p><div data-conversion-binding-rows></div></details>';
 q('[data-drill-convert]').closest('label').after(section);const select=q('[data-conversion-target]'),bindingRows=q('[data-conversion-binding-rows]');for(const [index,item]of candidates.entries())select.add(new Option(item.label,String(index)));
 let selected=candidates.findIndex(item=>JSON.stringify(item.target.path)===JSON.stringify(initialPath)),bindingRemap=new Map();select.value=selected<0?'':String(selected);
 const current=()=>{if(getState()!==state||state.revision!==controller.revision())throw Error('Die Bohrgruppenauswahl wurde geändert.');return state;},candidate=()=>candidates[selected];
 function clear(){view.clearSource();view.setInteraction(null);state.targetVersion++;state.target=null;state.stopTarget=null;state.pointRoot=null;state.points=[];clearMarkers();}
 function bindings(){
  bindingRows.replaceChildren();bindingRemap=new Map();const item=candidate(),inactive=new Set(item?.suppressedIds??[]);let count=0;
  if(item)for(const binding of snapshot.projectParameters?.bindings??[]){let context;try{context=cadSelectionContext(snapshot,binding.target);}catch{continue;}
   if(binding.target.rootId!==state.id||!item.target.path.every((part,i)=>part===binding.target.path[i])||!context.chain.some(node=>inactive.has(node.id)))continue;
   const label=document.createElement('label'),select=document.createElement('select'),parameter=snapshot.projectParameters.parameters.find(parameter=>parameter.id===binding.parameterId);select.dataset.conversionBinding=binding.id;select.add(new Option('An ursprünglichem Werkzeug behalten',''));
   for(const field of CAD_DRILL_SCALAR_FIELDS)select.add(new Option(field.label,field.field));label.append(document.createTextNode((parameter?.name??binding.parameterId)+' · '+context.node.name+' · '+binding.field),select);bindingRows.append(label);select.onchange=()=>run(()=>{current();if(select.value)bindingRemap.set(binding.id,select.value);else bindingRemap.delete(binding.id);changed();});count++;
  }
  q('[data-conversion-bindings]').hidden=!count;
 }
 function update(){current();section.hidden=!enabled();if(enabled()){clear();bindings();q('[data-ref-status]').textContent=candidate()?'Bohrdaten bestätigen und die ursprüngliche Eintrittsfläche ausdrücklich wählen.':'Eine vorhandene alte Bohrgruppe auswählen.';}else view.clearSource();q('[data-conversion-pick]').disabled=!candidate();changed();}
 select.onchange=()=>run(()=>{current();selected=select.value===''?-1:Number(select.value);clear();bindings();q('[data-conversion-pick]').disabled=!candidate();changed();q('[data-ref-status]').textContent='Bohrgruppe vorgemerkt. Ursprüngliche Eintrittsfläche neu wählen.';});
 async function pick(stop=false){
  current();const item=candidate();if(!enabled()||!item)throw Error('Zuerst die alte Bohrgruppe ausdrücklich auswählen.');changed();state.stage=stop?'stop':'target';if(stop)state.stopTarget=null;else state.target=null;state.points=[];clearMarkers();const version=state.version;state.loading=true;
  try{
   const context=cadSelectionContext(snapshot,item.source),node={...structuredClone(context.node),id:state.id,transform:[...context.world]},picture={...snapshot,nodes:[node],workplane:{...snapshot.workplane,reference:null}};for(const key of ['projectParameters','contourLinks','drawings','joints','linkedPatterns','featureReferences'])delete picture[key];
   const display=await controller.display(picture);if(getState()!==state||state.version!==version)return;view.setSourceDisplay(display.meshes,picture,[{rootId:state.id,path:[]}]);view.setPreview(display.meshes,picture);view.fit([],{includePreview:true});view.clearPreview();q('[data-ref-status]').textContent=stop?'Gegenüberliegende Zielfläche der eingeblendeten Originalquelle anklicken.':'Eintrittsfläche der eingeblendeten ursprünglichen Quelle anklicken; U/V anschließend bis zur Bohrmitte einstellen.';
   view.setInteraction((ray,event,hit)=>run(async()=>{current();const target=hit?.object?.userData.sourceTarget;if(target?.rootId!==state.id||target.path?.length!==0){q('[data-ref-status]').textContent='Die eingeblendete Originalquelle wurde nicht getroffen. Flächenwahl erneut starten.';view.setInteraction(null);return;}view.setInteraction(null);await choose(state.id,{ray:structuredClone(ray)},'Ursprüngliche Quellfläche');view.clearSource();}));
  }finally{if(getState()===state&&state.version===version)state.loading=false;}
 }
 q('[data-conversion-pick]').onclick=()=>run(()=>pick(false));section.hidden=true;bindings();
 return {update,pick,ready:()=>!enabled()||!!candidate(),options:()=>{current();if(!candidate())throw Error('Die alte Bohrgruppe fehlt.');return {path:[...candidate().target.path],bindingRemap:[...bindingRemap].map(([bindingId,field])=>({bindingId,field}))};},clearSource:()=>view.clearSource(),close:()=>{view.clearSource();section.remove();}};
}
