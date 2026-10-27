// Copy only a proven output of the pinned common kernel into the portable
// repository package. Existing product dependencies are never modified.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),build=path.join(root,'work/cad-v011-build/config'),runtime=path.join(root,'cad-kernel-build/runtime');
const json=file=>JSON.parse(fs.readFileSync(file,'utf8')),sha=data=>createHash('sha256').update(data).digest('hex'),lock=json(path.join(root,'cad-kernel-build/upstream-lock.json'));
const provenance=json(path.join(build,'formnaro_cad.provenance.json')),validation=json(path.join(build,'formnaro_cad.build-manifest.json')),inputs=json(path.join(build,'build-inputs.json'));
const systemLicenses=json(path.join(root,'cad-kernel-build/system-license-lock.json'));
if(systemLicenses.emscriptenCommit!==lock.emsdk.emscriptenCommit)throw Error('System-library license source revision mismatch.');
for(const expected of systemLicenses.files){const bytes=fs.readFileSync(path.join(root,'cad-kernel-build/licenses',expected.file));if(bytes.length!==expected.bytes||sha(bytes)!==expected.sha256)throw Error(`System-library license source checksum mismatch: ${expected.file}`);}
for(const [name,value] of [['occt',provenance.source.occtCommit],['opencascadejs',provenance.source.opencascadejsCommit]])if(value!==lock.sources.find(source=>source.name.toLowerCase()===name)?.commit)throw Error(`Kernel provenance mismatch: ${name}`);
if(provenance.toolchain.emscripten!==lock.emsdk.version||!validation.validation_passed)throw Error('Pinned kernel build validation is missing.');
if(inputs.bridgeSha256!==sha(fs.readFileSync(path.join(root,'cad-kernel-build/wrappers/formnaro-cad-bridge.cpp')))||inputs.generatedYamlSha256!==sha(fs.readFileSync(path.join(build,'formnaro_cad.yml'))))throw Error('Kernel input hashes no longer match the current source.');
const wasm=fs.readFileSync(path.join(build,'formnaro_cad.wasm')),wasmInfo=provenance.output['formnaro_cad.wasm'];
if(wasm.length!==wasmInfo.size||!sha(wasm).startsWith(wasmInfo.sha256))throw Error('Kernel output differs from upstream build provenance.');
const proof=spawnSync(process.execPath,['--test','--test-concurrency=1','tests/cad-kernel-proof-extended.test.mjs'],{cwd:root,env:{...process.env,FORMNARO_CAD_MODULE:path.join(build,'formnaro_cad.js')},encoding:'utf8'});
if(proof.status!==0)throw Error(`Kernel runtime proof failed:\n${proof.stdout}\n${proof.stderr}`);
const proofTests=Number(proof.stdout.match(/^# tests (\d+)$/m)?.[1]);if(!Number.isSafeInteger(proofTests)||proofTests<6)throw Error('Kernel runtime proof is incomplete.');
fs.writeFileSync(path.join(root,'work/cad-v011-build/kernel-extended-proof.log'),proof.stdout);
fs.mkdirSync(runtime,{recursive:true});fs.mkdirSync(path.join(runtime,'licenses'),{recursive:true});
const files={};
function copy(source,destination){const data=fs.readFileSync(source),target=path.join(runtime,destination);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data);if(sha(fs.readFileSync(target))!==sha(data))throw Error('Runtime copy checksum mismatch.');files[destination]={bytes:data.length,sha256:sha(data)};}
for(const file of ['formnaro_cad.js','formnaro_cad.wasm','formnaro_cad.d.ts','formnaro_cad.provenance.json','formnaro_cad.build-manifest.json','build-inputs.json'])copy(path.join(build,file),file);
for(const file of fs.readdirSync(path.join(root,'cad-kernel-build/licenses')))copy(path.join(root,'cad-kernel-build/licenses',file),'licenses/'+file);
const sourceDir=name=>path.join(root,'work/cad-v011-build/sources',lock.sources.find(source=>source.name===name).directory);
copy(path.join(sourceDir('rapidjson'),'license.txt'),'licenses/RapidJSON.txt');
copy(path.join(sourceDir('freetype'),'docs/FTL.TXT'),'licenses/FreeType-FTL.txt');
copy(path.join(sourceDir('replicad'),'LICENSE'),'licenses/Replicad-MIT.txt');
copy(path.join(root,'cad-kernel-build/upstream-lock.json'),'upstream-lock.json');
copy(path.join(root,'cad-kernel-build/system-license-lock.json'),'system-license-lock.json');
copy(path.join(root,'cad-kernel-build/RUNTIME-NOTICE.md'),'README.md');
const metadata={name:'@formnaro/cad-kernel',version:'0.11.0-proof.1',private:true,type:'module',description:'Pinned original Replicad/OCCT kernel with native Formnaro affine, ray, BRep and double export interfaces.',license:'SEE LICENSE IN README.md',main:'./formnaro_cad.js',types:'./formnaro_cad.d.ts',exports:{'.':{types:'./formnaro_cad.d.ts',default:'./formnaro_cad.js'},'./wasm':'./formnaro_cad.wasm','./integrity':'./integrity.json','./package.json':'./package.json'}};
fs.writeFileSync(path.join(runtime,'package.json'),JSON.stringify(metadata,null,2)+'\n');files['package.json']={bytes:fs.statSync(path.join(runtime,'package.json')).size,sha256:sha(fs.readFileSync(path.join(runtime,'package.json')))};
fs.writeFileSync(path.join(runtime,'integrity.json'),JSON.stringify({schema:'Formnaro-CAD-runtime-integrity-v1',kernel:'same-replicad-occt-module',buildImage:lock.dockerImage,proof:{file:'tests/cad-kernel-proof-extended.test.mjs',sha256:sha(fs.readFileSync(path.join(root,'tests/cad-kernel-proof-extended.test.mjs'))),tests:proofTests,exitCode:0},files},null,2)+'\n');
console.log(JSON.stringify({runtime,wasmSha256:sha(wasm),runtimeProofTests:proofTests},null,2));
