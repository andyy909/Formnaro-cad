const assert=require('node:assert/strict');
const test=require('node:test');
const {mkdtemp,readFile,rm,writeFile}=require('node:fs/promises');
const {join}=require('node:path');
const {tmpdir}=require('node:os');
const {request}=require('node:https');
const {createHash,randomUUID,X509Certificate}=require('node:crypto');
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
  const entries=[],cancelled=[],faceReturns=[],faceCuts=[];
  let activeAgentId;
  const start=async(peerStore,requestedPort=0,address='127.0.0.1')=>{
    bind=address;
    const next=await startTabletTransfer({bind,allowLoopback:true,
      identity:peerStore.identity(),peerStore,listenPort:requestedPort,directory,
      getTarget:()=>target,confirmPair:async()=>{approvals++;return true;},validateProject:()=>{},
      agent:async (input,projectId)=>{
        assert.equal(projectId,target.id);
        if(input.action==='state')return {requestId:activeAgentId,entries};
        if(input.action==='cancel'){
          cancelled.push(input.requestId);
          activeAgentId=null;
          return {cancelled:true};
        }
        activeAgentId=input.requestId;
        entries.push({kind:'user',text:input.prompt});
        return {accepted:true,requestId:input.requestId};
      },
      live:async command=>{
        if(!command)return {project:{opening:target.id,name:target.name},parts:[],folders:[]};
        if(command.opening!==target.id)throw Error('Anderes Projekt');
        if(command.action==='tablet-face-return'){
          faceReturns.push(command);
          return {status:'opened'};
        }
        if(command.action==='tablet-face-cut'){
          faceCuts.push(command);
          return {status:'applied'};
        }
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
  async function pair(device,live,agent){
    const entry=await server.invite({remember:true,allowLive:live,allowAgent:agent});
    const invite=JSON.parse(Buffer.from(entry.code.slice(5),'base64url'));
    pin=invite.fingerprint;
    const response=await call('POST','/pair',invite.key,{device,remember:true});
    assert.equal(response.status,200);
    assert.ok(response.value.deviceKey&&response.value.deviceId);
    assert.equal(response.value.live,live);
    assert.equal(response.value.agent,agent===true);
    return response.value;
  }
  try{
    let store=openStore();
    store.saveIdentity(identity);
    server=await start(store);
    const first=await pair('Tablet A',true,true), second=await pair('Tablet B',false);
    const route='/agent-chat';
    assert.equal((await call('GET',route,second.token)).status,403);
    const peerFile=join(directory,'tablet-freigaben.json');
    const legacy=JSON.parse(await readFile(peerFile,'utf8'));
    delete legacy.devices.find(device=>device.id===second.deviceId).agent;
    await writeFile(peerFile,JSON.stringify(legacy));
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
    assert.equal(resumed.value.agent,true);
    assert.equal(approvals,2);
    assert.equal((await call('POST','/live',resumed.value.token,{opening:'project-a',action:'view',value:'iso'})).status,409);
    assert.equal(actions,0);
    assert.equal((await call('POST','/live',resumed.value.token,{opening:'project-b',action:'view',value:'iso'})).status,200);
    assert.equal(actions,1);
    const unaffected=await call('POST','/resume',second.deviceKey,{});
    assert.equal(unaffected.status,200);
    assert.equal((await call('GET','/live',unaffected.value.token)).status,403);
    assert.equal(unaffected.value.agent,false);
    assert.equal((await call('GET',route,unaffected.value.token)).status,403);
    const third=await pair('Tablet C',true,true);
    const faceRoute='/face-sketch';
    assert.equal(resumed.value.faceSketch,true);
    assert.deepEqual(server.faceSketchRecipients(),[]);
    assert.equal((await call('GET',faceRoute,unaffected.value.token)).status,403);
    assert.deepEqual((await call('GET',faceRoute,resumed.value.token)).value,{delivery:null});
    assert.deepEqual((await call('GET',faceRoute,third.token)).value,{delivery:null});
    const recipient=server.faceSketchRecipients().find(item=>item.name==='Tablet A');
    const sketch={version:2,kind:'profile',variables:[],dimensions:{height:'3'},
      elements:[{id:'rim',type:'circle',center:[0,0],diameter:20}],
      loops:[{id:'outer',role:'outer',elements:['rim']}]};
    const draft={name:'Flansch · Fläche 1',sketch};
    const frame=[1,0,0,0,0,1,0,0,0,0,1,0,3,4,5,1];
    const binding={targetId:'flange',point:[3,4,5],normal:[0,0,1],geometryDigest:'a'.repeat(64)};
    const source={recipientId:recipient.recipientId,...draft,opening:target.id,frame,binding};
    const receipt=server.queueFaceSketch(source);
    assert.throws(()=>server.queueFaceSketch(source),/steht noch/);
    assert.deepEqual((await call('GET',faceRoute,third.token)).value,{delivery:null});
    assert.equal((await call('POST',faceRoute,third.token,receipt)).status,409);
    assert.deepEqual((await call('GET',faceRoute,resumed.value.token)).value,{delivery:{...receipt,...draft}});
    const recovered=await call('POST','/resume',first.deviceKey,{});
    assert.equal(recovered.status,200);
    assert.equal((await call('GET',faceRoute,resumed.value.token)).status,401);
    resumed.value.token=recovered.value.token;
    assert.deepEqual((await call('GET',faceRoute,resumed.value.token)).value,{delivery:{...receipt,...draft}});
    assert.equal((await call('POST',faceRoute,resumed.value.token,receipt)).status,200);
    assert.equal((await call('POST',faceRoute,resumed.value.token,receipt)).status,200);
    assert.deepEqual((await call('GET',faceRoute,resumed.value.token)).value,{delivery:null});
    assert.equal(server.faceSketchRecipients().find(item=>item.recipientId===recipient.recipientId).receipt,receipt.id);
    const returnRoute='/face-sketch-return';
    const edited={...sketch,elements:[{...sketch.elements[0],diameter:25}]};
    const returned={id:receipt.id,returnId:randomUUID(),sketch:edited};
    assert.equal((await call('POST',returnRoute,third.token,returned)).status,409);
    assert.deepEqual((await call('POST',returnRoute,resumed.value.token,returned)).value,{status:'opened'});
    assert.deepEqual((await call('POST',returnRoute,resumed.value.token,returned)).value,{status:'opened'});
    assert.equal((await call('POST',returnRoute,resumed.value.token,{...returned,sketch})).status,409);
    assert.deepEqual(faceReturns,[{action:'tablet-face-return',deliveryId:receipt.id,opening:target.id,name:draft.name,frame,sketch:edited}]);
    const cut={mode:'depth',depth:2.5},direct={...returned,returnId:randomUUID(),cut};
    assert.equal((await call('POST',returnRoute,resumed.value.token,{...direct,cut:{mode:'depth',depth:0}})).status,400);
    assert.deepEqual((await call('POST',returnRoute,resumed.value.token,direct)).value,{status:'applied'});
    assert.deepEqual((await call('POST',returnRoute,resumed.value.token,direct)).value,{status:'applied'});
    assert.equal((await call('POST',returnRoute,resumed.value.token,{...direct,cut:{mode:'through'}})).status,409);
    assert.deepEqual(faceCuts,[{action:'tablet-face-cut',opening:target.id,frame,binding,originalSketch:sketch,sketch:edited,cut}]);
    const requestId=randomUUID(), prompt='Kante prüfen';
    const send={action:'send',requestId,prompt};
    assert.equal((await call('POST',route,resumed.value.token,{...send,extra:true})).status,400);
    const posted=await call('POST',route,resumed.value.token,send);
    assert.deepEqual(posted.value.chat,{accepted:true,requestId});
    assert.deepEqual((await call('POST',route,resumed.value.token,send)).value,posted.value);
    assert.equal(entries.length,1);
    const own=(await call('GET',route,resumed.value.token)).value.chat;
    assert.deepEqual(own,{requestId,entries:[{kind:'user',text:prompt}],canCancel:true,project:'Flansch'});
    const other=(await call('GET',route,third.token)).value.chat;
    assert.equal(other.canCancel,false);
    assert.equal(other.requestId,null);
    assert.equal((await call('POST',route,third.token,send)).status,409);
    assert.equal((await call('POST',route,third.token,{action:'cancel',requestId})).status,403);
    target={...target,id:'project-c'};
    assert.equal((await call('GET',route,resumed.value.token)).status,409);
    target={...target,id:'project-b'};
    server.revoke(first.deviceId);
    assert.equal((await call('GET','/live',resumed.value.token)).status,401);
    assert.deepEqual(cancelled,[requestId]);
    assert.equal((await call('GET','/target',unaffected.value.token)).status,200);
    await server.close();
    server=await start(openStore(),originalPort);
    assert.equal((await call('POST','/resume',first.deviceKey,{})).status,403);
    assert.equal((await call('POST','/resume',second.deviceKey,{})).status,200);
    const fresh=await pair('Tablet A',true);
    assert.notEqual(fresh.deviceId,first.deviceId);
    assert.equal(approvals,4);
    assert.ok(openStore().revoke(fresh.deviceId));
    assert.equal((await call('GET','/target',fresh.token)).status,401);
  }finally{
    await server?.close();
    await rm(directory,{recursive:true,force:true});
  }
});
