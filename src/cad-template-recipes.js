import {validateCadTemplateData,cadTemplateVariables,formula} from './cad-template-data.js';
import {cadProjectSnapshot} from './cad-project.js';
import {buildCadBoundSubset} from './cad-project-parameters-native.js';

/** Collect all bindings before one targeted bottom-up native construction.
 * Fresh bounds drive final affine sizes/positions; retained source recipes,
 * mirrors, shear and virtual-template locks remain intact. */
export async function buildCadTemplate(input,{controls=[],bindings=[],values={}}={},{service,editRecipe,signal}={}){
  if(typeof service?.rebuild!=='function'||typeof service?.nativeNode!=='function'||typeof editRecipe!=='function')throw Error('Der native CAD-Vorlagengenerator fehlt.');
  const baseline=cadProjectSnapshot(input),data=validateCadTemplateData(baseline,{controls,bindings}),variables=cadTemplateVariables(data.controls,values),collected=data.bindings.map(binding=>({target:{rootId:baseline.nodes[binding.index].id,path:[...binding.path]},field:binding.field,value:formula(binding.formula,variables)}));
  return (await buildCadBoundSubset(baseline,collected,{service,editRecipe,signal,allowLockedTemplate:true})).project;
}
