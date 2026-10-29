import {cadLinkedPatternProblems,validateCadLinkedPattern} from './cad-linked-pattern-data.js';
const id={type:'string',minLength:1,maxLength:200},number={type:'number'},vector={type:'array',items:number,minItems:3,maxItems:3};
const binding={type:'object',additionalProperties:false,required:['field','parameterId'],properties:{field:id,parameterId:id}};
const pattern={type:'object',additionalProperties:false,required:['version','id','sourceId','kind','count','excluded'],properties:{version:{const:1},id,sourceId:id,kind:{enum:['line','grid','circle','mirror']},count:{type:'integer',minimum:2,maximum:200},step:vector,columns:{type:'integer',minimum:1,maximum:200},rowStep:vector,center:vector,radius:number,startAngle:number,angle:number,rotateCopies:{type:'boolean'},mirrorAxis:{enum:['x','y','z']},mirrorOffset:number,excluded:{type:'array',maxItems:199,uniqueItems:true,items:{type:'integer',minimum:1,maximum:199}},bindings:{type:'array',maxItems:12,items:binding}}};
const command=(action,required,properties)=>({type:'object',additionalProperties:false,required:['op','action',...required],properties:{op:{const:'linkedPattern'},action:{const:action},...properties}});
export const CAD_LINKED_PATTERN_COMMAND_SCHEMAS=[command('put',['pattern'],{pattern}),command('detachInstance',['id','index'],{id,index:{type:'integer',minimum:1,maximum:199}}),command('detach',['id','confirm'],{id,confirm:{const:true}})];
const fail=message=>{throw Object.assign(Error(message),{code:'INVALID_LINKED_PATTERN_COMMAND'});};
export function cadLinkedPatternsSummary(project){const patterns=project.linkedPatterns?.patterns??[];return {total:patterns.length,truncated:patterns.length>50,patterns:patterns.slice(0,50).map(p=>{const {snapshot,instances,...definition}=p;return {...structuredClone(definition),instances:structuredClone(instances),problems:cadLinkedPatternProblems(project,p)};})};}
export async function previewCadLinkedPatternCommands(controller,{commands,revision,label='KI-Körpermuster'}={}){
 if(!Array.isArray(commands)||commands.length!==1||commands[0]?.op!=='linkedPattern')fail('Genau eine Musteraktion in einer eigenen Vorschau senden.');
 if(controller.revision()!==revision)throw Object.assign(Error('Das Modell wurde geändert.'),{code:'STALE_REVISION'});
 const c=commands[0];if(!c||Object.getPrototypeOf(c)!==Object.prototype)fail('Ungültiger Musterauftrag.');let operation;
 if(c.action==='put'){
  if(Object.keys(c).some(k=>!['op','action','pattern'].includes(k)))fail('Unbekannte Felder.');const value=c.pattern;if(!value||Object.getPrototypeOf(value)!==Object.prototype||'instances' in value||'snapshot' in value)fail('Interne Musterkopien und Prüfbelege dürfen nicht vorgegeben werden.');
  const previous=controller.snapshot().linkedPatterns?.patterns.find(p=>p.id===value.id);if(previous&&previous.sourceId!==value.sourceId)fail('Die vorhandene Musterquelle darf nicht ausgetauscht werden.');
  const requested=validateCadLinkedPattern({...structuredClone(value),instances:(previous?.instances??[]).filter(i=>i.index<value.count),...(previous?.snapshot?{snapshot:structuredClone(previous.snapshot)}:{})});operation={kind:'linkedPattern',pattern:requested};
 }else if(c.action==='detachInstance'){
  if(Object.keys(c).some(k=>!['op','action','id','index'].includes(k))||typeof c.id!=='string'||!c.id||!Number.isSafeInteger(c.index)||c.index<1||c.index>199)fail('Gültige Musterkennung und Position angeben.');operation={kind:'linkedPatternDetachInstance',id:c.id,index:c.index};
 }else if(c.action==='detach'){
  if(Object.keys(c).some(k=>!['op','action','id','confirm'].includes(k))||typeof c.id!=='string'||!c.id||c.confirm!==true)fail('Musterkennung und ausdrückliche Bestätigung zum Lösen angeben.');operation={kind:'linkedPatternDetach',id:c.id,confirmConflict:true};
 }else fail('Unbekannte Musteraktion.');
 return controller.preview(operation,{revision,label});
}
