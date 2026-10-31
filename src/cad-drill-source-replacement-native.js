import {cadSelectionContext} from './cad-interface-state.js';
import {cadGeometryDigest} from './cad-geometry-digest.js';
import {readCadBrep,validateCadSolid} from './cad-native-kernel.js';
import {cadNativeFaceKeys} from './cad-freecad-node-native.js';

export function verifyCadDrillReplacementSource(plan,{oc,service}){
 const source=plan.sourceNode,stock=cadSelectionContext(plan.project,plan.stockTarget).node;
 if(source.source==='native'){
  const canonical=service.nativeNode(source.recipe,{id:stock.id,transform:stock.transform,...(source.constructionBudget!==undefined?{constructionBudget:source.constructionBudget}:{})});
  if(canonical.brep.data!==source.brep.data)throw Object.assign(Error('Die Ersatzquelle stimmt nicht mit ihrem nativen Rezept überein. Quelle zuerst aktualisieren.'),{code:'CAD_DRILL_REPLACEMENT_SOURCE_STALE'});
  stock.brep=canonical.brep;stock.stats=canonical.stats;
 }else{const native=readCadBrep(oc,stock.brep.data);try{const checked=validateCadSolid(oc,native);stock.stats={bounds:{min:checked.bounds.min,max:checked.bounds.max},volume:checked.volume,solids:checked.solids};}finally{native.delete();}}
 const old=plan.oldNode,pending=[...(stock.metadata?.pendingFaceColors??[]),...(old?(source.metadata?.pendingFaceColors??[]):[])],colors=new Map((stock.metadata?.stepFaceColors??[]).map(c=>[c.faceIndex,c])),assigned=new Set();
 if(old?.metadata?.stepFaceColors?.length){
  const before=cadNativeFaceKeys(oc,old.brep),after=cadNativeFaceKeys(oc,stock.brep),sourceDigest=cadGeometryDigest(old.brep.data);
  for(const color of old.metadata.stepFaceColors){const signature=before[color.faceIndex-1],matches=after.flatMap((value,index)=>value===signature?[index+1]:[]);if(matches.length===1&&!assigned.has(matches[0])){colors.set(matches[0],{...color,faceIndex:matches[0]});assigned.add(matches[0]);}else pending.push({...color,sourceDigest,...(signature?{faceDigest:signature}:{})});}
 }
 if(pending.length||colors.size){stock.metadata??={};if(pending.length)stock.metadata.pendingFaceColors=pending;if(colors.size)stock.metadata.stepFaceColors=[...colors.values()];}
 return {stockTarget:plan.stockTarget,source:plan.sourceTarget,reboundStockId:stock.id,pendingFaceColors:pending.length};
}
