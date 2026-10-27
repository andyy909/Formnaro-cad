import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {createCadWorkerClient} from '../src/cad-worker-client.js';
import {createCadProject,cadProjectRevision} from '../src/cad-project.js';
import {createCadTransactions} from '../src/cad-transactions.js';
function fixture(){let count=0,project=createCadProject();const client=createCadWorkerClient({confirmed:()=>project,createWorker:()=>{count++;const native=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),adapter={onmessage:null,onerror:null,postMessage:data=>native.postMessage(data),terminate:()=>native.terminate()};native.on('message',data=>adapter.onmessage?.({data}));native.on('error',error=>adapter.onerror?.(error));return adapter;}});return {client,count:()=>count,get:()=>project,set:value=>project=value};}

test('Real CAD display transport reuses immutable buffers but quality, BRep and new worker generations remain fresh',async()=>{
 const f=fixture();try{
  const built=await f.client.run({job:'create',project:f.get(),recipe:{type:'cylinder',size:[20,20,20]},options:{id:'body',name:'Zylinder'}},{revision:cadProjectRevision(f.get())});f.set(built.project);
  const display=()=>f.client.run({job:'display',project:f.get()},{revision:cadProjectRevision(f.get())}),first=await display(),second=await display();assert.equal(first[0].mesh,second[0].mesh);assert(Object.isFrozen(first[0].mesh.vertices));assert.throws(()=>first[0].mesh.vertices[0]=99,TypeError);
  f.get().nodes[0].transform[12]=31;const moved=await display();assert.equal(moved[0].mesh,first[0].mesh);assert.equal(moved[0].transform[12],31);
  const fine=await f.client.run({job:'display',project:f.get(),quality:{deflection:.005,angleDegrees:3}},{revision:cadProjectRevision(f.get())});assert.notEqual(fine[0].mesh,first[0].mesh);assert(fine[0].mesh.vertices.length>first[0].mesh.vertices.length);
  const draft=structuredClone(f.get());draft.nodes[0].recipe.size=[24,24,20];const edited=await f.client.run({job:'rebuild',project:draft,baseline:f.get()},{revision:cadProjectRevision(f.get())});f.set(edited.project);const changed=await display();assert.notDeepEqual(changed[0].mesh,first[0].mesh);f.client.cancel();const restarted=await display();assert.deepEqual(restarted[0].mesh,changed[0].mesh);assert.notEqual(restarted[0].mesh,changed[0].mesh);assert.equal(f.count(),2);
 }finally{f.client.dispose();}
});

test('Actual persistent CAD worker constructs/rebuilds valid CAD offline and keeps display responses separate',async()=>{
  const f=fixture();try{
    const first=await f.client.run({job:'create',project:f.get(),recipe:{type:'cylinder',size:[20,20,20]},options:{id:'body',name:'CAD-Zylinder'},display:true},{revision:cadProjectRevision(f.get())});f.set(first.project);
    assert.equal(first.project.nodes[0].kind,'cad');assert.equal(first.project.nodes[0].mesh,undefined);assert.ok(first.display[0].mesh.faceGroups.length);assert.equal(f.count(),1);
    await assert.rejects(f.client.run({job:'display',project:f.get()},{revision:'foreign'}),{code:'STALE_REVISION'});
    const display=await f.client.run({job:'display',project:f.get(),quality:{deflection:.3,angleDegrees:20}},{revision:cadProjectRevision(f.get())});assert.ok(display[0].mesh.vertices.length);assert.equal(f.count(),1);
    const step=await f.client.run({job:'exportStep',project:f.get()},{revision:cadProjectRevision(f.get())});assert.ok(step instanceof Uint8Array);assert.match(new TextDecoder().decode(step),/CYLINDRICAL_SURFACE/);
    const unconfirmed=structuredClone(f.get());unconfirmed.nodes[0].name='Draft';await assert.rejects(f.client.run({job:'exportStep',project:unconfirmed,baseline:f.get()},{revision:cadProjectRevision(f.get())}),{code:'UNCONFIRMED_PROJECT'});
    const imported=await f.client.run({job:'importStep',project:f.get(),bytes:step,options:{id:'imported',name:'STEP-Zylinder'}},{revision:cadProjectRevision(f.get())});assert.equal(imported.project.nodes.length,2);assert.equal(imported.project.nodes[1].source,'step');assert.ok(Math.abs(imported.project.nodes[1].stats.volume-f.get().nodes[0].stats.volume)<1e-6);assert.equal(f.get().nodes.length,1);assert.equal(f.count(),1);
    const store=createCadTransactions({initial:f.get(),build:async(project,context)=>(await f.client.run({job:'rebuild',project,baseline:context.baseline},{revision:context.revision,signal:context.signal})).project,abort:()=>f.client.cancel()});
    const draft=store.snapshot();draft.nodes[0].recipe.size=[24,24,20];const preview=await store.preview({revision:store.revision(),project:draft});assert.ok(preview.project.nodes[0].stats.volume>store.snapshot().nodes[0].stats.volume);const committed=store.apply(preview);assert.equal(committed.project.nodes[0].recipe.size[0],24);assert.equal(store.state().undo,1);assert.equal(store.undo().project.nodes[0].recipe.size[0],20);
    await assert.rejects(f.client.run({job:'rebuild',project:f.get()},{revision:'foreign'}),{code:'STALE_REVISION'});assert.equal(f.get().nodes.length,1);
  }finally{f.client.dispose();}
});

test('Terminating a real CAD worker restores an immediately usable client and recreates confirmed state',async()=>{
  const f=fixture();try{
    const controller=new AbortController(),pending=f.client.run({job:'rebuild',project:f.get()},{revision:cadProjectRevision(f.get()),signal:controller.signal}),started=performance.now();controller.abort();
    await assert.rejects(pending,{name:'AbortError'});assert.ok(performance.now()-started<1000);assert.equal(f.client.state().running,0);
    const result=await f.client.run({job:'rebuild',project:f.get()},{revision:cadProjectRevision(f.get())});assert.deepEqual(result.project,f.get());assert.equal(f.count(),2);
  }finally{f.client.dispose();}
});

