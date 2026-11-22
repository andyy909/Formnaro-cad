const test=require('node:test');
const { writeEmptyBenchmarkManifests } = require('./fixtures/portable-benchmark-manifests.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto');
const helper=require('../backend/practice-quality-verification.cjs');
const mainSource=fs.readFileSync(path.join(__dirname,'..','backend','practice-verification.cjs'),'utf8');
const helperSource=fs.readFileSync(path.join(__dirname,'..','backend','practice-quality-verification.cjs'),'utf8');
const ROOT='parent-root-1',REV1='0123456789abcdef',REV2='fedcba9876543210';
const QUALITY_CHECKS=[
 'Normal chat retained the configured fixed policy across the same actual wrong 42 mm result',
 'Evidence distinguishes omitted, advisory and enforced measurements',
 'Candidate only adopted after user UI confirmation, and Undo restores the original project'
];

function temporary(t,prefix){
 let root;
 try{root=fs.mkdtempSync(path.join(os.tmpdir(),prefix));}
 catch(error){
  if(!['EPERM','EACCES','ENOENT'].includes(error.code))throw error;
  const fallback=path.join(__dirname,'..','work','tmp');
  fs.mkdirSync(fallback,{recursive:true});
  root=fs.mkdtempSync(path.join(fallback,prefix));
 }
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 return root;
}

function setEnv(t,name,value){
 const previous=process.env[name];
 if(value===undefined)delete process.env[name];else process.env[name]=value;
 t.after(()=>{if(previous===undefined)delete process.env[name];else process.env[name]=previous;});
}

function guardFetch(t){
 const original=global.fetch;
 t.after(()=>{global.fetch=original;});
 return original;
}

function clone(value){return JSON.parse(JSON.stringify(value));}

function snapshot(undo=3){
 return {
  serialized:JSON.stringify({nodes:[{id:ROOT,type:'box',size:[42,10,20]},{id:'neighbour-root',type:'cylinder',size:[1,2,3]}]}),
  state:{undo,redo:0,previews:2,revision:7},
  selection:[{rootId:ROOT,path:[]}],
  previewId:'preview-parent-1',
  visiblePreviewRoots:[{id:'preview-node-1',geometry:'geometry-1',root:null}]
 };
}

async function invoke(args){
 const fetchBefore=global.fetch;
 let result,error;
 try{result=await helper.verifyPracticeQuality(args);}
 catch(caught){error=caught;}
 return {result,error,fetchBefore,fetchAfter:global.fetch};
}

function cardText(variant){
 const width=variant==='off'?'width · übersprungen':variant==='report'?'width · abweichend':'width · bestanden';
 const solids=variant==='all'?'solids · bestanden':'solids · übersprungen';
 return `${width}\n${solids}`;
}

function localReport(variant,width=42){
 return {
  kind:variant==='report'?'practice-quality-advisory':'practice-quality-blocked',
  confirmedCount:2,
  quality:{
   blocked:variant!=='report',
   items:[
    {id:'width',target:'$existing-1',status:'failed',actual:[width,null,null],expected:[44,null,null],tolerance:.01,revision:REV1},
    {id:'solids',target:'$existing-1',status:variant==='all'?'passed':'skipped',actual:variant==='all'?[1]:null,expected:[1]}
   ]
  }
 };
}

function chatRequest(model,prompt){
 return {model,stream:false,messages:[{role:'system',content:'Übungsfenster'},{role:'user',content:prompt}]};
}

