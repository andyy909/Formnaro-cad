import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
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
test('Online recognition validates audio and cancellation aborts the request',async()=>{
 let started;const ready=new Promise(resolve=>started=resolve);
 const online={transcribe({bytes,language,signal}){assert.equal(language,'de');assert(bytes.length>44);started();return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('Spracherkennung abgebrochen.')),{once:true}));}};
 const service=speech.createSpeechService({online});
 const pending=service.transcribe({requestId:'cloud-cancel',mode:'online',language:'de',bytes:audio()});await ready;
 assert.equal(service.cancel('cloud-cancel'),true);await assert.rejects(pending,/abgebrochen/);assert.equal(service.hasActive(),false);assert.equal(service.cancel(),false);
});
