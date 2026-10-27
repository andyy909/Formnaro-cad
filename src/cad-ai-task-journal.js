import {captureAIRequestBinding,aiTaskDataDigest,validateAIRequestResume} from './cad-ai-task-resume.js';
import {validateAITaskRequirements} from './cad-ai-task-requirements.js';
import {validateAITaskBasis} from './cad-ai-task-basis.js';
const failed=(message,code='AI_TASK_JOURNAL_INVALID')=>Object.assign(Error(message),{code,feedback:{retryable:false}});
export const storedTaskBinding=b=>Object.fromEntries(['revision','projectDigest','referenceDigest','selectionDigest'].map(k=>[k,b[k]]));
export const taskProviderInput=input=>Object.fromEntries(Object.entries(input).filter(([key])=>key!=='featureReferences'&&key!=='requestConfig'));
export function createAITaskJournal({request,access,isCurrent=()=>true}={}){
 let record=null,lease=null,lastCheckpoint=null;
 const current=()=>{if(!isCurrent())throw Object.assign(Error('KI-Auftrag abgebrochen.'),{name:'AbortError'});};
 const args=()=>({id:record.id,generation:record.generation,binding:record.binding,...(lease?{lease}:{})});
 function binding(input,requirements,featureScope){return captureAIRequestBinding({scene:access.scene(),project:access.project(),input:taskProviderInput(input),requirements,featureScope});}
 return {
  record:()=>record&&structuredClone(record),
  async begin({input,requirements,maxSteps,featureScope,saved,restoreOnly=false}){
   if(record)throw failed('Auftrag wurde bereits geöffnet.');current();requirements=validateAITaskRequirements(requirements);const bound=binding(input,requirements,featureScope),stored=storedTaskBinding(bound);
   if(saved){
    if(maxSteps!==saved.maxSteps||aiTaskDataDigest(requirements)!==aiTaskDataDigest(saved.requirements)||aiTaskDataDigest(Object.fromEntries(Object.entries(input).filter(([k])=>k!=='requestConfig')))!==aiTaskDataDigest(saved.input))throw failed('Gespeicherte Vorgaben, Auftrag oder Budget dürfen beim Fortsetzen nicht geändert werden.');
    if(aiTaskDataDigest(stored)!==aiTaskDataDigest(saved.binding))throw failed('Modell, Auswahl oder Bezüge passen nicht mehr. Zuerst die gespeicherte Auftragsbasis öffnen.','STALE_REVISION');
    if(saved.checkpoint)validateAIRequestResume(saved.checkpoint,{binding:bound,maxSteps,purpose:requirements.purpose,requiredChecks:requirements.checks,mode:restoreOnly?'restore':'continue'});
    if(restoreOnly&&!saved.checkpoint?.candidate)throw failed('Gespeicherter Entwurf fehlt.');
    record=structuredClone(saved);lastCheckpoint=record.checkpoint;
   }else{
    const basis=await access.captureTaskBasis();current();await validateAITaskBasis(basis,stored);if(aiTaskDataDigest(binding(input,requirements,featureScope))!==aiTaskDataDigest(bound))throw failed('Modell während der Sicherung geändert.','STALE_REVISION');
    record=await request({action:'start',binding:stored,requirements,input:structuredClone(Object.fromEntries(Object.entries(input).filter(([k])=>k!=='requestConfig'))),maxSteps,basis});current();
   }
   const claimed=await request({action:restoreOnly?'inspect':'claim',...args()});lease=claimed.lease;delete claimed.lease;record=claimed;current();return record;
  },
  async checkpoint(value){
   current();if(!lease)throw failed('Auftrag wurde nicht zur Bearbeitung geöffnet.');const checkpoint=structuredClone(value);
   if(checkpoint.candidate){checkpoint.candidate.project=await access.archiveTaskCandidate(checkpoint.candidate.proposal.previewId);current();}
   if(aiTaskDataDigest(storedTaskBinding(checkpoint.binding))!==aiTaskDataDigest(record.binding))throw failed('Zwischenstand gehört nicht zum geöffneten Auftrag.','STALE_REVISION');
   record=await request({action:'checkpoint',...args(),value:checkpoint});lastCheckpoint=checkpoint;current();
  },
  async close(status){
   if(!lease)return record;
   // Re-read after uncertain transport outcomes before finishing the owned
   // lease. A failed write must never invite another modelling attempt.
   try{record=await request({action:'read',id:record.id});record=await request({action:'finish',...args(),status});lease=null;return record;}
   catch(error){try{await request({action:'release',...args()});lease=null;}catch{}throw error;}
  },
  lastCheckpoint:()=>lastCheckpoint&&structuredClone(lastCheckpoint)
 };
}
