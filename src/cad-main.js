import {mountFreeCADImport} from './cad-freecad-import-ui.js';
import {mountFreeCADDocumentReader} from './cad-freecad-document-ui.js';
import {createCadAIFeatureUI} from './cad-ai-feature-ui.js';
import {captureCadAIFeatureScope} from './cad-ai-feature-automation.js';
import {reviewPhotoSet,reviewStoredPhotoSet} from './cad-photo-multiview-review.js';
import {createCadProgramAssistant} from './cad-program-assistant.js';
import {stripGeometryIdentity} from './cad-fnpack-data.js';
import {cadContourSourceClosure} from './cad-linked-contours-data.js';
import {createFnpackFiles} from './cad-fnpack-files.js';
import {createFnpackRecovery,PACK_RECOVERY_KIND} from './cad-fnpack-recovery.js';
import {createThemeBinding} from './theme.js';
import {writeStartupRecovery} from './cad-startup-recovery.js';
import {runCadAIScript} from './cad-ai-sandbox.js';
import {hasGeometryRefs,isGeometryRef} from './cad-geometry-ref.js';
import './cad-assembly-display.css';
import {createCadAssemblyDisplay} from './cad-assembly-display.js';
import {createCadJointsUI} from './cad-joints-ui.js';
import {formatUiNumber,preserveUiNumber} from './ui-numbers.js';
import {createCadThicknessUI} from './cad-thickness-ui.js';
import {prepareMeshImport} from './mesh-import-client.js';
import {MESH_IMPORT_LIMITS} from './mesh-import-limits.js';
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

import {meshSvgPaths,meshTextPaths} from './mesh-contours.js';

import {exportCadProjectSvg} from './cad-svg-export.js';

import {commonFrame,commonBounds,meshMagnetTransform} from './common-tool-operations.js';

import {aiFeedback} from './ai-feedback.js';

import {cloneCadSources} from './cad-source-clone.js';

import {createCadAnnotationsView} from './cad-annotations-view.js';

import './style.css';

import './settings.css';

import * as THREE from 'three';

import {STLLoader} from 'three/addons/loaders/STLLoader.js';

import {OBJLoader} from 'three/addons/loaders/OBJLoader.js';

import {SVGLoader} from 'three/addons/loaders/SVGLoader.js';

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

import {createCadProject,CAD_PROJECT_LIMITS,parseCadProject,createCadWorkspaceSerializer} from './cad-project.js';

import {readExchangeFile,exchangeMainFile,exchangeImportSummary} from './exchange-formats.js';

import {createCadProjectsUI} from './cad-projects-ui.js';

import {createCadIsolation,cadPermanentlyVisible} from './cad-isolation.js';

import {renderCadProjectThumbnail} from './cad-project-thumbnail.js';

import {validateCadWorkspace,cadWorkspaceStoredProjectVersion} from './cad-workspace.js';

import {createFunctionPlugins} from './cad-function-plugins.js';

import {createCadFunctionsUI} from './cad-functions-ui.js';

import {hasLocalStlConverter,conversionControls,readConversionControls,conversionSummary,createLocalStlConversion} from './cad-stl-converter.js';

import {cadIdentity,cadPoint,multiplyCadMatrices,inverseCadMatrix,resizeCadAtCorner} from './cad-affine.js';

import {cadSelectionContext} from './cad-interface-state.js';

import {CAD_SHAPES} from './cad-shapes.js';

import {originalCadSubpath} from './cad-original-contours.js';

import {loadPlugins} from './cad-plugin-manifest.js';

import {createProgramStorage} from './program-storage.js';

import {createErrorReporter} from './error-log.js';

import {loadPreferences,validatePreferences} from './preferences.js';

import {createCadQualitySettings} from './cad-quality.js';

import {createCadWorkflowSettings} from './cad-workflow-settings.js';

import {createLayoutUI} from './layout-ui.js';
import {createCadWorkbenchUI} from './cad-workbench-ui.js';
import {createCadContextMenu} from './cad-context-menu.js';
import {createEasyDomain,easyDomainAllows,easyImportPolicy,easyExportIds} from './cad-easy-domain.js';
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
import {captureCadLinkedClipboard,insertCadLinkedClipboard} from './cad-linked-contours-clipboard.js';
import {cadDrawingSvg,cadDrawingDxf} from './cad-drawing-export.js';
import {cadDrawingPaperSize,cadDrawingSourceSignatures} from './cad-drawing-data.js';

import {createCadFontLibrary} from './cad-fonts.js';

import './sidebar.css';

import {FORMNARO_VERSION,FORMNARO_BUILD_LABEL} from './version.js';

document.title='Formnaro '+FORMNARO_VERSION+' · '+FORMNARO_BUILD_LABEL+' · Lokale 3D-Werkstatt';

const versionLabel=document.createElement('small');versionLabel.id='app-version';versionLabel.textContent='v'+FORMNARO_VERSION+' · '+FORMNARO_BUILD_LABEL;versionLabel.dataset.noTranslate='';document.querySelector('.brand').append(versionLabel);



const $=id=>document.getElementById(id),copy=value=>structuredClone(value),targetKey=value=>value.rootId+'/'+value.path.join('/');

const translate=point=>new THREE.Matrix4().makeTranslation(...point).toArray();

let storage;

try{storage=createProgramStorage(localStorage,window.offlinecadDesktop,{cadOnly:true});}catch(error){window.__cadError=error.message;$('status').textContent='Start fehlgeschlagen: '+error.message;throw error;}

let preferredProjectFormat=storage.getItem(PACK_RECOVERY_KIND)==='fnpack'?'fnpack':'ocad',closingAfterPackRecovery=false,packClosePending=false;
const packFiles=createFnpackFiles(window.offlinecadDesktop);
const recovery=createFnpackRecovery({desktop:window.offlinecadDesktop,storage,files:packFiles,legacy:createCadRecovery(storage),getProject:()=>controller.readSnapshot(),preferPack:()=>preferredProjectFormat==='fnpack'});

let jointsUI,sketchUI,modelingUI,advancedFreeCADUI,drawingUI,projectParametersUI,meshTools,meshExtras,meshCopyUI,meshSelectionUI,meshInspectorUI,meshRepairUI,meshReduceUI,meshRemeshUI,meshSmoothUI,meshSculptUI,meshEraseFillUI,meshMakeSolidUI,meshHollowUI,meshFeaturesUI,meshHoleFillUI,workplaneUI,modalSequence=0;

const fontLibrary=createCadFontLibrary(storage);

let preferences=loadPreferences(storage),plugins=loadPlugins(storage),selection=[],nativeScene=null,ui,featureUI,tools,inspectionUI,thicknessUI,layoutUI,aiUI,refreshTask=Promise.resolve(),refreshTicket=0,sourceTicket=0,sourceDisplayKey=null,lastDisplayed=null,preparedDisplay=null,savedRevision=null,clipboard=[],activePreview=null,magnetSession=null,alignment=null,alignmentMarks,marksView,alignmentTask=Promise.resolve(),alignmentTicket=0,busy=false,busyTimer;

const importBatchById=new Map(),browserExportCounts=new Map();

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

function toast(message){$('toast').textContent=t(message);$('toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').style.display='none',6000);}

function safe(fn){try{const result=fn();return result?.catch?result.catch(error=>{if(error.name!=='AbortError'){errorReporter.report(error);console.error(error);toast(error.message);}return undefined;}):result;}catch(error){if(error.name!=='AbortError'){errorReporter.report(error);console.error(error);toast(error.message);}return undefined;}}

let freecadImportReader;
function modal(title,content,{modeless=false}={}){freecadImportReader?.dispose();freecadImportReader=null;meshHoleFillUI?.close();meshRepairUI?.close();meshReduceUI?.close();meshRemeshUI?.close();meshSmoothUI?.close();meshSculptUI?.close();meshEraseFillUI?.close();meshMakeSolidUI?.close();meshHollowUI?.close();meshFeaturesUI?.close();meshInspectorUI?.cancel();meshSelectionUI?.cancel();modalSequence++;const dialog=$('modal');if(dialog.open&&dialog.matches(':modal')===modeless)dialog.close();dialog.classList.remove('ai-modal','projects-modal','stl-workbench-modal','stl-project-preview','freecad-document-modal','freecad-document-preview','freecad-document-review');$('modal-title').textContent=t(title);$('modal-body').innerHTML=content;if(!dialog.open){if(modeless)dialog.show();else dialog.showModal();}}

async function download(data,filename,mime='application/octet-stream',{numbered=false,signal}={}){
  const canceled=()=>({saved:false,canceled:true});if(signal?.aborted)return canceled();
  const blob=data instanceof Blob?data:new Blob([data],{type:mime}),safeName=filename.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_');
  if(window.offlinecadDesktop?.saveFile){const bytes=new Uint8Array(await blob.arrayBuffer());if(signal?.aborted)return canceled();const operationId=signal?crypto.randomUUID():undefined,abort=()=>{if(operationId)void window.offlinecadDesktop.cancelFileSave?.({operationId}).catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});try{return await window.offlinecadDesktop.saveFile({filename:safeName,...(numbered?{numbered:true}:{}),...(operationId?{operationId}:{}),bytes});}finally{signal?.removeEventListener('abort',abort);}}
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;const count=numbered?(browserExportCounts.get(safeName)??0):0;link.download=count?safeName.replace(/(\.[^.]+)?$/,(_,ext)=>(count+1)+(ext??'')):safeName;document.body.append(link);if(signal?.aborted){link.remove();URL.revokeObjectURL(url);return canceled();}link.click();link.remove();if(numbered)browserExportCounts.set(safeName,count+1);setTimeout(()=>URL.revokeObjectURL(url),5000);return {saved:true};
}

const progress=document.createElement('button');progress.id='cad-cancel';progress.hidden=true;progress.textContent='Berechnung abbrechen';progress.onclick=()=>escape();$('viewport').append(progress);

function setBusy(value){const wasBusy=busy;busy=value;if(!value){clearTimeout(busyTimer);progress.hidden=true;}else if(!wasBusy){progress.textContent='Berechnung abbrechen';busyTimer=setTimeout(()=>{if(busy)progress.hidden=false;},200);}document.body.dataset.cadBusy=String(value);$('status').textContent=value?'Modell wird berechnet · Abbrechen oder Esc':t('Linksklick: auswählen · Umschalt: Mehrfachauswahl · Rechts ziehen: Ansicht drehen');updateState();}

const assemblyDisplay=createCadAssemblyDisplay();let assemblyOpening=false,assemblyScope=null,assemblyKnownIds=new Set();
const controller=createCadController({resolveGeometry:packFiles.resolve,getDisplayIds:candidate=>assemblyDisplay.displayIds(candidate,assemblyOpening?candidate:controller.readSnapshot()),getProgramResources:()=>({fonts:fontLibrary.list(),formPackages:plugins.filter(p=>p.enabled).map(p=>p.manifest),functions:functionPlugins.list().filter(p=>p.enabled).map(p=>p.manifest)}),onError:(error,context)=>errorReporter.report(error,context),getFonts:fontLibrary.resources,createWorker:()=>new Worker(new URL('./cad-worker.js',import.meta.url),{type:'module'}),displayQuality:quality.get().display,onBusy:setBusy,onProgress:value=>{progress.textContent='Berechnung abbrechen · '+Math.round(value*100)+' %';},reuseTranslations:true,prepareCommit:async (candidate,{preparedView,quality:preparedQuality}={})=>{const displayQuality=JSON.stringify(quality.get().display),prepared=preparedView&&JSON.stringify(preparedQuality)===displayQuality,display=prepared?preparedView:await controller.display(candidate);const scene=prepared?preparedView.scene:await controller.describe(candidate);view.validateDisplay(display,candidate);preparedDisplay={display,quality:displayQuality,scene};return {meshes:display.meshes,scene,revision:scene.revision};},onChange:(_next,_state,hints)=>{const scope=controller.projectScope();if(scope!==assemblyScope){if(!assemblyOpening)assemblyDisplay.restore(_next.workspace?.loadSet??null,_next);assemblyScope=scope;}else{const added=_next.nodes.filter(n=>!assemblyKnownIds.has(n.id)).map(n=>n.id);if(added.length&&assemblyDisplay.ids(_next)!==null)assemblyDisplay.load(added,_next);}assemblyDisplay.sync(_next);assemblyKnownIds=new Set(_next.nodes.map(n=>n.id));if(hints?.drawingsOnly&&nativeScene){nativeScene={...nativeScene,revision:controller.revision(),projectVersion:_next.version};lastDisplayed=controller.revision();preparedDisplay=null;if(sourceDisplayKey)sourceDisplayKey=sourceViewKey();}clearPreview();featureUI?.revisionChanged();aiUI?.chat.refreshFeatureReferences();jointsUI?.revisionChanged();drawingUI?.revisionChanged();projectParametersUI?.revisionChanged();meshHoleFillUI?.revisionChanged();meshRepairUI?.revisionChanged();meshReduceUI?.revisionChanged();meshRemeshUI?.revisionChanged();meshSmoothUI?.revisionChanged();meshSculptUI?.revisionChanged();meshEraseFillUI?.revisionChanged();meshMakeSolidUI?.revisionChanged();meshHollowUI?.revisionChanged();meshFeaturesUI?.revisionChanged();meshInspectorUI?.revisionChanged();meshSelectionUI?.revisionChanged();meshCopyUI?.revisionChanged();tools?.revisionChanged();inspectionUI?.revisionChanged();thicknessUI?.revisionChanged();meshTools?.revisionChanged();meshExtras?.revisionChanged();workplaneUI?.revisionChanged();sketchUI?.revisionChanged();modelingUI?.revisionChanged();advancedFreeCADUI?.revisionChanged();functionsUI?.revisionChanged();scheduleRefresh();}});

let refreshQueued=false,autosavedRevision=null;

const project=()=>controller.readSnapshot(),getSelection=()=>copy(selection),getScene=()=>nativeScene;

cleanRevision=controller.revision();

const isolation=createCadIsolation();

function context(target,p=project()){return cadSelectionContext(p,target);}

function selected({roots=false,cad=false,editable=false}={}){if(!selection.length)throw Error('Bitte ein Teil auswählen.');const p=project(),list=selection.map(value=>context(value,p));if(list.some(value=>!domainAllowsId(value.target.rootId,p)))throw Error('Die Auswahl gehört zu einem anderen Arbeitsbereich.');if(roots&&list.some(value=>value.target.path.length))throw Error('Für dieses Werkzeug fertige Teile auswählen.');if(cad&&list.some(value=>value.node.kind!=='cad'))throw Error('Dieses Werkzeug benötigt CAD-Körper.');if(editable&&list.some(value=>value.locked))throw Error('Ein ausgewähltes Teil oder sein Container ist gesperrt.');return list;}

function workFrame(p=project()){return new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion(...p.workplane.orientation)).setPosition(...p.workplane.origin).toArray();}

function activeFrame(p=project()){return p.coordinateMode==='plane'?workFrame(p):cadIdentity();}

function select(values,append=false){const p=project();values=values.filter(value=>domainAllowsId(value.rootId,p));isolation.include(p,values);updateIsolation();const valid=values.filter(value=>{try{context(value,p);return true;}catch{return false;}}),combined=append?[...selection,...valid]:valid,seen=new Set(),key=value=>JSON.stringify([value.rootId,value.path]),unique=combined.filter(value=>{const id=key(value);if(seen.has(id))return false;seen.add(id);return true;});selection=copy(unique.filter(value=>!value.path.some((_,index)=>seen.has(key({rootId:value.rootId,path:value.path.slice(0,index)})))));view.setSelection(selection,nativeScene);ui?.refresh();featureUI?.selectionChanged();jointsUI?.selectionChanged();projectParametersUI?.selectionChanged();meshHoleFillUI?.selectionChanged();meshRepairUI?.selectionChanged();meshReduceUI?.selectionChanged();meshRemeshUI?.selectionChanged();meshSmoothUI?.selectionChanged();meshSculptUI?.selectionChanged();meshEraseFillUI?.selectionChanged();meshMakeSolidUI?.selectionChanged();meshHollowUI?.selectionChanged();meshFeaturesUI?.selectionChanged();meshInspectorUI?.selectionChanged();meshSelectionUI?.selectionChanged();meshCopyUI?.selectionChanged();tools?.selectionChanged();inspectionUI?.selectionChanged();thicknessUI?.selectionChanged();meshTools?.selectionChanged();meshExtras?.selectionChanged();sketchUI?.selectionChanged();modelingUI?.selectionChanged();advancedFreeCADUI?.selectionChanged();updateState();void safe(showSource);if(alignment){if(selection.length<2||selection.some(v=>v.path.length))escape();else{alignment.ids=selection.map(v=>v.rootId);if(!alignment.ids.includes(alignment.referenceId))alignment.referenceId=null;void safe(refreshAlignment);}}}

