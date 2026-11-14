const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createDiagnostics}=require('../backend/ai-diagnostics.cjs');
const revision='0123456789abcdef';
function harness(t,completeModel,onEvent=()=>{}){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-diagnostic-test-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const calls=[];let closed=0,cancelled=0;
 const runner=createDiagnostics({app:{},directory,reviewerEnabled:false,credentials:()=>({key:'private-test-secret',config:{baseUrl:'https://api.deepseek.com',model:'deepseek-flash'}}),onEvent,provider:{testConnection:async()=>({models:['deepseek-flash']}),completeModel},openChild:()=>({call:async(method,args)=>{calls.push({method,args});if(method==='setup')return {scene:{revision,objects:[],selectionTargets:[]},context:{},validationContext:(await import('../src/cad-ai-context.js')).cadAIContext(),project:{nodes:[{id:'protected',name:'Unbeteiligtes Teil'}]}};if(method==='snapshot')return {scene:{revision,objects:[],selectionTargets:[]},project:{nodes:[{id:'protected',name:'Unbeteiligtes Teil'}]}};if(method==='providerScene')return {revision,objects:[],selectionTargets:[]};if(method==='capture')return 'data:image/png;base64,AAAA';if(method==='rpc'&&args.method==='screenshot')return {mimeType:'image/png',dataBase64:'AAAA'};return {};},cancel(){cancelled++;},async close(){closed++;return {code:0,signal:null};}})});
 return {runner,calls,directory,get closed(){return closed;},get cancelled(){return cancelled;}};
}
const spec={mode:'single',caseId:'drill',variant:'A',effort:'low',stage:'start'};
const reply=tool=>({data:{model:'deepseek-flash',usage:{input_tokens:100,output_tokens:20,input_tokens_details:{cached_tokens:70}}},text:JSON.stringify(tool)});

test('Lab supervisor has independent input, role billing and a frozen series manifest',async t=>{
 const {preset}=require('../backend/ai-test-lab-plan.cjs');let inputs=[];
 const h=harness(t,async(c,k,e)=>{inputs.push(e);e.onDiagnostic({type:'request',body:{model:c.model}});return e.system.includes('independent Formnaro experiment supervisor')?reply({verdict:'continue',reasonCode:'none',confidence:.8,explanation:'No proven violation',evidence:'Valid proposal'}):reply({tool:'offlinecad_preview',arguments:{revision,commands:[{op:'create',type:'box',size:[1,2,3]}]}});});
 const plan={...preset(),caseIds:['drill'],variants:['A'],efforts:['low']};await h.runner.start({mode:'lab',plan});const r=h.runner.state().records[0];assert.equal(r.status,'proposal');assert.equal(r.usageEvents.length,2);assert.deepEqual(r.usageEvents.map(e=>e.role).sort(),['modeler','supervisor']);assert.equal(r.requestCount,2);assert.ok(r.planHash===undefined);assert.ok(r.spec.planHash);assert.equal(inputs[1].input.history.length,0);assert.ok(!inputs[1].user.includes('verification'));assert.equal(r.monitor.verdict,'continue');
 const files=fs.readdirSync(h.directory).filter(n=>n.startsWith('Serie-'));assert.equal(files.length,1);const manifest=JSON.parse(fs.readFileSync(path.join(h.directory,files[0]),'utf8'));assert.equal(manifest.rows.length,1);assert.equal(manifest.source.hash,r.sourceHash);assert.ok(manifest.source.files.some(f=>f.path==='backend/ai-test-lab-monitor.cjs'));
 const report=await h.runner.labReport({format:'json'});assert.equal(report.roles.supervisor.input,100);assert.equal(report.roles.modeler.input,100);assert.equal(report.total.input,200);assert.ok(!fs.readFileSync(report.path,'utf8').includes('private-test-secret'));
});

