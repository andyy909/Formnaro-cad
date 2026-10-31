import test from 'node:test';
import assert from 'node:assert/strict';
import loader from '../cad-kernel-build/runtime/formnaro_cad.js';
import {createCadService} from '../src/cad-service.js';
import {createCadProject} from '../src/cad-project.js';
import {createCadTransactions} from '../src/cad-transactions.js';
import {createCadToolsNative} from '../src/cad-tools-native.js';
import {resolveCadAnnotationNative} from '../src/cad-annotations-native.js';
import {cadNativeFaceCorrespondence} from '../src/cad-face-correspondence-native.js';
const oc=await loader({print:()=>{},printErr:()=>{}});
async function bored(service,{x=5,y=3,diameter=4,kind='counterbore'}={}){const body=service.nativeNode({type:'box',size:[40,20,4]},{id:'body'}),store=createCadTransactions({initial:createCadProject({nodes:[body]}),build:(p,c)=>service.rebuild(p,{baseline:c.baseline})}),tools=createCadToolsNative({oc,service,transactions:store});store.apply(await tools.previewDrill({id:'body',resultId:'part',reference:{ray:{origin:[x,y,30],direction:[0,0,-1]}},kind,diameter,headDiameter:8,headDepth:1,associative:true,revision:store.revision()}));return store.snapshot().nodes[0];}
test('native trimmed-face coincidence recovers floating-point serialization differences without modifying inputs',async()=>{
 const service=createCadService({oc});try{const before=await bored(service),after=await bored(service,{x:5.000000000000004,y:3.000000000000001}),index=resolveCadAnnotationNative(oc,before,{point:[-12,0,-2],normal:[0,0,-1]}).faceIndex,original=structuredClone([before,after]),result=cadNativeFaceCorrespondence(oc,before.brep,after.brep,{indices:[index]});assert(result.mapping.has(index));assert.notEqual(result.beforeKeys[index-1],result.afterKeys[result.mapping.get(index)-1]);assert(result.proofs.some(proof=>proof.before===index&&Math.abs(proof.commonArea-proof.beforeArea)<=proof.areaTolerance&&proof.missingArea<=proof.areaTolerance&&proof.addedArea<=proof.areaTolerance));assert.deepEqual([before,after],original);}finally{service.dispose();}
});
test('equal area and support with displaced holes does not establish trimmed-face correspondence',async()=>{
 const service=createCadService({oc});try{const before=await bored(service),after=await bored(service,{x:5.001}),index=resolveCadAnnotationNative(oc,before,{point:[-12,0,-2],normal:[0,0,-1]}).faceIndex,result=cadNativeFaceCorrespondence(oc,before.brep,after.brep,{indices:[index]});assert.equal(result.mapping.has(index),false);assert.equal(result.proofs.some(proof=>proof.before===index),false);}finally{service.dispose();}
});
test('changed hole diameter and exhausted native comparison budget leave correspondence unresolved',async()=>{
 const service=createCadService({oc});try{const before=await bored(service),changed=await bored(service,{diameter:4.01}),same=await bored(service,{x:5.000000000000004}),index=resolveCadAnnotationNative(oc,before,{point:[-12,0,-2],normal:[0,0,-1]}).faceIndex;assert.equal(cadNativeFaceCorrespondence(oc,before.brep,changed.brep,{indices:[index]}).mapping.has(index),false);const budget=cadNativeFaceCorrespondence(oc,before.brep,same.brep,{indices:[index],maxComparisons:0});assert.equal(budget.mapping.has(index),false);assert.equal(budget.comparisons,0);}finally{service.dispose();}
});
for(const kind of ['counterbore','countersink'])test('native coincidence preserves the complete '+(kind==='counterbore'?'cylindrical bore':'conical countersink')+' wall domain',async()=>{
 const service=createCadService({oc});try{const before=await bored(service,{kind}),after=await bored(service,{kind,x:5.000000000000004,y:3.000000000000001}),point=kind==='counterbore'?[7,3,0]:[8,3,1],index=resolveCadAnnotationNative(oc,before,{point,normal:kind==='counterbore'?[-1,0,0]:[-Math.SQRT1_2,0,Math.SQRT1_2]}).faceIndex,result=cadNativeFaceCorrespondence(oc,before.brep,after.brep,{indices:[index]});assert(Number.isSafeInteger(index));assert(result.mapping.has(index));assert.notEqual(result.beforeKeys[index-1],result.afterKeys[result.mapping.get(index)-1]);assert(result.proofs.some(proof=>proof.before===index&&proof.addedArea<=proof.areaTolerance&&proof.missingArea<=proof.areaTolerance));}finally{service.dispose();}
});
