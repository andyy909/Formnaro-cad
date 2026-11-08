const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const data=require('../backend/ai-lab-review-data.cjs'),{createLabReviewer,validateResult}=require('../backend/ai-lab-reviewer.cjs');
const id=()=>crypto.randomUUID();
function directory(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-review-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
const credentials=()=>({key:'test-private-secret-123456789',config:{baseUrl:'https://api.deepseek.com',model:'deepseek-flash'}});
function row(extra={}){return {id:id(),spec:{caseId:'practice-16',effort:'high',variant:'C',stage:'full',workflow:'practice',monitor:{mode:'shadow'}},status:'completed',sourceHash:'frozen',cleanExit:true,verification:{passed:true},monitor:{final:{verdict:'continue'},judgments:[]},events:[{type:'finished',ms:1}],...extra};}
function result(runId){return {summary:'Ein konkreter Bedienbefund.',findings:[{title:'Werkzeugparameter verwenden',category:'ui',certainty:'observed',runIds:[runId],observation:'Die Bauteilbreite wurde geändert.',suggestedChange:'Das Fasenmaß über das Werkzeugfeld setzen.',validation:'Breite und Lage nach der Fase unabhängig prüfen.'}],nextChecks:['Betroffenen Fall nachprüfen.']};}
function provider(fn){return {completeModel:async(c,k,e,signal)=>{e.onDiagnostic({type:'request',body:{model:c.model}});return fn(c,k,e,signal);}};}
const reply=v=>({text:JSON.stringify(v),data:{model:'deepseek-flash',usage:{input_tokens:20,output_tokens:10,input_tokens_details:{cached_tokens:0}}}});

test('a truncated analyst response retries once with enough output room and retains both requests',async t=>{
 const dir=directory(t),r=row(),budgets=[];
 const reviewer=createLabReviewer({directory:dir,credentials,provider:provider((c,k,e)=>{budgets.push(e.outputBudget);if(budgets.length===1)return {text:'',data:{status:'incomplete',model:'deepseek-flash',usage:{input_tokens:20,output_tokens:8192}}};return reply(result(r.id));})});
 const analysis=await reviewer.run([r]);assert.equal(analysis.status,'completed');assert.deepEqual(budgets,[8192,16384]);assert.equal(analysis.events.filter(e=>e.type==='request').length,2);
});

test('Outcome counts keep missing native checks distinct from failed checks and shadow completion',()=>{
 const a=row(),b=row({verification:null,status:'failed'}),c=row({verification:{passed:false}}),d=row({monitor:{final:{verdict:'stop'}},verification:{passed:true}});
 const s=data.summarize([a,b,c,d],{planned:6,status:'blocked'});
 assert.equal(s.nativePassed,2);assert.equal(s.nativeFailed,1);assert.equal(s.nativeUnverified,1);assert.equal(s.fullyAccepted,1);assert.equal(s.pending,2);
});
test('Analyst sees original task, actual global-property drift and the protected baseline',t=>{
 const r=row({practicePlan:{actions:[{kind:'set',field:'size-0',value:1}]},practiceResult:{steps:[{kind:'set',field:'size-0',previous:40,actual:1,expected:1}]},events:[{type:'start-context',user:'Current scene (data):\n{}\nUser task:\nOriginal historical task.'},{type:'executed-step',actual:{objectCount:4},ok:true,action:{kind:'select'}},{type:'finished'}]});
 const e=data.evidenceFor(data.selectScope(directory(t),[r]));assert.equal(e.details[0].task,'Original historical task.');assert.equal(e.details[0].firstObserved.objectCount,4);assert.deepEqual(e.details[0].propertyChanges,[{field:'size-0',previous:40,actual:1,expected:1}]);
});
test('External archive round-trips hashes, original outcomes, image references and redaction without profiles',t=>{
 const dir=directory(t),r=row({events:[{type:'request',apiKey:'unknown-key',authorization:'Bearer another-secret',text:'test-private-secret-123456789 C:/Users/private/profile.json'},{type:'image',image:'data:image/png;base64,AQID'},{type:'finished'}]});
 fs.writeFileSync(path.join(dir,'ai-settings.json'),'secret profile must never be copied');fs.writeFileSync(path.join(dir,'model-'+r.id+'.ocad'),JSON.stringify({name:'Synthetic model',apiKey:'not-for-export'}));
 const out=data.exportPackage({directory:dir,scope:data.selectScope(dir,[r],{completion:{planned:2,status:'blocked'}}),secrets:[credentials().key]});
 const {unzipSync,strFromU8}=require('fflate'),entries=unzipSync(fs.readFileSync(out.path)),manifest=JSON.parse(strFromU8(entries['Manifest.json']));
 assert.equal(manifest.summary.pending,1);assert.equal(manifest.images,1);assert.ok(!Object.keys(entries).some(n=>n.includes('ai-settings')));
 for(const f of manifest.files)assert.equal(crypto.createHash('sha256').update(entries[f.name]).digest('hex'),f.sha256);
 const raw=strFromU8(entries['Protokolle/run-'+r.id+'.json']);for(const secret of ['unknown-key','another-secret','test-private-secret-123456789','C:/Users/private'])assert.ok(!raw.includes(secret),secret);
 assert.equal(JSON.parse(raw).verification.passed,true);assert.match(JSON.parse(raw).events[1].image.imageFile,/^Bilder\//);assert.equal(entries['Bilder/'+r.id+'-1.png'].length,3);
});
test('Review schema rejects fabricated run IDs and executable patch fields',()=>{
 const r=row(),e={runs:[{id:r.id}]},good=result(r.id);assert.deepEqual(validateResult(JSON.stringify(good),e),good);
 assert.throws(()=>validateResult(JSON.stringify(result(id())),e),/Versuchsbelege/);assert.throws(()=>validateResult(JSON.stringify({...good,patch:'change source'}),e),/Abschlussbericht/);
});
test('No internal analysis request runs while a planned trial is still missing or cancelled',async t=>{
 const dir=directory(t),r=row();let requests=0;const reviewer=createLabReviewer({directory:dir,credentials,provider:provider(async()=>{requests++;return reply(result(r.id));})});
 await assert.rejects(reviewer.run([r],{completion:{planned:2,status:'blocked'}}),/alle geplanten/);
 await assert.rejects(reviewer.run([row({status:'cancelled'})]),/alle geplanten/);assert.equal(requests,0);assert.equal(reviewer.state().reviews.length,0);
});
test('Completed review is independent, bounded, billed separately and never mutates source outcomes',async t=>{
 const dir=directory(t),r=row(),original=JSON.stringify(r),events=[];let calls=0;
 const reviewer=createLabReviewer({directory:dir,credentials,onEvent:e=>events.push(e),provider:provider(async(c,k,e)=>{calls++;assert.equal(e.input.history.length,0);assert.equal(e.input.images.length,0);assert.ok(!('tools' in e));assert.equal(c.reasoningEffort,'high');return calls===1?reply({summary:'malformed'}):reply(result(r.id));})});
 const out=await reviewer.run([r]);assert.equal(out.status,'completed');assert.equal(calls,2);assert.equal(JSON.stringify(r),original);assert.equal(reviewer.state().reviews[0].usageEvents.length,2);assert.ok(events.every(e=>e.event.role==='reviewer'));assert.ok(!JSON.stringify(out).includes(credentials().key));
 const loaded=createLabReviewer({directory:dir,credentials,provider:{}}).state();assert.equal(loaded.reviews.length,1);assert.equal(loaded.reviews[0].result.findings[0].runIds[0],r.id);assert.ok(!('evidence' in loaded.reviews[0]));
});
test('Failed or cancelled analysis leaves finished tests intact and preserves unsettled requests',async t=>{
 const dir=directory(t),r=row();let reviewer;
 reviewer=createLabReviewer({directory:dir,credentials,provider:provider((c,k,e,signal)=>new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(signal.reason),{once:true});setImmediate(()=>reviewer.cancel());}))});
 const out=await reviewer.run([r]);assert.equal(out.status,'cancelled');assert.equal(r.verification.passed,true);assert.equal(reviewer.state().reviews[0].unsettledRequests,1);assert.equal(reviewer.state().busy,false);
});
test('Full report includes reviewer usage without treating analyses as extra CAD trials',async t=>{
 const dir=directory(t),r=row();r.spec.experiment='lab';r.usageEvents=[];r.spec.seriesId=id();
 const report=await require('../backend/ai-test-lab-report.cjs').labReport({directory:dir,records:[r],reviews:[{id:id(),seriesIds:[r.spec.seriesId],usageEvents:[{usage:{input_tokens:100,output_tokens:10,input_tokens_details:{cached_tokens:0}},rates:{input:.15,output:.6,cached:.003},at:'2026-11-07T17:00:00Z'}]}],seriesId:r.spec.seriesId});
 assert.equal(report.roles.reviewer.input,100);assert.equal(report.total.input,100);const raw=JSON.parse(fs.readFileSync(report.path));assert.equal(raw.runs.length,1);assert.equal(raw.reviews.length,1);
});
test('Automatic analyst runs only after both trial closes; deferred staged phases do not trigger it',async t=>{
 const dir=directory(t),revision='0123456789abcdef';let closed=0,reviewCalls=0,runner;
 const {preset}=require('../backend/ai-test-lab-plan.cjs');
 runner=require('../backend/ai-diagnostics.cjs').createDiagnostics({app:{},directory:dir,credentials,provider:{testConnection:async()=>({models:['deepseek-flash']}),completeModel:async(c,k,e)=>{
  if(e.system.includes('third Formnaro lab agent')){reviewCalls++;assert.equal(closed,2);const evidence=JSON.parse(e.user);assert.equal(evidence.runs.length,2);assert.equal(evidence.counts.pending,0);assert.ok(evidence.runs.every(r=>r.status==='proposal'));return reply({...result(evidence.runs[0].id),summary:'Zwei Startprüfungen abgeschlossen.'});}
  return reply({tool:'offlinecad_preview',arguments:{revision,commands:[{op:'create',type:'box',size:[1,2,3]}]}});
 }},openChild:()=>({call:async(method)=>{if(method==='setup')return {scene:{revision,objects:[],selectionTargets:[]},context:{},validationContext:(await import('../src/cad-ai-context.js')).cadAIContext(),project:{nodes:[]}};if(method==='capture')return 'data:image/png;base64,AQID';return {};},cancel(){},close:async()=>{closed++;return {code:0,signal:null};}})});
 const plan={...preset(),caseIds:['drill'],variants:['A'],efforts:['low','high'],monitor:{mode:'off'}};
 await runner.start({mode:'lab',plan});assert.equal(reviewCalls,1);assert.equal(runner.state().records.length,2);assert.equal(runner.state().lab.reviewer.reviews[0].status,'completed');
 await runner.start({mode:'lab',plan:{...plan,efforts:['low']},deferReview:true});assert.equal(reviewCalls,1);assert.equal(closed,3);
});
