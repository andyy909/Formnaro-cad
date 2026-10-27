import test from 'node:test';import assert from 'node:assert/strict';
import {dispatchFreeCAD} from '../src/cad-freecad-dispatch.js';
const tick=()=>new Promise(r=>setImmediate(r));
test('Cancelled FreeCAD work rejects promptly but a following request waits for the actual native reply and cleanup',async()=>{
 const seen=[];let finish;const desktop={runFreeCADReply:async request=>{seen.push(request.id);if(request.id===1)return new Promise(resolve=>finish=resolve);return {id:request.id};}},abort=new AbortController(),first=dispatchFreeCAD(desktop,{id:1},{signal:abort.signal});await tick();abort.abort();await assert.rejects(first,e=>e.name==='AbortError');const second=dispatchFreeCAD(desktop,{id:2});await tick();assert.deepEqual(seen,[1]);finish({id:1});assert.deepEqual(await second,{id:2});assert.deepEqual(seen,[1,2]);
});
test('A queued cancelled request never starts and does not block the next valid request',async()=>{
 const seen=[];let finish;const desktop={runFreeCADReply:async request=>{seen.push(request.id);if(request.id===1)return new Promise(resolve=>finish=resolve);return {id:request.id};}},first=dispatchFreeCAD(desktop,{id:1}),abort=new AbortController(),cancelled=dispatchFreeCAD(desktop,{id:2},{signal:abort.signal});abort.abort();await assert.rejects(cancelled,e=>e.name==='AbortError');const third=dispatchFreeCAD(desktop,{id:3});await tick();finish({id:1});await first;assert.deepEqual(await third,{id:3});assert.deepEqual(seen,[1,3]);
});
