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
