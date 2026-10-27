import {captureAIRequestBinding,validateAIRequestResume} from './cad-ai-task-resume.js';
import {validateAITaskRequirements,captureAITaskProtection,verifyAITaskProtection} from './cad-ai-task-requirements.js';
import {visualReviewInput} from './cad-ai-visual-review.js';
import {validateAIAnalysis,compactAIAnalysisResult} from './cad-ai-analysis.js';
import {aiFeedback,correctionFeedback} from './ai-feedback.js';
import {validateAIResultChecks} from './cad-ai-result-checks.js';
import {compactAIRequestContext,createAITaskEvidence} from './cad-ai-task-evidence.js';
import {createPhotoTask,addPhotoImages} from './cad-photo-task.js';
import {createAITaskProgress,aiCandidateQuality,compareAIQuality,aiCandidateGeometry} from './cad-ai-task-progress.js';
// One user request may repair failed output/previews; it never commits a model.
export async function runCadAIRequest({input,generate,access,isCurrent=()=>true,onUsage=()=>{},onCorrection=()=>{},onAnalysis=()=>{},onVisualReview=()=>{},visualReview=true,maxCorrections,maxSteps=7,requirements,purpose=requirements?.purpose??'technical',onProgress,resume,restoreOnly=false}){
 if(!Number.isSafeInteger(maxSteps)||maxSteps<7||maxSteps>80)throw Error('KI-Arbeitsschritte: 7 bis 80 wählen.');
 const extended=maxSteps>7,correctionLimit=maxCorrections??(extended?maxSteps-1:2),analysisLimit=extended?maxSteps-1:2,reviewLimit=extended?maxSteps-1:2;
 const fixedRequirements=requirements?validateAITaskRequirements(requirements):null;if(fixedRequirements&&fixedRequirements.purpose!==purpose)throw Object.assign(Error('Die Qualitätsart darf die gespeicherten Auftragsvorgaben nicht ersetzen.'),{code:'AI_TASK_REQUIREMENTS_INVALID'});
 const protectedSources=captureAITaskProtection(fixedRequirements?.protectedTargets.length?access.project?.():null,fixedRequirements?.protectedTargets??[]);
 const original=access.scene(),selection=JSON.stringify(original.selectionTargets??[]),binding=captureAIRequestBinding({scene:original,project:access.project?.(),input,requirements:fixedRequirements,featureScope:access.context()?.featureScope});
 const restored=resume?validateAIRequestResume(resume,{binding,maxSteps,purpose,requiredChecks:fixedRequirements?.checks,mode:restoreOnly?'restore':'continue'}):null,progress=restored?.progress??createAITaskProgress({maxSteps,purpose}),taskEvidence=restored?.evidence??createAITaskEvidence(original.revision);
 function current(){if(!isCurrent()){const e=Error('KI-Anfrage abgebrochen.');e.name='AbortError';throw e;}const scene=access.scene();if(scene.revision!==original.revision||JSON.stringify(scene.selectionTargets??[])!==selection){const e=Error('CAD-Modell oder Auswahl wurde geändert. Bitte erneut senden.');e.code='STALE_REVISION';throw e;}return scene;}
 async function observed(phase){current();if(typeof onProgress!=='function')return;try{await onProgress(structuredClone({phase,...(phase==='candidate'?{candidateSettled:true}:{}),binding,progress:progress.snapshot(),taskEvidence:taskEvidence.snapshot(),evidenceCheckpoint:taskEvidence.checkpoint(),...(photoTask?{photoState:photoTask.checkpoint()}:{}),...(typeof access.captureTaskRuntime==='function'?{workspace:access.captureTaskRuntime()}:{}),requiredChecks:requiredChecks??[],requiredChecksLocked:requiredChecks!==undefined,analysisResults,correction,lastResult:lastResult??null,candidate:retained??null,counters:{analysisRounds,correctionAttempts,visualReviews}}));}catch(error){throw Object.assign(Error('KI-Auftragszustand konnte nicht gespeichert werden: '+error.message),{code:'AI_TASK_CHECKPOINT_FAILED',feedback:{retryable:false}});}current();}
 if(restored){if(input.photoReferences?.length&&!restored.saved.photoState)throw Object.assign(Error('Die gespeicherten Fotoausschnitte fehlen. Auftrag nicht mit unvollständigen Bildbezügen fortsetzen.'),{code:'AI_TASK_RESUME_INVALID'});if(typeof access.restoreTaskRuntime!=='function')throw Object.assign(Error('Der gespeicherte Arbeitsbereich kann hier nicht sicher fortgesetzt werden.'),{code:'AI_TASK_RESUME_UNAVAILABLE'});if(restored.saved.candidate&&typeof access.restoreCandidate!=='function')throw Object.assign(Error('Gespeicherten Kandidaten zuerst als neue geprüfte Vorschau wiederherstellen.'),{code:'AI_TASK_RESUME_UNAVAILABLE'});}
 else if(!access.programOnly)await access.beginTask?.();
 const baseInput=input,photoTask=await createPhotoTask(input,restored?.saved.photoState);current();let photoReports=[],photoImageOmissions=[];
 if(photoTask){const packed=addPhotoImages(baseInput,[...photoTask.initialImages,...photoTask.takeImages()]);input={...input,images:packed.images};photoImageOmissions=packed.omitted;}
 let correction=restored?.saved.correction??'',lastResult=restored?.saved.lastResult??undefined,lastFailure,requiredChecks=restored?(restored.saved.requiredChecksLocked?restored.checks:undefined):(fixedRequirements?.checks.length?structuredClone(fixedRequirements.checks):undefined),analysisRounds=restored?.saved.counters.analysisRounds??0,correctionAttempts=restored?.saved.counters.correctionAttempts??0,retained;const analysisResults=restored?.analysisResults??[];let visualInput=null,visualReviews=restored?.saved.counters.visualReviews??0;
 async function finish(error){
  const value=retained;if(value.proposal.visualReview?.status==='pending')value.proposal.visualReview={status:'incomplete',reason:error?.message??'Keine abgeschlossene Bildprüfung.'};
  if(error)value.proposal={...value.proposal,correctionError:{code:error.code??'AI_CORRECTION_FAILED',message:error.message}};
  await observed(error?'stopped':'completed');retained=null;
  return {...value.result,proposal:value.proposal,correctionAttempts,analysisRounds,visualReviews,taskProgress:progress.snapshot()};
 }
 try{
 if(restored?.saved.candidate){
  const saved=restored.saved.candidate,proposal=await access.restoreCandidate(saved,{checks:requiredChecks??[],revision:original.revision});
  try{current();const project=access.getPreview?.(proposal?.previewId);if(!proposal||proposal.previewId===saved.proposal.previewId||proposal.revision!==original.revision||!project||proposal.verification?.version!==1||!Array.isArray(proposal.verification.checks)||proposal.verification.checks.length!==(requiredChecks?.length??0))throw Object.assign(Error('Die gespeicherte Vorschau wurde nicht neu geprüft.'),{code:'AI_TASK_RESUME_INVALID'});verifyAITaskProtection(project,protectedSources);retained={result:saved.result,proposal};}
  catch(error){if(proposal?.previewId&&proposal.previewId!==saved.proposal.previewId)access.discard?.(proposal.previewId);throw error;}
  if(typeof access.inspectFreeCADPreview==='function'){
   try{proposal.independentCheck=await access.inspectFreeCADPreview(proposal.previewId);current();}
   catch(error){current();if(/STALE|ABORT|CANCEL/.test(error.code??''))throw error;proposal.independentCheck={status:'unavailable',reason:error.message};}
  }
 }
 if(restored)await access.restoreTaskRuntime(restored.saved.workspace);
 if(restored&&retained&&photoTask){retained.proposal.photoComparison=(await photoTask.compare(retained.proposal.previewId,access.inspectPhotoPreview)).map(r=>({...r,previewId:retained.proposal.previewId,revision:original.revision}));photoReports=retained.proposal.photoComparison.map(({overlay,...report})=>report);if(retained.proposal.photoComparison.some(r=>r.matches===false)){const packed=addPhotoImages(baseInput,[...photoTask.initialImages,...retained.proposal.photoComparison.flatMap(r=>r.overlay?[r.overlay]:[])]);input={...input,images:packed.images};photoImageOmissions=packed.omitted;}}
 if(restoreOnly){if(!restored||!retained)throw Object.assign(Error('Gespeicherter Entwurf fehlt.'),{code:'AI_TASK_RESUME_INVALID'});const value=retained;retained=null;return {...value.result,proposal:value.proposal,correctionAttempts,analysisRounds,visualReviews,taskProgress:progress.snapshot()};}
 if(restored?.saved.candidate?.proposal.visualReview?.status==='pending'){
  if(!visualReview||typeof access.inspectPreview!=='function')throw Object.assign(Error('Die ausstehende Bildprüfung benötigt ein bildfähiges Modell und aktuelle Vorschauansichten.'),{code:'AI_TASK_RESUME_UNAVAILABLE'});
  const capture=await access.inspectPreview(retained.proposal.previewId);current();if(capture.previewId!==retained.proposal.previewId||capture.revision!==original.revision)throw Object.assign(Error('Wiederhergestellte Bildvorschau ist veraltet.'),{code:'STALE_REVISION'});visualInput=visualReviewInput(input,retained.result,retained.proposal,capture);retained.proposal.visualReview={status:'pending'};
 }
 for(let attempt=progress.snapshot().usedSteps;attempt<maxSteps;attempt++){
  progress.claimStep();await observed('step');
  let scene=current(),result,preparedProposal;
  try{
   if(typeof access.sceneForAI==='function'){scene=await access.sceneForAI();current();}
   result=await generate({...input,...(visualInput??{}),context:{...compactAIRequestContext(access.context()),...(photoTask?{...photoTask.context(),photoComparison:photoReports,photoImageOmissions}:{}),agentWorkflow:{step:attempt+1,maxSteps,remainingSteps:maxSteps-attempt-1,analysisRounds,correctionAttempts,progress:progress.snapshot(),...(fixedRequirements?{taskRequirements:structuredClone(fixedRequirements)}:{}),qualityCriteria:purpose==='generative'?'Preserve explicit dimensions and native validity; judge free-form shape qualitatively. Do not invent dimensional proof from visual acceptance.':'Preserve fixed functional dimensions, native checks, calibrated reference evidence and protected sources; visual resemblance is a separate qualitative check.',rule:'Measure, construct, inspect and correct adaptively within this request budget. Preserve requirements, original geometry and the best usable preview. FreeCAD is an additional local geometry engine. Never claim installation or geometric validity without a completed tool result.'},taskEvidence:taskEvidence.snapshot()},scene,correction,...(analysisResults.length?{analysisResults}: {})});
   if(result.usage)onUsage(result.usage,attempt);current();lastResult=result;
   if(result.assistant!==undefined){
    if(access.restrictedFeatures&&result.assistant?.kind!=='help')throw Object.assign(Error('Dieser Auftrag erlaubt nur die angehängten Merkmalsbezüge. Bedienhilfen, Notizen und freie Vorführungen gehören in einen getrennten Auftrag.'),{code:'AI_FEATURE_SCOPE_VIOLATION',feedback:{retryable:true}});
    if(!access.programAssistant||result.revision!==original.revision||['commands','analysis','review','checks'].some(k=>result[k]!==undefined))throw Error('Ungültige Programm-Assistentenantwort.');
    if(result.assistant.kind==='demonstrate'){
     const checks=requiredChecks??(result.assistant.checks?.length?validateAIResultChecks(result.assistant.checks):undefined);if(checks)requiredChecks=checks;
     const demo=await access.programAssistant.demonstrate(result.assistant,{preview:access.preview,checks,isCurrent});preparedProposal=demo.proposal;
     result={revision:result.revision,label:result.assistant.title,commands:demo.commands,...(checks?{checks}:{}),message:result.message??'Vorführung abgeschlossen. Die Vorschau kann übernommen oder verworfen werden.',assistantReport:demo.report};
    }else{
     if(result.assistant.kind==='help'&&analysisRounds>=analysisLimit)throw Object.assign(Error('Hilfesuchlimit erreicht.'),{feedback:{retryable:false}});
     const report=await access.programAssistant.execute(result.assistant,{isCurrent,expectedProviderId:access.expectedProviderId});current();
     if(result.assistant.kind==='help'){onAnalysis(++analysisRounds);analysisResults.push({programHelp:report});const stalled=progress.analysis([{engine:'app',kind:'help',options:{query:result.assistant.query}}],report);await observed(stalled?'stopped':'analysis');if(stalled)throw stalled;correction='';continue;}
     if(retained)return {...await finish(Error(result.message??'Die Bedienhilfe lieferte keinen verbesserten Entwurf.')),assistantReport:report,...(result.message?{message:result.message}:{})};
     return {...result,message:result.message??(result.assistant.kind==='note'?'Kontextnotiz ergänzt.':'Bedienhilfe abgeschlossen.'),assistantReport:report};
    }
   }
   if(result.review!==undefined){
    if(!visualInput||!retained||result.revision!==original.revision||result.review.previewId!==retained.proposal.previewId||result.review.accepted!==true||result.commands||result.checks||result.analysis)throw Object.assign(Error('Ungültige Antwort auf die Bildprüfung.'),{code:'AI_VISUAL_REVIEW_INVALID'});
    retained.proposal.visualReview={status:'reviewed',observations:String(result.review.observations??'').slice(0,4000),scope:'Qualitative Bildprüfung; Maße und verdeckte Geometrie werden dadurch nicht bewiesen.'};
    retained.result.message=String(result.review.observations??'').slice(0,4000);
    return await finish();
   }
   if(visualInput&&result.commands){
    if(correctionAttempts>=correctionLimit)return await finish(Error('Das Korrekturlimit der Bildprüfung ist erreicht.'));
    retained.proposal.visualReview={status:'incomplete',reason:'Die Bildprüfung fordert eine Korrektur.',correctionRequested:true};onCorrection(++correctionAttempts,Object.assign(Error('Die Bildprüfung korrigiert den Entwurf.'),{code:'AI_VISUAL_CORRECTION'}));visualInput=null;
   }
   if(result.analysis!==undefined){
    if(result.revision!==original.revision)throw Object.assign(Error('Die Messanfrage verwendet einen alten Modellstand.'),{code:'STALE_REVISION'});
    if(result.commands||result.checks||analysisRounds>=analysisLimit||typeof access.analyze!=='function')throw Object.assign(Error('Das Messrundenlimit ist erreicht.'),{code:'AI_ANALYSIS_LIMIT',feedback:{retryable:false}});
    const requests=validateAIAnalysis(result.analysis),reportBudget=Math.min(14000,(extended?250000:30000)-JSON.stringify(analysisResults).length-JSON.stringify(requests).length);onAnalysis(++analysisRounds);
    const nativeRequests=requests.filter(q=>q.engine!=='photo'),measured=nativeRequests.length?await access.analyze(nativeRequests,{reportBudget}):{results:[]};
    for(const q of requests.filter(q=>q.engine==='photo')){if(!photoTask)throw Error('Keine aktuelle kalibrierte Fotoreferenz.');measured.results.push(photoTask.analyze(q));}
    if(photoTask){const additions=photoTask.takeImages();if(additions.length){const packed=addPhotoImages(baseInput,[...photoTask.initialImages,...additions]);input={...input,images:packed.images};photoImageOmissions=packed.omitted;for(const r of measured.results)if(r.value?.imageName)r.value.imageSent=!packed.omitted.includes(r.value.imageName);}}
    current();
    const successfulRequests=requests.map(q=>{const program=measured.results?.find(r=>r.id===q.id)?.program;return program?{id:q.id,engine:q.engine,kind:q.kind,program}:q;});
    const next={requests:successfulRequests,...measured};compactAIAnalysisResult([...analysisResults,next],extended?256000:32000);analysisResults.push(next);const stalled=progress.analysis(requests,measured);if(!stalled)correction='';await observed(stalled?'stopped':'analysis');if(stalled)throw stalled;continue;
   }
   if(!result.commands)return retained?await finish(Error(result.question||result.message||'Die Korrektur lieferte keinen neuen Entwurf.')):result;
   // Keep the first well-formed requirements through automatic correction.
   // An omitted/relaxed check must never turn a rejected result into a pass.
   if(requiredChecks)result={...result,checks:structuredClone(requiredChecks)};
   else if(result.checks?.length)requiredChecks=validateAIResultChecks(result.checks);
   const proposal=preparedProposal??await access.preview({revision:result.revision,label:result.label,commands:result.commands,...(result.checks!==undefined?{checks:result.checks}:{})},{retainFailedChecks:true});
   try{current();if(protectedSources.length){if(typeof access.getPreview!=='function')throw Object.assign(Error('Der native Vorschauzustand für den Auftragsschutz fehlt.'),{code:'AI_TASK_PROTECTION_UNAVAILABLE',feedback:{retryable:false}});verifyAITaskProtection(access.getPreview(proposal.previewId),protectedSources);}}catch(error){access.discard?.(proposal.previewId);throw error;}
   if(typeof access.inspectFreeCADPreview==='function'){
    try{proposal.independentCheck=await access.inspectFreeCADPreview(proposal.previewId);current();}
    catch(error){current();if(/STALE|ABORT|CANCEL/.test(error.code??''))throw error;proposal.independentCheck={status:'unavailable',reason:error.message};}
   }
   // A later failed correction must not evict an already better usable draft.
   if(photoTask){proposal.photoComparison=(await photoTask.compare(proposal.previewId,access.inspectPhotoPreview)).map(r=>({...r,previewId:proposal.previewId,revision:original.revision}));current();photoReports=proposal.photoComparison.map(({overlay,...report})=>report);}
   const candidateGeometry=typeof access.getPreview==='function'?aiCandidateGeometry(access.getPreview(proposal.previewId)):undefined;
   if(!retained||compareAIQuality(aiCandidateQuality(proposal),aiCandidateQuality(retained.proposal))<0){
    if(retained)access.discard?.(retained.proposal.previewId);retained={result,proposal};
   }else access.discard?.(proposal.previewId);
   progress.candidate(retained.proposal);
   if(proposal.verification?.passed===false){
    const failures=proposal.verification.checks.filter(c=>c.passed===false),failed=failures[0];
    throw Object.assign(Error(failed.error.message),{code:failed.error.code,feedback:{...failed.feedback,message:failed.error.message,failures:failures.map(c=>aiFeedback({code:c.error.code,message:c.error.message,feedback:{...c.feedback,message:c.error.message}}))}});
   }
   if(proposal.independentCheck?.passed===false)throw Object.assign(Error('FreeCAD meldet ungültige Geometrie im STEP-Export.'),{code:'FREECAD_INVALID_RESULT',feedback:{geometryCheck:proposal.independentCheck}});
   if(proposal.photoComparison?.some(r=>r.matches===false)){
    const packed=addPhotoImages(baseInput,[...photoTask.initialImages,...proposal.photoComparison.flatMap(r=>r.overlay?[r.overlay]:[])]);input={...input,images:packed.images};photoImageOmissions=packed.omitted;
    throw Object.assign(Error('Fotovergleich: Kontur, Außenmaß oder sichtbare Öffnung weicht ab. Konstruktive Maße und Referenz erhalten.'),{code:'PHOTO_MISMATCH'});
   }
   const stalled=progress.proposed(candidateGeometry);if(stalled)throw stalled;
   if(visualReview&&typeof access.inspectPreview==='function'&&visualReviews<reviewLimit){
    visualReviews++;retained.proposal.visualReview={status:'pending'};correction='';await observed('candidate');
    try{
     onVisualReview(visualReviews);const capture=await access.inspectPreview(retained.proposal.previewId);current();
     if(capture.previewId!==retained.proposal.previewId||capture.revision!==original.revision)throw Object.assign(Error('Bildvorschau ist veraltet.'),{code:'STALE_REVISION'});
     visualInput=visualReviewInput(input,retained.result,retained.proposal,capture);continue;
    }catch(error){current();if(/STALE|ABORT|CANCEL/.test(error.code??''))throw error;proposal.visualReview={status:'unavailable',reason:error.message};}
   }else if(typeof access.inspectPreview==='function')proposal.visualReview={status:'unavailable',reason:visualReview?'Bildprüflimit erreicht.':'Das gewählte Modell unterstützt keine automatische Bildprüfung.'};
   return await finish();
  }catch(error){
   if(!result&&error.aiUsage)onUsage(error.aiUsage,attempt);
   current();if(error.code==='AI_TASK_CHECKPOINT_FAILED')throw error;
   const interrupted=error.name==='AbortError'||/STALE|CANCEL|ABORT|BUSY/.test(error.code??'')||/abgebrochen|laufende|aktualisiert|cancel/i.test(error.message),stop=interrupted||aiFeedback(error).retryable===false||/TIMEOUT/.test(error.code??'')||/timed out/i.test(error.message);
   if(!interrupted&&error.code!=='AI_TASK_STALLED'){
    lastFailure=aiFeedback(error);taskEvidence.failed(attempt+1,error,result);const stalled=progress.failed(error,result);
    if(stalled){await observed('stopped');if(stalled!==error){stalled.message+=' Letzter Fehler: '+lastFailure.message;stalled.feedback.lastFailure=lastFailure;}if(retained)return await finish(stalled);throw stalled;}
   }
   if(stop||(!result&&!error.aiRetryable)||correctionAttempts>=correctionLimit){if(retained&&!interrupted)return await finish(error);if(!interrupted){correction=correctionFeedback(error,result);await observed('failure');}if(lastResult)error.aiResponse=lastResult;throw error;}
   correction=correctionFeedback(error,result);
   if(visualInput&&retained)retained.proposal.visualReview={status:'incomplete',reason:error.message};
   onCorrection(++correctionAttempts,error);await observed('failure');
  }
 }
 if(retained)return await finish(Object.assign(Error('Das Anfragelimit ist erreicht. Der letzte berechnete Entwurf bleibt mit seinen Prüfbefunden verfügbar.'),{code:'AI_ANALYSIS_LIMIT'}));
 throw Object.assign(Error('Die KI hat das Limit für Mess- und Korrekturrunden erreicht.'+(lastFailure?' Letzter Fehler: '+lastFailure.message:'')),{code:'AI_ANALYSIS_LIMIT',...(lastFailure?{feedback:{lastFailure}}:{})});
 }finally{if(retained)access.discard?.(retained.proposal.previewId);}
}
