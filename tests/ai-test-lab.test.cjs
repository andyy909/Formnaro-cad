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
