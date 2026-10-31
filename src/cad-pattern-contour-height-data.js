import {cadProjectParameterFieldValue,cadProjectParameterProblems,cadProjectParameterTarget,evaluateCadProjectParameters} from './cad-project-parameters-data.js';
import {isCadContourProfileField} from './cad-contour-profile-bindings.js';

const fail=message=>{throw Object.assign(Error(message),{code:'PATTERN_CONTOUR_SCOPE_UNSUPPORTED'});};

/** Free sketch controls and affine controls are applied to the fresh profile.
 * Addresses identify the actual sketch, including nested group sources. */
export function planCadContourHeightBindings(project,targetAddresses,data=project.projectParameters){
 const key=target=>JSON.stringify([target.rootId,target.path]),targets=new Set(targetAddresses.map(key)),roots=[...new Set(targetAddresses.map(target=>target.rootId))];
 for(const definition of [project.projectParameters,data])for(const binding of definition?.bindings??[]){
  if(!targets.has(key(binding.target)))continue;
  let node;try{node=cadProjectParameterTarget(project,binding.target).node;}catch{fail('Das gebundene Konturziel fehlt.');}
  if(binding.field!=='sketch.dimensions.height'&&!binding.field.startsWith('sketch.variables.')&&!/^(?:size|pos)\.[012]$/.test(binding.field)&&!isCadContourProfileField(binding.field))fail('An Kopienkonturen nur vorhandene Skizzenmaße, native Profilkoordinaten, Körpergrößen oder Positionen binden.');
  let value;try{value=cadProjectParameterFieldValue(node,binding.field);}catch{fail('Das gebundene freie Konturmaß fehlt.');}
  if(!value.literal)fail('Eine vorhandene Konturformel erhalten und stattdessen ihr freies Ausgangsmaß binden.');
 }
 if(project.projectParameters&&cadProjectParameterProblems(project,project.projectParameters,{ids:roots}).length)fail('Gebundene Konturzielmaße zuerst ausdrücklich aktualisieren.');
 return data?evaluateCadProjectParameters(data).bindings.filter(binding=>targets.has(key(binding.target))):[];
}

/** Internal first phase retains definitions/variants but defers these controls.
 * Their complete definition is restored before the final contour pass. */
export function withoutCadContourHeightBindings(data,bindings){
 if(!data||!bindings.length)return data;
 const ids=new Set(bindings.map(binding=>binding.id)),copy=structuredClone(data);
 copy.bindings=copy.bindings.filter(binding=>!ids.has(binding.id));
 if(copy.applied)copy.applied.inputs=copy.applied.inputs.filter(input=>!ids.has(input.bindingId));
 return copy;
}

/** A nested suppression belongs to the final contour/ancestor build, rather
 * than an earlier provisional rebuild against the old copied profile. */
export function withoutCadContourTargetStates(data,targets){
 if(!data||!targets.length)return data;const keys=new Set(targets.map(target=>JSON.stringify([target.rootId,target.path]))),keep=state=>!keys.has(JSON.stringify([state.target.rootId,state.target.path])),copy=structuredClone(data);
 if(copy.baseStates)copy.baseStates=copy.baseStates.filter(keep);
 copy.variants=copy.variants.map(variant=>({...variant,states:variant.states.filter(keep)}));return copy;
}
