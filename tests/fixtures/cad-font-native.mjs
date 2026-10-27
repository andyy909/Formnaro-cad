import assert from 'node:assert/strict';
import {loadCadKernel} from '../../src/cad-kernel-loader.js';
import {nativeRecipeForInput} from '../../src/cad-form-runtime.js';
import {createCadService} from '../../src/cad-service.js';
import {buildCadContours,cadRecipeVolume} from '../../src/cad-recipes.js';
import {cadContourSignedArea} from '../../src/cad-original-contours.js';
const id=process.argv[2],oc=await loadCadKernel({print:()=>{},printErr:()=>{}}),service=createCadService({oc,maxEntries:2});
try{const recipe=await nativeRecipeForInput(oc,'text',{font:id,text:'O',size:[40,15,2]}),body=buildCadContours(oc,{contours:recipe.contours,height:2});try{const area=recipe.contours.reduce((sum,c)=>sum+Math.abs(cadContourSignedArea(c.outer))-(c.holes??[]).reduce((s,h)=>s+Math.abs(cadContourSignedArea(h)),0),0);assert.ok(Math.abs(cadRecipeVolume(oc,body)-area*2)<Math.max(1e-5,area*1e-6));}finally{body.delete();}const word=await nativeRecipeForInput(oc,'text',{font:id,text:'ABO8',size:[40,15,2]});assert.ok(service.nativeNode(word,{id}).stats.volume>0);}finally{service.dispose();}
