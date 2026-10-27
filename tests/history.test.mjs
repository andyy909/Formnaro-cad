import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'manifold-3d/manifold';
import * as THREE from 'three';
import {setKernel,makeNode,worldManifold,groupNodes,matrixArray,fitParameters,validNode,stlBinary,normalizeMesh,meshData} from '../src/geometry.js';
import {synchronizeHistory,inferOperation,featureContext} from '../src/history.js';
const kernel=await Module({wasmBinary:fs.readFileSync(new URL('../node_modules/manifold-3d/manifold.wasm',import.meta.url))});kernel.setup();setKernel(kernel);
const near=(a,b,t=.02)=>assert.ok(Math.abs(a-b)<t,`${a} vs ${b}`);
const volume=n=>{const m=worldManifold(n);try{assert.equal(m.status(),'NoError');return m.volume();}finally{m.delete();}};
function plate(){return groupNodes([makeNode('box',[0,0,5],{size:[30,20,10]}),makeNode('box',[0,0,5],{size:[5,5,14],solid:false})]);}
function sourcePosition(group,child){const m=new THREE.Matrix4().fromArray(matrixArray({...group,size:group.size.map((v,i)=>v/group.baseSize[i])}));return new THREE.Vector3(...child.pos).applyMatrix4(m).toArray();}
test('Grouped hole dimensions regenerate the closed final solid and survive JSON/export',()=>{
  const g=plate();synchronizeHistory([g]);near(volume(g),5750);g.children[1].size=[6,6,14];synchronizeHistory([g]);near(volume(g),5640);
  const loaded=JSON.parse(JSON.stringify(g));synchronizeHistory([loaded]);near(volume(loaded),5640);const m=worldManifold(loaded);try{assert.ok(stlBinary(m).byteLength>500);}finally{m.delete();}
});
test('Source bounds changes preserve unaffected world positions after mirror, rotation and nonuniform group scaling',()=>{
  const g=plate();g.rot=[27,18,-41];g.mirror=[-1,1,-1];g.size=g.size.map((v,i)=>v*[1.5,.8,2][i]);g.pos=[50,-14,29];synchronizeHistory([g]);
  const original=g.children[1],position=sourcePosition(g,original);g.children[0].size[0]=44;g.children[0].pos[0]+=7;synchronizeHistory([g]);
  const after=sourcePosition(g,original);position.forEach((v,i)=>near(v,after[i],.001));near(volume(g),(44*20*10-250)*1.5*.8*2,.1);
});
test('Nested history rebuilds through every later grouping operation',()=>{
  const inner=plate(),extra=makeNode('box',[35,0,5],{size:[10,10,10]}),outer=groupNodes([inner,extra]);synchronizeHistory([outer]);
  const nested=outer.children[0],hole=nested.children[1],v=volume(outer);hole.size=[8,8,14];synchronizeHistory([outer]);near(v-volume(outer),390);
  const context=featureContext([outer],{rootId:outer.id,path:[nested.id,hole.id]});assert.equal(context.node,hole);assert.equal(context.chain.length,3);
});
test('Native fillet and gear parameters remain editable inside groups',()=>{
  const box=makeNode('box',[0,0,10]),gear=makeNode('gear',[50,0,5]);fitParameters(gear);const g=groupNodes([box,gear]);synchronizeHistory([g]);const before=volume(g);
  g.children[0].params.edgeStyle='round';g.children[0].params.edgeSize=3;g.children[0].params.edgeSteps=16;synchronizeHistory([g]);assert.ok(volume(g)<before);
  const teeth=g.children[1];teeth.params.teeth+=5;fitParameters(teeth);synchronizeHistory([g]);assert.ok(volume(g)>before);
});
test('Grouped threaded cutters regenerate after pitch/diameter edits and imported sources keep scalable geometry',()=>{
  const body=makeNode('box',[0,0,8],{size:[24,24,16]}),thread=makeNode('thread',[0,0,8],{solid:false});thread.params={...thread.params,kind:'cutter',diameter:8,length:20};fitParameters(thread);thread.pos=[0,0,8];
  const g=groupNodes([body,thread]);synchronizeHistory([g]);const before=volume(g),source=g.children[1];source.params.diameter=10;source.params.pitch=1.5;fitParameters(source);synchronizeHistory([g]);assert.ok(volume(g)<before-200);
  const m=worldManifold(makeNode('box',[0,0,0],{size:[7,8,9]}));let data;try{data=normalizeMesh(meshData(m));}finally{m.delete();}
  const imported=makeNode('import',[30,0,5],data),merged=groupNodes([g,imported]);synchronizeHistory([merged]);const v=volume(merged);merged.children[1].size[0]*=2;synchronizeHistory([merged]);near(volume(merged)-v,7*8*9,.1);
});
test('Steps can be suppressed; an invalid source leaves cached geometry untouched until caller rollback',()=>{
  const g=plate();synchronizeHistory([g]);g.children[1].suppressed=true;synchronizeHistory([g]);near(volume(g),6000);g.children[1].suppressed=false;synchronizeHistory([g]);near(volume(g),5750);
  const oldMesh=JSON.stringify(g.mesh);g.children[0].suppressed=true;assert.throws(()=>synchronizeHistory([g]),/mindestens/);assert.equal(JSON.stringify(g.mesh),oldMesh);
});
test('Old union and renamed intersection groups are verified geometrically before upgrading',()=>{
  const union=plate();delete union.operation;assert.equal(inferOperation(union),'union');synchronizeHistory([union],{upgrade:true});assert.equal(union.operation,'union');near(volume(union),5750);
  const a=makeNode('box',[0,0,0],{size:[10,10,10]}),b=makeNode('box',[5,0,0],{size:[10,10,10]});const intersection=groupNodes([a,b],'intersection');delete intersection.operation;intersection.name='Umbenannt';assert.equal(inferOperation(intersection),'intersection');synchronizeHistory([intersection],{upgrade:true});near(volume(intersection),500);
  const unknown=plate();delete unknown.operation;unknown.children[0].size[0]=45;assert.equal(inferOperation(unknown),null);synchronizeHistory([unknown],{upgrade:true});assert.equal(unknown.operation,undefined);near(volume(unknown),5750);
});
test('Reload regenerates stale caches from sources and rejects malformed history identifiers/operations',()=>{
  const g=plate();g.children[1].size[0]=8;synchronizeHistory([g]);near(volume(g),5600);
  const bad=structuredClone(g);bad.operation='unknown';assert.equal(validNode(bad),false);assert.throws(()=>synchronizeHistory([bad]));
  const duplicate=structuredClone(g);duplicate.children[1].id=duplicate.children[0].id;assert.throws(()=>synchronizeHistory([duplicate]),/Doppelte/);
});
