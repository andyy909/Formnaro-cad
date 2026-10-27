import './style.css';
import './settings.css';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
import {OBJLoader} from 'three/addons/loaders/OBJLoader.js';
import {SVGLoader} from 'three/addons/loaders/SVGLoader.js';
import {FontLoader} from 'three/addons/loaders/FontLoader.js';
import {TextGeometry} from 'three/addons/geometries/TextGeometry.js';
import fontData from './font.json';
import boldFont from './fonts/helvetiker_bold.typeface.json';
import serifFont from './fonts/optimer_regular.typeface.json';
import {coloredParts,threeMF,gltf,svgProjection} from './exports.js';
import Module from 'manifold-3d/manifold';
import wasmUrl from 'virtual:cad-wasm';
import {createSceneTools,resizeAnchored} from './scene-tools.js';
import {setKernel,SHAPES,makeNode,localManifold,worldManifold,booleanManifold,groupNodes,meshData,normalizeMesh,matrixArray,stlBinary,objString,validNode,fromMesh,fitParameters as fitParametersSync} from './geometry.js';

import {createPrecisionTools,validRuler} from './precision-tools.js';
import {patternDialog} from './pattern-dialog.js';
import {SCHEMAS,GENERATORS,validParameters,scaledParameters} from './parameters.js';
import {createShapeInspector} from './shape-inspector.js';
import {frame,horizontalPlane,snapPoint,projectedBounds,dropToPlane,geometryKey,resolveReference,referenceOnSurface,validWorkplane,planeFromHit} from './coordinates.js';
import {defaultOrganization,flags,assign,repairAssignments,validateOrganization} from './organization.js';
import {createOrganizationUI} from './organization-ui.js';
import {createWorkplaneTools} from './workplane-tools.js';
import {migrateProject} from './project-data.js';
import {synchronizeHistory,adoptComputedHistory,featureContext} from './history.js';
import {parentMatrix,featureMatrix,localDelta,transformFeature} from './feature-transforms.js';
import {loadPreferences,validatePreferences} from './preferences.js';
import {loadPlugins,label} from './plugins.js';
import {createSettingsUI} from './settings-ui.js';
import {createLocalization} from './i18n.js';
import {createAutomationAccess} from './automation-access.js';
import {createAIUI} from './ai-ui.js';
import {aiContext,revisionOf} from './automation.js';
import {createMeasureTools} from './measure-tools.js';
import {createLibraryUI} from './library-ui.js';
import {createCalculations} from './calculations.js';
import {createFitPresets} from './fit-presets.js';
import {createEditTransaction} from './edit-transaction.js';
import {geometrySignature,colorSignature} from './render-data.js';
import {serializeFile,PROJECT_BYTES} from './file-data.js';
import {initCad} from './cad-kernel.js';
import {hasFinishing} from './cad-data.js';
import cadWasmUrl from 'replicad-opencascadejs/wasm?url';
import {createEdgeTools} from './edge-tools.js';
import {createFitTools,fitCopy} from './fit-tools.js';
import {createMagnetTools} from './magnet-tools.js';
import {createLayoutUI} from './layout-ui.js';
import {createProgramStorage} from './program-storage.js';

