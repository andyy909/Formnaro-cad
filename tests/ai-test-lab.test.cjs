const {test}=require('node:test'),assert=require('node:assert/strict');
const {preset,expandPlan,validatePlan}=require('../backend/ai-test-lab-plan.cjs');
const {createTrialMonitor,validateJudgment}=require('../backend/ai-test-lab-monitor.cjs');
test('Presets cover pilot, full screening and independent confirmation without changing other factors',()=>{
 assert.equal(expandPlan(preset('pilot')).trials,36);assert.equal(expandPlan(preset('screen')).trials,108);
 const {rows,trials}=expandPlan(preset('confirm','D'));assert.equal(trials,72);assert.ok(rows.every(r=>r.dataset==='holdout'&&r.stage==='full'&&['A','D'].includes(r.variant)&&r.monitor.mode==='shadow'));
 const counts=new Map();for(const r of rows){const key=[r.caseId,r.effort,r.variant].join();counts.set(key,(counts.get(key)??0)+1);}assert.ok([...counts.values()].every(n=>n===2));
 const images=expandPlan(preset('images'));assert.equal(images.trials,18);assert.ok(images.rows.every(r=>r.sceneScope==='selection'));assert.equal(new Set(images.rows.map(r=>r.imageMode)).size,3);
});
test('Plans reject accidental factorial explosion, unknown fields and hidden holdout optimization',()=>{
 assert.throws(()=>expandPlan({...preset('screen'),repeats:8,workflow:'both',scopes:['full','selection'],images:['none','overview','selection']}),/648/);
 assert.throws(()=>validatePlan({...preset(),secret:'no'}),/Unbekannt/);
 assert.throws(()=>validatePlan({...preset('confirm'),monitor:{mode:'active'}}),/Bestätigungsserie/);
 assert.throws(()=>validatePlan({...preset('confirm'),customContext:'the expected answer'}),/Entwicklungsserie/);
 assert.throws(()=>validatePlan({...preset(),limits:{seconds:0}}),/Zeitlimit/);
});
test('Plan hash is reproducible and rotation changes the first condition across matched blocks',()=>{
 const a=expandPlan(preset()),b=expandPlan(preset());assert.equal(a.planHash,b.planHash);assert.deepEqual(a.rows,b.rows);
 const first=new Set(a.rows.filter((r,i)=>i%6===0).map(r=>r.variant));assert.ok(first.size>1);
});
const judgment={verdict:'stop',reasonCode:'wrong_target',confidence:.99,explanation:'Other part proposed',evidence:'target OTHER'};
function monitor(t,{mode='shadow',trigger='reasoning',completeModel}={}){
 const events=[],stops=[],controller=new AbortController();
 return {events,stops,controller,instance:createTrialMonitor({settings:{mode,trigger,model:'deepseek-flash',effort:'low',prefixChars:400,confidence:.95},config:{baseUrl:'https://api.deepseek.com',model:'deepseek-flash'},key:'test-key',signal:controller.signal,emit:e=>events.push(e),onStop:j=>stops.push(j),task:'Change selected shaft',facts:[{id:'selected'}],tools:['offlinecad_preview'],completeModel:completeModel??(async(c,k,e)=>{assert.equal(e.input.history.length,0);assert.ok(!e.user.includes('futureResult'));e.onDiagnostic({type:'request',body:{model:c.model}});return {text:JSON.stringify(judgment),data:{model:c.model,usage:{input_tokens:12,output_tokens:3}}};})})};
}
test('Shadow supervisor records hypothetical stop and separate billing without aborting',async t=>{
 const h=monitor(t);h.instance.observeReasoning('x'.repeat(399));assert.equal(h.instance.started,false);h.instance.observeReasoning('x'.repeat(500));h.instance.observeReasoning('x'.repeat(700));await h.instance.finish();assert.equal(h.stops.length,0);assert.equal(h.events.filter(e=>e.type==='monitor-start').length,1);assert.equal(h.events.find(e=>e.type==='monitor-start').observedCharacters,400);assert.equal(h.events.find(e=>e.type==='usage').role,'supervisor');assert.equal(h.events.find(e=>e.type==='monitor-judgment').acted,false);
});
test('Active supervisor can stop only on a validated high-confidence violation',async t=>{
 const h=monitor(t,{mode:'active',trigger:'proposal'});h.instance.observeReasoning('x'.repeat(2000));assert.equal(h.instance.started,false);await h.instance.inspectProposal({tool:'offlinecad_preview',arguments:{target:'OTHER'}});assert.equal(h.stops.length,1);assert.equal(h.events.find(e=>e.type==='monitor-judgment').acted,true);
 assert.throws(()=>validateJudgment(JSON.stringify({...judgment,reasonCode:'insufficient_evidence'})),/Stopempfehlung/);
 assert.throws(()=>validateJudgment('{"verdict":"stop"}'),/Ungültig/);
});
test('Supervisor errors and cancellation never fabricate judgments',async t=>{
 const h=monitor(t,{completeModel:async(c,k,e,signal)=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))});h.instance.observeReasoning('x'.repeat(400));h.controller.abort();assert.equal(await h.instance.finish(),null);assert.equal(h.events.at(-1).type,'monitor-error');assert.equal(h.stops.length,0);
});

test('Quick plans cover the validated 3, 15, 30 and 45 independent development cases',async()=>{
 const {quickPlans,quickPlan,developmentCaseIds}=await import('../ai/lab-quick-plans.mjs');
 const actual=quickPlans.map(({id})=>expandPlan(quickPlan(id,{providerId:'current',model:'deepseek-flash'})));
 assert.deepEqual(actual.map(plan=>plan.trials),[3,15,30,45]);
 assert.deepEqual(actual[1].plan.caseIds,developmentCaseIds);
 assert.ok(actual.flatMap(plan=>plan.rows).every(row=>row.effort==='low'&&row.workflow==='practice'&&row.stage==='full'&&row.monitor.mode==='off'));
 const engine=require('../backend/ai-lab-benchmark.cjs');
 assert.equal(engine.verifySuite().cases.length,8);
 assert.equal(engine.verifySuite(undefined,'advanced').cases.length,8);
});

test('Development check escalates native mismatches, excludes looking at the wrong model or a broken checker',async()=>{
 const {developmentOutcome,escalationCases}=await import('../ai/lab-development-sequence.mjs');
 const terminal={status:'completed',cleanExit:true,modelIdentity:{exactMatch:true},verification:{passed:false},events:[{type:'finished'}]};
 const attempts=[
  {spec:{caseId:'failed'},...terminal},
  {spec:{caseId:'passed'},...terminal,verification:{passed:true}},
  {spec:{caseId:'input'},...terminal,status:'needs-input'},
  {spec:{caseId:'checker'},...terminal,verification:{passed:false,checks:[{name:'Native Gegenprüfung ausführbar',passed:false}]}},
  {spec:{caseId:'different'},...terminal,modelIdentity:{exactMatch:false}},
  {spec:{caseId:'runtime'},...terminal,cleanExit:false},
  {spec:{caseId:'interrupted'},...terminal,status:'interrupted'},
  {spec:{caseId:'missing'},...terminal,verification:null},
  {spec:{caseId:'later'},...terminal},
 ];
 assert.deepEqual(escalationCases(['later','input','passed','checker','different','runtime','interrupted','missing','unseen','failed'],attempts),['later','failed']);
 assert.deepEqual(developmentOutcome(attempts[3]),{status:'blocked',reason:'checker-error'});
 assert.equal(developmentOutcome(attempts[1]).status,'passed');
 assert.equal(developmentOutcome().status,'open');
});

