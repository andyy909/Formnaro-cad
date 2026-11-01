import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {trimElectronLocales,copyPortableCAD} from '../scripts/portable-runtime-policy.mjs';
test('Locale trimming preserves German and English, drops es-419 and leaves unrelated files untouched',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-locale-policy-'));t.after(()=>{assert(path.basename(root).startsWith('formnaro-locale-policy-'));fs.rmSync(root,{recursive:true,force:true});});
 fs.mkdirSync(path.join(root,'resources'));fs.writeFileSync(path.join(root,'resources/app.asar'),'fixture');fs.writeFileSync(path.join(root,'Formnaro.exe'),'fixture');fs.mkdirSync(path.join(root,'locales'));
 for(const file of ['de.pak','en-US.pak','en-GB.pak','fr.pak','es-419.pak','keep.txt'])fs.writeFileSync(path.join(root,'locales',file),file);
 const r=trimElectronLocales(root);assert.equal(r.removed.length,2);assert.deepEqual(fs.readdirSync(path.join(root,'locales')).sort(),['de.pak','en-GB.pak','en-US.pak','keep.txt'].sort());
});
test('A changed native file pin requires re-audit before removing it',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-native-pin-'));t.after(()=>{assert(path.basename(root).startsWith('formnaro-native-pin-'));fs.rmSync(root,{recursive:true,force:true});});
 fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify({files:[{file:'bin/libclang-13.dll',sha256:'0'.repeat(64),size:10}]}));
 assert.throws(()=>copyPortableCAD(root,path.join(root,'new-output')),/new dependency audit/);
});
