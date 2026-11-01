import {AGENT_UI_CONTRACT,AGENT_UI_TARGETS,validateAgentUIRequest} from './cad-agent-ui-policy.js';

export function createAgentUIAccess({assistant,getRevision,isBusy=()=>false,beforeGuide=()=>()=>{}}){
 let active=null,sequence=0,disposed=false;const jobs=new Map(),allowed=new Set(AGENT_UI_TARGETS.map(t=>t.id));
 function report(job){return {jobId:job.id,action:job.action,state:job.state,modelChanged:getRevision()!==job.revision,...(job.result?{result:structuredClone(job.result)}:{}),...(job.error?{error:job.error}:{})};}
 function cancel(jobId){const job=jobId?jobs.get(jobId):active;if(!job)return {cancelled:false};if(job===active&&job.state==='running'){job.cancelled=true;assistant.cancel();job.state='cancelled';return {...report(job),cancelled:true};}return {...report(job),cancelled:false};}
 async function request(input){
  const value=validateAgentUIRequest(input);if(disposed)throw Error('UI-Anbindung wurde geschlossen.');
  if(value.action==='state'){const state=assistant.state();return {contract:AGENT_UI_CONTRACT,state:{...state,targets:state.targets.filter(t=>allowed.has(t.id))},activeJob:active?report(active):null};}
  if(value.action==='help')return assistant.execute({kind:'help',query:value.query});
  if(value.action==='status'){const job=jobs.get(value.jobId);if(!job)throw Error('Unbekannter UI-Auftrag.');return report(job);}
  if(value.action==='cancel')return cancel(value.jobId);
  if(active)throw Error('Eine UI-Führung oder Übung läuft bereits.');if(isBusy())throw Error('Die vorhandene Bearbeitung oder Vorschau zuerst abschließen.');
  if(value.revision!==getRevision())throw Object.assign(Error('Modell geändert. Aktuelle Szene vor der UI-Führung lesen.'),{code:'STALE_REVISION'});
  const job={id:'ui-'+(++sequence),revision:value.revision,action:value.action,state:'running',cancelled:false};active=job;jobs.set(job.id,job);while(jobs.size>10)jobs.delete(jobs.keys().next().value);
  const timer=setTimeout(()=>{job.error='Die UI-Führung hat ihr Zeitlimit erreicht.';cancel(job.id);},600000);
  const restore=value.action==='guide'?beforeGuide():()=>{};
  void Promise.resolve().then(()=>{if(job.cancelled)throw Error('UI-Auftrag abgebrochen.');return assistant.execute(value.action==='guide'?{kind:'guide',steps:value.steps}:{kind:'practice',plan:value.plan},{isCurrent:()=>!disposed&&!job.cancelled&&getRevision()===job.revision});}).then(result=>{
   if(job.cancelled)return;if(getRevision()!==job.revision)throw Error('Modell während der UI-Führung geändert.');if(result?.completed!==true&&result?.ok!==true)throw Error('UI-Führung oder Übung wurde nicht vollständig abgeschlossen.');job.result=result;job.state='completed';
  }).catch(error=>{job.error=String(error.message).slice(0,1500);job.state=job.cancelled?'cancelled':'failed';}).finally(()=>{clearTimeout(timer);if(active===job)active=null;restore();});
  return {...report(job),accepted:true};
 }
 return {request,cancel,isActive:()=>!!active,dispose(){disposed=true;cancel();}};
}