test('Development check schedules Low, only scoped High failures, and optional Max',async()=>{
 const {previewDevelopment,runDevelopment}=await import('../ai/lab-development-sequence.mjs');
 const modeler={providerId:'current',model:'fixture',effort:'series'};
 const setup=previewDevelopment(modeler,['low','high','max'],true);
 const calls=[];
 const result=await runDevelopment({setup,id:'fixture',signal:new AbortController().signal,startStage:async plan=>{
  const effort=plan.efforts[0];
  calls.push([effort,plan.caseIds]);
  return {records:plan.caseIds.map((caseId,index)=>({
   id:effort+'-'+caseId,spec:{caseId,effort},status:effort==='low'&&index===2?'needs-input':'completed',
   cleanExit:true,modelIdentity:{exactMatch:true},events:[{type:'finished'}],
   verification:{passed:effort==='max'||(effort==='high'?index>0:index>2)},
  }))};
 }});
 assert.equal(calls[0][1].length,15);
 assert.deepEqual(calls.slice(1),[['high',['thread','drill']],['max',['thread']]]);
 assert.equal(result.status,'completed');
 assert.equal(result.phases[0].outcomes[2].reason,'needs-input');
 assert.throws(()=>previewDevelopment(modeler,['low'],false),/Low und High/);
 assert.throws(()=>previewDevelopment(modeler,['low','high'],true),/Max/);
});

test('A stop after the Low checkpoint does not dispatch High',async()=>{
 const {previewDevelopment,runDevelopment}=await import('../ai/lab-development-sequence.mjs');
 const abort=new AbortController();
 const setup=previewDevelopment({model:'fixture'},['low','high'],false);
 let calls=0;
 const result=await runDevelopment({setup,id:'stop',signal:abort.signal,startStage:async()=>{
  calls++;
  abort.abort();
  return {records:[]};
 }});
 assert.equal(calls,1);
 assert.equal(result.status,'interrupted');
});

test('A resumed check reads existing attempts, keeps an interrupted case open, and starts only untouched conditions',async()=>{
 const {previewDevelopment,runDevelopment}=await import('../ai/lab-development-sequence.mjs');
 const {developmentCaseIds}=await import('../ai/lab-quick-plans.mjs');
 const setup=previewDevelopment({providerId:'current',model:'fixture'},['low','high'],false);
 const passed=id=>({id,spec:{caseId:id},modelIdentity:{exactMatch:true},status:'completed',cleanExit:true,verification:{passed:true},events:[{type:'finished'}]});
 const recorded=[passed('thread'),{...passed('drill'),status:'interrupted'}];
 const previous={id:'resume',model:'fixture',setup,status:'interrupted',phases:[{effort:'low',caseIds:[...developmentCaseIds],outcomes:[]}]};
 let calls=0;
 const result=await runDevelopment({setup,id:'resume',previous,signal:new AbortController().signal,readStage:async()=>recorded,startStage:async plan=>{
  calls++;
  assert.deepEqual(plan.caseIds,developmentCaseIds.slice(2));
  return {records:[...recorded,...plan.caseIds.map(passed)]};
 }});
 assert.equal(calls,1);
 assert.equal(result.status,'completed');
 assert.equal(result.phases[0].outcomes[1].reason,'interrupted');
});

test('A clean fifteen-case development check makes no High dispatch',async()=>{
 const {previewDevelopment,runDevelopment}=await import('../ai/lab-development-sequence.mjs');
 const setup=previewDevelopment({model:'fixture'},['low','high'],false);
 let calls=0;
 const result=await runDevelopment({setup,id:'good',signal:new AbortController().signal,startStage:async plan=>{
  calls++;
  return {records:plan.caseIds.map(caseId=>({spec:{caseId},status:'completed',cleanExit:true,
   modelIdentity:{exactMatch:true},events:[{type:'finished'}],verification:{passed:true}}))};
 }});
 assert.equal(calls,1);
 assert.equal(result.status,'completed');
 assert.equal(result.phases[0].outcomes.length,15);
});

test('Development evidence links only its own attempts and rejects a changed source on save',async t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
 const {unzipSync,strFromU8}=require('fflate');
 const {createDevelopmentEvidence}=require('../backend/ai-lab-development-evidence.cjs');
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-dev-evidence-'));
 t.after(()=>{assert.equal(path.dirname(fs.realpathSync(folder)),fs.realpathSync(os.tmpdir()));fs.rmSync(folder,{recursive:true,force:true});});
 const id=crypto.randomUUID(),runId=crypto.randomUUID(),seriesId=crypto.randomUUID();
 let source='one';
 const store=createDevelopmentEvidence(folder,()=>source);
 const report={id,setup:{modeler:{providerId:'current',model:'fixture'}},status:'completed',
  phases:[{effort:'low',caseIds:['thread'],outcomes:[{caseId:'thread',runId,status:'passed'}]}]};
 store.save(report);
 const spec={caseId:'thread',effort:'low',seriesName:'Entwicklungscheck · '+id+' · low',seriesId,monitor:{mode:'off'}};
 fs.writeFileSync(path.join(folder,'Serie-'+seriesId+'.json'),JSON.stringify({id:seriesId,plan:{},rows:[spec]}));
 fs.writeFileSync(path.join(folder,'run-'+runId+'.json'),JSON.stringify({id:runId,spec,events:[{type:'finished'}],status:'completed',verification:{passed:true},cleanExit:true}));
 const exported=await store.exportReport(id);
 const entries=unzipSync(fs.readFileSync(exported.path));
 const series=JSON.parse(strFromU8(entries['Serienplaene.json']));
 assert.equal(series[0].developmentCheck.id,id);
 assert.deepEqual(JSON.parse(strFromU8(entries['Manifest.json'])).runs,[runId]);
 source='two';
 assert.equal(store.recent().compatible,false);
 assert.throws(()=>store.save(report),/denselben Programmstand/);
});

