import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCadKernel} from '../src/cad-kernel-loader.js';
import {createCadService} from '../src/cad-service.js';
import {createCadCommandRouter,cloneCadSources} from '../src/cad-command-router.js';
import {createCadProject,serializeCadProject} from '../src/cad-project.js';
import {cadIdentity,inverseCadMatrix,multiplyCadMatrices} from '../src/cad-affine.js';
import {cadBoolean,cadFuseMany,cadVolume,cadBounds,cadExportMesh,validateCadSolid,writeCadBrep,readCadBrep,transformCad} from '../src/cad-native-kernel.js';
import {cadColorRecordsNative} from '../src/cad-analysis-native.js';
import {createCadFinishNative,listCadEdgesNative} from '../src/cad-finish-native.js';
const oc=await loadCadKernel({print:()=>{},printErr:()=>{}}),near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<=e,`${a} vs ${b}`);
async function bored(service){const body=service.nativeNode({type:'box',size:[30,20,6]},{id:'body'}),hole=service.nativeNode({type:'cylinder',size:[5,5,12]},{id:'hole',solid:false});return service.rebuild(createCadProject({nodes:[{...body,id:'group',source:'group',recipe:undefined,operation:'union',children:[body,hole]}]}));}
const triangles=mesh=>Array.from({length:mesh.triangles.length/3},(_,i)=>mesh.triangles.slice(i*3,i*3+3).map(index=>mesh.vertices.slice(index*3,index*3+3).join(',')).sort().join(';')).sort();

test('Independent plain group duplicates reuse native geometry and remain independently editable',async()=>{
 const service=createCadService({oc});try{const p=await bored(service),before=serializeCadProject(p),copy=cloneCadSources(p.nodes[0]);copy.transform[12]=50;let cuts=0;const original=oc.BRepAlgoAPI_Cut.prototype.Build;
 oc.BRepAlgoAPI_Cut.prototype.Build=function(...args){cuts++;return original.apply(this,args);};
 let duplicate;try{duplicate=await service.rebuild({...p,nodes:[p.nodes[0],copy]});}finally{oc.BRepAlgoAPI_Cut.prototype.Build=original;}
 assert.equal(cuts,0);assert.equal(serializeCadProject(p),before);assert.notEqual(duplicate.nodes[0].children[1].id,duplicate.nodes[1].children[1].id);near(duplicate.nodes[1].stats.volume,p.nodes[0].stats.volume);
 duplicate.nodes[1].children[1].recipe.size=[7,7,12];const edited=await service.rebuild(duplicate);near(edited.nodes[0].stats.volume,p.nodes[0].stats.volume);assert.ok(edited.nodes[1].stats.volume<edited.nodes[0].stats.volume);
 }finally{service.dispose();}
});

test('Cached native bounds match independent BRep transforms in mirrored/sheared nested frames',async()=>{
 const service=createCadService({oc}),router=createCadCommandRouter({oc,service});try{const p=await bored(service),node=p.nodes[0];node.transform=[-1.2,0,0,0,.3,.8,0,0,.1,.2,1.1,0,52,-27,19,1];
 for(const frame of [cadIdentity(),[1,0,0,0,.2,1,0,0,0,.3,1,0,15,4,-2,1]]){const matrix=multiplyCadMatrices(inverseCadMatrix(frame),node.transform),local=readCadBrep(oc,node.brep.data);let placed;
 try{placed=transformCad(oc,local,matrix);const expected=cadBounds(oc,placed),actual=router.bounds(p,{targets:[{rootId:node.id,path:[]}],frame});for(const key of ['min','max','size','center'])actual[key].forEach((v,k)=>near(v,expected[key][k]));actual.min[0]=999;assert.notEqual(router.bounds(p,{targets:[{rootId:node.id,path:[]}],frame}).min[0],999);}finally{placed?.delete();local.delete();}}
 node.stats.volume=1e99;near(service.inspect(node).volume,(3600-Math.PI*2.5**2*6)*1.2*.8*1.1);
 }finally{service.dispose();}
});

