import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {listPackage,extractFile} from '@electron/asar';
const archive=path.resolve(process.argv[2]||'release-formnaro-v0.10/Formnaro-win32-x64/resources/app.asar'),files=listPackage(archive).map(f=>f.replaceAll('\\','/')),checked=[];
assert.ok(!files.some(f=>/\/(work|tests|node_modules|release[^/]*|outputs|Daten|Layouts|\.codex[^/]*)\/|__pycache__|\.pyc$|\/ai-bridge\.json$|\/ai-settings\.json$/.test(f)),'Unexpected profile, attachment, build or test data in the runtime');
const previousPath='work/v010/runtime-package-check.json',previous=fs.existsSync(previousPath)?JSON.parse(fs.readFileSync(previousPath,'utf8')):null;
for(const expected of previous?.files??[]){const packed=extractFile(archive,path.normalize(expected.file)),sha256=crypto.createHash('sha256').update(packed).digest('hex');assert.equal(packed.length,expected.bytes);assert.equal(sha256,expected.sha256,'Retained 0.10 runtime changed: '+expected.file);checked.push({file:expected.file,bytes:packed.length,sha256});}
// Packager intentionally removes development scripts/fields from package.json.
const metadata=JSON.parse(extractFile(archive,'package.json'));assert.equal(metadata.version,'0.10.0');assert.equal(metadata.name,'formnaro');assert.ok(files.includes('/backend/files.cjs'));assert.ok(files.some(v=>v.startsWith('/dist/assets/analysis-worker')));assert.ok(files.includes('/electron.cjs'));assert.ok(files.includes('/preload.cjs'));
console.log(JSON.stringify({ok:true,files:checked.length,version:metadata.version,noProfilesOrCredentials:true,retainedManifest:!!previous}));
