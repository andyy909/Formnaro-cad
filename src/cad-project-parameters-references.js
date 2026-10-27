import {remapFreeCADParameterRuns} from './cad-freecad-parameter-data.js';
import {createCadProjectParameters,validateCadProjectParameters,validateCadProjectParameterTarget,cadProjectParameterId,refreshCadProjectParameterCorrespondence} from './cad-project-parameters-data.js';

const key=target=>JSON.stringify([target.rootId,target.path]);
const within=(target,from)=>target.rootId===from.rootId&&from.path.every((id,index)=>target.path[index]===id)&&target.path.length>=from.path.length;
const destination=(target,move,mapping)=>({rootId:move.to.rootId,path:[...move.to.path,...target.path.slice(move.from.path.length).map(id=>mapping?.get(id)??id)]});
function checkedMove(move){return {from:validateCadProjectParameterTarget(move.from),to:validateCadProjectParameterTarget(move.to)};}

// Explicit structural moves only; no nearest-geometry remapping. Bindings to a
// dissolved group's combined result deliberately keep their lost group target.
export function reparentCadProjectParameterReferences(project,moves){
 if(!project.projectParameters)return undefined;
 const data=validateCadProjectParameters(project.projectParameters),routes=moves.map(checkedMove),changed=[];
 function remap(target){const route=routes.find(move=>within(target,move.from));return route?destination(target,route):target;}
 for(const binding of data.bindings){const target=remap(binding.target);if(key(target)!==key(binding.target)){binding.target=target;changed.push(binding.id);}}
 if(data.freecad)data.freecad=remapFreeCADParameterRuns(data.freecad,remap);
 for(const variant of data.variants)for(const state of variant.states)state.target=remap(state.target);
 for(const state of data.baseStates??[])state.target=remap(state.target);
 return refreshCadProjectParameterCorrespondence(project,data,{bindingIds:changed});
}

// Copies within one project share the global scalar graph, with fresh binding
// identities and exact old-to-new source IDs supplied by cloneCadSources.
export function copyCadProjectParameterReferences(project,{from,to,mapping=new Map(),sourceData=project.projectParameters,makeId=cadProjectParameterId}={}){
 if(!sourceData)return project.projectParameters;
 const source=validateCadProjectParameters(sourceData),data=validateCadProjectParameters(project.projectParameters??createCadProjectParameters()),move=checkedMove({from,to}),parameters=new Set(data.parameters.map(p=>p.id)),variants=new Map(data.variants.map(v=>[v.id,v])),changed=[];
 const bindings=source.bindings.filter(binding=>within(binding.target,move.from)),states=source.variants.flatMap(variant=>variant.states.filter(state=>within(state.target,move.from)).map(state=>({variantId:variant.id,state})));
 if(bindings.some(binding=>!parameters.has(binding.parameterId))||states.some(item=>!variants.has(item.variantId)))throw Object.assign(Error('Die kopierten Parameter gehören zu einem anderen Projekt. Als Bibliothekseintrag mit eigenem Parametergraph einfügen.'),{code:'PARAMETER_COPY_GRAPH_MISMATCH'});
 if(source.freecad){const runs=source.freecad.filter(run=>within(run.target,move.from));if(runs.length){data.version=2;const remap=target=>within(target,move.from)?destination(target,move,mapping):target;data.freecad=[...(data.freecad??[]),...remapFreeCADParameterRuns(runs,remap)];}}
 const existing=new Set([...data.parameters,...data.bindings,...data.variants].map(item=>item.id));
 for(const binding of bindings){const id=makeId('parameter-binding');if(existing.has(id))throw Error('Doppelte Kennung für Parameterkopie.');existing.add(id);changed.push(id);data.bindings.push({...binding,id,target:destination(binding.target,move,mapping)});const receipt=source.applied?.inputs.find(input=>input.bindingId===binding.id&&input.freecadSignature);if(receipt&&data.applied)data.applied.inputs.push({...receipt,bindingId:id});}
 for(const {variantId,state}of states)variants.get(variantId).states.push({...state,target:destination(state.target,move,mapping)});
 const baselines=(source.baseStates??[]).filter(state=>within(state.target,move.from));if(baselines.length)data.baseStates=[...(data.baseStates??[]),...baselines.map(state=>({...state,target:destination(state.target,move,mapping)}))];
 return refreshCadProjectParameterCorrespondence(project,data,{bindingIds:changed});
}