function localHarness({variant,snapshotAfter,fail}){
 const observations={scripts:[],requests:0,models:0,chats:[],snapshotCalls:0};
 const settingsPrefix='window.offlinecadDesktop.saveAISettings({config:';
 let config,actualWidth,feedbackSent=false;
 const send=async prompt=>{
  const url=config.baseUrl+'/chat/completions',body=chatRequest(config.model,prompt);
  observations.chats.push({url,body});
  const response=await global.fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const {choices}=await response.json();
  return JSON.parse(choices[0].message.content);
 };
 const js=async script=>{
  observations.scripts.push(script);
  if(script.startsWith(settingsPrefix)){
   config=JSON.parse(script.slice(settingsPrefix.length,script.lastIndexOf(',key:')));
   assert.equal(config.baseUrl,'http://127.0.0.1:9197/v1');
   assert.equal(config.model,'local-practice-fixture');
   return undefined;
  }
  if(script==='window.__cadTest.aiUI.chat.refreshModels()'){
   observations.models++;
   const response=await global.fetch(config.baseUrl+'/models');
   assert.deepEqual(await response.json(),{data:[{id:config.model,input_modalities:['text']}]});
   return undefined;
  }
  if(script.includes('ai-chat-practice-from-project')){
   const prompt='Zeige im Übungsfenster, wie dieser Halter auf 44 mm Breite geändert wird.';
   if(fail==='wrong-host'){
    await global.fetch('http://127.0.0.1:9999/v1/chat/completions',{method:'POST',body:JSON.stringify(chatRequest(config.model,prompt))});
    return undefined;
   }
   observations.requests++;
   const reply=await send(prompt);
   assert.equal(reply.revision,snapshotAfter.state.revision);
   assert.equal(reply.assistant.kind,'practice');
   assert.deepEqual(reply.assistant.plan.actions,[
    {kind:'select',targets:['existing-1']},{kind:'set',field:'size-0',value:42}
   ]);
   actualWidth=reply.assistant.plan.actions[1].value;
   return undefined;
  }
  if(script.startsWith("!!document.getElementById('ai-chat-practice-review')")){
   if(variant!=='off'&&!feedbackSent){
    feedbackSent=true;observations.requests++;
    const reply=await send('Validation feedback:\n'+JSON.stringify(localReport(variant,actualWidth)));
    if(variant==='report'){
     assert.deepEqual(reply,{message:'Prüfübung fertig. Messhinweis bleibt sichtbar.'});
    }else{
     assert.equal(reply.revision,snapshotAfter.state.revision);
     assert.equal(reply.assistant.kind,'practice');
     assert.deepEqual(reply.assistant.plan.actions,[{kind:'set',field:'size-0',value:44}]);
     actualWidth=reply.assistant.plan.actions[0].value;
    }
   }
   return true;
  }
  if(script.includes('ai-chat-practice-result')){
   if(fail==='adapter')throw Error('Quality fixture adapter failed');
   return cardText(variant);
  }
  if(script==='PARENT_SNAPSHOT'){
   observations.snapshotCalls++;
   if(fail==='parent-changed')return {...clone(snapshotAfter),serialized:'{"nodes":[]}'};
   return clone(snapshotAfter);
  }
  if(script.includes('clearPreview'))return undefined;
  if(script.startsWith("!document.getElementById('cad-ai-preview-banner').hidden&&"))return true;
  if(script==='window.__cadTest.serialize()')return snapshotAfter.serialized;
  if(script.includes('cad-ai-preview-apply'))return undefined;
  if(script.startsWith("document.getElementById('cad-ai-preview-banner').hidden&&"))return true;
  if(script.includes('worldBounds.size[0]'))return actualWidth;
  if(script==='window.__cadTest.undoDepth()')return snapshotAfter.state.undo+1;
  if(script==='window.__cadTest.actions.undo()')return undefined;
  if(script.includes("document.getElementById('ai-chat-status')"))return '';
  throw Error('Unexpected renderer script in the local quality fixture: '+script);
 };
 return {js,observations};
}

