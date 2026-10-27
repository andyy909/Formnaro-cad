import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCadKernel} from '../src/cad-kernel-loader.js';
import {createCadService} from '../src/cad-service.js';
import {createCadCommandRouter} from '../src/cad-command-router.js';
import {createCadProject} from '../src/cad-project.js';
import {cadIdentity} from '../src/cad-affine.js';
import {cadBounds,validateCadSolid} from '../src/cad-native-kernel.js';
const oc=await loadCadKernel({print:()=>{},printErr:()=>{}});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} versus ${b}`);

test('Moving a colored bored plate reuses native proofs and meshes; sources, quality and styles invalidate them',async()=>{
  const service=createCadService({oc,maxEntries:8,maxBytes:1024*1024}),router=createCadCommandRouter({oc,service});
  const reader=oc.BRepToolsWrapper.Read;let reads=0;
  try{
    const body=service.nativeNode({type:'box',size:[60,40,6]},{id:'body',color:'#ed7047'}),hole=service.nativeNode({type:'cylinder',size:[5,5,12]},{id:'hole',solid:false});
    hole.transform[12]=12;
    const group={...body,id:'plate',source:'group',operation:'union',multicolor:true,children:[body,hole]};delete group.recipe;
    let p=await service.rebuild(createCadProject({nodes:[group]}));
    const original=service.display(p,undefined,{colored:true}),scene=router.scene(p),brep=p.nodes[0].brep.data;
    oc.BRepToolsWrapper.Read=Object.assign(function(...args){reads++;return reader.apply(this,args);},reader);
    for(let i=0;i<6;i++){
      p.nodes[0].transform[12]+=13;p.nodes[0].transform[13]-=7;p=await service.rebuild(p);
      const view=service.display(p,undefined,{colored:true}),next=router.scene(p);
      assert.equal(reads,0,'Pure translation must not read/remesh/revalidate unchanged BRep');
      assert.equal(p.nodes[0].brep.data,brep);assert.deepEqual(view.map(r=>r.mesh),original.map(r=>r.mesh));
      for(const object of next.objects){const before=scene.objects.find(r=>r.id===object.id);near(object.volume,before.volume);for(let k=0;k<3;k++)near(object.worldBounds.min[k],before.worldBounds.min[k]+p.nodes[0].transform[12+k]);}
    }
    // Returned buffers/proofs cannot corrupt a later cache hit.
    const view=service.display(p,undefined,{colored:true});view[0].mesh.vertices[0]=999;
    const proof=service.inspect(p.nodes[0]);proof.worldBounds.min[0]=999;
    assert.deepEqual(service.display(p,undefined,{colored:true})[0].mesh,original[0].mesh);assert.notEqual(service.inspect(p.nodes[0]).worldBounds.min[0],999);
    service.display(p,{deflection:.005,angleDegrees:3},{colored:true});assert.ok(reads>0);reads=0;
    p.nodes[0].children[0].color='#2486c1';const styled=service.display(p,undefined,{colored:true});assert.ok(styled.some(r=>r.color==='#2486c1'));assert.ok(reads>0);reads=0;
    p.nodes[0].children[1].recipe.size=[8,8,12];p=await service.rebuild(p);assert.notEqual(p.nodes[0].brep.data,brep);assert.ok(reads>0);
    const edited=router.scene(p).objects[0];assert.ok(edited.volume<scene.objects[0].volume);
    // A new general linear map needs fresh native proof. Compare against the
    // independent world-shape path, including mirror/shear at far coordinates.
    p.nodes[0].transform=[-1.2,.2,0,0,.35,.9,0,0,.1,.2,1.1,0,90000,-85000,70000,1];
    p=await service.rebuild(p);const info=service.inspect(p.nodes[0]),shape=service.worldShape(p.nodes[0]);
    try{const checked=validateCadSolid(oc,shape),bounds=cadBounds(oc,shape);near(info.volume,checked.volume);for(let k=0;k<3;k++){near(info.worldBounds.min[k],bounds.min[k]);near(info.worldBounds.max[k],bounds.max[k]);}}finally{shape.delete();}
    for(const cache of [service.displayCacheState(),service.inspectionCacheState()]){assert.ok(cache.entries<=8);assert.ok(cache.bytes<=1024*1024);}
    p.nodes[0].transform[12]=100001;await assert.rejects(service.rebuild(p),/Arbeitsbereich/);
    const invalid=structuredClone(p);invalid.nodes[0].children[0].source='step';delete invalid.nodes[0].children[0].recipe;invalid.nodes[0].children[0].brep.data='invalid BRep';await assert.rejects(service.rebuild(invalid));
  }finally{oc.BRepToolsWrapper.Read=reader;service.dispose();assert.equal(service.displayCacheState().bytes,0);assert.equal(service.inspectionCacheState().bytes,0);}
});

test('Single CAD display cache retains local meshes under translations and invalidates scale and BRep',async()=>{
  const service=createCadService({oc});try{
    let p=await service.rebuild(createCadProject({nodes:[service.nativeNode({type:'cylinder',size:[20,20,10]},{id:'cylinder'})]}));
    const original=service.display(p)[0],count=service.displayCacheState().entries;
    p.nodes[0].transform[12]=80;assert.deepEqual(service.display(p)[0].mesh,original.mesh);assert.equal(service.displayCacheState().entries,count);
    p.nodes[0].transform[0]=4;service.display(p);assert.equal(service.displayCacheState().entries,count+1);
    p.nodes[0].recipe.size=[30,30,10];p=await service.rebuild(p);assert.notDeepEqual(service.display(p)[0].mesh,original.mesh);
  }finally{service.dispose();}
});
