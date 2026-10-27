import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {Matrix3,Matrix4,Vector3} from 'three';
import {createCadProject,serializeCadProject,parseCadProject} from '../src/cad-project.js';
import {createCadService} from '../src/cad-service.js';
import {createCadCommandRouter} from '../src/cad-command-router.js';
import {createCadTransactions} from '../src/cad-transactions.js';
import {cadWorkplaneFromHit} from '../src/cad-tools-native.js';
import {cadIdentity,cadPoint,multiplyCadMatrices} from '../src/cad-affine.js';

const moduleUrl=process.env.FORMNARO_CAD_MODULE?pathToFileURL(process.env.FORMNARO_CAD_MODULE):new URL('../cad-kernel-build/runtime/formnaro_cad.js',import.meta.url),loader=(await import(moduleUrl.href)).default,oc=await loader({print:()=>{},printErr:()=>{}});
const close=(a,b,error=1e-5)=>assert.ok(Math.abs(a-b)<=error,`${a} vs ${b}`),closeVector=(a,b,error=1e-5)=>a.forEach((v,k)=>close(v,b[k],error)),translate=x=>new Matrix4().makeTranslation(x,0,0).toArray(),sourceFrame=[-1,.1,0,0,.3,1,0,0,0,.2,1,0,4,-2,3,1],middleFrame=[1,0,0,0,.2,1.2,0,0,.1,0,1,0,5,6,4,1],rootFrame=[1,.1,0,0,0,1,0,0,.1,0,-1,0,-9,2,1,1];
function plane(root,matrix,path,point=[2,3,10]){const normal=new Vector3(0,0,1).applyMatrix3(new Matrix3().getNormalMatrix(new Matrix4().fromArray(matrix))).normalize().toArray(),result=cadWorkplaneFromHit({objectId:root.id,point:cadPoint(matrix,point),normal},{transform:root.transform});result.reference.topology.origin={rootId:root.id,path,featureId:'cylinder-face-top'};return result;}
function group(id,children,transform=cadIdentity()){return {id,kind:'cad',source:'group',name:id,solid:true,operation:'union',children,transform,brep:children[0].brep,stats:children[0].stats};}
function sources(service){return [service.nativeNode({type:'cylinder',size:[20,20,20]},{id:'a',transform:sourceFrame}),service.nativeNode({type:'cylinder',size:[20,20,20]},{id:'b',transform:translate(40)}),service.nativeNode({type:'cylinder',size:[20,20,20]},{id:'c',transform:translate(80)})];}

test('Automation grouping of affine roots rebases the real bound CAD source and keeps world plane through Undo/Save/Reload',async()=>{
  const service=createCadService({oc});try{const [a,b]=sources(service),initial=await service.rebuild(createCadProject({nodes:[a,b],workplane:plane(a,a.transform,[])})),pose=initial.workplane,router=createCadCommandRouter({oc,service}),transactions=createCadTransactions({initial,build:async(project,context)=>context.operation?(await router.run(project,context.operation,{baseline:context.baseline})).project:service.rebuild(project,{baseline:context.baseline})}),preview=await transactions.preview({project:initial,revision:transactions.revision(),operation:{kind:'batch',commands:[{op:'group',targets:['a','b'],as:'group'}]}});assert.equal(transactions.snapshot().workplane.reference.objectId,'a');transactions.apply(preview);const grouped=transactions.snapshot(),reference=grouped.workplane.reference;assert.ok(reference);assert.equal(reference.objectId,grouped.nodes[0].id);assert.equal(reference.topology.origin.rootId,grouped.nodes[0].id);assert.deepEqual(reference.topology.origin.path,['a']);closeVector(reference.topology.anchor.point,cadPoint(a.transform,[2,3,10]));closeVector(grouped.workplane.origin,pose.origin);closeVector(grouped.workplane.orientation,pose.orientation);assert.deepEqual(grouped.nodes[0].children[0].transform,a.transform);transactions.undo();assert.equal(transactions.snapshot().workplane.reference.objectId,'a');transactions.redo();const reopened=await service.rebuild(parseCadProject(serializeCadProject(transactions.snapshot())));assert.ok(reopened.workplane.reference);closeVector(reopened.workplane.origin,pose.origin);
  }finally{service.dispose();}
});

