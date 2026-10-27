import test from 'node:test';
import assert from 'node:assert/strict';
import OCModule from 'replicad-opencascadejs';
import {buildCadRecipe,buildCadWire} from '../src/cad-recipes.js';
import {cadBoolean,readCadBrep,validateCadSolid,brepHasNoTriangulation,cadDisplayMesh} from '../src/cad-native-kernel.js';
import {importCadStep,exportCadStep} from '../src/cad-step-io.js';
const oc=await OCModule({print:()=>{},printErr:()=>{}}),close=(a,b,error=1e-6)=>assert.ok(Math.abs(a-b)<=error,`${a} versus ${b}`);

test('Direct CAD STEP preserves an analytic bore, separate parts, millimetres, names and colors',()=>{
  const cylinder=buildCadRecipe(oc,{type:'cylinder',size:[20,20,20]}),hole=buildCadRecipe(oc,{type:'cylinder',size:[6,6,30]}),box=buildCadRecipe(oc,{type:'box',size:[5,7,9]});let cut;
  try{
    cut=cadBoolean(oc,'difference',cylinder,hole);
    const bytes=exportCadStep(oc,[{shape:cut,name:'Bohrkörper',color:'#ff0000',opacity:1},{shape:box,name:'Quader',color:'#0000ff',opacity:.7}]),text=new TextDecoder().decode(bytes);
    assert.match(text,/ISO-10303-21/);assert.match(text,/CYLINDRICAL_SURFACE/);assert.match(text,/DRAUGHTING_PRE_DEFINED_COLOUR\('red'\)/);assert.match(text,/DRAUGHTING_PRE_DEFINED_COLOUR\('blue'\)/);assert.match(text,/SURFACE_STYLE_TRANSPARENT\(0\.3/);assert.match(text,/Quader/);assert.doesNotMatch(text,/TRIANGULATED_FACE|TESSELLATED_SHAPE|POLYGONAL_FACE_SET/);
    const result=importCadStep(oc,bytes);assert.ok(brepHasNoTriangulation(result.brep.data));assert.equal(result.stats.solids,2);close(result.stats.volume,Math.PI*(100-9)*20+5*7*9);
    const reopened=readCadBrep(oc,result.brep.data);try{const checked=validateCadSolid(oc,reopened);assert.equal(checked.solids,2);close(checked.bounds.size[2],20);}finally{reopened.delete();}
    // Display caches cannot become geometry in a subsequent direct export.
    cadDisplayMesh(oc,cut,{deflection:.5,angleDegrees:40});
    const after=importCadStep(oc,exportCadStep(oc,[{shape:cut,name:'Bohrkörper',color:'#ff0000'}]));close(after.stats.volume,Math.PI*(100-9)*20);assert.ok(brepHasNoTriangulation(after.brep.data));
  }finally{cut?.delete();box.delete();hole.delete();cylinder.delete();}
});

test('Native STEP writer encodes Unicode and literal backslashes for independent Part21 readers',()=>{
  const box=buildCadRecipe(oc,{type:'box',size:[3,4,5]});
  try{for(const name of ['Bohrkörper','日本語','Teil 😀',"Part 'name'",'Part \\X2\\0041\\X0\\']){
    const bytes=exportCadStep(oc,[{shape:box,name,color:'#12abef'}]),text=new TextDecoder().decode(bytes);
    assert.ok([...text].every(v=>v.codePointAt(0)<128));
    if(name==="Part 'name'")assert.match(text,/Part ''name''/);else assert.match(text,/\\X[24]\\[\s0-9A-F]+\\X0\\/);
    assert.ok(Math.abs(importCadStep(oc,bytes).stats.volume-60)<1e-6);
  }}finally{box.delete();}
});

test('STEP input validates all geometry and converts declared inch coordinates into millimetres',()=>{
  const box=buildCadRecipe(oc,{type:'box',size:[1,2,3]}),path='/inch-cad-proof.step',writer=new oc.STEPControl_Writer(),progress=new oc.Message_ProgressRange();
  try{
    oc.Interface_Static.SetCVal('write.step.unit','INCH');assert.equal(writer.Transfer(box,oc.STEPControl_StepModelType.STEPControl_AsIs,true,progress),oc.IFSelect_ReturnStatus.IFSelect_RetDone);assert.equal(writer.Write(path),oc.IFSelect_ReturnStatus.IFSelect_RetDone);
    const result=importCadStep(oc,oc.FS.readFile(path).slice());close(result.stats.volume,6);for(let i=0;i<3;i++)close(result.stats.bounds.max[i]-result.stats.bounds.min[i],i+1);
    assert.throws(()=>importCadStep(oc,new TextEncoder().encode('not a STEP')),/STEP-Datei/);assert.throws(()=>exportCadStep(oc,[]),/mindestens/);
    const wire=buildCadWire(oc,[{kind:'line',start:[0,0],end:[1,0]},{kind:'line',start:[1,0],end:[1,1]},{kind:'line',start:[1,1],end:[0,0]}]);
    try{assert.throws(()=>exportCadStep(oc,[{shape:wire,name:'Open'}]),/CAD-Körper/);}finally{wire.delete();}
  }finally{oc.Interface_Static.SetCVal('write.step.unit','MM');try{oc.FS.unlink(path);}catch{}progress.delete();writer.delete();box.delete();}
});
