const {policy}=require('./practice-ui-policy.cjs');
function photoEvidence(value){
 const size=value?.originalPixels;
 if(!Array.isArray(size)||size.length!==2||!size.every(n=>Number.isSafeInteger(n)&&n>=1)||size[0]*size[1]>16000000)return undefined;
 const points=value.outerEdgeCandidate;
 const valid=points=>Array.isArray(points)&&points.length>=3&&points.length<=16&&points.every(point=>Array.isArray(point)&&point.length===2&&
  point.every((n,index)=>Number.isFinite(n)&&n>=0&&n<=size[index]));
 const silhouette=value.silhouetteCandidate;
 const usable=valid(silhouette?.outline)&&Array.isArray(silhouette.openings)&&silhouette.openings.length<=4&&silhouette.openings.every(valid);
 return {originalPixels:[...size],...(valid(points)?{outerEdgeCandidate:structuredClone(points)}:{}),
  ...(usable?{silhouetteCandidate:{outline:structuredClone(silhouette.outline),openings:structuredClone(silhouette.openings)}}:{})};
}
function practicePanelEvidence(panel){
 if(!Array.isArray(panel?.controls))return undefined;
 const controls=panel.controls.slice(0,40).filter(c=>typeof c?.target==='string'&&c.target.length<=240&&/^ui:(id|label):/.test(c.target))
  .map(c=>({target:c.target,disabled:c.disabled===true,editable:c.editable===true}));
 const {nextAction}=panel;
 const next=nextAction?.target==='ui:id:drawing-title-block'&&nextAction?.blockedTarget==='ui:id:drawing-title'&&controls.some(c=>c.target===nextAction.target)
  ?{target:nextAction.target,blockedTarget:nextAction.blockedTarget,action:'click',reason:'Titelblock geschlossen'}:undefined;
 return {title:typeof panel.title==='string'?panel.title.slice(0,120):'',controls,truncated:panel.truncated===true,...(next?{nextAction:next}:{})};
}
function lockPracticeContext(context={}){
 const practiceObjects=Array.isArray(context.practiceObjects)?context.practiceObjects.slice(0,8).map((item,index)=>({
  alias:'existing-'+(index+1),name:typeof item?.name==='string'?item.name.slice(0,120):'',kind:['cad','mesh','referenceMesh'].includes(item?.kind)?item.kind:'object'
 })):undefined;
 const practiceFiles=Array.isArray(context.practiceFiles)?context.practiceFiles.slice(0,4).map((file,index)=>{
  const kind=file?.kind==='stl'?'stl':'photo',evidence=kind==='photo'?photoEvidence(file?.photoEvidence):undefined;
  const saved=file?.savedPhoto,calibration=saved?.calibration;
  const knownScale=[calibration?.referenceMm,calibration?.referencePixels].every(n=>Number.isFinite(n)&&n>0);
  const savedPhoto=kind==='photo'&&typeof saved?.name==='string'&&saved.name.trim()&&saved.name.length<=160&&
   !/[\x00-\x1f]/.test(saved.name)&&['front','right','top'].includes(saved.view)?{name:saved.name,view:saved.view,
    ...(knownScale?{calibration:{referenceMm:calibration.referenceMm,referencePixels:calibration.referencePixels}}:{})}:undefined;
  return {target:'ui:id:practice-file-'+(index+1),name:typeof file?.name==='string'?file.name.slice(0,120):'',kind,
   ...(evidence?{photoEvidence:evidence}:{}),...(savedPhoto?{savedPhoto}:{})};
 }):undefined;
 const motion=context.practiceMotion,aliases=new Set(practiceObjects?.map(object=>object.alias));
 const motionJoints=(Array.isArray(motion?.joints)?motion.joints:[]).slice(0,8)
  .filter(joint=>aliases.has(joint?.child)&&['revolute','prismatic'].includes(joint.kind)&&
    [joint.value,joint.limits?.min,joint.limits?.max].every(Number.isFinite))
  .map(({child,name,kind,value,limits})=>({child,name:typeof name==='string'?name.slice(0,120):'',kind,value,limits:{min:limits.min,max:limits.max}}));
 const jointChildren=new Set(motionJoints.map(joint=>joint.child));
 const screws=(Array.isArray(motion?.screws)?motion.screws:[]).slice(0,8)
  .filter(screw=>screw&&(jointChildren.has(screw.rotary)||jointChildren.has(screw.linear))&&
    Number.isFinite(screw.lead)&&screw.lead>0&&[1,-1].includes(screw.direction))
  .map(({rotary,linear,lead,direction})=>({rotary:jointChildren.has(rotary)?rotary:null,linear:jointChildren.has(linear)?linear:null,lead,direction}));
 const draft=context.practiceSketch;
 const point=value=>Array.isArray(value)&&value.length===2&&value.every(Number.isFinite);
 const practiceSketch=draft&&typeof draft==='object'?{
  ...(Number.isSafeInteger(draft.gapCount)&&draft.gapCount>=0&&draft.gapCount<=128?{gapCount:draft.gapCount}:{}),
  gaps:(Array.isArray(draft.gaps)?draft.gaps:[]).slice(0,8).filter(gap=>gap&&['outer','hole'].includes(gap.role)&&point(gap.from)&&point(gap.to)&&Number.isFinite(gap.distance))
   .map(({role,from,to,distance})=>({role,from,to,distance})),
  measures:(Array.isArray(draft.measures)?draft.measures:[]).slice(0,12)
   .filter(measure=>typeof measure?.name==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,39}$/.test(measure.name)&&/^ui:id:sketch-variable-value-(?:[1-9]|1[0-2])$/.test(measure.target))
   .map(({name,target})=>({name,target}))
 }:undefined;
 const practiceState=context.practiceState===undefined?undefined:require('./practice-runner.cjs').practiceAliasState(context.practiceState);
 const practicePanel=practiceState?practicePanelEvidence(context.practicePanel):undefined;
 return {practiceOnly:true,...(practicePanel?{practicePanel}:{}),sceneVisibility:context.practiceFromProject===true?'parent-withheld; use practiceObjects and practiceState':'isolated-empty-start',...(context.practiceFromProject===true?{practiceFromProject:true}:{}),...(motionJoints.length?{practiceMotion:{joints:motionJoints,screws}}:{}),...(practiceSketch?{practiceSketch}:{}),...(practiceState?{practiceState}:{}),...(practiceFiles?.length?{practiceFiles}:{}),...(practiceObjects?.length?{practiceObjects}:{}),practicePolicy:{version:1,taskLocked:true,construction:'visible-ui',reads:['tool-reference','practice-feedback','images'],directGeometry:false,scripts:false,parentProject:false},units:context.units??'mm',designFreedom:structuredClone(context.designFreedom??{}),shapes:structuredClone(context.shapes??[]),agentUI:Object.fromEntries(Object.entries(require('./ai-tool-reference.cjs').compactToolContext({agentUI:context.agentUI??{}}).agentUI).filter(([k])=>['requestSchema','targets','scope','layoutContextFile'].includes(k))),programAssistant:{practiceOnly:true},toolReference:{version:1,readOnly:true,request:{toolReference:{tool:'tool:ID'}},search:{toolReference:{query:'name or purpose'}},modeling:{toolReference:{section:'modeling'}},scope:'Practice UI only; modeling lookup returns only visibly replayable create/joint definitions.'},practiceCommandSchema:{oneOf:structuredClone(policy.commands)}};
}
module.exports={lockPracticeContext};