async function refresh(){

  const ticket=++refreshTicket,revision=controller.revision(),p=project();const scene=nativeScene?.revision===revision?{...nativeScene,selection:copy(selection)}:preparedDisplay?.scene?.revision===revision?{...preparedDisplay.scene,selection:copy(selection)}:await controller.describe(p,selection);

  if(ticket!==refreshTicket||revision!==controller.revision())return;

  isolation.sync(p);updateIsolation();

  selection=selection.filter(value=>{try{context(value,p);return view.allows(value.rootId);}catch{return false;}});

  if(lastDisplayed!==revision){const display=preparedDisplay?.display.revision===revision&&preparedDisplay.quality===JSON.stringify(quality.get().display)?preparedDisplay.display:await controller.display(p);if(ticket!==refreshTicket||revision!==controller.revision())return;nativeScene=scene;view.setDisplay(display,p);lastDisplayed=revision;preparedDisplay=null;}else{nativeScene=scene;view.setSelection(selection,scene);}

  if(assemblyDisplay.ids(p)!==null||view.assemblyBoxesState().parts)view.setAssemblyBoxes(assemblyDisplay.boxes(p));updateAssemblyNotice();marksView?.setScene(nativeScene);ui?.refresh();updateState();await showSource();await refreshAlignment();await meshSelectionUI?.sync();await meshInspectorUI?.sync();

  // Model and view recovery share the idle writer below; no disk write in a drag commit.

}

function scheduleRefresh(){if(refreshQueued)return refreshTask;refreshQueued=true;refreshTask=refreshTask.catch(()=>{}).then(()=>{refreshQueued=false;return refresh();});void safe(()=>refreshTask);return refreshTask;}

async function mutate(fn,label='CAD bearbeiten',{revision=controller.revision()}={}){if(meshSculptUI?.state())throw Error('Modellierpinsel zuerst übernehmen oder abbrechen.');const draft=controller.snapshot();await fn(draft);const proposal=await controller.preview(undefined,{project:draft,revision,label});const result=controller.apply({previewId:proposal.previewId,revision:proposal.revision});await refreshTask;if(result.warnings?.length)toast(result.warnings.join(' '));return result;}

async function execute(operation,options={}){if(meshSculptUI?.state())throw Error('Modellierpinsel zuerst übernehmen oder abbrechen.');const result=await controller.execute(operation,options);await refreshTask;if(result.warnings?.length)toast(result.warnings.join(' '));return result;}

async function applyProposal(proposal){const result=controller.apply({previewId:proposal.previewId,revision:proposal.revision});await refreshTask;if(result.warnings?.length)toast(result.warnings.join(' '));return result;}

async function showPreview(proposal,ids,replaceIds=[]){activePreview=proposal;const p=controller.getPreview(proposal.previewId)?.project;if(!p)return;const display=await controller.display(p),scene=proposal.scene??await controller.describe(p);if(activePreview?.previewId===proposal.previewId){const failedIds=new Set(aiPreviewErrorMarks(proposal.verification).rootIds),meshes=display.meshes.map(mesh=>failedIds.has(mesh.rootId??mesh.id)?{...mesh,previewColor:AI_ERROR_COLOR}:mesh);view.setPreview(ids?meshes.filter(mesh=>ids.includes(mesh.rootId??mesh.id)):meshes,p,replaceIds);view.setAIResultMarks(proposal.verification);updateEmptyHint();marksView?.setPreview(scene);thicknessUI?.comparison.offerPreview({previewId:proposal.previewId,ids:ids??display.meshes.map(m=>m.rootId??m.id),replaceIds});}}

function updateEmptyHint(){const p=project();$('empty-hint').hidden=!!activePreview||(activeEasyKind()?p.nodes.some(node=>easyDomainAllows(node,activeEasyKind())&&cadPermanentlyVisible(node,p)):!!p.nodes.length);}
function clearPreview(){aiUI?.previewCleared();thicknessUI?.comparison.offerPreview(null);activePreview=null;view?.clearPreview();marksView?.clearPreview();updateEmptyHint();}

function sourceViewKey(){return JSON.stringify([controller.revision(),selection.map(targetKey),quality.get().display]);}
async function showSource(){
  if(!view.setSourceDisplay)return;
  const key=sourceViewKey();if(sourceDisplayKey===key)return;
  const ticket=++sourceTicket,targets=selection.filter(target=>target.path.length&&assemblyDisplay.isLoaded(target.rootId)),revision=controller.revision();
  if(!targets.length){sourceDisplayKey=null;view.clearSource();return;}
  const p=project(),nodes=[];
  for(const target of targets){const info=nativeScene?.objects.find(value=>targetKey(value.target)===targetKey(target));if(!info||info.kind!=='cad')continue;const node=copy(context(target,p).node);node.transform=info.worldMatrix;node.layerId=p.activeLayerId;node.folderId=p.activeFolderId;node.source='step';for(const field of ['children','operation','finish','partition','extraction','recipe','suppressed','multicolor'])delete node[field];node.hidden=false;nodes.push(node);}
  if(!nodes.length){sourceDisplayKey=key;view.clearSource();view.setSelection(selection,nativeScene);return;}
  const candidate={...p,nodes,workplane:{...p.workplane,reference:null}},display=await controller.display(candidate,undefined,{ids:candidate.nodes.map(n=>n.id)});
  if(ticket===sourceTicket&&controller.revision()===revision&&sourceViewKey()===key&&!view.isDragging()){view.setSourceDisplay(display.meshes,candidate,targets);sourceDisplayKey=key;view.setSelection(selection,nativeScene);}
}async function gesture({targets,delta,revision}){await mutate(draft=>{for(const target of targets){const value=context(target,draft);if(value.locked)throw Error('Das Teil ist gesperrt.');value.node.transform=multiplyCadMatrices(multiplyCadMatrices(inverseCadMatrix(value.parentWorld),delta),value.world);}},'CAD-Auswahl transformieren',{revision});}

async function resize({target,size,corner,revision}){await mutate(draft=>{const value=context(target,draft);if(value.locked)throw Error('Das Teil ist gesperrt.');const info=nativeScene.objects.find(item=>targetKey(item.target)===targetKey(target));Object.assign(value.node,resizeCadAtCorner(value.node.kind==='cad'?{...value.node,stats:{...value.node.stats,bounds:{min:info.localBounds.min,max:info.localBounds.max}}}:value.node,size,{corner}));},'CAD-Eckmaße ändern',{revision});}

function dimensions({target,corner,item}){const sizes=item.localBounds.size.map((v,k)=>v*Math.hypot(item.transform[k*4],item.transform[k*4+1],item.transform[k*4+2]));modal('Eckmaße','<p>Die gegenüberliegende Ecke und der lokale Boden bleiben stehen.</p><div class="input-row">'+sizes.map((value,k)=>'<label>'+['X','Y','Z'][k]+'<input id="corner-size-'+k+'" type="text" inputmode="decimal" value="'+formatUiNumber(value,preferences.language)+'"></label>').join('')+'</div><div class="modal-actions"><button id="corner-apply" class="primary">Übernehmen</button></div>');const revision=controller.revision();$('corner-apply').onclick=()=>safe(async()=>{const size=sizes.map((original,k)=>preserveUiNumber(Number($('corner-size-'+k).value.trim().replace(',','.')),original));if(size.some((value,k)=>value!==sizes[k]))await resize({target,corner,size,revision});$('modal').close();});for(let k=0;k<3;k++)$('corner-size-'+k).onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();$('corner-apply').click();}};}

const view=createCadRenderer({host:$('canvas-host'),viewport:$('viewport'),getProject:project,getScene,getSelection,select,canEdit:()=>!jointsUI?.state()&&!busy&&nativeScene?.revision===controller.revision()&&(!selection.some(t=>t.path.length)||sourceDisplayKey===sourceViewKey()),onGesture:gesture,onResize:resize,onDimensions:dimensions,onError:error=>safe(()=>{throw error;}),getPreferences:()=>preferences,onViewUpdate:()=>{alignmentMarks?.draw();tools?.draw?.();marksView?.draw();}});

const isolationNotice=document.createElement('div');isolationNotice.id='cad-isolation-notice';isolationNotice.setAttribute('role','status');isolationNotice.hidden=true;

const isolationText=document.createElement('span'),isolationEnd=document.createElement('button');isolationText.textContent='Auswahl isoliert';isolationEnd.textContent='Isolation beenden';isolationEnd.onclick=()=>endIsolation();isolationNotice.append(isolationText,isolationEnd);$('viewport').append(isolationNotice);

const isolationButton=document.createElement('button');isolationButton.dataset.action='isolate';isolationButton.textContent='Auswahl isolieren';document.querySelector('[data-action="hide"]').after(isolationButton);

function updateIsolation(){const kind=activeEasyKind();view.setIsolation(kind?project().nodes.filter(node=>easyDomainAllows(node,kind)&&isolation.allows(node.id)).map(node=>node.id):isolation.state());marksView?.visibilityChanged();isolationNotice.hidden=!isolation.state();}

function endIsolation(){escape();isolation.end();updateIsolation();}

function isolateSelection(){readyForFile();const targets=getSelection();escape();isolation.start(project(),targets);updateIsolation();view.setSelection(selection,nativeScene);ui?.refresh();}

function queryVisibleRay(ray){const ids=visibleCadIds();return ids.length?controller.query('rayPick',{ray,ids}):Promise.resolve(null);}

function visibleCadIds(){return project().nodes.filter(n=>isolation.visible(n,project())&&view.allows(n.id)&&n.kind==='cad').map(n=>n.id);}

function updateSaveState(signature=workspaceSignature()){$('save-state').textContent=controller.revision()===savedRevision&&signature===savedWorkspaceSignature?t('Gespeichert · lokal'):t('Lokal · ohne Cloud');$('save-state').title=activeProjectFile?.path??'';}

function updateState(){const attachmentNode=selection.length===1&&!selection[0].path.length?project().nodes.find(n=>n.id===selection[0].rootId):null;for(const b of document.querySelectorAll('[data-action=sketch-on-part]'))b.disabled=busy||!attachmentNode||!['cad','mesh'].includes(attachmentNode.kind)||flags(attachmentNode,project()).hidden||flags(attachmentNode,project()).locked||!view.allows(attachmentNode.id)||(attachmentNode.kind==='cad'?!attachmentNode.solid:attachmentNode.meshRole==='hole');const centerButton=document.querySelector('[data-action="center"]');if(centerButton)centerButton.disabled=busy||!selection.length||selection.some(target=>{const c=context(target);return c.locked||c.hidden||!domainAllowsId(target.rootId);});easyRepair?.schedule();const repairButton=document.querySelector('[data-action="mesh-repair"]'),repairSource=selection.length===1&&!selection[0].path.length?project().nodes.find(n=>n.id===selection[0].rootId):null;if(repairButton)repairButton.disabled=busy||!repairSource||repairSource.kind!=='mesh'||flags(repairSource,project()).hidden||flags(repairSource,project()).locked||!view.allows(repairSource.id);const holeButton=document.querySelector('[data-action="mesh-close-hole"]');if(holeButton)holeButton.disabled=repairButton?.disabled??true;const p=project(),state=controller.state(),inspectionButton=document.querySelector('[data-action="mesh-inspector"]'),inspectionNode=selection.length===1&&!selection[0].path.length?p.nodes.find(n=>n.id===selection[0].rootId):null;if(inspectionButton)inspectionButton.disabled=busy||!inspectionNode||inspectionNode.kind!=='mesh'||flags(inspectionNode,p).hidden||!view.allows(inspectionNode.id);const surfaceButton=document.querySelector('[data-action="mesh-select"]'),surfaceSource=selection.length===1&&!selection[0].path.length?p.nodes.find(n=>n.id===selection[0].rootId):null;if(surfaceButton){const allowed=!!surfaceSource&&surfaceSource.kind==='mesh'&&!flags(surfaceSource,p).hidden&&!flags(surfaceSource,p).locked&&view.allows(surfaceSource.id);surfaceButton.disabled=busy||!allowed;surfaceButton.title=allowed?'Dreiecke, Oberflächen und Öffnungsränder auswählen':'Ein sichtbares, entsperrtes vollständiges Netzteil auswählen';}const reduceButton=document.querySelector('[data-action="mesh-reduce"]');if(reduceButton)reduceButton.disabled=busy||!surfaceSource||surfaceSource.kind!=='mesh'||flags(surfaceSource,p).hidden||flags(surfaceSource,p).locked||!view.allows(surfaceSource.id);const curvedButton=document.querySelector('[data-action="mesh-curved-reduce"]');if(curvedButton)curvedButton.disabled=reduceButton?.disabled??true;const remeshButton=document.querySelector('[data-action="mesh-remesh"]');if(remeshButton)remeshButton.disabled=reduceButton?.disabled??true;const smoothButton=document.querySelector('[data-action="mesh-smooth"]');if(smoothButton)smoothButton.disabled=reduceButton?.disabled??true;const sculptButton=document.querySelector('[data-action="mesh-sculpt"]');if(sculptButton)sculptButton.disabled=reduceButton?.disabled??true;const eraseFillButton=document.querySelector('[data-action="mesh-erase-fill"]');if(eraseFillButton)eraseFillButton.disabled=reduceButton?.disabled??true;const makeSolidButton=document.querySelector('[data-action="mesh-make-solid"]');if(makeSolidButton)makeSolidButton.disabled=reduceButton?.disabled??true;const hollowButton=document.querySelector('[data-action="mesh-hollow"]');if(hollowButton)hollowButton.disabled=reduceButton?.disabled??true;const featuresButton=document.querySelector('[data-action="mesh-features"]');if(featuresButton)featuresButton.disabled=(reduceButton?.disabled??true)||surfaceSource?.meshRole==='hole';const meshCadButton=document.querySelector('[data-action="mesh-to-cad"]');if(meshCadButton){const n=selection.length===1&&!selection[0].path.length?p.nodes.find(n=>n.id===selection[0].rootId):null;meshCadButton.disabled=busy||!hasLocalStlConverter()||!n||n.kind!=='mesh'||n.meshRole==='hole'||flags(n,p).hidden||flags(n,p).locked;}const copyButton=document.querySelector('[data-action="cad-to-mesh"]'),copySource=selection.length===1&&!selection[0].path.length?p.nodes.find(n=>n.id===selection[0].rootId):null;if(copyButton)copyButton.disabled=busy||!copySource||copySource.kind!=='cad'||!copySource.solid||!!copySource.suppressed||flags(copySource,p).hidden||flags(copySource,p).locked;updateEmptyHint();workbenchUI?.refreshDomain();contextMenuUI?.refresh();const sourceEdit=$('easy-edit-source'),sourceNode=selection.length===1&&!selection[0].path.length?p.nodes.find(node=>node.id===selection[0].rootId):null;if(sourceEdit){sourceEdit.hidden=!sourceNode||sourceNode.kind!=='mesh'||!sourceNode.meshSource;sourceEdit.disabled=busy||!!sourceNode&&flags(sourceNode,p).locked;}$('workspace-label').textContent=t('Arbeitsfläche')+' '+p.bed.join(' × ')+' mm';updateSaveState();document.querySelector('[data-action="undo"]').disabled=busy||!state.undo;document.querySelector('[data-action="redo"]').disabled=busy||!state.redo;document.querySelector('[data-action="paste"]').disabled=!clipboard.length||busy||!!activeEasyKind()&&clipboard.some(node=>!easyDomainAllows(node,activeEasyKind()));$('magnet-mode').disabled=busy||selection.length!==1||selection[0]?.path.length||!p.nodes.some(node=>node.id===selection[0]?.rootId&&['cad','mesh'].includes(node.kind));const chosen=selection.length===1&&!selection[0].path.length?nativeScene?.objects.find(n=>n.id===selection[0].rootId&&!n.target.path.length):null;for(const action of ['reference-place','drill','split','extract'])document.querySelectorAll('[data-action="'+action+'"]').forEach(button=>{button.disabled=busy||!chosen||(chosen.kind!=='cad'&&chosen.kind!=='mesh')||chosen.hidden||chosen.locked||action==='drill'&&(chosen.kind==='cad'?!chosen.solid:chosen.meshRole==='hole');});const modelingNodes=selection.filter(v=>!v.path.length).map(v=>p.nodes.find(n=>n.id===v.rootId)),modelingValid=selection.length===modelingNodes.length&&modelingNodes.length>0&&modelingNodes.every(n=>n&&n.kind==='cad'&&n.solid&&!flags(n,p).hidden&&!flags(n,p).locked&&view.allows(n.id));for(const action of ['cad-contour','cad-face-offset','cad-shell','cad-loft','cad-sweep'])for(const b of document.querySelectorAll('[data-action="'+action+'"]'))b.disabled=busy||!modelingValid||(action==='cad-loft'?(modelingNodes.length<2||modelingNodes.length>8):modelingNodes.length!==1)||['cad-loft','cad-sweep'].includes(action)&&modelingNodes.some(n=>n.source!=='native'||n.recipe?.type!=='sketch');for(const action of ['cad-draft','cad-defeature','cad-revolution','cad-helix'])for(const b of document.querySelectorAll('[data-action="'+action+'"]'))b.disabled=busy||action!=='cad-helix'&&(!modelingValid||modelingNodes.length!==1);for(const b of document.querySelectorAll('[data-action=cad-edit-modeling]'))b.disabled=busy||!modelingValid||modelingNodes.length!==1||modelingNodes[0].source!=='modeling'||!['face-offset','shell','sweep','loft'].includes(modelingNodes[0].modeling?.kind);let contourSource=null;try{if(selection.length===1)contourSource=context(selection[0],p);}catch{}for(const b of document.querySelectorAll('[data-action=cad-contour]'))b.disabled=busy||!contourSource||contourSource.node.kind!=='cad'||!contourSource.node.solid||contourSource.locked||contourSource.hidden||contourSource.chain.some(node=>node.suppressed)||!view.allows(contourSource.root.id);for(const b of document.querySelectorAll('[data-action=linked-contours]'))b.disabled=busy;}

