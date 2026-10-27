import test from 'node:test';
import assert from 'node:assert/strict';
import {Matrix4,Quaternion,Euler,Vector3} from 'three';
import load from '../cad-kernel-build/runtime/formnaro_cad.js';
import {cadSketchExpression,defaultCadSketch,resolveCadSketch,cadSketchRecipe} from '../src/cad-sketch.js';
import {createCadProject,parseCadProject,serializeCadProject,validateCadProject} from '../src/cad-project.js';
import {createCadService} from '../src/cad-service.js';
import {createCadCommandRouter,cloneCadSources} from '../src/cad-command-router.js';
import {createCadTransactions} from '../src/cad-transactions.js';
import {cadPoint} from '../src/cad-affine.js';
const oc=await load({print:()=>{},printErr:()=>{}}),close=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<=e,`${a} versus ${b}`);
test('Stored arithmetic resolves dependencies and rejects scripts, cycles, overflow and ambiguous contours',()=>{
  assert.equal(cadSketchExpression('2 * (4 + 3) − -1 / 2'),14.5);
  for(const value of ['a.b','Math.PI','1;alert(1)','1/0','(1+2','2**3','1e400','constructor()','1 2'])assert.throws(()=>cadSketchExpression(value));
  const sketch=defaultCadSketch();sketch.variables.push({name:'a',value:'b'},{name:'b',value:'a'});assert.throws(()=>resolveCadSketch(sketch),/Zyklische/);
  for(const points of [[[0,0],[10,10],[0,10],[10,0]],[[0,0],[10,0],[5,0],[5,10]],[[0,0],[10,0],[10,10],[0,0]]]){const s=defaultCadSketch('polygon');s.points=points;assert.throws(()=>resolveCadSketch(s));}
  const s=defaultCadSketch('polygon');s.points=[[0,0],[10,0],[10,5],[5,5],[5,10],[0,10]];assert.equal(resolveCadSketch(s).area,75);s.dimensions={height:'6',width:'10',depth:'10',diameter:'10'};s.variables=Array.from({length:40},(_,i)=>({name:'a'+i,value:String(i)}));assert.equal(resolveCadSketch(s).values.a39,39);s.variables.push({name:'more',value:'1'});assert.throws(()=>resolveCadSketch(s),/40/);
  const p=defaultCadSketch('polygon');p.points=Array.from({length:128},(_,i)=>[20*Math.cos(i*Math.PI/64),20*Math.sin(i*Math.PI/64)]);assert.equal(resolveCadSketch(p).points.length,128);p.points.push([50,50]);assert.throws(()=>resolveCadSketch(p),/128/);
});
test('Native rectangle, full circle and concave polygon extrusions have independent analytic volumes and STEP round trips',async()=>{
  const service=createCadService({oc});try{for(const kind of ['rectangle','circle','polygon']){const sketch=defaultCadSketch(kind);if(kind==='polygon')sketch.points=[[0,0],[10,0],[10,5],[5,5],[5,10],[0,10]];const expected=kind==='rectangle'?40*30*6:kind==='circle'?Math.PI*15**2*6:75*6,node=service.nativeNode(cadSketchRecipe(sketch),{id:kind,color:'#1298ab'}),project=await service.rebuild(createCadProject({nodes:[node]}));assert.equal(project.version,7);close(node.stats.volume,expected);close(node.stats.bounds.min[2],0);close(node.stats.bounds.max[2],6);const roundtrip=service.stepNode(service.exportStep(project),{id:'read'});close(roundtrip.stats.volume,expected);assert.equal(roundtrip.stats.solids,1);assert.deepEqual(parseCadProject(serializeCadProject(project)),project);const wrong=structuredClone(project);wrong.version=5;assert.throws(()=>validateCadProject(wrong),/format 7/);wrong.version=6;assert.throws(()=>parseCadProject(wrong));wrong.version=7;wrong.nodes[0].recipe.size[2]++;assert.throws(()=>parseCadProject(wrong),/widerspricht/);}}
  finally{service.dispose();}
});
test('Native sketch edits in affine groups retain bottom, complete matrices, IDs, metadata and exact one-step Undo/Redo',async()=>{
  const service=createCadService({oc}),router=createCadCommandRouter({oc,service});try{
    const affine=new Matrix4().compose(new Vector3(23,7,40),new Quaternion().setFromEuler(new Euler(.4,-.3,.7)),new Vector3(-1.3,.7,1.5)).toArray();affine[4]+=.2;
    const sketch=service.nativeNode(cadSketchRecipe(defaultCadSketch()),{id:'sketch',name:'Editable',transform:affine,color:'#123456',metadata:{notes:'Keep'}}),other=service.nativeNode({type:'box',size:[5,6,7]},{id:'other',transform:new Matrix4().makeTranslation(200,0,0).toArray()});
    const parent={...service.nativeNode({type:'box',size:[1,1,1]},{id:'group'}),source:'group',operation:'union',children:[sketch],transform:new Matrix4().makeRotationX(.2).setPosition(5,2,9).toArray()};delete parent.recipe;
    const initial=await service.rebuild(createCadProject({nodes:[parent,other]})),transactions=createCadTransactions({initial,build:async(p,c)=>(await router.run(p,c.operation,{baseline:c.baseline})).project}),before=transactions.serialize(),edited=defaultCadSketch();edited.variables[0].value='50';edited.dimensions.height='hoehe * 2';
    const preview=await transactions.preview({revision:transactions.revision(),project:initial,operation:{kind:'batch',commands:[{op:'sketch',target:{rootId:'group',path:['sketch']},sketch:edited}]}}),node=preview.project.nodes[0].children[0];
    assert.deepEqual(node.transform,sketch.transform);assert.deepEqual(cadPoint(node.transform,[0,0,0]),cadPoint(sketch.transform,[0,0,0]));assert.equal(node.id,'sketch');assert.equal(node.color,sketch.color);assert.deepEqual(node.metadata,sketch.metadata);assert.deepEqual(preview.project.nodes[1],initial.nodes[1]);assert.deepEqual(preview.project.nodes[0].transform,initial.nodes[0].transform);close(node.stats.volume,50*30*12);assert.equal(transactions.serialize(),before);transactions.apply(preview);assert.equal(transactions.state().undo,1);const after=transactions.serialize();transactions.undo();assert.equal(transactions.serialize(),before);transactions.redo();assert.equal(transactions.serialize(),after);
    const restored=await service.rebuild(parseCadProject(after));assert.deepEqual(restored,preview.project);const duplicate=cloneCadSources(restored.nodes[0]);assert.notEqual(duplicate.id,parent.id);assert.notEqual(duplicate.children[0].id,node.id);assert.deepEqual(duplicate.children[0].recipe,node.recipe);
  }finally{service.dispose();}
});
test('Sketched creation follows a slanted workplane, format downgrade is explicit after removal, and failed edits are atomic',async()=>{
  const service=createCadService({oc}),router=createCadCommandRouter({oc,service});try{
    const q=new Quaternion().setFromEuler(new Euler(.3,.6,-.4)),initial=createCadProject({workplane:{origin:[5,8,17],orientation:q.toArray(),reference:null}}),transactions=createCadTransactions({initial,build:async(p,c)=>(await router.run(p,c.operation,{baseline:c.baseline})).project});
    const preview=await transactions.preview({revision:transactions.revision(),project:initial,operation:{kind:'batch',commands:[{op:'sketch',sketch:defaultCadSketch('circle'),as:'newSketch'}]}}),node=preview.project.nodes[0];assert.deepEqual(node.transform,new Matrix4().makeRotationFromQuaternion(q).setPosition(5,8,17).toArray());assert.equal(preview.aliases,undefined);transactions.apply(preview);
    const before=transactions.serialize(),invalid=defaultCadSketch();invalid.dimensions.height='unknown';await assert.rejects(transactions.preview({revision:transactions.revision(),project:transactions.snapshot(),operation:{kind:'batch',commands:[{op:'sketch',target:node.id,sketch:invalid}]}}));assert.equal(transactions.serialize(),before);assert.equal(transactions.state().undo,1);
    const locked=transactions.snapshot();locked.nodes[0].locked=true;await assert.rejects(router.run(locked,{kind:'batch',commands:[{op:'sketch',target:node.id,sketch:defaultCadSketch()}]}),/gesperrt/);
    const removed=transactions.snapshot();removed.nodes=[];assert.equal(JSON.parse(serializeCadProject(removed)).version,5);assert.equal(createCadProject().version,5);
  }finally{service.dispose();}
});
