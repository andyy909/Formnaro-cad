import {cadFontForText} from './cad-font-outline.js';
import {cadRecipeForShape,cadEditFormRecipe} from './cad-form-controls.js';
export async function nativeRecipeForInput(oc,type,input,{fonts=[]}={}){const id=input.font??'regular',data=type==='text'?await cadFontForText(id,input.text??'TEXT',fonts):null;return cadRecipeForShape(type,{...input,oc,fonts:data?{[id]:data}:undefined});}
export async function nativeRecipeEdit(oc,node,patch,{fonts=[]}={}){const id=patch.font??node.recipe?.font??'regular',required=node.recipe?.type==='text'&&(patch.text!==undefined||patch.font!==undefined),data=required?await cadFontForText(id,patch.text??node.recipe.text,fonts):null;return cadEditFormRecipe(node,patch,{oc,fonts:data?{[id]:data}:undefined});}