const themeBinding=createThemeBinding({document,media:matchMedia('(prefers-color-scheme: dark)'),setViewTheme:dark=>view.setTheme(dark)});
window.addEventListener('unload',()=>themeBinding.dispose(),{once:true});
function setPreferences(value,{persist=true}={}){const next=validatePreferences(value),languageChanged=preferences.language!==next.language;if(persist)storage.setItem('offlinecad-settings-v1',JSON.stringify(next));preferences=next;themeBinding.set(next.theme);$('snap').value=String(next.snap);view.setSelection(selection,nativeScene);ui?.refresh();localization.refresh();marksView?.visibilityChanged();if(languageChanged&&workbenchUI?.mode()==='solid')workbenchUI.sync();}

async function setQuality(value){thicknessUI?.close();const previous=quality.get().display,next=quality.set(value);if(previous.deflection!==next.display.deflection||previous.angleDegrees!==next.display.angleDegrees){controller.setDisplayQuality(next.display);lastDisplayed=null;await scheduleRefresh();}return next;}

alignmentMarks=createCadAlignMarkers({viewport:$('viewport'),projectPoint:view.projectPoint,getPreferences:()=>preferences,onAlign:(axis,mode)=>safe(()=>applyAlignment(axis,mode)),onPreview:(axis,mode)=>{if(alignment?.data?.revision===controller.revision())view.setAlignmentPreview(alignmentPlan(axis,mode));},onClearPreview:()=>view.clearAlignmentPreview()});

function setPlugins(value){storage.setItem('offlinecad-plugins-v1',JSON.stringify(value));plugins=copy(value);ui?.renderLibrary();}

const access=createCadAutomationAccess({controller,getAssemblyDisplay:()=>({...assemblyDisplay.state(project()),...packFiles.state(project())}),setAssemblyDisplay:request=>changeAssemblyDisplay(request.action,request.ids),getFonts:fontLibrary.list,getSelection,getScene,refresh:scheduleRefresh,screenshot:()=>view.captureDataURL(),isBusy:()=>!!featureUI?.state()||!!jointsUI?.state()||!!projectParametersUI?.state()||!!drawingUI?.state()||!!thicknessUI?.state()||busy||!!meshHoleFillUI?.state()||!!meshRepairUI?.state()||!!(meshReduceUI?.state()||meshRemeshUI?.state()||(meshSmoothUI?.state()||meshSculptUI?.state())||meshEraseFillUI?.state()||meshMakeSolidUI?.state()||(meshHollowUI?.state()||meshFeaturesUI?.state()))||!!meshSelectionUI?.state()||!!activePreview||!!magnetSession?.dragging||!!modelingUI?.state()||!!advancedFreeCADUI?.state()||!!sketchUI?.state()||!!tools?.state()||!!meshTools?.state()||!!meshExtras?.state()||!!workplaneUI?.state()});

window.offlinecadAutomation=access;

marksView=createCadAnnotationsView({view,group:view.groups.annotations,t});

const programAssistant=createCadProgramAssistant({access,showPreview:async proposal=>{await showPreview(proposal,undefined,controller.readSnapshot().nodes.map(n=>n.id));if(activePreview?.previewId===proposal.previewId)view.fit([],{includePreview:true});},clearPreview,cancelComputation:()=>controller.cancel(),getMode:()=>workbenchUI?.mode()??'normal',getBusy:()=>!contextMenuIdle(),language:()=>preferences.language});
featureUI=createCadAIFeatureUI({controller,view,getSelection,select,prepare:()=>{if(aiUI?.isBusy())throw Error('Laufenden KI-Auftrag zuerst abschließen oder abbrechen.');escape();},toast,onAttach:reference=>aiUI?.chat.addFeatureReference(reference),onHighlight:id=>aiUI?.chat.highlightFeatureReference(id)});
aiUI=createCadAIUI({featureStore:{open:()=>featureUI.open(),highlight:reference=>featureUI.highlight(reference),project:()=>controller.readSnapshot(),state:()=>featureUI.state(),clearHighlight:()=>featureUI.clearHighlight(),scope:references=>captureCadAIFeatureScope(controller.readSnapshot(),references.map(r=>r.id),references)},photoStore:{read:()=>({revision:controller.revision(),photos:controller.snapshot().photos}),save:async(photos,{revision})=>{readyForFile();const proposal=await controller.previewPhotos(photos,{revision});return controller.apply(proposal);},reconstruct:async(plan,options)=>{readyForFile();const proposal=await controller.previewPhotoReconstruction(plan,{...options,review:reviewPhotoSet});await showPreview(proposal,[proposal.photoReconstructionReport.rootId]);view.fit([],{includePreview:true});return proposal;},reviewReconstruction:(plan,options)=>reviewStoredPhotoSet(controller,plan,options),setView:key=>view.setView(key),download,applyReconstruction:async proposal=>{const result=controller.apply(proposal);clearPreview();await scheduleRefresh();return result;},discardReconstruction:id=>{controller.discard(id);if(activePreview?.previewId===id)clearPreview();}},openTaskBasis:async(basis,binding)=>{readyForFile();if(!await confirmProjectChange())return false;fileBusy=true;try{const checked=await packFiles.registerTaskBasis(basis,binding);await openEncoded(checked.project,null,{allowCatalog:true});select(checked.selection);await scheduleRefresh();return true;}finally{fileBusy=false;}},captureCanvas:async()=>{await view.renderReady();return new Promise((resolve,reject)=>view.canvas.toBlob(blob=>blob?resolve(new File([blob],'Modellbild.png',{type:'image/png'})):reject(Error('Modellbild konnte nicht erstellt werden.')),'image/png'));},access,programAssistant,modal,download,language:()=>preferences.language,showPreview:async proposal=>{await showPreview(proposal,undefined,controller.readSnapshot().nodes.map(n=>n.id));if(activePreview?.previewId===proposal.previewId)view.fit([],{includePreview:true});},clearPreview,cancelComputation:()=>controller.cancel(),settingsOpen:()=>{ui.settings.open();document.querySelector('[data-settings-tab="ai"]')?.click();}});

const featureReferencesButton=document.createElement('button');featureReferencesButton.type='button';featureReferencesButton.id='ai-feature-open';featureReferencesButton.textContent='KI-Merkmalsbezüge';featureReferencesButton.onclick=()=>safe(()=>featureUI.open());document.querySelector('.file-actions').append(featureReferencesButton);
const projectPhotosButton=document.createElement('button');projectPhotosButton.type='button';projectPhotosButton.id='photo-project-open';projectPhotosButton.textContent='Projektfotos';projectPhotosButton.onclick=()=>safe(()=>aiUI.openProjectPhotos());document.querySelector('.file-actions').append(projectPhotosButton);
let freecadDocumentReader;
const freecadDocumentButton=document.createElement('button');freecadDocumentButton.type='button';freecadDocumentButton.id='freecad-document-open';freecadDocumentButton.textContent='FreeCAD-Merkmale';freecadDocumentButton.onclick=()=>safe(()=>{readyForFile();if(aiUI.isBusy())throw Error('Laufenden Auftrag zuerst abschließen.');escape();freecadDocumentReader?.dispose();modal('FreeCAD-Merkmalsbaum','<div id=freecad-document-host></div><div class=modal-actions><button id=freecad-document-close>Schließen</button></div>',{modeless:true});$('modal').classList.add('freecad-document-modal');$('modal').scrollTop=0;freecadDocumentReader=mountFreeCADDocumentReader({host:$('freecad-document-host'),access,preview:(request,options)=>controller.previewFreeCADDocument(request,options),rerun:(request,options)=>controller.previewFreeCADRerun(request,options),apply:async proposal=>{const result=controller.apply(proposal);clearPreview();await scheduleRefresh();return result;},discard:id=>controller.discard(id),showPreview:async proposal=>{const ids=[...new Set([...proposal.selectedTargets.map(t=>t.rootId),...(proposal.report.freecadDependencies?.sources??[]).map(s=>s.target.rootId),...(proposal.report.freecadFollowups??[]).map(r=>r.target.rootId)])];await showPreview(proposal,ids);view.fit([],{includePreview:true});},clearPreview});$('freecad-document-close').onclick=()=>$('modal').close();$('freecad-document-host').querySelector('button').click();});document.querySelector('.file-actions').append(freecadDocumentButton);

tools=createCadToolsUI({controller,view,marksView,getSelection,getScene,select,execute,mutate,modal,safe,toast,download,getQuality:()=>quality.get().display,storage,refresh:scheduleRefresh,t});

meshTools=createCadMeshTools({controller,view,getSelection,getScene,select,modal,safe,toast,prepare:escape,showPreview,clearPreview,applyProposal,mutate,project,onMore:()=>meshExtras.open('measure'),getFonts:Object.assign(()=>fontLibrary.list(),{resources:fontLibrary.resources}),onSketchSource:(rootId,path)=>sketchUI.open(true,true,{rootId,path})});

meshHoleFillUI=createCadMeshHoleFillUI({controller,view,getSelection,select,prepare:escape,showPreview,clearPreview:id=>{if(!id||activePreview?.previewId===id)clearPreview();},applyProposal,toast});
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

jointsUI=createCadJointsUI({controller,view,getSelection,modal,prepare:escape,toast});
sketchUI=createCadSketchUI({controller,view,getSelection,select,prepare:escape,modal,rebindContour:(link,edits)=>modelingUI.openRebind(link,{edits}),pickFace:async(node,ray,event,visualHit,signal)=>{if(visualHit?.object?.userData.rootId!==node.id)return null;return node.kind==='mesh'?meshSurfaceHit(node,ray):controller.query('rayPick',{ray,ids:[node.id]},{signal});},t,toast});

modelingUI=createCadModelingUI({controller,view,getSelection,select,prepare:escape,openSketch:config=>sketchUI.openImported(config),refresh:scheduleRefresh,toast,t});
advancedFreeCADUI=createAdvancedFreeCADUI({controller,view,getSelection,select,prepare:escape,refresh:scheduleRefresh,toast});
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

const meshButton=document.createElement('button');meshButton.dataset.action='mesh-tools';meshButton.textContent='Netz-Werkzeuge …';document.querySelector('[data-action="group"]').after(meshButton);const meshMore=document.createElement('button');meshMore.dataset.action='mesh-more';meshMore.textContent='Weitere Netz-Werkzeuge …';meshButton.after(meshMore);const surfaceButton=document.createElement('button');surfaceButton.dataset.action='mesh-select';surfaceButton.textContent='Netzflächen auswählen …';meshButton.after(surfaceButton);const inspectorButton=document.createElement('button');inspectorButton.dataset.action='mesh-inspector';inspectorButton.textContent='Netzinspektor …';surfaceButton.after(inspectorButton);const repairButton=document.createElement('button');repairButton.dataset.action='mesh-repair';repairButton.textContent='Netz reparieren …';inspectorButton.after(repairButton);const holeButton=document.createElement('button');holeButton.dataset.action='mesh-close-hole';holeButton.textContent='Öffnung schließen …';repairButton.after(holeButton);const connectorButton=document.createElement('button');connectorButton.dataset.action='mesh-connectors';connectorButton.textContent='Passstifte und Aufnahmen …';holeButton.after(connectorButton);const reduceButton=document.createElement('button');reduceButton.dataset.action='mesh-reduce';reduceButton.textContent='Netz vereinfachen …';connectorButton.after(reduceButton);const curvedButton=document.createElement('button');curvedButton.dataset.action='mesh-curved-reduce';curvedButton.textContent='Gekrümmtes Netz vereinfachen …';reduceButton.after(curvedButton);const remeshButton=document.createElement('button');remeshButton.dataset.action='mesh-remesh';remeshButton.textContent='Netz neu vernetzen …';reduceButton.after(remeshButton);const smoothButton=document.createElement('button');smoothButton.dataset.action='mesh-smooth';smoothButton.textContent='Ausgewählte Netzflächen glätten …';remeshButton.after(smoothButton);const eraseFillButton=document.createElement('button');eraseFillButton.dataset.action='mesh-erase-fill';eraseFillButton.textContent='Netzbereiche ersetzen …';smoothButton.after(eraseFillButton);const sculptButton=document.createElement('button');sculptButton.dataset.action='mesh-sculpt';sculptButton.textContent='Modellierpinsel und Symmetrie …';smoothButton.after(sculptButton);const makeSolidButton=document.createElement('button');makeSolidButton.dataset.action='mesh-make-solid';makeSolidButton.textContent='Geschlossene Annäherung …';eraseFillButton.after(makeSolidButton);const hollowButton=document.createElement('button');hollowButton.dataset.action='mesh-hollow';hollowButton.textContent='Netzkörper aushöhlen …';makeSolidButton.after(hollowButton);
const featuresButton=document.createElement('button');featuresButton.dataset.action='mesh-features';featuresButton.textContent='Formerkennung und Gegenstück …';hollowButton.after(featuresButton);

const meshCopyButton=document.createElement('button');meshCopyButton.dataset.action='cad-to-mesh';meshCopyButton.textContent='CAD → Netzkopie …';meshButton.after(meshCopyButton);const meshCadButton=document.createElement('button');meshCadButton.dataset.action='mesh-to-cad';meshCadButton.textContent='Netz → CAD …';meshCopyButton.after(meshCadButton);

document.querySelector('[data-action="lay-on-face"]').hidden=false;document.querySelector('[data-action="lay-on-face"]').disabled=false;

layoutUI=createLayoutUI({storage,safe,toast,t,isBusy:()=>busy,prepare:()=>escape()});

window.formnaroOpenChatSidebar=()=>workbenchUI?.mode()==='solid'?Promise.resolve():layoutUI.openPanel(layoutUI.state().librarySide==='right'?'library':'inspector');

layoutUI.syncPanels();

ui=createCadInterface({controller,storage,fontLibrary,getPreferences:()=>preferences,setPreferences,getPlugins:()=>plugins,setPlugins,functionPlugins,getSelection,select,getScene,execute,mutate,modal,safe,toast,download,fit:()=>view.fit(),onAddShape:type=>addShape(type),onSketchTemplate:id=>sketchUI.openTemplate(id,activeEasyKind()==='mesh'||meshSelection()),onMeshSource:async(rootId,path)=>{select([{rootId,path:[]}]);await meshTools.openSource(rootId,path);},onAddPlugin:(manifest,shapeId)=>addPlugin(manifest,shapeId),mountAI:root=>aiUI.mountSettings(root),mountLayout:root=>layoutUI.mountSettings(root),mountFusion:root=>workbenchUI?.fusion.mountSettings(root),mountSolid:root=>workbenchUI?.solid.mountSettings(root),mountContext:root=>contextMenuUI?.mountSettings(root),getQuality:()=>quality.get(),setQuality,workflowSettings,getLayout:()=>layoutUI.state(),setLayout:value=>layoutUI.restore(value)});

const importConverted=async(file,result,{current=()=>true}={})=>importFile(file,{converted:result,current});

importConverted.cancel=()=>controller.cancel();

const converterImport=createCadConverterImport({controller,getFrame:workFrame,showPreview,isolate:targets=>{isolation.start(project(),targets);updateIsolation();},clearPreview:id=>{if(activePreview?.previewId===id)clearPreview();},applyProposal,select});

