import test from 'node:test';
import assert from 'node:assert/strict';
import OCModule from 'replicad-opencascadejs';
import {buildCadScrewPiece} from '../src/cad-screw-surfaces.js';
import {cadNativeCapabilities,cadBounds,cadVolume,validateCadSolid,cadBoolean,writeCadBrep,readCadBrep,brepHasNoTriangulation,transformCad,cadRayHits,cadDisplayMesh} from '../src/cad-native-kernel.js';

const oc=await OCModule({print:()=>{},printErr:()=>{}});
const near=(actual,expected,tolerance=1e-7)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
function cylinder(radius=10,height=20){const maker=new oc.BRepPrimAPI_MakeCylinder(radius,height);try{return maker.Shape();}finally{maker.delete();}}
function enumNumber(value){if(typeof value==='string'){assert.ok(Object.values(oc.GeomAbs_SurfaceType).includes(value),'OCCT enum must be a known surface type');return value;}const number=typeof value==='number'?value:value?.value;assert.ok(Number.isInteger(number),'OCCT enum must resolve to an actual integer');return number;}
function surfaces(shape){const types=[],ex=new oc.TopExp_Explorer(shape,oc.TopAbs_ShapeEnum.TopAbs_FACE);try{while(ex.More()){const raw=ex.Current(),face=oc.TopoDS.Face(raw),surface=new oc.BRepAdaptor_Surface(face);try{types.push(enumNumber(surface.GetType()));}finally{surface.delete();face.delete();raw.delete();}ex.Next();}return types;}finally{ex.delete();}}

test('native cylinder and CAD bore retain analytic surfaces and exact volume without constructing a mesh',()=>{
  const body=cylinder(),hole=cylinder(3),result=cadBoolean(oc,'difference',body,hole);
  try{const stats=validateCadSolid(oc,result);assert.equal(stats.solids,1);near(stats.volume,Math.PI*(100-9)*20);const types=surfaces(result);assert.ok(types.filter(t=>t===enumNumber(oc.GeomAbs_SurfaceType.GeomAbs_Cylinder)).length>=2);assert.ok(types.every(t=>[enumNumber(oc.GeomAbs_SurfaceType.GeomAbs_Cylinder),enumNumber(oc.GeomAbs_SurfaceType.GeomAbs_Plane)].includes(t)));assert.ok(brepHasNoTriangulation(oc.BRepToolsWrapper.Write(result)));}
  finally{result.delete();hole.delete();body.delete();}
});

test('native adaptive volume integrates a closed B-spline screw body against its analytic profile moment',()=>{
  const shape=buildCadScrewPiece(oc,[[3,-.3],[4,0],[3,.3]],{pitch:2,starts:3,hand:'left'});
  try{assert.equal(validateCadSolid(oc,shape).solids,1);near(cadVolume(oc,shape),2*Math.PI,1e-4);const loaded=readCadBrep(oc,writeCadBrep(oc,shape));try{near(cadVolume(oc,loaded),cadVolume(oc,shape),1e-8);}finally{loaded.delete();}}
  finally{shape.delete();}
});

test('native CAD bounds and volume are independent of coarse and fine display meshes',()=>{
  const shape=cylinder();try{
    const before=cadBounds(oc,shape),volume=cadVolume(oc,shape);assert.deepEqual(before,{min:[-10,-10,0],max:[10,10,20],size:[20,20,20],center:[0,0,10]});
    const coarse=cadDisplayMesh(oc,shape,{deflection:1,angleDegrees:45});assert.deepEqual(cadBounds(oc,shape),before);near(cadVolume(oc,shape),volume);
    const fine=cadDisplayMesh(oc,shape,{deflection:.002,angleDegrees:2});assert.ok(fine.triangles.length>coarse.triangles.length);assert.deepEqual(cadBounds(oc,shape),before);near(cadVolume(oc,shape),volume);
  }finally{shape.delete();}
});

test('CAD display triangles include native normals and complete face occurrence groups',()=>{
  const shape=cylinder();try{
    const mesh=cadDisplayMesh(oc,shape);assert.equal(mesh.vertices.length,mesh.normals.length);assert.equal(mesh.faceGroups.length,9);
    let total=0;for(let i=0;i<mesh.faceGroups.length;i+=3){assert.equal(mesh.faceGroups[i],total);assert.ok(mesh.faceGroups[i+1]>0);assert.ok(mesh.faceGroups[i+2]>0);total+=mesh.faceGroups[i+1];}assert.equal(total,mesh.triangles.length);
    for(let i=0;i<mesh.normals.length;i+=3)near(Math.hypot(...mesh.normals.slice(i,i+3)),1,1e-6);
  }finally{shape.delete();}
});

test('display face indices and geometry survive independent BRep loads without preserving memory hashes',()=>{
  const shape=cylinder(),brep=writeCadBrep(oc,shape),first=readCadBrep(oc,brep),second=readCadBrep(oc,brep);
  try{const a=cadDisplayMesh(oc,first),b=cadDisplayMesh(oc,second);assert.deepEqual(a,b);assert.deepEqual(a.faceGroups.filter((_,i)=>i%3===2),[1,2,3]);assert.deepEqual(cadBounds(oc,first),cadBounds(oc,second));near(cadVolume(oc,first),cadVolume(oc,second));}
  finally{second.delete();first.delete();shape.delete();}
});

