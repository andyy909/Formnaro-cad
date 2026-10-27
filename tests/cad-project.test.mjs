import test from 'node:test';
import assert from 'node:assert/strict';
import {CAD_IDENTITY_MATRIX,CAD_PROJECT_LIMITS,createCadProject,validateCadProject,validateAffineMatrix,cadProjectSnapshot,serializeCadProject,parseCadProject,cadProjectRevision} from '../src/cad-project.js';

const matrix=()=>[...CAD_IDENTITY_MATRIX];
// Deliberately synthetic BRep strings: these tests exercise the data boundary,
// not OCCT geometry validity or the absence of triangulation inside a BRep.
function body(id='body',extra={}){return {id,kind:'cad',name:'Zylinder',solid:true,transform:matrix(),source:'native',recipe:{type:'cylinder',size:[20,20,10],params:{edgeStyle:'none',edgeSize:0}},brep:{format:'OpenCascade-BRep',data:'synthetic-brep-data',triangulation:false},stats:{bounds:{min:[-10,-10,0],max:[10,10,10]},volume:1000,solids:1},...extra};}
function ref(extra={}){return {id:'reference',kind:'referenceMesh',name:'Offene STL-Referenz',transform:matrix(),mesh:{verts:[0,0,0,1,0,0,0,1,0],triangles:[0,1,2]},...extra};}
function project(nodes=[body()]){return createCadProject({name:'Prüfung ä',nodes});}
function topology(rootId='body'){return {kind:'edge',origin:{rootId,path:[]},anchor:{point:[10,0,0],curveType:'circle',samples:[[10,0,0],[0,10,0],[-10,0,0]]}};}

test('CAD project foundation creates only v5 and rejects legacy projects without mutation',()=>{
  assert.equal(createCadProject().version,5);const valid=project();
  for(const version of [undefined,1,2,3,4,6,'5']){const old={...valid,version},before=structuredClone(old);assert.throws(()=>validateCadProject(old));assert.throws(()=>parseCadProject(JSON.stringify(old)));assert.deepEqual(old,before);}
  assert.throws(()=>createCadProject({format:'other'}));
});

test('CAD project boundary retains full affine matrices and validates numerical inverses',()=>{
  const affine=[-2,.3,0,0,1,3,.4,0,0,.2,.5,0,14,-8,50,1],p=project([body('body',{transform:affine})]);
  assert.deepEqual(parseCadProject(serializeCadProject(p)).nodes[0].transform,affine);
  assert.deepEqual(validateAffineMatrix(affine),affine);assert.notEqual(validateAffineMatrix(affine),affine);
  for(const bad of [matrix().slice(1),[...matrix().slice(0,15),0],matrix().map((v,i)=>i===3?.001:v),matrix().map((v,i)=>i===0?0:v),matrix().map((v,i)=>i===12?NaN:v),matrix().map((v,i)=>i===12?Infinity:v),matrix().map((v,i)=>i===0?Number.MIN_VALUE:v)])assert.throws(()=>validateAffineMatrix(bad));
  const small=matrix().map((v,i)=>[0,5,10].includes(i)?1e-100:v);assert.deepEqual(validateAffineMatrix(small),small);
  const dependent=matrix();dependent[4]=dependent[0];dependent[5]=dependent[1];dependent[6]=dependent[2];assert.throws(()=>validateAffineMatrix(dependent));
});