const $=id=>document.getElementById(id), clone=v=>structuredClone(v), DEG=Math.PI/180;
let storage;
try{storage=createProgramStorage(localStorage,window.offlinecadDesktop);}catch(e){
  window.__cadError=e.message;$('status').textContent='Start fehlgeschlagen: '+e.message;
  const error=document.createElement('div');error.className='portable-start-error';const title=document.createElement('h2'),message=document.createElement('p');title.textContent='Portable Daten konnten nicht geladen werden';message.textContent=e.message;error.append(title,message);document.body.append(error);throw e;
}
let kernel, nodes=[],selected=new Set(),bed=[200,200],planeZ=0,undoStack=[],redoStack=[],clipboard=[],geometryCache=new Map(),mode='translate',dirty=false,lastDuplicate=null,autoTimer;
let workplane=horizontalPlane(),coordinateMode='plane',organization=defaultOrganization(),historySelection=null;
let preferences=loadPreferences(storage),plugins=loadPlugins(storage);
let fitCollect=null;const fitPending=new Set(),renderData=new Map(),colorData=new Map(),lastGeometry=new Map();
function fitParameters(n){if(fitCollect)fitCollect.add(n.id);else fitParametersSync(n);}
const localization=createLocalization(()=>preferences.language),t=localization.t;
const fonts={regular:new FontLoader().parse(fontData),bold:new FontLoader().parse(boldFont),serif:new FontLoader().parse(serifFont)},font=fonts.regular, host=$('canvas-host'), viewport=$('viewport');
THREE.Object3D.DEFAULT_UP.set(0,0,1);
const scene=new THREE.Scene();scene.background=new THREE.Color('#eef2f6');
const perspective=new THREE.PerspectiveCamera(42,1,.1,50000),ortho=new THREE.OrthographicCamera(-150,150,150,-150,.1,50000);
let camera=perspective;camera.position.set(245,-310,265);
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(host.clientWidth,host.clientHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;host.appendChild(renderer.domElement);
const orbit=new OrbitControls(camera,renderer.domElement);orbit.enableDamping=true;orbit.target.set(0,0,10);orbit.mouseButtons={LEFT:null,MIDDLE:THREE.MOUSE.PAN,RIGHT:THREE.MOUSE.ROTATE};orbit.maxDistance=10000;
scene.add(new THREE.HemisphereLight(0xffffff,0xaab6c6,2.5));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(-80,-160,300);scene.add(light);
const meshGroup=new THREE.Group(),outlineGroup=new THREE.Group(),bedGroup=new THREE.Group(),handleGroup=new THREE.Group();scene.add(meshGroup,outlineGroup,bedGroup,handleGroup);
const pivot=new THREE.Object3D();scene.add(pivot);
const gizmo=new TransformControls(camera,renderer.domElement);gizmo.setSize(.85);gizmo.setSpace('world');scene.add(gizmo.getHelper());
const ray=new THREE.Raycaster(),mouse=new THREE.Vector2();let drag=null,gizmoStart=null,clickStart=null;
const scratchPlane=new THREE.Plane(new THREE.Vector3(0,0,1),0);
const sceneTools=createSceneTools({scene,viewport,getCamera:()=>camera,getNodes:()=>[...nodes,...(historySelection?inspectorNodes():[])],getSelection:inspectorNodes,bounds:toolBounds,getFrame:toolFrame,isLocked:inspectorLocked,getMatrix:controlMatrix,getAvoidPoints:()=>handleGroup.children.filter(h=>!h.userData.hitTarget).map(h=>h.position.clone()),mutate:editMutate,safe,updateSelection});
const shapeInspector=createShapeInspector({getSelection:inspectorNodes,mutate:editMutate,safe,fitParameters,isLocked:inspectorLocked});
const precisionTools=createPrecisionTools({scene,viewport,getCamera:()=>camera,getSelection:()=>selectedNodes(),bounds:toolBounds,getFrame:toolFrame,isLocked,mutate,safe,updateSelection,modal});
const workplaneTools=createWorkplaneTools({scene,getNodes:()=>nodes,commit:p=>mutate(()=>setWorkplane(p)),updateSelection});
const organizationUI=createOrganizationUI({getState:()=>organization,getNodes:()=>nodes,getSelection:()=>selectedNodes(),select,mutate,safe,modal,chooseReference:id=>sceneTools.chooseReference(id),reference:()=>sceneTools.reference(),toast,editFeature,historyState:()=>historySelection});
const settingsUI=createSettingsUI({getSettings:()=>clone(preferences),setSettings,getPlugins:()=>clone(plugins),setPlugins,validatePlugin:manifest=>manifest.shapes.forEach(shape=>buildPluginShape(shape)),modal,safe,download,mountAI:root=>aiUI.mountSettings(root),mountLayout:root=>layoutUI.mountSettings(root),portable:!!storage.info,openDataFolder:()=>window.offlinecadDesktop.openProgramDataFolder()});
const measureTools=createMeasureTools({scene,viewport,getCamera:()=>camera,getNodes:()=>nodes,isLocked,mutate,safe,toast,fmt});
const calculations=createCalculations({viewport,toast});
const edits=createEditTransaction({
 capture:()=>({project:snapshot(),selection:[...selected],history:clone(historySelection),undo:[...undoStack],redo:[...redoStack],dirty}),
 compute:(data,base,id,version)=>calculations.run({job:'edit',...data,baseline:base.project.nodes,revision:revisionOf(base.project)+':'+id+':'+version},'Modellberechnung',{silent:true}),
 accept:r=>{seedRenderData(r.renders);nodes=r.nodes;adoptComputedHistory(nodes);renderNodes(!!gizmoStart);},
 commit:(base,result)=>{fitPending.clear();if(result&&JSON.stringify(base.project)!==JSON.stringify(snapshot())){undoStack=[...base.undo,base.project].slice(-60);redoStack=[];changed();}renderNodes();pruneRenderData();},
 rollback:base=>{fitPending.clear();cancellingFeature=true;drag=null;gizmoStart=null;gizmo.dragging=false;gizmo.axis=null;orbit.enabled=true;historySelection=clone(base.history);restore(base.project);selected=new Set(base.selection);undoStack=base.undo;redoStack=base.redo;dirty=base.dirty;refreshSaveState();updateSelection();cancellingFeature=false;pruneRenderData();},
 abort:()=>calculations.cancel()
});
function confirmedSnapshot(){return clone(edits.baseline()?.project||snapshot());}
function seedRenderData(renders){for(const r of renders||[]){renderData.set(r.key,r.data);if(r.parts)colorData.set(r.colorKey,r.parts);}}
function pruneRenderData(){if(edits.isActive())return;const keys=new Set(),colors=new Set();function visit(n){keys.add(geometrySignature(n));if(n.multicolor&&n.children)colors.add(colorSignature(n));for(const c of n.children||[])visit(c);}nodes.forEach(visit);for(const id of lastGeometry.keys())if(!nodes.some(n=>n.id===id)&&!historyGhost.children.some(m=>m.userData.id===id))lastGeometry.delete(id);for(const k of renderData.keys())if(!keys.has(k))renderData.delete(k);for(const k of colorData.keys())if(!colors.has(k))colorData.delete(k);}
function editMutate(fn){
 if(!edits.isActive()&&calculations.isBusy())throw Error('Zuerst die laufende Berechnung abschließen oder abbrechen.');
 const existing=edits.isActive(),before=JSON.stringify(snapshot());edits.begin();fitCollect=fitPending;
 try{fn();if(nodes.length>500)throw Error('Maximal 500 Teile.');repairAssignments(nodes,organization);validateOrganization(organization,nodes);}
 catch(e){edits.cancel();throw e;}finally{fitCollect=null;}
 if(JSON.stringify(snapshot())===before){if(!existing)return edits.finish();return;}
 renderNodes(!!gizmoStart);
 return edits.submit({nodes,fitIds:[...fitPending]},{finish:!(drag||gizmoStart)});
}
function queueDrag(){renderNodes(!!gizmoStart);void edits.submit({nodes,fitIds:[...fitPending]});}
function finishEdit(){return safe(()=>edits.finish());}

const libraryUI=createLibraryUI({storage,modal,safe,toast,download,getSelection:needSelection,addParts:addTemplateParts,validateParts:parts=>{synchronizeHistory(parts);for(const n of parts){const m=localManifold(n);m.delete();}}});
const fitPresets=createFitPresets({storage,modal,safe,getNode:needInspector,mutate:editMutate,fitParameters,toast});
const ensureCad=()=>initCad(new URL(cadWasmUrl,location.href).href);
const edgePreviewGroup=new THREE.Group();scene.add(edgePreviewGroup);let edgePreviewSource=null;
function clearEdgePreview(){disposeChildren(edgePreviewGroup,false);for(const mesh of meshGroup.children)if(mesh.userData.id===edgePreviewSource)mesh.visible=true;edgePreviewSource=null;}
function showEdgePreview(node,sourceId){clearEdgePreview();const mesh=new THREE.Mesh(geomFor(node),new THREE.MeshStandardMaterial({color:'#eea33d',roughness:.58,side:THREE.DoubleSide}));applyMeshTransform(mesh,node);edgePreviewGroup.add(mesh);edgePreviewSource=sourceId;for(const original of meshGroup.children)if(original.userData.id===sourceId)original.visible=false;}
function edgeNode(){if(historySelection)throw Error('Für die Kantenbearbeitung zuerst „Zur fertigen Gruppe“ wählen.');if(sectionPlane)throw Error('Für die Kantenauswahl zuerst die Schnittansicht ausschalten.');const list=selectedNodes();if(list.length!==1||isLocked(list[0]))throw Error('Genau ein entsperrtes Teil auswählen.');return list[0];}
const edgeTools=createEdgeTools({getLanguage:()=>preferences.language,scene,viewport,canvas:renderer.domElement,getCamera:()=>camera,getNode:edgeNode,getRevision:()=>revisionOf(snapshot()),safe,toast,
 run:(data,label)=>calculations.run(data,label),cancelRun:()=>{if(calculations.state()?.job?.startsWith('cad-'))calculations.cancel();},showPreview:showEdgePreview,clearPreview:clearEdgePreview,
 setPicking:active=>{if(active){workplaneTools.escape();sceneTools.escape();precisionTools.escape();measureTools.escape();gizmo.detach();}handleGroup.visible=!active;outlineGroup.visible=!active;if(!active)updateSelection();},
 commit:async(result,id,revision)=>{await ensureCad();if(!edgeTools.isActive()){const e=Error('Kantenbearbeitung abgebrochen.');e.name='AbortError';throw e;}if(revisionOf(snapshot())!==revision)throw Error('Modell geändert. Kanten erneut auswählen.');mutate(()=>{nodes=nodes.map(n=>n.id===id?result.node:n);adoptComputedHistory(nodes);seedRenderData(result.renders);selected=new Set([result.node.id]);historySelection=null;});}
});
const magnetPreviewGroup=new THREE.Group();scene.add(magnetPreviewGroup);let magnetPreviewSource=null;
function clearMagnetPreview(){disposeChildren(magnetPreviewGroup,false);for(const mesh of meshGroup.children)if(mesh.userData.id===magnetPreviewSource)mesh.visible=true;magnetPreviewSource=null;}
function showMagnetPreview(node){let mesh=magnetPreviewGroup.children[0];if(!mesh||magnetPreviewSource!==node.id){clearMagnetPreview();mesh=new THREE.Mesh(geomFor(node),new THREE.MeshStandardMaterial({color:'#ffae32',roughness:.58,transparent:true,opacity:.7,side:THREE.DoubleSide}));magnetPreviewGroup.add(mesh);magnetPreviewSource=node.id;for(const original of meshGroup.children)if(original.userData.id===node.id)original.visible=false;}applyMeshTransform(mesh,node);}
function magnetNode(){if(historySelection)throw Error('Für den Magnet zuerst „Zur fertigen Gruppe“ wählen.');const list=selectedNodes();if(list.length!==1||isLocked(list[0]))throw Error('Genau ein entsperrtes Teil auswählen.');if(edits.isActive()||calculations.isBusy()||drag||gizmoStart||aiPreview)throw Error('Bearbeitung zuerst abschließen oder abbrechen.');return list[0];}
const magnetTools=createMagnetTools({canvas:renderer.domElement,button:$('magnet-mode'),status:$('status'),getNode:magnetNode,getRevision:()=>revisionOf(snapshot()),safe,toast,
 pickObject:e=>{cast(e);return modelHit()?.object.userData.id;},findTarget:(e,id)=>surfacePlacement(e,new Set([id])),
 makeCandidate:(original,target)=>{const n={...original},q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...n.rot.map(v=>v*DEG),'ZYX')),normal=frame(target.plane).axes[2],up=new THREE.Vector3(0,0,1).applyQuaternion(q);q.premultiply(new THREE.Quaternion().setFromUnitVectors(up,normal));n.rot=new THREE.Euler().setFromQuaternion(q,'ZYX').toArray().slice(0,3).map(v=>v/DEG);n.pos=target.point.toArray();dropToPlane(n,geomFor,target.plane);return n;},showPreview:showMagnetPreview,clearPreview:clearMagnetPreview,
 setActive:active=>{if(active){edgeTools.close();workplaneTools.escape();sceneTools.escape();precisionTools.escape();measureTools.escape();sceneTools.hideDimensions();}updateSelection();},
 commit:(candidate,id,revision)=>{if(revisionOf(snapshot())!==revision)throw Error('Modell geändert. Magnet erneut aktivieren.');const node=nodes.find(n=>n.id===id);if(!node||isLocked(node))throw Error('Genau ein entsperrtes Teil auswählen.');return editMutate(()=>{node.pos=[...candidate.pos];node.rot=[...candidate.rot];});}
});
function fitParentScale(){const context=featureContext(nodes,historySelection);if(!context||context.chain.length<2)return [1,1,1];const matrix=parentMatrix(context);return [0,1,2].map(i=>new THREE.Vector3().setFromMatrixColumn(matrix,i).length());}
const fitTools=createFitTools({getLanguage:()=>preferences.language,storage,modal,safe,toast,getNode:()=>{if(inspectorNodes().length!==1)throw Error('Ein Teil oder eine Bohrungsquelle auswählen.');return needInspector();},getScale:fitParentScale,
 apply:size=>{const node=needInspector();return editMutate(()=>node.size=size);},
 createHole:options=>{const node=needInspector(),context=featureContext(nodes,historySelection),hole=fitCopy(node,options);if(context?.chain.length>1){const parent=context.chain.at(-2);return editMutate(()=>{parent.children.push(hole);historySelection={rootId:context.root.id,path:[...historySelection.path.slice(0,-1),hole.id]};});}mutate(()=>{nodes.push(hole);selected=new Set([hole.id]);historySelection=null;});}
});
const layoutUI=createLayoutUI({storage,safe,toast,t,isBusy:()=>!!(drag||gizmoStart||gizmo.dragging||edits.isActive()||calculations.isBusy()||aiPreview),prepare:()=>{magnetTools.close();edgeTools.close();workplaneTools.escape();sceneTools.escape();precisionTools.escape();measureTools.escape();}});
const systemTheme=matchMedia('(prefers-color-scheme: dark)');systemTheme.addEventListener('change',()=>applySettings());
function setSettings(value){const next=validatePreferences(value);storage.setItem('offlinecad-settings-v1',JSON.stringify(next));preferences=next;applySettings();renderLibrary();updateSelection();refreshSaveState();}
function applySettings(){
  const dark=preferences.theme==='dark'||preferences.theme==='system'&&systemTheme.matches;document.documentElement.dataset.theme=dark?'dark':'light';scene.background.set(dark?'#172330':'#eef2f6');orbit.zoomSpeed=preferences.zoomSpeed;$('snap').value=String(preferences.snap);gizmo.setRotationSnap(preferences.rotationSnap?preferences.rotationSnap*DEG:null);bedGroup.visible=preferences.gridVisible;if(!preferences.autosave)clearTimeout(autoTimer);localization.refresh();
}
function setPlugins(next){storage.setItem('offlinecad-plugins-v1',JSON.stringify(next));plugins=clone(next);renderLibrary();}
function buildPluginShape(shape){
  const parts=shape.nodes.map(spec=>{const n=makeNode(spec.type);n.name=t(n.name);if(spec.params)n.params={...n.params,...spec.params};n.segments=spec.segments||preferences.segments;fitParameters(n);for(const key of ['size','rot','mirror','solid','color'])if(spec[key]!==undefined)n[key]=clone(spec[key]);n.pos=spec.pos?[...spec.pos]:[0,0,n.size[2]/2];if(!validNode(n))throw new Error('Eine Formvorlage enthält ungültige Geometrieparameter.');const m=localManifold(n);m.delete();return n;});
  const n=parts.length===1?parts[0]:groupNodes(parts);n.name=label(shape.name,preferences.language);return n;
}
function addPluginShape(id,shapeId,position,plane){const pack=plugins.find(p=>p.enabled&&p.manifest.id===id),shape=pack?.manifest.shapes.find(s=>s.id===shapeId);if(!shape)throw new Error('Ungültige oder doppelte Formvorlage im Paket.');const n=buildPluginShape(shape);mutate(()=>{placeOnPlane(n,position,plane);nodes.push(n);selected=new Set([n.id]);});}
const aiPreviewGroup=new THREE.Group();scene.add(aiPreviewGroup);let aiPreview=null;
const aiPreviewBanner=document.createElement('div');aiPreviewBanner.className='ai-preview-banner';aiPreviewBanner.hidden=true;aiPreviewBanner.innerHTML='<span>KI-Vorschau · Original unverändert</span><button id="ai-canvas-apply" class="primary">Übernehmen</button><button id="ai-canvas-discard">Verwerfen</button>';viewport.append(aiPreviewBanner);
function clearAIPreview(){if(!aiPreview)return;aiPreview=null;disposeChildren(aiPreviewGroup,false);meshGroup.visible=true;sectionGroup.visible=true;outlineGroup.visible=true;historyGhost.visible=true;handleGroup.visible=true;aiPreviewBanner.hidden=true;$('empty-hint').style.display=nodes.some(n=>!isHidden(n))?'none':'block';updateSelection();}
function showAIPreview(result){clearAIPreview();const project=aiAccess.getPreview(result.previewId);if(!project)throw new Error('Preview missing or expired.');aiPreview=result;$('empty-hint').style.display='none';meshGroup.visible=false;sectionGroup.visible=false;outlineGroup.visible=false;historyGhost.visible=false;handleGroup.visible=false;gizmo.detach();for(const n of project.nodes.filter(n=>!flags(n,project).hidden)){const mesh=new THREE.Mesh(geomFor(n),new THREE.MeshStandardMaterial({color:n.solid?n.color:'#83b6c8',roughness:.58,metalness:.03,transparent:!n.solid,opacity:n.solid?1:.35,side:THREE.DoubleSide,flatShading:!['sphere','halfSphere','torus'].includes(n.type)}));applyMeshTransform(mesh,n);aiPreviewGroup.add(mesh);}aiPreviewBanner.hidden=false;fit(project.nodes);}
function commitAutomation(result){if(drag||gizmoStart)throw new Error('Finish the current handle drag first.');clearAIPreview();mutate(()=>{const s=migrateProject(result.project);nodes=clone(s.nodes);bed=[...s.bed];workplane=clone(s.workplane);planeZ=s.planeZ;coordinateMode=s.coordinateMode;organization={layers:clone(s.layers),folders:clone(s.folders),activeLayerId:s.activeLayerId,activeFolderId:s.activeFolderId};precisionTools.restore(s.ruler);historySelection=null;selected=new Set(result.selection||[]);});if(result.warnings?.length)toast(result.warnings.join(' '));}
const aiAccess=createAutomationAccess({getProject:confirmedSnapshot,getSelection:()=>historySelection?[clone(historySelection)]:[...selected],commit:commitAutomation,getSegments:()=>preferences.segments,textMesh,screenshot:()=>renderer.domElement.toDataURL('image/png'),isBusy:()=>magnetTools.isDragging()||!!(drag||gizmoStart)||edits.isActive()||calculations.isBusy()});
const aiUI=createAIUI({access:aiAccess,modal,download,language:()=>preferences.language,showPreview:showAIPreview,clearPreview:clearAIPreview,settingsOpen:()=>{settingsUI.open();document.querySelector('[data-settings-tab="ai"]').click();}});
$('ai-open').onclick=()=>{if(drag||gizmoStart)return toast('Einstellungen können während einer Griffbewegung nicht geöffnet werden.');aiUI.open();};
$('ai-canvas-apply').onclick=()=>aiUI.apply();$('ai-canvas-discard').onclick=()=>aiUI.discard();
window.offlinecadAutomation=Object.freeze({context:aiContext,scene:aiAccess.scene,preview:aiAccess.preview,apply:aiAccess.apply,dispatch:aiAccess.dispatch});
window.offlinecadDesktop?.onAutomation((method,args)=>{if(!window.__cadReady)throw new Error('CAD kernel is not ready.');return aiAccess.dispatch(method,args);});
function helpEnglish(){modal('How Formnaro works',`<p>Click a shape in the library or drag it onto the workplane. All units are millimetres; calculations and storage are offline.</p><p>When dragging from the shape library, new shapes sit on and align to the solid face under the drop point. Dropping over empty space or clicking a library shape uses the workplane. Moving existing shapes does not automatically place them on surfaces.</p><p>Magnet: select one unlocked finished part, enable Magnet at the top right and drag it onto another solid face. Release to apply the gold preview; Escape discards it. The mode ends after placement, which counts as one Undo step.</p><table><tr><td>Select / multi-select</td><td>Left click / Shift+click</td></tr><tr><td>Orbit / pan / zoom</td><td>Right drag / middle drag / mouse wheel</td></tr><tr><td>Move / scale / rotate</td><td>T / S / R</td></tr><tr><td>Group / ungroup</td><td>Ctrl+G / Ctrl+Shift+G</td></tr><tr><td>Undo / redo / save</td><td>Ctrl+Z / Ctrl+Y / Ctrl+S</td></tr><tr><td>Workplane / align / drop</td><td>W / L / D</td></tr></table><p><b>Group editing:</b> Expand a group in the object tree and click a shape or hole. Use its orange preview and on-canvas handles to move, rotate or scale it. The finished part updates while dragging. Click a white corner for editable dimensions. Rotation and scaling use the source's local axes before group scaling. Move uses workplane/world axes. Escape or Cancel restores an active edit; “Back to finished group” ends source editing.</p><p><b>Parameters:</b> Use the right panel for fillets, chamfers, gear teeth, thread pitch and other native shape settings. Group operations and suppressed steps remain editable in the history panel.</p><p><b>Settings:</b> The gear icon opens language, light/dark/system theme, snapping, handle size, new-shape quality, zoom, autosave and local shape plugins. Settings, personal templates, favorites, shape packs, fit presets and autosave are retained in the Daten folder next to Formnaro.exe. Copy Daten and Layouts together with the portable program to another PC. Windows-encrypted API keys need to be entered again on that PC.</p><p><b>Text fields:</b> Right-click text or dimension fields for Cut, Copy, Paste, Undo, Redo and Select all. Selected help text can also be copied.</p><p><b>Custom layout:</b> Settings → Interface → Arrange interface opens the layout editor. Drag buttons to the insertion marker in either top row; use the labeled grips to dock the library, properties and tool groups. Enter an optional name in the editor to create a saved layout. Settings → Interface lets you load, update, rename or delete named layouts. The current arrangement and all saved layouts are stored in Layouts/layouts.json next to Formnaro.exe; copy the Layouts folder when moving the portable program to another PC. Cancel or Escape restores the previous arrangement. Arrow keys move a focused handle; Ctrl+arrow moves a button between the top rows.</p><p><b>Plugins:</b> Load JSON/.ocplugin shape packs in Settings → Plugins. They appear in the shape library. Existing models retain their shapes if a pack is disabled or removed.</p><p><b>AI workshop:</b> Use ✦ AI to describe a new part or edit existing group sources. Settings → AI / API accepts your provider base URL, model ID and key. Each request includes the current model and tool context. Validate the proposal, view it on the canvas, then apply it as one Undo step. Local JSON commands and the external local API/MCP work without a cloud key. Cloud requests transmit model data to your configured provider.</p><p><b>Projects:</b> Save .ocad to keep sources and history. STL/OBJ export the finished geometry; 3MF keeps separate coloured parts. GLTF preserves colours and opacity, and SVG exports an XY outline. Import closed STL/OBJ meshes or extruded SVG contours. Two-point measurement, personal templates with simple dimension formulas, notes, section view and model inspection are available. Use Edges to select edges, preview a fillet or chamfer and apply it as one Undo step. Fit assistance changes local dimensions with a per-side clearance. STEP/STP import and STEP export are available; mesh parts stay faceted. Sketches, general formula constraints and moving assemblies are not included.</p>`);}
function isHidden(n){return flags(n,organization).hidden;}
function isLocked(n){return flags(n,organization).locked;}
const historyGhost=new THREE.Group();scene.add(historyGhost);
const historyPanel=document.createElement('div');historyPanel.id='history-panel';historyPanel.hidden=true;
historyPanel.innerHTML='<div class="section-title">Modellhistorie</div><p id="history-path"></p><button id="history-done">Zur fertigen Gruppe</button><p id="history-note" class="small-note"></p><label id="history-operation-row">Gruppenoperation<select id="history-operation"><option value="union">Vereinigen und Löcher abziehen</option><option value="intersection">Schnittmenge und Löcher abziehen</option></select></label><label id="history-suppress-row" class="check-line"><input id="history-suppress" type="checkbox"> Diesen Schritt aussetzen</label>';
$('inspector').before(historyPanel);
$('history-done').onclick=()=>{historySelection=null;updateSelection();};
$('history-operation').onchange=()=>safe(()=>{const n=needInspector();return editMutate(()=>n.operation=$('history-operation').value);});
$('history-suppress').onchange=()=>safe(()=>{const n=needInspector();return editMutate(()=>n.suppressed=$('history-suppress').checked);});
function inspectorNodes(){const context=featureContext(nodes,historySelection);return context?[context.node]:selectedNodes();}
function inspectorLocked(n){const context=featureContext(nodes,historySelection);return context?isLocked(context.root)||context.chain.some(c=>c.locked)||context.chain.slice(0,-1).some(c=>!c.operation):isLocked(n);}
function needInspector(){const n=inspectorNodes()[0];if(!n||inspectorLocked(n))throw new Error('Eine entsperrte Form mit gültiger Modellhistorie auswählen.');return n;}
function controlMatrix(node){const context=featureContext(nodes,historySelection);return context?.node===node?featureMatrix(context):new THREE.Matrix4().fromArray(matrixArray(node));}
function captureFeature(){const context=featureContext(nodes,historySelection);return {selection:clone(historySelection),root:clone(context.root),original:clone(context.node),parent:parentMatrix(context),matrix:featureMatrix(context),project:snapshot(),previousUndo:[...undoStack],previousRedo:redoStack,previousDirty:dirty,reported:false};}
let cancellingFeature=false;
function cancelFeatureDrag(){if(!edits.isActive()){const had=!!(drag||gizmoStart);drag=null;gizmoStart=null;orbit.enabled=true;$('selection-marquee').style.display='none';return had;}edits.cancel();toast('Bearbeitung verworfen. Anfangszustand wiederhergestellt.');return true;}
function previewFeature(transaction,change){
 const index=nodes.findIndex(n=>n.id===transaction.selection.rootId);if(index<0)return false;
 nodes[index]=clone(transaction.root);historySelection=clone(transaction.selection);
 try{change(featureContext(nodes,historySelection).node);queueDrag();return true;}
 catch(e){edits.cancel();toast(e.message);return false;}
}
function moveFeatureDrag(e){
  const d=drag,t=d.feature;if(!d.moved){if(Math.hypot(e.clientX-d.startX,e.clientY-d.startY)<4)return;edits.begin();d.moved=true;}
  cast(e);
  if(d.kind==='featureMove'){
    scratchPlane.setFromNormalAndCoplanarPoint(frame(workplane).axes[2],d.planeAnchor);const point=ray.ray.intersectPlane(scratchPlane,new THREE.Vector3());if(!point||!d.start)return;
    const world=new THREE.Vector3().setFromMatrixPosition(t.matrix).add(point.clone().sub(d.start)),snapped=snapPoint(world,workplane,Number($('snap').value));
    previewFeature(t,n=>n.pos=new THREE.Vector3(...t.original.pos).add(localDelta(snapped.sub(new THREE.Vector3().setFromMatrixPosition(t.matrix)),t.parent)).toArray());return;
  }
  const o=t.original,sizes=[...o.size],localMatrix=new THREE.Matrix4().fromArray(matrixArray(o)),localAxes=[0,1,2].map(i=>new THREE.Vector3().setFromMatrixColumn(localMatrix,i).normalize());
  if(d.kind==='size'){
    const point=ray.ray.intersectPlane(d.localPlane,new THREE.Vector3());if(!point||!d.start)return;const delta=localDelta(point.sub(d.start),t.parent);
    for(let i=0;i<2;i++)sizes[i]=Math.max(.1,snap(o.size[i]+delta.dot(localAxes[i])*d.corner[i]));
    if(e.shiftKey||$('proportions').checked){const ratio=sizes[0]/o.size[0];for(let i=0;i<3;i++)sizes[i]=o.size[i]*ratio;}
  }else if(d.kind==='sizeHeight'){
    const factor=new THREE.Vector3().setFromMatrixColumn(t.matrix,2).length()/o.size[2];sizes[2]=Math.max(.1,snap(o.size[2]+(d.startY-e.clientY)*handleWorldSize(new THREE.Vector3().setFromMatrixPosition(t.matrix),1)/factor));
  }
  if(d.kind==='lift'){
    const delta=frame(workplane).axes[2].multiplyScalar(snap((d.startY-e.clientY)*handleWorldSize(new THREE.Vector3().setFromMatrixPosition(t.matrix),1)));
    previewFeature(t,n=>n.pos=new THREE.Vector3(...o.pos).add(localDelta(delta,t.parent)).toArray());
  }else previewFeature(t,n=>resizeAnchored(n,sizes,d.corner));
}
function editFeature(rootId,path=[]){const context=featureContext(nodes,{rootId,path});if(!context||isHidden(context.root))return;sceneTools.escape();sceneTools.hideDimensions();precisionTools.escape();workplaneTools.escape();selected=new Set([rootId]);historySelection={rootId,path:[...path]};updateSelection();}
function refreshHistory(){
  disposeChildren(historyGhost,false);const context=featureContext(nodes,historySelection);historyPanel.hidden=!context;if(!context)return;
  const {node,chain}=context,locked=inspectorLocked(node);$('history-path').textContent=chain.map(c=>c.name).join(' › ');
  $('history-note').textContent=locked?'Diese Form ist gesperrt oder ihre alte Gruppenoperation ist nicht überprüfbar.':chain.length>1?'Lokale Maße vor der Gruppenskalierung. Änderungen aktualisieren das fertige Teil.':'Eine Form oder Bohrung links im Baum anklicken.';historyPanel.title='Maße und XYZ-Position gelten im lokalen System der übergeordneten Gruppe vor deren Skalierung. Orange zeigt die Ausgangsform. Verschieben, Drehen und Größe oben rechts wählen und die Griffe auf der Fläche ziehen.';
  $('history-operation-row').hidden=!node.operation;$('history-operation').value=node.operation||'union';$('history-operation').disabled=locked;
  $('history-suppress-row').hidden=chain.length===1;$('history-suppress').checked=!!node.suppressed;$('history-suppress').disabled=locked;
  if(chain.length<2)return;
  const matrix=new THREE.Matrix4();for(const parent of chain.slice(0,-1))matrix.multiply(new THREE.Matrix4().fromArray(matrixArray({...parent,size:parent.size.map((v,i)=>v/parent.baseSize[i])})));
  matrix.multiply(new THREE.Matrix4().fromArray(matrixArray(node)));
  const ghost=new THREE.Mesh(geomFor(node),new THREE.MeshBasicMaterial({color:node.solid?'#ffae42':'#f29528',wireframe:true,transparent:true,opacity:.65,depthTest:false,depthWrite:false}));ghost.matrixAutoUpdate=false;ghost.matrix.copy(matrix);ghost.renderOrder=18;historyGhost.add(ghost);
}
function toolFrame(){return coordinateMode==='plane'?workplane:horizontalPlane();}
function toolBounds(list=selectedNodes()){return projectedBounds(list,geomFor,toolFrame());}
function setWorkplane(p){if(!validWorkplane(p))throw new Error('Ungültige Arbeitsebene: Position liegt außerhalb des Arbeitsbereichs.');const ruler=precisionTools.snapshot();if(ruler&&coordinateMode==='plane'){ruler.origin=frame(p).toLocal(frame(workplane).toWorld(new THREE.Vector3(...ruler.origin))).toArray();precisionTools.restore(ruler);}workplane=p;planeZ=p.origin[2];syncWorkspace();}
function syncAttachedPlane(){const reference=workplane.reference;if(!reference)return;const node=nodes.find(n=>n.id===reference.objectId);if(!node){workplane.reference=null;toast('Bezugsobjekt entfernt: Arbeitsebene erneut auf eine Fläche setzen.');return;}const key=geometryKey(node);if(key!==reference.geometryKey){if(!referenceOnSurface(reference,geomFor(node))){workplane.reference=null;toast('Bezugsfläche geändert: Arbeitsebene erneut auf eine Fläche setzen.');return;}reference.geometryKey=key;}workplane=resolveReference(workplane,node);planeZ=workplane.origin[2];}
function resetWorkspace(){workplane=horizontalPlane();planeZ=0;coordinateMode='plane';organization=defaultOrganization();precisionTools.restore(null);}
function toast(message){$('toast').textContent=message;$('toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').style.display='none',6000);}
function safe(fn){try{const result=fn();if(result?.catch)return result.catch(e=>{if(e.name!=='AbortError')console.error(e);toast(e.message);});return result;}catch(e){if(e.name!=='AbortError')console.error(e);toast(e.message||'Die Operation konnte nicht ausgeführt werden.');}}
function refreshSaveState(){ $('save-state').textContent=!preferences.autosave?'Lokal · Autosicherung ausgeschaltet':dirty?'Lokal automatisch gesichert · Datei noch nicht gespeichert':'Lokal · ohne Cloud';}
function snapshot(){return {version:4,nodes:clone(nodes),bed:[...bed],planeZ,workplane:clone(workplane),coordinateMode,...clone(organization),ruler:precisionTools.snapshot(),name:$('project-name').value.slice(0,200)};}
function remember(){undoStack.push(snapshot());if(undoStack.length>60)undoStack.shift();redoStack=[];dirty=true;}
function changed(){clearAIPreview();edgeTools.revisionChanged();magnetTools.revisionChanged();updateInspection();dirty=true;refreshSaveState();clearTimeout(autoTimer);if(!preferences.autosave)return;autoTimer=setTimeout(()=>{try{storage.setItem('offlinecad-autosave-v4',JSON.stringify(confirmedSnapshot()));}catch{ $('save-state').textContent='Autosicherung nicht gespeichert · bitte Projektdatei speichern';}},500);}
function restore(input){workplaneTools.escape();sceneTools.escape();const s=migrateProject(input);nodes=clone(s.nodes);adoptComputedHistory(nodes);if(!featureContext(nodes,historySelection))historySelection=null;bed=s.bed||[200,200];workplane=s.workplane;coordinateMode=s.coordinateMode;planeZ=workplane.origin[2];organization={layers:s.layers,folders:s.folders,activeLayerId:s.activeLayerId,activeFolderId:s.activeFolderId};$('project-name').value=s.name||'Unbenanntes Modell';selected.clear();if(historySelection)selected.add(historySelection.rootId);for(const geo of geometryCache.values())geo.dispose();geometryCache.clear();lastGeometry.clear();precisionTools.restore(s.ruler);syncWorkspace();renderNodes();changed();}
function mutate(fn){if(edits.isActive())throw Error('Bearbeitung zuerst abschließen oder abbrechen.');const previousUndo=[...undoStack],previousRedo=redoStack,previousDirty=dirty,previousHistory=clone(historySelection);remember();const oldSelection=new Set(selected);try{fn();if(nodes.length>500)throw new Error('Diese Version unterstützt maximal 500 Objekte je Projekt.');synchronizeHistory(nodes);repairAssignments(nodes,organization);validateOrganization(organization,nodes);renderNodes();changed();}catch(e){const old=undoStack.pop();restore(old);undoStack=previousUndo;historySelection=previousHistory;selected=oldSelection;redoStack=previousRedo;dirty=previousDirty;refreshSaveState();updateSelection();throw e;}}
function selectedNodes(editable=false){return nodes.filter(n=>selected.has(n.id)&&!isHidden(n)&&(!editable||!isLocked(n)));}
function geomFor(n){
 const key=geometrySignature(n);
 if(geometryCache.has(key)){lastGeometry.set(n.id,geometryCache.get(key));return geometryCache.get(key);}
 let data=renderData.get(key);
 if(!data&&edits.isActive()&&lastGeometry.has(n.id))return lastGeometry.get(n.id);
 if(!data){const m=localManifold(n);try{data=meshData(m);renderData.set(key,data);}finally{m.delete();}}
 const geo=dataGeometry(data);geometryCache.set(key,geo);lastGeometry.set(n.id,geo);return geo;
}
function dataGeometry(data){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(data.verts,3));geo.setIndex(data.triangles);geo.computeVertexNormals();geo.computeBoundingBox();return geo;}
function renderColors(n){const key=colorSignature(n);if(colorData.has(key))return colorData.get(key);if(edits.isActive()){const old=edits.baseline().project.nodes.find(v=>v.id===n.id);return old?colorData.get(colorSignature(old))||[]:[];}const parts=coloredParts(n);colorData.set(key,parts);return parts;}
function disposeChildren(group,geometry=true){for(const obj of [...group.children]){group.remove(obj);if(geometry)obj.geometry?.dispose();for(const child of obj.children){child.geometry?.dispose();child.material?.map?.dispose();child.material?.dispose();}if(obj.material){obj.material.map?.dispose();Array.isArray(obj.material)?obj.material.forEach(m=>m.dispose()):obj.material.dispose();}}}
function applyMeshTransform(mesh,n){if(n.params&&!GENERATORS.has(n.type)&&!n.mesh){mesh.geometry=geomFor(n);}mesh.position.fromArray(n.pos);mesh.rotation.set(...n.rot.map(v=>v*DEG),'ZYX');mesh.scale.fromArray(n.size.map((v,i)=>v*(n.mirror?.[i]||1)));mesh.updateMatrixWorld(true);}
function renderNodes(keepTransform=false){
  measureTools.refresh();syncAttachedPlane();syncWorkspace();if(!keepTransform)gizmo.detach();disposeChildren(meshGroup,false);
  for(const n of nodes){if(isHidden(n))continue;const material=new THREE.MeshStandardMaterial({color:n.solid?n.color:'#94a6b2',roughness:.58,metalness:.03,transparent:!n.solid||(n.opacity??1)<1,opacity:n.solid?(n.opacity??1):.36,depthWrite:n.solid&&(n.opacity??1)===1,side:THREE.DoubleSide,flatShading:!['sphere','halfSphere','torus'].includes(n.type)});
    const mesh=new THREE.Mesh(geomFor(n),material);mesh.userData.id=n.id;applyMeshTransform(mesh,n);meshGroup.add(mesh);
    if(n.multicolor&&n.children){const parts=renderColors(n);for(const p of parts){const geo=new THREE.BufferGeometry();const inverse=new THREE.Matrix4().fromArray(matrixArray(n)).invert(),v=new THREE.Vector3(),verts=[];for(let i=0;i<p.data.verts.length;i+=3)verts.push(...v.fromArray(p.data.verts,i).applyMatrix4(inverse).toArray());geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geo.setIndex(p.data.triangles);geo.computeVertexNormals();const colored=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:p.color,roughness:.58,transparent:p.opacity<1,opacity:p.opacity,side:THREE.DoubleSide}));mesh.add(colored);}material.visible=false;}
    if(!n.solid){const edges=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry,25),new THREE.LineBasicMaterial({color:'#738899',transparent:true,opacity:.5}));mesh.add(edges);}
  }
  for(const id of [...selected])if(!nodes.some(n=>n.id===id&&!isHidden(n)))selected.delete(id);
  if(edits.isActive())clearSectionMeshes();applySection();scheduleSection();$('empty-hint').style.display=nodes.some(n=>!isHidden(n))?'none':'block';renderList();updateSelection(!keepTransform);
  // Retain geometries used by current nodes only, bounding GPU memory over edits.
  const used=new Set([...meshGroup.children,...historyGhost.children].map(m=>m.geometry));for(const [key,geo]of geometryCache)if(!used.has(geo)){geo.dispose();geometryCache.delete(key);}
  pruneRenderData();
}
function bounds(list=selectedNodes()){return projectedBounds(list,geomFor);}
function updateSelection(reposition=true){
  magnetTools.selectionChanged();
  edgeTools.selectionChanged();
  const context=featureContext(nodes,historySelection);if(!context||isHidden(context.root)||!selected.has(context.root.id))historySelection=null;refreshHistory();
  disposeChildren(outlineGroup);disposeChildren(handleGroup);
  const list=selectedNodes();sceneTools.refresh();precisionTools.refresh();for(const n of list){const mesh=meshGroup.children.find(m=>m.userData.id===n.id);if(mesh&&!historySelection){const box=new THREE.BoxHelper(mesh,magnetTools.isActive()||sceneTools.reference()===n.id?0xe6a136:0x058a9f);box.material.depthTest=false;box.renderOrder=10;outlineGroup.add(box);}}
  $('magnet-mode').disabled=list.length!==1||!!historySelection||isLocked(list[0])||edits.isActive()||calculations.isBusy();document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',!magnetTools.isActive()&&b.dataset.mode===mode));
  const editable=list.filter(n=>!isLocked(n));if(!magnetTools.isActive()&&!edgeTools.isActive()&&!historySelection&&editable.length&&!sceneTools.isAligning()&&!precisionTools.isPlacing()&&!workplaneTools.isPlacing()&&!measureTools.isPlacing()){if(reposition){const center=bounds(editable).getCenter(new THREE.Vector3());pivot.position.copy(center);if(mode==='scale'&&editable.length===1)pivot.rotation.set(...editable[0].rot.map(v=>v*DEG),'ZYX');else pivot.quaternion.copy(frame(toolFrame()).q);pivot.scale.set(1,1,1);pivot.updateMatrixWorld(true);}gizmo.attach(pivot);gizmo.setMode(mode);gizmo.setSpace('local');gizmo.setTranslationSnap(null);gizmo.setRotationSnap(preferences.rotationSnap?preferences.rotationSnap*DEG:null);gizmo.setScaleSnap(null);}
  else if(historySelection&&context&&context.chain.length>1&&!inspectorLocked(context.node)){if(reposition){const matrix=featureMatrix(context),q=new THREE.Quaternion(),scale=new THREE.Vector3();matrix.decompose(pivot.position,q,scale);pivot.quaternion.copy(mode==='translate'?frame(toolFrame()).q:q);pivot.scale.set(1,1,1);pivot.updateMatrixWorld(true);}gizmo.attach(pivot);gizmo.setMode(mode);gizmo.setSpace('local');gizmo.setRotationSnap(preferences.rotationSnap?preferences.rotationSnap*DEG:null);}
  else gizmo.detach();
  const b=list.length?bounds(list):null;
  if(list.length){const size=b.getSize(new THREE.Vector3());$('measure-label').textContent=`${historySelection?'Fertige Gruppe · Weltgrenzen':'Auswahl · Weltgrenzen'}: ${fmt(size.x)} × ${fmt(size.y)} × ${fmt(size.z)} mm · Unterkante Z ${fmt(b.min.z)} mm`;$('measure-label').style.display='block';}else $('measure-label').style.display='none';
  if(!magnetTools.isActive()&&!edgeTools.isActive()&&!historySelection&&list.length===1&&!isLocked(list[0])&&mode==='translate'&&!sceneTools.isAligning()&&!precisionTools.isPlacing()&&!workplaneTools.isPlacing()&&!measureTools.isPlacing())createHandles(b,list[0]);
  if(historySelection&&context?.chain.length>1&&!inspectorLocked(context.node)&&mode==='translate')createHandles(b,context.node);
  $('selected-count').textContent=list.length||'';
  for(const action of ['duplicate','copy','delete','drop','mirror','hide','lock'])document.querySelectorAll(`[data-action="${action}"]`).forEach(b=>b.disabled=!list.length);
  document.querySelector('[data-action="group"]').disabled=list.length<2||list.some(n=>isLocked(n));
  document.querySelector('[data-action="ungroup"]').disabled=!list.some(n=>n.children?.length&&!isLocked(n));
  document.querySelector('[data-action="paste"]').disabled=!clipboard.length||!!historySelection||edits.isActive();
  document.querySelector('[data-action="align"]').disabled=list.length<2;
  document.querySelector('[data-action="undo"]').disabled=!undoStack.length;document.querySelector('[data-action="redo"]').disabled=!redoStack.length;
  updateInspector();renderList();
}
function fmt(v){return Number(v.toFixed(2)).toLocaleString(preferences.language==='en'?'en-US':'de-DE',{useGrouping:false});}
function select(ids,append=false){historySelection=null;if(!append)selected.clear();for(const id of ids){if(append&&selected.has(id))selected.delete(id);else selected.add(id);}updateSelection();}
function renderList(){organizationUI.render();}
function updateInspector(){const list=inspectorNodes(),n=list[0];$('inspector').hidden=!list.length;$('inspector-empty').hidden=!!list.length;if(!n)return;
  $('position-space').textContent=historySelection?'Elterngruppe · lokal · mm':'Weltachsen · Mittelpunkt · mm';$('dimension-space').textContent=historySelection?'Quelle · lokal · mm':'Lokale Formachsen · mm';const single=list.length===1;$('object-name').value=single?n.name:`${list.length} Formen ausgewählt`;$('object-name').disabled=!single||inspectorLocked(n);
  $('fit-presets').hidden=!single||!n.params||!Object.hasOwn(n.params,'clearance');$('fit-presets').disabled=inspectorLocked(n);$('object-opacity').value=Math.round((n.opacity??1)*100);$('object-opacity').disabled=!single||inspectorLocked(n);$('object-multicolor').checked=!!n.multicolor;$('object-multicolor').disabled=!single||!n.children||inspectorLocked(n);$('object-notes').value=single?n.notes||'':'';$('object-notes').disabled=!single||inspectorLocked(n);
  $('solid-btn').classList.toggle('active',list.every(n=>n.solid));$('hole-btn').classList.toggle('active',list.every(n=>!n.solid));$('object-color').value=n.color;
  for(const k of ['size','pos','rot'])for(let i=0;i<3;i++){const field=$(`${k}-${i}`);field.value=single?Number(n[k][i].toFixed(3)):'';field.placeholder=single?'':'—';field.disabled=!single||inspectorLocked(n);}
  $('resolution-panel').hidden=!single||n.mesh!=null||['roof','wedge','pyramid','star','hexagon','triangle'].includes(n.type);$('segments').value=n.segments||64;$('segments').disabled=inspectorLocked(n);shapeInspector.refresh();
  $('text-panel').hidden=!single||n.type!=='text';$('text-font').value=n.font||'regular';$('text-font').disabled=inspectorLocked(n);$('shape-text').value=n.text||'TEXT';$('shape-text').disabled=inspectorLocked(n);$('solid-btn').disabled=$('hole-btn').disabled=$('object-color').disabled=inspectorLocked(n);$('lock-btn').textContent=list.every(n=>inspectorLocked(n))?'Entsperren':'Sperren';
  $('selection-info').textContent=single?`${n.children?'Gruppe aus '+n.children.length+' Formen':n.type==='import'?'Importiertes Mesh':'Grundform'}${inspectorLocked(n)?' · gesperrt':''}`:'Maße und Position einzeln bearbeiten. Farbe und Körpertyp gelten für die Auswahl.';
}
function updateBed(){disposeChildren(bedGroup);bedGroup.position.fromArray(workplane.origin);bedGroup.quaternion.fromArray(workplane.orientation);const geo=new THREE.PlaneGeometry(...bed),mat=new THREE.MeshBasicMaterial({color:'#d8eaf0',transparent:true,opacity:.42,side:THREE.DoubleSide});const surface=new THREE.Mesh(geo,mat);surface.position.z=-.05;bedGroup.add(surface);
  const coords=[],minor=[],major=[];for(let x=-bed[0]/2;x<=bed[0]/2;x+=1){if(x%5!==0)continue;const arr=x%10===0?major:minor;arr.push(x,-bed[1]/2,0,x,bed[1]/2,0);}for(let y=-bed[1]/2;y<=bed[1]/2;y+=1){if(y%5!==0)continue;const arr=y%10===0?major:minor;arr.push(-bed[0]/2,y,0,bed[0]/2,y,0);}
  for(const [points,color,opacity]of [[minor,'#8fb6c4',.26],[major,'#70a1b6',.5]]){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));bedGroup.add(new THREE.LineSegments(g,new THREE.LineBasicMaterial({color,transparent:true,opacity})));}
  const axis=new THREE.AxesHelper(28);axis.position.set(-bed[0]/2,-bed[1]/2,.1);bedGroup.add(axis);
  // Local canvas textures for dimension ticks. No network fonts or assets.
  for(const [axisIndex,limit]of [[0,bed[0]],[1,bed[1]]])for(let v=-limit/2;v<=limit/2;v+=20){const canvas=document.createElement('canvas');canvas.width=128;canvas.height=48;const ctx=canvas.getContext('2d');ctx.fillStyle='#7394a4';ctx.font='28px Segoe UI';ctx.textAlign='center';ctx.fillText(String(v),64,32);const texture=new THREE.CanvasTexture(canvas),sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false}));sprite.scale.set(12,4.5,1);sprite.position.set(axisIndex===0?v:-bed[0]/2-7,axisIndex===1?v:-bed[1]/2-7,.2);bedGroup.add(sprite);}
  $('workspace-label').textContent=`Arbeitsfläche ${bed[0]} × ${bed[1]} mm`;
}
function syncWorkspace(){for(const [i,e]of [...$('align-grid').children].filter(e=>e.tagName==='SPAN').entries())e.textContent=(coordinateMode==='plane'?'UVN':'XYZ')[i];$('bed-width').value=bed[0];$('bed-depth').value=bed[1];$('workplane').value=Number(workplane.origin[2].toFixed(3));$('coordinate-mode').value=coordinateMode;$('plane-info').textContent=workplane.reference?'Flächenebene · am Objekt befestigt':'Freie Ebene';updateBed();}
function normalizeGeometry(geometry){const g=geometry.index?geometry.toNonIndexed():geometry,attr=g.getAttribute('position'),verts=[],triangles=[],lookup=new Map();for(let i=0;i<attr.count;i++){const p=[attr.getX(i),attr.getY(i),attr.getZ(i)],key=p.map(v=>Math.round(v*1e6)).join(',');if(!lookup.has(key)){lookup.set(key,verts.length/3);verts.push(...p);}triangles.push(lookup.get(key));}const result=normalizeMesh({verts,triangles});if(g!==geometry)g.dispose();return result;}
function textMesh(text,fontId='regular'){if(!fonts[fontId])throw Error('Unbekannte Schrift.');const geo=new TextGeometry(text,{font:fonts[fontId],size:10,depth:2,curveSegments:8,bevelEnabled:false});try{return normalizeGeometry(geo);}finally{geo.dispose();}}
function alignToPlane(n,point,plane){n.pos=point.toArray();n.rot=new THREE.Euler().setFromQuaternion(frame(plane).q,'ZYX').toArray().slice(0,3).map(v=>v/DEG);dropToPlane(n,geomFor,plane);}
function placeOnPlane(n,point,plane=workplane){const f=frame(plane),local=point?f.toLocal(point):new THREE.Vector3();if(!point&&selectedNodes().length)local.x=projectedBounds(selectedNodes(),geomFor,plane).max.x+n.size[0]/2+5;const p=snapPoint(f.toWorld(local.setZ(0)),plane,Number($('snap').value));alignToPlane(n,p,plane);assign(n,organization);}
function addShape(type,position,plane){if(!kernel)return toast('Der Geometriekern startet noch.');safe(()=>mutate(()=>{const n=makeNode(type);n.segments=preferences.segments;n.name=t(n.name);fitParameters(n);if(type==='text'){n.text='TEXT';n.mesh=textMesh(n.text).mesh;}placeOnPlane(n,position,plane);nodes.push(n);selected=new Set([n.id]);}));}
function snap(value){const step=Number($('snap').value);return step?Math.round(value/step)*step:value;}
function svgIcon(type,color){const common=`fill="${color}" stroke="#ffffff99" stroke-width="1.1"`;let shape;
  if(['sphere','halfSphere','heart'].includes(type))shape=type==='heart'?`<path d="M30 43 L12 26 C-2 11 21 3 30 17 C40 3 61 12 48 27Z" ${common}/>`:`<circle cx="30" cy="26" r="19" ${common}/><ellipse cx="26" cy="21" rx="8" ry="12" fill="#ffffff22"/>`;
  else if(['cylinder','tube','capsule','torus'].includes(type))shape=type==='torus'?`<ellipse cx="30" cy="26" rx="25" ry="16" ${common}/><ellipse cx="30" cy="23" rx="13" ry="7" fill="#f4f7f9"/>`:`<path d="M10 15v24c0 12 40 12 40 0V15" ${common}/><ellipse cx="30" cy="15" rx="20" ry="9" ${common}/>`+(type==='tube'?'<ellipse cx="30" cy="15" rx="12" ry="5" fill="#f4f7f9"/>':'');
  else if(['cone','pyramid','roof','triangle','wedge'].includes(type))shape=`<path d="M30 5L6 42L36 48L55 39Z" ${common}/><path d="M30 5L36 48L55 39Z" fill="#00000016"/>`;
  else if(type==='text')shape=`<text x="30" y="38" text-anchor="middle" font-size="31" font-family="Segoe UI" font-weight="800" fill="${color}">Aa</text>`;
  else if(type==='star')shape=`<path d="M30 3L36 19L55 20L41 31L46 48L30 38L14 48L19 31L5 20L24 19Z" ${common}/>`;
  else if(type==='gear')shape=`<path d="M26 3h8l3 8 9-1 6 7-5 8 5 8-6 7-9-1-3 8h-8l-3-8-9 1-6-7 5-8-5-8 6-7 9 1Z" ${common}/><circle cx="30" cy="25" r="7" fill="#f4f7f9"/>`;
  else shape=`<path d="M8 16L30 5L53 16L53 39L30 50L8 39Z" ${common}/><path d="M8 16L30 27L53 16M30 27V50" fill="none" stroke="#fff8"/><path d="M30 27L53 16V39L30 50Z" fill="#00000016"/>`;
  return `<svg viewBox="0 0 60 54" aria-hidden="true">${shape}</svg>`;
}
function renderLibrary(){const term=$('shape-search').value.toLowerCase(),root=$('shape-library');root.replaceChildren();const list=SHAPES.filter(s=>!favoritesOnly||libraryUI.isFavorite(s[0])).filter(s=>s[1].toLowerCase().includes(term)||t(s[1]).toLowerCase().includes(term));$('shape-count').textContent=SHAPES.length;for(const [type,label,color]of list){const b=document.createElement('button');b.className='shape-tile';b.draggable=true;b.title=label+' hinzufügen';b.innerHTML=svgIcon(type,color);const text=document.createElement('span');text.textContent=t(label);b.append(text);b.title+=' · Rechtsklick: Favorit';if(libraryUI.isFavorite(type))b.classList.add('favorite');b.oncontextmenu=e=>{e.preventDefault();safe(()=>{libraryUI.toggleFavorite(type);renderLibrary();});};b.onclick=()=>addShape(type);b.ondragstart=e=>e.dataTransfer.setData('text/plain',type);root.append(b);}
  let count=SHAPES.length;for(const plugin of plugins.filter(p=>p.enabled))for(const shape of plugin.manifest.shapes){count++;const name=label(shape.name,preferences.language);if(!name.toLowerCase().includes(term)&&!label(plugin.manifest.name,preferences.language).toLowerCase().includes(term))continue;const b=document.createElement('button');b.className='shape-tile plugin-shape';b.dataset.plugin=plugin.manifest.id;b.dataset.pluginShape=shape.id;b.draggable=true;b.title=name+' hinzufügen';b.innerHTML=svgIcon(shape.nodes[0].type,shape.nodes[0].color||'#87b9ad');const text=document.createElement('span');text.textContent=name;text.dataset.noTranslate='';b.append(text);b.onclick=()=>safe(()=>addPluginShape(plugin.manifest.id,shape.id));b.ondragstart=e=>e.dataTransfer.setData('application/x-offlinecad-plugin',JSON.stringify([plugin.manifest.id,shape.id]));root.append(b);}$('shape-count').textContent=count;}
