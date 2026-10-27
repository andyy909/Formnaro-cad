// Native form controls share the established labels and parameter contract.
// These DTO helpers never create display meshes or decompose affine matrices.
import {defaults,SCHEMAS,GENERATORS,validParameters,parameterNote} from './parameters.js';
import {cadContoursFromFont} from './cad-original-contours.js';
import {multiplyCadMatrices,cadPoint} from './cad-affine.js';
import {validateAffineMatrix} from './cad-project.js';
import {CAD_SHAPES} from './cad-shapes.js';
export {CAD_SHAPES} from './cad-shapes.js';
const allowedEdits=new Set(['params','text','font','sides','size']);
function shapeDefinition(type){const definition=CAD_SHAPES.find(shape=>shape.type===type);if(!definition)throw Error('Unbekannte native CAD-Grundform.');return definition;}
function dimensions(size){if(!Array.isArray(size)||size.length!==3||size.some(v=>!Number.isFinite(v)||v<=0||v>10000))throw Error('Ungültige physische CAD-Rezeptgröße.');return [...size];}
function formParameters(type,values){
  if(values!==undefined&&(!values||typeof values!=='object'||Array.isArray(values)))throw Error('Native Formparameter müssen ein Objekt sein.');
  if(Object.hasOwn(values||{},'edgeSteps'))throw Error('Rundungsschritte sind kein konstruktiver CAD-Parameter.');
  const params={...defaults(type),...structuredClone(values||{})};delete params.edgeSteps;
  if(!SCHEMAS[type]){if(Object.keys(params).length)throw Error('Die CAD-Grundform besitzt diese Formparameter nicht.');return undefined;}
  if(!validParameters({type,params}))throw Error('Der native Formparameter liegt außerhalb des zulässigen Bereichs.');
  return params;
}
function originalText(oc,fonts,font,text){
  if(typeof font!=='string'||!font.trim()||font.length>10000)throw Error('Ungültige originale Schriftkennung.');
  if(typeof text!=='string'||!text.trim()||text.length>10000)throw Error('Text benötigt mindestens ein gefülltes Schriftzeichen.');
  const original=fonts instanceof Map?fonts.get(font):fonts?.[font];
  if(!original)throw Error('Die originale Schriftquelle fehlt.');
  if(!oc)throw Error('Originale Schriftkonturen müssen vor dem Rezept im nativen CAD-Worker klassifiziert werden.');
  return cadContoursFromFont(oc,original,text,10);
}

/** A schema-ready recipe. Text is classified with the worker's native kernel. */
export function cadRecipeForShape(type,{size,params,text='TEXT',font='regular',fonts,oc}={}){
  const definition=shapeDefinition(type),recipe={type,size:dimensions(size||definition.defaultSize)},values=formParameters(type,params);
  if(values)recipe.params=values;
  if(type==='text')Object.assign(recipe,{text,font},originalText(oc,fonts,font,text));
  return recipe;
}
function nativeForm(node){if(node?.kind!=='cad'||node.source!=='native'||!node.recipe)throw Error('Eine editierbare native CAD-Grundform auswählen.');return node.recipe;}

/** Existing SCHEMAS fields, with presentation-only tessellation removed. */
export function cadFormParameters(node){
  const recipe=nativeForm(node),type=recipe.type,params=formParameters(type,recipe.params)||{},schema=structuredClone((SCHEMAS[type]||[]).filter(field=>field.key!=='edgeSteps'));
  return {type,params,schema,note:parameterNote({type,params}),generator:GENERATORS.has(type),...(type==='text'?{text:recipe.text,font:recipe.font}:{})};
}

/** Pure recipe edit; original node, BRep, placement and metadata remain owned
 * by the confirmed state until the worker builds and validates a replacement. */
export function cadEditFormRecipe(node,patch,{fonts,oc}={}){
  const original=nativeForm(node);if(node.locked)throw Error('Die CAD-Grundform ist gesperrt.');
  if(!patch||typeof patch!=='object'||Array.isArray(patch)||Object.keys(patch).some(key=>!allowedEdits.has(key)))throw Error('Unbekanntes Feld der nativen Quellenänderung.');
  const type=original.type;
  if(('text'in patch||'font'in patch)&&type!=='text')throw Error('Text und Schrift gehören zur nativen Textquelle.');
  if('sides'in patch&&type!=='polygon')throw Error('Die Seitenzahl gehört zur nativen Polygonquelle.');
  if(type==='svg'){
    if(Object.keys(patch).some(key=>key!=='size'))throw Error('SVG-Konturen werden über ihre originale SVG-Quelle geändert.');
    return {...structuredClone(original),size:dimensions(patch.size||original.size)};
  }
  if(patch.params!==undefined&&(!patch.params||typeof patch.params!=='object'||Array.isArray(patch.params)))throw Error('Native Formparameter müssen ein Objekt sein.');
  const params=formParameters(type,{...(original.params||{}),...(patch.params||{}),...('sides'in patch?{sides:patch.sides}:{})}),size=dimensions(patch.size||original.size);
  // The original torus control changes the source profile height together with
  // its diameter; occupied dimensions are preserved by the placement helper.
  if(type==='torus'&&patch.params?.wall!==undefined&&patch.size===undefined)size[2]=patch.params.wall;
  if(type==='text'&&patch.text===undefined&&patch.font===undefined){return {...structuredClone(original),size};}
  return cadRecipeForShape(type,{size,params,text:patch.text??original.text,font:patch.font??original.font,fonts,oc});
}
function bounds(node){
  const value=node?.stats?.bounds;if(!value||!Array.isArray(value.min)||!Array.isArray(value.max)||value.min.length!==3||value.max.length!==3||value.min.some((v,i)=>!Number.isFinite(v)||!Number.isFinite(value.max[i])||value.max[i]<=v))throw Error('Frisch validierte native CAD-Grenzen fehlen.');
  return {min:[...value.min],max:[...value.max],size:value.min.map((v,i)=>value.max[i]-v)};
}
const translation=point=>[1,0,0,0,0,1,0,0,0,0,1,0,...point,1];
const scaling=factors=>[factors[0],0,0,0,0,factors[1],0,0,0,0,factors[2],0,0,0,0,1];

