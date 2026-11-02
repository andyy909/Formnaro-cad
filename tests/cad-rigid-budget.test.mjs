import test from 'node:test';import assert from 'node:assert/strict';import {Matrix4,Vector3} from 'three';
import {loadCadKernel} from '../src/cad-kernel-loader.js';import {createCadService} from '../src/cad-service.js';
import {createCadProject,parseCadProject,serializeCadProject} from '../src/cad-project.js';
const oc=await loadCadKernel({print:()=>{},printErr:()=>{}});
const recipe={type:'thread',size:[16,16,20],params:{kind:'external',profile:'trapezoid',diameter:16,pitch:4,length:20,hand:'right',starts:1,phase:0,clearance:0,outerShape:'round',outerDiameter:16,head:'none',leadIn:0}};
test('Tr16x4 retains its exact local source through rigid rotations, another edit, save and export',async()=>{
 const service=createCadService({oc});try{
  const node=service.nativeNode(recipe,{id:'thread'}),before=node.brep.data,volume=node.stats.volume,counts=service.constructionState().counts.thread;
  for(const angle of [0,3.004649258303339,12,45,90]){
   const current=structuredClone(node);current.transform=new Matrix4().makeRotationX(angle*Math.PI/180).setPosition(new Vector3(25,-30,7)).toArray();
   const other=service.nativeNode({type:'box',size:[2,3,4]},{id:'other',transform:new Matrix4().makeTranslation(100,0,0).toArray()}),project=await service.rebuild(createCadProject({nodes:[current,other]}));
   assert.equal(project.nodes[0].brep.data,before,'local BRep at '+angle);assert.equal(project.nodes[0].stats.volume,volume);assert.equal(service.constructionState().counts.thread,counts);
   assert.equal(parseCadProject(serializeCadProject(project)).nodes[0].brep.data,before);assert.ok(service.exportStep(project,{ids:['thread']}).length>0);
  }
 }finally{service.dispose();}
});
test('ancestor rotation preserves descendant budget; actual scale and shear still tighten it',async()=>{
 const service=createCadService({oc});try{
  const child=service.nativeNode({type:'heart',size:[25,25,5]},{id:'heart'}),group={id:'group',kind:'cad',source:'group',name:'group',solid:true,operation:'union',transform:new Matrix4().makeRotationZ(.183).toArray(),children:[child],brep:child.brep,stats:child.stats};
  const project=await service.rebuild(createCadProject({nodes:[group]}));assert.equal(project.nodes[0].children[0].brep.data,child.brep.data);
  for(const transform of [new Matrix4().makeScale(16,16,16).toArray(),new Matrix4().makeShear(0,3,0,0,0,0).toArray()]){
   const stretched=service.nativeNode(child.recipe,{transform});assert.notEqual(stretched.brep.data,child.brep.data);
  }
 }finally{service.dispose();}
});