test('Active supervisor aborts an in-flight model response and no modeling step is executed',async t=>{
 const {preset}=require('../backend/ai-test-lab-plan.cjs');
 const h=harness(t,async(c,k,e,signal)=>{e.onDiagnostic({type:'request',body:{model:c.model}});if(e.system.includes('independent Formnaro experiment supervisor'))return reply({verdict:'stop',reasonCode:'wrong_target',confidence:.99,explanation:'Wrong target',evidence:'Target OTHER'});return new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(signal.reason),{once:true});e.onDiagnostic({type:'reasoning',text:'x'.repeat(1000)});});});
 const p=preset();await h.runner.start({mode:'lab',plan:{...p,caseIds:['drill'],variants:['A'],efforts:['low'],monitor:{...p.monitor,mode:'active',trigger:'reasoning'}}});const r=h.runner.state().records[0];assert.equal(r.status,'monitor-stopped');assert.equal(r.error.code,'MONITOR_STOP');assert.ok(!h.calls.some(c=>c.args?.method==='preview'));assert.equal(r.unsettledRequests,1);assert.equal(h.closed,1);
});
test('Startup trial sends actual effort/image and stops before mutation; export excludes secrets',async t=>{
 let envelope;const h=harness(t,async(c,k,e)=>{envelope=e;e.onDiagnostic({type:'request',body:{secretInText:k}});return reply({tool:'offlinecad_preview',arguments:{revision,commands:[{op:'create',type:'box',size:[1,2,3]}]}});});
 await h.runner.start({...spec,startImage:true});const record=h.runner.state().records[0];assert.equal(record.status,'proposal');assert.equal(envelope.effort,'low');assert.equal(envelope.input.images.length,1);assert.ok(record.startImageHash);assert.ok(!h.calls.some(c=>c.args?.method==='preview'));assert.equal(h.closed,1);assert.equal(record.usageEvents[0].usage.input_tokens,100);
 const file=h.runner.export(record.id,'json').path;assert.ok(!fs.readFileSync(file,'utf8').includes('private-test-secret'));
});
test('Cancellation reaches provider and child, persists incomplete billing and closes child',async t=>{
 let abortSeen=false,h;h=harness(t,async(c,k,e,signal)=>new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>{abortSeen=true;reject(signal.reason);},{once:true});e.onDiagnostic({type:'request',body:{model:c.model}});setImmediate(()=>h.runner.cancel());}));
 await h.runner.start(spec);assert.equal(abortSeen,true);assert.ok(h.cancelled);assert.equal(h.closed,1);const r=h.runner.state().records[0];assert.equal(r.status,'cancelled');assert.equal(r.unsettledRequests,1);assert.ok(fs.existsSync(path.join(h.directory,'run-'+r.id+'.json')));
});
test('Read limit is exactly three and replay starts with fresh history',async t=>{
 const lengths=[];const h=harness(t,async(c,k,e)=>{lengths.push(e.input.history.length);return reply({tool:'offlinecad_scene',arguments:{}});});await h.runner.start(spec);await h.runner.start(spec);assert.deepEqual(lengths,[0,2,4,0,2,4]);assert.equal(h.runner.state().records[0].status,'read-limit');
});
test('Vision matrix has balanced 18 pairs and no image variants enter startup winner selection',()=>{
 const {visionMatrix}=require('../backend/ai-diagnostic-cases.cjs'),{winners}=require('../backend/ai-diagnostics.cjs');const rows=visionMatrix({low:'B',high:'C',max:'C'});assert.equal(rows.length,36);assert.equal(rows.filter(r=>r.startImage).length,18);assert.equal(new Set(rows.map(r=>[r.caseId,r.effort].join())).size,18);
 assert.equal(winners([{benchmarkVersion:1,spec:{experiment:'vision',stage:'start',caseId:'drill',effort:'low',variant:'C'},proposedValid:true,elapsedMs:1}]).low,'B');
});
test('Accounting reproduces actual provider CSV and includes cache exactly once',async()=>{
 const {usagePrice,usageTotals}=await import('../src/cad-ai-diagnostic-usage.js');const rates={input:.15,cached:.003,output:.6,peakMultiplier:2};const u=usagePrice({input_tokens:3094412,output_tokens:103569,input_tokens_details:{cached_tokens:1953920}},rates,'2026-11-05T19:30:00Z');assert.ok(Math.abs(u.cost.min-.23907696)<1e-12);assert.equal(u.cost.min,u.cost.max);assert.equal(usageTotals([u,u]).input,6188824);const unknown=usagePrice({input_tokens:100,output_tokens:10},rates,'2026-11-05T19:30:00Z');assert.ok(unknown.cost.min<unknown.cost.max);assert.equal(usageTotals([unknown]).cacheUnknown,true);
});
test('Cancelled streamed text remains redacted and explicitly incomplete in export',async t=>{
 let h;h=harness(t,async(c,k,e,signal)=>new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(signal.reason),{once:true});e.onDiagnostic({type:'reasoning',text:'Anbietertext '+k});setImmediate(()=>h.runner.cancel());}));await h.runner.start(spec);const r=h.runner.read(h.runner.state().records[0].id);assert.ok(r.events.some(e=>e.type==='reasoning'&&e.incomplete&&e.text.includes('[entfernt]')));assert.ok(!JSON.stringify(r).includes('private-test-secret'));
});
test('Failed executable launch settles close instead of hanging',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-failed-child-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const child=require('../backend/ai-diagnostic-child.cjs').openDiagnosticChild({app:{isPackaged:true},directory,executable:path.join(directory,'missing.exe')});await assert.rejects(child.call('setup',{},1000));const result=await child.close();assert.equal(result.signal,'spawn-error');
});
test('Cancelling a stuck native RPC rejects it promptly and allows regular child exit',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-stuck-child-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));fs.writeFileSync(path.join(directory,'package.json'),JSON.stringify({main:'index.cjs'}));fs.writeFileSync(path.join(directory,'index.cjs'),"process.on('message',m=>{if(m.method==='close')process.exit(0);});");
 const child=require('../backend/ai-diagnostic-child.cjs').openDiagnosticChild({app:{isPackaged:false,getAppPath:()=>directory},directory,executable:process.execPath});const started=Date.now(),pending=child.call('setup');const rejected=assert.rejects(pending,{name:'AbortError'});child.cancel();await rejected;assert.ok(Date.now()-started<1000);const result=await child.close();assert.equal(result.code,0);assert.ok(!result.forced);
});
test('Requested screenshot is forwarded as an image, never base64 text',async t=>{
 const envelopes=[];let call=0;const h=harness(t,async(c,k,e)=>{envelopes.push(structuredClone({input:e.input,user:e.user}));return reply(++call===1?{tool:'offlinecad_screenshot',arguments:{}}:{status:'completed',message:'done'});});await h.runner.start(spec);assert.equal(envelopes[1].input.images.length,1);assert.ok(!envelopes[1].user.includes('AAAA'));
});
test('Total report exports all attempts, including failures, without credentials',async t=>{
 const h=harness(t,async()=>reply({tool:'offlinecad_preview',arguments:{revision,commands:[{op:'create',type:'box',size:[1,2,3]}]}}));await h.runner.start(spec);await h.runner.start(spec);
 const file=(await h.runner.exportAll('json')).path,r=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(r.runs.length,2);assert.equal(r.total.input,200);assert.equal(r.total.output,40);assert.equal(r.total.cached,140);assert.ok(!JSON.stringify(r).includes('private-test-secret'));const md=fs.readFileSync((await h.runner.exportAll('md')).path,'utf8');assert.ok(md.includes('2 Tests'));assert.ok(md.includes('keine Anbieterrechnung'));
});
test('Total report preserves known cache subtotals and unknown-price flags across mixed usage',async t=>{
 const h=harness(t,async()=>reply({status:'completed',message:'done'}));await h.runner.start(spec);
 const r=h.runner.read(h.runner.state().records[0].id);r.events.push({type:'usage',round:1,ms:1,usage:{input_tokens:100,output_tokens:10}},{type:'usage',round:2,ms:2,usage:{input_tokens:100}});
 const report=JSON.parse(fs.readFileSync((await h.runner.exportAll('json')).path,'utf8'));assert.equal(report.total.cached,70);assert.equal(report.total.cacheUnknown,true);assert.equal(report.total.priceUnknown,true);assert.ok(report.total.min<report.total.max);
});
test('A response without usage stays unsettled and exports unknown cost without crashing',async t=>{
 const h=harness(t,async(c,k,e)=>{e.onDiagnostic({type:'request',body:{model:c.model}});return {data:{model:c.model},text:JSON.stringify({status:'completed',message:'done'})};});await h.runner.start(spec);
 assert.equal(h.runner.state().records[0].unsettledRequests,1);const report=JSON.parse(fs.readFileSync((await h.runner.exportAll('json')).path,'utf8'));assert.equal(report.total.priceUnknown,true);assert.equal(report.unsettledRequests,1);assert.match(fs.readFileSync((await h.runner.exportAll('md')).path,'utf8'),/Weitere Kosten unbekannt/);
});
test('Provider reconciliation exposes only validated totals and is removed with local records',async t=>{
 const h=harness(t,async()=>reply({status:'completed',message:'done'}));fs.writeFileSync(path.join(h.directory,'Anbieterabgleich.json'),JSON.stringify({checkedAt:'2026-11-05T20:00:00Z',providerCostUSD:'1.12',costDifferenceUSD:'.01',localRequestsStarted:3,requestCountMatchesIncludingUnsettled:true,providerCostsMatchTokenRows:true,apiKey:'private-test-secret'}));
 const value=h.runner.state().reconciliation;assert.equal(value.costUSD,1.12);assert.equal(value.requests,3);assert.ok(!JSON.stringify(value).includes('private-test-secret'));
 const report=JSON.parse(fs.readFileSync((await h.runner.exportAll('json')).path,'utf8'));assert.deepEqual(report.reconciliation,value);h.runner.clear();assert.equal(h.runner.state().reconciliation,null);
});
test('Part-view supplement keeps the original matrix intact and covers real practice separately',()=>{
 const {assemblyMatrix}=require('../backend/ai-diagnostic-assembly.cjs');const {matrix}=require('../backend/ai-diagnostic-cases.cjs');assert.equal(matrix('start').length,54);assert.equal(assemblyMatrix().length,21);assert.equal(assemblyMatrix(true).length,6);assert.equal(assemblyMatrix(true).filter(x=>x.workflow==='practice').length,3);
});
test('Practice cannot silently execute direct geometry commands and exposes no scene objects',async t=>{
 let sent;const h=harness(t,async(c,k,e)=>{sent=e;return reply({tool:'offlinecad_preview',arguments:{revision,commands:[{op:'create',type:'box',size:[1,2,3]}]}});});await h.runner.start({...spec,workflow:'practice'});const r=h.runner.state().records[0];assert.equal(r.error.code,'PRACTICE_TOOL_FORBIDDEN');assert.equal(r.contextScope,'practice-selected-aliases');assert.equal(r.contextObjects,0);assert.match(sent.system,/VISIBLE USER INTERFACE/);assert.ok(!h.calls.some(c=>c.args?.method==='preview'));
});
test('Practice reference keeps modeling information inside the visible UI contract',async t=>{
 const h=harness(t,async()=>reply({toolReference:{section:'modeling'}}));await h.runner.start({...spec,workflow:'practice'});
 const r=h.runner.read(h.runner.state().records[0].id),result=r.events.find(e=>e.type==='tool-result').result;
 assert.equal(result.kind,'practice-ui-contract');assert.equal(result.contract.practicePolicy.directGeometry,false);assert.equal(r.status,'read-limit');
});
test('Full practice defaults to the isolated child replay without a desktop callback',async t=>{
 const h=harness(t,async()=>reply({revision,assistant:{kind:'practice',plan:{version:1,title:'View only',actions:[{kind:'ui',action:'click',target:'view:fit'}]}}}));
 await h.runner.start({...spec,stage:'full',workflow:'practice'});
 assert.ok(h.calls.some(c=>c.method==='practice'&&c.args.projectCopy.revision===revision));assert.equal(h.closed,1);
});
test('Full practice asks for bounded format corrections before any visible replay',async t=>{
 let n=0;const h=harness(t,async()=>reply(++n===1?{revision,assistant:{kind:'practice',plan:{version:1,title:'View',actions:[{kind:'ui',action:'click',target:'view:fit',unexpected:true}]}}}:{revision,assistant:{kind:'practice',plan:{version:1,title:'View',actions:[{kind:'ui',action:'click',target:'view:fit'}]}}}));
 await h.runner.start({...spec,stage:'full',workflow:'practice'});assert.equal(n,2);assert.equal(h.calls.filter(c=>c.method==='practice').length,1);assert.ok(h.runner.read(h.runner.state().records[0].id).events.some(e=>e.type==='format-feedback'));
 let invalid=0;const bad=harness(t,async()=>{invalid++;return {data:{model:'deepseek-flash'},text:'not JSON'};});await bad.runner.start({...spec,stage:'full',workflow:'practice'});assert.equal(invalid,3);assert.equal(bad.runner.state().records[0].status,'failed');assert.ok(!bad.calls.some(c=>c.method==='practice'));
});
test('Clear removes scoped images and cumulative reports and refreshes accounting state',async t=>{
 const events=[],h=harness(t,async()=>reply({status:'completed',message:'done'}),e=>events.push(e));await h.runner.start(spec);await h.runner.exportAll('md');await h.runner.exportAll('json');fs.writeFileSync(path.join(h.directory,'fixture-assembly-selection-image.json'),'{}');
 h.runner.clear();assert.equal(h.runner.state().records.length,0);assert.ok(!fs.readdirSync(h.directory).some(n=>/Gesamtbericht|fixture-/.test(n)));assert.equal(events.at(-1).state.records.length,0);
});

