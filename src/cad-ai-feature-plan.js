import {validateCadAIReferences,cadAIReferenceState} from './cad-ai-feature-references.js';
import {cadProjectParameterCatalog} from './cad-project-parameters-catalog.js';
import {planCadAIFeatureDependencies} from './cad-ai-feature-dependencies.js';
import {buildCadDependencyGraph,cadDependencyAffected,cadDependencyNodeId} from './cad-dependency-graph.js';
import {isFreeCADParameterField,freeCADParameterProgram,freeCADParameterKey,freeCADTargetKey} from './cad-freecad-parameter-data.js';
import {cadSelectionContext} from './cad-interface-state.js';
const fail=(message,code='AI_FEATURE_EDIT_INVALID')=>{throw Object.assign(Error('Gezielte Änderung: '+message),{code});};

// Pure scalar authority from captured references and existing parameter edges.
// Native reference resolution still runs in the worker before any host call.
export function planCadAIScalarFeatureOperation(project,operation){
 if(!operation||operation.kind!=='featureEdits'||Object.keys(operation).some(k=>!['kind','references','edits'].includes(k))||!Array.isArray(operation.edits)||!operation.edits.length||operation.edits.length>32)fail('Gültige gezielte Änderungen wählen.');
 if(operation.edits.some(edit=>typeof edit?.field==='string'&&/^(face|edge)[.]/.test(edit.field)))return null;
 const references=validateCadAIReferences(operation.references).items,bindings=[],targets=[],seen=new Set(),programs=new Map();
 for(const edit of operation.edits){
  if(!edit||Object.keys(edit).some(k=>!['referenceId','field','value'].includes(k))||typeof edit.referenceId!=='string'||typeof edit.field!=='string'||edit.field.length>300||!Number.isFinite(edit.value)||Math.abs(edit.value)>100000)fail('Bezug, numerisches Feld und endlichen Wert angeben.');
  const ref=references.find(ref=>ref.id===edit.referenceId);if(!ref)fail('Lokal gewählten Merkmalbezug verwenden.','AI_FEATURE_REFERENCE_REQUIRED');
  const state=cadAIReferenceState(project,ref);if(state.status!=='current'||!state.editable)fail(state.reason??state.message,state.code??'AI_FEATURE_LOCKED');
  const target=ref.origin?.target??ref.target,key=freeCADTargetKey(target)+'/'+edit.field;if(seen.has(key))fail('Dasselbe Merkmalmaß darf nur einmal gesetzt werden.');seen.add(key);targets.push(target);
  const fields=cadProjectParameterCatalog(project,{targets:[target]})[0].fields;
  if(edit.field==='diameter'){
   if(ref.kind!=='bore'||!ref.origin||!Number.isFinite(ref.selector?.surface?.diameter)||ref.selector.surface.diameter<=0||edit.value<.1||edit.value>10000)fail('Eine eindeutige native Bohrungsquelle wählen.','AI_FEATURE_ORIGIN_REQUIRED');
   for(const axis of [0,1]){const field=fields.find(field=>field.field==='size.'+axis);if(!field?.bindable)fail(field?.reason??'Bohrungsquelle ist nicht bearbeitbar.');bindings.push({target,field:field.field,value:field.value*(edit.value/ref.selector.surface.diameter),intrinsic:true});}
  }else{
   if(ref.selector)fail('Ein numerisches Maß benötigt einen ausdrücklich gewählten Quellenbezug.');const field=fields.find(field=>field.field===edit.field);if(!field?.bindable)fail(field?.reason??'Dieses native Maß ist nicht bearbeitbar.');bindings.push({target,field:edit.field,value:edit.value});
   if(isFreeCADParameterField(edit.field)){const context=cadSelectionContext(project,target),{program}=freeCADParameterProgram(context.node),key=freeCADTargetKey(target);if(!project.projectParameters?.freecad?.some(run=>freeCADTargetKey(run.target)===key))fail('FreeCAD-Eingaben zuerst in den Projektparametern oder im Programm-Neulauf ausdrücklich zuordnen.','FREECAD_PARAMETER_INPUTS_REQUIRED');let entry=programs.get(key);if(!entry){entry={target,parameters:structuredClone(program.parameters??{})};programs.set(key,entry);}entry.parameters[freeCADParameterKey(edit.field)]=edit.value;}
  }
 }
 const plan=planCadAIFeatureDependencies(project,bindings,{targets}),graph=buildCadDependencyGraph(project,{projectParameters:plan.data}),programParameters=[...programs.values()],seeds=[...targets.flatMap(target=>['geometry','localPose'].map(kind=>cadDependencyNodeId(kind,target))),...plan.changedBindings.map(binding=>cadDependencyNodeId('binding',binding.id)),...programParameters.map(entry=>cadDependencyNodeId('freecadRun',entry.target))],affected=cadDependencyAffected(graph,seeds),freecadTargets=affected.filter(node=>node.kind==='freecadRun').map(node=>node.target),freecadContourIds=freecadTargets.length?cadDependencyAffected(graph,freecadTargets.map(target=>cadDependencyNodeId('freecadRun',target))).filter(node=>node.kind==='contour').map(node=>node.linkId):[];
 return {plan,bindings,targets,freecadTargets,programParameters,freecadContourIds};
}
