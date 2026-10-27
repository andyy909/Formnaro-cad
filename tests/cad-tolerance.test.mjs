import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCadKernel} from '../src/cad-kernel-loader.js';
import {createCadService} from '../src/cad-service.js';
import {createCadProject} from '../src/cad-project.js';
import {cadRecipeMinimumFeature} from '../src/cad-recipes.js';
const oc=await loadCadKernel({print:()=>{},printErr:()=>{}});
const scale=(x,y=x,z=x)=>[x,0,0,0,0,y,0,0,0,0,z,0,0,0,0,1];
function faces(node){const shape=oc.BRepToolsWrapper.Read(node.brep.data),ex=new oc.TopExp_Explorer(shape,oc.TopAbs_ShapeEnum.TopAbs_FACE);let count=0;try{while(ex.More()){const f=ex.Current();f.delete();count++;ex.Next();}return count;}finally{ex.delete();shape.delete();}}
test('Full transform stretch tightens the local heart interpolation before CAD construction',()=>{
  const service=createCadService({oc});try{
    const recipe={type:'heart',size:[25,25,5]},ordinary=service.nativeNode(recipe),enlarged=service.nativeNode(recipe,{transform:scale(16)}),reflected=service.nativeNode(recipe,{transform:scale(-16,16,16)});
    assert.ok(faces(enlarged)>faces(ordinary));assert.equal(faces(enlarged),faces(reflected));
    // Refining a permitted spline approximation can change local volume;
    // the cache must preserve distinct geometry for distinct error budgets.
    assert.notEqual(ordinary.brep.data,enlarged.brep.data);
  }finally{service.dispose();}
});
test('Anisotropic small-feature budgets fail explicitly when below the proven CAD precision floor',()=>{
  const service=createCadService({oc});try{
    assert.throws(()=>service.nativeNode({type:'heart',size:[25,25,5]},{transform:scale(100,.0001,1)}),/zu klein/);
    assert.equal(service.cacheState().entries,0);
    assert.equal(cadRecipeMinimumFeature({type:'gear',params:{backlash:.001}}),.001);
    assert.throws(()=>service.nativeNode({type:'gear',size:[33,33,6],params:{backlash:.001}},{transform:scale(10,.01,1)}),/zu klein/);
    assert.equal(service.cacheState().entries,0);
  }finally{service.dispose();}
});
test('Inherited uniform group stretch regenerates the descendant approximation with the full-chain allowance',async()=>{
  const service=createCadService({oc});try{
    const child=service.nativeNode({type:'heart',size:[25,25,5]},{id:'heart',transform:scale(2)}),previousFaces=faces(child),group={id:'group',kind:'cad',source:'group',name:'Herzgruppe',solid:true,operation:'union',transform:scale(8),children:[child],brep:structuredClone(child.brep),stats:structuredClone(child.stats)};
    const result=await service.rebuild(createCadProject({nodes:[group]}));
    assert.ok(faces(result.nodes[0].children[0])>previousFaces);
  }finally{service.dispose();}
});

test('Thread/nut full transform budgets refine native screw surfaces and reject unrepresentable transformed features',()=>{
  const service=createCadService({oc});try{
    const recipe={type:'thread',size:[8,8,.5],params:{length:.5,leadIn:0}},ordinary=service.nativeNode(recipe,{id:'isolated-cad-thread-normal'}),enlarged=service.nativeNode(recipe,{id:'isolated-cad-thread-scaled',transform:scale(4)});
    assert.notEqual(ordinary.brep.data,enlarged.brep.data);
    for(const type of ['thread','nut'])assert.throws(()=>service.nativeNode({type,size:[15,15,.5],params:{length:.5,leadIn:0}},{id:`isolated-cad-${type}-rejected`,transform:scale(100,.0001,1)}),/zu klein/);
    assert.equal(service.cacheState().entries,2);
  }finally{service.dispose();}
});
