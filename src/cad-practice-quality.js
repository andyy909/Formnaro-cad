import {validateAIResultChecks} from './cad-ai-result-checks.js';
import {photoEvidence} from './cad-photo-data.js';

const units={size:'mm',bounds:'mm',volume:'mm³',solids:'count',distance:'mm',bore:'mm',clearance:'mm',radialClearance:'mm',surfaceDeviation:'mm',freecad:'geometry',photoScale:'mm/px',photoLength:'mm'};
const photoKinds=new Set(['photoScale','photoLength']);
const actualFields={
 bore:['diameter','depth','axisOffset','endpointError','minWall','minBottom','bottomPresent','clear','surroundingMaterial'],
 clearance:['diameterChecked','obstructingVolume','clear'],
 radialClearance:['minimumGapLowerBound','sampledMinimumGapLowerBound','slabsChecked','coverage'],
 surfaceDeviation:['sampledMaximum','sampling'],
 freecad:['valid','closed','solids','check']
};

function compactActual(kind,actual){
 if(actual===undefined||actual===null)return null;
 if(!actualFields[kind]||typeof actual!=='object')return actual;
 return Object.fromEntries(actualFields[kind].filter(key=>Object.hasOwn(actual,key)).map(key=>[key,actual[key]]));
}

export function validatePracticeNativeCriteria(policy){
 validateAIResultChecks(policy.criteria.filter(({check})=>check.kind!=='freecad'&&check.kind!=='jointValue'&&!photoKinds.has(check.kind)).map(entry=>entry.check));
}

function checkPhoto(check,reference){
 if(!reference)return {status:'unavailable',code:'PRACTICE_PHOTO_TARGET',reason:'Für diese Übungsdatei ist keine Fotoreferenz gespeichert.'};
 const evidence=photoEvidence(reference),dimension=evidence.dimensions[check.measurementIndex];
 if(check.kind==='photoScale'&&evidence.version!==1)return {status:'not-applicable',reason:'Die perspektivische Referenz hat keinen einheitlichen Pixelmaßstab.'};
 if(check.kind==='photoLength'&&dimension?.source!=='measured')return {status:'unavailable',code:'PRACTICE_PHOTO_MEASUREMENT',reason:'Das angeforderte Bildmaß wurde noch nicht aus zwei Bildpunkten gemessen.'};
 const actual=check.kind==='photoScale'?evidence.mmPerPx:dimension.mm;
 const measurementPoints=check.kind==='photoScale'?evidence.scale.points:dimension.points;
 const pointsError=check.expectedPoints?Math.min(...[check.expectedPoints,[...check.expectedPoints].reverse()].map(pair=>
  Math.max(...pair.map(([x,y],i)=>Math.hypot(x-measurementPoints[i][0],y-measurementPoints[i][1]))))):null;
 const pointsPassed=pointsError===null||pointsError<=check.pointTolerancePx;
 const passed=pointsPassed&&Math.abs(actual-check.expected)<=check.tolerance;
 return {status:passed?'passed':'failed',actual,scope:evidence.scope,measurementPoints:structuredClone(measurementPoints),...(pointsError===null?{}:{pointsError,pointsPassed}),...(passed?{}:{code:'AI_RESULT_MISMATCH',reason:pointsPassed?'Der Bildmesswert liegt außerhalb der festen Prüftoleranz.':'Die Messpunkte liegen außerhalb der vorgegebenen Messstelle.'})};
}

function checkJoint(check,root,joints){
 const matches=joints?.filter(joint=>joint.childId===root&&joint.kind===check.jointKind)??[];
 if(matches.length!==1||!Number.isFinite(matches[0].value))return {status:'unavailable',code:'PRACTICE_JOINT_TARGET',reason:'Am Ziel ist kein eindeutiger messbarer Gelenkwert vorhanden.'};
 const actual=matches[0].value,passed=Math.abs(actual-check.expected)<=check.tolerance;
 return {status:passed?'passed':'failed',actual,scope:'Bestätigter Gelenkwert an dieser Stellung. Bewegungsbahn und Kollisionen werden hier nicht geprüft.',
  ...(passed?{}:{code:'AI_RESULT_MISMATCH',reason:'Der Gelenkwert liegt außerhalb der festen Prüftoleranz.'})};
}

