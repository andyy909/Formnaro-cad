import {prepareConstrainedSketch} from './sketch-constraints-solver.js';
import {prepareSketchAttachment,checkSketchAttachment,attachmentMeshOperations} from './sketch-attachment.js';
import {resolveSketch} from './mesh-engine/mesh-sketch.js';
import {analyzeMeshLids,createMeshLid,validateMeshLidOptions} from './mesh-lid.js';
import {analyzeMeshFeatures} from './mesh-features.js';
import {meshSectionContours} from './mesh-section-contours.js';
import {checkMeshAIResults} from './mesh-ai-result-checks.js';
import {measureMeshRadialClearance} from './mesh-radial-clearance.js';
import {createMeshCounterpart,validateCounterpartOptions} from './mesh-counterpart.js';
import {hollowMesh,validateMeshHollowOptions,MESH_HOLLOW_LIMIT} from './mesh-hollow.js';
import {makeSolidMesh,validateMeshMakeSolidOptions,MESH_MAKE_SOLID_LIMIT} from './mesh-make-solid.js';
import {eraseFillSelectedMesh,validateMeshEraseFillOptions,MESH_ERASE_FILL_LIMIT} from './mesh-erase-fill.js';
import {sculptMesh,validateMeshSculptOptions} from './mesh-sculpt.js';
import {smoothSelectedMesh,validateMeshSmoothOptions,MESH_SMOOTH_LIMIT} from './mesh-smooth.js';
import {reduceCurvedMesh} from './mesh-curved-reduce.js';
import {reducePlanarMesh,validateMeshReduceOptions} from './mesh-reduce.js';
import {remeshPlanarMesh,validateMeshRemeshOptions} from './mesh-remesh.js';
import {deriveMeshConnectors,assertConnectorNeighbors,validateConnectorOptions,validateConnectorReference} from './mesh-connectors.js';
import {meshPartitionReview} from './mesh-partition-review.js';
import {fillPlanarHole,holeFillCatalog} from './mesh-hole-fill.js';
import {keepMeshAppearance} from './mesh-appearance.js';
import {repairSimpleTopology,simpleRepairCatalog} from './mesh-simple-repair.js';
import {buildMeshSelectionTopology,meshSelectionGeometryDigest,queryMeshSelection} from './mesh-selection-data.js';
import {meshProtectionRegions} from './mesh-protection.js';
import {inspectMeshTopology} from './mesh-inspector.js';
import * as THREE from 'three';
import {setKernel,localManifold,worldManifold,fromMesh,normalizeMesh,makeNode,groupNodes,meshData,matrixArray,validNode,fitParameters,SHAPES,applySketch} from './mesh-engine/geometry.js';
import {inspectModel} from './mesh-engine/model-analysis.js';
import {sectionGeometry} from './mesh-engine/section-geometry.js';
import {svgProjection,coloredParts} from './mesh-engine/exports.js';
import {repairStlMesh} from './mesh-engine/mesh-stl-repair.js';
import {parsePlugin,label} from './cad-plugin-manifest.js';
import {migrateProject} from './mesh-engine/project-data.js';
import {synchronizeHistory} from './mesh-engine/history.js';
import {derivePartitionParts} from './mesh-engine/mesh-partition-recipe.js';
import {analyzeFinishEdges,finishSelectedEdges} from './mesh-engine/mesh-edge-finish.js';
import {buildHoleCutters} from './mesh-engine/mesh-hole.js';
import {flags} from './mesh-engine/organization.js';
import {geometryKey as legacyGeometryKey} from './mesh-engine/coordinates.js';
import {createCadProject,cadProjectSnapshot,validateAffineMatrix} from './cad-project.js';
import {cadGeometryDigest} from './cad-geometry-digest.js';
import {projectObjectGeometryDigest,validateProjectMesh,meshTopologyClass} from './project-objects.js';
import {meshWorkplaneGeometryDigest,resolveMeshWorkplane,synchronizeMeshWorkplane} from './mesh-workplane.js';
import {CAD_QUALITY_DEFAULTS} from './cad-quality.js';
import {defaultLayout} from './layout-preferences.js';
import {validateCadWorkspace} from './cad-workspace.js';

