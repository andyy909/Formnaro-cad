import {validateCadTemplateData,cadTemplateVariables,cadTemplateSource,formula} from './cad-template-data.js';
import {cadProjectSnapshot} from './cad-project.js';
import {cadPoint,multiplyCadMatrices,resizeCadAtCorner} from './cad-affine.js';
import {cadFormLocalDimensions,cadInterfaceLocalBounds} from './cad-interface-state.js';

const translation=point=>[1,0,0,0,0,1,0,0,0,0,1,0,...point,1];
/** Native bindings keep full source matrices. Parameter-driven sources are
 * regenerated as CAD, then each intermediate boolean/finish is validated so
 * later bindings measure current native bounds even inside nested groups. */
export async function buildCadTemplate(input,{controls=[],bindings=[],values={}}={},{service,editRecipe,signal}={}){
  if(typeof service?.rebuild!=='function'||typeof service?.nativeNode!=='function'||typeof editRecipe!=='function')throw Error('Der native CAD-Vorlagengenerator fehlt.');
  const baseline=cadProjectSnapshot(input),data=validateCadTemplateData(baseline,{controls,bindings}),variables=cadTemplateVariables(data.controls,values);let project=await service.rebuild(baseline,{signal});
  for(const binding of data.bindings){
    if(signal?.aborted){const error=Error('CAD-Vorlagenaufbau abgebrochen.');error.name='AbortError';throw error;}
    const prior=cadProjectSnapshot(project),node=cadTemplateSource(project,binding),value=formula(binding.formula,variables),axis=Number(binding.field.at(-1));
    if(binding.field.startsWith('size.')){const dimensions=cadFormLocalDimensions(node);dimensions[axis]=value;node.transform=resizeCadAtCorner(node,dimensions).transform;}
    else if(binding.field.startsWith('pos.')){const bounds=cadInterfaceLocalBounds(node),center=bounds.min.map((v,i)=>(v+bounds.max[i])/2),point=cadPoint(node.transform,center);node.transform[12+axis]+=value-point[axis];}
    else{
      const key=binding.field.slice(7),recipe=await editRecipe({...node,locked:false},{params:{[key]:value}}),replacement=service.nativeNode(recipe,{id:node.id,name:node.name,transform:node.transform}),offset=node.stats.bounds.min.map((v,i)=>v-replacement.stats.bounds.min[i]);
      // Retain the complete affine linear map. Native parameter changes alter
      // physical source dimensions while the former minimum/bottom stays fixed.
      node.transform=multiplyCadMatrices(node.transform,translation(offset));node.recipe=replacement.recipe;node.brep=replacement.brep;node.stats=replacement.stats;
      if(['thread','nut'].includes(recipe.type))node.solid=recipe.params.kind!=='cutter';
    }
    project=await service.rebuild(project,{signal,baseline:prior});await Promise.resolve();
  }
  return project;
}