functionsUI=createCadFunctionsUI({workflowSettings,mountAISettings:root=>aiUI.mountSettings(root),plugins:functionPlugins,modal,safe,toast,download,ready:readyForFile,getQuality:()=>quality.get(),getLanguage:()=>preferences.language,setBusy,importConverted,converterImport,fitPreview:()=>view.fit(undefined,{includePreview:true}),runAction:action=>{if(action==='function-settings'){ui.settings.open();document.querySelector('[data-settings-tab="plugins"]')?.click();return;}return actions[action]?.();}});

async function addShape(type,event){
 const definition=CAD_SHAPES.find(shape=>shape.type===type);if(!definition)throw Error('Unbekannte Form.');if(insertionBusy)throw Error('Die vorherige Form wird noch eingesetzt.');insertionBusy++;
 try{const p=project(),before=new Set(p.nodes.map(node=>node.id)),revision=controller.revision(),mesh=requireCreationKind(p)==='mesh';let operation;
 if(mesh&&type==='text')operation={type:'mesh-create-source',id:crypto.randomUUID(),shape:'text',name:definition.name,text:'TEXT',font:'regular',height:4,paths:await meshTextPaths('TEXT','regular',fontLibrary.resources()),frame:workFrame(p)};
 else operation=mesh?{type:'mesh-create',id:crypto.randomUUID(),shape:type,name:definition.name,color:definition.color,size:[...definition.defaultSize],position:[0,0,definition.defaultSize[2]/2],segments:64,frame:workFrame(p)}:{kind:'batch',commands:[{op:'create',type,space:'plane',as:'new'}]};
 const proposal=await controller.preview(operation,{revision,label:mesh?'Netzform hinzufügen':'CAD-Form hinzufügen'});return await finishInsertion(proposal,before,event);
 }finally{insertionBusy--;}
}

async function addPlugin(manifest,shapeId,event){if(insertionBusy)throw Error('Die vorherige Form wird noch eingesetzt.');insertionBusy++;try{const p=project(),before=new Set(p.nodes.map(node=>node.id)),mesh=requireCreationKind(p)==='mesh',operation=mesh?{type:'mesh-create-source',shape:'plugin',manifest,shapeId,id:crypto.randomUUID(),frame:workFrame(p)}:{kind:'plugin',manifest,shapeId,options:{transform:workFrame(p),layerId:p.activeLayerId,folderId:p.activeFolderId}},proposal=await controller.preview(operation,{label:mesh?'Plugin-Netzform hinzufügen':'Plugin-CAD-Form hinzufügen'});return await finishInsertion(proposal,before,event);}finally{insertionBusy--;}}

async function finishInsertion(proposal,before,event){

  let candidate=proposal;const newNode=candidate.project.nodes.find(node=>!before.has(node.id));if(!newNode)throw Error('Neue CAD-Form fehlt.');

  if(event){const ray=view.cadRay(event),mesh=newNode.kind==='mesh',hint=mesh?view.visualHit(event):null,target=hint?project().nodes.find(node=>node.id===hint.object.userData.rootId&&node.kind==='mesh'&&node.meshRole!=='hole'):null,meshHit=target?meshSurfaceHit(target,ray):null,hit=mesh?null:await queryVisibleRay(ray);

    if(meshHit){const p=copy(candidate.project),node=p.nodes.find(node=>node.id===newNode.id);node.transform=meshMagnetTransform(node,meshHit);candidate=await controller.preview(undefined,{project:p,revision:proposal.revision,label:'Netzform auf Fläche einsetzen'});}
    else if(hit){candidate=await controller.preview({kind:'tool',name:'previewPlace',options:{id:newNode.id,ray,targetIds:visibleCadIds()}},{project:candidate.project,revision:proposal.revision,label:'CAD-Form auf Fläche einsetzen'});}

    else{const p=copy(candidate.project),wp=workFrame(p),normal=new THREE.Vector3(0,0,1).transformDirection(new THREE.Matrix4().fromArray(wp)),plane=new THREE.Plane().setFromNormalAndCoplanarPoint(normal,new THREE.Vector3(...p.workplane.origin)),point=new THREE.Ray(new THREE.Vector3(...ray.origin),new THREE.Vector3(...ray.direction)).intersectPlane(plane,new THREE.Vector3());if(!point)throw Error('Die Arbeitsebene wird nicht getroffen.');const node=p.nodes.find(node=>node.id===newNode.id),b=node.stats?.bounds??commonBounds({...node,transform:cadIdentity()}),anchor=cadPoint(node.transform,[(b.min[0]+b.max[0])/2,(b.min[1]+b.max[1])/2,b.min[2]]);node.transform=multiplyCadMatrices(translate(point.toArray().map((v,k)=>v-anchor[k])),node.transform);candidate=await controller.preview(undefined,{project:p,revision:proposal.revision,label:'CAD-Form auf Ebene einsetzen'});}

    await showPreview(candidate);

  }

  await applyProposal(candidate);select([{rootId:newNode.id,path:[]}]);return newNode.id;

}

const meshSelection=()=>selection.length>0&&selection.every(target=>!target.path.length&&project().nodes.some(node=>node.id===target.rootId&&node.kind==='mesh'));

async function group(operation='union'){if(meshSelection()){await easyRepair?.flush();await refreshTask;return meshTools.open(operation==='intersection'?'intersection':'union');}const ids=selected({roots:true,cad:true,editable:true}).map(value=>value.node.id),id=crypto.randomUUID();await execute({kind:'tool',name:'previewGroup',options:{ids,id,operation,frame:activeFrame()}},{label:operation==='union'?'CAD gruppieren':'CAD-Schnittmenge'});select([{rootId:id,path:[]}]);}

async function ungroup(){if(meshSelection())return meshTools.open('dissolve');const list=selected({roots:true,cad:true,editable:true});if(list.length!==1)throw Error('Eine CAD-Gruppe auswählen.');const children=list[0].node.children?.map(node=>({rootId:node.id,path:[]}))??[];await execute({kind:'tool',name:'previewDissolve',options:{id:list[0].node.id}});select(children);}

async function duplicate(){const list=selected({editable:true}),commands=list.map((value,index)=>({op:'duplicate',target:value.target,translate:[10,10,0],space:'world',as:'copy'+index})),result=await execute({kind:'batch',commands},{label:'CAD duplizieren'});select(Object.values(result.aliases).map(value=>typeof value==='string'?{rootId:value,path:[]}:value));}

async function remove(){const list=selected({editable:true});await execute({kind:'batch',commands:list.map(value=>({op:'delete',target:value.target}))},{label:'CAD-Auswahl entfernen'});select([]);}

function freshCopy(source){return cloneCadSources(source);}



let clipboardData,clipboardTask=Promise.resolve();
function copySelection(){const list=selected(),targets=list.map(value=>value.target),source=project(),revision=controller.revision(),scope=controller.projectScope(),capture=input=>{if(controller.revision()!==revision||controller.projectScope()!==scope)throw Error('Modell während des Kopierens geändert. Auswahl erneut kopieren.');clipboardData=captureCadLinkedClipboard(input,targets,{scope:controller.projectScope()});if(input.version>=17){clipboardData.nodes=stripGeometryIdentity(clipboardData.nodes);clipboardData.closure.nodes=stripGeometryIdentity(clipboardData.closure.nodes);}clipboard=clipboardData.nodes;updateState();toast('Auswahl kopiert.');};if(source.version>=17)return clipboardTask=controller.materialize(cadContourSourceClosure(source,targets).rootIds).then(capture);capture(source);clipboardTask=Promise.resolve();}

async function paste(){await clipboardTask;if(!clipboardData?.nodes.length)return;const sameProject=clipboardData.scope===controller.projectScope(),nodes=sameProject?clipboardData.nodes:clipboardData.closure.nodes;if(activeEasyKind()&&nodes.some(node=>!easyDomainAllows(node,activeEasyKind())))throw Error('Zum Einfügen in den passenden CAD- oder Netz-Bereich wechseln.');let result;await mutate(draft=>{result=insertCadLinkedClipboard(draft,clipboardData,{scope:controller.projectScope()});},'CAD-Auswahl einfügen');select(result.targets);if(result.addedSources)toast(result.addedSources+' benötigte Ausgangsquelle'+(result.addedSources===1?'':'n')+' zusätzlich eingefügt.');}

async function mirror(axis){selected({editable:true});const bounds=await controller.query('bounds',{targets:selection,frame:activeFrame()}),frame=activeFrame(),scale=[1,1,1];scale[axis]=-1;const reflection=new THREE.Matrix4().makeTranslation(...bounds.center).multiply(new THREE.Matrix4().makeScale(...scale)).multiply(new THREE.Matrix4().makeTranslation(...bounds.center.map(v=>-v))).toArray(),delta=multiplyCadMatrices(multiplyCadMatrices(frame,reflection),inverseCadMatrix(frame));await gesture({targets:selection,delta,revision:controller.revision()});}

function mirrorPanel(){$('mirror-panel').hidden=!$('mirror-panel').hidden;}

function alignmentPlan(axis,mode){return alignment?.data?.plans[axis][mode]??[];}

async function applyAlignment(axis,mode){

  await alignmentTask;

  if(!alignment?.data)return;

  const {revision}=alignment.data,moves=alignmentPlan(axis,mode);view.clearAlignmentPreview();

  if(moves.length)await mutate(draft=>{for(const {id,delta}of moves){const node=draft.nodes.find(node=>node.id===id);node.transform=multiplyCadMatrices(translate(delta),node.transform);}},'CAD ausrichten',{revision});

}

function refreshAlignment(){

  const current=alignment,ticket=++alignmentTicket;

  if(!current){alignmentMarks?.hide();return Promise.resolve();}

  current.ids=current.ids.filter(id=>project().nodes.some(node=>node.id===id));if(current.ids.length<2){escape();return Promise.resolve();}

  if(!current.ids.includes(current.referenceId))current.referenceId=null;

  alignmentMarks.hide();current.data=null;

  const frame=activeFrame(),revision=controller.revision();

  alignmentTask=(async()=>{

    const all=await controller.query('bounds',{targets:current.ids.map(rootId=>({rootId,path:[]})),frame});

    if(alignment!==current||ticket!==alignmentTicket||revision!==controller.revision())return;

    const bounds=current.referenceId?all.byId.find(v=>v.id===current.referenceId):all;

    if(!bounds)return;

    const plans=[0,1,2].map(axis=>Object.fromEntries(['min','center','max'].map(mode=>[mode,all.byId.filter(own=>own.id!==current.referenceId&&!context({rootId:own.id,path:[]}).locked).flatMap(own=>{

      const amount=bounds[mode][axis]-own[mode][axis];if(Math.abs(amount)<1e-7)return [];

      const offset=[0,0,0];offset[axis]=amount;const p=cadPoint(frame,offset);return [{id:own.id,delta:p.map((v,k)=>v-frame[12+k])}];

    })])));

    current.data={bounds,frame,plans,revision};

    alignmentMarks.set({...current.data,axisNames:project().coordinateMode==='plane'?'UVN':'XYZ'});

    for(const button of $('align-grid').querySelectorAll('[data-align-axis]'))button.disabled=!plans[Number(button.dataset.alignAxis)][button.dataset.alignMode].length;

  })().catch(error=>{if(alignment===current&&ticket===alignmentTicket&&error.name!=='AbortError')throw error;});

  return alignmentTask;

}

function alignPanel(){

  const list=selected({roots:true});if(list.length<2)throw Error('Mindestens zwei Teile auswählen.');escape();alignment={ids:list.map(value=>value.node.id),referenceId:null,data:null};$('align-panel').hidden=false;

  const label=()=>{$('align-reference').textContent=alignment?.referenceId?'Feste Referenz: '+project().nodes.find(node=>node.id===alignment.referenceId)?.name:'Gesamte Auswahl · Objekt als feste Referenz anklicken.';};label();

  view.setInteraction(async (ray,event,visualHit)=>{const current=alignment;if(!current)return;if(!visualHit){escape();return;}const visualId=visualHit.object?.userData.rootId,node=project().nodes.find(n=>n.id===visualId),nativeIds=current.ids.filter(id=>project().nodes.find(n=>n.id===id)?.kind==='cad'),hit=node?.kind!=='cad'&&current.ids.includes(visualId)?{objectId:visualId}:nativeIds.length?await controller.query('rayPick',{ray,ids:nativeIds}):null;if(hit&&alignment===current){current.referenceId=hit.objectId;view.setAlignmentReference(hit.objectId);label();await refreshAlignment();}});

  const grid=$('align-grid');grid.replaceChildren();for(let axis=0;axis<3;axis++)for(const [mode,text]of [['min','−'],['center','Mitte'],['max','+']]){const button=document.createElement('button');button.textContent=['X','Y','Z'][axis]+' '+text;button.dataset.alignAxis=axis;button.dataset.alignMode=mode;button.onclick=()=>safe(()=>applyAlignment(axis,mode));grid.append(button);}

  const reset=document.createElement('button');reset.textContent='Gesamte Auswahl';reset.id='align-reset';reset.onclick=()=>{if(alignment){alignment.referenceId=null;view.setAlignmentReference(null);label();void safe(refreshAlignment);}};grid.append(reset);

  const close=document.createElement('button');close.textContent='Ausrichten beenden';close.id='align-close';close.onclick=escape;grid.append(close);ui.refresh();void layoutUI.openPanel('inspector');$('toggle-right').setAttribute('aria-expanded','true');$('align-panel').scrollIntoView({block:'nearest'});

  void safe(refreshAlignment);

}



async function centerSelection(){
  const targets=selected({editable:true}).map(value=>copy(value.target)),revision=controller.revision();
  const bounds=await controller.query('bounds',{targets});
  await gesture({targets,delta:translate(modelPlacementDelta(bounds)),revision});view.fit(targets);
}

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

function escape(){if($('modal').open&&$('modal').classList.contains('freecad-document-modal'))$('modal').close();featureUI?.close();if(jointsUI?.close())$('modal').close();projectParametersUI?.close();if(thicknessUI?.comparison.close())return;drawingUI?.close();meshHoleFillUI?.close();meshRepairUI?.close();meshReduceUI?.close();meshRemeshUI?.close();meshSmoothUI?.close();meshSculptUI?.close();meshEraseFillUI?.close();meshMakeSolidUI?.close();meshHollowUI?.close();meshFeaturesUI?.close();meshInspectorUI?.cancel();meshSelectionUI?.cancel();modelingUI?.close();advancedFreeCADUI?.close();if(sketchUI?.close())$('modal').close();if(functionsUI?.cancel())return;if(localStlTask){++localStlSequence;void localStlTask.cancel().catch(()=>{});localStlTask=null;setBusy(false);}const cancelled=controller.cancel();if(activePreview)controller.discard(activePreview.previewId);view.cancel();magnetSession=null;alignment=null;++alignmentTicket;alignmentMarks?.hide();view.setAlignmentReference(null);$('align-panel').hidden=true;$('mirror-panel').hidden=true;meshCopyUI?.close();inspectionUI?.close();thicknessUI?.close();tools?.escape();meshTools?.escape();meshExtras?.close();workplaneUI?.escape();clearPreview();$('magnet-mode').setAttribute('aria-pressed','false');ui?.refresh();if(cancelled){lastDisplayed=null;preparedDisplay=null;void scheduleRefresh().catch(error=>{if(error.name!=='AbortError')toast(error.message);});}}

function setMode(mode){escape();view.setMode(mode);document.querySelectorAll('[data-mode]').forEach(button=>button.classList.toggle('active',button.dataset.mode===mode));}

async function loadDemo(){if(activeEasyKind())throw Error('Beispiele im normalen Modus laden.');isolation.end();updateIsolation();const proposal=await controller.preview({kind:'batch',commands:[{op:'create',type:'box',name:'Platte',size:[60,40,6],pos:[0,0,3],as:'plate'},...[[-22,-12],[22,-12],[-22,12],[22,12]].map(([x,y],index)=>({op:'create',type:'cylinder',name:'Bohrung '+(index+1),size:[5,5,10],pos:[x,y,3],solid:false,as:'hole'+index})),{op:'group',targets:['$plate','$hole0','$hole1','$hole2','$hole3'],as:'result',name:'Platte mit vier Bohrungen'}]},{project:createCadProject(),label:'CAD-Beispiel laden'});await applyProposal(proposal);select([{rootId:proposal.aliases.result,path:[]}]);view.fit();}

function workspace(){const loadSet=assemblyDisplay.ids(project()),common=project().version>=8||loadSet!==null,section=common?(inspectionUI?.storedSection()??meshExtras?.storedSection()):null,meshSelection=common?meshSelectionUI?.snapshot():null;return {version:loadSet!==null?5:common?(meshSelection?4:section?3:2):1,...(loadSet!==null?{loadSet}:{}),...(common?{tree:ui?.getTreeState()??{expanded:[]},...(section?{section}:{}),...(meshSelection?{meshSelection}:{})}:{}),view:view.viewState(),selection:getSelection(),mode:view.getMode(),snap:preferences.snap,quality:quality.get(),layout:layoutUI.state()};}