async function runLocalFixture(t,variant,fail){
 const directory=temporary(t,'formnaro-quality-'+variant+'-');
 setEnv(t,'FORMNARO_VERIFY_PRACTICE_QUALITY',variant);
 const before=snapshot(),after=clone(before),checks=[];
 const harness=localHarness({variant,snapshotAfter:after,fail});
 const outcome=await invoke({js:harness.js,directory,before,parentSnapshot:'PARENT_SNAPSHOT',checks,liveDomain:undefined,livePractice:()=>{throw Error('Live practice must not run for the local quality fixture');}});
 return {...outcome,directory,before,after,checks,observations:harness.observations};
}

test('The quality helper exports exactly verifyPracticeQuality with the destructured one-argument contract',()=>{
 assert.deepEqual(Object.keys(helper),['verifyPracticeQuality']);
 assert.equal(typeof helper.verifyPracticeQuality,'function');
 assert.equal(helper.verifyPracticeQuality.length,1);
 assert(helperSource.includes('async function verifyPracticeQuality({js,directory,before,parentSnapshot,checks,liveDomain,livePractice}){'));
});

test('The dispatcher keeps the quality gate and delegation while the unique quality code moved into the helper',()=>{
 assert(mainSource.includes("if(['off','report','enforce','all','reject','freecad','freecad-unavailable'].includes(process.env.FORMNARO_VERIFY_PRACTICE_QUALITY)){"));
 assert(mainSource.includes("return require('./practice-quality-verification.cjs').verifyPracticeQuality({js,directory,before,parentSnapshot,checks,liveDomain,livePractice});"));
 const unique=['width · übersprungen','fault:\'width-42\'','child-audit','practice-quality-blocked','Prüfübung fertig.','Breite des Halters prüfen','Actual Mistral reply repairs the fixed 42 mm discrepancy','Enforced measurement mismatch provides no adoptable reference','Missing independent runtime is reported separately'];
 for(const marker of unique){
  assert(helperSource.includes(marker),'the extracted helper owns: '+marker);
  assert.equal(mainSource.includes(marker),false,'the dispatcher no longer owns: '+marker);
 }
 for(const marker of ['vibe-rounds.json','$existing-1'])assert(helperSource.includes(marker),'the extracted helper carries the shared quality marker: '+marker);
});

test('The neighbouring practice gates remain in the dispatcher',()=>{
 for(const gate of [
  "if(['1','multi','open'].includes(process.env.FORMNARO_VERIFY_PRACTICE_STL)){",
  "if(['prepared','files','conflict','unscaled'].includes(process.env.FORMNARO_VERIFY_PRACTICE_MULTIVIEW)){",
  "if(['1','perspective'].includes(process.env.FORMNARO_VERIFY_PRACTICE_PHOTO)){",
  "if(['1','adopt','recover'].includes(process.env.FORMNARO_VERIFY_PRACTICE_FILES_CHAT)){"
 ])assert(mainSource.includes(gate),gate);
 assert(mainSource.includes("require('./practice-stl-verification.cjs').verifyPracticeStl("));
 assert(mainSource.includes("require('./practice-photo-verification.cjs').verifyPracticeMultiview("));
 assert(mainSource.includes("require('./practice-photo-verification.cjs').verifyPracticePhoto("));
});

