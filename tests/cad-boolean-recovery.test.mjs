import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCadKernel} from '../src/cad-kernel-loader.js';
import {createCadService} from '../src/cad-service.js';
import {createCadCommandRouter} from '../src/cad-command-router.js';
import {createCadProject,serializeCadProject} from '../src/cad-project.js';
import {createCadTransactions} from '../src/cad-transactions.js';
import {cadBoolean,validateCadSolid,writeCadBrep,brepHasNoTriangulation,CAD_BOOLEAN_RECOVERY_TOLERANCE} from '../src/cad-native-kernel.js';

const oc=await loadCadKernel({print:()=>{},printErr:()=>{}});
// A closed box with one reversed face models the actual OCCT failure: valid
// individual curves/faces, but an invalid orientation in the result solid.
const invalid=(()=>{
 const make=new oc.BRepPrimAPI_MakeBox(10,10,10),box=make.Shape(),shell=new oc.TopoDS_Shell(),builder=new oc.TopoDS_Builder();builder.MakeShell(shell);
 const ex=new oc.TopExp_Explorer(box,oc.TopAbs_ShapeEnum.TopAbs_FACE);let index=0;
 try{while(ex.More()){const face=ex.Current(),placed=index++?face:face.Reversed();builder.Add(shell,placed);if(placed!==face)placed.delete();face.delete();ex.Next();}
  const solidMaker=new oc.BRepBuilderAPI_MakeSolid(shell),solid=solidMaker.Solid();try{assert.throws(()=>validateCadSolid(oc,solid),e=>e.code==='INVALID_CAD_TOPOLOGY');return writeCadBrep(oc,solid);}finally{solid.delete();solidMaker.delete();}
 }finally{ex.delete();builder.delete();shell.delete();box.delete();make.delete();}
})();
function invalidResult(types,run,{always=false}={}){
 const saved=[],counts={};
 try{for(const type of types){const prototype=oc[type].prototype,original=prototype.Shape;
  const wrapper=function(...args){const shape=original.apply(this,args);counts[type]=(counts[type]??0)+1;if(always||counts[type]===1){shape.delete();return oc.BRepToolsWrapper.Read(invalid);}return shape;};
  Object.assign(wrapper,original);saved.push([prototype,original]);prototype.Shape=wrapper;
 }return run(counts);}finally{for(const [prototype,original]of saved)prototype.Shape=original;}
}
const near=(a,b)=>assert.ok(Math.abs(a-b)<Math.max(1,Math.abs(b))*1e-8,`${a} vs ${b}`);

