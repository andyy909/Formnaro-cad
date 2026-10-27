import test from 'node:test';import assert from 'node:assert/strict';
import {photoPlane,projectPhotoPoint,measurePerspectivePhoto} from '../src/cad-photo-perspective.js';
import {validatePhotoReference,measurePhoto,photoEvidence} from '../src/cad-photo-data.js';
import {rectifyPhotoPixels} from '../src/cad-photo-rectify.js';
import {suggestPhotoContour} from '../src/cad-photo-contours.js';
import {perspectiveReference,pixelPlate} from './expansion-fixtures.mjs';
const close=(a,b,e=1e-7)=>assert(Math.abs(a-b)<e,a+' != '+b);
test('A projective rectangle maps corners and interior points in both directions',()=>{
 const r=perspectiveReference(),p=photoPlane(r.perspective,r.width,r.height);
 for(const mm of [[0,0],[40,0],[40,30],[0,30],[13.5,22],[35,10]]){const original=projectPhotoPoint(p.toOriginal,mm),back=projectPhotoPoint(p.toPlane,original);back.forEach((n,i)=>close(n,mm[i]));}
 const points=[[5,8],[35,8]].map(q=>projectPhotoPoint(p.toOriginal,q));r.dimensions=[{name:'Quermaß',source:'measured',points}];r.outline=[[2,2],[38,2],[38,28],[2,28]].map(q=>projectPhotoPoint(p.toOriginal,q));
 const before=JSON.stringify(r),e=photoEvidence(r);close(e.dimensions[0].mm,30);assert(e.dimensions[0].uncertaintyMm>0);assert.deepEqual(e.dimensions[0].points,points);assert.equal(JSON.stringify(r),before);
 // A uniform first-edge pixel scale would report a different interior length.
 assert(Math.abs(Math.hypot(...points[0].map((n,i)=>n-points[1][i]))*40/Math.hypot(440,40)-30)>.5);
});
test('Crossed, concave, mirrored, collinear, tiny, shallow and incomplete references fail',()=>{
 const base=perspectiveReference();
 for(const points of [[[0,0],[400,0],[0,300],[400,300]],[[0,0],[400,0],[150,100],[0,300]],[[0,0],[0,300],[400,300],[400,0]],[[0,0],[100,0],[200,0],[300,0]],[[0,0],[10,0],[10,10],[0,10]],[[0,0],[400,0],[400,5],[0,5]],[[0,0],[400,0]]]){
  assert.throws(()=>photoPlane({...base.perspective,points},600,400));
 }
 for(const change of [c=>c.sizeMm=[0,20],c=>c.sizeMm=[NaN,20],c=>c.pickErrorPx=0,c=>c.note='',c=>c.source='assumed',c=>c.hostPath='C:/secret']){const c=structuredClone(base.perspective);change(c);assert.throws(()=>photoPlane(c,600,400));}
});
test('Schema refuses a two-point disguised perspective and measurements outside calibrated plane',()=>{
 const r=perspectiveReference();assert.deepEqual(validatePhotoReference(r),r);assert.throws(()=>validatePhotoReference({...r,version:1}));assert.throws(()=>validatePhotoReference({...r,perspective:{...r.perspective,points:r.scale.points}}));assert.throws(()=>validatePhotoReference({...r,scale:{...r.scale,mm:60}}));
 assert.throws(()=>measurePhoto(r,[[1,1],[20,20]]));assert.throws(()=>validatePhotoReference({...r,outline:[[0,0],[500,0],[500,300]]}));
 const p=photoPlane(r.perspective,r.width,r.height),points=[[10,10],[30,10]].map(q=>projectPhotoPoint(p.toOriginal,q)),a=measurePerspectivePhoto(r,points),b=measurePerspectivePhoto({...r,perspective:{...r.perspective,pickErrorPx:2}},points);
 close(a.mm,20);assert(b.uncertaintyMm>a.uncertaintyMm);
});
test('Identity rectification preserves pixels; tilted rectification is bounded and traceable',()=>{
 const input=pixelPlate(80,60),c={kind:'rectangle',points:[[0,0],[80,0],[80,60],[0,60]],sizeMm:[80,60],pickErrorPx:.25,referenceErrorMm:0,source:'user',note:'Known plane'},before=Buffer.from(input.data);
 const identity=rectifyPhotoPixels(input,c,{maxSide:80});assert.deepEqual(identity.data,input.data);assert.deepEqual(Buffer.from(input.data),before);
 const r=perspectiveReference(),tilt=rectifyPhotoPixels(pixelPlate(),r.perspective,{maxSide:320});assert.equal(tilt.width,320);assert.equal(tilt.height,240);assert(tilt.data.every((n,i)=>i%4!==3||n===255));assert.deepEqual(tilt.mmPerPixel,[.125,.125]);assert.throws(()=>rectifyPhotoPixels(input,c,{maxSide:5000}));
});
test('Local edge proposal is unconfirmed and leaves inputs intact; low-contrast evidence fails',()=>{
 const input=pixelPlate(160,120),before=Buffer.from(input.data),suggestion=suggestPhotoContour(input);assert.equal(suggestion.confirmed,false);assert(suggestion.points.length>=4);assert(suggestion.points.length<=256);assert.deepEqual(Buffer.from(input.data),before);assert(suggestion.warnings[0].includes('Öffnungen'));
 const blank={...input,data:new Uint8ClampedArray(input.data.length).fill(255)};assert.throws(()=>suggestPhotoContour(blank),/Keine zusammenhängende/);assert.throws(()=>suggestPhotoContour({...input,width:1e9}));assert.throws(()=>suggestPhotoContour(input,{threshold:0}));
});