function workspaceSignature(state=workspace()){

  const checked=validateCadWorkspace(state);

  // OrbitControls can change idle camera coordinates at floating-point precision.

  // Ignore sub-nanometre view noise only for dirty detection; files retain full precision.

  for(const field of ['position','target','up'])checked.view[field]=checked.view[field].map(value=>Number(value.toFixed(9)));

  checked.view.zoom=Number(checked.view.zoom.toPrecision(14));

  return JSON.stringify(checked);

}

function serializeWorkspace(state=workspace()){return controller.serializeWorkspace(state);}

function meshPartitionDraft(){return ['split','bodies','connectors'].includes(meshTools?.state()?.kind);}
function readyForFile(){if(featureUI?.state()||jointsUI?.state()||projectParametersUI?.state()||drawingUI?.state()||busy||meshPartitionDraft()||meshHoleFillUI?.state()||meshRepairUI?.state()||(meshReduceUI?.state()||meshRemeshUI?.state()||(meshSmoothUI?.state()||meshSculptUI?.state())||meshEraseFillUI?.state()||meshMakeSolidUI?.state()||(meshHollowUI?.state()||meshFeaturesUI?.state()))||meshSelectionUI?.state()||meshSelectionUI?.isChecking()||activePreview||meshCopyUI?.state()||tools?.state()?.preview||modelingUI?.state()||sketchUI?.state()||meshExtras?.state()||workplaneUI?.state()||view.isEditing()||layoutUI.isActive()||layoutUI.isSaving())throw Error('Bearbeitung zuerst abschließen oder abbrechen.');if(fileBusy)throw Error('Ein Projekt wird bereits gespeichert oder geöffnet.');}

async function save({saveAs=false,format}={}){
  readyForFile();fileBusy=true;
  try{
    const revision=controller.revision(),state=workspace(),signature=workspaceSignature(state),pack=format==='fnpack'||format===undefined&&preferredProjectFormat==='fnpack',base=(project().name.trim()||'Unbenanntes Modell').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_');let result,storedVersion;
    if(pack){if(!packFiles.available())throw Error('Geometriepakete in der portablen Anwendung speichern.');const encoded=packFiles.encode(project(),state);storedVersion=encoded.project.version;result=await window.offlinecadDesktop.saveProject({filename:base+'.fnpack',...encoded,id:activeProjectFile?.id,saveAs:saveAs||preferredProjectFormat!=='fnpack'});}
    else{storedVersion=cadWorkspaceStoredProjectVersion(project().version,state);const encoded=hasGeometryRefs(project())?createCadWorkspaceSerializer(await controller.materialize())(state):serializeWorkspace(state),filename=base+'.ocad';result=window.offlinecadDesktop?.saveProject?await window.offlinecadDesktop.saveProject({filename,bytes:new TextEncoder().encode(encoded),id:activeProjectFile?.id,saveAs:saveAs||preferredProjectFormat==='fnpack'||storedVersion>=8&&(activeProjectFile?.projectVersion??project().version)<storedVersion}):await download(encoded,filename,'application/json');}
    if(result?.saved){packFiles.register(result.fnpack);preferredProjectFormat=pack?'fnpack':'ocad';savedRevision=revision;cleanRevision=revision;recoveredProject=false;savedWorkspaceSignature=signature;cleanWorkspaceSignature=signature;activeProjectFile=result.file?{...result.file,projectVersion:storedVersion}:null;toast(result.warning??'Projekt gespeichert.');}updateState();return result;
  }finally{fileBusy=false;}
}

async function restoreWorkspace(state){const previousSet=assemblyDisplay.ids(project());assemblyDisplay.restore(state?.loadSet??null,project());if(JSON.stringify(previousSet)!==JSON.stringify(assemblyDisplay.ids(project()))){controller.invalidateDisplayView();lastDisplayed=null;preparedDisplay=null;await scheduleRefresh();}if(!state){await meshSelectionUI?.restore(null);ui?.restoreTreeState({expanded:[]});select([]);view.fit();return;}await setQuality(state.quality);setPreferences({...preferences,snap:state.snap});await layoutUI.restore(state.layout);setMode(state.mode);ui?.restoreTreeState(state.tree??{expanded:[]});view.restoreView(state.view);$('projection').textContent=t(state.view.projection==='perspective'?'Perspektive':'Orthografisch');select(state.selection);await meshExtras?.restoreSection(state.section);await meshSelectionUI?.restore(state.meshSelection??null);}

async function openEncoded(encoded,file=null,{allowCatalog=false}={}){const prepared=await controller.readProject(encoded),checked=prepared.project,state=checked.workspace;if(hasGeometryRefs(checked)&&!allowCatalog)throw Error('Geometrieverweise benötigen ein vollständiges .fnpack-Paket.');delete checked.workspace;const oldLoadSet=assemblyDisplay.ids(project());assemblyOpening=true;assemblyDisplay.restore(state?.loadSet??null,checked);const assemblySetChanged=JSON.stringify(oldLoadSet)!==JSON.stringify(assemblyDisplay.ids(checked));if(assemblySetChanged)controller.invalidateDisplayView();try{await controller.open(checked);}catch(error){assemblyDisplay.restore(oldLoadSet,project());throw error;}finally{assemblyOpening=false;}assemblyScope=controller.projectScope();assemblyKnownIds=new Set(project().nodes.map(n=>n.id));nextImportIndex=0;isolation.end();updateIsolation();if(assemblySetChanged){lastDisplayed=null;await scheduleRefresh();}else await refreshTask;activeProjectFile=prepared.migration?null:file?{...file,projectVersion:checked.version}:null;if(prepared.warnings.length)toast(prepared.warnings.join(' '));savedRevision=controller.revision();cleanRevision=savedRevision;recoveredProject=false;await restoreWorkspace(state);savedWorkspaceSignature=workspaceSignature();cleanWorkspaceSignature=savedWorkspaceSignature;updateState();}

async function openFile(file){if(file.name.toLowerCase().endsWith('.fnpack'))throw Error('Geometriepakete über Projekt öffnen in der portablen Anwendung laden.');if(file.size>CAD_PROJECT_LIMITS.bytes)throw Error('Projektdatei ist größer als 50 MB.');await openEncoded(new Uint8Array(await file.arrayBuffer()));}

async function openProject(id){

  readyForFile();if(!await confirmProjectChange())return;

  if(!window.offlinecadDesktop?.openProject){$('modal').close();$('open-file').click();return;}

  fileBusy=true;try{const result=await window.offlinecadDesktop.openProject(id?{id}:{});if(result.opened){packFiles.register(result.fnpack);const beforeFormat=preferredProjectFormat;try{await openEncoded(result.bytes??result.project,result.file,{allowCatalog:!!result.fnpack});preferredProjectFormat=result.fnpack?'fnpack':'ocad';}catch(error){preferredProjectFormat=beforeFormat;throw error;}$('modal').close();if(result.warning)toast(result.warning);}}finally{fileBusy=false;}

}

function confirmProjectChange(){

  if(!recoveredProject&&controller.revision()===cleanRevision&&workspaceSignature()===cleanWorkspaceSignature)return Promise.resolve(true);

  return new Promise(resolve=>{modal('Projekt wechseln','<p>'+(recoveredProject?'Wiederhergestelltes Projekt vor dem Wechsel als Projektdatei speichern?':'Aktuelle Änderungen vor dem Wechsel speichern?')+'</p><div class="modal-actions"><button id="project-change-cancel">Abbrechen</button><button id="project-change-discard">Ohne Speichern wechseln</button><button id="project-change-save" class="primary">Speichern und wechseln</button></div>');

    const dialog=$('modal'),finish=value=>{dialog.removeEventListener('close',closed);dialog.close();resolve(value);},closed=()=>finish(false);dialog.addEventListener('close',closed,{once:true});$('project-change-cancel').onclick=()=>finish(false);$('project-change-discard').onclick=()=>finish(true);$('project-change-save').onclick=()=>safe(async()=>{const result=await save();if(result?.saved)finish(true);});

  });

}

const projectsUI=createCadProjectsUI({desktop:window.offlinecadDesktop,modal,open:openProject,save,safe,t,thumbnail:async(encoded,signal)=>{

  const p=parseCadProject(encoded);delete p.workspace;

  const worker=createCadController({getFonts:fontLibrary.resources,createWorker:()=>new Worker(new URL('./cad-worker.js',import.meta.url),{type:'module'})});

  const cancel=()=>worker.cancel();signal.addEventListener('abort',cancel,{once:true});

  try{if(signal.aborted)throw new DOMException('Abgebrochen','AbortError');const display=await worker.display(p,{deflection:.2,angleDegrees:18});if(signal.aborted)throw new DOMException('Abgebrochen','AbortError');return renderCadProjectThumbnail(p,display);}

  finally{signal.removeEventListener('abort',cancel);worker.dispose();}

}});

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

async function importFile(file,{height=3,unit=1,reconstruct=false,repair=false,fillSmallHoles=false,tolerance=.15,mode='auto',fallback=true,converted,current=()=>true,files=[],exchange,asMesh=false,preparedMesh,importSignal,autoMeshRepair=true,simplifyLarge=true,importMaxError=.02,onImportProgress=()=>{}}={}){

  const importDomain=activeEasyKind(),domainRevision=easyDomainRevision,policy=easyImportPolicy(file.name.split('.').at(-1),importDomain);if(policy){asMesh=policy.asMesh;reconstruct=policy.reconstruct;}
  const rawStl=/\.stl$/i.test(file.name)&&!reconstruct&&!converted;if(file.size>(rawStl?MESH_IMPORT_LIMITS.bytes:CAD_PROJECT_LIMITS.bytes))throw Error(rawStl?'STL-Import: maximal 256 MiB.':'Importdatei ist größer als 50 MB.');const importRevision=controller.revision(),checkImport=()=>{if(importSignal?.aborted||domainRevision!==easyDomainRevision)throw new DOMException('Arbeitsbereich während des Imports geändert oder Import abgebrochen.','AbortError');if(!current())throw new DOMException('Import abgebrochen.','AbortError');if(controller.revision()!==importRevision)throw Object.assign(Error('Projekt während des Imports geändert. Erneut importieren.'),{code:'STALE_REVISION'});};const ext=file.name.split('.').at(-1).toLowerCase(),p=project(),options={name:file.name,id:crypto.randomUUID(),layerId:p.activeLayerId,folderId:p.activeFolderId,metadata:{importedFile:{name:file.name,type:ext}}};let proposal;

  if(['3mf','glb','gltf'].includes(ext)){

    const revision=controller.revision(),result=exchange??await readExchangeFile(file,{files});

    if(!current()||controller.revision()!==revision)throw Error('Import abgebrochen oder Projekt geändert.');

    const draft=controller.snapshot(),ids=[];

    for(const part of result.parts){const id=ids.length?crypto.randomUUID():options.id;ids.push(id);draft.nodes.push({id,kind:asMesh?'mesh':'referenceMesh',name:part.name,transform:cadIdentity(),color:part.color,opacity:part.opacity,layerId:draft.activeLayerId,folderId:draft.activeFolderId,metadata:options.metadata,mesh:part.mesh});}

    proposal=await controller.preview(undefined,{project:draft,revision,label:'Austauschdatei als Netzreferenzen importieren'});

    if(!current()){controller.discard(proposal.previewId);throw Object.assign(Error('Import abgebrochen.'),{name:'AbortError'});}

    return placeImportedProposal(proposal,checkImport,options.metadata);

  }

  else if(['step','stp'].includes(ext))proposal=await controller.preview({kind:'importStepAssembly',bytes:new Uint8Array(await file.arrayBuffer()),options},{label:'STEP-CAD importieren'});

  else if(ext==='svg'&&asMesh){const svg=await file.text();checkImport();proposal=await controller.preview({type:'mesh-create-source',id:options.id,shape:'svg',svg,paths:meshSvgPaths(svg),height,name:file.name,frame:workFrame(p)},{revision:importRevision,label:'SVG als Netz extrudieren'});}

  else if(ext==='svg'){const svg=new SVGLoader().parse(await file.text()),paths=svg.paths.filter(path=>path.userData?.style?.fill!=='none').map(path=>({subpaths:path.subPaths.map(value=>originalCadSubpath(value,{flipY:true})).filter(value=>value.length),fillRule:path.userData?.style?.fillRule??'nonzero',color:'#'+path.color.getHexString()}));proposal=await controller.preview({kind:'svg',paths,height,options},{label:'Originale SVG-CAD-Konturen extrudieren'});}

  else if(ext==='stl'&&(reconstruct||converted)){

    if(converted||hasLocalStlConverter()){

      const revision=controller.revision(),ticket=++localStlSequence,active=()=>ticket===localStlSequence&&current();

      const check=()=>{if(!active()){const error=Error('Konvertierung abgebrochen.');error.name='AbortError';throw error;}if(controller.revision()!==revision){const error=Error('Das Projekt wurde während der Konvertierung geändert. Bitte erneut importieren.');error.code='STALE_REVISION';throw error;}};

      setBusy(true);

      try{

        if(!converted){localStlTask=createLocalStlConversion({onProgress:message=>{const status=$('import-status');if(active()&&status?.isConnected)status.textContent=message;}});converted=await localStlTask.run(file,{unit,repair,tolerance,mode,fallback});}

        check();options.metadata.notes=conversionSummary(converted.report).slice(0,4000);

        proposal=await controller.preview({kind:'importStep',bytes:converted.bytes,options:{...options,transform:workFrame(p),color:'#8294aa'}},{revision,label:'STL-Konverter: CAD-Körper übernehmen'});

        try{check();}catch(error){controller.discard(proposal.previewId);throw error;}

      }finally{if(ticket===localStlSequence){localStlTask=null;setBusy(false);}}

    }else proposal=await controller.preview({kind:'importStlHousing',bytes:new Uint8Array(await file.arrayBuffer()),unit,repair:{enabled:repair,fillSmallHoles},options:{...options,transform:workFrame(p),color:'#8294aa'}},{label:'STL-Gehäuse als CAD rekonstruieren'});

  }

  else if(rawStl){
    const result=preparedMesh??await prepareMeshImport(await file.arrayBuffer(),{unit,repair:autoMeshRepair,simplify:simplifyLarge,maxError:importMaxError},{signal:importSignal,isCurrent:current,onProgress:onImportProgress});checkImport();
    options.metadata.notes=JSON.stringify(result.report);
    const draft=controller.snapshot();draft.nodes.push({id:options.id,kind:asMesh?'mesh':'referenceMesh',name:file.name,transform:workFrame(draft),color:'#8294aa',opacity:asMesh?1:.6,layerId:draft.activeLayerId,folderId:draft.activeFolderId,metadata:options.metadata,mesh:result.mesh});
    proposal=await controller.preview(undefined,{project:draft,revision:importRevision,label:'STL-Netz laden und automatisch bereinigen'});
  }
  else if(['stl','obj'].includes(ext)){const verts=[],triangles=[];let object;

    if(ext==='stl'){const bytes=new Uint8Array(await file.arrayBuffer());object=new THREE.Mesh(new STLLoader().parse(bytes.buffer));}else object=new OBJLoader().parse(await file.text());

    object.updateMatrixWorld(true);try{object.traverse(value=>{if(!value.isMesh)return;const geometry=value.geometry,attribute=geometry.getAttribute('position'),offset=verts.length/3;for(let i=0;i<attribute.count;i++)verts.push(...new THREE.Vector3().fromBufferAttribute(attribute,i).applyMatrix4(value.matrixWorld).multiplyScalar(unit).toArray());if(geometry.index)triangles.push(...Array.from(geometry.index.array,v=>v+offset));else for(let i=0;i<attribute.count;i++)triangles.push(offset+i);});}finally{object.traverse(value=>value.geometry?.dispose());}

    if(reconstruct)throw Error('CAD-Gehäuserekonstruktion unterstützt nur STL.');

    else{const draft=controller.snapshot();draft.nodes.push({id:options.id,kind:asMesh?'mesh':'referenceMesh',name:file.name,transform:workFrame(draft),color:'#8294aa',opacity:asMesh?1:.6,layerId:draft.activeLayerId,folderId:draft.activeFolderId,metadata:options.metadata,mesh:{verts,triangles}});proposal=await controller.preview(asMesh&&repair?{type:'mesh-repair',id:options.id,fillSmallHoles,optional:true}:undefined,{project:draft,label:'Netzteil importieren'});}

  }else throw Error('Dateityp nicht unterstützt.');

  return placeImportedProposal(proposal,checkImport,options.metadata);

}

