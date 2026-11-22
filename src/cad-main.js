import { createAlignment } from './app/alignment.js';
import { createClipboard } from './app/clipboard.js';
import { createImportExport } from './app/import-export.js';
import { createIsolation } from './app/isolation.js';
import { createRecoveryActions } from './app/recovery.js';
import { createUiHelpers } from './app/ui-helpers.js';
import {bindCadAboutLinks, showCadAbout} from './cad-about.js';
import aboutLinks from '../backend/about-links.json';
import {mountCadWelcome} from './cad-welcome.js';
import {configureModelCheckStorage,readModelCheckConfig,saveModelCheckConfig,MODEL_CHECK_CONFIG_KEY} from './ai-model-check-config.js';
import { createOrcaDialog } from './cad-orca-dialog.js';
import {createCadAutomationSession} from './cad-automation-session.js';
import {findCadGearSnap,applyCadGearSnap} from './cad-gear-snap.js';
import {readAIModelChecksEnabled,readAIModelLivePreviewEnabled} from './ai-model-strictness.js';
import {createAgentUIAccess} from './cad-agent-ui.js';
import {createCadPartPropertiesUI} from './cad-part-properties-ui.js';
import {mountFreeCADDocumentReader} from './cad-freecad-document-ui.js';
import {createCadAIFeatureUI} from './cad-ai-feature-ui.js';
import {createCadReferenceRebindUI} from './cad-reference-rebind-ui.js';
import {captureCadAIFeatureScope} from './cad-ai-feature-automation.js';
import {reviewPhotoSet,reviewStoredPhotoSet} from './cad-photo-multiview-review.js';
import {createCadProgramAssistant} from './cad-program-assistant.js';
import {captureCadPracticeCopy} from './cad-practice-project-copy.js';
import {measurePracticePhoto,practiceFileObject} from './cad-practice-files.js';
import {installCadPracticeRunner} from './cad-practice-runner.js';
import {createFnpackFiles} from './cad-fnpack-files.js';
import {createFnpackRecovery,PACK_RECOVERY_KIND} from './cad-fnpack-recovery.js';
import {createThemeBinding} from './theme.js';
import {createCadRecoveryEncoder} from './cad-recovery-encoder.js';
import {runCadAIScript} from './cad-ai-sandbox.js';
import {isGeometryRef} from './cad-geometry-ref.js';
import './cad-assembly-display.css';
import {createCadAssemblyDisplay} from './cad-assembly-display.js';
import {createCadJointsUI} from './cad-joints-ui.js';
import {formatUiNumber,preserveUiNumber} from './ui-numbers.js';
import {createCadThicknessUI} from './cad-thickness-ui.js';
import './mesh-import.css';
import {combinedPlacementBounds,modelPlacementDelta} from './model-placement.js';
import {createCadInspectionUI} from './cad-inspection-ui.js';
import {createCadMeshSculptUI} from './cad-mesh-sculpt-ui.js';
import {createCadMeshFeaturesUI} from './cad-mesh-features-ui.js';
import {createCadMeshHollowUI} from './cad-mesh-hollow-ui.js';
import {createCadMeshMakeSolidUI} from './cad-mesh-make-solid-ui.js';
import {createCadMeshEraseFillUI} from './cad-mesh-erase-fill-ui.js';
import {createCadMeshSmoothUI} from './cad-mesh-smooth-ui.js';
import {createCadMeshRemeshUI} from './cad-mesh-remesh-ui.js';
import {createCadMeshReduceUI} from './cad-mesh-reduce-ui.js';
import {createCadMeshHoleFillUI} from './cad-mesh-hole-fill-ui.js';
import {createCadMeshRepairUI} from './cad-mesh-repair-ui.js';

import {createCadMeshInspectorUI} from './cad-mesh-inspector-ui.js';

import {meshCadInput} from './cad-mesh-to-cad-data.js';

import {flags} from './organization.js';

import {createCadMeshSelectionUI} from './cad-mesh-selection-ui.js';

import {createCadMeshCopyUI} from './cad-mesh-copy-ui.js';

import {createCadConverterImport} from './cad-converter-import.js';

import {createCadMeshExtraTools} from './cad-mesh-extra-tools.js';

import {meshTextPaths} from './mesh-contours.js';

import {commonBounds,meshMagnetTransform} from './common-tool-operations.js';

import {aiFeedback} from './ai-feedback.js';


import {createCadAnnotationsView} from './cad-annotations-view.js';

import './style.css';

import './settings.css';

import * as THREE from 'three';

import {aiPreviewErrorMarks,AI_ERROR_COLOR} from './cad-ai-preview-errors.js';
import {createCadController} from './cad-controller.js';

import {createCadRenderer} from './cad-renderer.js';

import {createCadAlignMarkers} from './cad-align-markers.js';

import {createCadInterface} from './cad-interface.js';

import {createCadToolsUI} from './cad-tools-ui.js';

import {createCadMeshTools} from './cad-mesh-tools.js';

import {createCadWorkplaneUI} from './cad-workplane-ui.js';

import {createCadAutomationAccess} from './cad-automation-access.js';

import {createCadAIUI} from './cad-ai-ui.js';

import {cadProjectNeedsPackage,createCadProject,parseCadProject} from './cad-project.js';

import {exchangeMainFile} from './exchange-formats.js';

import {createCadProjectsUI} from './cad-projects-ui.js';

import {createCadIsolation,cadPermanentlyVisible} from './cad-isolation.js';

import {renderCadProjectThumbnail} from './cad-project-thumbnail.js';

import { createWorkspaceIO } from './app/workspace-io.js';

import {createFunctionPlugins} from './cad-function-plugins.js';

import {createCadFunctionsUI} from './cad-functions-ui.js';

import {hasLocalStlConverter} from './cad-stl-converter.js';

import {cadIdentity,cadPoint,multiplyCadMatrices,inverseCadMatrix,resizeCadAtCorner} from './cad-affine.js';

import {cadSelectionContext} from './cad-interface-state.js';

import {CAD_PALETTE_SHAPES} from './cad-shapes.js';


import {loadPlugins} from './cad-plugin-manifest.js';

import {createStartup} from './app/startup.js';

import {createErrorReporter} from './error-log.js';

import {loadPreferences,validatePreferences} from './preferences.js';

import {createCadQualitySettings} from './cad-quality.js';

import {createCadWorkflowSettings} from './cad-workflow-settings.js';

import {createLayoutUI} from './layout-ui.js';
import {createCadWorkbenchUI} from './cad-workbench-ui.js';
import {createCadContextMenu} from './cad-context-menu.js';
import {createEasyDomain,easyDomainAllows,easyExportIds} from './cad-easy-domain.js';
import {createCreationDomain,resolveCreationDomain} from './cad-creation-domain.js';
import {createEasyMeshRepair} from './cad-easy-repair.js';
import {meshSurfaceHit} from './mesh-surface.js';

import {createLocalization} from './i18n.js';

import {createCadRecovery} from './cad-recovery.js';

import {createCadSketchUI} from './cad-sketch-ui.js';
import {createCadModelingUI} from './cad-modeling-ui.js';
import {createAdvancedFreeCADUI} from './cad-freecad-advanced-ui.js';
import {createCadDrawingUI} from './cad-drawing-ui.js';
import {createCadProjectParametersUI} from './cad-project-parameters-ui.js';

import {createCadFontLibrary} from './cad-fonts.js';

import './sidebar.css';

import {FORMNARO_VERSION,FORMNARO_BUILD_LABEL} from './version.js';

document.title='Formnaro '+FORMNARO_VERSION+' · '+FORMNARO_BUILD_LABEL+' · Lokale 3D-Werkstatt';

const versionLabel=document.createElement('small');versionLabel.id='app-version';versionLabel.textContent='v'+FORMNARO_VERSION+' · '+FORMNARO_BUILD_LABEL;versionLabel.dataset.noTranslate='';document.querySelector('.brand').append(versionLabel);



const $=id=>document.getElementById(id),copy=value=>structuredClone(value),targetKey=value=>value.rootId+'/'+value.path.join('/');

const translate=point=>new THREE.Matrix4().makeTranslation(...point).toArray();

const startup=createStartup({document,window,performance});
const storage=await startup.openStorage();

configureModelCheckStorage(storage);
if(!storage.getItem(MODEL_CHECK_CONFIG_KEY))saveModelCheckConfig(readModelCheckConfig());

let preferredProjectFormat='ocad',startupEmptyRevision=null;
const packFiles=createFnpackFiles(window.offlinecadDesktop);
const recoveryEncoder=window.offlinecadDesktop?.changeRecoveryData?createCadRecoveryEncoder():null;
const recovery=createFnpackRecovery({desktop:window.offlinecadDesktop,storage,files:packFiles,legacy:createCadRecovery(storage),getProject:()=>controller.readSnapshot(),preferPack:()=>preferredProjectFormat==='fnpack'||cadProjectNeedsPackage(controller.readSnapshot())});

let partPropertiesUI,jointsUI,sketchUI,modelingUI,advancedFreeCADUI,drawingUI,projectParametersUI,meshTools,meshExtras,meshCopyUI,meshSelectionUI,meshInspectorUI,meshRepairUI,meshReduceUI,meshRemeshUI,meshSmoothUI,meshSculptUI,meshEraseFillUI,meshMakeSolidUI,meshHollowUI,meshFeaturesUI,meshHoleFillUI,workplaneUI,modalSequence=0;

const fontLibrary=createCadFontLibrary(storage);

let cornerSession=null,scaleApplyPending=false,nativeSceneScope=null,startupRecoveryFailed=false;
let preferences={...loadPreferences(storage),theme:'system'},plugins=loadPlugins(storage),selection=[],nativeScene=null,ui,featureUI,referenceRebindUI,tools,inspectionUI,thicknessUI,layoutUI,aiUI,refreshTask=Promise.resolve(),refreshTicket=0,sourceTicket=0,sourceDisplayKey=null,lastDisplayed=null,preparedDisplay=null,savedRevision=null,activePreview=null,magnetSession=null,alignment=null,alignmentMarks,marksView,alignmentTask=Promise.resolve(),alignmentTicket=0,busy=false;

const importBatchById=new Map();

let nextImportIndex=0;

let recoveredProject=false;
let activeProjectFile=null,fileBusy=false,cleanRevision=null,cleanWorkspaceSignature=null,savedWorkspaceSignature=null;

let contextMenuUI=null,workbenchUI=null,easyRepair=null,easyDomainRevision=0,insertionBusy=0;
const easyDomain=createEasyDomain(storage);
const creationDomain=createCreationDomain(storage);
const creationKind=(p=project())=>['solid','fusion'].includes(workbenchUI?.mode())?'cad':activeEasyKind()??resolveCreationDomain(p,selection,creationDomain.get());
function requireCreationKind(p){const kind=creationKind(p);if(!kind)throw Error('Für neue Formen ein CAD- oder Netzteil auswählen oder den Formtyp CAD/Netz festlegen.');return kind;}
const activeEasyKind=()=>workbenchUI?.mode()==='easy'?easyDomain.get():null;
const domainAllowsId=(id,p=project())=>easyDomainAllows(p.nodes.find(node=>node.id===id),activeEasyKind());
const workflowSettings=createCadWorkflowSettings(storage);

const quality=createCadQualitySettings(storage),localization=createLocalization(()=>preferences.language),t=localization.t;

const functionPlugins=createFunctionPlugins(storage);let functionsUI;

let localStlTask=null,localStlSequence=0;

const errorReporter=createErrorReporter({getContext:()=>({nodeCount:nativeScene?.objects?.length??0,selectionCount:selection.length})});errorReporter.install();

let freecadImportReader;
const progress=document.createElement('button');progress.id='cad-cancel';progress.hidden=true;progress.textContent='Berechnung abbrechen';progress.onclick=()=>escape();$('viewport').append(progress);
const {toast,safe,modal,download,setBusy}=createUiHelpers({$,t,errorReporter,beforeModal:()=>{cornerSession?.finish();freecadImportReader?.dispose();freecadImportReader=null;meshHoleFillUI?.close();meshRepairUI?.close();meshReduceUI?.close();meshRemeshUI?.close();meshSmoothUI?.close();meshSculptUI?.close();meshEraseFillUI?.close();meshMakeSolidUI?.close();meshHollowUI?.close();meshFeaturesUI?.close();meshInspectorUI?.cancel();meshSelectionUI?.cancel();modalSequence++;},getBusy:()=>busy,setBusyState:value=>{busy=value;},updateState,progress,document,window});

const assemblyDisplay=createCadAssemblyDisplay();let assemblyOpening=false,assemblyScope=null,assemblyKnownIds=new Set();
const controller=createCadController({canWrite:()=>!partPropertiesUI?.exploded(),resolveGeometry:packFiles.resolve,getDisplayIds:candidate=>assemblyDisplay.displayIds(candidate,assemblyOpening?candidate:controller.readSnapshot()),getProgramResources:()=>({fonts:fontLibrary.list(),formPackages:plugins.filter(p=>p.enabled).map(p=>p.manifest),functions:functionPlugins.list().filter(p=>p.enabled).map(p=>p.manifest)}),onError:(error,context)=>errorReporter.report(error,context),getFonts:fontLibrary.resources,createWorker:()=>new Worker(new URL('./cad-worker.js',import.meta.url),{type:'module'}),displayQuality:quality.get().display,onBusy:setBusy,onBuildPreview:showBuildPreview,onBuildPreviewFailure:({ticket})=>{if(activePreview?.aiInProgress&&activePreview.buildPreviewTicket===ticket)clearPreview();},onOperationProgress:value=>{const id=externalAutomation?.currentRequestId();if(id!==null&&id!==undefined)window.offlinecadDesktop?.automationProgress?.({id,...value});},onProgress:value=>{progress.textContent='Berechnung abbrechen · '+Math.round(value*100)+' %';},reuseTranslations:true,prepareCommit:async (candidate,{preparedView,quality:preparedQuality}={})=>{const displayQuality=JSON.stringify(quality.get().display),prepared=preparedView&&JSON.stringify(preparedQuality)===displayQuality,display=prepared?preparedView:await controller.display(candidate);const scene=prepared?preparedView.scene:await controller.describe(candidate);view.validateDisplay(display,candidate);preparedDisplay={display,quality:displayQuality,scene};return {meshes:display.meshes,scene,revision:scene.revision};},onChange:(_next,_state,hints)=>{if(cornerSession&&!cornerSession.ownsRevision())cornerSession.finish({abort:false});window.offlinecadDesktop?.automationState?.({revision:_state.revision});const scope=controller.projectScope();if(scope!==assemblyScope){if(!assemblyOpening)assemblyDisplay.restore(_next.workspace?.loadSet??null,_next);assemblyScope=scope;}else{const added=_next.nodes.filter(n=>!assemblyKnownIds.has(n.id)).map(n=>n.id);if(added.length&&assemblyDisplay.ids(_next)!==null)assemblyDisplay.load(added,_next);}assemblyDisplay.sync(_next);assemblyKnownIds=new Set(_next.nodes.map(n=>n.id));if(hints?.drawingsOnly&&nativeScene){nativeScene={...nativeScene,revision:controller.revision(),projectVersion:_next.version};lastDisplayed=controller.revision();preparedDisplay=null;if(sourceDisplayKey)sourceDisplayKey=sourceViewKey();}clearPreview();partPropertiesUI?.revisionChanged();featureUI?.revisionChanged();referenceRebindUI?.revisionChanged();aiUI?.chat.refreshFeatureReferences();jointsUI?.revisionChanged();drawingUI?.revisionChanged();projectParametersUI?.revisionChanged();meshHoleFillUI?.revisionChanged();meshRepairUI?.revisionChanged();meshReduceUI?.revisionChanged();meshRemeshUI?.revisionChanged();meshSmoothUI?.revisionChanged();meshSculptUI?.revisionChanged();meshEraseFillUI?.revisionChanged();meshMakeSolidUI?.revisionChanged();meshHollowUI?.revisionChanged();meshFeaturesUI?.revisionChanged();meshInspectorUI?.revisionChanged();meshSelectionUI?.revisionChanged();meshCopyUI?.revisionChanged();tools?.revisionChanged();inspectionUI?.revisionChanged();thicknessUI?.revisionChanged();meshTools?.revisionChanged();meshExtras?.revisionChanged();workplaneUI?.revisionChanged();sketchUI?.revisionChanged();modelingUI?.revisionChanged();advancedFreeCADUI?.revisionChanged();functionsUI?.revisionChanged();scheduleRefresh();}});

let refreshQueued=false;

