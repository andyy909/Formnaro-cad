import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {encodeSpeechWav,appendSpeechText} from '../src/speech-audio.js';
import speech from '../backend/speech.cjs';
import permissions from '../backend/speech-permissions.cjs';
const audio=()=>encodeSpeechWav(Float32Array.from({length:16000},(_,i)=>.2*Math.sin(i/10)));
test('PCM format, duration, clipping and malformed/silent audio boundaries',()=>{
 const wav=audio();assert.equal(speech.validateAudio(wav).seconds,1);assert.equal(wav.length,32044);
 assert.throws(()=>speech.validateAudio(wav.subarray(0,100)),/Ungültige/);
 const broken=wav.slice();broken[24]=1;assert.throws(()=>speech.validateAudio(broken),/Ungültige/);
 assert.throws(()=>speech.validateAudio(encodeSpeechWav(new Float32Array(16000))),/hörbare/);
 assert.throws(()=>encodeSpeechWav(new Float32Array(100)),/Sekunden/);
 assert.throws(()=>encodeSpeechWav(new Float32Array(180*16000+1)),/Sekunden/);
 const bad=new Float32Array(5000);bad[4]=NaN;assert.throws(()=>encodeSpeechWav(bad),/Ungültige/);
 const clips=new Float32Array(5000);clips[0]=-2;clips[1]=2;const view=new DataView(encodeSpeechWav(clips).buffer);assert.equal(view.getInt16(44,true),-32768);assert.equal(view.getInt16(46,true),32767);
});
test('Dictation preserves draft and refuses silent truncation',()=>{assert.equal(appendSpeechText('Vorhandener Auftrag.  ','  Bohrung acht Millimeter. '),'Vorhandener Auftrag.\nBohrung acht Millimeter.');assert.throws(()=>appendSpeechText('12345','67890',10),/zu lang/);});
test('Microphone allowed only for main app document, never camera or other frames',()=>{
 const entry=path.resolve('dist/index.html'),url=new URL('file:///'+entry.replaceAll('\\','/')).href;
 let check,request;const contents={getURL:()=>url,session:{setPermissionCheckHandler:f=>check=f,setPermissionRequestHandler:f=>request=f}};
 permissions.installSpeechPermissions({webContents:contents},{entry});
 assert.equal(check(contents,'media','',{requestingUrl:url,isMainFrame:true,mediaType:'audio'}),true);
 for(const details of [{isMainFrame:false,mediaType:'audio'},{isMainFrame:true,mediaType:'video'},{isMainFrame:true,mediaType:'audio',requestingUrl:'https://example.com'}])assert.equal(check(contents,'media','',{requestingUrl:url,...details}),false);
 let accepted;request(contents,'media',v=>accepted=v,{isMainFrame:true,requestingUrl:url,mediaTypes:['audio']});assert.equal(accepted,true);
 request(contents,'media',v=>accepted=v,{isMainFrame:true,requestingUrl:url,mediaTypes:['audio','video']});assert.equal(accepted,false);
});
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'formnaro-speech-test-')),runtime=path.join(root,'runtime'),temp=path.join(root,'temp');await fs.mkdir(runtime);const files=[];for(const name of ['whisper-cli.exe','ggml-small-q5_1.bin']){const bytes=Buffer.from(name);await fs.writeFile(path.join(runtime,name),bytes);files.push({name,sha256:createHash('sha256').update(bytes).digest('hex')});}await fs.writeFile(path.join(runtime,'manifest.json'),JSON.stringify({engine:'whisper.cpp',model:'small-q5_1',files}));t.after(()=>fs.rm(root,{recursive:true,force:true}));return {directory:runtime,tempDirectory:temp};}

