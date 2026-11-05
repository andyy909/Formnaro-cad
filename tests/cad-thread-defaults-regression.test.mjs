import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCadKernel} from '../src/cad-kernel-loader.js';
import {cadRecipeForShape} from '../src/cad-form-controls.js';
import {buildCadThread,cadThreadDefinition} from '../src/cad-screw-surfaces.js';
import {cadRecipeBounds,assertCadRecipeTolerance} from '../src/cad-recipes.js';
import {validateCadSolid,readCadBrep} from '../src/cad-native-kernel.js';
import {exportCadStep,importCadStep} from '../src/cad-step-io.js';

const oc=await loadCadKernel({print:()=>{},printErr:()=>{}});
for(const [name,type,length] of [['palette thread','thread',16],['short metric thread','thread',4],['palette nut','nut',16]]){
  test(name+' retains the original dimensions and final tolerance after native construction',()=>{
    const recipe=cadRecipeForShape(type,{oc});
    recipe.params.length=length;
    const definition=cadThreadDefinition(recipe.params);
    const shape=buildCadThread(oc,recipe.params);
    try{
      assert.equal(validateCadSolid(oc,shape).solids,1);
      assert.ok(assertCadRecipeTolerance(oc,shape,definition.tolerance)<=definition.tolerance/2);
      const bounds=cadRecipeBounds(oc,shape);
      assert.ok(Math.abs(bounds.size[2]-length)<1e-5);
      const imported=importCadStep(oc,exportCadStep(oc,[{shape,name}]));
      const restored=readCadBrep(oc,imported.brep.data);
      try{
        assert.equal(validateCadSolid(oc,restored).solids,1);
        assert.ok(Math.abs(cadRecipeBounds(oc,restored).size[2]-length)<1e-5);
      }finally{restored.delete();}
    }finally{shape.delete();}
  });
}
