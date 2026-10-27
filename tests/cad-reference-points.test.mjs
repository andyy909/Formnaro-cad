import test from 'node:test';
import assert from 'node:assert/strict';
import {Matrix4} from 'three';
import load from '../cad-kernel-build/runtime/formnaro_cad.js';
import {createCadService} from '../src/cad-service.js';
import {cadReferencePointsNative,resolveCadReferenceNative} from '../src/cad-reference-points.js';
import {createCadProject} from '../src/cad-project.js';
const oc=await load({print:()=>{},printErr:()=>{}}),close=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<=e,`${a} vs ${b}`);
test('Native box vertices, straight edge middles and plane centroids use full affine world coordinates',()=>{
 const service=createCadService({oc});try{const transform=[-1.2,.1,0,0,.3,1.4,0,0,.1,.2,.8,0,3,-4,5,1],body=service.nativeNode({type:'box',size:[20,12,8]},{id:'box',transform}),before=JSON.stringify(body),data=cadReferencePointsNative(oc,body),vertices=data.points.filter(p=>p.kind==='vertex'),edges=data.points.filter(p=>p.kind==='edge-midpoint'),faces=data.points.filter(p=>p.kind==='face-centroid');assert.equal(vertices.length,8);assert.equal(edges.length,12);assert.equal(faces.length,6);for(const p of data.points)for(let k=0;k<3;k++)close(p.point[k],transform[k]*p.localPoint[0]+transform[k+4]*p.localPoint[1]+transform[k+8]*p.localPoint[2]+transform[k+12]);assert.equal(JSON.stringify(body),before);for(const p of faces){close(Math.hypot(...p.normal),1);assert.ok(p.area>0);assert.deepEqual(resolveCadReferenceNative(oc,body,{token:p.id,faceIndex:p.faceIndex}),p);}assert.throws(()=>resolveCadReferenceNative(oc,body,{token:'vertex:999'}),e=>e.code==='STALE_CAD_REFERENCE');
 }finally{service.dispose();}
});
test('Only complete native circles with an isometric world plane become circle centers; ellipses are excluded',()=>{
 const service=createCadService({oc});try{for(const [x,y,count]of [[1,1,2],[2,2,2],[2,1,0],[-1,1,2]]){const transform=new Matrix4().makeScale(x,y,.5).toArray(),body=service.nativeNode({type:'cylinder',size:[20,20,10]},{id:'cylinder',transform}),circles=cadReferencePointsNative(oc,body).points.filter(p=>p.kind==='circle-center');assert.equal(circles.length,count);for(const p of circles){close(p.radius,Math.abs(x)*10);assert.ok(p.faceIndex);close(p.normal[2],p.localPoint[2]>0?1:-1);}}}finally{service.dispose();}
});
test('Native Boolean semicircle boundaries never advertise full-circle centers',async()=>{
 const service=createCadService({oc});try{const cylinder=service.nativeNode({type:'cylinder',size:[20,20,10]},{id:'c'}),cut=service.nativeNode({type:'box',size:[20,30,20]},{id:'cut',solid:false,transform:new Matrix4().makeTranslation(10,0,0).toArray()}),root={id:'result',kind:'cad',source:'group',name:'Semicircle',solid:true,operation:'union',children:[cylinder,cut],transform:new Matrix4().toArray(),brep:cylinder.brep,stats:cylinder.stats},p=await service.rebuild(createCadProject({nodes:[root]}));assert.equal(cadReferencePointsNative(oc,p.nodes[0]).points.filter(p=>p.kind==='circle-center').length,0);}finally{service.dispose();}
});
test('Free face references are native trimmed hits with stable coordinates and orientation under shear',()=>{
 const service=createCadService({oc});try{const transform=[1,0,0,0,.3,1.5,0,0,.2,.1,1,0,5,-6,10,1],body=service.nativeNode({type:'box',size:[20,12,8]},{id:'box',transform}),p=resolveCadReferenceNative(oc,body,{ray:{origin:[5,-6,100],direction:[0,0,-1],far:200}});assert.equal(p.kind,'face-point');close(p.point[2],14);close(Math.hypot(...p.normal),1);assert.ok(p.faceIndex>0);assert.throws(()=>resolveCadReferenceNative(oc,body,{ray:{origin:[0,0,100],direction:[0,0,-1]},faceIndex:'1'}),e=>e.code==='INVALID_CAD_REFERENCE');}finally{service.dispose();}
});