test('runtime integrity streams binary files, rejects damage and retries without caching a failed check',async t=>{
 const paths=await fixture(t),file=path.join(paths.directory,'ggml-small-q5_1.bin'),payload=Buffer.alloc(3*1024*1024,37);
 const manifest=JSON.parse(await fs.readFile(path.join(paths.directory,'manifest.json'),'utf8'));
 manifest.files.find(f=>f.name.endsWith('.bin')).sha256=createHash('sha256').update(payload).digest('hex');
 await fs.writeFile(file,payload);await fs.writeFile(path.join(paths.directory,'manifest.json'),JSON.stringify(manifest));
 const read=fs.readFile,reads=[];t.mock.method(fs,'readFile',async function(target,...args){reads.push(path.basename(String(target)));assert.equal(path.extname(String(target)),'.json','Binary integrity must not allocate the whole file');return read.call(this,target,...args);});
 const service=speech.createSpeechService({...paths,spawnProcess(){assert.fail('No recognition process expected');}});
 await fs.writeFile(file,'damaged');assert.equal((await service.status()).available,false);
 await fs.writeFile(file,payload);assert.equal((await service.status()).available,true);
 const before=reads.length;assert.equal((await service.status()).available,true);assert.equal(reads.length,before);
});
test('Local process uses fixed arguments; result returned and temporary audio removed',async t=>{
 const fixturePaths=await fixture(t);let options;
 const service=speech.createSpeechService({...fixturePaths,spawnProcess(exe,args,opts){assert(exe.endsWith('whisper-cli.exe'));options=opts;const child=new EventEmitter();child.kill=()=>child.emit('close',1);setImmediate(async()=>{await fs.writeFile(args[args.indexOf('-of')+1]+'.txt','Bohrung acht Millimeter.');child.emit('close',0);});return child;}});
 const result=await service.transcribe({requestId:'test',language:'de',bytes:audio()});assert.equal(result.text,'Bohrung acht Millimeter.');assert.equal(options.shell,false);assert.equal(options.windowsHide,true);assert.deepEqual(await fs.readdir(fixturePaths.tempDirectory),[]);
 await assert.rejects(service.transcribe({requestId:'bad',language:'de --bad',bytes:audio()}),/Ungültige/);
});
test('Cancel kills active process, blocks concurrent calls and deletes temporary audio',async t=>{
 const fixturePaths=await fixture(t);let started,ready=new Promise(r=>started=r),killed=false;
 const service=speech.createSpeechService({...fixturePaths,spawnProcess(){const child=new EventEmitter();child.kill=()=>{killed=true;setImmediate(()=>child.emit('close',1));};started();return child;}});
 const pending=service.transcribe({requestId:'cancel-test',bytes:audio()});await ready;
 await assert.rejects(service.transcribe({requestId:'second',bytes:audio()}),/bereits/);assert.equal(service.cancel('wrong'),false);assert.equal(service.cancel('cancel-test'),true);await assert.rejects(pending,/abgebrochen/);assert(killed);assert.deepEqual(await fs.readdir(fixturePaths.tempDirectory),[]);
});
test('Online recognition uses validated audio, does not load Whisper, and cancellation aborts the request',async t=>{
 const paths=await fixture(t);let started;const ready=new Promise(resolve=>started=resolve);
 const online={transcribe({bytes,language,signal}){assert.equal(language,'de');assert(bytes.length>44);started();return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('Spracherkennung abgebrochen.')),{once:true}));}};
 const service=speech.createSpeechService({...paths,online,spawnProcess(){assert.fail('Online recognition must not launch Whisper');}});
 const pending=service.transcribe({requestId:'cloud-cancel',mode:'online',language:'de',bytes:audio()});await ready;
 assert.equal(service.cancel('cloud-cancel'),true);await assert.rejects(pending,/abgebrochen/);assert.equal(service.hasActive(),false);
});
test('Timeout and invalid runtime do not leave audio behind or execute unverified binary',async t=>{
 const fixturePaths=await fixture(t);const service=speech.createSpeechService({...fixturePaths,timeoutMs:10,spawnProcess(){const child=new EventEmitter();child.kill=()=>setImmediate(()=>child.emit('close',1));return child;}});
 await assert.rejects(service.transcribe({requestId:'timeout',bytes:audio()}),/zu lange/);assert.deepEqual(await fs.readdir(fixturePaths.tempDirectory),[]);
 await fs.writeFile(path.join(fixturePaths.directory,'whisper-cli.exe'),'changed');const broken=speech.createSpeechService({...fixturePaths,spawnProcess(){assert.fail('Must not execute');}});assert.equal((await broken.status()).available,false);await assert.rejects(broken.transcribe({requestId:'broken',bytes:audio()}),/beschädigt/);
});

test('Optional model absence is actionable; online speech works before downloading and local speech uses the verified portable model',async t=>{
 const f=await fixture(t),modelFile=path.join(f.directory,'ggml-small-q5_1.bin'),bytes=await fs.readFile(modelFile);await fs.unlink(modelFile);
 const modelDirectory=path.join(f.directory,'portable-models');const model={file:'ggml-small-q5_1.bin',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),url:'https://example.invalid/model'};
 const modelStore=(await import('../backend/speech-model.cjs')).default.createModelStore({directory:modelDirectory,model,fetchImpl:async()=>new Response(bytes)});
 const service=speech.createSpeechService({...f,modelStore,online:{transcribe:async()=>({text:'Online works'})},spawnProcess(exe,args){assert.equal(args[args.indexOf('-m')+1],path.join(modelDirectory,model.file));const child=new EventEmitter();setImmediate(async()=>{await fs.writeFile(args[args.indexOf('-of')+1]+'.txt','Portable offline works');child.emit('close',0);});return child;}});
 const missing=await service.status();assert.equal(missing.available,false);assert.equal(missing.downloadRequired,true);assert.equal(missing.downloading,false);
 await assert.rejects(service.transcribe({requestId:'local-before',bytes:audio()}),/herunterladen/);
 assert.equal((await service.transcribe({requestId:'online-before',mode:'online',bytes:audio()})).text,'Online works');
 await service.downloadModel();assert.equal((await service.status()).available,true);assert.equal((await service.transcribe({requestId:'local-after',bytes:audio()})).text,'Portable offline works');
 await service.dispose();
});
