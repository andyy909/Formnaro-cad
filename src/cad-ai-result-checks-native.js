import {measureCadBore} from './cad-bore-check-native.js';
import {validateAIResultChecks,resolveAIResultTarget,aiCheckFailure} from './cad-ai-result-checks.js';
import {readCadBrep,transformCad,cadBoolean,cadVolume} from './cad-native-kernel.js';

const unsupported=()=>{throw Object.assign(Error('Diese Ergebnisprüfung benötigt native CAD-Geometrie.'),{code:'AI_CHECK_UNSUPPORTED'});};
function placed(oc,project,object){
 if(object.kind!=='cad')unsupported();
 let node=project.nodes.find(n=>n.id===object.target.rootId);
 for(const id of object.target.path)node=node?.children?.find(n=>n.id===id);
 if(!node)unsupported();
 const shape=readCadBrep(oc,node.brep.data);try{return transformCad(oc,shape,object.worldMatrix);}finally{shape.delete();}
}
function distance(oc,project,left,right){
 let a,b,query;
 try{a=placed(oc,project,left);b=placed(oc,project,right);query=new oc.BRepExtrema_DistShapeShape(a,b);if(!query.IsDone()||!Number.isFinite(query.Value()))throw Error('Nativer Abstand konnte nicht gemessen werden.');return query.Value();}
 finally{query?.delete();b?.delete();a?.delete();}
}
function clearance(oc,project,object,check){
 // This proves an empty finite cylinder, not its surrounding wall or an exact
 // hole diameter. Reduce its radius only by the explicitly reported tolerance.
 let body,point,direction,axis,maker,cylinder,common;
 try{
  if(object.target.path.length||!object.solid||object.hidden)throw Object.assign(Error('Freien Korridor am sichtbaren fertigen CAD-Materialkörper prüfen.'),{code:'AI_CHECK_UNSUPPORTED'});
  body=placed(oc,project,object);
  const d=check.to.map((v,k)=>v-check.from[k]),length=Math.hypot(...d),unit=d.map(v=>v/length);
  // A corridor outside the target's bounding box is not a useful part check.
  let near=0,far=length;
  for(let k=0;k<3;k++)if(Math.abs(unit[k])<1e-14){if(check.from[k]<object.worldBounds.min[k]||check.from[k]>object.worldBounds.max[k])near=Infinity;}else{const a=(object.worldBounds.min[k]-check.from[k])/unit[k],b=(object.worldBounds.max[k]-check.from[k])/unit[k];near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));}
  if(far-near<=1e-6)throw Object.assign(Error('Prüfkorridor liegt außerhalb des Zielteils.'),{code:'AI_CHECK_INVALID'});
  point=new oc.gp_Pnt(...check.from);direction=new oc.gp_Dir(...unit);axis=new oc.gp_Ax2(point,direction);
  maker=new oc.BRepPrimAPI_MakeCylinder(axis,check.diameter/2-(check.tolerance??.01),length);cylinder=maker.Shape();
  common=cadBoolean(oc,'intersection',body,cylinder,{allowEmpty:true});
  return {clear:!common,obstructingVolume:common?cadVolume(oc,common):0,diameterChecked:check.diameter-2*(check.tolerance??.01)};
 }finally{common?.delete();cylinder?.delete();maker?.delete();axis?.delete();direction?.delete();point?.delete();body?.delete();}
}
export function checkCadAIResultNative({oc,project,scene,checks,aliases={}}){
 const requested=validateAIResultChecks(checks),reports=[];
 for(let i=0;i<requested.length;i++){
  const check=requested[i],object=resolveAIResultTarget(scene,check.target,aliases),tolerance=check.tolerance??.01;let actual;
  if(check.kind==='radialClearance')throw Object.assign(Error('Radialspiel unterstützt zwei geschlossene Material-Netzteile.'),{code:'AI_CHECK_UNSUPPORTED'});
  if(check.kind==='size')actual=object.measures?.[check.space==='edit'?'editSize':'worldAxisSize'];
  else if(check.kind==='bounds')actual=object.worldBounds?.[check.edge];
  else if(check.kind==='volume'||check.kind==='solids'){if(object.kind!=='cad')unsupported();actual=object[check.kind==='volume'?'volume':'solids'];}
  else if(check.kind==='distance')actual=distance(oc,project,object,resolveAIResultTarget(scene,check.other,aliases));
  else if(check.kind==='bore'){
   actual=measureCadBore({oc,project,object,check});if(Math.abs(actual.diameter-check.diameter)>tolerance||actual.endpointError>tolerance||!actual.clear||!actual.surroundingMaterial)throw aiCheckFailure(check,i+1,actual);
  }
  else if(check.kind==='clearance'){
   actual=clearance(oc,project,object,check);if(!actual.clear)throw aiCheckFailure(check,i+1,actual.obstructingVolume);
  }
  if(!['clearance','bore'].includes(check.kind)){
   const expected=Array.isArray(check.expected)?check.expected:[check.expected],measured=Array.isArray(actual)?actual:[actual];
   if(measured.length!==expected.length||measured.some(v=>!Number.isFinite(v)))throw Object.assign(Error('Ergebnisprüfung konnte keinen endlichen Messwert bestimmen.'),{code:'AI_CHECK_UNAVAILABLE'});
   if(measured.some((v,k)=>Math.abs(v-expected[k])>(check.kind==='solids'?0:tolerance)))throw aiCheckFailure(check,i+1,actual);
  }
  reports.push({kind:check.kind,target:structuredClone(object.target),...(check.other?{other:structuredClone(resolveAIResultTarget(scene,check.other,aliases).target)}:{}),...(check.edge?{edge:check.edge}:{}),...(check.space?{space:check.space}:{}),expected:check.expected??check.diameter,actual,tolerance:check.kind==='solids'?0:tolerance,passed:true,evidence:object.kind==='cad'?'native-brep':'source-bounds'});
 }
 return {version:1,revision:scene.revision,checks:reports,scope:'Only the supplied checks were measured. AI-supplied expectations do not independently prove the natural-language task. Clearance proves a finite empty cylinder, not exact hole diameter, surrounding material or printability.'};
}
