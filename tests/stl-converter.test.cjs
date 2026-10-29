const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {validate,createStlConverter,installStlConverter}=require('../backend/stl-converter.cjs');
const args=options=>({id:'test-job',name:'Tést.stl',bytes:new Uint8Array([1,2,3]),options});
const fixture=path.resolve(__dirname,'fixtures/stl-bridge-process.cjs');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function context(){const root=await fs.mkdtemp(path.join(os.tmpdir(),'formnaro-bridge-test-'));return {root,runner:createStlConverter({command:process.execPath,prefix:[fixture],tempRoot:root}),dispose:()=>fs.rm(root,{recursive:true,force:true})};}
test('Reject invalid renderer inputs before native process creation',()=>{
 for(const name of ['.stl','   .stl','../part.stl','folder/part.stl','folder\\part.stl','bad\u0000.stl'])assert.throws(()=>validate({...args(),name}));
 for(const value of [null,{}, {...args(),id:'../x'}, {...args(),bytes:new Uint8Array()}, {...args(),name:'x.step'},args({unit:2}),args({tolerance:NaN}),args({mode:'arbitrary'}),args({samples:500.5}),args({repair:1}),args({fallback:'yes'}),args({command:'bad.exe'}),args({target_faces:0})])assert.throws(()=>validate(value));
 assert.equal(validate(args({unit:25.4,tolerance:.001})).unit,25.4);
});
test('File protocol validates hash and removes temporary input/outputs',async()=>{const c=await context();try{const value=await c.runner.convert(args());assert.match(Buffer.from(value.bytes).toString(),/ISO-10303-21/);assert.equal(value.report.input,'Tést.stl');assert.deepEqual(await fs.readdir(c.root),[]);assert.equal(c.runner.state(),null);await assert.rejects(c.runner.convert(args({mode:'exact'})),/bestätigt/);assert.deepEqual(await fs.readdir(c.root),[]);}finally{await c.dispose();}});
test('Cancel kills actual native job, scopes IDs, rejects duplicate work and cleans up',async()=>{const c=await context();try{const promise=c.runner.convert(args({mode:'smooth'}));const outcome=promise.catch(e=>e);while(!c.runner.state()?.pid)await pause(10);const pid=c.runner.state().pid;await assert.rejects(c.runner.convert(args()),/bereits/);assert.equal(await c.runner.cancel('different-id'),false);assert.equal(await c.runner.cancel('test-job'),true);assert.equal((await outcome).code,'ABORTED');assert.throws(()=>process.kill(pid,0));assert.deepEqual(await fs.readdir(c.root),[]);assert.equal(c.runner.state(),null);assert.ok((await c.runner.convert(args())).bytes.length);}finally{await c.dispose();}});
test('Immediate cancel before process spawn also settles cleanup',async()=>{const c=await context();try{const pending=c.runner.convert(args());const outcome=pending.catch(e=>e);await c.runner.cancel('test-job');assert.equal((await outcome).code,'ABORTED');assert.deepEqual(await fs.readdir(c.root),[]);}finally{await c.dispose();}});
test('IPC rejects foreign renderer and wrong cancel payload',async()=>{
 const {EventEmitter}=require('node:events'),win=new EventEmitter();win.webContents=new EventEmitter();win.webContents.isDestroyed=()=>false;const handlers={};installStlConverter(win,{directory:os.tmpdir(),ipcMain:{handle:(name,fn)=>handlers[name]=fn}});
 assert.equal((await handlers['cad-stl:convert']({sender:{}},args())).ok,false);assert.equal((await handlers['cad-stl:cancel']({sender:win.webContents},{})).ok,false);
});

test('Source analysis and hashed preview survive temporary cleanup',async()=>{
 const c=await context();try{
  const analysis=await c.runner.analyse(args());assert.deepEqual(analysis.analysis.face_regions,[0]);
  assert.deepEqual(await fs.readdir(c.root),[]);
  const result=await c.runner.convert(args());assert.equal(Buffer.from(result.artifacts.preview).toString(),'preview');
  assert.deepEqual(result.deviation.distances_mm,[.01]);assert.equal(result.report.preview,'Tést.vorschau.stl');
  assert.deepEqual(await fs.readdir(c.root),[]);
 }finally{await c.dispose();}
});

test('Oversized corrections and unsupported analysis actions are refused',()=>{
 assert.throws(()=>validate({...args(),action:'shell'}));
 assert.throws(()=>validate({...args(),edits:{payload:'x'.repeat(6*1024*1024)}}));
 assert.throws(()=>validate({...args(),commands:Array(21).fill({})}));
});
