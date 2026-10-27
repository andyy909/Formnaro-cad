import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {listPackage,extractFile} from '@electron/asar';
const archive=path.resolve(process.argv[2]||'release-formnaro-v0.12/Formnaro-win32-x64/resources/app.asar');
const files=listPackage(archive).map(file=>file.replaceAll('\\','/').replace(/^\//,''));
const checked=[],digest=bytes=>createHash('sha256').update(bytes).digest('hex');
assert.ok(!files.some(file=>/(^|\/)(work|tests|src|node_modules|release[^/]*|outputs|Daten|Layouts|\.codex[^/]*)(\/|$)|__pycache__|\.pyc$|\.map$|(^|\/)(ai-bridge\.json|ai-settings\.json|\.env[^/]*)$/.test(file)),'Unexpected source, profile, credential or test data in the runtime');
for(const entry of files){if(entry==='package.json'||!fs.existsSync(entry)||!fs.statSync(entry).isFile())continue;const source=fs.readFileSync(entry),packed=extractFile(archive,path.normalize(entry));assert.ok(packed.equals(source),'Runtime file differs: '+entry);checked.push({file:entry,bytes:packed.length,sha256:digest(packed)});}
const metadata=JSON.parse(extractFile(archive,'package.json')),sourceMetadata=JSON.parse(fs.readFileSync('package.json'));
for(const key of ['name','productName','version','description','type','main','dependencies'])assert.deepEqual(metadata[key],sourceMetadata[key]);
assert.equal(metadata.version,'0.12.0');assert.equal(metadata.name,'formnaro');assert.ok(!metadata.dependencies['manifold-3d']&&!metadata.dependencies['replicad-opencascadejs']);
assert.match(fs.readFileSync('index.html','utf8'),/src="\/src\/cad-main\.js"/);
const wasm=files.filter(name=>name.endsWith('.wasm'));assert.equal(wasm.length,1);assert.match(wasm[0],/^dist\/assets\/formnaro_cad-/);
const integrity=JSON.parse(fs.readFileSync('cad-kernel-build/runtime/integrity.json','utf8'));
assert.equal(digest(extractFile(archive,path.normalize(wasm[0]))),integrity.files['formnaro_cad.wasm'].sha256);
const worker=files.filter(name=>/^dist\/assets\/cad-worker-.*\.js$/.test(name));assert.equal(worker.length,1);
for(const file of files.filter(name=>/^dist\/assets\/.*\.js$/.test(name))){const source=extractFile(archive,path.normalize(file)).toString('utf8');assert.ok(!/manifold-3d|virtual:cad-wasm|replicad_single|data:application\/wasm;base64/.test(source),'Legacy modeling kernel in production: '+file);}
for(const name of ['electron.cjs','preload.cjs','backend/files.cjs','backend/cad-verification.cjs','backend/cad-ui-verification.cjs','scripts/offlinecad_ai.py','ai/OfflineCAD-KI-Kontext.json','licenses/CAD-Quellen-und-Build.txt','docs/CAD-ABNAHME-v0.11.md'])assert.ok(files.includes(name),'Missing required runtime file: '+name);
for(const name of Object.keys(integrity.files).filter(name=>name.startsWith('licenses/'))){const file='licenses/cad-kernel/'+name;assert.ok(files.includes(file),'Missing native license: '+file);assert.equal(digest(extractFile(archive,path.normalize(file))),integrity.files[name].sha256);}
for(const name of ['README.md','upstream-lock.json','system-license-lock.json','build-inputs.json','formnaro_cad.build-manifest.json','formnaro_cad.provenance.json','integrity.json'])assert.ok(files.includes('licenses/cad-kernel/'+name));
const directory=path.dirname(path.dirname(archive));
assert.ok(fs.existsSync(path.join(directory,'LICENSE')));assert.ok(fs.existsSync(path.join(directory,'LICENSES.chromium.html')));
assert.equal(digest(fs.readFileSync(path.join(directory,'scripts/offlinecad_ai.py'))),digest(fs.readFileSync('scripts/offlinecad_ai.py')));
fs.mkdirSync('work/cad-v011',{recursive:true});fs.writeFileSync('work/cad-v011/runtime-package-check.json',JSON.stringify({ok:true,archive,version:metadata.version,files:checked,nativeWasm:{file:wasm[0],sha256:integrity.files['formnaro_cad.wasm'].sha256},oneModelingKernel:true,noProfilesOrCredentials:true},null,2)+'\n');
console.log(JSON.stringify({ok:true,files:checked.length,version:metadata.version,oneModelingKernel:true,noProfilesOrCredentials:true}));