function cast(e){camera.updateMatrixWorld(true);handleGroup.updateMatrixWorld(true);meshGroup.updateMatrixWorld(true);const r=renderer.domElement.getBoundingClientRect();mouse.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(mouse,camera);}
function planePoint(e,point=null){cast(e);const f=frame(workplane);scratchPlane.setFromNormalAndCoplanarPoint(f.axes[2],point||f.origin);return ray.ray.intersectPlane(scratchPlane,new THREE.Vector3());}
function surfacePlacement(e,excluded=new Set()){
  cast(e);sectionGroup.updateMatrixWorld(true);
  const meshes=sectionGroup.children.length&&!edits.isActive()?sectionGroup.children.concat(meshGroup.children.filter(m=>m.visible)):meshGroup.children;
  const hit=ray.intersectObjects(meshes.filter(m=>m.visible),false).find(h=>{const n=nodes.find(n=>n.id===h.object.userData.id);return h.face&&n?.solid&&!excluded.has(n.id)&&!isHidden(n)&&(!sectionPlane||sectionPlane.distanceToPoint(h.point)>=-1e-5);});
  if(hit){const n=nodes.find(n=>n.id===hit.object.userData.id);return {point:hit.point,plane:planeFromHit(n,hit.point,hit.face.normal)};}
  return null;
}
function libraryDropPlacement(e){return surfacePlacement(e)||{point:planePoint(e),plane:workplane};}
host.ondragover=e=>e.preventDefault();host.ondrop=e=>{e.preventDefault();const packed=e.dataTransfer.getData('application/x-offlinecad-plugin');if(packed){safe(()=>{const [id,shape]=JSON.parse(packed),{point,plane}=libraryDropPlacement(e);if(point)addPluginShape(id,shape,point,plane);});return;}const type=e.dataTransfer.getData('text/plain');if(SHAPES.some(s=>s[0]===type)){const {point,plane}=libraryDropPlacement(e);if(point)addShape(type,point,plane);}};
function handleWorldSize(point,pixels){
  const depth=Math.abs(point.clone().applyMatrix4(camera.matrixWorldInverse).z);
  const span=camera.isOrthographicCamera?(camera.top-camera.bottom)/camera.zoom:2*Math.max(.1,depth)*Math.tan(camera.fov*DEG/2);
  return span*pixels/host.clientHeight;
}
function resizeHandles(){camera.updateMatrixWorld(true);for(const h of handleGroup.children)h.scale.setScalar(handleWorldSize(h.position,h.userData.hitTarget?preferences.handleSize+10:preferences.handleSize));}
function createHandles(b,node){
  const matrix=controlMatrix(node);
  function cube(point,kind,corner){
    const h=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:sceneTools.dimension()?.corner?.[0]===corner[0]&&sceneTools.dimension()?.corner?.[1]===corner[1]?'#ffc467':'#ffffff',depthTest:false}));
    h.position.copy(point);h.userData={handle:kind,corner};h.renderOrder=20;
    const edge=new THREE.LineSegments(new THREE.EdgesGeometry(h.geometry),new THREE.LineBasicMaterial({color:'#40546a',depthTest:false}));edge.renderOrder=21;h.add(edge);handleGroup.add(h);
    const target=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));target.position.copy(point);target.userData={handle:kind,corner,hitTarget:true};handleGroup.add(target);
  }
  for(const x of [-1,1])for(const y of [-1,1])cube(new THREE.Vector3(x*.5,y*.5,-.5).applyMatrix4(matrix),'size',[x,y]);
  cube(new THREE.Vector3(0,0,.5).applyMatrix4(matrix),'sizeHeight',[1,1]);
  const f=frame(workplane),pb=projectedBounds([node],geomFor,workplane),p=pb.getCenter(new THREE.Vector3());p.z=pb.max.z;
  if(historySelection&&node===inspectorNodes()[0]){const point=new THREE.Vector3(0,0,.5).applyMatrix4(matrix);p.copy(f.toLocal(point));}const size=handleWorldSize(f.toWorld(p),preferences.handleSize);p.z+=size*3;
  const lift=new THREE.Mesh(new THREE.ConeGeometry(.75,1.6,4),new THREE.MeshBasicMaterial({color:'#243649',depthTest:false}));lift.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),f.axes[2]);lift.position.copy(f.toWorld(p));lift.userData.handle='lift';lift.renderOrder=20;handleGroup.add(lift);resizeHandles();
}
function nodeFromMatrix(n,matrix){const p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();matrix.decompose(p,q,s);n.pos=p.toArray();n.size=s.toArray().map(v=>Math.max(.01,Math.abs(v)));n.mirror=s.toArray().map(v=>v<0?-1:1);n.rot=new THREE.Euler().setFromQuaternion(q,'ZYX').toArray().slice(0,3).map(v=>v/DEG);}
gizmo.addEventListener('dragging-changed',e=>{
  if(cancellingFeature)return;
  orbit.enabled=!e.value;
  if(e.value){edits.begin();const feature=historySelection?captureFeature():null;pivot.updateMatrixWorld(true);gizmoStart={feature,frame:clone(toolFrame()),start:{position:pivot.position.clone(),quaternion:pivot.quaternion.clone(),scale:pivot.scale.clone()},inverse:pivot.matrixWorld.clone().invert(),items:feature?[]:selectedNodes(true).map(n=>({node:n,matrix:new THREE.Matrix4().fromArray(matrixArray(n))}))};}
  else{gizmoStart=null;finishEdit();}
});
gizmo.addEventListener('objectChange',()=>{
  if(!gizmoStart)return;
  if(mode==='translate'){const f=frame(gizmoStart.frame),p=f.toLocal(pivot.position);for(let i=0;i<3;i++)if(gizmo.axis?.includes('XYZ'[i]))p.setComponent(i,snap(p.getComponent(i)));pivot.position.copy(f.toWorld(p));}
  if(gizmoStart.feature){previewFeature(gizmoStart.feature,n=>transformFeature(n,gizmoStart.feature.original,gizmoStart.feature.parent,gizmoStart.start,pivot,mode));return;}
  if(mode==='scale'&&gizmoStart.items.length>1){const values=pivot.scale.toArray(),factor=values.sort((a,b)=>Math.abs(b-1)-Math.abs(a-1))[0];pivot.scale.setScalar(Math.max(.01,factor));}
  pivot.updateMatrixWorld(true);const delta=pivot.matrixWorld.clone().multiply(gizmoStart.inverse);for(const item of gizmoStart.items){const n=nodes.find(n=>n.id===item.node.id);nodeFromMatrix(n,delta.clone().multiply(item.matrix));}queueDrag();
});
renderer.domElement.addEventListener('pointerdown',e=>{
  if(e.button!==0||gizmo.dragging||aiPreview||edits.state()?.closing)return;cast(e);
  if(measureTools.isPlacing()){measureTools.accept(modelHit(),planePoint(e));return;}
  if(workplaneTools.isPlacing()){workplaneTools.accept(modelHit());return;}
  if(precisionTools.isPlacing()){const hit=modelHit(),point=hit?.point||planePoint(e);if(point)precisionTools.setOrigin(frame(toolFrame()).toLocal(snapPoint(point,toolFrame(),Number($('snap').value))).toArray());return;}
  if(sceneTools.isAligning()){const hit=modelHit();if(hit&&sceneTools.chooseReference(hit.object.userData.id))return;sceneTools.escape();cast(e);}
  const handle=ray.intersectObjects(handleGroup.children).find(hit=>hit.object.userData.handle);if(handle){e.stopImmediatePropagation();const n=historySelection?needInspector():selectedNodes(true)[0];if(!n)return;const kind=handle.object.userData.handle,corner=handle.object.userData.corner||[1,1],anchor=handle.object.position.clone(),matrix=controlMatrix(n),axes=[0,1,2].map(i=>new THREE.Vector3().setFromMatrixColumn(matrix,i).normalize());const z=kind==='lift'?n.pos[2]:anchor.z;
    const localPlane=new THREE.Plane().setFromNormalAndCoplanarPoint(axes[0].clone().cross(axes[1]).normalize(),anchor),start=kind==='size'?ray.ray.intersectPlane(localPlane,new THREE.Vector3()):null;
    drag={kind,start,original:clone(n),node:n,corner,startY:e.clientY,startX:e.clientX,z,localPlane,axes,moved:false,feature:historySelection?captureFeature():null};if(kind==='size'||kind==='sizeHeight')sceneTools.showDimensions(n,corner);orbit.enabled=false;renderer.domElement.setPointerCapture(e.pointerId);return;}
  if(gizmo.axis)return;
  if(historySelection){const context=featureContext(nodes,historySelection),hit=ray.intersectObjects(historyGhost.children,false)[0];if(hit&&context?.chain.length>1&&!inspectorLocked(context.node)){const center=new THREE.Vector3().setFromMatrixPosition(featureMatrix(context)),point=planePoint(e,center);drag={kind:'featureMove',start:point,feature:captureFeature(),startX:e.clientX,startY:e.clientY,planeAnchor:center,moved:false};orbit.enabled=false;renderer.domElement.setPointerCapture(e.pointerId);return;}historySelection=null;sceneTools.hideDimensions();updateSelection();cast(e);}
  const hit=modelHit();clickStart={x:e.clientX,y:e.clientY};
  if(hit){const id=hit.object.userData.id;if(e.shiftKey)select([id],true);else if(!selected.has(id))select([id]);const list=selectedNodes(true);if(list.length&&!e.shiftKey){const center=bounds(list).getCenter(new THREE.Vector3()),point=planePoint(e,center);drag={kind:'move',start:point,dragFrame:clone(workplane),planeAnchor:center.clone(),items:list.map(n=>({node:n,pos:[...n.pos]})),z:center.z,moved:false};orbit.enabled=false;renderer.domElement.setPointerCapture(e.pointerId);}}
  else{const r=host.getBoundingClientRect();drag={kind:'marquee',startX:e.clientX-r.left,startY:e.clientY-r.top,append:e.shiftKey};if(!e.shiftKey)select([]);orbit.enabled=false;renderer.domElement.setPointerCapture(e.pointerId);}
},{capture:true});
renderer.domElement.addEventListener('pointermove',e=>{
  if(workplaneTools.isPlacing()){cast(e);workplaneTools.hover(modelHit());return;}
  if(!drag||gizmo.dragging)return;
  if(drag.feature){moveFeatureDrag(e);return;}
  if(drag.kind==='marquee'){const r=host.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;Object.assign($('selection-marquee').style,{display:'block',left:Math.min(x,drag.startX)+'px',top:Math.min(y,drag.startY)+'px',width:Math.abs(x-drag.startX)+'px',height:Math.abs(y-drag.startY)+'px'});drag.endX=x;drag.endY=y;return;}
  let point;if(drag.kind==='size'){cast(e);point=ray.ray.intersectPlane(drag.localPlane,new THREE.Vector3());}else if(drag.kind==='move'){cast(e);const f=frame(drag.dragFrame);scratchPlane.setFromNormalAndCoplanarPoint(f.axes[2],drag.planeAnchor);point=ray.ray.intersectPlane(scratchPlane,new THREE.Vector3());}if((!point||!drag.start)&&!['sizeHeight','lift'].includes(drag.kind))return;
  if(drag.kind==='move'){if(!drag.moved){if(Math.hypot(e.clientX-clickStart.x,e.clientY-clickStart.y)<4)return;edits.begin();drag.moved=true;}for(const item of drag.items){const n=nodes.find(n=>n.id===item.node.id);n.pos=snapPoint(new THREE.Vector3(...item.pos).add(point.clone().sub(drag.start)),drag.dragFrame,Number($('snap').value)).toArray();}}
  else if(drag.kind==='size'||drag.kind==='sizeHeight'||drag.kind==='lift'){
    if(!drag.moved){if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<4)return;edits.begin();drag.moved=true;}
    const n=nodes.find(n=>n.id===drag.node.id),o=drag.original,sizes=[...o.size];
    if(drag.kind==='size'){const delta=point.clone().sub(drag.start);for(let i=0;i<2;i++)sizes[i]=Math.min(10000,Math.max(.1,snap(o.size[i]+delta.dot(drag.axes[i])*drag.corner[i])));if(e.shiftKey||$('proportions').checked){const ratio=sizes[0]/o.size[0];for(let i=0;i<3;i++)sizes[i]=o.size[i]*ratio;}}
    else if(drag.kind==='sizeHeight')sizes[2]=Math.min(10000,Math.max(.1,snap(o.size[2]+(drag.startY-e.clientY)*camera.position.distanceTo(orbit.target)/host.clientHeight*.75)));
    if(drag.kind==='lift'){const f=frame(workplane),p=f.toLocal(new THREE.Vector3(...o.pos));p.z=snap(p.z+(drag.startY-e.clientY)*camera.position.distanceTo(orbit.target)/host.clientHeight*.75);n.pos=f.toWorld(p).toArray();}
    else {if(sizes.some(v=>v<.01||v>10000))return;n.size=[...o.size];n.pos=[...o.pos];resizeAnchored(n,sizes,drag.corner);}
    // Finished geometry is supplied by the worker.
  }
  if(drag.moved)queueDrag();
});
renderer.domElement.addEventListener('pointerup',e=>{if(!drag)return;if(drag.kind==='marquee'&&drag.endX!=null){const minX=Math.min(drag.startX,drag.endX),maxX=Math.max(drag.startX,drag.endX),minY=Math.min(drag.startY,drag.endY),maxY=Math.max(drag.startY,drag.endY);if(maxX-minX>4){const ids=[];for(const n of nodes.filter(n=>!isHidden(n))){const b=bounds([n]),p=b.getCenter(new THREE.Vector3()).project(camera),x=(p.x+1)*host.clientWidth/2,y=(1-p.y)*host.clientHeight/2;if(x>=minX&&x<=maxX&&y>=minY&&y<=maxY)ids.push(n.id);}select(ids,drag.append);}}
  $('selection-marquee').style.display='none';const edited=drag.moved;drag=null;orbit.enabled=true;if(edited)finishEdit();else updateSelection();});
