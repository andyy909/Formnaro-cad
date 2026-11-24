const assert=require('node:assert/strict');
const test=require('node:test');
const {mkdtemp,rm}=require('node:fs/promises');
const {join}=require('node:path');
const {tmpdir}=require('node:os');
const {request}=require('node:https');
const {createHash,X509Certificate}=require('node:crypto');
const {createIdentity,startTabletTransfer}=require('../backend/tablet-transfer.cjs');
const {createTabletPeerStore}=require('../backend/tablet-peer-store.cjs');

test('Remembered devices reconnect to the same PC and current project after restart; revocation is individual',async()=>{
  const identity=await createIdentity('127.0.0.1',3650);
  const certificate=new X509Certificate(identity.cert);
  const duration=3650*24*60*60*1000;
  assert.ok(Math.abs(Date.parse(certificate.validTo)-Date.now()-duration)<60*1000);
  const directory=await mkdtemp(join(tmpdir(),'formnaro-tablet-peers-'));
  const protect={isEncryptionAvailable:()=>true,encryptString:text=>Buffer.from(text).reverse(),
    decryptString:bytes=>Buffer.from(bytes).reverse().toString()};
  const openStore=()=>createTabletPeerStore(directory,protect);
  let target={id:'project-a',name:'Halter',revision:'revision-a'}, server, port, pin, approvals=0, actions=0,bind;
  const start=async(peerStore,requestedPort=0,address='127.0.0.1')=>{
    bind=address;
    const next=await startTabletTransfer({bind,allowLoopback:true,
      identity:peerStore.identity(),peerStore,listenPort:requestedPort,directory,
      getTarget:()=>target,confirmPair:async()=>{approvals++;return true;},validateProject:()=>{},
      live:async command=>{
        if(!command)return {project:{opening:target.id,name:target.name},parts:[],folders:[]};
        if(command.opening!==target.id)throw Error('Anderes Projekt');
        actions++;
      }});
    port=next.port;
    return next;
  };
  const call=(method,path,auth,payload,expectedPin=pin)=>new Promise((resolve,reject)=>{
    const body=payload?JSON.stringify(payload):null;
    const req=request({hostname:bind,port,method,path:'/tablet/v1'+path,agent:false,
      ca:identity.cert,checkServerIdentity(_name,certificate){
        const actual=createHash('sha256').update(certificate.raw).digest('hex');
        return actual===expectedPin?undefined:Error('PC fingerprint differs');
      },headers:{Authorization:'Bearer '+auth,...(body?{'Content-Length':Buffer.byteLength(body)}:{})}},res=>{
      let raw='';
      res.setEncoding('utf8');
      res.on('data',chunk=>{raw+=chunk;});
      res.on('end',()=>resolve({status:res.statusCode,value:JSON.parse(raw)}));
      res.on('error',reject);
    });
    req.on('error',reject);
    req.end(body);
  });
  async function pair(device,live){
    const entry=await server.invite({remember:true,allowLive:live});
    const invite=JSON.parse(Buffer.from(entry.code.slice(5),'base64url'));
    pin=invite.fingerprint;
    const response=await call('POST','/pair',invite.key,{device,remember:true});
    assert.equal(response.status,200);
    assert.ok(response.value.deviceKey&&response.value.deviceId);
    assert.equal(response.value.live,live);
    return response.value;
  }
  try{
    let store=openStore();
    store.saveIdentity(identity);
    server=await start(store);
    const first=await pair('Tablet A',true), second=await pair('Tablet B',false);
    const originalPort=port;
    await server.close();
    target={id:'project-b',name:'Flansch',revision:'revision-b'};
    store=openStore();
    assert.deepEqual(store.identity(),identity);
    server=await start(store,originalPort,'127.0.0.2');
    assert.equal(port,originalPort);
    await assert.rejects(call('POST','/resume',first.deviceKey,{},'0'.repeat(64)),/fingerprint/);
    assert.equal((await call('GET','/live',first.token)).status,401);
    const resumed=await call('POST','/resume',first.deviceKey,{});
    assert.equal(resumed.status,200);
    assert.deepEqual(resumed.value.target,target);
    assert.equal(resumed.value.live,true);
    assert.equal(approvals,2);
    assert.equal((await call('POST','/live',resumed.value.token,{opening:'project-a',action:'view',value:'iso'})).status,409);
    assert.equal(actions,0);
    assert.equal((await call('POST','/live',resumed.value.token,{opening:'project-b',action:'view',value:'iso'})).status,200);
    assert.equal(actions,1);
    const unaffected=await call('POST','/resume',second.deviceKey,{});
    assert.equal(unaffected.status,200);
    assert.equal((await call('GET','/live',unaffected.value.token)).status,403);
    server.revoke(first.deviceId);
    assert.equal((await call('GET','/live',resumed.value.token)).status,401);
    assert.equal((await call('GET','/target',unaffected.value.token)).status,200);
    await server.close();
    server=await start(openStore(),originalPort);
    assert.equal((await call('POST','/resume',first.deviceKey,{})).status,403);
    assert.equal((await call('POST','/resume',second.deviceKey,{})).status,200);
    const fresh=await pair('Tablet A',true);
    assert.notEqual(fresh.deviceId,first.deviceId);
    assert.equal(approvals,3);
    assert.ok(openStore().revoke(fresh.deviceId));
    assert.equal((await call('GET','/target',fresh.token)).status,401);
  }finally{
    await server?.close();
    await rm(directory,{recursive:true,force:true});
  }
});
