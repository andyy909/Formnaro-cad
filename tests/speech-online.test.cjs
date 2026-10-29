const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createOnlineSpeech}=require('../backend/speech-online.cjs');
function fixture(t,fetcher){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-online-speech-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));const safeStorage={isEncryptionAvailable:()=>true,encryptString:key=>Buffer.from('ENC:'+key),decryptString:buf=>buf.toString().slice(4)};return {directory,service:createOnlineSpeech({directory,safeStorage,fetcher})};}
test('Online speech uses a separately encrypted key and sends only supplied audio to the fixed Deepgram endpoint',async t=>{
 let called=false;const {directory,service}=fixture(t,async(url,options)=>{called=true;assert.match(url,/^https:\/\/api\.deepgram\.com\/v1\/listen\?/);assert.match(url,/model=nova-3/);assert.match(url,/language=de/);assert.equal(options.headers.Authorization,'Token synthetic-key');assert.equal(options.headers['Content-Type'],'audio/wav');assert.deepEqual([...options.body],[1,2,3]);return new Response(JSON.stringify({results:{channels:[{alternatives:[{transcript:'  Bohrung 8 mm.  '}]}]}}));});
 assert.equal(service.status().configured,false);service.save({key:'synthetic-key'});assert.equal(service.status().configured,true);assert(!fs.readFileSync(path.join(directory,'Sprache-Online.json'),'utf8').includes('synthetic-key'));
 const result=await service.transcribe({bytes:Buffer.from([1,2,3]),language:'de',signal:new AbortController().signal});assert(called);assert.deepEqual(result,{text:'Bohrung 8 mm.',local:false,engine:'Deepgram Nova-3'});service.save({clear:true});assert.equal(service.status().configured,false);
});
test('Online speech does not disclose provider errors, handles missing configuration and cancellation',async t=>{
 const {service}=fixture(t,async()=>{throw Error('secret from transport');});await assert.rejects(service.transcribe({bytes:Buffer.from([1]),language:'de'}),/zuerst/);service.save({key:'secret'});
 await assert.rejects(service.transcribe({bytes:Buffer.from([1]),language:'de'}),e=>!e.message.includes('secret')&&/nicht erreichbar/.test(e.message));
 const controller=new AbortController();controller.abort();await assert.rejects(service.transcribe({bytes:Buffer.from([1]),language:'de',signal:controller.signal}),/abgebrochen/);
 assert.throws(()=>service.save({key:'bad\nheader'}),/gültigen/);
});
