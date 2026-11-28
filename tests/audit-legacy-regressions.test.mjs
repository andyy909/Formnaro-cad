import test from 'node:test';import assert from 'node:assert/strict';import {unzipSync,strFromU8} from 'fflate';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {threeMF} from '../src/mesh-engine/exports.js';
import {atomic as miniAtomic} from '../mini/backend/atomic.cjs';
import {atomic as miniCadAtomic} from '../mini-cad/backend/atomic.cjs';
test('BUG-52 classic 3MF writes alpha from each part opacity',()=>{const parts=[{name:'transparent',color:'#123456',opacity:.25,data:{verts:[0,0,0,1,0,0,0,1,0],triangles:[0,1,2]}}],model=strFromU8(unzipSync(threeMF(parts))['3D/3dmodel.model']);assert(model.includes('#12345640'));});
for(const [app,atomic] of [['mini',miniAtomic],['mini-cad',miniCadAtomic]]){
 test('BUG-59 '+app+' atomic writes preserve a preexisting unrelated .tmp file',t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-audit-mini-'));
  t.after(()=>{
   assert.equal(path.dirname(directory),os.tmpdir());
   fs.rmSync(directory,{recursive:true,force:true});
  });
  const file=path.join(directory,'project.fmini');
  fs.writeFileSync(file+'.tmp','not owned by Formnaro');
  atomic(file,'new project');
  assert.equal(fs.readFileSync(file+'.tmp','utf8'),'not owned by Formnaro');
  assert.equal(fs.readFileSync(file,'utf8'),'new project');
  assert.deepEqual(fs.readdirSync(directory).sort(),['project.fmini','project.fmini.tmp']);
 });
}