/** Map the freshly built source bounds onto its former local bounds. Full
 * shear, mirror, placement and the opposite local corners survive the edit. */
export function cadPreserveFormBounds(node,replacement){
  nativeForm(node);nativeForm(replacement);validateAffineMatrix(node.transform);
  if(node.id!==replacement.id||node.recipe.type!==replacement.recipe.type)throw Error('Die native Ersatzquelle gehört nicht zur bearbeiteten Grundform.');
  const before=bounds(node),after=bounds(replacement),factors=before.size.map((v,i)=>v/after.size[i]);
  const correction=multiplyCadMatrices(translation(before.min),multiplyCadMatrices(scaling(factors),translation(after.min.map(v=>-v))));
  return {...structuredClone(node),recipe:structuredClone(replacement.recipe),brep:structuredClone(replacement.brep),stats:structuredClone(replacement.stats),transform:multiplyCadMatrices(node.transform,correction),...(['thread','nut'].includes(node.recipe.type)?{solid:replacement.recipe.params.kind!=='cutter'}:{})};
}

/** Explicit physical dimensions keep the source's bottom centre in its parent
 * frame. Mirror/shear/orientation and all unedited node metadata survive. */
export function cadFitFormDimensions(node,replacement,size){
  dimensions(size);nativeForm(node);nativeForm(replacement);validateAffineMatrix(node.transform);
  if(node.id!==replacement.id||node.recipe.type!==replacement.recipe.type)throw Error('Die native Ersatzquelle gehört nicht zur bearbeiteten Grundform.');
  const before=bounds(node),after=bounds(replacement),anchor=b=>[(b.min[0]+b.max[0])/2,(b.min[1]+b.max[1])/2,b.min[2]],fixed=cadPoint(node.transform,anchor(before));
  const transform=[...node.transform];for(let axis=0;axis<3;axis++){const scale=Math.hypot(...transform.slice(4*axis,4*axis+3)),factor=size[axis]/(after.size[axis]*scale);for(let k=0;k<3;k++)transform[4*axis+k]*=factor;}
  const moved=cadPoint(transform,anchor(after));for(let i=0;i<3;i++)transform[12+i]+=fixed[i]-moved[i];
  return {...structuredClone(node),recipe:structuredClone(replacement.recipe),brep:structuredClone(replacement.brep),stats:structuredClone(replacement.stats),transform};
}

/** Root id plus child-id path uses the same convention as native tool origins. */
export function cadSourceAtPath(project,rootId,path=[]){
  if(!Array.isArray(path)||path.length>12||path.some(id=>typeof id!=='string'||!id))throw Error('Ungültiger nativer CAD-Quellenpfad.');
  let node=project?.nodes?.find(node=>node.id===rootId);if(!node)throw Error('Das CAD-Bezugsobjekt fehlt.');
  for(const id of path){node=node.children?.find(child=>child.id===id);if(!node)throw Error('Die native CAD-Quelle fehlt im angegebenen Pfad.');}
  return node;
}

/** A draft project for the worker's subsequent native boolean rebuild. */
export function cadReplaceFormSource(project,rootId,path,replacement){
  const copy=structuredClone(project);let node=cadSourceAtPath(copy,rootId),parent=null;
  if(node.locked)throw Error('Das CAD-Bezugsobjekt ist gesperrt.');
  cadSourceAtPath(copy,rootId,path);
  for(const id of path){parent=node;node=node.children.find(child=>child.id===id);if(node.locked)throw Error('Die native CAD-Quelle ist gesperrt.');}
  nativeForm(node);nativeForm(replacement);if(replacement.id!==node.id)throw Error('Die Kennung der nativen Ersatzquelle muss erhalten bleiben.');
  if(parent)parent.children[parent.children.findIndex(child=>child.id===node.id)]=structuredClone(replacement);
  else copy.nodes[copy.nodes.findIndex(root=>root.id===rootId)]=structuredClone(replacement);
  return copy;
}
