const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto');
const {installPracticeRunner}=require('../backend/practice-runner.cjs');

test('the audit archive is revision-bound and cannot become a practice adoption reference',async()=>{
 const archive=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-practice-audit-'));
 const handlers=new Map(),win=new EventEmitter(),mainFrame={},webContents={mainFrame};
 win.webContents=webContents;win.isDestroyed=()=>false;
 const project={format:'OfflineCAD',nodes:[]},revision='b'.repeat(16),start='a'.repeat(16);
 let child;
 try{
  installPracticeRunner(win,{ipcMain:{handle:(key,handler)=>handlers.set(key,handler)},
   app:{isPackaged:false,getAppPath:()=>__dirname,getPath:()=>os.tmpdir()},auditDirectory:archive,
   spawnChild:(_exe,_args,{env})=>{
    assert.equal(env.FORMNARO_PRACTICE_AUDIT,'1');
    child=new EventEmitter();
    child.send=message=>{
     if(message.type!=='plan')return;
     child.emit('message',{type:'result',nonce:message.nonce,round:0,waiting:true,auditProject:project,value:{
      ok:false,steps:[],reason:'Fixed discrepancy',report:{revision,failedAction:{kind:'quality'},state:{known:[],selectable:[],selected:[]},
       quality:{mode:'enforce',revision,blocked:true,items:[]}}
     }});
    };
    queueMicrotask(()=>child.emit('message',{type:'ready'}));
    return child;
   }});
  const event={sender:webContents,senderFrame:mainFrame};
  const reply=await handlers.get('cad-practice:start')(event,{
   plan:{version:1,title:'Test',actions:[{kind:'shape',type:'box',as:'block'}]},
   projectCopy:{project,revision:start,selection:[]},recovery:'text',quality:{mode:'enforce',criteria:[]}
  });
  assert.equal(reply.ok,true);assert(reply.value.continuationId);
  assert.equal(reply.value.auditProject,undefined);assert.equal(reply.value.resultRef,undefined);
  assert.equal((await handlers.get('cad-practice:project-result')(event,{action:'read',id:reply.value.continuationId})).ok,false);
  const [session]=fs.readdirSync(archive);
  const evidence=JSON.parse(fs.readFileSync(path.join(archive,session,`round-0-${revision}.json`),'utf8'));
  assert.deepEqual(evidence.project,project);
  assert.equal(evidence.revision,revision);
  assert.equal(evidence.stage,'blocked');
  assert.equal(evidence.sha256,createHash('sha256').update(JSON.stringify(project)).digest('hex'));
 }finally{
  child?.emit('exit',0);
  for(const entry of fs.readdirSync(archive,{withFileTypes:true})){
   const directory=path.join(archive,entry.name);
   for(const file of fs.readdirSync(directory))fs.unlinkSync(path.join(directory,file));
   fs.rmdirSync(directory);
  }
  fs.rmdirSync(archive);
 }
});