test('CAD project snapshot removes display/worker state from storage, Undo and revision',()=>{
  const confirmed=project(),revision=cadProjectRevision(confirmed),live=structuredClone(confirmed);
  live.view={camera:[1,2,3]};live.displayQuality={linear:.2};live.exportQuality={linear:.01};live.cache=new Map([['shape',{handle:123}]]);
  live.nodes[0].displayMesh={verts:[NaN],triangles:[]};live.nodes[0].renderData=new Float32Array([1,2,3]);live.nodes[0].workerHandles={body:128};
  assert.throws(()=>validateCadProject(live));assert.throws(()=>parseCadProject(JSON.stringify(live)));
  assert.deepEqual(cadProjectSnapshot(live),confirmed);assert.equal(cadProjectRevision(live),revision);assert.equal(serializeCadProject(live),serializeCadProject(confirmed));
  const undo=cadProjectSnapshot(live);undo.nodes[0].recipe.size[0]=99;assert.equal(live.nodes[0].recipe.size[0],20);assert.equal(confirmed.nodes[0].recipe.size[0],20);
  live.nodes[0].unknownCADProperty='must not disappear';assert.throws(()=>cadProjectSnapshot(live),/Unbekanntes Feld/);
});

test('CAD revision is canonical but detects construction, transform and metadata changes',()=>{
  const a=project(),reverse=value=>Array.isArray(value)?value.map(reverse):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).reverse().map(k=>[k,reverse(value[k])])):value;
  assert.equal(cadProjectRevision(a),cadProjectRevision(reverse(a)));assert.equal(serializeCadProject(a),serializeCadProject(reverse(a)));
  for(const change of [p=>p.nodes[0].recipe.size[0]++,p=>p.nodes[0].transform[4]=.4,p=>p.nodes[0].brep.data+='changed',p=>p.nodes[0].color='#ffaa00',p=>p.nodes[0].solid=false,p=>p.nodes[0].metadata={notes:'Neue Quelle'}]){const b=structuredClone(a);change(b);assert.notEqual(cadProjectRevision(a),cadProjectRevision(b));}
  const withZero=structuredClone(a);withZero.nodes[0].transform[12]=-0;assert.equal(cadProjectRevision(a),cadProjectRevision(withZero));
});

test('open reference meshes roundtrip but never become CAD sources or production bodies',()=>{
  const p=project([body(),ref({hidden:false,locked:true,opacity:.3,color:'#777777'})]);assert.deepEqual(parseCadProject(serializeCadProject(p)),p);
  for(const extra of [{solid:true},{solid:false},{recipe:{type:'box'}},{source:'step'},{brep:body().brep},{stats:body().stats},{children:[body('child')]},{finish:{steps:[]}}])assert.throws(()=>project([ref(extra)]),/Referenzmesh/);
  assert.throws(()=>project([body('group',{source:'group',recipe:undefined,operation:'union',children:[ref()]})]));
  assert.throws(()=>project([ref({mesh:{verts:[0,0,0,1,0,0,0,1,0],triangles:[0,1,3]}})]));
  assert.throws(()=>project([ref({mesh:{verts:[NaN,0,0,1,0,0,0,1,0],triangles:[0,1,2]}})]));
  assert.throws(()=>project([body('body',{mesh:ref().mesh})]),/kein Mesh/);
});

test('CAD groups preserve source recipes, physical recipe dimensions and downstream finish',()=>{
  const hole=body('hole',{solid:false,recipe:{type:'cylinder',size:[5,5,20]},transform:matrix().map((v,i)=>i===12?3:v)});
  const group=body('group',{source:'group',recipe:undefined,children:[body(),hole],operation:'union',finish:{steps:[{id:'fillet',kind:'round',amount:1,edges:[topology('body')]}]},multicolor:true});delete group.recipe;
  const p=project([group]),out=parseCadProject(serializeCadProject(p));assert.deepEqual(out,p);assert.equal(out.nodes[0].children[1].solid,false);assert.deepEqual(out.nodes[0].children[0].recipe.size,[20,20,10]);
  const input=structuredClone(p);input.nodes[0].stats.bounds.max=[100,100,100];assert.deepEqual(validateCadProject(input).nodes[0].children[0].recipe.size,[20,20,10]);
  for(const extra of [{stats:{...body().stats,volume:0}},{stats:{...body().stats,volume:-1}},{stats:{...body().stats,volume:NaN}},{stats:{...body().stats,solids:1.5}},{brep:{...body().brep,triangulation:true}}])assert.throws(()=>project([body('body',extra)]));
  for(const extra of [{segments:64},{params:{segments:64}},{params:{edgeSteps:8}},{params:{wall:Infinity}}]){const n=body();Object.assign(n.recipe,extra);assert.throws(()=>project([n]));}
  assert.throws(()=>project([body(),body()]));
  assert.throws(()=>project([body('missing-size',{recipe:{type:'box'}})]),/3 Zahlen/);
});

