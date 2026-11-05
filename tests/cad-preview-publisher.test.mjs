import test from 'node:test';import assert from 'node:assert/strict';
import {createCadPreviewPublisher} from '../src/cad-preview-publisher.js';
test('rapid frames coalesce and finish waits for the last actual display',async()=>{
 const seen=[];let release;const publisher=createCadPreviewPublisher(async value=>{seen.push(value);if(value===1)await new Promise(resolve=>{release=resolve;});});
 publisher.push(1);await Promise.resolve();publisher.push(2);publisher.push(3);const finished=publisher.finish();release();await finished;assert.deepEqual(seen,[1,3]);publisher.push(4);await Promise.resolve();assert.deepEqual(seen,[1,3]);
});
test('cancel drops queued display frames and finishes its existing frame',async()=>{
 const seen=[];const publisher=createCadPreviewPublisher(value=>seen.push(value));publisher.push(1);publisher.push(2);await publisher.finish(true);assert.deepEqual(seen,[1]);
});