test('Nested automation grouping prefixes only the selected source branch and later recipe-height edits follow its full affine path',async()=>{
  const service=createCadService({oc});try{const [a,b,c]=sources(service),middle=group('middle',[a,b,c],middleFrame),root=group('outer',[middle],rootFrame),matrix=multiplyCadMatrices(multiplyCadMatrices(rootFrame,middleFrame),a.transform),initial=await service.rebuild(createCadProject({nodes:[root],workplane:plane(root,matrix,['middle','a'])})),router=createCadCommandRouter({oc,service}),result=await router.run(initial,{kind:'batch',commands:[{op:'group',targets:[{rootId:'outer',path:['middle','a']},{rootId:'outer',path:['middle','b']}],as:'nested'}]},{baseline:initial}),groupId=result.aliases.nested.path.at(-1),grouped=result.project;assert.ok(grouped.workplane.reference);assert.equal(grouped.workplane.reference.objectId,'outer');assert.deepEqual(grouped.workplane.reference.topology.origin.path,['middle',groupId,'a']);closeVector(grouped.workplane.reference.topology.anchor.point,initial.workplane.reference.topology.anchor.point);closeVector(grouped.workplane.origin,initial.workplane.origin);closeVector(grouped.workplane.orientation,initial.workplane.orientation);
    const draft=structuredClone(grouped);draft.nodes[0].children[0].children.find(node=>node.id===groupId).children.find(node=>node.id==='a').recipe.size[2]=24;const edited=await service.rebuild(draft,{baseline:grouped});assert.ok(edited.workplane.reference);closeVector(edited.workplane.origin,cadPoint(matrix,[2,3,12]));assert.deepEqual(edited.workplane.reference.topology.origin.path,['middle',groupId,'a']);
  }finally{service.dispose();}
});

test('Nested automation grouping leaves a bound unrelated sibling source intact instead of unlinking its shared root',async()=>{
  const service=createCadService({oc});try{const [a,b,c]=sources(service),middle=group('middle',[a,b,c],middleFrame),root=group('outer',[middle],rootFrame),matrix=multiplyCadMatrices(multiplyCadMatrices(rootFrame,middleFrame),c.transform),initial=await service.rebuild(createCadProject({nodes:[root],workplane:plane(root,matrix,['middle','c'])})),result=await createCadCommandRouter({oc,service}).run(initial,{kind:'batch',commands:[{op:'group',targets:[{rootId:'outer',path:['middle','a']},{rootId:'outer',path:['middle','b']}]}]},{baseline:initial});assert.ok(result.project.workplane.reference);assert.deepEqual(result.project.workplane.reference.topology.origin.path,['middle','c']);closeVector(result.project.workplane.origin,initial.workplane.origin);closeVector(result.project.workplane.reference.topology.anchor.point,initial.workplane.reference.topology.anchor.point);
  }finally{service.dispose();}
});

test('Automation grouping other roots preserves an unrelated root face reference',async()=>{
  const service=createCadService({oc});try{const [a,b,c]=sources(service),initial=await service.rebuild(createCadProject({nodes:[a,b,c],workplane:plane(c,c.transform,[])})),result=await createCadCommandRouter({oc,service}).run(initial,{kind:'batch',commands:[{op:'group',targets:['a','b']}]},{baseline:initial});assert.ok(result.project.workplane.reference);assert.equal(result.project.workplane.reference.objectId,'c');assert.deepEqual(result.project.workplane.reference.topology.origin.path,[]);closeVector(result.project.workplane.origin,initial.workplane.origin);
  }finally{service.dispose();}
});

test('A source translation followed by nested grouping in one atomic batch retains the original material face point',async()=>{
  const service=createCadService({oc});try{const [a,b,c]=sources(service),middle=group('middle',[a,b,c],middleFrame),root=group('outer',[middle],rootFrame),matrix=multiplyCadMatrices(multiplyCadMatrices(rootFrame,middleFrame),a.transform),initial=await service.rebuild(createCadProject({nodes:[root],workplane:plane(root,matrix,['middle','a'])})),target={rootId:'outer',path:['middle','a']},result=await createCadCommandRouter({oc,service}).run(initial,{kind:'batch',commands:[{op:'transform',target,translate:[5,0,0],space:'local'},{op:'group',targets:[target,{rootId:'outer',path:['middle','b']}],as:'nested'}]},{baseline:initial}),expectedMatrix=multiplyCadMatrices(multiplyCadMatrices(rootFrame,middleFrame),multiplyCadMatrices(translate(5),a.transform));assert.ok(result.project.workplane.reference);closeVector(result.project.workplane.origin,cadPoint(expectedMatrix,[2,3,10]));assert.deepEqual(result.project.workplane.reference.topology.origin.path,['middle',result.aliases.nested.path.at(-1),'a']);
  }finally{service.dispose();}
});