const project=()=>controller.readSnapshot(),getSelection=()=>copy(selection),getScene=()=>nativeScene;
const {duplicate,copySelection,paste,isPasteDisabled}=createClipboard({controller,project,selected,activeEasyKind,execute,mutate,select,updateState,toast});
const { workspace, workspaceSignature, serializeWorkspace, save, saveFromAutomation, openEncoded, openFile, openProject, openWelcomeExample } = createWorkspaceIO({
  window, fetch: (...args) => fetch(...args), $, t, controller, project, getSelection, quality, assemblyDisplay, packFiles,
  readyForFile, confirmProjectChange, cacheWelcomePackageThumbnail, download, toast, updateState,
  scheduleRefresh, updateIsolation: () => updateIsolation(), setQuality, setPreferences, setMode, select, activeEasyKind,
  // The entry, file actions and autosave all share the same live session.
  runtime: {
    get view() { return view; },
    get partPropertiesUI() { return partPropertiesUI; },
    get inspectionUI() { return inspectionUI; },
    get meshExtras() { return meshExtras; },
    get meshSelectionUI() { return meshSelectionUI; },
    get ui() { return ui; },
    get preferences() { return preferences; },
    get layoutUI() { return layoutUI; },
    get isolation() { return isolation; },
    get workbenchUI() { return workbenchUI; },
    get refreshTask() { return refreshTask; },
    get preferredProjectFormat() { return preferredProjectFormat; }, set preferredProjectFormat(value) { preferredProjectFormat = value; },
    get fileBusy() { return fileBusy; }, set fileBusy(value) { fileBusy = value; },
    get activeProjectFile() { return activeProjectFile; }, set activeProjectFile(value) { activeProjectFile = value; },
    get savedRevision() { return savedRevision; }, set savedRevision(value) { savedRevision = value; },
    get cleanRevision() { return cleanRevision; }, set cleanRevision(value) { cleanRevision = value; },
    get savedWorkspaceSignature() { return savedWorkspaceSignature; }, set savedWorkspaceSignature(value) { savedWorkspaceSignature = value; },
    get cleanWorkspaceSignature() { return cleanWorkspaceSignature; }, set cleanWorkspaceSignature(value) { cleanWorkspaceSignature = value; },
    get recoveredProject() { return recoveredProject; }, set recoveredProject(value) { recoveredProject = value; },
    get assemblyOpening() { return assemblyOpening; }, set assemblyOpening(value) { assemblyOpening = value; },
    get assemblyScope() { return assemblyScope; }, set assemblyScope(value) { assemblyScope = value; },
    get assemblyKnownIds() { return assemblyKnownIds; }, set assemblyKnownIds(value) { assemblyKnownIds = value; },
    get nextImportIndex() { return nextImportIndex; }, set nextImportIndex(value) { nextImportIndex = value; },
    get lastDisplayed() { return lastDisplayed; }, set lastDisplayed(value) { lastDisplayed = value; },
    get preparedDisplay() { return preparedDisplay; }, set preparedDisplay(value) { preparedDisplay = value; },
  },
});
const recoveryActions = createRecoveryActions({
  window,
  controller,
  project,
  workspace,
  workspaceSignature,
  serializeWorkspace,
  recovery,
  recoveryEncoder,
  updateSaveState,
  safe,
  toast,
  errorReporter,
  isBusy: () => busy || fileBusy,
  hasActiveTool: () =>
    meshHoleFillUI?.state() ||
    meshRepairUI?.state() ||
    meshReduceUI?.state() ||
    meshRemeshUI?.state() ||
    meshSmoothUI?.state() ||
    meshSculptUI?.state() ||
    meshEraseFillUI?.state() ||
    meshMakeSolidUI?.state() ||
    meshHollowUI?.state() ||
    meshFeaturesUI?.state() ||
    meshSelectionUI?.state() ||
    meshSelectionUI?.isChecking() ||
    activePreview ||
    modelingUI?.state() ||
    advancedFreeCADUI?.state() ||
    tools?.state()?.preview ||
    meshTools?.state() ||
    inspectionUI?.state() ||
    thicknessUI?.state() ||
    meshExtras?.state() ||
    workplaneUI?.state() ||
    view.isEditing() ||
    layoutUI.isActive() ||
    layoutUI.isSaving(),
  isMeshSelectionChecking: () => meshSelectionUI?.isChecking(),
  runtime: {
    get autosave() {
      return preferences.autosave;
    },
    get startupEmptyRevision() {
      return startupEmptyRevision;
    },
    get startupRecoveryFailed() {
      return startupRecoveryFailed;
    },
    get cleanRevision() {
      return cleanRevision;
    },
    get savedRevision() {
      return savedRevision;
    },
  },
});
const welcome=mountCadWelcome({root:$('empty-hint'),open:openWelcomeExample,safe,t});
if(window.offlinecadDesktop?.practiceReady)welcome.dismiss();

cleanRevision=controller.revision();

const isolation=createCadIsolation();

function context(target,p=project()){return cadSelectionContext(p,target);}

function selected({roots=false,cad=false,editable=false}={}){if(!selection.length)throw Error('Bitte ein Teil auswählen.');const p=project(),list=selection.map(value=>context(value,p));if(list.some(value=>!domainAllowsId(value.target.rootId,p)))throw Error('Die Auswahl gehört zu einem anderen Arbeitsbereich.');if(roots&&list.some(value=>value.target.path.length))throw Error('Für dieses Werkzeug fertige Teile auswählen.');if(cad&&list.some(value=>value.node.kind!=='cad'))throw Error('Dieses Werkzeug benötigt CAD-Körper.');if(editable&&list.some(value=>value.locked))throw Error('Ein ausgewähltes Teil oder sein Container ist gesperrt.');return list;}

function workFrame(p=project()){return new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion(...p.workplane.orientation)).setPosition(...p.workplane.origin).toArray();}

function activeFrame(p=project()){return p.coordinateMode==='plane'?workFrame(p):cadIdentity();}

function select(values,append=false){const p=project();values=values.filter(value=>domainAllowsId(value.rootId,p));isolation.include(p,values);updateIsolation();const valid=values.filter(value=>{try{context(value,p);return true;}catch{return false;}}),combined=append?[...selection,...valid]:valid,seen=new Set(),key=value=>JSON.stringify([value.rootId,value.path]),unique=combined.filter(value=>{const id=key(value);if(seen.has(id))return false;seen.add(id);return true;});selection=copy(unique.filter(value=>!value.path.some((_,index)=>seen.has(key({rootId:value.rootId,path:value.path.slice(0,index)})))));view.setSelection(selection,nativeScene);ui?.refresh();aiUI?.chat.refreshSelection();featureUI?.selectionChanged();jointsUI?.selectionChanged();projectParametersUI?.selectionChanged();meshHoleFillUI?.selectionChanged();meshRepairUI?.selectionChanged();meshReduceUI?.selectionChanged();meshRemeshUI?.selectionChanged();meshSmoothUI?.selectionChanged();meshSculptUI?.selectionChanged();meshEraseFillUI?.selectionChanged();meshMakeSolidUI?.selectionChanged();meshHollowUI?.selectionChanged();meshFeaturesUI?.selectionChanged();meshInspectorUI?.selectionChanged();meshSelectionUI?.selectionChanged();meshCopyUI?.selectionChanged();tools?.selectionChanged();inspectionUI?.selectionChanged();thicknessUI?.selectionChanged();meshTools?.selectionChanged();meshExtras?.selectionChanged();sketchUI?.selectionChanged();modelingUI?.selectionChanged();advancedFreeCADUI?.selectionChanged();updateState();void safe(showSource);if(alignment){if(selection.length<2||selection.some(v=>v.path.length))escape();else{alignment.ids=selection.map(v=>v.rootId);if(!alignment.ids.includes(alignment.referenceId))alignment.referenceId=null;void safe(refreshAlignment);}}}

async function refresh(){
  partPropertiesUI?.beforeDisplay();

  const ticket=++refreshTicket,revision=controller.revision(),scope=controller.projectScope(),p=project();const scene=nativeScene?.revision===revision&&nativeSceneScope===scope?{...nativeScene,selection:copy(selection)}:preparedDisplay?.scene?.revision===revision?{...preparedDisplay.scene,selection:copy(selection)}:await controller.describe(p,selection);

  if(ticket!==refreshTicket||revision!==controller.revision())return;

  isolation.sync(p);updateIsolation();

  selection=selection.filter(value=>{try{context(value,p);return view.allows(value.rootId);}catch{return false;}});

  if(lastDisplayed!==revision){const display=preparedDisplay?.display.revision===revision&&preparedDisplay.quality===JSON.stringify(quality.get().display)?preparedDisplay.display:await controller.display(p);if(ticket!==refreshTicket||revision!==controller.revision()||scope!==controller.projectScope())return;nativeScene=scene;nativeSceneScope=scope;view.setDisplay(display,p);lastDisplayed=revision;preparedDisplay=null;}else{nativeScene=scene;nativeSceneScope=scope;view.setSelection(selection,scene);}

  if(assemblyDisplay.ids(p)!==null||view.assemblyBoxesState().parts)view.setAssemblyBoxes(assemblyDisplay.boxes(p));updateAssemblyNotice();partPropertiesUI?.afterDisplay();marksView?.setScene(nativeScene);ui?.refresh();aiUI?.chat.refreshSelection();updateState();await showSource();await refreshAlignment();await meshSelectionUI?.sync();await meshInspectorUI?.sync();

  // Model and view recovery share the idle writer below; no disk write in a drag commit.

}

function scheduleRefresh(){if(refreshQueued)return refreshTask;refreshQueued=true;refreshTask=refreshTask.catch(()=>{}).then(()=>{refreshQueued=false;return refresh();});void safe(()=>refreshTask);return refreshTask;}

function assertReferenceRebindIdle(){if(referenceRebindUI?.state())throw Error('Bezugsneuzuordnung zuerst übernehmen oder abbrechen.');}
async function mutate(fn,label='CAD bearbeiten',{revision=controller.revision()}={}){assertReferenceRebindIdle();if(partPropertiesUI?.editing())throw Error('Teileeigenschaften zuerst übernehmen oder schließen.');if(meshSculptUI?.state())throw Error('Modellierpinsel zuerst übernehmen oder abbrechen.');const draft=controller.snapshot();await fn(draft);const proposal=await controller.preview(undefined,{project:draft,revision,label});const result=controller.apply({previewId:proposal.previewId,revision:proposal.revision});await refreshTask;if(result.warnings?.length)toast(result.warnings.join(' '));return result;}

async function execute(operation,options={}){assertReferenceRebindIdle();if(partPropertiesUI?.editing())throw Error('Teileeigenschaften zuerst übernehmen oder schließen.');if(meshSculptUI?.state())throw Error('Modellierpinsel zuerst übernehmen oder abbrechen.');const result=await controller.execute(operation,options);await refreshTask;if(result.warnings?.length)toast(result.warnings.join(' '));return result;}

async function applyProposal(proposal){assertReferenceRebindIdle();if(partPropertiesUI?.editing())throw Error('Teileeigenschaften zuerst übernehmen oder schließen.');const result=controller.apply({previewId:proposal.previewId,revision:proposal.revision});await refreshTask;if(result.warnings?.length)toast(result.warnings.join(' '));return result;}

let practicePlayback=null;
async function showBuildPreview({project:p,completed,total,revision,ticket}){
 if((!readAIModelLivePreviewEnabled()&&!practicePlayback?.isRunning())||controller.revision()!==revision)return;const id='ai-build-'+revision+'-'+completed;activePreview={previewId:id,aiInProgress:true,buildPreviewTicket:ticket,automationRequestId:externalAutomation?.previewRequestId()??null};
 const display=await controller.display(p);if(controller.revision()!==revision||activePreview?.previewId!==id)return;
 view.setPreview(display.meshes,p,controller.readSnapshot().nodes.map(n=>n.id));view.setAIResultMarks(null);updateEmptyHint();
 const banner=$('cad-ai-preview-banner');if(banner){banner.hidden=false;banner.querySelector('span').textContent='KI baut · Schritt '+completed+' / '+total+' · noch nicht übernommen';banner.querySelectorAll('button').forEach(button=>button.disabled=true);aiUI?.refreshRunningPreview?.();}
 if(!new URL(location.href).searchParams.has('practice')&&(completed===1||completed===Math.ceil(total/2)))view.fit([],{includePreview:true});await view.renderReady();
 await practicePlayback?.onBuildPreview({completed,total});
}

async function showPreview(proposal,ids,replaceIds=[]){activePreview=proposal;const p=controller.getPreview(proposal.previewId)?.project;if(!p)return;const display=await controller.display(p),scene=proposal.scene??await controller.describe(p);if(activePreview?.previewId===proposal.previewId){const failedIds=new Set(aiPreviewErrorMarks(proposal.verification).rootIds),meshes=display.meshes.map(mesh=>failedIds.has(mesh.rootId??mesh.id)?{...mesh,previewColor:AI_ERROR_COLOR}:mesh);view.setPreview(ids?meshes.filter(mesh=>ids.includes(mesh.rootId??mesh.id)):meshes,p,replaceIds);view.setAIResultMarks(proposal.verification);updateEmptyHint();marksView?.setPreview(scene);thicknessUI?.comparison.offerPreview({previewId:proposal.previewId,ids:ids??display.meshes.map(m=>m.rootId??m.id),replaceIds});}}

function updateEmptyHint(){welcome.update({hasContent:!!project().nodes.length,hasPreview:!!activePreview});}
function clearPreview(){if(activePreview?.previewId)window.offlinecadDesktop?.automationState?.({closedPreviewId:activePreview.previewId,revision:controller.revision()});aiUI?.previewCleared();thicknessUI?.comparison.offerPreview(null);activePreview=null;view?.clearPreview();marksView?.clearPreview();updateEmptyHint();}

function sourceViewKey(){return JSON.stringify([controller.projectScope(),controller.revision(),selection.map(targetKey),quality.get().display]);}
async function showSource(){
  if(!view.setSourceDisplay)return;
  const key=sourceViewKey();if(sourceDisplayKey===key)return;
  const ticket=++sourceTicket,targets=selection.filter(target=>target.path.length&&assemblyDisplay.isLoaded(target.rootId)),revision=controller.revision();
  if(!targets.length){sourceDisplayKey=null;view.clearSource();return;}
  const p=project(),nodes=[];
  for(const target of targets){const info=nativeScene?.objects.find(value=>targetKey(value.target)===targetKey(target));if(!info||info.kind!=='cad')continue;const node=copy(context(target,p).node);node.transform=info.worldMatrix;node.layerId=p.activeLayerId;node.folderId=p.activeFolderId;node.source='step';for(const field of ['children','operation','finish','partition','extraction','modeling','drill','recipe','suppressed','multicolor'])delete node[field];node.hidden=false;nodes.push(node);}
  if(!nodes.length){sourceDisplayKey=key;view.clearSource();view.setSelection(selection,nativeScene);return;}
  const candidate={...p,nodes,workplane:{...p.workplane,reference:null}},display=await controller.display(candidate,undefined,{ids:candidate.nodes.map(n=>n.id)});
  if(ticket===sourceTicket&&controller.revision()===revision&&sourceViewKey()===key&&!view.isDragging()){view.setSourceDisplay(display.meshes,candidate,targets);sourceDisplayKey=key;view.setSelection(selection,nativeScene);}
}function previewGearGesture({targets,delta}){
 if(!preferences.gearSnap||targets.length!==1||targets[0].path.length)return null;const p=controller.readSnapshot(),id=targets[0].rootId,n=p.nodes.find(n=>n.id===id);if(n?.recipe?.type!=='gear')return null;
 const candidate={...p,nodes:p.nodes.map(node=>node.id===id?{...node,transform:multiplyCadMatrices(delta,node.transform)}:node)},snap=findCadGearSnap(candidate,id,{angleStep:preferences.gearSnapAngle});
 return snap?multiplyCadMatrices(snap.transform,inverseCadMatrix(n.transform)):null;
}
async function snapLooseGear(draft,id){
 const snap=findCadGearSnap(draft,id,{enabled:preferences.gearSnap,angleStep:preferences.gearSnapAngle});if(!snap)return null;
 return applyCadGearSnap(draft,snap,{createCarrier:async center=>{const proposal=await controller.preview({kind:'batch',commands:[{op:'create',type:'box',size:[.1,.1,.1],pos:center,name:'Zahnrad-Bezugsträger (automatisch)',as:'gearCarrier'}]},{project:draft,revision:controller.revision(),label:'Zahnrad-Bezugsträger'});try{return copy(proposal.project.nodes.find(n=>n.id===proposal.aliases.gearCarrier));}finally{controller.discard(proposal.previewId);}}});
}
function reportGearSnap(result){if(!result)return;const name=project().nodes.find(n=>n.id===result.anchorId)?.name??'Zahnrad';toast('An '+name+' eingerastet · '+result.teethA+':'+result.teethB+' · Drehung gekoppelt'+(result.createdCarrier?' · ausgeblendeter Bezugsträger angelegt':'')+'. Bewegung unter CAD-Werkzeuge → Gelenke und Bewegung.');}
async function gesture({targets,delta,revision,exactTranslation=false}){let snapped;const result=await mutate(async draft=>{for(const target of targets){const value=context(target,draft);if(value.locked)throw Error('Das Teil ist gesperrt.');value.node.transform=multiplyCadMatrices(multiplyCadMatrices(inverseCadMatrix(value.parentWorld),delta),value.world);}if(!exactTranslation&&targets.length===1&&!targets[0].path.length&&delta.slice(0,12).every((v,k)=>Math.abs(v-([0,5,10].includes(k)?1:0))<1e-9))snapped=await snapLooseGear(draft,targets[0].rootId);},'CAD-Auswahl transformieren',{revision});reportGearSnap(snapped);return {...result,snapped:!!snapped};}

function resizeDraft(draft,{target,size,corner,item}){
 const value=context(target,draft);
 if(value.locked)throw Error('Das Teil ist gesperrt.');
 const info=item??nativeScene.objects.find(record=>targetKey(record.target)===targetKey(target));
 const node=value.node;
 Object.assign(node,resizeCadAtCorner(node.kind==='cad'?{...node,stats:{...node.stats,bounds:{min:info.localBounds.min,max:info.localBounds.max}}}:node,size,{corner}));
}
async function resize({target,size,corner,revision}){
 await mutate(draft=>resizeDraft(draft,{target,size,corner}),'CAD-Eckmaße ändern',{revision});
}