async function inspectFreeCAD(controller,previewId,targetId,signal){
 try{
  const report=await controller.inspectFreeCADPreview(previewId,{targetId,signal});
  return report.status==='not-applicable'?{status:report.status,reason:report.reason}:{
   status:report.passed?'passed':'failed',actual:compactActual('freecad',report.geometry),scope:report.scope,
   ...(report.engineVersion?{engineVersion:report.engineVersion}:{})
  };
 }catch(error){
  if(signal?.aborted||error.name==='AbortError'||/STALE|ABORT|CANCEL/.test(error.code??''))throw error;
  return {status:'unavailable',code:error.code??'FREECAD_UNAVAILABLE',reason:String(error.message).slice(0,350)};
 }
}
export async function checkPracticeResult(controller,policy,{resolve,resolvePhoto=()=>null,checkpoint=async()=>{},signal}){
 validatePracticeNativeCriteria(policy);
 const revision=controller.revision(),items=[];
 const current=()=>{
  if(controller.revision()!==revision)throw Object.assign(Error('Übungsmodell wurde während der Prüfung geändert.'),{code:'STALE_REVISION'});
 };
 let preview;
 try{
  for(const {id,source,check} of policy.criteria){
   await checkpoint();current();
   const {kind,target,other,tolerance,expected,...parameters}=check;
   const row={id,kind,target,...(other?{other}:{}),source,expected:kind==='freecad'?{valid:true,closed:true,minimumSolids:1}:expected??parameters,
    ...(expected!==undefined&&Object.keys(parameters).length?{measurement:parameters}:{}),
    tolerance:tolerance??(['solids','surfaceDeviation','freecad'].includes(kind)?null:.01),unit:kind==='jointValue'?(check.jointKind==='revolute'?'°':'mm'):units[kind],
    revision,actual:null,milliseconds:0};
   if(policy.mode==='off'||policy.enabled&&!policy.enabled.includes(id)){
    items.push({...row,status:'skipped',reason:'Optionale Prüfung für diesen Lauf ausgeschaltet.'});
    continue;
   }
   if(photoKinds.has(kind)){
    const started=performance.now(),result=checkPhoto(check,resolvePhoto(target.slice(1)));
    items.push({...row,...result,milliseconds:Math.round(performance.now()-started)});
    continue;
   }
   const root=resolve(target.slice(1)),comparison=other?resolve(other.slice(1)):undefined;
   if(!root||other&&!comparison){
    items.push({...row,status:'unavailable',code:'PRACTICE_CHECK_TARGET',reason:'Das vorgegebene Prüfziel ist im Übungsmodell nicht eindeutig vorhanden.'});
    continue;
   }
   const started=performance.now();
   if(kind==='jointValue'){
    const result=checkJoint(check,root,controller.readSnapshot().joints?.joints);
    items.push({...row,...result,milliseconds:Math.round(performance.now()-started)});
    continue;
   }
   if(!preview)preview=await controller.preview(undefined,{revision,label:'Übungsstand prüfen'});
   current();
   if(kind==='freecad'){
    const result=await inspectFreeCAD(controller,preview.previewId,root,signal);
    current();items.push({...row,...result,milliseconds:Math.round(performance.now()-started)});
    continue;
   }
   const report=await controller.checkPreview(preview.previewId,[{...check,target:root,...(other?{other:comparison}:{})}],{collectFailures:true});
   current();
   const result=report.checks[0],code=result.error?.code;
   const status=result.passed===true?'passed':code==='AI_RESULT_MISMATCH'?'failed':
    code==='AI_CHECK_UNSUPPORTED'?'not-applicable':'unavailable';
   items.push({...row,status,actual:compactActual(kind,result.actual),milliseconds:Math.round(performance.now()-started),
    ...(code?{code,reason:result.error.message.slice(0,350)}:{}),
    ...(result.scope||report.scope?{scope:String(result.scope??report.scope).slice(0,320)}:{})});
  }
  await checkpoint();current();
  return {mode:policy.mode,revision,blocked:policy.mode==='enforce'&&items.some(item=>item.status==='failed'),items};
 }finally{if(preview)controller.discard(preview.previewId);}
}
