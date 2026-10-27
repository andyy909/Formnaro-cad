import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d/manifold';
import {setKernel,makeNode,worldManifold,meshData,normalizeMesh,validNode,groupNodes} from '../src/geometry.js';
import {initCad,cadEdges,finishNode,exportStep,importStep} from '../src/cad-kernel.js';
import {synchronizeHistory} from '../src/history.js';
import {fittedSize,fitCopy} from '../src/fit-tools.js';
const kernel=await Module();kernel.setup();setKernel(kernel);const oc=await initCad();
function volume(n){const m=worldManifold(n);try{assert.equal(m.status(),'NoError');return m.volume();}finally{m.delete();}}
test('Selected CAD edge round/chamfer removes material, retains native source and STEP round-trips',()=>{
  const source=makeNode('box',[5,8,10],{params:{edgeStyle:'none',edgeSize:1,edgeScope:'all',edgeSteps:8}}),before=structuredClone(source),edges=cadEdges(source);assert.equal(edges.length,12);
  for(const kind of ['round','chamfer']){
    const result=finishNode(source,{kind,amount:1,edges:[edges[0].anchor]});assert.ok(validNode(result));assert.equal(result.children[0].id,source.id);assert.deepEqual(result.children[0].params,source.params);assert.ok(volume(result)<volume(source));assert.ok(volume(result)>7900);
    const step=exportStep([result]);assert.match(new TextDecoder().decode(step),/ISO-10303-21/);const data=importStep(step),again=makeNode('import',null,data);assert.ok(Math.abs(volume(again)-volume(result))<.08);assert.equal(data.solids,1);assert.ok(data.cad.brep.length);assert.deepEqual(source,before);
  }
});
test('Finishing regenerates after source color/translation and rejects invalid radius atomically',()=>{
 const n=makeNode('box'),edges=cadEdges(n),g=finishNode(n,{kind:'chamfer',amount:1,edges:[edges[0].anchor]});
 const saved=structuredClone(g),value=volume(g);g.children[0].pos[0]+=5;synchronizeHistory([g]);assert.ok(Math.abs(volume(g)-value)<.01);g.children[0].color='#123456';synchronizeHistory([g]);assert.ok(Math.abs(volume(g)-value)<.01);
 assert.throws(()=>finishNode(n,{kind:'round',amount:500,edges:[edges[0].anchor]}));assert.deepEqual(n,makeNode('box',[0,0,10],{id:n.id}));assert.equal(saved.children[0].type,'box');
 const removed=finishNode(g,{remove:true});assert.equal(removed.edgeFinish,undefined);assert.ok(Math.abs(volume(removed)-8000)<.01);
});
test('Finishing works on a grouped notch and imported closed mesh',()=>{
 const body=makeNode('box',[0,0,10]),hole=makeNode('box',[8,8,10],{size:[8,8,30],solid:false}),g=groupNodes([body,hole]);
 for(const input of [g,makeNode('import',g.pos,{mesh:g.mesh,size:g.size})]){const edges=cadEdges(input);assert.ok(edges.length>12);const r=finishNode(input,{kind:'chamfer',amount:.4,edges:[edges[0].anchor]});assert.ok(volume(r)<volume(input));assert.ok(validNode(r));}
});
test('STEP keeps separate solids, units and transforms; malformed/open data are rejected',()=>{
 const a=makeNode('box',[12,-6,4],{size:[20,10,8],rot:[10,20,30],mirror:[-1,1,1]}),b=makeNode('box',[50,0,5],{size:[8,8,10]});const data=importStep(exportStep([a,b]));assert.equal(data.solids,2);const imported=makeNode('import',null,data);assert.ok(Math.abs(volume(imported)-volume(a)-volume(b))<.15);assert.throws(()=>importStep(new TextEncoder().encode('not step')));assert.throws(()=>importStep(new TextEncoder().encode('ISO-10303-21; invalid')));
});
test('Fit dimensions apply per-side clearance, preserve sources and account for parent scale',()=>{
 const n=makeNode('cylinder',[0,0,5],{size:[10,10,10],rot:[30,0,15],mirror:[-1,1,1]});assert.deepEqual(fittedSize(n,{gap:.2,kind:'opening'}),[10.4,10.4,10]);assert.deepEqual(fittedSize(n,{gap:.2,kind:'insert'}),[9.6,9.6,10]);assert.deepEqual(fittedSize(n,{gap:.2,kind:'opening',parentScale:[2,.5,1]}),[10.2,10.8,10]);assert.throws(()=>fittedSize(n,{gap:5,kind:'insert'}));const g=groupNodes([n]),c=fitCopy(g,{gap:.2,kind:'opening'});assert.equal(c.solid,false);assert.notEqual(c.id,g.id);assert.notEqual(c.children[0].id,n.id);assert.deepEqual(c.children[0].params,n.params);assert.deepEqual(c.rot,g.rot);
});

