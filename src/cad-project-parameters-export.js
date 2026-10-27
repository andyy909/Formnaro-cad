import {cadProjectParameterProblems,evaluateCadProjectParameters,cadProjectParameterTarget,cadProjectParameterFieldValue} from './cad-project-parameters-data.js';
import {flags} from './organization.js';

// Export considers the present and requested active configuration. Otherwise a
// pending unsuppression could silently omit a required part from a full export.
// Cached drawing views name their sources explicitly, regardless of visibility.
export function cadProjectParameterExportProblems(project,{ids,format,includeHidden=false}={}){
  if(!project.projectParameters)return [];
  let evaluation;
  try{evaluation=evaluateCadProjectParameters(project.projectParameters);}catch{return cadProjectParameterProblems(project);}
  const states=new Map(evaluation.states.map(s=>[JSON.stringify([s.target.rootId,s.target.path]),s]));
  const status=(target,desired)=>{
    try{const {chain}=cadProjectParameterTarget(project,target),root=chain[0],global=flags({...root,hidden:false},project),rootState=desired?states.get(JSON.stringify([root.id,[]])):null,suppressed=chain.some((n,i)=>{const path=chain.slice(1,i+1).map(n=>n.id),state=desired?states.get(JSON.stringify([root.id,path])):null;return state?.suppressed??!!n.suppressed;});return {hidden:global.hidden||(rootState?.hidden??!!root.hidden)||suppressed,suppressed};}catch{return {hidden:false,suppressed:false};}
  };
  const candidates=ids?new Set(ids):null,scope=new Set(),supports=node=>format==='step'?node.kind==='cad'&&node.solid:node.kind==='cad'?node.solid:node.kind==='mesh'?node.meshRole!=='hole':['3mf','gltf','glb'].includes(format);
  for(const node of project.nodes){if(candidates&&!candidates.has(node.id)||!includeHidden&&!supports(node))continue;const target={rootId:node.id,path:[]};if(includeHidden||!status(target,false).hidden||!status(target,true).hidden)scope.add(node.id);}
  // A lost binding or configured state cannot be silently repaired by dropping
  // its missing root. Explicit unrelated selections remain independent.
  for(const reference of [...evaluation.bindings,...evaluation.states])if(!project.nodes.some(n=>n.id===reference.target.rootId)&&(!candidates||candidates.has(reference.target.rootId)))scope.add(reference.target.rootId);
  const problems=cadProjectParameterProblems(project,project.projectParameters,{ids:[...scope]}).filter(problem=>includeHidden||problem.code!=='PARAMETERS_UPDATE_REQUIRED'||!problem.bindingId||!status(problem.target,false).suppressed||!status(problem.target,true).suppressed);
  if(includeHidden)for(const binding of evaluation.bindings){if(!scope.has(binding.target.rootId)||problems.some(p=>p.bindingId===binding.id))continue;try{const {node}=cadProjectParameterTarget(project,binding.target),actual=cadProjectParameterFieldValue(node,binding.field);if(actual.literal&&(!Number.isFinite(actual.value)||Math.abs(actual.value-binding.value)>Math.max(1e-8,Math.abs(binding.value)*Number.EPSILON*64)))problems.push({code:'PARAMETERS_UPDATE_REQUIRED',message:'Die unterdrückte Quelle enthält noch aufgeschobene Maße. Quelle aktivieren und aktualisieren, bevor sie ausdrücklich in einer Zeichnung ausgegeben wird.',bindingId:binding.id,target:binding.target});}catch{/* Lost/derived inputs already have explicit diagnostics above. */}}
  return problems;
}
