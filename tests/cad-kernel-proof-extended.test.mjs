// Explicit release gate for the rebuilt SAME kernel. Run after build.ps1.
// Absence of the artifact fails this gate; it must never become a passing skip.
import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {cadNativeCapabilities,cadBounds,cadVolume,validateCadSolid,transformCad,cadRayHits,writeCadBrep,readCadBrep,cadDisplayMesh,cadExportMesh,cadClassifyPoint,cadBoolean} from '../src/cad-native-kernel.js';

const moduleUrl=process.env.FORMNARO_CAD_MODULE?pathToFileURL(process.env.FORMNARO_CAD_MODULE):new URL('../cad-kernel-build/runtime/formnaro_cad.js',import.meta.url);
let loader;try{loader=(await import(moduleUrl.href)).default;}catch(error){throw Error(`Der erweiterte gemeinsame CAD-Kern fehlt (${fileURLToPath(moduleUrl)}). Zuerst cad-kernel-build/build.ps1 ausführen.`,{cause:error});}
const oc=await loader({print:()=>{},printErr:()=>{}}),near=(actual,expected,tol=1e-7)=>assert.ok(Math.abs(actual-expected)<=tol,`${actual} != ${expected}`);
const cylinder=()=>{const maker=new oc.BRepPrimAPI_MakeCylinder(10,20);try{return maker.Shape();}finally{maker.delete();}};

test('rebuilt common module exposes affine, CAD ray, and direct triangulation-free write interfaces',()=>{
  const caps=cadNativeCapabilities(oc);for(const name of ['exactBounds','generalAffine','rayHits','directWriteNoTriangles','displayFaceMapping','doubleExportMesh'])assert.equal(caps[name],true,name);
});

test('unequal scale, mirror, and shear preserve a valid CAD solid and determinant volume',()=>{
  const shape=cylinder(),matrices=[
    [2,0,0,0,0,.5,0,0,0,0,1.25,0,3,-7,2,1],
    [-2,0,0,0,.4,1,0,0,0,.3,1.25,0,3,-7,2,1],
    [1,.3,0,0,.4,1,0,0,0,.2,1,0,3,-7,2,1]
  ];
  try{for(const matrix of matrices){const result=transformCad(oc,shape,matrix);let loaded;try{
    assert.equal(validateCadSolid(oc,result).solids,1);const det=matrix[0]*(matrix[5]*matrix[10]-matrix[9]*matrix[6])-matrix[4]*(matrix[1]*matrix[10]-matrix[9]*matrix[2])+matrix[8]*(matrix[1]*matrix[6]-matrix[5]*matrix[2]);near(cadVolume(oc,result),Math.PI*2000*Math.abs(det),1e-4);
    const bounds=cadBounds(oc,result);for(let axis=0;axis<3;axis++){const radius=10*Math.hypot(matrix[axis],matrix[axis+4]),height=20*matrix[axis+8],center=matrix[axis+12];near(bounds.min[axis],center+Math.min(0,height)-radius,1e-6);near(bounds.max[axis],center+Math.max(0,height)+radius,1e-6);}
    loaded=readCadBrep(oc,writeCadBrep(oc,result));near(cadVolume(oc,loaded),cadVolume(oc,result),1e-5);const restored=cadBounds(oc,loaded);for(const key of ['min','max','size','center'])for(let axis=0;axis<3;axis++)near(restored[key][axis],bounds[key][axis],1e-10);
  }finally{loaded?.delete();result.delete();}}}
  finally{shape.delete();}
});

test('native ray gives the exact cylinder tangent plane independently of display triangulation',()=>{
  const shape=cylinder(),ray={origin:[30,3,10],direction:[-1,0,0]},x=Math.sqrt(100-9);
  try{const base=cadRayHits(oc,shape,ray);assert.equal(base.length,2);near(base[0].point[0],x);near(base[0].point[1],3);near(base[0].point[2],10);near(base[0].normal[0],x/10);near(base[0].normal[1],.3);near(base[0].normal[2],0);near(base[0].t,30-x);assert.ok(base[0].faceIndex>0);
    cadDisplayMesh(oc,shape,{deflection:1,angleDegrees:45});assert.deepEqual(cadRayHits(oc,shape,ray),base);cadDisplayMesh(oc,shape,{deflection:.002,angleDegrees:2});assert.deepEqual(cadRayHits(oc,shape,ray),base);
    const loaded=readCadBrep(oc,writeCadBrep(oc,shape));try{assert.deepEqual(cadRayHits(oc,loaded,ray),base);assert.ok(cadDisplayMesh(oc,loaded).faceGroups.some((value,index)=>index%3===2&&value===base[0].faceIndex));}finally{loaded.delete();}
  }finally{shape.delete();}
});

