import test from 'node:test';
import assert from 'node:assert/strict';
import {formula as originalFormula} from '../src/templates.js';
import {formula,validateCadTemplateData,cadTemplateVariables} from '../src/cad-template-data.js';
import {buildCadTemplate} from '../src/cad-template-recipes.js';
import {loadCadKernel} from '../src/cad-kernel-loader.js';
import {createCadService} from '../src/cad-service.js';
import {cadRecipeForShape,cadEditFormRecipe} from '../src/cad-form-controls.js';
import {createCadProject,serializeCadProject} from '../src/cad-project.js';
import {cadIdentity,cadPoint} from '../src/cad-affine.js';
import {createCadTransactions} from '../src/cad-transactions.js';
import {createCadPersistence,CAD_LIBRARY_KEY} from '../src/cad-persistence.js';
import {validateCadSolid,brepHasNoTriangulation} from '../src/cad-native-kernel.js';
import {cadFormLocalDimensions} from '../src/cad-interface-state.js';
import {cadWorkplaneFromHit} from '../src/cad-tools-native.js';
const oc=await loadCadKernel({print:()=>{},printErr:()=>{}}),near=(a,b,e=1e-5)=>assert.ok(Math.abs(a-b)<e,`${a} vs ${b}`);
const editRecipe=(node,patch)=>cadEditFormRecipe(node,patch,{oc});
test('Personal-template arithmetic retains precedence/unary grammar and rejects calls, property access and unknown values',()=>{
  const vars={width:12,gap:1.5};for(const expression of ['width+gap*2','(width-gap)/2','-width+ +gap','-.5*width','width/(gap+2)'])near(formula(expression,vars),originalFormula(expression,vars));
  for(const expression of ['Math.sin(width)','width.constructor','process.exit()','width;0','missing+1','width/0','1e3','width=2'])assert.throws(()=>formula(expression,vars));assert.throws(()=>cadTemplateVariables([{name:'width',value:12}],{missing:2}));
});
async function groupFixture(service){
  const body=service.nativeNode(cadRecipeForShape('box',{size:[40,40,10]}),{id:'isolated-template-body',color:'#445566'}),hole=service.nativeNode(cadRecipeForShape('cylinder',{size:[6,6,14]}),{id:'isolated-template-hole',solid:false}),matrix=[-1.2,0,0,0,.25,1,0,0,.1,.05,1.3,0,12,-7,6,1],group={id:'isolated-template-group',kind:'cad',source:'group',name:'Bored template',solid:true,operation:'union',transform:matrix,children:[body,hole],brep:body.brep,stats:body.stats,metadata:{notes:'source metadata'}};
  return service.rebuild(createCadProject({nodes:[group]}));
}
test('Native template size/position bindings preserve mirrors/shear, editable holes and fresh grouped volume',async()=>{
  const service=createCadService({oc});try{const initial=await groupFixture(service),before=serializeCadProject(initial),root=initial.nodes[0],hole=root.children[1],data={controls:[{name:'width',value:60},{name:'diameter',value:8},{name:'offset',value:12}],bindings:[{index:0,path:[hole.id],field:'size.0',formula:'diameter'},{index:0,path:[hole.id],field:'size.1',formula:'diameter'},{index:0,path:[hole.id],field:'pos.0',formula:'offset'},{index:0,path:[],field:'size.0',formula:'width'}]},built=await buildCadTemplate(initial,data,{service,editRecipe});
    near(cadFormLocalDimensions(built.nodes[0])[0],60);near(built.nodes[0].stats.volume,16000-Math.PI*16*10);near(cadPoint(built.nodes[0].children[1].transform,[0,0,0])[0],12);assert.equal(built.nodes[0].children[1].solid,false);assert.deepEqual(built.nodes[0].metadata,root.metadata);assert.ok(built.nodes[0].transform[0]<0&&built.nodes[0].transform[4]!==0);assert.ok(brepHasNoTriangulation(built.nodes[0].brep.data));assert.equal(serializeCadProject(initial),before);
    const world=service.worldShape(built.nodes[0]);try{near(validateCadSolid(oc,world).volume,built.nodes[0].stats.volume*1.5*1.3,1e-3);}finally{world.delete();}
  }finally{service.dispose();}
});
test('Native parameter bindings regenerate original gear sources, preserve full affine placement and former bottom/minimum anchor',async()=>{
  const service=createCadService({oc});try{
    const transform=[1.3,0,0,0,.3,.8,0,0,.1,.2,1.1,0,5,-2,4,1],gear=service.nativeNode(cadRecipeForShape('gear',{params:{teeth:8,module:1,thickness:2,bore:0}}),{id:'isolated-template-gear',transform,locked:true,metadata:{plugin:{id:'original',shapeId:'gear'}}}),initial=createCadProject({nodes:[gear]}),data={controls:[{name:'module',value:1.2},{name:'thickness',value:3}],bindings:[{index:0,path:[],field:'params.module',formula:'module'},{index:0,path:[],field:'params.thickness',formula:'thickness'}]},built=await buildCadTemplate(initial,data,{service,editRecipe}),after=built.nodes[0];
    assert.equal(after.recipe.params.module,1.2);assert.equal(after.recipe.params.thickness,3);assert.deepEqual(after.transform.slice(0,12),transform.slice(0,12));assert.equal(after.locked,true);assert.deepEqual(after.metadata,gear.metadata);cadPoint(gear.transform,gear.stats.bounds.min).forEach((v,i)=>near(v,cadPoint(after.transform,after.stats.bounds.min)[i]));assert.ok(after.stats.bounds.max[0]-after.stats.bounds.min[0]>gear.stats.bounds.max[0]-gear.stats.bounds.min[0]);
    await assert.rejects(buildCadTemplate(initial,{...data,values:{module:0}},{service,editRecipe}));assert.equal(initial.nodes[0].recipe.params.module,1);
  }finally{service.dispose();}
});
test('Native formula templates persist version-5 source recipes, validate before write and insert new source IDs as one Undo step',async()=>{
  const service=createCadService({oc});try{const initial=await groupFixture(service),transactions=createCadTransactions({initial,build:(project,context)=>service.rebuild(project,{baseline:context.baseline})}),values=new Map([['offlinecad-library-v1','untouched legacy']]),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};let id=0;
    const persistence=createCadPersistence({storage,transactions,verify:project=>service.rebuild(project),instantiate:(project,data)=>buildCadTemplate(project,data,{service,editRecipe}),makeId:()=>`isolated-template-new-${++id}`}),saved=persistence.saveTemplate({name:'Parametric CAD part',ids:[initial.nodes[0].id]}),hole=initial.nodes[0].children[1],entry={...saved,controls:[{name:'diameter',value:8}],bindings:[{index:0,path:[hole.id],field:'size.0',formula:'diameter'},{index:0,path:[hole.id],field:'size.1',formula:'diameter'}],favorite:true};
    await persistence.updateTemplate(entry);assert.equal(persistence.listTemplates()[0].favorite,true);assert.equal(values.get('offlinecad-library-v1'),'untouched legacy');const before=values.get(CAD_LIBRARY_KEY),confirmed=serializeCadProject(transactions.snapshot());
    const preview=await persistence.previewTemplate({id:entry.id,revision:transactions.revision(),values:{diameter:10}});assert.equal(serializeCadProject(transactions.snapshot()),confirmed);const applied=transactions.apply(preview),instance=applied.project.nodes.at(-1);assert.notEqual(instance.id,initial.nodes[0].id);assert.notEqual(instance.children[1].id,hole.id);near(cadFormLocalDimensions(instance.children[1])[0],10);near(instance.stats.volume,16000-Math.PI*25*10);assert.equal(transactions.state().undo,1);transactions.undo();assert.equal(serializeCadProject(transactions.snapshot()),confirmed);
    await assert.rejects(persistence.updateTemplate({...entry,controls:[{name:'diameter',value:-1}]}));assert.equal(values.get(CAD_LIBRARY_KEY),before);await assert.rejects(persistence.importLibrary(JSON.stringify({format:'FormnaroCADLibrary',version:5,items:[{...entry,bindings:[{index:0,path:[hole.id],field:'mesh.verts',formula:'diameter'}]}]})));assert.equal(values.get(CAD_LIBRARY_KEY),before);
  }finally{service.dispose();}
});
test('Native template targets reject absent sources, presentation controls, nonnumeric parameters and unresolved formulas',()=>{
  const project=createCadProject({nodes:[]}),data={controls:[{name:'d',value:5}],bindings:[{index:0,path:[],field:'size.0',formula:'d'}]};assert.throws(()=>validateCadTemplateData(project,data),/Maßabhängigkeit/);
});
test('Consecutive nested cylinder bindings rebind the side workplane once per current affine source',async()=>{
  const service=createCadService({oc});try{
    const cylinder=service.nativeNode(cadRecipeForShape('cylinder',{size:[20,20,20]}),{id:'isolated-template-plane-cylinder'}),group={id:'isolated-template-plane-group',kind:'cad',source:'group',name:'Cylinder template',solid:true,operation:'union',transform:cadIdentity(),children:[cylinder],brep:cylinder.brep,stats:cylinder.stats},project=await service.rebuild(createCadProject({nodes:[group]})),plane=cadWorkplaneFromHit({objectId:group.id,point:[6,8,5],normal:[.6,.8,0]},{transform:group.transform});
    plane.reference.topology.origin={rootId:group.id,path:[cylinder.id],featureId:'cylinder-face-side'};project.workplane=plane;
    const built=await buildCadTemplate(project,{controls:[{name:'diameter',value:24},{name:'height',value:28}],bindings:[{index:0,path:[cylinder.id],field:'size.0',formula:'diameter'},{index:0,path:[cylinder.id],field:'size.1',formula:'diameter'},{index:0,path:[cylinder.id],field:'size.2',formula:'height'}]},{service,editRecipe});
    assert.ok(built.workplane.reference);[9.2,11.6,11].forEach((value,i)=>near(built.workplane.origin[i],value,2e-6));assert.deepEqual(built.workplane.reference.topology.origin.path,[cylinder.id]);
  }finally{service.dispose();}
});
