import test from 'node:test';
import assert from 'node:assert/strict';
import loader from '../cad-kernel-build/runtime/formnaro_cad.js';
import {cadModelingNative,cadProfileModelingNative,validateCadModelingOperation} from '../src/cad-modeling-native.js';
import {cadBounds,cadVolume,cadRayHits,validateCadSolid,writeCadBrep,readCadBrep,cadBoolean,transformCad} from '../src/cad-native-kernel.js';
import {defaultCadSketch} from '../src/cad-sketch.js';
import {cadIdentity,cadPoint,inverseCadMatrix} from '../src/cad-affine.js';
const oc=await loader({print:()=>{},printErr:()=>{}}),near=(a,b,tol=1e-6)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`);
const box=()=>{const maker=new oc.BRepPrimAPI_MakeBox(20,30,40);try{return maker.Shape();}finally{maker.delete();}};
const top=shape=>cadRayHits(oc,shape,{origin:[10,15,100],direction:[0,0,-1]})[0].faceIndex;
function profile(kind='rectangle',{width=20,depth=10,diameter=10,z=0,x=0}={}){const sketch=defaultCadSketch(kind);sketch.dimensions={width:String(width),depth:String(depth),diameter:String(diameter),height:'1'};const frame=cadIdentity();frame[12]=x;frame[14]=z;return {sketch,frame};}
function reopened(shape){const data=writeCadBrep(oc,shape),copy=readCadBrep(oc,data);try{near(cadVolume(oc,copy),cadVolume(oc,shape),1e-5);assert.equal(validateCadSolid(oc,copy).solids,1);const a=cadBounds(oc,copy),b=cadBounds(oc,shape);for(const key of ['min','max','size','center'])for(let i=0;i<3;i++)near(a[key][i],b[key][i],1e-9);}finally{copy.delete();}}

test('modeling recipes are strict, bounded and kernel-free data',()=>{
  assert.deepEqual(validateCadModelingOperation({version:1,kind:'shell',faceIndices:[2],thickness:2}),{kind:'shell',faceIndices:[2],thickness:2});
  for(const invalid of [{kind:'face-offset',faceIndex:0,offset:2},{kind:'face-offset',faceIndex:1,offset:0},{kind:'shell',faceIndices:[1,1],thickness:2},{kind:'shell',faceIndices:[],thickness:2},{kind:'sweep',path:{kind:'arc',radius:20,angle:360}},{kind:'loft',script:'x'},{kind:'loft',version:2}])assert.throws(()=>validateCadModelingOperation(invalid));
});
test('planar face extends and retracts natively with exact changed volume and intact source',()=>{
  const source=box(),before=writeCadBrep(oc,source);try{for(const offset of [5,-5]){const result=cadModelingNative(oc,source,{kind:'face-offset',faceIndex:top(source),offset});try{near(cadVolume(oc,result),20*30*(40+offset));near(cadBounds(oc,result).max[2],40+offset);assert.equal(validateCadSolid(oc,result).solids,1);reopened(result);assert.equal(writeCadBrep(oc,source),before);}finally{result.delete();}}}finally{source.delete();}
});
test('face retraction beyond material and sphere target reject without changing source',()=>{
  const source=box(),maker=new oc.BRepPrimAPI_MakeSphere(10),sphere=maker.Shape(),before=writeCadBrep(oc,source);maker.delete();try{assert.throws(()=>cadModelingNative(oc,source,{kind:'face-offset',faceIndex:top(source),offset:-50}));const side=cadRayHits(oc,sphere,{origin:[30,0,0],direction:[-1,0,0]})[0].faceIndex;assert.throws(()=>cadModelingNative(oc,sphere,{kind:'face-offset',faceIndex:side,offset:2}),/ebene/);assert.equal(writeCadBrep(oc,source),before);}finally{sphere.delete();source.delete();}
});
test('complete cylindrical STEP-style surfaces enlarge outside or enlarge/reduce a bore exactly',()=>{
  const outerMaker=new oc.BRepPrimAPI_MakeCylinder(10,20),outer=outerMaker.Shape(),innerMaker=new oc.BRepPrimAPI_MakeCylinder(3,20),inner=innerMaker.Shape(),bored=cadBoolean(oc,'difference',outer,inner),before=writeCadBrep(oc,bored);outerMaker.delete();innerMaker.delete();
  try{const exterior=cadRayHits(oc,outer,{origin:[30,0,10],direction:[-1,0,0]})[0].faceIndex,result=cadModelingNative(oc,outer,{kind:'face-offset',faceIndex:exterior,offset:2});try{near(cadVolume(oc,result),Math.PI*144*20);reopened(result);}finally{result.delete();}
    const bore=cadRayHits(oc,bored,{origin:[0,0,10],direction:[1,0,0]})[0].faceIndex;
    for(const offset of [-1,1]){const changed=cadModelingNative(oc,bored,{kind:'face-offset',faceIndex:bore,offset});try{near(cadVolume(oc,changed),Math.PI*(100-(3-offset)**2)*20);reopened(changed);assert.equal(writeCadBrep(oc,bored),before);}finally{changed.delete();}}
    assert.throws(()=>cadModelingNative(oc,bored,{kind:'face-offset',faceIndex:bore,offset:4}),/radius/i);
  }finally{bored.delete();inner.delete();outer.delete();}
});
test('inward shell preserves outside bounds and source and creates known wall volume',()=>{
  const source=box(),before=writeCadBrep(oc,source),result=cadModelingNative(oc,source,{kind:'shell',faceIndices:[top(source)],thickness:2});try{near(cadVolume(oc,result),20*30*40-16*26*38);assert.deepEqual(cadBounds(oc,result),cadBounds(oc,source));reopened(result);assert.equal(writeCadBrep(oc,source),before);}finally{result.delete();source.delete();}
});
test('loft connects stored rectangle and circle profiles at their native placements',()=>{
  const profiles=[profile('rectangle',{width:20,depth:20}),profile('circle',{diameter:10,z:30})],before=structuredClone(profiles),result=cadProfileModelingNative(oc,{kind:'loft',profiles});try{const bounds=cadBounds(oc,result);near(bounds.min[2],0,1e-5);near(bounds.max[2],30,1e-5);assert.ok(cadVolume(oc,result)>0);assert.equal(validateCadSolid(oc,result).solids,1);reopened(result);assert.deepEqual(profiles,before);}finally{result.delete();}
});
test('equal rectangle loft has exact prism volume; coincident profiles and draft neighbour offset reject',()=>{
  const result=cadProfileModelingNative(oc,{kind:'loft',profiles:[profile(),profile('rectangle',{z:20})]});try{near(cadVolume(oc,result),20*10*20);reopened(result);}finally{result.delete();}
  assert.throws(()=>cadProfileModelingNative(oc,{kind:'loft',profiles:[profile(),profile()]}),/verschiedene/);
  const taper=cadProfileModelingNative(oc,{kind:'loft',profiles:[profile('rectangle',{width:20,depth:20}),profile('rectangle',{width:10,depth:10,z:20})]});try{const face=cadRayHits(oc,taper,{origin:[0,0,50],direction:[0,0,-1]})[0].faceIndex;assert.throws(()=>cadModelingNative(oc,taper,{kind:'face-offset',faceIndex:face,offset:2}),/Übergänge|Nachbarn/);}finally{taper.delete();}
});
test('straight sweep retains analytic cylinder volume and profile world placement',()=>{
  const result=cadProfileModelingNative(oc,{kind:'sweep',profile:profile('circle',{diameter:8,x:17,z:4}),path:{kind:'line',length:30}});try{near(cadVolume(oc,result),Math.PI*16*30);near(cadBounds(oc,result).center[0],17);near(cadBounds(oc,result).min[2],4);reopened(result);}finally{result.delete();}
});
test('arc sweep builds a real curved pipe with known volume and rejects too-small bends',()=>{
  const result=cadProfileModelingNative(oc,{kind:'sweep',profile:profile('circle',{diameter:8}),path:{kind:'arc',radius:30,angle:90}});try{near(cadVolume(oc,result),Math.PI*16*30*Math.PI/2,1e-3);assert.equal(validateCadSolid(oc,result).solids,1);reopened(result);}finally{result.delete();}
  assert.throws(()=>cadProfileModelingNative(oc,{kind:'sweep',profile:profile('circle',{diameter:8}),path:{kind:'arc',radius:3,angle:90}}),/Biegeradius/);
});
test('sweep preserves full affine profile placement, including mirror and shear',()=>{
  const p=profile('circle',{diameter:8}),frame=[-2,0,0,0,.2,1,0,0,0,.3,1,0,5,8,2,1];p.frame=frame;const result=cadProfileModelingNative(oc,{kind:'sweep',profile:p,path:{kind:'line',length:20}});try{near(cadVolume(oc,result),Math.PI*16*20*2,1e-3);reopened(result);}finally{result.delete();}
});
test('shell supports two opening faces and rejects missing opening and disconnected input',()=>{
  const source=box(),bottom=cadRayHits(oc,source,{origin:[10,15,-10],direction:[0,0,1]})[0].faceIndex,result=cadModelingNative(oc,source,{kind:'shell',faceIndices:[top(source),bottom],thickness:2});try{near(cadVolume(oc,result),20*30*40-16*26*40);reopened(result);assert.throws(()=>cadModelingNative(oc,source,{kind:'shell',faceIndices:[1000],thickness:2}),/Öffnungsfläche/);}finally{result.delete();source.delete();}
  const a=box(),frame=cadIdentity();frame[12]=100;const b=transformCad(oc,a,frame),compound=cadBoolean(oc,'union',a,b);try{assert.throws(()=>cadModelingNative(oc,compound,{kind:'shell',faceIndices:[1],thickness:2}),/einzelner/);}finally{compound.delete();b.delete();a.delete();}
});
test('planar normal offset follows native outward normals after mirror, rotation and uniform scale',()=>{
  const matrices=[[-1,0,0,0,0,1,0,0,0,0,1,0,25,0,0,1],[-1,0,0,0,0,0,1,0,0,-1,0,0,25,50,0,1],[-2,0,0,0,0,0,2,0,0,-2,0,0,50,100,8,1]];
  for(const frame of matrices){const original=box(),shape=transformCad(oc,original,frame),before=writeCadBrep(oc,shape),inverse=inverseCadMatrix(frame),direction=[inverse[2],inverse[6],inverse[10]],norm=Math.hypot(...direction),normal=direction.map(value=>value/norm),point=cadPoint(frame,[10,15,40]),ray={origin:point.map((value,i)=>value+normal[i]*30),direction:normal.map(value=>-value)},hit=cadRayHits(oc,shape,ray)[0];
    try{assert.ok(hit);assert.ok(hit.normal.every((value,i)=>Math.abs(value-normal[i])<1e-7));const result=cadModelingNative(oc,shape,{kind:'face-offset',faceIndex:hit.faceIndex,offset:2});try{const x=frame.slice(0,3),y=frame.slice(4,7),cross=[x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]];near(cadVolume(oc,result)-cadVolume(oc,shape),20*30*Math.hypot(...cross)*2,1e-4);assert.equal(writeCadBrep(oc,shape),before);reopened(result);}finally{result.delete();}}finally{shape.delete();original.delete();}
  }
});
test('nonuniformly transformed BSpline planes reject honestly and preserve full input geometry',()=>{
  const original=box(),frame=[-2,0,0,0,0,1.5,0,0,0,0,.75,0,50,-5,8,1],shape=transformCad(oc,original,frame),before=writeCadBrep(oc,shape),point=cadPoint(frame,[10,15,40]),hit=cadRayHits(oc,shape,{origin:point.map((value,i)=>value+(i===2?30:0)),direction:[0,0,-1]})[0];try{assert.throws(()=>cadModelingNative(oc,shape,{kind:'face-offset',faceIndex:hit.faceIndex,offset:2}),error=>error.code==='CAD_MODELING_UNSUITABLE'&&/ebene/.test(error.message));assert.equal(writeCadBrep(oc,shape),before);}finally{shape.delete();original.delete();}
});
test('cylindrical radial offset preserves outward material direction after mirror and rotation',()=>{
  const frames=[[-1,0,0,0,0,1,0,0,0,0,1,0,25,0,0,1],[-2,0,0,0,0,0,2,0,0,-2,0,0,25,50,0,1]];
  for(const frame of frames){const outerMaker=new oc.BRepPrimAPI_MakeCylinder(10,20),outer=outerMaker.Shape(),innerMaker=new oc.BRepPrimAPI_MakeCylinder(3,20),inner=innerMaker.Shape(),bored=cadBoolean(oc,'difference',outer,inner),shape=transformCad(oc,bored,frame),before=writeCadBrep(oc,shape),scale=Math.hypot(...frame.slice(0,3)),inverse=inverseCadMatrix(frame),out=[inverse[0],inverse[4],inverse[8]],length=Math.hypot(...out),normal=out.map(value=>value/length);outerMaker.delete();innerMaker.delete();
    try{const point=cadPoint(frame,[10,0,10]),hit=cadRayHits(oc,shape,{origin:point.map((value,i)=>value+normal[i]*40),direction:normal.map(value=>-value)})[0],exterior=cadModelingNative(oc,shape,{kind:'face-offset',faceIndex:hit.faceIndex,offset:2});try{near(cadVolume(oc,exterior)-cadVolume(oc,shape),Math.PI*((10*scale+2)**2-(10*scale)**2)*20*scale,1e-4);reopened(exterior);}finally{exterior.delete();}
      const boreHit=cadRayHits(oc,shape,{origin:cadPoint(frame,[0,0,10]),direction:normal})[0],largerBore=cadModelingNative(oc,shape,{kind:'face-offset',faceIndex:boreHit.faceIndex,offset:-1});try{near(cadVolume(oc,shape)-cadVolume(oc,largerBore),Math.PI*((3*scale+1)**2-(3*scale)**2)*20*scale,1e-4);reopened(largerBore);}finally{largerBore.delete();}assert.equal(writeCadBrep(oc,shape),before);
    }finally{shape.delete();bored.delete();inner.delete();outer.delete();}
  }
});
