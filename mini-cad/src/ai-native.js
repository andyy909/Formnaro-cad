import {Matrix4,Vector3,Quaternion,Euler} from 'three';
import {createNode,SHAPES} from './model.js';
import {createCadService} from './ai-core/cad-service.js';
import {createCadCommandRouter} from './ai-core/cad-command-router.js';
import {createCadFinishNative} from './ai-core/cad-finish-native.js';
import {createCadPrecisionNative} from './ai-core/cad-precision-native.js';
import {createCadToolsNative} from './ai-core/cad-tools-native.js';
import {createCadTransactions} from './ai-core/cad-transactions.js';
import {nativeRecipeForInput,nativeRecipeEdit} from './ai-core/cad-form-runtime.js';
import {createCadProject,cadProjectSnapshot} from './ai-core/cad-project.js';
import {checkCadAIResultNative} from './ai-core/cad-ai-result-checks-native.js';
import {cadIdentity,multiplyCadMatrices} from './ai-core/cad-affine.js';
import {readCadBrep,transformCad,writeCadBrep,validateCadSolid} from './native/cad-native-kernel.js';
import {matrixArray} from './engine/geometry.js';
import {validateProject} from './model.js';
const I=cadIdentity(),translation=p=>{const m=[...I];m.splice(12,3,...p);return m;};
export function createMiniAINative({oc,localShape,worldShape,stored}){
 let service,router,precision;
 function init(){if(service)return;service=createCadService({oc,maxBytes:16*1024*1024,maxEntries:32,finish:createCadFinishNative({oc})});router=createCadCommandRouter({oc,service,makeRecipe:(type,input)=>nativeRecipeForInput(oc,type,input),editRecipe:(node,patch)=>nativeRecipeEdit(oc,node,patch)});precision=createCadPrecisionNative({oc,service});}
 function nativeNode(n){
  let node;
  if(n.cadSource){node=JSON.parse(n.cadSource);node.transform=multiplyCadMatrices(matrixArray({...n,size:n.size.map((v,i)=>v/n.baseSize[i])}),node.transform);node.id=n.id;}
  else if(n.type==='group')node={id:n.id,kind:'cad',source:'group',brep:{format:'OpenCascade-BRep',data:n.brep,triangulation:false},operation:n.operation,children:n.children.map(nativeNode),transform:matrixArray({...n,size:n.size.map((v,i)=>v/n.baseSize[i])})};
  else if(n.brep)node={id:n.id,kind:'cad',source:'step',brep:{format:'OpenCascade-BRep',data:n.brep,triangulation:false},transform:matrixArray({...n,size:n.size.map((v,i)=>v/n.baseSize[i])})};
  else node=service.nativeNode({type:n.type,size:n.size,...(n.params?{params:Object.fromEntries(Object.entries(n.params).filter(([k])=>k!=='edgeSteps'))}:{})},{id:n.id,transform:matrixArray({...n,size:[1,1,1]})});
  if(n.brep&&!n.cadSource){const shape=readCadBrep(oc,n.brep);try{const proof=validateCadSolid(oc,shape);node.stats={bounds:{min:proof.bounds.min,max:proof.bounds.max},volume:proof.volume,solids:proof.solids};}finally{shape.delete();}}
  Object.assign(node,{name:n.name,color:n.color,solid:n.solid,hidden:n.hidden,locked:n.locked,layerId:node.layerId??'default',folderId:node.folderId??null});if(n.notes!==undefined)node.metadata={...node.metadata,notes:n.notes};return node;
 }
 async function begin(project,selection=[]){init();validateProject(project);const native=createCadProject({...project.cadWorkspace,name:project.name,nodes:project.nodes.filter(n=>!n.mesh).map(nativeNode)});const built=await service.rebuild(native);return {project:built,scene:router.scene(built,selection)};}
 function allowed(project){const checked=cadProjectSnapshot(project);let count=0;const scan=n=>{if(++count>1000||n.kind!=='cad')throw Error('Mini CAD verarbeitet ausschließlich native CAD-Körper (maximal 1000 Quellen).');n.children?.forEach(scan);};checked.nodes.forEach(scan);if(checked.nodes.length>200)throw Error('Mini CAD: maximal 200 Teile.');return checked;}
 async function query(project,kind,options={}){
  init();project=allowed(project);
  if(kind==='scene')return router.scene(project,options.selection);
  if(kind==='bounds'&&options.targets)return router.bounds(project,options);
  if(kind==='aiResultChecks')return checkCadAIResultNative({oc,project,scene:router.scene(project),...options});
  if(['edges','edgesInRectangle','section','svgProjection','wallThickness','collision'].includes(kind)){
   const node=id=>{const n=project.nodes.find(n=>n.id===id);if(!n)throw Error('CAD-Ziel fehlt.');return n;};
   if(kind==='collision')return precision.collision({...options,left:node(options.leftId),right:node(options.rightId)});
   if(kind==='svgProjection')return precision.svgProjection({...options,nodes:service.productionNodes(project,{ids:options.ids})});
   return precision[kind]({...options,node:node(options.nodeId)});
  }
  if(!['bounds','minimumDistance','rayPick','referencePoints'].includes(kind))throw Error('Unbekannte CAD-Messung.');
  const store=createCadTransactions({initial:project,build:p=>service.rebuild(p)}),tools=createCadToolsNative({oc,service,transactions:store});return tools[kind](options);
 }
 async function convert(project,baseline,nativeBaseline){
  const {nodes:discarded,...workspace}=project;const result={...baseline,name:project.name,nodes:[],cadWorkspace:workspace};
  for(const root of allowed(project).nodes){
   const old=baseline.nodes.find(n=>n.id===root.id),previous=nativeBaseline.nodes.find(n=>n.id===root.id);
   if(old&&JSON.stringify(previous)===JSON.stringify(root)){result.nodes.push(structuredClone(old));continue;}
   const appearance=new Set(['name','color','solid','hidden','locked','metadata']);
   const geometryState=n=>{const metadata=Object.fromEntries(Object.entries(n.metadata??{}).filter(([k])=>k!=='notes'));return JSON.stringify({...Object.fromEntries(Object.entries(n).filter(([k])=>!appearance.has(k))),metadata:Object.keys(metadata).length?metadata:null});};
   if(old&&previous&&geometryState(previous)===geometryState(root)){
    const node=structuredClone(old);Object.assign(node,{name:root.name,color:root.color||old.color,solid:root.solid,hidden:!!root.hidden,locked:!!root.locked});if(root.metadata?.notes!==undefined)node.notes=root.metadata.notes;
    if(node.cadSource){const source=JSON.parse(node.cadSource);for(const k of appearance)if(root[k]!==undefined)source[k]=structuredClone(root[k]);node.cadSource=JSON.stringify(source);}
    result.nodes.push(node);continue;
   }
   // Native primitives already supported by Mini keep their compact editable
   // representation when the native frame is a rigid pose/reflection. More
   // advanced sources keep their full native tree in the fallback below.
   if(root.source==='native'&&SHAPES.some(([type])=>type===root.recipe?.type)&&!root.annotations?.length&&Object.keys(root.metadata??{}).every(k=>k==='notes')&&(!root.layerId||root.layerId==='default')&&!root.folderId){
    const matrix=new Matrix4().fromArray(root.transform),position=new Vector3(),rotation=new Quaternion(),scale=new Vector3();matrix.decompose(position,rotation,scale);
    const restored=new Matrix4().compose(position,rotation,scale);
    if(scale.toArray().every(v=>Math.abs(Math.abs(v)-1)<1e-10)&&restored.elements.every((v,i)=>Math.abs(v-root.transform[i])<1e-10)){
     const node=createNode(root.recipe.type),euler=new Euler().setFromQuaternion(rotation,'ZYX');
     Object.assign(node,{id:root.id,name:root.name,color:root.color||node.color,solid:root.solid,locked:!!root.locked,hidden:!!root.hidden,size:[...root.recipe.size],pos:position.toArray(),rot:[euler.x,euler.y,euler.z].map(v=>v*180/Math.PI),mirror:scale.toArray().map(v=>v<0?-1:1),...(root.metadata?.notes!==undefined?{notes:root.metadata.notes}:{})});
     if(root.recipe.params)node.params={...node.params,...root.recipe.params};
     if(old?.folder)node.folder=old.folder;
     result.nodes.push(node);continue;
    }
   }

   const shape=service.worldShape(root);let node;
   try{node=stored(shape,{id:root.id,name:root.name,color:root.color||'#79a9ad',solid:root.solid,locked:!!root.locked,hidden:!!root.hidden,...(old?.folder?{folder:old.folder}:{}),...(root.metadata?.notes?{notes:root.metadata.notes.slice(0,4000)}:{})});}finally{shape.delete();}
   const source=structuredClone(root);source.transform=multiplyCadMatrices(translation(node.pos.map(v=>-v)),source.transform);node.cadSource=JSON.stringify(source);result.nodes.push(node);
  }
  const converted=new Map(result.nodes.map(n=>[n.id,n])),ordered=[];for(const old of baseline.nodes){if(old.mesh)ordered.push(structuredClone(old));else if(converted.has(old.id)){ordered.push(converted.get(old.id));converted.delete(old.id);}}result.nodes=[...ordered,...converted.values()];
  validateProject(result);return result;
 }
 return {run:async(job,p)=>{
  if(job==='begin')return begin(p.project,p.selection);
  if(job==='query')return query(p.project,p.kind,p.options);
  if(job==='run'){init();const project=allowed(p.project),baseline=allowed(p.baseline??p.project);if(['cadToMesh','meshToCad','importStep','importStlHousing'].includes(p.operation?.kind))throw Error('Dateien über den Mini-Import öffnen; automatische Konvertierung ist nicht verfügbar.');const result=p.operation?await router.run(project,p.operation,{baseline}):{project:await service.rebuild(project,{baseline})};allowed(result.project);return result;}
  if(job==='convert')return convert(p.project,p.baseline,p.nativeBaseline);
  if(job==='release'){service?.dispose();service=router=precision=null;return true;}
  throw Error('Unbekannter KI-CAD-Auftrag.');
 }};
}