export function createMeshEngineAdapter({kernel}={}){
  if(!kernel?.Manifold)throw TypeError('Netz-Rechenkern fehlt.');setKernel(kernel);
  function importLegacy(encoded){
    if(typeof encoded!=='string'||new TextEncoder().encode(encoded).length>50*1024*1024)throw Error('Altes Netzprojekt überschreitet das gemeinsame 50-MB-Limit.');
    const input=JSON.parse(encoded),before=structuredClone(input);
    if(input.format!=='OfflineCAD'||![1,2,3,4,6].includes(input.version)||!Array.isArray(input.nodes)||input.nodes.length>500||!input.nodes.every(n=>validNode(n))||!Array.isArray(input.bed)||input.bed.length!==2||input.bed.some(v=>!Number.isFinite(v)||v<20||v>2000)||typeof input.name!=='string'||input.version===1&&(!Number.isFinite(input.planeZ)||Math.abs(input.planeZ)>10000))throw Error('Ungültiges altes Netzprojekt.');
    if(input.ruler!=null&&(!Array.isArray(input.ruler.origin)||input.ruler.origin.length!==3||input.ruler.origin.some(v=>!Number.isFinite(v)||Math.abs(v)>100000)||!['min','center'].includes(input.ruler.mode)))throw Error('Ungültiger Linealursprung im Netzprojekt.');
    const data=migrateProject(input);synchronizeHistory(data.nodes,{upgrade:true});
    const nodes=data.nodes.map(n=>{
      const m=localManifold(n);let mesh;try{if(m.isEmpty()||m.status()!=='NoError'||m.volume()<=0)throw Error('Die erhaltene Netzquelle ist kein gültiger Körper.');mesh=meshData(m);}finally{m.delete();}
      return {id:n.id,kind:'mesh',meshRole:n.solid?'solid':'hole',name:n.name,transform:matrixArray(n),mesh,color:n.color,opacity:n.opacity??1,hidden:!!n.hidden,locked:!!n.locked,layerId:n.layerId,folderId:n.folderId,meshSource:{format:'Formnaro-MeshSource',version:1,node:n},metadata:{notes:n.notes??'',sourceReference:{objectId:n.id,geometryDigest:cadGeometryDigest(JSON.stringify(before.nodes.find(v=>v.id===n.id))),operation:'legacy-import'}}};
    });
    const warnings=['Als neues gemeinsames Projekt speichern. Die alte Projektdatei bleibt erhalten.'];let workplane={origin:data.workplane.origin,orientation:data.workplane.orientation,reference:null},workspace;
    if(data.workplane.reference){
      try{
        const old=data.workplane.reference,original=before.nodes.find(n=>n.id===old.objectId),current=nodes.find(n=>n.id===old.objectId);
        if(!original||!current||legacyGeometryKey(original)!==old.geometryKey)throw Error('Alter Geometrieschlüssel passt nicht mehr.');
        const oldMatrix=new THREE.Matrix4().fromArray(matrixArray(original)),newMatrix=new THREE.Matrix4().fromArray(current.transform),inverse=newMatrix.clone().invert(),localPoint=new THREE.Vector3(...old.point).applyMatrix4(oldMatrix).applyMatrix4(inverse),worldNormal=new THREE.Vector3(...old.normal).applyMatrix3(new THREE.Matrix3().getNormalMatrix(oldMatrix)),localNormal=worldNormal.applyMatrix3(new THREE.Matrix3().setFromMatrix4(newMatrix).transpose()).normalize(),tangent=new THREE.Vector3(...old.tangent).transformDirection(oldMatrix).transformDirection(inverse);
        tangent.addScaledVector(localNormal,-tangent.dot(localNormal)).normalize();const triangle=new THREE.Triangle(),normal=new THREE.Vector3(),closest=new THREE.Vector3(),mesh=current.mesh;let triangleIndex=-1;
        for(let i=0;i<mesh.triangles.length;i+=3){for(const [key,j]of [['a',0],['b',1],['c',2]])triangle[key].fromArray(mesh.verts,mesh.triangles[i+j]*3);triangle.getNormal(normal);if(normal.dot(localNormal)<1-1e-8)continue;const tolerance=Math.max(1e-9,Math.max(triangle.a.distanceTo(triangle.b),triangle.b.distanceTo(triangle.c),triangle.c.distanceTo(triangle.a))*1e-7);triangle.closestPointToPoint(localPoint,closest);if(closest.distanceTo(localPoint)<=tolerance){triangleIndex=i/3;break;}}
        if(triangleIndex<0)throw Error('Alte Bezugsfläche ist nicht mehr vorhanden.');
        tangent.addScaledVector(normal,-tangent.dot(normal)).normalize();
        workplane=resolveMeshWorkplane({reference:{kind:'mesh',objectId:current.id,geometryDigest:meshWorkplaneGeometryDigest(current),triangleIndex,point:closest.toArray(),normal:normal.toArray(),tangent:tangent.toArray()}},current);
      }catch{warnings.push('Der alte Netzflächenbezug passt nicht mehr zur erhaltenen Geometrie. Die gespeicherte Arbeitsebene bleibt als freie Ebene erhalten; eine Fläche erneut auswählen.');}
    }
    if(input.workspace){
      try{const view=input.workspace;
        if(!view||typeof view!=='object'||Array.isArray(view)||Object.keys(view).some(k=>!['projection','position','target','zoom','section'].includes(k))||!['perspective','orthographic'].includes(view.projection)||![view.position,view.target].every(a=>Array.isArray(a)&&a.length===3&&a.every(v=>Number.isFinite(v)&&Math.abs(v)<100000))||!Number.isFinite(view.zoom)||view.zoom<=0||view.zoom>10000)throw Error('Alte Ansicht ungültig.');
        if(view.section!=null&&(!Array.isArray(view.section)||view.section.length!==4||view.section.some(v=>!Number.isFinite(v))||Math.hypot(...view.section.slice(0,3))<1e-12))throw Error('Alte Schnittansicht ungültig.');
        workspace=validateCadWorkspace({version:1,view:{projection:view.projection,position:[...view.position],target:[...view.target],up:[0,0,1],zoom:view.zoom},selection:[],mode:'translate',snap:1,quality:structuredClone(CAD_QUALITY_DEFAULTS),layout:defaultLayout()});
        if(view.section&&nodes.some(n=>n.meshRole!=='hole')){const length=Math.hypot(...view.section.slice(0,3));workspace=validateCadWorkspace({...workspace,version:3,tree:{expanded:[]},section:{normal:view.section.slice(0,3).map(v=>v/length),offset:-view.section[3]/length,side:'positive',ids:nodes.filter(n=>n.meshRole!=='hole').map(n=>n.id)}});}
      }catch{warnings.push('Die alte Netz-Ansicht konnte nicht sicher übernommen werden. Ihre Originaldaten bleiben in der Projekt-Sicherung erhalten.');}
    }
    const project=createCadProject({version:8,name:data.name,nodes,bed:data.bed,layers:data.layers,folders:data.folders,activeLayerId:data.activeLayerId,activeFolderId:data.activeFolderId,coordinateMode:data.coordinateMode,ruler:data.ruler??null,workplane,...(workspace?{workspace}:{}),migrationSource:{format:'OfflineCAD',version:before.version,data:encoded}});
    return {project,warnings,fromVersion:before.version};
  }
  function inspectSolid(node){
    if(node.kind!=='mesh')throw Error('Ein bearbeitbares Netz auswählen.');
    validateAffineMatrix(node.transform);validateProjectMesh(node.mesh);
    if(node.mesh.verts.some(v=>!Number.isFinite(Math.fround(v))))throw Error('Netzpunkte sind im Netz-Rechenkern nicht darstellbar.');
    if(meshTopologyClass(node.mesh).type!=='closedMesh')throw Error('Das Netz ist offen oder beschädigt. Vor Körperwerkzeugen gezielt reparieren.');
    const mesh=new kernel.Mesh({numProp:3,vertProperties:new Float32Array(node.mesh.verts),triVerts:new Uint32Array(node.mesh.triangles)});mesh.merge();
    const m=new kernel.Manifold(mesh);let world;try{positive(m);world=m.transform(node.transform);positive(world);return {ok:true,geometryDigest:projectObjectGeometryDigest(node),volume:world.volume(),triangles:world.numTri()};}finally{world?.delete();m.delete();}
  }
  function positive(m){if(m.status()!=='NoError'||m.isEmpty()||!Number.isFinite(m.volume())||m.volume()<=0)throw Error('Das Netz ist noch kein geprüfter geschlossener Materialkörper.');return m;}
  const matrix=a=>new THREE.Matrix4().fromArray(a),multiply=(a,b)=>matrix(a).multiply(matrix(b)).toArray();
  const delta=(node,legacy)=>{const original=matrixArray(legacy);return node.transform.every((v,i)=>v===original[i])?new THREE.Matrix4().toArray():matrix(node.transform).multiply(matrix(original).invert()).toArray();};
  function localSource(node){
    inspectSolid(node);
    if(node.meshSource){const source=structuredClone(node.meshSource.node);synchronizeHistory([source],{upgrade:true});const current=fromMesh(node.mesh),original=localManifold(source);let added,missing;
      try{positive(original);added=current.subtract(original);missing=original.subtract(current);const allowed=Math.max(current.volume()*3e-5,1e-12);if(added.status()!=='NoError'||missing.status()!=='NoError'||Math.abs(added.volume())>allowed||Math.abs(missing.volume())>allowed)throw Error('Die erhaltene Netzquelle passt nicht zur aktuellen Geometrie. Original unverändert lassen und Werkzeug erneut aufrufen.');}
      finally{current.delete();original.delete();added?.delete();missing?.delete();}source.name=node.name;source.color=node.color??source.color;source.solid=node.meshRole!=='hole';return source;}
    const normalized=normalizeMesh(node.mesh),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    node.mesh.verts.forEach((v,i)=>{min[i%3]=Math.min(min[i%3],v);max[i%3]=Math.max(max[i%3],v);});
    return makeNode('import',min.map((v,i)=>(v+max[i])/2),{id:node.id,name:node.name,color:node.color??'#77a8b5',size:normalized.size,mesh:normalized.mesh,solid:node.meshRole!=='hole',opacity:node.opacity??1});
  }
  // The original common source and all of its affine placement stay in sources.
  // The legacy worker consumes an independent normalized world-space mesh. No
  // decomposition into rotation/scale can discard shear or a mirrored axis.
  function worldSource(node){
    try{inspectSolid(node);}catch(error){return [{id:node.id,rootId:node.id,kind:'mesh',name:node.name,color:node.color??'#77a8b5',opacity:node.opacity??1,transform:[...node.transform],mesh:structuredClone(node.mesh),warnings:['Quellenfarben benötigen einen geprüften Körper. '+error.message]}];}const local=fromMesh(node.mesh);let world,centred,scaled;
    try{world=positive(local.transform(node.transform));const box=world.boundingBox(),pos=box.min.map((v,i)=>(v+box.max[i])/2),size=box.min.map((v,i)=>box.max[i]-v);
      if(size.some(v=>v<.01||v>10000)||pos.some(v=>Math.abs(v)>100000))throw Error('Netzwerkzeug: Ergebnis außerhalb des Arbeitsbereichs.');
      centred=world.translate(pos.map(v=>-v));scaled=centred.scale(size.map(v=>1/v));
      return makeNode('import',pos,{id:node.id,name:node.name,color:node.color??'#77a8b5',size,mesh:meshData(scaled),solid:node.meshRole!=='hole',opacity:node.opacity??1});
    }finally{local.delete();world?.delete();centred?.delete();scaled?.delete();}
  }
  function commonFromLegacy(legacy,template,transform=matrixArray(legacy)){
    const m=localManifold(legacy);try{positive(m);let mesh=meshData(m);
      // Float32 output can collapse tiny generated faces (notably nut rims).
      // Remove only exactly zero-area faces. Retain all used coordinates,
      // winding and components; imported user meshes do not pass this path.
      if(meshTopologyClass(mesh).type==='damagedMesh'){
        const topology=buildMeshSelectionTopology(mesh),fixed=repairSimpleTopology(topology,{method:'simple-v1',geometryDigest:topology.geometryDigest,removeDegenerate:true,removeDuplicates:false,orient:false,smallTriangleLimit:0,removeComponents:[]});
        if(meshTopologyClass(fixed.mesh).type!=='closedMesh')throw Error('Die erzeugte Netzform konnte nicht als geschlossener Körper geprüft werden.');
        const checked=fromMesh(fixed.mesh);try{positive(checked);if(Math.abs(checked.volume()-m.volume())>Math.max(1e-9,Math.abs(m.volume())*1e-6))throw Error('Die Netzbereinigung würde das erzeugte Volumen verändern.');}finally{checked.delete();}
        mesh=fixed.mesh;
      }
      return {...structuredClone(template),id:legacy.id,name:legacy.name,color:legacy.color,kind:'mesh',mesh,transform,meshRole:legacy.solid?'solid':'hole'};
    }finally{m.delete();}
  }
  function recipeData(value){
    if(value===null||['string','boolean'].includes(typeof value))return value;
    if(typeof value==='number'&&Number.isFinite(value))return value;
    if(Array.isArray(value))return value.map(recipeData);
    if(value&&Object.getPrototypeOf(value)===Object.prototype)return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).map(([k,v])=>[k,recipeData(v)]));
    throw Error('Der Netz-Rechenkern lieferte keine speicherbaren Quelldaten.');
  }
  function retained(node,sources,operation){return {format:'Formnaro-MeshSource',version:['repair','connectors','reduce','remesh','smooth','sculpt','erase-fill','make-solid','hollow','lid','counterpart'].includes(operation.type)?3:2,node:recipeData(node),sources:structuredClone(sources),operation:recipeData(operation)};}
  function simpleRepair(source,options){
    const topology=buildMeshSelectionTopology(source.mesh),fixed=repairSimpleTopology(topology,options),counts=t=>Object.fromEntries(Object.entries(inspectMeshTopology(t,{smallTriangleLimit:options.smallTriangleLimit}).categories).map(([k,c])=>[k,c.count]));
    const node={id:source.id,name:source.name,type:'import',pos:[0,0,0],rot:[0,0,0],size:[1,1,1],color:source.color??'#77a8b5',solid:source.meshRole!=='hole',mesh:fixed.mesh};
    return {node,report:{...fixed.report,before:counts(topology),after:counts(buildMeshSelectionTopology(fixed.mesh)),solidProven:false}};
  }
  function closeHole(source,options){
    const topology=buildMeshSelectionTopology(source.mesh),before=inspectMeshTopology(topology),fixed=fillPlanarHole(topology,options,{unsafeVertices:before.categories.nonmanifoldVertex.vertexIds}),after=inspectMeshTopology(buildMeshSelectionTopology(fixed.mesh));
    for(const key of ['duplicate','degenerate','orientation','nonmanifoldEdge','nonmanifoldVertex'])if(after.categories[key].count>before.categories[key].count)throw Error('Die Füllung erzeugt uneindeutige Verbindungen. Original bleibt erhalten.');
    const counts=t=>Object.fromEntries(Object.entries(t.categories).map(([k,c])=>[k,c.count]));
    return {node:{id:source.id,name:source.name,type:'import',pos:[0,0,0],rot:[0,0,0],size:[1,1,1],color:source.color??'#77a8b5',solid:source.meshRole!=='hole',mesh:fixed.mesh},report:{...fixed.report,before:counts(before),after:counts(after)}};
  }
  async function reduceSource(source,options){const reduced=await (options.method==='curved-v1'?reduceCurvedMesh:reducePlanarMesh)(source,options),node={id:source.id,name:source.name,type:'import',pos:[0,0,0],rot:[0,0,0],size:[1,1,1],color:source.color??'#77a8b5',solid:source.meshRole!=='hole',opacity:source.opacity??1,mesh:reduced.mesh};return {node,report:reduced.report,protection:reduced.protection};}
  function remeshSource(source,options){const reduced=remeshPlanarMesh(source,options),node={id:source.id,name:source.name,type:'import',pos:[0,0,0],rot:[0,0,0],size:[1,1,1],color:source.color??'#77a8b5',solid:source.meshRole!=='hole',opacity:source.opacity??1,mesh:reduced.mesh};return {node,report:reduced.report,protection:reduced.protection};}
  function sculptSource(source,options){const fixed=sculptMesh(source,options),node={id:source.id,name:source.name,type:'import',pos:[0,0,0],rot:[0,0,0],size:[1,1,1],color:source.color??'#77a8b5',solid:source.meshRole!=='hole',opacity:source.opacity??1,mesh:fixed.mesh};return {node,report:fixed.report,protection:fixed.protection};}
  function smoothSource(source,options){const reduced=smoothSelectedMesh(source,options),node={id:source.id,name:source.name,type:'import',pos:[0,0,0],rot:[0,0,0],size:[1,1,1],color:source.color??'#77a8b5',solid:source.meshRole!=='hole',opacity:source.opacity??1,mesh:reduced.mesh};return {node,report:reduced.report,protection:reduced.protection};}
  function eraseFillSource(source,options){const fixed=eraseFillSelectedMesh(source,options),node={id:source.id,name:source.name,type:'import',pos:[0,0,0],rot:[0,0,0],size:[1,1,1],color:source.color??'#77a8b5',solid:source.meshRole!=='hole',opacity:source.opacity??1,mesh:fixed.mesh};return {node,report:fixed.report,protection:fixed.protection};}
  function makeSolidSource(source,options){const fixed=makeSolidMesh(source,options,{kernel}),node={id:source.id,name:source.name,type:'import',pos:[0,0,0],rot:[0,0,0],size:[1,1,1],color:source.color??'#77a8b5',solid:true,opacity:source.opacity??1,mesh:fixed.mesh};return {node,report:fixed.report};}
  function hollowSource(source,options){const fixed=hollowMesh(source,options,{kernel}),node={id:source.id,name:source.name,type:'import',pos:[0,0,0],rot:[0,0,0],size:[1,1,1],color:source.color??'#77a8b5',solid:true,opacity:source.opacity??1,mesh:fixed.mesh};return {node,report:fixed.report};}
  function lidSource(source,options){const fixed=createMeshLid(source,options,{kernel}),node={id:source.id,name:source.name,type:'import',pos:[0,0,0],rot:[0,0,0],size:[1,1,1],color:source.color??'#e4a14b',solid:true,mesh:fixed.mesh};return {node,report:fixed.report};}
  function counterpartSource(source,options){const fixed=createMeshCounterpart(source,options,{kernel}),node={id:source.id,name:source.name,type:'import',pos:[0,0,0],rot:[0,0,0],size:[1,1,1],color:'#e4a14b',solid:true,mesh:fixed.mesh};return {node,report:fixed.report};}
  async function derive(sources,recipe){
    if(recipe.type==='counterpart')return counterpartSource(sources[0],recipe.options);
    if(recipe.type==='lid')return lidSource(sources[0],recipe.options);
    if(recipe.type==='reduce')return reduceSource(sources[0],recipe.options);
    if(recipe.type==='remesh')return remeshSource(sources[0],recipe.options);
    if(recipe.type==='sculpt')return sculptSource(sources[0],recipe.options);
    if(recipe.type==='smooth')return smoothSource(sources[0],recipe.options);
    if(recipe.type==='erase-fill')return eraseFillSource(sources[0],recipe.options);
    if(recipe.type==='make-solid')return makeSolidSource(sources[0],recipe.options);
    if(recipe.type==='hollow')return hollowSource(sources[0],recipe.options);
    if(recipe.type==='repair'&&recipe.options?.method==='planar-cap-v1')return closeHole(sources[0],recipe.options);
    if(recipe.type==='repair'&&recipe.options?.method!==undefined)return simpleRepair(sources[0],recipe.options);
    if(recipe.type==='repair'){const fixed=repairStlMesh(sources[0].mesh,recipe.options??{});return {node:makeNode('import',[0,0,0],{id:sources[0].id,name:sources[0].name,size:[1,1,1],mesh:fixed.mesh}),report:fixed.report};}
    const active=sources.filter(n=>!recipe.suppressedIds?.includes(n.id)),legacy=active.map(worldSource);if(!legacy.length)throw Error('Mindestens eine aktive Originalquelle erhalten.');let result;
    if(recipe.type==='connectors')return deriveMeshConnectors(kernel,legacy,recipe.reference,recipe.options);
    if(recipe.type==='group'){
      if(!['union','intersection','difference'].includes(recipe.mode))throw Error('Unbekannte Netz-Verknüpfung.');
      if(recipe.mode==='difference')legacy.forEach((n,i)=>n.solid=i===0);
      if(!legacy.some(n=>n.solid)&&sources.some(n=>n.meshRole!=='hole'))throw Error('Die Netzgruppe benötigt mindestens eine aktive Materialquelle.');
      result={node:groupNodes(legacy,recipe.mode==='intersection'?'intersection':'union')};
    }else if(recipe.type==='drill'){
      if(sources[0].meshRole==='hole')throw Error('Eine Bohrung benötigt einen Materialkörper.');
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(sources[0].mesh.verts,3));
      try{const built=buildHoleCutters(geometry,matrix(sources[0].transform),recipe.reference,recipe.options),before=worldManifold(legacy[0]);let after;
        try{result={node:groupNodes([legacy[0],...built.cutters])};after=worldManifold(result.node);const removedVolume=before.volume()-after.volume();if(removedVolume<=Math.max(1e-6,before.volume()*1e-9))throw Error('Die Bohrung entfernt kein Material. Position und Richtung prüfen.');result.report={removedVolume,depth:built.depth,diameter:built.diameter};}finally{before.delete();after?.delete();}
      }finally{geometry.dispose();}
      result.node.name=(sources[0].name+' · Bohrung').slice(0,200);
    }else if(recipe.type==='split'||recipe.type==='bodies'){
      if(sources[0].meshRole==='hole')throw Error('Einen Materialkörper auswählen.');
      result=derivePartitionParts(legacy[0],recipe.type==='split'?'split':'bodies',recipe.plane);result.report=Object.fromEntries(Object.entries(result).filter(([k])=>k!=='nodes'));
    }else if(recipe.type==='finish'){
      if(sources[0].meshRole==='hole')throw Error('Einen Materialkörper auswählen.');
      result=await finishSelectedEdges(legacy[0],recipe.edgeIds,recipe.options);result.report=Object.fromEntries(Object.entries(result).filter(([k])=>k!=='node'));
    }else throw Error('Unbekanntes erhaltenes Netzrezept.');
    return result;
  }
  async function analyzeEdges(node){const result=await analyzeFinishEdges(worldSource(node));return {...result,geometryDigest:projectObjectGeometryDigest(node)};}
  function autoRepairCandidate(project,id,attemptedDigests=[]){
    const node=project.nodes.find(n=>n.id===id);
    if(!node||node.kind!=='mesh'||flags(node,project).hidden||flags(node,project).locked||meshProtectionRegions(node).length)return {status:'skipped'};
    if(!Array.isArray(attemptedDigests)||attemptedDigests.length>128||attemptedDigests.some(d=>typeof d!=='string'||!(/^[a-f0-9]{64}$/).test(d)))throw Error('Ungültige Reparaturhistorie.');
    if(node.mesh.triangles.length/3>500000||node.mesh.verts.length/3>1000000)return {status:'skipped',reason:'Das Netz ist zu groß für die automatische Reparatur.'};
    const geometryDigest=meshSelectionGeometryDigest(node);
    if(attemptedDigests.includes(geometryDigest))return {status:'skipped',geometryDigest};
    try{inspectSolid(node);return {status:'healthy',geometryDigest};}catch{/* Only damaged bodies need a repair attempt. */}
    // Existing repair recipes retain the complete original source. Calculate
    // candidates in the worker and offer only independently checked solids.
    const options={method:'simple-v1',geometryDigest,removeDegenerate:true,removeDuplicates:true,orient:true,smallTriangleLimit:0,removeComponents:[]};
    try{const fixed=simpleRepair(node,options),candidate={...node,mesh:fixed.node.mesh};inspectSolid(candidate);return {status:'repaired',geometryDigest,outputDigest:meshSelectionGeometryDigest(candidate),operation:{type:'mesh-simple-repair',id,options}};}catch{/* Try the bounded original small-hole repair next. */}
    // The tolerant importer has deliberately preserved every open contour.
    // Easy's legacy background fallback must not silently cap it afterwards.
    let tolerantImport=false;try{tolerantImport=JSON.parse(node.metadata?.notes??'null')?.format==='FormnaroMeshImport';}catch{}
    if(tolerantImport)return {status:'unrepairable',geometryDigest,reason:'Offene Importkonturen bleiben erhalten. Für ein beabsichtigtes Schließen die gezielte Lochreparatur verwenden.'};
    try{const fixed=repairStlMesh(node.mesh,{fillSmallHoles:true}),candidate={...node,mesh:fixed.mesh};inspectSolid(candidate);return {status:'repaired',geometryDigest,outputDigest:meshSelectionGeometryDigest(candidate),operation:{type:'mesh-repair',id,fillSmallHoles:true}};}
    catch(error){return {status:'unrepairable',geometryDigest,reason:error.message};}
  }
  const lidCatalogCache=new Map();
  function toolsQuery({project,kind,id,ids,attemptedDigests,options={}}){
    if(kind==='jointCollision'){
      if(Object.keys(options).length||!Array.isArray(ids)||ids.length!==2||ids[0]===ids[1])throw Error('Genau zwei verschiedene Körper für die Kollisionsprüfung wählen.');
      const p=cadProjectSnapshot(project),nodes=ids.map(id=>p.nodes.find(n=>n.id===id));if(nodes.some(n=>!n||n.kind!=='mesh'||n.meshRole==='hole'||flags(n,p).hidden||n.mesh.triangles.length/3>200000))throw Error('Zwei sichtbare Materialnetze mit höchstens je 200.000 Dreiecken wählen.');
      for(const n of nodes)inspectSolid(n);let a,b,left,right,common;try{
        a=fromMesh(nodes[0].mesh);b=fromMesh(nodes[1].mesh);left=positive(a.transform(nodes[0].transform));right=positive(b.transform(nodes[1].transform));common=left.intersect(right);if(common.status()!=='NoError')throw Error('Volumenschnitt konnte nicht sicher berechnet werden.');const volume=common.volume();if(!Number.isFinite(volume)||volume<0)throw Error('Ungültiges Schnittvolumen.');return {intersects:volume>0,volume,triangles:nodes.map(n=>n.mesh.triangles.length/3),closedInputs:true};
      }finally{common?.delete();right?.delete();left?.delete();b?.delete();a?.delete();}
    }
    if(kind==='radialClearance'){
      const target=project.nodes.find(n=>n.id===id),other=project.nodes.find(n=>n.id===options.other);
      if(!target||!other||flags(target,project).hidden||flags(other,project).hidden)throw Error('Zwei sichtbare Material-Netzteile wählen.');
      return measureMeshRadialClearance({kernel,target,other,options});
    }
    if(kind==='resultChecks')return checkMeshAIResults({kernel,project,checks:options.checks,aliases:options.aliases});
    if(['selection','inspect','holeCatalog','repairCatalog','digest'].includes(kind)&&id){
      const n=project.nodes.find(n=>n.id===id&&n.kind==='mesh');if(!n)throw Error('Ein vorhandenes Netzteil wählen.');
      if(kind==='digest')return {geometryDigest:meshSelectionGeometryDigest(n)};
      const topology=buildMeshSelectionTopology(n.mesh);
      if(kind==='selection')return queryMeshSelection(topology,options,{objectId:n.id,transform:n.transform});
      if(kind==='inspect')return inspectMeshTopology(topology,{...options,objectId:n.id});
      return {...(kind==='holeCatalog'?holeFillCatalog:simpleRepairCatalog)(topology,options),objectId:n.id};
    }
    if(kind==='sectionContours'){
      const n=project.nodes.find(n=>n.id===id);
      if(!n||n.kind!=='mesh'||n.meshRole==='hole')throw Error('Eine vorhandene Material-Netzvorlage auswählen.');
      return meshSectionContours(n,options);
    }
    if(kind==='featureCatalog'){
      const p=cadProjectSnapshot(project),n=p.nodes.find(n=>n.id===id);
      if(!n||n.kind!=='mesh'||flags(n,p).hidden||flags(n,p).locked||n.meshRole==='hole')throw Error('Ein sichtbares, entsperrtes Material-Netzteil auswählen.');
      const key='features:'+projectObjectGeometryDigest(n)+JSON.stringify(options);if(lidCatalogCache.has(key))return structuredClone(lidCatalogCache.get(key));
      const result=analyzeMeshFeatures(n,options);lidCatalogCache.set(key,result);while(lidCatalogCache.size>4)lidCatalogCache.delete(lidCatalogCache.keys().next().value);return structuredClone(result);
    }
    if(kind==='lidCatalog'){
      const p=cadProjectSnapshot(project),n=p.nodes.find(n=>n.id===id);
      if(!n||n.kind!=='mesh'||flags(n,p).hidden||flags(n,p).locked||n.meshRole==='hole')throw Error('Ein sichtbares, entsperrtes Material-Netzteil auswählen.');
      const key=projectObjectGeometryDigest(n);if(lidCatalogCache.has(key))return structuredClone(lidCatalogCache.get(key));
      const result=analyzeMeshLids(n);lidCatalogCache.set(key,result);while(lidCatalogCache.size>4)lidCatalogCache.delete(lidCatalogCache.keys().next().value);return structuredClone(result);
    }
    if(kind==='autoRepair')return autoRepairCandidate(project,id,attemptedDigests);
    if(kind==='reduceCatalog'){const p=cadProjectSnapshot(project),n=p.nodes.find(n=>n.id===id);if(!n||n.kind!=='mesh'||flags(n,p).hidden||flags(n,p).locked)throw Error('Ein sichtbares, entsperrtes Netzteil auswählen.');if(n.mesh.triangles.length/3>150000)throw Error('Vereinfachen unterstützt bis zu 150.000 Dreiecke je Netz.');return {geometryDigest:meshSelectionGeometryDigest(n),triangles:n.mesh.triangles.length/3,regions:(n.metadata?.meshProtection?.regions??[]).map(r=>({name:r.name,purpose:r.purpose,triangles:r.triangleIds.length}))};}
    if(kind==='remeshCatalog'){const p=cadProjectSnapshot(project),n=p.nodes.find(n=>n.id===id);if(!n||n.kind!=='mesh'||flags(n,p).hidden||flags(n,p).locked)throw Error('Ein sichtbares, entsperrtes Netzteil auswählen.');if(n.mesh.triangles.length/3>150000)throw Error('Neuvernetzen unterstützt bis zu 150.000 Dreiecke je Netz.');return {geometryDigest:meshSelectionGeometryDigest(n),triangles:n.mesh.triangles.length/3,regions:(n.metadata?.meshProtection?.regions??[]).map(r=>({name:r.name,purpose:r.purpose,triangles:r.triangleIds.length}))};}
    if(['makeSolidCatalog','hollowCatalog'].includes(kind)){const hollow=kind==='hollowCatalog',p=cadProjectSnapshot(project),n=p.nodes.find(n=>n.id===id);if(!n||n.kind!=='mesh'||flags(n,p).hidden||flags(n,p).locked||n.meshRole==='hole')throw Error('Ein sichtbares, entsperrtes Material-Netzteil auswählen.');const limit=hollow?MESH_HOLLOW_LIMIT:MESH_MAKE_SOLID_LIMIT;if(n.mesh.triangles.length/3>limit)throw Error((hollow?'Aushöhlen':'Make Solid')+' unterstützt bis zu '+limit.toLocaleString('de-DE')+' Dreiecke je Quelle.');if(meshProtectionRegions(n).length)throw Object.assign(Error('Dieses Werkzeug ist für Teile mit Schutzbereichen gesperrt. Das geschützte Original bleibt unverändert.'),{code:'MESH_PROTECTION'});if(hollow)inspectSolid(n);const m=n.transform,min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const v of new Set(n.mesh.triangles)){const q=n.mesh.verts.slice(v*3,v*3+3);for(let k=0;k<3;k++){const w=m[k]*q[0]+m[k+4]*q[1]+m[k+8]*q[2]+m[k+12];min[k]=Math.min(min[k],w);max[k]=Math.max(max[k],w);}}const extent=Math.max(...max.map((v,k)=>v-min[k])),shortest=Math.min(...max.map((v,k)=>v-min[k]));return {geometryDigest:meshSelectionGeometryDigest(n),triangles:n.mesh.triangles.length/3,worldBounds:{min,max},extent,suggestedResolution:Math.max(1e-6,Math.min(1e6,extent/(hollow?48:32))),...(hollow?{suggestedWallThickness:Math.max(1e-6,Math.min(1e6,shortest/10))}:{})};}
    if(kind==='eraseFillCatalog'){const p=cadProjectSnapshot(project),n=p.nodes.find(n=>n.id===id);if(!n||n.kind!=='mesh'||flags(n,p).hidden||flags(n,p).locked)throw Error('Ein sichtbares, entsperrtes Netzteil auswählen.');if(n.mesh.triangles.length/3>MESH_ERASE_FILL_LIMIT)throw Error('Bereiche ersetzen unterstützt bis zu '+MESH_ERASE_FILL_LIMIT.toLocaleString('de-DE')+' Dreiecke je Netz.');return {geometryDigest:meshSelectionGeometryDigest(n),triangles:n.mesh.triangles.length/3,regions:(n.metadata?.meshProtection?.regions??[]).map(r=>({name:r.name,purpose:r.purpose,triangles:r.triangleIds.length}))};}
    if(kind==='smoothCatalog'||kind==='sculptCatalog'){const p=cadProjectSnapshot(project),n=p.nodes.find(n=>n.id===id);if(!n||n.kind!=='mesh'||flags(n,p).hidden||flags(n,p).locked)throw Error('Ein sichtbares, entsperrtes Netzteil auswählen.');if(n.mesh.triangles.length/3>MESH_SMOOTH_LIMIT)throw Error('Das Glätten unterstützt bis zu ' + MESH_SMOOTH_LIMIT.toLocaleString('de-DE') + ' Dreiecke je Netz.');return {geometryDigest:meshSelectionGeometryDigest(n),triangles:n.mesh.triangles.length/3,regions:(n.metadata?.meshProtection?.regions??[]).map(r=>({name:r.name,purpose:r.purpose,triangles:r.triangleIds.length}))};}
    const p=cadProjectSnapshot(project),nodes=p.nodes.filter(n=>(!ids||ids.includes(n.id))&&n.kind==='mesh'&&n.meshRole!=='hole'&&!flags(n,p).hidden);
    if(ids&&(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.some(id=>!nodes.some(n=>n.id===id))))throw Error('Sichtbare Materialnetze eindeutig auswählen.');
    if(!nodes.length)throw Error('Mindestens ein sichtbares Materialnetz auswählen.');
    if(kind==='colors')return nodes.flatMap(colorParts);
    const legacy=nodes.map(worldSource);
    if(kind==='inspect'){if(nodes.length>20)throw Error('Höchstens 20 Netze gleichzeitig prüfen.');return {...inspectModel(legacy,options),sampled:true,label:'Netz-Wandstärke: Stichprobe, kein garantierter globaler Mindestwert'};}
    if(kind==='section'){const cut=sectionGeometry(legacy,options.plane);return nodes.map(node=>{const result=cut.find(r=>r.id===node.id);return {objectId:node.id,clipVolume:result?.volume??0,clipDisplay:{vertices:result?.surface.verts??[],triangles:result?.surface.triangles??[]},capDisplay:{vertices:result?.caps.verts??[],triangles:result?.caps.triangles??[]},status:result?.status??'NoError'};});}
    if(kind==='svg'){
      const frame=options.frame??new THREE.Matrix4().toArray();validateAffineMatrix(frame);const inverse=matrix(frame).invert(),parts=[];let merged;
      try{for(const n of nodes){const m=fromMesh(n.mesh);try{parts.push(m.transform(inverse.clone().multiply(matrix(n.transform)).toArray()));}finally{m.delete();}}merged=kernel.Manifold.union(parts);positive(merged);return {svg:svgProjection(merged)};}
      finally{merged?.delete();parts.forEach(m=>m.delete());}
    }
    throw Error('Unbekannte Netzprüfung.');
  }
  function colorParts(node){
    try{inspectSolid(node);}catch(error){return [{id:node.id,rootId:node.id,kind:'mesh',name:node.name,color:node.color??'#77a8b5',opacity:node.opacity??1,transform:[...node.transform],mesh:structuredClone(node.mesh),warnings:['Quellenfarben benötigen einen geprüften Körper. '+error.message]}];}const local=fromMesh(node.mesh),final=local.transform(node.transform);local.delete();let remaining=final;const outputs=[];
    function take(mesh,transform,name,color,opacity){const raw=fromMesh(mesh);let world,part,next;try{world=raw.transform(transform);part=world.intersect(remaining);if(!part.isEmpty()&&part.volume()>1e-7){outputs.push({id:node.id,rootId:node.id,kind:'mesh',name,color,opacity,transform:new THREE.Matrix4().toArray(),mesh:meshData(part)});next=remaining.subtract(part);if(remaining!==final)remaining.delete();remaining=next;next=null;}}finally{raw.delete();world?.delete();part?.delete();next?.delete();}}
    function visit(source,outer,repairFallback){
      if(source.meshRole==='hole')return;const recipe=source.meshSource,transform=multiply(outer,source.transform);
      // Earlier partial repairs may still be nonmanifold. A unary repair chain
      // inherits leaf color from its latest valid footprint, while genuine
      // source groups continue to project their own separate colored regions.
      if(['repair','reduce','remesh','smooth','sculpt','erase-fill','make-solid','hollow','lid'].includes(recipe?.operation?.type)){
        const original=recipe.sources[0],fallback=repairFallback??{mesh:source.mesh,transform,name:source.name,color:source.color??'#77a8b5',opacity:source.opacity??1};
        if(original.meshSource?.sources||original.meshSource?.node.children?.length){const frame=multiply(transform,new THREE.Matrix4().fromArray(original.transform).invert().toArray());visit(original,frame,fallback);}
        else take(fallback.mesh,fallback.transform,fallback.name,fallback.color,fallback.opacity);
      }
      else if(recipe?.operation?.type==='connectors'){const frame=multiply(outer,delta(source,recipe.node));visit(recipe.sources[recipe.operation.part],frame);}
      else if(Array.isArray(recipe?.sources)&&recipe.operation.type!=='repair'){const frame=multiply(outer,delta(source,recipe.node));for(const child of recipe.sources)if(!recipe.operation.suppressedIds?.includes(child.id))visit(child,frame);}
      else if(recipe?.node.children?.length){const legacy={...structuredClone(recipe.node),multicolor:true},parts=coloredParts(legacy),frame=multiply(outer,delta(source,recipe.node));for(const part of parts)take(part.data,frame,part.name,part.color,part.opacity??source.opacity??1);}
      else take(source.mesh,transform,source.name,source.color??'#77a8b5',source.opacity??1);
    }
    try{visit(node,new THREE.Matrix4().toArray());if(!remaining.isEmpty()&&remaining.volume()>Math.max(1e-5,final.volume()*1e-7))outputs.push({id:node.id,rootId:node.id,kind:'mesh',name:node.name,color:node.color??'#77a8b5',opacity:node.opacity??1,transform:new THREE.Matrix4().toArray(),mesh:meshData(remaining)});return outputs;}
    finally{if(remaining!==final)remaining.delete();final.delete();}
  }
  function outlinedNode(op){
    if(op.shape==='sketch'){const n=makeNode('sketch',[0,0,0],{...(op.name!==undefined?{name:op.name}:{})});applySketch(n,prepareConstrainedSketch(op.sketch),{preserveScale:false});n.pos=[2,3].includes(op.sketch?.version)?resolveSketch(n.sketch).center:[0,0,n.size[2]/2];return n;}
    if(op.shape==='plugin'){
      const manifest=parsePlugin(op.manifest),shape=manifest.shapes.find(s=>s.id===op.shapeId);if(!shape)throw Error('Formpaket-Vorlage fehlt.');
      const nodes=shape.nodes.map(spec=>{const n=makeNode(spec.type,spec.pos,{...structuredClone(spec)});if(spec.params)fitParameters(n);if(!validNode(n))throw Error('Ungültige Netzvorlage.');return n;});const result=nodes.length===1?nodes[0]:groupNodes(nodes);result.name=label(shape.name,'de');return result;
    }
    if(!['text','svg'].includes(op.shape)||!Number.isFinite(op.height)||op.height<.01||op.height>10000||!Array.isArray(op.paths)||!op.paths.length||op.paths.length>1000)throw Error('Gültige geschlossene Text-/SVG-Konturen und Höhe wählen.');
    const parts=[];let merged;
    try{
      let count=0;for(const path of op.paths){if(!['NonZero','EvenOdd'].includes(path.fillRule)||!Array.isArray(path.contours)||!path.contours.length)throw Error('Ungültige Konturfüllung.');for(const line of path.contours){count+=line.length;if(count>100000||line.length<3||line.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)||Math.abs(v)>100000)))throw Error('Kontur zu groß oder ungültig.');}const section=new kernel.CrossSection(path.contours,path.fillRule);try{if(!section.isEmpty())parts.push(section.extrude(op.height));}finally{section.delete();}}
      if(!parts.length)throw Error('Die Kontur enthält keine gefüllte Fläche.');merged=kernel.Manifold.union(parts);positive(merged);const normalized=normalizeMesh(meshData(merged));
      return makeNode(op.shape==='text'?'text':'import',[0,0,op.height/2],{mesh:normalized.mesh,size:normalized.size,name:op.name??(op.shape==='text'?'Text':'SVG'),...(op.shape==='text'?{text:op.text,font:op.font}:{}),outlineSource:{shape:op.shape,paths:op.paths,height:op.height,...(op.svg!==undefined?{svg:op.svg}:{})}});
    }finally{merged?.delete();parts.forEach(m=>m.delete());}
  }
  async function checkedRecipe(node){
    const legacy=localSource(node),source=node.meshSource;if(!(Array.isArray(source?.sources)))return legacy;
    const rebuilt=await derive(source.sources,source.operation),expectedNode=rebuilt.node??rebuilt.nodes[source.operation.part??0];if(!expectedNode)throw Error('Die erhaltene Netzableitung lässt sich nicht mehr zuordnen.');
    const expected=['repair','reduce','remesh','smooth','sculpt','erase-fill','make-solid','hollow','lid'].includes(source.operation.type)?localManifold(expectedNode):worldManifold(expectedNode),stored=['repair','reduce','remesh','smooth','sculpt','erase-fill','make-solid','hollow','lid'].includes(source.operation.type)?localManifold(source.node):worldManifold(source.node);let added,missing;
    try{positive(expected);positive(stored);added=stored.subtract(expected);missing=expected.subtract(stored);const allowed=Math.max(expected.volume()*3e-5,1e-8);if(added.status()!=='NoError'||missing.status()!=='NoError'||Math.abs(added.volume())>allowed||Math.abs(missing.volume())>allowed)throw Error('Die erhaltenen Originalquellen passen nicht zum Netzrezept. Projekt unverändert lassen und Werkzeug erneut aufrufen.');}
    finally{expected.delete();stored.delete();added?.delete();missing?.delete();}return legacy;
  }
  function patchLegacy(source,path,set){
    let target=source;if(target.locked)throw Error('Die Netzquelle ist gesperrt.');for(const id of path){target=target.children?.find(n=>n.id===id);if(!target)throw Error('Die Netzquelle wurde nicht gefunden.');if(target.locked)throw Error('Die Netzquelle ist gesperrt.');}
    if(!set||typeof set!=='object'||Array.isArray(set)||!Object.keys(set).length||Object.keys(set).some(k=>!['name','color','solid','suppressed','pos','rot','size','mirror','params','segments','sketch','text','font','outline','opacity','notes'].includes(k)))throw Error('Ungültige Änderung der Netzquelle.');
    if(target.locked)throw Error('Die Netzquelle ist gesperrt.');
    if((set.text!==undefined||set.font!==undefined)&&!set.outline)throw Error('Text und Schrift benötigen neu berechnete Originalkonturen.');
    for(const [key,value]of Object.entries(set))target[key]=structuredClone(value);
    if(set.sketch){if(target.type!=='sketch')throw Error('Diese Quelle ist keine Netzskizze.');applySketch(target,prepareConstrainedSketch(set.sketch));}
    if(set.outline){const rebuilt=outlinedNode({...set.outline,shape:target.type==='text'?'text':'svg',text:target.text,font:target.font});target.mesh=rebuilt.mesh;target.size=rebuilt.size;target.outlineSource=rebuilt.outlineSource;delete target.outline;}
    if(set.params){if(target.type==='import')throw Error('Ein importiertes Netz besitzt keine Formparameter.');delete target.mesh;fitParameters(target);}
    if(!validNode(source))throw Error('Die Netzparameter sind ungültig.');synchronizeHistory([source]);return source;
  }
  async function editSource(original,path,set,organization){
    if(original.locked||organization&&flags(original,organization).locked)throw Error('Die erhaltene Originalquelle oder ihr Layer/Ordner ist gesperrt.');
    const source=original.meshSource,checkedSource=await checkedRecipe(original);
    if(['reduce','remesh','smooth','sculpt','erase-fill','make-solid','hollow','lid'].includes(source?.operation?.type)&&path.length)throw Error('Die Netzbearbeitung behält Original und Schutzflächen unverändert im Verlauf. Für Geometrieänderungen am Original Rückgängig verwenden und das Werkzeug erneut aufrufen.');
    if(source?.operation?.type==='connectors'&&path.length)throw Error('Originale einer Steckverbindung bleiben als Verlauf erhalten. Für Änderungen beide Teile gemeinsam neu verbinden oder Rückgängig verwenden.');
    if(Array.isArray(source?.sources)&&path.length){
      const index=source.sources.findIndex(n=>n.id===path[0]);if(index<0)throw Error('Die erhaltene Originalquelle wurde nicht gefunden.');
      const sources=structuredClone(source.sources),recipe=structuredClone(source.operation);
      if(path.length===1&&Object.hasOwn(set,'suppressed')){
        if(recipe.type!=='group'||Object.keys(set).length!==1||typeof set.suppressed!=='boolean')throw Error('Nur eine Gruppenquelle allein aussetzen oder wieder aktivieren.');
        if(sources[index].locked||organization&&flags(sources[index],organization).locked)throw Error('Die Originalquelle oder ihr Layer/Ordner ist gesperrt.');const suppressed=new Set(recipe.suppressedIds??[]);if(set.suppressed)suppressed.add(path[0]);else suppressed.delete(path[0]);recipe.suppressedIds=[...suppressed];
      }else sources[index]=await editSource(sources[index],path.slice(1),set,organization);
      if(source.operation.type==='bodies')throw Error('Nach Geometrieänderung unabhängige Körper erneut herauslösen.');
      const result=await derive(sources,recipe),legacy=result.node??result.nodes[recipe.part??0];if(!legacy)throw Error('Die geänderte Quelle erzeugt den bisherigen Ergebniskörper nicht mehr.');
      const out=commonFromLegacy(legacy,original,multiply(delta(original,source.node),matrixArray(legacy)));out.id=original.id;out.name=original.name;if(original.color!==undefined)out.color=original.color;out.meshRole=original.meshRole??'solid';out.meshSource=keepMeshAppearance(original,retained(legacy,sources,recipe));return out;
    }
    // A v2 root has geometry in its worker recipe frame. Root dimensions remain
    // editable there; child edits resolve to original snapshots above.
    if(!path.length&&set?.suppressed!==undefined)throw Error('Nur eine Quelle innerhalb einer Gruppe aussetzen.');
    const legacy=checkedSource,before=structuredClone(legacy);patchLegacy(legacy,path,set);
    if(Array.isArray(source?.sources)){if(set.params||set.segments||set.sketch||set.outline||set.text||set.font||set.suppressed!==undefined)throw Error('Dafür eine erhaltene Originalquelle auswählen.');return {...structuredClone(original),name:legacy.name,color:legacy.color,...(set.opacity!==undefined?{opacity:set.opacity}:{}),...(set.notes!==undefined?{metadata:{...original.metadata,notes:set.notes}}:{}),meshRole:legacy.solid?'solid':'hole',transform:multiply(delta(original,before),matrixArray(legacy))};}
    const out=commonFromLegacy(legacy,original,multiply(original.meshSource?delta(original,before):original.transform,matrixArray(legacy)));out.id=original.id;if(!path.length){if(set.opacity!==undefined)out.opacity=set.opacity;if(set.notes!==undefined)out.metadata={...out.metadata,notes:set.notes};}
    out.meshSource=keepMeshAppearance(original,Array.isArray(source?.sources)?retained(legacy,source.sources,source.operation):{format:'Formnaro-MeshSource',version:1,node:legacy});return out;
  }
  async function edit({project,operation}){
    const draft=cadProjectSnapshot(project),op=operation;if(!op||typeof op.type!=='string')throw Error('Netzauftrag fehlt.');
    if(op.type==='mesh-sketch-attachment'){
      const prepared=prepareSketchAttachment(draft,op);if(prepared.engine!=='mesh')throw Error('Für ein CAD-Teil das native Anbauwerkzeug verwenden.');
      const proof=node=>{const checked=inspectSolid(node),solid=fromMesh(node.mesh),parts=solid.decompose();try{return {...checked,solids:parts.length};}finally{for(const part of parts)part.delete();solid.delete();}},before=proof(prepared.target);
      let result={project:draft};for(const operation of attachmentMeshOperations(prepared))result=await edit({project:result.project,operation});
      const node=result.project.nodes.find(n=>n.id===result.selectedIds[0]),report=checkSketchAttachment(before,proof(node),prepared),synchronized=synchronizeMeshWorkplane(result.project,draft);
      return {...result,project:synchronized.project,report,warnings:synchronized.warnings};
    }
    if(op.type==='mesh-from-data'){
      if(Object.keys(op).some(k=>!['type','id','mesh','name','color','transform'].includes(k))||typeof op.id!=='string'||!op.id||draft.nodes.some(n=>n.id===op.id))throw Error('Ein berechnetes Netz benötigt eine neue eindeutige Objektkennung.');
      validateProjectMesh(op.mesh);const transform=op.transform??new THREE.Matrix4().toArray();validateAffineMatrix(transform);
      const node={id:op.id,kind:'mesh',name:op.name??'Berechnetes Netz',meshRole:'solid',mesh:structuredClone(op.mesh),transform:[...transform],color:op.color??'#77a8b5',opacity:1,hidden:false,locked:false,layerId:draft.activeLayerId,folderId:draft.activeFolderId,metadata:{notes:'Lokal berechnete neue Geometrie; vorhandene Modellquellen unverändert.'}};
      if(flags(node,draft).locked||flags(node,draft).hidden)throw Error('Einen sichtbaren entsperrten Zielcontainer wählen.');
      const proof=inspectSolid(node);draft.nodes.push(node);return {project:cadProjectSnapshot(draft),selectedIds:[node.id],report:{created:true,solidProven:true,volume:proof.volume,triangles:proof.triangles}};
    }
    if(op.type==='mesh-create-source'||op.type==='mesh-replace-source'){
      const legacy=outlinedNode(op),original=op.type==='mesh-replace-source'?draft.nodes.find(n=>n.id===op.id):null;
      if(op.type==='mesh-replace-source'&&(!original||original.kind!=='mesh'||flags(original,draft).locked||flags(original,draft).hidden))throw Error('Ein sichtbares entsperrtes Netzteil auswählen.');
      if(original?.meshSource?.node.children?.length)throw Error('Zuerst die erhaltene Einzelquelle auswählen.');
      if(op.frame!==undefined)validateAffineMatrix(op.frame);const template=original??{layerId:draft.activeLayerId,folderId:draft.activeFolderId,opacity:1,hidden:false,locked:false,metadata:{notes:''}},out=commonFromLegacy(legacy,template,original?multiply(delta(original,original.meshSource.node),matrixArray(legacy)):multiply(op.frame??new THREE.Matrix4().toArray(),matrixArray(legacy)));
      if(original){out.id=original.id;out.name=original.name;out.color=original.color;out.meshRole=original.meshRole;}
      else if(op.id)out.id=op.id;
      out.meshSource={format:'Formnaro-MeshSource',version:1,node:recipeData(legacy)};if(op.shape==='plugin')out.metadata={...out.metadata,plugin:{id:op.manifest.id,shapeId:op.shapeId}};if(flags(out,draft).hidden||flags(out,draft).locked)throw Error('Einen sichtbaren entsperrten Zielcontainer wählen.');inspectSolid(out);
      if(original)draft.nodes[draft.nodes.indexOf(original)]=out;else{if(draft.nodes.some(n=>n.id===out.id))throw Error('Objektkennung bereits verwendet.');draft.nodes.push(out);}return {project:cadProjectSnapshot(draft),selectedIds:[out.id],report:{created:!original}};
    }
    if(op.type==='mesh-create'){
      if(!SHAPES.some(([type])=>type===op.shape)||op.shape==='text')throw Error('Eine vorhandene Netz-Grundform auswählen. Text benötigt zuerst eine originale Schriftkontur.');
      const legacy=makeNode(op.shape,op.position,{...(op.id?{id:op.id}:{}),...(op.name?{name:op.name}:{}),...(op.size?{size:op.size}:{}),...(op.params?{params:op.params}:{}),...(op.segments?{segments:op.segments}:{}),...(op.color?{color:op.color}:{})});
      if(!validNode(legacy))throw Error('Ungültige Netz-Grundform oder Formparameter.');if(op.params)fitParameters(legacy);if(!validNode(legacy))throw Error('Ungültige Netz-Grundform.');
      if(op.frame!==undefined)validateAffineMatrix(op.frame);
      const template={layerId:draft.activeLayerId,folderId:draft.activeFolderId,opacity:1,hidden:false,locked:false,metadata:{notes:''}},out=commonFromLegacy(legacy,template,op.frame===undefined?matrixArray(legacy):multiply(op.frame,matrixArray(legacy)));out.meshSource={format:'Formnaro-MeshSource',version:1,node:legacy};
      if(draft.nodes.some(n=>n.id===out.id))throw Error('Diese Objektkennung wird bereits verwendet.');if(flags(out,draft).locked||flags(out,draft).hidden)throw Error('Einen sichtbaren, entsperrten Layer/Ordner zum Erstellen auswählen.');inspectSolid(out);draft.nodes.push(out);return {project:cadProjectSnapshot(draft),selectedIds:[out.id],report:{created:true}};
    }
    const ids=['mesh-group','mesh-connectors'].includes(op.type)?op.ids:[op.id];if(!Array.isArray(ids)||!ids.length||ids.length>500||new Set(ids).size!==ids.length)throw Error('Netzteile eindeutig auswählen.');
    const sources=ids.map(id=>{const node=draft.nodes.find(n=>n.id===id);if(!node||node.kind!=='mesh')throw Error('Nur bearbeitbare Netzteile auswählen.');if(flags(node,draft).locked)throw Error('Das Netzteil oder sein Ordner/Layer ist gesperrt.');if(flags(node,draft).hidden)throw Error('Nur sichtbare Netzteile bearbeiten.');return node;});
    const first=sources[0];let outputs,report={};
    if(op.type==='mesh-counterpart'){
      if(Object.keys(op).some(k=>!['type','id','resultId','options','name','color'].includes(k))||typeof op.resultId!=='string'||!op.resultId||op.resultId.length>200||draft.nodes.some(n=>n.id===op.resultId)||op.name!==undefined&&(typeof op.name!=='string'||!op.name.trim()||op.name.length>200)||op.color!==undefined&&!/^#[0-9a-fA-F]{6}$/.test(op.color))throw Error('Gegenstück benötigt eine neue eindeutige Kennung und gültige Darstellungswerte.');
      const options=validateCounterpartOptions(op.options),fixed=counterpartSource(first,options),recipe={type:'counterpart',options};
      const out={...structuredClone(first),id:op.resultId,name:op.name??(first.name+' – Gegenstück').slice(0,200),color:op.color??'#e4a14b',meshRole:'solid',mesh:fixed.node.mesh,meshSource:retained(fixed.node,[first],recipe),metadata:{notes:'Konturfolgendes Gegenstück. Reale Druckpassung nicht geprüft.',sourceReference:{objectId:first.id,geometryDigest:projectObjectGeometryDigest(first),operation:'mesh-edit'}}};
      const after=inspectSolid(out);draft.nodes.push(out);return {project:cadProjectSnapshot(draft),selectedIds:[out.id],report:{...fixed.report,resultId:out.id,sourceId:first.id,volumeAfter:after.volume}};
    }
    if(op.type==='mesh-lid'){
      if(Object.keys(op).some(k=>!['type','id','resultId','options','name','color'].includes(k))||typeof op.resultId!=='string'||!op.resultId||op.resultId.length>200||draft.nodes.some(n=>n.id===op.resultId)||op.name!==undefined&&(typeof op.name!=='string'||!op.name.trim()||op.name.length>200)||op.color!==undefined&&!/^#[0-9a-fA-F]{6}$/.test(op.color))throw Error('Deckel benötigt eine neue eindeutige Objektkennung und gültige Darstellungswerte.');
      const options=validateMeshLidOptions(op.options),fixed=lidSource(first,options),recipe={type:'lid',options};
      const out={...structuredClone(first),id:op.resultId,name:op.name??(first.name+' – Deckel').slice(0,200),color:op.color??'#e4a14b',meshRole:'solid',mesh:fixed.node.mesh,meshSource:retained(fixed.node,[first],recipe),metadata:{notes:'Formangepasster Deckel. Rechnerische Geometrieprüfung; reale Druckpassung und Schraubgewinde sind nicht geprüft.',sourceReference:{objectId:first.id,geometryDigest:projectObjectGeometryDigest(first),operation:'mesh-edit'}}};
      const after=inspectSolid(out);draft.nodes.push(out);
      return {project:cadProjectSnapshot(draft),selectedIds:[out.id],report:{...fixed.report,resultId:out.id,sourceId:first.id,volumeAfter:after.volume},warnings:['Deckel: Passung und Schraubgewinde am realen Teil prüfen. Der Einsteckbereich wurde gegen die Quellflächen geprüft.']};
    }
    if(op.type==='mesh-hollow'){
      if(Object.keys(op).some(k=>!['type','id','resultId','options'].includes(k))||typeof op.resultId!=='string'||!op.resultId||op.resultId.length>200||draft.nodes.some(n=>n.id===op.resultId))throw Error('Aushöhlen benötigt eine neue eindeutige Objektkennung.');
      if(first.meshRole==='hole')throw Error('Zum Aushöhlen ein Material-Netzteil auswählen.');
      if(meshProtectionRegions(first).length)throw Object.assign(Error('Aushöhlen ist für Teile mit Schutzbereichen gesperrt. Das geschützte Original bleibt unverändert.'),{code:'MESH_PROTECTION'});
      const options=validateMeshHollowOptions(op.options),before=inspectSolid(first),fixed=hollowSource(first,options),recipe={type:'hollow',options};
      const out={...structuredClone(first),id:op.resultId,name:(first.name+' – hohl').slice(0,200),meshRole:'solid',mesh:fixed.node.mesh,meshSource:keepMeshAppearance(first,retained(fixed.node,[first],recipe)),metadata:{...first.metadata,sourceReference:{objectId:first.id,geometryDigest:projectObjectGeometryDigest(first),operation:'mesh-edit'}}};
      delete out.metadata.meshProtection;
      const after=inspectSolid(out);
      if(!(after.volume<before.volume))throw Error('Das Aushöhlen hat keinen nachweisbaren Innenraum erzeugt.');
      report={...fixed.report,resultId:out.id,sourceId:first.id,originalRetained:true,solidProven:true,sourceSolidProven:true,volumeBefore:before.volume,volumeAfter:after.volume,removedVolume:before.volume-after.volume,volumeDifference:after.volume-before.volume,volumePercentChange:(after.volume-before.volume)/before.volume*100};
      draft.nodes.push(out);return {project:cadProjectSnapshot(draft),selectedIds:[out.id],report};
    }
    if(op.type==='mesh-make-solid'){
      if(Object.keys(op).some(k=>!['type','id','resultId','options'].includes(k))||typeof op.resultId!=='string'||!op.resultId||op.resultId.length>200||draft.nodes.some(n=>n.id===op.resultId))throw Error('Die geschlossene Annäherung benötigt eine neue eindeutige Objektkennung.');
      if(first.meshRole==='hole')throw Error('Für Make Solid ein Material-Netzteil auswählen. Die Lochrolle des Originals bleibt unverändert.');
      if(meshProtectionRegions(first).length)throw Object.assign(Error('Make Solid verändert die gesamte Oberfläche. Schutzbereiche zuerst ausdrücklich an einer unabhängigen Kopie freigeben; das geschützte Original bleibt unverändert.'),{code:'MESH_PROTECTION'});
      const options=validateMeshMakeSolidOptions(op.options),fixed=makeSolidSource(first,options),recipe={type:'make-solid',options};
      const out={...structuredClone(first),id:op.resultId,name:(first.name+' – Solid').slice(0,200),meshRole:'solid',mesh:fixed.node.mesh,meshSource:keepMeshAppearance(first,retained(fixed.node,[first],recipe)),metadata:{...first.metadata,sourceReference:{objectId:first.id,geometryDigest:projectObjectGeometryDigest(first),operation:'mesh-edit'}}};
      delete out.metadata.meshProtection;
      const after=inspectSolid(out);let before=null;if(meshTopologyClass(first.mesh).type==='closedMesh'){try{before=inspectSolid(first);}catch{/* Damaged sources have no certified material volume. */}}
      report={...fixed.report,resultId:out.id,sourceId:first.id,originalRetained:true,solidProven:true,sourceSolidProven:!!before,volumeBefore:before?.volume??null,volumeAfter:after.volume,volumeDifference:before?after.volume-before.volume:null,volumePercentChange:before?(after.volume-before.volume)/before.volume*100:null};
      draft.nodes.push(out);return {project:cadProjectSnapshot(draft),selectedIds:[out.id],report};
    }
    if(op.type==='mesh-erase-fill'){
      if(Object.keys(op).some(k=>!['type','id','options'].includes(k)))throw Error('Unbekannte Felder zum Ersetzen eines Netzbereichs.');
      const options=validateMeshEraseFillOptions(op.options),fixed=eraseFillSource(first,options),recipe={type:'erase-fill',options};
      outputs=[{...structuredClone(first),mesh:fixed.node.mesh,meshSource:keepMeshAppearance(first,retained(fixed.node,[first],recipe))}];
      outputs[0].metadata={...first.metadata,sourceReference:first.metadata?.sourceReference??{objectId:first.id,geometryDigest:projectObjectGeometryDigest(first),operation:'mesh-edit'}};
      if(fixed.protection)outputs[0].metadata.meshProtection=fixed.protection;
      let before=null;if(meshTopologyClass(first.mesh).type==='closedMesh'){try{before=inspectSolid(first);}catch{/* A selected damaged input need not be a material body. */}}
      const closed=meshTopologyClass(outputs[0].mesh).type==='closedMesh',after=closed?inspectSolid(outputs[0]):null;
      report={...fixed.report,solidProven:closed,sourceSolidProven:!!before,volumeBefore:before?.volume??null,volumeAfter:after?.volume??null,volumeDifference:before&&after?after.volume-before.volume:null,volumePercentChange:before&&after?(after.volume-before.volume)/before.volume*100:null};
    }
    else if(op.type==='mesh-smooth'||op.type==='mesh-sculpt'){
      if(Object.keys(op).some(k=>!['type','id','options'].includes(k)))throw Error('Unbekannte Glättungsfelder.');
      const sculpt=op.type==='mesh-sculpt',options=(sculpt?validateMeshSculptOptions:validateMeshSmoothOptions)(op.options),fixed=(sculpt?sculptSource:smoothSource)(first,options),recipe={type:sculpt?'sculpt':'smooth',options};
      outputs=[{...structuredClone(first),mesh:fixed.node.mesh,meshSource:keepMeshAppearance(first,retained(fixed.node,[first],recipe))}];
      outputs[0].metadata={...first.metadata,sourceReference:first.metadata?.sourceReference??{objectId:first.id,geometryDigest:projectObjectGeometryDigest(first),operation:'mesh-edit'}};
      if(fixed.protection)outputs[0].metadata.meshProtection=fixed.protection;
      report=fixed.report;
      if(meshTopologyClass(first.mesh).type==='closedMesh'){const before=inspectSolid(first),after=inspectSolid(outputs[0]);report={...report,solidProven:true,volumeBefore:before.volume,volumeAfter:after.volume,volumeDifference:after.volume-before.volume,volumePercentChange:(after.volume-before.volume)/before.volume*100};}else report={...report,solidProven:false};
    }
    else if(['mesh-reduce','mesh-remesh'].includes(op.type)){
      if(Object.keys(op).some(k=>!['type','id','options'].includes(k)))throw Error('Unbekannte Vereinfachungsfelder.');
      const isRemesh=op.type==='mesh-remesh',options=(isRemesh?validateMeshRemeshOptions:validateMeshReduceOptions)(op.options),fixed=await (isRemesh?remeshSource:reduceSource)(first,options),recipe={type:isRemesh?'remesh':'reduce',options};
      outputs=[{...structuredClone(first),mesh:fixed.node.mesh,meshSource:keepMeshAppearance(first,retained(fixed.node,[first],recipe))}];
      outputs[0].metadata={...first.metadata,sourceReference:first.metadata?.sourceReference??{objectId:first.id,geometryDigest:projectObjectGeometryDigest(first),operation:'mesh-edit'}};
      if(fixed.protection)outputs[0].metadata.meshProtection=fixed.protection;
      report=fixed.report;
      // A closed material input must remain an independently proven material
      // body. Open sheets retain exact boundaries and are not called solids.
      if(meshTopologyClass(first.mesh).type==='closedMesh'){const before=inspectSolid(first),after=inspectSolid(outputs[0]),allowance=options.method==='curved-v1'?before.volume*.01:Math.max(1e-7,before.volume*2e-6);if(Math.abs(after.volume-before.volume)>allowance)throw Error('Die Vereinfachung überschreitet die Volumenprüfung.');report={...report,solidProven:true,volumeBefore:before.volume,volumeAfter:after.volume,volumeTolerance:allowance,volumeDifference:after.volume-before.volume,volumePercentChange:(after.volume-before.volume)/before.volume*100};}else report={...report,solidProven:false};
    }
    else if(op.type==='mesh-connectors'){
      if(Object.keys(op).some(k=>!['type','ids','reference','options'].includes(k))||sources.length!==2)throw Error('Genau zwei Netzteile für eine gemeinsame Steckverbindung auswählen.');
      if(sources.some(n=>meshProtectionRegions(n).length))throw Error('Die Steckverbindung benötigt ausdrücklich freigegebene Schutzbereiche.');
      sources.forEach(inspectSolid);
      const recipe={type:'connectors',reference:validateConnectorReference(op.reference),options:validateConnectorOptions(op.options??{})},result=await derive(sources,recipe);
      assertConnectorNeighbors(kernel,result.pinMesh,draft.nodes.filter(n=>!ids.includes(n.id)));
      outputs=result.nodes.map((legacy,i)=>{const original=sources[i],out=commonFromLegacy(legacy,original);out.id=original.id;out.meshSource=keepMeshAppearance(original,retained(legacy,sources,{...recipe,part:i}));out.metadata={...out.metadata,sourceReference:original.metadata?.sourceReference??{objectId:original.id,geometryDigest:projectObjectGeometryDigest(original),operation:'mesh-edit'}};return out;});report=result.report;
    }
    else if(op.type==='mesh-role'){if(!['solid','hole'].includes(op.role))throw Error('Unbekannte Netzrolle.');outputs=[{...first,meshRole:op.role}];}
    else if(['mesh-simple-repair','mesh-close-hole'].includes(op.type)){
      if(Object.keys(op).some(k=>!['type','id','options'].includes(k)))throw Error('Unbekanntes Feld der gezielten Netzreparatur.');
      const fixed=op.type==='mesh-close-hole'?closeHole(first,op.options):simpleRepair(first,op.options),recipe={type:'repair',options:structuredClone(op.options)};
      outputs=[{...structuredClone(first),mesh:fixed.node.mesh,meshSource:keepMeshAppearance(first,retained(fixed.node,[first],recipe))}];
      if(first.meshSource?.node.multicolor!==undefined&&!first.meshSource.appearance)outputs[0].meshSource.appearance={multicolor:first.meshSource.node.multicolor};
      outputs[0].metadata={...first.metadata,sourceReference:first.metadata?.sourceReference??{objectId:first.id,geometryDigest:projectObjectGeometryDigest(first),operation:'mesh-edit'}};report=fixed.report;
    }
    else if(op.type==='mesh-source-edit'){sources.forEach(inspectSolid);outputs=[await editSource(first,op.path??[],op.set,draft)];}
    else if(op.type==='mesh-repair'){
      const recipe={type:'repair',options:{fillSmallHoles:op.fillSmallHoles??false}};let fixed;try{fixed=await derive([first],recipe);}catch(error){if(!op.optional)throw error;inspectSolid(first);return {project:draft,selectedIds:[first.id],warnings:['Die optionale Netzreparatur wurde nicht übernommen. Das Original ist als geschlossener Körper geprüft und bleibt erhalten.'],report:{repairError:error.message}};}outputs=[{...structuredClone(first),mesh:fixed.node.mesh,meshSource:keepMeshAppearance(first,retained(fixed.node,[first],recipe))}];outputs[0].metadata={...first.metadata,sourceReference:first.metadata?.sourceReference??{objectId:first.id,geometryDigest:projectObjectGeometryDigest(first),operation:'mesh-edit'}};report=fixed.report;
    }else if(op.type==='mesh-dissolve'){
      const source=first.meshSource;if(!source?.node.children?.length||source.node.operation==='partition')throw Error('Diese Netzquelle ist keine auflösbare Gruppe.');
      await checkedRecipe(first);
      if(Array.isArray(source.sources)){if(!['group','drill','finish'].includes(source.operation.type))throw Error('Diese Ableitung kann nicht aufgelöst werden.');const frame=delta(first,source.node);outputs=source.sources.map(n=>({...structuredClone(n),transform:multiply(frame,n.transform)}));}
      else{const root=source.node,frame=multiply(delta(first,root),matrixArray({...root,size:root.size.map((v,i)=>v/root.baseSize[i])}));outputs=root.children.map(child=>{const out=commonFromLegacy(child,{...first,metadata:{notes:child.notes??''}},multiply(frame,matrixArray(child)));out.meshSource={format:'Formnaro-MeshSource',version:1,node:structuredClone(child)};return out;});}
    }else{
      let recipe;
      if(op.type==='mesh-group'){if(sources.length<2)throw Error('Mindestens zwei Netzteile auswählen.');recipe={type:'group',mode:op.operation??'union'};}
      else if(op.type==='mesh-drill')recipe={type:'drill',reference:op.reference,options:op.options??{}};
      else if(op.type==='mesh-split')recipe={type:'split',plane:op.plane};
      else if(op.type==='mesh-extract-bodies')recipe={type:'bodies'};
      else if(op.type==='mesh-finish'){if(op.geometryDigest&&op.geometryDigest!==projectObjectGeometryDigest(first))throw Error('Kantenbezug passt nicht mehr. Kanten erneut wählen.');recipe={type:'finish',edgeIds:op.edgeIds,options:op.options??{}};}
      else throw Error('Unbekannter Netzauftrag.');
      sources.forEach(inspectSolid);const result=await derive(sources,recipe);report=result.report??{};const nodes=result.nodes??[result.node];
      outputs=nodes.map((legacy,i)=>{const out=commonFromLegacy(legacy,first);out.id=i===0?(op.resultId??first.id):crypto.randomUUID();out.meshSource=keepMeshAppearance(first,retained(legacy,sources,{...recipe,...(nodes.length>1?{part:i}:{})}));out.metadata={...out.metadata,sourceReference:['mesh-split','mesh-extract-bodies'].includes(op.type)&&first.metadata?.sourceReference?structuredClone(first.metadata.sourceReference):{objectId:first.id,geometryDigest:projectObjectGeometryDigest(first),operation:'mesh-edit'}};return out;});
    }
    const selected=new Set(ids),insertion=draft.nodes.findIndex(n=>selected.has(n.id));draft.nodes=draft.nodes.filter(n=>!selected.has(n.id));
    // Restoring originals must never overwrite unrelated roots with reused IDs.
    const existing=new Set(draft.nodes.map(n=>n.id));for(const n of outputs){if(existing.has(n.id)){if(op.type!=='mesh-dissolve')throw Error('Die Kennung einer erhaltenen Netzquelle wird bereits verwendet.');n.id=crypto.randomUUID();}existing.add(n.id);if(!['mesh-role','mesh-simple-repair','mesh-close-hole','mesh-reduce','mesh-remesh','mesh-smooth','mesh-sculpt','mesh-erase-fill'].includes(op.type))inspectSolid(n);}
    if(['mesh-split','mesh-extract-bodies'].includes(op.type))report={...report,review:{parts:meshPartitionReview(outputs,op.type==='mesh-split'?report.plane:null),scope:'stored-faces-near-plane',keepsAllMaterial:true}};
    draft.nodes.splice(insertion,0,...outputs);return {project:cadProjectSnapshot(draft),selectedIds:outputs.map(n=>n.id),report};
  }
  return {importLegacy,inspectSolid,analyzeEdges,toolsQuery,edit,verifyProject:project=>cadProjectSnapshot(project)};
}