renderer.domElement.addEventListener('pointercancel',()=>cancelFeatureDrag());
renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());
function modelHit(){const meshes=sectionGroup.children.length&&!edits.isActive()?sectionGroup.children.concat(meshGroup.children.filter(m=>m.visible)):meshGroup.children;return ray.intersectObjects(meshes,false).find(h=>!sectionPlane||sectionPlane.distanceToPoint(h.point)>=-1e-5);}
function setMode(next){magnetTools.close();workplaneTools.escape();sceneTools.escape();sceneTools.hideDimensions();mode=next;gizmo.setMode(mode);document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));updateSelection();}
function fit(list=nodes.filter(n=>!isHidden(n))){const b=list.length?bounds(list):new THREE.Box3(new THREE.Vector3(-80,-80,0),new THREE.Vector3(80,80,30));const center=b.getCenter(new THREE.Vector3()),size=b.getSize(new THREE.Vector3()),distance=Math.max(...size.toArray())*2.2+30;const direction=camera.position.clone().sub(orbit.target).normalize();orbit.target.copy(center);camera.position.copy(center).addScaledVector(direction,distance);if(camera===ortho){ortho.zoom=300/distance;ortho.updateProjectionMatrix();}orbit.update();}
function setView(view){const directions={iso:[1,-1.4,1.1],top:[0,-.0001,1],front:[0,-1,.0001],right:[1,0,.0001]},distance=camera.position.distanceTo(orbit.target);camera.position.copy(orbit.target).add(new THREE.Vector3(...directions[view]).normalize().multiplyScalar(distance));orbit.update();}
function resize(){const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h);perspective.aspect=w/h;perspective.updateProjectionMatrix();ortho.left=-150*w/h;ortho.right=150*w/h;ortho.top=150;ortho.bottom=-150;ortho.updateProjectionMatrix();}
new ResizeObserver(resize).observe(host);
renderer.setAnimationLoop(()=>{orbit.update();resizeHandles();sceneTools.reposition();precisionTools.reposition();renderer.render(scene,camera);});

