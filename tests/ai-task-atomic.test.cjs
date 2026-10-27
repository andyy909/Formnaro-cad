const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {writeTaskAtomicSync}=require('../backend/ai-task-atomic.cjs');
function fixture(t){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-task-atomic-')),file=path.join(directory,'checkpoint.json');fs.writeFileSync(file,'last durable checkpoint');t.after(()=>{assert(path.resolve(directory).startsWith(path.join(path.resolve(os.tmpdir()),'formnaro-task-atomic-')));fs.rmSync(directory,{recursive:true,force:true});});return {directory,file};}
test('A temporary Windows file lock retains the old checkpoint until one atomic commit succeeds',t=>{
 const {directory,file}=fixture(t),delays=[];let attempts=0;
 writeTaskAtomicSync(file,'Maße nach Neustart: 55 × 40 × 6',{platform:'win32',wait:ms=>delays.push(ms),rename:(from,to)=>{assert.equal(fs.readFileSync(file,'utf8'),'last durable checkpoint');assert.equal(fs.readFileSync(from,'utf8'),'Maße nach Neustart: 55 × 40 × 6');attempts++;if(attempts<3)throw Object.assign(Error('Temporary indexer lock'),{code:'EPERM'});fs.renameSync(from,to);}});
 assert.equal(fs.readFileSync(file,'utf8'),'Maße nach Neustart: 55 × 40 × 6');assert.equal(attempts,3);assert.deepEqual(delays,[10,20]);assert.deepEqual(fs.readdirSync(directory),['checkpoint.json']);
});
test('A permanent Windows rename failure is bounded and leaves the last committed file exact',t=>{
 const {directory,file}=fixture(t);let attempts=0,total=0;
 assert.throws(()=>writeTaskAtomicSync(file,'new incomplete state',{platform:'win32',wait:ms=>total+=ms,rename:()=>{attempts++;throw Object.assign(Error('Persistent lock'),{code:'EACCES'});}}),{code:'EACCES'});
 assert.equal(attempts,6);assert.equal(total,310);assert.equal(fs.readFileSync(file,'utf8'),'last durable checkpoint');assert.deepEqual(fs.readdirSync(directory),['checkpoint.json']);
});
test('Disk-full errors do not retry or replace the last committed checkpoint',t=>{
 const {file}=fixture(t);let attempts=0;assert.throws(()=>writeTaskAtomicSync(file,'new',{platform:'win32',wait:()=>assert.fail('No retry for disk full'),rename:()=>{attempts++;throw Object.assign(Error('Disk full'),{code:'ENOSPC'});}}),{code:'ENOSPC'});assert.equal(attempts,1);assert.equal(fs.readFileSync(file,'utf8'),'last durable checkpoint');
});