test('Supplemental checks persist native results and keep interrupted cases open',()=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
 const {randomUUID}=require('node:crypto');
 const {createSupplementalEvidence}=require('../backend/ai-lab-supplemental-evidence.cjs');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-supplemental-'));
 try{
  const evidence=createSupplementalEvidence(directory);
  assert.equal(evidence.recent(),null);
  const report={id:randomUUID(),status:'interrupted',caseIds:['plate-drawing','photo-multiview'],results:[{id:'plate-drawing',status:'passed',checks:[{label:'Länge',passed:true,actual:65}]}]};
  const file=evidence.save(report).path;
  assert.equal(evidence.recent().path,file);
  assert.deepEqual(evidence.recent().report,{...report,format:'FormnaroSupplementalLabCheck',version:1});
  assert.throws(()=>evidence.save({...report,status:'completed'}),/Ungültiges Ergebnis/);
  assert.throws(()=>evidence.save({...report,id:'../datei'}),/Ungültiges Ergebnis/);
  assert.throws(()=>evidence.save({...report,caseIds:['plate-drawing','plate-drawing']}),/Ungültiges Ergebnis/);
  const untouched=path.join(directory,'Entwicklungscheck-alt.json');
  fs.writeFileSync(untouched,'keep');
  evidence.clear();
  assert.equal(evidence.recent(),null);
  assert.equal(fs.readFileSync(untouched,'utf8'),'keep');
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('Frontier runs three trials at each supported effort with effort-specific time budgets',async()=>{
 const {runFrontier}=await import('../src/cad-lab-frontiers.js');
 const saved=[];
 let currentEffort,calls=0;
 const levels=new Map();
 const desktop={
  async diagnostics({plan}){
   calls++;
   const key=currentEffort+'-'+plan.caseIds[0];
   levels.set(key,(levels.get(key)??0)+1);
   return {records:[{id:key,spec:{seriesName:plan.name}}]};
  },
  async developmentEvidence(input){
   if(input.action==='supplement-save'){saved.push(structuredClone(input.report));return {path:'local'};}
   const first=input.id.endsWith('practice-01');
   if(first && currentEffort==='low' && levels.get(input.id)===3)return {outcome:'infrastructure',requests:0};
   return {outcome:currentEffort==='max'?'infrastructure':first && levels.get(input.id)===2?'passed':'failed',requests:1};
  },
 };
 await runFrontier({domain:'Vorführgrenze',efforts:['none','low','high','max'],modeler:{model:'fixture'},
  signal:new AbortController().signal,desktop,makeRuntime:async({effort,signal})=>{
   currentEffort=effort;return {desktop,signal,connection:{model:'fixture'}};
  },render:()=>{},status:()=>{}});
 assert.deepEqual(saved.map(r=>[r.effort,r.minutes,r.level,r.results.length,r.status]),[
  ['none',4,1,3,'completed'],['none',4,2,3,'completed'],['low',4,1,3,'interrupted'],['low',4,2,3,'completed'],
  ['high',6,1,3,'completed'],['high',6,2,3,'completed'],['max',8,1,3,'interrupted']]);
 assert.equal(calls,21);
 assert.equal(saved[2].history.at(-1).passed,1);
 assert.match(saved[2].frontierNote,/Nächste Stufe/);
 assert.equal(saved[3].history.at(-1).passed,0);
 assert.match(saved[3].frontierNote,/ungelöste/);
 assert.match(saved.at(-1).frontierNote,/offen/);
 assert.ok(saved.every(r=>r.results.every(row=>Number.isFinite(row.elapsedMs))));
});

test('Simple benchmark schedules every domain and all model efforts with a fresh budget per level', async () => {
 const {runSimpleBenchmark}=await import('../src/cad-lab-simple-run.js');
 const {taskAt}=await import('../src/cad-lab-frontiers.js');
 const received=[];
 const serializations=[];
 const desktop={async developmentEvidence({report}){
  serializations.push(structuredClone(report));return {path:'local'};
 }};
 const modeler={model:'fixture',providerId:'https://example.com'};
 const result=await runSimpleBenchmark({
  modeler,model:{vision:true,reasoningEfforts:['none','low','high','max','low']},
  signal:new AbortController().signal,desktop,render(){},status(){},showSummary(){},
  async run({domain,efforts,modeler:assigned,budgetPerLevel,simpleRun,onStage}){
   received.push([domain,efforts,assigned,budgetPerLevel]);
   onStage({status:'completed',simpleRun,effort:'none',history:[{effort:'none',level:2,passed:0}]});
  },
 });
 assert.deepEqual(received.map(entry=>entry[0]),['Plattengrenze','Vorführgrenze','Fotogrenze','STL-Grenze']);
 assert.ok(received.every(entry=>entry[2]===modeler && entry[3]));
 for(const entry of received)assert.deepEqual(entry[1],['none','low','high','max']);
 assert.equal(serializations.at(-1).simpleRun.status,'finished');
 assert.ok(result.domains.every(domain=>domain.status==='finished' && domain.results.none.level===2));
 assert.deepEqual([1,2,3,4,5].map(i=>taskAt('Plattengrenze',i).level+1),[2,4,8,16,32]);
 assert.deepEqual([4,5,6].map(i=>taskAt('Vorführgrenze',i).size),[2,4,8]);
 assert.deepEqual([4,5,6,7].map(i=>taskAt('Fotogrenze',i).id),['photo-openings-2','photo-openings-4','photo-openings-8','photo-openings-16']);
 assert.deepEqual([8,9,10].map(i=>taskAt('Fotogrenze',i).size),[2,4,8]);
 assert.deepEqual([6,7,8].map(i=>taskAt('STL-Grenze',i).id),['stl-stepped-4','stl-stepped-8','stl-stepped-16']);
 assert.equal(taskAt('Plattengrenze',2,3).label,'3 Bohrungen');
 assert.equal(taskAt('Vorführgrenze',9,3).size,2);
 assert.equal(taskAt('Fotogrenze',20,3).size,3);
});

test('Simple benchmark records unavailable photo input and keeps running after an infrastructure error',async()=>{
 const {runSimpleBenchmark}=await import('../src/cad-lab-simple-run.js');
 const receipt=await runSimpleBenchmark({
  modeler:{model:'text-model'},model:{vision:false},
  signal:new AbortController().signal,render(){},status(){},showSummary(){},
  async run({domain,efforts}){
   assert.deepEqual(efforts,['auto']);
   if(domain==='Plattengrenze')throw Error('Native preview unavailable');
   assert.notEqual(domain,'Fotogrenze');
  },
 });
 assert.deepEqual(receipt.domains.map(d=>d.status),['error','finished','skipped','finished']);
});

test('Benchmark token reports retain cache hits, billed failures and unknown fields separately', async () => {
 const {tokenEvents,formatTokenTotals,mergeTokenTotals}=await import('../ai/lab-token-totals.mjs');
 const {measureLabRequests}=await import('../src/cad-lab-request-usage.js');
 const row={};
 let request=0;
 const runtime=measureLabRequests({async generate(){
  request++;
  if(request===1)return {usage:{inputTokens:100,outputTokens:20,cachedInputTokens:65}};
  if(request===2)throw Object.assign(Error('Ungültige Modellantwort'),{aiUsage:{inputTokens:80,outputTokens:9,cachedInputTokens:0}});
  throw Error('Verbindung unterbrochen');
 }},row);
 await runtime.generate({});
 await assert.rejects(runtime.generate({}),/Modellantwort/);
 await assert.rejects(runtime.generate({}),/Verbindung/);
 assert.deepEqual(row.tokens.inputTokens,{tokens:180,reported:2});
 assert.deepEqual(row.tokens.outputTokens,{tokens:29,reported:2});
 assert.deepEqual(row.tokens.cachedInputTokens,{tokens:65,reported:2});
 assert.equal(row.tokens.requests,3);
 const guided=tokenEvents(2,[
  {billing:{inputTokens:50,outputTokens:11,cachedInputTokens:0}},
  {usage:{prompt_tokens:40,completion_tokens:7}},
 ]);
 mergeTokenTotals(row.tokens,guided);
 assert.deepEqual(row.tokens.inputTokens,{tokens:270,reported:4});
 assert.deepEqual(row.tokens.outputTokens,{tokens:47,reported:4});
 assert.deepEqual(row.tokens.cachedInputTokens,{tokens:65,reported:3});
 assert.match(formatTokenTotals(row.tokens),/Cache mind\. 65 \(3\/5\)/);
});

test('Frontier comparison averages complete runs of the same task and keeps incompatible conditions separate', async()=>{
 const {frontierChartRow,frontierChartComparisons,frontierChartRuns}=await import('../ai/lab-frontier-chart-data.mjs');
 const rows=[];
 const add=(id,model,passed,finished=3,level=2,minutes=6,version=4)=>{
  rows.push(frontierChartRow({
   id,campaign:'campaign-'+id,mode:'live',benchmark:{id:'Plattengrenze',label:'Platte',version},
   connection:{model,providerId:'test'},level,effort:'high',caseIds:['a','b','c'],
   task:level===2?'4 Bohrungen':'8 Bohrungen',minutes,startedAt:'2026-11-18T19:00:00Z',
   history:[{level,effort:'high',passed,finished}],
  }));
 };
 add('one','Alpha',3);add('two','Alpha',1);add('three','Beta',3);add('partial','Beta',0,2);
 add('difficulty','Beta',0,3,3);add('budget','Beta',0,3,2,7);add('version','Beta',0,3,2,6,3);
 assert.equal(frontierChartRow(null),null);
 assert.equal(frontierChartRuns(rows).length,7);
 const comparisons=frontierChartComparisons(rows);
 assert.equal(comparisons.length,4);
 assert.deepEqual(comparisons[0].models.map(m=>[m.sample.model,m.passed,m.total,m.runs]),[
  ['Beta',3,3,1],['Alpha',4,6,2],
 ]);
});

test('Simple benchmark schedules only the checked model efforts and rejects an empty selection', async()=>{
 const {runSimpleBenchmark}=await import('../src/cad-lab-simple-run.js');
 const calls=[];
 const options={
  modeler:{model:'fixture'},model:{vision:true,reasoningEfforts:['none','low','high','max']},
  signal:new AbortController().signal,render(){},status(){},showSummary(){},
  async run({domain,efforts}){calls.push([domain,efforts]);},
 };
 const result=await runSimpleBenchmark({...options,selectedEfforts:['high','none','unsupported']});
 assert.deepEqual(result.efforts,['none','high']);
 assert.equal(calls.length,4);
 for(const [,efforts] of calls)assert.deepEqual(efforts,['none','high']);
 await assert.rejects(runSimpleBenchmark({...options,selectedEfforts:[]}),/mindestens eine Denkstufe/);
 assert.equal(calls.length,4);
});

test('A successful simple attempt immediately advances and saves a complete shortened stage',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const {runFrontier}=await import('../src/cad-lab-frontiers.js');
 const {createSupplementalEvidence}=require('../backend/ai-lab-supplemental-evidence.cjs');
 const {frontierChartRow,frontierChartComparisons}=await import('../ai/lab-frontier-chart-data.mjs');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-short-test-'));
 const evidence=createSupplementalEvidence(directory);
 const reports=[];
 const cases=[];
 let launched;
 const desktop={
  async diagnostics({plan}){
   launched=plan.caseIds[0];cases.push(launched);
   return {records:[{spec:{seriesName:plan.name},id:crypto.randomUUID()}]};
  },
  async developmentEvidence({action,report}){
   if(action==='guided-result')return {outcome:launched==='practice-01'?'passed':'failed',requests:1};
   reports.push(structuredClone(report));return evidence.save(report);
  },
 };
 try {
  await runFrontier({domain:'Vorführgrenze',efforts:['high'],modeler:{model:'test'},
   simpleRun:{id:crypto.randomUUID()},stopAfterSuccess:true,desktop,
   minutes:null,signal:new AbortController().signal,render(){},status(){},
   async makeRuntime({signal}){return {desktop,signal,connection:{providerId:'test',model:'test'}};},
  });
  assert.deepEqual(cases,['practice-01','drill','drill','drill']);
  assert.equal(reports[0].status,'completed');
  assert.equal(reports[0].caseIds.length,3);
  assert.equal(reports[0].results.length,1);
  assert.match(reports[0].frontierNote,/Versuch 1 von maximal 3/);
  assert.match(reports[1].frontierNote,/Erste getestete ungelöste/);
  assert.throws(()=>evidence.save({...reports[0], stopAfterSuccess:false}),/Ungültiges Ergebnis/);
  const quick=frontierChartRow(reports[0]);
  assert.equal(quick.successfulAttempt,1);
  const fixed={...quick,stopAfterSuccess:false,finished:3};
  const comparisons=frontierChartComparisons([quick,fixed]);
  assert.equal(comparisons.length,2);
  assert.deepEqual(comparisons.map(c=>[c.models[0].passed,c.models[0].total]),[[1,1],[1,3]]);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('The quick benchmark runs one baseline per area and keeps an exhausted request budget open', async()=>{
 const {runSimpleBenchmark}=await import('../src/cad-lab-simple-run.js');
 const saved=new Map(), guidedPlans=[];
 const callsByDomain={};
 const desktop={
  async diagnostics({plan}){
   guidedPlans.push(plan);
   return {records:[{id:crypto.randomUUID(),spec:{seriesName:plan.name}}]};
  },
  async developmentEvidence({action,report}){
   if(action==='guided-result')return {outcome:'passed',requests:1};
   saved.set(report.id,structuredClone(report));
   return {path:'fixture'};
  },
 };
 const result=await runSimpleBenchmark({
  modeler:{model:'test'},model:{vision:true,reasoningEfforts:['none','low','high','max']},kind:'quick',
  signal:new AbortController().signal,desktop,render(){},status(){},showSummary(){},
  async makeRuntime({signal,effort}){
   assert.equal(effort,'low');
   return {desktop,signal,connection:{providerId:'test',model:'test'},
    async generate(){return {usage:{inputTokens:100,outputTokens:10}};},
   };
  },
  async trial(domain,task,runtime,modeler,effort){
   const {runDomainTrial}=await import('../src/cad-lab-frontiers.js');
   if(domain==='Vorführgrenze')return runDomainTrial(domain,task,runtime,modeler,effort);
   callsByDomain[domain]=0;
   const tries=domain==='Plattengrenze' ? 6 : 1;
   for(let i=0;i<tries;i++) {
    await runtime.generate({});
    callsByDomain[domain]++;
   }
   return {checks:[{label:'Native Prüfung',passed:domain!=='Zeichnungsgrenze'}]};
  },
 });
 assert.equal(result.kind,'quick');
 assert.deepEqual(result.efforts,['low']);
 assert.equal(saved.size,4);
 const [plate,guided,stl,drawing]=saved.values();
 assert.equal(drawing.taskId,'drawing-views');
 assert.equal(result.plan.photos,false);
 assert(!result.domains.some(area=>area.id==='Fotogrenze'));
 for(const report of saved.values()){
  assert.equal(report.level,1);
  assert.equal(report.caseIds.length,1);
  assert.equal(report.results.length,1);
  assert.equal(report.minutes,1);
 }
 assert.deepEqual(guidedPlans[0].limits,{seconds:60,outputTokens:4096,rounds:1,formatRepairs:0,requestBudget:1});
 assert.equal(callsByDomain.Plattengrenze,5);
 assert.match(plate.frontierNote,/Anfragebudget/);
 assert.equal(plate.status,'interrupted');
 assert.equal(plate.history[0].finished,0);
 assert.equal(guided.results[0].status,'passed');
 assert.equal(drawing.results[0].status,'failed');
 assert.equal(stl.results[0].status,'passed');
 assert.equal(result.tokens.requests,8);
 await assert.rejects(runSimpleBenchmark({
  modeler:{model:'test'},model:{reasoningEfforts:['low','high']},kind:'quick',selectedEfforts:['low','high'],
 }),/genau eine Denkstufe/);
});

test('A quick task deadline leaves its result open and gives the next area a fresh minute', async(t)=>{
 const {runSimpleBenchmark}=await import('../src/cad-lab-simple-run.js');
 t.mock.timers.enable({apis:['setTimeout']});
 const stages=new Map();
 const result=await runSimpleBenchmark({
  kind:'quick',modeler:{model:'test'},model:{vision:false},
  signal:new AbortController().signal,
  desktop:{async developmentEvidence({report}){return {path:report.id};}},
  render(report){if(report.status==='interrupted')stages.set(report.id,structuredClone(report));},
  status(){},showSummary(){},async makeRuntime({signal}){return {signal};},
  async trial(domain,task,{signal}){
   assert.equal(signal.aborted,false);
   t.mock.timers.tick(59_999);
   assert.equal(signal.aborted,false);
   t.mock.timers.tick(1);
   signal.throwIfAborted();
  },
 });
 assert.equal(stages.size,4);
 assert.ok([...stages.values()].every(report=>report.frontierNote==='Zeitbudget erreicht. Aufgabe offen.'));
 assert.deepEqual(result.domains.map(area=>area.status),['finished','finished','finished','finished']);
});

test('Compact benchmark continues after a miss while sharing the request budget between efforts', async()=>{
 const {runSimpleBenchmark}=await import('../src/cad-lab-simple-run.js');
 const {frontierChartRow,frontierChartComparisons}=await import('../ai/lab-frontier-chart-data.mjs');
 const saved=new Map(), calls=[];
 const result=await runSimpleBenchmark({
  kind:'compact',modeler:{model:'fixture'},model:{vision:false,reasoningEfforts:['low','high','max']},
  selectedEfforts:['low','high'],signal:new AbortController().signal,
  desktop:{async developmentEvidence({report}){saved.set(report.id,structuredClone(report));return {path:report.id};}},
  render(){},status(){},showSummary(){},
  async makeRuntime({signal}){return {signal,connection:{providerId:'test',model:'fixture'},
   async generate(){return {usage:{inputTokens:150,outputTokens:10,cachedInputTokens:64,
    estimatedCostUSD:{min:.0001,max:.0002}}};},
  };},
  async trial(domain,task,runtime,modeler,effort){
   calls.push([effort,task.id]);
   await runtime.generate({});
   return {checks:[{label:'Native check',passed:task.id!=='fixture-5' || effort==='high'}]};
  },
 });
 assert.deepEqual(result.efforts,['low','high']);
 assert.deepEqual(calls.filter(([effort])=>effort==='low').map(([,id])=>id),[
  'fixture-3','fixture-5','fixture-1','fixture-6','bore-oblique','plate-drawing','fixture-2','fixture-7','fixture-4',
  'converter-selected','converter-find','converter-cone','drawing-views','drawing-dimensions','drawing-section','drawing-assembly','drawing-detail',
 ]);
 assert.deepEqual(calls.filter(([effort])=>effort==='high').map(([,id])=>id),[
  'fixture-3','fixture-5','fixture-1','fixture-6','bore-oblique','plate-drawing','fixture-2','fixture-7','fixture-4',
  'converter-selected','converter-find','converter-cone','stl-countersinks',
  'drawing-views','drawing-dimensions','drawing-section','drawing-assembly','drawing-detail',
 ]);
 assert.equal(result.tokens.requests,35);
 assert.equal(result.tokens.costUSD.reported,35);
 assert.equal(result.plan.photos,false);
 assert(!result.domains.some(area=>area.id==='Fotogrenze'));
 assert.equal(result.domains.find(area=>area.id==='Zeichnungsgrenze').results.high.solvedStages,5);
 assert.equal(result.domains[0].results.low.failedStages,1);
 assert.equal(result.domains[0].results.low.solvedStages,8);
 assert.equal(result.domains[0].results.low.attemptedStages,9);
 assert.equal(result.domains[0].results.high.solvedStages,9);
 assert.equal(result.domains[0].results.high.plannedStages,12);
 assert.equal(result.timedOut,false);
 const stage=[...saved.values()].find(report=>report.effort==='low');
 assert.equal(stage.caseIds.length,1);
 assert.equal(stage.results.length,1);
 const compact=frontierChartRow(stage);
 assert.equal(compact.compactBenchmark,true);
 assert.equal(compact.effortCount,2);
 assert.equal(frontierChartComparisons([compact,{...compact,compactBenchmark:false}]).length,2);
});

test('The standard test attempts all 25 tasks once even when each area opens with a failure',async()=>{
 const {runSimpleBenchmark}=await import('../src/cad-lab-simple-run.js');
 const saved=new Map(), first=new Map();
 const outcome=await runSimpleBenchmark({
  kind:'compact',modeler:{model:'fixture'},model:{reasoningEfforts:['low']},
  selectedEfforts:['low'],signal:new AbortController().signal,
  desktop:{async developmentEvidence({report}){saved.set(report.id,structuredClone(report));return {path:report.id};}},
  render(){},status(){},showSummary(){},
  async makeRuntime({signal}){return {signal,async generate(){return {usage:{}};}};},
  async trial(domain,task,runtime){
   if(!first.has(domain))first.set(domain,{id:task.id,attempts:0});
   const opening=first.get(domain);
   await runtime.generate({});
   return {checks:[{label:'Native check',passed:opening.id!==task.id || ++opening.attempts===2}]};
  },
 });
 assert.equal(outcome.plan.attempts,1);
 assert.equal(outcome.plan.version,13);
 const openings=[...saved.values()].filter(report=>report.level===1);
 assert.equal(openings.length,3);
 for(const report of openings){
  assert.equal(report.caseIds.length,1);
  assert.deepEqual(report.results.map(row=>row.status),['failed']);
  assert.match(report.frontierNote,/Nächste Stufe folgt/);
 }
 const cad=[...saved.values()].filter(report=>report.benchmark.id==='Plattengrenze');
 assert.deepEqual(cad.slice(-2).map(report=>report.taskId),['fixture-8','fixture-9']);
 assert.equal(outcome.domains[0].results.low.solvedStages,11);
 assert.deepEqual(outcome.domains.map(area=>area.results.low.attemptedStages),[12,6,7]);
 assert.equal(outcome.tokens.requests,25);
});
test('Compact benchmark never borrows the next effort’s requests and marks limited stages open', async()=>{
 const {runSimpleBenchmark}=await import('../src/cad-lab-simple-run.js');
 const requests={};
 const run=await runSimpleBenchmark({
  kind:'compact',modeler:{model:'fixture'},model:{vision:true,reasoningEfforts:['low','high','max']},
  selectedEfforts:['low','high','max'],signal:new AbortController().signal,
  desktop:{async developmentEvidence(){return {path:'fixture'};}},render(){},status(){},showSummary(){},
  async makeRuntime({signal,effort}){return {signal,async generate(){
   requests[effort]=(requests[effort]??0)+1;
   return {usage:{}};
  }};},
  async trial(domain,task,runtime,modeler,effort){
   for(let i=0;i<(effort==='low'?task.requests+1:task.requests);i++) await runtime.generate({});
   return {checks:[{label:'Native check',passed:true}]};
  },
 });
 assert.deepEqual(requests,{low:11,high:12,max:12});
 assert.equal(run.tokens.requests,35);
 assert.match(run.domains[0].results.low.note,/Anfragebudget.*offen|reserviert.*offen/);
 assert.ok(run.domains.some((area)=>/Anfragebudget/.test(area.results.high?.note) ||
   /Anfragebudget/.test(area.results.max?.note)));
});

test('Compact benchmark aborts in-flight work at the shared deadline and records unrun areas as open',async(t)=>{
 const {runSimpleBenchmark}=await import('../src/cad-lab-simple-run.js');
 t.mock.timers.enable({apis:['setTimeout']});
 const saved=new Map();
 let launches=0;
 const result=await runSimpleBenchmark({
  kind:'compact',modeler:{model:'fixture'},model:{vision:true},signal:new AbortController().signal,
  desktop:{async developmentEvidence({report}){saved.set(report.id,structuredClone(report));return {path:report.id};}},
  render(){},status(){},showSummary(){},
  async makeRuntime({signal}){return {signal};},
  async trial(domain,task,{signal}){
   launches++;
   t.mock.timers.tick(18*60000);
   assert.equal(signal.aborted,true);
   signal.throwIfAborted();
  },
 });
 assert.equal(launches,1);
 assert.equal(result.timedOut,true);
 assert.equal(saved.size,1);
 assert.match([...saved.values()][0].frontierNote,/Zeitanteil dieses Prüfbereichs erreicht.*lokalen Ausführung.*offen/);
 assert.equal([...saved.values()][0].results[0].interruptedDuring,'local');
 assert.equal(result.modelMs,0);
 assert.match(result.domains[1].openEfforts.auto,/Gesamtzeitbudget/);
});

test('Benchmark export includes its entire campaign, hashes, assets and redacted evidence',()=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
 const {randomUUID,createHash}=require('node:crypto'),{unzipSync,strFromU8}=require('fflate');
 const {createSupplementalEvidence}=require('../backend/ai-lab-supplemental-evidence.cjs');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-benchmark-package-'));
 try{
  const store=createSupplementalEvidence(directory,{provenance:()=>({version:'test',sourceHash:'fixture'})});
  const campaign=randomUUID(),first=randomUUID(),last=randomUUID(),other=randomUUID();
  const stage=(id,level,status)=>({id,campaign,level,task:'Stufe '+level,effort:'low',
   startedAt:'2026-11-20T00:00:0'+level+'Z',endedAt:'2026-11-20T00:00:0'+(level+1)+'Z',
   benchmark:{id:'Plattengrenze',version:3},status:'completed',
   simpleRun:{id:campaign,kind:'compact',status,plan:{requests:32}},
   caseIds:['ladder-'+level+'-1'],results:[{id:'ladder-'+level+'-1',status:'passed',requests:1,
    requestEvidence:[{prompt:'Test',reply:{token:'credential-fixture'}}],
    checks:[{label:'Länge',passed:true,actual:65}]}],
  });
  store.save(stage(first,1,'running'));
  assert.deepEqual(store.completed(),[]);
  assert.throws(()=>store.exportData(first),/läuft noch/);
  const completed=stage(last,2,'finished');
  Object.assign(completed.simpleRun,{priceLimitEUR:2,priceBudgetBasis:'api-equivalent',elapsedMs:1234,
   plan:{version:6,requests:32,domains:{Zeichnungsgrenze:{tasks:['views','section']}}},efforts:['low'],
   domains:[{id:'Zeichnungsgrenze',results:{low:{solvedStages:1}}}]});
  completed.referenceAssets=[{name:'Vorlage.stl',base64:'AQID'},{name:'Versuch-1-Zeichnung-Soll-1.webp',base64:'AQID'}];
  completed.results[0].referencePictures={target:[{name:'Versuch-1-Zeichnung-Soll-1.webp',caption:'Sollzeichnung'}]};
  store.save({...completed,benchmark:{id:'Zeichnungsgrenze',version:6}});
  assert.deepEqual(store.read(last).report.results[0].referencePictures,completed.results[0].referencePictures);
  assert.throws(()=>store.read('../other.json'),/Ungültiges Benchmark-Protokoll/);
  store.save({...stage(other,3,'running'),campaign:other,simpleRun:{id:other,kind:'compact',status:'running'}});
  assert.deepEqual(store.completed().map(row=>row.id),[last]);
  const [finished]=store.completed();
  assert.deepEqual(finished.budget.solved,[1]);
  assert.equal(finished.budget.stages,2);
  assert.equal(finished.budget.eur,2);
  assert.equal(finished.budget.basis,'api-equivalent');
  const result=store.exportData(first),zip=unzipSync(result.data);
  const read=name=>JSON.parse(strFromU8(zip[name]));
  assert.equal(result.reports,2);
  assert.equal(read('Ergebnis.json').summary.status,'finished');
  assert.equal(read('Versuche/'+last+'.json').benchmark.id,'Zeichnungsgrenze');
  assert.equal(read('Prüfplan.json').requests,32);
  assert.equal(read('Manifest.json').program.sourceHash,'fixture');
  assert.equal(read('Versuche/'+first+'.json').results[0].requestEvidence[0].reply.token,'[entfernt]');
  assert.deepEqual([...zip['Vorlagen/'+last+'/Vorlage.stl']],[1,2,3]);
  assert.deepEqual([...zip['Vorlagen/'+last+'/Versuch-1-Zeichnung-Soll-1.webp']],[1,2,3]);
  assert(!Object.keys(zip).some(name=>name.includes(other)));
  for(const file of read('Manifest.json').files)
   assert.equal(createHash('sha256').update(zip[file.name]).digest('hex'),file.sha256);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('Standard benchmark reserves an optional euro cap and blocks unknown tariffs before any request',async()=>{
 const {createLabPriceBudget}=await import('../src/cad-lab-price-budget.js');
 const {runSimpleBenchmark}=await import('../src/cad-lab-simple-run.js');
 const rate={usdPerEur:1.1};
 assert.throws(()=>createLabPriceBudget(2,rate,null,'chatgpt'),/bekannten API-Tarif/);
 let report;
 const options={
  kind:'compact',priceLimitEUR:.01,modeler:{model:'fixture',providerId:'chatgpt'},
  model:{vision:false},signal:new AbortController().signal,
  desktop:{async getAIExchangeRate(){return rate;},async developmentEvidence(value){report=structuredClone(value.report);return {path:'test'};}},
  render(){},status(){},showSummary(){},
  async makeRuntime({signal}){return {signal,outputLimit:4096,async generate(args){
   assert.equal(args.benchmarkPrice.remainingUSD,.01*1.1);
   throw Object.assign(Error('Preisreserve reicht nicht.'),{code:'LAB_PRICE_BUDGET'});
  }};},
  async trial(domain,task,runtime){await runtime.generate({prompt:'fixture'});},
 };
 await assert.rejects(runSimpleBenchmark(options),/bekannten API-Tarif/);
 const run=await runSimpleBenchmark({...options,modeler:{model:'fixture',providerId:'mock-api'},
  model:{vision:false,price:{input:3,output:6}},
 });
 assert.equal(report.results[0].priceBudgetReached,true);
 assert.equal(report.history[0].finished,0);
 assert.match(run.priceStopReason,/Preisreserve reicht nicht/);
 assert.equal(report.results[0].requests,0);
 assert.match(report.frontierNote,/Grenze offen/);
 const budget=createLabPriceBudget(2,rate,{input:1,output:2},'mock-api');
 assert.equal(budget.prepare({}).remainingUSD,2.2);
 budget.record({estimatedCostUSD:{max:2.19}});
 assert(budget.prepare({}).remainingUSD<.02);
 budget.record({estimatedCostUSD:{max:.03}});
 assert.throws(()=>budget.prepare({}),/Preisgrenze erreicht/);
});


test('The standard benchmark accepts a five-euro subscription estimate and stops before an unfunded request',async()=>{
 const {runSimpleBenchmark}=await import('../src/cad-lab-simple-run.js');
 let requests=0;
 let report;
 const run=await runSimpleBenchmark({
  kind:'compact',priceLimitEUR:5,modeler:{model:'gpt-6.2-sol',providerId:'chatgpt'},
  model:{price:{input:2,output:10,cached:.1},reasoningEfforts:['low','high']},
  selectedEfforts:['low','high'],signal:new AbortController().signal,
  desktop:{async getAIExchangeRate(){return {usdPerEur:1.1};},async developmentEvidence(value){
   report=structuredClone(value.report);
   return {path:'test'};
  }},
  render(){},status(){},showSummary(){},
  async makeRuntime({signal}){
   return {signal,outputLimit:null,webResearchAllowed:true,async generate(args) {
    if(args.benchmarkPrice.remainingUSD<.1)
     throw Object.assign(Error('Abo-Richtwert: Preisreserve zu klein.'),{code:'LAB_PRICE_BUDGET'});
    requests++;
    assert.equal(args.context.benchmarkWithoutResearch,true);
    return {usage:{inputTokens:75000,outputTokens:5000,estimatedCostUSD:{
     min:5.42,max:5.42,subscription:true,basis:'api-equivalent',
    }}};
   }};
  },
  async trial(_domain,_task,runtime){
   const args={context:{application:'Formnaro'},prompt:'Isolated test'};
   await runtime.generate(args);
   await runtime.generate(args);
   return {checks:[{label:'Native check',passed:true}]};
  },
 });
 assert.equal(requests,1);
 assert.equal(run.priceLimitEUR,5);
 assert.equal(run.priceBudgetBasis,'api-equivalent');
 assert.equal(run.plan.priceBudgetBasis,'api-equivalent');
 assert.equal(run.tokens.costUSD.subscription,true);
 assert.equal(run.tokens.costUSD.max,5.42);
 assert.match(run.priceStopReason,/Abo-Richtwert.*Preisreserve/);
 assert.equal(report.results[0].priceBudgetReached,true);
 assert.match(report.frontierNote,/Grenze offen/);
 assert.match(run.domains.at(-1).openEfforts.high,/Abo-Richtwert/);
});

test('The compact provider prompt drops unrelated CAD material and keeps native feature scope',async()=>{
 const {cadAIContext}=await import('../src/cad-ai-context.js');
 const {compactLabCadRequest}=await import('../src/cad-lab-provider-context.js');
 const source=cadAIContext();
 const scope={references:[{id:'feature-1'}]};
 const reduced=compactLabCadRequest({context:{...source,featureScope:scope},scene:{revision:'same'}});
 assert.deepEqual(reduced.context.featureScope,scope);
 assert.equal(reduced.scene.revision,'same');
 assert.equal(reduced.context.toolReference,undefined);
 assert.deepEqual(reduced.context.analysisContract.sourceBounds, {
  id:'bounds', engine:'cad', kind:'bounds',
  options:{targets:[{rootId:'<root id>',path:['<source id>']}]},
 });
 assert.match(reduced.context.geometryPlacement,/space:"local"/);
 assert.match(reduced.context.geometryPlacement,/Extend only the entry end/);
 const definitions=reduced.context.commandSchema.properties.commands.items.oneOf;
 const ops=definitions.flatMap(({properties})=>[properties.op.const,...(properties.op.enum??[])]);
 for(const op of ['create','group','joint','feature','drawing']) assert(ops.includes(op),op);
 assert(JSON.stringify(reduced.context).length<JSON.stringify(source).length/3);
 const drawing=compactLabCadRequest({context:source},'drawing');
 assert.equal(drawing.context.geometryPlacement,undefined);
 assert(drawing.context.commandSchema.properties.commands.items.oneOf.every(({properties})=>properties.op.const==='drawing'));
 assert(JSON.stringify(drawing.context).length<JSON.stringify(reduced.context).length/3);

});

test('detailed benchmark covers all planned tasks with local budgets and a separately counted measurement', async () => {
  const { runSimpleBenchmark } = await import('../src/cad-lab-simple-run.js');
  const { buildSupplementalPackage } = require('../backend/ai-lab-supplemental-package.cjs');
  const { unzipSync, strFromU8 } = require('fflate');
  const reports = new Map();
  const started = [];
  const outcome = await runSimpleBenchmark({
    kind: 'detailed', modeler: { model: 'fixture' }, model: { reasoningEfforts: ['medium'] },
    signal: new AbortController().signal,
    desktop: { async developmentEvidence({ report }) {
      reports.set(report.id, structuredClone(report));
      return { path: report.id };
    } },
    render() {}, status() {}, showSummary() {},
    async makeRuntime({ signal }) {
      return { signal, connection: { model: 'fixture', requestedEffort: 'medium', reasoningEffort: 'high' },
        async generate({ mockAnalysis }) {
          const usage = { benchmarkModelRequests: 1, benchmarkModelRetries: 0, benchmarkSentReasoningEffort: 'medium',
            inputTokens: 500, outputTokens: 100 };
          if (mockAnalysis) return { analysis: [{ id: 'mesh' }], usage };
          return { commands: [{ op: 'create' }], usage };
        } };
    },
    async trial(_domain, task, runtime) {
      started.push(task);
      if (task.freeAnalysisRequests) {
        await runtime.generate({ mockAnalysis: true });
        runtime.benchmark.acceptMeasurement([{ id: 'mesh' }]);
      }
      for (let index = 0; index < task.requests; index++) await runtime.generate({});
      if (task.id === 'fixture-3') return { checks: [{ label: 'Gelenk', passed: false }] };
      if (task.id === 'fixture-5') await runtime.generate({});
      return { checks: [{ label: 'Native check', passed: true }] };
    },
  });
  assert.equal(started.length, 25);
  assert.equal(started.reduce((sum, task) => sum + task.requests, 0), 60);
  assert.equal(started.reduce((sum, task) => sum + task.seconds, 0), 3685);
  assert.equal(outcome.providerRequests, 63);
  assert.equal(outcome.tokens.requests, 63);
  assert.deepEqual([outcome.solvedStages, outcome.failedStages, outcome.openStages], [23, 1, 1]);
  const data = buildSupplementalPackage('.', [...reports.values()].at(-1), [...reports.values()]);
  const files = unzipSync(data.data);
  const summary = JSON.parse(strFromU8(files['Ergebnis.json']));
  assert.equal(summary.benchmark.id, 'detailed');
  assert.equal(summary.attemptsByStage.length, 25);
  assert.equal(summary.attemptsByStage[0].outcome, 'failed');
  assert.equal(summary.attemptsByStage[1].cause, 'task-step-limit');
  const stl = summary.attemptsByStage.find((row) => row.taskId === 'stl-rim');
  assert.deepEqual(stl.results[0], { status: 'passed', elapsedMs: stl.results[0].elapsedMs, requests: 4,
    cause: 'passed', taskSteps: 3, analysisSteps: 1, bonusAnalysisSteps: 1, providerRequests: 4, providerRetries: 0 });
  const evidence = JSON.parse(strFromU8(files[stl.file])).results[0].requestEvidence;
  assert.equal(evidence[0].measurementBonus, true);
  assert.equal(evidence[0].usage.inputTokens, 500);
  assert.equal(evidence[1].sentReasoningEffort, 'medium');
});

test('detailed benchmark keeps unstarted tasks open at the provider limit and preserves measured failure', async () => {
  const { runSimpleBenchmark } = await import('../src/cad-lab-simple-run.js');
  const reports = new Map();
  let calls = 0;
  const result = await runSimpleBenchmark({
    kind: 'detailed', modeler: { model: 'fixture' }, model: {}, signal: new AbortController().signal,
    desktop: { async developmentEvidence({ report }) { reports.set(report.id, structuredClone(report)); return {}; } },
    render() {}, status() {}, showSummary() {},
    async makeRuntime({ signal }) {
      return { signal, async generate({ benchmarkModelRequests }) {
        calls++;
        assert.equal(benchmarkModelRequests, calls === 1 ? 63 : 3);
        return { usage: { benchmarkModelRequests: calls === 1 ? 60 : 3, benchmarkModelRetries: 1 } };
      } };
    },
    async trial(_domain, _task, runtime) {
      await runtime.generate({});
      runtime.benchmark.recordPreview({ runGeometryCheck: true, passed: false });
      await runtime.generate({});
      await runtime.generate({});
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.providerRequests, 63);
  assert.equal(result.failedStages, 1);
  assert.equal(result.openStages, 24);
  assert.equal(result.domains[1].stages[0].cause, 'not-started');
  assert.match(result.domains[1].stages[0].note, /Anbieterlimit/);
  assert.equal([...reports.values()][0].outcome, 'failed');
});

test('both STL countersinks are checked independently for diameter, angle and depth', async () => {
  const { measureCountersinks } = await import('../src/cad-lab-converter-checks.js');
  for (const [profile, expected] of [
    [(x, z) => Math.max(2, z - 2), [true, true]],
    [(x, z) => x < 0 ? 2 : Math.max(2, z - 2), [false, true]],
    [() => 2, [false, false]],
    [(x, z) => Math.max(2, 1.5 * (z - 4) + 2), [false, false]],
    [(x, z) => Math.max(2, z - 2.4), [false, false]],
  ]) {
    const checks = [];
    await measureCountersinks(async (_kind, [x, y, z]) => ({ point: [x + profile(x, z), y, z] }),
      (label, passed, actual) => checks.push({ label, passed, actual }));
    assert.deepEqual(checks.map((check) => check.passed), expected);
    assert.deepEqual(checks.map((check) => /X=(-?7)/.exec(check.label)[1]), ['-7', '7']);
  }
});

test('detailed benchmark reports price exhaustion separately and leaves later tasks in the denominator', async () => {
  const { runSimpleBenchmark } = await import('../src/cad-lab-simple-run.js');
  const reports = [];
  let requests = 0;
  const summary = await runSimpleBenchmark({
    kind: 'detailed', modeler: { model: 'fixture', providerId: 'https://api.mistral.ai' },
    model: { price: { input: 1, output: 1 } }, priceLimitEUR: .10, signal: new AbortController().signal,
    desktop: {
      async getAIExchangeRate() { return { usdPerEur: 1.1 }; },
      async developmentEvidence({ report }) { reports.push(structuredClone(report)); return {}; },
    },
    render() {}, status() {}, showSummary() {},
    async makeRuntime({ signal }) {
      return { signal, async generate() {
        requests++;
        return { usage: { benchmarkModelRequests: 1, estimatedCostUSD: { min: .12, max: .12 } } };
      } };
    },
    async trial(_domain, _task, runtime) {
      await runtime.generate({});
      await runtime.generate({});
    },
  });
  assert.equal(requests, 1);
  assert.match(summary.priceStopReason, /Preisgrenze/);
  assert.equal(reports[0].outcome, 'open');
  assert.equal(reports[0].cause, 'price-limit');
  assert.equal(summary.status, 'incomplete');
  assert.match(reports[0].frontierNote, /Nicht bewertet/);
  assert.equal(summary.openStages, 25);
});

test('v14 continues after a dispatched request returns no usage when its reserve fits', async () => {
  const { runSimpleBenchmark } = await import('../src/cad-lab-simple-run.js');
  const calls = [];
  const reports = new Map();
  const summary = await runSimpleBenchmark({
    kind: 'detailed', modeler: { model: 'fixture', providerId: 'https://api.deepseek.com' },
    model: { price: { input: 1, output: 1 } }, priceLimitEUR: 5, signal: new AbortController().signal,
    desktop: {
      async getAIExchangeRate() { return { usdPerEur: 1.1 }; },
      async developmentEvidence({ report }) { reports.set(report.id, structuredClone(report)); return { path: report.id }; },
    },
    render() {}, status() {}, showSummary() {},
    async makeRuntime({ signal }) {
      return { signal, async generate({ benchmarkPrice }) {
        calls.push(benchmarkPrice.remainingUSD);
        if (calls.length === 1) throw Object.assign(Error('Anfrage abgebrochen.'), {
          code: 'AI_PROVIDER_CONNECTION',
          aiUsage: { benchmarkModelRequests: 1,
            benchmarkPriceReserve: { maximumUSD: .22, requests: 1, costEstimated: true } },
        });
        return { usage: { benchmarkModelRequests: 1, estimatedCostUSD: { min: .01, max: .02 } } };
      } };
    },
    async trial(_domain, _task, runtime) {
      await runtime.generate({});
      return { checks: [{ label: 'Native check', passed: true }] };
    },
  });
  assert.equal(calls.length, 25);
  assert(Math.abs(calls[1] - 5.28) < 1e-8);
  assert.equal(summary.status, 'finished');
  assert.equal(summary.solvedStages, 24);
  assert.equal(summary.openStages, 1);
  assert.equal(summary.providerRequests, 25);
  assert.equal(summary.tokens.costUSD.reported, 24);
  assert(Math.abs(summary.tokens.costUSD.max - .48) < 1e-8);
  assert.deepEqual(summary.priceReserveUSD, { maximumUSD: .22, requests: 1, costEstimated: true });
  assert.deepEqual([...reports.values()][0].results[0].priceReserveUSD, summary.priceReserveUSD);
});

test('STL diagnostic runs every independent stage and preserves the check profile and converter evidence in its ZIP', async (t) => {
  const { runSimpleBenchmark } = await import('../src/cad-lab-simple-run.js');
  const { stlChallengeLadders, stlChallengeModelChecks } = await import('../src/cad-lab-stl-challenge-plan.js');
  const { createSupplementalEvidence } = require('../backend/ai-lab-supplemental-evidence.cjs');
  const { unzipSync, strFromU8 } = require('fflate');
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'formnaro-stl-diagnose-'));
  const evidence = createSupplementalEvidence(directory);
  if (!Uint8Array.prototype.toBase64) {
    Object.defineProperty(Uint8Array.prototype, 'toBase64', {
      configurable: true, value() { return Buffer.from(this).toString('base64'); },
    });
    t.after(() => { delete Uint8Array.prototype.toBase64; });
  }
  const stages = [];
  let latest;
  try {
    for (const [profile, path, key] of [['surface', 'checks', 'surfaceDeviation'], ['volume', 'checks', 'volume'], ['freecad', null, 'freecad']]) {
      const expected = stlChallengeModelChecks('standard');
      (path ? expected[path] : expected)[key] = true;
      assert.deepEqual(stlChallengeModelChecks(profile), expected);
    }
    const result = await runSimpleBenchmark({
      kind: 'stl-challenge', modelCheckProfile: 'surface',
      modeler: { model: 'fixture' }, model: { reasoningEfforts: ['low'] }, signal: new AbortController().signal,
      desktop: { async developmentEvidence({ report }) { latest = report.id; return evidence.save(report); } },
      render() {}, status() {}, showSummary() {},
      async makeRuntime({ signal }) {
        return { signal, connection: { model: 'fixture' },
          async generate() { return { usage: { benchmarkModelRequests: 1, benchmarkModelRetries: 0 } }; } };
      },
      async trial(_domain, task, runtime) {
        stages.push(task.id);
        assert.equal(runtime.modelCheckConfig.checks.surfaceDeviation, true);
        runtime.benchmark.recordConverter({ status: 'failed', elapsedMs: 12 });
        runtime.benchmark.recordModelChecks({ checks: [{ kind: 'surfaceDeviation', passed: true }] });
        runtime.showReference({ name: task.file, stl: new Uint8Array(140000).buffer, sha256: 'test-source' });
        await runtime.generate({ context: { key: 'ä' }, scene: { revision: 'test' } });
        return { checks: [{ label: 'Native check', passed: stages.filter((id) => id === task.id).length > 1 ||
          task.id !== 'stl-single-seat' }] };
      },
    });
    const planned = stlChallengeLadders.get('STL-Grenze').tasks.map(({ id }) => id);
    assert.deepEqual(stages, [planned[0], ...planned]);
    assert.deepEqual([result.providerRequests, result.solvedStages, result.failedStages], [6, 5, 0]);
    const files = unzipSync(evidence.exportData(latest).data);
    const summary = JSON.parse(strFromU8(files['Ergebnis.json']));
    assert.equal(summary.benchmark.id, 'stl-challenge');
    assert.equal(summary.summary.plan.modelCheckProfile, 'surface');
    assert.equal(summary.attemptsByStage[0].results[0].converter, 'failed');
    assert.deepEqual(summary.attemptsByStage[0].results.map((row) => row.status), ['failed', 'passed']);
    assert.equal(summary.attemptsByStage[1].results.length, 1);
    assert.equal(summary.attemptsByStage.at(-1).outcome, 'passed');
    assert.equal(Object.keys(files).filter(name => name.endsWith('.stl')).length, 5);
    const attempt = JSON.parse(strFromU8(files[summary.attemptsByStage[0].file])).results[0];
    assert.equal(attempt.reference.sha256, 'test-source');
    assert.equal(attempt.modelChecks[0].checks[0].kind, 'surfaceDeviation');
    assert(attempt.requestEvidence[0].contextBytes >= Buffer.byteLength(JSON.stringify({ key: 'ä' })));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('STL diagnosis gives the second attempt a fresh deadline after the first times out', async () => {
  const { runFrontier } = await import('../src/cad-lab-frontiers.js');
  const results = [];
  const calls = [];
  await runFrontier({
    domain: 'STL-Grenze', efforts: ['low'], modeler: { model: 'fixture' },
    simpleRun: { id: crypto.randomUUID(), kind: 'stl-challenge' },
    compact: {
      tasks: [{ id: 'fixture', label: 'Fixture', requests: 4, seconds: 0.05, check: 'stl-challenge' }],
      version: 1, detailed: true, independentAttempts: 2, exhausted: () => false,
    },
    stopAfterSuccess: true, budgetPerLevel: true, signal: new AbortController().signal,
    render() {}, status() {},
    desktop: { async developmentEvidence({ report }) { results.push(structuredClone(report)); return {}; } },
    async makeRuntime({ signal }) { return { signal }; },
    async trial(_domain, _task, { signal }) {
      calls.push(signal);
      if (calls.length === 1) await new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
      signal.throwIfAborted();
      return { checks: [{ label: 'Native check', passed: true }] };
    },
  });
  assert.equal(calls.length, 2);
  assert(calls[0].aborted);
  assert(!calls[1].aborted);
  assert.deepEqual(results[0].results.map(({ cause }) => cause), ['task-time-limit', 'passed']);
  assert.equal(results[0].outcome, 'passed');
});

test('The CAD fit comparison applies and exports the selected skill only in B stages', async () => {
 const {runSimpleBenchmark}=await import('../src/cad-lab-simple-run.js');
 const {cadAIContext}=await import('../src/cad-ai-context.js');
 const {unzipSync,strFromU8}=require('fflate');
 const {buildSupplementalPackage}=require('../backend/ai-lab-supplemental-package.cjs');
 const reports=new Map(), observed=[];
 const result=await runSimpleBenchmark({
  kind:'cad-fitting-skill',modeler:{model:'mock'},model:{reasoningEfforts:['low']},
  signal:new AbortController().signal,render(){},status(){},showSummary(){},
  desktop:{async developmentEvidence({report}){reports.set(report.id,structuredClone(report));return {path:report.id};}},
  async makeRuntime({signal}){return {signal,connection:{model:'mock'},
   async generate({context}){
    assert.equal(context.analysisContract.sourceBounds.options.targets.length,1);
    observed.push({skill:context.activeSkill?.id??null,control:!!context.analysisContract.useSourceBounds});
    return {usage:{benchmarkModelRequests:1,benchmarkModelRetries:0}};
   },
  };},
  async trial(_domain,_task,runtime){
   await runtime.generate({context:cadAIContext(),scene:{revision:'r'}});
   return {checks:[{label:'Native fixture',passed:true}]};
  },
 });
 assert.deepEqual(observed,[
  {skill:null,control:true},{skill:'formnaro-messen-und-einpassen',control:false},
  {skill:'formnaro-messen-und-einpassen',control:false},{skill:null,control:true},
 ]);
 assert.deepEqual([result.solvedStages,result.openStages,result.providerRequests],[4,0,4]);
 const saved=[...reports.values()], last=saved.at(-1);
 const files=unzipSync(buildSupplementalPackage('.',last,saved).data);
 const summary=JSON.parse(strFromU8(files['Ergebnis.json']));
 assert.equal(summary.benchmark.id,'cad-fitting-skill');
 assert.equal(summary.attemptsByStage.length,4);
 const trial=JSON.parse(strFromU8(files[summary.attemptsByStage[1].file]));
 assert.equal(trial.fittingVariant,'skill');
 assert.deepEqual(trial.results[0].requestEvidence[0].skill,{id:'formnaro-messen-und-einpassen',version:1});
 assert(trial.results[0].requestEvidence[0].contextBytes>0);
});