async function importDialog(file,{files=[]}={}){
 const importDomain=activeEasyKind(),domainRevision=easyDomainRevision;easyImportPolicy(file.name.split('.').at(-1),importDomain);
 if(/\.fcstd$/i.test(file.name)){
  readyForFile();if(aiUI.isBusy())throw Error('Laufenden Auftrag zuerst abschließen.');escape();const revision=controller.revision();modal('FCStd-Datei importieren','<div id=freecad-import-host></div><div class=modal-actions><button id=freecad-import-close>Schließen</button></div>',{modeless:true});$('modal').classList.add('freecad-document-modal');$('modal').scrollTop=0;
  freecadImportReader=mountFreeCADImport({host:$('freecad-import-host'),file,revision,isCurrent:value=>controller.revision()===value&&domainRevision===easyDomainRevision,preview:(request,options)=>controller.previewFreeCADImport(request,options),apply:async proposal=>{const result=controller.apply(proposal);clearPreview();await scheduleRefresh();return result;},discard:id=>controller.discard(id),showPreview:async proposal=>{await showPreview(proposal,[proposal.selectedTargets[0].rootId]);view.fit([],{includePreview:true});},clearPreview,onApplied:target=>select([target])});$('freecad-import-close').onclick=()=>$('modal').close();return;
 }


 if(/\.(3mf|glb|gltf)$/i.test(file.name)){

  const revision=controller.revision(),exchange=await readExchangeFile(file,{files});if(domainRevision!==easyDomainRevision)throw new DOMException('Arbeitsbereich während des Imports geändert.','AbortError');if(controller.revision()!==revision)throw Error('Projekt inzwischen verändert. Import erneut starten.');

  modal('Teile importieren',exchangeImportSummary(exchange,{cad:true})+'<label class="dialog-label">Verwendung<select id="exchange-kind"><option value="reference">Ansichtsvorlagen</option><option value="mesh">Bearbeitbare Netzteile</option></select></label><p>Auch offene Netze lassen sich als Netzteile anzeigen und speichern. Körperwerkzeuge benötigen eine zusätzliche Prüfung.</p><p id="exchange-status" role="status"></p><div class="modal-actions"><button id="exchange-cancel">Abbrechen</button><button id="exchange-import" class="primary">Importieren</button></div>');

  $('exchange-kind').value=importDomain==='mesh'?'mesh':workflowSettings.get().import.meshUse==='mesh'?'mesh':'reference';if(importDomain)restrictEasyImport('exchange-kind',importDomain);

  const dialog=$('modal'),session=modalSequence;let active=true,importing=false;const closed=()=>{if(!dialog.open)cancel();},detach=()=>dialog.removeEventListener('close',closed),current=()=>active&&domainRevision===easyDomainRevision&&dialog.open&&session===modalSequence,cancel=()=>{const own=active&&session===modalSequence;active=false;detach();if(own&&importing)escape();};dialog.addEventListener('close',closed);$('exchange-cancel').onclick=()=>{cancel();dialog.close();};

  $('exchange-import').onclick=async()=>{const button=$('exchange-import');button.disabled=true;importing=true;try{if(controller.revision()!==revision)throw Error('Projekt inzwischen verändert. Import erneut starten.');await importFile(file,{files,exchange,asMesh:$('exchange-kind').value==='mesh',current});importing=false;active=false;detach();if(session===modalSequence)dialog.close();}catch(error){if(current())$('exchange-status').textContent=error.message;}finally{importing=false;if(button.isConnected&&session===modalSequence)button.disabled=false;}};return;

 }

 const svg=/\.svg$/i.test(file.name),stl=/\.stl$/i.test(file.name),reference=/\.(stl|obj)$/i.test(file.name);

 if(!svg&&!reference)return importFile(file);

 const defaults=workflowSettings.get(),local=hasLocalStlConverter(),repairControls=stl?'<div id="import-repair-options" hidden><label><input id="import-repair" type="checkbox" checked> Netzfehler vor der CAD-Rekonstruktion reparieren</label>'+(local?'<label class="dialog-label">Umwandlung<select id="import-assistance"><option value="without">Ohne KI · lokal umwandeln</option><option value="with">Mit KI · automatisch rekonstruieren</option></select></label><p class="small-note">Mit KI nutzt die gemeinsame Formnaro-API. Beim Start übernimmt die KI Einstellungen und Flächenauswahl automatisch. Gemessene Modell- und Flächenzusammenfassungen werden gesendet; die Dreiecksdaten bleiben lokal. Beide Wege enden in einer CAD-Vorschau mit Übernehmen oder Verwerfen.</p>'+conversionControls('import'):'<p>Entfernt Nullflächen und doppelte Dreiecke, richtet Flächen aus und repariert exakt kollineare Kanten. Originaldatei und Punktkoordinaten bleiben erhalten.</p><label><input id="import-fill-holes" type="checkbox"> Kleine Netzlücken schließen</label><p>Ergänzt Flächen an kleinen Randlücken. Nur einschalten, wenn diese Öffnungen unbeabsichtigt sind.</p>')+'</div>':'';

 modal(svg?'SVG extrudieren':stl?'STL importieren':'Netzreferenz importieren',

  (svg?'<label class="dialog-label">Verwendung<select id="import-kind"><option value="cad">CAD-Körper</option><option value="mesh">Bearbeitbares Netzteil</option></select></label><label class="dialog-label">Extrusionshöhe (mm)<input id="import-height" type="number" min="0.01" max="10000" value="3"></label>':

   (stl?'<label class="dialog-label">Verwendung<select id="import-kind"><option value="reference">Ansichtsvorlage</option><option value="mesh">Bearbeitbares Netzteil</option><option value="cad">STL als CAD-Körper rekonstruieren</option></select></label><p>CAD-Körper lassen sich mit den CAD-Werkzeugen bearbeiten. Netzreferenzen lassen sich positionieren.</p>'+repairControls:'<label class="dialog-label">Verwendung<select id="import-kind"><option value="reference">Ansichtsvorlage</option><option value="mesh">Bearbeitbares Netzteil</option></select></label>')+

   '<label class="dialog-label">Einheit<select id="import-unit"><option value="1">Millimeter</option><option value="10">Zentimeter</option><option value="25.4">Zoll</option></select></label>')+

  (stl?'<div id="import-mesh-options"><p>Auch offene oder beschädigte Teile laden. Sichere Bereinigung schließt keine Öffnungen und entfernt keine Bestandteile.</p><label><input id="import-auto-mesh-repair" type="checkbox" checked> Automatisch bereinigen</label><label><input id="import-simplify-large" type="checkbox" checked> Große Netze bei Bedarf vereinfachen</label><label class="dialog-label">Fehlerwert für Vereinfachung (mm)<input id="import-mesh-error" type="number" min="0" max="1" step="0.01" value="0.02"></label><p class="small-note">Bis 256 MiB binäre STL und 5 Millionen Dreiecke. Über 500.000 Dreiecken wird eine Arbeitskopie mit Ziel 250.000 versucht. Offene Ränder und ausgeprägte Kanten bleiben fest. Fehlerwert ist eine Algorithmusschätzung; Passmaße müssen geprüft werden. Die Originaldatei bleibt erhalten.</p></div>':'')+
  '<p id="import-status" role="status"></p><pre id="import-mesh-report" hidden></pre><div class="modal-actions"><button id="import-cancel">Abbrechen</button><button id="import-confirm" class="primary">Importieren</button></div>');

 if(!svg){$('import-kind').value=!stl&&defaults.import.meshUse==='cad'?'reference':defaults.import.meshUse;$('import-unit').value=String(defaults.import.unit);}else $('import-height').value=defaults.import.svgHeight;

 if(stl){$('import-repair').checked=defaults.conversion.repair;if(local){$('import-tolerance').value=defaults.conversion.tolerance;$('import-mode').value=defaults.conversion.mode;$('import-fallback').checked=defaults.conversion.fallback;}}

 if(!svg&&importDomain&&$('import-kind'))restrictEasyImport('import-kind',importDomain);
 if(stl){$('import-kind').onchange=()=>{$('import-repair-options').hidden=$('import-kind').value!=='cad';$('import-mesh-options').hidden=$('import-kind').value==='cad';};$('import-repair').onchange=()=>{if($('import-fill-holes'))$('import-fill-holes').disabled=!$('import-repair').checked;};$('import-kind').onchange();}

 const dialog=$('modal'),session=modalSequence,importAbort=new AbortController(),openedRevision=controller.revision();let active=true,importing=false,preparedMesh=null,preparedOptions=null;const closed=()=>{if(!dialog.open)cancel();},detach=()=>dialog.removeEventListener('close',closed),current=()=>active&&domainRevision===easyDomainRevision&&dialog.open&&session===modalSequence,cancel=()=>{const own=active&&session===modalSequence;active=false;importAbort.abort();preparedMesh=null;detach();if(own&&importing)escape();};dialog.addEventListener('close',closed);$('import-cancel').onclick=()=>{cancel();dialog.close();};

 $('import-confirm').onclick=()=>safe(async()=>{const cadConversion=stl&&local&&$('import-kind').value==='cad',controls=cadConversion?readConversionControls('import'):{};

 if(cadConversion){const assistance=$('import-assistance').value,initialOptions={...controls,unit:Number($('import-unit').value),repair:$('import-repair').checked};readyForFile();active=false;detach();functionsUI.converter(file,{intent:'import',assistance,initialOptions});return;}

 importing=true;try{
  if(controller.revision()!==openedRevision)throw Error('Projekt inzwischen verändert. Import erneut starten.');
  const inputOptions=preparedOptions??{...controls,current,height:svg?Number($('import-height').value):3,unit:reference?Number($('import-unit').value):1,asMesh:!!$('import-kind')&&$('import-kind').value==='mesh',reconstruct:stl&&$('import-kind').value==='cad',repair:stl&&$('import-kind').value==='cad'&&$('import-repair').checked,fillSmallHoles:!!$('import-fill-holes')&&$('import-fill-holes').checked};
  for(const input of $('modal-body').querySelectorAll('input,select,button:not(#import-cancel)'))input.disabled=true;
  if(stl&&!inputOptions.reconstruct&&!preparedMesh){
   if(file.size>MESH_IMPORT_LIMITS.bytes)throw Error('STL-Import: maximal 256 MiB.');
   preparedOptions=inputOptions;preparedMesh=await prepareMeshImport(await file.arrayBuffer(),{unit:inputOptions.unit,repair:$('import-auto-mesh-repair').checked,simplify:$('import-simplify-large').checked,maxError:Number($('import-mesh-error').value)},{signal:importAbort.signal,isCurrent:()=>current()&&controller.revision()===openedRevision,onProgress:message=>{if(current())$('import-status').textContent=message;}});
   if(!current()||controller.revision()!==openedRevision)throw new DOMException('Import abgebrochen oder Projekt geändert.','AbortError');
   if(preparedMesh.report.simplification.changed){const r=preparedMesh.report;const report=$('import-mesh-report');report.hidden=false;report.textContent=`Arbeitskopie: ${r.inputTriangles.toLocaleString('de-DE')} → ${r.outputTriangles.toLocaleString('de-DE')} Dreiecke.\nGeschätzter Fehler: ${r.simplification.errorEstimateMm.toLocaleString('de-DE',{maximumFractionDigits:6})} mm.\n`+r.warnings.join('\n');$('import-status').textContent='Vereinfachte Arbeitskopie geprüft. Zum Laden erneut bestätigen.';$('import-confirm').textContent='Arbeitskopie importieren';return;}
  }
  await importFile(file,{...inputOptions,preparedMesh,importSignal:importAbort.signal});importing=false;active=false;preparedMesh=null;detach();if(session===modalSequence)dialog.close();
 }catch(error){preparedMesh=null;preparedOptions=null;if(error.name!=='AbortError'&&current()&&$('import-status')?.isConnected)$('import-status').textContent=error.message;}
 finally{importing=false;if(session===modalSequence)for(const input of $('modal-body').querySelectorAll('input,select,button'))input.disabled=!!preparedMesh&&input.id!=='import-confirm'&&input.id!=='import-cancel';}});

}

async function saveDrawingExport({format,sheet,signal}){
  const revision=controller.revision(),release=controller.holdRevision(revision);
  try{if(signal?.aborted)return {saved:false,canceled:true};controller.assertExportReady({ids:[...new Set(sheet.views.flatMap(v=>v.sourceIds))],format:'drawing-'+format,includeHidden:true});const source=controller.readSnapshot(),options={sourceSignatures:cadDrawingSourceSignatures(source)},name=(sheet.name||'Zeichnungsblatt');
    if(format==='pdf'){if(!window.offlinecadDesktop?.printDrawingPdf)throw Error('PDF-Ausgabe benötigt die lokale Formnaro-Anwendung.');const [widthMm,heightMm]=cadDrawingPaperSize(sheet),svg=cadDrawingSvg(sheet,options),bytes=await window.offlinecadDesktop.printDrawingPdf({svg,widthMm,heightMm});if(signal?.aborted)return {saved:false,canceled:true};if(controller.revision()!==revision)throw Object.assign(Error('Modell während der PDF-Ausgabe geändert.'),{code:'STALE_REVISION'});return await download(bytes,name+'.pdf','application/pdf',{numbered:true,signal});}
    const text=format==='svg'?cadDrawingSvg(sheet,options):format==='dxf'?cadDrawingDxf(sheet,options):null;if(text===null)throw Error('Unbekanntes Zeichnungsformat.');return await download(text,name+'.'+format,format==='svg'?'image/svg+xml':'application/dxf',{numbered:true,signal});
  }finally{release();}
}

async function exportModel(format,{ids,quality:exportQuality=quality.get().export,current=()=>true}={}){ids=easyExportIds(project(),activeEasyKind(),ids,format);const domainRevision=easyDomainRevision,originalCurrent=current;current=()=>domainRevision===easyDomainRevision&&originalCurrent();if(format==='svg'){const result=await exportCadProjectSvg(controller,{ids,quality:exportQuality});if(!current())return {canceled:true};await download(result.svg,project().name+'.svg','image/svg+xml',{numbered:true});return result;}const result=await controller.exportModel({format,ids,quality:exportQuality});if(!current())return {canceled:true};await download(result.data,project().name+'.'+result.extension,result.mime,{numbered:true});return result;}

function exportDialog(){if((meshReduceUI?.state()||meshRemeshUI?.state()||(meshSmoothUI?.state()||meshSculptUI?.state())||meshEraseFillUI?.state()||meshMakeSolidUI?.state()||(meshHollowUI?.state()||meshFeaturesUI?.state())))readyForFile();modal('Modell exportieren','<p>Exportiert werden dauerhaft sichtbare Teile. STL und OBJ enthalten CAD-Körper und Netzteile. 3MF, GLB und glTF enthalten zusätzlich Ansichtsvorlagen. STEP enthält native CAD-Körper. Lose Lochteile werden ausgelassen. Die Auswahlisolation begrenzt nur die Ansicht.</p><label class="dialog-label">Format<select id="export-format"><option value="stl">STL · 3D-Druck</option><option value="step">STEP · CAD-Körper</option><option value="obj">OBJ + MTL</option><option value="3mf">3MF · Farben</option><option value="glb">GLB · Darstellung in einer Datei</option><option value="gltf">glTF · Darstellung</option><option value="svg">SVG · CAD- und Netzprojektion</option></select></label><label class="dialog-label">Umfang<select id="export-scope"><option value="all">Sichtbare Teile</option><option value="selection">Ausgewählte Teile</option></select></label><label class="dialog-label">Export-Abweichung (mm)<input id="export-deflection" type="number" min="0.0000001" step="0.001"></label><label class="dialog-label">Export-Winkel (Grad)<input id="export-angle" type="number" min="0.01" max="90"></label><p id="export-status" role="status"></p><div class="modal-actions"><button id="export-confirm" class="primary">Exportieren</button></div>');$('export-format').value=workflowSettings.get().export.format;$('export-scope').value=workflowSettings.get().export.scope;$('export-deflection').value=quality.get().export.deflection;$('export-angle').value=quality.get().export.angleDegrees;if(activeEasyKind()){const mesh=activeEasyKind()==='mesh';if(mesh)$('export-format').querySelector('[value=step]')?.remove();if(!$('export-format').value)$('export-format').value='stl';$('export-scope').querySelector('[value=all]').textContent=mesh?'Sichtbare Netzteile':'Sichtbare CAD-Teile';$('modal-body').querySelector('p').textContent=mesh?'Exportiert nur die sichtbaren Netzteile dieses Arbeitsbereichs.':'Exportiert nur die sichtbaren CAD-Teile dieses Arbeitsbereichs.';}const session=modalSequence,dialog=$('modal'),status=$('export-status'),current=()=>session===modalSequence&&status.isConnected&&dialog.open;$('export-confirm').onclick=()=>safe(async()=>{if(!current())return;status.textContent='';const ids=$('export-scope').value==='selection'?selected({roots:true}).map(value=>value.node.id):undefined;try{await exportModel($('export-format').value,{ids,quality:{deflection:Number($('export-deflection').value),angleDegrees:Number($('export-angle').value)},current});if(current())dialog.close();}catch(error){if(!current())return;if(['SVG_OPEN_MESH','SVG_INVALID_MESH'].includes(error.code)){status.textContent=error.message;return;}throw error;}});}

