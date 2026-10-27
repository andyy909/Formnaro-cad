import {validatePhotoProvenance} from './cad-photo-multiview-data.js';
import {validateCadAIReferences} from './cad-ai-feature-reference-data.js';
import {validateProjectPhotos} from './cad-photo-project.js';
import {isGeometryRef,validateGeometryRef,validateGeometryIdentity,hasGeometryRefs} from './cad-geometry-ref.js';
import {validateCadJoints} from './cad-joints-data.js';
import {validateMeshProtection} from './mesh-protection.js';
import {validateParametricSource} from './cad-parametric-data.js';
import {validateFreeCADSource} from './cad-freecad.js';
import {validateCadModelingOperation} from './cad-modeling-data.js';
import {validateCadDrawings} from './cad-drawing-data.js';
import {validateCadProjectParameters} from './cad-project-parameters-data.js';
import {validateCadContourLinks} from './cad-linked-contours-data.js';
import {buildCadDependencyGraph} from './cad-dependency-graph.js';
import {validateCadAnnotations,CAD_ANNOTATION_LIMITS} from './cad-annotations-data.js';
// Internal format-5 foundation. This module is intentionally not imported by
// the existing renderer. Data validation never proves that a BRep is a valid
// solid: the CAD service must build/read and validate it before a commit.
import {SCHEMAS} from './parameters.js';
import {validateCadWorkspace,cadWorkspaceStoredProjectVersion} from './cad-workspace.js';
import {resolveCadSketch} from './cad-sketch.js';
import {validateCadPartition} from './cad-partition-data.js';
import {validateCadExtraction} from './cad-extraction-data.js';
import {PROJECT_OBJECT_KINDS,validateProjectMesh,validateSourceReference} from './project-objects.js';
import {validateMeshSource,validateMigrationSource} from './mesh-source-data.js';
import {validateMeshWorkplaneReference,synchronizeMeshWorkplane} from './mesh-workplane.js';
export const CAD_PROJECT_VERSION=5;
export const CAD_ADVANCED_PROJECT_VERSION=7;
export const MIXED_PROJECT_VERSION=8;
export const PARAMETRIC_PROJECT_VERSION=9;
export const PROFILE_PROJECT_VERSION=10;
export const MODELING_PROJECT_VERSION=11;
export const DRAWING_PROJECT_VERSION=12;
export const PROJECT_PARAMETERS_VERSION=13;
export const CONTOUR_LINKS_VERSION=14;
export const CONSTRAINT_PROJECT_VERSION=15;
export const JOINT_PROJECT_VERSION=16;
export const PACKAGE_PROJECT_VERSION=17;
export const DRAWING_DISTANCE_PROJECT_VERSION=18;
export const PHOTO_PROJECT_VERSION=19;
export const PHOTO_RECONSTRUCTION_PROJECT_VERSION=20;
export const AI_REFERENCE_PROJECT_VERSION=21;
export const FREECAD_DOCUMENT_PROJECT_VERSION=22;
export const FREECAD_PARAMETERS_PROJECT_VERSION=23;
export const CAD_PROJECT_FORMAT='OfflineCAD';
export const CAD_PROJECT_LIMITS=Object.freeze({bytes:50*1024*1024,brepBytes:12*1024*1024,edgeDomainBytes:2*1024*1024,roots:500,nodes:5000,depth:12,meshVertices:1000000,meshTriangles:2000000});
export const CAD_SHAPE_TYPES=Object.freeze(['box','cylinder','sphere','cone','pyramid','roof','wedge','hexagon','triangle','tube','torus','capsule','star','heart','gear','text','roundbox','halfSphere','thread','nut','countersink','shellbox','polygon','svg']);
export const CAD_IDENTITY_MATRIX=Object.freeze([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);

const ROOT_FIELDS=['format','version','name','nodes','bed','workplane','coordinateMode','layers','folders','activeLayerId','activeFolderId','ruler','workspace','migrationSource','drawings','projectParameters','contourLinks','joints','photos','featureReferences'];
const NODE_FIELDS=['id','kind','name','transform','solid','recipe','brep','stats','source','children','operation','finish','partition','extraction','modeling','annotations','mesh','meshSource','meshRole','color','opacity','multicolor','hidden','locked','suppressed','layerId','folderId','metadata','constructionBudget','geometryIdentity'];
const RUNTIME_FIELDS=new Set(['view','displayQuality','exportQuality','displayMesh','renderData','renderBuffers','cache','caches','workerHandles','workerState']);
const BAD_KEYS=new Set(['__proto__','prototype','constructor']);
const utf8=new TextEncoder();
// Only snapshots created here own cached revisions. Caller-owned and
// shallow-frozen objects still cross the complete validation boundary.
const readViews=new WeakMap();
export function cadProjectReadView(value){
  if(readViews.has(value))return value;
  const result=cadProjectSnapshot(value);
  function freeze(object){if(object&&typeof object==='object'){for(const child of Object.values(object))freeze(child);Object.freeze(object);}return object;}
  freeze(result);readViews.set(result,{});return result;
}
function fail(path,message){throw new Error(`CAD-Projekt ${path}: ${message}`);}
function record(value,path){if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail(path,'Objekt erwartet.');return value;}
function keys(value,allowed,path){record(value,path);for(const key of Object.keys(value))if(BAD_KEYS.has(key)||!allowed.includes(key))fail(path,`Unbekanntes Feld ${key}.`);}
function string(value,path,max=200,{empty=false}={}){if(typeof value!=='string'||value.length>max||(!empty&&!value.trim()))fail(path,'Ungültiger Text.');return value;}
function number(value,path){if(typeof value!=='number'||!Number.isFinite(value))fail(path,'Endliche Zahl erwartet.');return value===0?0:value;}
function vector(value,count,path){if(!Array.isArray(value)||value.length!==count)fail(path,`${count} Zahlen erwartet.`);return value.map((v,i)=>number(v,`${path}[${i}]`));}
function boolean(value,path){if(typeof value!=='boolean')fail(path,'Boolescher Wert erwartet.');return value;}
function enumValue(value,choices,path){if(!choices.includes(value))fail(path,`Wert muss ${choices.join('/')} sein.`);return value;}
function id(value,path){return string(value,path);}
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object'){const out={};for(const key of Object.keys(value).sort())out[key]=canonical(value[key]);return out;}return value===0?0:value;}

/** Return a copy of a finite, invertible column-major affine matrix.
 * Scaling, mirrors and shear are retained; no TRS decomposition occurs. */
export function validateAffineMatrix(value,path='transform'){
  const matrix=vector(value,16,path);
  if(matrix[3]!==0||matrix[7]!==0||matrix[11]!==0||matrix[15]!==1)fail(path,'Eine affine Matrix mit letzter Zeile 0,0,0,1 wird benötigt.');
  // Row scaling permits very small/large finite scales without a fixed
  // determinant threshold. Also reject inverses that overflow JavaScript.
  const rows=[0,1,2].map(i=>{
    const row=[matrix[i],matrix[4+i],matrix[8+i]],scale=Math.max(...row.map(Math.abs));
    if(!scale)fail(path,'Singuläre Transformationsmatrix.');
    return [...row.map(v=>v/scale),...CAD_IDENTITY_MATRIX.slice(i*4,i*4+3).map(v=>v/scale)];
  });
  for(let col=0;col<3;col++){
    let pivot=col;for(let row=col+1;row<3;row++)if(Math.abs(rows[row][col])>Math.abs(rows[pivot][col]))pivot=row;
    if(rows[pivot][col]===0)fail(path,'Singuläre Transformationsmatrix.');
    [rows[col],rows[pivot]]=[rows[pivot],rows[col]];
    const divisor=rows[col][col];rows[col]=rows[col].map(v=>v/divisor);
    for(let row=0;row<3;row++)if(row!==col){const factor=rows[row][col];rows[row]=rows[row].map((v,i)=>v-factor*rows[col][i]);}
  }
  if(rows.some(row=>row.some(v=>!Number.isFinite(v)))||rows.some(row=>!Number.isFinite(row.slice(3).reduce((sum,v,i)=>sum+v*matrix[12+i],0))))fail(path,'Transformationsmatrix ist numerisch nicht invertierbar.');
  return matrix;
}

function contourCurves(value,path,budget){
  if(!Array.isArray(value)||!value.length||value.length>100000)fail(path,'Originale CAD-Konturkanten erwartet.');
  return value.map((segment,i)=>{
    const p=`${path}[${i}]`;record(segment,p);if(++budget.count>100000)fail(path,'Zu viele CAD-Konturkanten.');
    const kind=enumValue(segment.kind,['line','bezier','arc','ellipse'],`${p}.kind`),fields={line:['start','end'],bezier:['points','interval'],arc:['start','through','end'],ellipse:['center','rx','ry','rotation','startAngle','endAngle']};keys(segment,['kind','reversed',...fields[kind]],p);const out={kind};
    if(segment.reversed!==undefined)out.reversed=boolean(segment.reversed,`${p}.reversed`);
    if(kind==='line'||kind==='arc')for(const key of fields[kind])out[key]=vector(segment[key],2,`${p}.${key}`);
    if(kind==='bezier'){if(!Array.isArray(segment.points)||![3,4].includes(segment.points.length))fail(p,'Quadratische oder kubische Bézierpunkte erwartet.');out.points=segment.points.map((v,j)=>vector(v,2,`${p}.points[${j}]`));if(segment.interval!==undefined){out.interval=vector(segment.interval,2,`${p}.interval`);if(out.interval[1]<=out.interval[0])fail(p,'Ungültiges Kurvenintervall.');}}
    if(kind==='ellipse'){out.center=vector(segment.center,2,`${p}.center`);for(const key of ['rx','ry']){out[key]=number(segment[key],`${p}.${key}`);if(out[key]<=0)fail(p,'Positive Ellipsenradien erforderlich.');}for(const key of ['rotation','startAngle','endAngle'])if(segment[key]!==undefined)out[key]=number(segment[key],`${p}.${key}`);}
    return out;
  });
}
function contours(value,path){
  if(!Array.isArray(value)||!value.length||value.length>10000)fail(path,'CAD-Konturen erwartet.');const budget={count:0};
  return value.map((contour,i)=>{const p=`${path}[${i}]`;keys(contour,['outer','holes'],p);const out={outer:contourCurves(contour.outer,`${p}.outer`,budget)};
    if(contour.holes!==undefined){if(!Array.isArray(contour.holes)||contour.holes.length>10000)fail(p,'Ungültige Innenkonturen.');out.holes=contour.holes.map((v,j)=>contourCurves(v,`${p}.holes[${j}]`,budget));}return out;
  });
}
function recipe(value,path){
  keys(value,['type','size','params','text','font','contours','topologyCertified','sourceTopology','sketch'],path);
  const out={type:enumValue(value.type,[...CAD_SHAPE_TYPES,'sketch'],`${path}.type`)};
  // Physical original recipe dimensions. The transform applies afterwards;
  // stored stats never reconstruct recipes or transforms. A resize helper may
  // measure current dimensions from freshly validated CAD bounds.
  out.size=vector(value.size,3,`${path}.size`);if(out.size.some(v=>v<=0||v>10000))fail(path,'Ungültige physische Rezeptgröße.');
  if(out.type==='sketch'){
    keys(value,['type','size','sketch'],path);const resolved=resolveCadSketch(value.sketch);
    if(out.size.some((v,i)=>v!==resolved.size[i]))fail(path,'Skizzengröße widerspricht den gespeicherten Maßformeln.');
    return {...out,sketch:resolved.sketch};
  }
  if(value.sketch!==undefined)fail(path,'Skizzendaten benötigen ein natives Skizzenrezept.');
  if(value.params!==undefined){const schema=(SCHEMAS[out.type]||[]).filter(field=>field.key!=='edgeSteps');keys(value.params,schema.map(field=>field.key),`${path}.params`);out.params={};for(const key of Object.keys(value.params)){const field=schema.find(f=>f.key===key),v=value.params[key];if(field.options)out.params[key]=enumValue(v,field.options.map(option=>option[0]),`${path}.params.${key}`);else{out.params[key]=number(v,`${path}.params.${key}`);if(v<field.min||v>field.max||field.step===1&&!Number.isInteger(v))fail(path,'Ungültiger nativer Formparameter.');}}}
  if(value.text!==undefined)out.text=string(value.text,`${path}.text`,10000);
  if(value.font!==undefined)out.font=string(value.font,`${path}.font`,10000);
  // This matches the actual original-contour builder. Closure, nesting and
  // geometric tolerance still require authoritative validateAndBuild.
  const original=['text','svg'].includes(out.type);
  if(original){if(value.topologyCertified!==true||value.contours===undefined)fail(path,'Text/SVG benötigen originale, CAD-klassifizierte Außen- und Innenkonturen.');out.topologyCertified=true;out.contours=contours(value.contours,`${path}.contours`);if(value.sourceTopology!==undefined)out.sourceTopology=enumValue(value.sourceTopology,[out.type==='text'?'original-font-cad-classified':'original-svg-cad-classified'],`${path}.sourceTopology`);}
  else if(['contours','topologyCertified','sourceTopology'].some(k=>Object.hasOwn(value,k)))fail(path,'Originale Konturdaten sind nur für Text und SVG vorgesehen.');
  return out;
}
function brep(value,path){
  if(isGeometryRef(value))return validateGeometryRef(value,'brep');
  keys(value,['format','data','triangulation'],path);
  if(value.format!=='OpenCascade-BRep'||value.triangulation!==false)fail(path,'Ein BRep ohne eingebettete Triangulierung wird benötigt.');
  const data=string(value.data,`${path}.data`,CAD_PROJECT_LIMITS.brepBytes);if(utf8.encode(data).byteLength>CAD_PROJECT_LIMITS.brepBytes)fail(path,'BRep ist zu groß.');
  // The false flag is a writer contract, not proof about arbitrary BRep text.
  // The CAD reader/writer must independently verify its topology and content.
  return {format:value.format,data,triangulation:false};
}
/** Persistent exact curve domain, not a display polyline or native handle.
 * The native finisher independently reads it and validates actual EDGE topology. */
export function validateCadEdgeDomain(value,path='edgeDomain'){
  const out=brep(value,path);if(isGeometryRef(out)){if(out.bytes>CAD_PROJECT_LIMITS.edgeDomainBytes)fail(path,'CAD-Kantendomäne ist zu groß.');return out;}if(utf8.encode(out.data).byteLength>CAD_PROJECT_LIMITS.edgeDomainBytes)fail(path,'CAD-Kantendomäne ist zu groß.');
  for(const label of ['Triangulations','Polygon3D','PolygonOnTriangulations']){const matches=[...out.data.matchAll(new RegExp('(?:^|\\n)'+label+'\\s+(\\d+)(?=\\s|$)','g'))];if(matches.length!==1||Number(matches[0][1])!==0)fail(path,'CAD-Kantendomäne darf keine Triangulierung oder Polygonpuffer enthalten.');}
  return out;
}
function stats(value,path){
  keys(value,['bounds','volume','solids'],path);keys(value.bounds,['min','max'],`${path}.bounds`);
  const min=vector(value.bounds.min,3,`${path}.bounds.min`),max=vector(value.bounds.max,3,`${path}.bounds.max`),volume=number(value.volume,`${path}.volume`);
  if(min.some((v,i)=>v>=max[i])||volume<=0||!Number.isInteger(value.solids)||value.solids<1||value.solids>5000)fail(path,'Ungültige CAD-Körperstatistik.');
  return {bounds:{min,max},volume,solids:value.solids};
}
function topology(value,path){
  keys(value,['kind','origin','anchor','topologyId'],path);keys(value.origin,['rootId','path','featureId'],`${path}.origin`);
  const out={kind:enumValue(value.kind,['vertex','edge','face'],`${path}.kind`),origin:{rootId:id(value.origin.rootId,`${path}.origin.rootId`),path:value.origin.path}};
  if(!Array.isArray(out.origin.path)||out.origin.path.length>12)fail(path,'Ungültiger Quellenpfad.');out.origin.path=out.origin.path.map((v,i)=>id(v,`${path}.origin.path[${i}]`));
  if(value.origin.featureId!==undefined)out.origin.featureId=id(value.origin.featureId,`${path}.origin.featureId`);
  if(value.topologyId!==undefined)out.topologyId=id(value.topologyId,`${path}.topologyId`);
  keys(value.anchor,['point','normal','tangent','curveType','samples','edgeDomain'],`${path}.anchor`);out.anchor={point:vector(value.anchor.point,3,`${path}.anchor.point`)};
  for(const key of ['normal','tangent'])if(value.anchor[key]!==undefined){const v=vector(value.anchor[key],3,`${path}.anchor.${key}`);if(Math.abs(Math.hypot(...v)-1)>1e-8)fail(path,'Ankerrichtungen müssen normiert sein.');out.anchor[key]=v;}
  if(out.anchor.normal&&out.anchor.tangent&&Math.abs(out.anchor.normal.reduce((sum,v,i)=>sum+v*out.anchor.tangent[i],0))>1e-8)fail(path,'Ankerrichtungen müssen orthogonal sein.');
  if(value.anchor.curveType!==undefined)out.anchor.curveType=string(value.anchor.curveType,`${path}.anchor.curveType`,80);
  if(value.anchor.samples!==undefined){if(!Array.isArray(value.anchor.samples)||value.anchor.samples.length<2||value.anchor.samples.length>32)fail(path,'Ungültige Ankerpunkte.');out.anchor.samples=value.anchor.samples.map((v,i)=>vector(v,3,`${path}.anchor.samples[${i}]`));}
  if(value.anchor.edgeDomain!==undefined){if(out.kind!=='edge')fail(path,'Eine native Kantendomäne gehört ausschließlich zu einem Kantenbezug.');out.anchor.edgeDomain=validateCadEdgeDomain(value.anchor.edgeDomain,`${path}.anchor.edgeDomain`);}
  // These are provenance and geometric anchors, never stable OCCT indices or
  // an assertion that a unique correspondence was already found.
  return out;
}
function finish(value,path){
  keys(value,['steps'],path);if(!Array.isArray(value.steps)||!value.steps.length||value.steps.length>20)fail(path,'1–20 Kantenoperationen erwartet.');const ids=new Set();
  return {steps:value.steps.map((step,i)=>{const p=`${path}.steps[${i}]`;keys(step,['id','kind','amount','edges'],p);const out={id:id(step.id,`${p}.id`),kind:enumValue(step.kind,['round','chamfer'],`${p}.kind`),amount:number(step.amount,`${p}.amount`)};
    if(ids.has(out.id))fail(p,'Doppelte Operation-ID.');ids.add(out.id);if(out.amount<=0||out.amount>1000||!Array.isArray(step.edges)||!step.edges.length||step.edges.length>128)fail(p,'Ungültige Kantenoperation.');out.edges=step.edges.map((v,j)=>{const ref=topology(v,`${p}.edges[${j}]`);if(ref.kind!=='edge')fail(p,'Kantenbezug erwartet.');return ref;});return out;})};
}
function referenceMesh(value,path){
  return validateProjectMesh(value,{vertices:CAD_PROJECT_LIMITS.meshVertices,triangles:CAD_PROJECT_LIMITS.meshTriangles,path});
}
function node(value,path,state,depth=0){
  if(++state.count>CAD_PROJECT_LIMITS.nodes||depth>CAD_PROJECT_LIMITS.depth)fail(path,'Zu viele Quellen oder Gruppenebenen.');keys(value,NODE_FIELDS,path);
  const out={id:id(value.id,`${path}.id`),kind:enumValue(value.kind,PROJECT_OBJECT_KINDS,`${path}.kind`),name:string(value.name,`${path}.name`),transform:validateAffineMatrix(value.transform,`${path}.transform`)};
  if(value.geometryIdentity!==undefined)out.geometryIdentity=validateGeometryIdentity(value.geometryIdentity);
  if(state.ids.has(out.id))fail(path,'Doppelte Objektkennung.');state.ids.add(out.id);
  for(const key of ['hidden','locked','suppressed','multicolor'])if(value[key]!==undefined)out[key]=boolean(value[key],`${path}.${key}`);
  if(value.constructionBudget!==undefined){
    if(out.kind!=='cad'||value.source!=='native'||!['heart','gear','thread','nut'].includes(value.recipe?.type))fail(path,'Eine gespeicherte Konstruktionsgenauigkeit gehört nur zu nativen Kurvenformen.');
    out.constructionBudget=number(value.constructionBudget,`${path}.constructionBudget`);if(out.constructionBudget<2e-7||out.constructionBudget>1e-4)fail(path,'Konstruktionsgenauigkeit außerhalb 0,0000002–0,0001 mm.');
  }
  if(value.color!==undefined){if(typeof value.color!=='string'||!/^#[\da-f]{6}$/i.test(value.color))fail(path,'Ungültige Farbe.');out.color=value.color;}
  if(value.opacity!==undefined){out.opacity=number(value.opacity,`${path}.opacity`);if(out.opacity<.05||out.opacity>1)fail(path,'Deckkraft außerhalb 0,05–1.');}
  if(value.layerId!==undefined)out.layerId=id(value.layerId,`${path}.layerId`);
  if(value.folderId!==undefined)out.folderId=value.folderId===null?null:id(value.folderId,`${path}.folderId`);
  if(value.annotations!==undefined){if(out.kind!=='cad')fail(path,'Markierungen benötigen native CAD-Flächen.');out.annotations=validateCadAnnotations(value.annotations);for(const a of out.annotations){if(state.annotationIds.has(a.id))fail(path,'Doppelte Markierungskennung.');state.annotationIds.add(a.id);}state.annotations+=out.annotations.length;if(state.annotations>CAD_ANNOTATION_LIMITS.total)fail(path,'Maximal 1000 Markierungen erlaubt.');}
  if(value.metadata!==undefined){keys(value.metadata,['notes','tags','plugin','importedFile','sourceReference','meshProtection','stepFaceColors','parametricSource','freecadSource','photoReconstruction'],`${path}.metadata`);out.metadata={};
    if(value.metadata.photoReconstruction!==undefined){if(out.kind!=='cad')fail(path,'Fotorekonstruktionen benötigen CAD-Quellen.');out.metadata.photoReconstruction=validatePhotoProvenance(value.metadata.photoReconstruction);}
    if(value.metadata.freecadSource!==undefined){if(out.kind!=='cad')fail(path,'FreeCAD-Quellen benötigen einen CAD-Körper.');out.metadata.freecadSource=validateFreeCADSource(value.metadata.freecadSource);}
    if(value.metadata.parametricSource!==undefined){if(out.kind!=='cad')fail(path,'Parametrische Quelldaten benötigen einen CAD-Körper.');out.metadata.parametricSource=validateParametricSource(value.metadata.parametricSource);}
    if(value.metadata.stepFaceColors!==undefined){
      const faces=value.metadata.stepFaceColors;if(out.kind!=='cad'||!Array.isArray(faces)||faces.length>40000)fail(path,'Ungültige STEP-Flächenfarben.');const seen=new Set();
      out.metadata.stepFaceColors=faces.map(f=>{keys(f,['faceIndex','color','opacity'],path);if(!Number.isSafeInteger(f.faceIndex)||f.faceIndex<1||f.faceIndex>40000||seen.has(f.faceIndex)||!/^#[\da-f]{6}$/i.test(f.color)||!Number.isFinite(f.opacity)||f.opacity<.05||f.opacity>1)fail(path,'Ungültige STEP-Flächenfarbe.');seen.add(f.faceIndex);return {faceIndex:f.faceIndex,color:f.color,opacity:f.opacity};});
    }
    if(value.metadata.meshProtection!==undefined){if(out.kind!=='mesh')fail(path,'Schutzbereiche sind nur für Netzteile erlaubt.');out.metadata.meshProtection=validateMeshProtection(value.metadata.meshProtection);}
    if(value.metadata.sourceReference!==undefined)out.metadata.sourceReference=validateSourceReference(value.metadata.sourceReference);
    if(value.metadata.notes!==undefined)out.metadata.notes=string(value.metadata.notes,`${path}.metadata.notes`,4000,{empty:true});
    if(value.metadata.tags!==undefined){if(!Array.isArray(value.metadata.tags)||value.metadata.tags.length>100)fail(path,'Ungültige Tags.');out.metadata.tags=value.metadata.tags.map((v,i)=>string(v,`${path}.metadata.tags[${i}]`,100));}
    if(value.metadata.plugin!==undefined){keys(value.metadata.plugin,['id','shapeId'],`${path}.metadata.plugin`);out.metadata.plugin={id:id(value.metadata.plugin.id,`${path}.metadata.plugin.id`),shapeId:id(value.metadata.plugin.shapeId,`${path}.metadata.plugin.shapeId`)};}
    if(value.metadata.importedFile!==undefined){keys(value.metadata.importedFile,['name','type'],`${path}.metadata.importedFile`);out.metadata.importedFile={name:string(value.metadata.importedFile.name,`${path}.metadata.importedFile.name`,1000),type:enumValue(value.metadata.importedFile.type,['step','stp','svg','stl','obj','3mf','glb','gltf','fcstd'],`${path}.metadata.importedFile.type`)};if(out.metadata.importedFile.type==='fcstd'&&out.metadata.freecadSource?.version!==2)fail(path,'Ein FCStd-Import benötigt sein erhaltenes natives Quelldokument.');}
  }
  if(out.kind==='referenceMesh'||out.kind==='mesh'){
    if(value.meshRole!==undefined){if(out.kind!=='mesh')fail(path,'Nur bearbeitbare Netze besitzen eine Körper-/Lochrolle.');out.meshRole=enumValue(value.meshRole,['solid','hole'],`${path}.meshRole`);}
    if(value.meshSource!==undefined){if(out.kind!=='mesh')fail(path,'Nur bearbeitbare Netze besitzen Netzquellen.');out.meshSource=validateMeshSource(value.meshSource,{validateSourceNode:source=>node(source,`${path}.meshSource.sources`,{count:0,ids:new Set(),annotations:0,annotationIds:new Set()})});}
    if(depth||['solid','recipe','brep','stats','source','children','operation','finish','partition','extraction','modeling','suppressed','multicolor'].some(k=>Object.hasOwn(value,k)))fail(path,'Referenzmesh ist kein CAD-Körper oder eine Gruppenquelle.');out.mesh=referenceMesh(value.mesh,`${path}.mesh`);return out;
  }
  if(Object.hasOwn(value,'mesh'))fail(path,'CAD-Körper dürfen kein Mesh als Konstruktionsdaten enthalten.');
  if(Object.hasOwn(value,'meshSource'))fail(path,'CAD-Körper dürfen keine Netzquelle als Konstruktion enthalten.');
  if(Object.hasOwn(value,'meshRole'))fail(path,'CAD-Körper verwenden ihre native Körper-/Lochrolle.');
  out.solid=boolean(value.solid,`${path}.solid`);out.source=enumValue(value.source,['native','step','group','finish','partition','extraction','modeling'],`${path}.source`);out.brep=brep(value.brep,`${path}.brep`);out.stats=stats(value.stats,`${path}.stats`);
  if(value.recipe!==undefined)out.recipe=recipe(value.recipe,`${path}.recipe`);
  if(value.children!==undefined){if(!Array.isArray(value.children)||!value.children.length||value.children.length>500)fail(path,'Ungültige CAD-Quellen.');out.children=value.children.map((v,i)=>node(v,`${path}.children[${i}]`,state,depth+1));}
  if(value.operation!==undefined){if(!out.children)fail(path,'Gruppenoperation braucht Quellen.');out.operation=enumValue(value.operation,['union','intersection'],`${path}.operation`);}
  if(value.finish!==undefined)out.finish=finish(value.finish,`${path}.finish`);
  if(value.partition!==undefined){if(out.source!=='partition')fail(path,'Eine Ebenenteilung benötigt eine erhaltene Originalquelle.');out.partition=validateCadPartition(value.partition);}
  if(value.extraction!==undefined){if(out.source!=='extraction')fail(path,'Herauslösen benötigt einen eigenen nativen Quellenbezug.');out.extraction=validateCadExtraction(value.extraction,validateAffineMatrix);}
  if(value.modeling!==undefined){
    if(out.source!=='modeling'||value.modeling?.version!==1)fail(path,'CAD-Bearbeitung benötigt eine erhaltene Quelle und Rezeptversion 1.');
    const {sourceSignature,...operation}=value.modeling;out.modeling={version:1,...validateCadModelingOperation(operation)};
    if(['face-offset','shell'].includes(out.modeling.kind)){if(typeof sourceSignature!=='string'||!/^[a-f0-9]{64}$/.test(sourceSignature))fail(path,'Flächenbearbeitung benötigt eine geprüfte Originalgeometrie.');out.modeling.sourceSignature=sourceSignature;}
    else if(sourceSignature!==undefined)fail(path,'Profilwerkzeuge benötigen keine Flächenkennung.');
  }
  if(out.finish&&!['group','finish','partition','extraction','modeling'].includes(out.source))fail(path,'Nachgelagerte Kantenoperationen benötigen eine Gruppe oder einen Quellen-Wrapper.');
  if(out.source==='native'&&(!out.recipe||out.children))fail(path,'Native Quelle benötigt ein Rezept und keine Kinder.');
  if(out.source==='step'&&(out.children||out.recipe))fail(path,'STEP-Quelle muss ein eigenständiger CAD-Körper sein.');
  if(out.source==='group'&&(!out.children||!out.operation||out.recipe))fail(path,'Gruppe benötigt Quellen und eine boolesche Operation.');
  if(out.source==='extraction'&&(out.children?.length!==1||!out.extraction||out.recipe||out.operation))fail(path,'Herauslösen benötigt genau eine Originalquelle und einen geprüften Geometriebezug.');
  if(out.source==='partition'&&(out.children?.length!==1||!out.partition||out.recipe||out.operation))fail(path,'Teilung benötigt genau eine erhaltene Originalquelle und eine Ebene.');
  if(out.source==='finish'&&(out.children?.length!==1||!out.finish||out.recipe||out.operation))fail(path,'Kantenkörper benötigt genau eine editierbare Quelle und Kantenoperationen, keine boolesche Operation.');
  if(out.source==='modeling'){
    if(!out.modeling||out.recipe||out.operation||!out.children||out.children.some(c=>c.kind!=='cad'||!c.solid||c.suppressed))fail(path,'CAD-Bearbeitung benötigt aktive native Originalquellen.');
    if(out.modeling.kind==='loft'){
      if(out.children.length<2||out.children.length>8)fail(path,'Loft benötigt 2–8 Skizzenquellen.');
    }else if(out.children.length!==1)fail(path,'Diese CAD-Bearbeitung benötigt genau eine Originalquelle.');
    if(['loft','sweep'].includes(out.modeling.kind)&&out.children.some(c=>c.source!=='native'||c.recipe?.type!=='sketch'))fail(path,'Loft und Sweep benötigen bearbeitbare native Skizzenquellen.');
  }
  return out;
}
function workplane(value,path){
  keys(value,['origin','orientation','reference'],path);const out={origin:vector(value.origin,3,`${path}.origin`),orientation:vector(value.orientation,4,`${path}.orientation`),reference:null};
  if(Math.abs(Math.hypot(...out.orientation)-1)>1e-8)fail(path,'Orientierung muss ein normiertes Quaternion sein.');
  if(value.reference!==null){if(value.reference?.kind==='mesh')out.reference=validateMeshWorkplaneReference(value.reference);else{keys(value.reference,['objectId','topology'],`${path}.reference`);out.reference={objectId:id(value.reference.objectId,`${path}.reference.objectId`),topology:topology(value.reference.topology,`${path}.reference.topology`)};if(out.reference.topology.kind!=='face')fail(path,'Arbeitsebene benötigt eine CAD-Fläche.');}}return out;
}
function organization(project,nodes){
  const containers=new Map();
  function container(value,path,folder=false){keys(value,folder?['id','name','hidden','locked','layerId','parentId']:['id','name','hidden','locked'],path);const out={id:id(value.id,`${path}.id`),name:string(value.name,`${path}.name`),hidden:boolean(value.hidden,`${path}.hidden`),locked:boolean(value.locked,`${path}.locked`)};if(containers.has(out.id))fail(path,'Doppelte Containerkennung.');containers.set(out.id,out);if(folder){out.layerId=id(value.layerId,`${path}.layerId`);out.parentId=value.parentId===null?null:id(value.parentId,`${path}.parentId`);}return out;}
  if(!Array.isArray(project.layers)||!project.layers.length||project.layers.length>500||!Array.isArray(project.folders)||project.folders.length>500)fail('organization','Ungültige Layer-/Ordnerverwaltung.');
  const layers=project.layers.map((v,i)=>container(v,`layers[${i}]`)),folders=project.folders.map((v,i)=>container(v,`folders[${i}]`,true)),layerIds=new Set(layers.map(v=>v.id)),folderMap=new Map(folders.map(v=>[v.id,v]));
  if(!layerIds.has('default'))fail('layers','Standardlayer fehlt.');
  for(const folder of folders){if(!layerIds.has(folder.layerId))fail('folders','Unbekannter Layer.');const seen=new Set([folder.id]);let parent=folder.parentId;while(parent!==null){const entry=folderMap.get(parent);if(!entry||entry.layerId!==folder.layerId||seen.has(parent)||seen.size>12)fail('folders','Ungültiger oder zyklischer Ordnerbezug.');seen.add(parent);parent=entry.parentId;}}
  const assignment=(layerId,folderId,path)=>{if(!layerIds.has(layerId)||folderId!==null&&(!folderMap.has(folderId)||folderMap.get(folderId).layerId!==layerId))fail(path,'Ungültige Layer-/Ordnerzuordnung.');};
  for(const n of nodes){n.layerId??='default';n.folderId??=null;assignment(n.layerId,n.folderId,`node ${n.id}`);}
  assignment(project.activeLayerId,project.activeFolderId,'activeLayerId');
  return {layers,folders,activeLayerId:project.activeLayerId,activeFolderId:project.activeFolderId};
}

/** Strict external-data boundary: accepts only version 5, never migrates. */
export function validateCadProject(value){
  record(value,'root');if(value.format!==CAD_PROJECT_FORMAT||![CAD_PROJECT_VERSION,CAD_ADVANCED_PROJECT_VERSION,MIXED_PROJECT_VERSION,PARAMETRIC_PROJECT_VERSION,PROFILE_PROJECT_VERSION,MODELING_PROJECT_VERSION,DRAWING_PROJECT_VERSION,PROJECT_PARAMETERS_VERSION,CONTOUR_LINKS_VERSION,CONSTRAINT_PROJECT_VERSION,JOINT_PROJECT_VERSION,PACKAGE_PROJECT_VERSION,DRAWING_DISTANCE_PROJECT_VERSION,PHOTO_PROJECT_VERSION,PHOTO_RECONSTRUCTION_PROJECT_VERSION,AI_REFERENCE_PROJECT_VERSION,FREECAD_DOCUMENT_PROJECT_VERSION,FREECAD_PARAMETERS_PROJECT_VERSION].includes(value.version))fail('version','Nur Projektformat 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22 und 23 werden unterstützt. Alte Netzprojekte benötigen den Netzprojekt-Import.');keys(value,ROOT_FIELDS,'root');
  if(!Array.isArray(value.nodes)||value.nodes.length>CAD_PROJECT_LIMITS.roots)fail('nodes','Maximal 500 Teile erlaubt.');
  const state={count:0,ids:new Set(),annotations:0,annotationIds:new Set()},nodes=value.nodes.map((v,i)=>node(v,`nodes[${i}]`,state));
  const requiredVersion=cadProjectStoredVersion({nodes,migrationSource:value.migrationSource,workplane:value.workplane,workspace:value.workspace,drawings:value.drawings,projectParameters:value.projectParameters,contourLinks:value.contourLinks,joints:value.joints,photos:value.photos,featureReferences:value.featureReferences});
  if(value.version<17&&(hasGeometryRefs(nodes)||nodes.some(n=>n.geometryIdentity)))fail('version','Geometriekataloge benötigen Projektformat 17.');
  if(value.version<requiredVersion)fail('version',requiredVersion===23?'FreeCAD-Parameterbindungen benötigen Projektformat 23.':requiredVersion===22?'Bearbeitete FreeCAD-Dokumente benötigen Projektformat 22.':requiredVersion===21?'Merkmalsbezüge benötigen Projektformat 21.':requiredVersion===20?'Technische Fotoansichtssätze benötigen Projektformat 20.':requiredVersion===19?'Projektfotos benötigen Projektformat 19.':requiredVersion===18?'Abstandsmaße benötigen Projektformat 18.':requiredVersion===17?'Geometriekataloge benötigen Projektformat 17.':requiredVersion===16?'Gelenke benötigen Projektformat 16.':requiredVersion===15?'Dauerhafte Skizzenbedingungen benötigen Projektformat 15.':requiredVersion===14?'Verknüpfte Konturen und stabile Zeichnungsbezüge benötigen Projektformat 14.':requiredVersion===13?'Projektparameter und gespeicherte Konstruktionsgenauigkeit benötigen Projektformat 13.':requiredVersion===12?'Zeichnungsblätter benötigen Projektformat 12.':requiredVersion===11?'Neue CAD-Bearbeitungen benötigen Projektformat 11.':requiredVersion===10?'Erweiterte Skizzen und Netzrezepte benötigen Projektformat 10.':requiredVersion===9?'Parametrische Quellen benötigen Projektformat 9.':requiredVersion===8?'Bearbeitbare Netze und Quellenverweise benötigen Projektformat 8.':'Erweiterte native Inhalte benötigen CAD-Projektformat 7.');
  const bed=vector(value.bed,2,'bed');if(bed.some(v=>v<20||v>2000))fail('bed','Arbeitsfläche außerhalb 20–2000 mm.');
  const out={format:CAD_PROJECT_FORMAT,version:value.version,name:string(value.name,'name',200,{empty:true}),nodes,bed,workplane:workplane(value.workplane,'workplane'),coordinateMode:enumValue(value.coordinateMode,['plane','world'],'coordinateMode'),...organization(value,nodes),ruler:null};
  if(value.ruler!==null){keys(value.ruler,['origin','mode'],'ruler');out.ruler={origin:vector(value.ruler.origin,3,'ruler.origin'),mode:enumValue(value.ruler.mode,['min','center'],'ruler.mode')};}
  if(out.workplane.reference?.kind==='mesh'){
    const source=nodes.find(n=>n.id===out.workplane.reference.objectId&&['mesh','referenceMesh'].includes(n.kind));if(!source)fail('workplane.reference','Netz-Bezugsobjekt fehlt.');validateMeshWorkplaneReference(out.workplane.reference,{node:source});
  }else{
    if(out.workplane.reference&&!nodes.some(n=>n.id===out.workplane.reference.objectId&&n.kind==='cad'))fail('workplane.reference','CAD-Bezugsobjekt fehlt.');
    if(out.workplane.reference&&out.workplane.reference.topology.origin.rootId!==out.workplane.reference.objectId)fail('workplane.reference','Herkunft des Flächenbezugs widerspricht dem Bezugsobjekt.');
  }
  if(value.photos!==undefined)out.photos=validateProjectPhotos(value.photos);
  if(value.featureReferences!==undefined)out.featureReferences=validateCadAIReferences(value.featureReferences);
  if(value.joints!==undefined)out.joints=validateCadJoints(value.joints);
  if(value.projectParameters!==undefined)out.projectParameters=validateCadProjectParameters(value.projectParameters);
  if(value.contourLinks!==undefined)out.contourLinks=validateCadContourLinks(value.contourLinks);
  if(value.drawings!==undefined)out.drawings=validateCadDrawings(value.drawings);
  if(value.workspace!==undefined)out.workspace=validateCadWorkspace(value.workspace);
  if(value.migrationSource!==undefined)out.migrationSource=validateMigrationSource(value.migrationSource);
  if(out.contourLinks?.links.length||out.projectParameters?.version===2)buildCadDependencyGraph(out,{drawings:null});
  return canonical(out);
}

/** Create a new CAD-only project with independent default settings. */
export function createCadProject(options={}){
  return cadProjectSnapshot({format:CAD_PROJECT_FORMAT,version:CAD_PROJECT_VERSION,name:'Unbenanntes Modell',nodes:[],bed:[200,200],workplane:{origin:[0,0,0],orientation:[0,0,0,1],reference:null},coordinateMode:'plane',layers:[{id:'default',name:'Standard',hidden:false,locked:false}],folders:[],activeLayerId:'default',activeFolderId:null,ruler:null,...options});
}

/** Strip only named runtime fields; reject unknown stored-model properties.
 * This is the common boundary for confirmed state, Undo and revision inputs. */
export function cadProjectSnapshot(value){
  record(value,'root');const copy={};for(const key of Object.keys(value))if(!RUNTIME_FIELDS.has(key))copy[key]=value[key];
  let count=0;const active=new Set();
  function cleanNode(n,path,depth=0){record(n,path);if(++count>CAD_PROJECT_LIMITS.nodes||depth>CAD_PROJECT_LIMITS.depth||active.has(n))fail(path,'Zu viele Quellen, Gruppenebenen oder zyklische Quellen.');active.add(n);const out={};for(const key of Object.keys(n))if(!RUNTIME_FIELDS.has(key))out[key]=n[key];if(Array.isArray(n.children))out.children=n.children.map((child,i)=>cleanNode(child,`${path}.children[${i}]`,depth+1));active.delete(n);return out;}
  if(Array.isArray(copy.nodes))copy.nodes=copy.nodes.map((n,i)=>cleanNode(n,`nodes[${i}]`));
  if(copy.workplane?.reference?.kind==='mesh'){validateMeshWorkplaneReference(copy.workplane.reference);copy.workplane=synchronizeMeshWorkplane(copy).project.workplane;}
  // Internal drafts may introduce advanced content. External parse remains
  // strict: a file falsely declaring version 5 cannot contain that content.
  if(copy.format===CAD_PROJECT_FORMAT&&[5,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23].includes(copy.version))copy.version=copy.version>=8?Math.max(copy.version,cadProjectStoredVersion(copy)):cadProjectStoredVersion(copy);
  return validateCadProject(copy);
}
export function cadProjectStoredVersion(project){if(project.projectParameters?.version===2)return 23;const editedFreeCAD=n=>n.metadata?.freecadSource?.version===2||n.children?.some(editedFreeCAD)||n.meshSource?.sources?.some(editedFreeCAD)||n.meshSource?.node&&editedFreeCAD(n.meshSource.node);if(project.nodes?.some(editedFreeCAD))return 22;if(project.featureReferences!==undefined)return 21;const photoSource=n=>n.metadata?.photoReconstruction!==undefined||n.children?.some(photoSource)||n.meshSource?.sources?.some(photoSource);if(project.photos?.version===2||project.nodes?.some(photoSource))return 20;if(project.photos!==undefined)return 19;if(project.drawings?.sheets?.some(sheet=>sheet.annotations?.some(a=>a.kind==='distance')))return 18;if(project.nodes?.some(n=>n.geometryIdentity)||hasGeometryRefs(project))return 17;if(project.joints!==undefined)return 16;const constrainedSource=m=>m?.node?.sketch?.version===3||m?.sources?.some(constrainedNode),constrainedNode=n=>n.recipe?.sketch?.version===3||constrainedSource(n.meshSource)||n.children?.some(constrainedNode);if(project.nodes?.some(constrainedNode))return 15;const stableDrawing=Array.isArray(project.drawings?.sheets)&&project.drawings.sheets.some(sheet=>Array.isArray(sheet.views)&&sheet.views.some(view=>Array.isArray(view.projection?.curves)&&view.projection.curves.some(curve=>curve.sourceReferences!==undefined))||Array.isArray(sheet.annotations)&&sheet.annotations.some(annotation=>annotation.curveReferences!==undefined||annotation.unresolved!==undefined));if(project.contourLinks!==undefined||stableDrawing)return 14;const budget=n=>n.constructionBudget!==undefined||n.children?.some(budget)||n.meshSource?.sources?.some(budget);if(project.projectParameters!==undefined||project.nodes?.some(budget))return 13;if(project.drawings!==undefined)return 12;const modeled=n=>n.modeling!==undefined||n.children?.some(modeled)||n.meshSource?.sources?.some(modeled);if(project.nodes?.some(modeled))return 11;const richSource=m=>m?.operation?.type==='reduce'&&m.operation.options?.method==='curved-v1'||m?.node?.sketch?.version===2||m?.sources?.some(richNode),richNode=n=>n.recipe?.sketch?.version===2||richSource(n.meshSource)||n.children?.some(richNode);if(project.nodes?.some(richNode))return 10;const parametric=n=>n.metadata?.parametricSource!==undefined||n.children?.some(parametric);if(project.nodes?.some(parametric))return 9;const mixed=n=>n.kind==='mesh'||n.metadata?.sourceReference!==undefined||n.children?.some(mixed),advanced=n=>n.recipe?.type==='sketch'||n.partition!==undefined||n.extraction!==undefined||!!n.annotations?.length||n.children?.some(advanced);return project.workplane?.reference?.kind==='mesh'||project.workspace?.version>=2||project.migrationSource!==undefined||project.nodes?.some(mixed)?8:project.nodes?.some(advanced)?7:5;}
function encodedProject(value){const text=JSON.stringify(readViews.has(value)?value:cadProjectSnapshot(value));if(utf8.encode(text).byteLength>CAD_PROJECT_LIMITS.bytes)fail('root','Projektdatei ist größer als 50 MB.');return text;}
/** Deterministic JSON with sorted object keys and no display/worker buffers. */
export function serializeCadProject(value){return encodedProject(value);}
/** Capture one validated model generation, then encode only its changing
 * workspace. The private prefix owns no mutable project references. */
export function createCadWorkspaceSerializer(value){
  const model=cadProjectSnapshot(value);delete model.workspace;
  // workspace sorts after every format-5 model field, preserving exactly the
  // ordinary serializer's canonical JSON without re-encoding large BReps.
  const prefix=JSON.stringify(model).slice(0,-1)+',"workspace":',bytes=utf8.encode(prefix).byteLength;let assemblyPrefix;
  return workspace=>{
    if(workspace?.version>=2&&workspace.version!==5&&model.version<8)fail('workspace','Der gemeinsame Objektbaum benötigt Projektformat 8.');
    const selectedPrefix=cadWorkspaceStoredProjectVersion(model.version,workspace)!==model.version?(assemblyPrefix??=JSON.stringify({...model,version:cadWorkspaceStoredProjectVersion(model.version,workspace)}).slice(0,-1)+',"workspace":'):prefix,selectedBytes=selectedPrefix===prefix?bytes:utf8.encode(selectedPrefix).byteLength;
    const suffix=JSON.stringify(canonical(validateCadWorkspace(workspace)))+'}';
    if(selectedBytes+utf8.encode(suffix).byteLength>CAD_PROJECT_LIMITS.bytes)fail('root','Projektdatei ist größer als 50 MB.');
    return selectedPrefix+suffix;
  };
}
export function parseCadProject(value){if(typeof value!=='string')return validateCadProject(value);if(utf8.encode(value).byteLength>CAD_PROJECT_LIMITS.bytes)fail('root','Projektdatei ist größer als 50 MB.');return validateCadProject(JSON.parse(value));}
/** Stable model identity, not a security hash. Array order remains semantic. */
export function cadProjectRevision(value){const cached=readViews.get(value);if(cached?.revision!==undefined)return cached.revision;const text=encodedProject(value);let a=2166136261,b=2246822519;for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b^text.charCodeAt(i),3266489917);}const result=(a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');if(cached)cached.revision=result;return result;}
