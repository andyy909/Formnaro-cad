import {Matrix4,Vector3} from 'three';
import {validateAffineMatrix} from './cad-project.js';

export const cadIdentity=()=>new Matrix4().toArray();
export function multiplyCadMatrices(left,right){
  validateAffineMatrix(left);validateAffineMatrix(right);
  const result=new Matrix4().fromArray(left).multiply(new Matrix4().fromArray(right)).toArray();validateAffineMatrix(result);return result;
}
export function inverseCadMatrix(value){
  validateAffineMatrix(value);
  const rows=[0,1,2].map(row=>{const linear=[value[row],value[4+row],value[8+row]],scale=Math.max(...linear.map(Math.abs));return [...linear.map(v=>v/scale),...[0,1,2].map(col=>(row===col?1:0)/scale)];});
  for(let col=0;col<3;col++){
    let pivot=col;for(let row=col+1;row<3;row++)if(Math.abs(rows[row][col])>Math.abs(rows[pivot][col]))pivot=row;
    [rows[col],rows[pivot]]=[rows[pivot],rows[col]];const divisor=rows[col][col];rows[col]=rows[col].map(v=>v/divisor);
    for(let row=0;row<3;row++)if(row!==col){const factor=rows[row][col];rows[row]=rows[row].map((v,k)=>v-factor*rows[col][k]);}
  }
  const result=cadIdentity();for(let row=0;row<3;row++){for(let col=0;col<3;col++)result[col*4+row]=rows[row][col+3];result[12+row]=-[0,1,2].reduce((sum,col)=>sum+rows[row][col+3]*value[12+col],0);}
  validateAffineMatrix(result);return result;
}
export function cadPoint(matrix,point){
  validateAffineMatrix(matrix);if(!Array.isArray(point)||point.length!==3||point.some(v=>!Number.isFinite(v)))throw Error('Ungültiger CAD-Punkt.');
  const result=new Vector3(...point).applyMatrix4(new Matrix4().fromArray(matrix)).toArray();if(result.some(v=>!Number.isFinite(v)))throw Error('CAD-Punkt außerhalb des Zahlenbereichs.');return result;
}
export function cadFrameSources(nodes,frame){
  const inverse=inverseCadMatrix(frame);
  return nodes.map(node=>{if(node.kind!=='cad')throw Error('Netzreferenzen sind keine CAD-Gruppenquellen.');const copy=structuredClone(node);copy.transform=multiplyCadMatrices(inverse,node.transform);return copy;});
}

// Return the original CAD sources with their complete affine placement.
// This performs no decomposition, re-generation, triangulation or mesh baking.
export function dissolveCadGroup(group){
  if(group.extraction)throw Error('Ein herausgelöster Körper kann nicht gewöhnlich aufgelöst werden; dabei würde das vollständige Original wieder erscheinen.');
  if(group.partition)throw Error('Ein geteiltes Teil kann nicht gewöhnlich aufgelöst werden; dabei würde das vollständige Original wieder erscheinen.');
  if(group.kind!=='cad'||group.source!=='group'||!Array.isArray(group.children))throw Error('Eine boolesche CAD-Gruppe auswählen.');
  if(group.finish?.steps?.length)throw Error('Die Kantenoperation benötigt ihre CAD-Gruppe.');
  return group.children.map(source=>{
    if(source.kind!=='cad')throw Error('Netzreferenzen sind keine CAD-Gruppenquellen.');
    const copy=structuredClone(source);copy.transform=multiplyCadMatrices(group.transform,source.transform);
    if(copy.suppressed){copy.hidden=true;delete copy.suppressed;}
    for(const key of ['layerId','folderId'])if(group[key]!==undefined)copy[key]=group[key];
    return copy;
  });
}

// Size fields describe distances along the object's own axes. Postmultiply
// instead of decomposing a sheared world matrix. The opposite local corner and
// local bottom remain fixed in space, including mirrors and nested shear.
export function resizeCadAtCorner(node,target,{corner=[1,1,1],keepBottom=true}={}){
  if(!['cad','mesh','referenceMesh'].includes(node.kind))throw Error('Ein CAD- oder Netzteil für Eckmaße auswählen.');
  validateAffineMatrix(node.transform);
  if(!Array.isArray(target)||target.length!==3||target.some(v=>!Number.isFinite(v)||v<.01||v>10000))throw Object.assign(Error('CAD-Maße müssen zwischen 0,01 und 10000 mm liegen.'),{feedback:{field:'set.size',value:target,range:{min:.01,max:10000}}});
  if(!Array.isArray(corner)||corner.length!==3||corner.some(v=>v!==1&&v!==-1))throw Error('Ungültige CAD-Ecke.');
  const bounds=node.kind==='cad'?node.stats.bounds:{min:[0,1,2].map(k=>{let v=Infinity;for(let i=k;i<node.mesh.verts.length;i+=3)v=Math.min(v,node.mesh.verts[i]);return v;}),max:[0,1,2].map(k=>{let v=-Infinity;for(let i=k;i<node.mesh.verts.length;i+=3)v=Math.max(v,node.mesh.verts[i]);return v;})};const {min,max}=bounds,dimensions=min.map((v,i)=>max[i]-v),matrix=node.transform;
  if(dimensions.some(v=>!Number.isFinite(v)||v<=0))throw Error('Ungültige CAD-Grenzen.');
  const current=dimensions.map((v,i)=>v*Math.hypot(matrix[4*i],matrix[4*i+1],matrix[4*i+2]));
  const factors=target.map((v,i)=>v/current[i]);
  const anchor=min.map((v,i)=>i===2&&keepBottom?v:corner[i]===1?v:max[i]);
  const scaling=new Matrix4().makeTranslation(...anchor).multiply(new Matrix4().makeScale(...factors)).multiply(new Matrix4().makeTranslation(...anchor.map(v=>-v))).toArray();
  const copy=structuredClone(node);copy.transform=multiplyCadMatrices(node.transform,scaling);return copy;
}
