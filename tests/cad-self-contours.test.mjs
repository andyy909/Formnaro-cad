import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCadKernel} from '../src/cad-kernel-loader.js';
import {cadContoursFromSvgSubpaths,reverseCadContour} from '../src/cad-original-contours.js';
import {cadNativeContourWinding} from '../src/cad-self-contours.js';
import {buildCadContours,cadRecipeVolume} from '../src/cad-recipes.js';
import {validateCadSolid,writeCadBrep,brepHasNoTriangulation} from '../src/cad-native-kernel.js';
import {exportCadStep,importCadStep} from '../src/cad-step-io.js';
const oc=await loadCadKernel({print:()=>{},printErr:()=>{}}),near=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<=e,`${a} vs ${b}`),polygon=points=>points.map((point,index)=>({kind:'line',start:point,end:points[(index+1)%points.length]})),bowtie=polygon([[0,0],[10,10],[0,10],[10,0]]);
function check(subpaths,fillRule,area){const result=cadContoursFromSvgSubpaths(oc,subpaths,{fillRule});assert.equal(result.topologyCertified,true);if(!area){assert.deepEqual(result.contours,[]);return result;}const shape=buildCadContours(oc,{contours:result.contours,height:2});try{const stats=validateCadSolid(oc,shape);near(cadRecipeVolume(oc,shape),area*2);assert.ok(stats.solids>0);assert.ok(brepHasNoTriangulation(writeCadBrep(oc,shape)));}finally{shape.delete();}return result;}
test('Native self-crossing line regions have exact winding signs, both fill rules and genuine closed CAD solids',()=>{
  assert.equal(cadNativeContourWinding(oc,[bowtie],[5,2]),-1);assert.equal(cadNativeContourWinding(oc,[bowtie],[5,8]),1);assert.equal(cadNativeContourWinding(oc,[bowtie],[-1,2]),0);assert.throws(()=>cadNativeContourWinding(oc,[bowtie],[5,5]),/eindeutigen/);
  for(const fillRule of ['evenodd','nonzero']){const result=check([bowtie],fillRule,50);assert.equal(result.contours.length,2);check([reverseCadContour(bowtie)],fillRule,50);}
});
test('An unfinished or failed native ray intersection cannot certify a zero winding',()=>{
  for(const failure of ['unfinished','error']){const broken=new Proxy(oc,{get(target,key){if(key==='BRepAlgoAPI_Section')return class {IsDone(){return failure!=='unfinished';}HasErrors(){return failure==='error';}delete(){}};return Reflect.get(target,key);}});assert.throws(()=>cadNativeContourWinding(broken,[bowtie],[5,2]),/Ray-Schnitt ist fehlgeschlagen/);}
});
test('Native self-arrangement retains full counts for repeated paths and a containing original contour',()=>{
  const square=polygon([[0,0],[10,0],[10,10],[0,10]]);check([bowtie,bowtie],'nonzero',50);check([bowtie,bowtie],'evenodd',0);check([square,bowtie],'nonzero',75);check([square,bowtie],'evenodd',50);check([bowtie,reverseCadContour(bowtie)],'nonzero',0);
});
test('A self-crossing single cubic Bézier is split at native parameter roots without flattening its two analytic lobes',()=>{
  const original=[{kind:'bezier',points:[[0,0],[2,2],[-1,2],[1,0]]},{kind:'line',start:[1,0],end:[0,0]}];
  // Green's integral at t=(1±sqrt(3/5))/2 gives two equal opposite
  // signed lobes, whose absolute total area is 18*sqrt(15)/125.
  for(const fillRule of ['evenodd','nonzero']){const result=check([original],fillRule,18*Math.sqrt(15)/125);assert.equal(result.contours.length,2);assert.ok(result.contours.every(c=>c.outer.some(s=>s.kind==='bezier'&&s.points.length===4)));}
});
test('Self-arrangement preserves a disjoint rotated ellipse with swapped original radii and reversed winding',()=>{
  const oval=[{kind:'ellipse',center:[20,4],rx:2,ry:3,rotation:.4,startAngle:0,endAngle:Math.PI*2,reversed:true}];
  for(const fillRule of ['evenodd','nonzero']){const result=check([bowtie,oval],fillRule,50+6*Math.PI);assert.ok(result.contours.some(c=>c.outer.some(s=>s.kind==='ellipse')));}
});
test('Original self-crossing cubic fill retains its two closed CAD bodies and exact analytic volume through native STEP',()=>{
  const original=[{kind:'bezier',points:[[0,0],[2,2],[-1,2],[1,0]]},{kind:'line',start:[1,0],end:[0,0]}],recipe=cadContoursFromSvgSubpaths(oc,[original]),shape=buildCadContours(oc,{contours:recipe.contours,height:2});
  try{assert.equal(validateCadSolid(oc,shape).solids,2);const step=exportCadStep(oc,[{shape,name:'Originale Bézier-Selbstschnittfüllung',color:'#774499'}]),restored=importCadStep(oc,step);assert.equal(restored.stats.solids,2);assert.ok(brepHasNoTriangulation(restored.brep.data));near(restored.stats.volume,36*Math.sqrt(15)/125,1e-7);}finally{shape.delete();}
});
