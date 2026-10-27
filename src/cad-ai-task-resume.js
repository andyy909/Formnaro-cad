import {cadGeometryDigest} from './cad-geometry-digest.js';
import {createAITaskProgress} from './cad-ai-task-progress.js';
import {createAITaskEvidence} from './cad-ai-task-evidence.js';
import {validateAIResultChecks} from './cad-ai-result-checks.js';
import {compactAIAnalysisResult} from './cad-ai-analysis.js';
import {validateAITaskRuntime} from './cad-ai-task-runtime.js';
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export const aiTaskDataDigest=value=>cadGeometryDigest(JSON.stringify(canonical(value)));
const invalid=(message,code='AI_TASK_RESUME_INVALID')=>{throw Object.assign(Error(message),{code,feedback:{retryable:false}});};
export function captureAIRequestBinding({scene,project,input,requirements,featureScope}){
 return {revision:scene.revision,projectDigest:project?aiTaskDataDigest(project):null,selectionDigest:aiTaskDataDigest(scene.selectionTargets??[]),referenceDigest:aiTaskDataDigest({featureScope:featureScope??null,photos:input.photoReferences??[]}),inputDigest:aiTaskDataDigest(Object.fromEntries(Object.entries(input).filter(([k])=>k!=='requestConfig'))),requirementsDigest:aiTaskDataDigest(requirements??null)};
}
export function validateAIRequestResume(value,{binding,maxSteps,purpose,requiredChecks,mode='continue'}){
 if(!['continue','restore'].includes(mode))invalid('Ungültiger Fortsetzungsmodus.');
 if(!value||Object.keys(value).some(k=>!['phase','candidateSettled','binding','progress','taskEvidence','evidenceCheckpoint','requiredChecks','requiredChecksLocked','photoState','analysisResults','correction','lastResult','candidate','counters','workspace'].includes(k))||!['step','analysis','candidate','failure','completed','stopped'].includes(value.phase))invalid('Der gespeicherte KI-Zwischenstand ist unvollständig.');
 if(!binding.projectDigest||!value.binding||aiTaskDataDigest(value.binding)!==aiTaskDataDigest(binding))invalid('Projekt, Auftrag, Auswahl oder Referenzen passen nicht mehr zum gespeicherten Stand.','STALE_REVISION');
 if(value.phase==='candidate'&&(value.candidateSettled!==true||!value.candidate||value.candidate.proposal?.visualReview?.status!=='pending'))invalid('Die letzte lokale Kandidatenprüfung muss vor der Fortsetzung abgeschlossen werden.','AI_TASK_RESUME_PENDING_CANDIDATE');
 if(value.candidateSettled!==undefined&&(value.candidateSettled!==true||value.phase!=='candidate'))invalid('Ungültiger Abschluss der lokalen Kandidatenprüfung.');
 const progress=createAITaskProgress({maxSteps,purpose,snapshot:value.progress});
 if(mode==='continue'&&progress.snapshot().stop)invalid('Dieser Auftrag wurde wegen fehlenden Fortschritts gestoppt.','AI_TASK_STALLED');
 if(mode==='continue'&&progress.snapshot().usedSteps>=maxSteps)invalid('Das gespeicherte Arbeitsschrittbudget ist erschöpft.','AI_ANALYSIS_LIMIT');
 if(typeof value.requiredChecksLocked!=='boolean'||!value.requiredChecksLocked&&value.requiredChecks?.length)invalid('Gespeicherte Sollprüfungen sind nicht eindeutig gebunden.');
 const evidence=createAITaskEvidence(binding.revision,value.evidenceCheckpoint),checks=validateAIResultChecks(value.requiredChecks);
 if(requiredChecks?.length&&(!value.requiredChecksLocked||aiTaskDataDigest(checks)!==aiTaskDataDigest(requiredChecks)))invalid('Gespeicherte Sollprüfungen stimmen nicht mit den festen Auftragsvorgaben überein.');
 if(!value.counters||Object.keys(value.counters).sort().join(',')!=='analysisRounds,correctionAttempts,visualReviews'||Object.values(value.counters).some(n=>!Number.isSafeInteger(n)||n<0||n>value.progress.usedSteps)||typeof value.correction!=='string'||value.correction.length>256000||!Array.isArray(value.analysisResults)||value.evidenceCheckpoint.failures.some(f=>f.lastStep>value.progress.usedSteps))invalid('Gespeicherte Fortschrittszähler oder Rückmeldungen sind ungültig.');
 const analysisResults=compactAIAnalysisResult(value.analysisResults,maxSteps>7?256000:32000);
 validateAITaskRuntime(value.workspace,binding.revision);
 // A filename from an old process is evidence only if its complete local data
 // is present. Never silently remeasure because a previous artifact was lost.
 function artifactReferences(v){
  if(!v||typeof v!=='object')return;
  if(v.program?.path&&!Object.hasOwn(value.workspace.files,v.program.path))invalid('Gespeichertes Analyseprogramm fehlt im Arbeitsbereich.');
  if(v.program?.bundlePath){const text=value.workspace.files[v.program.bundlePath];if(typeof text!=='string')invalid('Das vollständige Analyseprogrammpaket fehlt.');let bundle;try{bundle=JSON.parse(text);}catch{invalid('Gespeichertes Analyseprogrammpaket ist beschädigt.');}if(bundle.version!==1||!bundle.options||value.workspace.files[v.program.path]!== (bundle.options.script?.code??bundle.options.code))invalid('Analyseprogramm und gespeichertes Programmpaket stimmen nicht überein.');}
  if(v.workspaceResult?.path){const text=value.workspace.files[v.workspaceResult.path];if(typeof text!=='string'||Number.isSafeInteger(v.workspaceResult.characters)&&text.length!==v.workspaceResult.characters)invalid('Gespeichertes Messergebnis fehlt oder wurde verändert.');}
  for(const next of Object.values(v))if(next&&typeof next==='object')artifactReferences(next);
 }
 artifactReferences(analysisResults);
 if(value.candidate){
  if(!value.candidate.result?.commands||!value.candidate.project||!value.candidate.proposal||value.candidate.result.revision!==binding.revision)invalid('Die gespeicherte native Entwurfsgeometrie fehlt.');
  if(aiTaskDataDigest(validateAIResultChecks(value.candidate.result.checks))!==aiTaskDataDigest(checks))invalid('Der gespeicherte Kandidat verwendet andere Sollprüfungen.');
 }
 return {saved:structuredClone(value),progress,evidence,checks,analysisResults};
}
