const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {preset}=require('./ai-test-lab-plan.cjs');
async function runCampaign({directory,start,state,preflight,report,signal,onProgress}){
 const id=crypto.randomUUID(),file=path.join(directory,'Kampagne-'+id+'.json');
 const campaign={format:'FormnaroLabCampaign',version:1,id,status:'running',startedAt:new Date().toISOString(),phases:[],decisions:[],series:[]};
 const publish=()=>{fs.writeFileSync(file,JSON.stringify(campaign,null,2));onProgress(structuredClone(campaign));};
 const full=(name)=>({...preset('screen'),name,variants:['C','D'],stage:'full',monitor:{...preset().monitor,cadence:'each-proposal',maxChecks:12},limits:{...preset().limits,seconds:360,formatRepairs:2}});
 async function phase(name,plan){
  signal.throwIfAborted();const before=new Set(state().records.map(r=>r.id));campaign.phase=name;campaign.phases.push({name,status:'running',plannedTrials:require('./ai-test-lab-plan.cjs').expandPlan(plan).trials,plannedAt:new Date().toISOString()});publish();await start({...plan,name});signal.throwIfAborted();
  const rows=state().records.filter(r=>!before.has(r.id));campaign.series.push(...new Set(rows.map(r=>r.spec.seriesId)));const item=campaign.phases.at(-1);Object.assign(item,{status:'completed',trials:rows.length,nativePassed:rows.filter(r=>r.verification?.passed).length,endedAt:new Date().toISOString()});publish();await report();
  if(rows.some(r=>r.error?.code==='AI_PROVIDER_QUOTA'))throw Error('Anbieterkontingent erschöpft; Kampagne gespeichert.');
  if(rows.length!==item.plannedTrials||rows.some(r=>['cancelled','interrupted','running'].includes(r.status))){item.status='incomplete';publish();throw Error('Nicht alle geplanten Prüfungen beendet; Abschlussauswertung wartet.');}
  return rows;
 }
 try{
  campaign.phase='Lokale Vorprüfung';publish();const native=await preflight();if(!native.passed)throw Error('Lokale Vorprüfung nicht bestanden. Bezahlte Tests werden nicht gestartet.');
  const p=preset();await phase('Pilot · A/C/D auf allen Denkstufen',{...p,caseIds:['assembly'],variants:['A','C','D'],monitor:{...p.monitor,cadence:'each-proposal'}});
  const development=await phase('Entwicklung · vollständige Modelle C/D',full('Entwicklung'));
  const winners={};for(const effort of ['low','high','max']){
   const scores=['C','D'].map(variant=>{const r=development.filter(r=>r.spec.effort===effort&&r.spec.variant===variant);return {variant,passed:r.filter(r=>r.verification?.passed).length,total:r.length,ms:r.reduce((n,r)=>n+(r.elapsedMs??0),0)};}).sort((a,b)=>b.passed-a.passed||a.ms-b.ms);winners[effort]=scores[0].variant;campaign.decisions.push({effort,selected:scores[0].variant,evidence:scores,note:'Provisional choice within six known task families; not a universal winner.'});
  }publish();
  for(const effort of ['low','high','max']){const p=preset('confirm',winners[effort]);await phase('Bestätigung · neue Aufgaben · '+effort,{...p,efforts:[effort],monitor:{...p.monitor,cadence:'each-proposal'}});}
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