test('Repeated intermediate rebuilds in resize-align-resize-group use the last verified affine source baseline',async()=>{
  const service=createCadService({oc});try{
    const a=service.nativeNode({type:'cylinder',size:[20,20,20]},{id:'a'}),b=service.nativeNode({type:'cylinder',size:[20,20,20]},{id:'b',transform:translate(40)}),root=group('outer',[a,b]),workplane=cadWorkplaneFromHit({objectId:root.id,point:[10,0,0],normal:[1,0,0]},{transform:root.transform});workplane.reference.topology.origin={rootId:root.id,path:['a'],featureId:'cylinder-face-side'};
    const ta={rootId:root.id,path:['a']},tb={rootId:root.id,path:['b']},initial=await service.rebuild(createCadProject({nodes:[root],workplane})),result=await createCadCommandRouter({oc,service}).run(initial,{kind:'batch',commands:[{op:'update',target:ta,set:{size:[20,20,24]}},{op:'align',targets:[ta,tb],axis:0,edge:'center',space:'world'},{op:'update',target:ta,set:{size:[20,20,30]}},{op:'group',targets:[ta,tb],as:'group'}]},{baseline:initial}),groupId=result.aliases.group.path[0],source=result.project.nodes[0].children.find(node=>node.id===groupId).children.find(node=>node.id==='a');
    assert.ok(result.project.workplane.reference);closeVector(result.project.workplane.origin,cadPoint(source.transform,[10,0,0]));assert.deepEqual(result.project.workplane.reference.topology.origin.path,[groupId,'a']);closeVector(result.project.workplane.origin,[30,0,5]);
  }finally{service.dispose();}
});

test('Deleting an unrelated nested CAD source retains the bound branch; deleting that branch detaches only the reference and preserves pose',async()=>{
  const service=createCadService({oc});try{
    const [a,b,c]=sources(service),middle=group('middle',[a,b,c],middleFrame),root=group('outer',[middle],rootFrame),matrix=multiplyCadMatrices(multiplyCadMatrices(rootFrame,middleFrame),c.transform),initial=await service.rebuild(createCadProject({nodes:[root],workplane:plane(root,matrix,['middle','c'])})),router=createCadCommandRouter({oc,service}),unrelated=(await router.run(initial,{kind:'batch',commands:[{op:'delete',target:{rootId:'outer',path:['middle','b']}}]},{baseline:initial})).project;
    assert.ok(unrelated.workplane.reference);assert.deepEqual(unrelated.workplane.reference.topology.origin.path,['middle','c']);closeVector(unrelated.workplane.origin,initial.workplane.origin);closeVector(unrelated.workplane.orientation,initial.workplane.orientation);
    const removed=(await router.run(unrelated,{kind:'batch',commands:[{op:'delete',target:{rootId:'outer',path:['middle','c']}}]},{baseline:unrelated})).project;assert.equal(removed.workplane.reference,null);closeVector(removed.workplane.origin,initial.workplane.origin);closeVector(removed.workplane.orientation,initial.workplane.orientation);
  }finally{service.dispose();}
});

test('Aliases keep native source identity through root grouping, nested grouping and creation under an existing parent',async()=>{
  const service=createCadService({oc});try{
    const router=createCadCommandRouter({oc,service,makeRecipe:async(type,input)=>({type,size:input.size??[20,20,20]})}),initial=createCadProject(),result=await router.run(initial,{kind:'batch',commands:[{op:'create',type:'cylinder',as:'a'},{op:'create',type:'box',pos:[40,0,10],as:'b'},{op:'group',targets:['$a','$b'],as:'outer'},{op:'update',target:'$a',set:{size:[20,20,24]}},{op:'create',type:'cylinder',size:[2,2,30],pos:[0,0,10],solid:false,parent:'$outer',as:'hole'},{op:'transform',target:'$hole',translate:[2,0,0],space:'local'},{op:'group',targets:['$a','$b'],as:'inner'},{op:'update',target:'$a',set:{color:'#116688'}}]},{baseline:initial}),root=result.project.nodes[0],inner=root.children.find(node=>node.id===result.aliases.inner.path[0]),a=inner.children.find(node=>node.id===result.aliases.a.path[1]),hole=root.children.find(node=>node.id===result.aliases.hole.path[0]);
    assert.equal(result.aliases.outer,root.id);assert.deepEqual(result.aliases.a,{rootId:root.id,path:[inner.id,a.id]});assert.equal(a.color,'#116688');close(a.transform[10],1.2);assert.deepEqual(result.aliases.hole,{rootId:root.id,path:[hole.id]});assert.equal(hole.solid,false);close(hole.transform[12],2);close(root.stats.volume,Math.PI*100*24+8000-Math.PI*24,1e-4);
  }finally{service.dispose();}
});