function needSelection(min=1){if(historySelection)throw new Error('Diese Aktion betrifft ganze Teile. Zuerst „Zur fertigen Gruppe“ wählen.');const list=selectedNodes(true);if(list.length<min)throw new Error(`Bitte mindestens ${min===1?'eine Form':min+' Formen'} auswählen und gegebenenfalls entsperren.`);return list;}
function freshIds(n){n.id=crypto.randomUUID();if(n.children)n.children.forEach(freshIds);return n;}
function duplicate(){const list=needSelection();mutate(()=>{const copies=list.map(n=>{const copy=freshIds(clone(n));copy.name=n.name;if(lastDuplicate?.ids.includes(n.id)){
    const before=lastDuplicate.before.find(x=>x.id===n.id);if(before){const current=new THREE.Matrix4().fromArray(matrixArray(n)),previous=new THREE.Matrix4().fromArray(matrixArray(before));const delta=current.clone().multiply(previous.invert());nodeFromMatrix(copy,delta.multiply(current));}
  }nodes.push(copy);return copy;});lastDuplicate={ids:copies.map(n=>n.id),before:copies.map(clone)};selected=new Set(copies.map(n=>n.id));});updateSelection();toast('Duplikat erstellt. Verschieben und Strg+D erneut drücken wiederholt den Abstand.');}
function copySelection(){
 if(historySelection)throw Error('Kopieren betrifft ganze Teile. Zuerst „Zur fertigen Gruppe“ wählen.');
 if(edits.isActive())throw Error('Bearbeitung zuerst abschließen oder abbrechen.');
 const list=selectedNodes();if(!list.length)throw Error('Zuerst Teile auswählen.');clipboard=clone(list);updateSelection();toast('Auswahl kopiert. Mit Einfügen oder Strg+V einfügen.');
}
function pasteSelection(){
 if(historySelection)throw Error('Einfügen betrifft ganze Teile. Zuerst „Zur fertigen Gruppe“ wählen.');
 if(!clipboard.length)return;mutate(()=>{const pasted=clipboard.map(n=>freshIds(clone(n)));pasted.forEach(n=>{n.pos[0]+=10;n.pos[1]+=10;n.locked=false;});nodes.push(...pasted);selected=new Set(pasted.map(n=>n.id));});
}

function group(operation='union'){return groupAsync(operation);}
function ungroup(){const groups=needSelection().filter(n=>n.children?.length);if(!groups.length)throw new Error('Wähle eine Gruppe zum Auflösen aus.');mutate(()=>{const restored=[];for(const g of groups){
    const scaleFactors=g.size.map((v,i)=>v/g.baseSize[i]),uniformScale=Math.abs(scaleFactors[0]-scaleFactors[1])+Math.abs(scaleFactors[1]-scaleFactors[2])<.00001;
    const groupTransform=new THREE.Matrix4().fromArray(matrixArray({...g,size:g.size.map((v,i)=>v/g.baseSize[i])}));
    for(const original of g.children){const child=freshIds(clone(original)),matrix=groupTransform.clone().multiply(new THREE.Matrix4().fromArray(matrixArray(child)));
      const cols=[0,1,2].map(i=>new THREE.Vector3().setFromMatrixColumn(matrix,i).normalize());
      const adjustedParams=child.params&&!GENERATORS.has(child.type)?scaledParameters(child,scaleFactors[0]):null;
      if(Math.abs(cols[0].dot(cols[1]))+Math.abs(cols[0].dot(cols[2]))+Math.abs(cols[1].dot(cols[2]))>.0001||(adjustedParams&&(!uniformScale||!validParameters({...child,params:adjustedParams})))){
        const m=localManifold(child),transformed=m.transform(matrix.elements);m.delete();try{const b=transformed.boundingBox(),data=meshData(transformed),normalized=normalizeMesh(data);child.mesh=normalized.mesh;child.size=normalized.size;child.pos=b.min.map((v,i)=>(v+b.max[i])/2);child.rot=[0,0,0];child.mirror=[1,1,1];child.type='import';delete child.children;delete child.baseSize;delete child.params;delete child.parameterSize;delete child.operation;}finally{transformed.delete();}
      }else {nodeFromMatrix(child,matrix);if(adjustedParams)child.params=adjustedParams;}
      if(child.suppressed)child.hidden=true;delete child.suppressed;restored.push(child);
    }
  }nodes=nodes.filter(n=>!groups.includes(n));nodes.push(...restored);selected=new Set(restored.map(n=>n.id));});}
