import {applyMeshDisplayStyle,MESH_DISPLAY_STYLES} from './mesh-display-style.js';
import {meshDisplayMatches,meshDisplayEdges} from './mesh-display-geometry.js';
import {createAIErrorOverlay} from './cad-ai-preview-errors.js';
import {createCadAssemblyBoxes} from './cad-assembly-boxes.js';
import {createCadJointView} from './cad-joints-view.js';
import {createCadCameraStep} from './cad-camera-step.js';
import {createModelComparisonOverlay} from './model-deviation-rendering.js';
import {thicknessColor} from './thickness-map.js';
import {createMeshInspectionOverlay} from './cad-mesh-inspector-rendering.js';
import {createCadSectionPreview} from './cad-section-preview.js';
import {isCadDisplaySnapshot} from './cad-display-cache.js';
import './cad-mesh-display.css';
import {projectObjectIsHole} from './project-objects.js';
import {createCadRenderScheduler} from './cad-render-scheduler.js';
import * as THREE from 'three';
import {createScaleDimensions} from './cad-scale-dimensions.js';
import {createMoveDimensions} from './cad-move-dimensions.js';
import {createCadRotationHandles} from './cad-rotation-handles.js';
import {cadBedGrid,workplaneOnGround} from './cad-bed-grid.js';
import {marqueeIntersectsMesh} from './cad-marquee-selection.js';
import {cadEdgeRenderBuffers} from './cad-edge-rendering.js';
import {cadDisplayGeometry as buildGeometry,cadVisibleRayHit} from './cad-renderer-geometry.js';
import {createMeshSelectionOverlay,meshSelectionSurfaceHit,meshSelectionScreenContext} from './cad-mesh-selection-rendering.js';
import {flags} from './organization.js';
import {createCadCutoutDisplay,setCadCutoutMaterial} from './cad-cutout-display.js';
import {cadPermanentlyVisible} from './cad-isolation.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {cadIdentity,cadPoint,multiplyCadMatrices,inverseCadMatrix,resizeCadAtCorner} from './cad-affine.js';

const matrix=value=>new THREE.Matrix4().fromArray(value),point=value=>new THREE.Vector3(...value);
const targetKey=target=>target.rootId+'\u0000'+target.path.join('\u0000');
function dispose(object){object.traverse(child=>{child.geometry?.dispose();for(const material of Array.isArray(child.material)?child.material:[child.material])material?.dispose();});object.removeFromParent();}
function localCorners(bounds){return Array.from({length:8},(_,n)=>[0,1,2].map(k=>n&(1<<k)?bounds.max[k]:bounds.min[k]));}

/** Three.js is only a view of worker-derived CAD buffers. Every precision
 * result comes from the worker; mesh raycasts are used for visual selection. */
