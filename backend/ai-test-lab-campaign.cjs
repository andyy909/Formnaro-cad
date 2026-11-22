const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {preset}=require('./ai-test-lab-plan.cjs');
const {resolveEffectivePlan,findStartedSeries,matchSeriesRows}=require('./ai-test-lab-effective-plan.cjs');
const EFFORTS=['low','high','max'];



function decideDevelopment(development, effort) {
 const condition = (record) => JSON.stringify([
  record.spec.caseId, record.spec.dataset, record.spec.stage, record.spec.workflow,
  record.spec.sceneScope, record.spec.imageMode, record.spec.repeat,
 ]);
 const groups = ['C','D'].map(variant => {
  const planned = development.filter(record => record.spec.effort === effort && record.spec.variant === variant);
  const verified = planned.filter(record => record.status === 'completed' && record.cleanExit !== false &&
    record.modelIdentity?.exactMatch !== false && typeof record.verification?.passed === 'boolean' &&
    !record.usageEvents?.some(event => (event.role ?? 'modeler') === 'modeler' &&
      event.returnedModel && record.requestedModel && event.returnedModel !== record.requestedModel));
  return {
   conditions: new Set(verified.map(condition)),
   evidence: {
    variant, planned: planned.length, total: verified.length,
    passed: verified.filter(record => record.verification.passed).length,
    ms: verified.length && verified.every(record => Number.isFinite(record.elapsedMs) && record.elapsedMs > 0)
      ? verified.reduce((sum, record) => sum + record.elapsedMs, 0) : null,
   },
  };
 });
 const [a,b] = groups.map(group => group.evidence);
 const open = reason => ({effort, selected:null, confirmation:'open', reason, evidence:[a,b]});
 if (!a.total || !b.total) return open('Mindestens eine Variante hat keine fachlich auswertbaren Ergebnisse.');
 if (a.total !== a.planned || b.total !== b.planned || groups[0].conditions.size !== groups[1].conditions.size ||
     [...groups[0].conditions].some(key => !groups[1].conditions.has(key)))
  return open('Die Varianten decken die geplanten Vergleichsbedingungen nicht vollständig ab.');
 if (!a.passed && !b.passed) return open('Keine Variante hat eine native Prüfung bestanden.');
 if (a.passed !== b.passed) {
  return {effort, selected:a.passed > b.passed ? a.variant : b.variant, reason:'Mehr native Erfolge.', evidence:[a,b]};
 }
 if (a.ms !== null && b.ms !== null && a.ms !== b.ms) {
  return {effort, selected:a.ms < b.ms ? a.variant : b.variant, reason:'Kürzere Gesamtdauer bei gleicher Zahl nativer Erfolge.', evidence:[a,b]};
 }
 return open('Gleich viele native Erfolge und kein belegter Zeitvorteil.');
}

