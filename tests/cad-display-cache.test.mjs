import test from 'node:test';
import assert from 'node:assert/strict';
import {cadDisplaySnapshot,isCadDisplaySnapshot,createCadDisplayEncoder,createCadDisplayDecoder} from '../src/cad-display-cache.js';
import {createCadWorkerClient} from '../src/cad-worker-client.js';
const mesh=()=>({vertices:[0,0,0,1,0,0,0,1,0],normals:[0,0,1,0,0,1,0,0,1],triangles:[0,1,2],faceGroups:[0,3,1]});
test('display snapshots capture and validate values once, retain every number and reject mutation',()=>{
 const original=mesh(),before=structuredClone(original),snapshot=cadDisplaySnapshot(original);assert.deepEqual(snapshot,before);assert(isCadDisplaySnapshot(snapshot));assert(!isCadDisplaySnapshot(original));assert.equal(cadDisplaySnapshot(snapshot),snapshot);assert.throws(()=>snapshot.vertices[0]=42,TypeError);original.vertices[0]=7;assert.equal(snapshot.vertices[0],0);
 const getters=mesh();Object.defineProperty(getters.vertices,'0',{get:()=>Math.random()});const captured=cadDisplaySnapshot(getters),x=captured.vertices[0];assert.equal(captured.vertices[0],x);assert.throws(()=>cadDisplaySnapshot({...mesh(),normals:[]}));assert.throws(()=>cadDisplaySnapshot({...mesh(),triangles:[0,1,9]}));assert.throws(()=>cadDisplaySnapshot({...mesh(),faceGroups:[0,6,1]}));assert.throws(()=>cadDisplaySnapshot({...mesh(),vertices:[0,0,0,Infinity,0,0,0,1,0]}));
});
test('opaque mesh tokens reuse only the same native mesh identity; legacy full responses stay independent',()=>{
 const encode=createCadDisplayEncoder(),data=mesh(),full=encode(data,new Set());assert(full.meshToken);assert.deepEqual(full.mesh,data);full.mesh.vertices[0]=7;assert.equal(data.vertices[0],0);assert.deepEqual(encode(data,new Set([full.meshToken])),{meshToken:full.meshToken});assert.notEqual(encode(mesh(),new Set()).meshToken,full.meshToken);assert.deepEqual(Object.keys(encode(data,null)),['mesh']);
});
test('decoder bounds storage, strips tokens, and pins in-flight references across LRU eviction',()=>{
 const decode=createCadDisplayDecoder({maxEntries:1,maxBytes:1024}),full=token=>[{id:'part',kind:'cad',meshToken:token,mesh:mesh()}];
 const first=decode.decode(full('cad-mesh-1'))[0],sent=decode.capture();assert(!('meshToken'in first));assert(isCadDisplaySnapshot(first.mesh));decode.decode(full('cad-mesh-2'));assert.deepEqual([...decode.capture().keys()],['cad-mesh-2']);const restored=decode.decode([{id:'part',kind:'cad',meshToken:'cad-mesh-1'}],sent)[0];assert.equal(restored.mesh,first.mesh);assert(decode.state().entries<=1);assert(decode.state().bytes<=1024);assert.throws(()=>decode.decode([{kind:'cad',meshToken:'cad-mesh-99'}]),/nicht mehr/);assert.throws(()=>decode.decode([{kind:'cad',meshToken:'file-path'}]));decode.clear();assert.equal(decode.state().entries,0);assert.equal(decode.state().bytes,0);
 const small=createCadDisplayDecoder({maxBytes:1});small.decode(full('cad-mesh-1'));assert.equal(small.state().entries,0);assert.equal(small.capture().size,0);
});
test('worker generations clear every display token and ignore stale replies, without changing mutable project results',async()=>{
 const workers=[],client=createCadWorkerClient({createWorker:()=>{const w={messages:[],postMessage(data){this.messages.push(data);},terminate(){},send(request,result){this.onmessage({data:{...request,type:'result',result}});}};workers.push(w);return w;}});
 const a=client.run({job:'display'},{revision:'a'}),w=workers[0],request=w.messages.at(-1);assert.deepEqual(request.request.knownMeshes,[]);w.send(request,[{id:'body',kind:'cad',meshToken:'cad-mesh-1',mesh:mesh()}]);const result=await a;
 const b=client.run({job:'display'},{revision:'a'}),next=w.messages.at(-1);assert.deepEqual(next.request.knownMeshes,['cad-mesh-1']);w.send(next,[{id:'body',kind:'cad',meshToken:'cad-mesh-1'}]);assert.equal((await b)[0].mesh,result[0].mesh);
 client.cancel();const c=client.run({job:'display'},{revision:'a'}),fresh=workers[1],third=fresh.messages.at(-1);assert.deepEqual(third.request.knownMeshes,[]);const changed=mesh();changed.vertices[0]=3;fresh.send(third,[{kind:'cad',meshToken:'cad-mesh-1',mesh:changed}]);assert.equal((await c)[0].mesh.vertices[0],3);
 const d=client.run({job:'rebuild'},{revision:'a'}),r=fresh.messages.at(-1);fresh.send(r,{project:{name:'Mutable copy'}});const p=await d;p.project.name='Edited';assert.equal(p.project.name,'Edited');client.dispose();
});

test('one display response sends identical buffers once and resolves repeated instances even without persistent storage',()=>{
 const encode=createCadDisplayEncoder(),known=new Set(),data=mesh();
 const records=[{id:'a',kind:'cad',transform:[1],...encode(data,known)},{id:'b',kind:'cad',transform:[2],...encode(data,known)},{id:'c',kind:'cad',...encode(mesh(),known)},{id:'d',kind:'cad',...encode(data,known)}];
 assert.equal(records.filter(r=>r.mesh).length,2);assert.equal(records[0].meshToken,records[1].meshToken);assert(!records[1].mesh&&!records[3].mesh);
 const decode=createCadDisplayDecoder({maxEntries:1,maxBytes:1}),result=decode.decode(records);
 assert.equal(result[0].mesh,result[1].mesh);assert.equal(result[0].mesh,result[3].mesh);assert.notEqual(result[0].mesh,result[2].mesh);assert.deepEqual(result[1].transform,[2]);assert.deepEqual(result[0].mesh,data);
 assert.equal(decode.capture().size,0);assert.equal(decode.state().bytes,0);assert.throws(()=>decode.decode([{kind:'cad',meshToken:records[0].meshToken}]),/nicht mehr/);
 const next=encode(data,new Set());assert.deepEqual(next.mesh,data,'new unconfirmed response needs a fresh payload');
});
