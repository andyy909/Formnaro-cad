import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadCadKernel} from '../src/cad-kernel-loader.js';
import {cadContoursFromFont,cadContourSignedArea} from '../src/cad-original-contours.js';
import {buildCadContours,cadRecipeVolume} from '../src/cad-recipes.js';
import {validateCadSolid} from '../src/cad-native-kernel.js';
const oc=await loadCadKernel({print:()=>{},printErr:()=>{}});
test('Every nonempty bundled original glyph becomes valid CAD with its original analytic outline area, including ÿ/®/ç',async(t)=>{
  let total=0;
  for(const [file,expected] of [['src/font.json',205],['src/fonts/helvetiker_bold.typeface.json',205],['src/fonts/optimer_regular.typeface.json',217]]){
    const font=JSON.parse(await readFile(new URL('../'+file,import.meta.url),'utf8'));let count=0;
    for(const [character,glyph] of Object.entries(font.glyphs)){
      if(!glyph.o?.trim())continue;
      const recipe=cadContoursFromFont(oc,font,character,10),shape=buildCadContours(oc,{contours:recipe.contours,height:2});
      try{assert.equal(recipe.topologyCertified,true);assert.ok(validateCadSolid(oc,shape).solids>0,file+' '+character);const area=recipe.contours.reduce((sum,c)=>sum+Math.abs(cadContourSignedArea(c.outer))-c.holes.reduce((n,h)=>n+Math.abs(cadContourSignedArea(h)),0),0);assert.ok(Math.abs(cadRecipeVolume(oc,shape)-area*2)<=Math.max(1e-5,area*1e-7),file+' '+character+' changed its original area');count++;}finally{shape.delete();}
    }
    assert.equal(count,expected,file);total+=count;t.diagnostic(file+': '+count+' native original glyphs');
  }
  assert.equal(total,627);
});
