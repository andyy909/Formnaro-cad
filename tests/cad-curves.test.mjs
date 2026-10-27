import test from 'node:test';
import assert from 'node:assert/strict';
import load from '../cad-kernel-build/runtime/formnaro_cad.js';
import {bezierPoint,bezierBounds,bezierArea,bsplineBeziers,curveContact} from '../src/cad-curves.js';
import {resolveCadSketch,cadSketchRecipe} from '../src/cad-sketch.js';
import {buildCadRecipe} from '../src/cad-recipes.js';
import {cadVolume,validateCadSolid,writeCadBrep,readCadBrep} from '../src/cad-native-kernel.js';
import {solveSketchConstraints} from '../src/sketch-constraints-solver.js';
import {createCadService} from '../src/cad-service.js';
import {createCadProject,serializeCadProject,parseCadProject} from '../src/cad-project.js';
import {createCadPersistence,MIXED_LIBRARY_KEY} from '../src/cad-persistence.js';
import {createCadProjectParameters} from '../src/cad-project-parameters-data.js';
import {cadProjectParameterCatalog} from '../src/cad-project-parameters-catalog.js';
import {updateCadProjectParameters} from '../src/cad-project-parameters-native.js';
import {cadEditFormRecipe} from '../src/cad-form-controls.js';
const near=(a,b,eps=1e-7)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
const oc=await load({print:()=>{},printErr:()=>{}});
function arch(type='bezier'){return {version:4,kind:'profile',variables:[],dimensions:{height:'2'},constraints:[],elements:[{id:'curve',type,start:['0','0'],control1:['0','10'],control2:['10','10'],end:['10','0'],construction:false},{id:'base',type:'line',start:['10','0'],end:['0','0'],construction:false}],loops:[{id:'outer',role:'outer',elements:['curve','base']}]};}
test('Cubic bounds and signed area are analytic, not display samples',()=>{
 const p=[[0,0],[0,10],[10,10],[10,0]];near(bezierArea(p),-60);const b=bezierBounds(p);near(b.max[1],7.5);assert.deepEqual(b.min,[0,0]);near(b.max[0],10);
});
test('Uniform cubic B-spline decomposition agrees with the independent native OCCT curve',()=>{
 const p=[[0,0],[1,4],[3,7],[7,6],[9,2],[12,0]],poles=new oc.NCollection_Array1_gp_Pnt(1,p.length),knots=new oc.NCollection_Array1_double(1,4),mults=new oc.NCollection_Array1_int(1,4);
 try{for(let i=0;i<p.length;i++){const point=new oc.gp_Pnt(...p[i],0);poles.SetValue(i+1,point);point.delete();}for(let i=0;i<4;i++){knots.SetValue(i+1,i);mults.SetValue(i+1,i===0||i===3?4:1);}const native=new oc.Geom_BSplineCurve(poles,knots,mults,3,false);try{const spans=bsplineBeziers(p);for(let i=0;i<3;i++)for(const t of [0,.13,.5,.93,1]){const point=native.Value(i+t),expected=bezierPoint(spans[i],t);try{near(point.X(),expected[0]);near(point.Y(),expected[1]);}finally{point.delete();}}}finally{native.delete();}}finally{poles.delete();knots.delete();mults.delete();}
});
test('Editable Bezier and B-spline profiles produce exact native solids and reopen without control loss',()=>{
 for(const type of ['bezier','bspline']){const s=arch(type),before=structuredClone(s),r=resolveCadSketch(s);near(r.area,60);near(r.size[1],7.5);assert.deepEqual(s,before);const body=buildCadRecipe(oc,cadSketchRecipe(s));try{near(cadVolume(oc,body),120,1e-6);assert.equal(validateCadSolid(oc,body).solids,1);const copy=readCadBrep(oc,writeCadBrep(oc,body));try{near(cadVolume(oc,copy),120,1e-6);}finally{copy.delete();}assert.deepEqual(r.sketch,s);}finally{body.delete();}}
});
test('A curve control remains formula-editable while old endpoint constraints retain wire closure',()=>{
 const s=arch();s.variables=[{name:'rise',value:'10'}];s.elements[0].control1[1]='rise';s.constraints=[{id:'join',type:'coincident',refs:[{element:'curve',point:'end'},{element:'base',point:'start'}]}];const result=solveSketchConstraints(s);assert(result.ok);assert.equal(result.sketch.elements[0].control1[1],'rise');near(resolveCadSketch(result.sketch).area,60);
 s.variables[0].value='20';near(resolveCadSketch(s).area,90);assert.equal(s.elements[0].control1[1],'rise');
});
test('Self-crossing curves, non-adjacent contacts, invalid poles and unsupported old-version curve payloads reject',()=>{
 const s=arch();s.elements[0].control1=['30','20'];s.elements[0].control2=['-20','20'];assert.throws(()=>resolveCadSketch(s),/selbst|Rücklauf|Kontakt|Spitze/);
 const old=arch();old.version=3;assert.throws(()=>resolveCadSketch(old));
 const gap=arch();gap.elements[0].control3=['3','4'];assert.throws(()=>resolveCadSketch(gap));
 assert(curveContact({kind:'bezier',points:[[0,0],[3,3],[7,7],[10,10]]},{type:'line',start:[0,10],end:[10,0]}));
 assert(!curveContact({kind:'bezier',points:[[0,0],[3,3],[7,7],[10,10]]},{type:'line',start:[0,20],end:[10,20]}));
});
test('Curves require format24 and retain controls in the project and template library without raising legacy projects',async()=>{
 const service=createCadService({oc});try{const node=service.nativeNode(cadSketchRecipe(arch()),{id:'curve-part'}),p=await service.rebuild(createCadProject({nodes:[node]}));assert.equal(p.version,24);assert.equal(createCadProject().version,5);assert.deepEqual(parseCadProject(serializeCadProject(p)),p);assert.throws(()=>parseCadProject({...p,version:23}),/format 24/);
 const data=new Map(),persistence=createCadPersistence({storage:{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)},transactions:{snapshot:()=>p,preview:async p=>p},verify:async p=>p});persistence.saveTemplate({name:'Curved arch',ids:[node.id]});assert.equal(JSON.parse(data.get(MIXED_LIBRARY_KEY)).version,24);assert.deepEqual(persistence.listTemplates()[0].project.nodes[0].recipe.sketch,arch());
 }finally{service.dispose();}
});
test('A project parameter binds a curve control and changes real geometry while preserving an independent part exactly',async()=>{
 const service=createCadService({oc});try{const n=service.nativeNode(cadSketchRecipe(arch()),{id:'curve'}),other=service.nativeNode({type:'box',size:[2,3,4]},{id:'keep'}),p=await service.rebuild(createCadProject({nodes:[n,other]}));const keep=JSON.stringify(p.nodes[1]),before=serializeCadProject(p);assert(cadProjectParameterCatalog(p).flatMap(c=>c.fields).some(c=>c.field==='sketch.elements.curve.control1.1'));
 const definition={...createCadProjectParameters(),parameters:[{id:'rise',name:'rise',value:'20'}],bindings:[{id:'control-rise',parameterId:'rise',target:{rootId:'curve',path:[]},field:'sketch.elements.curve.control1.1'}]};
 const result=await updateCadProjectParameters(p,definition,{service,editRecipe:(n,patch)=>cadEditFormRecipe(n,patch,{oc})});near(result.project.nodes[0].stats.volume,180,1e-5);assert.equal(JSON.stringify(result.project.nodes[1]),keep);assert.equal(serializeCadProject(p),before);assert.equal(result.project.version,24);
 }finally{service.dispose();}
});