test('downstream CAD finish has an explicit source wrapper and cannot silently decorate a primitive',()=>{
  const finish={steps:[{id:'rounding',kind:'round',amount:1,edges:[topology('body')]}]};
  assert.throws(()=>project([body('body',{finish})]),/Quellen-Wrapper/);
  const step=body('step',{source:'step',finish});delete step.recipe;assert.throws(()=>project([step]),/Quellen-Wrapper/);
  const wrapper=body('wrapper',{source:'finish',finish,children:[body()]});delete wrapper.recipe;assert.equal(project([wrapper]).nodes[0].children.length,1);
  assert.throws(()=>project([{...wrapper,children:[body(),body('other')]}]),/genau eine/);
  assert.throws(()=>project([{...wrapper,operation:'union'}]),/keine boolesche/);
});

test('CAD original contours preserve lines, Bézier curves, arcs and ellipses without accepting mesh/cache payloads',()=>{
  const outline=[{kind:'line',start:[0,0],end:[1,0]},{kind:'bezier',points:[[1,0],[2,1],[1,2],[0,2]]},{kind:'arc',start:[0,2],through:[-1,1],end:[0,0]}],hole=[{kind:'ellipse',center:[0,1],rx:.2,ry:.1,rotation:.1,startAngle:0,endAngle:2*Math.PI,reversed:true}],n=body('svg',{recipe:{type:'svg',size:[10,10,2],topologyCertified:true,sourceTopology:'original-svg-cad-classified',contours:[{outer:outline,holes:[hole]}]}});
  assert.deepEqual(parseCadProject(serializeCadProject(project([n]))).nodes[0].recipe.contours,n.recipe.contours);
  const invalid=structuredClone(n);invalid.recipe.contours[0].outer[0].displayMesh={};assert.throws(()=>project([invalid]),/Unbekanntes Feld/);
  invalid.recipe.contours[0].outer[0]=outline[0];invalid.recipe.contours[0].holes[0][0].rx=0;assert.throws(()=>project([invalid]),/Ellipsenradien/);
  assert.throws(()=>project([{...n,recipe:{...n.recipe,topologyCertified:false}}]),/klassifizierte/);
  assert.throws(()=>project([{...n,recipe:{...n.recipe,sourceTopology:'provided-shapes-unclassified'}}]));
  assert.throws(()=>project([body('mesh-params',{recipe:{type:'box',size:[1,1,1],params:{mesh:ref().mesh}}})]),/Unbekanntes Feld/);
  assert.throws(()=>project([body('bad-int',{recipe:{type:'polygon',size:[1,1,1],params:{sides:3.5}}})]),/Formparameter/);
});

test('CAD workplane stores provenance and a geometric anchor without asserting topology resolution',()=>{
  const p=project(),face={kind:'face',origin:{rootId:'body',path:[]},anchor:{point:[10,0,5],normal:[1,0,0],tangent:[0,1,0]}};
  p.workplane={origin:[10,0,5],orientation:[0,Math.SQRT1_2,0,Math.SQRT1_2],reference:{objectId:'body',topology:face}};
  assert.deepEqual(parseCadProject(serializeCadProject(p)),validateCadProject(p));
  const invalid=structuredClone(p);invalid.workplane.reference.objectId='reference';invalid.nodes.push(ref());assert.throws(()=>validateCadProject(invalid),/Bezugsobjekt/);
  invalid.workplane.reference.objectId='body';invalid.workplane.reference.topology.kind='edge';assert.throws(()=>validateCadProject(invalid),/CAD-Fläche/);
  invalid.workplane.reference.topology.kind='face';invalid.workplane.reference.topology.anchor.normal=[2,0,0];assert.throws(()=>validateCadProject(invalid),/normiert/);
  invalid.workplane.reference.topology.anchor.normal=[1,0,0];invalid.workplane.reference.topology.origin.rootId='other';assert.throws(()=>validateCadProject(invalid),/Herkunft/);
});

