const assert = require('node:assert/strict');
const {mkdtemp, readFile, readdir, rm} = require('node:fs/promises');
const {join} = require('node:path');
const {tmpdir} = require('node:os');
const https = require('node:https');
const {createHash, createPrivateKey, X509Certificate} = require('node:crypto');
const test = require('node:test');
const {createIdentity,startTabletTransfer} = require('../backend/tablet-transfer.cjs');
const sha = value => createHash('sha256').update(value).digest('hex');

test('pinned PC pairing stages real project files, deduplicates retries and preserves both conflicting copies',async t=>{
  const {createCadProject,parseCadProject,serializeCadProject}=await import('../src/cad-project.js');
  const bind='127.0.0.1';
  const credentials=await createIdentity(bind);
  assert.ok(Buffer.isBuffer(credentials.cert));
  assert.ok(Buffer.isBuffer(credentials.key));
  const certificate=new X509Certificate(credentials.cert);
  assert.equal(certificate.publicKey.asymmetricKeyType,'ec');
  assert.equal(certificate.publicKey.asymmetricKeyDetails.namedCurve,'prime256v1');
  assert.equal(certificate.subject,'CN=Formnaro-Tablet');
  assert.equal(certificate.issuer,certificate.subject);
  assert.equal(certificate.checkIP(bind),bind);
  assert.ok(certificate.verify(certificate.publicKey));
  assert.ok(certificate.checkPrivateKey(createPrivateKey(credentials.key)));
  const now=Date.now(),validFrom=Date.parse(certificate.validFrom),validTo=Date.parse(certificate.validTo);
  const day=24*60*60*1000;
  assert.ok(validFrom<=now);
  assert.ok(Math.abs(validTo-now-day)<60*1000);
  const directory=await mkdtemp(join(tmpdir(),'formano-inbox-test-'));
  const parts=name=>Buffer.from(serializeCadProject(createCadProject({name,nodes:[]})));
  const initial=parts('Tablet Stand A'),later=parts('Tablet Stand B'),pc=parts('Geänderter PC-Stand');
  let revision='r1',id='pc-fixture',allowed=false,views=0;
  let bridge;
  try {
    bridge=await startTabletTransfer({bind,directory,identity:credentials,allowLoopback:true,
      getTarget:async options=>{
        views++;
        return {id,name:'Prüfprojekt am PC',revision,
          ...(options?.snapshotIfRevisionDiffers!==revision?{text:pc.toString('utf8')}:{})};
      },
      confirmPair:async device=>{assert.equal(device,'QA-Tablet');return allowed;},
      validateProject:parseCadProject,
    });
    const {host,port,fingerprint,key}=JSON.parse(Buffer.from(bridge.code.slice(5),'base64url').toString());
    assert.equal(fingerprint,sha(certificate.raw));
    function request(method,path,{auth='',data,headers={},pin=fingerprint}={}) {
      return new Promise((resolve,reject)=>{
        const req=https.request({hostname:host,port,method,path,ca:credentials.cert,agent:false,
          checkServerIdentity(name,cert){
            return httpsIdentity(name,cert)??(sha(cert.raw)!==pin?Error('Test pin mismatch'):undefined);
          },
          headers:{Authorization:'Bearer '+auth,...(data?{'Content-Length':data.length}:{}),...headers},
        },res=>{
          const chunks=[];
          res.on('data',chunk=>chunks.push(chunk));
          res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(Buffer.concat(chunks).toString())}));
          res.on('error',reject);
        });
        req.on('error',reject);
        req.end(data);
      });
    }
    const pair=options=>request('POST','/tablet/v1/pair',{auth:key,data:Buffer.from('{"device":"QA-Tablet"}'),...options});
    const httpsIdentity=require('node:tls').checkServerIdentity;
    assert.equal((await request('GET','/tablet/v1/target')).status,401);
    await assert.rejects(pair({pin:'0'.repeat(64)}),/Test pin mismatch/);
    const clock=t.mock.method(Date,'now',()=>bridge.expires+1);
    try{
      const expired=await pair();
      assert.equal(expired.status,401);
      assert.match(expired.data.error,/abgelaufen/);
    }finally{clock.mock.restore();}
    assert.equal((await pair()).status,403);
    allowed=true;
    const authorized=await pair();
    assert.equal(authorized.status,200);
    assert.equal(authorized.data.target.revision,'r1');
    const auth=authorized.data.token;
    assert.equal((await pair()).status,401);
    assert.equal((await request('POST','/v1/apply',{auth})).status,404);
    const send=(data,extra={})=>request('POST','/tablet/v1/project',{auth,data,
      headers:{'Content-Type':'application/octet-stream','X-Formano-Target':'pc-fixture',
        'X-Formano-Revision':'r1','X-Formano-Sha256':sha(data),...extra}});
    assert.equal((await send(initial,{'X-Formano-Sha256':'0'.repeat(64)})).status,400);
    assert.equal((await send(initial,{'X-Formano-Target':'falsches-ziel'})).status,409);
    assert.deepEqual(await readdir(directory),[]);
    const first=await send(initial);
    assert.equal(first.status,200);
    assert.equal(first.data.receipt.kind,'received');
    assert.deepEqual(await readFile(join(directory,first.data.receipt.name,'Tablet.ocad')),initial);
    revision='r2';
    const changed=(await request('GET','/tablet/v1/target',{auth})).data.target;
    assert.equal(changed.revision,'r2');
    assert.deepEqual(await send(initial),first);
    const duplicate=await Promise.all([send(later),send(later)]);
    const [second,retry]=duplicate;
    assert.deepEqual(second,retry);
    assert.equal(second.status,200);
    assert.equal(second.data.receipt.kind,'conflict');
    assert.equal(second.data.receipt.target.revision,'r2');
    const folder=join(directory,second.data.receipt.name);
    assert.deepEqual(await readFile(join(folder,'Tablet.ocad')),later);
    assert.deepEqual(await readFile(join(folder,'PC.ocad')),pc);
    assert.equal((await readdir(directory)).length,2);
    id='anderes-projekt';
    assert.equal((await request('GET','/tablet/v1/target',{auth})).status,409);
    assert.equal((await send(parts('Anderes Teil'))).status,409);
    assert.ok(views>=4);
  } finally {
    await bridge?.close();
    await rm(directory,{recursive:true,force:true});
  }
});