async function runCampaign({directory,start,state,preflight,report,signal,onProgress}){
 const id=crypto.randomUUID(),file=path.join(directory,'Kampagne-'+id+'.json');
 const campaign={format:'FormnaroLabCampaign',version:1,id,status:'running',startedAt:new Date().toISOString(),phases:[],decisions:[],series:[]};
 const publish=()=>{fs.writeFileSync(file,JSON.stringify(campaign,null,2));onProgress(structuredClone(campaign));};
 const full=(name)=>({...preset('screen'),name,variants:['C','D'],stage:'full',monitor:{...preset().monitor,cadence:'each-proposal',maxChecks:12},limits:{...preset().limits,seconds:360,formatRepairs:2}});
 let frozenRoles=null,supported=null;
 const phaseRoles=plan=>({...frozenRoles,modeler:{...frozenRoles.modeler,effort:'series'},supervisor:{...frozenRoles.supervisor,model:frozenRoles.supervisor.model||plan.monitor.model}});
 async function phase(name,plan){
  signal.throwIfAborted();
  // The diagnostic starter persists a server-generated series ID; a phase name
  // unique to this campaign binds that receipt without guessing from new rows.
  const seriesName=name.slice(0,80)+' · '+id;
  const existing=new Set(fs.readdirSync(directory));
  const before=new Set(state().records.map(r=>r.id));
  const item={name,status:'running',plannedAt:new Date().toISOString()};
  campaign.phase=name;campaign.phases.push(item);
  let effective;
  function prepare(){
   effective=resolveEffectivePlan({...plan,name:seriesName},{roles:phaseRoles(plan),campaign:true,supported});
   Object.assign(item,{plannedTrials:effective.trials,efforts:effective.efforts,droppedEfforts:effective.droppedEfforts});
   publish();
  }
  const evidence=()=>{
   const series=findStartedSeries(directory,existing,seriesName);
   return matchSeriesRows(effective,state().records,series,before);
  };
  try{
   prepare();
   try{signal.throwIfAborted();await start(effective.plan);}
   catch(error){
    // Role resolution rejects unsupported modeler efforts before recording any
    // series or sending any modeler request. All other failures end the phase.
    if(error.code!=='LAB_MODELER_EFFORT_UNSUPPORTED'||supported!==null||!Array.isArray(error.supportedEfforts)||!error.supportedEfforts.length)throw error;
    supported=EFFORTS.filter(e=>error.supportedEfforts.includes(e));
    prepare();
    signal.throwIfAborted();
    await start(effective.plan);
   }
   signal.throwIfAborted();
   const m=evidence(),rows=m.rows;
   Object.assign(item,{seriesId:m.seriesId,trials:rows.length,nativePassed:rows.filter(r=>r.verification?.passed).length,integrity:m.integrity});
   if(m.seriesId)campaign.series.push(m.seriesId);
   if(!m.ok||rows.some(r=>['cancelled','interrupted','running'].includes(r.status)))throw Object.assign(Error('Nicht alle geplanten Prüfungen beendet; Abschlussauswertung wartet.'),{code:'LAB_PHASE_INCOMPLETE'});
   if(rows.some(r=>r.error?.code==='AI_PROVIDER_QUOTA'))throw Error('Anbieterkontingent erschöpft; Kampagne gespeichert.');
   item.status='completed';item.endedAt=new Date().toISOString();publish();await report();
   return rows;
  }catch(error){
   if(effective&&!item.integrity){
    const m=evidence();
    Object.assign(item,{seriesId:m.seriesId,trials:m.rows.length,integrity:m.integrity});
    if(m.seriesId)campaign.series.push(m.seriesId);
   }
   Object.assign(item,{status:signal.aborted?'cancelled':error.code==='LAB_PHASE_INCOMPLETE'?'incomplete':'blocked',endedAt:new Date().toISOString(),error:String(error.message)});
   publish();throw error;
  }
 }
 try{
  campaign.phase='Lokale Vorprüfung';publish();const native=await preflight();if(!native.passed)throw Error('Lokale Vorprüfung nicht bestanden. Bezahlte Tests werden nicht gestartet.');
  frozenRoles=require('./ai-lab-roles.cjs').validateRoles(state().lab?.roles?.selections);
  const p=preset();await phase('Pilot · A/C/D auf allen Denkstufen',{...p,caseIds:['assembly'],variants:['A','C','D'],monitor:{...p.monitor,cadence:'each-proposal'}});
  const campaignEfforts=supported??EFFORTS;campaign.efforts=campaignEfforts;
  const development=await phase('Entwicklung · vollständige Modelle C/D',full('Entwicklung'));
  const decisions=campaignEfforts.map(effort=>decideDevelopment(development,effort));
  campaign.decisions.push(...decisions);publish();
  for(const {effort,selected} of decisions){
   if(!selected)continue;
   const confirmation=preset('confirm',selected);
   await phase('Bestätigung · neue Aufgaben · '+effort,{...confirmation,efforts:[effort],monitor:{...confirmation.monitor,cadence:'each-proposal'}});
  }
  await phase('Bildvergleich · vollständige Modelle',{...preset('images'),stage:'full',monitor:{...p.monitor,cadence:'each-proposal'},limits:{...p.limits,seconds:360,formatRepairs:2}});
  await phase('Auswahl gegen volle Szene',{...preset('selection'),workflow:'agent',stage:'full',monitor:{...p.monitor,cadence:'each-proposal'},limits:{...p.limits,seconds:360,formatRepairs:2}});
  await phase('Sichtbare Übung · Bilder und alle Denkstufen',{...preset('images'),caseIds:['assembly'],workflow:'practice',stage:'full',monitor:{...p.monitor,cadence:'each-proposal'},limits:{...p.limits,seconds:360,formatRepairs:2}});
  const checked=development.filter(r=>r.verification&&r.monitor),falseStops=checked.filter(r=>r.verification.passed&&(r.monitor.judgments??[r.monitor]).some(j=>j.verdict==='stop'));
  if(checked.filter(r=>r.verification.passed).length>=6&&checked.filter(r=>!r.verification.passed).length>=3&&checked.some(r=>!r.verification.passed&&(r.monitor.judgments??[r.monitor]).some(j=>j.verdict==='stop'))&&!falseStops.length){await phase('Aktiver Überwacher · gesonderte Entwicklung',{...p,caseIds:['assembly'],variants:['A','C','D'],stage:'full',monitor:{...p.monitor,mode:'active',cadence:'each-proposal'},limits:{...p.limits,seconds:360,formatRepairs:2}});}else{campaign.decisions.push({activeSupervisor:'not auto-enabled',calibratedTrials:checked.length,falseStops:falseStops.length,reason:'Insufficient calibration or false stop recommendations; manual experimental mode remains available.'});}
  campaign.status='completed';campaign.phase='Abgeschlossen';
 }catch(error){campaign.status=signal.aborted?'cancelled':'blocked';campaign.error=String(error.message);}
 finally{campaign.endedAt=new Date().toISOString();publish();try{await report();}catch(error){campaign.reportError=String(error.message);publish();}}
 return campaign;
}
module.exports={runCampaign};
