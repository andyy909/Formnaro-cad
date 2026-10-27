import test from 'node:test';import assert from 'node:assert/strict';
import {createCadWorkerClient} from '../src/cad-worker-client.js';
function fixture(){const workers=[],client=createCadWorkerClient({createWorker:()=>{const worker={sent:[],postMessage(message){this.sent.push(message);},terminate(){this.terminated=true;}};workers.push(worker);return worker;}});return {client,workers};}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function request(worker,extra={}){const compute=worker.sent.find(m=>m.type==='compute'),message={id:compute.id,generation:compute.generation,revision:compute.revision,type:'hostRequest',callId:1,request:{target:'allowed'},...extra};worker.onmessage({data:message});return message;}

test('A worker host task is tied to the current job, revision and generation and returns before the normal result',async()=>{
 const {client,workers}=fixture(),seen=[];try{const p=client.run({job:'command'},{revision:'current',host:async(value,{signal})=>{seen.push({value,signal});return {checked:true};}}),w=workers[0];request(w,{revision:'old'});request(w,{generation:999});assert.equal(seen.length,0);const m=request(w);await tick();assert.equal(seen.length,1);assert.equal(seen[0].signal.aborted,false);assert.equal(w.sent.find(m=>m.type==='hostReply').value.checked,true);w.onmessage({data:{...m,type:'result',result:{ok:true}}});assert.deepEqual(await p,{ok:true});assert.equal(seen[0].signal.aborted,true);}finally{client.dispose();}
});

test('Cancellation aborts an active native host task, ignores its late reply and starts a fresh worker generation',async()=>{
 const {client,workers}=fixture();let finish,signal;try{const p=client.run({job:'command'},{revision:'current',host:async(_value,options)=>{signal=options.signal;return new Promise(resolve=>{finish=resolve;});}});request(workers[0]);await tick();client.cancel();await assert.rejects(p,e=>e.name==='AbortError');assert(signal.aborted);finish({late:true});await tick();assert.equal(workers[0].sent.some(m=>m.type==='hostReply'),false);const fresh=client.run({job:'query'},{revision:'new'}),w=workers[1],m=w.sent.find(m=>m.type==='compute');w.onmessage({data:{...m,type:'result',result:42}});assert.equal(await fresh,42);}finally{client.dispose();}
});

test('No callback is exposed to ordinary jobs and repeated host-call identities stop the worker',async()=>{
 const {client,workers}=fixture();try{const p=client.run({job:'query'},{revision:'current'}),w=workers[0],m=request(w);await tick();const denied=w.sent.find(m=>m.type==='hostReply');assert.equal(denied.ok,false);assert.equal(denied.code,'CAD_HOST_UNAVAILABLE');request(w);await assert.rejects(p,{code:'CAD_HOST_REQUEST'});assert.equal(w.terminated,true);}finally{client.dispose();}
});
