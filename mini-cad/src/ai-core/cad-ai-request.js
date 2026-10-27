import {validateAIAnalysis,compactAIAnalysisResult} from './cad-ai-analysis.js';
import {aiFeedback,correctionFeedback} from './ai-feedback.js';
import {validateAIResultChecks} from './cad-ai-result-checks.js';
// One user request may repair failed output/previews; it never commits a model.
export async function runCadAIRequest({input,generate,access,isCurrent=()=>true,onUsage=()=>{},onCorrection=()=>{},onAnalysis=()=>{},maxCorrections=2}){
 const original=access.scene(),selection=JSON.stringify(original.selectionTargets??[]);
 function current(){if(!isCurrent()){const e=Error('KI-Anfrage abgebrochen.');e.name='AbortError';throw e;}const scene=access.scene();if(scene.revision!==original.revision||JSON.stringify(scene.selectionTargets??[])!==selection){const e=Error('CAD-Modell oder Auswahl wurde geändert. Bitte erneut senden.');e.code='STALE_REVISION';throw e;}return scene;}
 let correction='',lastResult,requiredChecks,analysisRounds=0,correctionAttempts=0;const analysisResults=[];
 for(let attempt=0;attempt<5;attempt++){
  let scene=current(),result;
  try{
   if(typeof access.sceneForAI==='function'){scene=await access.sceneForAI();current();}
   result=await generate({...input,context:access.context(),scene,correction,...(analysisResults.length?{analysisResults}: {})});
   if(result.usage)onUsage(result.usage,attempt);current();lastResult=result;
   if(result.analysis!==undefined){
    if(result.revision!==original.revision)throw Object.assign(Error('Die Messanfrage verwendet einen alten Modellstand.'),{code:'STALE_REVISION'});
    if(result.commands||result.checks||analysisRounds>=2||typeof access.analyze!=='function')throw Object.assign(Error('Höchstens zwei reine Messrunden vor der Konstruktion sind möglich.'),{code:'AI_ANALYSIS_LIMIT',feedback:{retryable:false}});
    const requests=validateAIAnalysis(result.analysis),reportBudget=Math.min(14000,30000-JSON.stringify(analysisResults).length-JSON.stringify(requests).length);onAnalysis(++analysisRounds);const measured=await access.analyze(requests,{reportBudget});current();
    const next={requests,...measured};compactAIAnalysisResult([...analysisResults,next]);analysisResults.push(next);continue;
   }
   if(!result.commands)return result;
   // Keep the first well-formed requirements through automatic correction.
   // An omitted/relaxed check must never turn a rejected result into a pass.
   if(requiredChecks)result={...result,checks:structuredClone(requiredChecks)};
   else if(result.checks?.length)requiredChecks=validateAIResultChecks(result.checks);
   const proposal=await access.preview({revision:result.revision,label:result.label,commands:result.commands,...(result.checks!==undefined?{checks:result.checks}:{})});
   try{current();}catch(error){access.discard?.(proposal.previewId);throw error;}
   return {...result,proposal,correctionAttempts,analysisRounds};
  }catch(error){
   if(!result&&error.aiUsage)onUsage(error.aiUsage,attempt);
   current();
   const stop=aiFeedback(error).retryable===false||error.name==='AbortError'||/STALE|CANCEL|ABORT|BUSY|TIMEOUT/.test(error.code??'')||/abgebrochen|laufende|aktualisiert|cancel|timed out/i.test(error.message);
   if(stop||(!result&&!error.aiRetryable)||correctionAttempts>=maxCorrections||correctionAttempts>=2){if(lastResult)error.aiResponse=lastResult;throw error;}
   correction=correctionFeedback(error,result);
   onCorrection(++correctionAttempts,error);
  }
 }
 throw Object.assign(Error('Die KI hat das Limit für Mess- und Korrekturrunden erreicht.'),{code:'AI_ANALYSIS_LIMIT'});
}
