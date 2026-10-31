import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {copySpeechEngine,speechRuntimeDLLs} from '../scripts/portable-runtime-policy.mjs';

test('Speech packaging includes hash-verified app-local CRT without shipping the optional model',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-speech-package-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const engine=path.join(root,'engine'),bin=path.join(root,'cad/bin');
 fs.mkdirSync(engine);fs.mkdirSync(bin,{recursive:true});
 const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
 const files=speechRuntimeDLLs.map(name=>{const bytes=Buffer.from(name);fs.writeFileSync(path.join(bin,name),bytes);return {file:'bin/'+name,size:bytes.length,sha256:digest(bytes)};});
 fs.writeFileSync(path.join(bin,'../manifest.json'),JSON.stringify({files}));
 fs.writeFileSync(path.join(engine,'whisper-cli.exe'),'engine');
 for(const n of ['LICENSE-whisper.txt','LICENSE-model.txt'])fs.writeFileSync(path.join(engine,n),'license');
 const original={engine:'whisper.cpp',files:[{name:'whisper-cli.exe',sha256:digest('engine')},{name:'optional.bin',sha256:digest('model')}]};
 fs.writeFileSync(path.join(engine,'manifest.json'),JSON.stringify(original));
 const out=path.join(root,'out');copySpeechEngine(engine,out,{crtDirectory:bin});
 const manifest=JSON.parse(fs.readFileSync(path.join(out,'manifest.json')));
 for(const name of speechRuntimeDLLs){assert.equal(digest(fs.readFileSync(path.join(out,name))),manifest.files.find(f=>f.name===name).sha256);}
 assert(!fs.existsSync(path.join(out,'optional.bin')));
 assert.throws(()=>copySpeechEngine(engine,out,{crtDirectory:bin}),/must be a new directory/);
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(engine,'manifest.json'))),original);
 fs.writeFileSync(path.join(bin,speechRuntimeDLLs[0]),'damaged');
 assert.throws(()=>copySpeechEngine(engine,path.join(root,'bad'),{crtDirectory:bin}),/runtime damaged/);
 assert(!fs.existsSync(path.join(root,'bad')));
 assert.throws(()=>copySpeechEngine(engine,path.join(root,'missing')),/requires the verified CAD/);
});
