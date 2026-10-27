import {createCadProjectParameters,validateCadProjectParameters,evaluateCadProjectParameters,planCadProjectParameters,cadProjectParameterProblems} from './cad-project-parameters-data.js';
import {cadProjectParameterCatalog} from './cad-project-parameters-catalog.js';

const fail=(message,code='INVALID_PROJECT_PARAMETERS')=>{throw Object.assign(Error('Projektparameter: '+message),{code});};
const plain=value=>value&&Object.getPrototypeOf(value)===Object.prototype;
const idSchema={type:'string',minLength:1,maxLength:200},targetSchema={type:'object',additionalProperties:false,required:['rootId','path'],properties:{rootId:idSchema,path:{type:'array',maxItems:12,items:idSchema}}},valueSchema={oneOf:[{type:'number',minimum:-100000,maximum:100000},{type:'string',minLength:1,maxLength:200}]},stateSchema={type:'object',additionalProperties:false,required:['target'],properties:{target:targetSchema,hidden:{type:'boolean'},suppressed:{type:'boolean'}},anyOf:[{required:['hidden']},{required:['suppressed']}]};
const definitionSchema={type:'object',additionalProperties:false,required:['version','parameters','bindings','variants','activeVariantId'],properties:{version:{enum:[1,2]},freecad:{type:'array',maxItems:500,items:{type:'object',additionalProperties:false,required:['target','inputs'],properties:{target:targetSchema,inputs:{type:'array',maxItems:8,items:{type:'object',additionalProperties:false,required:['name','target'],properties:{name:{type:'string',pattern:'^[A-Za-z][A-Za-z0-9_]{0,63}$'},target:targetSchema,unresolved:{const:true}}}}}}},parameters:{type:'array',maxItems:100,items:{type:'object',additionalProperties:false,required:['id','name','value'],properties:{id:idSchema,name:{type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_]{0,39}$'},value:valueSchema}}},bindings:{type:'array',maxItems:500,items:{type:'object',additionalProperties:false,required:['id','parameterId','target','field'],properties:{id:idSchema,parameterId:idSchema,target:targetSchema,field:{type:'string',minLength:1,maxLength:300}}}},variants:{type:'array',maxItems:32,items:{type:'object',additionalProperties:false,required:['id','name','values','states'],properties:{id:idSchema,name:idSchema,values:{type:'array',maxItems:100,items:{type:'object',additionalProperties:false,required:['parameterId','value'],properties:{parameterId:idSchema,value:valueSchema}}},states:{type:'array',maxItems:500,items:stateSchema}}}},activeVariantId:{oneOf:[idSchema,{type:'null'}]},baseStates:{type:'array',maxItems:500,description:'Read-only captured original flags. Omit on put; the existing values are preserved internally.',items:stateSchema},applied:{type:'object',description:'Read-only native update stamp. Omit on put; supplied stamps must equal the confirmed project.'}}};
export const CAD_PROJECT_PARAMETER_COMMAND_SCHEMAS=[
 {type:'object',additionalProperties:false,required:['op','action','data'],properties:{op:{const:'parameter'},action:{const:'put'},data:definitionSchema}},
 {type:'object',additionalProperties:false,required:['op','action','variantId'],properties:{op:{const:'parameter'},action:{const:'selectVariant'},variantId:{oneOf:[idSchema,{type:'null'}]}}},
 ...['update','remove'].map(action=>({type:'object',additionalProperties:false,required:['op','action'],properties:{op:{const:'parameter'},action:{const:action}}}))
];

export function validateCadProjectParameterCommands(commands){
 if(!Array.isArray(commands)||!commands.length||commands.length>200||commands.some(command=>!plain(command)||command.op!=='parameter'))fail('Parameterbefehle in einer eigenen homogenen Vorschau senden.');
 let updated=false;
 return commands.map(command=>{
  const fields={put:['op','action','data'],selectVariant:['op','action','variantId'],update:['op','action'],remove:['op','action']}[command.action];if(!fields||Object.keys(command).some(k=>!fields.includes(k)))fail('Unbekannte Felder im Parameterbefehl.');if(updated)fail('„update“ muss der letzte Parameterbefehl sein.');if(command.action==='update')updated=true;
  if(command.action==='put')return {op:'parameter',action:'put',data:validateCadProjectParameters(command.data)};
  if(command.action==='selectVariant'){if(command.variantId!==null&&(typeof command.variantId!=='string'||!command.variantId||command.variantId.length>200||/[\x00-\x1f]/.test(command.variantId)))fail('Gültige Variantenkennung oder null wählen.');return {op:'parameter',action:command.action,variantId:command.variantId};}
  return {op:'parameter',action:command.action};
 });
}
export async function previewCadProjectParameterCommands(controller,{commands,revision,label='Projektparameter und Varianten ändern'}={}){
 const validated=validateCadProjectParameterCommands(commands),current=()=>{if(controller.revision()!==revision)fail('Modell während der Parameterprüfung geändert.','STALE_REVISION');};current();
 const project=controller.readSnapshot(),confirmed=validateCadProjectParameters(project.projectParameters??createCadProjectParameters());let data=structuredClone(confirmed),explicitUpdate=false;
 for(const command of validated){
  current();if(command.action==='put'){
   for(const field of ['applied','baseStates'])if(command.data[field]!==undefined&&JSON.stringify(command.data[field])!==JSON.stringify(confirmed[field]))fail('Native Aktualisierungsbelege und ursprüngliche Variantenflags sind schreibgeschützt.');data=command.data;
  }else if(command.action==='selectVariant')data=evaluateCadProjectParameters(data,{variantId:command.variantId}).data;
  else if(command.action==='remove')data=createCadProjectParameters();else explicitUpdate=true;
 }
 const plan=planCadProjectParameters(project,data);if(plan.problems.length)throw Object.assign(Error(plan.problems[0].message),{code:plan.problems[0].code,problems:plan.problems});if(plan.requiresGeometry&&!explicitUpdate)fail('Gebundene Maße oder Varianten benötigen einen abschließenden ausdrücklichen „update“-Befehl.','PARAMETERS_UPDATE_REQUIRED');
 current();return controller.previewProjectParameters(data,{revision,label});
}

const size=value=>new TextEncoder().encode(JSON.stringify(value)).length;
function append(summary,array,value,maxBytes){array.push(value);if(size(summary)>maxBytes-1000){array.pop();summary.truncated=true;return false;}return true;}
export function cadProjectParametersSummary(project,options={}){
 const allowed=['parameterOffset','parameterLimit','bindingOffset','bindingLimit','variantOffset','variantLimit'];if(!plain(options)||Object.keys(options).some(k=>!allowed.includes(k)))fail('Nur Parameter-, Bindungs- und Varianten-Seitenoptionen verwenden.');
 const range=(kind,total,max)=>{const offset=options[kind+'Offset']??0,limit=options[kind+'Limit']??max;if(!Number.isSafeInteger(offset)||offset<0||offset>1000000||!Number.isSafeInteger(limit)||limit<1||limit>max)fail('Ungültige Parameter-Berichtsseite.');return {offset,limit,total,returned:0};};
 const data=validateCadProjectParameters(project.projectParameters??createCadProjectParameters()),evaluation=evaluateCadProjectParameters(data),limits={bytes:128000,parameters:100,bindings:200,variants:32},pages={parameters:range('parameter',data.parameters.length,100),bindings:range('binding',data.bindings.length,200),variants:range('variant',data.variants.length,32)},problems=cadProjectParameterProblems(project),summary={version:1,definitionVersion:data.version,freecadRunCount:data.freecad?.length??0,freecad:[],exists:project.projectParameters!==undefined,activeVariantId:data.activeVariantId,effectSignature:evaluation.effectSignature,parameterCount:data.parameters.length,bindingCount:data.bindings.length,variantCount:data.variants.length,problemCount:problems.length,parameters:[],bindings:[],variants:[],problems:[],pages,truncated:false,limits};
 for(const run of (data.freecad??[]).slice(0,16))if(!append(summary,summary.freecad,run,limits.bytes))break;if(summary.freecad.length<(data.freecad?.length??0))summary.truncated=true;
 for(const parameter of data.parameters.slice(pages.parameters.offset,pages.parameters.offset+pages.parameters.limit))if(!append(summary,summary.parameters,{...parameter,resolvedValue:evaluation.values[parameter.id]},limits.bytes))break;
 for(const binding of evaluation.bindings.slice(pages.bindings.offset,pages.bindings.offset+pages.bindings.limit))if(!append(summary,summary.bindings,binding,limits.bytes))break;
 for(const variant of data.variants.slice(pages.variants.offset,pages.variants.offset+pages.variants.limit))if(!append(summary,summary.variants,{id:variant.id,name:variant.name,active:variant.id===data.activeVariantId,valueCount:variant.values.length,stateCount:variant.states.length,values:variant.values.slice(0,16),states:variant.states.slice(0,8),truncated:variant.values.length>16||variant.states.length>8},limits.bytes))break;
 for(const problem of problems.slice(0,32))if(!append(summary,summary.problems,problem,limits.bytes))break;
 for(const key of ['parameters','bindings','variants']){pages[key].returned=summary[key].length;if(pages[key].offset>0||pages[key].offset+pages[key].returned<pages[key].total)summary.truncated=true;}
 if(summary.problems.length<problems.length||summary.variants.some(v=>v.truncated))summary.truncated=true;return summary;
}
export function cadProjectParameterCatalogSummary(project,options={}){
 if(!plain(options)||Object.keys(options).some(k=>k!=='targets')||options.targets!==undefined&&(!Array.isArray(options.targets)||options.targets.length>500))fail('Katalog benötigt eine begrenzte Zielauswahl.');
 const allTargets=options.targets??(project.nodes??[]).filter(n=>n.kind==='cad').map(n=>({rootId:n.id,path:[]})),targets=allTargets.slice(0,8),catalog=cadProjectParameterCatalog(project,{targets}),limits={bytes:64000,targets:8,fields:200},summary={version:1,targetCount:allTargets.length,fieldCount:catalog.reduce((n,t)=>n+t.fields.length,0),targets:[],truncated:allTargets.length>8,limits};let fields=0;
 for(const target of catalog){const row={target:target.target,label:target.label,fieldCount:target.fields.length,fields:[],truncated:false};if(!append(summary,summary.targets,row,limits.bytes))break;for(const field of target.fields){if(fields>=limits.fields){row.truncated=summary.truncated=true;break;}if(!append(summary,row.fields,field,limits.bytes)){row.truncated=true;break;}fields++;}}
 return summary;
}
