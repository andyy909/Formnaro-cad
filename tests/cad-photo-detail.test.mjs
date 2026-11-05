import test from 'node:test';
import assert from 'node:assert/strict';
import {photoDetailRegion,renderPhotoDetail} from '../src/cad-photo-detail.js';

test('measurement crop stays inside the source and maps both axes independently',()=>{
 const points=[[1169,172],[1169,428]],view=photoDetailRegion(1280,605,points);
 assert(view.extent[0]<200);
 assert(view.extent[1]<400);
 assert.deepEqual(view.imagePixels,view.extent);
 const edge=photoDetailRegion(4051,2003,[[0,0],[4051,2003]]);
 assert.deepEqual(edge.origin,[0,0]);
 assert.equal(Math.max(...edge.imagePixels),1280);
 for(let i=0;i<2;i++)assert(Math.abs(edge.imagePixels[i]*edge.originalPixelsPerImagePixel[i]-edge.originalPixels[i])<1e-9);
 assert.throws(()=>photoDetailRegion(100,100,[[-1,10]]),/Bildpunkte/);
});

test('the returned image draws the original region and marks its original points',()=>{
 const draws=[],arcs=[],ctx={
  drawImage:(...args)=>draws.push(args),beginPath(){},arc:(...args)=>arcs.push(args),stroke(){},
  measureText:()=>({width:25}),strokeText(){},fillText(){}
 };
 const image={naturalWidth:1280,naturalHeight:605},doc={createElement:()=>({getContext:()=>ctx,toDataURL:()=>'data:image/jpeg;base64,YQ=='})};
 const detail=renderPhotoDetail(doc,image,[[[1169,172],[1169,428]]]);
 assert.equal(detail.image,'YQ==');
 assert.deepEqual(draws[0].slice(0,5),[image,...detail.mapping.origin,...detail.mapping.extent]);
 assert.deepEqual(detail.marks.map(m=>m.label),['1.1','1.2']);
 assert.deepEqual(arcs.map(([u,v])=>[u+detail.mapping.origin[0],v+detail.mapping.origin[1]]),[[1169,172],[1169,428]]);
});