export function createCadRenderer({host,viewport,getProject,getScene,getSelection,select,canEdit=()=>true,onGesture,onResize,onPlanePick,onMeasurePick,onMagnetPick,onError=()=>{},getPreferences=()=>({handleSize:14,gridVisible:true,zoomSpeed:1}),onDimensions=()=>{},onViewUpdate=()=>{}}={}){
  let darkTheme=false,sceneStyleKey=null;
  let scheduler;const invalidate=reason=>scheduler?.invalidate(reason);
  THREE.Object3D.DEFAULT_UP.set(0,0,1);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#eef2f6');
  const perspective=new THREE.PerspectiveCamera(42,1,.1,50000),orthographic=new THREE.OrthographicCamera(-150,150,150,-150,.1,50000);let camera=perspective,mode='translate',closed=false,selection=[],gesture=null,interaction=null,interactionAllowsCanvasListeners=false,ghost=null;
  camera.position.set(245,-310,265);
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,stencil:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(Math.max(1,host.clientWidth),Math.max(1,host.clientHeight));host.append(renderer.domElement);
  const cutoutDisplay=createCadCutoutDisplay(renderer);
  const orbit=new OrbitControls(camera,renderer.domElement);orbit.enableDamping=true;orbit.target.set(0,0,10);orbit.mouseButtons={LEFT:null,MIDDLE:THREE.MOUSE.PAN,RIGHT:THREE.MOUSE.ROTATE};orbit.maxDistance=10000;
  let navigationProfile='normal';
  function setNavigationProfile(profile){
    if(!['solid','normal','fusion'].includes(profile))throw Error('Unbekanntes Navigationsprofil.');
    // OrbitControls switches ROTATE to PAN while Ctrl/Meta/Shift is held.
    // Keep right-drag rotation available for Formnaro's existing workflows.
    navigationProfile=profile;orbit.mouseButtons.MIDDLE=profile==='solid'?THREE.MOUSE.ROTATE:THREE.MOUSE.PAN;
    renderer.domElement.dataset.navigationProfile=profile;
  }
  renderer.domElement.addEventListener('pointerdown',event=>{if(event.button===1&&navigationProfile==='solid')orbit.mouseButtons.MIDDLE=event.shiftKey?THREE.MOUSE.DOLLY:THREE.MOUSE.ROTATE;},true);
  scene.add(new THREE.HemisphereLight(0xffffff,0xaab6c6,2.5));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(-80,-160,300);scene.add(light);
  const bodies=new THREE.Group(),outlines=new THREE.Group(),handles=new THREE.Group(),bed=new THREE.Group(),edges=new THREE.Group(),measurements=new THREE.Group(),section=new THREE.Group(),preview=new THREE.Group(),sources=new THREE.Group(),annotations=new THREE.Group();scene.add(bodies,outlines,handles,bed,edges,measurements,section,preview,sources,annotations);
  const assemblyBoxes=createCadAssemblyBoxes();scene.add(assemblyBoxes.group);
  const aiErrorMarks=new THREE.Group();scene.add(aiErrorMarks);
  const comparisonMarks=new THREE.Group();scene.add(comparisonMarks);let comparisonIds=new Set();
  function clearComparison(){clear(comparisonMarks);comparisonIds.clear();refreshVisibility();}
  function setComparison(data,ids){const next=createModelComparisonOverlay(data);clear(comparisonMarks);comparisonIds=new Set(ids);comparisonMarks.add(next);refreshVisibility();}
  const alignmentGhosts=new THREE.Group();scene.add(alignmentGhosts);
  const meshSelectionMarks=new THREE.Group(),meshProtectionMarks=new THREE.Group();scene.add(meshSelectionMarks,meshProtectionMarks);let meshSelectionBinding=null,meshSelectionSource=null;
  function setMeshSelection(binding){const node=binding?getProject().nodes.find(n=>n.id===binding.objectId):null,old=meshSelectionBinding;if(node?.mesh===meshSelectionSource&&binding&&old&&binding.objectId===old.objectId&&binding.geometryDigest===old.geometryDigest&&binding.triangleIds.length===old.triangleIds.length&&binding.boundaryEdges.length===old.boundaryEdges.length&&binding.triangleIds.every((id,i)=>id===old.triangleIds[i])&&binding.boundaryEdges.every((edge,i)=>edge.id===old.boundaryEdges[i].id&&edge.vertices[0]===old.boundaryEdges[i].vertices[0]&&edge.vertices[1]===old.boundaryEdges[i].vertices[1])){refreshVisibility();return;}const next=createMeshSelectionOverlay(binding,node);clear(meshSelectionMarks);meshSelectionBinding=binding?structuredClone(binding):null;meshSelectionSource=node?.mesh??null;if(binding)meshSelectionMarks.add(next);refreshVisibility();}
  let protectionSignature=null,protectionSequence=0;const protectionOwners=new WeakMap();
  function setMeshProtection(values=[]){
    const key=JSON.stringify(values.map(v=>{if(!protectionOwners.has(v.node.mesh))protectionOwners.set(v.node.mesh,++protectionSequence);return [v.binding,protectionOwners.get(v.node.mesh),v.node.transform];}));if(key===protectionSignature)return;
    const next=[];try{for(const {binding,node}of values)next.push(createMeshSelectionOverlay(binding,node,{color:'#45c4e5'}));}catch(error){for(const g of next)dispose(g);throw error;}
    clear(meshProtectionMarks);protectionSignature=key;for(const g of next)meshProtectionMarks.add(g);refreshVisibility();
  }
  const thicknessMarks=new THREE.Group();scene.add(thicknessMarks);let thicknessId=null;
  const meshInspectionMarks=new THREE.Group();scene.add(meshInspectionMarks);let inspectionResult=null,inspectionSource=null,inspectionOptions=null;
  function setMeshInspection(result,options={}){
    const node=result?getProject().nodes.find(n=>n.id===result.objectId):null,key=JSON.stringify(options);
    if(result&&result===inspectionResult&&node?.mesh===inspectionSource&&key===inspectionOptions){refreshVisibility();return;}
    const next=createMeshInspectionOverlay(result,node,options);clear(meshInspectionMarks);inspectionResult=result;inspectionSource=node?.mesh??null;inspectionOptions=key;if(result)meshInspectionMarks.add(next);refreshVisibility();
  }
  function focusWorldPoints(points){if(!points.length)return;const box=new THREE.Box3();for(const p of points){if(!Array.isArray(p)||p.length!==3||p.some(n=>!Number.isFinite(n)))throw Error('Ungültige Diagnose-Fundstelle.');box.expandByPoint(point(p));}const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()).length(),direction=camera.position.clone().sub(orbit.target).normalize();orbit.target.copy(center);camera.position.copy(center).addScaledVector(direction,Math.max(5,size*2));if(camera.isOrthographicCamera){const aspect=host.clientWidth/Math.max(1,host.clientHeight);camera.zoom=camera.top/Math.max(.5,size*.65/Math.min(1,aspect));camera.updateProjectionMatrix();}orbit.update();camera.updateMatrixWorld(true);invalidate('inspection-focus');}
  function clearAlignmentPreview(){for(const mesh of [...alignmentGhosts.children]){mesh.material.dispose();mesh.removeFromParent();}}
  function setAlignmentPreview(moves){clearAlignmentPreview();for(const {id,delta}of moves)for(const original of records.get(id)??[]){const material=original.material.clone();material.color.set('#e8a33c');material.transparent=true;material.opacity=.42;material.depthTest=false;material.depthWrite=false;const mesh=new THREE.Mesh(original.geometry,material);mesh.matrixAutoUpdate=false;mesh.matrix.copy(new THREE.Matrix4().makeTranslation(...delta)).multiply(original.matrix);mesh.renderOrder=22;alignmentGhosts.add(mesh);}}
  const pivot=new THREE.Object3D();scene.add(pivot);const gizmo=new TransformControls(camera,renderer.domElement);gizmo.setSize(.85);gizmo.setSpace('world');scene.add(gizmo.getHelper());
  const raycaster=new THREE.Raycaster(),mouse=new THREE.Vector2(),records=new Map();let displayBytes=0,marquee=null,handleDrag=null,sectionIds=new Set(),previewIds=new Set(),previewAllowedIds=new Set(),previewReplaceIds=new Set(),alignmentReference=null,dragInteraction=null,interactionDrag=null;
  // This is a view preference: existing mesh opacity, project data and exports stay intact.
  const meshNotice=document.createElement('label'),meshOpaque=document.createElement('input'),meshNoticeText=document.createElement('span');
  meshNotice.className='cad-mesh-display';meshNotice.hidden=true;meshOpaque.type='checkbox';meshOpaque.checked=true;
  meshNotice.title='Netzmodelle deckend anzeigen. Ausschalten, um die eingestellte Deckkraft zu sehen. Lochkörper und Vorschauen behalten ihre besondere Darstellung.';
  meshNotice.append(meshOpaque,meshNoticeText);(viewport.querySelector('.view-bottom')??viewport).prepend(meshNotice);
  function displayOpacity(record,node,{temporary=false}={}){return projectObjectIsHole(node)?.28:temporary?.65:node.kind==='mesh'&&meshOpaque.checked?1:record.opacity??node.opacity??1;}
  function updateMaterialOpacity(material,opacity){if(material.transparent!==(opacity<1))material.needsUpdate=true;material.opacity=opacity;material.transparent=opacity<1;material.depthWrite=opacity>=1;}
  function updateMeshNotice(){const meshIds=new Set(getProject().nodes.filter(n=>n.kind==='mesh').map(n=>n.id)),ids=new Set();for(const group of [bodies,section,preview,sources])for(const mesh of group.children)if(mesh.visible&&meshIds.has(mesh.userData.rootId))ids.add(mesh.userData.rootId);const hidden=!ids.size,text=ids.size===1?'Netzmodell deckend':`${ids.size} Netzmodelle deckend`;if(meshNotice.hidden!==hidden)meshNotice.hidden=hidden;if(meshNoticeText.textContent!==text)meshNoticeText.textContent=text;}
  meshOpaque.onchange=()=>{const nodes=new Map(getProject().nodes.map(n=>[n.id,n]));for(const mesh of bodies.children){const node=nodes.get(mesh.userData.rootId);if(node?.kind==='mesh')updateMaterialOpacity(mesh.material,displayOpacity(mesh.userData.record,node));}invalidate('mesh-opacity');};
  let isolationIds=null;
  const allows=id=>!isolationIds||isolationIds.has(id);
  function refreshVisibility(){assemblyBoxes.visibility(id=>allows(id)&&!previewIds.has(id)&&!sectionIds.has(id));for(const mesh of thicknessMarks.children){const node=getProject().nodes.find(n=>n.id===thicknessId);mesh.visible=!!node&&visible(node,getProject());}const project=getProject(),nodes=new Map(project.nodes.map(n=>[n.id,n])),inspected=nodes.get(inspectionResult?.objectId);meshInspectionMarks.visible=!!inspected&&inspected.mesh===inspectionSource&&visible(inspected,project)&&!sectionIds.has(inspected.id)&&!previewIds.has(inspected.id)&&!sources.children.some(m=>m.userData.rootId===inspected.id);if(meshInspectionMarks.visible)for(const o of meshInspectionMarks.children){o.matrix.fromArray(inspected.transform);o.matrixWorldNeedsUpdate=true;}for(const overlay of meshProtectionMarks.children){const n=nodes.get(overlay.userData.rootId);overlay.visible=!!n&&visible(n,project)&&!sectionIds.has(n.id)&&!previewIds.has(n.id);if(n){overlay.matrix.fromArray(n.transform);overlay.matrixWorldNeedsUpdate=true;}}const sourceIds=new Set(sources.children.map(mesh=>mesh.userData.rootId));for(const mesh of bodies.children){const node=nodes.get(mesh.userData.rootId);mesh.visible=!!node&&node.id!==thicknessId&&visible(node,project)&&!sectionIds.has(node.id)&&!previewIds.has(node.id)&&!sourceIds.has(node.id);}for(const group of [sources,section,preview])for(const mesh of group.children)mesh.visible=allows(mesh.userData.rootId)||(group===preview&&previewAllowedIds.has(mesh.userData.rootId));for(const helper of outlines.children)helper.visible=allows(helper.userData.rootId)&&!previewIds.has(helper.userData.rootId);const marked=nodes.get(meshSelectionBinding?.objectId);meshSelectionMarks.visible=!!marked&&marked.mesh===meshSelectionSource&&visible(marked,project)&&!flags(marked,project).locked&&!sectionIds.has(marked.id)&&!previewIds.has(marked.id)&&!sourceIds.has(marked.id);if(marked&&meshSelectionMarks.visible)for(const overlay of meshSelectionMarks.children){overlay.matrix.fromArray(marked.transform);overlay.matrixWorldNeedsUpdate=true;}if(comparisonIds.size)for(const group of [bodies,sources,section,preview,outlines,meshSelectionMarks,meshProtectionMarks,meshInspectionMarks])for(const o of group.children)if(comparisonIds.has(o.userData.rootId))o.visible=false;}
  function cast(event){camera.updateMatrixWorld(true);const rect=renderer.domElement.getBoundingClientRect();updateHandles(rect);scene.updateMatrixWorld(true);mouse.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(mouse,camera);return raycaster.ray;}
  function cadRay(event){const ray=cast(event);return {origin:ray.origin.toArray(),direction:ray.direction.toArray(),far:1e9};}
  function visible(node,project){return allows(node.id)&&cadPermanentlyVisible(node,project);}
  function clear(group){for(const child of [...group.children])dispose(child);}
  function makeMesh(record,node,{temporary=false}={}){
    const reference=record.kind!=='cad',geometry=buildGeometry(record.mesh,reference),color=projectObjectIsHole(node)?'#89929e':temporary?(record.previewColor??'#efa23b'):record.color??node.color??'#ef6948',opacity=displayOpacity(record,node,{temporary});
    const overlay=temporary&&record.previewOverlay===true,material=overlay?new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity:.95,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}):new THREE.MeshStandardMaterial({color,roughness:.62,metalness:.03,side:THREE.DoubleSide,transparent:opacity<1,opacity,depthWrite:opacity>=1});const mesh=new THREE.Mesh(geometry,material);if(overlay)mesh.renderOrder=45;
    stepFaceAppearance(mesh,temporary&&record.previewColor?{...record,faceColors:null}:record,node);
    setCadCutoutMaterial(material,projectObjectIsHole(node));
    if(reference&&!temporary){const contour=meshDisplayEdges(geometry);contour.visible=!projectObjectIsHole(node);contour.userData.meshContour=true;contour.userData.rootId=record.rootId??node.id;mesh.add(contour);material.polygonOffset=true;material.polygonOffsetFactor=1;material.polygonOffsetUnits=1;}
    mesh.matrixAutoUpdate=false;mesh.matrix.fromArray(record.transform);mesh.userData={id:node.id,rootId:record.rootId??node.id,reference,record,objectColor:record.color??node.color,cutout:projectObjectIsHole(node),originalMatrix:mesh.matrix.clone()};return mesh;
  }
  function stepFaceAppearance(mesh,record,node){
    const faces=projectObjectIsHole(node)?null:record.faceColors,base=record.color??node.color??'#ef6948',key=faces?.length?JSON.stringify([faces,base]):null;
    if(mesh.userData.faceColorKey===key)return;mesh.userData.faceColorKey=key;
    let g=mesh.geometry;const m=mesh.material;
    if(key&&record.kind!=='cad'&&g.index){const next=g.toNonIndexed();next.userData={...g.userData};g.dispose();mesh.geometry=g=next;}
    if(!key){g.deleteAttribute('color');m.vertexColors=false;m.needsUpdate=true;return;}
    const colors=new Float32Array(g.attributes.position.count*3),c=new THREE.Color(base);for(let i=0;i<colors.length;i+=3)c.toArray(colors,i);
    const lookup=new Map(faces.map(f=>[f.faceIndex,f.color])),groups=g.userData.cadFaceGroups??[];
    if(record.kind!=='cad')for(const [triangle,color]of lookup){c.set(color);for(let j=triangle*3;j<triangle*3+3;j++)if(j<g.attributes.position.count)c.toArray(colors,j*3);}
    for(let i=0;i<groups.length;i+=3){const value=lookup.get(groups[i+2]);if(!value)continue;c.set(value);for(let j=groups[i];j<groups[i]+groups[i+1];j++)c.toArray(colors,g.index.array[j]*3);}
    g.setAttribute('color',new THREE.BufferAttribute(colors,3));m.vertexColors=true;m.color.set('#ffffff');m.needsUpdate=true;
  }
  function clearThickness(){clear(thicknessMarks);thicknessId=null;refreshVisibility();invalidate('thickness-clear');}
  function setThickness(id,input,result,low,high){
    if(result.values.length!==input.triangles.length/3)throw Error('Wanddickenkarte gehört zu einer anderen Oberfläche.');
    const old=thicknessMarks.children[0];
    if(thicknessId===id&&old?.userData.input===input&&old.userData.result===result){const color=old.geometry.attributes.color;for(let i=0;i<input.triangles.length;i++)color.array.set(thicknessColor(result.values[Math.floor(i/3)],low,high),i*3);color.needsUpdate=true;invalidate('thickness-colors');return;}
    const positions=new Float32Array(input.triangles.length*3),colors=new Float32Array(positions.length);
    for(let i=0;i<input.triangles.length;i++){const vertex=input.triangles[i];for(let k=0;k<3;k++)positions[i*3+k]=input.vertices[vertex*3+k];colors.set(thicknessColor(result.values[Math.floor(i/3)],low,high),i*3);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));g.setAttribute('color',new THREE.BufferAttribute(colors,3));g.computeBoundingSphere();
    const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,toneMapped:false}));mesh.userData={rootId:id,input,result};
    clear(thicknessMarks);thicknessId=id;thicknessMarks.add(mesh);refreshVisibility();invalidate('thickness-map');
  }
  let stagedDisplay=null,bedSignature=null,lastReuse=0,lastCreated=0,pendingCommit=false;
  function dropStage(){if(stagedDisplay){for(const entry of stagedDisplay.entries)if(!entry.reused)dispose(entry.mesh);stagedDisplay=null;}}
  const sameArray=(a,b,float=false)=>!!a&&!!b&&a.length===b.length&&a.every((v,i)=>v===(float?Math.fround(b[i]):b[i]));
  function sameGeometry(mesh,record){const data=record.mesh,g=mesh.geometry;if(record.kind!=='cad'&&mesh.userData.reference)return meshDisplayMatches(g,data);if(record.kind==='cad'&&!mesh.userData.reference&&isCadDisplaySnapshot(data)&&mesh.userData.record.mesh===data)return true;return mesh.userData.reference===(record.kind!=='cad')&&sameArray(g.attributes.position.array,data.vertices??data.verts,true)&&sameArray(g.index?.array,data.triangles)&&((record.kind!=='cad')||(sameArray(g.attributes.normal.array,data.normals,true)&&sameArray(g.userData.cadFaceGroups,data.faceGroups)));}
  function prepareDisplay(result,project=getProject()){
    const entries=[],nodes=new Map(project.nodes.map(n=>[n.id,n])),available=new Map([...records].map(([id,meshes])=>[id,[...meshes]]));let nextBytes=0;
    try{for(const record of result.meshes??result){const node=nodes.get(record.rootId??record.id);if(!node)continue;const data=record.mesh,positions=data.vertices??data.verts;
      const verified=record.kind==='cad'&&isCadDisplaySnapshot(data);
      if((!verified&&(!Array.isArray(positions)||!positions.length||positions.length%3||positions.some(v=>!Number.isFinite(Math.fround(v)))||!Array.isArray(data.triangles)||!data.triangles.length||data.triangles.length%3||data.triangles.some(v=>!Number.isSafeInteger(v)||v<0||v>=positions.length/3)))||record.transform?.length!==16||record.transform.some(v=>!Number.isFinite(v)))throw Error('Ungültige CAD-Anzeigepuffer.');
      if(record.kind==='cad'&&!verified&&(!Array.isArray(data.normals)||data.normals.length!==positions.length||data.normals.some(v=>!Number.isFinite(Math.fround(v)))||!Array.isArray(data.faceGroups)))throw Error('Ungültige CAD-Anzeigepuffer.');
      nextBytes+=record.kind!=='cad'?data.triangles.length*48:(record.faceColors?.length?positions.length*4:0)+positions.length*4+(data.normals?.length??0)*4+data.triangles.length*4+(data.faceGroups?.length??0)*4;if(nextBytes>128*1024*1024)throw Error('Die CAD-Darstellung überschreitet 128 MB. Anzeigequalität reduzieren.');
      const candidates=available.get(node.id)??[],index=candidates.findIndex(mesh=>sameGeometry(mesh,record)),reused=index>=0,mesh=reused?candidates.splice(index,1)[0]:makeMesh(record,node);entries.push({mesh,record:{...record,transform:[...record.transform]},node:{id:node.id,kind:node.kind,meshRole:node.meshRole,solid:node.solid,color:node.color,opacity:node.opacity},reused});
    }}catch(error){for(const entry of entries)if(!entry.reused)dispose(entry.mesh);throw error;}
    return {result,entries,nextBytes};
  }
  function validateDisplay(result,project){dropStage();stagedDisplay=prepareDisplay(result,project);return {bytes:stagedDisplay.nextBytes,maxBytes:128*1024*1024};}
  function setDisplay(result,project=getProject()){
    const prepared=stagedDisplay?.result===result?stagedDisplay:prepareDisplay(result,project);if(prepared===stagedDisplay)stagedDisplay=null;else dropStage();
    clearAlignmentPreview();const keep=new Set(prepared.entries.map(e=>e.mesh));for(const mesh of [...bodies.children])if(!keep.has(mesh))dispose(mesh);records.clear();displayBytes=prepared.nextBytes;lastReuse=0;lastCreated=0;
    for(const {mesh,record,node,reused}of prepared.entries){if(reused)lastReuse++;else lastCreated++;
      const cutout=projectObjectIsHole(node),opacity=displayOpacity(record,node),material=mesh.material;material.color.set(cutout?'#89929e':record.color??node.color??'#ef6948');if(mesh.userData.cutout!==cutout)setCadCutoutMaterial(material,cutout);mesh.userData.cutout=cutout;for(const child of mesh.children)if(child.userData.meshContour)child.visible=!cutout;updateMaterialOpacity(material,opacity);stepFaceAppearance(mesh,record,node);mesh.userData.meshStyleKey=null;if(material.vertexColors)material.color.set('#ffffff');
      mesh.matrix.fromArray(record.transform);mesh.matrixWorldNeedsUpdate=true;mesh.userData.record=record;mesh.userData.objectColor=record.color??node.color;mesh.userData.originalMatrix=mesh.matrix.clone();bodies.add(mesh);const list=records.get(node.id)??[];list.push(mesh);records.set(node.id,list);
    }
    sectionPreview.rebind();refreshVisibility();updateBed(project);setSelection(getSelection(),getScene());
  }
  function sourceInfo(target,info=getScene()){const id=target.path.at(-1)??target.rootId;return info?.objects?.find(v=>v.id===id&&v.target.rootId===target.rootId);}
  function frame(project=getProject()){return new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion(...project.workplane.orientation)).setPosition(...project.workplane.origin);}
  function plane(event,at){const project=getProject(),normal=new THREE.Vector3(0,0,1).applyQuaternion(new THREE.Quaternion(...project.workplane.orientation)),surface=new THREE.Plane().setFromNormalAndCoplanarPoint(normal,at??point(project.workplane.origin));return cast(event).intersectPlane(surface,new THREE.Vector3());}
  function projected(pointValue){camera.updateMatrixWorld(true);const projected=point(pointValue).project(camera),rect=renderer.domElement.getBoundingClientRect();return {x:rect.left+(projected.x+1)*rect.width/2,y:rect.top+(1-projected.y)*rect.height/2,z:projected.z};}
  const scaleDimensions=createScaleDimensions({viewport,projectPoint:projected,getPreferences});
  const moveDimensions=createMoveDimensions({viewport,projectPoint:projected,getPreferences});
  const rotationHandles=createCadRotationHandles({host:viewport,camera:()=>camera,scene,getFrame:()=>{
    if(closed||pendingCommit||gesture||handleDrag||interaction||dragInteraction||!canEdit()||!selection.length)return null;
    const items=selection.map(target=>sourceInfo(target));
    if(items.some(item=>!item||assemblyBoxes.proxies.some(p=>p.userData.rootId===item.target.rootId)||item.hidden||item.locked||!allows(item.target.rootId)||previewIds.has(item.target.rootId)))return null;
    const bounds=selectionBounds(getScene(),items);if(!bounds)return null;
    const project=getProject();return {bounds,center:point(bounds.center),size:point(bounds.size),obstacles:handles.children.map(h=>h.position.clone()),quaternion:project.coordinateMode==='plane'?new THREE.Quaternion(...project.workplane.orientation):new THREE.Quaternion()};
  },onStart:()=>{const started=startGesture({translation:false});if(started){gizmo.detach();clear(handles);clear(outlines);}return started;},onPreview:delta=>moveGesture(matrix(delta)),onEnd:()=>void finishGesture(),onCancel:()=>cancel(),invalidate});
  const sectionPreview=createCadSectionPreview({renderer,scene,bodies,outlines,getCamera:()=>camera,projectPoint:projected,orbit,invalidate});
  function pixelRadius(position,pixels,rect=renderer.domElement.getBoundingClientRect()){return camera.isPerspectiveCamera?camera.position.distanceTo(position)*Math.tan(camera.fov*Math.PI/360)*2*pixels/rect.height:(camera.top-camera.bottom)/camera.zoom*pixels/rect.height;}
  function updateBed(project){
    const signature=JSON.stringify([project.bed,project.workplane.origin,project.workplane.orientation,getPreferences().gridVisible]);if(signature===bedSignature)return;bedSignature=signature;
    clear(bed);const data=cadBedGrid(...project.bed),onGround=workplaneOnGround(project.workplane);
    function addGrid(transform,active){for(const [kind,positions]of Object.entries(data)){
      if(!positions.length)continue;const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      const colors=active?{minor:0xcdd7e2,major:0xa4b3c5,axes:0xe2913d,border:0xe2913d}:{minor:0xd5dee7,major:0xb6c4d2,axes:0xa4b3c5,border:0x9baabd};
      const line=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:colors[kind],depthWrite:false}));line.matrixAutoUpdate=false;line.matrix.copy(transform);line.visible=kind==='border'||getPreferences().gridVisible;line.userData={gridKind:kind,activeGrid:active};bed.add(line);
    }}
    // Coplanar ground/workplane grids otherwise create interference patterns.
    if(!onGround)addGrid(new THREE.Matrix4(),false);
    addGrid(frame(project),true);
  }
  function selectionBounds(info=getScene(),items=selection.map(target=>sourceInfo(target,info))){
    const values=items.filter(v=>v?.worldBounds);
    if(!values.length)return null;const min=[0,1,2].map(k=>Math.min(...values.map(v=>v.worldBounds.min[k]))),max=[0,1,2].map(k=>Math.max(...values.map(v=>v.worldBounds.max[k])));return {min,max,center:min.map((v,k)=>(v+max[k])/2),size:min.map((v,k)=>max[k]-v)};
  }
  function setSelection(targets,info=getScene()){
    if(jointView?.state().active||explosionView?.state().active){selection=structuredClone(targets??[]);gizmo.detach();clear(outlines);clear(handles);invalidate('joint-selection');return;}
    if(!handleDrag&&!gesture){scaleDimensions.hide();moveDimensions.hide();}
    selection=structuredClone(targets??[]);clear(outlines);clear(handles);gizmo.detach();
    const lookup=new Map((info?.objects??[]).map(item=>[targetKey(item.target),item])),items=selection.map(target=>lookup.get(targetKey(target))),bounds=selectionBounds(info,items);for(let i=0;i<selection.length;i++){const target=selection[i],item=items[i];if(item?.worldBounds){const box=new THREE.Box3(point(item.worldBounds.min),point(item.worldBounds.max)),helper=new THREE.Box3Helper(box,item.locked?0x8390a0:0xf3a448);helper.userData={rootId:target.rootId,locked:item.locked};helper.visible=allows(target.rootId)&&!previewIds.has(target.rootId);if(alignmentReference)helper.material.color.set(target.rootId===alignmentReference?'#ffc44b':'#4a9cac');outlines.add(helper);}}
    if(!bounds||pendingCommit||!canEdit()||interaction||dragInteraction||items.some(item=>item?.locked||assemblyBoxes.proxies.some(p=>p.userData.rootId===item?.target.rootId)))return;
    const project=getProject();pivot.position.copy(point(bounds.center));pivot.quaternion.copy(project.coordinateMode==='plane'?new THREE.Quaternion(...project.workplane.orientation):new THREE.Quaternion());pivot.scale.set(1,1,1);pivot.updateMatrixWorld(true);gizmo.setMode(mode);gizmo.setSpace(mode==='scale'?'local':project.coordinateMode==='plane'?'local':'world');if(mode!=='rotate')gizmo.attach(pivot);
    if(selection.length===1){const item=items[0];if(item&&item.localBounds&&item.localBounds.size.every(v=>v>0)){
      const b=item.localBounds;
      function addScaleHandle(local,corner,scaleAxes,kind){
        const position=point(cadPoint(item.worldMatrix,local)),handle=new THREE.Mesh(new THREE.BoxGeometry(1.6,1.6,.45),new THREE.MeshBasicMaterial({color:kind==='side'?'#344c5c':'#ffffff',depthTest:false}));
        handle.position.copy(position);handle.quaternion.copy(camera.quaternion);handle.scale.setScalar(pixelRadius(position,getPreferences().handleSize??14)/2);handle.renderOrder=20;
        handle.userData={corner,scaleAxes,kind,height:kind==='height',local,target:selection[0],item};handles.add(handle);
      }
      for(const sx of [-1,1])for(const sy of [-1,1])addScaleHandle([sx===1?b.max[0]:b.min[0],sy===1?b.max[1]:b.min[1],b.min[2]],[sx,sy,-1],[0,1],'corner');
      for(const sign of [-1,1]){
        addScaleHandle([sign===1?b.max[0]:b.min[0],b.center[1],b.min[2]],[sign,1,-1],[0],'side');
        addScaleHandle([b.center[0],sign===1?b.max[1]:b.min[1],b.min[2]],[1,sign,-1],[1],'side');
      }
      addScaleHandle([b.center[0],b.center[1],b.max[2]],[1,1,1],[2],'height');
      // The black lift cone moves the part; the white top square changes height.
      const axis=new THREE.Vector3(0,0,1).applyQuaternion(new THREE.Quaternion(...project.workplane.orientation)),position=point(cadPoint(item.worldMatrix,[b.center[0],b.center[1],b.max[2]]));
      position.addScaledVector(new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion),pixelRadius(position,getPreferences().handleSize??14)*3);
      const lift=new THREE.Mesh(new THREE.ConeGeometry(.75,1.6,4),new THREE.MeshBasicMaterial({color:'#243649',depthTest:false}));lift.position.copy(position);lift.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),axis);lift.scale.setScalar(pixelRadius(position,getPreferences().handleSize??14)/2);lift.renderOrder=20;lift.userData={lift:true,axis:axis.toArray(),target:selection[0],item};handles.add(lift);
      if(mode==='scale')gizmo.detach();

    }}
  }
  function gestureMeshes(){const chosen=new Set(selection.filter(target=>!target.path.length).map(target=>target.rootId)),sourceKeys=new Set(selection.filter(target=>target.path.length).map(targetKey));return [...bodies.children.filter(mesh=>chosen.has(mesh.userData.rootId)&&mesh.visible),...sources.children.filter(mesh=>mesh.visible&&mesh.userData.sourceTarget&&sourceKeys.has(targetKey(mesh.userData.sourceTarget)))];}
  function startGesture({translation=mode==='translate'}={}){const bounds=selectionBounds();if(!bounds||pendingCommit||!canEdit())return false;gesture={targets:structuredClone(selection),revision:getScene()?.revision,pivot:pivot.matrixWorld.clone(),matrices:gestureMeshes().map(mesh=>[mesh,mesh.matrix.clone()]),center:point(bounds.center),bounds,planeMatrix:frame().toArray(),translation,delta:cadIdentity()};orbit.enabled=false;return true;}
  function moveGesture(delta){if(!gesture)return;gesture.delta=delta.toArray();for(const [mesh,original]of gesture.matrices){mesh.matrix.copy(delta).multiply(original);mesh.matrixWorldNeedsUpdate=true;}if(gesture.translation){const {bounds,planeMatrix}=gesture;moveDimensions.update({bounds,planeMatrix,delta:gesture.delta.slice(12,15),gap:Math.max(2,pixelRadius(point(cadPoint(planeMatrix,[0,0,0])),22))});}clear(outlines);clear(handles);}
  async function commitGesture(data,commit){
    pendingCommit=true;clear(outlines);clear(handles);gizmo.detach();invalidate('commit-start');
    try{await commit();}catch(error){
      if(getScene()?.revision===data.revision)for(const [mesh,original]of data.matrices){mesh.matrix.copy(original);mesh.matrixWorldNeedsUpdate=true;}
      onError(error);
    }finally{pendingCommit=false;if(!closed){setSelection(getSelection(),getScene());invalidate('commit-end');}}
  }
  async function finishGesture(){if(!gesture)return;const completed=gesture;gesture=null;scaleDimensions.hide();moveDimensions.hide();orbit.enabled=true;await commitGesture(completed,()=>onGesture?.({targets:completed.targets,revision:completed.revision,delta:completed.delta}));}
  gizmo.addEventListener('mouseDown',()=>{pivot.updateMatrixWorld(true);startGesture();});
  gizmo.addEventListener('objectChange',()=>{if(gesture){pivot.updateMatrixWorld(true);moveGesture(pivot.matrixWorld.clone().multiply(gesture.pivot.clone().invert()));}});
  gizmo.addEventListener('mouseUp',()=>void finishGesture());
  function visualHit(event){cast(event);return cadVisibleRayHit(raycaster,sources.children,[...bodies.children,...assemblyBoxes.proxies]);}
  function updateMarquee(start,event){
    if(Math.hypot(event.clientX-start.x,event.clientY-start.y)<4)return;
    const rect={left:Math.min(start.x,event.clientX),right:Math.max(start.x,event.clientX),top:Math.min(start.y,event.clientY),bottom:Math.max(start.y,event.clientY)},canvas=renderer.domElement.getBoundingClientRect();
    const clipRect={left:Math.max(-1,(rect.left-canvas.left)/canvas.width*2-1),right:Math.min(1,(rect.right-canvas.left)/canvas.width*2-1),bottom:Math.max(-1,1-(rect.bottom-canvas.top)/canvas.height*2),top:Math.min(1,1-(rect.top-canvas.top)/canvas.height*2)};
    camera.updateMatrixWorld(true);scene.updateMatrixWorld(true);
    const cameraMatrix=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse),chosen=[];
    for(const item of getScene()?.objects??[]){
      if(item.target.path.length||item.hidden||!allows(item.target.rootId))continue;
      const bounds=item.worldBounds,points=bounds?localCorners(bounds).map(projected):[];
      if(points.length&&points.every(p=>p.z>=-1&&p.z<=1)&&
        (points.every(p=>p.x<rect.left)||points.every(p=>p.x>rect.right)||points.every(p=>p.y<rect.top)||points.every(p=>p.y>rect.bottom)))continue;
      // Root records remain available while source editing temporarily hides
      // their display. A marquee returns to selecting whole, visible parts.
      if((records.get(item.id)??[]).some(mesh=>marqueeIntersectsMesh(mesh.geometry.attributes.position.array,mesh.geometry.index?.array,cameraMatrix.clone().multiply(mesh.matrixWorld).elements,clipRect)))chosen.push(item.target);
    }
    for(const proxy of assemblyBoxes.proxies){if(!proxy.visible)continue;const box=new THREE.Box3().setFromObject(proxy),points=localCorners({min:box.min.toArray(),max:box.max.toArray()}).map(projected);if(points.some(p=>p.z>=-1&&p.z<=1)&&!points.every(p=>p.x<rect.left)&&!points.every(p=>p.x>rect.right)&&!points.every(p=>p.y<rect.top)&&!points.every(p=>p.y>rect.bottom))chosen.push({rootId:proxy.userData.rootId,path:[]});}
    const next=start.append?[...start.base,...chosen.filter(t=>!start.base.some(v=>targetKey(v)===targetKey(t)))]:chosen;
    if(next.length!==selection.length||next.some((t,i)=>targetKey(t)!==targetKey(selection[i])))select(next);
  }
  renderer.domElement.addEventListener('pointerdown',event=>{
    if(event.button!==0||gizmo.dragging)return;if(pendingCommit||!canEdit()){event.preventDefault();event.stopImmediatePropagation();return;}const hit=visualHit(event);
    if(dragInteraction?.start({ray:cadRay(event),event,hit})){event.preventDefault();event.stopImmediatePropagation();interactionDrag={x:event.clientX,y:event.clientY,moved:false};orbit.enabled=false;renderer.domElement.setPointerCapture(event.pointerId);return;}
    // A synchronous picker can close itself and reattach the gizmo. Consume
    // its pointerdown before any later gizmo listener sees the same click.
    // Native edge selection opts into its own canvas capture listeners.
    // Other pickers retain exclusive ownership of the pointerdown.
    if(interaction){event.preventDefault();if(interactionAllowsCanvasListeners)event.stopPropagation();else event.stopImmediatePropagation();void Promise.resolve(interaction(cadRay(event),event,hit)).catch(onError);return;}
    cast(event);const handle=raycaster.intersectObjects(handles.children,false).sort((a,b)=>{const pa=projected(a.object.position.toArray()),pb=projected(b.object.position.toArray());return Math.hypot(pa.x-event.clientX,pa.y-event.clientY)-Math.hypot(pb.x-event.clientX,pb.y-event.clientY);})[0];
    if(handle){event.preventDefault();event.stopImmediatePropagation();const {item,target,corner,lift,axis,scaleAxes,local}=handle.object.userData,position=handle.object.position.clone(),surface=new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()),position),source={kind:'cad',transform:item.transform,stats:{bounds:item.localBounds}},sizes=item.localBounds.size.map((v,k)=>v*Math.hypot(item.transform[k*4],item.transform[k*4+1],item.transform[k*4+2]));handleDrag={item,target,corner,lift,axis,scaleAxes,local,position,x:event.clientX,y:event.clientY,surface,source,sizes,latest:sizes,revision:getScene()?.revision,matrices:gestureMeshes().map(mesh=>[mesh,mesh.matrix.clone()])};if(!lift){handleDrag.screenAxes=scaleAxes.map(k=>{const end=local.slice();end[k]+=item.localBounds.size[k];const a=projected(position.toArray()),b=projected(cadPoint(item.worldMatrix,end));return {axis:k,x:b.x-a.x,y:b.y-a.y};});scaleDimensions.update({bounds:item.localBounds,worldMatrix:item.worldMatrix,sizes});}orbit.enabled=false;renderer.domElement.setPointerCapture(event.pointerId);return;}
    if(gizmo.axis)return;
    const id=hit?.object.userData.rootId,target=hit?.object.userData.sourceTarget??(id?{rootId:id,path:[]}:null);
    if(target){if(hit.object.userData.simplified){select(event.shiftKey?[...selection,target]:[target]);event.preventDefault();event.stopImmediatePropagation();return;}const existing=selection.some(v=>targetKey(v)===targetKey(target));select(event.shiftKey?existing?selection.filter(v=>targetKey(v)!==targetKey(target)):[...selection,target]:existing?selection:[target]);
      const bounds=selectionBounds();if(bounds&&!sourceInfo(target)?.locked&&!event.shiftKey){const anchor=plane(event,point(bounds.center));if(anchor)marquee={move:true,x:event.clientX,y:event.clientY,anchor,bounds};}
    }else{marquee={move:false,x:event.clientX,y:event.clientY,append:event.shiftKey,base:structuredClone(selection)};if(!event.shiftKey)select([]);}
    renderer.domElement.setPointerCapture(event.pointerId);
  },true);
  renderer.domElement.addEventListener('pointermove',event=>{
    if(interactionDrag){if(Math.hypot(event.clientX-interactionDrag.x,event.clientY-interactionDrag.y)>=4)interactionDrag.moved=true;if(interactionDrag.moved)dragInteraction?.move({ray:cadRay(event),event});return;}
    if(handleDrag?.lift){const data=handleDrag;if(Math.hypot(event.clientX-data.x,event.clientY-data.y)<4&&!data.moved)return;data.moved=true;let amount=(data.y-event.clientY)*pixelRadius(data.position,1);const snap=Number(getPreferences().snap)||0;if(snap)amount=Math.round(amount/snap)*snap;const delta=new THREE.Matrix4().makeTranslation(...data.axis.map(v=>v*amount));data.delta=delta.toArray();for(const [mesh,original]of data.matrices){mesh.matrix.copy(delta).multiply(original);mesh.matrixWorldNeedsUpdate=true;}return;}
    if(handleDrag){
      const data=handleDrag,dx=event.clientX-data.x,dy=event.clientY-data.y;
      if(Math.hypot(dx,dy)<4&&!data.moved)return;
      data.moved=true;
      const sizes=data.sizes.slice(),axes=data.screenAxes;
      function change(axis,ratio){let value=data.sizes[axis]*(1+ratio*data.corner[axis]);const snap=Number(getPreferences().snap)||0;if(snap)value=Math.round(value/snap)*snap;sizes[axis]=Math.max(.01,Math.min(10000,value));}
      if(axes.length===2){
        const [a,b]=axes,det=a.x*b.y-a.y*b.x;
        if(Math.abs(det)>1e-4){change(a.axis,(dx*b.y-dy*b.x)/det);change(b.axis,(a.x*dy-a.y*dx)/det);}
        else for(const a of axes){const length2=a.x*a.x+a.y*a.y;if(length2>16)change(a.axis,(dx*a.x+dy*a.y)/length2);}
      }else{
        const a=axes[0],length2=a.x*a.x+a.y*a.y;
        if(length2>16)change(a.axis,(dx*a.x+dy*a.y)/length2);
        else if(a.axis===2){const worldSize=data.item.localBounds.size[2]*Math.hypot(...data.item.worldMatrix.slice(8,11));change(2,-dy*pixelRadius(data.position,1)/worldSize);}
      }
      data.latest=sizes;
      const resized=resizeCadAtCorner(data.source,sizes,{corner:data.corner}),parent=multiplyCadMatrices(data.item.worldMatrix,inverseCadMatrix(data.item.transform)),next=multiplyCadMatrices(parent,resized.transform),delta=matrix(multiplyCadMatrices(next,inverseCadMatrix(data.item.worldMatrix)));
      scaleDimensions.update({bounds:data.item.localBounds,worldMatrix:next,sizes});
      for(const [mesh,original]of data.matrices){mesh.matrix.copy(delta).multiply(original);mesh.matrixWorldNeedsUpdate=true;}
      for(const handle of handles.children)if(handle.userData.local)handle.position.copy(point(cadPoint(next,handle.userData.local)));
      clear(outlines);
      return;
    }
    if(!marquee)return;
    if(marquee.move){if(!gesture&&Math.hypot(event.clientX-marquee.x,event.clientY-marquee.y)>4)startGesture({translation:true});if(gesture){const current=plane(event,point(marquee.bounds.center));if(current){const delta=current.sub(marquee.anchor),snap=Number(getPreferences().snap)||0;if(snap){const basis=frame().clone().setPosition(0,0,0),local=delta.clone().applyMatrix4(basis.clone().invert());local.toArray().forEach((v,k)=>local.setComponent(k,Math.round(v/snap)*snap));delta.copy(local.applyMatrix4(basis));}moveGesture(new THREE.Matrix4().makeTranslation(delta.x,delta.y,delta.z));}}}
    else{const element=document.getElementById('selection-marquee');if(element){element.style.display='block';element.style.left=Math.min(marquee.x,event.clientX)-viewport.getBoundingClientRect().left+'px';element.style.top=Math.min(marquee.y,event.clientY)-viewport.getBoundingClientRect().top+'px';element.style.width=Math.abs(event.clientX-marquee.x)+'px';element.style.height=Math.abs(event.clientY-marquee.y)+'px';}updateMarquee(marquee,event);}
  });
  renderer.domElement.addEventListener('pointerup',event=>{
    if(interactionDrag){const completed=interactionDrag;interactionDrag=null;orbit.enabled=true;void Promise.resolve(dragInteraction?.end({ray:cadRay(event),event,moved:completed.moved})).catch(onError);return;}
    if(handleDrag){const data=handleDrag;handleDrag=null;scaleDimensions.hide();orbit.enabled=true;if(data.moved&&(data.lift||data.latest.some((v,k)=>v!==data.sizes[k])))void commitGesture(data,()=>data.lift?onGesture?.({targets:[data.target],delta:data.delta,revision:data.revision}):onResize?.({target:data.target,size:data.latest,corner:data.corner,revision:data.revision}));else if(!data.lift&&!data.moved)onDimensions?.({item:data.item,target:data.target,corner:data.corner,event});return;}
    if(!marquee)return;const start=marquee;marquee=null;document.getElementById('selection-marquee')?.style.setProperty('display','none');
    if(start.move){void finishGesture();return;}
    updateMarquee(start,event);
  });
  function cancel(){rotationHandles.cancel({notify:false});dropStage();clearAlignmentPreview();scaleDimensions.hide();moveDimensions.hide();const originalSelection=marquee&&!marquee.move?marquee.base:null;const active=!!gesture||!!handleDrag||!!interactionDrag;if(gesture){for(const [mesh,original]of gesture.matrices){mesh.matrix.copy(original);mesh.matrixWorldNeedsUpdate=true;}gesture=null;}if(handleDrag){for(const [mesh,original]of handleDrag.matrices){mesh.matrix.copy(original);mesh.matrixWorldNeedsUpdate=true;}handleDrag=null;}dragInteraction?.cancel?.();dragInteraction=null;interactionDrag=null;marquee=null;document.getElementById('selection-marquee')?.style.setProperty('display','none');orbit.enabled=true;gizmo.dragging=false;gizmo.axis=null;interaction=null;interactionAllowsCanvasListeners=false;if(originalSelection)select(originalSelection);setSelection(getSelection(),getScene());return active;}
  renderer.domElement.addEventListener('pointercancel',()=>{cancel();document.getElementById('selection-marquee')?.style.setProperty('display','none');});
  renderer.domElement.addEventListener('lostpointercapture',()=>{if(gesture||handleDrag||marquee||interactionDrag)cancel();});
  function fit(items,{includePreview=false}={}){const targets=items??getScene()?.objects?.filter(item=>!item.target.path.length&&!item.hidden&&allows(item.target.rootId)).map(item=>item.target)??[],values=targets.map(target=>sourceInfo(target)).filter(item=>item?.worldBounds&&allows(item.target.rootId));if(!values.length&&!includePreview)return;const box=new THREE.Box3();if(explosionView?.state().active){const chosen=new Set(targets.map(t=>t.rootId));for(const mesh of bodies.children)if(mesh.visible&&(!chosen.size||chosen.has(mesh.userData.rootId))){mesh.updateMatrixWorld(true);box.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));}}if(includePreview)for(const mesh of preview.children.filter(m=>m.visible)){mesh.updateMatrixWorld(true);box.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));}for(const item of values){const proposed=preview.children.filter(mesh=>mesh.visible&&(mesh.userData.rootId===item.target.rootId||previewReplaceIds.has(item.target.rootId)&&previewAllowedIds.has(mesh.userData.rootId)));if(proposed.length){for(const mesh of proposed){mesh.updateMatrixWorld(true);box.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));}}else{box.expandByPoint(point(item.worldBounds.min));box.expandByPoint(point(item.worldBounds.max));}}if(box.isEmpty())return;const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()).length(),direction=camera.position.clone().sub(orbit.target).normalize();orbit.target.copy(center);camera.position.copy(center).addScaledVector(direction,Math.max(40,size*1.8));if(camera.isOrthographicCamera){const aspect=host.clientWidth/Math.max(1,host.clientHeight),extent=Math.max(1,size*.575/Math.min(1,aspect));camera.zoom=camera.top/extent;camera.updateProjectionMatrix();}orbit.update();camera.updateMatrixWorld(true);invalidate('view');}
  function setView(name){const distance=Math.max(40,camera.position.distanceTo(orbit.target)),directions={iso:[1,-1.3,1.1],top:[0,0,1],bottom:[0,0,-1],front:[0,-1,0],back:[0,1,0],right:[1,0,0],left:[-1,0,0]};camera.position.copy(orbit.target).addScaledVector(point(directions[name]??directions.iso).normalize(),distance);camera.up.set(0,0,1);if(name==='top'||name==='bottom')camera.up.set(0,1,0);orbit.update();camera.updateMatrixWorld(true);invalidate('view');}
  function resize(){const width=Math.max(1,host.clientWidth),height=Math.max(1,host.clientHeight);renderer.setSize(width,height);perspective.aspect=width/height;perspective.updateProjectionMatrix();const extent=orthographic.top;orthographic.left=-extent*width/height;orthographic.right=extent*width/height;orthographic.updateProjectionMatrix();invalidate('view');}
  function viewState(){return {projection:camera.isPerspectiveCamera?'perspective':'orthographic',position:camera.position.toArray(),target:orbit.target.toArray(),up:camera.up.toArray(),zoom:camera.zoom};}
  function restoreView(value){
    cancel();camera=value.projection==='orthographic'?orthographic:perspective;orbit.object=camera;gizmo.camera=camera;
    camera.position.fromArray(value.position);camera.up.fromArray(value.up);camera.zoom=value.zoom;orbit.target.fromArray(value.target);camera.updateProjectionMatrix();resize();
    // Drain pending damping before assigning an exact saved camera.
    orbit.enableDamping=false;orbit.update();camera.position.fromArray(value.position);orbit.target.fromArray(value.target);orbit.update();orbit.enableDamping=true;camera.updateMatrixWorld(true);invalidate('view');
  }
  const observer=new ResizeObserver(resize);observer.observe(host);
  function updateHandles(rect,preferences=getPreferences()){if(!handles.children.length)return;rect??=renderer.domElement.getBoundingClientRect();for(const handle of handles.children){handle.scale.setScalar(pixelRadius(handle.position,preferences.handleSize??14,rect)/2);if(handle.userData.scaleAxes)handle.quaternion.copy(camera.quaternion);}}
  const cameraStep=createCadCameraStep({getCamera:()=>camera,orbit});
  function draw(){updateMeshNotice();const preferences=getPreferences();const style=preferences.meshDisplayStyle??'blue',styleKey=style+':'+darkTheme;if(sceneStyleKey!==styleKey){const preset=MESH_DISPLAY_STYLES[style]??MESH_DISPLAY_STYLES.blue;scene.background.set(darkTheme?'#18232e':preset.background??'#eef2f6');light.intensity=preset.light??3;for(const lamp of scene.children)if(lamp.isHemisphereLight)lamp.intensity=preset.ambient??2.5;sceneStyleKey=styleKey;}for(const mesh of bodies.children)if(mesh.userData.reference)applyMeshDisplayStyle(mesh,preferences.meshDisplayStyle,mesh.userData.record.kind==='mesh');orbit.zoomSpeed=preferences.zoomSpeed??1;gizmo.setTranslationSnap(Number(preferences.snap)||null);gizmo.setRotationSnap((Number(preferences.rotationSnap)||0)*Math.PI/180||null);updateBed(getProject());updateHandles(undefined,preferences);scaleDimensions.draw();moveDimensions.draw();rotationHandles.update();onViewUpdate();cutoutDisplay.render(scene,camera,[...bodies.children,...sources.children,...preview.children,...section.children],[bodies,sources,preview,section,bed],[sectionPreview.group,outlines,handles,edges,measurements,alignmentGhosts,annotations,meshSelectionMarks,meshProtectionMarks,meshInspectionMarks,rotationHandles.group,gizmo.getHelper()]);}
  scheduler=createCadRenderScheduler({step:cameraStep,render:draw,onError});
  orbit.addEventListener('change',()=>invalidate('camera'));
  orbit.addEventListener('start',()=>scheduler.wake());orbit.addEventListener('end',()=>scheduler.wake());
  gizmo.addEventListener('change',()=>invalidate('handles'));
  renderer.domElement.addEventListener('pointermove',event=>{if(handleDrag||gesture||interactionDrag)invalidate('gesture');else if(event.buttons)scheduler.wake();});
  renderer.domElement.addEventListener('pointerup',()=>invalidate('gesture-end'));
  let jointHidden=[];
  const jointView=createCadJointView({objectsForRoot:id=>[...bodies.children,...edges.children,...sources.children,...assemblyBoxes.group.children].filter(object=>object.userData.rootId===id),begin:()=>{gizmo.detach();clear(outlines);clear(handles);jointHidden=[annotations,measurements,section,meshSelectionMarks,meshProtectionMarks,meshInspectionMarks,thicknessMarks,comparisonMarks].map(group=>[group,group.visible]);for(const [group]of jointHidden)group.visible=false;},end:()=>{for(const [group,visible]of jointHidden)group.visible=visible;jointHidden=[];setSelection(getSelection(),getScene());},invalidate});
  let explosionHidden=[];
  const explosionView=createCadJointView({objectsForRoot:id=>[...bodies.children,...edges.children,...assemblyBoxes.group.children].filter(o=>o.userData.rootId===id),begin:()=>{gizmo.detach();clear(outlines);clear(handles);explosionHidden=[annotations,measurements,section,meshSelectionMarks,meshProtectionMarks,meshInspectionMarks,thicknessMarks,comparisonMarks].map(g=>[g,g.visible]);for(const [g]of explosionHidden)g.visible=false;},end:()=>{for(const [g,v]of explosionHidden)g.visible=v;explosionHidden=[];setSelection(getSelection(),getScene());},invalidate});
  const api={setExplosion:placements=>{jointView.clear();explosionView.preview(placements);},clearExplosion:explosionView.clear,explosionState:explosionView.state,setAssemblyBoxes:values=>{assemblyBoxes.set(values);refreshVisibility();setSelection(getSelection(),getScene());},assemblyBoxesState:assemblyBoxes.state,setJointPreview:jointView.preview,clearJointPreview:jointView.clear,jointPreviewState:jointView.state,setComparison,clearComparison,comparisonState:()=>comparisonMarks.children[0]?.userData.summary??null,setAlignmentReference:id=>{alignmentReference=id;for(const h of outlines.children)h.material.color.set(id?h.userData.rootId===id?'#ffc44b':'#4a9cac':h.userData.locked?'#8390a0':'#f3a448');},setAlignmentPreview,clearAlignmentPreview,scene,renderer,camera:()=>camera,canvas:renderer.domElement,cadRay,visualHit,projectPoint:projected,setDisplay,setSelection,fit,setView,setNavigationProfile,cancel,validateDisplay,
    offsetPreviewRoots:placements=>{const shifts=new Map(placements.map(({rootId,delta})=>{if(!Array.isArray(delta)||delta.length!==3||delta.some(v=>!Number.isFinite(v)))throw Error('Ungültiger CAD-Vorschauversatz.');return [rootId,new THREE.Matrix4().makeTranslation(...delta)];}));for(const mesh of preview.children){const shift=shifts.get(mesh.userData.rootId);if(shift){mesh.matrix.copy(mesh.userData.originalMatrix).premultiply(shift);mesh.matrixWorldNeedsUpdate=true;}}invalidate('view');},
    viewState,restoreView,getMode:()=>mode,isDragging:()=>!!gesture||!!handleDrag||!!interactionDrag,isEditing:()=>pendingCommit||!!gesture||!!handleDrag||!!interactionDrag,setMeshSelection,setMeshProtection,setMeshInspection,focusWorldPoints,meshInspectionAvailable:id=>bodies.children.some(m=>m.visible&&m.userData.rootId===id),meshSelectionCameraKey:()=>{camera.updateMatrixWorld(true);const r=renderer.domElement.getBoundingClientRect();return JSON.stringify([camera.projectionMatrix.toArray().map(n=>Math.round(n*1e9)/1e9),camera.matrixWorldInverse.toArray().map(n=>Math.round(n*1e9)/1e9),r.width,r.height]);},meshSelectionScreenContext:node=>meshSelectionScreenContext(camera,renderer.domElement,bodies,sources,node),meshSelectionHit:meshSelectionSurfaceHit,
    setIsolation:ids=>{isolationIds=ids?new Set(ids):null;refreshVisibility();},allows,
    sectionPreview,setThickness,clearThickness,
    setMode:value=>{mode=value;setSelection(getSelection(),getScene());},setInteraction:(callback,{allowCanvasListeners=false}={})=>{interaction=callback;interactionAllowsCanvasListeners=!!callback&&allowCanvasListeners===true;setSelection(getSelection(),getScene());},setDragInteraction:callbacks=>{if(interactionDrag){dragInteraction?.cancel?.();interactionDrag=null;orbit.enabled=true;}dragInteraction=callbacks;setSelection(getSelection(),getScene());},
    toggleProjection:()=>{const previous=camera,next=previous===perspective?orthographic:perspective,direction=previous.position.clone().sub(orbit.target).normalize();next.position.copy(previous.position);next.quaternion.copy(previous.quaternion);next.up.copy(previous.up);if(next.isOrthographicCamera){const extent=previous.position.distanceTo(orbit.target)*Math.tan(previous.fov*Math.PI/360)/previous.zoom;next.zoom=next.top/Math.max(.001,extent);}else{const extent=previous.top/previous.zoom,distance=extent*next.zoom/Math.tan(next.fov*Math.PI/360);next.position.copy(orbit.target).addScaledVector(direction,distance);}camera=next;orbit.object=camera;gizmo.camera=camera;resize();orbit.update();camera.updateMatrixWorld(true);invalidate('view');return camera.isPerspectiveCamera?'Perspektive':'Orthografisch';},
    setTheme:dark=>{darkTheme=dark;sceneStyleKey=null;invalidate('theme');},
    setAIResultMarks:verification=>{clear(aiErrorMarks);if(verification)aiErrorMarks.add(createAIErrorOverlay(verification));invalidate('ai-error-marks');},
    setPreview:(meshes,project,replaceIds=[])=>{clear(aiErrorMarks);clear(preview);previewIds=new Set(replaceIds);previewReplaceIds=new Set(replaceIds);previewAllowedIds=new Set();const currentIds=new Set(getProject().nodes.map(n=>n.id));for(const record of meshes){const node=project.nodes.find(v=>v.id===(record.rootId??record.id));if(node){preview.add(makeMesh(record,node,{temporary:true}));previewIds.add(node.id);if(!currentIds.has(node.id))previewAllowedIds.add(node.id);}}refreshVisibility();},clearPreview:()=>{clear(aiErrorMarks);clear(preview);previewIds.clear();previewAllowedIds.clear();previewReplaceIds.clear();refreshVisibility();},
    setSourceDisplay:(meshes,project,targets)=>{const values=Array.isArray(targets)?targets:[targets],next=new THREE.Group();let bytes=0;try{for(const record of meshes){const node=project.nodes.find(v=>v.id===(record.rootId??record.id)),target=values.find(value=>(value.path.at(-1)??value.rootId)===node?.id);if(node&&target){bytes+=record.mesh.vertices.length*4+record.mesh.normals.length*4+record.mesh.triangles.length*4+record.mesh.faceGroups.length*4;if(bytes>128*1024*1024)throw Error('Die CAD-Quellendarstellung überschreitet 128 MB.');const mesh=makeMesh(record,node,{temporary:true});mesh.userData.sourceTarget=structuredClone(target);mesh.userData.rootId=target.rootId;next.add(mesh);}}}catch(error){clear(next);throw error;}clear(sources);for(const mesh of [...next.children])sources.add(mesh);refreshVisibility();},
    clearSource:()=>{if(!sources.children.length)return;clear(sources);refreshVisibility();},
    setEdges:values=>{const buffers=cadEdgeRenderBuffers(values);clear(edges);for(const [key,color,order]of [['regular',0x27445a,30],['selected',0xffa832,31]]){const positions=buffers[key];if(!positions.length)continue;const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));const lines=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color,depthTest:false}));lines.renderOrder=order;edges.add(lines);}},
    setSectionDisplay:(values,node)=>{const results=Array.isArray(values)?values:[values];sectionIds=new Set(results.map(value=>value.objectId??node?.id));clear(section);for(const mesh of bodies.children)if(sectionIds.has(mesh.userData.rootId)||sectionIds.has(undefined))mesh.visible=false;for(const result of results){const body=node??getProject().nodes.find(n=>n.id===result.objectId);for(const [data,color]of [[result.clipDisplay,body?.color??'#ef6948'],[result.capDisplay,'#efc47c']])if(data){const raw=!data.normals,geometry=buildGeometry(raw?{verts:data.vertices??data.verts,triangles:data.triangles}:data,raw),mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.7,side:THREE.DoubleSide}));mesh.userData.rootId=body?.id??result.objectId;section.add(mesh);}}refreshVisibility();},
    clearSection:()=>{clear(section);sectionIds.clear();refreshVisibility();},
    invalidate,renderReady:()=>scheduler.paint(),captureDataURL:async()=>{await scheduler.paint();return renderer.domElement.toDataURL('image/png');},renderState:()=>scheduler.state(),verificationControls:new URLSearchParams(location.search).has('test')?orbit:undefined,
    groups:{aiErrorMarks,assemblyBoxes:assemblyBoxes.group,comparison:comparisonMarks,thickness:thicknessMarks,annotations,alignmentGhosts,meshSelection:meshSelectionMarks,meshProtection:meshProtectionMarks,meshInspection:meshInspectionMarks,rotation:rotationHandles.group,bodies,outlines,handles,bed,edges,measurements,section,preview,sources},cacheState:()=>({meshes:bodies.children.length,bytes:displayBytes,maxBytes:128*1024*1024,reused:lastReuse,created:lastCreated,stagedBytes:stagedDisplay?.nextBytes??0}),
    dispose:()=>{explosionView.clear();assemblyBoxes.clear();jointView.clear();closed=true;scheduler.dispose();dropStage();clearAlignmentPreview();cutoutDisplay.dispose();sectionPreview.dispose();scaleDimensions.dispose();moveDimensions.dispose();rotationHandles.dispose();observer.disconnect();gizmo.dispose();orbit.dispose();for(const group of [aiErrorMarks,comparisonMarks,thicknessMarks,bodies,outlines,handles,bed,edges,measurements,section,preview,sources,meshSelectionMarks,meshProtectionMarks,meshInspectionMarks])clear(group);renderer.dispose();renderer.domElement.remove();meshNotice.remove();}
  };
  for(const name of ['setExplosion','clearExplosion','setAssemblyBoxes','setComparison','clearComparison','setMeshInspection','setMeshSelection','setMeshProtection','setAlignmentReference','setAlignmentPreview','clearAlignmentPreview','setDisplay','setSelection','setView','restoreView','fit','cancel','offsetPreviewRoots','setIsolation','setMode','setInteraction','setDragInteraction','toggleProjection','setTheme','setPreview','clearPreview','setSourceDisplay','clearSource','setEdges','setSectionDisplay','clearSection']){const action=api[name];api[name]=(...args)=>{const result=action(...args);invalidate(name);return result;};}
  return api;
}
