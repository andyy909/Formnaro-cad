import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {openFnpack,writeFnpack} from '../backend/fnpack.cjs';
test('backend roundtrip retains version 28 drill data and independently rereads its indexed geometry',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'formnaro-fnpack-v28-'));t.after(async()=>{assert.equal(path.dirname(dir),os.tmpdir());assert.ok(path.basename(dir).startsWith('formnaro-fnpack-v28-'));await fs.rm(dir,{recursive:true,force:true});});
 const bytes=Buffer.from('original geometry'),sha256=createHash('sha256').update(bytes).digest('hex'),ref={format:'Formnaro-GeometryRef',kind:'brep',sha256,bytes:bytes.length},project={format:'OfflineCAD',version:28,nodes:[{id:'result',drill:{version:2,sourceId:'original',boxId:'cylinder'},children:[{id:'original',children:[{id:'cylinder',brep:ref}]}],brep:ref}]},file=path.join(dir,'v28.fnpack');
 await writeFnpack(file,{project,blocks:[{sha256,bytes}]});const opened=await openFnpack(file);try{assert.deepEqual(opened.index.project,project);assert.deepEqual(await opened.read(sha256),bytes);}finally{await opened.close();}
 const prior=await fs.readFile(file);await assert.rejects(writeFnpack(file,{project:{...project,version:30},blocks:[{sha256,bytes}]}),{code:'FNPACK_INVALID'});assert.deepEqual(await fs.readFile(file),prior);
});
