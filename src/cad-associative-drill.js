import {remapCadCylinderFaceAnchor} from './cad-cylinder-face-anchor.js';
import {Matrix4} from 'three';
import {cadBounds,cadBoolean,cadVolume,readCadBrep,transformCad,validateCadSolid} from './cad-native-kernel.js';
import {cadPoint,inverseCadMatrix,multiplyCadMatrices} from './cad-affine.js';
import {cadReferenceFrame} from './cad-reference-points.js';
import {projectCadFaceAnchorNative} from './cad-topology-native.js';
import {remapCadBoxFaceAnchor} from './cad-box-face-anchor.js';
import {calculateCadDrillExtent,validateCadDrillDimensions} from './cad-drill-extent.js';
import {buildCadRecipe} from './cad-recipes.js';
import {validateCadDrillPattern,cadDrillPatternAnchors} from './cad-drill-pattern.js';
import {affineCadDrillStock} from './cad-drill-stock-native.js';

const fail=message=>{throw Object.assign(Error(message),{code:'CAD_DRILL_REFERENCE_CHANGED'});};
const normal=(matrix,n)=>{const inv=inverseCadMatrix(matrix),v=[0,1,2].map(row=>inv[row*4]*n[0]+inv[row*4+1]*n[1]+inv[row*4+2]*n[2]),len=Math.hypot(...v);if(!Number.isFinite(len)||!len)fail('Ungültige Flächennormale.');return v.map(x=>x/len);};

export function validateAssociativeBoxDrill(value){
 const keys=['version','sourceId','boxId','feature','anchor','sourceBounds','termination','stop','pattern','kind','diameter','depth','headDiameter','headDepth','angle','gap'];
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k))||![1,2].includes(value.version)||typeof value.sourceId!=='string'||!value.sourceId||value.sourceId.length>200||typeof value.boxId!=='string'||!value.boxId||value.boxId.length>200||!['depth','through','plane'].includes(value.termination))fail('Ungültiges Bohrungsrezept.');
 const remap=value.version===2?remapCadCylinderFaceAnchor:remapCadBoxFaceAnchor;
 const a=value.anchor,b=value.sourceBounds;if(!a||Object.keys(a).sort().join(',')!=='normal,point'||!b||Object.keys(b).sort().join(',')!=='max,min'||!remap({feature:value.feature,anchor:a,previousBounds:b,currentBounds:b}))fail('Ungültiger Quaderflächenbezug.');
 if(value.stop!==undefined){const s=value.stop;if(!s||Object.keys(s).sort().join(',')!=='anchor,feature'||!s.anchor||Object.keys(s.anchor).sort().join(',')!=='normal,point'||!remap({feature:s.feature,anchor:s.anchor,previousBounds:b,currentBounds:b})||s.feature===value.feature)fail('Ungültiger Zielbezug der Bohrung.');}
 if(value.termination==='plane'&&!value.stop)fail('Für Bis Fläche eine Zielfläche auswählen.');
 if(value.pattern!==undefined)validateCadDrillPattern(value.pattern);
 if(![value.depth,value.headDiameter,value.headDepth,value.angle].every(Number.isFinite)||value.depth<.1||value.depth>10000||value.headDepth<=0||value.headDepth>10000||value.angle<30||value.angle>150)fail('Ungültige Bohrungsmaße.');
 validateCadDrillDimensions({...value,length:value.termination==='depth'?value.depth:10000});
 return structuredClone(value);
}