test('triangulation-free CAD serialization round-trips and does not remove original display cache',()=>{
  const shape=cylinder();let loaded;try{
    const transient=oc.ReplicadMeshExtractor.extract(shape,.02,8*Math.PI/180,false);transient.delete();const original=oc.BRepToolsWrapper.Write(shape);assert.equal(brepHasNoTriangulation(original),false);
    const brep=writeCadBrep(oc,shape);assert.ok(brepHasNoTriangulation(brep));assert.ok(brep.length<original.length);assert.equal(oc.BRepToolsWrapper.Write(shape),original);
    loaded=readCadBrep(oc,brep);near(cadVolume(oc,loaded),2000*Math.PI);assert.deepEqual(cadBounds(oc,loaded),cadBounds(oc,shape));assert.ok(surfaces(loaded).includes(enumNumber(oc.GeomAbs_SurfaceType.GeomAbs_Cylinder)));assert.ok(brepHasNoTriangulation(oc.BRepToolsWrapper.Write(loaded)));
    assert.throws(()=>readCadBrep(oc,original),/triangulierungsfrei/);
  }finally{loaded?.delete();shape.delete();}
});

test('native similarity transform retains analytic geometry with mirror and exact determinant volume',()=>{
  const shape=cylinder(),matrix=[0,-1.5,0,0,-1.5,0,0,0,0,0,1.5,0,4,-6,8,1];let result;
  try{result=transformCad(oc,shape,matrix);near(cadVolume(oc,result),2000*Math.PI*1.5**3);assert.deepEqual(cadBounds(oc,result),{min:[-11,-21,8],max:[19,9,38],size:[30,30,30],center:[4,-6,23]});assert.ok(surfaces(result).includes(enumNumber(oc.GeomAbs_SurfaceType.GeomAbs_Cylinder)));}
  finally{result?.delete();shape.delete();}
});

test('missing general-affine and ray interfaces reject required operations without a mesh fallback',()=>{
  const shape=cylinder(),caps=cadNativeCapabilities(oc);try{
    assert.equal(caps.exactBounds,true);assert.equal(caps.copyAndCleanWriteNoTriangles,true);assert.equal(caps.generalAffine,false);assert.equal(caps.rayHits,false);assert.equal(caps.directWriteNoTriangles,false);
    for(const matrix of [[2,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],[1,0,0,0,.3,1,0,0,0,0,1,0,0,0,0,1]])assert.throws(()=>transformCad(oc,shape,matrix),/GTransform/);
    assert.throws(()=>cadRayHits(oc,shape,{origin:[30,0,10],direction:[-1,0,0]}),/IntCurvesFace/);near(cadVolume(oc,shape),2000*Math.PI);assert.ok(brepHasNoTriangulation(oc.BRepToolsWrapper.Write(shape)));
  }finally{shape.delete();}
});

test('installed BRepTools write-without-triangles overload exposes a concrete missing enum binding',()=>{
  const shape=cylinder(),progress=new oc.Message_ProgressRange();try{assert.throws(()=>oc.BRepTools.Write(shape,'/formnaro-proof.brep',false,false,3,progress),/unbound types:.*TopTools_FormatVersion/);}
  finally{progress.delete();shape.delete();}
});

test('valid compound with a solid and an unrelated open face is rejected as a production CAD body',()=>{
  const body=cylinder(),other=cylinder(2),explorer=new oc.TopExp_Explorer(other,oc.TopAbs_ShapeEnum.TopAbs_FACE),face=explorer.Current(),compound=new oc.TopoDS_Compound(),builder=new oc.TopoDS_Builder();
  try{builder.MakeCompound(compound);builder.Add(compound,body);builder.Add(compound,face);const analyzer=new oc.BRepCheck_Analyzer(compound);try{assert.equal(analyzer.IsValid(),true);}finally{analyzer.delete();}assert.throws(()=>validateCadSolid(oc,compound),/offene oder unzugeordnete/);}
  finally{builder.delete();compound.delete();face.delete();explorer.delete();other.delete();body.delete();}
});

test('display buffer budget rejects oversized native output before reading WASM buffers and releases it',()=>{
  let released=false,copyReleased=false;const raw={getVerticesSize:()=>3000003,getNormalsSize:()=>3000003,getTrianglesSize:()=>3,getFaceGroupsSize:()=>3,delete:()=>{released=true;}},copy={delete:()=>{copyReleased=true;}},fake={FormnaroCadBridge:{WriteNoTriangles:()=> 'Triangulations 0\nPolygon3D 0\nPolygonOnTriangulations 0'},BRepToolsWrapper:{Read:()=>copy},ReplicadMeshExtractor:{extract:shape=>{assert.equal(shape,copy);return raw;}}};
  assert.throws(()=>cadDisplayMesh(fake,{}),/Projektgrenze/);assert.equal(released,true);assert.equal(copyReleased,true);
});

test('similarity transform keeps analytic surfaces even when the general-affine bridge is available',()=>{
  const extended=Object.create(oc);let bridgeCalled=false;extended.FormnaroCadBridge={Transform:()=>{bridgeCalled=true;throw Error('Wrong transform path');}};
  const shape=cylinder(),matrix=[1.5,0,0,0,0,1.5,0,0,0,0,1.5,0,0,0,0,1],result=transformCad(extended,shape,matrix);
  try{assert.equal(bridgeCalled,false);assert.ok(surfaces(result).includes(enumNumber(oc.GeomAbs_SurfaceType.GeomAbs_Cylinder)));near(cadVolume(oc,result),2000*Math.PI*1.5**3);}
  finally{result.delete();shape.delete();}
});

test('tiny anisotropic matrices cannot masquerade as uniform scales through an absolute epsilon floor',()=>{
  const shape=cylinder();try{assert.throws(()=>transformCad(oc,shape,[1e-8,0,0,0,0,2e-8,0,0,0,0,1e-8,0,0,0,0,1]),/GTransform/);}
  finally{shape.delete();}
});
