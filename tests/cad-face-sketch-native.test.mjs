import test from 'node:test';
import assert from 'node:assert/strict';
import {Matrix4} from 'three';
import load from '../cad-kernel-build/runtime/formnaro_cad.js';
import {faceSketchNative} from '../src/cad-face-sketch-native.js';
import {buildCadRecipe,buildCadContours,cadRecipeVolume} from '../src/cad-recipes.js';
import {cadRayHits,transformCad,writeCadBrep,validateCadSolid} from '../src/cad-native-kernel.js';
import {cadPoint} from '../src/cad-affine.js';
import {resolveCadSketch,cadSketchRecipe,defaultCadSketch} from '../src/cad-sketch.js';
import {appendProfileLoop,profilePrimitive,profileFromLegacy} from '../src/sketch-profile.js';
import {createCadService} from '../src/cad-service.js';
import {createCadProject} from '../src/cad-project.js';

const oc=await load({print:()=>{},printErr:()=>{}}),near=(a,b,tolerance=1e-6)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
function pick(shape,origin,direction=[0,0,-1]){const hit=cadRayHits(oc,shape,{origin,direction,far:1000}).sort((a,b)=>a.t-b.t)[0];assert.ok(hit);return hit;}
function plate(){const legacy=defaultCadSketch();legacy.dimensions.width='60';legacy.dimensions.depth='40';legacy.dimensions.height='3';let sketch=profileFromLegacy(legacy,resolveCadSketch(legacy));sketch=appendProfileLoop(sketch,profilePrimitive('roundrect',[-30,-20],[30,20],{radius:4}),'outer');sketch=appendProfileLoop(sketch,[{id:'round-hole',type:'circle',center:[-15,9],diameter:'6'}]);sketch=appendProfileLoop(sketch,profilePrimitive('slot',[6,-3],[22,3]));return resolveCadSketch(sketch);}

test('Every box face copies its complete analytic boundary with an outward right-handed frame',()=>{
 const shape=buildCadRecipe(oc,{type:'box',size:[20,30,4]}),before=writeCadBrep(oc,shape);
 try{const areas=[];for(let i=1;i<=6;i++){
  const copy=faceSketchNative(oc,shape,i,{height:2}),resolved=resolveCadSketch(copy.sketch);areas.push(copy.area);assert.equal(copy.sketch.version,2);assert.equal(copy.elementCount,4);assert.ok(copy.sketch.elements.every(e=>e.type==='line'));near(new Matrix4().fromArray(copy.frame).determinant(),1);
  const extrusion=buildCadContours(oc,{contours:[resolved.native],height:resolved.height});try{near(cadRecipeVolume(oc,extrusion),copy.area*2);validateCadSolid(oc,extrusion);}finally{extrusion.delete();}
 }
 assert.deepEqual(areas.sort((a,b)=>a-b),[80,80,120,120,600,600]);assert.equal(writeCadBrep(oc,shape),before);
 const top=faceSketchNative(oc,shape,pick(shape,[0,0,30]).faceIndex);assert.ok(top.frame[10]>.999999);near(cadPoint(top.frame,[0,0,0])[2],2);
 const bottom=faceSketchNative(oc,shape,pick(shape,[0,0,-30],[0,0,1]).faceIndex);assert.ok(bottom.frame[10]<-.999999);near(cadPoint(bottom.frame,[0,0,0])[2],-2);
 }finally{shape.delete();}
});

test('A rounded face preserves true arcs, circular holes and a slot as an independently editable profile',()=>{
 const profile=plate(),shape=buildCadContours(oc,{contours:[profile.native],height:profile.height}),before=writeCadBrep(oc,shape);
 try{const hit=pick(shape,[0,12,50]),copy=faceSketchNative(oc,shape,hit.faceIndex,{height:6}),resolved=resolveCadSketch(copy.sketch);
  near(copy.area,profile.area);assert.equal(copy.sketch.loops.filter(l=>l.role==='outer').length,1);assert.equal(copy.sketch.loops.filter(l=>l.role==='hole').length,2);assert.equal(copy.sketch.elements.filter(e=>e.type==='circle').length,1);assert.equal(copy.sketch.elements.filter(e=>e.type==='arc').length,8);near(resolved.height,6);
  const rebuilt=buildCadContours(oc,{contours:[resolved.native],height:6});try{near(cadRecipeVolume(oc,rebuilt),profile.area*6);validateCadSolid(oc,rebuilt);}finally{rebuilt.delete();}
  copy.sketch.variables[0].value='12';near(resolveCadSketch(copy.sketch).height,12);assert.equal(writeCadBrep(oc,shape),before);
 }finally{shape.delete();}
});

