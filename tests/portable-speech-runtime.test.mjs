import test from 'node:test';
import assert from 'node:assert/strict';
import speech from '../backend/speech.cjs';
import {encodeSpeechWav} from '../src/speech-audio.js';
// Local Whisper was deliberately removed; see PROJEKTKONTEXT, "lokale Spracherkennung entfernt".
const audio=()=>encodeSpeechWav(Float32Array.from({length:16000},(_,i)=>.2*Math.sin(i/10)));
test('Removed local speech mode cannot silently start an online request',async()=>{
 let calls=0;const service=speech.createSpeechService({online:{transcribe(){calls++;throw Error('must not run');}}});
 await assert.rejects(service.transcribe({requestId:'removed-local',mode:'local',language:'de',bytes:audio()}),/Ungültige Sprachanfrage/);
 assert.equal(calls,0);assert.equal(service.hasActive(),false);await service.dispose();
});
test('Current speech works without a local engine and clears only its private audio copy',async()=>{
 const input=audio(),before=input.slice();let copy,calls=0;
 const service=speech.createSpeechService({online:{async transcribe({bytes,language}){calls++;copy=bytes;assert.equal(language,'de');assert.deepEqual(new Uint8Array(bytes),input);return {text:'Bohrung acht Millimeter',local:false,engine:'test-online'};}}});
 const result=await service.transcribe({requestId:'online-only',mode:'online',language:'de',bytes:input});
 assert.equal(calls,1);assert.equal(result.text,'Bohrung acht Millimeter');assert.equal(result.local,false);assert.equal(result.seconds,1);assert(copy.every(b=>b===0));assert.deepEqual(input,before);assert.equal(service.hasActive(),false);await service.dispose();
});
