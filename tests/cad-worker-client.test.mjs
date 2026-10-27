import test from 'node:test';
import assert from 'node:assert/strict';
import {createCadWorkerClient,createCadCache} from '../src/cad-worker-client.js';
function fixture(){const workers=[];const client=createCadWorkerClient({confirmed:()=>({name:'Bestätigt'}),createWorker:()=>{const worker={messages:[],stopped:false,postMessage(data){this.messages.push(data);},terminate(){this.stopped=true;},send(data){this.onmessage?.({data});}};workers.push(worker);return worker;}});return {workers,client};}
const response=(worker,result)=>{const request=worker.messages.at(-1);return {...request,type:'result',result};};

test('Explicit trim keeps small workers, defers busy large workers, then releases capacity',async()=>{
 const {workers,client}=fixture();assert.equal(client.trim(),false);
 const one=client.run({job:'command'},{revision:'a'}),old=workers[0];old.send({...response(old,1),heapBytes:600*1024*1024});assert.equal(await one,1);assert.equal(old.stopped,false);
 const two=client.run({job:'query'},{revision:'a'});assert.equal(client.trim(),true);assert.equal(old.stopped,false);old.send(response(old,2));assert.equal(await two,2);assert.equal(old.stopped,true);assert.equal(client.state().heapBytes,0);client.dispose();
});

test('Large CAD worker retires only after all queued replies, preserving results and next confirmed initialization',async()=>{
 const {workers,client}=fixture(),first=client.run({job:'command'},{revision:'a'}),second=client.run({job:'query'},{revision:'a'}),old=workers[0],one=old.messages[1],two=old.messages[2];
 old.send({...one,type:'result',result:'imported',recycleWorker:true});assert.equal(await first,'imported');assert.equal(old.stopped,false);
 old.send({...two,type:'result',result:'queried'});assert.equal(await second,'queried');assert.equal(old.stopped,true);assert.equal(client.state().running,0);
 const next=client.run({job:'display'},{revision:'b'});assert.deepEqual(workers[1].messages[0].confirmed,{name:'Bestätigt'});workers[1].send(response(workers[1],42));assert.equal(await next,42);client.dispose();
});

test('A failed large import can release its worker without changing error semantics',async()=>{
 const {workers,client}=fixture(),request=client.run({job:'command'},{revision:'a'});workers[0].send({...workers[0].messages[1],type:'error',code:'STL_LIMIT',message:'limit',recycleWorker:true});
 await assert.rejects(request,{code:'STL_LIMIT'});assert.equal(workers[0].stopped,true);assert.equal(client.state().loaded,false);client.dispose();
});

test('Fatal native trap terminates a poisoned kernel and subsequent work restarts from confirmed state',async()=>{
 const {workers,client}=fixture(),a=client.run({job:'command'},{revision:'a'}),b=client.run({job:'query'},{revision:'a'}),first=workers[0],request=first.messages[1];
 first.send({...request,type:'error',code:'CAD_KERNEL_FATAL',message:'Native trap'});await assert.rejects(a,{code:'CAD_KERNEL_FATAL'});await assert.rejects(b,{code:'CAD_KERNEL_FATAL'});assert.equal(first.stopped,true);assert.equal(client.state().running,0);
 const next=client.run({job:'query'},{revision:'a'});assert.deepEqual(workers[1].messages[0].confirmed,{name:'Bestätigt'});workers[1].send(response(workers[1],'Recovered'));assert.equal(await next,'Recovered');client.dispose();
});

test('CAD worker remains loaded across computations and ignores foreign revision responses',async()=>{
  const {workers,client}=fixture();const a=client.run({job:'build'},{revision:'a'}),worker=workers[0];assert.equal(worker.messages[0].type,'initialize');assert.deepEqual(worker.messages[0].confirmed,{name:'Bestätigt'});
  worker.send({...response(worker,'wrong'),revision:'foreign'});assert.equal(client.state().running,1);worker.send(response(worker,'A'));assert.equal(await a,'A');
  const b=client.run({job:'build'},{revision:'b'});assert.equal(workers.length,1);worker.send(response(worker,'B'));assert.equal(await b,'B');client.dispose();assert.equal(worker.stopped,true);
});

test('CAD abort terminates immediately and discards replies from a previous worker generation',async()=>{
  const {workers,client}=fixture(),controller=new AbortController();const a=client.run({job:'build'},{revision:'a',signal:controller.signal}),old=workers[0],savedHandler=old.onmessage,late=response(old,'Late');
  controller.abort();assert.equal(old.stopped,true);await assert.rejects(a,{name:'AbortError'});assert.equal(client.state().running,0);
  const b=client.run({job:'build'},{revision:'a'}),current=workers[1];savedHandler({data:late});assert.equal(client.state().running,1);assert.equal(current.messages[0].confirmed.name,'Bestätigt');current.send(response(current,'New'));assert.equal(await b,'New');client.dispose();
});

test('CAD worker crash releases pending requests and allows a clean restart from the confirmed model',async()=>{
  const {workers,client}=fixture(),a=client.run({}, {revision:'a'}),b=client.run({}, {revision:'a'});workers[0].onerror({message:'Kernel failed'});
  await assert.rejects(a,/Kernel failed/);await assert.rejects(b,/Kernel failed/);assert.equal(workers[0].stopped,true);
  const next=client.run({}, {revision:'a'});workers[1].send(response(workers[1],42));assert.equal(await next,42);client.dispose();await assert.rejects(client.run({}, {revision:'a'}),{name:'AbortError'});
});

test('CAD LRU keeps explicit entry/byte bounds during repeated editing and deletes handles once',()=>{
  const deleted=[],cache=createCadCache({maxEntries:3,maxBytes:10,dispose:value=>deleted.push(value)});
  cache.set('A',0,3);cache.set('B',1,3);cache.set('C',2,3);assert.equal(cache.get('A'),0);cache.set('D',3,3);assert.equal(cache.get('B'),undefined);assert.deepEqual(deleted,[1]);
  assert.equal(cache.set('A',999,11),false);assert.equal(cache.get('A'),0);
  for(let i=4;i<1004;i++){cache.set('edit',i,2);assert.ok(cache.state().entries<=3);assert.ok(cache.state().bytes<=10);}
  cache.clear();assert.equal(cache.state().bytes,0);assert.equal(new Set(deleted).size,deleted.length);assert.equal(deleted.length,1004);
});
