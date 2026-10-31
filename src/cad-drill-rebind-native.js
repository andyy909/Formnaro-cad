import {Matrix3,Matrix4,Vector3} from 'three';
import {cadIdentity,cadPoint,inverseCadMatrix,multiplyCadMatrices} from './cad-affine.js';
import {cadBounds,readCadBrep} from './cad-native-kernel.js';
import {resolveCadReferenceNative} from './cad-reference-points.js';
import {findAssociativeDrillBox,cadDrillStockSourceChild} from './cad-associative-drill.js';
import {identifyCadBoxFaceAnchor} from './cad-box-face-anchor.js';
import {identifyCadCylinderFaceAnchor} from './cad-cylinder-face-anchor.js';
import {describeStepDrill,findAssociativeStepDrillSource} from './cad-step-drill.js';

const fail=message=>{throw Object.assign(Error(message),{code:'CAD_DRILL_REBIND_REQUIRED'});};
const normal=(matrix,value)=>new Vector3(...value).applyNormalMatrix(new Matrix3().getNormalMatrix(new Matrix4().fromArray(matrix))).toArray();

// Resolve every choice against the retained source, never against a cached
// drilled result or a face number from another geometry. Construction happens
// only after all recipes have been assigned, in the caller's single preview.
export function reassignCadDrillReferences(oc,root,bindings,{replacement}={}){
 if(!Array.isArray(bindings)||!bindings.length||bindings.length>13)fail('Eine bis 13 Bohrungen ausdrücklich neu zuordnen.');
 const seen=new Set(),updates=[];
 for(const binding of bindings){
  if(!binding||typeof binding!=='object'||Array.isArray(binding)||Object.keys(binding).some(k=>!['path','reference','stopReference'].includes(k)))fail('Ungültige Flächenzuordnung.');
  const path=binding.path??[];
  if(!Array.isArray(path)||path.length>12||path.some(v=>typeof v!=='string'||!v)||seen.has(JSON.stringify(path)))fail('Eindeutige vorhandene Bohrungsquellenpfade wählen.');
  seen.add(JSON.stringify(path));
  let node=root,world=node.transform;
  for(const id of path){const child=node.children?.find(child=>child.id===id);if(!child)fail('Die gewählte Bohrung ist nicht mehr vorhanden.');node=child;world=multiplyCadMatrices(world,node.transform);}
  if(!node.drill||node.children?.length!==1||node.suppressed)fail('Eine aktive mitwachsende Bohrung wählen.');
  let drill=structuredClone(node.drill);const source=node.children[0],replaced=replacement?.drills.some(entry=>entry.id===node.id);
  let base;if(replaced){let stock=source,matrix=stock.transform;while(stock?.source==='group'){const child=stock.drill&&stock.children?.length===1?stock.children[0]:cadDrillStockSourceChild(stock,replacement.version);if(!child)break;stock=child;matrix=multiplyCadMatrices(matrix,stock.transform);}base={node:stock,matrix};const common={};for(const field of ['kind','diameter','depth','headDiameter','headDepth','angle','gap','termination','pattern'])if(drill[field]!==undefined)common[field]=drill[field];drill={...common,version:replacement.version,sourceId:source.id,boxId:stock.id};}
  else base=drill.version===3?findAssociativeStepDrillSource(source):findAssociativeDrillBox(source,drill.version);
  if(!base||base.node.id!==drill.boxId||source.id!==drill.sourceId)fail('Die erhaltene Originalquelle fehlt. Ein Quellenersatz wird nicht automatisch zugeordnet.');
  const worldBase=multiplyCadMatrices(world,base.matrix),inverse=inverseCadMatrix(worldBase);
  const picked=value=>{
   if(!value||Object.keys(value).length!==1||!value.ray)fail('Einen freien Strahl auf der erhaltenen Originalquelle wählen; alte Marker und Flächennummern sind nicht zulässig.');
   const point=resolveCadReferenceNative(oc,{...base.node,transform:worldBase},value);
   if(!point.normal)fail('Eine eindeutige ebene Originalfläche wählen.');
   return {point:cadPoint(inverse,point.point),normal:normal(inverse,point.normal)};
  };
  const anchor=picked(binding.reference);
  if(drill.termination==='plane'&&!binding.stopReference)fail('Bei Bis Fläche auch die gegenüberliegende Zielfläche ausdrücklich neu wählen.');
  if(drill.termination!=='plane'&&binding.stopReference!==undefined)fail('Eine Zielfläche nur für Bis Fläche zuordnen.');
  if(drill.version===3){
   const sourceNode={...base.node,transform:cadIdentity()},entry=describeStepDrill(oc,sourceNode,anchor.point,anchor.normal);
   if(binding.stopReference){const stop=picked(binding.stopReference),exit=describeStepDrill(oc,sourceNode,stop.point,stop.normal);if(entry.sourceSignature!==exit.sourceSignature||entry.faceKey!==exit.exitFaceKey||entry.exitFaceKey!==exit.faceKey)fail('Die Zielfläche muss die gegenüberliegende bestätigte STEP-Fläche sein.');}
   Object.assign(drill,{anchor:entry.anchor,sourceSignature:entry.sourceSignature,faceKey:entry.faceKey,exitFaceKey:entry.exitFaceKey});
  }else{
   const shape=readCadBrep(oc,base.node.brep.data);let bounds;try{bounds=cadBounds(oc,shape);}finally{shape.delete();}
   const identify=drill.version===2?identifyCadCylinderFaceAnchor:identifyCadBoxFaceAnchor,feature=identify(anchor,bounds);
   if(!feature)fail('Eine eindeutige Quaderfläche oder kreisförmige Zylinderstirnfläche wählen.');
   Object.assign(drill,{anchor,feature,sourceBounds:{min:bounds.min,max:bounds.max}});
   delete drill.stop;
   if(binding.stopReference){const stop=picked(binding.stopReference),stopFeature=identify(stop,bounds);if(!stopFeature||stopFeature===feature)fail('Eine gegenüberliegende Zielfläche wählen.');drill.stop={feature:stopFeature,anchor:stop};}
  }
  updates.push({node,drill});
 }
 for(const {node,drill} of updates)node.drill=drill;
 return root;
}
