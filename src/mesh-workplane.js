import * as THREE from 'three';
import {cadGeometryDigest} from './cad-geometry-digest.js';
import {validateProjectMesh} from './project-objects.js';
import {isGeometryRef,validateGeometryRef} from './cad-geometry-ref.js';

const KINDS=['mesh','referenceMesh'],FIELDS=['kind','objectId','geometryDigest','triangleIndex','point','normal','tangent'];
const fail=message=>{throw Error(`Netz-Arbeitsebene: ${message}`);};
const vector=(value,name)=>{if(!Array.isArray(value)||value.length!==3||value.some(v=>typeof v!=='number'||!Number.isFinite(v)))fail(`${name} benötigt drei endliche Zahlen.`);return [...value];};
const v=value=>new THREE.Vector3(...value);
function unit(value){const scale=Math.max(Math.abs(value.x),Math.abs(value.y),Math.abs(value.z));if(!Number.isFinite(scale)||scale===0)fail('Die Lage ergibt keine eindeutige Richtung.');return value.divideScalar(scale).normalize();}
const digestCache=new WeakMap();
const checkedMeshes=new WeakSet();
const immutableMesh=mesh=>Object.isFrozen(mesh)&&Object.isFrozen(mesh.verts)&&Object.isFrozen(mesh.triangles);
function checkedMesh(mesh){const immutable=mesh&&immutableMesh(mesh);if(!immutable||!checkedMeshes.has(mesh)){validateProjectMesh(mesh);if(immutable)checkedMeshes.add(mesh);}return mesh;}

/** Geometry identity deliberately excludes the object's affine placement,
 * appearance and solid/hole role. A face anchor is valid for an open mesh too. */