test('A full circular cap remains one analytic circle',()=>{
 const shape=buildCadRecipe(oc,{type:'cylinder',size:[16,16,10]});
 try{const hit=pick(shape,[0,0,40]),copy=faceSketchNative(oc,shape,hit.faceIndex);assert.equal(copy.elementCount,1);assert.equal(copy.sketch.elements[0].type,'circle');near(Number(copy.sketch.elements[0].diameter),16);near(copy.area,Math.PI*64);}finally{shape.delete();}
});

test('STEP boundaries survive mirrored rotated placement and uniform scaling in world millimetres',async()=>{
 const service=createCadService({oc});try{
  const profile=plate(),node=service.nativeNode(cadSketchRecipe(profile.sketch),{id:'original'}),project=await service.rebuild(createCadProject({nodes:[node]})),imported=service.stepNode(service.exportStep(project),{id:'step'}),matrix=new Matrix4().makeTranslation(70,-40,20).multiply(new Matrix4().makeRotationX(.7)).multiply(new Matrix4().makeScale(-1.5,1.5,1.5)).toArray();imported.transform=matrix;
  const shape=service.worldShape(imported);try{const origin=cadPoint(matrix,[0,12,50]),direction=cadPoint(matrix,[0,0,-1]).map((v,k)=>v-matrix[12+k]),hit=pick(shape,origin,direction),copy=faceSketchNative(oc,shape,hit.faceIndex,{height:4});near(copy.area,profile.area*2.25,1e-5);assert.equal(copy.sketch.loops.length,3);near(new Matrix4().fromArray(copy.frame).determinant(),1);const normal=copy.frame.slice(8,11),expected=matrix.slice(8,11).map(v=>v/1.5);near(Math.abs(normal.reduce((sum,v,k)=>sum+v*expected[k],0)),1);near(normal.reduce((sum,v,k)=>sum+v*hit.normal[k],0),1);
   const first=resolveCadSketch(copy.sketch).elements[0].start,point=cadPoint(copy.frame,[...first,0]);assert.ok(point.every(Number.isFinite));
  }finally{shape.delete();}
 }finally{service.dispose();}
});

test('Curved faces and noncircular affine boundaries fail without an approximation',()=>{
 const shape=buildCadRecipe(oc,{type:'cylinder',size:[16,16,10]});let affine;
 try{const side=pick(shape,[30,0,0],[-1,0,0]);assert.throws(()=>faceSketchNative(oc,shape,side.faceIndex),e=>e.code==='FACE_SKETCH_NOT_PLANAR');affine=transformCad(oc,shape,new Matrix4().makeScale(2,1,1).toArray());const cap=pick(affine,[0,0,40]);assert.throws(()=>faceSketchNative(oc,affine,cap.faceIndex),e=>['FACE_SKETCH_NOT_PLANAR','FACE_SKETCH_UNSUPPORTED_CURVE'].includes(e.code));}
 finally{affine?.delete();shape.delete();}
});

test('Element budgets, absent faces and invalid dimensions reject before changing a source',()=>{
 const shape=buildCadRecipe(oc,{type:'box',size:[20,30,4]}),before=writeCadBrep(oc,shape);
 try{assert.throws(()=>faceSketchNative(oc,shape,1,{maxElements:3}),e=>e.code==='FACE_SKETCH_LIMIT');assert.throws(()=>faceSketchNative(oc,shape,7),e=>e.code==='FACE_SKETCH_FACE_LOST');for(const index of [0,-1,1.5,8001,NaN])assert.throws(()=>faceSketchNative(oc,shape,index),e=>e.code==='FACE_SKETCH_INVALID_FACE');for(const options of [{height:0},{height:Infinity},{maxElements:129},{maxElements:0}])assert.throws(()=>faceSketchNative(oc,shape,1,options),e=>e.code==='FACE_SKETCH_INVALID_OPTIONS');assert.equal(writeCadBrep(oc,shape),before);}finally{shape.delete();}
});

test('Native tangent roundoff handling still rejects real almost-tangent self-crossings',()=>{
 const contour=(x,offset)=>({version:2,kind:'profile',variables:[],dimensions:{height:'1'},elements:[{id:'approach',type:'line',start:[x,3+offset],end:[9,3]},{id:'arc',type:'arc',start:[9,3],through:[6.878679656440358,2.121320343559643],end:[6,0]},{id:'close',type:'line',start:[6,0],end:[x,3+offset]}],loops:[{id:'outer',role:'outer',elements:['approach','arc','close']}]});
 for(const offset of [.001,.0001,.00001]){assert.doesNotThrow(()=>resolveCadSketch(contour(0,offset)));assert.throws(()=>resolveCadSketch(contour(0,-offset)),/überschneiden|berühren/);}
 assert.doesNotThrow(()=>resolveCadSketch(contour(-9000,.1)));assert.throws(()=>resolveCadSketch(contour(-9000,-.1)),/überschneiden|berühren/);
});