test('affine CAD ray normal is transformed by inverse transpose, including a mirror',()=>{
  const shape=cylinder(),result=transformCad(oc,shape,[-2,0,0,0,.5,1,0,0,0,0,1,0,0,0,0,1]);
  try{const hit=cadRayHits(oc,result,{origin:[-30,0,10],direction:[1,0,0]})[0];near(hit.point[0],-20,1e-6);near(hit.point[1],0,1e-6);near(hit.normal[0],-1/Math.sqrt(1.25),1e-6);near(hit.normal[1],.5/Math.sqrt(1.25),1e-6);near(hit.normal[2],0,1e-6);}
  finally{result.delete();shape.delete();}
});

test('export keeps double CAD coordinates at large world translations and its own tolerance',()=>{
  const shape=cylinder(),translation=[10000000.1234,-10000000.5678,10000000.9012],world=transformCad(oc,shape,[1,0,0,0,0,1,0,0,0,0,1,0,...translation,1]);
  try{
    const bounds=cadBounds(oc,world),volume=cadVolume(oc,world),originalBrep=writeCadBrep(oc,world);
    cadDisplayMesh(oc,world,{deflection:1,angleDegrees:45});
    const first=cadExportMesh(oc,world,{deflection:.01,angleDegrees:5});
    for(let i=0;i<first.vertices.length;i+=3){const x=first.vertices[i]-translation[0],y=first.vertices[i+1]-translation[1],z=first.vertices[i+2]-translation[2];near(Math.hypot(x,y),10,1e-7);assert.ok(z>=-1e-7&&z<=20+1e-7);}
    assert.ok(first.vertices.some(v=>Math.abs(Math.fround(v)-v)>.01),'proof must expose float32 rounding beyond export tolerance');
    // Every lateral edge midpoint stays within the explicit chord tolerance.
    for(let g=0;g<first.faceGroups.length;g+=3){if(first.faceGroups[g+2]!==1)continue;for(let i=first.faceGroups[g];i<first.faceGroups[g]+first.faceGroups[g+1];i+=3){for(let a=0;a<3;a++){const b=(a+1)%3,ia=first.triangles[i+a]*3,ib=first.triangles[i+b]*3,x=(first.vertices[ia]+first.vertices[ib])/2-translation[0],y=(first.vertices[ia+1]+first.vertices[ib+1])/2-translation[1];assert.ok(10-Math.hypot(x,y)<=.0100001);}}}
    cadDisplayMesh(oc,world,{deflection:.002,angleDegrees:2});assert.deepEqual(cadExportMesh(oc,world,{deflection:.01,angleDegrees:5}),first);
    assert.deepEqual(cadBounds(oc,world),bounds);assert.equal(writeCadBrep(oc,world),originalBrep);assert.equal(cadVolume(oc,world),volume);assert.deepEqual(first.faceGroups.filter((_,i)=>i%3===2),[1,2,3]);
  }finally{world.delete();shape.delete();}
});

test('native solid classification distinguishes inside, outside, curved boundary and a real bore',()=>{
  const shape=cylinder(),maker=new oc.BRepPrimAPI_MakeCylinder(3,20),hole=maker.Shape(),bored=cadBoolean(oc,'difference',shape,hole);
  try{for(const [point,state] of [[[0,0,10],'inside'],[[11,0,10],'outside'],[[Math.sqrt(91),3,10],'boundary'],[[0,0,20],'boundary']])assert.equal(cadClassifyPoint(oc,shape,point),state);assert.equal(cadClassifyPoint(oc,bored,[0,0,10]),'outside');assert.equal(cadClassifyPoint(oc,bored,[4,0,10]),'inside');assert.equal(cadClassifyPoint(oc,bored,[3,0,10]),'boundary');}
  finally{bored.delete();hole.delete();maker.delete();shape.delete();}
});
