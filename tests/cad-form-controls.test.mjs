import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CAD_SHAPES,cadRecipeForShape,cadFormParameters,cadEditFormRecipe,cadPreserveFormBounds,cadSourceAtPath,cadReplaceFormSource} from '../src/cad-form-controls.js';
import {SHAPES} from '../src/geometry.js';
import {defaults,SCHEMAS} from '../src/parameters.js';
import {cadIdentity,cadPoint,multiplyCadMatrices} from '../src/cad-affine.js';
import {createCadProject,validateCadProject} from '../src/cad-project.js';
import {loadCadKernel} from '../src/cad-kernel-loader.js';
import {createCadService} from '../src/cad-service.js';
import {brepHasNoTriangulation,validateCadSolid} from '../src/cad-native-kernel.js';
const oc=await loadCadKernel({print:()=>{},printErr:()=>{}});
const fonts=Object.fromEntries([['regular','font.json'],['bold','fonts/helvetiker_bold.typeface.json'],['serif','fonts/optimer_regular.typeface.json']].map(([id,file])=>[id,JSON.parse(fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8'))]));
const near=(a,b,e=1e-5)=>assert.ok(Math.abs(a-b)<=e,`${a} vs ${b}`);
function corners(node){const {min,max}=node.stats.bounds;return Array.from({length:8},(_,i)=>[0,1,2].map(axis=>i&(1<<axis)?max[axis]:min[axis])).map(point=>cadPoint(node.transform,point));}
function preserved(a,b){for(const [index,point]of corners(a).entries())point.forEach((v,axis)=>near(v,corners(b)[index][axis]));}
test('Native palette labels, sizes, colors and constructive defaults match all original 23 shapes',()=>{
  assert.deepEqual(CAD_SHAPES.map(shape=>[shape.type,shape.name,shape.color,[...shape.defaultSize]]),SHAPES);assert.equal(CAD_SHAPES.length,23);
  for(const shape of CAD_SHAPES){const recipe=cadRecipeForShape(shape.type,{fonts,oc}),expected=defaults(shape.type);delete expected.edgeSteps;assert.deepEqual(recipe.size,shape.defaultSize);if(Object.keys(expected).length)assert.deepEqual(recipe.params,expected);else assert.equal(recipe.params,undefined);assert.ok(!Object.hasOwn(recipe.params||{},'edgeSteps'));}
  assert.throws(()=>cadRecipeForShape('text',{fonts}),/CAD-Worker/);assert.throws(()=>cadRecipeForShape('text',{fonts,oc,font:'missing'}),/Schriftquelle fehlt/);assert.throws(()=>cadRecipeForShape('box',{params:{edgeSteps:24}}),/konstruktiver/);
});
test('Every default palette recipe builds a valid native body, independent of display parameters',()=>{
  const service=createCadService({oc});try{
    for(const shape of CAD_SHAPES){const recipe=cadRecipeForShape(shape.type,{fonts,oc}),node=service.nativeNode(recipe,{id:'isolated-form-default-'+shape.type,name:shape.name,solid:shape.type!=='countersink'}),view=cadFormParameters(node);
      assert.ok(node.stats.volume>0,shape.type);assert.ok(brepHasNoTriangulation(node.brep.data),shape.type);assert.equal(view.type,shape.type);assert.deepEqual(view.schema,(SCHEMAS[shape.type]||[]).filter(field=>field.key!=='edgeSteps'));assert.deepEqual(view.params,recipe.params||{});
      const body=service.worldShape(node);try{assert.ok(validateCadSolid(oc,body).solids>=1,shape.type);}finally{body.delete();}
      validateCadProject(createCadProject({nodes:[node]}));
    }
  }finally{service.dispose();}
});
test('Original text/font edits preserve complete affine occupied dimensions and source metadata',()=>{
  const service=createCadService({oc});try{
    const matrix=cadIdentity();matrix[0]=-1.3;matrix[4]=.45;matrix[8]=.2;matrix[9]=.1;matrix[10]=.8;matrix[12]=17;matrix[13]=-5;matrix[14]=6;
    const original=service.nativeNode(cadRecipeForShape('text',{text:'B8',font:'regular',fonts,oc}),{id:'isolated-form-text',transform:matrix,color:'#123456',metadata:{notes:'original',tags:['editable']}}),before=structuredClone(original),recipe=cadEditFormRecipe(original,{text:'O',font:'serif'},{fonts,oc}),replacement=service.nativeNode(recipe,{id:original.id}),placed=cadPreserveFormBounds(original,replacement);
    assert.equal(recipe.topologyCertified,true);assert.equal(recipe.contours.reduce((sum,contour)=>sum+contour.holes.length,0),1);assert.equal(recipe.text,'O');assert.equal(recipe.font,'serif');assert.deepEqual(placed.metadata,original.metadata);assert.equal(placed.color,original.color);assert.deepEqual(original,before);preserved(original,placed);
    assert.throws(()=>cadEditFormRecipe(original,{params:{edgeSteps:12}},{fonts,oc}),/konstruktiver/);assert.throws(()=>cadEditFormRecipe(original,{segments:512},{fonts,oc}),/Unbekanntes Feld/);
  }finally{service.dispose();}
});
test('Generator source edits preserve local corner positions under affine placement and retain physical original parameters',()=>{
  const service=createCadService({oc});try{
    const matrix=cadIdentity();matrix[0]=-2;matrix[4]=.35;matrix[10]=1.7;matrix[12]=3;matrix[14]=8;
    const original=service.nativeNode(cadRecipeForShape('gear',{params:{teeth:8,module:1,thickness:2,bore:0}}),{id:'isolated-form-gear',transform:matrix}),recipe=cadEditFormRecipe(original,{params:{teeth:9,thickness:3}}),replacement=service.nativeNode(recipe,{id:original.id}),placed=cadPreserveFormBounds(original,replacement);
    preserved(original,placed);assert.equal(placed.recipe.params.module,1);assert.equal(placed.recipe.params.thickness,3);assert.equal(placed.recipe.params.teeth,9);assert.notEqual(placed.transform[10],matrix[10]);assert.ok(placed.transform[0]<0);
    const rebuilt=service.nativeNode(recipe,{id:original.id,transform:placed.transform});preserved(original,rebuilt);assert.throws(()=>cadEditFormRecipe(original,{sides:7}),/Polygon/);
    assert.throws(()=>cadPreserveFormBounds(original,{...replacement,id:'another'}),/Ersatzquelle/);
  }finally{service.dispose();}
});
test('Nested group source paths edit polygon sides and native holes without changing sibling metadata or parent matrices',async()=>{
  const service=createCadService({oc});try{
    const outer=service.nativeNode(cadRecipeForShape('box',{size:[30,30,10]}),{id:'isolated-form-outer'}),holeMatrix=cadIdentity();holeMatrix[12]=3;
    const hole=service.nativeNode(cadRecipeForShape('polygon',{size:[8,8,14],params:{sides:8}}),{id:'isolated-form-hole',solid:false,transform:holeMatrix}),inner={id:'isolated-form-inner',kind:'cad',source:'group',name:'inner',solid:true,operation:'union',transform:cadIdentity(),children:[outer,hole],brep:outer.brep,stats:outer.stats},matrix=cadIdentity();matrix[4]=.2;matrix[12]=15;
    const root={...structuredClone(inner),id:'isolated-form-root',name:'root',transform:matrix,children:[inner]},project=await service.rebuild(createCadProject({nodes:[root]})),before=structuredClone(project),source=cadSourceAtPath(project,root.id,[inner.id,hole.id]),recipe=cadEditFormRecipe(source,{sides:3}),replacement=cadPreserveFormBounds(source,service.nativeNode(recipe,{id:source.id})),draft=cadReplaceFormSource(project,root.id,[inner.id,hole.id],replacement),rebuilt=await service.rebuild(draft);
    assert.deepEqual(project,before);assert.equal(cadSourceAtPath(rebuilt,root.id,[inner.id,hole.id]).recipe.params.sides,3);assert.deepEqual(rebuilt.nodes[0].transform,matrix);assert.deepEqual(cadSourceAtPath(rebuilt,root.id,[inner.id,outer.id]),cadSourceAtPath(project,root.id,[inner.id,outer.id]));assert.ok(Math.abs(rebuilt.nodes[0].stats.volume-project.nodes[0].stats.volume)>1);preserved(source,replacement);
    const locked=structuredClone(project);locked.nodes[0].children[0].locked=true;assert.throws(()=>cadReplaceFormSource(locked,root.id,[inner.id,hole.id],replacement),/gesperrt/);assert.throws(()=>cadSourceAtPath(project,root.id,['missing']),/fehlt/);
    assert.deepEqual(multiplyCadMatrices(rebuilt.nodes[0].transform,rebuilt.nodes[0].children[0].transform),matrix);
  }finally{service.dispose();}
});
