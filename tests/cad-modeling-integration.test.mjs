import test from 'node:test';
import assert from 'node:assert/strict';
import loader from '../cad-kernel-build/runtime/formnaro_cad.js';
import {createCadService} from '../src/cad-service.js';
import {createCadCommandRouter} from '../src/cad-command-router.js';
import {createCadProject,cadProjectSnapshot,serializeCadProject,parseCadProject} from '../src/cad-project.js';
import {createCadTransactions} from '../src/cad-transactions.js';
import {createCadPersistence,MIXED_LIBRARY_KEY} from '../src/cad-persistence.js';
import {cadIdentity} from '../src/cad-affine.js';
import {cadRayHits} from '../src/cad-native-kernel.js';
import {defaultCadSketch,cadSketchRecipe} from '../src/cad-sketch.js';
import {importCadStep} from '../src/cad-step-io.js';

const oc=await loader({print:()=>{},printErr:()=>{}});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-4,`${a} != ${b}`);
function fixture(){
  const service=createCadService({oc}),router=createCadCommandRouter({oc,service}),matrix=cadIdentity();matrix[12]=17;matrix[14]=20;
  const original=service.nativeNode({type:'box',size:[20,30,40]},{id:'body',name:'Original',transform:matrix,color:'#123456',metadata:{notes:'keep me'},layerId:'default',folderId:null});
  const initial=createCadProject({nodes:[original]}),store=createCadTransactions({initial,build:async(p,c)=>c.operation?(await router.run(p,c.operation,{baseline:c.baseline})).project:service.rebuild(p,{baseline:c.baseline})});
  function top(node=original){const shape=service.worldShape(node);try{return cadRayHits(oc,shape,{origin:[17,0,100],direction:[0,0,-1]})[0].faceIndex;}finally{shape.delete();}}
  return {service,router,store,original,initial,top};
}
const command=(target,operation)=>({kind:'batch',commands:[{op:'modeling',target,operation,as:'result'}]});

test('native modeling preview is atomic, keeps complete source, one Undo and exact Redo',async()=>{
  const f=fixture();try{
    const before=f.store.serialize(),proposal=await f.store.preview({revision:f.store.revision(),project:f.store.snapshot(),operation:command('body',{kind:'face-offset',faceIndex:f.top(),offset:5})});
    assert.equal(f.store.serialize(),before);const n=proposal.project.nodes[0],child=n.children[0];assert.equal(n.id,'body');assert.equal(n.source,'modeling');assert.equal(proposal.project.version,11);assert.deepEqual(n.transform,cadIdentity());
    assert.notEqual(child.id,f.original.id);assert.deepEqual({...child,id:f.original.id},f.original);near(n.stats.volume,20*30*45);
    f.store.apply(proposal);const after=f.store.serialize();assert.notEqual(after,before);f.store.undo();assert.equal(f.store.serialize(),before);f.store.redo();assert.equal(f.store.serialize(),after);
    const reread=await f.service.rebuild(parseCadProject(after));near(reread.nodes[0].stats.volume,n.stats.volume);
    const invalid=JSON.parse(after);invalid.version=10;assert.throws(()=>parseCadProject(JSON.stringify(invalid)),/11/);
  }finally{f.service.dispose();}
});

test('shell survives STEP export, project/library/autosave and independent source renumbering',async()=>{
  const f=fixture();try{
    const result=await f.router.run(f.initial,command('body',{kind:'shell',faceIndices:[f.top()],thickness:2}));
    near(result.project.nodes[0].stats.volume,20*30*40-16*26*38);
    const exported=importCadStep(oc,f.service.exportStep(result.project));near(exported.stats.volume,result.project.nodes[0].stats.volume);assert.equal(exported.stats.solids,1);
    const values=new Map(),store=createCadTransactions({initial:result.project,build:p=>f.service.rebuild(p)}),persistence=createCadPersistence({storage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)},transactions:store,verify:p=>f.service.rebuild(p)});
    persistence.autosave();const recovered=await persistence.readAutosave();assert.ok(recovered);persistence.saveTemplate({name:'Shell',ids:['body']});assert.equal(JSON.parse(values.get(MIXED_LIBRARY_KEY)).version,11);
    const bad=JSON.parse(values.get(MIXED_LIBRARY_KEY));bad.version=10;await assert.rejects(persistence.importLibrary(JSON.stringify(bad)),/11/);
    const duplicate=await f.router.run(result.project,{kind:'batch',commands:[{op:'duplicate',target:'body',as:'copy'}]});assert.equal(duplicate.project.nodes.length,2);
    near(duplicate.project.nodes[1].stats.volume,result.project.nodes[0].stats.volume);assert.notEqual(duplicate.project.nodes[1].children[0].id,result.project.nodes[0].children[0].id);
  }finally{f.service.dispose();}
});