function scalingPending(){return !!cornerSession||scaleApplyPending||view.isScalePending();}
function dimensions({target,corner,item}){
 const sizes=item.localBounds.size.map((v,k)=>v*Math.hypot(item.transform[k*4],item.transform[k*4+1],item.transform[k*4+2]));
 modal('Eckmaße','<p>Die gegenüberliegende Ecke und der lokale Boden bleiben stehen.</p><div class="input-row">'+sizes.map((value,k)=>'<label>'+['X','Y','Z'][k]+'<input id="corner-size-'+k+'" type="text" inputmode="decimal" value="'+formatUiNumber(value,preferences.language)+'"></label>').join('')+'</div><div class="modal-actions"><button id="corner-apply" class="primary">Übernehmen</button></div>',{modeless:true});
 const revision=controller.revision(),scope=controller.projectScope(),dialog=$('modal'),button=$('corner-apply');
 const inputs=sizes.map((_,k)=>$('corner-size-'+k));
 const inputSize=()=>inputs.map((input,k)=>preserveUiNumber(Number(input.value.trim().replace(',','.')),sizes[k]));
 const equalSize=(left,right)=>left.every((value,k)=>value===right[k]);
 const valid=size=>size.every(value=>Number.isFinite(value)&&value>=.01&&value<=10000);
 const ownsRevision=()=>scope===controller.projectScope()&&revision===controller.revision();
 let sequence=0,timer=null,running=null,latest=null,prepared=null,failure=null,exactShown=false,closed=false;
 const dialogSequence=modalSequence;
 dialog.classList.add('cad-corner-dialog');
 const current=()=>!closed&&cornerSession===session&&dialog.open&&dialogSequence===modalSequence&&ownsRevision();
 function discardPrepared(){
  if(exactShown&&ownsRevision())view.clearPreview();
  exactShown=false;
  if(prepared)controller.discard(prepared.previewId);
  prepared=null;
 }
 function startLatest(){
  if(running||timer!==null||!latest||!current())return;
  const request=latest;
  latest=null;
  running=Promise.resolve().then(async()=>{
   if(!current()||sequence!==request.sequence)return;
   let proposal;
   try{
    const draft=controller.snapshot();
    resizeDraft(draft,{target,corner,item,size:request.size});
    proposal=await controller.preview(undefined,{revision,project:draft,label:'CAD-Eckmaße ändern',intermediateDisplay:'final'});
    if(!current()||sequence!==request.sequence){controller.discard(proposal.previewId);return;}
    prepared=proposal;view.markCornerPreviewReady();
    const display=preparedDisplay?.display;
    if(!target.path.length&&!activePreview&&display?.revision===proposal.resultRevision){
     const meshes=display.meshes.filter(mesh=>(mesh.rootId??mesh.id)===target.rootId);
     if(meshes.length){view.setPreview(meshes,proposal.project,[target.rootId]);exactShown=true;}
    }
   }catch(error){
    if(proposal)controller.discard(proposal.previewId);
    if(current()&&sequence===request.sequence){failure=error;discardPrepared();view.clearCornerPreview();}
   }
  }).finally(()=>{running=null;startLatest();});
 }
 let requestedSize=null;
 function requestSize(size){
  sequence++;clearTimeout(timer);timer=null;latest=null;failure=null;requestedSize=null;
  discardPrepared();
  if(!current()||!valid(size)||equalSize(size,sizes)){view.clearCornerPreview();return;}
  requestedSize=size;
  view.previewCornerSize({item,corner,size});
  latest={size,sequence};
  timer=setTimeout(()=>{timer=null;startLatest();},150);
 }
 function finish({abort=true,close=true}={}){
  if(closed)return;
  closed=true;sequence++;clearTimeout(timer);timer=null;latest=null;
  if(cornerSession===session)cornerSession=null;
  discardPrepared();view.clearCornerPreview();
  if(abort&&running&&ownsRevision()&&controller.cancel()){lastDisplayed=null;preparedDisplay=null;void safe(scheduleRefresh);}
  dialog.classList.remove('cad-corner-dialog');
  if(close&&dialog.open&&dialogSequence===modalSequence)dialog.close();
  updateState();
 }
 const session={finish,ownsRevision};cornerSession=session;
 dialog.addEventListener('close',()=>finish({close:false}),{once:true});
 updateState();
 button.onclick=()=>safe(async()=>{
  if(button.disabled)return;
  const size=inputSize();
  if(equalSize(size,sizes)){dialog.close();return;}
  if(!valid(size))throw Error('Ungültige Eckmaße.');
  if(!current())throw Error('Das Projekt wurde inzwischen geändert.');
  if(!requestedSize||!equalSize(size,requestedSize)||failure)requestSize(size);
  clearTimeout(timer);timer=null;startLatest();
  button.disabled=true;for(const input of inputs)input.disabled=true;
  try{
   while(running)await running;
   if(!current())return;
   if(failure)throw failure;
   if(!prepared)throw Error('Die genaue Skalierungsvorschau fehlt.');
   const proposal=prepared;prepared=null;
   scaleApplyPending=true;
   try{await applyProposal(proposal);}finally{scaleApplyPending=false;}
   finish({abort:false});
  }finally{button.disabled=false;for(const input of inputs)input.disabled=false;}
 });
 for(const input of inputs){
  input.oninput=()=>requestSize(inputSize());
  input.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();button.click();}};
 }
}

const view=createCadRenderer({host:$('canvas-host'),viewport:$('viewport'),getProject:project,getScene,getSelection,select,canEdit:()=>!!window.__cadReady&&!cornerSession&&!scaleApplyPending&&(!partPropertiesUI?.editing()||partPropertiesUI?.picking())&&!partPropertiesUI?.exploded()&&(!referenceRebindUI?.state()||referenceRebindUI.state().picking)&&!jointsUI?.state()&&!busy&&nativeSceneScope===controller.projectScope()&&nativeScene?.revision===controller.revision()&&(!selection.some(t=>t.path.length)||sourceDisplayKey===sourceViewKey()),onGesture:gesture,onSnapGesture:previewGearGesture,onResize:resize,onDimensions:dimensions,onError:error=>safe(()=>{throw error;}),getPreferences:()=>preferences,onViewUpdate:()=>{alignmentMarks?.draw();tools?.draw?.();marksView?.draw();}});

const isolationNotice=document.createElement('div');isolationNotice.id='cad-isolation-notice';isolationNotice.setAttribute('role','status');isolationNotice.hidden=true;

const isolationText=document.createElement('span'),isolationEnd=document.createElement('button');isolationText.textContent='Auswahl isoliert';isolationEnd.textContent='Isolation beenden';isolationEnd.dataset.action='end-isolation';isolationEnd.onclick=()=>endIsolation();isolationNotice.append(isolationText,isolationEnd);$('viewport').append(isolationNotice);

const isolationButton=document.createElement('button');isolationButton.dataset.action='isolate';isolationButton.textContent='Auswahl isolieren';document.querySelector('[data-action="hide"]').after(isolationButton);

const { updateIsolation, endIsolation, isolateSelection } = createIsolation({
  isolation, isolationNotice, view, project, activeEasyKind, readyForFile, getSelection, escape,
  getLiveSelection: () => selection, getScene,
  refreshMarkerVisibility: () => marksView?.visibilityChanged(), refreshUi: () => ui?.refresh(),
});

function framePracticeConstruction(rootId){
 const targets=[{rootId,path:[]}],priorIds=isolation.state(),priorView=view.viewState(),scope=controller.projectScope();
 const p=project();
 if(!cadPermanentlyVisible(p.nodes.find(node=>node.id===rootId),p))return;
 isolation.start(p,targets);updateIsolation();
 view.setView('iso');
 const refit=()=>{if(controller.projectScope()===scope)view.fit(targets);};
 refit();
 return {refit,restore(){
  if(controller.projectScope()!==scope)return;
  const p=project(),prior=(priorIds??[]).filter(id=>cadPermanentlyVisible(p.nodes.find(node=>node.id===id),p));
  if(prior.length)isolation.start(p,prior.map(rootId=>({rootId,path:[]})));else isolation.end();
  updateIsolation();
  view.restoreView(priorView);
 }};
}

function queryVisibleRay(ray){if(scalingPending())return Promise.resolve(null);const ids=visibleCadIds();return ids.length?controller.query('rayPick',{ray,ids}):Promise.resolve(null);}

function visibleCadIds(){return project().nodes.filter(n=>isolation.visible(n,project())&&view.allows(n.id)&&n.kind==='cad').map(n=>n.id);}

function updateSaveState(signature=workspaceSignature()){
 const {pending,error}=recoveryActions.readStatus();
 const label=pending?'Sicherung läuft':error?'Autosicherung fehlgeschlagen':controller.revision()===savedRevision&&signature===savedWorkspaceSignature?'Gespeichert · lokal':'Lokal · ohne Cloud';
 const status=$('save-state'),text=t(label);
 if(status.textContent!==text)status.textContent=text;
 status.title=error??activeProjectFile?.path??'';
}

if($('gear-snap'))$('gear-snap').onchange=()=>safe(()=>setPreferences({...preferences,gearSnap:$('gear-snap').checked}));
if($('gear-snap-angle'))$('gear-snap-angle').onchange=()=>safe(()=>setPreferences({...preferences,gearSnapAngle:Number($('gear-snap-angle').value)}));
function updateState(){const attachmentNode=selection.length===1&&!selection[0].path.length?project().nodes.find(n=>n.id===selection[0].rootId):null;for(const b of document.querySelectorAll('[data-action=sketch-on-part]'))b.disabled=busy||!attachmentNode||!['cad','mesh'].includes(attachmentNode.kind)||flags(attachmentNode,project()).hidden||flags(attachmentNode,project()).locked||!view.allows(attachmentNode.id)||(attachmentNode.kind==='cad'?!attachmentNode.solid:attachmentNode.meshRole==='hole');const centerButton=document.querySelector('[data-action="center"]');if(centerButton)centerButton.disabled=busy||!selection.length||selection.some(target=>{try{const c=context(target);return c.locked||c.hidden||!domainAllowsId(target.rootId);}catch{return true;}});easyRepair?.schedule();const repairButton=document.querySelector('[data-action="mesh-repair"]'),repairSource=selection.length===1&&!selection[0].path.length?project().nodes.find(n=>n.id===selection[0].rootId):null;if(repairButton)repairButton.disabled=busy||!repairSource||repairSource.kind!=='mesh'||flags(repairSource,project()).hidden||flags(repairSource,project()).locked||!view.allows(repairSource.id);const holeButton=document.querySelector('[data-action="mesh-close-hole"]');if(holeButton)holeButton.disabled=repairButton?.disabled??true;const p=project(),state=controller.state(),inspectionButton=document.querySelector('[data-action="mesh-inspector"]'),inspectionNode=selection.length===1&&!selection[0].path.length?p.nodes.find(n=>n.id===selection[0].rootId):null;if(inspectionButton)inspectionButton.disabled=busy||!inspectionNode||inspectionNode.kind!=='mesh'||flags(inspectionNode,p).hidden||!view.allows(inspectionNode.id);const surfaceButton=document.querySelector('[data-action="mesh-select"]'),surfaceSource=selection.length===1&&!selection[0].path.length?p.nodes.find(n=>n.id===selection[0].rootId):null;if(surfaceButton){const allowed=!!surfaceSource&&surfaceSource.kind==='mesh'&&!flags(surfaceSource,p).hidden&&!flags(surfaceSource,p).locked&&view.allows(surfaceSource.id);surfaceButton.disabled=busy||!allowed;surfaceButton.title=allowed?'Dreiecke, Oberflächen und Öffnungsränder auswählen':'Ein sichtbares, entsperrtes vollständiges Netzteil auswählen';}const reduceButton=document.querySelector('[data-action="mesh-reduce"]');if(reduceButton)reduceButton.disabled=busy||!surfaceSource||surfaceSource.kind!=='mesh'||flags(surfaceSource,p).hidden||flags(surfaceSource,p).locked||!view.allows(surfaceSource.id);const largeReduceButton=document.querySelector('[data-action="mesh-large-reduce"]');if(largeReduceButton)largeReduceButton.disabled=reduceButton?.disabled??true;const curvedButton=document.querySelector('[data-action="mesh-curved-reduce"]');if(curvedButton)curvedButton.disabled=reduceButton?.disabled??true;const remeshButton=document.querySelector('[data-action="mesh-remesh"]');if(remeshButton)remeshButton.disabled=reduceButton?.disabled??true;const smoothButton=document.querySelector('[data-action="mesh-smooth"]');if(smoothButton)smoothButton.disabled=reduceButton?.disabled??true;const sculptButton=document.querySelector('[data-action="mesh-sculpt"]');if(sculptButton)sculptButton.disabled=reduceButton?.disabled??true;const eraseFillButton=document.querySelector('[data-action="mesh-erase-fill"]');if(eraseFillButton)eraseFillButton.disabled=reduceButton?.disabled??true;const makeSolidButton=document.querySelector('[data-action="mesh-make-solid"]');if(makeSolidButton)makeSolidButton.disabled=reduceButton?.disabled??true;const hollowButton=document.querySelector('[data-action="mesh-hollow"]');if(hollowButton)hollowButton.disabled=reduceButton?.disabled??true;const featuresButton=document.querySelector('[data-action="mesh-features"]');if(featuresButton)featuresButton.disabled=(reduceButton?.disabled??true)||surfaceSource?.meshRole==='hole';const meshCadButton=document.querySelector('[data-action="mesh-to-cad"]');if(meshCadButton){const n=selection.length===1&&!selection[0].path.length?p.nodes.find(n=>n.id===selection[0].rootId):null;meshCadButton.disabled=busy||!hasLocalStlConverter()||!n||n.kind!=='mesh'||n.meshRole==='hole'||flags(n,p).hidden||flags(n,p).locked;}const copyButton=document.querySelector('[data-action="cad-to-mesh"]'),copySource=selection.length===1&&!selection[0].path.length?p.nodes.find(n=>n.id===selection[0].rootId):null;if(copyButton)copyButton.disabled=busy||!copySource||copySource.kind!=='cad'||!copySource.solid||!!copySource.suppressed||flags(copySource,p).hidden||flags(copySource,p).locked;updateEmptyHint();workbenchUI?.refreshDomain();contextMenuUI?.refresh();const sourceEdit=$('easy-edit-source'),sourceNode=selection.length===1&&!selection[0].path.length?p.nodes.find(node=>node.id===selection[0].rootId):null;if(sourceEdit){sourceEdit.hidden=!sourceNode||sourceNode.kind!=='mesh'||!sourceNode.meshSource;sourceEdit.disabled=busy||!!sourceNode&&flags(sourceNode,p).locked;}updateSaveState();document.querySelector('[data-action="undo"]').disabled=busy||!state.undo;document.querySelector('[data-action="redo"]').disabled=busy||!state.redo;document.querySelector('[data-action="paste"]').disabled=isPasteDisabled(busy);$('magnet-mode').disabled=busy||selection.length!==1||selection[0]?.path.length||!p.nodes.some(node=>node.id===selection[0]?.rootId&&['cad','mesh'].includes(node.kind));const chosen=selection.length===1&&!selection[0].path.length?nativeScene?.objects.find(n=>n.id===selection[0].rootId&&!n.target.path.length):null;for(const action of ['reference-place','drill','split','extract'])document.querySelectorAll('[data-action="'+action+'"]').forEach(button=>{button.disabled=busy||!chosen||(chosen.kind!=='cad'&&chosen.kind!=='mesh')||chosen.hidden||chosen.locked||action==='drill'&&(chosen.kind==='cad'?!chosen.solid:chosen.meshRole==='hole');});const modelingNodes=selection.filter(v=>!v.path.length).map(v=>p.nodes.find(n=>n.id===v.rootId)),modelingValid=selection.length===modelingNodes.length&&modelingNodes.length>0&&modelingNodes.every(n=>n&&n.kind==='cad'&&n.solid&&!flags(n,p).hidden&&!flags(n,p).locked&&view.allows(n.id));for(const action of ['cad-contour','cad-face-offset','cad-shell','cad-loft','cad-sweep'])for(const b of document.querySelectorAll('[data-action="'+action+'"]'))b.disabled=busy||!modelingValid||(action==='cad-loft'?(modelingNodes.length<2||modelingNodes.length>8):modelingNodes.length!==1)||['cad-loft','cad-sweep'].includes(action)&&modelingNodes.some(n=>n.source!=='native'||n.recipe?.type!=='sketch');for(const action of ['cad-draft','cad-defeature','cad-revolution','cad-helix'])for(const b of document.querySelectorAll('[data-action="'+action+'"]'))b.disabled=busy||action!=='cad-helix'&&(!modelingValid||modelingNodes.length!==1);for(const action of ['cad-surface-fill','cad-surface-transition','cad-surface-sew','cad-surface-relief'])for(const b of document.querySelectorAll('[data-action="'+action+'"]'))b.disabled=busy||action!=='cad-surface-fill'&&(!modelingValid||modelingNodes.length>8);for(const b of document.querySelectorAll('[data-action=cad-edit-modeling]'))b.disabled=busy||!modelingValid||modelingNodes.length!==1||modelingNodes[0].source!=='modeling'||!['face-offset','shell','sweep','loft'].includes(modelingNodes[0].modeling?.kind);let contourSource=null;try{if(selection.length===1)contourSource=context(selection[0],p);}catch{ /* Leave the optional contour source unset when the selection cannot be resolved. */ }for(const b of document.querySelectorAll('[data-action=cad-contour]'))b.disabled=busy||!contourSource||contourSource.node.kind!=='cad'||!contourSource.node.solid||contourSource.locked||contourSource.hidden||contourSource.chain.some(node=>node.suppressed)||!view.allows(contourSource.root.id);for(const b of document.querySelectorAll('[data-action=linked-contours]'))b.disabled=busy;}

const themeBinding=createThemeBinding({document,media:matchMedia('(prefers-color-scheme: dark)'),setViewTheme:dark=>view.setTheme(dark)});
themeBinding.set(preferences.theme);
window.addEventListener('unload',()=>themeBinding.dispose(),{once:true});
function setPreferences(value,{persist=true}={}){const next=validatePreferences(value),languageChanged=preferences.language!==next.language;if(persist)storage.setItem('offlinecad-settings-v1',JSON.stringify({...next,theme: 'system'}));preferences=next;themeBinding.set(next.theme);$('snap').value=String(next.snap);if($('gear-snap'))$('gear-snap').checked=next.gearSnap;if($('gear-snap-angle'))$('gear-snap-angle').value=String(next.gearSnapAngle);view.setSelection(selection,nativeScene);ui?.refresh();localization.refresh();marksView?.visibilityChanged();if(languageChanged&&['solid','fusion'].includes(workbenchUI?.mode()))workbenchUI.sync();}

