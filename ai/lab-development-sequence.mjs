import {developmentCaseIds,quickPlan} from './lab-quick-plans.mjs';

export function developmentOutcome(record){
 if(!record)return {status:'open',reason:'not-started'};
 if(['running','interrupted','cancelled'].includes(record.status)||!record.events?.some(event=>event.type==='finished')){
  return {status:'blocked',reason:'interrupted'};
 }
 if(record.verificationFailure==='checker-error'||record.verification?.checks?.some(check=>check.name==='Native Gegenprüfung ausführbar'&&!check.passed)){
  return {status:'blocked',reason:'checker-error'};
 }
 if(record.cleanExit!==true||record.close?.forced||record.failureClass==='infrastructure'){
  return {status:'blocked',reason:record.error?.code??'infrastructure'};
 }
 if(record.modelIdentity?.exactMatch!==true||record.events.some(event=>event.type==='usage'&&(event.role??'modeler')==='modeler'&&event.returnedModel!==record.modelIdentity.requested))return {status:'blocked',reason:'model-identity'};
 if(record.status==='needs-input')return {status:'blocked',reason:'needs-input'};
 if(record.status!=='completed'||record.error||typeof record.verification?.passed!=='boolean'){
  return {status:'blocked',reason:record.error?.code??record.verificationSkipped??record.status??'unverified'};
 }
 return {status:record.verification.passed?'passed':'failed'};
}

export function escalationCases(caseIds,records){
 const byCase=new Map(records.map(record=>[record.spec.caseId,record]));
 return caseIds.filter(caseId=>developmentOutcome(byCase.get(caseId)).status==='failed');
}

export function previewDevelopment(modeler,supported,withMax){
 if(!modeler.model||!['low','high'].every(effort=>supported.includes(effort))){
  throw new Error('Für den Entwicklungscheck muss das Modell Low und High anbieten.');
 }
 if(withMax&&!supported.includes('max'))throw new Error('Dieses Modell bietet Max nicht an.');
 return {modeler:{...modeler},levels:withMax?['low','high','max']:['low','high'],initial:developmentCaseIds.length,maximum:developmentCaseIds.length*(withMax?3:2)};
}

export async function runDevelopment({setup,id,startStage,signal,onPhase=()=>{}}){
 let caseIds=[...developmentCaseIds];
 const phases=[];
 const report={id,model:setup.modeler.model,phases,status:'running'};
 let remaining=setup.maximum*20;
 for(const effort of setup.levels){
  if(!caseIds.length||signal.aborted||remaining<1)break;
  const plan=quickPlan('development',setup.modeler,effort);
  plan.name='Entwicklungscheck · '+id+' · '+effort;
  plan.caseIds=caseIds;
  plan.limits.requestBudget=remaining;
  // The existing dispatcher resolves a reviewer connection whenever that preference
  // is enabled. Reuse the selected model connection and defer reviewer execution.
  plan.roles.reviewer={...plan.roles.modeler,effort:'high'};
  const phase={effort,caseIds,outcomes:[]};
  phases.push(phase);
  await onPhase(report);
  const {records,error}=await startStage(plan);
  const byCase=new Map(records.map(record=>[record.spec.caseId,record]));
  phase.outcomes=caseIds.map(caseId=>({caseId,runId:byCase.get(caseId)?.id,...developmentOutcome(byCase.get(caseId))}));
  remaining-=records.reduce((count,record)=>count+(record.events??[]).filter(event=>event.type==='request').length,0);
  if(error)report.error=error;
  if(error||signal.aborted||records.length!==caseIds.length||phase.outcomes.some(o=>o.reason==='interrupted'))break;
  caseIds=escalationCases(caseIds,records);
 }
 const finished=phases.length>0&&phases.every(phase=>phase.outcomes.length===phase.caseIds.length&&!phase.outcomes.some(o=>o.status==='open'||o.reason==='interrupted'));
 const last=phases.at(-1);
 const more=last&&last.effort!==setup.levels.at(-1)&&last.outcomes.some(o=>o.status==='failed');
 report.status=signal.aborted?'interrupted':report.error||!finished||more?'incomplete':'completed';
 await onPhase(report);
 return report;
}