function align(axis,edge){sceneTools.applyAlign(axis,edge);}
function mirror(axis){const list=needSelection(),center=bounds(list).getCenter(new THREE.Vector3()),reflect=new THREE.Matrix4().makeTranslation(...center.toArray()).multiply(new THREE.Matrix4().makeScale(...[0,1,2].map(i=>i===axis?-1:1))).multiply(new THREE.Matrix4().makeTranslation(...center.clone().negate().toArray()));mutate(()=>list.forEach(n=>nodeFromMatrix(n,reflect.clone().multiply(new THREE.Matrix4().fromArray(matrixArray(n))))));}
function drop(){const list=needSelection();mutate(()=>list.forEach(n=>dropToPlane(n,geomFor,workplane)));}
function modal(title,content){$('modal').classList.remove('ai-modal');$('modal-title').textContent=title;$('modal-body').innerHTML=content;$('modal').showModal();}
async function download(data,filename,type='application/octet-stream'){
 const blob=new Blob([data],{type});
 if(window.offlinecadDesktop?.saveFile)return window.offlinecadDesktop.saveFile({filename,bytes:new Uint8Array(await blob.arrayBuffer())});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
 return {saved:false,requested:true};
}
function filename(){return ($('project-name').value||'Modell').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,100);}
async function save(){
 if(edits.isActive())throw Error('Bearbeitung zuerst abschließen oder abbrechen.');
 const project=confirmedSnapshot(),revision=revisionOf(project),result=await download(serializeFile({format:'OfflineCAD',...project},PROJECT_BYTES,'Projektdatei'),filename()+'.ocad','application/json');
 if(result.saved){if(revisionOf(confirmedSnapshot())===revision)dirty=false;refreshSaveState();toast('Projektdatei gespeichert. Gruppen, Lochformen und Maße bleiben erhalten.');}
 else toast(result.requested?'Dateidownload angefordert.':'Speichern abgebrochen.');
 return result;
}
function exportModel(format,selectionOnly){return exportAsync(format,selectionOnly);}
function exportDialog(){modal('Modell exportieren',`<p>STL: ein fertiger Körper für 3D-Druck. 3MF: getrennte Teile mit Farben für Slicer. OBJ: Geometrie für 3D-Programme. GLTF: farbige Darstellung (Meter). SVG: Umriss in der XY-Draufsicht (Millimeter). STEP: getrennte CAD-Körper in Millimetern; STEP-Kurven bleiben bei gleichmäßiger Skalierung erhalten, Netzteile bleiben facettiert. STEP enthält keine Formnaro-Quellenhistorie oder Farbzuordnung. Bei Mehrfarbgruppen erhält die erste Quelle überlappendes Material.</p><label>Umfang <select id="export-scope"><option value="all">Alle sichtbaren Körper</option><option value="selected" ${selected.size?'':'disabled'}>Nur ausgewählte Körper</option></select></label><p class="warning">Lose Lochformen werden nicht exportiert. Zum Ausschneiden Körper und Loch vorher gruppieren.</p><div class="modal-actions"><button data-format="step">STEP</button><button data-format="svg">SVG · Draufsicht</button><button data-format="gltf">GLTF</button><button data-format="obj">OBJ</button><button data-format="3mf">3MF</button><button class="primary" data-format="stl">STL exportieren</button></div>`);$('modal-body').querySelectorAll('[data-format]').forEach(b=>b.onclick=()=>safe(()=>exportAsync(b.dataset.format,$('export-scope').value==='selected')));}