for(const variant of ['off','report','enforce','all']){
 test(`Local quality fixture ${variant} drives the real helper through the installed fetch and restores the parent`,async t=>{
  const fetchBefore=guardFetch(t);
  const run=await runLocalFixture(t,variant);
  assert.equal(run.error,undefined,run.error&&run.error.message);
  assert.equal(run.fetchAfter,fetchBefore,'global.fetch must be restored to the exact previous function');
  assert.equal(run.fetchAfter.toString(),fetchBefore.toString());
  const {result,observations}=run;
  assert.deepEqual(Object.keys(result).sort(),['actual','checks','ok','reports','requests','variant']);
  assert.equal(result.ok,true);
  assert.equal(result.variant,variant);
  assert.equal(result.requests,variant==='off'?1:2);
  assert.equal(observations.requests,result.requests);
  assert.equal(observations.models,1);
  assert.deepEqual(result.checks,QUALITY_CHECKS);
  assert.equal(result.actual,['off','report'].includes(variant)?42:44);
  assert.equal(observations.snapshotCalls,1);
  assert.deepEqual(run.after,run.before,'the controlled parent snapshot stays unchanged');
  for(const marker of ['ai-chat-practice-result','PARENT_SNAPSHOT','clearPreview','cad-ai-preview-apply','worldBounds.size[0]','undoDepth','actions.undo'])assert(observations.scripts.some(script=>script.includes(marker)),marker);
  assert.equal(observations.chats[0].url,'http://127.0.0.1:9197/v1/chat/completions');
  assert(!JSON.stringify(observations.chats[0].body).includes('Vorgegebene 44 mm ±'),'private expectation metadata is withheld from the first turn');
  assert.equal(observations.chats.every(chat=>chat.url.endsWith('/chat/completions')),true);
  if(variant==='off')assert.deepEqual(result.reports,[]);
  else{
   assert.equal(result.reports.length,1);
   const report=result.reports[0];
   assert.equal(report.kind,variant==='report'?'practice-quality-advisory':'practice-quality-blocked');
   assert.equal(report.confirmedCount,2);
   assert.equal(report.quality.blocked,variant!=='report');
   const [width,solids]=report.quality.items;
   assert.equal(width.status,'failed');
   assert.equal(width.target,'$existing-1');
   assert.equal(width.actual[0],42);
   assert.equal(width.expected[0],44);
   assert.equal(width.tolerance,.01);
   assert.match(width.revision,/^[a-f0-9]{16}$/);
   assert.equal(solids.status,variant==='all'?'passed':'skipped');
   const feedback=observations.chats[1].body.messages.at(-1).content;
   assert(feedback.startsWith('Validation feedback:\n'));
   assert.deepEqual(JSON.parse(feedback.split('Validation feedback:\n')[1]),localReport(variant));
  }
 });
}

test('A wrong fixture host rejects the quality run and still restores global.fetch exactly',async t=>{
 const fetchBefore=guardFetch(t);
 const run=await runLocalFixture(t,'enforce','wrong-host');
 assert(run.error,'the wrong fixture host must reject the run');
 assert.match(run.error.message,/127\.0\.0\.1:9197/);
 assert.equal(run.fetchAfter,fetchBefore);
 assert.equal(run.fetchAfter.toString(),fetchBefore.toString());
 assert.equal(run.observations.snapshotCalls,0);
});

test('A renderer adapter failure rejects the quality run and still restores global.fetch exactly',async t=>{
 const fetchBefore=guardFetch(t);
 const run=await runLocalFixture(t,'enforce','adapter');
 assert(run.error,'the adapter failure must reject the run');
 assert.match(run.error.message,/Quality fixture adapter failed/);
 assert.equal(run.fetchAfter,fetchBefore);
 assert.equal(run.fetchAfter.toString(),fetchBefore.toString());
});

test('The local quality branch rejects a parent project that changed during the run',async t=>{
 const fetchBefore=guardFetch(t);
 const run=await runLocalFixture(t,'enforce','parent-changed');
 assert(run.error);
 assert.equal(run.error.code,'ERR_ASSERTION');
 assert.equal(run.fetchAfter,fetchBefore);
 assert.equal(run.fetchAfter.toString(),fetchBefore.toString());
 assert.equal(run.observations.snapshotCalls,1);
});

function rejectResult(){
 return {ok:false,report:{quality:{blocked:true,revision:REV1,items:[{id:'width',status:'failed',target:'$existing-1',actual:[42],expected:[44],tolerance:.01,revision:REV1}]}}};
}

