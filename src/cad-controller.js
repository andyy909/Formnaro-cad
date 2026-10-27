import {taskConversionKey,validateAITaskRuntime} from './cad-ai-task-runtime.js';
import {taskCandidateModelKey,validateTaskCandidate} from './cad-ai-task-candidate.js';
import {aiFeedback} from './ai-feedback.js';
import {planCadAIScalarFeatureOperation} from './cad-ai-feature-plan.js';
import {prepareFreeCADImport} from './cad-freecad-import.js';
import {createFreeCADParameterHost,createFreeCADDependencyHost} from './cad-freecad-parameter-host.js';
import {editFreeCADDocument} from './cad-freecad-document.js';
import {resolveFreeCADDocumentTarget} from './cad-freecad-target.js';
import {freeCADSourceDigest,validateFreeCADSource} from './cad-freecad-source.js';
import {prepareFreeCADRerun} from './cad-freecad-rerun.js';
import {validateProjectPhotos} from './cad-photo-project.js';
import {validateCadAIReferences} from './cad-ai-feature-reference-data.js';
import {upsertPhotoSet} from './cad-photo-project.js';
import {validatePhotoSet,photoSetDigest} from './cad-photo-multiview-data.js';
import {preparePhotoSetReconstruction,finishPhotoSetReconstruction,nativePhotoSetDimensions,photoSetNativeChecks} from './cad-photo-multiview-build.js';
import {photoTrianglesForIds} from './cad-photo-preview.js';
import {validateCadLoadSet} from './cad-assembly-display.js';
import {hasGeometryRefs,sameDeferredGeometry} from './cad-geometry-ref.js';
import {withFnpackGeometry} from './cad-fnpack-controller.js';
import {applyCadJointRequest} from './cad-joints-data.js';
import {createModelComparisonService,compactModelComparison} from './model-deviation-service.js';
import {meshColorsEnabled} from './mesh-appearance.js';
import {flags} from './organization.js';
import {createCadProject,cadProjectSnapshot,cadProjectReadView,cadProjectRevision,parseCadProject} from './cad-project.js';
import {createCadTransactions} from './cad-transactions.js';
import {createCadWorkerClient} from './cad-worker-client.js';
import {decodeMeshProjectFile} from './mesh-engine/mesh-project-file.js';
import {synchronizeMeshWorkplane,validateMeshWorkplaneReference} from './mesh-workplane.js';
import {runMixedCadAIBatch} from './cad-mixed-ai.js';
import {runCadPython} from './cad-python.js';
import {runFreeCADPlan} from './cad-freecad.js';
import {runCadAIScript} from './cad-ai-sandbox.js';
import {createAIWorkspace} from './cad-ai-workspace.js';
import {AI_PROGRAM_TOOLS} from './cad-ai-program.js';
import {runModelConversion,queryProgramResources} from './cad-ai-local-tools.js';
import {validateAIAnalysis,compactAIAnalysisResult,localAIAnalysisResult} from './cad-ai-analysis.js';
import {validateAIResultChecks,resolveAIResultTarget,aiCheckFailure} from './cad-ai-result-checks.js';
import {projectObjectGeometryDigest} from './project-objects.js';
import {prepareCadTranslationView} from './cad-translation-view.js';
import {validateCadDrawings} from './cad-drawing-data.js';
import {planCadProjectParameters,stampCadProjectParameters,applyCadProjectParameterStates,cadProjectParameterTarget} from './cad-project-parameters-data.js';
import {cadProjectParameterExportProblems} from './cad-project-parameters-export.js';
import {createCadContourLinks,validateCadContourLinks,validateCadContourTarget,cadContourLinkId,cadContourLinkProblems,planCadContourLinks} from './cad-linked-contours-data.js';
import {cadDependencyAffected,cadDependencyNodeId} from './cad-dependency-graph.js';
import {validateCadContourRequest} from './cad-linked-contours-automation.js';

// Drawing edits own no geometry. Compare every other persisted field before
// reusing a native proof; the caller cannot smuggle an unbuilt body into it.
function drawingModelKey(project){return JSON.stringify(Object.fromEntries(Object.entries(project).filter(([key])=>!['drawings','version'].includes(key))));}
function parameterModelKey(project){return JSON.stringify(Object.fromEntries(Object.entries(project).filter(([key])=>!['projectParameters','version'].includes(key))));}
function contourModelKey(project){return JSON.stringify(Object.fromEntries(Object.entries(project).filter(([key])=>!['contourLinks','version'].includes(key))));}
function mergeDrawingUpdateReports(before,after){
  if(!before)return after;if(!after)return before;const out={...before,...after};
  for(const key of ['affectedIds','stateChangedIds','rebuiltIds','constructedIds','updatedLinkIds','removedLinkIds','updatedSheetIds','updatedViewIds'])if(before[key]||after[key])out[key]=[...new Set([...(before[key]??[]),...(after[key]??[])])];
  if(before.counts||after.counts)out.counts=Object.fromEntries([...new Set([...Object.keys(before.counts??{}),...Object.keys(after.counts??{})])].map(id=>[id,(before.counts?.[id]??0)+(after.counts?.[id]??0)]));
  if(before.metadataOnly!==undefined||after.metadataOnly!==undefined)out.metadataOnly=before.metadataOnly===true&&after.metadataOnly===true;return out;
}

/** The renderer and local automation share one confirmed CAD store and worker.
 * Commands, display buffers and gestures remain outside persisted model state. */