test('CAD project preserves organization and rejects invalid assignments, cycles and unknown fields',()=>{
  const p=project();p.layers.push({id:'parts',name:'Teile',hidden:false,locked:false});p.folders=[{id:'folder',name:'Fertige Teile',layerId:'parts',parentId:null,hidden:false,locked:false}];p.nodes[0].layerId='parts';p.nodes[0].folderId='folder';p.activeLayerId='parts';p.activeFolderId='folder';p.ruler={origin:[3,4,5],mode:'center'};
  assert.deepEqual(parseCadProject(serializeCadProject(p)),validateCadProject(p));
  const bad=structuredClone(p);bad.folders[0].parentId='folder';assert.throws(()=>validateCadProject(bad),/zyklisch/);
  bad.folders[0].parentId=null;bad.nodes[0].layerId='default';assert.throws(()=>validateCadProject(bad),/zuordnung/i);
  assert.throws(()=>validateCadProject({...p,planeZ:5}),/Unbekanntes Feld/);
  assert.throws(()=>parseCadProject('{"format":"OfflineCAD","version":5,"__proto__":{}}'));
  assert.equal(CAD_PROJECT_LIMITS.bytes,50*1024*1024);
});

test('CAD snapshots fail boundedly for cyclic or excessively deep source trees',()=>{
  const cyclic=body('cyclic',{source:'group',operation:'union'});delete cyclic.recipe;cyclic.children=[cyclic];
  assert.throws(()=>cadProjectSnapshot({...createCadProject(),nodes:[cyclic]}),/zyklische/);
  let child=body('deep');for(let depth=0;depth<14;depth++){const parent=body('parent-'+depth,{source:'group',operation:'union',children:[child]});delete parent.recipe;child=parent;}
  assert.throws(()=>cadProjectSnapshot({...createCadProject(),nodes:[child]}),/Gruppenebenen/);
});

test('Exact edge domains persist as CAD anchors with strict bounded no-polygon fields and never decorate a face',()=>{
  const domain={format:'OpenCascade-BRep',triangulation:false,data:'synthetic-edge\nPolygon3D 0\nPolygonOnTriangulations 0\nTriangulations 0\n'},edge=topology('group');edge.anchor.edgeDomain=domain;
  const group=body('group',{source:'group',children:[body()],operation:'union',finish:{steps:[{id:'round',kind:'round',amount:1,edges:[edge]}]}});delete group.recipe;
  const p=project([group]);assert.deepEqual(parseCadProject(serializeCadProject(p)),p);assert.notEqual(cadProjectRevision(p),cadProjectRevision(project([{...group,finish:{steps:[{...group.finish.steps[0],edges:[topology('group')]}]}}])));
  for(const bad of [{...domain,triangulation:true},{...domain,cache:{}},{...domain,data:domain.data.replace('Polygon3D 0','Polygon3D 1')},{...domain,data:domain.data+'Triangulations 0\n'},{...domain,data:domain.data+'x'.repeat(CAD_PROJECT_LIMITS.edgeDomainBytes)}]){const draft=structuredClone(p);draft.nodes[0].finish.steps[0].edges[0].anchor.edgeDomain=bad;assert.throws(()=>validateCadProject(draft));}
  const face=project();face.workplane.reference={objectId:'body',topology:{kind:'face',origin:{rootId:'body',path:[]},anchor:{point:[10,0,0],normal:[1,0,0],edgeDomain:domain}}};assert.throws(()=>validateCadProject(face),/ausschließlich/);
});