test('reject returns no adoptable result, writes the run report and leaves the parent untouched',async t=>{
 const fetchBefore=guardFetch(t);
 setEnv(t,'FORMNARO_VERIFY_PRACTICE_QUALITY','reject');
 setEnv(t,'FORMNARO_VERIFY_PRACTICE_EVIDENCE',undefined);
 const directory=temporary(t,'formnaro-quality-reject-');
 const before=snapshot(),after=clone(before),checks=[],scripts=[];
 const runValue=rejectResult();
 const js=async script=>{
  scripts.push(script);
  if(script.includes('startPractice'))return clone(runValue);
  if(script==='PARENT_SNAPSHOT')return clone(after);
  throw Error('Unexpected renderer script in the reject fixture: '+script);
 };
 const {result,error,fetchAfter}=await invoke({js,directory,before,parentSnapshot:'PARENT_SNAPSHOT',checks,liveDomain:undefined,livePractice:()=>{throw Error('Live practice must not run for the reject fixture');}});
 assert.equal(error,undefined,error&&error.message);
 assert.equal(fetchAfter,fetchBefore);
 assert.deepEqual(Object.keys(result).sort(),['checks','ok','variant']);
 assert.equal(result.ok,true);
 assert.equal(result.variant,'reject');
 assert.deepEqual(result.checks,['Enforced measurement mismatch provides no adoptable reference and leaves parent untouched']);
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory,'check-report.json'),'utf8')),runValue);
 assert.equal(scripts.filter(script=>script.includes('startPractice')).length,1);
 assert.equal(scripts.filter(script=>script==='PARENT_SNAPSHOT').length,1);
});

test('reject with evidence accepts the isolated audit hash and measures the blocked 42 mm copy',async t=>{
 const fetchBefore=guardFetch(t);
 setEnv(t,'FORMNARO_VERIFY_PRACTICE_QUALITY','reject');
 const directory=temporary(t,'formnaro-quality-evidence-');
 const evidenceBefore=process.env.FORMNARO_VERIFY_PRACTICE_EVIDENCE;
 process.env.FORMNARO_VERIFY_PRACTICE_EVIDENCE='1';
 const before=snapshot(),after=clone(before),checks=[],scripts=[];
 const runValue=rejectResult();
 const auditProject={nodes:[{id:ROOT,type:'box',size:[42,10,20]}],units:'mm'};
 const audit={stage:'blocked',revision:REV1,project:auditProject,sha256:createHash('sha256').update(JSON.stringify(auditProject)).digest('hex')};
 fs.mkdirSync(path.join(directory,'child-audit','session-x'),{recursive:true});
 fs.writeFileSync(path.join(directory,'child-audit','session-x',`round-0-${REV1}.json`),JSON.stringify(audit));
 const js=async script=>{
  scripts.push(script);
  if(script.includes('startPractice'))return clone(runValue);
  if(script.startsWith('window.__cadTest.controller.describe('))return {objects:[{id:ROOT,worldBounds:{size:[42,10,20]}}]};
  if(script==='PARENT_SNAPSHOT')return clone(after);
  throw Error('Unexpected renderer script in the evidence fixture: '+script);
 };
 let outcome;
 try{outcome=await invoke({js,directory,before,parentSnapshot:'PARENT_SNAPSHOT',checks,liveDomain:undefined,livePractice:()=>{throw Error('Live practice must not run for the evidence fixture');}});}
 finally{if(evidenceBefore===undefined)delete process.env.FORMNARO_VERIFY_PRACTICE_EVIDENCE;else process.env.FORMNARO_VERIFY_PRACTICE_EVIDENCE=evidenceBefore;}
 assert.equal(process.env.FORMNARO_VERIFY_PRACTICE_EVIDENCE,evidenceBefore,'the evidence environment is restored exactly');
 const {result,error,fetchAfter}=outcome;
 assert.equal(error,undefined,error&&error.message);
 assert.equal(fetchAfter,fetchBefore);
 assert.equal(result.ok,true);
 assert.equal(result.variant,'reject');
 assert.deepEqual(result.checks,['The isolated, revision-bound copy of the blocked result can be independently measured','Enforced measurement mismatch provides no adoptable reference and leaves parent untouched']);
 assert(fs.existsSync(path.join(directory,'check-report.json')));
 const describeScript=scripts.find(script=>script.startsWith('window.__cadTest.controller.describe('));
 assert(describeScript,'the real helper measures the audited copy through describe');
 assert(describeScript.includes(JSON.stringify(auditProject)));
});