export function createCadController({createWorker,createComparisonWorker,createMeshWorker=()=>new Worker(new URL('./mesh-engine-worker.js',import.meta.url),{type:'module'}),runScript=runCadAIScript,runPython=runCadPython,convertModel=runModelConversion,initial=createCadProject(),resolveGeometry=async project=>{if(hasGeometryRefs(project))throw Object.assign(Error('Geometriepaket zum Nachladen fehlt.'),{code:'GEOMETRY_NOT_LOADED'});return project;},getDisplayIds=()=>null,getFonts=()=>[],getProgramResources=()=>({}),onChange=()=>{},onBusy=()=>{},onProgress=()=>{},onError=()=>{},prepareCommit=async()=>{},reuseTranslations=false,displayQuality={deflection:.02,angleDegrees:8}}={}){
  let store,closed=false,displaySequence=0,previewSequence=0,metadata=null,confirmedView=null,pendingDrawingProof=null,projectScope=globalThis.crypto.randomUUID();const previews=new Map(),candidateViews=new Map(),viewQueries=new Map(),replacementPreviews=new Set(),drawingProofs=new Map();
  const aiWorkspace=createAIWorkspace(),blockedConversions=new Map(),runningAnalyses=new Set();let workspaceRevision;
  const originalConvertModel=convertModel;convertModel=async args=>{const key=taskConversionKey(cadProjectRevision(args.project),args.target);if(args.action==='convert'&&blockedConversions.has(key))throw blockedConversions.get(key);try{return await originalConvertModel(args);}catch(error){if(error.feedback?.toolFailure?.scope==='converter-only')blockedConversions.set(key,error);throw error;}};
  function beginAITask(){if(runningAnalyses.size)throw Object.assign(Error("Eine lokale Berechnung läuft bereits."),{code:"BUSY"});aiWorkspace.clear();blockedConversions.clear();workspaceRevision=store.revision();return {revision:workspaceRevision};}
  function captureAITaskRuntime(){
    alive();if(runningAnalyses.size||store.state().busy)throw Object.assign(Error('Eine lokale Berechnung läuft noch.'),{code:'BUSY'});
    if(workspaceRevision!==store.revision())throw Object.assign(Error('Der KI-Arbeitsbereich gehört zu einer anderen Modellrevision.'),{code:'STALE_REVISION'});
    const snapshot={version:1,revision:workspaceRevision,files:aiWorkspace.request({action:'snapshot'}),blockedConversions:[...blockedConversions].map(([key,error])=>({key,error:aiFeedback(error)}))};
    validateAITaskRuntime(snapshot,store.revision());return snapshot;
  }
  function restoreAITaskRuntime(snapshot){
    alive();if(runningAnalyses.size||store.state().busy)throw Object.assign(Error('Eine lokale Berechnung läuft noch.'),{code:'BUSY'});
    const checked=validateAITaskRuntime(snapshot,store.revision());
    aiWorkspace.request({action:'replace',files:checked.workspace.request({action:'snapshot'})});blockedConversions.clear();for(const [key,error]of checked.blocked)blockedConversions.set(key,error);workspaceRevision=store.revision();return {revision:workspaceRevision,files:Object.keys(snapshot.files).length,blockedConversions:blockedConversions.size};
  }
  async function materializeAITaskCandidate(previewId){
    const proposal=previews.get(previewId),revision=store.revision();if(!proposal||proposal.revision!==revision)throw Object.assign(Error('Auftragsvorschau fehlt oder ist veraltet.'),{code:'STALE_REVISION'});
    const project=await resolveGeometry(proposal.project,null);if(store.revision()!==revision||previews.get(previewId)!==proposal)throw Object.assign(Error('Vorschau während der Sicherung geändert.'),{code:'STALE_REVISION'});return cadProjectSnapshot(project);
  }
  async function workspaceQuery(kind,options){
    if(workspaceRevision!==store.revision())beginAITask();
    if(kind==='files'){
      if(options?.action==='replace'||['write','remove'].includes(options?.action)&&/^(analysis-programs|analysis-results)(\/|$)/.test(options.path??''))throw Object.assign(Error('Gespeicherte Analyseprogramme und Messergebnisse sind Anwendungsbelege und bleiben unverändert. Eigene Dateien in einem anderen relativen Ordner speichern.'),{code:'AI_WORKSPACE_READONLY',feedback:{retryable:false}});
      return aiWorkspace.request(options);
    }
    if(kind==='tools'){
      if(typeof globalThis.offlinecadDesktop?.aiToolLibrary!=='function')throw Object.assign(Error('Die dauerhafte Werkzeugbibliothek benötigt Formnaro Desktop.'),{code:'AI_TOOL_LIBRARY_UNAVAILABLE'});
      return globalThis.offlinecadDesktop.aiToolLibrary(options);
    }
    throw Error('Unbekanntes Arbeitswerkzeug.');
  }
  async function runIsolated(language,runner,args){
    let archive;
    if(typeof globalThis.offlinecadDesktop?.aiToolLibrary==='function')archive=await workspaceQuery('tools',{action:'save',tool:{name:(args.name||('KI-'+language+'-Berechnung')).slice(0,160),language,code:args.code,...(args.modules?{modules:args.modules}:{}),description:'Vollständiger Quelltext aus einer lokalen Berechnung. Für neue Teile erneut prüfen.',tags:['Berechnungsverlauf']}});
    return runner(args);
  }
  // A drawing-only proposal inherits the private geometry generation proved
  // below. Undo/Redo can then retain its display without comparing or hashing
  // every cached sheet again during ordinary 3D gestures.
  // History restores these same frozen objects. Scope follows a real Open
  // boundary without a second history stack; ordinary commits inherit it.
  const projectScopes=new WeakMap(),geometryOwners=new WeakMap(),geometryOwner=project=>{let owner=geometryOwners.get(project);if(!owner){owner=Symbol();geometryOwners.set(project,owner);}return owner;};
  const revisionHolds=new Set();
  const assertWritable=()=>{if(revisionHolds.size)throw Object.assign(Error('Die laufende Zeichnungsausgabe zuerst abschließen oder abbrechen.'),{code:'BUSY'});};
  function rememberView(project,view,quality){
    const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
    const privateView={revision:view.revision,scene:freeze(structuredClone(view.scene)),meshes:view.meshes.map(({mesh,...record})=>Object.freeze({...freeze(structuredClone(record)),mesh}))};
    candidateViews.delete(project);candidateViews.set(project,{project,view:privateView,quality});while(candidateViews.size>2)candidateViews.delete(candidateViews.keys().next().value);
  }
  function rememberQuery(project,part){
    if(!reuseTranslations||project!==store.readSnapshot()||!project.nodes.every(n=>n.kind==='cad'))return;
    const record={...viewQueries.get(project),...part};viewQueries.delete(project);viewQueries.set(project,record);while(viewQueries.size>2)viewQueries.delete(viewQueries.keys().next().value);
    if(record.scene?.revision===store.revision()&&record.meshes&&record.quality===JSON.stringify(displayQuality)){
      rememberView(project,{scene:record.scene,meshes:record.meshes,revision:record.scene.revision},record.quality);confirmedView=candidateViews.get(project);viewQueries.delete(project);
    }
  }
  function parameterStateView(project,prior){
    const revision=cadProjectRevision(project),objects=prior.scene.objects.map(object=>{
      const target=object.target??{rootId:object.rootId??object.id,path:[]},context=cadProjectParameterTarget(project,target),root=project.nodes.find(n=>n.id===target.rootId),global=flags(root,project);
      return {...object,hidden:global.hidden||!!root.suppressed||context.chain.some(n=>!!n.hidden),suppressed:!!context.node.suppressed,locked:global.locked||context.chain.some(n=>!!n.locked)};
    });
    return {...prior,revision,scene:{...prior.scene,revision,projectVersion:project.version,objects}};
  }
  function publicParameterView(view,report){const ids=new Set(report.affectedIds??[]);return view?{revision:view.revision,meshes:structuredClone(view.meshes.filter(mesh=>ids.has(mesh.rootId??mesh.id)))}:undefined;}
  function parameterPlanLocks(project,plan){
    if(plan.problems.length)throw Object.assign(Error(plan.problems[0].message),{code:plan.problems[0].code,problems:plan.problems});
    for(const change of [...plan.changedBindings,...plan.changedStates]){const context=cadProjectParameterTarget(project,change.target),root=project.nodes.find(n=>n.id===change.target.rootId);if(flags(root,project).locked||context.chain.some(n=>n.locked))throw Object.assign(Error('Das Parameter- oder Varianten-Ziel ist gesperrt.'),{code:'LOCKED_CAD_OBJECT',target:change.target});}
  }
  const worker=withFnpackGeometry(createCadWorkerClient({createWorker,confirmed:()=>store?.snapshot()??cadProjectSnapshot(initial),initialization:()=>({fonts:getFonts()}),onError}),{resolveProject:resolveGeometry,getProject:()=>store?.readSnapshot()??initial,getDisplayIds});
  // The mesh worker initializes its kernel only. Each edit/query supplies its
  // own inputs; a second confirmed-project clone is never consumed there.
  const meshWorker=withFnpackGeometry(createCadWorkerClient({createWorker:createMeshWorker,onError}),{resolveProject:resolveGeometry,getProject:()=>store?.readSnapshot()??initial,getDisplayIds});
  const progress=value=>onProgress(value);
  store=createCadTransactions({initial,abort:()=>{worker.cancel();meshWorker.cancel();},build:async(project,context)=>{
    const ticket=previewSequence;
    const qualityKey=JSON.stringify(displayQuality),confirmed=store.readSnapshot();
    let nativeOperation=context.operation,nativeInput=project,nativeBaseline=context.baseline,nativeRevision=context.revision;
    let photoReconstruction,freecadImport,boundRerun,featurePlan;
    if(['freecadReplacement','freecadImportStep','freecadBoundRerun'].includes(context.operation?.kind))throw Object.assign(Error('Interne FreeCAD-Übernahme darf nur aus einem geprüften Import, einer Dokumentänderung oder einem Programm-Neulauf entstehen.'),{code:'FREECAD_INTERNAL_OPERATION'});
    if(context.operation?.kind==='freecadImport'){
      const {kind,...request}=context.operation;if(cadProjectRevision(project)!==store.revision())throw Object.assign(Error('FCStd-Import benötigt den bestätigten aktuellen Modellstand.'),{code:'UNCONFIRMED_PROJECT'});
      const imported=await prepareFreeCADImport(request,{signal:context.signal}),id=crypto.randomUUID();freecadImport={...imported,target:{rootId:id,path:[]}};
      nativeOperation={kind:'freecadImportStep',bytes:imported.bytes,options:{id,name:request.name,layerId:project.activeLayerId,folderId:project.activeFolderId,metadata:{freecadSource:imported.source,importedFile:{name:request.name,type:'fcstd'}}}};
    }
    if(context.operation?.kind==='freecadDocumentEdit'){
      const op=context.operation;if(Object.keys(op).some(k=>!['kind','target','sourceDigest','resultObject','edits'].includes(k))||cadProjectRevision(project)!==store.revision())throw Object.assign(Error('FreeCAD-Änderung benötigt den bestätigten aktuellen Modellstand.'),{code:'UNCONFIRMED_PROJECT'});
      const selected=resolveFreeCADDocumentTarget(project,op.target,{write:true}),source=selected.node.metadata.freecadSource;
      if(op.sourceDigest!==freeCADSourceDigest(source.documentBase64))throw Object.assign(Error('Das FreeCAD-Dokument wurde geändert. Merkmalsbaum erneut lesen.'),{code:'STALE_REVISION'});
      const edited=await editFreeCADDocument(source,{resultObject:op.resultObject,edits:op.edits,signal:context.signal});
      const r=edited.report,nativeReport={engineVersion:r.engineVersion,geometry:r.report,stepReadback:r.stepReadback,changes:r.changes,dependentChanges:r.dependentChanges,affectedObjects:r.affectedObjects,independentObjectsExact:r.independentObjectsExact};
      nativeOperation={kind:'freecadReplacement',target:selected.target,expectedSourceDigest:op.sourceDigest,source:edited.source,bytes:edited.bytes,nativeReport};
    }

    if(context.operation?.kind==='freecadRerun'){
      const {kind,...request}=context.operation;if(cadProjectRevision(project)!==store.revision())throw Object.assign(Error('Neulauf benötigt den bestätigten aktuellen Modellstand.'),{code:'UNCONFIRMED_PROJECT'});
      const prepared=prepareFreeCADRerun(project,request);
      if(prepared.coordinated){boundRerun=prepared;nativeOperation={kind:'freecadBoundRerun',request};}
      else{const built=await freecadOperation(project,prepared.operation,context.signal),r=built.report;
      if(!r.resultObject||r.geometry?.check!=='passed'||r.stepReadback?.check!=='passed')throw Object.assign(Error('FreeCAD-Neulauf benötigt einen gültigen Ergebniskörper und eine bestandene STEP-Rückleseprüfung.'),{code:'FREECAD_RERUN_PROOF'});
      const generated=built.operation.options.metadata.freecadSource,source=validateFreeCADSource({...generated,version:2,mode:prepared.mode,resultObject:r.resultObject,documentDigest:freeCADSourceDigest(generated.documentBase64),changes:[],...(prepared.saved.pendingFaceColors?{pendingFaceColors:prepared.saved.pendingFaceColors}:{})});
      const nativeReport={...r,mode:prepared.mode,changes:[],dependentChanges:[],parameterChanges:prepared.parameterChanges,inputs:prepared.inputReview.map(input=>({...input,...r.inputFiles.find(f=>f.name===input.name)})),replacesNative:prepared.replacesNative};
      nativeOperation={kind:'freecadReplacement',target:prepared.context.target,expectedSourceDigest:request.sourceDigest,source,bytes:built.operation.bytes,nativeReport};}
    }

    if(context.operation?.kind==='featureEdits'){if(cadProjectRevision(project)!==store.revision())throw Object.assign(Error('Gezielte Merkmalsänderungen benötigen den unveränderten bestätigten Modellstand.'),{code:'UNCONFIRMED_PROJECT'});if(project.projectParameters?.version===2)featurePlan=planCadAIScalarFeatureOperation(project,context.operation);}
    if(context.operation?.kind==='photoReconstruction'){
      if(Object.keys(context.operation).some(k=>!['kind','plan'].includes(k))||cadProjectRevision(project)!==store.revision())throw Object.assign(Error('Fotorekonstruktion benötigt den unveränderten bestätigten Modellstand.'),{code:'UNCONFIRMED_PROJECT'});
      photoReconstruction=preparePhotoSetReconstruction(project.photos?.items??[],context.operation.plan);
      nativeInput=cadProjectSnapshot({...project,photos:upsertPhotoSet(project.photos,photoReconstruction.analysis.plan)});nativeOperation={kind:'batch',commands:photoReconstruction.commands};
    }
    if(context.replaceProject&&hasGeometryRefs(project)){const candidate=cadProjectReadView(project);await prepareCommit(candidate,{signal:context.signal,revision:context.revision,quality:{...displayQuality}});metadata={aliases:{},changes:[],warnings:[]};return candidate;}
    if(context.operation?.kind==='joints'){
      if(Object.keys(context.operation).some(key=>!['kind','request'].includes(key))||cadProjectRevision(project)!==store.revision())throw Object.assign(Error('Gelenkänderungen benötigen den unveränderten bestätigten Modellstand.'),{code:'UNCONFIRMED_PROJECT'});
      const report=applyCadJointRequest(project,context.operation.request),changedRoots=project.nodes.filter(n=>hasGeometryRefs(n)&&JSON.stringify(n)!==JSON.stringify(confirmed.nodes.find(old=>old.id===n.id))).map(n=>n.id),resolved=changedRoots.length?await resolveGeometry(project,changedRoots,{signal:context.signal}):project,candidate=cadProjectReadView(resolved),nextRevision=cadProjectRevision(candidate);
      if(report.metadataOnly){geometryOwners.set(candidate,geometryOwner(confirmed));if(confirmedView?.project===confirmed){const old=confirmedView.view;rememberView(candidate,{...old,revision:nextRevision,scene:{...old.scene,revision:nextRevision,projectVersion:candidate.version}},qualityKey);}}
      metadata={aliases:{},changes:[],warnings:[],report,jointReport:report};return candidate;
    }
    if(context.operation?.kind==='drawingRefreshProof'){
      const proof=drawingProofs.get(context.operation.previewId);if(Object.keys(context.operation).some(key=>!['kind','previewId','drawingSheetIds','drawingsDraft'].includes(key))||!proof||proof.revision!==store.revision()||drawingModelKey(proof.project)!==drawingModelKey(project))throw Object.assign(Error('Die berechnete Ausgangsvorschau fehlt oder ist veraltet.'),{code:'STALE_REVISION'});
      nativeInput=proof.project;nativeBaseline=proof.project;nativeRevision=cadProjectRevision(proof.project);nativeOperation={kind:'associativeUpdate',drawingSheetIds:context.operation.drawingSheetIds,drawingsDraft:context.operation.drawingsDraft};
    }
    if(context.operation?.kind==='drawingProposal'){
      const proof=drawingProofs.get(context.operation.previewId);if(Object.keys(context.operation).some(key=>!['kind','previewId'].includes(key))||!proof||proof.revision!==store.revision())throw Object.assign(Error('Die berechnete Blattvorschau fehlt oder ist veraltet.'),{code:'STALE_REVISION'});
      if(drawingModelKey(proof.project)!==drawingModelKey(project))throw Error('Layoutänderungen dürfen keine Teile der berechneten Vorschau verändern.');
      const drawings=project.drawings;for(const sheet of drawings.sheets)for(const view of sheet.views){const old=proof.project.drawings?.sheets.find(item=>item.id===sheet.id)?.views.find(item=>item.id===view.id);if(view.projection&&(!old?.projection||view.kind!==old.kind||JSON.stringify(view.projection)!==JSON.stringify(old.projection)))throw Error('Projektionskurven dürfen nur durch Blatt aktualisieren berechnet werden.');}
      const candidate=cadProjectReadView(project),nextRevision=cadProjectRevision(candidate);geometryOwners.set(candidate,geometryOwner(proof.project));if(proof.view){const old=proof.view;rememberView(candidate,{...old,revision:nextRevision,scene:{...old.scene,revision:nextRevision,projectVersion:candidate.version}},qualityKey);}metadata={...proof.metadata};pendingDrawingProof={...proof,project:candidate};return candidate;
    }
    if(context.operation?.kind==='contourMetadata'){
      if(Object.keys(context.operation).some(key=>key!=='kind')||contourModelKey(confirmed)!==contourModelKey(project))throw Error('Eine Kontur-Metadatenänderung darf keine Teile oder anderen Einstellungen ändern.');
      const before=validateCadContourLinks(confirmed.contourLinks??createCadContourLinks()),after=validateCadContourLinks(project.contourLinks??createCadContourLinks());if(after.links.some(link=>!before.links.some(old=>old.id===link.id&&JSON.stringify(old)===JSON.stringify(link))))throw Error('Nur ausdrücklich gelöste Konturverknüpfungen können ohne native Vorschau bestätigt werden.');
      const candidate=cadProjectReadView(project),nextRevision=cadProjectRevision(candidate),report={affectedIds:[],rebuiltIds:[],constructedIds:[],counts:{},updatedLinkIds:[],removedLinkIds:before.links.filter(link=>!after.links.some(next=>next.id===link.id)).map(link=>link.id),metadataOnly:true};geometryOwners.set(candidate,geometryOwner(confirmed));if(confirmedView?.project===confirmed){const old=confirmedView.view;rememberView(candidate,{...old,revision:nextRevision,scene:{...old.scene,revision:nextRevision,projectVersion:candidate.version}},qualityKey);}metadata={aliases:{},changes:[],warnings:[],report,contourReport:report};return candidate;
    }
    if(context.operation?.kind==='associativeUpdate'&&cadProjectRevision(project)!==store.revision())throw Object.assign(Error('Verknüpfte Aktualisierungen benötigen den unveränderten bestätigten Modellstand.'),{code:'UNCONFIRMED_PROJECT'});
    if(context.operation?.kind==='projectParameters'){
      if(Object.keys(context.operation).some(k=>!['kind','data','variantId'].includes(k))||parameterModelKey(confirmed)!==parameterModelKey(project))throw Error('Eine Parameteraktualisierung darf keine unbestätigten Änderungen an anderen Teilen übernehmen.');
      const plan=planCadProjectParameters(project,context.operation.data,{variantId:context.operation.variantId});parameterPlanLocks(project,plan);
      if(plan.metadataOnly){
        let draft=applyCadProjectParameterStates(project,plan.changedStates);const required=draft.nodes.filter(n=>hasGeometryRefs(n)&&!sameDeferredGeometry(confirmed.nodes.find(old=>old.id===n.id),n)).map(n=>n.id);if(required.length)draft=await resolveGeometry(draft,required,{signal:context.signal});draft.projectParameters=stampCadProjectParameters(draft,plan.data);const candidate=cadProjectReadView(draft),nextRevision=cadProjectRevision(candidate),stateChangedIds=[...new Set(plan.changedStates.map(s=>s.target.rootId))],report={affectedIds:stateChangedIds,stateChangedIds,rebuiltIds:[],constructedIds:[],counts:{},metadataOnly:true,staleBindingIds:[]};let view;
        if(!plan.changedStates.length){geometryOwners.set(candidate,geometryOwner(confirmed));if(confirmedView?.project===confirmed){const old=confirmedView.view;rememberView(candidate,{...old,revision:nextRevision,scene:{...old.scene,revision:nextRevision,projectVersion:candidate.version}},qualityKey);}}
        else{
          const prepared=confirmedView?.project===confirmed&&candidate.nodes.every(n=>n.kind==='cad')?parameterStateView(candidate,confirmedView.view):undefined;
          view=await prepareCommit(candidate,{signal:context.signal,revision:context.revision,preparedView:prepared,quality:{...displayQuality}});if(reuseTranslations&&view&&view.revision===nextRevision)rememberView(candidate,view,qualityKey);
        }
        metadata={aliases:{},changes:[],warnings:[],report,parameterReport:report,...(view?{preparedView:publicParameterView(view,report)}:{})};return candidate;
      }
    }
    if(['photos','featureReferences'].includes(context.operation?.kind)){
      const field=context.operation.kind,modelKey=p=>JSON.stringify(Object.fromEntries(Object.entries(p).filter(([k])=>![field,'version'].includes(k))));
      if(Object.keys(context.operation).some(k=>k!=='kind')||modelKey(confirmed)!==modelKey(project))throw Error('Eine Referenzänderung darf keine Teile oder anderen Projekteinstellungen verändern.');
      const candidate=cadProjectReadView(project),nextRevision=cadProjectRevision(candidate);
      geometryOwners.set(candidate,geometryOwner(confirmed));
      if(confirmedView?.project===confirmed){const old=confirmedView.view;rememberView(candidate,{...old,revision:nextRevision,scene:{...old.scene,revision:nextRevision,projectVersion:candidate.version}},qualityKey);}
      metadata={aliases:{},changes:[],warnings:[],report:{metadataOnly:true,...(field==='photos'?{photoCount:candidate.photos?.items.length??0}:{featureReferenceCount:candidate.featureReferences?.items.length??0})}};return candidate;
    }
    if(context.operation?.kind==='drawings'){
      if(Object.keys(context.operation).some(k=>k!=='kind')||drawingModelKey(confirmed)!==drawingModelKey(project))throw Error('Eine Blattänderung darf keine vorhandenen Teile oder Projekteinstellungen verändern.');
      const candidate=cadProjectReadView(project),nextRevision=cadProjectRevision(candidate);
      geometryOwners.set(candidate,geometryOwner(confirmed));
      if(confirmedView?.project===confirmed){const prior=confirmedView.view;rememberView(candidate,{...prior,revision:nextRevision,scene:{...prior.scene,revision:nextRevision,projectVersion:candidate.version}},qualityKey);}
      metadata={aliases:{},changes:[],warnings:[]};return candidate;
    }
    if(reuseTranslations&&!context.operation&&confirmedView?.project===confirmed&&confirmedView.quality===qualityKey){
      const candidate=cadProjectReadView(project),view=prepareCadTranslationView(confirmed,candidate,confirmedView.view,null);
      if(view){view.revision=view.scene.revision=cadProjectRevision(candidate);await prepareCommit(candidate,{signal:context.signal,revision:context.revision,preparedView:view,quality:{...displayQuality}});rememberView(candidate,view,qualityKey);metadata={aliases:{},changes:[],warnings:[]};return candidate;}
    }
    const meshEdit=typeof context.operation?.type==='string'&&context.operation.type.startsWith('mesh-');
    const request={job:meshEdit?'edit':nativeOperation?'command':'rebuild',project:nativeInput,baseline:nativeBaseline,operation:nativeOperation};
    const mixedBatch=context.operation?.kind==='batch'&&context.operation.commands?.some(c=>['mesh','tool','script','python'].includes(c?.op));
    if(mixedBatch&&Object.keys(context.operation).some(key=>!['kind','commands'].includes(key)))throw Object.assign(Error('Unbekannte Felder im gemeinsamen Befehlsauftrag.'),{code:'INVALID_COMMAND'});
    const result=mixedBatch?await runMixedCadAIBatch({project,baseline:context.baseline,commands:context.operation.commands,signal:context.signal,progress,
      runNative:({project,baseline,operation,signal})=>worker.run({job:operation?'command':'rebuild',project,baseline,operation},{revision:cadProjectRevision(baseline),signal}),
      runMesh:({project,operation,signal})=>meshWorker.run({job:'edit',project,operation},{revision:cadProjectRevision(project),signal}),
      runScript:async args=>{try{return await runIsolated('javascript',runScript,args);}catch(error){worker.cancel();meshWorker.cancel();throw error;}},convertModel,
      runFreeCAD:({project,operation,signal})=>freecadOperation(project,operation,signal),
      runPython:async args=>{try{return await runIsolated('python',runPython,args);}catch(error){worker.cancel();meshWorker.cancel();throw error;}},
      query:({project,engine,kind,options,signal})=>{
       if(engine==='workspace')return workspaceQuery(kind,options);
       if(engine==='freecad'&&kind==='inspect')return freecadOperation(project,{...options,kind:'inspect'},signal);
       if(engine==='app'&&kind==='modelComparison')return modelComparison(options,{signal,project});
       if(engine==='app')return queryProgramResources({project,kind,options,getFonts,getResources:getProgramResources,signal});
       if(engine==='converter'){
        if(Object.keys(options).some(k=>!['target','options','edits','commands'].includes(k)))throw Error('Nur Modelldaten und Regionsoptionen an den Konverter übergeben.');
        const target=typeof options.target==='string'?{rootId:options.target,path:[]}:options.target;
        return convertModel({project,action:'analyze',target,options:options.options,edits:options.edits,commands:options.commands,signal});
       }
       if(engine==='cad')return worker.run({job:'query',project,query:{kind,options}},{revision:cadProjectRevision(project),signal});
       let target=options.id??options.nodeId??options.target;
       if(target&&typeof target==='object'){if(!Array.isArray(target.path)||target.path.length)throw Error('Ein vollständiges Netzteil als Abfrageziel wählen.');target=target.rootId;}
       const result=meshWorker.run(['inspectSolid','analyzeEdges'].includes(kind)?{job:kind,node:project.nodes.find(n=>n.id===target)}:{id:target,ids:options.ids,attemptedDigests:options.attemptedDigests,options:options.options,job:'toolsQuery',project,kind:kind==='toolsQuery'?options.kind:kind},{revision:cadProjectRevision(project),signal});
       return kind==='inspectSolid'?result.then(proof=>({...proof,closed:proof.ok===true})):result;
      }
    }):await (meshEdit?meshWorker:worker).run(request,{revision:nativeRevision,signal:context.signal,progress,...((featurePlan&&project.projectParameters?.version===2)||(context.operation?.kind==='projectParameters'&&context.operation.data?.version===2)||(['freecadDocumentEdit','freecadRerun'].includes(context.operation?.kind)&&project.projectParameters?.version===2)?{host:featurePlan?createFreeCADParameterHost(project,featurePlan.plan.data,{targets:featurePlan.freecadTargets,programParameters:featurePlan.programParameters}):boundRerun?createFreeCADParameterHost(project,boundRerun.coordinated.data,{targets:boundRerun.coordinated.freecadTargets,programParameters:[{target:boundRerun.context.target,parameters:boundRerun.parameters}]}):context.operation.kind==='projectParameters'?createFreeCADParameterHost(project,context.operation.data,{variantId:context.operation.variantId}):createFreeCADDependencyHost(project,[nativeOperation.target])}:{})});
    if(photoReconstruction){result.project=structuredClone(result.project);result.photoReconstructionReport=finishPhotoSetReconstruction(result.project,result.aliases,photoReconstruction);}
    result.project=cadProjectReadView(result.project);const resultRevision=cadProjectRevision(result.project),preparedQuality={...displayQuality};
    const view=await prepareCommit(result.project,{signal:context.signal,revision:context.revision,quality:preparedQuality});
    if(reuseTranslations&&view&&view.revision===resultRevision&&view.scene?.revision===resultRevision&&JSON.stringify(preparedQuality)===JSON.stringify(displayQuality))rememberView(result.project,view,JSON.stringify(preparedQuality));
    const detached=project.workplane.reference?.kind==='mesh'&&!result.project.workplane.reference;
    if(ticket===previewSequence)metadata={aliases:result.aliases??{},changes:result.changes??[],warnings:[...(result.warnings??[]),...(detached?['Die Netzbezugsfläche wurde geändert oder entfernt. Die Arbeitsebene bleibt an ihrer letzten gültigen Lage.']:[])],...(meshEdit?{selectedIds:result.selectedIds??[],report:result.report??null}:result.report?{report:result.report}:{})};
    if(ticket===previewSequence&&context.operation?.kind==='projectParameters'){metadata.parameterReport=result.report;metadata.preparedView=publicParameterView(view,result.report);}
    if(ticket===previewSequence&&freecadImport){metadata.selectedTargets=[freecadImport.target];metadata.report={...metadata.report,freecadImport:freecadImport.report};metadata.warnings.push(...freecadImport.warnings);}
    if(ticket===previewSequence&&['freecadReplacement','freecadBoundRerun'].includes(nativeOperation?.kind))metadata.selectedTargets=result.selectedTargets;
    if(ticket===previewSequence&&photoReconstruction)metadata.photoReconstructionReport=result.photoReconstructionReport;
    if(ticket===previewSequence&&nativeOperation?.kind==='associativeUpdate'){
      const prior=context.operation?.kind==='drawingRefreshProof'?drawingProofs.get(context.operation.previewId)?.metadata:undefined;
      metadata.contourReport=mergeDrawingUpdateReports(prior?.contourReport,result.contourReport??result.report);metadata.parameterReport=mergeDrawingUpdateReports(prior?.parameterReport,result.parameterReport);metadata.report=metadata.contourReport;
      metadata.selectedTargets=[...new Map([...(prior?.selectedTargets??[]),...(result.selectedTargets??[])].map(target=>[JSON.stringify(target),target])).values()];metadata.preparedView=publicParameterView(view,metadata.contourReport);
      if(result.drawingReport)metadata.drawingReport=mergeDrawingUpdateReports(prior?.drawingReport,result.drawingReport);if(nativeOperation.drawingSheetIds)pendingDrawingProof={project:result.project,view,revision:context.revision,metadata:structuredClone(metadata)};
    }
    return result.project;
  }});
  projectScopes.set(store.readSnapshot(),projectScope);
  const comparisonService=createModelComparisonService(createComparisonWorker?{createWorker:createComparisonWorker}:{});
  const alive=()=>{if(closed)throw Error('CAD-Anwendung wurde geschlossen.');};
  function assertPreviewStart(revision){alive();assertWritable();if(revision!==store.revision())throw Object.assign(Error('Das CAD-Modell wurde geändert. Vorschau neu berechnen.'),{code:'STALE_REVISION'});if(store.state().busy)throw Object.assign(Error('Eine CAD-Berechnung läuft bereits.'),{code:'BUSY'});}
  function previewAbort(signal,revision){assertPreviewStart(revision);const ticket=previewSequence+1,abort=()=>{if(previewSequence===ticket&&store.state().busy)cancel();};signal?.addEventListener('abort',abort,{once:true});return ()=>signal?.removeEventListener('abort',abort);}
  function changed(result,before){if(result.changed){projectScope=projectScopes.get(store.readSnapshot())??projectScope;const drawingsOnly=before&&geometryOwner(before)===geometryOwner(store.readSnapshot());confirmedView=candidateViews.get(store.readSnapshot())??null;onChange(store.snapshot(),store.state(),{drawingsOnly:!!drawingsOnly});}return result;}
  async function preview(operation,{revision=store.revision(),project=store.snapshot(),label='CAD bearbeiten',replaceProject=false}={}){
    assertPreviewStart(revision);onBusy(true);previewSequence++;metadata=null;pendingDrawingProof=null;
    try{if(project.workplane?.reference?.kind==='mesh')validateMeshWorkplaneReference(project.workplane.reference);const synchronized=synchronizeMeshWorkplane(project,store.readSnapshot()),result={...await store.preview({revision,project:synchronized.project,operation,label,replaceProject}),...metadata};result.warnings=[...new Set([...(result.warnings??[]),...synchronized.warnings])];previews.set(result.previewId,result);if((operation?.kind==='projectParameters'&&result.report?.requiresFreeCADAcceptance)||(operation?.kind==='featureEdits'&&result.report?.featureDependencies?.requiresAcceptance)||(['freecadDocumentEdit','freecadRerun'].includes(operation?.kind)&&result.report?.freecadDependencies?.requiresAcceptance))featureDependencyProofs.add(result.previewId);if(result.photoReconstructionReport)photoReconstructionProofs.set(result.previewId,{revision,passed:false});if(pendingDrawingProof){drawingProofs.set(result.previewId,pendingDrawingProof);while(drawingProofs.size>10)drawingProofs.delete(drawingProofs.keys().next().value);}if(replaceProject)replacementPreviews.add(result.previewId);while(previews.size>10){const first=previews.keys().next().value;previews.delete(first);replacementPreviews.delete(first);drawingProofs.delete(first);photoReconstructionProofs.delete(first);featureDependencyProofs.delete(first);}return result;}
    finally{onBusy(store.state().busy);}
  }
  function apply(request){
    alive();assertWritable();const before=store.readSnapshot(),proposal=previews.get(request.previewId);
    if(featureDependencyProofs.has(request.previewId)&&request.acceptFeatureDependencies!==true)throw Object.assign(Error('Notwendige Parameter-, Quellen- und Konturfolgeänderungen ausdrücklich mit übernehmen.'),{code:'AI_FEATURE_DEPENDENCY_ACCEPTANCE_REQUIRED'});
    if(photoReconstructionProofs.has(request.previewId)&&!photoReconstructionProofs.get(request.previewId).passed)throw Object.assign(Error('Fotorekonstruktion erst nach erfolgreicher nativer Maß- und vollständiger Ansichtsprüfung übernehmen.'),{code:'PHOTO_RECONSTRUCTION_UNCHECKED'});
    const result=store.apply(request),replaced=replacementPreviews.delete(request.previewId)&&!result.alreadyApplied;photoReconstructionProofs.delete(request.previewId);featureDependencyProofs.delete(request.previewId);
    if(replaced)projectScope=globalThis.crypto.randomUUID();projectScopes.set(store.readSnapshot(),projectScope);changed(result,before);previews.delete(request.previewId);if(result.changed||replaced)drawingProofs.clear();else drawingProofs.delete(request.previewId);
    if(result.changed&&store.readSnapshot().nodes.length===0)worker.trim();
    return {...result,aliases:proposal?.aliases??{},warnings:proposal?.warnings??[],...(proposal?.contourReport?{contourReport:proposal.contourReport}:{}),...(proposal?.drawingReport?{drawingReport:proposal.drawingReport}:{}),...(proposal?.selectedTargets?{selectedTargets:proposal.selectedTargets}:{})};
  }
  async function restoreAITaskCandidate(value,{revision=store.revision(),label='Gespeicherten KI-Entwurf prüfen',aliases={}}={}){
    assertPreviewStart(revision);const saved=validateTaskCandidate(value,aliases),before=store.snapshot();let proposal;
    try{
      // Rebuild actual archived sources, without replaying provider scripts or
      // FreeCAD programs. A new transaction owns fresh native acceptance.
      proposal=await preview(undefined,{project:saved.project,revision,label});
      if(taskCandidateModelKey(proposal.project)!==taskCandidateModelKey(saved.project))throw Object.assign(Error('Der erneute native Aufbau verändert die gespeicherte Geometrie oder ihre Quellen. Entwurf nicht fortsetzen.'),{code:'AI_TASK_CANDIDATE_CHANGED',feedback:{retryable:false}});
      const changed=proposal.project.nodes.filter(node=>JSON.stringify(node)!==JSON.stringify(before.nodes.find(old=>old.id===node.id)));
      for(const node of changed)if(node.kind==='mesh'){
        const proof=await inspectMeshSolid(node);if(!proof.ok)throw Object.assign(Error('Gespeichertes Materialnetz hat keinen frischen Körpernachweis.'),{code:'AI_TASK_CANDIDATE_INVALID'});
      }
      if(store.revision()!==revision||!previews.has(proposal.previewId))throw Object.assign(Error('Modell während der Wiederherstellung geändert.'),{code:'STALE_REVISION'});
      const sources=changed.filter(node=>before.nodes.some(old=>old.id===node.id)).map(node=>({id:node.id,name:node.name})),relations=['projectParameters','contourLinks','drawings','joints','featureReferences'],freecad=node=>!!node.metadata?.freecadSource||node.children?.some(freecad),requiresAcceptance=sources.length>0&&(relations.some(key=>saved.project[key]||before[key])||changed.some(freecad))||relations.some(key=>JSON.stringify(saved.project[key])!==JSON.stringify(before[key]));
      proposal.aliases=saved.aliases;proposal.report={restoredTaskCandidate:true,featureDependencies:{requiresAcceptance,parameters:[],sources,contours:[],drawingViews:[]}};
      if(requiresAcceptance)featureDependencyProofs.add(proposal.previewId);
      return structuredClone(proposal);
    }catch(error){if(proposal){previews.delete(proposal.previewId);featureDependencyProofs.delete(proposal.previewId);store.discard(proposal.previewId);}throw error;}
  }
  function holdRevision(expected){alive();if(expected!==store.revision())throw Object.assign(Error('Das Modell wurde vor der Zeichnungsausgabe geändert.'),{code:'STALE_REVISION'});if(store.state().busy||revisionHolds.size)throw Object.assign(Error('Eine Bearbeitung oder Ausgabe läuft bereits.'),{code:'BUSY'});const token=Symbol();revisionHolds.add(token);return ()=>revisionHolds.delete(token);}
  async function previewJoints(request,{revision=store.revision(),label='Gelenke und geführte Bewegung',signal}={}){if(signal?.aborted)throw Object.assign(Error('Gelenkänderung abgebrochen.'),{name:'AbortError',code:'ABORTED'});const cleanup=previewAbort(signal,revision);try{return await preview({kind:'joints',request},{revision,label});}finally{cleanup();}}
  async function previewFreeCADDocument(request,{revision=store.revision(),signal}={}){const cleanup=previewAbort(signal,revision);try{return await preview({...request,kind:'freecadDocumentEdit'},{revision,label:'FreeCAD-Merkmal ändern'});}finally{cleanup();}}
  async function previewFreeCADImport(request,{revision=store.revision(),signal}={}){signal?.throwIfAborted();const cleanup=previewAbort(signal,revision);try{return await preview({...request,kind:'freecadImport'},{revision,label:'Vorhandene FCStd-Konstruktion importieren'});}finally{cleanup();}}
  async function previewFreeCADRerun(request,{revision=store.revision(),signal}={}){if(signal?.aborted)throw Object.assign(Error('Neulauf abgebrochen.'),{name:'AbortError',code:'ABORTED'});const cleanup=previewAbort(signal,revision);try{return await preview({...request,kind:'freecadRerun'},{revision,label:'FreeCAD-Programm mit Parametern neu ausführen'});}finally{cleanup();}}
  async function previewPhotos(photos,{revision=store.revision(),label='Projektfotos ändern'}={}){const project=store.snapshot();if(photos===null)delete project.photos;else project.photos=validateProjectPhotos(photos);return preview({kind:'photos'},{project,revision,label});}
  async function previewFeatureReferences(references,{revision=store.revision(),label='Merkmalsbezüge ändern'}={}){const project=store.snapshot();if(references===null)delete project.featureReferences;else project.featureReferences=validateCadAIReferences(references);return preview({kind:'featureReferences'},{project,revision,label});}
  const photoReconstructionProofs=new Map(),featureDependencyProofs=new Set();
  async function previewPhotoReconstruction(value,{revision=store.revision(),signal,review}={}){
    const plan=validatePhotoSet(value),cleanup=previewAbort(signal,revision);let proposal;
    const current=()=>{if(signal?.aborted)throw Object.assign(Error('Fotorekonstruktion abgebrochen.'),{code:'ABORTED'});if(proposal&&!previews.has(proposal.previewId))throw Object.assign(Error('Fotorekonstruktionsvorschau verworfen oder abgelaufen.'),{code:'PHOTO_RECONSTRUCTION_EXPIRED'});if(store.revision()!==revision)throw Object.assign(Error('Projekt oder Fotoreferenzen während der Prüfung geändert.'),{code:'STALE_REVISION'});};
    try{
      current();proposal=await preview({kind:'photoReconstruction',plan},{revision,label:'Technische Fotoansichten · '+plan.name});current();
      const rootId=proposal.photoReconstructionReport.rootId,scene=await describe(proposal.project);current();
      const native=nativePhotoSetDimensions(scene,rootId,plan),solids=await checkPreview(proposal.previewId,[{kind:'solids',target:rootId,expected:1}],{collectFailures:true});current();
      const requested=photoSetNativeChecks(plan,rootId),nativeExtras=requested.length?await checkPreview(proposal.previewId,requested,{collectFailures:true}):{passed:true,checks:[]};current();
      const displayView=await display(proposal.project,undefined,{ids:[rootId]}),geometry=photoTrianglesForIds(proposal.project,displayView,[rootId]);current();
      if(typeof review!=='function')throw Error('Für die Rekonstruktion fehlt die unabhängige Prüfung aller Fotoansichten.');
      const reports=await review({previewId:proposal.previewId,revision,plan:structuredClone(plan),geometry,items:structuredClone(store.readSnapshot().photos.items)});current();
      if(!Array.isArray(reports)||reports.length!==3||plan.views.some(v=>reports.filter(r=>r.imageId===v.imageId&&r.view===v.view&&r.registration==='common-origin').length!==1))throw Error('Jede registrierte Fotoansicht muss genau einmal geprüft werden.');
      const passed=native.passed&&solids.passed===true&&nativeExtras.passed===true&&reports.every(r=>r.matches===true&&!r.unavailable),proof={revision,planDigest:photoSetDigest(plan),native,solids,nativeExtras,passed,views:reports};photoReconstructionProofs.set(proposal.previewId,{revision,planDigest:proof.planDigest,passed});
      return {...proposal,photoReconstructionReview:proof};
    }catch(error){if(proposal){photoReconstructionProofs.delete(proposal.previewId);previews.delete(proposal.previewId);store.discard(proposal.previewId);}throw error;}finally{cleanup();}
  }
  async function previewDrawings(drawings,{revision=store.revision(),label='Zeichnungsblätter ändern'}={}){const project=store.snapshot();project.drawings=validateCadDrawings(drawings);return preview({kind:'drawings'},{project,revision,label});}
  async function previewDrawingUpdate(drawings,{sheetIds,basePreviewId,revision=store.revision(),label='Zeichnungsblatt aktualisieren',signal}={}){
    const data=validateCadDrawings(drawings);if(!Array.isArray(sheetIds)||!sheetIds.length||sheetIds.length>16||new Set(sheetIds).size!==sheetIds.length||sheetIds.some(id=>!data.sheets.some(sheet=>sheet.id===id)))throw Error('Vorhandene eindeutige Blattkennungen wählen.');
    const proof=basePreviewId===undefined?undefined:drawingProofs.get(basePreviewId);if(basePreviewId!==undefined&&(!proof||proof.revision!==revision))throw Object.assign(Error('Die berechnete Blattvorschau fehlt oder ist veraltet.'),{code:'STALE_REVISION'});
    if(signal?.aborted)throw Object.assign(Error('Blattaktualisierung abgebrochen.'),{name:'AbortError',code:'ABORTED'});const cleanup=previewAbort(signal,revision);try{return await preview({kind:proof?'drawingRefreshProof':'associativeUpdate',...(proof?{previewId:basePreviewId}:{}),drawingSheetIds:[...sheetIds],drawingsDraft:data},{...(proof?{project:proof.project}:{}),revision,label});}finally{cleanup();}
  }
  async function previewDrawingEdits(drawings,{previewId,revision=store.revision(),label='Zeichnungsblätter ändern'}={}){const proof=drawingProofs.get(previewId);if(!proof)throw Object.assign(Error('Die berechnete Blattvorschau fehlt.'),{code:'UNKNOWN_PREVIEW'});const project=cadProjectSnapshot(proof.project);project.drawings=validateCadDrawings(drawings);return preview({kind:'drawingProposal',previewId},{project,revision,label});}
  async function previewProjectParameters(data,{revision=store.revision(),label='Projektparameter und Varianten ändern',variantId,signal}={}){
    if(signal?.aborted)throw Object.assign(Error('Parameteraktualisierung abgebrochen.'),{name:'AbortError',code:'ABORTED'});
    const cleanup=previewAbort(signal,revision);
    try{return await preview({kind:'projectParameters',data,...(variantId!==undefined?{variantId}:{})},{revision,label});}finally{cleanup();}
  }
  async function previewContourLinks(request,{revision=store.revision(),label='Verknüpfte Konturen aktualisieren',signal}={}){
    alive();if(signal?.aborted)throw Object.assign(Error('Konturaktualisierung abgebrochen.'),{name:'AbortError',code:'ABORTED'});
    request=validateCadContourRequest(request);
    const project=store.snapshot(),links=validateCadContourLinks(project.contourLinks??createCadContourLinks());let operation;
    function ids(value){if(!Array.isArray(value)||!value.length||value.length>500||new Set(value).size!==value.length||value.some(id=>typeof id!=='string'||!links.links.some(link=>link.id===id)))throw Error('Eindeutige vorhandene Konturkennungen wählen.');return [...value];}
    if(request.action==='create'){
      const id=cadContourLinkId(),targetId=globalThis.crypto.randomUUID(),source=validateCadContourTarget(request.source),link=validateCadContourLinks({version:1,links:[{id,source,target:{rootId:targetId,path:[]},selector:request.selector}]}).links[0];operation={kind:'associativeUpdate',create:{id,targetId,source,selector:link.selector,...(request.name!==undefined?{name:request.name}:{}),...(request.height!==undefined?{height:request.height}:{}),...(request.targetSketch!==undefined?{targetSketch:structuredClone(request.targetSketch)}:{})}};
    }else if(request.action==='unlink'){
      const selected=new Set(ids(request.ids));project.contourLinks={...links,links:links.links.filter(link=>!selected.has(link.id))};operation={kind:'contourMetadata'};
    }else{
      let updateIds;if(request.action==='rebind'){updateIds=ids([request.id]);const index=links.links.findIndex(link=>link.id===request.id),changed={...links.links[index],source:validateCadContourTarget(request.source),selector:request.selector};links.links[index]=validateCadContourLinks({version:1,links:[changed]}).links[0];}
      else if(request.ids!==undefined)updateIds=ids(request.ids);
      operation={kind:'associativeUpdate',links,...(updateIds?{updateIds}:{}),...(request.action==='rebind'?{rebindIds:[request.id]}:{}),...(request.edits!==undefined?{edits:structuredClone(request.edits)}:{})};
    }
    if(request.action==='update'&&request.edits===undefined){const plan=planCadContourLinks(project,links),scope=request.ids&&plan.graph?new Set(cadDependencyAffected(plan.graph,request.ids.map(id=>cadDependencyNodeId('contour',id))).filter(node=>node.kind==='contour').map(node=>node.linkId)):new Set(links.links.map(link=>link.id));if(!plan.changedLinks.some(link=>scope.has(link.id))&&!plan.problems.some(problem=>!problem.linkId||scope.has(problem.linkId)))operation={kind:'contourMetadata'};}
    const cleanup=previewAbort(signal,revision);try{return await preview(operation,{project,revision,label});}finally{cleanup();}
  }
  function cancel(){for(const abort of runningAnalyses)abort.abort();const running=!!worker.state().running||!!meshWorker.state().running||comparisonService.active()>0,active=store.cancel();comparisonService.cancel();if(worker.state().running)worker.cancel();if(meshWorker.state().running)meshWorker.cancel();if(active||running)displaySequence++;onBusy(false);return active||running;}
  async function execute(operation,options){const result=await preview(operation,options);return apply({previewId:result.previewId,revision:result.revision});}
  async function checkJointCollision(request,{revision=store.revision(),signal}={}){
    assertPreviewStart(revision);if(!request||Object.keys(request).some(k=>!['leftId','rightId','values'].includes(k))||typeof request.leftId!=='string'||typeof request.rightId!=='string'||request.leftId===request.rightId)throw Error('Genau zwei verschiedene Teile für eine diskrete Kollisionsprüfung wählen.');
    const base=store.readSnapshot(),selected=[request.leftId,request.rightId].map(id=>base.nodes.find(n=>n.id===id));if(selected.some(n=>!n||!['cad','mesh'].includes(n.kind)||flags(n,base).hidden||n.suppressed||(n.kind==='cad'?!n.solid:n.meshRole==='hole')))throw Error('Zwei sichtbare fertige Materialkörper wählen.');
    const proposal=await previewJoints({action:'move',values:request.values??[]},{revision,signal,label:'Diskrete Gelenk-Kollisionsprüfung'});try{
      const project=proposal.project;let result,method;
      if(selected.every(n=>n.kind==='cad')){result=await worker.run({job:'query',project,query:{kind:'collision',options:{leftId:request.leftId,rightId:request.rightId}}},{revision:cadProjectRevision(project),signal});method='native-brep';}
      else{const pieces=[];for(const original of selected){let node=project.nodes.find(n=>n.id===original.id);if(node.kind==='cad'){const surface=await worker.run({job:'query',project,query:{kind:'jointCollisionSurface',options:{id:node.id}}},{revision:cadProjectRevision(project),signal});node={...surface.node,id:original.id};}pieces.push({id:original.id,kind:'mesh',name:original.name,meshRole:'solid',mesh:node.mesh,transform:node.transform,color:node.color??'#8294aa',hidden:false,locked:false,layerId:'default',folderId:null});}
        const input=createCadProject({nodes:pieces});result=await meshWorker.run({job:'toolsQuery',kind:'jointCollision',project:input,ids:[request.leftId,request.rightId],options:{}},{revision:cadProjectRevision(input),signal});method=selected.some(n=>n.kind==='cad')?'cad-mesh-approximation':'mesh-kernel';}
      if(store.revision()!==revision||!previews.has(proposal.previewId)||signal?.aborted)throw Object.assign(Error('Stellung während der Kollisionsprüfung geändert.'),{code:signal?.aborted?'ABORTED':'STALE_REVISION'});
      const scope='Nur diese Stellung und ein Volumenschnitt wurden geprüft. Berührung ohne Volumen und der gesamte Bewegungsweg sind damit nicht nachgewiesen.';return {method,intersects:result.intersects,volume:result.volume,...(result.triangles?{triangles:result.triangles}:{}),...(method==='cad-mesh-approximation'?{deflectionTargetMm:.01}:{}),testedPoseOnly:true,fullMotionGuarantee:false,message:(result.intersects?'Volumenschnitt: '+Number(result.volume.toPrecision(7))+' mm³. ':'Kein positiver Volumenschnitt in dieser Stellung. ')+(method==='cad-mesh-approximation'?'CAD/Netz-Näherung mit Vernetzungsziel 0,01 mm; keine garantierte Maximalabweichung. ':method==='mesh-kernel'?'Prüfung der vorhandenen Netze im Netzkern. ':'Native BRep-Prüfung. ')+scope};
    }finally{discardJointCollision(proposal.previewId);}
  }
  function discardJointCollision(id){previews.delete(id);store.discard(id);}
  async function query(kind,options={}, {signal}={}){
    alive();const project=store.readSnapshot(),revision=store.revision();
    const result=await worker.run({job:'query',project,query:{kind,options}},{revision,progress,signal});
    if(store.revision()!==revision){const error=Error('Das CAD-Modell wurde während der Abfrage geändert.');error.code='STALE_REVISION';throw error;}return result;
  }
  async function checkPreview(previewId,checks,{collectFailures=false}={}){
    if(collectFailures){
      const original=previews.get(previewId),revision=store.revision();
      // Preserve the strict API and its fast batched successful path. Only a
      // rejected measurement needs individual reports for the review screen.
      try{return {...await checkPreview(previewId,checks),passed:true};}
      catch(error){if(!/^AI_(RESULT_MISMATCH|CHECK_)/.test(error.code??''))throw error;}
      const requested=validateAIResultChecks(checks),reports=[];
      for(const [index,check]of requested.entries()){
        try{reports.push((await checkPreview(previewId,[check])).checks[0]);}
        catch(error){
          if(!/^AI_(RESULT_MISMATCH|CHECK_)/.test(error.code??''))throw error;
          const proposal=previews.get(previewId);if(!proposal)throw Object.assign(Error('Die CAD-Vorschau fehlt.'),{code:'UNKNOWN_PREVIEW'});
          let target=check.target;try{target=resolveAIResultTarget(await describe(proposal.project),check.target,proposal.aliases??{}).target;}catch{}
          reports.push({...structuredClone(check),target,actual:error.feedback?.actual??null,passed:false,error:{code:error.code,message:error.message.replace(/^Ergebnisprüfung \d+ /,'Ergebnisprüfung '+(index+1)+' ')},feedback:{...error.feedback,checkIndex:index+1,checkKind:check.kind,target:check.target}});
        }
      }
      if(store.revision()!==revision||previews.get(previewId)!==original)throw Object.assign(Error('Die CAD-Vorschau wurde während der Ergebnisprüfung geändert.'),{code:'STALE_REVISION'});
      return {version:1,checks:reports,passed:reports.every(c=>c.passed),scope:'Only listed requirements were measured. Failed or unavailable checks remain explicit; a usable candidate is not proof of correctness.'};
    }
    alive();const proposal=previews.get(previewId),revision=store.revision();
    if(!proposal)throw Object.assign(Error('Die CAD-Vorschau fehlt.'),{code:'UNKNOWN_PREVIEW'});
    if(proposal.revision!==revision)throw Object.assign(Error('Das CAD-Modell wurde geändert.'),{code:'STALE_REVISION'});
    const requested=validateAIResultChecks(checks),scene=await describe(proposal.project),aliases=proposal.aliases??{},groups={native:[],mesh:[],comparison:[]},reports=[];
    requested.forEach((check,index)=>{const object=resolveAIResultTarget(scene,check.target,aliases);groups[check.kind==='surfaceDeviation'?'comparison':object.kind==='mesh'&&['volume','solids','clearance','radialClearance'].includes(check.kind)?'mesh':'native'].push({check,index});});
    for(const [engine,items]of Object.entries(groups))if(items.length){
      if(engine==='comparison'){
       for(const {check,index}of items){
        const object=resolveAIResultTarget(scene,check.target,aliases),other=resolveAIResultTarget(scene,check.other,aliases);
        if(object.target.path.length||other.target.path.length||object.target.rootId===other.target.rootId)throw Object.assign(Error('Oberflächenprüfung benötigt zwei unterschiedliche vollständige Materialteile.'),{code:'AI_CHECK_INVALID'});
        const original=store.readSnapshot().nodes.find(n=>n.id===other.target.rootId),reference=proposal.project.nodes.find(n=>n.id===other.target.rootId);
        if(!original||!reference||projectObjectGeometryDigest(original)!==projectObjectGeometryDigest(reference))throw Object.assign(Error('Die Vergleichsvorlage muss aus dem bestätigten Modell stammen und geometrisch unverändert bleiben.'),{code:'AI_CHECK_INVALID'});
        const actual=await modelComparison({leftId:object.target.rootId,rightId:other.target.rootId,maxSamples:check.maxSamples??12000,alignCenters:false},{project:proposal.project,quality:{deflection:.01,angleDegrees:5}});
        if(store.revision()!==revision||previews.get(previewId)!==proposal)throw Object.assign(Error('Die CAD-Vorschau wurde während des Vergleichs geändert.'),{code:'STALE_REVISION'});
        if(actual.sampledMaximum>check.expected)throw aiCheckFailure(check,index+1,actual);
        reports[index]={kind:check.kind,target:object.target,other:other.target,expected:check.expected,actual,passed:true,evidence:'bidirectional-sampled-surfaces',globalGuarantee:false};
       }
       continue;
      }
      let measured;const options={checks:items.map(i=>i.check),aliases};
      try{measured=await (engine==='mesh'?meshWorker.run({job:'toolsQuery',kind:'resultChecks',project:proposal.project,options},{revision:cadProjectRevision(proposal.project),progress}):worker.run({job:'query',project:proposal.project,query:{kind:'aiResultChecks',options}},{revision:cadProjectRevision(proposal.project),progress}));}
      catch(error){if(error.feedback?.checkIndex)error.feedback.checkIndex=items[error.feedback.checkIndex-1]?.index+1;throw error;}
      measured.checks.forEach((report,k)=>reports[items[k].index]=report);
    }
    const result={version:1,revision:scene.revision,checks:reports,scope:'Only listed requirements were measured. Evidence distinguishes native BRep, source bounds and verified mesh-kernel results. Clearance proves a finite corridor with the reported radial allowance; physical fit remains untested.'};
    if(store.revision()!==revision||previews.get(previewId)!==proposal)throw Object.assign(Error('Die CAD-Vorschau wurde während der Ergebnisprüfung geändert.'),{code:'STALE_REVISION'});
    return result;
  }
  async function display(project=store.readSnapshot(),quality=displayQuality,options={}){
    alive();const sequence=++displaySequence,revision=project===store.readSnapshot()?store.revision():cadProjectRevision(project);
    // A geometrically verified preview can be drawn without being committed.
    // The worker validates its own fixed input revision for this display job.
    const included=validateCadLoadSet(Object.hasOwn(options,'ids')?options.ids:getDisplayIds(project)),idsSet=included===null?null:new Set(included);
    let meshes=included?.length===0?[]:await worker.run({job:'display',project,quality,colored:true,...(included===null?{}:{ids:included})},{revision});
    const ids=project.nodes.filter(n=>(!idsSet||idsSet.has(n.id))&&n.kind==='mesh'&&meshColorsEnabled(n)&&n.meshRole!=='hole'&&!flags(n,project).hidden).map(n=>n.id);if(ids.length){const parts=await meshWorker.run({job:'toolsQuery',kind:'colors',ids,project},{revision});meshes=[...meshes.filter(m=>!ids.includes(m.rootId??m.id)),...parts];}
    if(included===null)rememberQuery(project,{meshes,quality:JSON.stringify(quality)});return {sequence,revision,current:sequence===displaySequence,meshes};
  }
  async function surfaceForComparison(project,id,quality=displayQuality,{signal}={}){
    alive();const node=project.nodes.find(n=>n.id===id);if(!node||!['cad','mesh'].includes(node.kind)||(node.kind==='cad'?!node.solid:node.meshRole==='hole'))throw Error('Vollständige Materialoberfläche für den Vergleich wählen.');
    if(node.kind==='mesh')return [{mesh:node.mesh,transform:node.transform}];
    const result=await worker.run({job:'query',project,query:{kind:'thicknessSurface',options:{id,quality}}},{revision:cadProjectRevision(project),signal});return [result];
  }
  async function modelComparison(options={}, {signal,project=store.readSnapshot(),quality=displayQuality}={}){
    if(Object.keys(options).some(k=>!['leftId','rightId','maxSamples','alignCenters'].includes(k))||typeof options.leftId!=='string'||typeof options.rightId!=='string'||options.alignCenters!==undefined&&typeof options.alignCenters!=='boolean'||options.maxSamples!==undefined&&(!Number.isSafeInteger(options.maxSamples)||options.maxSamples<1||options.maxSamples>12000))throw Error('Modellvergleich: leftId, rightId, 1–12.000 Stichprobendreiecke und optional alignCenters wählen.');
    const revision=store.revision(),leftRecords=await surfaceForComparison(project,options.leftId,quality,{signal}),rightRecords=await surfaceForComparison(project,options.rightId,quality,{signal}),data=await comparisonService.compare({leftRecords,rightRecords,maxSamples:options.maxSamples??6000,alignCenters:options.alignCenters??false},{signal});if(store.revision()!==revision)throw Object.assign(Error('Modell während des Vergleichs geändert.'),{code:'STALE_REVISION'});return {...compactModelComparison(data.result),revision:cadProjectRevision(project),cadTessellationTarget:{...quality},draft:project!==store.readSnapshot()};
  }
  async function describe(project=store.readSnapshot(),selection=[]){alive();const scene=await worker.run({job:'query',project,query:{kind:'scene',options:{selection}}},{revision:project===store.readSnapshot()?store.revision():cadProjectRevision(project)});rememberQuery(project,{scene});return scene;}
  async function verify(value){alive();const project=typeof value==='string'?parseCadProject(value):cadProjectSnapshot(value);if(hasGeometryRefs(project))return project;const result=await worker.run({job:'rebuild',project},{revision:cadProjectRevision(project)});return result.project;}
  async function exportModel(options){
    alive();assertExportReady(options);const project=store.readSnapshot(),revision=store.revision();onBusy(true);
    try{let meshColorParts;if(['obj','3mf','gltf','glb'].includes(options.format)){const ids=project.nodes.filter(n=>n.kind==='mesh'&&meshColorsEnabled(n)&&n.meshRole!=='hole'&&!flags(n,project).hidden&&(!options.ids||options.ids.includes(n.id))).map(n=>n.id);if(ids.length)meshColorParts=await meshWorker.run({job:'toolsQuery',kind:'colors',ids,project},{revision,progress});}if(store.revision()!==revision)throw Object.assign(Error('Projekt während des Exports geändert.'),{code:'STALE_REVISION'});const result=await worker.run({job:'exportModel',project,options:{...options,meshColorParts}},{revision,progress});if(store.revision()!==revision)throw Object.assign(Error('Projekt während des Exports geändert. Erneut exportieren.'),{code:'STALE_REVISION'});return result;}
    finally{onBusy(store.state().busy);}
  }
  function assertExportReady(options={}){alive();const current=store.readSnapshot(),problems=cadProjectParameterExportProblems(current,options);if(problems.length)throw Object.assign(Error('Betroffene Projektparameter oder Varianten zuerst aktualisieren oder den verlorenen Bezug ausdrücklich lösen. '+problems[0].message),{code:'PARAMETERS_UPDATE_REQUIRED',problems});const contours=cadContourLinkProblems(current,current.contourLinks,options);if(contours.length)throw Object.assign(Error('Betroffene Konturverknüpfungen zuerst aktualisieren, neu zuordnen oder ausdrücklich lösen. '+contours[0].message),{code:'CONTOUR_UPDATE_REQUIRED',problems:contours});return true;}
  async function open(value,{label='CAD-Projekt öffnen',revision=store.revision()}={}){
    const prepared=await readProject(value);
    const result=await preview(undefined,{project:prepared.project,revision,label,replaceProject:true});return {...apply({previewId:result.previewId,revision:result.revision}),migration:prepared.migration,warnings:prepared.warnings};
  }
  async function readProject(value){
    alive();const revision=store.revision();
    const encoded=value instanceof Uint8Array?decodeMeshProjectFile(value):value;
    if(typeof encoded==='string'&&new TextEncoder().encode(encoded).length>50*1024*1024)throw Error('Projektdatei ist größer als 50 MB.');
    const input=typeof encoded==='string'?JSON.parse(encoded):encoded;
    if(input?.format!=='OfflineCAD'||![1,2,3,4,6].includes(input.version))return {project:typeof encoded==='string'?parseCadProject(encoded):cadProjectSnapshot(encoded),migration:false,warnings:[]};
    onBusy(true);try{
      const result=await meshWorker.run({job:'importLegacy',encoded:typeof encoded==='string'?encoded:JSON.stringify(encoded)},{revision,progress});
      if(store.revision()!==revision)throw Object.assign(Error('Projekt während des Netzimports geändert. Erneut öffnen.'),{code:'STALE_REVISION'});
      return {project:cadProjectSnapshot(result.project),migration:true,warnings:result.warnings??[]};
    }finally{onBusy(store.state().busy);}
  }
  async function meshQuery(name,options={}){
    if(!['inspectSolid','analyzeEdges','toolsQuery'].includes(name))throw Error('Unbekannte Netzabfrage.');
    alive();const revision=store.revision(),project=store.readSnapshot();
    const node=options.node??project.nodes.find(n=>n.id===(options.nodeId??options.id));
    const request=name==='toolsQuery'?{...options,job:name,node,project}:{job:name,node};
    const result=await meshWorker.run(request,{revision,progress});
    if(store.revision()!==revision)throw Object.assign(Error('Projekt während der Netzprüfung geändert. Werkzeug erneut öffnen.'),{code:'STALE_REVISION'});return result;
  }
  const inspectMeshSolid=node=>meshQuery('inspectSolid',{node});
  async function freecadOperation(project,operation,signal){
    if(operation.script&&typeof globalThis.offlinecadDesktop?.aiToolLibrary==='function')await workspaceQuery('tools',{action:'save',tool:{name:(operation.script.name??'FreeCAD-Python').slice(0,160),language:'python',code:operation.script.code,modules:operation.script.modules??{},description:'Vollständiges natives FreeCAD-Python-Skript. In engine freecad mit operation.script ausführen; benötigt die native FreeCAD-Umgebung, nicht die Analyse-Python-Laufzeit. Für neue Teile erneut messen und prüfen.',tags:['FreeCAD','Native-Python','Berechnungsverlauf',...(operation.script.gui?['GUI']:[])]}});
    return runFreeCADPlan({project,operation,signal,exportGeometry:(source,options)=>{const geometry=cadProjectSnapshot(source);for(const n of geometry.nodes)if(n.kind==='cad')n.multicolor=false;return worker.run({job:'exportModel',project:geometry,options},{revision:cadProjectRevision(geometry),signal});}});
  }
  async function inspectFreeCADPreview(previewId){
    const proposal=previews.get(previewId),revision=store.revision();if(!proposal||proposal.revision!==revision)throw Object.assign(Error('FreeCAD-Prüfvorschau ist veraltet.'),{code:'STALE_REVISION'});
    const previous=store.readSnapshot(),ids=proposal.project.nodes.filter(n=>n.kind==='cad'&&n.solid&&!flags(n,proposal.project).hidden&&JSON.stringify(n)!==JSON.stringify(previous.nodes.find(old=>old.id===n.id))).map(n=>n.id);
    if(!ids.length)return {status:'not-applicable',reason:'Keine geänderten sichtbaren CAD-Volumenkörper.'};
    // A combined export checks the actual finished material, including native
    // constructions made without FreeCAD. No candidate is committed here.
    const input=proposal.project.nodes.find(n=>n.id===ids[0]);
    const project=cadProjectSnapshot(proposal.project);for(const n of project.nodes)if(!ids.includes(n.id))n.hidden=true;
    // Export all changed roots as one source while retaining the real geometry.
    const checked=await runFreeCADPlan({project,operation:{kind:'inspect',inputs:[{name:'candidate',target:input.id}],plan:{version:1,steps:[{id:'measured',op:'inspect',source:'candidate'}],output:'candidate'}},exportGeometry:async(source,options)=>{for(const n of source.nodes)if(n.kind==='cad')n.multicolor=false;return worker.run({job:'exportModel',project:source,options:{...options,ids}},{revision:cadProjectRevision(source),signal:undefined});}});
    if(store.revision()!==revision||previews.get(previewId)!==proposal)throw Object.assign(Error('FreeCAD-Prüfvorschau wurde geändert.'),{code:'STALE_REVISION'});
    const g=checked.geometry;return {status:'checked',engineVersion:checked.engineVersion,passed:g.valid&&g.closed&&g.solids>0&&g.check==='passed',geometry:g,targets:ids,scope:'STEP-Export unabhängig mit FreeCAD gelesen. Geometriegültigkeit; keine Maßhaltigkeits- oder Fertigungsfreigabe.'};
  }
  async function analyze(requests,{reportBudget=14000,signal}={}){
    if(runningAnalyses.size)throw Object.assign(Error("Eine lokale Berechnung läuft bereits."),{code:"BUSY"});
    if(workspaceRevision!==store.revision())beginAITask();
    if(!Number.isInteger(reportBudget)||reportBudget<2000||reportBudget>14000)throw Object.assign(Error('Messbericht: verbleibendes Rückmeldebudget zu klein. Vorhandene Seiten verwenden.'),{code:'AI_ANALYSIS_INVALID'});
    const revision=store.revision(),results=[],validated=validateAIAnalysis(requests),localAbort=new AbortController();signal=signal?AbortSignal.any([signal,localAbort.signal]):localAbort.signal;runningAnalyses.add(localAbort);
    try{
    for(const q of validated){
      if(signal.aborted)throw Object.assign(Error('Lokale Berechnung abgebrochen.'),{code:'ABORTED'});
      const options=q.options??{};let value;
      if(q.engine==='workspace')value=await workspaceQuery(q.kind,options);
      else if(['python','javascript'].includes(q.engine)){
       const project=await resolveGeometry(store.readSnapshot(),null,{signal});
       const runner=q.engine==='python'?runPython:runScript;
       value=await runIsolated(q.engine==='python'?'python':'javascript',runner,{...options,signal,timeoutMs:300000,call:async(method,args)=>{
        if(signal?.aborted)throw Object.assign(Error('Berechnung abgebrochen.'),{code:'ABORTED'});
        if(store.revision()!==revision)throw Object.assign(Error('Modell während der Berechnung geändert.'),{code:'STALE_REVISION'});
        if(method==='model'){const snapshot=cadProjectSnapshot(project);return {...snapshot,objects:snapshot.nodes};}
        if(method!=='query'||!args||!Object.hasOwn(AI_PROGRAM_TOOLS.queries,args.engine)||!AI_PROGRAM_TOOLS.queries[args.engine].includes(args.kind))throw Object.assign(Error('Analyse darf nur messen; Modelländerungen gehören in eine Vorschau.'),{code:'AI_ANALYSIS_READ_ONLY'});
        const o=args.options??{};
        if(args.engine==='workspace')return workspaceQuery(args.kind,o);
        if(args.engine==='freecad')return freecadOperation(project,{...o,kind:'inspect'},signal);
        if(args.engine==='cad')return query(args.kind,o,{signal});
        if(args.engine==='app'&&args.kind==='modelComparison')return modelComparison(o,{signal,project});
        if(args.engine==='app'&&args.kind==='jointCollision')throw Error('Gelenkkollision separat als Messauftrag ausführen.');
        if(args.engine==='app')return queryProgramResources({project,kind:args.kind,options:o,getFonts,getResources:getProgramResources,signal});
        if(args.engine==='converter')return convertModel({project,action:'analyze',target:typeof o.target==='string'?{rootId:o.target,path:[]}:o.target,options:o.options,edits:o.edits,commands:o.commands,signal});
        const target=o.id??o.nodeId??o.target,id=typeof target==='string'?target:target?.path?.length===0?target.rootId:null;
        return meshQuery(['inspectSolid','analyzeEdges'].includes(args.kind)?args.kind:'toolsQuery',{...o,id,...(['inspectSolid','analyzeEdges'].includes(args.kind)?{}:{kind:args.kind==='toolsQuery'?o.kind:args.kind})});
       }});
      }
      else if(q.engine==='freecad')value=await freecadOperation(store.readSnapshot(),{...options,kind:'inspect'},signal);
      else if(q.engine==='cad')value=await query(q.kind,options);
      else if(q.engine==='app'&&q.kind==='modelComparison')value=await modelComparison(options,{signal});
      else if(q.engine==='app'&&q.kind==='jointCollision')value=await checkJointCollision(options,{revision,signal});
      else if(q.engine==='app')value=await queryProgramResources({project:store.readSnapshot(),kind:q.kind,options,getFonts,getResources:getProgramResources,signal});
      else{const target=options.id??options.nodeId??options.target,id=typeof target==='string'?target:Array.isArray(target?.path)&&!target.path.length?target.rootId:null;if(typeof id!=='string')throw Error('Ein vollständiges Netzteil für die Messung wählen.');value=await meshQuery(q.kind==='inspectSolid'?'inspectSolid':'toolsQuery',{id,...(q.kind==='inspectSolid'?{}:{kind:q.kind,options:options.options})});}
      if(store.revision()!==revision)throw Object.assign(Error('Modell während der Messung geändert.'),{code:'STALE_REVISION'});
      const computation=['python','javascript'].includes(q.engine)||q.engine==='freecad'&&!!options.script,token=crypto.randomUUID(),artifacts={};
      let program;
      if(computation){const path='analysis-programs/'+token+(q.engine==='javascript'?'.js':'.py'),bundlePath='analysis-programs/'+token+'.program.json';artifacts[path]=options.script?.code??options.code;artifacts[bundlePath]=JSON.stringify({version:1,engine:q.engine,kind:q.kind,options});program={name:options.script?.name??options.name??q.id,language:q.engine==='freecad'?'freecad-python':q.engine,path,bundlePath};}
      const reported=localAIAnalysisResult(value,{report:q.report,budget:Math.floor((reportBudget-1200)/validated.length),atomic:computation,save:text=>{const path='analysis-results/'+token+'.json';artifacts[path]=text;return path;}});
      if(Object.keys(artifacts).length)aiWorkspace.request({action:'replace',files:{...aiWorkspace.request({action:'snapshot'}),...artifacts}});
      results.push({id:q.id,engine:q.engine,kind:q.kind,...(program?{program}:{}),value:reported});
    }
    return compactAIAnalysisResult({revision,results});
    }finally{runningAnalyses.delete(localAbort);}
  }
  const transactions={snapshot:()=>store.snapshot(),materialize:(ids=null,options={})=>resolveGeometry(store.readSnapshot(),ids,options),
    serialize:()=>store.serialize(),revision:()=>store.revision(),state:()=>store.state(),preview:request=>preview(undefined,request),apply,cancel:()=>store.cancel(),discard:id=>store.discard(id)};
  return {measureTransport:worker.measureTransport,transportState:worker.transportState,transactions,snapshot:()=>store.snapshot(),readSnapshot:()=>store.readSnapshot(),revision:()=>store.revision(),projectScope:()=>projectScope,state:()=>({...store.state(),busy:store.state().busy||!!meshWorker.state().running||revisionHolds.size>0||runningAnalyses.size>0,worker:worker.state(),meshWorker:meshWorker.state()}),
    invalidateDisplayView:()=>{confirmedView=null;candidateViews.clear();viewQueries.clear();},preview,previewFreeCADDocument,previewFreeCADImport,previewFreeCADRerun,previewJoints,checkJointCollision,previewPhotos,previewFeatureReferences,previewPhotoReconstruction,previewDrawings,previewDrawingUpdate,previewDrawingEdits,previewProjectParameters,previewContourLinks,holdRevision,execute,apply,query,analyze,checkPreview,inspectFreeCADPreview,display,surfaceForComparison,modelComparison,describe,verify,exportModel,assertExportReady,open,readProject,inspectMeshSolid,meshQuery,
    undo:()=>{alive();assertWritable();const before=store.readSnapshot();return changed(store.undo(),before);},redo:()=>{alive();assertWritable();const before=store.readSnapshot();return changed(store.redo(),before);},
    cancel,
    discard:previewId=>{previews.delete(previewId);replacementPreviews.delete(previewId);drawingProofs.delete(previewId);photoReconstructionProofs.delete(previewId);featureDependencyProofs.delete(previewId);return store.discard(previewId);},
    getPreview:previewId=>{const result=previews.get(previewId);return result?structuredClone(result):undefined;},
    materialize:(ids=null,options={})=>resolveGeometry(store.readSnapshot(),ids,options),
    beginAITask,captureAITaskRuntime,restoreAITaskRuntime,restoreAITaskCandidate,materializeAITaskCandidate,serialize:()=>store.serialize(),
    serializeWorkspace:workspace=>store.serializeWorkspace(workspace),
    setDisplayQuality:quality=>{if(!Number.isFinite(quality?.deflection)||quality.deflection<=0||!Number.isFinite(quality.angleDegrees)||quality.angleDegrees<=0||quality.angleDegrees>180)throw Error('Ungültige Anzeigequalität.');displayQuality={...quality};},
    dispose:()=>{for(const abort of runningAnalyses)abort.abort();closed=true;confirmedView=null;candidateViews.clear();viewQueries.clear();comparisonService.dispose();store.cancel();worker.dispose();meshWorker.dispose();previews.clear();replacementPreviews.clear();drawingProofs.clear();photoReconstructionProofs.clear();featureDependencyProofs.clear();pendingDrawingProof=null;}
  };
}