async function setQuality(value){thicknessUI?.close();const previous=quality.get().display,next=quality.set(value);if(previous.deflection!==next.display.deflection||previous.angleDegrees!==next.display.angleDegrees){controller.setDisplayQuality(next.display);lastDisplayed=null;await scheduleRefresh();}return next;}

const {mirror,mirrorPanel,alignmentPlan,applyAlignment,refreshAlignment,alignPanel,centerSelection}=createAlignment({
  $,document,controller,view,project,activeFrame,context,selected,copy,translate,safe,escape,gesture,mutate,
  getSelection:()=>selection,getMarkers:()=>alignmentMarks,refreshUi:()=>ui.refresh(),openInspector:()=>layoutUI.openPanel('inspector'),
  state:{
    get session(){return alignment;},set session(value){alignment=value;},
    get task(){return alignmentTask;},set task(value){alignmentTask=value;},
    get ticket(){return alignmentTicket;},set ticket(value){alignmentTicket=value;},
  },
});

alignmentMarks=createCadAlignMarkers({viewport:$('viewport'),projectPoint:view.projectPoint,getPreferences:()=>preferences,onAlign:(axis,mode)=>safe(()=>applyAlignment(axis,mode)),onPreview:(axis,mode)=>{if(alignment?.data?.revision===controller.revision())view.setAlignmentPreview(alignmentPlan(axis,mode));},onClearPreview:()=>view.clearAlignmentPreview()});

function setPlugins(value){storage.setItem('offlinecad-plugins-v1',JSON.stringify(value));plugins=copy(value);ui?.renderLibrary();}

const access=createCadAutomationAccess({controller,onSave:saveFromAutomation,onCommit:receipt=>{const id=externalAutomation?.applyRequestId();if(id!==null&&id!==undefined)window.offlinecadDesktop?.automationCommitted?.({id,...receipt});},onDiscardPreview:id=>{if(activePreview?.previewId===id)clearPreview();},getModelChecksEnabled:readAIModelChecksEnabled,getModelCheckConfig:readModelCheckConfig,getLivePreviewEnabled:()=>readAIModelLivePreviewEnabled()||practicePlayback?.isRunning()===true,onUI:request=>agentUIAccess.request(request),getAssemblyDisplay:()=>({...assemblyDisplay.state(project()),...packFiles.state(project())}),setAssemblyDisplay:request=>changeAssemblyDisplay(request.action,request.ids),getFonts:fontLibrary.list,getSelection,getScene,refresh:scheduleRefresh,screenshot:async({confirmed=false}={})=>{if(confirmed)await scheduleRefresh();return view.captureDataURL();},fitView:()=>view.fit(undefined,{includePreview:true}),isBusy:({allowIntermediate=false,previewId}={})=>!!partPropertiesUI?.state()||partPropertiesUI?.exploded()||!!featureUI?.state()||!!referenceRebindUI?.state()||!!jointsUI?.state()||!!projectParametersUI?.state()||!!drawingUI?.state()||!!thicknessUI?.state()||busy||!!meshHoleFillUI?.state()||!!meshRepairUI?.state()||!!(meshReduceUI?.state()||meshRemeshUI?.state()||(meshSmoothUI?.state()||meshSculptUI?.state())||meshEraseFillUI?.state()||meshMakeSolidUI?.state()||(meshHollowUI?.state()||meshFeaturesUI?.state()))||!!meshSelectionUI?.state()||!!activePreview&&!(allowIntermediate&&activePreview.aiInProgress)&&!(previewId&&activePreview.previewId===previewId&&!activePreview.aiInProgress)||!!magnetSession?.dragging||!!modelingUI?.state()||!!advancedFreeCADUI?.state()||!!sketchUI?.state()||!!tools?.state()||!!meshTools?.state()||!!meshExtras?.state()||!!workplaneUI?.state()});

window.offlinecadAutomation=access;

marksView=createCadAnnotationsView({view,group:view.groups.annotations,t});

const programAssistant=createCadProgramAssistant({access,getSelection,showPreview:async proposal=>{await showPreview(proposal,undefined,controller.readSnapshot().nodes.map(n=>n.id));if(activePreview?.previewId===proposal.previewId)view.fit([],{includePreview:true});},clearPreview,cancelComputation:()=>controller.cancel(),getMode:()=>workbenchUI?.mode()??'normal',getBusy:()=>!contextMenuIdle(),language:()=>preferences.language});
const agentUIAccess=createAgentUIAccess({assistant:programAssistant,getRevision:()=>controller.revision(),isBusy:()=>access.isBusy(),beforeGuide:()=>{const chat=document.getElementById('ai-agent-chat'),restore=!!chat?.open;chat?.close();return ()=>{if(restore&&chat?.isConnected&&!document.querySelector('dialog[open]'))chat.showModal();};}});
featureUI=createCadAIFeatureUI({controller,view,getSelection,select,language:()=>preferences.language,prepare:()=>{if(aiUI?.isBusy())throw Error('Laufenden KI-Auftrag zuerst abschließen oder abbrechen.');escape();},toast,openReferenceRebind:initial=>referenceRebindUI.open(initial),onAttach:reference=>aiUI?.chat.addFeatureReference(reference),onHighlight:id=>aiUI?.chat.highlightFeatureReference(id)});
let practiceVerificationQuality;
aiUI=createCadAIUI({prepareSketchPracticePreview:(project,revision)=>controller.restoreAITaskCandidate(project,{revision,label:'Änderungen aus der Skizzenübung'}),getPracticeQuality:()=>practiceVerificationQuality,getPracticeWorkbench:()=>workbenchUI?.mode(),capturePracticeCopy:options=>captureCadPracticeCopy(controller,getSelection,{...options,getScene}),featureStore:{open:()=>featureUI.open(),pickForChat:()=>featureUI.open({pickForChat:true}),highlight:reference=>featureUI.highlight(reference),project:()=>controller.readSnapshot(),state:()=>featureUI.state(),clearHighlight:()=>featureUI.clearHighlight(),scope:references=>captureCadAIFeatureScope(controller.readSnapshot(),references.map(r=>r.id),references)},photoStore:{practice:new URL(location.href).searchParams.has('practice'),read:()=>({revision:controller.revision(),photos:controller.snapshot().photos}),save:async(photos,{revision})=>{readyForFile();const proposal=await controller.previewPhotos(photos,{revision});return controller.apply(proposal);},reconstruct:async(plan,options)=>{readyForFile();const proposal=await controller.previewPhotoReconstruction(plan,{...options,review:reviewPhotoSet});await showPreview(proposal,[proposal.photoReconstructionReport.rootId]);view.fit([],{includePreview:true});return proposal;},reviewReconstruction:(plan,options)=>reviewStoredPhotoSet(controller,plan,options),setView:key=>view.setView(key),download,applyReconstruction:async proposal=>{const result=controller.apply(proposal);clearPreview();await scheduleRefresh();return result;},discardReconstruction:id=>{controller.discard(id);if(activePreview?.previewId===id)clearPreview();}},openTaskBasis:async(basis,binding)=>{readyForFile();if(!await confirmProjectChange())return false;fileBusy=true;try{const checked=await packFiles.registerTaskBasis(basis,binding);await openEncoded(checked.project,null,{allowCatalog:true});select(checked.selection);await scheduleRefresh();return true;}finally{fileBusy=false;}},captureCanvas:async()=>{await view.renderReady();return new Promise((resolve,reject)=>view.canvas.toBlob(blob=>blob?resolve(new File([blob],'Modellbild.png',{type:'image/png'})):reject(Error('Modellbild konnte nicht erstellt werden.')),'image/png'));},access,programAssistant,modal,download,language:()=>preferences.language,showPreview:async proposal=>{await showPreview(proposal,undefined,controller.readSnapshot().nodes.map(n=>n.id));if(activePreview?.previewId===proposal.previewId)view.fit([],{includePreview:true});},clearPreview,cancelComputation:()=>controller.cancel(),settingsOpen:()=>{ui.settings.open();document.querySelector('[data-settings-tab="ai"]')?.click();}});

partPropertiesUI=createCadPartPropertiesUI({controller,view,getSelection,getScene,isLoaded:assemblyDisplay.isLoaded,meshSelection:()=>meshSelectionUI?.snapshot(),prepare:escape,showPreview,clearPreview,refresh:scheduleRefresh,download,onWorkspaceChange:updateSaveState,toast});
const partPropertiesButton=document.createElement('button');partPropertiesButton.type='button';partPropertiesButton.id='part-properties-open';partPropertiesButton.textContent='Teile & Material';partPropertiesButton.onclick=()=>safe(()=>partPropertiesUI.open());document.querySelector('.file-actions').append(partPropertiesButton);

const featureReferencesButton=document.createElement('button');featureReferencesButton.type='button';featureReferencesButton.id='ai-feature-open';featureReferencesButton.textContent='KI-Merkmalsbezüge';featureReferencesButton.onclick=()=>safe(()=>featureUI.open());document.querySelector('.file-actions').append(featureReferencesButton);
const projectPhotosButton=document.createElement('button');projectPhotosButton.type='button';projectPhotosButton.id='photo-project-open';projectPhotosButton.textContent='Projektfotos';projectPhotosButton.onclick=()=>safe(()=>aiUI.openProjectPhotos());document.querySelector('.file-actions').append(projectPhotosButton);
let freecadDocumentReader;
referenceRebindUI=createCadReferenceRebindUI({controller,view,getSelection,select,prepare:()=>{readyForFile();if(aiUI?.isBusy())throw Error('Laufenden KI-Auftrag zuerst abschließen oder abbrechen.');escape();},toast});
const freecadDocumentButton=document.createElement('button');freecadDocumentButton.type='button';freecadDocumentButton.id='freecad-document-open';freecadDocumentButton.textContent='FreeCAD-Merkmale';freecadDocumentButton.onclick=()=>safe(()=>{readyForFile();if(aiUI.isBusy())throw Error('Laufenden Auftrag zuerst abschließen.');escape();freecadDocumentReader?.dispose();modal('FreeCAD-Merkmalsbaum','<div id=freecad-document-host></div><div class=modal-actions><button id=freecad-document-close>Schließen</button></div>',{modeless:true});$('modal').classList.add('freecad-document-modal');$('modal').scrollTop=0;freecadDocumentReader=mountFreeCADDocumentReader({host:$('freecad-document-host'),access,preview:(request,options)=>controller.previewFreeCADDocument(request,options),rerun:(request,options)=>controller.previewFreeCADRerun(request,options),apply:async proposal=>{const result=controller.apply(proposal);clearPreview();await scheduleRefresh();return result;},discard:id=>controller.discard(id),showPreview:async proposal=>{const ids=[...new Set([...proposal.selectedTargets.map(t=>t.rootId),...(proposal.report.freecadDependencies?.sources??[]).map(s=>s.target.rootId),...(proposal.report.freecadFollowups??[]).map(r=>r.target.rootId)])];await showPreview(proposal,ids);view.fit([],{includePreview:true});},clearPreview});$('freecad-document-close').onclick=()=>$('modal').close();$('freecad-document-host').querySelector('button').click();});document.querySelector('.file-actions').append(freecadDocumentButton);

tools=createCadToolsUI({controller,view,marksView,getSelection,getScene,select,execute,mutate,modal,safe,toast,download,getQuality:()=>quality.get().display,storage,refresh:scheduleRefresh,t});

meshTools=createCadMeshTools({controller,view,getSelection,getScene,select,modal,safe,toast,prepare:escape,showPreview,clearPreview,applyProposal,mutate,project,onMore:()=>meshExtras.open('measure'),getFonts:Object.assign(()=>fontLibrary.list(),{resources:fontLibrary.resources}),onSketchSource:(rootId,path)=>sketchUI.open(true,true,{rootId,path})});

meshHoleFillUI=createCadMeshHoleFillUI({controller,view,getSelection,getSurfaceSelection:()=>meshSelectionUI?.snapshot(),getFonts:Object.assign(()=>fontLibrary.list(),{resources:fontLibrary.resources}),onSelectSurfaces:()=>meshSelectionUI.open(),select,prepare:escape,showPreview,clearPreview:id=>{if(!id||activePreview?.previewId===id)clearPreview();},applyProposal,toast});
meshRepairUI=createCadMeshRepairUI({controller,view,getSelection,select,prepare:escape,showPreview,clearPreview:id=>{if(!id||activePreview?.previewId===id)clearPreview();},applyProposal,toast});
meshReduceUI=createCadMeshReduceUI({controller,view,getSelection,getSurfaceSelection:()=>meshSelectionUI?.snapshot(),select,prepare:escape,showPreview,clearPreview:id=>{if(!id||activePreview?.previewId===id)clearPreview();},applyProposal,toast});
meshRemeshUI=createCadMeshRemeshUI({controller,view,getSelection,getSurfaceSelection:()=>meshSelectionUI?.snapshot(),select,prepare:escape,showPreview,clearPreview:id=>{if(!id||activePreview?.previewId===id)clearPreview();},applyProposal,toast});
meshSmoothUI=createCadMeshSmoothUI({controller,view,getSelection,getSurfaceSelection:()=>meshSelectionUI?.snapshot(),onSelectSurfaces:()=>meshSelectionUI.open(),select,prepare:escape,showPreview,clearPreview:id=>{if(!id||activePreview?.previewId===id)clearPreview();},applyProposal,toast});
meshSculptUI=createCadMeshSculptUI({controller,view,t,getLanguage:()=>preferences.language,getSelection,getSurfaceSelection:()=>meshSelectionUI?.snapshot(),select,prepare:escape,showPreview,clearPreview:id=>{if(!id||activePreview?.previewId===id)clearPreview();},applyProposal,toast});
meshEraseFillUI=createCadMeshEraseFillUI({controller,view,getSelection,getSurfaceSelection:()=>meshSelectionUI?.snapshot(),onSelectSurfaces:()=>meshSelectionUI.open(),select,prepare:escape,showPreview,clearPreview:id=>{if(!id||activePreview?.previewId===id)clearPreview();},applyProposal,toast});
meshMakeSolidUI=createCadMeshMakeSolidUI({controller,view,getSelection,select,prepare:escape,showPreview,clearPreview:id=>{if(!id||activePreview?.previewId===id)clearPreview();},applyProposal,toast});
meshHollowUI=createCadMeshHollowUI({controller,view,getSelection,select,prepare:escape,showPreview,clearPreview:id=>{if(!id||activePreview?.previewId===id)clearPreview();},applyProposal,toast});
meshFeaturesUI=createCadMeshFeaturesUI({controller,view,getSelection,getMeshSelection:()=>meshSelectionUI?.snapshot(),select,prepare:escape,showPreview,clearPreview:id=>{if(!id||activePreview?.previewId===id)clearPreview();},applyProposal,toast});

meshCopyUI=createCadMeshCopyUI({controller,view,getSelection,select,prepare:escape,showPreview,clearPreview:id=>{if(!id||activePreview?.previewId===id)clearPreview();},applyProposal,isolate:targets=>{isolation.start(project(),targets);updateIsolation();},toast});

inspectionUI=createCadInspectionUI({controller,view,getSelection,getScene,prepare:()=>{escape();meshExtras?.clearSection();tools?.clearSection();},toast,getQuality:()=>quality.get().display,legacyMeasure:()=>!selection.length||selection.some(t=>project().nodes.find(n=>n.id===t.rootId)?.kind==='mesh')?meshExtras.open('measure'):tools.actions.measure()});
thicknessUI=createCadThicknessUI({controller,view,getSelection,getQuality:()=>quality.get().display,prepare:escape,toast});
meshExtras=createCadMeshExtraTools({controller,view,getSelection,select,prepare:escape,showPreview,clearPreview,applyProposal,toast,getFonts:Object.assign(()=>fontLibrary.list(),{resources:fontLibrary.resources}),getPlugins:()=>plugins,storage,onSection:()=>inspectionUI.openSection(),onSketch:()=>sketchUI.open(!!project().nodes.find(n=>n.id===selection[0]?.rootId)?.meshSource?.node.sketch,true)});

meshInspectorUI=createCadMeshInspectorUI({getProject:project,getSelection,view,prepare:escape,toast});

meshSelectionUI=createCadMeshSelectionUI({getProject:project,getSelection,getScene,view,select,prepare:escape,onWorkspaceChange:()=>{updateSaveState();},onProtectionCommit:async({objectId,regions,signal,current})=>{const revision=controller.revision(),draft=controller.snapshot(),node=draft.nodes.find(n=>n.id===objectId);if(!node||node.kind!=='mesh')throw Error('Die Netzquelle fehlt.');node.metadata??={};if(regions.length)node.metadata.meshProtection={format:'FormnaroMeshProtection',version:1,regions};else{delete node.metadata.meshProtection;if(!Object.keys(node.metadata).length)delete node.metadata;}const proposal=await controller.preview(undefined,{project:draft,revision,label:'Netz-Schutzbereiche bearbeiten'});if(signal.aborted||!current()){controller.discard(proposal.previewId);return;}controller.apply({previewId:proposal.previewId,revision:proposal.revision});},onSessionChange:()=>updateState(),toast,pick:({ray,hit,node})=>view.meshSelectionHit(ray,hit,node)});

workplaneUI=createCadWorkplaneUI({controller,view,prepare:escape,applyProposal,toast});

