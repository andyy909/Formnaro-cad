const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const plans=require('./ai-test-lab-plan.cjs'),{taskInstance}=require('./ai-test-lab-cases.cjs'),{complete}=require('./ai-lab-review-data.cjs');
const suite=require('../ai/benchmark-core-v1.json'),advanced=require('../ai/benchmark-advanced-v2.json');
const getSuite=id=>{if(!id||id==='core'||id===suite.id)return suite;if(id==='advanced'||id===advanced.id)return advanced;throw Error('Unbekannte Benchmark-Suite.');};
const hash=v=>crypto.createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v)).digest('hex');
const uuid=/^[a-f0-9-]{36}$/;
function verifySuite(root=path.resolve(__dirname,'..'),suiteId='core'){
 const suite=getSuite(suiteId);
 for(const c of suite.cases)if(hash(taskInstance(c.caseId))!==c.taskHash)throw Error('Benchmarkaufgabe verändert: '+c.caseId+'. Neue Suite-Version erforderlich.');
 for(const f of suite.dependencies)if(hash(fs.readFileSync(path.join(root,f.path)))!==f.sha256)throw Error('Benchmark-Prüfer oder Werkzeugauskunft verändert: '+f.path+'. Suite erneut kalibrieren.');
 return {label:suite.label??'Grundbenchmark',available:suite.id!==advanced.id||suite.calibration?.status==='passed',suiteId:suite.id,suiteVersion:suite.version,suiteHash:hash(suite),cases:suite.cases.map(({taskHash,...c})=>c),limits:{...suite.limits},planned:16,challenge:{available:false,reason:'Halter-Grenztest: Aufgaben und native Prüfer noch nicht kalibriert.'}};
}
function benchmarkPlan({effort='high',monitor='off',roles,suiteId='core'}={}){
 const suite=getSuite(suiteId),checked=verifySuite(undefined,suiteId);if(!checked.available)throw Error('Aufbau-Benchmark benötigt zuerst die native Prüferkalibrierung.');if(!require('./ai-lab-roles.cjs').EFFORTS.includes(effort)||!['off','shadow'].includes(monitor))throw Error('Ungültige Benchmark-Denkstufe oder Überwachung.');
 const selected=require('./ai-lab-roles.cjs').validateRoles(roles??{});selected.modeler.effort=effort;
 return plans.validatePlan({name:(suite.label??'KI-Grundbenchmark')+' · '+suite.version,preset:'practice-functions',caseIds:suite.cases.map(c=>c.caseId),variants:['C'],efforts:[effort],repeats:2,stage:'full',dataset:'development',workflow:'practice',scopes:['selection'],images:['none'],monitor:{mode:monitor},roles:selected,limits:suite.limits});
}
const condition=(caseId,repeat,suiteId='core')=>{const c=getSuite(suiteId).cases.find(c=>c.caseId===caseId);if(!c)throw Error('Aufgabe gehört nicht zur Benchmark-Suite.');return c.id+'-r'+(repeat+1);};
const median=v=>{const a=v.filter(Number.isFinite).sort((a,b)=>a-b);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2:null;};
function summarizeBenchmark(manifest,records){
 const raw=records.filter(r=>r.spec?.seriesId===manifest.id&&r.spec?.benchmark?.suiteHash===manifest.suite.suiteHash);
 const last=new Map();for(const r of raw)if(complete(r))last.set(r.spec.benchmark.conditionId,r);
 const pending=manifest.rows.filter(s=>!last.has(s.benchmark.conditionId));
 const classify=r=>{
  if(!r)return 'pending';
  const noPracticeResult=r.verificationSkipped==='no-practice-result'||r.verificationError==='Kein abgeschlossenes Übungsmodell verfügbar; Ausgangsmodell ist kein Endergebnis.';
  if(require('./ai-lab-storage.cjs').failureClass(r)==='infrastructure'||r.failurePhase==='preparation'||r.error?.code==='AI_PROVIDER_QUOTA'||r.close?.forced||r.verificationFailure==='checker-error'||r.verificationError&&!noPracticeResult)return 'infrastructure';
  const usage=(r.events??[]).filter(e=>e.type==='usage'&&e.role!=='supervisor');
  if(!usage.length||usage.some(e=>!e.returnedModel||e.returnedModel!==r.requestedModel)||r.modelIdentity?.exactMatch!==true)return 'model-unverified';
  if(r.verification?.passed===false)return 'failed';
  if(r.verification?.passed!==true||r.cleanExit!==true)return r.error||r.status==='timeout'?'failed':'unverified';
  if(r.error||r.status!=='completed')return 'failed';
  return 'passed';
 };
 const outcomes=manifest.rows.map(s=>{const r=last.get(s.benchmark.conditionId);return {conditionId:s.benchmark.conditionId,caseId:s.caseId,repeat:s.repeat,runId:r?.id,outcome:classify(r),elapsedMs:r?.elapsedMs,corrections:(r?.formatCorrections??0)+(r?.events??[]).filter(e=>e.type==='tool-result'&&e.result?.isError).length,toolReferences:(r?.events??[]).filter(e=>e.type==='tool-call'&&/_(tool_info|command_info)$/.test(e.tool)).length};});
 const passed=outcomes.filter(r=>r.outcome==='passed');
 const usage={};for(const role of ['modeler','supervisor']){const requests=raw.flatMap(r=>(r.events??[]).filter(e=>(e.role??'modeler')===role&&e.type==='request')),events=raw.flatMap(r=>(r.events??[]).filter(e=>(e.role??'modeler')===role&&e.type==='usage'));usage[role]={requests:requests.length,reported:events.length,missing:Math.max(0,requests.length-events.length)};}
 return {id:manifest.id,name:manifest.plan.name,suite:manifest.suite,createdAt:manifest.createdAt,status:pending.length?'incomplete':'completed',reviewStatus:manifest.reviewStatus??'waiting',error:manifest.error??null,planned:manifest.rows.length,finished:manifest.rows.length-pending.length,pending:pending.length,rawAttempts:raw.length,passed:passed.length,withoutCorrections:passed.filter(r=>!r.corrections).length,afterCorrections:passed.filter(r=>r.corrections).length,byOutcome:Object.fromEntries(['pending','passed','failed','unverified','infrastructure','model-unverified'].map(k=>[k,outcomes.filter(r=>r.outcome===k).length])),medianSuccessfulMs:median(passed.map(r=>r.elapsedMs)),successfulSample:passed.length,usage,cases:manifest.suite.cases.map(c=>({...c,passed:outcomes.filter(r=>r.caseId===c.caseId&&r.outcome==='passed').length,finished:outcomes.filter(r=>r.caseId===c.caseId&&r.outcome!=='pending').length,planned:2})),outcomes,plan:manifest.plan,source:manifest.source,limitations:'Bekannte Entwicklungsaufgaben; zwei Wiederholungen sind keine allgemeine Zuverlässigkeitsquote. Modellabweichungen/ungeprüfte Ergebnisse sind keine bestätigten Modellerfolge. Alle 16 geplanten Bedingungen bleiben im Nenner.'};
}
function createBenchmarks({directory,getRecords,getRoles,getSource,runSeries,review,reviewEnabled,getReviews=()=>[],redact=v=>v,onChange=()=>{},isBusy=()=>false}){
 let running=false;
 const read=id=>{if(!uuid.test(id))throw Error('Ungültige Benchmarkkennung.');return JSON.parse(fs.readFileSync(path.join(directory,'Benchmark-'+id+'.json'),'utf8'));};
 const save=m=>{const file=path.join(directory,'Benchmark-'+m.id+'.json');fs.writeFileSync(file+'.tmp',JSON.stringify(m,null,2));fs.renameSync(file+'.tmp',file);};
 const state=()=>({busy:running,suite:verifySuite(),suites:[verifySuite(undefined,'advanced'),verifySuite()],runs:fs.readdirSync(directory).filter(n=>/^Benchmark-[a-f0-9-]{36}\.json$/.test(n)).map(n=>{const m=read(n.slice(10,-5));return summarizeBenchmark(m,getRecords());}).sort((a,b)=>a.createdAt.localeCompare(b.createdAt))});
 function preview(args={}){const plan=benchmarkPlan({...args,roles:getRoles()});return {...verifySuite(undefined,args.suiteId),plan,trials:plans.expandPlan(plan).trials,limits:plan.limits};}
 async function start(args={}){
  if(running||isBusy())throw Error('Zuerst die laufende Prüfung beenden.');let m;
  if(args.id){m=read(args.id);const frozenFile=path.join(directory,'Serie-'+m.id+'.json');if(fs.existsSync(frozenFile))m.plan=JSON.parse(fs.readFileSync(frozenFile,'utf8')).plan;verifySuite(undefined,m.suite.suiteId);const currentSource=getSource();if(m.suite.suiteHash!==verifySuite(undefined,m.suite.suiteId).suiteHash||['hash','asarSHA256','executableSHA256'].some(k=>m.source[k]!==currentSource[k]))throw Error('Fortsetzen benötigt denselben eingefrorenen Programm- und Aufgabenstand.');if(!summarizeBenchmark(m,getRecords()).pending)throw Error('Benchmark bereits vollständig; fertige Bedingungen werden nicht wiederholt.');}
  else{const p=preview(args),id=crypto.randomUUID();m={format:'FormnaroBenchmark',version:1,id,createdAt:new Date().toISOString(),suite:verifySuite(undefined,args.suiteId),source:getSource(),plan:p.plan,rows:plans.expandPlan(p.plan).rows.map(s=>({...s,seriesId:id,benchmark:{suiteHash:p.suiteHash,suiteVersion:p.suiteVersion,conditionId:condition(s.caseId,s.repeat,p.suiteId)}})),reviewStatus:'waiting'};save(m);}
  running=true;m.status='running';m.error=null;save(m);onChange();
  try{
   const summary=summarizeBenchmark(m,getRecords()),pending=summary.outcomes.filter(x=>x.outcome==='pending').map(x=>x.conditionId);
   await runSeries(m.plan,{id:m.id,suite:m.suite,pending,source:m.source});
   // The series resolves its profile aliases before the first model request. Preserve that exact selection for resume.
   const file=path.join(directory,'Serie-'+m.id+'.json');if(fs.existsSync(file))m.plan=JSON.parse(fs.readFileSync(file,'utf8')).plan;
   const result=summarizeBenchmark(m,getRecords());m.status=result.status;save(m);
   if(!result.pending&&reviewEnabled()){
    m.reviewStatus='running';save(m);onChange();
    const rows=getRecords().filter(r=>r.spec.seriesId===m.id),closed=rows.filter(complete);
    // Interrupted attempts remain in the export; the analyst receives their saved evidence as well.
    const analysis=await review(rows,{ids:closed.map(r=>r.id),completion:{planned:closed.length,status:'completed',benchmarkConditions:{planned:16,finished:16},interruptedAttempts:rows.filter(r=>!complete(r)).map(r=>({id:r.id,conditionId:r.spec.benchmark.conditionId,status:r.status,error:r.error,verification:r.verification??null,cleanExit:r.cleanExit??null,elapsedMs:r.elapsedMs,formatCorrections:r.formatCorrections??0,events:(r.events??[]).filter(e=>['error','verification','tool-result','practice-activity'].includes(e.type)).slice(-12)}))},automatic:true,selection:m.plan.roles.reviewer});
    m.reviewStatus=analysis.status;m.reviewId=analysis.id;
   }else if(!result.pending)m.reviewStatus='disabled';
  }catch(e){m.error=redact(String(e.message));m.status=summarizeBenchmark(m,getRecords()).status;if(m.reviewStatus==='running')m.reviewStatus='failed';throw e;}
  finally{running=false;save(m);onChange();}
  return summarizeBenchmark(m,getRecords());
 }
 function scope(id){const m=read(id),rows=getRecords().filter(r=>r.spec.seriesId===id);if(!rows.length)throw Error('Noch keine Benchmarkprotokolle vorhanden.');return require('./ai-lab-review-data.cjs').selectScope(directory,rows,{seriesId:id,completion:{planned:Math.max(16,rows.length),status:summarizeBenchmark(m,getRecords()).status,benchmark:summarizeBenchmark(m,getRecords())}});}
 async function report({id,format='json'}){if(!['json','md'].includes(format))throw Error('Ungültiges Berichtformat.');const m=read(id),summary=summarizeBenchmark(m,getRecords()),rows=getRecords().filter(r=>r.spec.seriesId===id);const {usagePrice,usageTotals}=await import('../ai/diagnostic-costs.mjs');const events=rows.flatMap(r=>(r.events??[]).filter(e=>e.type==='usage').map(e=>({...e,at:new Date(Date.parse(r.startedAt)+e.ms).toISOString()})));const relevantReviews=getReviews().filter(r=>r.seriesIds?.includes(id));for(const r of relevantReviews)for(const e of r.usageEvents??[])events.push({...e,role:'reviewer'});const costs=Object.fromEntries(['modeler','supervisor','reviewer'].map(role=>[role,usageTotals(events.filter(e=>(e.role??'modeler')===role).map(e=>usagePrice(e.usage,e.rates,e.at,e.billing)))]));const data={format:'FormnaroBenchmarkReport',version:1,summary,costs,reviews:relevantReviews,manifest:m,rawRunIds:rows.map(r=>r.id),reviewId:m.reviewId??null};const text=format==='json'?JSON.stringify(data,null,2):'# Formnaro KI-Benchmark '+m.suite.suiteVersion+'\n\n'+summary.passed+'/16 vollständig bestätigt; '+summary.finished+'/16 beendet.\n\n'+summary.cases.map(c=>'- '+c.id+' '+c.label+': '+c.passed+'/2 richtig ('+c.finished+'/2 beendet)').join('\n')+'\n\nOhne Korrektur: '+summary.withoutCorrections+'; nach Korrektur: '+summary.afterCorrections+'.\n\n'+summary.limitations+'\n\nAbschlussauswertung: '+summary.reviewStatus+'\n';const file=path.join(directory,'Benchmarkbericht-'+id+'.'+format);fs.writeFileSync(file,text);return {path:file,summary};}
 return {state,preview,start,scope,report,get busy(){return running;}};
}
module.exports={verifySuite,benchmarkPlan,condition,summarizeBenchmark,createBenchmarks};
