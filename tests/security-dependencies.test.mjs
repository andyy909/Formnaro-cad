import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';import {unzipSync,strFromU8} from 'fflate';
const json=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));
test('Root and both Mini lockfiles use fixed Electron and Undici versions',()=>{
 for(const root of ['','mini/','mini-cad/']){
  const pkg=json(root+'package.json'),lock=json(root+'package-lock.json');assert.equal(pkg.devDependencies.electron,'44.9.3');assert.equal(lock.packages['node_modules/electron'].version,'44.9.3');
  for(const [name,p]of Object.entries(lock.packages))if(name.endsWith('/undici'))assert.equal(p.version,'7.30.1');
 }
});
test('Actual scientific security wheels match their complete SHA and installed metadata',()=>{
 const manifest=json('python-runtime/packages/manifest.json'),overrides=json('python-runtime/packages/security-overrides.json');
 for(const [name,version]of [['pillow','13.0.0'],['setuptools','84.2.1']]){
  const row=manifest.packages.find(p=>p.name===name);assert.equal(row.version,version);assert.equal(row.sha256,overrides[name].sha256);
  const bytes=fs.readFileSync(new URL('../python-runtime/packages/'+row.file,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);
  const contents=unzipSync(bytes),metadata=Object.entries(contents).find(([k])=>k.endsWith('.dist-info/METADATA'));assert.ok(metadata);assert.match(strFromU8(metadata[1]),new RegExp('^Version: '+version.replaceAll('.','\\.')+'$','m'));
 }
 for(const file of fs.readdirSync(new URL('../python-runtime/packages/',import.meta.url)))assert.ok(!/^pillow-12\.|^setuptools-82\./.test(file));
});