for(const [operation,type,volume]of [['difference','BRepAlgoAPI_Cut',500],['union','BRepAlgoAPI_Fuse',1500],['intersection','BRepAlgoAPI_Common',500]]){
 test(`First ${operation} recovers an invalid native result by the exact dual identity`,()=>{
  const service=createCadService({oc}),a=service.nativeNode({type:'box',size:[10,10,10]},{id:'a'}),b=service.nativeNode({type:'box',size:[10,10,10]},{id:'b'});b.transform[12]=5;
  const left=service.worldShape(a),right=service.worldShape(b);let result;
  try{result=invalidResult([type],counts=>{const shape=cadBoolean(oc,operation,left,right);assert.ok(counts[type]>=1);return shape;});near(validateCadSolid(oc,result).volume,volume);assert.ok(brepHasNoTriangulation(writeCadBrep(oc,result)));
   const expected=cadBoolean(oc,operation,left,right);try{assert.equal(cadBoolean(oc,'difference',result,expected,{allowEmpty:true}),null);assert.equal(cadBoolean(oc,'difference',expected,result,{allowEmpty:true}),null);}finally{expected.delete();}
   assert.deepEqual(a.recipe,{type:'box',size:[10,10,10]});near(validateCadSolid(oc,left).volume,1000);near(validateCadSolid(oc,right).volume,1000);
  }finally{result?.delete();left.delete();right.delete();service.dispose();}
 });
}
test('Invalid auxiliary Common cannot reject a valid curved/affine cut',()=>{
 const service=createCadService({oc}),a=service.nativeNode({type:'box',size:[20,20,10]},{id:'a'}),b=service.nativeNode({type:'cylinder',size:[8,8,20]},{id:'b',solid:false});
 a.transform=[-1.2,0,0,0,.2,.8,0,0,.1,.2,1.1,0,0,0,0,1];b.transform=[...a.transform];b.transform[14]=-4;
 const left=service.worldShape(a),right=service.worldShape(b);let expected,result;
 try{expected=cadBoolean(oc,'difference',left,right);result=invalidResult(['BRepAlgoAPI_Common'],()=>cadBoolean(oc,'difference',left,right));near(validateCadSolid(oc,result).volume,validateCadSolid(oc,expected).volume);}
 finally{result?.delete();expected?.delete();left.delete();right.delete();service.dispose();}
});
test('Group recovery keeps input sources and requires only one preview/apply/Undo',async()=>{
 const service=createCadService({oc}),router=createCadCommandRouter({oc,service});
 try{const a=service.nativeNode({type:'box',size:[10,10,10]},{id:'a'}),b=service.nativeNode({type:'box',size:[10,10,10]},{id:'b',solid:false});b.transform[12]=5;const p=createCadProject({nodes:[a,b]}),before=serializeCadProject(p);
  // Keep the patch active until the asynchronous native builder completes.
  const prototype=oc.BRepAlgoAPI_Cut.prototype,original=prototype.Shape;let calls=0;const wrapper=function(...args){const result=original.apply(this,args);if(++calls===1){result.delete();return oc.BRepToolsWrapper.Read(invalid);}return result;};Object.assign(wrapper,original);prototype.Shape=wrapper;
  const store=createCadTransactions({initial:p,build:async(draft,{operation})=>(await router.run(draft,operation)).project});
  let preview;try{preview=await store.preview({revision:store.revision(),project:p,operation:{kind:'tool',name:'previewGroup',options:{ids:['a','b'],id:'group'}}});}finally{prototype.Shape=original;}
  near(preview.project.nodes[0].stats.volume,500);assert.equal(serializeCadProject(p),before);assert.deepEqual(preview.project.nodes[0].children.map(n=>[n.id,n.recipe,n.transform]),p.nodes.map(n=>[n.id,n.recipe,n.transform]));
  assert.equal(store.state().undo,0);store.apply(preview);assert.equal(store.state().undo,1);assert.equal(serializeCadProject(store.undo().project),before);near(store.redo().project.nodes[0].stats.volume,500);
 }finally{service.dispose();}
});
test('Bounded fuzzy recovery tightens its ceiling for thin operands and preserves narrow material',()=>{
 const service=createCadService({oc});
 try{for(const thickness of [10,.0004]){
  const a=service.nativeNode({type:'box',size:[10,10,thickness]}),b=service.nativeNode({type:'box',size:[10,10,thickness]});b.transform[12]=5;
  const left=service.worldShape(a),right=service.worldShape(b),prototype=oc.BRepAlgoAPI_Cut.prototype,original=prototype.SetFuzzyValue,tolerances=[];
  const wrapper=function(value){tolerances.push(value);return original.call(this,value);};Object.assign(wrapper,original);prototype.SetFuzzyValue=wrapper;let result;
  try{result=invalidResult(['BRepAlgoAPI_Cut','BRepAlgoAPI_Common'],()=>cadBoolean(oc,'difference',left,right));near(validateCadSolid(oc,result).volume,50*thickness);assert.ok(tolerances.length);assert.ok(tolerances.every(t=>t<=Math.min(CAD_BOOLEAN_RECOVERY_TOLERANCE,thickness*1e-4)));near(validateCadSolid(oc,left).volume,100*thickness);near(validateCadSolid(oc,right).volume,100*thickness);}
  finally{prototype.SetFuzzyValue=original;result?.delete();left.delete();right.delete();}
 }}finally{service.dispose();}
});
test('All invalid formulations still reject the operation; invalid inputs are never healed',()=>{
 const service=createCadService({oc}),a=service.worldShape(service.nativeNode({type:'box',size:[10,10,10]})),b=service.worldShape(service.nativeNode({type:'box',size:[5,5,5]})),bad=oc.BRepToolsWrapper.Read(invalid);
 try{invalidResult(['BRepAlgoAPI_Cut','BRepAlgoAPI_Common'],()=>assert.throws(()=>cadBoolean(oc,'difference',a,b),e=>e.code==='INVALID_CAD_TOPOLOGY'&&e.cadPhase==='boolean-difference-recovery'),{always:true});assert.throws(()=>cadBoolean(oc,'difference',bad,b),e=>e.code==='INVALID_CAD_TOPOLOGY');}
 finally{a.delete();b.delete();bad.delete();service.dispose();}
});