function addTemplateParts(parts){mutate(()=>{historySelection=null;const b=bounds(parts),center=b.getCenter(new THREE.Vector3()),f=frame(workplane),rotation=new THREE.Matrix4().makeRotationFromQuaternion(f.q),delta=new THREE.Matrix4().makeTranslation(...f.origin.toArray()).multiply(rotation).multiply(new THREE.Matrix4().makeTranslation(-center.x,-center.y,-b.min.z));for(const n of parts){freshIds(n);nodeFromMatrix(n,delta.clone().multiply(new THREE.Matrix4().fromArray(matrixArray(n))));assign(n,organization);}nodes.push(...parts);selected=new Set(parts.map(n=>n.id));});fit(parts);}
async function groupAsync(operation='union'){
 if(edits.isActive())throw Error('Bearbeitung zuerst abschließen oder abbrechen.');
 const list=needSelection(2);if(selectedNodes().some(n=>isLocked(n)))throw Error('Gesperrte Formen zuerst entsperren.');
 const base=snapshot(),revision=revisionOf(base),ids=list.map(n=>n.id),r=await calculations.run({job:'group',nodes:clone(list),operation,revision},'Gruppenberechnung');
 if(revisionOf(snapshot())!==revision)throw Error('Projekt inzwischen verändert. Gruppierung erneut starten.');
 const g=r.node;nodes=nodes.filter(n=>!ids.includes(n.id));assign(g,organization);nodes.push(g);adoptComputedHistory(nodes);seedRenderData(r.renders);
 selected=new Set([g.id]);undoStack.push(base);undoStack=undoStack.slice(-60);redoStack=[];renderNodes();changed();pruneRenderData();
 return g;
}
async function exportAsync(format,selectionOnly){
 if(edits.isActive())throw Error('Bearbeitung zuerst abschließen oder abbrechen.');
 if(historySelection&&selectionOnly)throw Error('Für einen Teileexport zuerst die Quellenbearbeitung beenden.');
 const list=(selectionOnly?selectedNodes():nodes).filter(n=>n.solid&&!isHidden(n));if(!list.length)throw Error('Keine sichtbaren Körper zum Exportieren.');
 const name=filename(),revision=revisionOf(snapshot()),result=await calculations.run({job:format==='step'?'cad-step-export':'export',nodes:clone(list),format,revision},'Exportberechnung');
 const saved=await download(result.output,name+'.'+format,format==='svg'?'image/svg+xml':format==='gltf'?'model/gltf+json':'application/octet-stream');
 if(saved.saved||saved.requested){$('modal').close();toast(saved.saved?format.toUpperCase()+' gespeichert · '+result.triangles+' Dreiecke · '+fmt(result.volume)+' mm³':'Dateidownload angefordert.');}
 else toast('Exportdatei nicht gespeichert.');return saved;
}
let sectionPlane=null,sectionTimer=null,sectionGeneration=0,sectionKey=null,sectionPromise=Promise.resolve();
const sectionGroup=new THREE.Group(),inspectionGroup=new THREE.Group();scene.add(sectionGroup,inspectionGroup);
const sectionCalculations=createCalculations({viewport,toast:()=>{}});
function clearSectionMeshes(){disposeChildren(sectionGroup);for(const mesh of meshGroup.children)mesh.visible=true;}
function applySection(){renderer.localClippingEnabled=true;for(const mesh of meshGroup.children)mesh.traverse(obj=>{if(obj.material)for(const m of Array.isArray(obj.material)?obj.material:[obj.material])m.clippingPlanes=sectionPlane?[sectionPlane]:[];});}
function scheduleSection(){
 if(!sectionPlane){clearSectionMeshes();return;}if(edits.isActive())return;
 const project=confirmedSnapshot(),key=revisionOf(project)+JSON.stringify([...sectionPlane.normal.toArray(),sectionPlane.constant]);if(key===sectionKey)return;sectionKey=key;
 const generation=++sectionGeneration;clearTimeout(sectionTimer);sectionCalculations.cancel();clearSectionMeshes();
 sectionTimer=setTimeout(()=>{
  const plane={normal:sectionPlane.normal.toArray(),offset:-sectionPlane.constant};
  sectionPromise=sectionCalculations.run({job:'section',nodes:clone(nodes.filter(n=>n.solid&&!isHidden(n))),plane,revision:key},'Schnittflächen',{silent:true}).then(results=>{
   if(generation!==sectionGeneration||!sectionPlane||key!==revisionOf(confirmedSnapshot())+JSON.stringify([...sectionPlane.normal.toArray(),sectionPlane.constant]))return;
   clearSectionMeshes();for(const mesh of meshGroup.children)if(nodes.find(n=>n.id===mesh.userData.id)?.solid)mesh.visible=false;
   for(const r of results){const n=nodes.find(n=>n.id===r.id);if(!n)continue;for(const p of r.parts||[{data:r.surface,color:n.color,opacity:n.opacity??1}]){const mesh=new THREE.Mesh(dataGeometry(p.data),new THREE.MeshStandardMaterial({color:p.color,roughness:.58,side:THREE.DoubleSide,transparent:p.opacity<1,opacity:p.opacity}));mesh.userData.id=n.id;sectionGroup.add(mesh);}
    const caps=new THREE.Mesh(dataGeometry(r.caps),new THREE.MeshStandardMaterial({color:'#ffb23e',roughness:.8,side:THREE.DoubleSide}));caps.userData.id=n.id;caps.userData.sectionCap=true;sectionGroup.add(caps);
   }
  }).catch(e=>{if(e.name!=='AbortError'&&generation===sectionGeneration){sectionKey=null;toast('Schnittflächen: '+e.message);}});
 },120);
}
function setSection(plane){sectionPlane=plane;sectionKey=null;sectionGeneration++;clearTimeout(sectionTimer);sectionCalculations.cancel();clearSectionMeshes();applySection();scheduleSection();}
function sectionDialog(){
 modal('Schnittansicht','<p>Geschlossene, orange Schnittflächen zeigen das Material; Bohrungen bleiben offen. Projekt und Exporte enthalten das vollständige Modell.</p><label class="dialog-label">Achse<select id="section-axis"><option>X</option><option>Y</option><option selected>Z</option></select></label><label class="dialog-label">Schnitthöhe (mm)<input id="section-offset" inputmode="decimal" value="0"></label><label class="check-line"><input id="section-flip" type="checkbox"> Gegenüberliegende Seite</label><div class="modal-actions"><button id="section-off">Schnitt aus</button><button id="section-on" class="primary">Anzeigen</button></div>');
 const list=nodes.filter(n=>!isHidden(n)),b=list.length?bounds(list):null;$('section-offset').value=b?fmt(b.getCenter(new THREE.Vector3()).z):'0';
 $('section-off').onclick=()=>{setSection(null);$('modal').close();};
 $('section-on').onclick=()=>safe(()=>{const offset=Number($('section-offset').value.replace(',','.')),axis='XYZ'.indexOf($('section-axis').value);if(!Number.isFinite(offset)||Math.abs(offset)>100000)throw Error('Ungültige Schnitthöhe.');const normal=new THREE.Vector3().setComponent(axis,$('section-flip').checked?1:-1);setSection(new THREE.Plane(normal,-normal.getComponent(axis)*offset));$('modal').close();});
}
let inspection=null,inspectionSettings={threshold:1,quality:1500};
try{const saved=JSON.parse(storage.getItem('offlinecad-inspection-v1'));if(saved&&Number.isFinite(saved.threshold)&&saved.threshold>0&&saved.threshold<=100&&[1500,6000].includes(saved.quality))inspectionSettings=saved;}catch{}
function updateInspection(){
 if(!inspection)return;inspection.stale=inspection.revision!==revisionOf(confirmedSnapshot());
 if(inspection.stale)disposeChildren(inspectionGroup);
 const out=document.getElementById('inspection-result');if(!out)return;out.replaceChildren();
 function text(value){const p=document.createElement('p');p.textContent=value;out.append(p);}
 text(inspection.stale?'Veraltet · Modell wurde seit der Prüfung geändert. Erneut prüfen.':'Prüfung abgeschlossen.');
 text('Revision '+inspection.revision+' · '+inspection.results.triangles+' Dreiecke · '+inspection.results.samples+' tatsächliche Wandstärken-Stichproben');
 function row(label,ids,fn){const b=document.createElement('button');b.className='inspection-row';b.textContent=label;b.disabled=inspection.stale||edits.isActive();b.onclick=()=>{if(inspection.stale||edits.isActive())return;select(ids);$('modal').close();fn?.();};out.append(b);}
 for(const c of inspection.results.collisions)row(c.a+' / '+c.b+': Überschneidung '+fmt(c.volume)+' mm³ · IDs '+c.aId+' / '+c.bId,[c.aId,c.bId]);
 for(const p of inspection.results.parts){text(p.name+' · ID '+p.id+' · '+p.samples+' Proben · kleinste abgetastete Wand: '+(p.minimum===null?'nicht ermittelt':fmt(p.minimum)+' mm'));if(p.measurements.length)row('Dünne Stellen zeigen · '+p.measurements.length+' Messstrecken',[p.id],()=>{
  disposeChildren(inspectionGroup);const points=p.measurements.flatMap(m=>[new THREE.Vector3(...m.from),new THREE.Vector3(...m.to)]),line=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:'#f05f33',depthTest:false}));line.renderOrder=30;inspectionGroup.add(line);
 });}
 if(!inspection.results.collisions.length&&!inspection.results.thin.length)text('Keine Kollisionen oder dünnen Stellen in den geprüften Stichproben gefunden.');
 text('Die kleinste abgetastete Wand ist keine vollständige Mindestwandgarantie.');
}
function inspectionDialog(){
 modal('Modell prüfen','<p>Wandstärken entlang von Flächennormalen abtasten. Kleine Details zwischen den Stichproben können unentdeckt bleiben.</p><label class="dialog-label">Mindestwand (mm)<input id="inspect-threshold" inputmode="decimal"></label><label class="dialog-label">Prüfqualität<select id="inspect-quality"><option value="1500">1500 Stichproben je Teil</option><option value="6000">6000 Stichproben je Teil</option></select></label><div class="modal-actions"><button id="inspect-start" class="primary">Prüfung starten</button></div><div id="inspection-result"></div>');
 $('inspect-threshold').value=String(inspectionSettings.threshold).replace('.',',');$('inspect-quality').value=String(inspectionSettings.quality);updateInspection();
 $('inspect-start').onclick=()=>safe(async()=>{
  if(edits.isActive())throw Error('Bearbeitung zuerst abschließen oder abbrechen.');
  const threshold=Number($('inspect-threshold').value.replace(',','.')),quality=Number($('inspect-quality').value);if(!Number.isFinite(threshold)||threshold<=0||threshold>100)throw Error('Mindestwand: größer 0 bis 100 mm.');
  inspectionSettings={threshold,quality};storage.setItem('offlinecad-inspection-v1',JSON.stringify(inspectionSettings));
  const revision=revisionOf(confirmedSnapshot()),list=nodes.filter(n=>n.solid&&!isHidden(n));if(!list.length)throw Error('Keine sichtbaren Körper.');
  const results=await calculations.run({job:'inspect',nodes:clone(list),threshold,quality,revision},'Modellprüfung');disposeChildren(inspectionGroup);inspection={revision,results,stale:false};updateInspection();
 });
}
function arrayDialog(){const list=needSelection();patternDialog({list,bounds,modal,safe,mutate,freshIds,clone,nodeFromMatrix,matrixArray,addCopies:(copies,originals)=>{nodes.push(...copies);selected=new Set([...originals,...copies].map(n=>n.id));}});}
function demo(){if(nodes.length){modal('Beispiel laden',`<p>Das Beispiel ersetzt das aktuelle Modell. Du kannst mit Strg+Z zurückkehren.</p><div class="modal-actions"><button id="demo-confirm" class="primary">Beispiel laden</button></div>`);$('demo-confirm').onclick=()=>{$('modal').close();loadDemo();};}else loadDemo();}
function loadDemo(){mutate(()=>{resetWorkspace();const plate=makeNode('roundbox',[0,0,3],{name:'Montageplatte',size:[70,45,6],color:'#eb7857'}),holes=[];for(const x of [-25,25])for(const y of [-12.5,12.5])holes.push(makeNode('cylinder',[x,y,3],{name:'Bohrung Ø 5 mm',size:[5,5,10],solid:false}));const group=groupNodes([plate,...holes]);group.name='Montageplatte · vier Bohrungen';nodes=[group];selected=new Set([group.id]);$('project-name').value='Montageplatte';});fit();toast('Beispiel geladen. Links eine Bohrung in der Modellhistorie anklicken und rechts ihre Maße ändern.');}
function help(){if(preferences.language==='en')return helpEnglish();modal('So funktioniert Formnaro',`<p>Formen links anklicken oder auf die Arbeitsfläche ziehen. Einheiten: Millimeter. Alle Berechnungen laufen auf deinem Computer.</p><p>Beim Ziehen aus der Formenbibliothek werden neue Formen am Loslasspunkt auf der getroffenen Körperfläche aufgesetzt und ausgerichtet. Ohne Flächentreffer oder bei einem Bibliotheksklick gilt die Arbeitsebene. Vorhandene Formen werden beim Verschieben nicht automatisch aufgesetzt.</p><p>Magnet: ein entsperrtes fertiges Teil auswählen, oben rechts „Magnet“ aktivieren und auf eine andere Körperfläche ziehen. Die goldene Vorschau wird beim Loslassen übernommen. Escape verwirft sie. Danach endet der Magnetmodus; die Platzierung zählt als ein Rückgängig-Schritt.</p><table><tr><td>Auswählen / Mehrfachauswahl</td><td>Linksklick / Umschalt+Klick</td></tr><tr><td>Auswahlrahmen</td><td>Leere Fläche links ziehen</td></tr><tr><td>Ansicht drehen / verschieben</td><td>Rechts ziehen / Mittlere Taste ziehen</td></tr><tr><td>Zoom / Modell einpassen</td><td>Mausrad / F</td></tr><tr><td>Verschieben / Größe / Drehen</td><td>Werkzeug oben rechts / T, S, R</td></tr><tr><td>Duplizieren mit Wiederholung</td><td>Strg+D</td></tr><tr><td>Gruppieren / Auflösen</td><td>Strg+G / Strg+Umschalt+G</td></tr><tr><td>Körper / Loch</td><td>Umschalt+H / H</td></tr><tr><td>Ausrichten / Spiegeln / Absetzen</td><td>L / M / D</td></tr><tr><td>Alles auswählen / Entfernen</td><td>Strg+A / Entf</td></tr><tr><td>Rückgängig / Wiederholen</td><td>Strg+Z / Strg+Y</td></tr><tr><td>Speichern / Öffnen</td><td>Strg+S / Strg+O</td></tr><tr><td>Kopieren / Einfügen</td><td>Strg+C / Strg+V</td></tr></table><p><b>Oberfläche anordnen:</b> Einstellungen → Oberfläche öffnet den Anordnungsmodus. Taster in den beiden oberen Leisten an die Einfügemarkierung ziehen; Bereiche am beschrifteten Griff in einen Andockplatz ziehen. Ein optionaler Name im Editor legt ein neues Layout an. Unter Einstellungen → Oberfläche gespeicherte Layouts laden, aktualisieren, umbenennen oder löschen. Aktuelle Anordnung und benannte Layouts liegen in Layouts/layouts.json neben Formnaro.exe; den Ordner Layouts beim Wechsel auf einen anderen PC mitkopieren. Abbrechen oder Escape stellt die vorherige Anordnung wieder her. Pfeiltasten verschieben einen fokussierten Griff; Strg+Pfeiltaste wechselt zwischen den oberen Leisten.</p><p>Ein Klick auf einen weißen Eckgriff zeigt editierbare Maßfelder direkt am Modell. Wert eingeben und Enter drücken. Die gegenüberliegende Ecke bleibt fest. Ziehen verändert die Größe; der dunkle Griff hebt die Form an. Ausrichten: mehrere Formen auswählen und L drücken. Ein ausgewähltes Objekt anklicken, um es als feste Referenz festzulegen; anschließend die kleinen Markierungen für Minimum, Mitte oder Maximum anklicken. Den Rasterfang, Drehfang und die Griffgröße kannst du unter Einstellungen ändern; beliebige Winkel auch rechts eingeben.</p><p><b>Löcher:</b> Eine Form auf „Loch“ setzen, durch den Körper schieben, beide auswählen und gruppieren. Gruppen links aufklappen und eine enthaltene Form oder Bohrung anklicken. Die Form mit den Griffen auf der Fläche verschieben, drehen und skalieren oder rechts Maße und Formparameter ändern: Das fertige Teil wird dabei neu berechnet, auch bei verschachtelten Gruppen. Escape oder Abbrechen verwirft eine laufende Bearbeitung. Die orange Vorschau reagiert direkt; das fertige Teil folgt nach der Berechnung im Hintergrund. Der Abschluss zählt als ein Undo-Schritt. Die orange Vorschau zeigt die gewählte Ausgangsform. „Zur fertigen Gruppe“ beendet die Bearbeitung. Gruppen bleiben in der Projektdatei auflösbar. STL/OBJ/3MF enthalten das fertige Modell.</p><p><b>Lineal und Muster:</b> „Lineal“ links in der Ansicht aktivieren und Ursprung auf Arbeitsebene oder Modell anklicken. Kanten- oder Mittelpunktbezug auswählen; grüne XYZ-Abstände direkt ändern. „Anordnen“ bietet Reihen, rechteckige Raster und Kreismuster mit Radius, Winkelbereich und Mitdrehen.</p><p><b>Formparameter:</b> Quader und Rundquader: Radius oder Fase, alle oder nur senkrechte Kanten. Zylinder und Rohr: Randform und Randwahl. Zahnräder: Evolventenprofil, Modul, Zähne, Winkel und Spiel. Gewinde: Außen, Mutter oder Lochform, Vorlagen M3 bis M24, Steigung, Profil, Gänge und Passungsspiel. Zuerst die Parameter einstellen; Größenänderungen am Zahnrad oder Gewinde skalieren das Profil. „Originalgröße“ stellt die berechneten Maße her.</p><p><b>Arbeitsebene:</b> W drücken oder „Arbeitsebene setzen“ anklicken, Fläche wählen – auch schräge oder senkrechte. Die Ebene folgt ihrem Bezugsobjekt. „Grundebene“ setzt sie zurück. U/V/N sind die Ebenenachsen; mit „Weltachsen“ auf X/Y/Z umschalten. Layer und Ordner links organisieren Teile ohne Vereinigung. Höhere Seitenzahlen erzeugen feinere Rundungen. Import: geschlossene STL/OBJ- und STEP/STP-Körper sowie SVG-Konturen als Extrusion. Ein Projekt regelmäßig als .ocad-Datei speichern.</p><p><b>Einstellungen:</b> Das Zahnrad oben öffnet Sprache (Deutsch/Englisch), Hell/Dunkel/Windows, Autosicherung, Zoom, Raster, Drehfang, Griffgröße und Qualität neuer Formen. Einstellungen, eigene Vorlagen, Favoriten, Formenpakete, Passungsvorlagen und Autosicherung liegen im Ordner Daten neben Formnaro.exe. Die Ordner Daten und Layouts beim PC-Wechsel oder Update mitnehmen. Windows-verschlüsselte API-Schlüssel auf dem anderen PC erneut eingeben. Rechtsklick auf Text- und Maßfelder öffnet Ausschneiden, Kopieren und Einfügen sowie Rückgängig, Wiederholen und Alles auswählen. Unter Plugins lokale JSON/.ocplugin-Pakete mit zusätzlichen Formen und Vorlagen laden. Ein Beispielpaket kann dort gespeichert werden. Deaktivieren oder Entfernen eines Pakets erhält seine bereits platzierten Modelle.</p><p><b>KI-Werkstatt:</b> Über ✦ KI neue Teile beschreiben oder vorhandene Gruppenquellen bearbeiten. Unter Einstellungen → KI / API Basisadresse, Modellkennung und eigenen Schlüssel eintragen. Der aktuelle Modellzustand und Werkzeugkontext werden automatisch beigefügt. Vorschlag prüfen, auf der Fläche ansehen und als einen Undo-Schritt übernehmen. Lokale JSON-Befehle und die externe lokale API/MCP funktionieren ohne Cloud-Schlüssel. Cloud-Anfragen übertragen Modelldaten an den eingestellten Anbieter. Details in ai/LIES-MICH-KI.txt.</p><p class="warning">Aktueller Umfang: Skizzen, mathematische Maßabhängigkeiten und bewegliche Baugruppen sind noch nicht enthalten. Zweipunkt-Messen, persönliche Vorlagen mit einfachen Maßformeln, Passungsvorlagen, Notizen, Schnittansicht und Modellprüfung sind über Ansicht, Vorlagen und Formparameter erreichbar. 3MF erhält Farben und getrennte Teile; GLTF und SVG-Draufsicht ergänzen den Export. „Kanten …“ ermöglicht frei gewählte Rundungen und Fasen mit Vorschau an Teilen, Gruppen und geschlossenen Importen. „Passung …“ berechnet Spiel je Seite und passende Lochformen. STEP/STP-Körper können importiert und als STEP exportiert werden; Netzteile bleiben facettiert. Keine Tinkercad-Cloudbibliothek. Zahnrad-Fußübergänge und Gewindeprofile sind angenähert.</p>`);}
let favoritesOnly=false;$('favorites-only').onclick=()=>{favoritesOnly=!favoritesOnly;$('favorites-only').setAttribute('aria-pressed',String(favoritesOnly));renderLibrary();};
const actions={
 edges:()=>edgeTools.open(),
 "general-fit":()=>fitTools.open(),
  bundle:()=>{const list=needSelection();modal('Teile bündeln','<label class="dialog-label">Name<input id="bundle-name" maxlength="200" value="Bündel"></label><div class="modal-actions"><button id="bundle-apply" class="primary">Bündeln</button></div>');$('bundle-apply').onclick=()=>safe(()=>{const name=$('bundle-name').value.trim();if(!name)throw Error('Name fehlt.');mutate(()=>{const f={id:crypto.randomUUID(),name,layerId:organization.activeLayerId,parentId:organization.activeFolderId,hidden:false,locked:false};organization.folders.push(f);organization.activeFolderId=f.id;list.forEach(n=>assign(n,organization));});$('modal').close();});},
  measure:()=>{workplaneTools.escape();precisionTools.escape();sceneTools.escape();measureTools.begin();updateSelection();},library:()=>libraryUI.open(),section:sectionDialog,inspect:inspectionDialog,
  new:()=>{if(!nodes.length){mutate(()=>{resetWorkspace();bed=[200,200];historySelection=null;selected.clear();$('project-name').value='Unbenanntes Modell';});return;}if(nodes.length)modal('Neues Projekt',`<p>Das aktuelle Modell wird geleert. Mit Strg+Z kannst du zurückkehren.</p><div class="modal-actions"><button id="new-confirm" class="primary">Neues Projekt</button></div>`);else return; $('new-confirm').onclick=()=>{mutate(()=>{nodes=[];resetWorkspace();bed=[200,200];historySelection=null;selected.clear();$('project-name').value='Unbenanntes Modell';});$('modal').close();};},
  open:()=>$('open-file').click(),save,import:()=>$('import-file').click(),export:exportDialog,
  undo:()=>{if(edits.isActive()){edits.cancel();return;}if(!undoStack.length)return;redoStack.push(snapshot());restore(undoStack.pop());},
  redo:()=>{if(edits.isActive()){edits.cancel();return;}if(!redoStack.length)return;undoStack.push(snapshot());restore(redoStack.pop());},
  duplicate,copy:copySelection,paste:pasteSelection,delete:()=>{if(historySelection){const c=featureContext(nodes,historySelection);needInspector();if(c.chain.length<2)throw new Error('Zum Löschen des fertigen Teils zuerst die Quellenbearbeitung beenden.');const parent=c.chain.at(-2);return editMutate(()=>{parent.children=parent.children.filter(n=>n!==c.node);historySelection={rootId:c.root.id,path:historySelection.path.slice(0,-1)};});return;}const list=needSelection();mutate(()=>{nodes=nodes.filter(n=>!list.includes(n));selected.clear();});},
  group:()=>groupAsync('union'),ungroup,intersect:()=>groupAsync('intersection'),align:()=>sceneTools.beginAlign(),mirror:()=>{needSelection();$('mirror-panel').hidden=!$('mirror-panel').hidden;},drop,
  hide:()=>{const list=needSelection();mutate(()=>list.forEach(n=>n.hidden=true));},
  lock:()=>{if(historySelection){const c=featureContext(nodes,historySelection);if(isLocked(c.root)||c.chain.slice(0,-1).some(n=>n.locked))throw Error('Sperrung der übergeordneten Gruppe zuerst aufheben.');mutate(()=>c.node.locked=!c.node.locked);return;}const list=selectedNodes();if(!list.length)return;if(list.some(n=>isLocked(n)&&!n.locked))return toast('Sperrung am übergeordneten Layer oder Ordner aufheben.');const value=!list.every(n=>isLocked(n));mutate(()=>list.forEach(n=>n.locked=value));},
  'show-all':()=>mutate(()=>{nodes.forEach(n=>n.hidden=false);[...organization.layers,...organization.folders].forEach(c=>c.hidden=false);}),demo,help,ruler:()=>{workplaneTools.escape();sceneTools.escape();precisionTools.begin();},array:arrayDialog,fit:()=>fit(selected.size?selectedNodes():undefined),
  'workplane-set':()=>{sceneTools.escape();precisionTools.escape();workplaneTools.begin();},
  'workplane-top':()=>{const list=needSelection();mutate(()=>setWorkplane(horizontalPlane(Number(bounds(list).max.z.toFixed(3)))));},
  'reset-plane':()=>{workplaneTools.escape();mutate(()=>setWorkplane(horizontalPlane()));},
  projection:()=>{const old=camera;camera=camera===perspective?ortho:perspective;camera.position.copy(old.position);camera.quaternion.copy(old.quaternion);orbit.object=camera;gizmo.camera=camera;if(camera===ortho)ortho.zoom=300/camera.position.distanceTo(orbit.target);resize();orbit.update();$('projection').textContent=camera===ortho?'Orthogonal':'Perspektive';}
};
document.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>safe(()=>{magnetTools.close();return actions[b.dataset.action]();})));
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
document.querySelectorAll('[data-mirror]').forEach(b=>b.onclick=()=>safe(()=>mirror(Number(b.dataset.mirror))));
$('coordinate-mode').onchange=()=>safe(()=>mutate(()=>{const r=precisionTools.snapshot(),world=r?frame(toolFrame()).toWorld(new THREE.Vector3(...r.origin)):null;coordinateMode=$('coordinate-mode').value;if(r){r.origin=frame(toolFrame()).toLocal(world).toArray();precisionTools.restore(r);}syncWorkspace();}));
for(const [id,side]of [['toggle-left','left'],['toggle-right','right']])$(id).onclick=()=>{const open=document.body.classList.toggle(side+'-open');document.body.classList.remove((side==='left'?'right':'left')+'-open');$(id).setAttribute('aria-expanded',String(open));};
$('modal-close').onclick=()=>$('modal').close();$('settings-open').onclick=()=>{if(drag||gizmo.dragging)return toast('Einstellungen können während einer Griffbewegung nicht geöffnet werden.');settingsUI.open();};$('shape-search').oninput=renderLibrary;$('snap').onchange=()=>safe(()=>setSettings({...preferences,snap:Number($('snap').value)}));$('project-name').oninput=()=>{$('project-name').value=$('project-name').value.slice(0,200);changed();};
for(const key of ['size','pos','rot'])for(let i=0;i<3;i++){const input=document.createElement('input');input.type='text';input.inputMode='decimal';input.id=`${key}-${i}`;input.step=key==='rot'?1:.1;input.onfocus=()=>input.select();input.onclick=()=>input.select();input.setAttribute('aria-label',`${key==='size'?'Größe':key==='pos'?'Position':'Drehung'} ${'XYZ'[i]}`);if(key==='size')input.min=.01;input.onchange=()=>safe(()=>{const n=needInspector(),value=Number(input.value.trim().replace(',','.'));if(!input.value||!Number.isFinite(value)||Math.abs(value)>(key==='pos'||key==='rot'?100000:10000)||(key==='size'&&value<.01)){updateInspector();throw new Error('Bitte einen gültigen Wert eingeben (Größe 0,01 bis 10000 mm).');}if(Math.abs(value-n[key][i])<.00001)return;return editMutate(()=>{if(key==='size'&&$('proportions').checked){const factor=value/n.size[i];n.size=n.size.map(v=>v*factor);}else n[key][i]=value;});});input.onblur=input.onchange;input.onkeydown=e=>{if(e.key==='Enter'){input.onchange();input.blur();}};$(`${key}-fields`).append(input);}
for(let axis=0;axis<3;axis++){const label=document.createElement('span');label.textContent='XYZ'[axis];$('align-grid').append(label);for(let edge=0;edge<3;edge++){const b=document.createElement('button');b.textContent=['Min','Mitte','Max'][edge];b.onclick=()=>safe(()=>align(axis,edge));$('align-grid').append(b);}}
$('object-name').onchange=()=>safe(()=>{const n=needInspector();if(!$('object-name').value.trim()){updateInspector();return;}editMutate(()=>n.name=$('object-name').value.trim().slice(0,200));});
function setSolid(value){const list=historySelection?[needInspector()]:needSelection();return editMutate(()=>list.forEach(n=>n.solid=value));}
$('solid-btn').onclick=()=>safe(()=>setSolid(true));$('hole-btn').onclick=()=>safe(()=>setSolid(false));
$('object-color').onchange=()=>safe(()=>{const list=historySelection?[needInspector()]:needSelection(),color=$('object-color').value;editMutate(()=>list.forEach(n=>n.color=color));});
$('fit-presets').onclick=()=>safe(()=>fitPresets.open());
$('object-opacity').onchange=()=>safe(()=>{const n=needInspector(),v=Number($('object-opacity').value)/100;if(!Number.isFinite(v)||v<.05||v>1){updateInspector();throw Error('Deckkraft: 5 bis 100 %.');}editMutate(()=>n.opacity=v);});$('object-multicolor').onchange=()=>safe(()=>{const n=needInspector();editMutate(()=>n.multicolor=$('object-multicolor').checked);});$('object-notes').onchange=()=>safe(()=>{const n=needInspector();editMutate(()=>n.notes=$('object-notes').value.slice(0,4000));});
$('segments').onchange=()=>safe(()=>{const n=needInspector();return editMutate(()=>{n.segments=Number($('segments').value);if(n.params)fitParameters(n);});});
$('shape-text').onchange=()=>safe(()=>{const n=needInspector(),text=$('shape-text').value.trim();if(!text){updateInspector();throw new Error('Der Text darf nicht leer sein.');}const data=textMesh(text,n.font||'regular');return editMutate(()=>{const previous=n.text||'TEXT';n.mesh=data.mesh;n.text=text;n.size[0]*=Math.max(1,text.length)/Math.max(1,previous.length);});});
$('text-font').onchange=()=>safe(()=>{const n=needInspector(),fontId=$('text-font').value,data=textMesh(n.text||'TEXT',fontId);return editMutate(()=>{n.font=fontId;n.mesh=data.mesh;});});
for(const id of ['bed-width','bed-depth','workplane'])$(id).onchange=()=>safe(()=>{const w=Number($('bed-width').value),d=Number($('bed-depth').value),z=Number($('workplane').value);if(![w,d,z].every(Number.isFinite)||w<20||w>2000||d<20||d>2000||Math.abs(z)>10000){syncWorkspace();throw new Error('Arbeitsfläche: 20 bis 2000 mm; Ebenenhöhe: maximal ±10000 mm.');}mutate(()=>{bed=[w,d];if(id==='workplane')setWorkplane(horizontalPlane(z));else syncWorkspace();});});
function validateProject(input){if(input.format!=='OfflineCAD'||![1,2,3,4].includes(input.version)||!Array.isArray(input.nodes)||input.nodes.length>500||!input.nodes.every(n=>validNode(n))||!validRuler(input.ruler))throw new Error('Ungültige oder nicht unterstützte Formnaro-Projektdatei.');if(new Set(input.nodes.map(n=>n.id)).size!==input.nodes.length)throw new Error('Projekt enthält doppelte Objektkennungen.');if(!Array.isArray(input.bed)||input.bed.length!==2||!input.bed.every(v=>Number.isFinite(v)&&v>=20&&v<=2000)||typeof input.name!=='string'||(input.version===1&&(!Number.isFinite(input.planeZ)||Math.abs(input.planeZ)>10000)))throw new Error('Ungültige Projekteinstellungen.');const data=migrateProject(input);synchronizeHistory(data.nodes,{upgrade:true});for(const n of data.nodes){const m=localManifold(n);m.delete();}if(data.workplane.reference){const n=data.nodes.find(n=>n.id===data.workplane.reference.objectId);if(!referenceOnSurface(data.workplane.reference,geomFor(n)))throw new Error('Die gespeicherte Bezugsfläche ist nicht mehr gültig.');}return data;}
$('open-file').onchange=async()=>{const file=$('open-file').files[0];if(!file)return;try{if(file.size>50*1024*1024)throw new Error('Projektdatei ist größer als 50 MB.');const input=JSON.parse(await file.text());if(hasFinishing(input.nodes||[]))await ensureCad();const data=validateProject(input);remember();restore(data);fit();toast('Projekt geöffnet.');}catch(e){toast(e.message);}finally{$('open-file').value='';}};
$('import-file').onchange=async()=>{const file=$('import-file').files[0];if(!file)return;try{if(file.size>30*1024*1024)throw new Error('Import ist auf 30 MB je Datei begrenzt.');let geometry;const ext=file.name.split('.').pop().toLowerCase();
  if(ext==='step'||ext==='stp'){const revision=revisionOf(snapshot()),data=await calculations.run({job:'cad-step-import',bytes:new Uint8Array(await file.arrayBuffer()),revision},'STEP-Import');if(revisionOf(snapshot())!==revision)throw Error('Modell während des Imports geändert. Import erneut starten.');await addImported(data,file.name,'step');return;}
  if(ext==='stl')geometry=new STLLoader().parse(await file.arrayBuffer());
  else if(ext==='obj'){const object=new OBJLoader().parse(await file.text()),verts=[];object.updateMatrixWorld(true);object.traverse(obj=>{if(obj.isMesh){const g=obj.geometry.index?obj.geometry.toNonIndexed():obj.geometry,attr=g.getAttribute('position');for(let i=0;i<attr.count;i++){const p=new THREE.Vector3().fromBufferAttribute(attr,i).applyMatrix4(obj.matrixWorld);verts.push(...p.toArray());}if(g!==obj.geometry)g.dispose();obj.geometry.dispose();}});geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));}
  else if(ext==='svg'){
    const text=await file.text();if(/<!ENTITY|<!DOCTYPE|<script|<foreignObject|(?:href|src)\s*=\s*["'](?:https?:|\/\/|data:)/i.test(text))throw new Error('SVG mit externen Inhalten wird nicht unterstützt.');
    const svg=new SVGLoader().parse(text),parts=[];try{for(const path of svg.paths){if(path.userData?.style?.fill==='none')continue;for(const shape of SVGLoader.createShapes(path)){const geo=new THREE.ExtrudeGeometry(shape,{depth:3,bevelEnabled:false,curveSegments:16});geo.scale(1,-1,1);const data=normalizeGeometry(geo);const n=makeNode('import',[0,0,0],{mesh:data.mesh,size:data.size});geo.computeBoundingBox();const center=geo.boundingBox.getCenter(new THREE.Vector3());n.pos=center.toArray();parts.push(worldManifold(n));geo.dispose();}}if(!parts.length)throw new Error('SVG enthält keine gefüllten Konturen.');const union=kernel.Manifold.union(parts);try{const data=meshData(union),normal=normalizeMesh(data);await addImported(normal,file.name,ext);return;}finally{union.delete();}}finally{parts.forEach(m=>m.delete());}
  }else throw new Error('Unterstützte Formate: STL, OBJ, SVG und STEP/STP.');
  try{if(!geometry.getAttribute('position')?.count||geometry.getAttribute('position').count>1500000)throw new Error('Leeres oder zu großes Mesh.');const data=normalizeGeometry(geometry);await addImported(data,file.name,ext);}finally{geometry.dispose();}
}catch(e){console.error(e);toast(e.message);}finally{$('import-file').value='';}};
function addImported(data,name,ext){return new Promise((resolve,reject)=>{modal('Importgröße','<p>Dateikoordinaten in die gewünschte Einheit umrechnen oder eine Zielbreite festlegen. SVG wird als geschlossene Extrusion importiert.</p><label class="dialog-label">Einheit<select id="import-unit"><option value="1">Millimeter</option><option value="10">Zentimeter</option><option value="25.4">Zoll</option></select></label><label class="dialog-label">Zielbreite (mm; 0 = Original)<input id="import-width" value="0" inputmode="decimal"></label><label class="dialog-label" id="import-height-row">SVG-Höhe (mm)<input id="import-height" value="3" inputmode="decimal"></label><div class="modal-actions"><button id="import-cancel">Abbrechen</button><button id="import-apply" class="primary">Importieren</button></div>');$('import-height-row').hidden=ext!=='svg';const dialog=$('modal');let settled=false;const close=()=>{if(!settled){settled=true;resolve(false);}dialog.removeEventListener('close',close);};dialog.addEventListener('close',close);$('import-cancel').onclick=()=>dialog.close();$('import-apply').onclick=()=>safe(()=>{const factor=Number($('import-unit').value),width=Number($('import-width').value.replace(',','.')),height=Number($('import-height').value.replace(',','.'));if(!Number.isFinite(width)||width<0||width>10000||(ext==='svg'&&(!Number.isFinite(height)||height<.01||height>10000)))throw Error('Importmaße: 0,01 bis 10000 mm; Zielbreite 0 für Original.');const scale=width?width/data.size[0]:factor,size=data.size.map(v=>v*scale);if(ext==='svg')size[2]=height;if(size.some(v=>v<.01||v>10000))throw Error('Importgröße liegt außerhalb des Arbeitsbereichs.');mutate(()=>{historySelection=null;const n=makeNode('import',null,{name:name.slice(0,200),mesh:data.mesh,size,...(data.cad?{cad:data.cad}:{})});placeOnPlane(n);nodes.push(n);selected=new Set([n.id]);});settled=true;dialog.close();fit(selectedNodes());toast('Geschlossene Geometrie importiert. Maße in Millimetern.');resolve(true);});});}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&(edits.isActive()||calculations.isBusy())){e.preventDefault();if(!cancelFeatureDrag())calculations.cancel();return;}if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)||$('modal').open)return;const key=e.key.toLowerCase(),ctrl=e.ctrlKey||e.metaKey;let fn;
  if(ctrl){fn={s:save,o:actions.open,z:e.shiftKey?actions.redo:actions.undo,y:actions.redo,d:duplicate,g:e.shiftKey?ungroup:()=>group(),a:()=>select(nodes.filter(n=>!isHidden(n)).map(n=>n.id)),arrowup:()=>nudge(2,1,e.shiftKey),arrowdown:()=>nudge(2,-1,e.shiftKey),c:copySelection,v:pasteSelection}[key];}
  else fn={delete:actions.delete,backspace:actions.delete,d:drop,l:actions.align,m:actions.mirror,h:()=>setSolid(e.shiftKey),f:actions.fit,t:()=>setMode('translate'),s:()=>setMode('scale'),r:()=>setMode('rotate'),w:actions['workplane-set'],escape:()=>{if(aiPreview){aiUI.discard();return;}if(measureTools.escape()){updateSelection();return;}if(cancelFeatureDrag())return;if(historySelection){historySelection=null;updateSelection();return;}if(!workplaneTools.escape()&&!precisionTools.escape()&&!sceneTools.escape())select([]);},arrowleft:()=>nudge(0,-1,e.shiftKey),arrowright:()=>nudge(0,1,e.shiftKey),arrowup:()=>nudge(e.ctrlKey?2:1,1,e.shiftKey),arrowdown:()=>nudge(e.ctrlKey?2:1,-1,e.shiftKey)}[key];
  if(fn){e.preventDefault();if(key!=='f')magnetTools.close();safe(fn);}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&(edits.isActive()||calculations.isBusy())){e.preventDefault();e.stopImmediatePropagation();if(!cancelFeatureDrag())calculations.cancel();}},true);