test('face identities reject changed source geometry; locks, hidden roots and stale proposals remain protected',async()=>{
  const f=fixture();try{
    const request=command('body',{kind:'face-offset',faceIndex:f.top(),offset:3}),result=await f.router.run(f.initial,request),bad=structuredClone(result.project);bad.nodes[0].children[0].recipe.size[0]=25;
    await assert.rejects(f.service.rebuild(bad),e=>e.code==='CAD_MODELING_REFERENCE_CHANGED');
    await assert.rejects(f.router.run(result.project,{kind:'batch',commands:[{op:'update',target:{rootId:'body',path:[result.project.nodes[0].children[0].id]},set:{pos:[0,0,0]}}]}),/geschützt/);
    for(const flag of ['locked','hidden']){const p=structuredClone(f.initial);p.nodes[0][flag]=true;await assert.rejects(f.router.run(p,request));}
    const p=await f.store.preview({revision:f.store.revision(),project:f.store.snapshot(),operation:request});const another=f.store.snapshot();another.name='New revision';const next=await f.store.preview({revision:f.store.revision(),project:another});f.store.apply(next);assert.throws(()=>f.store.apply(p),/geändert|veraltet|Vorschau/);assert.equal(f.store.snapshot().name,'New revision');
  }finally{f.service.dispose();}
});

function sketchNode(service,id,z,width=20){const sketch=defaultCadSketch();sketch.dimensions.width=String(width);sketch.dimensions.depth='10';sketch.dimensions.height='1';const frame=cadIdentity();frame[14]=z;return service.nativeNode(cadSketchRecipe(sketch),{id,transform:frame,layerId:'default',folderId:null});}

test('profile operations retain independent editable sketches and rebuild only stored recipes',async()=>{
  const f=fixture();try{
    const a=sketchNode(f.service,'a',0),b=sketchNode(f.service,'b',30),initial=createCadProject({nodes:[a,b]});
    const result=await f.router.run(initial,{kind:'batch',commands:[{op:'profileModeling',targets:['a','b'],kind:'loft',as:'loft'}]});assert.equal(result.project.version,11);assert.equal(result.project.nodes.length,3);assert.deepEqual(result.project.nodes.slice(0,2),[a,b]);near(result.project.nodes[2].stats.volume,20*10*30);
    const changed=structuredClone(result.project);changed.nodes[2].children[1].recipe.sketch.dimensions.width='30';changed.nodes[2].children[1].recipe.size[0]=30;
    const rebuilt=await f.service.rebuild(changed);assert.ok(rebuilt.nodes[2].stats.volume>result.project.nodes[2].stats.volume);assert.deepEqual(rebuilt.nodes.slice(0,2),[a,b]);
    const sweep=await f.router.run(initial,{kind:'batch',commands:[{op:'profileModeling',targets:['a'],kind:'sweep',path:{kind:'line',length:40},as:'sweep'}]});near(sweep.project.nodes[2].stats.volume,20*10*40);assert.deepEqual(sweep.project.nodes[0],a);
    await assert.rejects(f.router.run(initial,{kind:'batch',commands:[{op:'profileModeling',targets:['a','a'],kind:'loft'}]}),/Verschiedene/);
    await assert.rejects(f.router.run(initial,{kind:'batch',commands:[{op:'profileModeling',targets:['a','b'],kind:'sweep',path:{kind:'line',length:40}}]}));
  }finally{f.service.dispose();}
});

