const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {validatePracticePlan,installPracticeRunner}=require('../backend/practice-runner.cjs');
const shape=(as,type='box')=>({kind:'shape',type,as});
const plan=()=>({version:1,title:'Übung',actions:[shape('block'),{kind:'set',field:'size-0',value:40},shape('hole','cylinder'),{kind:'role',value:'hole'},{kind:'select',targets:['block','hole']},{kind:'group',as:'result'}]});
test('practice plan is bounded, uses only valid visible actions and cannot select grouped-away roots',()=>{
 assert.deepEqual(validatePracticePlan(plan()),plan());
 for(const action of [{kind:'shape',type:'box',as:'../../x'},{kind:'set',field:'#secret',value:1},{kind:'set',field:'size-0',value:0},{kind:'set',field:'pos-0',value:Infinity},{kind:'set',field:'pos-0',value:1e-7},{kind:'set',field:'pos-0',value:12.1234567},{kind:'script',code:'evil'},{kind:'select',targets:['nonexistent']}])assert.throws(()=>validatePracticePlan({version:1,title:'x',actions:[shape('x'),action]}));
 assert.doesNotThrow(()=>validatePracticePlan({version:1,title:'x',actions:[shape('x'),{kind:'set',field:'pos-0',value:0.000001}]}));
 assert.throws(()=>validatePracticePlan({...plan(),actions:[...plan().actions,{kind:'select',targets:['block']}]}));
 assert.throws(()=>validatePracticePlan({...plan(),actions:[...plan().actions,shape('block')]}));
 assert.throws(()=>validatePracticePlan({version:1,title:'x',actions:Array(51).fill(shape('x'))}));
});
test('sketch gestures accept local millimetres and reject pixel coordinates or targets outside their contract',async()=>{
 const {validateAgentPracticePlan}=await import('../src/cad-agent-ui-policy.js');
 const valid={kind:'sketch-gesture',point:[0,0],to:[4,0]};
 for(const validate of [validatePracticePlan,validateAgentPracticePlan]){
  assert.doesNotThrow(()=>validate({...plan(),actions:[valid]}));
  for(const action of [{...valid,target:'#outside'},{...valid,point:[NaN,0]},{...valid,to:[0,10001]},{...valid,point:[0,0,1]},{...valid,add:'shift'}]){
   assert.throws(()=>validate({...plan(),actions:[action]}),/Skizzengeste/);
  }
 }
});
test('separate child receives only plan, without host credential env; cancel before ready is preserved and window stays tracked after result',async()=>{
 const handlers=new Map(),ipcMain={handle:(name,fn)=>handlers.set(name,fn)},mainFrame={},webContents={mainFrame},win={webContents,isDestroyed:()=>false},children=[];
 const spawnChild=(exe,args,options)=>{const child=new EventEmitter();child.sent=[];child.send=v=>child.sent.push(v);child.kill=()=>{child.killed=true;};children.push({child,exe,args,options});return child;};
 const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='dummy-test-sentinel';
 try{
  installPracticeRunner(win,{ipcMain,app:{isPackaged:false,getAppPath:()=>'/test-app'},spawnChild});const event={sender:webContents,senderFrame:mainFrame};
  const operation=handlers.get('cad-practice:start')(event,plan());assert.equal(children.length,1);assert.equal(children[0].options.env.OPENAI_API_KEY,undefined);assert.equal(children[0].options.env.ELECTRON_RUN_AS_NODE,undefined);assert.equal(children[0].options.windowsHide,false);assert(children[0].args.includes('--formnaro-practice-child'));
  assert.equal((await handlers.get('cad-practice:cancel')(event)).value,true);const child=children[0].child;child.emit('message',{type:'ready'});assert.deepEqual(child.sent.map(x=>x.type),['plan','cancel']);
  child.emit('message',{type:'result',nonce:child.sent[0].nonce,value:{ok:false,reason:'Abgebrochen',steps:[]}});assert.equal((await operation).value.ok,false);
  assert.equal((await handlers.get('cad-practice:start')(event,plan())).ok,false,'An open exercise remains tracked after reporting');child.emit('exit',0);
  const again=handlers.get('cad-practice:start')(event,plan());assert.equal(children.length,2);children[1].child.emit('exit',0);assert.equal((await again).ok,false);
  assert.equal((await handlers.get('cad-practice:start')({sender:{},senderFrame:mainFrame},plan())).ok,false);
 }finally{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});
test('active-time safety limit stops counting during an explicit pause',async()=>{
 const handlers=new Map(),ipcMain={handle:(name,fn)=>handlers.set(name,fn)},mainFrame={},webContents={mainFrame},win={webContents,isDestroyed:()=>false};let child;
 const spawnChild=()=>{child=new EventEmitter();child.messages=[];child.send=m=>child.messages.push(m);child.kill=()=>{child.killed=true;};return child;};
 installPracticeRunner(win,{ipcMain,app:{isPackaged:false,getAppPath:()=>'/test-app'},spawnChild,timeoutMs:150});const event={sender:webContents,senderFrame:mainFrame};
 const pending=handlers.get('cad-practice:start')(event,plan());child.emit('message',{type:'ready'});const nonce=child.messages[0].nonce;
 child.emit('message',{type:'status',nonce,paused:true});await new Promise(r=>setTimeout(r,220));assert.equal(child.killed,undefined,'Paused exercise must not be killed');
 child.emit('message',{type:'status',nonce,paused:false});await new Promise(r=>setTimeout(r,20));child.emit('message',{type:'result',nonce,value:{ok:true,steps:[],report:{objectCount:0}}});assert.equal((await pending).value.ok,true);child.emit('exit',0);
});

test('the trusted window supplies an independent project copy beside the practice plan', async () => {
 const handlers = new Map();
 const mainFrame = {};
 const webContents = {mainFrame};
 const win = {webContents, isDestroyed: () => false};
 const ipcMain = {handle: (name, handler) => handlers.set(name, handler)};
 const child = new EventEmitter();
 const messages = [];
 child.send = message => messages.push(message);
 let launches = 0;
 installPracticeRunner(win, {
  ipcMain,
  app: {isPackaged: false, getAppPath: () => '/test-app'},
  spawnChild: () => {launches++; return child;}
 });
 const start = handlers.get('cad-practice:start');
 const event = {sender: webContents, senderFrame: mainFrame};
 const projectCopy = {
  revision: '0123456789abcdef',
  project: {format: 'OfflineCAD', nodes: [{id: 'holder', name: 'Unsaved holder'}]},
  selection: [{rootId: 'holder', path: []}]
 };
 assert.throws(() => validatePracticePlan({...plan(), projectCopy}));
 assert.equal((await start({...event, senderFrame: {}}, {plan: plan(), projectCopy})).ok, false);
 assert.equal((await start(event, {plan: plan(), projectCopy: {...projectCopy, path: 'external'}})).ok, false);
 assert.equal(launches, 0);

 const operation = start(event, {plan: plan(), projectCopy});
 assert.equal(launches, 1);
 projectCopy.project.nodes[0].name = 'Later main-window edit';
 child.emit('message', {type: 'ready'});
 assert.equal(messages[0].projectCopy.project.nodes[0].name, 'Unsaved holder');
 assert.deepEqual(messages[0].projectCopy.selection, [{rootId: 'holder', path: []}]);
 assert.deepEqual(messages[0].plan, plan());
 const project={...messages[0].projectCopy.project,nodes:[{id:'holder',name:'Exercise result'}]};
 child.emit('message', {type: 'result', nonce: messages[0].nonce, value: {ok: true, steps: []},project});
 const {value}=await operation;
 assert.equal(value.ok,true);
 assert.equal(value.project,undefined);
 assert.match(value.resultRef,/^[a-f0-9]{48}$/);
 const result=handlers.get('cad-practice:project-result');
 const read={action:'read',id:value.resultRef};
 assert.equal((await result({...event,senderFrame:{}},read)).ok,false);
 child.emit('exit', 0);
 assert.deepEqual((await result(event,read)).value,project);
 assert.equal((await result(event,{action:'discard',id:value.resultRef})).ok,true);
 assert.equal((await result(event,read)).ok,false);
});

test('one child retains the confirmed aliases across a correction and rejects foreign, stale and duplicate tickets', async()=>{
 const handlers=new Map(),frame={},webContents={mainFrame:frame};
 const win={webContents,isDestroyed:()=>false},ipcMain={handle:(name,fn)=>handlers.set(name,fn)};
 const child=new EventEmitter(),messages=[];let launches=0;
 child.send=message=>messages.push(message);
 installPracticeRunner(win,{ipcMain,app:{isPackaged:false,getAppPath:()=>'/test-app'},spawnChild:()=>{launches++;return child;}});
 const event={sender:webContents,senderFrame:frame};
 const first=handlers.get('cad-practice:start')(event,{plan:plan(),recovery:'image'});
 child.emit('message',{type:'ready'});
 const {nonce}=messages[0];
 const state={known:['work','retired'],selectable:['work'],selected:['work']};
 child.emit('message',{type:'result',nonce,round:0,waiting:true,image:'/9j/AA==',value:{
  ok:false,reason:'dialog error',steps:[],report:{failedAction:{index:2,kind:'ui'},revision:'a'.repeat(16),state}
 }});
 const failure=(await first).value;
 assert.match(failure.continuationId,/^[a-f0-9]{48}$/);
 assert.equal(failure.image,'/9j/AA==');
 const next={version:1,title:'Fortsetzen',actions:[{kind:'select',targets:['work']},{kind:'set',field:'size-0',value:44}]};
 const resume=handlers.get('cad-practice:continue');
 assert.equal((await resume({sender:webContents,senderFrame:{}},{id:failure.continuationId,plan:next})).ok,false);
 assert.equal((await resume(event,{id:'stale',plan:next})).ok,false);
 assert.equal((await resume(event,{id:failure.continuationId,plan:{...next,actions:[shape('retired')]}})).ok,false);
 const second=resume(event,{id:failure.continuationId,plan:next});
 assert.equal((await resume(event,{id:failure.continuationId,plan:next})).ok,false);
 assert.deepEqual(messages[1],{type:'continue',nonce,plan:next});
 assert.equal(launches,1);
 child.emit('message',{type:'result',nonce,round:0,value:{ok:false,reason:'stale',steps:[]}});
 child.emit('message',{type:'result',nonce,round:1,value:{ok:true,steps:[]}});
 assert.equal((await second).value.ok,true);
 child.emit('exit',0);
});