test('Copies of native edge finishes retain remapped source origins and separate later edits',async()=>{
 const service=createCadService({oc,finish:createCadFinishNative({oc})});try{const body=service.nativeNode({type:'cylinder',size:[20,20,20]},{id:'body'}),hole=service.nativeNode({type:'cylinder',size:[6,6,30]},{id:'hole',solid:false}),p=await service.rebuild(createCadProject({nodes:[{...body,id:'group',source:'group',recipe:undefined,operation:'union',children:[body,hole]}]})),shape=service.worldShape(p.nodes[0]);let edge;
 try{edge=listCadEdgesNative(oc,shape,{origin:{rootId:'group',path:['body'],featureId:'cylinder-rim-top'}}).find(e=>e.geometry.kind==='circle'&&Math.abs(e.geometry.radius-10)<1e-7&&Math.abs(e.geometry.center[2]-10)<1e-7).reference;}finally{shape.delete();}
 p.nodes[0].finish={steps:[{id:'round',kind:'round',amount:1,edges:[edge]}]};const finished=await service.rebuild(p),original=serializeCadProject(finished),copy=cloneCadSources(finished.nodes[0]);copy.transform[12]=50;const both=await service.rebuild({...finished,nodes:[finished.nodes[0],copy]});near(both.nodes[0].stats.volume,both.nodes[1].stats.volume);assert.equal(both.nodes[1].finish.steps[0].edges[0].origin.rootId,copy.id);assert.equal(both.nodes[1].finish.steps[0].edges[0].origin.path[0],copy.children[0].id);
 both.nodes[1].children[0].recipe.size=[20,20,24];const edited=await service.rebuild(both);near(edited.nodes[0].stats.volume,finished.nodes[0].stats.volume);assert.ok(edited.nodes[1].stats.volume>edited.nodes[0].stats.volume);assert.equal(serializeCadProject(finished),original);
 }finally{service.dispose();}
});

test('Batched export union matches sequential triangles, mass and solids with affine and touching bodies',()=>{
 const service=createCadService({oc});try{for(const spacing of [12,4,3])for(const affine of [false,true]){
 const nodes=Array.from({length:6},(_,i)=>{const node=service.nativeNode({type:'box',size:[4,4,4]},{id:'part'+i});node.transform[12]=i*spacing;if(affine)node.transform=[-1.2,0,0,0,.3,.8,0,0,.1,.2,1.1,0,-i*spacing,0,0,1];return node;}),shapes=nodes.map(service.worldShape);let batch,reference;
 try{batch=cadFuseMany(oc,shapes);reference=readCadBrep(oc,writeCadBrep(oc,shapes[0]));for(const shape of shapes.slice(1)){const next=cadBoolean(oc,'union',reference,shape);reference.delete();reference=next;}near(cadVolume(oc,batch),cadVolume(oc,reference));assert.equal(validateCadSolid(oc,batch).solids,validateCadSolid(oc,reference).solids);for(const key of ['min','max'])cadBounds(oc,batch)[key].forEach((v,k)=>near(v,cadBounds(oc,reference)[key][k]));assert.deepEqual(triangles(cadExportMesh(oc,batch)),triangles(cadExportMesh(oc,reference)));}finally{batch?.delete();reference?.delete();shapes.forEach(shape=>shape.delete());}
 }}finally{service.dispose();}
});

test('Failed batch Fuse falls back and scoped STL excludes hidden, hole and reference records',()=>{
 const service=createCadService({oc});try{const a=service.nativeNode({type:'box',size:[4,4,4]},{id:'a'}),b=structuredClone(a);b.id='b';b.transform[12]=12;const shapes=[a,b].map(service.worldShape),original=oc.BRepAlgoAPI_Fuse.prototype.Build;let result;
 try{let injected=false;oc.BRepAlgoAPI_Fuse.prototype.Build=function(...args){if(!injected){injected=true;throw Error('Injected failure');}return original.apply(this,args);};result=cadFuseMany(oc,shapes);assert.ok(injected);near(cadVolume(oc,result),128);}finally{oc.BRepAlgoAPI_Fuse.prototype.Build=original;result?.delete();shapes.forEach(shape=>shape.delete());}
 const hidden={...b,id:'hidden',hidden:true},hole={...a,id:'hole',solid:false},p=createCadProject({nodes:[a,b,hidden,hole]});const before=serializeCadProject(p),stl=service.exportModel(p,{format:'stl',ids:['a']}).data;assert.equal((new TextDecoder().decode(stl).match(/facet normal/g)??[]).length,12);assert.equal(serializeCadProject(p),before);
 }finally{service.dispose();}
});

