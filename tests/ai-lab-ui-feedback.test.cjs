const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
for(const mode of ['ui','truncated'])test(mode+' feedback retains the failed response and still requires native final verification',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-ui-feedback-'));t.after(()=>{const resolved=fs.realpathSync(directory);assert.equal(path.dirname(resolved),fs.realpathSync(os.tmpdir()));assert.match(path.basename(resolved),/^formnaro-ui-feedback-/);fs.rmSync(resolved,{recursive:true,force:true});});
 const revision='0123456789abcdef';let turns=0,opened=0,closed=0,replays=0;
 const snapshot={scene:{revision,objects:[],selectionTargets:[],selection:[]},project:{nodes:[]},context:{}};
 const runner=require('../backend/ai-diagnostics.cjs').createDiagnostics({app:{},directory,reviewerEnabled:false,credentials:()=>({key:'dummy-private',config:{baseUrl:'https://api.deepseek.com',model:'deepseek-flash'}}),
  provider:{testConnection:async()=>({models:['deepseek-flash']}),completeModel:async(c,k,e)=>{turns++;if(mode==='truncated'&&turns===1)return {text:'',data:{model:'deepseek-flash',status:'incomplete',usage:{input_tokens:10,output_tokens:16384}}};if(turns===2){assert.match(e.user,mode==='ui'?/geschlossenen Menü/:/Ausgabelimit/);if(mode==='ui')assert.match(e.user,/fresh|frisch/i);}
   return {data:{model:'deepseek-flash',usage:{input_tokens:10,output_tokens:10}},text:JSON.stringify({revision,assistant:{kind:'practice',plan:{version:1,title:'Sichtbarer Versuch',actions:[{kind:'shape',type:'box',as:'body'}]}}})};}},
  openChild:()=>{opened++;return {call:async method=>method==='setup'||method==='snapshot'?structuredClone(snapshot):method==='capture'?'data:image/png;base64,AQID':{},close:async()=>{closed++;return {code:0,signal:null};},cancel(){}};},
  runPractice:async()=>++replays===1&&mode==='ui'?{result:{ok:false,reason:'Formnaro-Bedienelement liegt im geschlossenen Menü menu:cad.',steps:[]}}:{result:{ok:true,steps:[{observation:{}}]},project:{nodes:[]}}
 });
 const p=require('../backend/ai-test-lab-plan.cjs').preset('practice-functions');await runner.start({mode:'lab',plan:{...p,caseIds:['practice-01'],efforts:['low'],monitor:{mode:'off'}},deferReview:true});
 const record=runner.read(runner.state().records[0].id);assert.equal(turns,mode==='ui'?2:3);assert.equal(replays,2);assert.equal(opened,2);assert.equal(closed,opened);assert.equal(record.verification.passed,false,'A retry is never native success by itself');
 if(mode==='ui'){assert.equal(record.executionCorrections,1);assert.equal(record.practiceAttempts[0].result.ok,false);assert.equal(require('../backend/ai-lab-review-data.cjs').summarize([record]).executionCorrections,1);assert(record.events.some(e=>e.type==='practice-ui-feedback'));}else {assert.equal(record.formatCorrections,1);assert.equal(record.nativeCorrections,1);assert.equal(record.practiceAttempts[0].verification.passed,false);}
});
