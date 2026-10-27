import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCadKernel} from '../src/cad-kernel-loader.js';
import {buildCadRecipe,buildCadContours,buildCadGear,gearContour,cadRecipeBounds,cadRecipeVolume,CAD_RECIPE_STATUS,constructionTolerance,heartContour,involuteContour} from '../src/cad-recipes.js';
import {defaults} from '../src/parameters.js';

const oc=await loadCadKernel({print:()=>{},printErr:()=>{}});
function enumValue(value){const result=['number','string'].includes(typeof value)?value:value?.value;assert.ok(Number.isInteger(result)||(typeof result==='string'&&result.startsWith('GeomAbs_')),'Native enumeration must have a defined type value');return result;}
function recipe(type,size,params={}){return {type,size,params:{...defaults(type),...params}};}
function close(a,b,epsilon=1e-6){assert.ok(Math.abs(a-b)<=epsilon,`${a} versus ${b}`);}
function withShape(input,fn){const shape=buildCadRecipe(oc,input);try{fn(shape);}finally{shape.delete();}}
function surfaceTypes(shape){
  const ex=new oc.TopExp_Explorer(shape,oc.TopAbs_ShapeEnum.TopAbs_FACE),types=[];
  try{while(ex.More()){const raw=ex.Current(),face=oc.TopoDS.Face(raw),adaptor=new oc.BRepAdaptor_Surface(face,true);try{types.push(enumValue(adaptor.GetType()));}finally{adaptor.delete();face.delete();raw.delete();}ex.Next();}return types;}finally{ex.delete();}
}
test('CAD recipe catalog covers 23 native names with controlled screw generators and no mesh fallback',()=>{
  assert.equal(Object.keys(CAD_RECIPE_STATUS).length,23);
  for(const type of ['thread','nut'])assert.equal(CAD_RECIPE_STATUS[type],'bounded-screw-surface');
  assert.equal(CAD_RECIPE_STATUS.gear,'bounded-bezier-and-screw');
  assert.throws(()=>buildCadRecipe(oc,recipe('thread',[8,8,16],{pitch:20})),/überlappende|tiefe/);
  assert.throws(()=>buildCadRecipe(oc,recipe('nut',[15,13,6],{outerDiameter:8})),/Material/);
  assert.throws(()=>buildCadRecipe(oc,{...recipe('box',[20,20,20]),mesh:{verts:[],triangles:[]}}),/Mesh/);
});
test('Native box, cylinder, sphere, cone, torus and hemisphere retain analytical surfaces and exact volumes',()=>{
  const cases=[
    [recipe('box',[20,12,8]),1920,oc.GeomAbs_SurfaceType.GeomAbs_Plane],
    [recipe('cylinder',[20,20,8]),Math.PI*100*8,oc.GeomAbs_SurfaceType.GeomAbs_Cylinder],
    [recipe('sphere',[20,20,20]),4/3*Math.PI*1000,oc.GeomAbs_SurfaceType.GeomAbs_Sphere],
    [recipe('cone',[20,20,12],{topDiameter:4}),Math.PI*12/3*(100+20+4),oc.GeomAbs_SurfaceType.GeomAbs_Cone],
    [recipe('torus',[25,25,8]),2*Math.PI**2*8.5*16,oc.GeomAbs_SurfaceType.GeomAbs_Torus],
    [recipe('halfSphere',[20,20,10]),2/3*Math.PI*1000,oc.GeomAbs_SurfaceType.GeomAbs_Sphere]
  ];
  for(const [input,volume,type] of cases)withShape(input,shape=>{
    close(cadRecipeVolume(oc,shape),volume,1e-5);
    assert.ok(surfaceTypes(shape).includes(enumValue(type)),input.type);
    cadRecipeBounds(oc,shape).size.forEach((v,k)=>close(v,input.size[k],1e-5));
  });
});
test('Circular construction is unchanged by old display segment and rounding-step fields',()=>{
  let expected;
  for(const segments of [12,64,512])withShape({...recipe('cylinder',[20,20,10]),segments},shape=>{
    const actual={volume:cadRecipeVolume(oc,shape),bounds:cadRecipeBounds(oc,shape),surfaces:surfaceTypes(shape)};
    if(expected)assert.deepEqual(actual,expected);else expected=actual;
  });
  assert.throws(()=>buildCadRecipe(oc,recipe('sphere',[20,12,8])),/allgemeine CAD-Transformation/);
});
test('Planar native outlines, roof, wedge and pyramid are valid CAD solids with expected dimensions',()=>{
  for(const type of ['hexagon','triangle','polygon','star','roof','wedge','pyramid'])withShape(recipe(type,[20,12,8]),shape=>{
    cadRecipeBounds(oc,shape).size.forEach((v,k)=>close(v,[20,12,8][k],1e-5));
    assert.ok(surfaceTypes(shape).every(v=>v===enumValue(oc.GeomAbs_SurfaceType.GeomAbs_Plane)),type);
    if(type==='pyramid')close(cadRecipeVolume(oc,shape),20*12*8/3);
    if(type==='roof'||type==='wedge')close(cadRecipeVolume(oc,shape),20*12*8/2);
  });
});
test('Rounded contours, capsule, tube, housing and countersink use arcs, surfaces and CAD cuts',()=>{
  withShape(recipe('roundbox',[20,12,8],{edgeSize:2}),shape=>{close(cadRecipeVolume(oc,shape),(20*12-4*(4-Math.PI))*8);assert.ok(surfaceTypes(shape).includes(enumValue(oc.GeomAbs_SurfaceType.GeomAbs_Cylinder)));});
  withShape(recipe('capsule',[30,10,6]),shape=>close(cadRecipeVolume(oc,shape),((30-10)*10+Math.PI*25)*6));
  withShape(recipe('tube',[20,20,8],{wall:2}),shape=>close(cadRecipeVolume(oc,shape),Math.PI*(100-64)*8));
  withShape(recipe('shellbox',[30,20,10],{radius:2,wall:2,floor:2}),shape=>close(cadRecipeVolume(oc,shape),(30*20-4*(4-Math.PI))*10-26*16*8));
  const params={bore:4,sinkDiameter:8,angle:90,length:10};
  withShape(recipe('countersink',[8,8,10],params),shape=>close(cadRecipeVolume(oc,shape),Math.PI*4*8+Math.PI*2/3*(4+8+16)));
});
test('Native fillets/chamfers operate on CAD edges and reject invalid construction',()=>{
  for(const edgeStyle of ['round','chamfer'])withShape(recipe('box',[20,12,8],{edgeStyle,edgeSize:1}),shape=>assert.ok(cadRecipeVolume(oc,shape)<1920));
  for(const edgeStyle of ['round','chamfer'])withShape(recipe('cylinder',[20,20,8],{edgeStyle,edgeSize:1,edgeScope:'top'}),shape=>assert.ok(cadRecipeVolume(oc,shape)<Math.PI*100*8));
  assert.throws(()=>buildCadRecipe(oc,recipe('roundbox',[20,12,8],{edgeSize:7})),/Eckradius/);
});
function bezier(points,t){const p=points.map(v=>[...v]);for(let n=p.length-1;n>0;n--)for(let i=0;i<n;i++)for(let k=0;k<2;k++)p[i][k]=p[i][k]*(1-t)+p[i+1][k]*t;return p[0];}
test('Heart and involute use analytic Hermite error bounds independent of display tessellation',()=>{
  const heart=heartContour([25,25]);assert.ok(heart.interpolationBound<=heart.tolerance/2);assert.ok(heart.segments.length>16);
  close(heart.fourthBounds[0],336*25/32);
  const inv=involuteContour(13,0,1.2,constructionTolerance(.1));assert.ok(inv.interpolationBound<=5e-5);
  let max=0;
  for(const segment of inv.segments)for(let i=0;i<=100;i++){
    const u=i/100,t=segment.interval[0]+u*(segment.interval[1]-segment.interval[0]),actual=[13*(Math.cos(t)+t*Math.sin(t)),13*(Math.sin(t)-t*Math.cos(t))],approx=bezier(segment.points,u);
    max=Math.max(max,Math.hypot(...actual.map((v,k)=>v-approx[k])));
  }
  assert.ok(max<=inv.interpolationBound*(1+1e-8));
  assert.throws(()=>constructionTolerance(1e-6),/zu klein/);
  withShape(recipe('heart',[25,25,5]),shape=>{assert.ok(cadRecipeVolume(oc,shape)>1500);const size=cadRecipeBounds(oc,shape).size;close(size[0],25,1e-4);close(size[1],25,1e-4);close(size[2],5);});
});
test('Original line, quadratic/cubic Bézier and ellipse contours extrude directly, retaining holes',()=>{
  const rectangle=[{kind:'line',start:[-10,-10],end:[10,-10]},{kind:'line',start:[10,-10],end:[10,10]},{kind:'line',start:[10,10],end:[-10,10]},{kind:'line',start:[-10,10],end:[-10,-10]}];
  const hole=[{kind:'ellipse',center:[0,0],rx:3,ry:5}];
  const shape=buildCadContours(oc,{height:4,contours:[{outer:rectangle,holes:[hole]}]});
  try{close(cadRecipeVolume(oc,shape),(400-Math.PI*15)*4,1e-5);assert.ok(surfaceTypes(shape).length>4);}finally{shape.delete();}
  for(const points of [[[0,0],[5,10],[10,0]],[[0,0],[0,10],[10,10],[10,0]]]){
    const part=buildCadContours(oc,{height:2,contours:[{outer:[{kind:'bezier',points},{kind:'line',start:[10,0],end:[0,0]}]}]});
    try{assert.ok(cadRecipeVolume(oc,part)>0);assert.equal(surfaceTypes(part).length,4);}finally{part.delete();}
  }
  assert.throws(()=>buildCadRecipe(oc,recipe('text',[40,14,4])),/Schriftkonturen/);
});

test('Straight gear creates bounded involute flanks and exact circular tips/roots with bore, hub and key',()=>{
  const params={...defaults('gear'),hubDiameter:12,hubHeight:2,keyWidth:1.5,keyDepth:.5},outline=gearContour(params);
  assert.ok(outline.interpolationBound<=outline.tolerance/2);
  assert.equal(outline.segments.filter(s=>s.kind==='arc').length,2*params.teeth);
  assert.ok(outline.segments.some(s=>s.kind==='bezier'));
  const shape=buildCadGear(oc,params);
  try{assert.ok(cadRecipeVolume(oc,shape)>3000);const bounds=cadRecipeBounds(oc,shape);close(bounds.size[2],8,1e-6);assert.ok(bounds.size[0]<=33.0001&&bounds.size[0]>32.9);assert.ok(surfaceTypes(shape).includes(enumValue(oc.GeomAbs_SurfaceType.GeomAbs_Cylinder)));}finally{shape.delete();}
  assert.throws(()=>buildCadGear(oc,{...params,helixAngle:45,thickness:200}),/volle Windung/);
});
