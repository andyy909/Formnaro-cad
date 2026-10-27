// Genuine OCCT fixtures, separate from the deliberately fake storage fixtures.
import {buildCadRecipe} from '../src/cad-recipes.js';
import {cadBoolean,validateCadSolid,writeCadBrep,transformCad} from '../src/cad-native-kernel.js';
import {exportCadStep} from '../src/cad-step-io.js';
import {createCadProject,CAD_IDENTITY_MATRIX} from '../src/cad-project.js';
export const EXPANSION_EXPECTED=Object.freeze({plateSize:[40,20,4],holeDiameter:6,plateVolume:3200-36*Math.PI,assemblyVolume:2*(3200-36*Math.PI),meshBoundaryEdges:5,meshComponents:1});
export function nativeExpansionFixtures(oc){
 const plate=buildCadRecipe(oc,{type:'box',size:[40,20,4]}),hole=buildCadRecipe(oc,{type:'cylinder',size:[6,6,8]});let cut,moved;
 try{
  cut=cadBoolean(oc,'difference',plate,hole);
  const checked=validateCadSolid(oc,cut),stats={bounds:{min:checked.bounds.min,max:checked.bounds.max},volume:checked.volume,solids:checked.solids},brep={format:'OpenCascade-BRep',data:writeCadBrep(oc,cut),triangulation:false};
  const node={id:'bored-plate',kind:'cad',name:'Prüfplatte Ø6',solid:true,source:'step',transform:[...CAD_IDENTITY_MATRIX],brep,stats};
  const second=structuredClone(node);second.id='second-plate';second.name='Zweite Prüfplatte Ø6';second.transform[12]=70;
  moved=transformCad(oc,cut,second.transform);
  return {plate:createCadProject({name:'Prüfplatte 40 × 20 × 4 / Ø6',nodes:[node]}),assembly:createCadProject({name:'Prüfbaugruppe – zwei getrennte Bohrplatten',nodes:[node,second]}),step:exportCadStep(oc,[{shape:cut,name:node.name,color:'#2679b8'},{shape:moved,name:second.name,color:'#df973b'}])};
 }finally{moved?.delete();cut?.delete();hole.delete();plate.delete();}
}
