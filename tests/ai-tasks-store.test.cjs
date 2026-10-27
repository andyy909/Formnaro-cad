const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {fork}=require('node:child_process'),{once}=require('node:events');
const {createAITaskStore}=require('../backend/ai-tasks.cjs');
const provider='https://synthetic-provider.invalid',binding={revision:'model-r',projectDigest:'a'.repeat(64),referenceDigest:'b'.repeat(64),selectionDigest:'c'.repeat(64)};
const requirements={purpose:'technical',objective:'Plate 60 × 40 × 6 mm; preserve the original',checks:[{kind:'size',target:'$plate',space:'worldAxes',expected:[60,40,6]}],assumptions:['Hidden depth is not inferred'],protectedTargets:[{rootId:'original',path:[]}]};
const start={action:'start',binding,requirements,input:{prompt:'Create the plate',chat:true,usageTaskId:'synthetic-task'},maxSteps:24};
const checkpoint=usedSteps=>({phase:'failure',progress:{version:1,maxSteps:24,purpose:'technical',usedSteps,withoutProgress:usedSteps,observations:[],failures:[],bestQuality:null,stop:null},requiredChecks:requirements.checks,taskEvidence:{revision:'model-r',failures:[{code:'FREECAD_FAILED',message:'Synthetic invalid BOP'}]}});
function setup(t,options={}){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-ai-tasks-')),stores=[];
 const make=extra=>{const store=createAITaskStore({directory,...options,...extra});stores.push(store);return store;};
 t.after(()=>{for(const store of stores)store.close();assert(path.resolve(directory).startsWith(path.join(path.resolve(os.tmpdir()),'formnaro-ai-tasks-')));fs.rmSync(directory,{recursive:true,force:true});});
 return {directory,make,store:make()};
}
const act=(s,args,p=provider)=>s.request(args,p);
const update=(r,lease,extra={})=>({id:r.id,generation:r.generation,binding,...(lease===undefined?{}:{lease}),...extra});

