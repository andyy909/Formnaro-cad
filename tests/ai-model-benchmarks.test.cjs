const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {benchmarkCatalog}=require('../backend/ai-model-benchmarks.cjs');
test('Bundled live evidence preserves all tested models, separate series and paused raw attempts',async()=>{
 const {benchmarkEntries}=await import('../src/cad-ai-model-benchmarks.js'),c=benchmarkCatalog(),all=benchmarkEntries(c.entries.filter(r=>r.kind!=='benchmark'&&r.model!=='gpt-6.1-sol'));
 assert.deepEqual([...new Set(all.map(r=>r.model))].sort(),['deepseek-flash','mistral-large-4']);
 assert.equal(all.length,6);assert.ok(all.every(r=>r.kind!=='benchmark'));
 const lab=all.filter(r=>r.kind==='lab');assert.equal(lab.reduce((n,r)=>n+r.passed,0),59);assert.equal(lab.reduce((n,r)=>n+r.total,0),72);
 assert.ok(lab.every(r=>r.status==='paused'));assert.equal(lab.reduce((n,r)=>n+(r.byOutcome.interrupted||0),0),1);
 assert.equal(lab.reduce((n,r)=>n+(r.byOutcome.unverified||0),0),2);
 assert.deepEqual(all.filter(r=>r.model==='mistral-large-4').map(r=>[r.passed,r.total]).sort(),[[13,19],[57,72]]);
 assert.equal(benchmarkEntries(c.entries,'text').length,0);assert.equal(benchmarkEntries(c.entries,'photo').length,2);
});
test('Model attribution is exact and does not borrow other access modes or aliases',async()=>{
 const {modelBenchmarks,benchmarkEntries}=await import('../src/cad-ai-model-benchmarks.js'),entries=benchmarkCatalog().entries;
 assert.equal(modelBenchmarks(entries,'https://api.mistral.ai','mistral-large-4').length,0);
 assert.equal(modelBenchmarks(entries,'https://api.deepseek.com','deepseek-v4-flash').length,0);
 assert.equal(modelBenchmarks(entries,'https://api.deepseek.com','deepseek-flash').length,5);
 assert.equal(benchmarkEntries(entries,'all','MISTRAL').length,2);
 assert.equal(benchmarkEntries(entries,'all','untested').length,0);
});
function local(overrides={}){return {id:'fixture',plan:{roles:{modeler:{providerId:'chatgpt',model:'gpt-test',effort:'high'},reviewer:{model:'reviewer-private'}},efforts:['high'],monitor:{mode:'off'}},createdAt:'2026-11-07T12:00:00Z',suite:{suiteVersion:'1.0.1',suiteHash:'a'.repeat(64)},status:'incomplete',passed:2,planned:16,finished:3,rawAttempts:4,byOutcome:{passed:2,failed:1,pending:13},source:{programVersion:'0.136.0',privatePath:'C:/private',files:[{path:'private'}]},secret:'never sent',...overrides};}
test('Local benchmark uses planned denominator, fixed suite and only public summary fields',()=>{
 const r=benchmarkCatalog([local()]).entries.at(-1);
 assert.equal(r.total,16);assert.equal(r.finished,3);assert.equal(r.passed,2);assert.equal(r.rawAttempts,4);assert.equal(r.status,'incomplete');
 assert.equal(r.byOutcome.pending,13);assert.equal(r.suiteHash,'a'.repeat(64));assert.equal(r.model,'gpt-test');assert.equal(r.providerId,'chatgpt');
 assert.doesNotMatch(JSON.stringify(r),/secret|private|reviewer|roles|files/);
 const next=benchmarkCatalog([local({suite:{suiteVersion:'1.0.2',suiteHash:'b'.repeat(64)}})]).entries.at(-1);assert.notEqual(r.suiteHash,next.suiteHash);
});
test('Zero executed tests and unresolved profile aliases do not create measured bars',()=>{
 const base=benchmarkCatalog().entries.length;
 assert.equal(benchmarkCatalog([local({finished:0})]).entries.length,base);
 const s=local();s.plan.roles.modeler.providerId='current';assert.equal(benchmarkCatalog([s]).entries.length,base);
 const one=benchmarkCatalog();one.entries[0].passed=0;assert.equal(benchmarkCatalog().entries[0].passed,57);
});
test('Reading the catalog neither starts a model request nor changes existing protocols',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-model-benchmarks-'));let calls=0;
 try{
  const credentials=()=>({config:{baseUrl:'https://api.deepseek.com',model:'deepseek-flash'},key:'test-only'});
  const runner=require('../backend/ai-diagnostics.cjs').createDiagnostics({app:{isPackaged:false},directory:dir,credentials,provider:{completeModel:()=>{calls++;throw Error('Must never run');},testConnection:()=>{calls++;throw Error('Must never run');}}});
  const before=fs.readdirSync(dir),first=runner.modelBenchmarks(),second=runner.modelBenchmarks();
  assert.deepEqual(first,second);assert.deepEqual(fs.readdirSync(dir),before);assert.equal(calls,0);assert.equal(runner.state().records.length,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('Comparison excludes partial, exercise and repair history and keeps the latest single complete run per model',async()=>{
 const {benchmarkComparisons,comparableBenchmarks}=await import('../src/cad-ai-model-benchmarks.js');
 const complete=local({status:'completed',finished:16,passed:15,createdAt:'2026-11-08T10:00:00Z'});
 const later=local({id:'later',status:'completed',finished:16,passed:12,createdAt:'2026-11-08T11:00:00Z'});
 const partial=local({id:'partial',createdAt:'2026-11-08T12:00:00Z'});
 const entries=benchmarkCatalog([complete,later,partial]).entries.filter(r=>r.origin==='local'||r.kind!=='benchmark'),groups=benchmarkComparisons(entries);
 assert.equal(groups.length,1);const bars=comparableBenchmarks(entries,groups[0].id);
 assert.equal(bars.length,1);assert.equal(bars[0].id,'local:later');assert.equal(bars[0].passed,12);assert.equal(bars[0].total,16);
 assert.equal(comparableBenchmarks(entries,groups[0].id,'Mistral').length,0);
 assert.equal(benchmarkComparisons(benchmarkCatalog([partial]).entries.filter(r=>r.origin==='local')).length,0);
});

test('Comparison separates suite, effort, monitor and exact program build without borrowing another model result',async()=>{
 const {benchmarkComparisons,comparableBenchmarks}=await import('../src/cad-ai-model-benchmarks.js');
 const base=local({status:'completed',finished:16,source:{programVersion:'0.137.0',asarSHA256:'one'}});
 const variants=[base,{...base,id:'two',source:{...base.source,asarSHA256:'two'}},{...base,id:'suite',suite:{...base.suite,suiteHash:'other'}},
 {...base,id:'effort',plan:{...base.plan,efforts:['max']}},{...base,id:'monitor',plan:{...base.plan,monitor:{mode:'shadow'}}},
 {...base,id:'model',plan:{...base.plan,roles:{modeler:{...base.plan.roles.modeler,model:'different'}}}}];
 const entries=benchmarkCatalog(variants).entries.filter(r=>r.origin==='local'),groups=benchmarkComparisons(entries);assert.equal(groups.length,5);
 const same=groups.find(g=>g.entries.length===2);assert.equal(comparableBenchmarks(entries,same.id).length,2);
 assert.deepEqual(comparableBenchmarks(entries,same.id).map(r=>r.model).sort(),['different','gpt-test']);
});

test('Task chart uses exactly the eight cases from one selected benchmark, including unfinished zero results',async()=>{
 const {benchmarkRunEntries}=await import('../src/cad-ai-model-benchmarks.js');
 const run=local({id:'selected',cases:Array.from({length:8},(_,i)=>({id:'B0'+(i+1),label:'Task '+i,passed:i===0?2:0,finished:i===0?2:0}))});
 const rows=benchmarkRunEntries(run);assert.equal(rows.length,8);assert.equal(rows[0].passed,2);assert.equal(rows[1].passed,0);
 assert.ok(rows.every(r=>r.id.startsWith('selected:')&&r.total===2));assert.equal(rows[1].status,'incomplete');assert.deepEqual(benchmarkRunEntries(null),[]);
});

test('Different program builds have a separate explicit comparison without changing exact groups or original results',async()=>{
 const {benchmarkComparisons,benchmarkComparisonOptions,comparableBenchmarks}=await import('../src/cad-ai-model-benchmarks.js');
 const first=local({id:'deepseek',status:'completed',finished:16,passed:16,source:{programVersion:'0.137.0',hash:'old'}});
 const second=local({id:'sol',status:'completed',finished:16,passed:12,source:{programVersion:'0.137.2',hash:'fixed'}});second.plan.roles.modeler.model='gpt-sol';
 const entries=benchmarkCatalog([first,second,local({id:'partial'})]).entries.filter(r=>r.origin==='local'),before=structuredClone(entries);
 assert.equal(benchmarkComparisons(entries).length,2);
 const options=benchmarkComparisonOptions(entries),mixed=options.find(g=>g.differentSources);assert.equal(options.length,3);assert(mixed);
 const bars=comparableBenchmarks(entries,mixed.id);assert.equal(bars.length,2);assert.deepEqual(bars.map(r=>[r.sourceVersion,r.passed]).sort(),[['0.137.0',16],['0.137.2',12]]);
 assert.deepEqual(entries,before);assert.equal(benchmarkComparisonOptions(entries.filter(r=>r.id!=='local:sol')).some(g=>g.differentSources),false);
});

 test('Published fixed benchmark preserves its measured build and sixteen successful conditions',async()=>{
 const c=benchmarkCatalog(),r=c.entries.find(r=>r.kind==='benchmark'&&r.origin==='reference');assert.equal(r.passed,16);assert.equal(r.total,16);assert.equal(r.finished,16);assert.equal(r.sourceVersion,'0.137.0');assert.equal(r.effort,'high');assert.equal(r.monitor,'off');assert.equal(r.rawAttempts,16);assert.equal(r.suiteVersion,'1.0.2');assert.match(r.sourceHash,/^[a-f0-9]{64}$/);
 });

test('Published Sol history keeps the original 14/16 separate from two successful drawing retests',async()=>{
 const {benchmarkComparisonOptions,comparableBenchmarks,modelBenchmarks}=await import('../src/cad-ai-model-benchmarks.js');
 const entries=benchmarkCatalog().entries,sol=modelBenchmarks(entries,'chatgpt','gpt-6.1-sol');assert.equal(sol.length,4);
 const original=sol.find(r=>r.id==='sol-core-84a16ca2-fb68-48f5-93fb-fa609fe03ab6'),repair=sol.find(r=>r.id==='sol-drawing-retests-332740b2-2270-4e9a-a041-df1dacc32aa2');
 assert.deepEqual([original.passed,original.total,original.sourceVersion],[14,16,'0.137.2']);assert.deepEqual([repair.passed,repair.total,repair.sourceVersion],[2,2,'0.137.3']);
 const group=benchmarkComparisonOptions(entries).find(g=>g.differentSources&&g.entries.some(r=>r.id===original.id));assert(group);
 const bars=comparableBenchmarks(entries,group.id);assert.deepEqual(bars.map(r=>[r.model,r.passed,r.total]).sort(),[['deepseek-flash',16,16],['gpt-6.1-sol',14,16]]);assert(!bars.some(r=>r.id===repair.id));
 const evidence=require('../docs/benchmarks/sol-drawing-retests-2026-11-08.json');assert.equal(evidence.result.freshFullBenchmark,false);assert.equal(evidence.result.fullyAccepted,2);assert.equal(evidence.conditions.length,2);assert(evidence.conditions.every(c=>c.native&&c.cleanExit&&c.modelExact));
});


test('Published newer Sol 15/16 and drilling 1/1 remain separate with their original measured builds',async()=>{
 const entries=benchmarkCatalog().entries,newer=entries.find(r=>r.id==='sol-core-a19790ac-bdcd-4cc1-b1a7-4c901ec804ed'),repair=entries.find(r=>r.id==='sol-drill-retest-32b8a60a-a39e-484f-a273-403c5f0fb2cc');
 assert.deepEqual([newer.kind,newer.passed,newer.total,newer.rawAttempts,newer.sourceVersion],['benchmark',15,16,17,'0.137.3']);assert.equal(newer.suiteVersion,'1.0.3');
 assert.deepEqual([repair.kind,repair.passed,repair.total,repair.sourceVersion],['lab',1,1,'0.137.4']);
 const evidence=require('../docs/benchmarks/sol-drill-retest-2026-11-08.json');assert.equal(evidence.measuredProgram.version,'0.137.4-r1');assert.equal(evidence.result.freshFullBenchmark,false);assert.equal(evidence.result.retainedOriginalSuccesses,15);assert.equal(evidence.conditions.length,1);assert.equal(evidence.conditions[0].conditionId,'B03-r2');assert.equal(evidence.conditions[0].checks.length,7);assert(evidence.conditions[0].checks.every(c=>c.passed));assert(evidence.conditions[0].modelExact&&evidence.conditions[0].cleanExit);
 const {benchmarkComparisonOptions,comparableBenchmarks}=await import('../src/cad-ai-model-benchmarks.js');for(const group of benchmarkComparisonOptions(entries))assert(!comparableBenchmarks(entries,group.id).some(r=>r.id===repair.id));
});
