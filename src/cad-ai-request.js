import {selectModelChecks,validateModelCheckConfig} from './ai-model-check-config.js';
import {aiModellingPolicy,aiStrictnessDecision} from './ai-model-strictness.js';
import {captureAIRequestBinding,validateAIRequestResume} from './cad-ai-task-resume.js';
import {validateAITaskRequirements,captureAITaskProtection,verifyAITaskProtection} from './cad-ai-task-requirements.js';
import {appendAIViewImages,visualReviewInput} from './cad-ai-visual-review.js';
import {validateAIAnalysis,compactAIAnalysisResult} from './cad-ai-analysis.js';
import {aiFeedback,correctionFeedback} from './ai-feedback.js';
import {validateAIResultChecks} from './cad-ai-result-checks.js';
import {compactAIRequestContext,createAITaskEvidence} from './cad-ai-task-evidence.js';
import {createPhotoTask,addPhotoImages} from './cad-photo-task.js';
import {createAITaskProgress,aiCandidateQuality,compareAIQuality,aiCandidateGeometry} from './cad-ai-task-progress.js';
const analysisLabels={bounds:['Abmessungen','Dimensions'],bore:['Bohrung','Bore'],wallThickness:['Wandstärke','Wall thickness'],minimumDistance:['Mindestabstand','Minimum distance'],sectionContours:['Schnittkonturen','Section contours'],collision:['Kollision','Collision'],surfaceDeviation:['Oberflächenabweichung','Surface deviation'],inspect:['Geometrie untersuchen','Inspect geometry']};
// One user request may repair failed output/previews; it never commits a model.
export async function runCadAIRequest({input,generate,access,isCurrent=()=>true,onUsage=()=>{},onActivity=()=>{},onCorrection=()=>{},onAnalysis=()=>{},onVisualReview=()=>{},onCandidate=async()=>{},visualReview=true,maxCorrections,maxSteps=7,requirements,purpose=requirements?.purpose??'technical',onProgress,resume,restoreOnly=false}){
 const practiceTask=access.practiceRequested===true,practiceContext=practiceTask?structuredClone(access.context()):null;
 const storedPhotos=access.practiceCopy?.projectCopy?.project?.photos?.items??[];
 const practiceFiles=practiceTask?access.practiceFiles?.map(({name,kind,mimeType,base64,photoEvidence})=>{
  const descriptor={name,kind,photoEvidence};
  if(kind==='photo'&&base64){
   const dataUrl=`data:${mimeType};base64,${base64}`;
   const matches=storedPhotos.filter(item=>item.image?.dataUrl===dataUrl);
   if(matches.length===1&&matches[0].reference){
    const {name,view,version,scale}=matches[0].reference;
    descriptor.savedPhoto={name,view};
    if(version===1&&scale?.points?.length===2){
     const [[x0,y0],[x1,y1]]=scale.points;
     const referencePixels=Math.hypot(x1-x0,y1-y0);
     if(referencePixels>0)descriptor.savedPhoto.calibration={referenceMm:scale.mm,referencePixels};
    }
   }
  }
  return descriptor;
 }):undefined;
 if(!Number.isSafeInteger(maxSteps)||maxSteps<7||maxSteps>80)throw Error('KI-Arbeitsschritte: 7 bis 80 wählen.');
 if(input.modelChecks!==undefined&&typeof input.modelChecks!=='boolean')throw Error('Modellprüfung: gültigen Modelliermodus wählen.');
 const checkConfig=input.modelCheckConfig?validateModelCheckConfig(input.modelCheckConfig):null;
 const selected=checks=>selectModelChecks(checks,checkConfig),modelChecks=checkConfig?checkConfig.mode==='checked':input.modelChecks!==false,modelStrictness=checkConfig?.strictness??input.modelStrictness??100;
 const modelPolicy=modelChecks?({...aiModellingPolicy(modelStrictness),...(checkConfig?{configuration:checkConfig,instructions:aiModellingPolicy(modelStrictness).instructions+" Only run enabled check kinds and review engines listed in configuration. Disabled checks are not evidence. "}: {})}):{...aiModellingPolicy(0),checksEnabled:false,measurementEnforcement:'disabled',instructions:'Normal mode: build the requested model with checks:[], without automatic result checks or quality retries. Use tool feedback to repair execution errors. Choose missing dimensions yourself and report the actual result.'};
 const viewActions=practiceTask||access.restrictedFeatures||!access.fitView?[]:[
  'fit',...(visualReview&&access.screenshot?['screenshot']:[]),...(visualReview&&access.confirmedScreenshot?['confirmed']:[]),
  ...(visualReview&&access.inspectPreview?['candidate']:[])
 ];
 const viewContract={actions:viewActions,reply:'Use {revision,view:"fit"} to frame the model, or {revision,view:"screenshot"} to frame and see the viewport. Use {revision,view:"confirmed"} for the actual confirmed model after Apply, including its revision and source. Include view:"candidate" with complete commands to see four views of the draft. After viewing the draft, return a message to keep it or complete revised commands. Use only listed actions. Each view needs a remaining workflow step. Only describe what you saw when viewFeedback reports success and an image is attached.'};
 let viewFeedback=null;
 async function getView(action,draft){
  if(draft)onActivity({de:'Vier Ansichten des Entwurfs rendern …',en:'Rendering four views of the draft …'});
  try{
   let capture,provenance;
   if(draft){
    capture=await access.inspectPreview(draft.proposal.previewId);
    if(capture.previewId!==draft.proposal.previewId||capture.revision!==original.revision)throw Object.assign(Error('Bildvorschau ist veraltet.'),{code:'STALE_REVISION'});
   }else{
    await access.fitView();current();
    if(action==='screenshot'||action==='confirmed'){
     const confirmed=action==='confirmed';
     const image=confirmed?await access.confirmedScreenshot(original.revision):await access.screenshot();
     if(image?.mimeType!=='image/png'||!image.dataBase64)throw Error('Die Arbeitsfläche lieferte kein Bild.');
     if(confirmed){
      if(image.revision!==original.revision||image.source!=='confirmed-model'||image.applied!==true)
       throw Object.assign(Error('Bild des bestätigten Modellstands ist veraltet.'),{code:'STALE_REVISION'});
      provenance={source:image.source,revision:image.revision,applied:true};
     }
     capture={images:[{name:confirmed?'Formnaro-Bestaetigtes-Modell.png':'Formnaro-Arbeitsflaeche.png',
      mimeType:'image/png',dataUrl:'data:image/png;base64,'+image.dataBase64}]};
    }
   }
   current();
   return {report:{action,status:'completed',...provenance,...(draft?{source:'preview',revision:capture.revision,previewId:capture.previewId,applied:false,views:capture.views,scope:capture.scope,commands:draft.result.commands}:{})},...(capture?{images:appendAIViewImages(input,capture)}:{})};
  }catch(error){
   current();
   if(/STALE|ABORT|CANCEL/.test(error.code??''))throw error;
   return {report:{action,status:'failed',reason:error.message}};
  }
 }
 if(!modelChecks||checkConfig?.visual===false)visualReview=false;
 const extended=maxSteps>7,technicalRepairLimit=maxCorrections??2,correctionLimit=modelChecks?(checkConfig?(checkConfig.autoCorrect?checkConfig.maxCorrections:0):(maxCorrections??(extended?maxSteps-1:2))):0,analysisLimit=extended?maxSteps-1:2,reviewLimit=extended?maxSteps-1:2;
 const fixedRequirements=requirements?validateAITaskRequirements(requirements):null;if(fixedRequirements&&fixedRequirements.purpose!==purpose)throw Object.assign(Error('Die Qualitätsart darf die gespeicherten Auftragsvorgaben nicht ersetzen.'),{code:'AI_TASK_REQUIREMENTS_INVALID'});
 const protectedSources=captureAITaskProtection(fixedRequirements?.protectedTargets.length?access.project?.():null,fixedRequirements?.protectedTargets??[]);
 const original=access.scene(),selection=JSON.stringify(original.selectionTargets??[]),binding=captureAIRequestBinding({scene:original,project:access.project?.(),input,requirements:fixedRequirements,featureScope:access.context()?.featureScope});
 const restored=resume?validateAIRequestResume(resume,{binding,maxSteps,purpose,requiredChecks:modelChecks?selected(fixedRequirements?.checks??[]):[],mode:restoreOnly?'restore':'continue'}):null,progress=restored?.progress??createAITaskProgress({maxSteps,purpose}),taskEvidence=restored?.evidence??createAITaskEvidence(original.revision);
 function current(){access.practiceCopy?.assertCurrent();if(!isCurrent()){const e=Error('KI-Anfrage abgebrochen.');e.name='AbortError';throw e;}const scene=access.scene();if(scene.revision!==original.revision||JSON.stringify(scene.selectionTargets??[])!==selection){const e=Error('CAD-Modell oder Auswahl wurde geändert. Bitte erneut senden.');e.code='STALE_REVISION';throw e;}return scene;}
 async function observed(phase){current();if(typeof onProgress!=='function')return;try{await onProgress(structuredClone({phase,...(phase==='candidate'?{candidateSettled:true}:{}),binding,progress:progress.snapshot(),taskEvidence:taskEvidence.snapshot(),evidenceCheckpoint:taskEvidence.checkpoint(),...(photoTask?{photoState:photoTask.checkpoint()}:{}),...(typeof access.captureTaskRuntime==='function'?{workspace:access.captureTaskRuntime()}:{}),requiredChecks:requiredChecks??[],requiredChecksLocked:requiredChecks!==undefined,analysisResults,correction,lastResult:lastResult??null,candidate:retained??null,counters:{analysisRounds,correctionAttempts,visualReviews}}));}catch(error){throw Object.assign(Error('KI-Auftragszustand konnte nicht gespeichert werden: '+error.message),{code:'AI_TASK_CHECKPOINT_FAILED',feedback:{retryable:false}});}current();}
 if(restored){if(input.photoReferences?.length&&!restored.saved.photoState)throw Object.assign(Error('Die gespeicherten Fotoausschnitte fehlen. Auftrag nicht mit unvollständigen Bildbezügen fortsetzen.'),{code:'AI_TASK_RESUME_INVALID'});if(typeof access.restoreTaskRuntime!=='function')throw Object.assign(Error('Der gespeicherte Arbeitsbereich kann hier nicht sicher fortgesetzt werden.'),{code:'AI_TASK_RESUME_UNAVAILABLE'});if(restored.saved.candidate&&typeof access.restoreCandidate!=='function')throw Object.assign(Error('Gespeicherten Kandidaten zuerst als neue geprüfte Vorschau wiederherstellen.'),{code:'AI_TASK_RESUME_UNAVAILABLE'});}
 else if(!access.programOnly)await access.beginTask?.();
 const baseInput=input,photoTask=await createPhotoTask(input,restored?.saved.photoState);current();let photoReports=[],photoImageOmissions=[];
 if(photoTask){const packed=addPhotoImages(baseInput,[...photoTask.initialImages,...photoTask.takeImages()]);input={...input,images:packed.images};photoImageOmissions=packed.omitted;}
 let practiceContinuation=null,practiceState,practicePanel,practiceImages,practiceAdvisory=false,lastPracticeFailure,confirmedPracticeSteps=[];
 const practiceFailures=[],practiceChecks=[];
 const summarizePractice=report=>({...report,...(practiceFailures.length?{corrections:practiceFailures}:{}),
  ...(practiceChecks.length?{previousChecks:practiceChecks}:{})});
 let correction=restored?.saved.correction??'',lastResult=restored?.saved.lastResult??undefined,lastFailure,requiredChecks=!modelChecks?[]:restored?(restored.saved.requiredChecksLocked?restored.checks:undefined):(fixedRequirements?.checks.length?selected(structuredClone(fixedRequirements.checks)):undefined),analysisRounds=restored?.saved.counters.analysisRounds??0,correctionAttempts=restored?.saved.counters.correctionAttempts??0,retained;const analysisResults=restored?.analysisResults??[];let visualInput=null,visualReviews=restored?.saved.counters.visualReviews??0,programHelpBudget=!!access.programOnly&&!practiceTask,programHelpRequests=0;
 const isQualityFailure=error=>/^(?:AI_RESULT_|AI_VISUAL_|PHOTO_MISMATCH$|FREECAD_INVALID_RESULT$)/.test(error.code??'');
 const previousTechnical=taskEvidence.checkpoint().failures.filter(row=>!isQualityFailure(row)).reduce((sum,row)=>sum+row.occurrences,0);
 let technicalRepairs=Math.min(correctionAttempts,previousTechnical),qualityCorrections=correctionAttempts-technicalRepairs;
 async function finish(error){
  const value=retained;if(value.proposal.visualReview?.status==='pending')value.proposal.visualReview={status:'incomplete',reason:error?.message??'Keine abgeschlossene Bildprüfung.'};
  if(error)value.proposal={...value.proposal,correctionError:{code:error.code??'AI_CORRECTION_FAILED',message:error.message}};
  await observed(error?'stopped':'completed');retained=null;
  return {...value.result,proposal:value.proposal,correctionAttempts,analysisRounds,visualReviews,taskProgress:progress.snapshot()};
 }
 try{
 if(restored?.saved.candidate){
  const saved=restored.saved.candidate,proposal=await access.restoreCandidate(saved,{checks:requiredChecks??[],revision:original.revision,modelCheckConfig:checkConfig??undefined});if(proposal?.verification)proposal.verification.modellingPolicy=aiStrictnessDecision(proposal.verification,modelPolicy.strictness);
  try{current();const project=access.getPreview?.(proposal?.previewId);if(!proposal||proposal.previewId===saved.proposal.previewId||proposal.revision!==original.revision||!project||proposal.verification?.version!==1||!Array.isArray(proposal.verification.checks)||proposal.verification.checks.length!==(requiredChecks?.length??0))throw Object.assign(Error('Die gespeicherte Vorschau wurde nicht neu geprüft.'),{code:'AI_TASK_RESUME_INVALID'});verifyAITaskProtection(project,protectedSources);retained={result:saved.result,proposal};}
  catch(error){if(proposal?.previewId&&proposal.previewId!==saved.proposal.previewId)access.discard?.(proposal.previewId);throw error;}
  if(modelChecks&&checkConfig?.freecad!==false&&typeof access.inspectFreeCADPreview==='function'){
   try{proposal.independentCheck=await access.inspectFreeCADPreview(proposal.previewId);current();}
   catch(error){current();if(/STALE|ABORT|CANCEL/.test(error.code??''))throw error;proposal.independentCheck={status:'unavailable',reason:error.message};}
  }
 }
 if(!modelChecks&&retained){retained.proposal.verification={version:1,checks:[],skipped:true,scope:'Normal mode without automatic model checks.'};retained.proposal.visualReview={status:'skipped'};}
 if(restored)await access.restoreTaskRuntime(restored.saved.workspace);
 if(modelChecks&&checkConfig?.photo!==false&&restored&&retained&&photoTask){retained.proposal.photoComparison=(await photoTask.compare(retained.proposal.previewId,access.inspectPhotoPreview)).map(r=>({...r,previewId:retained.proposal.previewId,revision:original.revision}));photoReports=retained.proposal.photoComparison.map(({overlay,...report})=>report);if(retained.proposal.photoComparison.some(r=>r.matches===false)){const packed=addPhotoImages(baseInput,[...photoTask.initialImages,...retained.proposal.photoComparison.flatMap(r=>r.overlay?[r.overlay]:[])]);input={...input,images:packed.images};photoImageOmissions=packed.omitted;}}
 if(restoreOnly){if(!restored||!retained)throw Object.assign(Error('Gespeicherter Entwurf fehlt.'),{code:'AI_TASK_RESUME_INVALID'});const value=retained;retained=null;return {...value.result,proposal:value.proposal,correctionAttempts,analysisRounds,visualReviews,taskProgress:progress.snapshot()};}
 if(restored?.saved.candidate?.proposal.visualReview?.status==='pending'){
  if(!visualReview||typeof access.inspectPreview!=='function')throw Object.assign(Error('Die ausstehende Bildprüfung benötigt ein bildfähiges Modell und aktuelle Vorschauansichten.'),{code:'AI_TASK_RESUME_UNAVAILABLE'});
  const capture=await access.inspectPreview(retained.proposal.previewId);current();if(capture.previewId!==retained.proposal.previewId||capture.revision!==original.revision)throw Object.assign(Error('Wiederhergestellte Bildvorschau ist veraltet.'),{code:'STALE_REVISION'});visualInput=visualReviewInput(input,retained.result,retained.proposal,capture);retained.proposal.visualReview={status:'pending'};
 }
 for(let attempt=progress.snapshot().usedSteps;attempt<maxSteps;attempt++){
  progress.claimStep();await observed('step');
  onActivity({de:`Schritt ${attempt+1}/${maxSteps} · KI verarbeitet den aktuellen Stand …`,en:`Step ${attempt+1}/${maxSteps} · AI is processing the current state …`});
  let scene=current(),result,preparedProposal;
  try{
   if(typeof access.sceneForAI==='function'){scene=await access.sceneForAI();current();}
   if(programHelpBudget&&programHelpRequests>=3)throw Object.assign(Error('Bedienhilfe nach 3 KI-Anfragen beendet. Bitte das gewünschte Werkzeug oder Ziel genauer benennen.'),{code:'AI_PROGRAM_HELP_BUDGET',feedback:{retryable:false}});
   const programHelp=programHelpBudget?{maxRequests:3,usedRequests:++programHelpRequests,remainingRequests:3-programHelpRequests,rule:'Use the current target catalogue directly and batch the requested guide steps. At most one local help lookup should normally be needed. Give one or two useful explanatory sentences; ask a user question only if the intended target is essential and unresolved.'}:undefined;
   const requestContext=practiceTask?practiceContext:access.context({programHelpOnly:programHelpBudget});
   const previousView=viewFeedback;viewFeedback=null;
   const availableViews=visualInput?[]:viewActions.filter(action=>!requestContext.programHelpOnly||action!=='candidate');
   result=await generate({...input,...(visualInput??{}),...(previousView?.images?{images:previousView.images}:{}),...(practiceImages?{images:practiceImages}:{}),context:{...compactAIRequestContext(requestContext),...(availableViews.length?{viewContract:{...viewContract,actions:availableViews}}:{}),...(previousView?{viewFeedback:previousView.report}:{}),...(practiceTask?{practiceOnly:true,...(practiceState?{practiceState}:{}),...(practicePanel?{practicePanel}:{}),...(access.practiceCopy?{practiceFromProject:true,practiceObjects:access.practiceCopy.objects,...(access.practiceCopy.motion&&!practiceState?{practiceMotion:access.practiceCopy.motion}:{}),...(access.practiceCopy.sketchFeedback&&!practiceState?{practiceSketch:access.practiceCopy.sketchFeedback}:{})}:{}),...(practiceFiles?.length?{practiceFiles}:{})}:{}),modellingPolicy:modelPolicy,...(photoTask?{...photoTask.context(),photoComparison:photoReports,photoImageOmissions}:{}),agentWorkflow:{step:attempt+1,maxSteps,...(programHelp?{programHelp}:{}),remainingSteps:maxSteps-attempt-1,analysisRounds,correctionAttempts,progress:progress.snapshot(),...(fixedRequirements?{taskRequirements:structuredClone(fixedRequirements)}:{}),qualityCriteria:!modelChecks?'Build the requested functions; automatic model checks are disabled.':purpose==='generative'?'Preserve explicit dimensions and native validity; judge free-form shape qualitatively. Do not invent dimensional proof from visual acceptance.':'Preserve fixed functional dimensions, native checks, calibrated reference evidence and protected sources; visual resemblance is a separate qualitative check.',rule:'Construct in workable steps and continue from actual tool results. FreeCAD is available as an additional local geometry engine.'},taskEvidence:taskEvidence.snapshot()},scene:practiceTask?{revision:scene.revision,objects:[],selectionTargets:[],practiceIsolated:true}:scene,correction,...(analysisResults.length?{analysisResults}: {})});
   if(result.usage)onUsage(result.usage,attempt);current();lastResult=result;
   if(result.view!==undefined){
    if(!availableViews.includes(result.view)||result.revision!==original.revision||result.assistant!==undefined||result.analysis!==undefined||result.review!==undefined||(result.view==='candidate'?!Array.isArray(result.commands):result.commands!==undefined||result.checks!==undefined))throw Error('Ungültige KI-Ansichtsanfrage.');
    if(attempt+1>=maxSteps||programHelp&&programHelp.remainingRequests===0)throw Error('Kein weiterer KI-Arbeitsschritt für die Ansicht verfügbar.');
    if(result.view!=='candidate'){onActivity(result.view==='fit'?{de:'Arbeitsfläche einpassen …',en:'Framing the workspace …'}:{de:'Arbeitsfläche einpassen und Bild aufnehmen …',en:'Framing and capturing the workspace …'});viewFeedback=await getView(result.view);continue;}
   }
   if(previousView?.report.action==='candidate'&&retained&&result.message&&!result.commands&&!result.assistant&&!result.analysis&&!result.review){
    const shown=previousView.report.status==='completed'&&!!previousView.images?.length;
    retained.proposal.visualReview=shown?{status:'reviewed',mode:'on-demand',observations:result.message.slice(0,4000),scope:'Qualitative Ansicht; Maße und verdeckte Geometrie werden dadurch nicht bewiesen.'}:{status:'unavailable',reason:previousView.report.reason};
    retained.result={...retained.result,message:result.message};return await finish();
   }
   if(practiceTask&&(result.commands!==undefined||result.analysis!==undefined||result.review!==undefined||result.checks!==undefined||result.assistant!==undefined&&result.assistant?.kind!=='practice'))throw Object.assign(Error('Für diesen Übungsauftrag sind nur ein Übungsplan oder eine Antwort erlaubt. Das aktuelle Projekt wurde nicht verändert.'),{code:'PRACTICE_SCOPE_VIOLATION',feedback:{retryable:false}});
   if(access.guideOnly&&(result.commands||result.analysis||result.assistant?.kind==='demonstrate'))return {message:'Für Modellvorschläge und Messungen bitte auf KI-Chat umschalten.'};
   if(requestContext.programHelpOnly===true&&(result.commands||result.analysis||['demonstrate','practice'].includes(result.assistant?.kind))){
    programHelpBudget=false;
    correction='Der vorherige Aufruf enthielt nur den Bedienkatalog. Seine Modellbefehle wurden nicht ausgeführt. Der vollständige Modelliervertrag steht jetzt bereit. Erzeuge den vollständigen Modellvorschlag erneut gegen die bestätigte Szene.';
    continue;
   }
   // A construction or geometric measurement switches to the normal model
   // workflow; the smaller navigation budget must not truncate its checks.
   if(result.commands||result.analysis||['demonstrate','practice'].includes(result.assistant?.kind))programHelpBudget=false;
   if(result.assistant!==undefined){
    if(access.restrictedFeatures&&result.assistant?.kind!=='help')throw Object.assign(Error('Dieser Auftrag erlaubt nur die angehängten Merkmalsbezüge. Bedienhilfen, Notizen und freie Vorführungen gehören in einen getrennten Auftrag.'),{code:'AI_FEATURE_SCOPE_VIOLATION',feedback:{retryable:true}});
    if(!access.programAssistant||result.revision!==original.revision||['commands','analysis','review','checks'].some(k=>result[k]!==undefined))throw Error('Ungültige Programm-Assistentenantwort.');
    if(result.assistant.kind==='demonstrate'){
     const checks=!modelChecks?[]:requiredChecks??(result.assistant.checks?.length?selected(validateAIResultChecks(result.assistant.checks)):undefined);if(checks)requiredChecks=checks;
     const demo=await access.programAssistant.demonstrate(result.assistant,{preview:access.preview,checks,isCurrent});preparedProposal=demo.proposal;
     result={revision:result.revision,label:result.assistant.title,commands:demo.commands,...(checks?{checks}:{}),message:result.message??'Vorführung abgeschlossen. Die Vorschau kann übernommen oder verworfen werden.',assistantReport:demo.report};
    }else{
     if(result.assistant.kind==='help'&&analysisRounds>=analysisLimit)throw Object.assign(Error('Hilfesuchlimit erreicht.'),{feedback:{retryable:false}});
     onActivity({de:result.assistant.kind==='help'?'Bedienhilfe nachschlagen …':'Bedienaktion ausführen …',en:result.assistant.kind==='help'?'Looking up program help …':'Running a program action …',showTools:result.assistant.kind==='guide'});
     const report=await access.programAssistant.execute(result.assistant,{isCurrent,expectedProviderId:access.expectedProviderId,projectCopy:practiceTask?access.practiceCopy?.projectCopy:undefined,practiceFiles:practiceTask?access.practiceFiles?.map(({photoEvidence,...file})=>file):undefined,recovery:practiceTask?(access.practiceVision?'image':'text'):undefined,continuationId:practiceContinuation,quality:practiceTask?access.practiceQuality:undefined});current();
     if(practiceTask&&report?.continuationId){
      const photoReview=report.report.checkpoint==='photo-review';
      const failureKey=JSON.stringify([report.reason,report.report.failedAction?.kind,report.report.failedAction?.target,report.report.confirmedCount]);
      if(attempt+1>=maxSteps||(!photoReview&&!report.report.review&&lastPracticeFailure===failureKey))throw Object.assign(Error(report.reason||'Übungsbudget ausgeschöpft.'),{code:'PRACTICE_FAILED',feedback:{retryable:false}});
      lastPracticeFailure=photoReview||report.report.review?undefined:failureKey;
      practiceContinuation=report.continuationId;practiceState=report.report.state;
      const {failedAction,confirmedCount,revision,dialog,quality,sketch}=report.report;
      practicePanel=dialog;
      for(const step of (Array.isArray(report.steps)?report.steps:[])){
       const boundary=step.drawing?'drawing-saved':step.photo?'photo-saved':step.reconstruction?'reconstruction-confirmed':null;
       if(boundary)confirmedPracticeSteps=[...confirmedPracticeSteps,{kind:boundary,revision,target:typeof step.target==='string'?step.target.slice(0,200):undefined}].slice(-12);
      }
      const confirmedDrawing=Array.isArray(report.steps)?report.steps.findLast(step=>step?.drawing)?.drawing:undefined;
      practiceAdvisory=report.report.review===true;
      if(quality)practiceChecks.push(quality);
      let imageStatus=access.practiceVision?'unavailable':'text-only';
      practiceImages=undefined;
      if(report.image){
       try{
        practiceImages=appendAIViewImages({...input,history:[]},{images:[{name:'Formnaro-Uebung-Zwischenstand.jpg',mimeType:'image/jpeg',dataUrl:'data:image/jpeg;base64,'+report.image}]});
        imageStatus='attached';
       }catch{}
      }
      if(photoReview&&(imageStatus!=='attached'||!report.report.photoDetail))
       throw Object.assign(Error('Die markierte Fotomessung konnte nicht zur Sichtprüfung übertragen werden.'),{code:'PRACTICE_PHOTO_REVIEW_UNAVAILABLE',feedback:{retryable:false}});
      const failure={execution:report.ok?'executed':confirmedCount?'partial':'unknown',failedAction,reason:report.reason,confirmedCount,exerciseRevision:revision,modelImage:imageStatus,...(sketch?{sketch}:{})};
      if(!practiceAdvisory&&!photoReview)practiceFailures.push(failure);
      correction=JSON.stringify({kind:photoReview?'practice-photo-review':practiceAdvisory?'practice-quality-advisory':quality?.blocked?'practice-quality-blocked':'practice-step-failed',
       ...failure,dialog,confirmedToolSteps:confirmedPracticeSteps,...(photoReview?{photoDetail:report.report.photoDetail}:{}),...(quality?{quality}:{}),...(confirmedDrawing?{confirmedDrawing}:{}),
       instruction:photoReview?'Review the marked crop. Original pixel = origin + crop pixel × originalPixelsPerImagePixel, per axis. Use original pixel coordinates for corrections. Then save the photo and finish remaining steps.':practiceAdvisory?'Advisory measurements do not block this result. Return a message to keep it or only the remaining visible actions to correct it.':
        'Continue in the same isolated window with only remaining supported actions. For a diagnosis or a confirmed limit, return only {"message":"explain the actual report"} and the exercise closes without an adoptable result.'+
        (confirmedDrawing?' “Blatt übernehmen” already saved the reported sheet in the exercise project. If all requested changes are present, finish with a visible view:fit action.':'')});
      if(photoReview)onActivity({de:'Markierte Fotomessung visuell prüfen …',en:'Reviewing the marked photo measurement …'});
      else if(practiceAdvisory)onActivity({de:'Optionale Messhinweise an die KI übermitteln …',en:'Sending advisory measurements …'});
      else onCorrection(++correctionAttempts,Object.assign(Error(report.reason),{code:quality?.blocked?'PRACTICE_QUALITY_BLOCKED':'PRACTICE_STEP_FAILED'}));
      continue;
     }
     if(result.assistant.kind==='practice'&&report?.ok!==true)throw Object.assign(Error(report?.reason||report?.message||'Die Übung wurde nicht abgeschlossen.'),{code:'PRACTICE_FAILED',feedback:{retryable:false}});
     if(result.assistant.kind==='help'){onAnalysis(++analysisRounds);analysisResults.push({programHelp:report});const stalled=progress.analysis([{engine:'app',kind:'help',options:{query:result.assistant.query}}],report);await observed(stalled?'stopped':'analysis');if(stalled)throw stalled;correction='';continue;}
     if(retained)return {...await finish(Error(result.message??'Die Bedienhilfe lieferte keinen verbesserten Entwurf.')),assistantReport:report,...(result.message?{message:result.message}:{})};
     return {...result,message:result.message??(result.assistant.kind==='note'?'Kontextnotiz ergänzt.':'Bedienhilfe abgeschlossen.'),assistantReport:summarizePractice(report)};
    }
   }
   if(result.review!==undefined){
    if(!visualInput||!retained||result.revision!==original.revision||result.review.previewId!==retained.proposal.previewId||result.review.accepted!==true||result.commands||result.checks||result.analysis)throw Object.assign(Error('Ungültige Antwort auf die Bildprüfung.'),{code:'AI_VISUAL_REVIEW_INVALID'});
    retained.proposal.visualReview={status:'reviewed',observations:String(result.review.observations??'').slice(0,4000),scope:'Qualitative Bildprüfung; Maße und verdeckte Geometrie werden dadurch nicht bewiesen.'};
    retained.result.message=String(result.review.observations??'').slice(0,4000);
    return await finish();
   }
   if(visualInput&&result.commands){
    if(qualityCorrections>=correctionLimit)return await finish(Error('Das Korrekturlimit der Bildprüfung ist erreicht.'));
    qualityCorrections++;retained.proposal.visualReview={status:'incomplete',reason:'Die Bildprüfung fordert eine Korrektur.',correctionRequested:true};onCorrection(++correctionAttempts,Object.assign(Error('Die Bildprüfung korrigiert den Entwurf.'),{code:'AI_VISUAL_CORRECTION'}));visualInput=null;
   }
   if(result.analysis!==undefined){
    if(result.revision!==original.revision)throw Object.assign(Error('Die Messanfrage verwendet einen alten Modellstand.'),{code:'STALE_REVISION'});
    if(result.commands||result.checks||analysisRounds>=analysisLimit||typeof access.analyze!=='function')throw Object.assign(Error('Das Messrundenlimit ist erreicht.'),{code:'AI_ANALYSIS_LIMIT',feedback:{retryable:false}});
    const requests=validateAIAnalysis(result.analysis),reportBudget=Math.min(14000,(extended?250000:30000)-JSON.stringify(analysisResults).length-JSON.stringify(requests).length);onAnalysis(++analysisRounds);
    const tools=requests.map(({kind,options})=>{
     const target=options?.target,objectId=typeof target==='string'?target:target?.rootId;
     const name=scene.objects?.find(object=>object.target?.rootId===objectId&&!object.target.path?.length)?.name;
     return {labels:analysisLabels[kind]??[kind,kind],name};
    });
    const describe=language=>tools.map(({labels,name})=>labels[language]+(name?' · '+name:'')).join(', ');
    onActivity({de:'Messung '+analysisRounds+' · '+describe(0),en:'Measurement '+analysisRounds+' · '+describe(1)});
    const nativeRequests=requests.filter(q=>q.engine!=='photo'),measured=nativeRequests.length?await access.analyze(nativeRequests,{reportBudget}):{results:[]};
    for(const q of requests.filter(q=>q.engine==='photo')){if(!photoTask)throw Error('Keine aktuelle kalibrierte Fotoreferenz.');measured.results.push(photoTask.analyze(q));}
    if(photoTask){const additions=photoTask.takeImages();if(additions.length){const packed=addPhotoImages(baseInput,[...photoTask.initialImages,...additions]);input={...input,images:packed.images};photoImageOmissions=packed.omitted;for(const r of measured.results)if(r.value?.imageName)r.value.imageSent=!packed.omitted.includes(r.value.imageName);}}
    current();
    const successfulRequests=requests.map(q=>{const program=measured.results?.find(r=>r.id===q.id)?.program;return program?{id:q.id,engine:q.engine,kind:q.kind,program}:q;});
    const next={requests:successfulRequests,...measured};compactAIAnalysisResult([...analysisResults,next],extended?256000:32000);analysisResults.push(next);const stalled=progress.analysis(requests,measured);if(!stalled)correction='';await observed(stalled?'stopped':'analysis');if(stalled)throw stalled;continue;
   }
   if(practiceAdvisory&&practiceContinuation&&!result.commands){
    const report=await access.programAssistant.acceptPractice(practiceContinuation,{isCurrent});current();
    return {...result,assistantReport:summarizePractice(report)};
   }
   if(!result.commands)return retained?await finish(Error(result.question||result.message||'Die Korrektur lieferte keinen neuen Entwurf.')):result;
   // Keep the first well-formed requirements through automatic correction.
   // An omitted/relaxed check must never turn a rejected result into a pass.
   if(!modelChecks){requiredChecks=[];result={...result,checks:[]};}
   else if(requiredChecks)result={...result,checks:structuredClone(requiredChecks)};
   else if(result.checks!==undefined){requiredChecks=selected(validateAIResultChecks(result.checks));result={...result,checks:structuredClone(requiredChecks)};}
   const label=result.label||'CAD';
   onActivity({de:'Vorschau berechnen · '+label,en:'Building preview · '+label});
   const proposal=preparedProposal??await access.preview({revision:result.revision,label:result.label,commands:result.commands,...(result.checks!==undefined?{checks:result.checks}:{})},{retainFailedChecks:true,modelCheckConfig:checkConfig??undefined});
   try{current();if(protectedSources.length){if(typeof access.getPreview!=='function')throw Object.assign(Error('Der native Vorschauzustand für den Auftragsschutz fehlt.'),{code:'AI_TASK_PROTECTION_UNAVAILABLE',feedback:{retryable:false}});verifyAITaskProtection(access.getPreview(proposal.previewId),protectedSources);}}catch(error){access.discard?.(proposal.previewId);throw error;}
   const preferRevision=previousView?.report.action==='candidate'&&(!modelChecks||compareAIQuality(aiCandidateQuality(proposal),aiCandidateQuality(retained.proposal))===0);
   if(!retained||preferRevision||compareAIQuality(aiCandidateQuality(proposal),aiCandidateQuality(retained.proposal))<0){try{await onCandidate(proposal);current();}catch(error){access.discard?.(proposal.previewId);throw error;}}
   if(modelChecks&&checkConfig?.freecad!==false&&typeof access.inspectFreeCADPreview==='function'){
    onActivity({de:'CAD-Geometrie mit FreeCAD prüfen …',en:'Checking CAD geometry with FreeCAD …'});
    try{proposal.independentCheck=await access.inspectFreeCADPreview(proposal.previewId);current();}
    catch(error){current();if(/STALE|ABORT|CANCEL/.test(error.code??''))throw error;proposal.independentCheck={status:'unavailable',reason:error.message};}
   }
   if(proposal.verification)proposal.verification.modellingPolicy=aiStrictnessDecision(proposal.verification,modelPolicy.strictness);
   // A later failed correction must not evict an already better usable draft.
   if(modelChecks&&checkConfig?.photo!==false&&photoTask){proposal.photoComparison=(await photoTask.compare(proposal.previewId,access.inspectPhotoPreview)).map(r=>({...r,previewId:proposal.previewId,revision:original.revision}));current();photoReports=proposal.photoComparison.map(({overlay,...report})=>report);}
   const candidateGeometry=typeof access.getPreview==='function'?aiCandidateGeometry(access.getPreview(proposal.previewId)):undefined;
   if(!retained||preferRevision||compareAIQuality(aiCandidateQuality(proposal),aiCandidateQuality(retained.proposal))<0){
    if(retained)access.discard?.(retained.proposal.previewId);retained={result,proposal};
   }else{access.discard?.(proposal.previewId);await onCandidate(retained.proposal);current();}
   if(!modelChecks){proposal.verification={version:1,checks:[],skipped:true,scope:'Normal mode without automatic model checks. No model-result verification performed.'};proposal.visualReview={status:'skipped',reason:'Normalmodus: automatische Modellprüfungen ausgeschaltet.'};if(result.view==='candidate'){viewFeedback=await getView('candidate',retained);continue;}return await finish();}
   progress.candidate(retained.proposal);
   if(proposal.verification?.passed===false&&!aiStrictnessDecision(proposal.verification,modelPolicy.strictness).accepted){
    const failures=proposal.verification.checks.filter(c=>c.passed===false),failed=failures[0];
    throw Object.assign(Error(failed.error.message),{code:failed.error.code,feedback:{...failed.feedback,message:failed.error.message,failures:failures.map(c=>aiFeedback({code:c.error.code,message:c.error.message,feedback:{...c.feedback,message:c.error.message}}))}});
   }
   if(proposal.independentCheck?.passed===false)throw Object.assign(Error('FreeCAD meldet ungültige Geometrie im STEP-Export.'),{code:'FREECAD_INVALID_RESULT',feedback:{geometryCheck:proposal.independentCheck}});
   if(modelPolicy.strictness>0&&proposal.photoComparison?.some(r=>r.matches===false)){
    const packed=addPhotoImages(baseInput,[...photoTask.initialImages,...proposal.photoComparison.flatMap(r=>r.overlay?[r.overlay]:[])]);input={...input,images:packed.images};photoImageOmissions=packed.omitted;
    throw Object.assign(Error('Fotovergleich: Kontur, Außenmaß oder sichtbare Öffnung weicht ab. Konstruktive Maße und Referenz erhalten.'),{code:'PHOTO_MISMATCH'});
   }
   const stalled=progress.proposed(candidateGeometry);if(stalled)throw stalled;
   if(result.view==='candidate'){viewFeedback=await getView('candidate',retained);continue;}
   if(modelPolicy.strictness>0&&visualReview&&typeof access.inspectPreview==='function'&&visualReviews<reviewLimit){
    visualReviews++;retained.proposal.visualReview={status:'pending'};correction='';await observed('candidate');
    try{
     onActivity({de:'Vorschauansichten für die Bildprüfung rendern …',en:'Rendering preview images for review …'});
     onVisualReview(visualReviews);const capture=await access.inspectPreview(retained.proposal.previewId);current();
     if(capture.previewId!==retained.proposal.previewId||capture.revision!==original.revision)throw Object.assign(Error('Bildvorschau ist veraltet.'),{code:'STALE_REVISION'});
     visualInput=visualReviewInput(input,retained.result,retained.proposal,capture);continue;
    }catch(error){current();if(/STALE|ABORT|CANCEL/.test(error.code??''))throw error;proposal.visualReview={status:'unavailable',reason:error.message};}
   }else if(checkConfig?.visual===false)proposal.visualReview={status:'skipped',reason:'KI-Bildprüfung in der Konfiguration ausgeschaltet.'};
   else if(typeof access.inspectPreview==='function')proposal.visualReview={status:'unavailable',reason:visualReview?'Bildprüflimit erreicht.':'Das gewählte Modell unterstützt keine automatische Bildprüfung.'};
   return await finish();
  }catch(error){
   if(!result&&error.aiUsage)onUsage(error.aiUsage,attempt);
   current();if(error.code==='AI_TASK_CHECKPOINT_FAILED')throw error;
   const interrupted=error.name==='AbortError'||/STALE|CANCEL|ABORT|BUSY/.test(error.code??'')||/abgebrochen|laufende|aktualisiert|cancel/i.test(error.message),stop=interrupted||aiFeedback(error).retryable===false||/TIMEOUT/.test(error.code??'')||/timed out/i.test(error.message);
   if(!interrupted&&error.code!=='AI_TASK_STALLED'){
    lastFailure=aiFeedback(error);taskEvidence.failed(attempt+1,error,result);const stalled=progress.failed(error,result);
    if(stalled){await observed('stopped');if(stalled!==error){stalled.message+=' Letzter Fehler: '+lastFailure.message;stalled.feedback.lastFailure=lastFailure;}if(retained)return await finish(stalled);throw stalled;}
   }
   const qualityFailure=isQualityFailure(error),limit=qualityFailure?correctionLimit:technicalRepairLimit,used=qualityFailure?qualityCorrections:technicalRepairs;
   if(stop||(!result&&!error.aiRetryable)||used>=limit){if(retained&&!interrupted)return await finish(error);if(!interrupted){correction=correctionFeedback(error,result);await observed('failure');}if(lastResult)error.aiResponse=lastResult;throw error;}
   correction=correctionFeedback(error,result);
   if(visualInput&&retained)retained.proposal.visualReview={status:'incomplete',reason:error.message};
   if(qualityFailure)qualityCorrections++;else technicalRepairs++;
   onCorrection(++correctionAttempts,error);await observed('failure');
  }
 }
 if(retained)return await finish(Object.assign(Error('Das Anfragelimit ist erreicht. Der letzte berechnete Entwurf bleibt mit seinen Prüfbefunden verfügbar.'),{code:'AI_ANALYSIS_LIMIT'}));
 throw Object.assign(Error('Die KI hat das Limit für Mess- und Korrekturrunden erreicht.'+(lastFailure?' Letzter Fehler: '+lastFailure.message:'')),{code:'AI_ANALYSIS_LIMIT',...(lastFailure?{feedback:{lastFailure}}:{})});
 }finally{if(retained)access.discard?.(retained.proposal.previewId);if(practiceTask)await access.programAssistant?.releasePractice?.();}
}