jointsUI=createCadJointsUI({controller,view,getSelection,modal,prepare:escape,toast,openReferenceRebind:initial=>referenceRebindUI.open(initial)});
sketchUI=createCadSketchUI({controller,view,getSelection,select,prepare:escape,modal,...(typeof window.offlinecadDesktop?.startPractice==='function'?{startPractice:(prompt,draft)=>aiUI.startSketchPractice(prompt,draft),cancelPractice:()=>aiUI.cancelRequest()}:{}),rebindContour:(link,edits)=>modelingUI.openRebind(link,{edits}),pickFace:async(node,ray,event,visualHit,signal)=>{if(visualHit?.object?.userData.rootId!==node.id)return null;return node.kind==='mesh'?meshSurfaceHit(node,ray):controller.query('rayPick',{ray,ids:[node.id]},{signal});},t,toast});

modelingUI=createCadModelingUI({controller,view,getSelection,select,prepare:escape,openSketch:config=>sketchUI.openImported(config),refresh:scheduleRefresh,toast,t});
advancedFreeCADUI=createAdvancedFreeCADUI({controller,view,getSelection,select,prepare:escape,refresh:scheduleRefresh,toast});
if (typeof window.offlinecadDesktop?.orcaRequest === 'function') {
 const orca = createOrcaDialog({
  $, request: async (args, signal) => {
   if (['selectInstance', 'chooseExecutable', 'installPortable', 'configure'].includes(args.action) && aiUI.isBusy())
    throw Error('Bitte den laufenden KI-Auftrag vor dem Wechsel der Druckeinstellungen beenden.');
   if (!['slice', 'openModel'].includes(args.action)) return window.offlinecadDesktop.orcaRequest(args);
   const model = await access.export({format:'3mf',revision:args.revision,ids:args.ids});
   signal?.throwIfAborted();
   return window.offlinecadDesktop.orcaRequest({...args,model});
  }, modal, getModalSequence: () => modalSequence, prepare: readyForFile,
  hasSelection: () => getSelection().length > 0, openAgent: () => aiUI.openAgent(),
  geometry: selectionOnly => {
   const roots = selectionOnly ? [...new Set(selected({ roots: true }).map(value => value.node.id))] : undefined;
   if (selectionOnly && !roots.length) throw Error('Wähle zuerst die Teile für den Druck aus.');
   const ids = easyExportIds(project(), activeEasyKind(), roots, '3mf');
   return { revision: controller.revision(), ...(ids ? { ids } : {}) };
  },
 });
 const button = $('orca-open');
 button.hidden = false;
 button.onclick = () => safe(() => orca.show());
}
const { importFile, importDialog, exportModel, exportDialog, saveDrawingExport } = createImportExport({
  $,
  window,
  controller,
  project,
  activeEasyKind,
  workFrame,
  placeImportedProposal,
  setBusy,
  readyForFile,
  aiUI,
  escape,
  modal,
  clearPreview,
  scheduleRefresh,
  showPreview,
  view,
  select,
  workflowSettings,
  restrictEasyImport,
  safe,
  quality,
  download,
  selected,
  prepareExportDialog: () => {
    if (
      meshReduceUI?.state() ||
      meshRemeshUI?.state() ||
      meshSmoothUI?.state() ||
      meshSculptUI?.state() ||
      meshEraseFillUI?.state() ||
      meshMakeSolidUI?.state() ||
      meshHollowUI?.state() ||
      meshFeaturesUI?.state()
    )
      readyForFile();
  },
  state: {
    get easyDomainRevision() {
      return easyDomainRevision;
    },
    get modalSequence() {
      return modalSequence;
    },
    get localStlTask() {
      return localStlTask;
    },
    set localStlTask(value) {
      localStlTask = value;
    },
    get localStlSequence() {
      return localStlSequence;
    },
    set localStlSequence(value) {
      localStlSequence = value;
    },
    set freecadImportReader(value) {
      freecadImportReader = value;
    },
    get functionsUI() {
      return functionsUI;
    },
  },
});
drawingUI=createCadDrawingUI({controller,view,getSelection,prepare:escape,toast,t,exportDrawing:saveDrawingExport});
projectParametersUI=createCadProjectParametersUI({controller,view,getSelection,prepare:escape,refresh:scheduleRefresh,toast,t});

for(const action of ['lay-on-face','reference-place','sketch','split','extract']){document.querySelector('[data-action="'+action+'"]').hidden=false;document.querySelector('[data-action="'+action+'"]').disabled=false;}

const parameterButton=document.createElement('button');parameterButton.dataset.action='project-parameters';parameterButton.textContent='Projektparameter und Varianten …';document.querySelector('[data-action=sketch]').after(parameterButton);
const jointsButton=document.createElement('button');jointsButton.dataset.action='joints';jointsButton.textContent='Gelenke und Bewegung …';document.querySelector('[data-action=sketch]').after(jointsButton);
const drawingButton=document.createElement('button');drawingButton.dataset.action='drawing';drawingButton.textContent='Technische Zeichnung …';document.querySelector('[data-action=sketch]').after(drawingButton);
const comparisonButton=document.createElement('button');comparisonButton.dataset.action='model-compare';comparisonButton.textContent='Modelle vergleichen …';document.querySelector('[data-action=thickness]').after(comparisonButton);
const exampleButton=document.createElement('button');exampleButton.dataset.action='sketch-templates';exampleButton.textContent='Beispielskizzen …';document.querySelector('[data-action=sketch]').after(exampleButton);
for(const [action,label] of [['cad-contour','Kontur von CAD-Fläche …'],['linked-contours','Konturverknüpfungen …'],['cad-face-offset','CAD-Fläche versetzen …'],['cad-shell','CAD-Körper aushöhlen …'],['cad-loft','Übergang zwischen Skizzen …'],['cad-sweep','Profil entlang eines Pfads …'],['cad-edit-modeling','CAD-Bearbeitung ändern …'],['cad-draft','Entformungsschräge …'],['cad-defeature','Merkmale entfernen …'],['cad-revolution','Rotation …'],['cad-helix','Helix …'],['cad-surface-fill','Randkurvenfläche …'],['cad-surface-transition','Flächenübergang …'],['cad-surface-sew','Flächen vernähen …'],['cad-surface-relief','Prägung / Vertiefung …']].reverse()){const button=document.createElement('button');button.dataset.action=action;button.textContent=label;document.querySelector('[data-action=sketch]').after(button);}
const attachmentButton=document.createElement('button');attachmentButton.dataset.action='sketch-on-part';attachmentButton.textContent='Skizze auf Teilfläche …';document.querySelector('[data-action=sketch]').after(attachmentButton);
const drillButton=document.createElement('button');drillButton.dataset.action='drill';drillButton.textContent='Bohrung erstellen …';document.querySelector('[data-action="isolate"]').after(drillButton);

const meshButton=document.createElement('button');meshButton.dataset.action='mesh-tools';meshButton.textContent='Netz-Werkzeuge …';document.querySelector('[data-action="group"]').after(meshButton);const meshMore=document.createElement('button');meshMore.dataset.action='mesh-more';meshMore.textContent='Weitere Netz-Werkzeuge …';meshButton.after(meshMore);const surfaceButton=document.createElement('button');surfaceButton.dataset.action='mesh-select';surfaceButton.textContent='Netzflächen auswählen …';meshButton.after(surfaceButton);const inspectorButton=document.createElement('button');inspectorButton.dataset.action='mesh-inspector';inspectorButton.textContent='Netzinspektor …';surfaceButton.after(inspectorButton);const repairButton=document.createElement('button');repairButton.dataset.action='mesh-repair';repairButton.textContent='Netz reparieren …';inspectorButton.after(repairButton);const holeButton=document.createElement('button');holeButton.dataset.action='mesh-close-hole';holeButton.textContent='Öffnung schließen …';repairButton.after(holeButton);const connectorButton=document.createElement('button');connectorButton.dataset.action='mesh-connectors';connectorButton.textContent='Passstifte und Aufnahmen …';holeButton.after(connectorButton);const reduceButton=document.createElement('button');reduceButton.dataset.action='mesh-reduce';reduceButton.textContent='Netz vereinfachen …';connectorButton.after(reduceButton);const largeReduceButton=document.createElement('button');largeReduceButton.dataset.action='mesh-large-reduce';largeReduceButton.textContent='Große Netze vereinfachen …';reduceButton.after(largeReduceButton);const curvedButton=document.createElement('button');curvedButton.dataset.action='mesh-curved-reduce';curvedButton.textContent='Gekrümmtes Netz vereinfachen …';reduceButton.after(curvedButton);const remeshButton=document.createElement('button');remeshButton.dataset.action='mesh-remesh';remeshButton.textContent='Netz neu vernetzen …';reduceButton.after(remeshButton);const smoothButton=document.createElement('button');smoothButton.dataset.action='mesh-smooth';smoothButton.textContent='Ausgewählte Netzflächen glätten …';remeshButton.after(smoothButton);const eraseFillButton=document.createElement('button');eraseFillButton.dataset.action='mesh-erase-fill';eraseFillButton.textContent='Netzbereiche ersetzen …';smoothButton.after(eraseFillButton);const sculptButton=document.createElement('button');sculptButton.dataset.action='mesh-sculpt';sculptButton.textContent='Modellierpinsel und Symmetrie …';smoothButton.after(sculptButton);const makeSolidButton=document.createElement('button');makeSolidButton.dataset.action='mesh-make-solid';makeSolidButton.textContent='Geschlossene Annäherung …';eraseFillButton.after(makeSolidButton);const hollowButton=document.createElement('button');hollowButton.dataset.action='mesh-hollow';hollowButton.textContent='Netzkörper aushöhlen …';makeSolidButton.after(hollowButton);
const featuresButton=document.createElement('button');featuresButton.dataset.action='mesh-features';featuresButton.textContent='Formerkennung und Gegenstück …';hollowButton.after(featuresButton);

const meshCopyButton=document.createElement('button');meshCopyButton.dataset.action='cad-to-mesh';meshCopyButton.textContent='CAD → Netzkopie …';meshButton.after(meshCopyButton);const meshCadButton=document.createElement('button');meshCadButton.dataset.action='mesh-to-cad';meshCadButton.textContent='Netz → CAD …';meshCopyButton.after(meshCadButton);

document.querySelector('[data-action="lay-on-face"]').hidden=false;document.querySelector('[data-action="lay-on-face"]').disabled=false;

layoutUI=createLayoutUI({storage,safe,toast,t,isBusy:()=>busy,prepare:()=>escape()});

window.formnaroOpenChatSidebar=()=>workbenchUI?.mode()==='solid'?Promise.resolve():layoutUI.openPanel(layoutUI.state().librarySide==='right'?'library':'inspector');

layoutUI.syncPanels();

ui=createCadInterface({controller,storage,fontLibrary,getPreferences:()=>preferences,setPreferences,getPlugins:()=>plugins,setPlugins,functionPlugins,getSelection,select,getScene,execute,mutate,modal,safe,toast,download,fit:()=>view.fit(),onAddShape:(type,event)=>addShape(type,event),onSketchTemplate:id=>sketchUI.openTemplate(id,activeEasyKind()==='mesh'||meshSelection()),onMeshSource:async(rootId,path)=>{select([{rootId,path:[]}]);await meshTools.openSource(rootId,path);},onFinishStep:(bodyId,stepId)=>tools.openEdges('round',{bodyId,stepId}),onAddPlugin:(manifest,shapeId,event)=>addPlugin(manifest,shapeId,event),mountAI:root=>aiUI.mountSettings(root),mountLayout:root=>layoutUI.mountSettings(root),mountFusion:root=>workbenchUI?.fusion.mountSettings(root),mountSolid:root=>workbenchUI?.solid.mountSettings(root),mountContext:root=>contextMenuUI?.mountSettings(root),getQuality:()=>quality.get(),setQuality,workflowSettings,getLayout:()=>layoutUI.state(),setLayout:value=>layoutUI.restore(value)});

const importConverted=async(file,result,{current=()=>true}={})=>importFile(file,{converted:result,current});

importConverted.cancel=()=>controller.cancel();

const importMeshForHelp=(file,{unit,signal,current})=>importFile(file,{
  unit,asMesh:true,forMeshHelp:true,autoMeshRepair:false,simplifyLarge:false,importSignal:signal,current,
});
function showMeshHelp(id){
  if(activeEasyKind())workbenchUI.setMode('normal');
  select([{rootId:id,path:[]}]);
  meshInspectorUI.open();
}

const converterImport=createCadConverterImport({controller,getFrame:workFrame,showPreview,isolate:targets=>{isolation.start(project(),targets);updateIsolation();},clearPreview:id=>{if(activePreview?.previewId===id)clearPreview();},applyProposal,select});

functionsUI=createCadFunctionsUI({workflowSettings,mountAISettings:root=>aiUI.mountSettings(root),plugins:functionPlugins,modal,safe,toast,download,ready:readyForFile,getQuality:()=>quality.get(),getLanguage:()=>preferences.language,setBusy,importConverted,importMeshForHelp,showMeshHelp,converterImport,fitPreview:()=>view.fit(undefined,{includePreview:true}),runAction:action=>{if(action==='function-settings'){ui.settings.open();document.querySelector('[data-settings-tab="plugins"]')?.click();return;}return actions[action]?.();}});

async function addShape(id,event){assertReferenceRebindIdle();if(partPropertiesUI?.editing()){toast('Teileeigenschaften zuerst übernehmen oder schließen.');return;}
 const definition=CAD_PALETTE_SHAPES.find(shape=>(shape.paletteId??shape.type)===id);if(!definition)throw Error('Unbekannte Form.');if(insertionBusy)throw Error('Die vorherige Form wird noch eingesetzt.');insertionBusy++;
 const {type,params}=definition;
 try{const p=project(),before=new Set(p.nodes.map(node=>node.id)),revision=controller.revision(),mesh=requireCreationKind(p)==='mesh';let operation;
 if(mesh&&type==='text')operation={type:'mesh-create-source',id:crypto.randomUUID(),shape:'text',name:definition.name,text:'TEXT',font:'regular',height:4,paths:await meshTextPaths('TEXT','regular',fontLibrary.resources()),frame:workFrame(p)};
 else operation=mesh?{type:'mesh-create',id:crypto.randomUUID(),shape:type,name:definition.name,color:definition.color,size:[...definition.defaultSize],position:[0,0,definition.defaultSize[2]/2],segments:64,frame:workFrame(p),...(params?{params}:{})}:{kind:'batch',commands:[{op:'create',type,space:'plane',as:'new',...(params?{name:definition.name,size:[...definition.defaultSize],params}:{})}]};
 const proposal=await controller.preview(operation,{revision,label:mesh?'Netzform hinzufügen':'CAD-Form hinzufügen'});return await finishInsertion(proposal,before,event);
 }finally{insertionBusy--;}
}

async function addPlugin(manifest,shapeId,event){assertReferenceRebindIdle();if(partPropertiesUI?.editing()){toast('Teileeigenschaften zuerst übernehmen oder schließen.');return;}if(insertionBusy)throw Error('Die vorherige Form wird noch eingesetzt.');insertionBusy++;try{const p=project(),before=new Set(p.nodes.map(node=>node.id)),mesh=requireCreationKind(p)==='mesh',operation=mesh?{type:'mesh-create-source',shape:'plugin',manifest,shapeId,id:crypto.randomUUID(),frame:workFrame(p)}:{kind:'plugin',manifest,shapeId,options:{transform:workFrame(p),layerId:p.activeLayerId,folderId:p.activeFolderId}},proposal=await controller.preview(operation,{label:mesh?'Plugin-Netzform hinzufügen':'Plugin-CAD-Form hinzufügen'});return await finishInsertion(proposal,before,event);}finally{insertionBusy--;}}

async function finishInsertion(proposal,before,event){

  let candidate=proposal,snapped;const newNode=candidate.project.nodes.find(node=>!before.has(node.id));if(!newNode)throw Error('Neue CAD-Form fehlt.');

  if(event){const ray=view.cadRay(event),mesh=newNode.kind==='mesh',hint=mesh?view.visualHit(event):null,target=hint?project().nodes.find(node=>node.id===hint.object.userData.rootId&&node.kind==='mesh'&&node.meshRole!=='hole'):null,meshHit=target?meshSurfaceHit(target,ray):null,hit=mesh?null:await queryVisibleRay(ray);

    if(meshHit){const p=copy(candidate.project),node=p.nodes.find(node=>node.id===newNode.id);node.transform=meshMagnetTransform(node,meshHit);candidate=await controller.preview(undefined,{project:p,revision:proposal.revision,label:'Netzform auf Fläche einsetzen'});}
    else if(hit){candidate=await controller.preview({kind:'tool',name:'previewPlace',options:{id:newNode.id,ray,targetIds:visibleCadIds()}},{project:candidate.project,revision:proposal.revision,label:'CAD-Form auf Fläche einsetzen'});}

    else{const p=copy(candidate.project),wp=workFrame(p),normal=new THREE.Vector3(0,0,1).transformDirection(new THREE.Matrix4().fromArray(wp)),plane=new THREE.Plane().setFromNormalAndCoplanarPoint(normal,new THREE.Vector3(...p.workplane.origin)),point=new THREE.Ray(new THREE.Vector3(...ray.origin),new THREE.Vector3(...ray.direction)).intersectPlane(plane,new THREE.Vector3());if(!point)throw Error('Die Arbeitsebene wird nicht getroffen.');const node=p.nodes.find(node=>node.id===newNode.id),b=node.stats?.bounds??commonBounds({...node,transform:cadIdentity()}),anchor=cadPoint(node.transform,[(b.min[0]+b.max[0])/2,(b.min[1]+b.max[1])/2,b.min[2]]);node.transform=multiplyCadMatrices(translate(point.toArray().map((v,k)=>v-anchor[k])),node.transform);candidate=await controller.preview(undefined,{project:p,revision:proposal.revision,label:'CAD-Form auf Ebene einsetzen'});}

    const snapDraft=copy(candidate.project);snapped=await snapLooseGear(snapDraft,newNode.id);if(snapped)candidate=await controller.preview(undefined,{project:snapDraft,revision:proposal.revision,label:'Zahnrad einrasten und koppeln'});
    await showPreview(candidate);

  }

  await applyProposal(candidate);select([{rootId:newNode.id,path:[]}]);reportGearSnap(snapped);return newNode.id;

}

