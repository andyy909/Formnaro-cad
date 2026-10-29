import {cadProjectParameterTarget,selectCadProjectParameters,validateCadProjectParameters} from './cad-project-parameters-data.js';

// Capture a selected source family independently of its former parent group.
// The clipboard stores expressions and stable references, never computed values.
export function captureCadProjectParameterClipboard(project,targets,{parameterIds=[]}={}){
  if(!project.projectParameters)return undefined;
  const data=validateCadProjectParameters(project.projectParameters),routes=targets.map(from=>({from,node:cadProjectParameterTarget(project,from).node}));
  const route=target=>routes.find(({from})=>target.rootId===from.rootId&&target.path.length>=from.path.length&&from.path.every((id,i)=>target.path[i]===id));
  const target=original=>{const {from,node}=route(original);return {rootId:node.id,path:original.path.slice(from.path.length)};};
  data.bindings=data.bindings.filter(b=>route(b.target)).map(b=>({...b,target:target(b.target)}));
  if(data.freecad)data.freecad=data.freecad.filter(r=>route(r.target)).map(r=>({...r,target:target(r.target),inputs:r.inputs.map(input=>({...input,...(route(input.target)?{target:target(input.target)}:{unresolved:true})}))}));
  data.variants=data.variants.map(v=>({...v,states:v.states.filter(s=>route(s.target)).map(s=>({...s,target:target(s.target)}))}));
  if(data.baseStates)data.baseStates=data.baseStates.filter(s=>route(s.target)).map(s=>({...s,target:target(s.target)}));
  delete data.applied;
  return selectCadProjectParameters(data,routes.map(({node})=>node.id),{parameterIds});
}