for(const variant of ['freecad','freecad-unavailable']){
 test(`The ${variant} quality branch writes the independent check report and preserves the parent`,async t=>{
  const fetchBefore=guardFetch(t);
  setEnv(t,'FORMNARO_VERIFY_PRACTICE_QUALITY',variant);
  const directory=temporary(t,'formnaro-quality-'+variant+'-');
  const before=snapshot(),after=clone(before),checks=[],scripts=[];
  const item=variant==='freecad'
   ?{id:'geometry',status:'passed',actual:{valid:true,closed:true,solids:1,check:'passed'}}
   :{id:'geometry',status:'unavailable',actual:null,code:'freecad-runtime-missing'};
  const runValue={ok:true,resultRef:'practice-result-'+variant,report:{quality:{blocked:false,items:[item]}}};
  const js=async script=>{
   scripts.push(script);
   if(script.includes('startPractice'))return clone(runValue);
   if(script==='PARENT_SNAPSHOT')return clone(after);
   throw Error('Unexpected renderer script in the '+variant+' fixture: '+script);
  };
  const {result,error,fetchAfter}=await invoke({js,directory,before,parentSnapshot:'PARENT_SNAPSHOT',checks,liveDomain:undefined,livePractice:()=>{throw Error('Live practice must not run for the '+variant+' fixture');}});
  assert.equal(error,undefined,error&&error.message);
  assert.equal(fetchAfter,fetchBefore);
  assert.deepEqual(Object.keys(result).sort(),['checks','item','ok','variant']);
  assert.equal(result.ok,true);
  assert.equal(result.variant,variant);
  assert.deepEqual(result.item,item);
  assert.deepEqual(result.checks,[variant==='freecad'?'Real FreeCAD import independently checks the exact child CAD root without applying it':'Missing independent runtime is reported separately from a geometric mismatch']);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory,'check-report.json'),'utf8')),runValue);
  if(variant==='freecad')assert.deepEqual(result.item.actual,{valid:true,closed:true,solids:1,check:'passed'});
  else assert(result.item.code&&result.item.actual===null);
  assert.equal(scripts.filter(script=>script.includes('startPractice')).length,1);
  assert.equal(scripts.filter(script=>script==='PARENT_SNAPSHOT').length,1);
 });
}