const meshSelection=()=>selection.length>0&&selection.every(target=>!target.path.length&&project().nodes.some(node=>node.id===target.rootId&&node.kind==='mesh'));

async function group(operation='union'){if(meshSelection()){await easyRepair?.flush();await refreshTask;return meshTools.open(operation==='intersection'?'intersection':'union');}const ids=selected({roots:true,cad:true,editable:true}).map(value=>value.node.id),id=crypto.randomUUID();await execute({kind:'tool',name:'previewGroup',options:{ids,id,operation,frame:activeFrame()}},{label:operation==='union'?'CAD geometrisch vereinigen':'CAD-Schnittmenge'});select([{rootId:id,path:[]}]);}

async function ungroup(){if(meshSelection())return meshTools.open('dissolve');const list=selected({roots:true,cad:true,editable:true});if(list.length!==1)throw Error('Eine CAD-Gruppe auswählen.');const children=list[0].node.children?.map(node=>({rootId:node.id,path:[]}))??[];await execute({kind:'tool',name:'previewDissolve',options:{id:list[0].node.id}});select(children);}

async function remove(){const list=selected({editable:true});await execute({kind:'batch',commands:list.map(value=>({op:'delete',target:value.target}))},{label:'CAD-Auswahl entfernen'});select([]);}

async function drop(){const list=selected({editable:true});await execute({kind:'batch',commands:list.map(value=>({op:'drop',target:value.target}))},{label:'CAD auf Arbeitsebene absetzen'});}

function workplanePick(){return workplaneUI.open();}

async function planeTop(){const list=selected(),bounds=await controller.query('bounds',{targets:list.map(value=>value.target),frame:cadIdentity()});await mutate(draft=>{draft.workplane={origin:[0,0,bounds.max[2]],orientation:[0,0,0,1],reference:null};},'Arbeitsebene auf Auswahl-Oberseite');}

function magnet(){

  if(meshSelection())return meshExtras.open('magnet');

  if(magnetSession){escape();return;}

  const list=selected({roots:true,cad:true,editable:true});if(list.length!==1)throw Error('Ein CAD-Teil für den Magneten auswählen.');escape();

  const session={id:list[0].node.id,revision:controller.revision(),cancelled:false,dragging:false,latest:null,running:null,proposal:null};magnetSession=session;

  $('magnet-mode').setAttribute('aria-pressed','true');toast('Ausgewähltes Teil auf eine CAD-Fläche ziehen · Loslassen übernimmt · Esc verwirft.');

  const operation=ray=>({kind:'tool',name:'previewPlace',options:{id:session.id,ray,targetIds:visibleCadIds()}});

  function queue(ray){session.latest=ray;if(session.running)return session.running;session.running=(async()=>{while(session.latest&&!session.cancelled){const next=session.latest;session.latest=null;try{const proposal=await controller.preview(operation(next),{revision:session.revision,label:'Magnetplatzierung'});if(session.cancelled){controller.discard(proposal.previewId);break;}if(session.proposal)controller.discard(session.proposal.previewId);session.proposal=proposal;await showPreview(proposal,[session.id]);}catch(error){if(session.proposal)controller.discard(session.proposal.previewId);session.proposal=null;clearPreview();if(!session.cancelled&&error.code!=='NO_CAD_HIT'&&error.code!=='ABORTED')toast(error.message);}}})().finally(()=>{session.running=null;});return session.running;}

  view.setDragInteraction({start:({hit})=>{if(session.cancelled||hit?.object.userData.rootId!==session.id)return false;session.dragging=true;return true;},move:({ray})=>{void queue(ray);},end:async({ray,moved})=>{if(!moved){session.dragging=false;return;}await queue(ray);if(session.cancelled)return;session.dragging=false;const proposal=session.proposal;if(proposal)await applyProposal(proposal);escape();},cancel:()=>{session.cancelled=true;session.latest=null;session.dragging=false;if(session.proposal)controller.discard(session.proposal.previewId);}});

  view.setInteraction(async ray=>{const proposal=await controller.preview(operation(ray),{revision:session.revision,label:'Magnetplatzierung'});if(session.cancelled){controller.discard(proposal.previewId);return;}session.proposal=proposal;await showPreview(proposal,[session.id]);modal('Magnetplatzierung','<p>Die native CAD-Vorschau liegt auf der gewählten Fläche.</p><div class="modal-actions"><button id="magnet-apply" class="primary">Übernehmen</button><button id="magnet-cancel">Abbrechen</button></div>');$('magnet-apply').onclick=()=>safe(async()=>{await applyProposal(proposal);$('modal').close();escape();});$('magnet-cancel').onclick=()=>{$('modal').close();escape();};});

}

function escape(){cornerSession?.finish();partPropertiesUI?.close();partPropertiesUI?.suspendExplosion();if($('modal').open&&$('modal').classList.contains('freecad-document-modal'))$('modal').close();featureUI?.close();referenceRebindUI?.close();if(jointsUI?.close())$('modal').close();projectParametersUI?.close();if(thicknessUI?.comparison.close())return;drawingUI?.close();meshHoleFillUI?.close();meshRepairUI?.close();meshReduceUI?.close();meshRemeshUI?.close();meshSmoothUI?.close();meshSculptUI?.close();meshEraseFillUI?.close();meshMakeSolidUI?.close();meshHollowUI?.close();meshFeaturesUI?.close();meshInspectorUI?.cancel();meshSelectionUI?.cancel();modelingUI?.close();advancedFreeCADUI?.close();if(sketchUI?.close())$('modal').close();if(functionsUI?.cancel())return;if(localStlTask){++localStlSequence;void localStlTask.cancel().catch(()=>{});localStlTask=null;setBusy(false);}const cancelled=controller.cancel();if(activePreview)controller.discard(activePreview.previewId);view.cancel();magnetSession=null;alignment=null;++alignmentTicket;alignmentMarks?.hide();view.setAlignmentReference(null);$('align-panel').hidden=true;$('mirror-panel').hidden=true;meshCopyUI?.close();inspectionUI?.close();thicknessUI?.close();tools?.escape();meshTools?.escape();meshExtras?.close();workplaneUI?.escape();clearPreview();$('magnet-mode').setAttribute('aria-pressed','false');ui?.refresh();if(cancelled){lastDisplayed=null;preparedDisplay=null;void scheduleRefresh().catch(error=>{if(error.name!=='AbortError')toast(error.message);});}}

function setMode(mode){escape();view.setMode(mode);document.querySelectorAll('[data-mode]').forEach(button=>button.classList.toggle('active',button.dataset.mode===mode));}

async function loadDemo(){if(activeEasyKind())throw Error('Beispiele im normalen Modus laden.');isolation.end();updateIsolation();const proposal=await controller.preview({kind:'batch',commands:[{op:'create',type:'box',name:'Platte',size:[60,40,6],pos:[0,0,3],as:'plate'},...[[-22,-12],[22,-12],[-22,12],[22,12]].map(([x,y],index)=>({op:'create',type:'cylinder',name:'Bohrung '+(index+1),size:[5,5,10],pos:[x,y,3],solid:false,as:'hole'+index})),{op:'group',targets:['$plate','$hole0','$hole1','$hole2','$hole3'],as:'result',name:'Platte mit vier Bohrungen'}]},{project:createCadProject(),label:'CAD-Beispiel laden'});await applyProposal(proposal);select([{rootId:proposal.aliases.result,path:[]}]);view.fit();}

function meshPartitionDraft(){return ['split','bodies','connectors'].includes(meshTools?.state()?.kind);}
function readyForFile(){if(!window.__cadReady)throw Error('Projektstart wird noch abgeschlossen.');if(partPropertiesUI?.editing()||partPropertiesUI?.state()?.hasPreview||partPropertiesUI?.state()?.busy||featureUI?.state()||referenceRebindUI?.state()||jointsUI?.state()||projectParametersUI?.state()||drawingUI?.state()||busy||meshPartitionDraft()||meshHoleFillUI?.state()||meshRepairUI?.state()||(meshReduceUI?.state()||meshRemeshUI?.state()||(meshSmoothUI?.state()||meshSculptUI?.state())||meshEraseFillUI?.state()||meshMakeSolidUI?.state()||(meshHollowUI?.state()||meshFeaturesUI?.state()))||meshSelectionUI?.state()||meshSelectionUI?.isChecking()||activePreview||meshCopyUI?.state()||tools?.state()?.preview||modelingUI?.state()||advancedFreeCADUI?.state()||sketchUI?.state()||meshExtras?.state()||workplaneUI?.state()||view.isEditing()||layoutUI.isActive()||layoutUI.isSaving())throw Error('Bearbeitung zuerst abschließen oder abbrechen.');if(fileBusy)throw Error('Ein Projekt wird bereits gespeichert oder geöffnet.');}

function confirmProjectChange(){

  if(!recoveredProject&&controller.revision()===cleanRevision&&workspaceSignature()===cleanWorkspaceSignature)return Promise.resolve(true);

  return new Promise(resolve=>{modal('Projekt wechseln','<p>'+(recoveredProject?'Wiederhergestelltes Projekt vor dem Wechsel als Projektdatei speichern?':'Aktuelle Änderungen vor dem Wechsel speichern?')+'</p><div class="modal-actions"><button id="project-change-cancel">Abbrechen</button><button id="project-change-discard">Ohne Speichern wechseln</button><button id="project-change-save" class="primary">Speichern und wechseln</button></div>');

    const dialog=$('modal'),finish=value=>{dialog.removeEventListener('close',closed);dialog.close();resolve(value);},closed=()=>finish(false);dialog.addEventListener('close',closed,{once:true});$('project-change-cancel').onclick=()=>finish(false);$('project-change-discard').onclick=()=>finish(true);$('project-change-save').onclick=()=>safe(async()=>{const result=await save();if(result?.saved)finish(true);});

  });

}

function cacheWelcomePackageThumbnail(file){
 const desktop=window.offlinecadDesktop,snapshot=controller.snapshot();
 if(!desktop?.cacheProjectThumbnail||!file.previewStamp||!snapshot.nodes.length)return;
 const revision=controller.revision(),scope=controller.projectScope();
 void (async()=>{
  const display=await controller.display(snapshot);
  if(revision!==controller.revision()||scope!==controller.projectScope())return;
  const image=renderCadProjectThumbnail(snapshot,display);
  await desktop.cacheProjectThumbnail({id:file.id,token:file.previewStamp,image});
 })().catch(()=>{});
}
async function projectThumbnail(encoded,signal){
 const worker=createCadController({resolveGeometry:packFiles.resolve,getFonts:fontLibrary.resources,createWorker:()=>new Worker(new URL('./cad-worker.js',import.meta.url),{type:'module'})});
 const cancel=()=>worker.cancel();
 signal.addEventListener('abort',cancel,{once:true});
 try{
  signal.throwIfAborted();
  const project=typeof encoded==='string'?parseCadProject(encoded):(await worker.readProject(encoded)).project;
  delete project.workspace;
  const display=await worker.display(project,{deflection:.2,angleDegrees:18});
  signal.throwIfAborted();
  return renderCadProjectThumbnail(project,display);
 }finally{
  signal.removeEventListener('abort',cancel);worker.dispose();
 }
}
const projectsUI=createCadProjectsUI({desktop:window.offlinecadDesktop,modal,open:openProject,save,safe,t,thumbnail:projectThumbnail});

async function placeImportedProposal(proposal,checkImport,metadata){
  const original=proposal,existing=new Set(project().nodes.map(n=>n.id)),ids=proposal.project.nodes.filter(n=>!existing.has(n.id)).map(n=>n.id);
  try{
    checkImport();
    const scene=await controller.describe(proposal.project);checkImport();
    const bounds=combinedPlacementBounds(scene.objects.filter(o=>ids.includes(o.id)&&!o.target.path.length).map(o=>o.worldBounds));
    const imports=project().nodes.filter(n=>n.metadata?.importedFile),known=imports.map(n=>importBatchById.get(n.id)?.index).filter(Number.isSafeInteger);
    const index=Math.max(nextImportIndex,Math.max(-1,...known)+1+imports.filter(n=>!importBatchById.has(n.id)).length);
    const delta=translate(modelPlacementDelta(bounds,index));
    for(const node of proposal.project.nodes)if(ids.includes(node.id)){
      node.transform=multiplyCadMatrices(delta,node.transform);
      node.metadata={...node.metadata,importedFile:metadata.importedFile};
    }
    proposal=await controller.preview(undefined,{project:proposal.project,revision:proposal.revision,label:original.label});
    proposal.warnings=[...new Set([...(original.warnings??[]),...(proposal.warnings??[])])];
    checkImport();await applyProposal(proposal);nextImportIndex=index+1;
    for(const id of ids)importBatchById.set(id,{batchId:ids[0],index});
    select(ids.map(rootId=>({rootId,path:[]})));view.fit();return ids[0];
  }catch(error){controller.discard(proposal.previewId);throw error;}
  finally{controller.discard(original.previewId);}
}

function about(){showCadAbout({modal,safe,language:preferences.language});}
function help(){modal('Formnaro bedienen','<p>Formen anklicken oder auf eine CAD-Fläche ziehen. Linksklick wählt, Umschalt ergänzt die Auswahl. Rechts ziehen dreht die Ansicht, mittlere Maustaste verschiebt.</p><p>Weiße Eckgriffe ändern die Maße bei fester Gegenecke und festem Boden. Quellenteile lassen sich im Objektbaum öffnen und bearbeiten. Löcher werden beim Gruppieren abgezogen.</p><p>Strg+Z: Rückgängig · Strg+Y: Wiederholen · Strg+D: Duplizieren · Strg+G: Gruppieren · Strg+Umschalt+G: Auflösen · L: Ausrichten · M: Spiegeln · D: Absetzen · W: Arbeitsebene · F: Einpassen · Esc: Abbrechen.</p><p>CAD-Körper und Netzteile teilen eine Arbeitsfläche und ein Projekt. STL, OBJ und Austauschdateien können als bearbeitbare Netzteile oder Ansichtsvorlagen importiert werden. Netzteile auswählen und Netz-Werkzeuge öffnen: Grundformen, Gruppieren, Bohren, Teilen, Materialkörper und Kanten. Vorschau prüfen, dann übernehmen oder abbrechen. Offene oder beschädigte Netze bleiben sichtbar; Körperwerkzeuge benötigen eine erfolgreiche Prüfung.</p><p>STEP verwendet native CAD-Geometrie. CAD und Netz werden nur über ausdrücklich aufgerufene Umwandlungen gewechselt. Anzeige und Export haben eigene Qualitätswerte.</p><p>Einstellungen → Dateien verwaltet gemeinsame Vorgaben und übertragbare Einstellungsdateien. Beim STL-Import als CAD lässt sich der geprüfte lokale Konverter um eine gezielte KI-Flächenkorrektur ergänzen. Der Konverter bietet zusätzlich eine lokale Symmetrieprüfung mit überlappender Spiegelrekonstruktion. Die CAD-Vorschau kann übernommen oder verworfen werden. Manuelle KI-Flächenkorrekturen bleiben verfügbar.</p><button id="help-about" type="button">'+(preferences.language==='en'?'About Formnaro':'Über Formnaro')+'</button><p><a data-about-link="support" href="'+aboutLinks.support+'">'+
  (preferences.language==='en'?'Support Formnaro via PayPal':'Formnaro über PayPal unterstützen')+'</a></p>');
  $('help-about').onclick=about;
  bindCadAboutLinks($('modal-body'),safe);
}