test('moving finished modeling parts uses cached construction and preserves native result bytes',async()=>{
  const f=fixture();try{
    const result=await f.router.run(f.initial,command('body',{kind:'shell',faceIndices:[f.top()],thickness:2})),node=result.project.nodes[0],count=f.service.cacheState().entries,brep=node.brep.data;
    for(let i=0;i<5;i++){const p=structuredClone(result.project);p.nodes[0].transform[12]=i*10;const moved=await f.service.rebuild(cadProjectSnapshot(p));assert.equal(moved.nodes[0].brep.data,brep);assert.equal(f.service.cacheState().entries,count);}
  }finally{f.service.dispose();}
});

test('editing stored wall thickness retains one wrapper, original bytes and an atomic proposal',async()=>{
  const f=fixture();try{
    const result=await f.router.run(f.initial,command('body',{kind:'shell',faceIndices:[f.top()],thickness:2})),source=structuredClone(result.project.nodes[0].children[0]);
    const edited=await f.router.run(result.project,{kind:'batch',commands:[{op:'editModeling',target:'body',operation:{kind:'shell',faceIndices:[f.top()],thickness:3}}]});
    assert.deepEqual(edited.project.nodes[0].children,[source]);assert.equal(edited.project.nodes[0].modeling.thickness,3);near(edited.project.nodes[0].stats.volume,20*30*40-14*24*37);
    await assert.rejects(f.router.run(edited.project,{kind:'batch',commands:[{op:'editModeling',target:'body',operation:{kind:'face-offset',faceIndex:f.top(),offset:4}}]}),/dasselbe/);
  }finally{f.service.dispose();}
});

test('modeling converts root annotations into world construction frame without moving intact markers',async()=>{
  const f=fixture();try{
    const marked=await f.router.run(f.initial,{kind:'batch',commands:[{op:'mark',target:'body',point:[10,0,0],space:'local',note:'Side stays'}]}),mark=structuredClone(marked.project.nodes[0].annotations[0]);
    const result=await f.router.run(marked.project,command('body',{kind:'shell',faceIndices:[f.top()],thickness:2})),annotation=result.project.nodes[0].annotations[0];
    assert.equal(annotation.status,'valid');assert.equal(annotation.id,mark.id);assert.deepEqual(annotation.point,[27,0,20]);assert.deepEqual(annotation.normal,mark.normal);
  }finally{f.service.dispose();}
});

test('mirrored rotated sources keep world millimetres through shell, offset, later root scale and STEP',async()=>{
  const f=fixture();try{
    const original=structuredClone(f.original);original.transform=[0,-1,0,0,-1,0,0,0,0,0,1,0,17,5,20,1];const initial=createCadProject({nodes:[original]}),shape=f.service.worldShape(original);let faceIndex;
    try{faceIndex=cadRayHits(oc,shape,{origin:[17,5,100],direction:[0,0,-1]})[0].faceIndex;}finally{shape.delete();}
    for(const operation of [{kind:'face-offset',faceIndex,offset:3},{kind:'shell',faceIndices:[faceIndex],thickness:2}]){
      const result=await f.router.run(initial,command('body',operation)),n=result.project.nodes[0];assert.deepEqual(n.children[0].transform,original.transform);
      near(n.stats.volume,operation.kind==='shell'?20*30*40-16*26*38:20*30*43);
      const moved=structuredClone(result.project);moved.nodes[0].transform=[2,0,0,0,0,2,0,0,0,0,2,0,11,-3,7,1];const rebuilt=await f.service.rebuild(moved);assert.equal(rebuilt.nodes[0].brep.data,n.brep.data);
      const exported=importCadStep(oc,f.service.exportStep(rebuilt));near(exported.stats.volume,n.stats.volume*8);assert.equal(exported.stats.solids,1);
    }
    const sheared=structuredClone(original);sheared.transform[4]+=.2;const p=createCadProject({nodes:[sheared]}),s=f.service.worldShape(sheared);let index;try{index=cadRayHits(oc,s,{origin:[17,5,100],direction:[0,0,-1]})[0].faceIndex;}finally{s.delete();}
    const shell=await f.router.run(p,command('body',{kind:'shell',faceIndices:[index],thickness:2}));assert.equal(shell.project.nodes[0].stats.solids,1);assert.deepEqual(shell.project.nodes[0].children[0].transform,sheared.transform);
  }finally{f.service.dispose();}
});