// Prototype native operation. The caller must validate the persisted record
// and resolve precisely one retained box source before calling this function.
// It deliberately refuses unknown source types rather than guessing a face.
export function findAssociativeDrillBox(source,version=1){
 let node=source,matrix=source?.transform;
 while(node?.source==='group'&&node.drill&&node.drill.version===version&&node.children?.length===1&&!node.suppressed){node=node.children[0];matrix=multiplyCadMatrices(matrix,node.transform);}
 if(node?.source!=='native'||!node.solid||node.suppressed)return null;
 if(version===1&&node.recipe?.type!=='box')return null;
 if(version===2){const recipe=node.recipe,p=recipe?.params??{},size=recipe?.size;if(recipe?.type!=='cylinder'||!Array.isArray(size)||size.length!==3||size[0]!==size[1]||p.edgeSize&&p.edgeStyle!=='none')return null;}
 if(![1,2].includes(version))return null;
 return {node,matrix};
}
export function buildAssociativeBoxDrill(oc,source,drill){
 const box=findAssociativeDrillBox(source,drill?.version??1);
 if(!box||box.node.id!==drill?.boxId||source.id!==drill?.sourceId||source.suppressed)fail('Die ursprüngliche Bohrungsquelle ist nicht mehr vorhanden.');
 if(!['depth','through','plane'].includes(drill.termination))fail('Diese Bohrungs-Endbedingung wird noch nicht unterstützt.');
 const local=readCadBrep(oc,source.brep.data),boxShape=readCadBrep(oc,box.node.brep.data);let shape,result;
 try{
  const remap=drill.version===2?remapCadCylinderFaceAnchor:remapCadBoxFaceAnchor,anchor=remap({feature:drill.feature,anchor:drill.anchor,previousBounds:drill.sourceBounds,currentBounds:cadBounds(oc,boxShape)});
  if(!anchor)fail('Die ursprüngliche Bohrungsfläche ist verloren oder mehrdeutig.');
  shape=source===box.node?affineCadDrillStock(oc,source,cadBounds(oc,boxShape)):null;
  shape??=transformCad(oc,local,source.transform);
  const boxBounds=cadBounds(oc,boxShape),anchors=cadDrillPatternAnchors({feature:drill.feature,anchor,bounds:boxBounds,pattern:drill.pattern}),worldNormal=normal(box.matrix,anchor.normal),entries=anchors.map(a=>cadPoint(box.matrix,a.point));
  if(drill.version===2){const axis=[box.matrix[8],box.matrix[9],box.matrix[10]],length=Math.hypot(...axis);if(!length||Math.hypot(...axis.map((v,k)=>v/length-worldNormal[k]*anchor.normal[2]))>1e-8)fail('Zylinderbohrungen unterstützen keine Scherung zwischen Achse und Stirnfläche.');}
  const maxDiameter=(drill.kind==='plain'?drill.diameter:Math.max(drill.diameter,drill.headDiameter))+2*drill.gap;
  const priorHoles=[];if(drill.version===2){let prior=source;while(prior?.drill?.version===2){const previous=prior.drill,previousAnchor=remapCadCylinderFaceAnchor({feature:previous.feature,anchor:previous.anchor,previousBounds:previous.sourceBounds,currentBounds:boxBounds});if(!previousAnchor)fail('Eine frühere Zylinderbohrung hat ihren Bezug verloren.');const diameter=(previous.kind==='plain'?previous.diameter:Math.max(previous.diameter,previous.headDiameter))+2*previous.gap;for(const a of cadDrillPatternAnchors({feature:previous.feature,anchor:previousAnchor,bounds:boxBounds,pattern:previous.pattern}))priorHoles.push({point:cadPoint(box.matrix,a.point),diameter});prior=prior.children?.[0];}}
  for(let i=0;i<entries.length;i++){if(projectCadFaceAnchorNative(oc,shape,{point:entries[i],normal:worldNormal}).length!==1)fail('Eine Bohrungsposition liegt nicht eindeutig auf der Ursprungsfläche.');for(const previous of priorHoles){const d=entries[i].map((v,k)=>v-previous.point[k]),axial=d.reduce((sum,v,k)=>sum+v*worldNormal[k],0),radial=Math.hypot(...d.map((v,k)=>v-axial*worldNormal[k]));if(radial<=(maxDiameter+previous.diameter)/2+1e-6)fail('Zylinderbohrungen dürfen bestehende Bohrungen nicht berühren oder überlappen.');}for(let j=0;j<i;j++)if(Math.hypot(...entries[i].map((v,k)=>v-entries[j][k]))<=maxDiameter+1e-6)fail('Bohrungen des Musters dürfen sich nicht überlappen oder berühren.');
   if(drill.version===2){const frame=cadReferenceFrame(entries[i],worldNormal),inverse=inverseCadMatrix(box.matrix),u=[0,1].map(row=>inverse[row]*frame[0]+inverse[4+row]*frame[1]+inverse[8+row]*frame[2]),v=[0,1].map(row=>inverse[row]*frame[4]+inverse[4+row]*frame[5]+inverse[8+row]*frame[6]),a=u[0]*u[0]+u[1]*u[1],b=u[0]*v[0]+u[1]*v[1],c=v[0]*v[0]+v[1]*v[1],scale=Math.sqrt((a+c+Math.hypot(a-c,2*b))/2),radius=Math.min((boxBounds.max[0]-boxBounds.min[0])/2,(boxBounds.max[1]-boxBounds.min[1])/2);if(Math.hypot(anchors[i].point[0],anchors[i].point[1])+maxDiameter/2*scale>=radius-1e-6)fail('Die Bohrung oder Kopfaufnahme würde den Zylinderrand schneiden.');}
   if(drill.pattern&&drill.version!==2){const frame=cadReferenceFrame(entries[i],worldNormal),inverse=inverseCadMatrix(box.matrix),u=[0,1,2].map(row=>inverse[row]*frame[0]+inverse[4+row]*frame[1]+inverse[8+row]*frame[2]),v=[0,1,2].map(row=>inverse[row]*frame[4]+inverse[4+row]*frame[5]+inverse[8+row]*frame[6]);for(let axis=0;axis<3;axis++)if(Math.abs(anchor.normal[axis])<.5){const reach=maxDiameter/2*Math.hypot(u[axis],v[axis]),point=anchors[i].point[axis];if(point-reach<=boxBounds.min[axis]+1e-6||point+reach>=boxBounds.max[axis]-1e-6)fail('Eine Musterbohrung würde den äußeren Quaderflächenrand schneiden.');}}
  }
  let stopPoint,stopNormal;if(drill.termination==='plane'){
    const target=remap({feature:drill.stop?.feature,anchor:drill.stop?.anchor,previousBounds:drill.sourceBounds,currentBounds:cadBounds(oc,boxShape)});if(!target)fail('Die Zielfläche ist verloren oder mehrdeutig.');
    stopPoint=cadPoint(box.matrix,target.point);stopNormal=normal(box.matrix,target.normal);if(projectCadFaceAnchorNative(oc,shape,{point:stopPoint,normal:stopNormal}).length!==1)fail('Die Zielfläche ist nicht eindeutig auf der Ursprungsfläche vorhanden.');
  }
  const tools=[];try{
   for(const entry of entries){const frame=cadReferenceFrame(entry,worldNormal),inverse=inverseCadMatrix(frame),aligned=transformCad(oc,shape,inverse);let bounds;try{bounds=cadBounds(oc,aligned);}finally{aligned.delete();}const margin=Math.max(oc.Precision.Confusion()*16,Math.hypot(...bounds.size)*1e-9),stopPlane=stopPoint?{point:cadPoint(inverse,stopPoint),normal:normal(inverse,stopNormal)}:undefined;
    if(drill.termination==='depth'){const axis=anchor.normal.findIndex(v=>Math.abs(v)>.5),opposite=[...anchor.point];opposite[axis]=anchor.normal[axis]>0?boxBounds.min[axis]:boxBounds.max[axis];const other=cadPoint(box.matrix,opposite),thickness=entry.reduce((sum,value,k)=>sum+(value-other[k])*worldNormal[k],0);if(!Number.isFinite(thickness)||drill.depth>=thickness-margin)fail('Die feste Bohrtiefe erreicht die gegenüberliegende Fläche; Durchgang wählen oder Tiefe verringern.');}
    const length=calculateCadDrillExtent({termination:drill.termination,depth:drill.depth,bounds,margin,stopPlane}),d=validateCadDrillDimensions({...drill,length:drill.termination==='through'&&drill.kind==='counterbore'?length-margin:length});
    function cutter(recipe,toolDepth){const tool=buildCadRecipe(oc,recipe),offset=new Matrix4().makeTranslation(0,0,-toolDepth/2).toArray();try{tools.push(transformCad(oc,tool,multiplyCadMatrices(frame,offset)));}finally{tool.delete();}}
    if(drill.kind==='countersink'){
     const profileLength=Math.min(length,300);cutter({type:'countersink',size:[d.head,d.head,profileLength],params:{bore:d.bore,sinkDiameter:d.head,angle:drill.angle,length:profileLength}},profileLength);
     if(length>profileLength)cutter({type:'cylinder',size:[d.bore,d.bore,length]},length);
    }else{
     cutter({type:'cylinder',size:[d.bore,d.bore,length]},length);
     if(drill.kind==='counterbore')cutter({type:'cylinder',size:[d.head,d.head,drill.headDepth]},drill.headDepth);
    }
   }
   if(drill.version===2){const original=affineCadDrillStock(oc,{...box.node,transform:box.matrix},boxBounds)??transformCad(oc,boxShape,box.matrix);try{for(const tool of tools){let full,remaining;try{full=cadBoolean(oc,'intersection',original,tool);remaining=cadBoolean(oc,'intersection',shape,tool);const a=cadVolume(oc,full),b=cadVolume(oc,remaining);if(!Number.isFinite(a)||!Number.isFinite(b)||a<=1e-8||a-b>Math.max(1e-7,a*1e-8))fail('Die Bohrung überschneidet eine bestehende Bearbeitung; der vollständige Fußabdruck ist nicht frei.');}finally{full?.delete();remaining?.delete();}}}finally{original.delete();}}
   result=shape;shape=null;for(const tool of tools){const next=cadBoolean(oc,'difference',result,tool);result.delete();result=next;}
   validateCadSolid(oc,result);const out=result;result=null;return out;
  }finally{tools.forEach(t=>t.delete());}
 }finally{result?.delete();shape?.delete();boxShape.delete();local.delete();}
}