test('A private task persists explicit requirements, exact native candidate data and consumed budget across independent store instances',t=>{
 const {directory,store,make}=setup(t),original=act(store,start),run=act(store,{action:'claim',...update(original)});
 const value={...checkpoint(2),candidate:{project:{nodes:[{id:'draft',source:'step',step:{base64:'synthetic STEP'},metadata:{freecadSource:{documentBase64:'synthetic FCStd'}}}]},result:{commands:[{op:'python',code:'exact original program'}]}}};
 let r=act(store,{action:'checkpoint',...update(run,run.lease,{value})});r=act(store,{action:'finish',...update(r,run.lease,{status:'interrupted'})});
 const other=make(),loaded=act(other,{action:'read',id:r.id});assert.deepEqual(loaded.requirements,requirements);assert.deepEqual(loaded.checkpoint,value);assert.equal(loaded.checkpoint.progress.usedSteps,2);assert.equal(loaded.status,'interrupted');assert(!('lease' in loaded));
 assert(fs.readFileSync(path.join(directory,r.id+'.json'),'utf8').includes('exact original program'));
});
test('Concurrent live store instances cannot claim twice or write without the current lease and generation',t=>{
 const {store,make}=setup(t),original=act(store,start),running=act(store,{action:'claim',...update(original)}),other=make();
 assert.throws(()=>act(other,{action:'claim',...update(original)}),{code:'AI_TASK_STALE'});const current=act(other,{action:'read',id:original.id});assert.equal(current.status,'running');assert.throws(()=>act(other,{action:'claim',...update(current)}),{code:'BUSY'});
 assert.throws(()=>act(other,{action:'checkpoint',...update(current,running.lease,{value:checkpoint(1)})}),{code:'AI_TASK_LEASE_REQUIRED'});
 assert.throws(()=>act(store,{action:'checkpoint',...update(current,'wrong',{value:checkpoint(1)})}),{code:'AI_TASK_LEASE_REQUIRED'});
 act(store,{action:'finish',...update(running,running.lease,{status:'interrupted'})});
});
test('Changed project, native-source, reference or selection identity blocks continuation; object key ordering is irrelevant',t=>{
 const {store}=setup(t),original=act(store,start);
 for(const key of ['revision','projectDigest','referenceDigest','selectionDigest'])assert.throws(()=>act(store,{action:'claim',...update(original),binding:{...binding,[key]:key==='revision'?'other':'d'.repeat(64)}}),{code:'STALE_REVISION'});
 const run=act(store,{action:'claim',...update(original),binding:Object.fromEntries(Object.entries(binding).reverse())});act(store,{action:'finish',...update(run,run.lease,{status:'interrupted'})});
});
test('A recorded budget cannot rewind, change purpose or increase during continuation',t=>{
 const {store}=setup(t),original=act(store,start),run=act(store,{action:'claim',...update(original)}),r=act(store,{action:'checkpoint',...update(run,run.lease,{value:checkpoint(3)})});
 assert.throws(()=>act(store,{action:'checkpoint',...update(r,run.lease,{value:checkpoint(2)})}),{code:'AI_TASK_BUDGET_REWIND'});
 for(const patch of [{maxSteps:80},{purpose:'generative'}])assert.throws(()=>act(store,{action:'checkpoint',...update(r,run.lease,{value:{...checkpoint(4),progress:{...checkpoint(4).progress,...patch}}})}),{code:'AI_TASK_STORE_INVALID'});
 act(store,{action:'finish',...update(r,run.lease,{status:'interrupted'})});
});
test('Provider journals are isolated, completed tasks cannot execute twice, and credentials are rejected as task configuration',t=>{
 const {store}=setup(t),original=act(store,start);assert.deepEqual(act(store,{action:'list'},'other-provider'),[]);assert.throws(()=>act(store,{action:'read',id:original.id},'other-provider'),{code:'AI_TASK_PROVIDER_MISMATCH'});
 assert.throws(()=>act(store,{...start,input:{prompt:'x',requestConfig:{apiKey:'MUST_NOT_STORE'}}}),/Zugangsdaten/);
 const run=act(store,{action:'claim',...update(original)});assert.throws(()=>act(store,{action:'checkpoint',...update(run,run.lease,{value:{...checkpoint(1),apiKey:'MUST_NOT_STORE'}})}),/Zugangsdaten/);
 const done=act(store,{action:'finish',...update(run,run.lease,{status:'applied'})});assert.throws(()=>act(store,{action:'claim',...update(done)}),{code:'AI_TASK_FINISHED'});
});
test('A failed atomic write leaves the previous checkpoint and generation intact',t=>{
 let reject=false;const {store,directory}=setup(t,{write:(file,text)=>{if(reject)throw Error('simulated disk full');require('../backend/program-storage.cjs').writeAtomicSync(file,text);}});
 const original=act(store,start),run=act(store,{action:'claim',...update(original)}),saved=act(store,{action:'checkpoint',...update(run,run.lease,{value:checkpoint(1)})}),before=fs.readFileSync(path.join(directory,saved.id+'.json'));
 reject=true;assert.throws(()=>act(store,{action:'checkpoint',...update(saved,run.lease,{value:checkpoint(2)})}),/disk full/);assert.deepEqual(fs.readFileSync(path.join(directory,saved.id+'.json')),before);reject=false;assert.equal(act(store,{action:'read',id:saved.id}).generation,saved.generation);act(store,{action:'finish',...update(saved,run.lease,{status:'interrupted'})});
});
test('Corruption and escaped IDs are diagnosed without replacing another record or executing saved programs',t=>{
 const {store,directory}=setup(t),original=act(store,start),file=path.join(directory,original.id+'.json');for(const id of ['../escape','C:/file','a','../../x.json'])assert.throws(()=>act(store,{action:'read',id}));
 const damaged=JSON.parse(fs.readFileSync(file,'utf8'));damaged.record.requirements.objective='changed';fs.writeFileSync(file,JSON.stringify(damaged));const before=fs.readFileSync(file);assert.throws(()=>act(store,{action:'read',id:original.id}),{code:'AI_TASK_CORRUPT'});assert.equal(act(store,{action:'list'})[0].status,'corrupt');assert.deepEqual(fs.readFileSync(file),before);
});
test('Quota exhaustion preserves all prior task records',t=>{
 const {store,directory}=setup(t,{maxTasks:1}),original=act(store,start),file=path.join(directory,original.id+'.json'),before=fs.readFileSync(file);assert.throws(()=>act(store,start),{code:'AI_TASK_QUOTA'});assert.deepEqual(fs.readFileSync(file),before);
});
test('An actual second process cannot resume a live owner; after verified process exit its checkpoint is interrupted and resumable without resetting budget',async t=>{
 const {store,directory}=setup(t),original=act(store,start);const child=fork(path.join(__dirname,'fixtures/ai-task-journal-child.cjs'),[JSON.stringify({directory})],{stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});
 try{await once(child,'message');let sequence=0;
 const call=args=>new Promise((resolve,reject)=>{const id=++sequence;const listener=m=>{if(m.id!==id)return;child.off('message',listener);m.ok?resolve(m.value):reject(Object.assign(Error(m.error),{code:m.code}));};child.on('message',listener);child.send({id,args,provider});});
 const run=await call({action:'claim',...update(original)}),saved=await call({action:'checkpoint',...update(run,run.lease,{value:checkpoint(2)})});process.kill(child.pid,0);assert.throws(()=>act(store,{action:'claim',...update(saved)}),{code:'BUSY'});
 const exited=once(child,'exit');child.send({crash:true});const [code]=await exited;assert.equal(code,17);const interrupted=act(store,{action:'read',id:original.id});assert.equal(interrupted.status,'interrupted');assert.equal(interrupted.checkpoint.progress.usedSteps,2);
 const resumed=act(store,{action:'claim',...update(interrupted)});assert.notEqual(resumed.lease,run.lease);assert.equal(resumed.checkpoint.progress.usedSteps,2);act(store,{action:'finish',...update(resumed,resumed.lease,{status:'interrupted'})});
 }finally{if(child.exitCode===null&&child.signalCode===null){const closed=once(child,'exit');child.kill();await closed;}}
});
