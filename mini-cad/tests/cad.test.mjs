import test from 'node:test';
import assert from 'node:assert/strict';
import initialize from '../cad-kernel-build/runtime/formnaro_cad.js';
import {createOperations} from '../src/operations.js';
import {SHAPES,emptyProject,createNode,encodeProject,decodeProject,renewIds} from '../src/model.js';
import {readCadBrep,brepHasNoTriangulation,validateCadSolid} from '../src/native/cad-native-kernel.js';
const oc=await initialize({print:()=>{},printErr:()=>{}}),run=createOperations(oc);
const near=(a,b,t=1e-6)=>assert(Math.abs(a-b)<=t,`${a} != ${b}`);
const project=nodes=>({...emptyProject(),nodes});
function surfaces(brep){const shape=readCadBrep(oc,brep),ex=new oc.TopExp_Explorer(shape,oc.TopAbs_ShapeEnum.TopAbs_FACE),types=[];try{while(ex.More()){const raw=ex.Current(),f=oc.TopoDS.Face(raw),s=new oc.BRepAdaptor_Surface(f);types.push(s.GetType());s.delete();f.delete();raw.delete();ex.Next();}return types;}finally{ex.delete();shape.delete();}}
test('all twelve Mini shapes construct as native solids at every display quality',async()=>{
 for(const [type]of SHAPES){let volume;for(const quality of [32,64,128]){const n=createNode(type,quality),stats=await run('inspect',n),mesh=(await run('render',[n]))[0].data;assert(stats.solids>=1);assert(stats.volume>0);assert(mesh.triangles.length>0);assert(brepHasNoTriangulation(stats.brep));if(volume)near(stats.volume,volume);volume=stats.volume;}}
});
test('native bore has analytic cylindrical wall and exact constructive volume',async()=>{
 const body=createNode('box');body.size=[40,30,6];body.pos=[0,0,3];const hole=createNode('cylinder');hole.size=[8,8,10];hole.pos=[0,0,3];hole.solid=false;
 const before=JSON.stringify([body,hole]),g=await run('group',{nodes:[body,hole]}),proof=await run('inspect',g);near(proof.volume,40*30*6-Math.PI*16*6);assert.equal(g.children.length,2);assert(surfaces(g.brep).includes(oc.GeomAbs_SurfaceType.GeomAbs_Cylinder));assert.equal(JSON.stringify([body,hole]),before);assert(!g.mesh);assert(brepHasNoTriangulation(g.brep));
 assert.deepEqual(decodeProject(encodeProject(project([g]))).nodes[0],g);const parts=await run('ungroup',g);assert.deepEqual(parts.map(n=>n.pos),[body.pos,hole.pos]);
});
test('STEP roundtrip preserves mm dimensions analytic cylinder and volume after affine resize',async()=>{
 const n=createNode('cylinder');n.size=[16,16,12];n.pos=[30,-4,6];const data=await run('export-step',[n]);assert(new TextDecoder().decode(data).startsWith('ISO-10303-21;'));const imported=await run('import',{name:'Zylinder.step',buffer:data});assert(!imported.mesh);const stats=await run('inspect',imported);near(stats.volume,Math.PI*64*12);assert(surfaces(imported.brep).includes(oc.GeomAbs_SurfaceType.GeomAbs_Cylinder));const [bounds]=await run('bounds',[imported]);bounds.min.forEach((v,i)=>near(v,[22,-12,0][i]));bounds.max.forEach((v,i)=>near(v,[38,4,12][i]));
 imported.size[0]*=1.7;imported.rot=[19,27,-43];imported.mirror=[-1,1,1];const next=await run('inspect',imported);near(next.volume,stats.volume*1.7);assert(brepHasNoTriangulation(next.brep));assert.equal((await run('import',{name:'Roundtrip.stp',buffer:await run('export-step',[imported])})).type,'import');
});
test('intersection and nested group transformations preserve exact sources and volumes',async()=>{
 const a=createNode('box'),b=createNode('box');b.pos[0]=10;const g=await run('group',{nodes:[a,b],operation:'intersection'});near((await run('inspect',g)).volume,4000);g.size=g.size.map(v=>v*2);g.rot=[0,0,90];g.mirror=[-1,1,1];const children=await run('ungroup',g);near((await run('inspect',children[0])).volume,64000);const regroup=await run('group',{nodes:children,operation:'intersection'});near((await run('inspect',regroup)).volume,32000);
});
test('sheared source ungrouping retains exact native geometry and its original recipe',async()=>{
 const a=createNode('box');a.rot=[0,0,30];const b=createNode('box');b.pos[0]=40;const g=await run('group',{nodes:[a,b]});g.size[0]*=1.6;const parts=await run('ungroup',g);assert(parts[0].brep);assert(parts[0].originalSource);assert(!parts[0].mesh);near((await run('inspect',parts[0])).volume,8000*1.6);encodeProject(project(parts));const copy=structuredClone(parts[0]);renewIds(copy);assert.notEqual(copy.originalSource.node.id,parts[0].originalSource.node.id);
});
test('STL export and faceted CAD import remain closed with physical dimensions',async()=>{
 const n=createNode('box'),data=await run('export',[n]);assert.equal(data.byteLength,684);const p=await run('import',{name:'Wuerfel.stl',buffer:data});near((await run('inspect',p)).volume,8000);assert(p.brep);assert(!p.mesh);assert(brepHasNoTriangulation(p.brep));
});
test('invalid or empty operations reject without modifying caller model',async()=>{
 const n=createNode('box'),hole=createNode('box');hole.solid=false;const before=JSON.stringify([n,hole]);await assert.rejects(run('group',{nodes:[n,hole]}));assert.equal(JSON.stringify([n,hole]),before);await assert.rejects(run('import',{name:'bad.step',buffer:new TextEncoder().encode('bad').buffer}));assert.throws(()=>decodeProject(JSON.stringify({format:'Formnaro-Mini',version:1,name:'Netz',nodes:[]})));const bad=project([createNode('box')]);bad.nodes[0].size[0]=-1;assert.throws(()=>encodeProject(bad));
});
test('display cache is bounded and changing display quality cannot change CAD BRep',async()=>{
 const n=createNode('cylinder'),before=(await run('inspect',n)).brep;for(const quality of [32,128]){n.segments=quality;await run('render',[n]);assert.equal((await run('inspect',n)).brep,before);}const info=await run('info');assert(info.cacheEntries<=64);assert(info.cacheBytes<=16*1024*1024);
});
test('confirmed placement uses native curved-body support rather than display tessellation',async()=>{
 const n=createNode('sphere',32);n.size=[30,15,22];n.rot=[23,47,11];const [placed]=await run('place',{nodes:[n],anchor:[4,8,0],normal:[0,0,1]}),[bounds]=await run('bounds',[placed]);near(bounds.min[2],0,1e-7);assert.deepEqual(placed.rot,n.rot);near(placed.pos[0],n.pos[0]);
});
