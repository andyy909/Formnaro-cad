import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
import {validateProjectPhotos,photoAttachment,upsertProjectPhoto} from '../src/cad-photo-project.js';
import {createCadProject,cadProjectSnapshot,parseCadProject,serializeCadProject,createCadWorkspaceSerializer} from '../src/cad-project.js';
import {createCadController} from '../src/cad-controller.js';
import {cadTemplateSelection} from '../src/cad-persistence.js';
import {cadBytesDigest,cadGeometryDigest} from '../src/cad-geometry-digest.js';
import {encodeFnpackProject} from '../src/cad-fnpack-data.js';
import {writeFnpack,openFnpack} from '../backend/fnpack.cjs';
import {storedPhoto,assemblyFixture} from './expansion-fixtures.mjs';
const photos=()=>({version:1,items:[storedPhoto()]});
test('Byte SHA agrees with native crypto for UTF8, arbitrary binary, padding and multi-block images',()=>{
 for(const bytes of [new Uint8Array(),Uint8Array.from({length:255},(_,i)=>i),Uint8Array.from({length:65},(_,i)=>i),new TextEncoder().encode('Maßfoto')])assert.equal(cadBytesDigest(bytes),createHash('sha256').update(bytes).digest('hex'));
 assert.equal(cadGeometryDigest('Maßfoto'),createHash('sha256').update('Maßfoto').digest('hex'));
});
test('Stored references bind original image bytes, ID, MIME and bounded data; cache cannot bypass checks',()=>{
 const a=photos(),before=JSON.stringify(a);assert.deepEqual(validateProjectPhotos(a),a);assert.equal(JSON.stringify(a),before);const attached=photoAttachment(a.items[0]);assert.equal(attached.photo.name,a.items[0].reference.name);
 assert.deepEqual(upsertProjectPhoto(a,{...attached,photo:{...attached.photo,name:'Neu'}}).items[0].reference.name,'Neu');assert.equal(a.items[0].reference.name,'Prüfplatte 40 × 20');
 for(const edit of [a=>a.version=2,a=>a.items.push(a.items[0]),a=>a.items[0].reference.digest='0'.repeat(64),a=>a.items[0].reference.imageId='photo-'+'b'.repeat(16),a=>a.items[0].image.hostPath='C:/private',a=>a.items[0].image.mimeType='image/jpeg',a=>a.items[0].image.dataUrl='https://example.com/photo.png',a=>a.items[0].image.dataUrl='data:image/png;base64,AAAA',a=>a.items[0].image.dataUrl+='bad']){const value=photos();edit(value);assert.throws(()=>validateProjectPhotos(value));}
});
test('Only photo data introduces format19; original 5-18 stay readable; disguised schema is refused',()=>{
 const base=createCadProject(),p=cadProjectSnapshot({...base,photos:photos()});assert.equal(base.version,5);assert.equal(p.version,19);assert.deepEqual(parseCadProject(serializeCadProject(p)),p);
 for(const version of [5,7,8,9,10,11,12,13,14,15,16,17,18]){assert.equal(parseCadProject({...base,version}).version,version);assert.throws(()=>parseCadProject({...p,version}),/Projektformat 19/);}
 const noImage={...p};delete noImage.photos;assert.deepEqual(cadTemplateSelection({...p,nodes:assemblyFixture().nodes},['plate']).photos,undefined);
});
test('Controller photo preview/apply/noop/undo/redo requires no geometry worker and preserves entire assembly',async()=>{
 let workers=0;const cad=createCadController({initial:assemblyFixture(),createWorker:()=>{workers++;throw Error('No geometry worker expected');},createMeshWorker:()=>{throw Error('No mesh worker expected');}});
 try{const before=cad.serialize(),nodes=cad.snapshot().nodes,preview=await cad.previewPhotos(photos());assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,0);cad.apply(preview);assert.deepEqual(cad.snapshot().nodes,nodes);assert.equal(cad.state().undo,1);assert.equal(cad.snapshot().photos.items.length,1);
 const noop=await cad.previewPhotos(cad.snapshot().photos);assert.equal(cad.apply(noop).changed,false);assert.equal(cad.state().undo,1);cad.undo();assert.equal(cad.serialize(),before);cad.redo();assert.equal(cad.snapshot().photos.items.length,1);const removal=await cad.previewPhotos(null);cad.apply(removal);assert.equal(cad.snapshot().photos,undefined);cad.undo();assert.equal(cad.snapshot().photos.items.length,1);assert.equal(workers,0);
 }finally{cad.dispose();}
});
test('Metadata preview rejects smuggled geometry/settings, stale/duplicate apply and revision holds',async()=>{
 const cad=createCadController({initial:assemblyFixture(),createWorker:()=>{throw Error('No worker');},createMeshWorker:()=>{throw Error('No worker');}});try{
  const bad=cad.snapshot();bad.nodes[0].name='Changed';bad.photos=photos();await assert.rejects(cad.preview({kind:'photos'},{project:bad}),/keine Teile/);
  const p=await cad.previewPhotos(photos());const release=cad.holdRevision(cad.revision());assert.throws(()=>cad.apply(p),{code:'BUSY'});await assert.rejects(cad.previewPhotos(photos()),{code:'BUSY'});release();cad.apply(p);const done=cad.serialize();assert.equal(cad.apply(p).alreadyApplied,true);assert.equal(cad.serialize(),done);
  const old=cad.revision(),other=photos();other.items[0].reference.name='Neue Referenz';cad.apply(await cad.previewPhotos(other));await assert.rejects(cad.previewPhotos(photos(),{revision:old}),{code:'STALE_REVISION'});assert.throws(()=>cad.apply(p),{code:'STALE_REVISION'});
 }finally{cad.dispose();}
});
test('Actual indexed .fnpack stores originals and markings without geometry reads',async t=>{
 await fs.mkdir(path.resolve('work'),{recursive:true});
 const dir=await fs.mkdtemp(path.join(path.resolve('work'),'formnaro-photo-pack-'));t.after(async()=>{assert.equal(path.dirname(dir),path.resolve('work'));assert(path.basename(dir).startsWith('formnaro-photo-pack-'));await fs.rm(dir,{recursive:true,force:true});});
 const project=cadProjectSnapshot({...assemblyFixture(),photos:photos()}),encoded=encodeFnpackProject(project),file=path.join(dir,'Fotos.fnpack');
 await writeFnpack(file,encoded);let reads=0;const opened=await openFnpack(file,{onRead:r=>{if(r.kind==='geometry')reads++;}});try{assert.equal(opened.index.project.version,19);assert.deepEqual(opened.index.project.photos,project.photos);assert.equal(reads,0);assert.deepEqual(parseCadProject(opened.index.project).photos,project.photos);}finally{await opened.close();}
});
