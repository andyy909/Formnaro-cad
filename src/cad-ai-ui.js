import {openModelCheckSettings} from './ai-model-check-settings.js';
import {readModelCheckConfig} from './ai-model-check-config.js';
import {mountAITaskUI} from './cad-ai-task-ui.js';
import {cadAIRequestContext} from './cad-ai-program-context.js';
import {createAITaskJournal} from './cad-ai-task-journal.js';
import {requestAITask} from './cad-ai-task-desktop.js';
import {resolveFreeCADDocumentTarget} from './cad-freecad-target.js';
import {appendAIFeatureEdits,aiFeatureApplyLabel} from './cad-ai-feature-report.js';
import {cadAIFeatureScopeContext} from './cad-ai-feature-automation.js';
import {appendPhotoComparison} from './cad-photo-ui.js';
import {mountAIToolLibrary} from './cad-ai-tool-library-ui.js';
import {renderReasoningSelect} from './ai-reasoning-ui.js';
import {providerOptionLabel,providerAccessNote,providerCredentialLabel,renderProviderSummary} from './ai-provider-status.js';
import {mountChatGPTSettings} from './chatgpt-settings.js';
import {mountMistralSettings} from './mistral-settings.js';
import {mountTokenPricing} from './ai-token-pricing-ui.js';
import {createAIAgentChat} from './cad-ai-agent.js';
import {trackedAIAnalysis} from './cad-ai-analysis-access.js';
import {generateDesktopAI} from './ai-desktop-client.js';
import {mountPythonModelling,appendPythonResults} from './cad-python-ui.js';
import {appendMeshLidReports} from './cad-ai-lid-report.js';
import {appendAIIndependentCheck,appendAIVerification,aiVerificationText,aiProposalWarning} from './cad-ai-result-checks.js';
import {cadAIContext as aiContext} from './cad-ai-context.js';
import './ai.css';
import {runCadAIRequest} from './cad-ai-request.js';
import {createAIUsagePanel} from './cad-ai-meter.js';
import {compactAIRequestContext} from './cad-ai-task-evidence.js';
import './cad-ai-meter.css';
import {formatAIUsage,formatAIUsageCompact} from './cad-ai-usage.js';
import {readAIModelStrictness,readAIModelChecksEnabled,readAIModelLivePreviewEnabled,mountAIModelStrictness} from './ai-model-strictness.js';
import {createCadAIChat} from './cad-ai-chat.js';
import {inspectCadPracticeResult} from './cad-practice-project-copy.js';
export function createCadAIUI({access,capturePracticeCopy,getPracticeQuality,prepareSketchPracticePreview,modal,download,captureCanvas,language,showPreview,clearPreview,settingsOpen,programAssistant,photoStore,featureStore,openTaskBasis,cancelComputation=()=>{}}){
 const banner=document.createElement('div');banner.className='ai-preview-banner cad-ai-preview-banner';banner.id='cad-ai-preview-banner';banner.hidden=true;banner.innerHTML='<span></span><button id="cad-ai-preview-take-current" hidden>So übernehmen</button><button id="cad-ai-preview-apply" class="primary"></button><button id="cad-ai-preview-discard">Verwerfen</button>';document.getElementById('viewport')?.append(banner);
 banner.querySelector('#cad-ai-preview-take-current').onclick=takeCurrent;banner.querySelector('#cad-ai-preview-apply').onclick=apply;banner.querySelector('#cad-ai-preview-discard').onclick=discard;
 const desktop=window.offlinecadDesktop;let pending=null,requestRunning=false,takingCurrent=false,runningCandidate=null,currentRequestDone=Promise.resolve(),promptText='',commandText='',message='',chat,requestGeneration=0,previewBuilding=false,analysisBuilding=false,usageAttempts=[],pythonText='',pythonRunning=false,pendingExperience=null,memoryWarned=false,taskUI,pendingTask=null,agentUI,agentRunning=false;
 const el=id=>document.getElementById(id);const say=(text,error=false)=>{message=text;chat?.status(text,error);const e=el('ai-message')||el('ai-settings-message');if(e){e.textContent=text;e.classList.toggle('ai-error',error);}};
 const practiceGuards=new WeakMap();
 const practiceCard=document.createElement('div');
 practiceCard.id='ai-chat-practice-result';practiceCard.className='ai-chat-proposal-copy';practiceCard.hidden=true;
 let practiceResult;
 function forgetPracticeResult(){
  const result=practiceResult;practiceResult=undefined;
  practiceCard.replaceChildren();practiceCard.hidden=true;
  if(result)void desktop.practiceProjectResult({action:'discard',id:result.id}).catch(()=>{});
 }
 function offerPracticeResult(copy,report){
  forgetPracticeResult();
  practiceResult={copy,id:report.resultRef,revision:report.report.revision};
  const title=document.createElement('p');
  title.textContent='Die Übung ist abgeschlossen. Du kannst die Änderungen an der Kopie ansehen.';
  const review=document.createElement('button'),discardResult=document.createElement('button');
  review.type=discardResult.type='button';
  review.id='ai-chat-practice-review';review.textContent='Änderungen ansehen';
  discardResult.textContent='Verwerfen';discardResult.onclick=forgetPracticeResult;
  review.onclick=reviewPracticeResult;
  practiceCard.append(title,review,discardResult);
  if(report.report.quality?.items.length){
   const details=document.createElement('details'),summary=document.createElement('summary'),list=document.createElement('ul');
   summary.textContent='Optionale Ergebnisprüfungen';
   const labels={passed:'bestanden',failed:'abweichend',skipped:'übersprungen',unavailable:'nicht verfügbar','not-applicable':'nicht anwendbar'};
   for(const item of report.report.quality.items){
    const row=document.createElement('li');
    row.textContent=item.id+' · '+labels[item.status]+(item.reason?' · '+item.reason:'');
    list.append(row);
   }
   details.append(summary,list);practiceCard.append(details);
  }
  practiceCard.hidden=false;
 }
 function displayProposal(result){
  const parts=result.practiceDelta?.parts;
  return parts?showPreview(result,parts.filter(part=>part.status!=='removed').map(part=>part.id),parts.filter(part=>part.status!=='added').map(part=>part.id)):showPreview(result);
 }
 async function readPracticeDelta({copy,id,revision}){
  copy.assertBase();
  const value=await desktop.practiceProjectResult({action:'read',id});
  copy.assertBase();
  return inspectCadPracticeResult(copy.projectCopy,value,revision);
 }
 async function reviewPracticeResult(){
  const saved=practiceResult;
  if(!saved||requestRunning||pythonRunning||agentRunning||takingCurrent)return;
  takingCurrent=true;buttons();
  let proposal;
  try{
   const delta=await readPracticeDelta(saved);
   if(!delta.parts.length&&!delta.sections.length){forgetPracticeResult();say('Die Übung hat keine Modelländerung erzeugt.');return;}
   proposal=await access.restoreCandidate({project:delta.project,result:{label:'Änderungen aus der Übung'}},{
    revision:saved.copy.projectCopy.revision,replacingPreviewId:pending?.previewId
   });
   saved.copy.assertBase();
   if(pending)await discard({keepTask:true});
   proposal.practiceDelta={parts:delta.parts,sections:delta.sections};
   practiceGuards.set(proposal,saved.copy.assertBase);
   forgetPracticeResult();showResult(proposal);
  }catch(error){
   if(proposal)access.discard(proposal.previewId);
   if(error.code==='STALE_REVISION')forgetPracticeResult();
   say(error.message,true);
  }finally{takingCurrent=false;buttons();}
 }
 const usagePanel=createAIUsagePanel({desktop,getContext:()=>compactAIRequestContext({...access.context?.()??aiContext(),...(programAssistant?{programAssistant:programAssistant.context()}:{})}),language,onExchangeChange:()=>chat?.setUsage(formatAIUsage(usageAttempts,language()),formatAIUsageCompact(usageAttempts,language()))});
 const experienceKinds=new Set(['size','bounds','solids','volume','clearance','bore','radialClearance','surfaceDeviation','wallThickness','distance','position']);
 const experienceTools=new Set(['create','update','delete','group','duplicate','transform','sketch','modeling','profileModeling','tool','mesh','script','python','parameter','drawing','contour','joint','feature']);
 function recordExperience(outcome,value={}){if(!desktop?.recordAIExperience)return;const entry={outcome,tools:[...new Set((value.commands??[]).map(c=>c.op).filter(t=>experienceTools.has(t)))],checks:[...new Set((value.checks??[]).map(c=>c.kind).filter(k=>experienceKinds.has(k)))]};if(/^[A-Z][A-Z0-9_]{0,79}$/.test(value.code??''))entry.code=value.code;if(experienceKinds.has(value.feedback?.checkKind))entry.checkKind=value.feedback.checkKind;void desktop.recordAIExperience(entry).catch(()=>{if(!memoryWarned){memoryWarned=true;chat?.feedback('Modelliererfahrung konnte nicht gespeichert werden. Das Modell und die Vorschau sind davon unabhängig.');}});}
 const readContext=()=>{const attached=chat?.state().featureReferences??[],scope=attached.length?featureStore.scope(attached):undefined;return JSON.stringify({contract:{...(access.context?.()??aiContext()),...(scope?{featureScope:cadAIFeatureScopeContext(featureStore.project(),scope)}:{})},scene:access.scene()},null,2);};
 async function copy(text){try{await navigator.clipboard.writeText(text);say(language()==='en'?'Copied.':'Kopiert.');}catch{download(text,'Formnaro-KI-Kontext.json','application/json');}}
 function buttons(){const busy=requestRunning||pythonRunning||agentRunning||takingCurrent;practiceCard.querySelectorAll('button').forEach(button=>button.disabled=busy);banner.querySelectorAll('button').forEach(button=>button.disabled=busy);const take=banner.querySelector('#cad-ai-preview-take-current');take.hidden=!requestRunning;take.disabled=takingCurrent||!requestRunning||!(runningCandidate||access.hasRunningPreview?.());chat?.setBusy(busy);taskUI?.setBusy(busy);if(el('ai-generate'))el('ai-generate').disabled=busy;if(el('ai-cancel'))el('ai-cancel').disabled=!requestRunning;for(const id of ['ai-python-preview','ai-python-example','ai-python-code','ai-check'])if(el(id))el(id).disabled=busy;if(el('ai-python-cancel'))el('ai-python-cancel').disabled=!pythonRunning;}
 function showResult(result){pending=result;
 const dependencies=!!result.report?.featureDependencies?.requiresAcceptance,failed=result.verification?.passed===false,warning=aiProposalWarning(result)||(dependencies&&result.warnings?.length?result.warnings[0]:''),english=language()==='en';banner.querySelector('span').textContent=failed?(english?'Preview with errors · red: affected parts / measured samples':'Vorschau mit Fehlern · Rot: betroffene Teile / gemessene Stellen'):warning?(english?'Preview with warning · see AI chat':'Vorschau mit Warnung · siehe KI-Chat'):(english?'AI preview · model unchanged':'KI-Vorschau · Modell unverändert');banner.querySelector('#cad-ai-preview-apply').textContent=dependencies?aiFeatureApplyLabel(result,language()):failed?(english?'Apply with errors':'Mit Fehlern übernehmen'):warning?(english?'Apply with warning':'Mit Warnung übernehmen'):(english?'Apply':'Übernehmen');banner.querySelector('#cad-ai-preview-discard').textContent=english?'Discard':'Verwerfen';banner.classList.toggle('has-errors',failed||!!warning);banner.hidden=false;
 void Promise.resolve().then(()=>pending===result?displayProposal(result):undefined).catch(error=>say(error.message,true));chat?.setProposal(result);const root=el('ai-result');if(!root)return;root.replaceChildren();const title=document.createElement('strong');title.textContent=result.label;title.dataset.noTranslate='';root.append(title);const p=document.createElement('p');p.textContent=language()==='en'?`${result.changes.length} commands · ${result.scene.objects.length} shapes including sources`:`${result.changes.length} Befehle · ${result.scene.objects.length} Formen einschließlich Quellen`;root.append(p);appendAIFeatureEdits(root,result.report);appendAIVerification(root,result.verification,result.scene,language());appendAIIndependentCheck(root,result,language());if(result.visualReview){const v=document.createElement('p');v.textContent=result.visualReview.status==='reviewed'?'KI-Bildprüfung: '+result.visualReview.observations:'KI-Bildprüfung nicht abgeschlossen: '+(result.visualReview.reason??result.visualReview.status);root.append(v);}appendMeshLidReports(root,result.report,language());appendPhotoComparison(root,result.photoComparison);appendPythonResults(root,result.report);if(result.correctionError){const error=document.createElement('p');error.className='ai-error';error.textContent=(language()==='en'?'Last correction: ':'Letzte Korrektur: ')+result.correctionError.message;root.append(error);}for(const warning of result.warnings||[]){const w=document.createElement('p');w.textContent=warning;w.className='ai-error';root.append(w);}const table=document.createElement('table');const header=document.createElement('tr');for(const text of ['Teil','Maße (mm)','Volumen (mm³)']){const cell=document.createElement('th');cell.textContent=text;header.append(cell);}table.append(header);for(const part of result.after){const object=result.scene.objects.find(n=>n.id===part.id),row=document.createElement('tr');for(const [i,text]of [part.name,object.worldBounds.size.map(x=>Number(x.toFixed(3)).toLocaleString(language()==='en'?'en-US':'de-DE',{useGrouping:false,maximumFractionDigits:3})).join(' × '),Number.isFinite(part.volume)?Number(part.volume.toFixed(3)).toLocaleString(language()==='en'?'en-US':'de-DE',{useGrouping:false,maximumFractionDigits:3}):'—'].entries()){const cell=document.createElement('td');cell.textContent=text;if(i===0)cell.dataset.noTranslate='';row.append(cell);}table.append(row);}root.append(table);const details=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');summary.textContent='Befehle anzeigen';pre.textContent=commandText;pre.dataset.noTranslate='';details.append(summary,pre);root.append(details);const actions=document.createElement('div');actions.className='modal-actions';for(const [id,text,action]of [['ai-preview-canvas','Auf Fläche ansehen',()=>{showPreview(result);el('modal').close();}],['ai-apply',dependencies?aiFeatureApplyLabel(result,language()):result.verification?.passed===false?(language()==='en'?'Apply with errors':'Mit Fehlern übernehmen'):warning?(english?'Apply with warning':'Mit Warnung übernehmen'):'Änderungen übernehmen',apply],['ai-discard','Verwerfen',discard]]){const b=document.createElement('button');b.id=id;b.textContent=text;b.onclick=action;if(id==='ai-apply')b.className='primary';actions.append(b);}root.append(actions);}
 async function apply(){
  if(!pending||requestRunning||pythonRunning||agentRunning||takingCurrent)return;
  takingCurrent=true;buttons();
  const resetProposal=()=>{clearPreview();pending=null;chat?.setProposal(null);banner.hidden=true;el('ai-result')?.replaceChildren();};
  try{
   const guard=practiceGuards.get(pending);
   guard?.();
   const request={previewId:pending.previewId,revision:pending.revision,
    ...((pending.report?.featureDependencies?.requiresAcceptance||pending.report?.requiresFreeCADAcceptance)?{acceptFeatureDependencies:true}:{}),
    ...(pending.verification?.passed===false?{acceptFailedChecks:true}:{})};
   const before=guard?access.applyState(request):null;
   let result,recovered=false;
   try{result=await access.apply(request);}
   catch(error){
    if(!before)throw error;
    const after=access.applyState(request);
    if(after.receipt){result=after.receipt;recovered=true;}
    else if(after.revision!==before.revision||after.undo!==before.undo){
     access.discard(request.previewId);pendingExperience=null;resetProposal();
     const text=language()==='en'?'Apply status is unclear. The project changed during the request. Check the current model and Undo history.':'Übernahmestatus unklar. Das Projekt hat sich während des Auftrags geändert. Prüfe das aktuelle Modell und den Rückgängig-Verlauf.';
     chat?.feedback(text,true);say(text,true);return;
    }else throw error;
   }
   const record=pendingTask;pendingTask=null;
   let journalWarning;
   if(record)try{await requestAITask(desktop,{action:'resolve',id:record.id,generation:record.generation,binding:record.binding,status:'applied'});}
   catch(error){journalWarning='Modell übernommen; Auftragsstatus konnte nicht gespeichert werden: '+error.message;}
   if(pendingExperience)recordExperience('applied',pendingExperience);
   pendingExperience=null;resetProposal();
   const text=recovered?(language()==='en'?'Changes applied. The local receipt confirms the completed step.':'Änderungen übernommen. Der lokale Übernahmebeleg bestätigt den ausgeführten Schritt.'):
    (language()==='en'?'Changes applied. Undo restores the entire batch.':'Änderungen übernommen. Rückgängig setzt die gesamte Änderung zurück.');
   chat?.feedback(text);say(text);
   if(journalWarning){chat?.feedback(journalWarning,true);say(journalWarning,true);}
   return result;
  }catch(error){chat?.feedback((language()==='en'?'Apply failed. ':'Übernehmen fehlgeschlagen. ')+error.message,true);say(error.message,true);}
  finally{takingCurrent=false;buttons();}
 }
 async function discard({keepTask=false}={}){const record=pendingTask;pendingTask=null;pendingExperience=null;if(pending){access.discard?.(pending.previewId);clearPreview();chat?.feedback(language()==='en'?'Proposal discarded; its commands were not applied.':'Vorschlag verworfen; seine Befehle wurden nicht übernommen.');}pending=null;chat?.setProposal(null);banner.hidden=true;if(el('ai-result'))el('ai-result').replaceChildren();say(language()==='en'?'Proposal discarded.':'Vorschlag verworfen.');if(record&&!keepTask)try{await requestAITask(desktop,{action:'resolve',id:record.id,generation:record.generation,binding:record.binding,status:'discarded'});}catch(error){chat?.feedback('Vorschau verworfen; Auftragsstatus konnte nicht gespeichert werden: '+error.message,true);}}
 async function validate(){try{if(pending)await discard({keepTask:true});commandText=el('ai-commands').value;const request=JSON.parse(commandText),references=chat?.state().featureReferences??[],featureScope=references.length?featureStore.scope(references):undefined,result=await access.preview(request,{retainFailedChecks:true,featureScope});showResult(result);say(aiVerificationText(result.verification,language()),result.verification?.passed===false);}catch(e){say(e.message,true);}}
 async function previewPython(code){
  if(requestRunning||pythonRunning)return;
  if(pending)await discard({keepTask:true});pythonRunning=true;previewBuilding=true;buttons();say('Python berechnet eine Modellvorschau …');
  try{const request={revision:access.scene().revision,label:'Python-Modellierung',commands:[{op:'python',code}]};commandText=JSON.stringify(request,null,2);if(el('ai-commands'))el('ai-commands').value=commandText;const attached=chat?.state().featureReferences??[],featureScope=attached.length?featureStore.scope(attached):undefined,result=await access.preview(request,{retainFailedChecks:true,featureScope});showResult(result);say('Python-Vorschau berechnet. Übernehmen ändert das Modell.');}
  catch(error){say(error.message,true);}
  finally{pythonRunning=false;previewBuilding=false;buttons();}
 }
 async function requestAI(input,{saved,restoreOnly=false,sketchPractice}={}){
  if(saved)input=structuredClone(saved.input);
  if(featureStore?.state())throw Error('Merkmalsauswahl zuerst abschließen oder schließen.');const attached=input.featureReferences??(!input.chat?chat?.state().featureReferences:[])??[],featureScope=attached.length?featureStore.scope(attached):undefined;const {featureReferences,chatMode,practiceFiles,...providerInput}=input;if(chatMode==='help'&&featureScope)throw Error(language()==='en'?'Switch to AI chat to work with attached feature references.':'Für angehängte Merkmalsbezüge bitte auf KI-Chat umschalten.');input={...providerInput,...(!saved?{modelStrictness:readAIModelStrictness(),modelChecks:readAIModelChecksEnabled(),modelCheckConfig:readModelCheckConfig()}:{}),usageTaskId:saved?input.usageTaskId:crypto.randomUUID()};const storedInput={...input,featureReferences:structuredClone(attached)};
  if(requestRunning||pythonRunning)throw Error('Eine KI-Anfrage oder Python-Berechnung läuft bereits.');if(!desktop)throw Error('API-Anfragen stehen in der Windows-Anwendung zur Verfügung.');
  const practiceText=String(input.prompt??'');if((input.practiceFromProject||practiceFiles?.length)&&featureScope)throw Error('Für eine Projektübung bitte die Merkmalsanhänge entfernen.');const practiceRequested=!featureScope&&(input.practiceFromProject===true||!!practiceFiles?.length||/übungsmodus|uebungsmodus|übungsprojekt|uebungsprojekt|übungsfenster|uebungsfenster|practice mode|practice project|practice window/i.test(practiceText)||/(?:zeig|vorführ|vorfuehr|demonstrier).*(?:aufbau|baue|bauen|konstru|modelliere|modellieren|erstelle|erstellen)/i.test(practiceText)&&!/menü|menue|menu|einstellungen/i.test(practiceText));const guideOnly=chatMode==='help'&&!featureScope&&!practiceRequested;const programOnly=!featureScope&&(guideOnly||practiceRequested||!!programAssistant?.isProgramQuestion(input.prompt));if(pending&&!programOnly)await discard({keepTask:true});const ticket=++requestGeneration;requestRunning=true;runningCandidate=null;let finishRequest;currentRequestDone=new Promise(resolve=>finishRequest=resolve);buttons();if(input.chat&&!programOnly)chat?.focusWhileWorking();
  usageAttempts=[];memoryWarned=false;chat?.setUsage('');let journal,outcome,intermediateVisible=false;
  try{
   const practiceCopy=input.practiceFromProject===true?await capturePracticeCopy({allowEmpty:!!practiceFiles?.length,draft:sketchPractice?.draft}):undefined;
   const configured=await desktop.getAISettings(),requestConfig={authMode:configured.authMode||'api-key',protocol:configured.protocol,baseUrl:configured.baseUrl,model:configured.model,reasoningEffort:configured.reasoningEffort,openAIReasoningEffort:configured.openAIReasoningEffort||'auto',mistralReasoningEffort:configured.mistralReasoningEffort||'auto',providerReasoningEffort:configured.providerReasoningEffort||'auto',maxOutputTokens:configured.maxOutputTokens??null};
   const catalog=typeof desktop.getAIModels==='function'?await desktop.getAIModels({refresh:false}):null,vision=catalog?.models?.find(m=>m.id===configured.model)?.vision;
   const freecadAvailable=typeof desktop.getFreeCADStatus==='function'&&(await desktop.getFreeCADStatus()).available;
   const requirements=programOnly?undefined:saved?.requirements??taskUI.requirements(input.prompt),maxSteps=saved?.maxSteps??configured.agentSteps??24;
   if(!programOnly){journal=createAITaskJournal({request:args=>requestAITask(desktop,args),access,isCurrent:()=>ticket===requestGeneration});await journal.begin({input:storedInput,requirements,maxSteps,featureScope:featureScope?cadAIFeatureScopeContext(featureStore.project(),featureScope):undefined,saved,restoreOnly});}
   outcome=await runCadAIRequest({requirements,maxSteps,onActivity:({de,en,showTools})=>{if(showTools)chat?.showTools();const message=language()==='en'?en:de;if(input.chat)chat?.reportActivity(message);else say(message);},onCandidate:async proposal=>{runningCandidate=proposal;buttons();if(!readAIModelLivePreviewEnabled()||ticket!==requestGeneration)return;intermediateVisible=true;banner.hidden=false;banner.querySelector('span').textContent=language()==='en'?'AI intermediate preview · work in progress · model unchanged':'KI-Zwischenstand · noch in Arbeit · Modell unverändert';banner.querySelectorAll('button').forEach(button=>button.disabled=true);buttons();try{await showPreview({...proposal,aiInProgress:true});}catch(error){say(error.message,true);}},...(saved?.checkpoint?{resume:saved.checkpoint}:{}),restoreOnly,onProgress:journal&&!restoreOnly?value=>journal.checkpoint(value):undefined,input:{...input,requestConfig},generate:args=>generateDesktopAI(desktop,args),visualReview:vision!==false,onVisualReview:()=>say(language()==='en'?'AI is checking the preview images …':'KI prüft die Vorschauansichten …'),access:{project:access.project,getPreview:access.getPreview,captureTaskRuntime:access.captureTaskRuntime,restoreTaskRuntime:access.restoreTaskRuntime,restoreCandidate:(saved,options)=>access.restoreCandidate(saved,{...options,modelCheckConfig:input.modelCheckConfig}),beginTask:access.beginTask,scene:access.scene,programAssistant,expectedProviderId:configured.providerId,programOnly,guideOnly,practiceRequested,practiceCopy,practiceFiles,practiceQuality:practiceRequested?getPracticeQuality?.():undefined,practiceVision:vision===true,restrictedFeatures:!!featureScope,sceneForAI:!programOnly&&typeof access.sceneForAI==='function'?()=>access.sceneForAI(input.sceneScope):undefined,context:options=>cadAIRequestContext({...access.context?.()??aiContext(),localEngines:{freecad:freecadAvailable},...(featureScope?{featureScope:cadAIFeatureScopeContext(featureStore.project(),featureScope)}:{}),...(programAssistant?{programAssistant:programAssistant.context()}:{})},options),inspectFreeCADPreview:freecadAvailable&&typeof access.inspectFreeCADPreview==='function'?id=>access.inspectFreeCADPreview(id):undefined,fitView:access.fitView,screenshot:access.screenshot,confirmedScreenshot:access.confirmedScreenshot,inspectPhotoPreview:access.inspectPhotoPreview,inspectPreview:typeof access.inspectPreview==='function'?async id=>{previewBuilding=true;try{return await access.inspectPreview(id);}finally{previewBuilding=false;}}:undefined,analyze:trackedAIAnalysis((requests,options)=>access.analyze(requests,{...options,allowIntermediate:true}),value=>{analysisBuilding=value;}),preview:async (request,options)=>{previewBuilding=true;try{return await access.preview(request,{...options,modelCheckConfig:input.modelCheckConfig,featureScope,allowIntermediate:true});}finally{previewBuilding=false;}},discard:access.discard},isCurrent:()=>ticket===requestGeneration,onUsage:usage=>{usageAttempts.push(usage);chat?.setUsage(formatAIUsage(usageAttempts,language()),formatAIUsageCompact(usageAttempts,language()));},onAnalysis:round=>say(language()==='en'?`Measuring model (${round}) …`:`Modell wird vermessen (${round}) …`),onCorrection:(attempt,error)=>{recordExperience('rejected',error);say(language()==='en'?`Correcting proposal (${attempt}) …`:`Vorschlag wird korrigiert (${attempt}) …`);}});
   if(journal){const status=restoreOnly?(saved.status==='running'?'interrupted':saved.status):outcome.taskProgress?.stop||outcome.proposal?.correctionError?.code==='AI_ANALYSIS_LIMIT'?'stopped':'review';const record=await journal.close(status);pendingTask=outcome.proposal?record:null;}
   const {proposal,...result}=outcome;if(proposal){const failure=proposal.verification?.checks?.find(c=>c.passed===false);pendingExperience={...result,...(failure?{code:failure.error.code,feedback:failure.feedback}:proposal.independentCheck?.passed===false?{code:'FREECAD_INVALID_RESULT'}:{})};recordExperience(failure||proposal.independentCheck?.passed===false?'rejected':'preview',pendingExperience);}
   if(proposal){commandText=JSON.stringify({revision:result.revision,label:result.label,commands:result.commands,...(result.checks!==undefined?{checks:result.checks}:{})},null,2);if(el('ai-commands'))el('ai-commands').value=commandText;showResult(proposal);}
   if(practiceCopy&&outcome.assistantReport?.resultRef){
    const report=outcome.assistantReport;
    if(sketchPractice)sketchPractice.saved={copy:practiceCopy,id:report.resultRef,revision:report.report.revision};
    else offerPracticeResult(practiceCopy,report);
   }
   intermediateVisible=false;
   return {...result,...(proposal?{verification:proposal.verification,photoComparison:proposal.photoComparison}:{})};
  }catch(error){if(intermediateVisible||!programOnly){clearPreview();banner.hidden=!pending;}if(outcome?.proposal){access.discard?.(outcome.proposal.previewId);pendingTask=null;}if(journal){try{await journal.close(journal.lastCheckpoint()?.progress.stop?'stopped':'interrupted');}catch(saveError){error.message+=' · Auftragsablage: '+saveError.message;}}recordExperience('rejected',error);throw error;}finally{previewBuilding=false;analysisBuilding=false;requestRunning=false;runningCandidate=null;buttons();finishRequest?.();}
 }
 async function startSketchPractice(prompt,draft){
  if(agentRunning||takingCurrent)throw Error('Laufenden KI-Auftrag zuerst abschließen.');
  const session={draft};
  const answer=await requestAI({prompt,practiceFromProject:true,featureReferences:[]},{sketchPractice:session});
  const saved=session.saved;
  if(!saved)return {message:answer.question||answer.message};
  let proposal=null,released=false;
  const release=()=>{
   if(released)return;
   released=true;
   if(proposal)access.discard(proposal.previewId);
   proposal=null;
   void desktop.practiceProjectResult({action:'discard',id:saved.id}).catch(()=>{});
  };
  const current=()=>{
   if(released)throw Error('Die Skizzenübung ist beendet.');
   saved.copy.assertBase();
  };
  return {
   message:answer.message,release,
   async review(){
    current();
    if(proposal)return proposal;
    const delta=await readPracticeDelta(saved);
    const original=draft.data.target?.rootId,part=delta.parts[0];
    const matches=original?part?.id===original&&part.status==='changed':part?.status==='added';
    if(!delta.parts.length&&!delta.sections.length)throw Error('Die Übung hat keine Modelländerung erzeugt.');
    if(delta.parts.length!==1||!matches||delta.sections.length||
      delta.project.nodes.find(node=>node.id===part.id)?.recipe?.type!=='sketch'){
     throw Error('Das Übungsergebnis muss ausschließlich die native Skizze ändern.');
    }
    const prepared=await prepareSketchPracticePreview(delta.project,saved.copy.projectCopy.revision);
    try{current();}catch(error){access.discard(prepared.previewId);throw error;}
    proposal={...prepared,practiceDelta:{parts:delta.parts,sections:delta.sections}};
    return proposal;
   },
   async apply(){
    current();
    if(!proposal)throw Error('Zuerst die Änderungen ansehen.');
    const result=await access.apply({previewId:proposal.previewId,revision:proposal.revision,
     ...(proposal.report?.featureDependencies?.requiresAcceptance?{acceptFeatureDependencies:true}:{})});
    release();
    return result;
   }
  };
 }
 async function generate(){if(requestRunning)return;promptText=el('ai-prompt').value;say(language()==='en'?'AI is computing a proposal …':'KI berechnet einen Vorschlag …');try{const result=await requestAI({prompt:promptText});say(result.question||result.message||(language()==='en'?'Proposal calculated. Apply it to change the model.':'Vorschlag berechnet. Übernehmen ändert das Modell.'));}catch(e){say(e.message,true);}}

 async function takeCurrent(){
  if(!requestRunning||takingCurrent)return;const build=access.captureRunningPreview?.(),project=build?.project??(runningCandidate?access.getPreview?.(runningCandidate.previewId):null);if(!project)return;
  const saved={project,proposal:{aliases:build?.aliases??runningCandidate?.aliases??{}},result:{label:'KI-Zwischenstand: so übernommen'}},revision=build?.revision??runningCandidate.revision,done=currentRequestDone;takingCurrent=true;buttons();
  try{await cancelRequest();await done;clearPreview();banner.hidden=true;
   if(access.scene().revision!==revision)throw Error('Das Modell wurde geändert. Den alten Zwischenstand nicht übernehmen.');
   const proposal=await access.restoreCandidate(saved,{checks:[],revision});await access.apply({previewId:proposal.previewId,revision,acceptFeatureDependencies:true});pending=null;pendingTask=null;chat?.setProposal(null);clearPreview();banner.hidden=true;
   chat?.feedback('KI gestoppt. Der bisher berechnete Zwischenstand wurde ungeprüft übernommen; der Auftrag kann unvollständig sein. Einmal Rückgängig setzt die Übernahme zurück.');say('Zwischenstand übernommen. KI-Bearbeitung beendet.');
  }catch(error){chat?.feedback(error.message,true);say(error.message,true);}finally{takingCurrent=false;buttons();}
 }
 function cancelRequest(){programAssistant?.cancel();requestGeneration++;if(previewBuilding||analysisBuilding)cancelComputation();return desktop?.cancelAI();}
 function open(){modal('KI-Werkstatt',`<div class="ai-intro">Neue Teile beschreiben oder bestehende Teile bearbeiten. Die KI erhält den aktuellen Modellzustand und den vollständigen Werkzeugkontext.</div><p id="ai-workshop-features" class="ai-feature-scope-note"></p><button id="ai-workshop-feature-open" type="button">Merkmalsbezüge wählen</button><label class="ai-label">Auftrag<textarea id="ai-prompt" rows="3" placeholder="Zum Beispiel: Erstelle eine 60 × 40 × 6 mm Platte mit vier 5-mm-Bohrungen."></textarea></label><p class="small-note">Beim Senden werden Auftrag, Objektnamen, Maße, Formparameter und automatische Vorschauansichten an deinen eingestellten KI-Anbieter übertragen. Die CAD-Bedienung und lokale Befehle funktionieren weiterhin offline.</p><div class="ai-controls"><button id="ai-generate" class="primary">Vorschlag erzeugen</button><button id="ai-cancel">Abbrechen</button><button id="ai-open-settings">API-Einstellungen</button></div><p id="ai-message" role="status"></p><div id="ai-result"></div><details ${commandText?'open':''}><summary>JSON-Befehle / externe KI</summary><p class="small-note">Kontext an eine andere KI geben, ihre JSON-Befehle hier einsetzen und prüfen. Dafür ist kein API-Schlüssel erforderlich.</p><div class="ai-controls"><button id="ai-context-copy">Kontext kopieren</button><button id="ai-context-save">Kontext speichern</button><button id="ai-template">Befehlsbeispiel</button></div><textarea id="ai-commands" rows="9" spellcheck="false" aria-label="JSON-Befehle"></textarea><button id="ai-check">Befehle prüfen</button></details>`);el('modal').classList.add('ai-modal');{const strictnessHost=document.createElement('div');el('ai-prompt').closest('label').before(strictnessHost);mountAIModelStrictness(strictnessHost,{id:'ai-workshop-strictness',language});}const attached=chat?.state().featureReferences??[];el('ai-workshop-features').textContent=attached.length?'Änderungsbereich: '+attached.map(r=>r.name).join(' · '):'Keine Merkmalsbezüge angehängt. Allgemeiner Modellkontext.';el('ai-workshop-feature-open').disabled=!featureStore;el('ai-workshop-feature-open').onclick=()=>{el('modal').close();void featureStore?.open();};el('ai-prompt').value=promptText;el('ai-commands').value=commandText;el('ai-prompt').oninput=()=>promptText=el('ai-prompt').value;el('ai-commands').oninput=()=>commandText=el('ai-commands').value;el('ai-generate').onclick=generate;el('ai-cancel').onclick=()=>Promise.resolve(cancelRequest()).catch(e=>say(e.message,true));el('ai-open-settings').onclick=()=>settingsOpen();el('ai-context-copy').onclick=()=>copy(readContext());el('ai-context-save').onclick=()=>download(readContext(),'Formnaro-KI-Kontext.json','application/json');el('ai-template').onclick=()=>{const context=(access.context?.()??aiContext());commandText=JSON.stringify({revision:access.scene().revision,...context.examples[0]},null,2);el('ai-commands').value=commandText;};el('ai-check').onclick=validate;mountAIToolLibrary({anchor:el('ai-result'),desktop,download,getPython:()=>el('ai-python-code')?.value??pythonText,loadPython:code=>{pythonText=code;if(el('ai-python-code'))el('ai-python-code').value=code;}});mountPythonModelling({anchor:el('ai-result'),value:pythonText,onChange:value=>pythonText=value,preview:previewPython,cancel:()=>cancelComputation()});say(message);buttons();if(pending)showResult(pending);}
 async function mountSettings(root){if(!root)return;const el=id=>root.querySelector('#'+id);root.innerHTML='<p class="small-note">ChatGPT-Abo oder einen API-Anbieter auswählen. API-Schlüssel bei Bedarf selbst eintragen. Lokale Modelle und externe KI-Steuerung benötigen keinen Cloud-Schlüssel.</p><label class="dialog-label">API-Format<select id="ai-protocol"><option value="responses">OpenAI Responses</option><option value="chat">OpenAI-kompatibles Chat-API</option></select></label><label class="dialog-label">API-Basisadresse<input id="ai-base" type="url" spellcheck="false"></label><label class="dialog-label">Modellkennung<input id="ai-model" spellcheck="false" placeholder="Modellkennung deines Anbieters"></label><label class="dialog-label">DeepSeek-Denkstufe<select id="ai-effort"><option value="low">low · Einfach</option><option value="high">high · Standard</option><option value="max">max · Gründlich</option></select></label><label class="dialog-label">Antwortbudget (Tokens)<input id="ai-output-tokens" type="number" min="1" max="393216" step="1"></label><p class="small-note" id="ai-budget-note">DeepSeek: Standard 131.072, maximal 393.216 Tokens einschließlich Denkschritten. Das ist eine Obergrenze; kürzere Antworten bleiben möglich.</p><label class="dialog-label">API-Schlüssel<input id="ai-key" type="password" autocomplete="new-password" placeholder="Schlüssel hier eintragen"></label><label class="check-line"><input type="checkbox" id="ai-remember"> Schlüssel verschlüsselt auf diesem PC merken</label><p class="small-note" id="ai-key-state"></p><div class="ai-controls"><button id="ai-save-settings" class="primary">API-Einstellungen speichern</button><button id="ai-test">Verbindung testen</button><button id="ai-clear-key">Schlüssel entfernen</button></div><label class="check-line"><input type="checkbox" id="ai-bridge-enabled"> Lokale KI-Schnittstelle aktivieren</label><p class="small-note">Nur auf diesem Computer erreichbar. Die Verbindungsdatei enthält den Zugriffstoken; externe KI-Werkzeuge können damit Kontext, Modelle und Befehle verwenden.</p><p id="ai-bridge-state" class="small-note" data-no-translate></p><div class="ai-controls"><button id="ai-copy-connection">Verbindungsdateipfad kopieren</button><button id="ai-static-context">Werkzeugkontext speichern</button></div><p id="ai-settings-message" role="status"></p>';
  const checkSettings=document.createElement('button');checkSettings.id='ai-settings-model-checks';checkSettings.type='button';checkSettings.textContent=language()==='en'?'Model checks · Normal mode / Check mode…':'Modellprüfungen · Normalmodus / Prüfmodus …';checkSettings.onclick=()=>{try{if(requestRunning||pythonRunning||agentRunning)throw Error('Laufenden Auftrag zuerst abschließen.');openModelCheckSettings({language});}catch(e){say(e.message,true);}};root.prepend(checkSettings);
  const providerLabel=document.createElement('label');providerLabel.className='dialog-label ai-provider-label';providerLabel.textContent='KI-Anbieter';const providerSelect=document.createElement('select');providerSelect.id='ai-settings-provider';providerLabel.append(providerSelect);root.insertBefore(providerLabel,root.children[1]);const providerSummary=document.createElement('details');providerSummary.id='ai-saved-providers';const summaryTitle=document.createElement('summary');summaryTitle.textContent='Gespeicherte Zugänge / bereits eingerichtet';const summaryBody=document.createElement('div');providerSummary.append(summaryTitle,summaryBody);providerLabel.after(providerSummary);usagePanel.mount(root,el('ai-protocol').closest('label'));
  if(!desktop){root.querySelectorAll('input,select,button').forEach(e=>e.disabled=true);el('ai-static-context').disabled=false;el('ai-static-context').onclick=()=>download(JSON.stringify((access.context?.()??aiContext()),null,2),'Formnaro-KI-Werkzeugkontext.json','application/json');el('ai-settings-message').textContent='API-Anfragen stehen in der Windows-Anwendung zur Verfügung.';return;}
  const memory=document.createElement('section');memory.innerHTML='<h3>Modelliergedächtnis</h3><p class="small-note">Hinweise und vergangene Prüfergebnisse werden bei neuen KI-Aufträgen mitgegeben. Die Markdown-Datei kannst du bearbeiten; Formnaro protokolliert zusätzlich Fehlertypen, bestandene Vorschauen und Übernahmen. Das ersetzt keine Prüfung eines neuen Teils.</p><p id="ai-modeling-context-state" class="small-note" data-no-translate></p><button id="ai-modeling-context-folder">Kontextordner öffnen</button>';root.append(memory);el('ai-modeling-context-folder').onclick=()=>desktop.openAIContextFolder?.().catch(e=>{el('ai-modeling-context-state').textContent=e.message;});
  const reasoningLabel=document.createElement('label');reasoningLabel.className='dialog-label';reasoningLabel.innerHTML='Denkaufwand / Reasoning<select id="ai-openai-effort"></select><span id="ai-reasoning-note" class="small-note"></span>';el('ai-model').closest('label').after(reasoningLabel);let reasoningTicket=0;
  const agentLabel=document.createElement('label');agentLabel.className='dialog-label';agentLabel.innerHTML='KI-Arbeitsschritte pro Auftrag<input id="ai-agent-steps" type="number" min="7" max="80" step="1"><span class="small-note">Standard: 24. Die KI kann wiederholt messen und verbessern. Mehr Schritte können länger dauern und mehr Tokens verbrauchen.</span>';reasoningLabel.after(agentLabel);
  const freecadState=document.createElement('p');freecadState.className='small-note';freecadState.id='ai-freecad-status';freecadState.textContent='CAD-Laufzeit wird geprüft …';agentLabel.after(freecadState);void desktop.getFreeCADStatus?.().then(s=>{freecadState.textContent=s.available?(s.bundled?'Integrierte CAD-Laufzeit verfügbar · FreeCAD '+s.version:'Externe FreeCAD-Laufzeit verfügbar: '+s.executable)+(s.pythonAPI?' · vollständige Python-API für Modellierung und Prüfung':'')+(s.toolLibrary?(s.toolLibrary.available?' · Werkzeugbibliothek bereit':' · Werkzeugbibliothek nicht bereit: '+s.toolLibrary.message):''):(s.error??'CAD-Laufzeit nicht verfügbar. Formnaro vollständig neu entpacken.');}).catch(()=>{freecadState.textContent='CAD-Laufzeitstatus konnte nicht gelesen werden.';});
  const exportFreeCAD=document.createElement('button');exportFreeCAD.id='ai-freecad-export';exportFreeCAD.textContent='FreeCAD-Quelldokument des ausgewählten Teils speichern';freecadState.after(exportFreeCAD);exportFreeCAD.onclick=()=>{try{const selection=access.scene().selectionTargets??[],target=selection.length===1?selection[0]:null,node=target?resolveFreeCADDocumentTarget(access.project(),target).node:null,source=node?.metadata?.freecadSource;if(!source)throw Error('Ein mit FreeCAD erstelltes CAD-Teil auswählen.');download(Uint8Array.from(atob(source.documentBase64),c=>c.charCodeAt(0)),node.name.replace(/[^a-zA-Z0-9äöüÄÖÜß _-]/g,'_')+'.FCStd','application/octet-stream');}catch(error){say(error.message,true);}};
  async function refreshReasoning(s){const ticket=++reasoningTicket,select=el('ai-openai-effort');reasoningLabel.hidden=false;const initial=renderReasoningSelect(select,s,null,language());el('ai-reasoning-note').textContent=initial.note;select.disabled=true;try{const catalog=await desktop.getAIModels({refresh:false});if(!root.isConnected||ticket!==reasoningTicket||config!==s)return;const fresh=await desktop.getAISettings();if(!root.isConnected||ticket!==reasoningTicket||config!==s||fresh.providerId!==s.providerId)return;renderProviderSummary(summaryBody,fresh,language());providerSelect.replaceChildren();for(const p of fresh.providers||[])providerSelect.add(new Option(providerOptionLabel(p,language()),p.id));providerSelect.value=fresh.providerId;const view=renderReasoningSelect(select,s,catalog.models.find(m=>m.id===s.model),language());select.disabled=!view.adjustable;el('ai-reasoning-note').textContent=view.note;}catch{el('ai-reasoning-note').textContent='Modellfähigkeiten konnten nicht geladen werden. Automatisch verwendet den Modellstandard.';select.disabled=select.options.length<2;}}
  const research=document.createElement('div');research.innerHTML='<label class="check-line"><input type="checkbox" id="ai-web-research"> Webrecherche erlauben</label><p id="ai-web-research-note" class="small-note"></p>';el('ai-bridge-enabled').closest('label').before(research);
  let config;const login=mountChatGPTSettings({root,desktop,onChange:async()=>{refresh(await desktop.getAISettings());void chat?.refreshModels();}}),mistralLogin=mountMistralSettings({root,desktop,onChange:async()=>{refresh(await desktop.getAISettings());void chat?.refreshModels();}});el('ai-protocol').add(new Option('Anthropic Messages','messages'));const providerNote=document.createElement('p');providerNote.id='ai-provider-setup-note';providerNote.className='small-note';el('ai-base').closest('label').after(providerNote);const providerDocs=document.createElement('button');providerDocs.type='button';providerDocs.textContent='Dokumentation des Anbieters';providerDocs.onclick=()=>desktop.openAIProviderDocs().catch(e=>say(e.message,true));providerNote.after(providerDocs);const priceSettings=mountTokenPricing({root,getModel:()=>el('ai-model').value.trim()});function refresh(s){config=s;el('ai-web-research').checked=s.webResearchAllowed===true;el('ai-web-research').disabled=false;el('ai-web-research-note').textContent=s.authMode==='mistral-vibe'?'Gilt für diesen Anbieter im normalen Chat und Agenten-Chat. Erlaubt Mistrals Websuche mit Quellen; keine PC-, Datei- oder Browserbedienung. Suchanfragen gehen an Mistral und können weiteres Kontingent verbrauchen. Bei ausgeschaltetem Schalter wird das Suchwerkzeug entfernt.':'Gilt für diesen Anbieter im normalen Chat und Agenten-Chat. Erlaubt eine öffentliche Websuche mit Quellen; Suchanfragen gehen an Bing, die Treffer an den gewählten KI-Anbieter. Keine PC-, Datei- oder Browserbedienung. Ausgeschaltet erfolgen keine Suchaufrufe.';void usagePanel.refresh();el('ai-agent-steps').value=String(s.agentSteps??24);if(!root.isConnected)return;login.refresh(s);mistralLogin.refresh(s);priceSettings.refresh(s);providerNote.textContent=providerAccessNote(s,language());renderProviderSummary(summaryBody,s,language());void refreshReasoning(s);const plan=['chatgpt','mistral-vibe'].includes(s.authMode);for(const id of ['ai-protocol','ai-base','ai-key','ai-remember','ai-output-tokens','ai-effort']){el(id).disabled=plan;el(id).closest('label').hidden=plan;}el('ai-key-state').hidden=plan;el('ai-budget-note').hidden=plan;el('ai-clear-key').hidden=plan;el('ai-save-settings').textContent=plan?'KI-Einstellungen speichern':'API-Einstellungen speichern';const mem=s.modelingContext;el('ai-modeling-context-state').textContent=mem?['Eigener Kontext für '+(s.providers?.find(p=>p.id===s.providerId)?.label||s.providerId),mem.notesFile,mem.journalFile,mem.warning||`${mem.entries??0} zusammengefasste Erfahrungen`].join('\n'):'';providerSelect.replaceChildren();for(const p of s.providers||[])providerSelect.add(new Option(providerOptionLabel(p,language()),p.id));providerSelect.value=s.providerId||'';el('ai-protocol').value=s.protocol;el('ai-base').value=s.baseUrl;el('ai-model').value=s.model;el('ai-effort').value=s.reasoningEffort??'high';el('ai-output-tokens').value=String(s.maxOutputTokens??s.outputBudget??(new URL(s.baseUrl).hostname==='api.deepseek.com'?131072:12000));el('ai-effort').disabled=new URL(s.baseUrl).hostname!=='api.deepseek.com';el('ai-effort').closest('label').hidden=true;el('ai-remember').checked=s.rememberKey;el('ai-remember').disabled=plan||!s.canRememberKey;el('ai-bridge-enabled').checked=s.bridgeEnabled;el('ai-key-state').textContent=providerCredentialLabel(s.providers.find(p=>p.id===s.providerId)||{},language())+(s.hasKey?' · Schlüsselfeld leer lassen zum Beibehalten.':'');el('ai-bridge-state').textContent=s.bridge.enabled?s.bridge.url+'\n'+s.bridge.connectionFile:s.bridge.connectionFile;}
  try{refresh(await desktop.getAISettings());}catch(e){if(root.isConnected)el('ai-settings-message').textContent=e.message;return;}if(!root.isConnected)return;
  const status=(text,error=false)=>{if(!root.isConnected)return;el('ai-settings-message').textContent=text;el('ai-settings-message').classList.toggle('ai-error',error);};
  async function save(clearKey=false){try{const unchanged=el('ai-model').value.trim()===config.model&&el('ai-base').value.trim()===config.baseUrl,chosen=unchanged?el('ai-openai-effort').value:'auto';const next={authMode:config.authMode||'api-key',protocol:el('ai-protocol').value,baseUrl:el('ai-base').value.trim(),model:el('ai-model').value.trim(),agentSteps:Number(el('ai-agent-steps').value),reasoningEffort:new URL(config.baseUrl).hostname==='api.deepseek.com'&&unchanged?chosen:config.reasoningEffort,openAIReasoningEffort:new URL(config.baseUrl).hostname==='api.openai.com'?(chosen||'auto'):(config.openAIReasoningEffort||'auto'),mistralReasoningEffort:new URL(config.baseUrl).hostname==='api.mistral.ai'?(chosen||'auto'):(config.mistralReasoningEffort||'auto'),providerReasoningEffort:chosen||'auto',maxOutputTokens:config.authMode!=='api-key'?null:Number(el('ai-output-tokens').value),rememberKey:config.authMode!=='api-key'?false:el('ai-remember').checked,bridgeEnabled:el('ai-bridge-enabled').checked,webResearchAllowed:el('ai-web-research').checked,customPricing:priceSettings.read(el('ai-model').value.trim())};refresh(await desktop.saveAISettings({config:next,key:config.authMode!=='api-key'?'':el('ai-key').value,clearKey}));if(root.isConnected)el('ai-key').value='';void chat?.refreshModels();status(language()==='en'?'AI settings saved.':'KI-Einstellungen gespeichert.');return true;}catch(e){status(e.message,true);return false;}}
  el('ai-model').addEventListener('input',()=>{priceSettings.modelChanged();reasoningTicket++;renderReasoningSelect(el('ai-openai-effort'),{...config,openAIReasoningEffort:'auto',mistralReasoningEffort:'auto',providerReasoningEffort:'auto'},null,language());el('ai-openai-effort').disabled=true;});
  providerSelect.onchange=async()=>{providerSelect.disabled=true;try{refresh(await desktop.selectAIProvider({providerId:providerSelect.value}));if(root.isConnected)el('ai-key').value='';void chat?.refreshModels();}catch(e){status(e.message,true);refresh(config);}finally{providerSelect.disabled=false;}};
  el('ai-save-settings').onclick=()=>save();el('ai-clear-key').onclick=()=>save(true);el('ai-bridge-enabled').onchange=()=>save();el('ai-web-research').onchange=async()=>{if(!await save())el('ai-web-research').checked=config.webResearchAllowed===true;};el('ai-test').onclick=async()=>{if(!await save())return;status(language()==='en'?'Testing connection …':'Verbindung wird geprüft …');try{const result=await desktop.testAI();status((language()==='en'?'Connection successful. Models: ':'Verbindung erfolgreich. Modelle: ')+result.models.slice(0,12).join(', '));}catch(e){status(e.message,true);}};el('ai-copy-connection').onclick=()=>copy(config.bridge.connectionFile);el('ai-static-context').onclick=()=>download(readContext(),'Formnaro-KI-Kontext.json','application/json');
 }
 chat=createCadAIChat({getSelection:access.chatSelection,canPracticeFromProject:!!capturePracticeCopy&&!!desktop?.startPractice,featureStore,photoStore,captureCanvas,download,host:document.querySelector('.right-panel'),language,onSend:requestAI,onCancel:cancelRequest,onApply:apply,onDiscard:discard,onPreview:async()=>{if(pending)await displayProposal(pending);},onWorkshop:open,onSettings:settingsOpen});
 el('ai-chat-proposal').before(practiceCard);
 taskUI=mountAITaskUI({host:document.querySelector('#ai-chat-model-options'),request:args=>requestAITask(desktop,args),getScene:access.scene,language,onError:error=>{chat.feedback(error.message,true);say(error.message,true);},onResume:record=>requestAI(record.input,{saved:record}),onRestore:record=>requestAI(record.input,{saved:record,restoreOnly:true}),onOpenBasis:async record=>{if(requestRunning||pythonRunning)throw Error('Laufenden Auftrag zuerst abschließen.');if(pending)await discard({keepTask:true});if(!openTaskBasis)throw Error('Auftragsbasis kann hier nicht geöffnet werden.');if(await openTaskBasis(record.basis,record.binding))chat.feedback('Gespeichertes Auftragsmodell und Auswahl geöffnet. Fortsetzen in der Auftragsliste wählen.');}});
 agentUI=createAIAgentChat({host:document.querySelector('#ai-chat-model-options'),desktop,onSettings:settingsOpen,onProviderChange:()=>chat.refreshModels(),onBusy:value=>{agentRunning=value;buttons();},isBusy:()=>requestRunning||pythonRunning||!!pending});
 return {openAgent:()=>agentUI.open(),startSketchPractice,cancelRequest,taskUI,tasks:args=>requestAITask(desktop,args),open,mountSettings,apply,discard,isBusy:()=>requestRunning||pythonRunning||agentRunning||takingCurrent,refreshRunningPreview:buttons,openChat:chat.open,openProjectPhotos:chat.openProjectPhotos,chat,previewCleared:()=>{banner.hidden=true;},dispose:()=>{forgetPracticeResult();agentUI.dispose();taskUI.dispose();banner.remove();Promise.resolve(cancelRequest()).catch(()=>{});chat.dispose();}};
}
