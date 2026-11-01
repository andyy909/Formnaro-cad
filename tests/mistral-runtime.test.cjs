const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events');
const {createMistralVibe,vibeArguments}=require('../backend/mistral-vibe.cjs');
test('An empty untrusted workspace with no available trust decision still returns the model catalog',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-trust-'));let decisions=0;
 class Client extends EventEmitter{async initialize(){}async call(method){if(method==='_auth/status')return {authenticated:true};if(method==='session/new')return {sessionId:'one',_meta:{workspace_trust:{status:'untrusted',details:null}},configOptions:[]};if(method==='_trust/decision'){decisions++;throw Error('No workspace trust decision is available');}}close(){this.emit('closed');}}
 const m=createMistralVibe({directory,connectionFile:'unused',Client,command:()=>'/fixture/vibe'});try{const c=await m.catalog();assert.equal(c.ok,true);assert.equal(decisions,0);}finally{m.dispose();fs.rmSync(directory,{recursive:true,force:true});}
});
test('A physical uv Python environment runs only the fixed ACP entry point in isolated mode',()=>{
 assert.deepEqual(vibeArguments('python.exe'),['-I','-c','from vibe.acp.entrypoint import main; main()']);assert.deepEqual(vibeArguments('vibe-acp.exe'),[]);
});