function analyticStep(shape,unit='MM'){
 const path='/analytic-fixture.step',writer=new oc.STEPControl_Writer(),progress=new oc.Message_ProgressRange();
 try{oc.Interface_Static.SetCVal('write.step.unit',unit);assert.equal(writer.Transfer(shape,oc.STEPControl_StepModelType.STEPControl_AsIs,true,progress),oc.IFSelect_ReturnStatus.IFSelect_RetDone);assert.equal(writer.Write(path),oc.IFSelect_ReturnStatus.IFSelect_RetDone);return oc.FS.readFile(path).slice();}
 finally{writer.delete();progress.delete();oc.FS.unlink(path);oc.Interface_Static.SetCVal('write.step.unit','MM');}
}
test('Analytic STEP curves survive JSON, uniform scale, rotation and mirror; nonuniform geometry is retained',()=>{
 const maker=new oc.BRepPrimAPI_MakeCylinder(10,20),shape=maker.Shape();
 try{const data=importStep(analyticStep(shape)),n=JSON.parse(JSON.stringify(makeNode('import',null,data)));assert.ok(Math.abs(n.size[0]-20)<.02);assert.equal(cadEdges(n).length,3);n.size=n.size.map(v=>v*1.5);n.rot=[20,15,30];n.mirror=[-1,1,1];n.pos=[15,-8,22];const bytes=exportStep([n]);assert.match(new TextDecoder().decode(bytes),/CYLINDRICAL_SURFACE/);const again=importStep(bytes);assert.ok(Math.abs(again.volume-Math.PI*100*20*1.5**3)<.02);const f=finishNode(n,{kind:'round',amount:.5,edges:[cadEdges(n).find(e=>e.length>50).anchor]});assert.ok(validNode(f));assert.ok(volume(f)<volume(n));
 n.size[0]*=1.3;const stretched=importStep(exportStep([n]));assert.ok(Math.abs(volume(makeNode('import',null,stretched))-volume(n))<.5);
 const inches=importStep(analyticStep(shape,'INCH'));assert.ok(Math.abs(inches.size[0]-20)<.02);assert.ok(Math.abs(inches.volume-2000*Math.PI)<.02);
 }finally{shape.delete();maker.delete();}
});
test('Closed internal cavities and disconnected shells retain their voids in STEP and finishing',()=>{
 const body=makeNode('box'),hole=makeNode('box',[0,0,10],{size:[8,8,8],solid:false}),g=groupNodes([body,hole]),v=volume(g);assert.ok(Math.abs(v-7488)<.001);
 const data=importStep(exportStep([g]));assert.equal(data.solids,1);assert.ok(Math.abs(data.volume-v)<.01);assert.ok(Math.abs(volume(makeNode('import',null,data))-v)<.01);
 const r=finishNode(g,{kind:'chamfer',amount:.4,edges:[cadEdges(g)[0].anchor]});assert.ok(volume(r)<v);assert.ok(volume(r)>7400);
 const split=groupNodes([makeNode('box'),makeNode('box',[50,0,10])]),separate=importStep(exportStep([split]));assert.equal(separate.solids,2);assert.ok(Math.abs(separate.volume-16000)<.01);
});

test('Stacked edge operations survive source resize, wrapper transform and removal',()=>{
 const source=makeNode('box'),first=finishNode(source,{kind:'chamfer',amount:1,edges:[cadEdges(source)[0].anchor]}),before=volume(first),edges=cadEdges(first);let second;
 for(const edge of edges){try{second=finishNode(first,{kind:'round',amount:.3,edges:[edge.anchor]});if(volume(second)<before)break;}catch{}}
 assert.ok(second);assert.equal(second.edgeFinish.steps.length,2);second.rot=[30,10,25];second.mirror=[-1,1,1];second.size=second.size.map((v,i)=>v*[1.2,.8,1.1][i]);const saved=structuredClone(second);second.children[0].size[0]=22;synchronizeHistory([second]);assert.ok(validNode(second));assert.ok(volume(second)>volume(saved));const removed=finishNode(saved,{remove:true});assert.equal(removed.edgeFinish.steps.length,1);assert.ok(Math.abs(volume(removed)-before*1.2*.8*1.1)<.05);assert.equal(removed.children[0].id,source.id);
});
