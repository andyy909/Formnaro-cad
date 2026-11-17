const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto');
const {benchmarkPlan,verifySuite,summarizeBenchmark,createBenchmarks}=require('../backend/ai-lab-benchmark.cjs'),{expandPlan}=require('../backend/ai-test-lab-plan.cjs');
const roleSelection={modeler:{providerId:'current',model:'fixture',effort:'series'},supervisor:{providerId:'current',model:'fixture',effort:'low'},reviewer:{providerId:'current',model:'fixture',effort:'high'}};
function manifest(){const plan=benchmarkPlan({roles:roleSelection}),id=crypto.randomUUID(),suite=verifySuite();return {id,plan,suite,source:{hash:'source'},rows:expandPlan(plan).rows.map(s=>({...s,seriesId:id,benchmark:{suiteHash:suite.suiteHash,conditionId:require('../backend/ai-lab-benchmark.cjs').condition(s.caseId,s.repeat)}}))};}
function record(m,s,overrides={}){return {id:crypto.randomUUID(),spec:s,requestedModel:'fixture',modelIdentity:{exactMatch:true},verification:{passed:true},cleanExit:true,status:'completed',elapsedMs:1000,startedAt:new Date().toISOString(),events:[{type:'request'},{type:'usage',returnedModel:'fixture',usage:{input_tokens:10,output_tokens:1},rates:{input:1,output:1,cached:0},ms:2},{type:'finished'}],...overrides};}
function temp(t){const p=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-benchmark-'));t.after(()=>fs.rmSync(p,{recursive:true,force:true}));return p;}
test('Benchmark freezes eight cases, two ordered blocks and exactly one reasoning effort',()=>{const p=benchmarkPlan({roles:roleSelection,effort:'low'}),e=expandPlan(p);assert.equal(e.trials,16);assert.deepEqual(e.rows.map(r=>r.repeat),[...Array(8).fill(0),...Array(8).fill(1)]);assert.ok(e.rows.every(r=>r.effort==='low'&&r.monitor.mode==='off'&&r.workflow==='practice'&&r.variant==='C'&&r.imageMode==='none'));assert.equal(verifySuite().challenge.available,false);assert.throws(()=>benchmarkPlan({monitor:'active'}));});
test('Benchmark excludes changed or unknown model identities and unverified geometry; retains the planned denominator',()=>{const m=manifest(),rows=m.rows.slice(0,7).map(s=>record(m,s));rows[1].events[1].returnedModel='another-model';rows[2].verification=null;rows[3].verification={passed:false};rows[4].verificationError='Native checker unavailable';rows[5].cleanExit=false;rows[6].formatCorrections=1;const s=summarizeBenchmark(m,rows);assert.equal(s.planned,16);assert.equal(s.finished,7);assert.equal(s.pending,9);assert.equal(s.passed,2);assert.equal(s.withoutCorrections,1);assert.equal(s.afterCorrections,1);assert.equal(s.byOutcome['model-unverified'],1);assert.equal(s.byOutcome.unverified,1);assert.equal(s.byOutcome.failed,1);assert.equal(s.byOutcome.infrastructure,2);assert.equal(s.outcomes.find(o=>o.runId===rows[5].id)?.outcome,'infrastructure');assert.equal(s.medianSuccessfulMs,1000);});
test('Opening/preview does not execute; resume runs only pending conditions and analyst waits for all sixteen',async t=>{const directory=temp(t),records=[],calls=[],reviews=[];let cap=5,source='one';const manager=createBenchmarks({directory,getRecords:()=>records,getRoles:()=>roleSelection,getSource:()=>({hash:source}),reviewEnabled:()=>true,review:async(rows,o)=>{reviews.push(o);assert.equal(new Set(rows.map(r=>r.spec.benchmark.conditionId)).size,16);return {id:crypto.randomUUID(),status:'completed'};},runSeries:async(plan,ctx)=>{const rows=expandPlan(plan).rows.map(s=>({...s,seriesId:ctx.id,benchmark:{suiteHash:ctx.suite.suiteHash,conditionId:require('../backend/ai-lab-benchmark.cjs').condition(s.caseId,s.repeat)}})).filter(s=>ctx.pending.includes(s.benchmark.conditionId));calls.push(rows.map(s=>s.benchmark.conditionId));for(const s of rows.slice(0,cap))records.push(record(null,s));}});assert.equal(manager.state().runs.length,0);assert.equal(manager.preview().trials,16);assert.equal(calls.length,0);const first=await manager.start();assert.equal(first.finished,5);assert.equal(reviews.length,0);const original=JSON.stringify(records);source='different';await assert.rejects(manager.start({id:first.id}),/eingefrorenen/);source='one';cap=16;const next=await manager.start({id:first.id});assert.equal(next.finished,16);assert.equal(calls[1].length,11);assert.ok(calls[1].every(id=>!calls[0].slice(0,5).includes(id)));assert.equal(JSON.stringify(records.slice(0,5)),original);assert.equal(reviews.length,1);assert.equal(next.reviewStatus,'completed');await assert.rejects(manager.start({id:first.id}),/vollständig/);const report=await manager.report({id:first.id});assert.equal(JSON.parse(fs.readFileSync(report.path)).summary.passed,16);});
test('Interrupted attempts and failed completed conditions remain separate; a failed completed condition is never silently retried',()=>{const m=manifest(),s=m.rows[0],failed=record(m,s,{verification:{passed:false}}),interrupted=record(m,m.rows[1],{status:'interrupted'}),newAttempt=record(m,m.rows[1]);const result=summarizeBenchmark(m,[failed,interrupted,newAttempt]);assert.equal(result.rawAttempts,3);assert.equal(result.finished,2);assert.equal(result.passed,1);assert.equal(result.byOutcome.failed,1);assert.equal(result.pending,14);});
test('Role-specific monitor connection retains baseline, final reserve and non-success completion',async()=>{const {createTrialMonitor}=require('../backend/ai-test-lab-monitor.cjs');let seen;const signal=AbortSignal.abort(),finalSignal=new AbortController().signal;const monitor=createTrialMonitor({settings:{mode:'shadow',effort:'low'},connection:{config:{baseUrl:'http://localhost:1234',model:'separate'},key:'private',effort:'high'},config:{},signal,finalSignal,task:'test',baseline:{objectCount:4},emit(){},completeModel:async(c,k,e)=>{seen={c,k,e};return {text:JSON.stringify({verdict:'continue',reasonCode:'none',confidence:.8,explanation:'Recovery possible',evidence:'No native result'}),data:{model:'separate',usage:{input_tokens:1,output_tokens:1}}};}});await monitor.inspectFinal({status:'failed',verification:null,cleanExit:true});const r=await monitor.finish();assert.equal(seen.k,'private');assert.equal(seen.c.model,'separate');assert.equal(seen.e.effort,'high');assert.equal(JSON.parse(seen.e.user).baseline.objectCount,4);assert.equal(r.final.completion,'not-met');});
test('Integrated benchmark dispatch uses the selected model, never calls the disabled supervisor and reviews only after every child closes',async t=>{
 const directory=temp(t),revision='0123456789abcdef';let closed=0,modeler=0,analyst=0;
 const runner=require('../backend/ai-diagnostics.cjs').createDiagnostics({app:{},directory,credentials:()=>({key:'fixture-private',config:{baseUrl:'https://api.deepseek.com',model:'deepseek-flash'}}),provider:{testConnection:async()=>({models:['deepseek-flash']}),completeModel:async(c,key,e)=>{e.onDiagnostic?.({type:'request',body:{model:c.model}});if(e.system.includes('independent Formnaro experiment supervisor'))throw Error('Supervisor must be off');let value;if(e.system.includes('third Formnaro lab agent')){analyst++;assert.equal(closed,16);assert.equal(modeler,16);assert.equal(JSON.parse(e.user).counts.finished,16);value={summary:'16 lokale Transportkontrollen; keine verifizierte Modellleistung.',findings:[],nextChecks:[]};}else{modeler++;assert.equal(e.effort,'high');value={status:'completed',message:'Lokale Transportfixture ohne CAD-Ergebnis'};}return {text:JSON.stringify(value),data:{model:c.model,usage:{input_tokens:10,output_tokens:2}}};}},openChild:()=>({call:async method=>method==='setup'?{scene:{revision,objects:[],selectionTargets:[]},context:{},validationContext:(await import('../src/cad-ai-context.js')).cadAIContext(),project:{nodes:[]}}:method==='snapshot'?{scene:{revision,objects:[]},project:{nodes:[]}}:{},cancel(){},close:async()=>{closed++;return {code:0,signal:null};}})});
 assert.equal(runner.state().records.length,0);const result=await runner.labBenchmarkStart({effort:'high'});assert.equal(result.finished,16);assert.equal(result.passed,0);assert.equal(analyst,1);assert.equal(result.reviewStatus,'completed');assert.equal(runner.state().records.length,16);assert.ok(runner.state().records.every(r=>r.roles.modeler.model==='deepseek-flash'&&r.trialBudget.reservedMs===0));const zip=runner.labBenchmarkExport({id:result.id});assert.equal(zip.summary.finished,16);const scope=JSON.parse(require('fflate').strFromU8(require('fflate').unzipSync(fs.readFileSync(zip.path))['Ergebnisuebersicht.json']));assert.equal(scope.completion.benchmark.planned,16);assert.equal(scope.counts.nativePassed,0);
});
test('Benchmark export counts sixteen conditions separately from an interrupted raw attempt',()=>{const m=manifest(),rows=m.rows.map(s=>record(m,s));rows.unshift(record(m,m.rows[0],{status:'interrupted'}));const b=summarizeBenchmark(m,rows);const counts=require('../backend/ai-lab-review-data.cjs').summarize(rows,{planned:17,status:'completed',benchmark:b});assert.equal(counts.planned,16);assert.equal(counts.finished,16);assert.equal(counts.pending,0);assert.equal(counts.attempts.recorded,17);assert.equal(counts.attempts.interrupted,1);});
test('Task descriptions are valid UTF8; native fixture and oracle definitions remain frozen',()=>{const bytes=fs.readFileSync(path.join(__dirname,'../backend/ai-practice-function-cases.cjs'));assert.ok(Buffer.from(bytes.toString('utf8')).equals(bytes));assert.ok(!require('../backend/ai-test-lab-cases.cjs').taskInstance('practice-14').prompt.includes('\ufffd'));assert.equal(verifySuite().planned,16);});
test('Completed benchmark summary exposes the Wilson interval on the planned denominator',()=>{
 const m=manifest(),s=summarizeBenchmark(m,m.rows.map(r=>record(m,r)));
 assert.equal(s.status,'completed');assert.equal(s.planned,16);assert.equal(s.finished,16);assert.equal(s.pending,0);
 assert.equal(Math.round(s.interval.low*1000),806);assert.equal(Math.round(s.interval.high*1000),1000);
});
test('Incomplete benchmark summary keeps progress/open conditions and no interval',()=>{
 const m=manifest(),s=summarizeBenchmark(m,m.rows.slice(0,7).map(r=>record(m,r)));
 assert.equal(s.status,'incomplete');assert.equal(s.planned,16);assert.equal(s.finished,7);assert.equal(s.pending,9);
 assert.equal(s.byOutcome.pending,9);assert.equal(s.interval,null);
});
test('Report divides all request costs including the reviewer by two confirmed successes',async t=>{
 const directory=temp(t),m=manifest();fs.writeFileSync(path.join(directory,'Benchmark-'+m.id+'.json'),JSON.stringify(m));
 const rows=[record(m,m.rows[0]),record(m,m.rows[1])];
 for(const row of rows){row.rates=row.events[1].rates;delete row.events[1].rates;}
 const review={seriesIds:[m.id],requestCount:1,unsettledRequests:0,usageEvents:[{role:'reviewer',usage:{input_tokens:100,output_tokens:10},rates:{input:1,output:2,cached:1},at:'2026-11-17T10:00:00Z'}]};
 const manager=createBenchmarks({directory,getRecords:()=>rows,getRoles:()=>roleSelection,getSource:()=>({hash:'source'}),runSeries:async()=>{},review:async()=>{},reviewEnabled:()=>false,getReviews:()=>[review]});
 const report=await manager.report({id:m.id}),data=JSON.parse(fs.readFileSync(report.path,'utf8'));
 assert.equal(data.summary.passed,2);assert.equal(data.costs.perSuccess.seconds,1);assert.equal(data.costs.perSuccess.priceUnknown,false);assert.equal(data.costs.total.unsettledRequests,0);
 assert.ok(Math.abs(data.costs.perSuccess.costMin-0.000061)<1e-12,JSON.stringify(data.costs));assert.ok(Math.abs(data.costs.perSuccess.costMax-0.000071)<1e-12);assert.ok(Math.abs(data.costs.total.min-0.000122)<1e-12);assert.ok(Math.abs(data.costs.total.max-0.000142)<1e-12);
});
test('A request without a usage response makes the report cost sum unknown',async t=>{
 const directory=temp(t),m=manifest();fs.writeFileSync(path.join(directory,'Benchmark-'+m.id+'.json'),JSON.stringify(m));
 const rows=[record(m,m.rows[0]),record(m,m.rows[1]),record(m,m.rows[2],{status:'interrupted',events:[{type:'request'}]})];
 const review={seriesIds:[m.id],requestCount:1,unsettledRequests:0,usageEvents:[{role:'reviewer',usage:{input_tokens:100,output_tokens:10},rates:{input:1,output:2,cached:1},at:'2026-11-17T10:00:00Z'}]};
 const manager=createBenchmarks({directory,getRecords:()=>rows,getRoles:()=>roleSelection,getSource:()=>({hash:'source'}),runSeries:async()=>{},review:async()=>{},reviewEnabled:()=>false,getReviews:()=>[review]});
 const report=await manager.report({id:m.id}),data=JSON.parse(fs.readFileSync(report.path,'utf8'));
 assert.equal(data.summary.passed,2);assert.equal(data.costs.perSuccess.priceUnknown,true);assert.equal(data.costs.total.priceUnknown,true);assert.equal(data.costs.total.unsettledRequests,1);
});
test('An unanswered reviewer request makes total and per-success costs unknown',async t=>{
 const directory=temp(t),m=manifest();fs.writeFileSync(path.join(directory,'Benchmark-'+m.id+'.json'),JSON.stringify(m));
 const rows=[record(m,m.rows[0]),record(m,m.rows[1])];
 const review={seriesIds:[m.id],requestCount:2,unsettledRequests:1,usageEvents:[{role:'reviewer',usage:{input_tokens:100,output_tokens:10},rates:{input:1,output:2,cached:1},at:'2026-11-17T10:00:00Z'}]};
 const manager=createBenchmarks({directory,getRecords:()=>rows,getRoles:()=>roleSelection,getSource:()=>({hash:'source'}),runSeries:async()=>{},review:async()=>{},reviewEnabled:()=>false,getReviews:()=>[review]});
 const report=await manager.report({id:m.id}),data=JSON.parse(fs.readFileSync(report.path,'utf8'));
 assert.equal(data.summary.passed,2);
 assert.equal(data.costs.total.unsettledRequests,1);
 assert.equal(data.costs.total.priceUnknown,true);
 assert.equal(data.costs.perSuccess.priceUnknown,true);
});
test('Duplicate usage in one attempt does not hide a missing usage response in another attempt',async t=>{
 const directory=temp(t),m=manifest();fs.writeFileSync(path.join(directory,'Benchmark-'+m.id+'.json'),JSON.stringify(m));
 const rows=[record(m,m.rows[0]),record(m,m.rows[1]),record(m,m.rows[2],{status:'interrupted',events:[{type:'request'}]})];
 rows[0].events.splice(1,0,{type:'usage',returnedModel:'fixture',usage:{input_tokens:10,output_tokens:1},rates:{input:1,output:1,cached:0},ms:2});
 const review={seriesIds:[m.id],requestCount:1,unsettledRequests:0,usageEvents:[{role:'reviewer',usage:{input_tokens:100,output_tokens:10},rates:{input:1,output:2,cached:1},at:'2026-11-17T10:00:00Z'}]};
 const manager=createBenchmarks({directory,getRecords:()=>rows,getRoles:()=>roleSelection,getSource:()=>({hash:'source'}),runSeries:async()=>{},review:async()=>{},reviewEnabled:()=>false,getReviews:()=>[review]});
 const report=await manager.report({id:m.id}),data=JSON.parse(fs.readFileSync(report.path,'utf8'));
 assert.equal(data.summary.passed,2);
 assert.equal(data.costs.total.unsettledRequests,1);
 assert.equal(data.costs.total.priceUnknown,true);
});
test('Markdown report labels complete tariff amounts as USD estimates and uses the planned denominator',async t=>{
 const directory=temp(t),m=manifest();fs.writeFileSync(path.join(directory,'Benchmark-'+m.id+'.json'),JSON.stringify(m));
 const rows=m.rows.map(s=>record(m,s));
 const review={seriesIds:[m.id],requestCount:1,unsettledRequests:0,usageEvents:[{role:'reviewer',usage:{input_tokens:100,output_tokens:10},rates:{input:1,output:2,cached:1},at:'2026-11-17T10:00:00Z'}]};
 const manager=createBenchmarks({directory,getRecords:()=>rows,getRoles:()=>roleSelection,getSource:()=>({hash:'source'}),runSeries:async()=>{},review:async()=>{},reviewEnabled:()=>false,getReviews:()=>[review]});
 const report=await manager.report({id:m.id,format:'md'}),text=fs.readFileSync(report.path,'utf8');
 assert.match(text,/16\/16 vollständig bestätigt/);
 assert.match(text,/Wilson-Bereich für diese Aufgaben: 80\.6–100\.0 % \(95 %, geplanter Nenner 16\)/);
 assert.match(text,/Abdeckung: 16\/16 geplante Bedingungen \(0 offen\)/);
 assert.match(text,/Kosten gesamt: [\d.]+–[\d.]+ USD \(Tarifschätzung\)/);
 assert.match(text,/Kosten je Erfolg: [\d.]+–[\d.]+ USD \(Tarifschätzung\); 1\.00 s durchschnittlich je bestätigtem Erfolg/);
 assert.doesNotMatch(text,/Preis vollständig/);
});
test('Markdown report hides complete amounts when one price is incomplete',async t=>{
 const directory=temp(t),m=manifest();fs.writeFileSync(path.join(directory,'Benchmark-'+m.id+'.json'),JSON.stringify(m));
 const rows=m.rows.map(s=>record(m,s));
 delete rows[0].events[1].rates;
 const review={seriesIds:[m.id],requestCount:1,unsettledRequests:0,usageEvents:[{role:'reviewer',usage:{input_tokens:100,output_tokens:10},rates:{input:1,output:2,cached:1},at:'2026-11-17T10:00:00Z'}]};
 const manager=createBenchmarks({directory,getRecords:()=>rows,getRoles:()=>roleSelection,getSource:()=>({hash:'source'}),runSeries:async()=>{},review:async()=>{},reviewEnabled:()=>false,getReviews:()=>[review]});
 const json=await manager.report({id:m.id}),data=JSON.parse(fs.readFileSync(json.path,'utf8'));
 assert.equal(data.costs.total.priceUnknown,true);
 assert.ok(data.costs.total.min>0);
 const text=fs.readFileSync((await manager.report({id:m.id,format:'md'})).path,'utf8');
 assert.match(text,/Kosten gesamt: unbekannt \(Tarifschätzung, USD; unvollständige Usage- oder Preisangaben\)/);
 assert.match(text,/Kosten je Erfolg: unbekannt \(Tarifschätzung, USD; unvollständige Usage- oder Preisangaben\)/);
 assert.doesNotMatch(text,/Kosten (?:gesamt|je Erfolg): [\d]/);
});
test('Markdown report treats unknown prices as unknown without a numeric amount',async t=>{
 const directory=temp(t),m=manifest();fs.writeFileSync(path.join(directory,'Benchmark-'+m.id+'.json'),JSON.stringify(m));
 const rows=m.rows.map(s=>record(m,s));
 for(const row of rows)delete row.events[1].rates;
 const review={seriesIds:[m.id],requestCount:1,unsettledRequests:0,usageEvents:[{role:'reviewer',usage:{input_tokens:100,output_tokens:10},at:'2026-11-17T10:00:00Z'}]};
 const manager=createBenchmarks({directory,getRecords:()=>rows,getRoles:()=>roleSelection,getSource:()=>({hash:'source'}),runSeries:async()=>{},review:async()=>{},reviewEnabled:()=>false,getReviews:()=>[review]});
 const json=await manager.report({id:m.id}),data=JSON.parse(fs.readFileSync(json.path,'utf8'));
 assert.equal(data.costs.total.priceUnknown,true);
 assert.equal(data.costs.total.min,0);
 const text=fs.readFileSync((await manager.report({id:m.id,format:'md'})).path,'utf8');
 assert.match(text,/Kosten gesamt: unbekannt \(Tarifschätzung, USD; unvollständige Usage- oder Preisangaben\)/);
 assert.match(text,/Kosten je Erfolg: unbekannt \(Tarifschätzung, USD; unvollständige Usage- oder Preisangaben\)/);
 assert.doesNotMatch(text,/Kosten (?:gesamt|je Erfolg): [\d]/);
});
test('Markdown report keeps no successes separate from unknown costs and uses the planned denominator',async t=>{
 const directory=temp(t),m=manifest();m.rows=m.rows.slice(0,4);fs.writeFileSync(path.join(directory,'Benchmark-'+m.id+'.json'),JSON.stringify(m));
 const rows=m.rows.map(s=>record(m,s,{verification:{passed:false}}));
 const review={seriesIds:[m.id],requestCount:1,unsettledRequests:0,usageEvents:[{role:'reviewer',usage:{input_tokens:100,output_tokens:10},rates:{input:1,output:2,cached:1},at:'2026-11-17T10:00:00Z'}]};
 const manager=createBenchmarks({directory,getRecords:()=>rows,getRoles:()=>roleSelection,getSource:()=>({hash:'source'}),runSeries:async()=>{},review:async()=>{},reviewEnabled:()=>false,getReviews:()=>[review]});
 const json=await manager.report({id:m.id}),data=JSON.parse(fs.readFileSync(json.path,'utf8'));
 assert.equal(data.summary.passed,0);
 assert.equal(data.summary.planned,4);
 assert.equal(data.costs.perSuccess,null);
 assert.equal(data.costs.total.priceUnknown,false);
 const text=fs.readFileSync((await manager.report({id:m.id,format:'md'})).path,'utf8');
 assert.match(text,/0\/4 vollständig bestätigt/);
 assert.match(text,/Wilson-Bereich für diese Aufgaben: 0\.0–49\.0 % \(95 %, geplanter Nenner 4\)/);
 assert.match(text,/Kosten gesamt: [\d.]+–[\d.]+ USD \(Tarifschätzung\)/);
 assert.match(text,/Kosten je Erfolg: nicht berechenbar \(Nenner 0; Tarifschätzung, USD\)/);
 assert.doesNotMatch(text,/keine bestätigten Erfolge/);
});