const actions={'cad-surface-fill':()=>advancedFreeCADUI.open('surface-fill'),'cad-surface-transition':()=>advancedFreeCADUI.open('surface-transition'),'cad-surface-sew':()=>advancedFreeCADUI.open('surface-sew'),'cad-surface-relief':()=>advancedFreeCADUI.open('surface-relief'),'cad-draft':()=>advancedFreeCADUI.open('draft'),'cad-defeature':()=>advancedFreeCADUI.open('defeature'),'cad-revolution':()=>advancedFreeCADUI.open('revolution'),'cad-helix':()=>advancedFreeCADUI.open('helix'),joints:()=>jointsUI.open(),'linked-contours':()=>modelingUI.openLinks(),'project-parameters':()=>projectParametersUI.open(),drawing:()=>drawingUI.open(),'cad-edit-modeling':()=>modelingUI.openEdit(),'cad-contour':()=>modelingUI.open('contour'),'cad-face-offset':()=>modelingUI.open('face-offset'),'cad-shell':()=>modelingUI.open('shell'),'cad-loft':()=>modelingUI.open('loft'),'cad-sweep':()=>modelingUI.open('sweep'),'sketch-templates':()=>ui.library.open(),'model-compare':()=>thicknessUI.comparison.open(),'sketch-on-part':()=>sketchUI.openOnPart(),thickness:()=>thicknessUI.open(),...ui.actions,...tools.actions,...meshTools.actions,'mesh-close-hole':()=>meshHoleFillUI.open(),'mesh-repair':()=>meshRepairUI.open(),'mesh-reduce':()=>meshReduceUI.open(),'mesh-curved-reduce':()=>meshReduceUI.open('curved-v1'),'mesh-large-reduce':()=>meshReduceUI.open('large-v1'),'mesh-remesh':()=>meshRemeshUI.open(),'mesh-smooth':()=>meshSmoothUI.open(),'mesh-sculpt':()=>meshSculptUI.open(),'mesh-erase-fill':()=>meshEraseFillUI.open(),'mesh-make-solid':()=>meshMakeSolidUI.open(),'mesh-hollow':()=>meshHollowUI.open(),'mesh-features':()=>meshFeaturesUI.open(),'mesh-inspector':()=>meshInspectorUI.open(),'mesh-select':()=>meshSelectionUI.open(),'mesh-more':()=>meshExtras.open(),measure:()=>inspectionUI.openMeasure(),legacyMeasure:()=>!selection.length||selection.some(t=>project().nodes.find(n=>n.id===t.rootId)?.kind!=='cad')?meshExtras.open('measure'):tools.actions.measure(),ruler:()=>project().nodes.some(n=>n.kind==='mesh'&&domainAllowsId(n.id))?meshExtras.open('ruler'):tools.actions.ruler(),section:()=>inspectionUI.openSection(),inspect:()=>selection.some(t=>project().nodes.find(n=>n.id===t.rootId)?.kind!=='cad')||!selection.length&&project().nodes.some(n=>n.kind==='mesh'&&domainAllowsId(n.id))?meshExtras.open('inspect'):tools.actions.inspect(),array:()=>selection.some(t=>project().nodes.find(n=>n.id===t.rootId)?.kind!=='cad')?meshExtras.open('array'):tools.actions.array(),'general-fit':()=>meshSelection()?meshExtras.open('fit'):tools.actions['general-fit'](),'lay-on-face':()=>meshSelection()?meshExtras.open('floor'):tools.actions['lay-on-face'](),'reference-place':()=>meshSelection()?meshExtras.open('reference'):tools.actions['reference-place'](),'edge-finish':()=>meshTools.open('finish'),'face-floor':()=>meshExtras.open('floor'),'split-plane':()=>meshTools.open('split'),'extract-bodies':()=>meshTools.open('bodies'),'hole-wizard':()=>meshTools.open('drill'),split:()=>meshSelection()?meshTools.open('split'):tools.actions.split(),extract:()=>meshSelection()?meshTools.open('bodies'):tools.actions.extract(),drill:()=>meshSelection()?meshTools.open('drill'):tools.actions.drill(),edges:()=>meshSelection()?meshTools.open('finish'):tools.actions.edges(),round:()=>meshSelection()?meshTools.actions['mesh-round']():tools.actions.round(),chamfer:()=>meshSelection()?meshTools.actions['mesh-chamfer']():tools.actions.chamfer(),sketch:()=>sketchUI.open(false,activeEasyKind()==='mesh'||meshSelection()),'edit-sketch':()=>sketchUI.open(true,meshSelection()),isolate:isolateSelection,'end-isolation':endIsolation,'cad-to-mesh':()=>meshCopyUI.open(),'mesh-to-cad':()=>{escape();readyForFile();if(selection.length!==1)throw Error('Genau ein Netzteil auswählen.');const revision=controller.revision(),input=meshCadInput(project(),selection[0],revision);functionsUI.converter(input.file,{boundSource:{source:input.source,current:()=>controller.revision()===revision}});},functions:()=>functionsUI.show(),'stl-to-step':()=>functionsUI.choose(),undo:async()=>{if(meshSelectionUI?.state()){meshSelectionUI.undo();return;}controller.undo();await refreshTask;},redo:async()=>{if(meshSelectionUI?.state()){meshSelectionUI.redo();return;}controller.redo();await refreshTask;},duplicate,copy:copySelection,paste,delete:remove,group,intersect:()=>group('intersection'),ungroup,align:alignPanel,mirror:mirrorPanel,drop,center:centerSelection,'workplane-set':workplanePick,'workplane-top':planeTop,'reset-plane':()=>mutate(draft=>{draft.workplane={origin:[0,0,0],orientation:[0,0,0,1],reference:null};},'Grundebene wiederherstellen'),fit:()=>view.fit(),projection:()=>{$('projection').textContent=view.toggleProjection();},demo:loadDemo,new:async()=>{readyForFile();if(!await confirmProjectChange())return;partPropertiesUI?.close();partPropertiesUI?.suspendExplosion();await controller.open(createCadProject(),{label:'Neues CAD-Projekt'});partPropertiesUI?.restoreExplosion(null);nextImportIndex=0;isolation.end();updateIsolation();activeProjectFile=null;preferredProjectFormat='ocad';savedRevision=null;savedWorkspaceSignature=null;cleanRevision=controller.revision();recoveredProject=false;select([]);await refreshTask;cleanWorkspaceSignature=workspaceSignature();updateSaveState();},open:()=>openProject(),projects:projectsUI.show,save,'save-as':()=>save({saveAs:true}),import:()=>$('import-file').click(),export:exportDialog,help};

const scaleNavigation=new Set(['fit','projection','help']);
const scaleInterruptions=new Set(['new','open','undo','redo']);
for(const [name,action]of Object.entries(actions))if(!scaleNavigation.has(name)&&typeof action==='function')actions[name]=(...args)=>{
 if(!window.__cadReady)throw Error('Projektstart wird noch abgeschlossen.');
 if(scalingPending()){
  if(!scaleInterruptions.has(name))throw Error('Skalierung zuerst übernehmen oder abbrechen.');
  escape();
 }
 assertReferenceRebindIdle();return action(...args);
};
document.addEventListener('click',event=>{
 const name=event.target.closest('[data-action]')?.dataset.action;
 if(event.target.closest('[data-view]')||scaleNavigation.has(name))return;
 if(!window.__cadReady){
  if(event.target.closest('button,input,select,textarea,[role="button"]')){event.preventDefault();event.stopImmediatePropagation();}
  return;
 }
 if(!scalingPending()||event.target.closest('.cad-corner-dialog'))return;
 if(scaleNavigation.has(name)||scaleInterruptions.has(name))return;
 if(event.target.closest('button,input,select,textarea,[role="button"]')){event.preventDefault();event.stopImmediatePropagation();}
},true);
document.addEventListener('contextmenu',event=>{
 if(scalingPending()&&event.target.closest('#viewport')){event.preventDefault();event.stopImmediatePropagation();}
},true);
document.addEventListener('click',event=>{const button=event.target.closest('[data-action]');if(button&&!button.disabled&&actions[button.dataset.action]){if(referenceRebindUI?.state()&&!['fit','projection','help'].includes(button.dataset.action)){toast('Bezugsneuzuordnung zuerst übernehmen oder abbrechen.');return;}if(partPropertiesUI?.editing()&&!['part-properties-open','fit','projection','help'].includes(button.dataset.action)){toast('Teileeigenschaften zuerst übernehmen oder schließen.');return;}if(jointsUI?.state()&&!['joints','fit','projection','help'].includes(button.dataset.action)){toast('Gelenkbewegung zuerst übernehmen oder abbrechen.');return;}if(projectParametersUI?.state()&&!['project-parameters','fit','projection','help'].includes(button.dataset.action)){toast('Projektparameter zuerst übernehmen oder schließen.');return;}if(drawingUI?.state()&&!['drawing','help'].includes(button.dataset.action)){toast('Zeichnungsblatt zuerst übernehmen oder schließen.');return;}if(advancedFreeCADUI?.state()&&!['cad-draft','cad-defeature','cad-revolution','cad-helix','cad-surface-fill','cad-surface-transition','cad-surface-sew','cad-surface-relief','fit','projection','help'].includes(button.dataset.action)){toast('FreeCAD-Bearbeitung zuerst übernehmen oder abbrechen.');return;}if(modelingUI?.state()&&!['linked-contours','cad-contour','cad-face-offset','cad-shell','cad-loft','cad-sweep','cad-edit-modeling','fit','projection','help'].includes(button.dataset.action)){toast('CAD-Bearbeitung zuerst übernehmen oder abbrechen.');return;}if((meshHoleFillUI?.state()||meshRepairUI?.state()||(meshReduceUI?.state()||meshRemeshUI?.state()||(meshSmoothUI?.state()||meshSculptUI?.state())||meshEraseFillUI?.state()||meshMakeSolidUI?.state()||(meshHollowUI?.state()||meshFeaturesUI?.state()))||meshPartitionDraft())&&!['mesh-close-hole','mesh-repair','mesh-reduce','mesh-large-reduce','mesh-remesh','mesh-smooth','mesh-sculpt','mesh-erase-fill','mesh-make-solid','mesh-hollow','mesh-features','mesh-tools','mesh-split','mesh-extract','mesh-connectors','split','extract','fit','projection'].includes(button.dataset.action)){toast('Netzbearbeitung zuerst übernehmen oder abbrechen.');return;}if(meshSelectionUI?.state()&&!['mesh-select','fit','projection','help','undo','redo'].includes(button.dataset.action)){toast('Netz-Flächenauswahl zuerst übernehmen oder abbrechen.');return;}void safe(actions[button.dataset.action]);}});

document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>view.setView(button.dataset.view));document.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>setMode(button.dataset.mode));document.querySelectorAll('[data-mirror]').forEach(button=>button.onclick=()=>safe(()=>mirror(Number(button.dataset.mirror))));

// Inspection is read-only but owns clipping, markers and point input. End it
// before another modelling action takes over the same viewport controls.
for(const name of Object.keys(actions))if(!['measure','section','fit','projection','save','save-as','export','copy'].includes(name)&&typeof actions[name]==='function'){
 const action=actions[name];actions[name]=(...args)=>{inspectionUI?.close();thicknessUI?.close();return action(...args);};
}
$('ai-open').onclick=()=>safe(()=>aiUI.openChat());$('magnet-mode').onclick=()=>safe(magnet);$('modal-close').onclick=()=>{if(cornerSession){cornerSession.finish();return;}functionsUI?.cancel();if($("modal").classList.contains("ai-modal")){$("modal").close();return;}if(localStlTask)escape();$('modal').close();if(activePreview)escape();};$('modal').addEventListener('cancel',()=>{if(!$('modal').classList.contains('ai-modal'))escape();});$('open-file').onchange=()=>safe(async()=>{const file=$('open-file').files[0];$('open-file').value='';if(file)await openFile(file);});$('import-file').onchange=()=>safe(()=>{const files=Array.from($('import-file').files);$('import-file').value='';if(files.length)return importDialog(exchangeMainFile(files,{freecad:true}),{files});});

for(const [id,key]of [['toggle-left','library'],['toggle-right','inspector']])$(id).onclick=()=>safe(()=>layoutUI.togglePanel(key));

$('viewport').addEventListener('dragover',event=>{event.preventDefault();event.dataTransfer.dropEffect='copy';});$('viewport').addEventListener('drop',event=>{event.preventDefault();void safe(async()=>{if(event.dataTransfer.files.length){const files=Array.from(event.dataTransfer.files);return importDialog(exchangeMainFile(files,{freecad:true}),{files});}const plugin=event.dataTransfer.getData('application/x-offlinecad-plugin');if(plugin){const [id,shapeId]=JSON.parse(plugin),pack=plugins.find(pack=>pack.manifest.id===id);if(!pack)throw Error('Plugin fehlt.');return addPlugin(pack.manifest,shapeId,event);}const type=event.dataTransfer.getData('text/plain');if(type)return addShape(type,event);});});

document.addEventListener('keydown',event=>{if(!window.__cadReady)return;if(event.key==='Escape'){if(functionsUI?.state()?.projectPreview)event.preventDefault();escape();return;}if(event.target.closest('input,textarea,select,[contenteditable="true"]')||$('modal').open&&!cornerSession||layoutUI.isActive()||drawingUI?.state()||projectParametersUI?.state())return;const ctrl=event.ctrlKey||event.metaKey,key=event.key.toLowerCase();if(scalingPending()){const action=ctrl?{z:event.shiftKey?'redo':'undo',y:'redo',o:'open'}[key]:key==='f'?'fit':null;if(action){event.preventDefault();void safe(actions[action]);}return;}if(referenceRebindUI?.state()){if(!ctrl&&key==='f'){event.preventDefault();view.fit();return;}event.preventDefault();toast('Bezugsneuzuordnung zuerst übernehmen oder abbrechen.');return;}if(partPropertiesUI?.editing()){if(!ctrl&&key==='f'){event.preventDefault();view.fit();return;}if(ctrl||['delete','backspace','arrowleft','arrowright','arrowup','arrowdown','pageup','pagedown','t','s','r','l','m','d','w'].includes(key)){event.preventDefault();toast('Teileeigenschaften zuerst übernehmen oder schließen.');return;}}if(meshHoleFillUI?.state()||meshRepairUI?.state()||(meshReduceUI?.state()||meshRemeshUI?.state()||(meshSmoothUI?.state()||meshSculptUI?.state())||meshEraseFillUI?.state()||meshMakeSolidUI?.state()||(meshHollowUI?.state()||meshFeaturesUI?.state()))||meshPartitionDraft()){if(!ctrl&&key==='f'){event.preventDefault();view.fit();return;}if(ctrl||['delete','backspace','arrowleft','arrowright','arrowup','arrowdown','pageup','pagedown','t','s','r','l','m','d','w'].includes(key)){event.preventDefault();toast('Netzbearbeitung zuerst übernehmen oder abbrechen.');return;}}if(meshSelectionUI?.state()){if(ctrl&&['z','y'].includes(key)){event.preventDefault();void safe(()=>key==='y'||event.shiftKey?meshSelectionUI.redo():meshSelectionUI.undo());return;}if(!ctrl&&key==='f'){event.preventDefault();view.fit();return;}if(ctrl||['delete','backspace','arrowleft','arrowright','arrowup','arrowdown','pageup','pagedown','t','s','r','l','m','d','w'].includes(key)){event.preventDefault();toast('Netz-Flächenauswahl zuerst übernehmen oder abbrechen.');return;}}if(modelingUI?.state()||advancedFreeCADUI?.state()){if(!ctrl&&key==='f'){event.preventDefault();view.fit();return;}if(ctrl||['delete','backspace','arrowleft','arrowright','arrowup','arrowdown','pageup','pagedown','t','s','r','l','m','d','w'].includes(key)){event.preventDefault();toast('CAD-Bearbeitung zuerst übernehmen oder abbrechen.');return;}}if(ctrl&&key==="a"){event.preventDefault();select((nativeScene?.objects??[]).filter(item=>!item.target.path.length&&!item.hidden&&view.allows(item.target.rootId)).map(item=>item.target));return;}if(!ctrl&&["t","s","r"].includes(key)){event.preventDefault();setMode({t:"translate",s:"scale",r:"rotate"}[key]);return;}let action;if(ctrl)action={z:event.shiftKey?'redo':'undo',y:'redo',d:'duplicate',c:'copy',v:'paste',g:event.shiftKey?'ungroup':'group',s:event.shiftKey?'save-as':'save',o:'open'}[key];else action={delete:'delete',backspace:'delete',f:'fit',l:'align',m:'mirror',d:'drop',w:'workplane-set'}[key];if(action){event.preventDefault();void safe(actions[action]);return;}if(['arrowleft','arrowright','arrowup','arrowdown','pageup','pagedown'].includes(key)){event.preventDefault();const step=preferences.snap||1,delta={arrowleft:[-step,0,0],arrowright:[step,0,0],arrowup:[0,step,0],arrowdown:[0,-step,0],pageup:[0,0,step],pagedown:[0,0,-step]}[key],frame=activeFrame(),world=new THREE.Vector3(...delta).transformDirection(new THREE.Matrix4().fromArray(frame)).multiplyScalar(step);void safe(()=>gesture({targets:selected({editable:true}).map(value=>value.target),delta:translate(world.toArray()),revision:controller.revision()}));}});

const externalAutomation=createCadAutomationSession({onStart:(method,id)=>window.offlinecadDesktop?.automationProgress?.({id,phase:method,revision:controller.revision()}),dispatch:(method,args)=>access.dispatch(method,args),cancel:method=>{controller.cancel();if(method==='preview')clearPreview();},discard:id=>access.discard(id),completedPreview:async(result,id)=>{if(!activePreview||activePreview.aiInProgress&&activePreview.automationRequestId===id)await showPreview(result);},failedPreview:id=>{if(activePreview?.aiInProgress&&activePreview.automationRequestId===id)clearPreview();}});
window.offlinecadDesktop?.onAutomationCancel?.(id=>externalAutomation.cancel(id));
window.offlinecadDesktop?.onAutomation(async(method,args,id)=>{try{if(!window.__cadReady)throw Error('CAD kernel is not ready.');return {format:'FormnaroAutomationReply',version:1,ok:true,value:await (method==='agent_chat'&&window.offlinecadDesktop.orcaRequest?aiUI.externalAgentRequest(args):externalAutomation.run(method,args,id))};}catch(error){return {format:'FormnaroAutomationReply',version:1,ok:false,error:{message:String(error.message),...(typeof error.code==='string'?{code:error.code}:{}),feedback:aiFeedback(error)}};}});

// View-only changes also belong to recovery, without writing a large BRep on

// every animation frame. Save after the workspace has settled for one second.

recoveryActions.startAutosave();
window.__formnaroFlushRecovery=recoveryActions.flushOnClose;

window.addEventListener('beforeunload',recoveryActions.saveOnUnload);
// A navigation can be rejected after beforeunload while this renderer stays active.
window.addEventListener('pagehide',event=>{
 if(event.persisted)return;
 easyRepair?.invalidate();recoveryActions.stopAutosave();meshHoleFillUI?.dispose();meshRepairUI?.dispose();meshReduceUI?.dispose();meshRemeshUI?.dispose();meshSmoothUI?.dispose();meshSculptUI?.dispose();meshEraseFillUI?.dispose();meshMakeSolidUI?.dispose();meshHollowUI?.dispose();meshFeaturesUI?.dispose();meshInspectorUI?.dispose();meshSelectionUI?.dispose();inspectionUI?.dispose();thicknessUI?.dispose();functionsUI?.dispose();advancedFreeCADUI?.close();modelingUI?.dispose();sketchUI?.close();aiUI?.dispose();featureUI?.dispose();freecadDocumentReader?.dispose();freecadImportReader?.dispose();meshTools?.close();meshExtras?.dispose();meshCopyUI?.dispose();workplaneUI?.dispose();recoveryEncoder?.dispose();controller.dispose();view.dispose();});

