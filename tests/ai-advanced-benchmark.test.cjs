const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const engine=require('../backend/ai-lab-benchmark.cjs'),plans=require('../backend/ai-test-lab-plan.cjs');
const hash=v=>crypto.createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v)).digest('hex');
const roles={modeler:{providerId:'current',model:'fixture',effort:'series'},supervisor:{providerId:'current',model:'fixture',effort:'low'},reviewer:{providerId:'current',model:'fixture',effort:'high'}};
const record=(spec)=>({id:crypto.randomUUID(),spec,requestedModel:'fixture',modelIdentity:{exactMatch:true},verification:{passed:true},cleanExit:true,status:'completed',elapsedMs:1000,startedAt:new Date().toISOString(),events:[{type:'request'},{type:'usage',returnedModel:'fixture'},{type:'finished'}]});
test('Recalibrated core suite retains all original tasks, limits and sixteen conditions',()=>{
 const s=engine.verifySuite();assert.equal(s.suiteId,'formnaro-practice-core');assert.equal(s.suiteVersion,'1.0.6');assert.notEqual(s.suiteHash,'666d1f278a94441b89567e1cd1c4ff620c6ba306c412576eebc2483a29469924'); for(const [file,old] of [['benchmark-core-v1.json','benchmark-core-1.0.4.json'],['benchmark-advanced-v2.json','benchmark-advanced-2.0.0.json']]){const current=require('../ai/'+file),previous=require('./fixtures/'+old);assert.deepEqual(current.cases,previous.cases);assert.deepEqual(current.limits,previous.limits);}
 assert.equal(plans.expandPlan(engine.benchmarkPlan({roles})).trials,16);assert.equal(s.limits.seconds,360);
});
test('Advanced suite is distinct, calibrated and freezes eight multi-step cases in two blocks',()=>{
 const s=engine.verifySuite(undefined,'advanced'),p=engine.benchmarkPlan({roles,suiteId:s.suiteId}),expanded=plans.expandPlan(p);
 assert.equal(s.suiteVersion,'2.0.2');assert(s.available);assert.notEqual(s.suiteHash,engine.verifySuite().suiteHash);
 assert.equal(s.cases.length,8);assert.equal(expanded.trials,16);assert.deepEqual(expanded.rows.map(r=>r.repeat),[...Array(8).fill(0),...Array(8).fill(1)]);
 assert(expanded.rows.every(r=>r.workflow==='practice'&&r.effort==='high'&&r.monitor.mode==='off'));
 assert.equal(p.limits.seconds,600);assert.equal(p.limits.rounds,30);
 assert.equal(engine.condition('advanced-01',1,s.suiteId),'A01-r2');assert.throws(()=>engine.condition('advanced-01',0));
 const proof=require('../ai/benchmark-advanced-calibration-v2.json');assert.equal(proof.providerRequests,0);assert.equal(proof.positiveNative,8);assert.equal(proof.nearMissRejected,8);assert(proof.cases.every(c=>c.nativeChecks.every(x=>x.passed)));
});
test('Unknown suites and non-practice advanced plans are rejected',()=>{
 assert.throws(()=>engine.benchmarkPlan({roles,suiteId:'unregistered'}),/Suite/);
 const p=engine.benchmarkPlan({roles,suiteId:'advanced'});assert.throws(()=>plans.validatePlan({...p,workflow:'agent'}));assert.throws(()=>plans.validatePlan({...p,dataset:'holdout'}));
});
test('Changed advanced oracle bytes invalidate only the advanced frozen suite',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-advanced-hash-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 for(const d of require('../ai/benchmark-advanced-v2.json').dependencies){const dest=path.join(root,d.path);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(__dirname,'..',d.path),dest);}
 fs.appendFileSync(path.join(root,'backend/ai-benchmark-advanced-evaluate.cjs'),'\n// modified');assert.throws(()=>engine.verifySuite(root,'advanced'),/kalibrieren/);assert.equal(engine.verifySuite(root).suiteVersion,'1.0.6');
});
test('Historical report cases come from the recorded manifest, not the current suite',()=>{
 const s=engine.verifySuite(),plan=engine.benchmarkPlan({roles}),id=crypto.randomUUID(),m={id,createdAt:new Date().toISOString(),suite:{...s,cases:s.cases.map((c,i)=>({...c,label:'Historisch '+i}))},plan,rows:[]};
 m.rows=plans.expandPlan(plan).rows.map(r=>({...r,seriesId:id,benchmark:{suiteHash:s.suiteHash,conditionId:engine.condition(r.caseId,r.repeat)}}));
 const summary=engine.summarizeBenchmark(m,m.rows.map(record));assert.equal(summary.passed,16);assert.equal(summary.cases[0].label,'Historisch 0');assert(!summary.cases.some(c=>c.id.startsWith('A')));
});
test('Advanced resume keeps passed attempts, runs only eleven pending conditions and reviews once',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-advanced-run-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const records=[],calls=[],reviews=[];let cap=5;
 const manager=engine.createBenchmarks({directory,getRecords:()=>records,getRoles:()=>roles,getSource:()=>({hash:'fixed'}),reviewEnabled:()=>true,review:async(rows)=>{assert.equal(rows.length,16);reviews.push(rows);return {id:crypto.randomUUID(),status:'completed'};},runSeries:async(plan,ctx)=>{const rows=plans.expandPlan(plan).rows.map(r=>({...r,seriesId:ctx.id,benchmark:{suiteHash:ctx.suite.suiteHash,conditionId:engine.condition(r.caseId,r.repeat,ctx.suite.suiteId)}})).filter(r=>ctx.pending.includes(r.benchmark.conditionId));calls.push(rows.map(r=>r.benchmark.conditionId));records.push(...rows.slice(0,cap).map(record));}});
 assert.equal(manager.state().suites.length,2);manager.preview({suiteId:'advanced'});assert.equal(calls.length,0);
 const first=await manager.start({suiteId:'advanced'});assert.equal(first.finished,5);assert.equal(reviews.length,0);const saved=JSON.stringify(records);
 cap=16;const second=await manager.start({id:first.id});assert.equal(second.passed,16);assert.equal(second.rawAttempts,16);assert.equal(second.cases[0].id,'A01');assert.equal(calls[1].length,11);assert.equal(JSON.stringify(records.slice(0,5)),saved);assert.equal(reviews.length,1);
 await assert.rejects(manager.start({id:first.id}),/vollständig/);assert.equal(manager.state().runs[0].suite.suiteId,'formnaro-practice-advanced');
});
test('Advanced native oracle checks protected state and exact bore axis, even at correct volume',async()=>{
 const {evaluateAdvanced}=require('../backend/ai-benchmark-advanced-evaluate.cjs');
 const before={project:{nodes:[{id:'body',name:'Aufgabenteil'},{id:'guard',name:'Unbeteiligtes Teil',locked:true}]}},after={project:structuredClone(before.project),scene:{revision:'revision',objects:[{id:'body',target:{path:[]},kind:'cad',solid:true,solids:1,worldBounds:{size:[60,40,10],center:[10,-5,10]},volume:24000-500*Math.PI}]}};
 let offset=0;const lookup=async(_m,{queries})=>({results:queries.map(q=>({value:{clear:true,surroundingMaterial:true,diameter:q.options.diameter,depth:10,axisOffset:offset,endpointError:offset,bottomPresent:true}}))});
 const replay={ok:true,steps:[{observation:{}}]},task={id:'advanced-01'};assert((await evaluateAdvanced(task,before,after,lookup,replay)).passed);
 offset=1;assert(!(await evaluateAdvanced(task,before,after,lookup,replay)).passed);offset=0;after.project.nodes[1].locked=false;assert(!(await evaluateAdvanced(task,before,after,lookup,replay)).passed);
});
test('Catalog labels core and advanced measurements separately and never pools their scores',()=>{
 const {benchmarkCatalog}=require('../backend/ai-model-benchmarks.cjs'),m={id:'new',plan:{roles:{modeler:{providerId:'chatgpt',model:'fixture'}},efforts:['high'],monitor:{mode:'off'}},suite:engine.verifySuite(undefined,'advanced'),createdAt:'2026-11-08T19:00:00Z',finished:16,planned:16,passed:7,status:'completed',source:{programVersion:'0.138.0',hash:'new'},byOutcome:{passed:7,failed:9}};
 const entry=benchmarkCatalog([m]).entries.find(e=>e.id==='local:new');assert.equal(entry.passed,7);assert.match(entry.label,/Aufbau/);assert.equal(entry.suiteVersion,'2.0.2');assert.equal(entry.total,16);
});
