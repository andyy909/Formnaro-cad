import {validateCadJoints,createCadJoints,cadJointProblems} from './cad-joints-data.js';
import {driveJointIds} from './cad-drive-couplings.js';
const id={type:'string',minLength:1,maxLength:200},number={type:'number'},vector={type:'array',minItems:3,maxItems:3,items:{type:'number',minimum:-100000,maximum:100000}},limits={type:'object',additionalProperties:false,required:['min','max'],properties:{min:number,max:number}};
const command=(action,properties,required=Object.keys(properties))=>({type:'object',additionalProperties:false,required:['op','action',...required],properties:{op:{const:'joint'},action:{const:action},...properties}});
export const CAD_JOINT_COMMAND_SCHEMAS=[
 command('drive-create',{drive:{oneOf:[{type:'object',additionalProperties:false,required:['kind','rotary','linear'],properties:{id,name:id,kind:{const:'screw'},rotary:id,linear:id,lead:{type:'number',minimum:0.000001,maximum:100000},pitch:{type:'number',exclusiveMinimum:0},starts:{type:'integer',minimum:1,maximum:100},direction:{enum:[1,-1]}}},{type:'object',additionalProperties:false,required:['kind','table','swivel','extension','attachment'],properties:{id,name:id,kind:{const:'actuator'},table:id,swivel:id,extension:id,attachment:vector}}]}}),command('drive-remove',{driveId:id}),
 command('rigid-move',{mainId:id,translate:vector}),
 command('rigid-assembly',{mainId:id,ids:{type:'array',minItems:2,maxItems:257,uniqueItems:true,items:id}}),
 command('create',{joint:{oneOf:['fixed','revolute','prismatic'].map(kind=>({type:'object',additionalProperties:false,required:['kind','parentId','childId','origin'],properties:{id,name:{type:'string',minLength:1,maxLength:200},kind:{const:kind},parentId:id,childId:id,origin:vector,axis:vector,...(kind==='fixed'?{}:{limits})}}))}}),
 command('move',{values:{type:'array',maxItems:256,items:{type:'object',additionalProperties:false,required:['jointId','value'],properties:{jointId:id,value:number}}}}),
 command('remove',{jointId:id}),command('rebind',{jointId:id,origin:vector,axis:vector}),command('limits',{jointId:id,limits}),command('clear',{}),
 command('gear-create',{gear:{type:'object',additionalProperties:false,required:['jointA','jointB','teethA','teethB'],properties:{id,name:id,jointA:id,jointB:id,teethA:{type:'integer',minimum:1,maximum:10000},teethB:{type:'integer',minimum:1,maximum:10000},kind:{enum:['external','internal']}}}}),command('gear-remove',{gearId:id})
];
export async function previewCadJointCommands(controller,{commands,revision,label='KI-Gelenke',livePreview=false,intermediateDisplay}={}){
 if(!Array.isArray(commands)||!commands.length||!commands.some(c=>c?.op==='joint'))throw Object.assign(Error('Mindestens einen gültigen Gelenkbefehl senden.'),{code:'JOINT_COMMAND'});
 if(commands.length!==1)return controller.preview({kind:'batch',commands},{revision,label,livePreview,intermediateDisplay});
 const {op,...request}=commands[0];return controller.previewJoints(request,{revision,label});
}
export function cadJointsSummary(project,options={}){
 if(!options||Object.keys(options).some(k=>!['offset','limit','includeFrames'].includes(k)))throw Error('Gelenkabfrage: offset, limit und includeFrames wählen.');const {offset=0,limit=50,includeFrames=false}=options;if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>50||typeof includeFrames!=='boolean')throw Error('Gelenkabfrage: maximal 50 Verbindungen je Seite.');
 const data=validateCadJoints(project.joints??createCadJoints()),problems=cadJointProblems(project),name=id=>project.nodes.find(n=>n.id===id)?.name??'Fehlendes Teil';return {version:data.version,drives:structuredClone(data.drives??[]),gears:structuredClone(data.gears??[]),total:data.joints.length,offset,limit,truncated:offset+limit<data.joints.length,bases:data.bases.slice(0,50).map(id=>({id,name:name(id)})),baseTotal:data.bases.length,joints:data.joints.slice(offset,offset+limit).map(j=>({id:j.id,name:j.name,kind:j.kind,parentId:j.parentId,parentName:name(j.parentId),childId:j.childId,childName:name(j.childId),value:j.value,...(j.limits?{limits:j.limits,unit:j.kind==='revolute'?'degree':'mm'}:{}),...(includeFrames?{parentFrame:j.parentFrame,childFrame:j.childFrame}:{})})),problems:problems.slice(0,50),problemTotal:problems.length,scope:'Root rigid bodies; tree with fixed basis. Motion preview uses display matrices only. Collision is a separate explicit pose query, never a continuous-path guarantee.'};
}

// A scene carries the identities and values needed to choose a targeted
// joint command. Frames and unrelated bodies stay in the explicit analysis.
export function cadScopedJointState(project,rootIds){
 const data=project.joints;
 if(!data?.joints?.length)return undefined;
 const roots=new Set(rootIds);
 const related=data.joints.filter(joint=>roots.has(joint.parentId)||roots.has(joint.childId));
 const joints=related.slice(0,50).map(({id,name,kind,parentId,childId,value,limits})=>({
  id,name,kind,parentId,childId,value,...(limits?{limits:structuredClone(limits),unit:kind==='revolute'?'degree':'mm'}:{})
 }));
 const ids=new Set(joints.map(joint=>joint.id));
 const gears=(data.gears??[]).filter(gear=>ids.has(gear.jointA)&&ids.has(gear.jointB));
 const drives=(data.drives??[]).filter(drive=>driveJointIds(drive).every(id=>ids.has(id)));
 return {joints,gears:structuredClone(gears.slice(0,50)),drives:structuredClone(drives.slice(0,50)),
  relatedTotal:related.length,truncated:joints.length<related.length||gears.length>50||drives.length>50};
}