const assemblyNotice=document.createElement('div');assemblyNotice.id='cad-assembly-notice';assemblyNotice.className='cad-assembly-notice';assemblyNotice.hidden=true;assemblyNotice.setAttribute('role','status');$('viewport').append(assemblyNotice);
function updateAssemblyNotice(){const state=assemblyDisplay.state(project());if(state.loadSet===null){if(!assemblyNotice.hidden)assemblyNotice.hidden=true;return;}assemblyNotice.hidden=false;assemblyNotice.textContent=state.loaded+' von '+state.total+' Teilen vollständig dargestellt · übrige sichtbare Teile als Rahmen';}
async function changeAssemblyDisplay(action,requestedIds){readyForFile();await refreshTask;if(controller.state().busy)throw Error('Laufende Bearbeitung zuerst abschließen.');escape();const before=assemblyDisplay.ids(project()),ids=requestedIds??[...new Set(getSelection().map(t=>t.rootId))];try{if(action==='only')assemblyDisplay.only(ids,project());else if(action==='load')assemblyDisplay.load(ids,project());else if(action==='all')assemblyDisplay.all(project());else throw Error('Unbekannte Baugruppenansicht.');controller.invalidateDisplayView();lastDisplayed=null;preparedDisplay=null;await scheduleRefresh();updateSaveState();return assemblyDisplay.state(project());}catch(error){assemblyDisplay.restore(before,project());controller.invalidateDisplayView();lastDisplayed=null;preparedDisplay=null;await scheduleRefresh();throw error;}}
for(const [id,label,action]of [['assembly-only','Nur Auswahl vollständig darstellen','only'],['assembly-load','Teil nachladen','load'],['assembly-all','Alles darstellen','all']]){actions[id]=()=>changeAssemblyDisplay(action);const button=document.createElement('button');button.dataset.action=id;button.textContent=label;button.onclick=()=>void safe(actions[id]);const menu=document.querySelector('.view-controls');if(menu)menu.append(button);}
updateAssemblyNotice();

function canSwitchWorkbench(){readyForFile();if(insertionBusy||$('modal').open||meshTools?.state()||tools?.state())throw Error('Bearbeitung zuerst abschließen oder abbrechen.');return true;}
function changedEasyDomain(){easyRepair?.invalidate();easyDomainRevision++;escape();isolation.end();updateIsolation();select(selection);ui?.refresh();updateState();view.fit();}
function setEasyDomain(kind){if(kind===easyDomain.get())return;if(workbenchUI.mode()!=='easy')throw Error('Den CAD-/Netz-Schalter im Easy-Tinker-Modus verwenden.');canSwitchWorkbench();if(easyDomain.set(kind))changedEasyDomain();}
function restrictEasyImport(id,kind){const control=$(id);for(const option of [...control.options])if(option.value!==kind)option.remove();control.value=kind;}
workbenchUI=createCadWorkbenchUI({storage,layoutUI,safe,t,fusionOptions:{getProject:project,getSelection:()=>selection,select,openAbout:about},solidOptions:{view,openAbout:about,getLanguage:()=>preferences.language,openSettings:()=>ui.settings.open(),isIdle:()=>{try{return canSwitchWorkbench();}catch{return false;}},canExecute:command=>{
  if(!['round','chamfer','cut','sketch-on-part','drill'].includes(command))return true;
  const item=selection.length===1&&!selection[0].path.length?nativeScene?.objects.find(object=>targetKey(object.target)===targetKey(selection[0])):null;
  return !!item&&!item.hidden&&!item.locked&&view.allows(item.id)&&(item.kind==='cad'?item.solid:item.meshRole!=='hole');
},executeCommand:command=>{if(command==='extrude'){readyForFile();return sketchUI.open(false,false);}if(command==='cut'){readyForFile();return sketchUI.openOnPart('cut');}if(actions[command])return actions[command]();throw Error('Unbekannter Solid-Befehl: '+command);}},canSwitch:canSwitchWorkbench,onModeChange:changedEasyDomain,getDomain:easyDomain.get,setDomain:setEasyDomain,domainCounts:()=>({cad:project().nodes.filter(node=>node.kind==='cad').length,mesh:project().nodes.filter(node=>node.kind==='mesh').length}),getCreationMode:creationDomain.get,getCreationKind:creationKind,setCreationMode:value=>{canSwitchWorkbench();if(layoutUI.isActive()||layoutUI.isSaving())throw Error('Bearbeitung zuerst abschließen oder abbrechen.');creationDomain.set(value);}});
function contextMenuIdle(){if(scalingPending())return false;try{return canSwitchWorkbench();}catch{return false;}}
function contextApplyButton(){return [...document.querySelectorAll('.edge-tool-panel:not([hidden])')].flatMap(panel=>[...panel.querySelectorAll('[data-edge-apply],[data-modeling-apply],[data-advanced-apply],[data-surface-apply],[data-split-apply],[data-extract-apply],#workplane-preview-apply,[data-lay-apply],[data-apply]')]).find(button=>!button.disabled&&button.getClientRects().length);}
async function contextProperties(){if(workbenchUI.mode()==='fusion')workbenchUI.fusion.selectManager('properties');else if(workbenchUI.mode()==='solid')workbenchUI.solid.selectManager('properties');else if(workbenchUI.mode()==='normal')await layoutUI.openPanel('inspector');$('object-name')?.focus();}
async function contextCommand(key,picked={}){
 if(key==='cancel'){escape();return;}if(key==='apply-active'){contextApplyButton()?.click();return;}if(key==='fit'){view.fit();return;}
 if(!contextMenuIdle())throw Error('Bearbeitung zuerst abschließen oder abbrechen.');
 if(key.startsWith('view-')){view.setView(key.slice(5));return;}if(key.startsWith('mode-')){setMode(key.slice(5));return;}
 if(key==='properties')return contextProperties();
 if(key==='edit-feature'){const selected=selection.length===1?context(selection[0]):null;if(selected?.node.recipe?.type==='sketch'||selected?.node.meshSource?.node?.type==='sketch')return actions['edit-sketch']();if(selected?.node.source==='modeling'&&['face-offset','shell','sweep','loft'].includes(selected.node.modeling?.kind))return actions['cad-edit-modeling']();return contextProperties();}
 if(key==='extrude')return sketchUI.open(false,activeEasyKind()==='mesh');if(key==='cut'||key==='sketch-on-part'){await sketchUI.openOnPart(key==='cut'?'cut':'add');if(picked.canvas&&picked.target&&selection.length===1&&!selection[0].path.length&&selection[0].rootId===picked.target.rootId)await sketchUI.pickAttachment(view.cadRay(picked.point),picked.point,view.visualHit(picked.point));return;}
 if(actions[key])return actions[key]();throw Error('Unbekannte Rechtsklick-Funktion.');
}
contextMenuUI=createCadContextMenu({storage,view,getMode:()=>workbenchUI.mode(),getSelection,getRevision:()=>controller.revision(),getProjectScope:()=>controller.projectScope(),getPickTool:()=>tools.pickTool(),describePick:target=>nativeScene?.objects.find(item=>targetKey(item.target)===targetKey(target))?.name,select,getLanguage:()=>preferences.language,safe,toast,openSettings:()=>ui.settings.open(),getFunctions:functionPlugins.list,isIdle:contextMenuIdle,
 getContexts:()=>selection.flatMap(target=>{try{const c=context(target),n=c.node;return [{name:n.name,kind:n.kind,locked:c.locked||c.sourceGeometryReadonly,hidden:c.hidden,root:!target.path.length,solid:n.kind==='cad'?n.solid:n.meshRole!=='hole',sketch:n.recipe?.type==='sketch'||n.meshSource?.node?.type==='sketch'}];}catch{return [];}}),
 canRun:key=>{if(key==='cancel')return true;if(key==='apply-active')return !!contextApplyButton();if(key==='fit')return true;if(!contextMenuIdle())return false;const buttons=[...document.querySelectorAll('[data-action="'+key+'"]')];return !buttons.length||buttons.some(b=>!b.disabled);},runCommand:contextCommand});
easyRepair=createEasyMeshRepair({controller,isEnabled:()=>!!window.__cadReady&&activeEasyKind()==='mesh',isVisible:id=>view.allows(id)&&!isGeometryRef(project().nodes.find(n=>n.id===id)?.mesh),isIdle:()=>!busy&&!fileBusy&&!insertionBusy&&!$('modal').open&&!activePreview&&!alignment&&!magnetSession?.dragging&&!localStlTask&&!view.isEditing()&&!layoutUI.isActive()&&!layoutUI.isSaving()&&!referenceRebindUI?.state()&&!drawingUI?.state()&&!projectParametersUI?.state()&&!modelingUI?.state()&&!advancedFreeCADUI?.state()&&!sketchUI?.state()&&!tools?.state()&&!meshTools?.state()&&!(inspectionUI?.state()||thicknessUI?.state())&&!meshExtras?.state()&&!workplaneUI?.state()&&!meshCopyUI?.state()&&!meshSelectionUI?.state()&&!meshSelectionUI?.isChecking()&&!meshInspectorUI?.state()&&!meshRepairUI?.state()&&!(meshReduceUI?.state()||meshRemeshUI?.state()||(meshSmoothUI?.state()||meshSculptUI?.state())||meshEraseFillUI?.state()||meshMakeSolidUI?.state()||(meshHollowUI?.state()||meshFeaturesUI?.state()))&&!meshHoleFillUI?.state()&&!controller.state().busy&&!controller.state().worker.running&&!controller.state().meshWorker.running,notify:toast,afterApply:()=>refreshTask});
new MutationObserver(()=>easyRepair?.schedule()).observe($('viewport'),{subtree:true,attributes:true,attributeFilter:['hidden']});$('modal').addEventListener('close',()=>easyRepair?.schedule());
const sourceEdit=document.createElement('button');sourceEdit.id='easy-edit-source';sourceEdit.textContent='Formparameter …';sourceEdit.hidden=true;sourceEdit.onclick=()=>safe(()=>{const node=selected({roots:true,editable:true})[0].node;return node.meshSource?.node?.type==='text'?meshExtras.open('text'):meshTools.open('sources');});$('inspector').append(sourceEdit);
async function welcomeHistory(recovered,recoveryFormat){
 const desktop=window.offlinecadDesktop,entries=[];
 if(recovered&&(recovered.nodes.length||recovered.drawings?.sheets?.length)){
  welcome.setRecovery(async()=>{
   readyForFile();if(!await confirmProjectChange())return false;
   fileBusy=true;try{
    await openEncoded(JSON.stringify(recovered),null,{allowCatalog:recoveryFormat==='fnpack'});
    recoveredProject=true;preferredProjectFormat=recoveryFormat;updateState();return true;
   }finally{fileBusy=false;}
  });
 }
 try{
  const data=await desktop?.listProjects?.();
  for(const file of (data?.recent??[]).filter(file=>file.exists).slice(0,3)){
   entries.push({id:file.id,name:file.name,open:()=>openProject(file.id),thumbnail:async signal=>{
    const result=await desktop.projectThumbnail({id:file.id});
    if(result.image)return result.image;
    if(!result.project&&!result.bytes)return null;
    const image=await projectThumbnail(result.bytes??result.project,signal);
    return (await desktop.cacheProjectThumbnail({id:file.id,token:result.token,image})).cached?image:null;
   }});
  }
 }catch(error){toast(error.message);}
 if(!welcome.dismissed())welcome.showRecent(entries);
}
async function start(){
 setPreferences(preferences,{persist:false});await layoutUI.ready();
 const recoveryFormat=storage.getItem(PACK_RECOVERY_KIND)==='fnpack'?'fnpack':'ocad';
 let recovered=null;
 if(!window.offlinecadDesktop?.practiceReady){
  startup.setStartupPhase('read-recovery');
  try{recovered=await recovery.load(value=>{startup.setStartupPhase('validate-project');return controller.verify(value);});}
  catch(error){startupRecoveryFailed=true;toast('CAD-Autosicherung konnte nicht gelesen werden: '+error.message);}
 }
 await refreshTask;if(!nativeScene){startup.setStartupPhase('build-view');await scheduleRefresh();}
 cleanRevision=controller.revision();startupEmptyRevision=cleanRevision;cleanWorkspaceSignature=workspaceSignature();
 startup.setStartupPhase('ready');window.__cadReady=true;welcome.setReady();
 if(!welcome.dismissed())void welcomeHistory(recovered,recoveryFormat);
 for(const warning of storage.info?.().warnings??[])toast(warning);if(Object.keys(storage.info?.().unavailable??{}).length)toast('Einige gespeicherte Dateien konnten nicht geladen werden. Sie bleiben unverändert und schreibgeschützt; bitte den Datenordner prüfen.');easyRepair?.schedule();if(new URLSearchParams(location.search).has('test'))window.__cadTest={externalAutomation,setPracticeQuality:value=>{practiceVerificationQuality=structuredClone(value);},startupPhases:startup.startupPhases,recoveryEncodingStats:()=>recoveryEncoder?.stats(),requestRecovery:()=>recoveryActions.writeConfirmedRecovery(workspace()),flushRecoveryOnClose:window.__formnaroFlushRecovery,partPropertiesUI,runLocalScript:runCadAIScript,sourceDisplayState:()=>({key:sourceDisplayKey,expected:sourceViewKey(),sceneRevision:nativeScene?.revision,revision:controller.revision(),canEdit:!busy&&nativeScene?.revision===controller.revision()&&(!selection.some(target=>target.path.length)||sourceDisplayKey===sourceViewKey())}),packFiles,programAssistant,assemblyDisplay,changeAssemblyDisplay,jointsUI,linkedContoursUI:modelingUI,workbenchUI,contextMenuUI,easyRepair,controller,view,inspectionUI,thicknessUI,marksView,aiUI,featureUI,activePreview:()=>activePreview?{previewId:activePreview.previewId,revision:activePreview.revision}:null,showPreview,clearPreview,ui,tools,meshTools,meshExtras,meshCopyUI,meshSelectionUI,meshInspectorUI,meshRepairUI,meshReduceUI,meshRemeshUI,meshSmoothUI,meshSculptUI,meshEraseFillUI,meshMakeSolidUI,meshHollowUI,meshFeaturesUI,meshHoleFillUI,workplaneUI,sketchUI,modelingUI,advancedFreeCADUI,drawingUI,projectParametersUI,recovery,access,storage,layoutUI,referenceRebindUI,actions,execute,mutate,refresh:scheduleRefresh,settled:async()=>{await refreshTask;while(controller.state().busy||controller.state().worker.running||controller.state().meshWorker.running)await new Promise(resolve=>setTimeout(resolve,20));await refreshTask;await alignmentTask;},selection:getSelection,select,getScene,getModel:()=>controller.snapshot(),snapshot:()=>controller.snapshot(),isolation,projectsUI,serialize:()=>controller.serialize(),resetProject:async()=>{const pending=actions.new();document.getElementById('project-change-discard')?.click();return pending;},serializeWorkspace,workspace,openProject,functionsUI,functionPlugins,activeProjectFile:()=>copy(activeProjectFile),addShape,addPlugin,group,ungroup,mirror,drop,centerSelection,duplicate,loadDemo,importFile,importDialog,workflowSettings,openFile,exportModel,save,download,changeParameter:ui.changeParameter,setMode,projectPoint:view.projectPoint,getHandles:()=>view.groups.handles.children.filter(handle=>handle.userData.corner&&!handle.userData.height).map(handle=>({kind:handle.userData.kind,axes:handle.userData.scaleAxes,corner:handle.userData.corner,point:handle.position.toArray(),target:handle.userData.target})),getHeightHandle:()=>{const h=view.groups.handles.children.find(h=>h.userData.height);return h?{corner:h.userData.corner,kind:h.userData.kind,axes:h.userData.scaleAxes,point:h.position.toArray(),target:h.userData.target}:null;},getLiftHandle:()=>{const handle=view.groups.handles.children.find(handle=>handle.userData.lift);return handle?{point:handle.position.toArray(),axis:handle.userData.axis,target:handle.userData.target}:null;},sectionState:()=>inspectionUI.sectionState()??tools.sectionState(),renderCacheState:view.cacheState,getSettings:()=>copy(preferences),getQuality:()=>quality.get(),setQuality,cancel:escape,undoDepth:()=>controller.state().undo,bridge:access.dispatch};}

start().then(()=>{if(typeof window.offlinecadDesktop?.onPracticePlan==='function')practicePlayback=installCadPracticeRunner({desktop:window.offlinecadDesktop,controller,access,getSelection,select,view,setWorkbenchMode:workbenchUI.setMode,frameConstruction:framePracticeConstruction,getPracticeConverterState:()=>functionsUI.state(),getSketchFeedback:()=>sketchUI.practiceFeedback(),openSketchDraft:draft=>sketchUI.openPracticeDraft(draft),openPracticeFile:data=>{readyForFile();const file=practiceFileObject(data);return data.kind==='photo'?measurePracticePhoto(file,controller):functionsUI.converter(file,{intent:'import'});},getAlignmentState:()=>alignment?{ids:[...alignment.ids],referenceId:alignment.referenceId,revision:controller.revision()}:null,getEdgeState:()=>tools.practiceEdgeState(),getInspectionState:()=>inspectionUI.state(),getFacePickState:()=>modelingUI.state(),getDrillState:()=>tools.referenceUI.practiceDrillState(),getPreferences:()=>preferences,settled:async()=>{await refreshTask;while(controller.state().busy||controller.state().worker.running||controller.state().meshWorker.running)await new Promise(resolve=>setTimeout(resolve,20));await refreshTask;await alignmentTask;}});}).catch(error=>{window.__cadError=error.message;console.error(error);$('status').textContent='CAD-Start fehlgeschlagen: '+error.message;toast(error.message);});