test('An empty sketch selection reaches the model without scoped-scene preparation failure',async t=>{let requested=0;const h=harness(t,async()=>{requested++;return reply({status:'completed',message:'ready'});});await h.runner.start({...spec,caseId:'sketch',sceneScope:'selection'});assert.equal(requested,1);assert.ok(!h.calls.some(c=>c.method==='providerScene'));assert.equal(h.calls.find(c=>c.method==='frame').args.scope,'full');});
test('A foreign preview ID produces feedback and a further model turn',async t=>{let requested=0;const h=harness(t,async()=>reply(++requested===1?{tool:'offlinecad_apply',arguments:{previewId:'foreign',revision}}:{status:'completed',message:'I need a new preview'}));await h.runner.start({...spec,stage:'full'});const r=h.runner.read(h.runner.state().records[0].id);assert.equal(requested,2);assert.ok(r.events.some(e=>e.type==='tool-result'&&e.result?.code==='PREVIEW_NOT_OWNED'));assert.ok(!h.calls.some(c=>c.method==='rpc'&&c.args.method==='apply'));});


test('Actual failed tool results reach the supervisor immediately and final check is separate',async t=>{
 const inputs=[];let modelTurns=0;const h=harness(t,async(c,k,e)=>{if(e.system.includes('independent Formnaro experiment supervisor')){const input=JSON.parse(e.user);inputs.push(input);return reply({verdict:'uncertain',reasonCode:'insufficient_evidence',confidence:.6,explanation:'Actual result is observed',evidence:'native check unavailable'});}return reply(++modelTurns===1?{tool:'offlinecad_apply',arguments:{previewId:'not-owned',revision}}:{status:'completed',message:'Unable to complete'});});
 const plan={...require('../backend/ai-test-lab-plan.cjs').preset(),caseIds:['drill'],variants:['A'],efforts:['low'],stage:'full'};await h.runner.start({mode:'lab',plan});
 assert.ok(inputs.some(i=>i.observation.kind==='tool-result'&&i.observation.result.code==='PREVIEW_NOT_OWNED'));
 const final=inputs.find(i=>i.observation.kind==='final-result');assert.ok(final);assert.equal(final.observation.result.cleanExit,true);assert.equal(final.observation.result.verification.passed,false);assert.equal(final.observation.result.verificationError,null);assert.equal(h.runner.state().records[0].finalReview.assessment,'native-failed');assert.equal(h.closed,1);
});
test('Malformed optional practice checks receive correction before the first actual playback',async t=>{let turns=0;const h=harness(t,async()=>reply({revision,assistant:{kind:'practice',plan:{version:1,title:'Check-format transport control',actions:[{kind:'model',commands:[{op:'create',type:'box',as:'body'}],...(++turns===1?{checks:['body remains unchanged']}:{})}]}}}));await h.runner.start({...spec,stage:'full',workflow:'practice'});assert.equal(turns,2);const calls=h.calls.filter(c=>c.method==='practice');assert.equal(calls.length,1);assert.equal(calls[0].args.plan.actions[0].checks,undefined);const r=h.runner.read(h.runner.state().records[0].id);assert.ok(r.events.some(e=>e.type==='format-feedback'&&/Prüf|checks/.test(e.error)));});
