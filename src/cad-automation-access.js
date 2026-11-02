import {inspectionStatus} from './cad-inspection-state.js';
import {cadChangeSummary,compactCadChangeResponse} from './cad-change-summary.js';
import {cadCommandReference,compactCadContext,selectCadScene} from './cad-command-reference.js';
import {aiFeedback} from './ai-feedback.js';
import {aiStrictnessDecision} from './ai-model-strictness.js';
import {selectModelChecks,validateModelCheckConfig} from './ai-model-check-config.js';
import {AGENT_UI_CONTRACT} from './cad-agent-ui-policy.js';
import {validateCadAssemblyRequest} from './cad-assembly-automation.js';
import {previewCadFreeCADRerunCommands,cadFreeCADRerunCatalog} from './cad-freecad-rerun-automation.js';
import {captureAITaskBasis} from './cad-ai-task-basis.js';
import {previewCadJointCommands,cadJointsSummary} from './cad-joints-automation.js';
import {cadAIContext} from './cad-ai-context.js';
import {validateAIResultChecks} from './cad-ai-result-checks.js';
import {validateAIAnalysis} from './cad-ai-analysis.js';
import {exportCadProjectSvg} from './cad-svg-export.js';
import {previewCadDrawingCommands,exportCadDrawing,cadDrawingPreviewSummary} from './cad-drawing-automation.js';
import {previewCadContourCommands,cadContourLinksSummary} from './cad-linked-contours-automation.js';
import {previewCadProjectParameterCommands,cadProjectParametersSummary,cadProjectParameterCatalogSummary} from './cad-project-parameters-automation.js';
import {previewCadAIFeatureCommands} from './cad-ai-feature-automation.js';
import {previewCadLinkedPatternCommands,cadLinkedPatternsSummary} from './cad-linked-pattern-automation.js';
function base64(bytes){let text='';for(let i=0;i<bytes.length;i+=16384)text+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(text);}
const measurements=scene=>scene.objects.filter(n=>!n.target.path.length&&!n.hidden&&(n.kind==='mesh'||n.kind==='cad'&&n.solid)).map(n=>({id:n.id,name:n.name,kind:n.kind,objectType:n.objectType,volume:n.volume,measures:n.measures}));
export function createCadAutomationAccess({controller,getSelection=()=>[],getScene=()=>null,getFonts=()=>undefined,refresh=async()=>{},onSave,onCommit=()=>{},screenshot=()=>'',isBusy=()=>false,getModelChecksEnabled=()=>true,getModelCheckConfig=()=>undefined,getLivePreviewEnabled=()=>true,printDrawingPdf,getAssemblyDisplay=()=>null,setAssemblyDisplay,onUI,onDiscardPreview=()=>{}}={}){
  const results=new Map(),checking=new Set(),receipts=new Map();
  function discard(id){results.delete(id);const result=controller.discard(id);onDiscardPreview(id);return result;}
  function discardRequest(request){
    if(!request||Object.keys(request).some(k=>!['previewId','revision'].includes(k))||typeof request.previewId!=='string'||!request.previewId||request.previewId.length>200||typeof request.revision!=='string'||!request.revision||request.revision.length>200)throw Error('Ungültiger Vorschau-Verwerfauftrag.');
    if(request.revision!==controller.revision())throw Object.assign(Error('Die Vorschau gehört zu einem anderen Modellstand.'),{code:'STALE_REVISION'});
    if(checking.has(request.previewId))throw Object.assign(Error('Die Vorschau wird noch geprüft.'),{code:'BUSY'});
    const proposal=controller.getPreview(request.previewId);if(!proposal||proposal.revision!==request.revision)throw Object.assign(Error('Die fertige Vorschau ist nicht mehr verfügbar.'),{code:'PREVIEW_MISSING'});
    discard(request.previewId);return {discarded:true,previewId:request.previewId,revision:request.revision};
  }
  async function saveRequest(request){
    if(!onSave)throw Object.assign(Error('Direkte Speicherung ist hier nicht verfügbar.'),{code:'SAVE_UNAVAILABLE'});
    if(!request||Object.keys(request).some(k=>!['revision','filename','format'].includes(k))||typeof request.revision!=='string'||!request.revision||request.filename!==undefined&&(typeof request.filename!=='string'||request.filename.length>220||/[<>:"/\\|?*\x00-\x1f]/.test(request.filename)||!/^.+\.(ocad|fnpack)$/i.test(request.filename))||request.format!==undefined&&!['ocad','fnpack'].includes(request.format))throw Error('Ungültiger direkter Speicherauftrag.');
    if(request.revision!==controller.revision())throw Object.assign(Error('Modell vor der Speicherung geändert.'),{code:'STALE_REVISION'});
    return onSave(structuredClone(request));
  }
  async function analysisRequest(request){
    const reportBudget=request?.reportBudget===undefined?14000:request.reportBudget;
    if(!request||Object.keys(request).some(k=>!['revision','queries','reportBudget'].includes(k))||typeof request.revision!=='string'||!request.revision||!Number.isSafeInteger(reportBudget)||reportBudget<1024||reportBudget>32000)throw Error('Ungültiger externer Messauftrag.');
    if(request.revision!==controller.revision())throw Object.assign(Error('Die Messung gehört zu einem anderen Modellstand.'),{code:'STALE_REVISION'});
    const queries=validateAIAnalysis(request.queries);if(queries.some(q=>!['cad','mesh','app'].includes(q.engine)))throw Error('Extern nur native CAD-, Mesh- und App-Messungen verwenden.');
    const report=await analyze(queries,{reportBudget});
    if(request.revision!==controller.revision())throw Object.assign(Error('Modell während der Messung geändert.'),{code:'STALE_REVISION'});
    return report;
  }
  async function verifyPreview(id,checks,retainFailedChecks,config){
    const verification=checks.length?await controller.checkPreview(id,checks,{collectFailures:!!config||retainFailedChecks}):{version:1,checks:[],scope:'No additional result checks supplied.',...(config?.mode==='normal'||!config&&getModelChecksEnabled()===false?{skipped:true}:{})};
    if(config){verification.configuration=structuredClone(config);verification.modellingPolicy=aiStrictnessDecision(verification,config.strictness);verification.excludedKinds=Object.keys(config.checks).filter(k=>config.mode==='normal'||!config.checks[k]);if(verification.passed===false&&!retainFailedChecks&&!verification.modellingPolicy.accepted){const failed=verification.checks.find(c=>c.passed===false);throw Object.assign(Error(failed.error?.message??'Modellprüfung fehlgeschlagen.'),{code:failed.error?.code??'AI_RESULT_MISMATCH',feedback:failed.feedback});}}
    return verification;
  }
  const beginTask=()=>controller.beginAITask?.();
  const fullContext=()=>({...cadAIContext(getFonts()),modelCheckPolicy:{enabled:getModelChecksEnabled()!==false,...(getModelCheckConfig()?{configuration:getModelCheckConfig()}:{}),instructions:getModelChecksEnabled()===false?'Normal mode: automatic model checks are disabled. Do not reject or retry model quality, dimensions, volume, body count or appearance. Preview skips automatic result checks. Keep executable commands, source protections, revision checks and Formnaro-only access.':'Check mode: only the enabled check kinds in configuration are run; disabled checks are not evidence. FreeCAD/photo/visual switches control the built-in AI workflow.'},...(onUI?{agentUI:{...AGENT_UI_CONTRACT,available:true}}:{})});
  const analyze=async(requests,{allowIntermediate=false,...options}={})=>{if(isBusy({allowIntermediate}))throw Error('Die laufende Bearbeitung zuerst abschließen.');return controller.analyze(requests,options);};
  function context(args={}){if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!['profile','programHelpOnly'].includes(k))||args.programHelpOnly!==undefined&&typeof args.programHelpOnly!=='boolean'||args.profile!==undefined&&!['full','compact'].includes(args.profile))throw Object.assign(Error('Kontextprofil full oder compact wählen.'),{code:'INVALID_CONTEXT_PROFILE'});const value=fullContext();return args.profile==='compact'?compactCadContext(value):{...value,profile:'full'};}
  function scene(){const value=getScene();if(!value||value.revision!==controller.revision())throw Object.assign(Error('Die native CAD-Szene wird aktualisiert.'),{code:'STALE_REVISION'});const selectionTargets=structuredClone(getSelection()),project=controller.snapshot?.();return {...structuredClone(value),inspection:inspectionStatus(controller.readSnapshot?.()??controller.snapshot()),selection:selectionTargets.map(target=>target.rootId),selectionTargets,...(project?{linkedPatterns:cadLinkedPatternsSummary(project)}:{}),...(getAssemblyDisplay()?{assemblyDisplay:structuredClone(getAssemblyDisplay())}:{})};}
  async function preview(request,{retainFailedChecks=false,featureScope,allowIntermediate=false,modelCheckConfig=getModelCheckConfig()}={}){
    if(isBusy({allowIntermediate}))throw Error('Die laufende Bearbeitung zuerst abschließen oder abbrechen.');
    if(!request||Object.keys(request).some(k=>!['revision','label','commands','checks','intermediateDisplay','responseDetail'].includes(k)))throw Error('Ungültige CAD-Befehlsanfrage.');
    if(request.responseDetail!==undefined&&!['summary','full'].includes(request.responseDetail))throw Error('Antwortumfang summary oder full wählen.');
    const summaryBefore=controller.readSnapshot?.()??controller.snapshot();
    if(request.intermediateDisplay!==undefined&&!['inherit','final'].includes(request.intermediateDisplay))throw Error('Zwischenanzeige: inherit oder final wählen.');
    const config=modelCheckConfig?validateModelCheckConfig(modelCheckConfig):null,modelChecks=config?config.mode==='checked':getModelChecksEnabled()!==false,checks=modelChecks?selectModelChecks(validateAIResultChecks(request.checks),config):[],revision=request.revision,label=request.label,commands=structuredClone(request.commands);
    if(featureScope?.items.length&&commands?.some(c=>c?.op!=='feature'))throw Object.assign(Error('Dieser Auftrag ist auf die angehängten Merkmalsbezüge begrenzt. Nur feature-Befehle sind zulässig.'),{code:'AI_FEATURE_SCOPE_VIOLATION',feedback:{retryable:true}});
    if(commands?.some(c=>c?.op==='inspection')){if(commands.length!==1||checks.length)throw Error('Prüfstand separat ohne geometrische Ergebnischecks ändern.');const {op,...change}=commands[0],proposal=await controller.previewInspection(change,{revision,label:label??'Prüfstand speichern'}),response={previewId:proposal.previewId,revision,label:proposal.label,aliases:{},changes:proposal.changes,warnings:proposal.warnings??[],inspection:inspectionStatus(proposal.project),verification:{status:'not-requested'}};response.summary=cadChangeSummary(summaryBefore,proposal.project,response);results.set(proposal.previewId,response);while(results.size>10){const expired=results.keys().next().value;results.delete(expired);controller.discard(expired);}return response;}
    if(commands?.length===1&&commands[0]?.op==='joint'){let proposal;try{proposal=await previewCadJointCommands(controller,{commands,revision,label:label??'KI-Gelenke',livePreview:getLivePreviewEnabled(),intermediateDisplay:request.intermediateDisplay});checking.add(proposal.previewId);const verification=await verifyPreview(proposal.previewId,checks,retainFailedChecks,config);if(controller.revision()!==revision)throw Object.assign(Error('Modell während der Gelenkvorschau geändert.'),{code:'STALE_REVISION'});const response={previewId:proposal.previewId,revision:proposal.revision,label:proposal.label,aliases:{},changes:proposal.changes??[],warnings:proposal.warnings??[],joints:cadJointsSummary(proposal.project),jointReport:proposal.jointReport,displayPlacements:proposal.jointReport?.placements??[],verification,scope:'Display-matrix-only motion preview; native measurements require explicit result checks or collision query.'};response.summary=cadChangeSummary(summaryBefore,proposal.project,{...response});results.set(proposal.previewId,response);while(results.size>10){const expired=results.keys().next().value;results.delete(expired);controller.discard(expired);}return structuredClone(compactCadChangeResponse(response,response.summary,request.responseDetail??'full'));}catch(error){if(proposal)controller.discard(proposal.previewId);throw error;}finally{if(proposal)checking.delete(proposal.previewId);}}
    const before=await controller.describe();let proposal;
    try{
      proposal=commands?.some(c=>c?.op==='joint')?await previewCadJointCommands(controller,{commands,revision,label,livePreview:getLivePreviewEnabled(),intermediateDisplay:request.intermediateDisplay}):commands?.some(c=>c?.op==='freecadRerun')?await previewCadFreeCADRerunCommands(controller,{commands,revision,label}):commands?.some(c=>c?.op==='linkedPattern')?await previewCadLinkedPatternCommands(controller,{commands,revision,label:label??'KI-Körpermuster'}):commands?.some(c=>c?.op==='feature')?await previewCadAIFeatureCommands(controller,{commands,revision,label,references:featureScope}):commands?.some(c=>c?.op==='contour')?await previewCadContourCommands(controller,{commands,revision,label:label??'KI-Konturverknüpfung'}):commands?.some(c=>c?.op==='parameter')?await previewCadProjectParameterCommands(controller,{commands,revision,label:label??'KI-Projektmaße'}):commands?.some(c=>c?.op==='drawing')?await previewCadDrawingCommands(controller,{commands,revision,label:label??'KI-Zeichnungsänderung'}):await controller.preview({kind:'batch',commands},{revision,label:label??'KI-Modelländerung',livePreview:getLivePreviewEnabled(),intermediateDisplay:request.intermediateDisplay});checking.add(proposal.previewId);
      const verification=await verifyPreview(proposal.previewId,checks,retainFailedChecks,config),after=await controller.describe(proposal.project),response={previewId:proposal.previewId,revision:proposal.revision,label:proposal.label,aliases:proposal.aliases,changes:proposal.changes,warnings:proposal.warnings,before:measurements(before),after:measurements(after),scene:after,verification,...(commands?.some(c=>c?.op==='linkedPattern')?{linkedPatterns:cadLinkedPatternsSummary(proposal.project)}:{}),...(commands?.some(c=>c?.op==='parameter')?{parameters:cadProjectParametersSummary(proposal.project),parameterReport:proposal.parameterReport??proposal.report}:{}),...(commands?.some(c=>c?.op==='drawing')?{drawings:cadDrawingPreviewSummary(proposal.project)}:{}),...(commands?.some(c=>c?.op==='contour')?{contourLinks:cadContourLinksSummary(proposal.project),contourReport:proposal.contourReport??proposal.report}:{}),...(proposal.drawingReport?{drawingReport:proposal.drawingReport}:{}),...(proposal.report?{report:proposal.report}:{}),...(proposal.jointReport?{joints:cadJointsSummary(proposal.project),jointReport:proposal.jointReport,displayPlacements:proposal.jointReport.placements??[]}: {})};
      if(controller.revision()!==revision)throw Object.assign(Error('Das CAD-Modell wurde während der Ergebnisprüfung geändert.'),{code:'STALE_REVISION'});
      response.summary=cadChangeSummary(summaryBefore,proposal.project,{...response});results.set(proposal.previewId,response);while(results.size>10){const expired=results.keys().next().value;results.delete(expired);controller.discard(expired);}return structuredClone(compactCadChangeResponse(response,response.summary,request.responseDetail??'full'));
    }catch(error){if(proposal)controller.discard(proposal.previewId);throw error;}finally{if(proposal)checking.delete(proposal.previewId);}
  }
  async function restoreCandidate(saved,{checks=[],revision=controller.revision(),modelCheckConfig=getModelCheckConfig()}={}){
    if(isBusy())throw Object.assign(Error('Laufende Bearbeitung zuerst abschließen.'),{code:'BUSY'});
    const config=modelCheckConfig?validateModelCheckConfig(modelCheckConfig):null,modelChecks=config?config.mode==='checked':getModelChecksEnabled()!==false;checks=modelChecks?selectModelChecks(validateAIResultChecks(checks),config):[];const before=await controller.describe(),summaryBefore=controller.readSnapshot?.()??controller.snapshot();let proposal;
    try{
      proposal=await controller.restoreAITaskCandidate(saved.project,{revision,label:saved.result?.label??'Gespeicherter KI-Entwurf',aliases:saved.proposal?.aliases??{}});checking.add(proposal.previewId);
      const verification=await verifyPreview(proposal.previewId,checks,true,config),after=await controller.describe(proposal.project);
      if(controller.revision()!==revision)throw Object.assign(Error('Modell während der Wiederherstellung geändert.'),{code:'STALE_REVISION'});
      const response={previewId:proposal.previewId,revision,label:proposal.label,aliases:proposal.aliases,changes:[{op:'restore',label:'Gespeicherter Entwurf erneut geprüft'}],warnings:proposal.warnings??[],before:measurements(before),after:measurements(after),scene:after,verification,report:proposal.report,visualReview:{status:'incomplete',reason:'Gespeicherte Bildprüfung nach Wiederherstellung erneut bestätigen.'}};
      response.summary=cadChangeSummary(summaryBefore,proposal.project,{...response});results.set(proposal.previewId,response);while(results.size>10){const expired=results.keys().next().value;results.delete(expired);controller.discard(expired);}return structuredClone(compactCadChangeResponse(response,response.summary,'full'));
    }catch(error){if(proposal)controller.discard(proposal.previewId);throw error;}finally{if(proposal)checking.delete(proposal.previewId);}
  }
  async function inspectPhotoPreview(previewId){
    const original=controller.getPreview(previewId),revision=controller.revision();
    if(!original?.project||original.revision!==revision)throw Object.assign(Error('Fotovorschau fehlt oder ist veraltet.'),{code:'STALE_REVISION'});
    const before=controller.snapshot(),display=await controller.display(original.project,undefined,{ids:null});
    if(controller.revision()!==revision||!controller.getPreview(previewId))throw Object.assign(Error('Fotovorschau wurde geändert.'),{code:'STALE_REVISION'});
    const {photoPreviewTriangles}=await import('./cad-photo-preview.js');return photoPreviewTriangles(original.project,before,display);
  }
  async function inspectPreview(previewId){
    const original=controller.getPreview(previewId),revision=controller.revision();
    if(!original||original.revision!==revision)throw Object.assign(Error('Die CAD-Vorschau fehlt oder ist veraltet.'),{code:'STALE_REVISION'});
    if(!original.project)throw Error('Diese Vorschau hat keine darstellbare Geometrie.');
    const display=await controller.display(original.project,undefined,{ids:null});
    if(controller.revision()!==revision||!controller.getPreview(previewId))throw Object.assign(Error('Die CAD-Vorschau wurde geändert.'),{code:'STALE_REVISION'});
    const {renderAIPreviewImages}=await import('./cad-ai-preview-images.js');
    return {...renderAIPreviewImages(original.project,display),previewId,revision,verification:results.get(previewId)?.verification};
  }
  async function apply(request){
    if(checking.has(request?.previewId))throw Object.assign(Error('Die Ergebnisprüfung ist noch nicht abgeschlossen.'),{code:'BUSY'});
    const proposal=results.get(request?.previewId);
    if(proposal?.verification?.passed===false&&proposal.verification.modellingPolicy?.accepted!==true&&request.acceptFailedChecks!==true)throw Object.assign(Error('Die Vorschau enthält fehlgeschlagene Prüfungen. Zum Laden ausdrücklich „Mit Fehlern übernehmen“ wählen.'),{code:'AI_RESULT_ACCEPTANCE_REQUIRED'});
    if(request?.responseDetail!==undefined&&!['summary','full'].includes(request.responseDetail))throw Error('Antwortumfang summary oder full wählen.');
    const {acceptFailedChecks,responseDetail='full',...commit}=request,result=controller.apply(commit),previous=receipts.get(request.previewId);
    // Publish the small receipt before awaiting any view/measurement work.
    // The controller remains the authority for idempotence and stale revisions.
    const receipt={...(previous??{}),applied:true,alreadyApplied:!!result.alreadyApplied,revision:result.revision,changed:result.changed,
      warnings:[...new Set([...(proposal?.warnings??previous?.warnings??[]),...(result.warnings??[])])],summary:proposal?.summary??previous?.summary,label:proposal?.label??previous?.label??'',aliases:previous?.aliases??result.aliases,
      ...(proposal?.verification?.passed===false?{acceptedFailedChecks:true,verification:structuredClone(proposal.verification)}:{}),
      ...(proposal?.parameterReport?{parameterReport:proposal.parameterReport}:{}),...(proposal?.contourReport?{contourReport:proposal.contourReport}:{})};
    if(receipt.summary)receipt.summary={...receipt.summary,revision:receipt.revision,warnings:receipt.warnings,previewId:undefined,nextActions:['scene','analysis']};
    receipts.set(request.previewId,structuredClone(receipt));while(receipts.size>10)receipts.delete(receipts.keys().next().value);
    results.delete(request.previewId);
    try{onCommit({previewId:request.previewId,requestRevision:request.revision,revision:receipt.revision,changed:receipt.changed,alreadyApplied:receipt.alreadyApplied});}catch{/* The local receipt remains authoritative if its notification channel closes. */}
    let currentScene,updateError=result.refresh?.error;
    try{await refresh();currentScene=scene();if(currentScene.revision!==receipt.revision)throw Object.assign(Error('Modell nach der Übernahme erneut geändert.'),{code:'STALE_REVISION'});}
    catch(error){updateError=aiFeedback(error,{phase:'refresh'});currentScene=undefined;}
    if(updateError){receipt.warnings=[...receipt.warnings,'Modell übernommen; Ansichtsaktualisierung fehlgeschlagen. Denselben Übernahmeauftrag zur Aktualisierung wiederholen.'];if(receipt.summary)receipt.summary.warnings=receipt.warnings;const {applied,nextAction,retryable,...error}=updateError;return {...receipt,...(currentScene&&responseDetail==='full'?{scene:currentScene}:{}),refresh:{status:'failed',nextAction:'repeat',retryable:true,error},warnings:receipt.warnings};}
    return {...receipt,...(responseDetail==='full'?{scene:currentScene}:{sceneOmitted:true}),refresh:{status:'completed'},...(result.warnings?.length?{warnings:result.warnings}:{})};
  }
  async function sceneWithReferences(options={}){await refresh();if(Object.keys(options).length)return selectCadScene(scene(),options);const value=scene(),selected=value.selectionTargets.filter(t=>!t.path.length),current=()=>{if(controller.revision()!==value.revision||JSON.stringify(getSelection())!==JSON.stringify(value.selectionTargets))throw Object.assign(Error('Modell oder Auswahl wurde während der Bezugsabfrage geändert.'),{code:'STALE_REVISION'});};if(selected.length===1&&value.objects.some(n=>n.id===selected[0].rootId&&n.kind==='cad'&&!n.hidden)&&typeof controller.query==='function'){
    try{const data=await controller.query('referencePoints',{nodeId:selected[0].rootId,maxPoints:2000});if(controller.revision()!==value.revision||JSON.stringify(getSelection())!==JSON.stringify(value.selectionTargets))throw Error('CAD-Modell oder Auswahl wurde während der Bezugsabfrage geändert.');value.referencePoints=data;}catch(error){if(error.code!=='CAD_REFERENCE_LIMIT')throw error;value.referencePointsUnavailable='Native reference list exceeds 2000 points. Use a free native face ray.';}
  }else if(selected.length===1&&typeof controller.meshQuery==='function'){
    const node=value.objects.find(n=>n.id===selected[0].rootId&&n.kind==='mesh'&&!n.hidden&&!n.locked);
    if(node&&node.meshRole!=='hole'){
      try{value.meshFeatures=await controller.meshQuery('toolsQuery',{kind:'featureCatalog',id:node.id});current();}
      catch(error){current();if(error.name==='AbortError'||/ABORT|CANCEL|STALE|FATAL/.test(error.code??''))throw error;value.meshFeaturesUnavailable=error.message;}
      try{value.meshLids=await controller.meshQuery('toolsQuery',{kind:'lidCatalog',id:node.id});current();}
      catch(error){current();if(error.name==='AbortError'||/ABORT|CANCEL|STALE|FATAL/.test(error.code??''))throw error;value.meshLidsUnavailable=error.message;}
    }
    if(node&&node.objectType==='closedMesh'){
      try{
        value.meshInspection=await controller.meshQuery('inspectSolid',{id:node.id});current();
        const stored=controller.readSnapshot?.().nodes.find(n=>n.id===node.id),count=stored?.mesh?.triangles?.length/3;
        if(Number.isFinite(count)&&count<=20000){const result=await controller.meshQuery('analyzeEdges',{id:node.id});current();value.meshEdges={geometryDigest:result.geometryDigest,count:result.edges.length,truncated:result.edges.length>200,edges:result.edges.slice(0,200).map(edge=>Object.fromEntries(['id','kind','start','end','length','normal','normals','closed'].filter(key=>edge[key]!==undefined).map(key=>[key,edge[key]])))};}
        else value.meshEdgesUnavailable='Automatic AI edge summary is limited to 20000 source triangles. Use the existing mesh edge tool for larger parts; never invent edge IDs.';
      }catch(error){current();if(error.name==='AbortError'||/ABORT|CANCEL|STALE|FATAL/.test(error.code??''))throw error;if(value.meshInspection?.ok)value.meshEdgesUnavailable=error.message;else value.meshInspection={ok:false,reason:error.message};}
    }else if(node)value.meshInspection={ok:false,reason:'Open or damaged mesh: body tools require successful repair and a real mesh-kernel proof.'};
  }current();const project=controller.readSnapshot?.();if(project){value.freecadPrograms=cadFreeCADRerunCatalog(project,{selected:value.selectionTargets});value.joints=cadJointsSummary(project);value.contourLinks=cadContourLinksSummary(project);value.projectParameters=cadProjectParametersSummary(project);value.projectParameterCatalog=cadProjectParameterCatalogSummary(project,{targets:value.selectionTargets.length?value.selectionTargets:undefined});}return value;}
  async function assembly(args={action:'state'}){const request=validateCadAssemblyRequest(args),revision=controller.revision();if(!getAssemblyDisplay())throw Error('Baugruppenanzeige ist hier nicht verfügbar.');if(request.action!=='state'){if(isBusy())throw Error('Laufende Bearbeitung zuerst abschließen.');if(request.revision!==revision)throw Object.assign(Error('Modell geändert. Baugruppenanzeige erneut anfordern.'),{code:'STALE_REVISION'});if(typeof setAssemblyDisplay!=='function')throw Error('Baugruppenanzeige kann hier nicht verändert werden.');await setAssemblyDisplay(request);if(controller.revision()!==revision)throw Object.assign(Error('Modell während der Anzeigeänderung verändert.'),{code:'STALE_REVISION'});}return {revision,workspaceVersion:5,modelChanged:false,geometryResident:true,...structuredClone(getAssemblyDisplay())};}
  async function dispatch(method,args){
    switch(method){case 'save':return saveRequest(args);case 'ui':if(!onUI)throw Error('Begrenzte UI-Steuerung ist hier nicht verfügbar.');return onUI(args);case 'assembly':return assembly(args);case 'context':if(args===undefined)args={};if(!args||Object.keys(args).some(k=>k!=='profile'))throw Object.assign(Error('Externes Kontextprofil benötigt nur profile.'),{code:'INVALID_CONTEXT_PROFILE'});return context(args);case 'command_info':return cadCommandReference(fullContext(),args);case 'scene':return sceneWithReferences(args);case 'project':return controller.snapshot();case 'screenshot':return {mimeType:'image/png',dataBase64:(await screenshot()).split(',')[1]};case 'preview':return preview(args);case 'discard':return discardRequest(args);case 'analysis':return analysisRequest(args);case 'apply':return apply(args);case 'export':{const format=args?.format??'stl';let result;if(args?.sheetId!==undefined&&!String(format).startsWith('drawing-'))throw Error('Blattkennung nur für einen Zeichnungsexport verwenden.');if(String(format).startsWith('drawing-'))result=await exportCadDrawing(controller,args,{printDrawingPdf});else if(format==='svg'){const value=await exportCadProjectSvg(controller,{ids:args?.ids,quality:args?.quality});result={mime:'image/svg+xml',extension:'svg',data:new TextEncoder().encode(value.svg)};}else result=await controller.exportModel({format,ids:args?.ids,quality:args?.quality});return {format,mimeType:result.mime,filename:'Formnaro.'+result.extension,dataBase64:base64(result.data)};}default:throw Error('Unbekannte lokale CAD-Methode.');}
  }
  return {isBusy,hasRunningPreview:()=>controller.hasBuildPreview?.()??false,captureRunningPreview:()=>controller.getBuildPreview?.(),captureTaskBasis:async()=>{const project=controller.snapshot(),revision=controller.revision(),selection=structuredClone(getSelection()),materialized=await controller.transactions.materialize();if(controller.revision()!==revision||JSON.stringify(getSelection())!==JSON.stringify(selection))throw Object.assign(Error('Modell oder Auswahl während der Auftragssicherung geändert.'),{code:'STALE_REVISION'});return captureAITaskBasis(project,materialized,selection);},archiveTaskCandidate:id=>controller.materializeAITaskCandidate(id),captureTaskRuntime:()=>controller.captureAITaskRuntime(),restoreTaskRuntime:snapshot=>controller.restoreAITaskRuntime(snapshot),restoreCandidate,beginTask,context,assembly,analyze,inspectPhotoPreview,inspectPreview,inspectFreeCADPreview:id=>controller.inspectFreeCADPreview(id),scene,sceneForAI:sceneWithReferences,project:()=>controller.snapshot(),preview,apply,dispatch,export:options=>dispatch('export',options),screenshot:()=>dispatch('screenshot'),getPreview:id=>controller.getPreview(id)?.project,discard};
}
