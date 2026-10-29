import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createCadProject,cadProjectStoredVersion,parseCadProject,serializeCadProject} from '../src/cad-project.js';
import {openFnpack,writeFnpack} from '../backend/fnpack.cjs';

test('project format 29 is accepted and nested STEP drill requests version 29',()=>{
 const v28=createCadProject({version:28}),v29=createCadProject({version:29});assert.equal(parseCadProject(serializeCadProject(v28)).version,28);assert.equal(parseCadProject(serializeCadProject(v29)).version,29);assert.equal(cadProjectStoredVersion({nodes:[{children:[{drill:{version:3}}]}]}),29);assert.equal(cadProjectStoredVersion({nodes:[{children:[{drill:{version:2}}]}]}),28);assert.throws(()=>parseCadProject({...v29,version:30}),/Projektformat/);
});
test('real FNPACK retains format 29 and checks external geometry on reread',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'formnaro-fnpack-v29-'));t.after(async()=>{assert.equal(path.dirname(dir),os.tmpdir());assert.ok(path.basename(dir).startsWith('formnaro-fnpack-v29-'));await fs.rm(dir,{recursive:true,force:true});});
 const bytes=Buffer.from('retained STEP geometry'),sha256=createHash('sha256').update(bytes).digest('hex'),ref={format:'Formnaro-GeometryRef',kind:'brep',sha256,bytes:bytes.length},project={format:'OfflineCAD',version:29,nodes:[{id:'result',drill:{version:3,sourceId:'previous',boxId:'step'},children:[{id:'previous',children:[{id:'step',brep:ref}]}],brep:ref}]},file=path.join(dir,'v29.fnpack');await writeFnpack(file,{project,blocks:[{sha256,bytes}]});const opened=await openFnpack(file);try{assert.deepEqual(opened.index.project,project);assert.deepEqual(await opened.read(sha256),bytes);}finally{await opened.close();}const saved=await fs.readFile(file);await assert.rejects(writeFnpack(file,{project:{...project,version:30},blocks:[{sha256,bytes}]}),{code:'FNPACK_INVALID'});assert.deepEqual(await fs.readFile(file),saved);
});
