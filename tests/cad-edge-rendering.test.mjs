import test from 'node:test';import assert from 'node:assert/strict';import {cadEdgeRenderBuffers} from '../src/cad-edge-rendering.js';
test('Separate native edges remain disconnected; selected segments retain their own display batch',()=>{
 const values=[{points:[[0,0,0],[1,2,3],[4,5,6]]},{points:[[10,0,0],[20,0,0]],selected:true}],before=structuredClone(values),buffers=cadEdgeRenderBuffers(values);assert.deepEqual(Array.from(buffers.regular),[0,0,0,1,2,3,1,2,3,4,5,6]);assert.deepEqual(Array.from(buffers.selected),[10,0,0,20,0,0]);assert.deepEqual(values,before);
});
test('Tens of thousands of edges use two bounded buffers rather than thousands of render objects',()=>{
 const values=Array.from({length:60000},(_,i)=>({points:[[i,0,0],[i,1,0]],selected:i<128})),buffers=cadEdgeRenderBuffers(values);assert.equal(buffers.regular.length,(60000-128)*6);assert.equal(buffers.selected.length,128*6);assert.equal(buffers.regular.byteLength+buffers.selected.byteLength,1440000);assert.deepEqual(cadEdgeRenderBuffers([]),{regular:new Float32Array(),selected:new Float32Array()});assert.throws(()=>cadEdgeRenderBuffers([{points:[[0,0,0],[NaN,0,0]]}]),/Koordinaten/);
});