test('The live quality domain injects the 42 mm fault, repairs it to 44 mm and protects the parent project',async t=>{
 const fetchBefore=guardFetch(t);
 setEnv(t,'FORMNARO_VERIFY_PRACTICE_QUALITY','enforce');
 const directory=temporary(t,'formnaro-quality-live-');
 const before=snapshot(),after=clone(before),checks=[],scripts=[],liveCalls=[];
 const first={id:'width',target:'$existing-1',status:'failed',actual:[42,10,20],expected:[44,10,20],tolerance:.01,revision:REV1};
 const last={id:'width',target:'$existing-1',status:'passed',actual:[44,10,20],expected:[44,10,20],tolerance:.01,revision:REV2};
 const liveResult={attempts:[{injected:'width-42',report:{quality:{blocked:true,items:[first]},confirmedCount:1}},{injected:null}],report:{quality:{blocked:false,items:[last]},confirmedCount:2},resultRef:'practice-live-result'};
 const project={nodes:[{id:ROOT,type:'box',size:[44,10,20]},{id:'neighbour-root',type:'cylinder',size:[1,2,3]}]};
 fs.writeFileSync(path.join(directory,'vibe-rounds.json'),JSON.stringify([{applicationFeedback:{kind:'practice-quality-blocked',exerciseRevision:REV1}},{applicationFeedback:{kind:'practice-quality-advisory',exerciseRevision:REV2}}]));
 const js=async script=>{
  scripts.push(script);
  if(script.startsWith('window.offlinecadDesktop.practiceProjectResult('))return clone(project);
  if(script==='window.__cadTest.controller.describe()')return {objects:[{id:ROOT,worldBounds:{size:[37,10,20]}}]};
  if(script.startsWith('window.__cadTest.controller.describe('))return {objects:[{id:ROOT,worldBounds:{size:[44,10,20]}}]};
  if(script==='PARENT_SNAPSHOT')return clone(after);
  throw Error('Unexpected renderer script in the live quality fixture: '+script);
 };
 const livePractice=(prompt,files,options)=>{
  liveCalls.push({prompt,files,options});
  assert.match(prompt,/Übungsfenster/);
  assert.match(prompt,/44 mm/);
  assert.deepEqual(files,[]);
  assert.equal(options.fault,'width-42');
  assert.equal(options.quality.mode,'enforce');
  assert.deepEqual(options.quality.criteria.map(criterion=>criterion.id),['width','solids']);
  assert.deepEqual(options.quality.enabled,['width']);
  return clone(liveResult);
 };
 const {result,error,fetchAfter}=await invoke({js,directory,before,parentSnapshot:'PARENT_SNAPSHOT',checks,liveDomain:'quality',livePractice});
 assert.equal(error,undefined,error&&error.message);
 assert.equal(fetchAfter,fetchBefore);
 assert.deepEqual(Object.keys(result).sort(),['checks','first','last','ok','size','variant']);
 assert.equal(result.ok,true);
 assert.equal(result.variant,'enforce');
 assert.deepEqual(result.size,[44,10,20]);
 assert.deepEqual(result.first,first);
 assert.deepEqual(result.last,last);
 assert.deepEqual(result.checks,['Actual Mistral reply repairs the fixed 42 mm discrepancy to 44 mm after native policy feedback in the same child']);
 assert.equal(liveCalls.length,1);
 assert.equal(scripts.filter(script=>script.startsWith('window.offlinecadDesktop.practiceProjectResult(')).length,1);
 assert.equal(scripts.filter(script=>script==='window.__cadTest.controller.describe()').length,1);
 assert(scripts.some(script=>script.startsWith('window.__cadTest.controller.describe(')&&script!=='window.__cadTest.controller.describe()'));
});

test('The portable package filter drops the extracted quality verification module',async t=>{
 const root=temporary(t,'formnaro-quality-portable-'),source=path.join(root,'source'),stage=path.join(root,'stage');
 for(const directory of ['backend','ai','licenses','dist'])fs.mkdirSync(path.join(source,directory),{recursive:true});
 for(const file of ['electron.cjs','preload.cjs','package.json','LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt'])fs.writeFileSync(path.join(source,file),'');
 for(const name of ['practice-verification.cjs','practice-quality-verification.cjs','practice-stl-verification.cjs','practice-runner.cjs','practice-files.cjs'])fs.writeFileSync(path.join(source,'backend',name),name);
 writeEmptyBenchmarkManifests(source);
 const {copyPortableApp}=await import('../scripts/portable-runtime-policy.mjs');
 copyPortableApp(source,stage);
 assert.deepEqual(fs.readdirSync(path.join(stage,'backend')).sort(),['practice-files.cjs','practice-runner.cjs']);
 assert.equal(fs.existsSync(path.join(stage,'backend','practice-quality-verification.cjs')),false,'the extracted quality module is not shipped');
 assert.equal(fs.existsSync(path.join(stage,'backend','practice-stl-verification.cjs')),false);
 assert.equal(fs.existsSync(path.join(stage,'backend','practice-verification.cjs')),false);
 assert.equal(fs.readFileSync(path.join(stage,'backend','practice-runner.cjs'),'utf8'),'practice-runner.cjs');
});
