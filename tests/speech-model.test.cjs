const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto');
const {createModelStore}=require('../backend/speech-model.cjs');
async function fixture(t,fetchImpl){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'formnaro-model-ä-')),bytes=Buffer.alloc(160000,37);
 t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const model={file:'ggml-test.bin',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),url:'https://example.invalid/pinned-model'};
 const store=createModelStore({directory,model,fetchImpl:fetchImpl??(async()=>new Response(bytes))});return {directory,bytes,model,store};
}
test('No automatic network; streamed verified install is portable and survives a new service',async t=>{
 let calls=0;const f=await fixture(t,async(url,options)=>{calls++;assert.equal(url,f.model.url);assert.equal(options.credentials,'omit');return new Response(new ReadableStream({start(c){c.enqueue(f.bytes.subarray(0,100));c.enqueue(f.bytes.subarray(100));c.close();}}));});
 assert.equal(await f.store.installed(),false);assert.equal(calls,0);await f.store.download();assert.equal(calls,1);assert(await f.store.installed());
 assert.deepEqual(await fs.readdir(f.directory),[f.model.file]);
 const fresh=createModelStore({directory:f.directory,model:f.model,fetchImpl:()=>assert.fail('Installed model must work offline')});assert(await fresh.installed());await fresh.download();
 await fs.writeFile(f.store.target,Buffer.alloc(f.model.bytes,38));assert.equal(await fresh.installed(),false);
});
test('Bad size/hash/HTTP leaves no partial model, reports failure, and allows retry',async t=>{
 let mode='http';const f=await fixture(t,async()=>mode==='http'?new Response('missing',{status:404}):mode==='hash'?new Response(Buffer.alloc(f.model.bytes,9)):mode==='short'?new Response('short'):mode==='long'?new Response(Buffer.alloc(f.model.bytes+1)):new Response(f.bytes));
 for(mode of ['http','hash','short','long']){await assert.rejects(f.store.download());assert.equal(await f.store.installed(),false);assert.deepEqual(await fs.readdir(f.directory),[]);assert(f.store.progress().downloadError);assert.equal(f.store.hasActive(),false);}
 mode='good';await f.store.download();assert(await f.store.installed());assert.equal(f.store.progress().downloadError,null);
});
test('Cancellation and disposal abort the transfer, reject concurrent requests and remove partial files',async t=>{
 let began;let ready=new Promise(r=>began=r);
 const f=await fixture(t,async(_url,{signal})=>new Response(new ReadableStream({start(c){c.enqueue(Buffer.alloc(100,37));began();signal.addEventListener('abort',()=>c.error(new DOMException('Aborted','AbortError')),{once:true});}})));
 const pending=f.store.download();await ready;await assert.rejects(f.store.download(),/bereits/);assert(f.store.cancel());await assert.rejects(pending,/abgebrochen/);assert.deepEqual(await fs.readdir(f.directory),[]);
 ready=new Promise(r=>began=r);const second=f.store.download();await ready;const rejected=assert.rejects(second,/abgebrochen/);await f.store.dispose();await rejected;assert.equal(f.store.hasActive(),false);assert.deepEqual(await fs.readdir(f.directory),[]);
});
test('An interrupted download preserves an existing corrupt file for explicit retry',async t=>{
 const f=await fixture(t,async()=>new Response('short'));await fs.writeFile(f.store.target,'original');await assert.rejects(f.store.download());assert.equal(await fs.readFile(f.store.target,'utf8'),'original');
});