function help(){modal('Formnaro bedienen','<p>Formen anklicken oder auf eine CAD-Fläche ziehen. Linksklick wählt, Umschalt ergänzt die Auswahl. Rechts ziehen dreht die Ansicht, mittlere Maustaste verschiebt.</p><p>Weiße Eckgriffe ändern die Maße bei fester Gegenecke und festem Boden. Quellenteile lassen sich im Objektbaum öffnen und bearbeiten. Löcher werden beim Gruppieren abgezogen.</p><p>Strg+Z: Rückgängig · Strg+Y: Wiederholen · Strg+D: Duplizieren · Strg+G: Gruppieren · Strg+Umschalt+G: Auflösen · L: Ausrichten · M: Spiegeln · D: Absetzen · W: Arbeitsebene · F: Einpassen · Esc: Abbrechen.</p><p>CAD-Körper und Netzteile teilen eine Arbeitsfläche und ein Projekt. STL, OBJ und Austauschdateien können als bearbeitbare Netzteile oder Ansichtsvorlagen importiert werden. Netzteile auswählen und Netz-Werkzeuge öffnen: Grundformen, Gruppieren, Bohren, Teilen, Materialkörper und Kanten. Vorschau prüfen, dann übernehmen oder abbrechen. Offene oder beschädigte Netze bleiben sichtbar; Körperwerkzeuge benötigen eine erfolgreiche Prüfung.</p><p>STEP verwendet native CAD-Geometrie. CAD und Netz werden nur über ausdrücklich aufgerufene Umwandlungen gewechselt. Anzeige und Export haben eigene Qualitätswerte.</p><p>Einstellungen → Dateien verwaltet gemeinsame Vorgaben und übertragbare Einstellungsdateien. Beim STL-Import als CAD und im Konverter lässt sich für jeden Auftrag Ohne KI oder Mit KI wählen. Mit KI werden Einstellungen, Flächenauswahl, lokale Konvertierung und CAD-Vorschau automatisch vorbereitet. Erst das fertige Ergebnis übernehmen oder verwerfen. Die manuelle KI-Flächenkorrektur bleibt im Konverter verfügbar. Beide Bereiche nutzen dieselbe Formnaro-API und gemeinsame Vorschauen.</p>');}

const actions={'cad-surface-fill':()=>advancedFreeCADUI.open('surface-fill'),'cad-surface-transition':()=>advancedFreeCADUI.open('surface-transition'),'cad-surface-sew':()=>advancedFreeCADUI.open('surface-sew'),'cad-surface-relief':()=>advancedFreeCADUI.open('surface-relief'),'cad-draft':()=>advancedFreeCADUI.open('draft'),'cad-defeature':()=>advancedFreeCADUI.open('defeature'),'cad-revolution':()=>advancedFreeCADUI.open('revolution'),'cad-helix':()=>advancedFreeCADUI.open('helix'),joints:()=>jointsUI.open(),'linked-contours':()=>modelingUI.openLinks(),'project-parameters':()=>projectParametersUI.open(),drawing:()=>drawingUI.open(),'cad-edit-modeling':()=>modelingUI.openEdit(),'cad-contour':()=>modelingUI.open('contour'),'cad-face-offset':()=>modelingUI.open('face-offset'),'cad-shell':()=>modelingUI.open('shell'),'cad-loft':()=>modelingUI.open('loft'),'cad-sweep':()=>modelingUI.open('sweep'),'sketch-templates':()=>ui.library.open(),'model-compare':()=>thicknessUI.comparison.open(),'sketch-on-part':()=>sketchUI.openOnPart(),thickness:()=>thicknessUI.open(),...ui.actions,...tools.actions,...meshTools.actions,'mesh-close-hole':()=>meshHoleFillUI.open(),'mesh-repair':()=>meshRepairUI.open(),'mesh-reduce':()=>meshReduceUI.open(),'mesh-curved-reduce':()=>meshReduceUI.open('curved-v1'),'mesh-remesh':()=>meshRemeshUI.open(),'mesh-smooth':()=>meshSmoothUI.open(),'mesh-sculpt':()=>meshSculptUI.open(),'mesh-erase-fill':()=>meshEraseFillUI.open(),'mesh-make-solid':()=>meshMakeSolidUI.open(),'mesh-hollow':()=>meshHollowUI.open(),'mesh-features':()=>meshFeaturesUI.open(),'mesh-inspector':()=>meshInspectorUI.open(),'mesh-select':()=>meshSelectionUI.open(),'mesh-more':()=>meshExtras.open(),measure:()=>inspectionUI.openMeasure(),legacyMeasure:()=>!selection.length||selection.some(t=>project().nodes.find(n=>n.id===t.rootId)?.kind!=='cad')?meshExtras.open('measure'):tools.actions.measure(),ruler:()=>project().nodes.some(n=>n.kind==='mesh'&&domainAllowsId(n.id))?meshExtras.open('ruler'):tools.actions.ruler(),section:()=>inspectionUI.openSection(),inspect:()=>selection.some(t=>project().nodes.find(n=>n.id===t.rootId)?.kind!=='cad')||!selection.length&&project().nodes.some(n=>n.kind==='mesh'&&domainAllowsId(n.id))?meshExtras.open('inspect'):tools.actions.inspect(),array:()=>selection.some(t=>project().nodes.find(n=>n.id===t.rootId)?.kind!=='cad')?meshExtras.open('array'):tools.actions.array(),'general-fit':()=>meshSelection()?meshExtras.open('fit'):tools.actions['general-fit'](),'lay-on-face':()=>meshSelection()?meshExtras.open('floor'):tools.actions['lay-on-face'](),'reference-place':()=>meshSelection()?meshExtras.open('reference'):tools.actions['reference-place'](),'edge-finish':()=>meshTools.open('finish'),'face-floor':()=>meshExtras.open('floor'),'split-plane':()=>meshTools.open('split'),'extract-bodies':()=>meshTools.open('bodies'),'hole-wizard':()=>meshTools.open('drill'),split:()=>meshSelection()?meshTools.open('split'):tools.actions.split(),extract:()=>meshSelection()?meshTools.open('bodies'):tools.actions.extract(),drill:()=>meshSelection()?meshTools.open('drill'):tools.actions.drill(),edges:()=>meshSelection()?meshTools.open('finish'):tools.actions.edges(),round:()=>meshSelection()?meshTools.actions['mesh-round']():tools.actions.round(),chamfer:()=>meshSelection()?meshTools.actions['mesh-chamfer']():tools.actions.chamfer(),sketch:()=>sketchUI.open(false,activeEasyKind()==='mesh'||meshSelection()),'edit-sketch':()=>sketchUI.open(true,meshSelection()),isolate:isolateSelection,'end-isolation':endIsolation,'cad-to-mesh':()=>meshCopyUI.open(),'mesh-to-cad':()=>{escape();readyForFile();if(selection.length!==1)throw Error('Genau ein Netzteil auswählen.');const revision=controller.revision(),input=meshCadInput(project(),selection[0],revision);functionsUI.converter(input.file,{boundSource:{source:input.source,current:()=>controller.revision()===revision}});},functions:()=>functionsUI.show(),'stl-to-step':()=>functionsUI.choose(),undo:async()=>{if(meshSelectionUI?.state()){meshSelectionUI.undo();return;}controller.undo();await refreshTask;},redo:async()=>{if(meshSelectionUI?.state()){meshSelectionUI.redo();return;}controller.redo();await refreshTask;},duplicate,copy:copySelection,paste,delete:remove,group,intersect:()=>group('intersection'),ungroup,align:alignPanel,mirror:mirrorPanel,drop,center:centerSelection,'workplane-set':workplanePick,'workplane-top':planeTop,'reset-plane':()=>mutate(draft=>{draft.workplane={origin:[0,0,0],orientation:[0,0,0,1],reference:null};},'Grundebene wiederherstellen'),fit:()=>view.fit(),projection:()=>{$('projection').textContent=view.toggleProjection();},demo:loadDemo,new:async()=>{readyForFile();if(!await confirmProjectChange())return;await controller.open(createCadProject(),{label:'Neues CAD-Projekt'});nextImportIndex=0;isolation.end();updateIsolation();activeProjectFile=null;preferredProjectFormat='ocad';savedRevision=null;savedWorkspaceSignature=null;cleanRevision=controller.revision();recoveredProject=false;select([]);await refreshTask;cleanWorkspaceSignature=workspaceSignature();updateSaveState();},open:()=>openProject(),projects:projectsUI.show,save,'save-as':()=>save({saveAs:true}),import:()=>$('import-file').click(),export:exportDialog,help};

document.addEventListener('click',event=>{const button=event.target.closest('[data-action]');if(button&&!button.disabled&&actions[button.dataset.action]){if(jointsUI?.state()&&!['joints','fit','projection','help'].includes(button.dataset.action)){toast('Gelenkbewegung zuerst übernehmen oder abbrechen.');return;}if(projectParametersUI?.state()&&!['project-parameters','fit','projection','help'].includes(button.dataset.action)){toast('Projektparameter zuerst übernehmen oder schließen.');return;}if(drawingUI?.state()&&!['drawing','help'].includes(button.dataset.action)){toast('Zeichnungsblatt zuerst übernehmen oder schließen.');return;}if(advancedFreeCADUI?.state()&&!['cad-draft','cad-defeature','cad-revolution','cad-helix','cad-surface-fill','cad-surface-transition','cad-surface-sew','cad-surface-relief','fit','projection','help'].includes(button.dataset.action)){toast('FreeCAD-Bearbeitung zuerst übernehmen oder abbrechen.');return;}if(modelingUI?.state()&&!['linked-contours','cad-contour','cad-face-offset','cad-shell','cad-loft','cad-sweep','cad-edit-modeling','fit','projection','help'].includes(button.dataset.action)){toast('CAD-Bearbeitung zuerst übernehmen oder abbrechen.');return;}if((meshHoleFillUI?.state()||meshRepairUI?.state()||(meshReduceUI?.state()||meshRemeshUI?.state()||(meshSmoothUI?.state()||meshSculptUI?.state())||meshEraseFillUI?.state()||meshMakeSolidUI?.state()||(meshHollowUI?.state()||meshFeaturesUI?.state()))||meshPartitionDraft())&&!['mesh-close-hole','mesh-repair','mesh-reduce','mesh-remesh','mesh-smooth','mesh-sculpt','mesh-erase-fill','mesh-make-solid','mesh-hollow','mesh-features','mesh-tools','mesh-split','mesh-extract','mesh-connectors','split','extract','fit','projection'].includes(button.dataset.action)){toast('Netzbearbeitung zuerst übernehmen oder abbrechen.');return;}if(meshSelectionUI?.state()&&!['mesh-select','fit','projection','help','undo','redo'].includes(button.dataset.action)){toast('Netz-Flächenauswahl zuerst übernehmen oder abbrechen.');return;}void safe(actions[button.dataset.action]);}});

document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>view.setView(button.dataset.view));document.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>setMode(button.dataset.mode));document.querySelectorAll('[data-mirror]').forEach(button=>button.onclick=()=>safe(()=>mirror(Number(button.dataset.mirror))));

// Inspection is read-only but owns clipping, markers and point input. End it
// before another modelling action takes over the same viewport controls.
for(const name of Object.keys(actions))if(!['measure','section','fit','projection','save','save-as','export','copy'].includes(name)&&typeof actions[name]==='function'){
 const action=actions[name];actions[name]=(...args)=>{inspectionUI?.close();thicknessUI?.close();return action(...args);};
}
$('ai-open').onclick=()=>safe(()=>aiUI.openChat());$('magnet-mode').onclick=()=>safe(magnet);$('modal-close').onclick=()=>{functionsUI?.cancel();if($("modal").classList.contains("ai-modal")){$("modal").close();return;}if(localStlTask)escape();$('modal').close();if(activePreview)escape();};$('modal').addEventListener('cancel',()=>{if(!$('modal').classList.contains('ai-modal'))escape();});$('open-file').onchange=()=>safe(async()=>{const file=$('open-file').files[0];$('open-file').value='';if(file)await openFile(file);});$('import-file').onchange=()=>safe(()=>{const files=Array.from($('import-file').files);$('import-file').value='';if(files.length)return importDialog(exchangeMainFile(files,{freecad:true}),{files});});

for(const [id,key]of [['toggle-left','library'],['toggle-right','inspector']])$(id).onclick=()=>safe(()=>layoutUI.togglePanel(key));

$('viewport').addEventListener('dragover',event=>{event.preventDefault();event.dataTransfer.dropEffect='copy';});$('viewport').addEventListener('drop',event=>{event.preventDefault();void safe(async()=>{if(event.dataTransfer.files.length){const files=Array.from(event.dataTransfer.files);return importDialog(exchangeMainFile(files,{freecad:true}),{files});}const plugin=event.dataTransfer.getData('application/x-offlinecad-plugin');if(plugin){const [id,shapeId]=JSON.parse(plugin),pack=plugins.find(pack=>pack.manifest.id===id);if(!pack)throw Error('Plugin fehlt.');return addPlugin(pack.manifest,shapeId,event);}const type=event.dataTransfer.getData('text/plain');if(type)return addShape(type,event);});});

document.addEventListener('keydown',event=>{if(event.key==='Escape'){if(functionsUI?.state()?.projectPreview)event.preventDefault();escape();return;}if(event.target.closest('input,textarea,select,[contenteditable="true"]')||$('modal').open||layoutUI.isActive()||drawingUI?.state()||projectParametersUI?.state())return;const ctrl=event.ctrlKey||event.metaKey,key=event.key.toLowerCase();if(meshHoleFillUI?.state()||meshRepairUI?.state()||(meshReduceUI?.state()||meshRemeshUI?.state()||(meshSmoothUI?.state()||meshSculptUI?.state())||meshEraseFillUI?.state()||meshMakeSolidUI?.state()||(meshHollowUI?.state()||meshFeaturesUI?.state()))||meshPartitionDraft()){if(!ctrl&&key==='f'){event.preventDefault();view.fit();return;}if(ctrl||['delete','backspace','arrowleft','arrowright','arrowup','arrowdown','pageup','pagedown','t','s','r','l','m','d','w'].includes(key)){event.preventDefault();toast('Netzbearbeitung zuerst übernehmen oder abbrechen.');return;}}if(meshSelectionUI?.state()){if(ctrl&&['z','y'].includes(key)){event.preventDefault();void safe(()=>key==='y'||event.shiftKey?meshSelectionUI.redo():meshSelectionUI.undo());return;}if(!ctrl&&key==='f'){event.preventDefault();view.fit();return;}if(ctrl||['delete','backspace','arrowleft','arrowright','arrowup','arrowdown','pageup','pagedown','t','s','r','l','m','d','w'].includes(key)){event.preventDefault();toast('Netz-Flächenauswahl zuerst übernehmen oder abbrechen.');return;}}if(modelingUI?.state()){if(!ctrl&&key==='f'){event.preventDefault();view.fit();return;}if(ctrl||['delete','backspace','arrowleft','arrowright','arrowup','arrowdown','pageup','pagedown','t','s','r','l','m','d','w'].includes(key)){event.preventDefault();toast('CAD-Bearbeitung zuerst übernehmen oder abbrechen.');return;}}if(ctrl&&key==="a"){event.preventDefault();select((nativeScene?.objects??[]).filter(item=>!item.target.path.length&&!item.hidden&&view.allows(item.target.rootId)).map(item=>item.target));return;}if(!ctrl&&["t","s","r"].includes(key)){event.preventDefault();setMode({t:"translate",s:"scale",r:"rotate"}[key]);return;}let action;if(ctrl)action={z:event.shiftKey?'redo':'undo',y:'redo',d:'duplicate',c:'copy',v:'paste',g:event.shiftKey?'ungroup':'group',s:event.shiftKey?'save-as':'save',o:'open'}[key];else action={delete:'delete',backspace:'delete',f:'fit',l:'align',m:'mirror',d:'drop',w:'workplane-set'}[key];if(action){event.preventDefault();void safe(actions[action]);return;}if(['arrowleft','arrowright','arrowup','arrowdown','pageup','pagedown'].includes(key)){event.preventDefault();const step=preferences.snap||1,delta={arrowleft:[-step,0,0],arrowright:[step,0,0],arrowup:[0,step,0],arrowdown:[0,-step,0],pageup:[0,0,step],pagedown:[0,0,-step]}[key],frame=activeFrame(),world=new THREE.Vector3(...delta).transformDirection(new THREE.Matrix4().fromArray(frame)).multiplyScalar(step);void safe(()=>gesture({targets:selected({editable:true}).map(value=>value.target),delta:translate(world.toArray()),revision:controller.revision()}));}});

