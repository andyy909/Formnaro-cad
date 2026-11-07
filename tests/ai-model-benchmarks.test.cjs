const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {benchmarkCatalog}=require('../backend/ai-model-benchmarks.cjs');
test('Bundled live evidence preserves all tested models, separate series and paused raw attempts',async()=>{
 const {benchmarkEntries}=await import('../src/cad-ai-model-benchmarks.js'),c=benchmarkCatalog(),all=benchmarkEntries(c.entries);
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
 assert.equal(modelBenchmarks(entries,'https://api.deepseek.com','deepseek-flash').length,4);
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