export function meshWorkplaneGeometryDigest(nodeOrMesh){
  const mesh=nodeOrMesh?.mesh??nodeOrMesh;if(!mesh||typeof mesh!=='object')fail('Netzdaten fehlen.');
  if(isGeometryRef(mesh))return validateGeometryRef(mesh,'mesh').sha256;
  const immutable=immutableMesh(mesh);let digest=immutable&&digestCache.get(mesh);
  if(!digest){checkedMesh(mesh);digest=cadGeometryDigest(JSON.stringify({verts:mesh.verts,triangles:mesh.triangles}));if(immutable)digestCache.set(mesh,digest);}return digest;
}
function triangleAt(node,index){
  if(!node||!KINDS.includes(node.kind))fail('Ein Netz oder eine Ansichtsvorlage auswählen.');
  const mesh=checkedMesh(node.mesh);
  if(!Number.isSafeInteger(index)||index<0||index>=mesh.triangles.length/3)fail('Dreiecksbezug ist ungültig.');
  const points=mesh.triangles.slice(index*3,index*3+3).map(i=>v(mesh.verts.slice(i*3,i*3+3))),triangle=new THREE.Triangle(...points),normal=triangle.getNormal(new THREE.Vector3());
  if(!normal.toArray().every(Number.isFinite)||normal.lengthSq()<.5)fail('Das gewählte Dreieck besitzt keine eindeutige Fläche.');
  const length=Math.max(...points.map((p,i)=>p.distanceTo(points[(i+1)%3])));
  return {triangle,normal,tolerance:Math.max(1e-9,length*1e-7)};
}
function nodeMatrix(node){
  const a=node?.transform;if(!Array.isArray(a)||a.length!==16||a.some(x=>typeof x!=='number'||!Number.isFinite(x))||a[3]!==0||a[7]!==0||a[11]!==0||a[15]!==1)fail('Ungültige Objektlage.');
  // Row-scaled elimination also supports invertible very small/large affine
  // scales whose determinant would underflow/overflow a direct inversion.
  const rows=[0,1,2].map(row=>{const linear=[a[row],a[4+row],a[8+row]],scale=Math.max(...linear.map(Math.abs));if(!scale)fail('Die Objektlage ist nicht invertierbar.');return [...linear.map(x=>x/scale),...[0,1,2].map(col=>(row===col?1:0)/scale)];});
  for(let col=0;col<3;col++){let pivot=col;for(let row=col+1;row<3;row++)if(Math.abs(rows[row][col])>Math.abs(rows[pivot][col]))pivot=row;if(rows[pivot][col]===0)fail('Die Objektlage ist nicht invertierbar.');[rows[col],rows[pivot]]=[rows[pivot],rows[col]];const divisor=rows[col][col];rows[col]=rows[col].map(x=>x/divisor);for(let row=0;row<3;row++)if(row!==col){const factor=rows[row][col];rows[row]=rows[row].map((x,k)=>x-factor*rows[col][k]);}}
  const elements=new THREE.Matrix4().toArray();for(let row=0;row<3;row++){for(let col=0;col<3;col++)elements[col*4+row]=rows[row][col+3];elements[12+row]=-[0,1,2].reduce((sum,col)=>sum+rows[row][col+3]*a[12+col],0);}
  if(elements.some(x=>!Number.isFinite(x)))fail('Die Objektlage ist nicht numerisch invertierbar.');return {matrix:new THREE.Matrix4().fromArray(a),inverse:new THREE.Matrix4().fromArray(elements)};
}
export function validateMeshWorkplaneReference(value,{node}={}){
  if(!value||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Object.keys(value).some(k=>!FIELDS.includes(k))||value.kind!=='mesh'||typeof value.objectId!=='string'||!value.objectId.trim()||value.objectId.length>200||typeof value.geometryDigest!=='string'||!/^([a-f0-9]{64})$/.test(value.geometryDigest)||!Number.isSafeInteger(value.triangleIndex)||value.triangleIndex<0||value.triangleIndex>=2000000)fail('Ungültiger gespeicherter Flächenbezug.');
  const out={kind:'mesh',objectId:value.objectId,geometryDigest:value.geometryDigest,triangleIndex:value.triangleIndex,point:vector(value.point,'Punkt'),normal:vector(value.normal,'Normale'),tangent:vector(value.tangent,'Tangente')},n=v(out.normal),t=v(out.tangent);
  if(Math.abs(n.length()-1)>1e-8||Math.abs(t.length()-1)>1e-8||Math.abs(n.dot(t))>1e-8)fail('Normale und Tangente müssen ein orthogonales Einheitsachsenpaar bilden.');
  if(node){
    if(node.id!==out.objectId||!KINDS.includes(node.kind)||meshWorkplaneGeometryDigest(node)!==out.geometryDigest)fail('Die Bezugsgeometrie wurde geändert oder entfernt.');
    // An unloaded catalogue preserves the stored anchor/frame. Its actual
    // triangle is checked once geometry is hydrated; this is no mesh proof.
    if(isGeometryRef(node.mesh)){if(out.triangleIndex>=node.mesh.triangles)fail('Dreiecksbezug fehlt im Geometriekatalog.');return out;}
    const {triangle,normal,tolerance}=triangleAt(node,out.triangleIndex),p=v(out.point),closest=triangle.closestPointToPoint(p,new THREE.Vector3());
    if(closest.distanceTo(p)>tolerance||normal.dot(n)<1-1e-8)fail('Der gespeicherte Punkt oder die Normale passt nicht zum Dreieck.');
  }return out;
}
function planeFromReference(reference,node){
  const r=validateMeshWorkplaneReference(reference,{node}),{matrix,inverse}=nodeMatrix(node),normal=unit(v(r.normal).applyMatrix3(new THREE.Matrix3().setFromMatrix4(inverse).transpose())),tangent=unit(v(r.tangent).applyMatrix3(new THREE.Matrix3().setFromMatrix4(matrix)));
  tangent.addScaledVector(normal,-tangent.dot(normal)).normalize();const bitangent=normal.clone().cross(tangent).normalize(),point=v(r.point).applyMatrix4(matrix);
  if([...point.toArray(),...normal.toArray(),...tangent.toArray()].some(n=>!Number.isFinite(n))||normal.lengthSq()<.5||tangent.lengthSq()<.5||point.toArray().some(n=>Math.abs(n)>100000))fail('Die Bezugsebene liegt außerhalb des gültigen Arbeitsbereichs.');
  const orientation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(tangent,bitangent,normal)).normalize().toArray();return {origin:point.toArray(),orientation,reference:r};
}
export function makeMeshWorkplane(node,triangleIndex,worldPoint){
  const {triangle,normal,tolerance}=triangleAt(node,triangleIndex),{inverse}=nodeMatrix(node),point=worldPoint===undefined?triangle.getMidpoint(new THREE.Vector3()):v(vector(worldPoint,'Flächenpunkt')).applyMatrix4(inverse),closest=triangle.closestPointToPoint(point,new THREE.Vector3());
  if(point.distanceTo(closest)>tolerance)fail('Der gewählte Punkt liegt nicht auf dem getroffenen Dreieck.');
  let tangent=new THREE.Vector3(1,0,0).addScaledVector(normal,-normal.x);if(tangent.lengthSq()<1e-8)tangent.set(0,1,0).addScaledVector(normal,-normal.y);tangent.normalize();
  return planeFromReference({kind:'mesh',objectId:node.id,geometryDigest:meshWorkplaneGeometryDigest(node),triangleIndex,point:closest.toArray(),normal:normal.toArray(),tangent:tangent.toArray()},node);
}
export function resolveMeshWorkplane(plane,node){
  if(plane?.reference?.kind!=='mesh')fail('Kein angehefteter Netzflächenbezug.');return planeFromReference(plane.reference,node);
}

/** Update an existing immutable project without touching any object or CAD
 * reference. A lost face becomes a fixed plane at the last confirmed pose. */
export function synchronizeMeshWorkplane(project,baseline){
  const reference=project?.workplane?.reference;if(reference?.kind!=='mesh')return {project,warnings:[],detached:false};
  // Only a well-formed anchor may become stale. Invalid external structure
  // must be rejected instead of disappearing into an apparently valid plane.
  validateMeshWorkplaneReference(reference);
  let workplane,warnings=[],detached=false;
  try{workplane=resolveMeshWorkplane(project.workplane,project.nodes.find(n=>n.id===reference.objectId));}
  catch(error){
    detached=true;let previous=project.workplane;
    if(baseline?.workplane?.reference?.kind==='mesh'&&baseline.workplane.reference.objectId===reference.objectId){try{previous=resolveMeshWorkplane(baseline.workplane,baseline.nodes.find(n=>n.id===reference.objectId));}catch{previous=baseline.workplane;}}
    workplane={origin:[...previous.origin],orientation:[...previous.orientation],reference:null};warnings=['Netzbezugsfläche geändert oder entfernt: Die Arbeitsebene bleibt an ihrer letzten gültigen Lage. Eine Fläche erneut auswählen.'];
  }
  if(JSON.stringify(project.workplane)===JSON.stringify(workplane))return {project,warnings,detached};return {project:{...project,workplane},warnings,detached};
}