function nudge(axis,direction,fast){if(historySelection){const context=featureContext(nodes,historySelection),n=needInspector(),step=(Number($('snap').value)||.1)*(fast?10:1)*direction,delta=localDelta(frame(toolFrame()).axes[axis].multiplyScalar(step),parentMatrix(context));return editMutate(()=>n.pos=new THREE.Vector3(...n.pos).add(delta).toArray());}const list=needSelection(),step=(Number($('snap').value)||.1)*(fast?10:1)*direction;mutate(()=>{const direction=frame(toolFrame()).axes[axis].multiplyScalar(step);list.forEach(n=>n.pos=new THREE.Vector3(...n.pos).add(direction).toArray());});}
window.addEventListener('beforeunload',()=>{if(!preferences.autosave)return;try{storage.setItem('offlinecad-autosave-v4',JSON.stringify(confirmedSnapshot()));}catch{}});
async function init(){
  try{
    const wasmBinary=wasmUrl.startsWith('data:')?Uint8Array.from(atob(wasmUrl.split(',')[1]),c=>c.charCodeAt(0)):new Uint8Array(await (await fetch(wasmUrl)).arrayBuffer());
    kernel=await Module({wasmBinary});kernel.setup();setKernel(kernel);applySettings();syncWorkspace();renderLibrary();
    const saved=storage.getItem('offlinecad-autosave-v4')||storage.getItem('offlinecad-autosave-v3')||storage.getItem('offlinecad-autosave-v2')||storage.getItem('offlinecad-autosave-v1');if(saved){try{const s=JSON.parse(saved);if(hasFinishing(s.nodes||[]))await ensureCad();restore(validateProject({format:'OfflineCAD',version:1,...s}));if(nodes.length){fit();toast('Dein letztes lokales Modell wurde wiederhergestellt.');}}catch{renderNodes();toast('Die Autosicherung konnte nicht geladen werden. Projektdatei über Öffnen laden.');}}else renderNodes();
    await layoutUI.ready();window.__cadReady=true;
    if(new URLSearchParams(location.search).has('test'))window.__cadTest={storage,layoutUI,magnetTools,edgeTools,fitTools,ensureCad,measureTools,libraryUI,calculations,edits,confirmedSnapshot,selection:()=>[...selected],download,save,renderCacheState:()=>({geometries:geometryCache.size,data:renderData.size,colors:colorData.size}),settled:async()=>{while(edits.isActive()||calculations.isBusy())await new Promise(r=>setTimeout(r,20));},undoDepth:()=>undoStack.length,mutate,groupAsync,exportAsync,sectionState:()=>sectionPlane?[...sectionPlane.normal.toArray(),sectionPlane.constant]:null,sectionReady:async()=>{await new Promise(r=>setTimeout(r,150));await sectionPromise;},sectionMeshes:()=>sectionGroup.children.map(m=>({id:m.userData.id,cap:!!m.userData.sectionCap,triangles:m.geometry.index.count/3})),inspectionState:()=>clone(inspection),snapshot,validateProject,editFeature,setMode,getSettings:()=>clone(preferences),getPlugins:()=>clone(plugins),settingsFile:settingsUI.file,featureWorld:()=>{const c=featureContext(nodes,historySelection);return c?featureMatrix(c).elements:null;},gizmoHandles:()=>{const group=gizmo.getHelper().children.find(c=>c.type==='TransformControlsGizmo')||gizmo.getHelper().children[0];return group.gizmo[gizmo.mode].children.filter(h=>h.visible&&['X','Y','Z','XYZ'].includes(h.name)).map(h=>{h.geometry.computeBoundingBox();const a=h.geometry.getAttribute('position');return {name:h.name,mesh:!!h.isMesh,point:h.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(h.matrixWorld).toArray(),samples:Array.from({length:Math.min(16,a.count)},(_,i)=>new THREE.Vector3().fromBufferAttribute(a,Math.floor(i*a.count/Math.min(16,a.count))).applyMatrix4(h.matrixWorld).toArray())};});},historyState:()=>clone(historySelection),getPlane:()=>clone(workplane),setPlane:p=>mutate(()=>setWorkplane(p)),getOrganization:()=>clone(organization),gizmoState:()=>({space:gizmo.space,orientation:pivot.quaternion.toArray(),mode:gizmo.mode,attached:!!gizmo.object,axis:gizmo.axis}),assignSelection:()=>{const list=needSelection();mutate(()=>list.forEach(n=>assign(n,organization)));},toolBounds:()=>{const b=toolBounds();return {min:b.min.toArray(),max:b.max.toArray()};},nudge,setRuler:p=>precisionTools.setOrigin(p),changeParameter:(key,value)=>shapeInspector.change(key,value),restore:s=>{restore(validateProject({format:'OfflineCAD',version:1,...s}));},addShape,select,group,ungroup,mirror,align,drop,duplicate,loadDemo,exportModel,actions,projectPoint:p=>{camera.updateMatrixWorld(true);const v=new THREE.Vector3(...p).project(camera),r=renderer.domElement.getBoundingClientRect();return {x:Math.round(r.left+(v.x+1)*r.width/2),y:Math.round(r.top+(1-v.y)*r.height/2)};},getHandles:()=>handleGroup.children.filter(h=>!h.userData.hitTarget).map(h=>({kind:h.userData.handle,corner:h.userData.corner,pixels:preferences.handleSize,hitPixels:preferences.handleSize+10,point:h.position.toArray()})),alignmentReference:()=>sceneTools.reference(),dimensionState:()=>sceneTools.dimension(),bounds:()=>{const b=bounds();return {min:b.min.toArray(),max:b.max.toArray()};},getModel:()=>snapshot(),volume:()=>{const m=booleanManifold(nodes.filter(n=>n.solid&&!isHidden(n)));try{return m.volume();}finally{m.delete();}}};
  }catch(e){console.error(e);toast('Der 3D-Kern konnte nicht starten: '+e.message);$('status').textContent='Start fehlgeschlagen. Bitte die Anwendung neu starten.';window.__cadError=e.message;}
}
init();



