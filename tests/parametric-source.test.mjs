import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import {createHash} from 'node:crypto';
import {createCadProject,cadProjectSnapshot,validateCadProject,serializeCadProject,parseCadProject,cadProjectRevision} from '../src/cad-project.js';
import {validateParametricSource,parametricSourceBytes,parametricSha256,parametricSceneMetadata} from '../src/cad-parametric-data.js';
import {createCadTransactions} from '../src/cad-transactions.js';
import {createCadPersistence,MIXED_LIBRARY_KEY} from '../src/cad-persistence.js';
import {createCadRecovery,MIXED_AUTOSAVE_KEY,CAD_AUTOSAVE_KEY} from '../src/cad-recovery.js';
const hash=b=>createHash('sha256').update(b).digest('hex');
const brep='synthetic-brep';
const payload=zlib.gzipSync(Buffer.from('{"format":"solidcraft/27","name":"Test"}'));
function source(){return {format:'FormnaroParametricSource',version:1,engine:'solidcraft',engineVersion:'0.16.2',compression:'gzip',designBase64:payload.toString('base64'),designSha256:hash(payload),brepSha256:hash(brep)};}
function node(){return {id:'part',kind:'cad',source:'step',solid:true,name:'Teil',transform:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],brep:{format:'OpenCascade-BRep',data:'synthetic-brep',triangulation:false},stats:{bounds:{min:[0,0,0],max:[40,30,10]},volume:12000,solids:1},metadata:{parametricSource:source()}};}
test('portable parametric sources require format 9 and retain exact payload across save, undo snapshots and duplication',()=>{
 const p=createCadProject({nodes:[node()]});assert.equal(p.version,9);const encoded=serializeCadProject(p),read=parseCadProject(encoded);assert.deepEqual(read,p);assert.deepEqual(cadProjectSnapshot(read),p);assert.deepEqual(Buffer.from(parametricSourceBytes(read.nodes[0].metadata.parametricSource)),payload);
 const old={...p,version:8};assert.throws(()=>validateCadProject(old));const copy=structuredClone(read.nodes[0]);copy.id='copy';read.nodes.push(copy);assert.equal(parseCadProject(serializeCadProject(read)).nodes[1].metadata.parametricSource.designBase64,payload.toString('base64'));
});
test('ordinary projects retain their existing format and revision semantics',()=>{
 const p=createCadProject();assert.equal(p.version,5);const a=cadProjectRevision(p);assert.equal(cadProjectRevision(parseCadProject(serializeCadProject(p))),a);assert.equal(cadProjectSnapshot({...p,version:8}).version,8);
 const q=createCadProject({nodes:[node()]});const r=cadProjectRevision(q);q.nodes[0].metadata.parametricSource.designBase64=zlib.gzipSync(Buffer.from('different')).toString('base64');assert.notEqual(cadProjectRevision(q),r);
});
test('strict source boundary refuses unknown engines, fields, hashes and invalid base64 before an editor starts',()=>{
 for(const patch of [{engine:'remote'},{engineVersion:'latest'},{compression:'zip'},{designSha256:'x'},{brepSha256:'x'},{designBase64:'!!!='},{designBase64:'AB=='},{designBase64:'AA=A'},{designBase64:'AAAA='},{path:'C:/untrusted'}])assert.throws(()=>validateParametricSource({...source(),...patch}));
 assert.equal(Buffer.from(parametricSourceBytes(source())).toString('base64'),payload.toString('base64'));
});
test('legacy source hashes match actual compressed bytes without starting an editor',async()=>{
 assert.equal(await parametricSha256(payload),hash(payload));assert.equal(await parametricSha256('abc'),hash('abc'));
});
test('scene metadata retains source identity without copying embedded data into UI and AI replies',()=>{
 const metadata={notes:'Keep this note',parametricSource:source()},before=structuredClone(metadata),summary=parametricSceneMetadata(metadata);
 assert.equal(summary.notes,metadata.notes);assert.equal(summary.parametricSource.designSha256,metadata.parametricSource.designSha256);assert.equal(summary.parametricSource.compressedBytes,payload.length);assert.equal(summary.parametricSource.embedded,true);assert.equal(summary.parametricSource.designBase64,undefined);assert.deepEqual(metadata,before);
});
test('parametric library and recovery retain source bytes and keep older CAD data separate',async()=>{
 const entries=new Map(),storage={getItem:k=>entries.get(k)??null,setItem:(k,v)=>entries.set(k,v)},p=createCadProject({nodes:[node()]}),transactions=createCadTransactions({initial:p,build:x=>x}),persist=createCadPersistence({storage,transactions,verify:async x=>x});
 const entry=await persist.saveTemplate({name:'Parametrischer Entwurf',ids:['part']});assert.equal(entry.project.version,9);const raw=JSON.parse(storage.getItem(MIXED_LIBRARY_KEY));assert.equal(raw.version,9);assert.equal(persist.listTemplates()[0].project.nodes[0].metadata.parametricSource.designBase64,payload.toString('base64'));
 const old=serializeCadProject(createCadProject());storage.setItem(CAD_AUTOSAVE_KEY,old);const recovery=createCadRecovery(storage);await recovery.load(async x=>x);assert.equal(recovery.write(serializeCadProject(p),{version:9}),true);assert.equal(storage.getItem(CAD_AUTOSAVE_KEY),old);assert.equal((await createCadRecovery(storage).load(async x=>x)).version,9);assert.equal(parseCadProject(storage.getItem(MIXED_AUTOSAVE_KEY)).nodes[0].metadata.parametricSource.designSha256,hash(payload));
});
