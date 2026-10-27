import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCadKernel} from '../src/cad-kernel-loader.js';
import {buildCadRecipe} from '../src/cad-recipes.js';
import {cadVolume,cadAffineVolume,transformCad,validateCadSolid,cadBounds,readCadBrep} from '../src/cad-native-kernel.js';
import {cadRecipeForShape} from '../src/cad-form-controls.js';
import {createCadService} from '../src/cad-service.js';
import {createCadProject,parseCadProject,serializeCadProject} from '../src/cad-project.js';
import {cadIdentity} from '../src/cad-affine.js';
const oc=await loadCadKernel({print:()=>{},printErr:()=>{}}),near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<=e,`${a} vs ${b}`);
test('A native sheared/mirrored gear retains affine volume proof across repeated native validity/bounds checks',()=>{
  const source=buildCadRecipe(oc,cadRecipeForShape('gear',{params:{teeth:8,module:1,thickness:2,bore:0}})),matrix=[-1.3,0,0,0,.3,.8,0,0,.1,.2,1.1,0,5,-2,4,1];let world,second;
  try{const volume=cadVolume(oc,source);world=transformCad(oc,source,matrix);near(validateCadSolid(oc,world).volume,cadAffineVolume(volume,matrix));near(cadVolume(oc,world),volume*1.3*.8*1.1);const another=[1,0,0,0,.1,2,0,0,0,0,.5,0,0,0,0,1];second=transformCad(oc,world,another);near(validateCadSolid(oc,second).volume,cadAffineVolume(cadVolume(oc,world),another));assert.equal(validateCadSolid(oc,world).solids,1);assert.ok(cadBounds(oc,world).size.every(size=>size>0));}
  finally{second?.delete();world?.delete();source.delete();}
});
test('Mutating a native affine result invalidates its volume proof and rechecks signed native mass',()=>{
  const source=buildCadRecipe(oc,{type:'box',size:[10,8,6]}),world=transformCad(oc,source,[2,0,0,0,.5,1,0,0,0,0,1,0,0,0,0,1]);
  try{near(cadVolume(oc,world),960);world.Reverse();near(cadVolume(oc,world),-960);assert.throws(()=>validateCadSolid(oc,world),/positivem Volumen/);}
  finally{world.delete();source.delete();}
});
test('A real native boolean cut of a sheared gear proves volume by intersection and survives BRep read/source reconstruction',async()=>{
  let service=createCadService({oc});try{
    const transform=[-1.3,0,0,0,.3,.8,0,0,.1,.2,1.1,0,0,0,0,1],gear=service.nativeNode(cadRecipeForShape('gear',{params:{teeth:8,module:1,thickness:2,bore:0}}),{id:'isolated-volume-group-gear',transform}),hole=service.nativeNode({type:'box',size:[1,1,10]},{id:'isolated-volume-group-hole',solid:false}),group={id:'isolated-volume-group',kind:'cad',name:'Affine gear with hole',source:'group',operation:'union',solid:true,transform:cadIdentity(),children:[gear,hole],brep:gear.brep,stats:gear.stats},project=await service.rebuild(createCadProject({nodes:[group]}));
    near(project.nodes[0].stats.volume,cadAffineVolume(gear.stats.volume,transform)-2.2,2e-6);const read=readCadBrep(oc,project.nodes[0].brep.data);try{near(validateCadSolid(oc,read).volume,project.nodes[0].stats.volume);}finally{read.delete();}
    const serialized=serializeCadProject(project);service.dispose();service=createCadService({oc});const rebuilt=await service.rebuild(parseCadProject(serialized));near(rebuilt.nodes[0].stats.volume,project.nodes[0].stats.volume);assert.deepEqual(rebuilt.nodes[0].children.map(node=>node.transform),project.nodes[0].children.map(node=>node.transform));assert.equal(rebuilt.nodes[0].children[1].solid,false);
  }finally{service.dispose();}
});
