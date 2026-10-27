// Format-1 local shape packs keep their original data contract. Their geometry
// is constructed by the CAD service from native recipes and source matrices.
// The legacy parser is used only for manifest validation, never modeling.
import {parsePlugin,label} from './cad-plugin-manifest.js';
import {CAD_SHAPES} from './cad-shapes.js';
import {defaults,GENERATORS} from './parameters.js';
import {Matrix4,Euler} from 'three';
import {cadIdentity,multiplyCadMatrices} from './cad-affine.js';
import {createCadProject} from './cad-project.js';
const DEG=Math.PI/180;
function abort(signal){if(signal?.aborted){const error=Error('CAD-Formenpaketaufbau abgebrochen.');error.name='AbortError';throw error;}}
export function cadPluginRecipes(value,shapeId,{language='de'}={}){
  const manifest=parsePlugin(value),shape=manifest.shapes.find(shape=>shape.id===shapeId);
  if(!shape)throw Error('Die Formvorlage fehlt im lokalen Formenpaket.');
  if(!['de','en'].includes(language))throw Error('Nicht unterstützte Formenpaketsprache.');
  const sources=shape.nodes.map((spec,index)=>{
    const definition=CAD_SHAPES.find(shape=>shape.type===spec.type),params={...defaults(spec.type),...spec.params};
    delete params.edgeSteps;
    // Generator dimensions follow their physical parameters until a template
    // explicitly supplies dimensions. A later size override is an affine
    // source placement, not a change of pitch, module or original profile.
    const size=spec.size?[...spec.size]:spec.type==='countersink'?[params.sinkDiameter,params.sinkDiameter,params.length]:[...definition.defaultSize],recipe={type:spec.type,size};
    if(Object.keys(params).length)recipe.params=params;
    return {recipe,index,name:definition.name,color:spec.color||definition.color,solid:spec.solid??spec.type!=='countersink',position:spec.pos?[...spec.pos]:null,rotation:spec.rot?[...spec.rot]:[0,0,0],mirror:spec.mirror?[...spec.mirror]:[1,1,1],requestedSize:spec.size?[...spec.size]:null,generator:GENERATORS.has(spec.type)};
  });
  return {manifest,shape:structuredClone(shape),name:label(shape.name,language),description:label(shape.description,language),plugin:{id:manifest.id,shapeId:shape.id},sources};
}
function sourcePlacement(source,node){
  const {min,max}=node.stats.bounds,dimensions=min.map((v,i)=>max[i]-v),center=min.map((v,i)=>(v+max[i])/2),target=source.generator?(source.requestedSize||dimensions):source.recipe.size;
  const factors=source.generator&&source.recipe.type!=='countersink'?target.map((v,i)=>v/dimensions[i]):[1,1,1],position=source.position||[0,0,target[2]/2],rotation=new Euler(...source.rotation.map(v=>v*DEG),'ZYX');
  return new Matrix4().makeTranslation(...position).multiply(new Matrix4().makeRotationFromEuler(rotation)).multiply(new Matrix4().makeScale(...factors.map((v,i)=>v*source.mirror[i]))).multiply(new Matrix4().makeTranslation(...center.map(v=>-v))).toArray();
}
export async function buildCadPluginShape(service,value,shapeId,{language='de',id=globalThis.crypto.randomUUID(),transform=cadIdentity(),metadata={},project=createCadProject(),signal}={}){
  if(typeof service?.nativeNode!=='function'||typeof service?.rebuild!=='function')throw Error('Der CAD-Dienst für das Formenpaket fehlt.');
  const template=cadPluginRecipes(value,shapeId,{language}),pluginMetadata={...structuredClone(metadata),plugin:template.plugin};
  if(template.description&&!Object.hasOwn(pluginMetadata,'notes'))pluginMetadata.notes=template.description;
  const children=[];
  for(const source of template.sources){
    abort(signal);const childId=template.sources.length===1?id:globalThis.crypto.randomUUID(),properties={id:childId,name:source.name,color:source.color,solid:source.solid,metadata:{plugin:template.plugin}},base=service.nativeNode(source.recipe,properties),placement=sourcePlacement(source,base),matrix=template.sources.length===1?multiplyCadMatrices(transform,placement):placement;
    children.push(service.nativeNode(source.recipe,{...properties,transform:matrix}));await Promise.resolve();
  }
  abort(signal);let node;
  if(children.length===1)node={...children[0],name:template.name,metadata:pluginMetadata};
  else{
    const placeholder=children.find(child=>child.solid);if(!placeholder)throw Error('Eine CAD-Formvorlage benötigt mindestens eine Körperquelle.');
    node={id,kind:'cad',source:'group',name:template.name,solid:true,color:placeholder.color,multicolor:true,operation:'union',transform:[...transform],children,brep:structuredClone(placeholder.brep),stats:structuredClone(placeholder.stats),metadata:pluginMetadata};
  }
  const rebuilt=await service.rebuild({...structuredClone(project),nodes:[node]},{signal});return rebuilt.nodes[0];
}