test('Native export caches preserve translated source names/styles and independent output buffers',async()=>{
 const service=createCadService({oc});try{const a=service.nativeNode({type:'box',size:[10,10,10]},{id:'a',name:'A',color:'#ff0000'}),b=structuredClone(a);b.id='b';b.name='B';b.color='#00ff00';b.transform[12]=6;
 const p=await service.rebuild(createCadProject({nodes:[{...a,id:'group',name:'Group',source:'group',recipe:undefined,operation:'union',children:[a,b],multicolor:true}]})),node=p.nodes[0];node.transform[12]=52;node.transform[13]=-27;const before=serializeCadProject(p),quality={deflection:.05,angleDegrees:10},expected=cadColorRecordsNative(oc,node),first=(service.display(p,undefined,{colored:true}),service.exportMeshes(p,quality)),cutsOriginal=oc.BRepAlgoAPI_Cut.prototype.Build;let cuts=0;
 first[0].mesh.vertices[0]=999;oc.BRepAlgoAPI_Cut.prototype.Build=function(...args){cuts++;return cutsOriginal.apply(this,args);};let second;
 try{second=service.exportMeshes(p,quality);service.exportStep(p);}finally{oc.BRepAlgoAPI_Cut.prototype.Build=cutsOriginal;}
 assert.equal(cuts,0);assert.notEqual(second[0].mesh.vertices[0],999);assert.deepEqual(second.map(v=>[v.name,v.color]),expected.map(v=>[v.name,v.color]));assert.equal(serializeCadProject(p),before);assert.ok(service.exportMeshCacheState().entries>0);
 node.children[0].name='renamed';node.children[0].color='#0000ff';assert.equal(service.exportMeshes(p,quality)[0].name,'renamed');assert.equal(service.exportMeshes(p,quality)[0].color,'#0000ff');node.transform[12]+=20;const translated=service.exportMeshes(p,quality);near(Math.min(...translated[0].mesh.vertices.filter((_,i)=>i%3===0))-Math.min(...second[0].mesh.vertices.filter((_,i)=>i%3===0)),20);
 }finally{service.dispose();}
});


test('Strictly separated export actually uses one native batch Build without pairwise intersections',()=>{
 const service=createCadService({oc}),common=oc.BRepAlgoAPI_Common,build=oc.BRepAlgoAPI_Fuse.prototype.Build;let commons=0,builds=0,combined;
 const wrapper=function(...args){commons++;return Reflect.construct(common,args,common);};Object.assign(wrapper,common);wrapper.prototype=common.prototype;
 const shapes=Array.from({length:30},(_,i)=>{const node=service.nativeNode({type:'box',size:[4,4,4]},{id:'batch'+i});node.transform[12]=i*12;return service.worldShape(node);});
 try{oc.BRepAlgoAPI_Common=wrapper;oc.BRepAlgoAPI_Fuse.prototype.Build=function(...args){builds++;return build.apply(this,args);};combined=cadFuseMany(oc,shapes);assert.equal(builds,1,'Native batch was not executed');assert.equal(commons,0,'Batch silently fell back');const result=validateCadSolid(oc,combined);assert.equal(result.solids,30);near(result.volume,30*64);}
 finally{oc.BRepAlgoAPI_Common=common;oc.BRepAlgoAPI_Fuse.prototype.Build=build;combined?.delete();shapes.forEach(shape=>shape.delete());service.dispose();}
});
