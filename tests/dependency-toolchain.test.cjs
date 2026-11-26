// Run from the application root, mini, or mini-cad after npm ci.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {createRequire}=require('node:module');
const localRequire=createRequire(path.resolve('package.json'));

test('development archiver preserves selected files and unpacked native resources',async t=>{
 const asar=localRequire('@electron/asar');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'formnaro-toolchain-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const input=path.join(root,'input');
 await fs.mkdir(path.join(input,'native'),{recursive:true});
 await fs.writeFile(path.join(input,'package.json'),JSON.stringify({name:'archive-fixture',version:'1.0.0'}));
 await fs.writeFile(path.join(input,'main.js'),'module.exports = 42;\n');
 await fs.writeFile(path.join(input,'native','fixture.node'),'native fixture bytes');
 const archive=path.join(root,'fixture.asar');
 await asar.createPackageWithOptions(input,archive,{unpack:'**/*.node'});
 const entries=asar.listPackage(archive).map(p=>p.replaceAll('\\','/'));
 assert(entries.includes('/main.js'));
 assert(entries.includes('/native/fixture.node'));
 assert.equal(asar.extractFile(archive,'main.js').toString(),'module.exports = 42;\n');
 assert.equal(asar.statFile(archive,'native/fixture.node').unpacked,true);
 assert.equal(await fs.readFile(archive+'.unpacked/native/fixture.node','utf8'),'native fixture bytes');
 const {glob}=localRequire('glob');
 assert.deepEqual((await glob('**/*.{js,node}',{cwd:input})).map(p=>p.replaceAll('\\','/')).sort(),['main.js','native/fixture.node']);
 const signal=AbortSignal.abort(new Error('test cancellation'));
 await assert.rejects(glob('**/*',{cwd:input,signal}),/test cancellation/);
});
