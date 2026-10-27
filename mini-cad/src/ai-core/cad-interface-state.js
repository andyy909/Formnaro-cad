// Inspector measurements and edits use full matrices. Bounds come from freshly
// validated native bodies; no renderer triangles participate in these helpers.
import {Matrix4,Euler,Vector3,Quaternion} from 'three';
import {cadIdentity,cadPoint,multiplyCadMatrices,inverseCadMatrix,resizeCadAtCorner} from './cad-affine.js';
import {cadSourceAtPath} from './cad-form-controls.js';
import {flags} from './organization.js';
const DEG=Math.PI/180;
// Only immutable confirmed vertices own this cache. Drafts and imported mutable
// arrays are scanned again so an in-place geometry edit cannot reuse old bounds.
const meshBounds=new WeakMap();
function target(value){if(!value||typeof value.rootId!=='string'||!Array.isArray(value.path)||value.path.some(id=>typeof id!=='string')||value.path.length>12)throw Error('Ungültiges CAD-Auswahlziel.');return value;}
export function cadInterfaceLocalBounds(node){
  if(node.kind==='cad'&&node.stats?.bounds)return node.stats.bounds;
  if(!['referenceMesh','mesh'].includes(node.kind)||!Array.isArray(node.mesh?.verts)||!node.mesh.verts.length)throw Error('CAD-Grenzen oder originales Netz fehlen.');
  const verts=node.mesh.verts,cached=meshBounds.get(verts);if(cached)return {min:[...cached.min],max:[...cached.max]};
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<verts.length;i++){const value=verts[i];if(!Number.isFinite(value))throw Error('Ungültige Netzreferenz.');min[i%3]=Math.min(min[i%3],value);max[i%3]=Math.max(max[i%3],value);}if(Object.isFrozen(verts))meshBounds.set(verts,{min,max});return {min:[...min],max:[...max]};
}
const center=node=>{const {min,max}=cadInterfaceLocalBounds(node);return min.map((v,i)=>(v+max[i])/2);};
export function cadSelectionContext(project,value){
  target(value);const root=cadSourceAtPath(project,value.rootId),chain=[root];let parentWorld=cadIdentity(),node=root,locked=flags(root,project).locked,hidden=flags(root,project).hidden;
  for(const id of value.path){parentWorld=multiplyCadMatrices(parentWorld,node.transform);node=node.children?.find(child=>child.id===id);if(!node)throw Error('Die ausgewählte CAD-Quelle fehlt.');chain.push(node);locked||=!!node.locked;hidden||=!!node.hidden;}
  return {target:structuredClone(value),root,node,chain,sourceGeometryReadonly:chain.slice(0,-1).some(n=>n.source==='extraction'),parentWorld,world:multiplyCadMatrices(parentWorld,node.transform),locked,hidden};
}
function basis(matrix){
  const x=new Vector3(matrix[0],matrix[1],matrix[2]).normalize(),y=new Vector3(matrix[4],matrix[5],matrix[6]);y.addScaledVector(x,-x.dot(y)).normalize();const z=new Vector3().crossVectors(x,y).normalize();
  if(x.lengthSq()<.99||y.lengthSq()<.99||z.lengthSq()<.99)throw Error('Die affine CAD-Orientierung ist nicht eindeutig.');
  return new Matrix4().makeBasis(x,y,z);
}
export function cadFormLocalDimensions(node){
  const {min,max}=cadInterfaceLocalBounds(node);
  return min.map((v,i)=>(max[i]-v)*Math.hypot(node.transform[4*i],node.transform[4*i+1],node.transform[4*i+2]));
}
export function cadFormOrientation(node){return new Euler().setFromRotationMatrix(basis(node.transform),'ZYX').toArray().slice(0,3).map(v=>v/DEG);}
/** A rigid left rotation changes orientation while retaining the entire
 * Gram matrix, determinant, mirror, shear and local source-center placement. */
export function cadSetFormOrientation(node,degrees){
  if(!Array.isArray(degrees)||degrees.length!==3||degrees.some(v=>!Number.isFinite(v)))throw Error('Ungültige CAD-Drehwinkel.');
  const orientation=new Matrix4().makeRotationFromEuler(new Euler(...degrees.map(v=>v*DEG),'ZYX')),delta=orientation.multiply(basis(node.transform).transpose()),point=cadPoint(node.transform,center(node)),rigid=new Matrix4().makeTranslation(...point).multiply(delta).multiply(new Matrix4().makeTranslation(...point.map(v=>-v))).toArray();
  return {...structuredClone(node),transform:multiplyCadMatrices(rigid,node.transform)};
}
function workplane(project){return new Matrix4().makeRotationFromQuaternion(new Quaternion(...project.workplane.orientation)).setPosition(...project.workplane.origin).toArray();}
export function cadFormPosition(project,value){const context=cadSelectionContext(project,value),point=cadPoint(value.path.length?context.node.transform:context.world,center(context.node));return !value.path.length&&project.coordinateMode==='plane'?cadPoint(inverseCadMatrix(workplane(project)),point):point;}
export function cadSetFormPosition(project,value,position){
  if(!Array.isArray(position)||position.length!==3||position.some(v=>!Number.isFinite(v)||Math.abs(v)>100000))throw Error('Ungültige CAD-Mittelpunktposition.');const context=cadSelectionContext(project,value);if(context.locked)throw Error('Objekt, Quelle oder Container ist gesperrt.');
  const node=context.node,current=cadPoint(node.transform,center(node)),desired=value.path.length?position:cadPoint(inverseCadMatrix(context.parentWorld),project.coordinateMode==='plane'?cadPoint(workplane(project),position):position),copy=structuredClone(node);
  for(let i=0;i<3;i++)copy.transform[12+i]+=desired[i]-current[i];return copy;
}
export function cadResizeForm(node,target,{proportions=false,axis=0}={}){
  const current=cadFormLocalDimensions(node),size=[...target];if(proportions){const factor=size[axis]/current[axis];for(let i=0;i<3;i++)size[i]=current[i]*factor;}
  if(node.kind==='cad')return resizeCadAtCorner(node,size);
  if(!['referenceMesh','mesh'].includes(node.kind)||size.length!==3||size.some((v,i)=>!Number.isFinite(v)||(current[i]===0?v!==0:v<.01||v>10000)))throw Error('Ungültige Netzgröße.');
  const factors=size.map((v,i)=>current[i]===0?1:v/current[i]),anchor=cadInterfaceLocalBounds(node).min,scaling=new Matrix4().makeTranslation(...anchor).multiply(new Matrix4().makeScale(...factors)).multiply(new Matrix4().makeTranslation(...anchor.map(v=>-v))).toArray();return {...structuredClone(node),transform:multiplyCadMatrices(node.transform,scaling)};
}
export function cadAssignSource(project,value,replacement){const context=cadSelectionContext(project,value);if(context.locked)throw Error('Objekt, Quelle oder Container ist gesperrt.');Object.assign(context.node,replacement);return project;}