window.offlinecadDesktop?.onAutomation(async(method,args)=>{try{if(!window.__cadReady)throw Error('CAD kernel is not ready.');return {format:'FormnaroAutomationReply',version:1,ok:true,value:await access.dispatch(method,args)};}catch(error){return {format:'FormnaroAutomationReply',version:1,ok:false,error:{message:String(error.message),...(typeof error.code==='string'?{code:error.code}:{}),feedback:aiFeedback(error)}};}});

// View-only changes also belong to recovery, without writing a large BRep on

// every animation frame. Save after the workspace has settled for one second.

let recoverySignature='',recoveryWritten='',recoveryChangedAt=0;

const recoveryTimer=setInterval(()=>{if(!window.__cadReady||busy||fileBusy||recovery.isWriting()||meshHoleFillUI?.state()||meshRepairUI?.state()||(meshReduceUI?.state()||meshRemeshUI?.state()||(meshSmoothUI?.state()||meshSculptUI?.state())||meshEraseFillUI?.state()||meshMakeSolidUI?.state()||(meshHollowUI?.state()||meshFeaturesUI?.state()))||meshSelectionUI?.state()||meshSelectionUI?.isChecking()||activePreview||modelingUI?.state()||tools?.state()?.preview||meshTools?.state()||(inspectionUI?.state()||thicknessUI?.state())||meshExtras?.state()||workplaneUI?.state()||view.isEditing()||layoutUI.isActive()||layoutUI.isSaving())return;const state=workspace();updateSaveState(workspaceSignature(state));if(!preferences.autosave)return;const signature=controller.revision()+'|'+JSON.stringify(state);if(signature!==recoverySignature){recoverySignature=signature;recoveryChangedAt=Date.now();return;}if(signature!==recoveryWritten&&Date.now()-recoveryChangedAt>=1000){void safe(async()=>{if(await recovery.write(serializeWorkspace(state),{version:project().version})){recoveryWritten=signature;autosavedRevision=controller.revision();}});}},500);

window.addEventListener('beforeunload',event=>{if(window.__cadReady&&preferences.autosave&&recovery.packageMode()&&!closingAfterPackRecovery){event.preventDefault();event.returnValue=false;if(!packClosePending){packClosePending=true;Promise.resolve(recovery.write(serializeWorkspace(),{version:project().version})).then(saved=>{if(!saved)throw Error('Paket-Autosicherung ist gesperrt. Projekt vor dem Schließen speichern.');closingAfterPackRecovery=true;window.close();}).catch(error=>{packClosePending=false;toast(error.message);});}return;}easyRepair?.invalidate();clearInterval(recoveryTimer);if(window.__cadReady&&preferences.autosave&&!closingAfterPackRecovery)void safe(()=>recovery.write(controller.state().busy||meshSelectionUI?.isChecking()?controller.serialize():serializeWorkspace(),{version:project().version}));meshHoleFillUI?.dispose();meshRepairUI?.dispose();meshReduceUI?.dispose();meshRemeshUI?.dispose();meshSmoothUI?.dispose();meshSculptUI?.dispose();meshEraseFillUI?.dispose();meshMakeSolidUI?.dispose();meshHollowUI?.dispose();meshFeaturesUI?.dispose();meshInspectorUI?.dispose();meshSelectionUI?.dispose();inspectionUI?.dispose();thicknessUI?.dispose();functionsUI?.dispose();modelingUI?.dispose();sketchUI?.close();aiUI?.dispose();featureUI?.dispose();freecadDocumentReader?.dispose();freecadImportReader?.dispose();meshTools?.close();meshExtras?.dispose();meshCopyUI?.dispose();workplaneUI?.dispose();controller.dispose();view.dispose();});

const assemblyNotice=document.createElement('div');assemblyNotice.id='cad-assembly-notice';assemblyNotice.className='cad-assembly-notice';assemblyNotice.hidden=true;assemblyNotice.setAttribute('role','status');$('viewport').append(assemblyNotice);
function updateAssemblyNotice(){const state=assemblyDisplay.state(project());if(state.loadSet===null){if(!assemblyNotice.hidden)assemblyNotice.hidden=true;return;}assemblyNotice.hidden=false;assemblyNotice.textContent=state.loaded+' von '+state.total+' Teilen vollständig dargestellt · übrige sichtbare Teile als Rahmen';}
async function changeAssemblyDisplay(action,requestedIds){readyForFile();await refreshTask;if(controller.state().busy)throw Error('Laufende Bearbeitung zuerst abschließen.');escape();const before=assemblyDisplay.ids(project()),ids=requestedIds??[...new Set(getSelection().map(t=>t.rootId))];try{if(action==='only')assemblyDisplay.only(ids,project());else if(action==='load')assemblyDisplay.load(ids,project());else if(action==='all')assemblyDisplay.all(project());else throw Error('Unbekannte Baugruppenansicht.');controller.invalidateDisplayView();lastDisplayed=null;preparedDisplay=null;await scheduleRefresh();updateSaveState();return assemblyDisplay.state(project());}catch(error){assemblyDisplay.restore(before,project());controller.invalidateDisplayView();lastDisplayed=null;preparedDisplay=null;await scheduleRefresh();throw error;}}
for(const [id,label,action]of [['assembly-only','Nur Auswahl vollständig darstellen','only'],['assembly-load','Teil nachladen','load'],['assembly-all','Alles darstellen','all']]){actions[id]=()=>changeAssemblyDisplay(action);const button=document.createElement('button');button.dataset.action=id;button.textContent=label;button.onclick=()=>void safe(actions[id]);const menu=document.querySelector('.view-controls');if(menu)menu.append(button);}
updateAssemblyNotice();

function canSwitchWorkbench(){readyForFile();if(insertionBusy||$('modal').open||meshTools?.state()||tools?.state())throw Error('Bearbeitung zuerst abschließen oder abbrechen.');return true;}
function changedEasyDomain(){easyRepair?.invalidate();easyDomainRevision++;escape();isolation.end();updateIsolation();select(selection);ui?.refresh();updateState();view.fit();}
function setEasyDomain(kind){if(kind===easyDomain.get())return;if(workbenchUI.mode()!=='easy')throw Error('Den CAD-/Netz-Schalter im Easy-Tinker-Modus verwenden.');canSwitchWorkbench();if(easyDomain.set(kind))changedEasyDomain();}
function restrictEasyImport(id,kind){const control=$(id);for(const option of [...control.options])if(option.value!==kind)option.remove();control.value=kind;}
workbenchUI=createCadWorkbenchUI({storage,layoutUI,safe,t,fusionOptions:{getProject:project,getSelection:()=>selection,select},solidOptions:{view,getLanguage:()=>preferences.language,openSettings:()=>ui.settings.open(),isIdle:()=>{try{return canSwitchWorkbench();}catch{return false;}},executeCommand:command=>{if(command==='extrude'){readyForFile();return sketchUI.open(false,false);}if(command==='cut'){readyForFile();return sketchUI.openOnPart('cut');}if(actions[command])return actions[command]();throw Error('Unbekannter Solid-Befehl: '+command);}},canSwitch:canSwitchWorkbench,onModeChange:changedEasyDomain,getDomain:easyDomain.get,setDomain:setEasyDomain,domainCounts:()=>({cad:project().nodes.filter(node=>node.kind==='cad').length,mesh:project().nodes.filter(node=>node.kind==='mesh').length}),getCreationMode:creationDomain.get,getCreationKind:creationKind,setCreationMode:value=>{canSwitchWorkbench();if(layoutUI.isActive()||layoutUI.isSaving())throw Error('Bearbeitung zuerst abschließen oder abbrechen.');creationDomain.set(value);}});
function contextMenuIdle(){try{return canSwitchWorkbench();}catch{return false;}}
function contextApplyButton(){return [...document.querySelectorAll('.edge-tool-panel:not([hidden])')].flatMap(panel=>[...panel.querySelectorAll('[data-edge-apply],[data-modeling-apply],[data-split-apply],[data-extract-apply],#workplane-preview-apply,[data-lay-apply],[data-apply]')]).find(button=>!button.disabled&&button.getClientRects().length);}
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
contextMenuUI=createCadContextMenu({storage,view,getMode:()=>workbenchUI.mode(),getSelection,getRevision:()=>controller.revision(),select,getLanguage:()=>preferences.language,safe,toast,openSettings:()=>ui.settings.open(),getFunctions:functionPlugins.list,isIdle:contextMenuIdle,
 getContexts:()=>selection.flatMap(target=>{try{const c=context(target),n=c.node;return [{name:n.name,kind:n.kind,locked:c.locked||c.sourceGeometryReadonly,hidden:c.hidden,root:!target.path.length,solid:n.kind==='cad'?n.solid:n.meshRole!=='hole',sketch:n.recipe?.type==='sketch'||n.meshSource?.node?.type==='sketch'}];}catch{return [];}}),
 canRun:key=>{if(key==='cancel')return true;if(key==='apply-active')return !!contextApplyButton();if(key==='fit')return true;if(!contextMenuIdle())return false;const buttons=[...document.querySelectorAll('[data-action="'+key+'"]')];return !buttons.length||buttons.some(b=>!b.disabled);},runCommand:contextCommand});
easyRepair=createEasyMeshRepair({controller,isEnabled:()=>!!window.__cadReady&&activeEasyKind()==='mesh',isVisible:id=>view.allows(id)&&!isGeometryRef(project().nodes.find(n=>n.id===id)?.mesh),isIdle:()=>!busy&&!fileBusy&&!insertionBusy&&!$('modal').open&&!activePreview&&!alignment&&!magnetSession?.dragging&&!localStlTask&&!view.isEditing()&&!layoutUI.isActive()&&!layoutUI.isSaving()&&!drawingUI?.state()&&!projectParametersUI?.state()&&!modelingUI?.state()&&!advancedFreeCADUI?.state()&&!sketchUI?.state()&&!tools?.state()&&!meshTools?.state()&&!(inspectionUI?.state()||thicknessUI?.state())&&!meshExtras?.state()&&!workplaneUI?.state()&&!meshCopyUI?.state()&&!meshSelectionUI?.state()&&!meshSelectionUI?.isChecking()&&!meshInspectorUI?.state()&&!meshRepairUI?.state()&&!(meshReduceUI?.state()||meshRemeshUI?.state()||(meshSmoothUI?.state()||meshSculptUI?.state())||meshEraseFillUI?.state()||meshMakeSolidUI?.state()||(meshHollowUI?.state()||meshFeaturesUI?.state()))&&!meshHoleFillUI?.state()&&!controller.state().busy&&!controller.state().worker.running&&!controller.state().meshWorker.running,notify:toast,afterApply:()=>refreshTask});
new MutationObserver(()=>easyRepair?.schedule()).observe($('viewport'),{subtree:true,attributes:true,attributeFilter:['hidden']});$('modal').addEventListener('close',()=>easyRepair?.schedule());
const sourceEdit=document.createElement('button');sourceEdit.id='easy-edit-source';sourceEdit.textContent='Formparameter …';sourceEdit.hidden=true;sourceEdit.onclick=()=>safe(()=>{const node=selected({roots:true,editable:true})[0].node;return node.meshSource?.node?.type==='text'?meshExtras.open('text'):meshTools.open('sources');});$('inspector').append(sourceEdit);
async function start(){setPreferences(preferences,{persist:false});await layoutUI.ready();try{const recovered=await recovery.load(value=>controller.verify(value));if(recovered){recoveredProject=true;const state=recovered.workspace;delete recovered.workspace;assemblyOpening=true;assemblyDisplay.restore(state?.loadSet??null,recovered);if(assemblyDisplay.ids(recovered)!==null)controller.invalidateDisplayView();try{await controller.open(recovered,{label:'CAD-Autosicherung laden'});}finally{assemblyOpening=false;}await refreshTask;await restoreWorkspace(state);}}catch(error){toast('CAD-Autosicherung konnte nicht geladen werden; automatische Sicherung bleibt gesperrt: '+error.message);}await refreshTask;if(!nativeScene)await scheduleRefresh();cleanRevision=controller.revision();cleanWorkspaceSignature=workspaceSignature();if(preferences.autosave&&!recovery.packageMode()){if(await writeStartupRecovery({recovery,serialize:serializeWorkspace,version:project().version,onError:error=>{toast('Projekt ist geladen; Autosicherung konnte nicht geschrieben werden. Bitte das Projekt speichern: '+error.message);errorReporter.report(error);}}))autosavedRevision=controller.revision();}if(recovery.packageMode()){recoverySignature=controller.revision()+'|'+JSON.stringify(workspace());recoveryWritten=recoverySignature;}window.__cadReady=true;if(Object.keys(storage.info?.().unavailable??{}).length)toast('Einige gespeicherte Dateien konnten nicht geladen werden. Sie bleiben unverändert und schreibgeschützt; bitte den Datenordner prüfen.');easyRepair?.schedule();if(new URLSearchParams(location.search).has('test'))window.__cadTest={runLocalScript:runCadAIScript,sourceDisplayState:()=>({key:sourceDisplayKey,expected:sourceViewKey(),sceneRevision:nativeScene?.revision,revision:controller.revision(),canEdit:!busy&&nativeScene?.revision===controller.revision()&&(!selection.some(target=>target.path.length)||sourceDisplayKey===sourceViewKey())}),packFiles,programAssistant,assemblyDisplay,changeAssemblyDisplay,jointsUI,linkedContoursUI:modelingUI,workbenchUI,contextMenuUI,easyRepair,controller,view,inspectionUI,thicknessUI,marksView,aiUI,featureUI,showPreview,clearPreview,ui,tools,meshTools,meshExtras,meshCopyUI,meshSelectionUI,meshInspectorUI,meshRepairUI,meshReduceUI,meshRemeshUI,meshSmoothUI,meshSculptUI,meshEraseFillUI,meshMakeSolidUI,meshHollowUI,meshFeaturesUI,meshHoleFillUI,workplaneUI,sketchUI,modelingUI,advancedFreeCADUI,drawingUI,projectParametersUI,recovery,access,storage,layoutUI,actions,execute,mutate,refresh:scheduleRefresh,settled:async()=>{await refreshTask;while(controller.state().busy||controller.state().worker.running||controller.state().meshWorker.running)await new Promise(resolve=>setTimeout(resolve,20));await refreshTask;await alignmentTask;},selection:getSelection,select,getScene,getModel:()=>controller.snapshot(),snapshot:()=>controller.snapshot(),isolation,projectsUI,serialize:()=>controller.serialize(),resetProject:async()=>{const pending=actions.new();document.getElementById('project-change-discard')?.click();return pending;},serializeWorkspace,workspace,openProject,functionsUI,functionPlugins,activeProjectFile:()=>copy(activeProjectFile),addShape,addPlugin,group,ungroup,mirror,drop,centerSelection,duplicate,loadDemo,importFile,importDialog,workflowSettings,openFile,exportModel,save,download,changeParameter:ui.changeParameter,setMode,projectPoint:view.projectPoint,getHandles:()=>view.groups.handles.children.filter(handle=>handle.userData.corner&&!handle.userData.height).map(handle=>({kind:handle.userData.kind,axes:handle.userData.scaleAxes,corner:handle.userData.corner,point:handle.position.toArray(),target:handle.userData.target})),getHeightHandle:()=>{const h=view.groups.handles.children.find(h=>h.userData.height);return h?{corner:h.userData.corner,kind:h.userData.kind,axes:h.userData.scaleAxes,point:h.position.toArray(),target:h.userData.target}:null;},getLiftHandle:()=>{const handle=view.groups.handles.children.find(handle=>handle.userData.lift);return handle?{point:handle.position.toArray(),axis:handle.userData.axis,target:handle.userData.target}:null;},sectionState:()=>inspectionUI.sectionState()??tools.sectionState(),renderCacheState:view.cacheState,getSettings:()=>copy(preferences),getQuality:()=>quality.get(),setQuality,cancel:escape,undoDepth:()=>controller.state().undo,bridge:access.dispatch};}

start().catch(error=>{window.__cadError=error.message;console.error(error);$('status').textContent='CAD-Start fehlgeschlagen: '+error.message;toast(error.message);});



