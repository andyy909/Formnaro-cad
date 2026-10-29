import {projectObjectGeometryDigest} from './project-objects.js';
import {hasTransientCadReference} from './cad-ai-reference-guard.js';
import {rejectStaleCadReferences} from './cad-ai-reference-guard.js';
import {Matrix4,Quaternion,Vector3} from 'three';
import {cadProjectSnapshot} from './cad-project.js';
import {aiFeedback} from './ai-feedback.js';
import {synchronizeMeshWorkplane} from './mesh-workplane.js';
import {flags} from './organization.js';
import {AI_PROGRAM_TOOLS,validateProgramCommand,resolveProgramAliases} from './cad-ai-program.js';
import {assertMeshProtectionChange} from './mesh-protection.js';
import {runCommonModelTool} from './cad-ai-local-tools.js';

const vector={type:'array',minItems:3,maxItems:3,items:{type:'number',minimum:-200000,maximum:200000}},size={...vector,items:{type:'number',minimum:.01,maximum:10000}},alias={type:'string',pattern:'^[A-Za-z][A-Za-z0-9_-]{0,63}$'},name={type:'string',minLength:1,maxLength:200},color={type:'string',pattern:'^#[0-9a-fA-F]{6}$'},target={oneOf:[{type:'string',minLength:1,maxLength:200},{type:'object',additionalProperties:false,required:['rootId','path'],properties:{rootId:{type:'string',minLength:1,maxLength:200},path:{type:'array',maxItems:0,items:{type:'string'}}}}]},params={type:'object',maxProperties:40,additionalProperties:{oneOf:[{type:'number'},{type:'string',maxLength:100}]}};
export const MESH_AI_SHAPE_IDS=['box','cylinder','sphere','cone','pyramid','roof','wedge','hexagon','triangle','tube','torus','capsule','star','heart','gear','roundbox','halfSphere','thread','nut','countersink','shellbox','polygon'];
const definitions={
 counterpart:[['target','options'],{target,as:alias,name,color,options:{type:'object',additionalProperties:false,required:['geometryDigest','profileId','normal','planePoint','mode'],properties:{geometryDigest:{type:'string',pattern:'^[a-f0-9]{64}$'},profileId:{type:'string',pattern:'^profile-[a-f0-9]{24}$'},normal:vector,planePoint:vector,mode:{enum:['plug','sleeve','cap']},depth:{type:'number',minimum:.3,maximum:100},clearance:{type:'number',minimum:.05,maximum:5},wall:{type:'number',minimum:.6,maximum:20},thickness:{type:'number',minimum:.6,maximum:20}}}}],
 lid:[['target','options'],{target,as:alias,name,color,options:{type:'object',additionalProperties:false,required:['geometryDigest','candidateId','normal'],properties:{geometryDigest:{type:'string',pattern:'^[a-f0-9]{64}$'},candidateId:{type:'string',pattern:'^lid-[a-f0-9]{24}$'},normal:vector,thickness:{type:'number',minimum:.6,maximum:20},lipHeight:{type:'number',minimum:.3,maximum:20},lipWall:{type:'number',minimum:.6,maximum:10},clearance:{type:'number',minimum:.05,maximum:2},holeDiameter:{type:'number',minimum:.5,maximum:30}}}}],
 create:[['type'],{type:{enum:MESH_AI_SHAPE_IDS},as:alias,name,size,pos:vector,segments:{type:'integer',minimum:12,maximum:512},params,color,space:{enum:['world','plane']}}],
 group:[['targets'],{targets:{type:'array',minItems:2,maxItems:200,uniqueItems:true,items:target},operation:{enum:['union','intersection','difference']},as:alias,name}],
 split:[['target','normal','distance'],{target,normal:vector,distance:{type:'number',minimum:-100000,maximum:100000},asPositive:alias,asNegative:alias}],
 drill:[['target','reference'],{target,as:alias,reference:{type:'object',additionalProperties:false,required:['point','normal'],properties:{point:vector,normal:vector}},options:{type:'object',additionalProperties:false,properties:{style:{enum:['simple','countersink','counterbore']},termination:{enum:['through','blind']},diameter:{type:'number',minimum:.1,maximum:200},depth:{type:'number',minimum:.01,maximum:300},recessDiameter:{type:'number',minimum:.1,maximum:300},recessDepth:{type:'number',minimum:.01,maximum:300},angle:{type:'number',minimum:30,maximum:150},gap:{type:'number',minimum:0,maximum:5},offsetU:{type:'number',minimum:-10000,maximum:10000},offsetV:{type:'number',minimum:-10000,maximum:10000},segments:{type:'integer',minimum:12,maximum:512}}}}],
 finish:[['target','geometryDigest','edgeIds','options'],{target,as:alias,geometryDigest:{type:'string',pattern:'^[0-9a-f]{64}$'},edgeIds:{type:'array',minItems:1,maxItems:16,uniqueItems:true,items:{type:'string',minLength:1,maxLength:300}},options:{type:'object',additionalProperties:false,required:['mode','width'],properties:{mode:{enum:['fillet','chamfer']},width:{type:'number',minimum:.01,maximum:100},segments:{type:'integer',minimum:8,maximum:128}}}}],
 bodies:[['target'],{target,as:alias}],
 dissolve:[['target'],{target,as:alias}],
 role:[['target','role'],{target,role:{enum:['solid','hole']}}],
 repair:[['target'],{target,fillSmallHoles:{type:'boolean'}}],
 sourceEdit:[['target','path','set'],{target,path:{type:'array',maxItems:12,items:{type:'string',minLength:1,maxLength:200}},set:{type:'object',additionalProperties:false,minProperties:1,properties:{name,color,size,pos:vector,rot:vector,mirror:{...vector,items:{enum:[-1,1]}},solid:{type:'boolean'},suppressed:{type:'boolean'},opacity:{type:'number',minimum:0,maximum:1},notes:{type:'string',maxLength:10000},segments:{type:'integer',minimum:12,maximum:512},params}}}]
};
export const MESH_AI_COMMAND_SCHEMAS=Object.entries(definitions).map(([tool,[required,properties]])=>({type:'object',additionalProperties:false,required:['op','tool',...required],properties:{op:{const:'mesh'},tool:{const:tool},...properties}}));
function invalid(message){throw Object.assign(Error(message),{code:'INVALID_MESH_COMMAND'});}
// Validate this bounded schema at the application boundary as well as in the
// existing geometry worker. Provider JSON schemas are descriptions, not trust.
function validate(value,schema,path='Befehl'){
 if(schema.oneOf){let valid=0;for(const option of schema.oneOf){try{validate(value,option,path);valid++;}catch{}}if(valid!==1)invalid(path+': eindeutiger gültiger Wert erforderlich.');return;}
 if(Object.hasOwn(schema,'const')&&value!==schema.const)invalid(path+': ungültiger fester Wert.');
 if(schema.enum&&!schema.enum.includes(value))invalid(path+': unbekannte Auswahl.');
 const type=schema.type;
 if(type==='object'){
  if(!value||Object.getPrototypeOf(value)!==Object.prototype)invalid(path+': ein Datenobjekt erforderlich.');
  const keys=Object.keys(value);if(schema.minProperties!==undefined&&keys.length<schema.minProperties||schema.maxProperties!==undefined&&keys.length>schema.maxProperties)invalid(path+': ungültige Anzahl Felder.');
  for(const key of schema.required??[])if(!Object.hasOwn(value,key))invalid(path+'.'+key+': Feld fehlt.');
  for(const key of keys){const child=schema.properties?.[key];if(child)validate(value[key],child,path+'.'+key);else if(schema.additionalProperties===false||['__proto__','prototype','constructor'].includes(key))invalid(path+': unbekanntes Feld '+key+'.');else if(typeof schema.additionalProperties==='object')validate(value[key],schema.additionalProperties,path+'.'+key);}
 }else if(type==='array'){
  if(!Array.isArray(value)||schema.minItems!==undefined&&value.length<schema.minItems||schema.maxItems!==undefined&&value.length>schema.maxItems)invalid(path+': ungültige Liste.');
  if(schema.uniqueItems&&new Set(value.map(v=>JSON.stringify(v))).size!==value.length)invalid(path+': doppelte Einträge.');value.forEach((v,i)=>validate(v,schema.items,path+'['+i+']'));
 }else if(type==='string'){
  if(typeof value!=='string'||schema.minLength!==undefined&&value.length<schema.minLength||schema.maxLength!==undefined&&value.length>schema.maxLength||schema.pattern&&!new RegExp(schema.pattern).test(value))invalid(path+': ungültiger Text.');
 }else if(type==='number'||type==='integer'){
  if(typeof value!=='number'||!Number.isFinite(value)||type==='integer'&&!Number.isSafeInteger(value)||schema.minimum!==undefined&&value<schema.minimum||schema.maximum!==undefined&&value>schema.maximum)invalid(path+': Zahl außerhalb des gültigen Bereichs.');
 }else if(type==='boolean'&&typeof value!=='boolean')invalid(path+': Ja/Nein erforderlich.');
}
export function validateMeshAICommand(command){const schema=MESH_AI_COMMAND_SCHEMAS.find(s=>s.properties.tool.const===command?.tool);if(!schema)invalid('Unbekanntes Netz-Werkzeug.');validate(command,schema);return structuredClone(command);}
const abort=signal=>{if(signal?.aborted)throw Object.assign(Error('Gemeinsame KI-Vorschau abgebrochen.'),{name:'AbortError',code:'ABORTED'});};
function rootId(value,aliases,project){
 if(typeof value==='string'&&value.startsWith('$'))value=aliases[value.slice(1)];
 if(typeof value==='string')value={rootId:value,path:[]};
 if(!value||typeof value.rootId!=='string'||!Array.isArray(value.path)||value.path.length)invalid('Ein vollständiges Netzteil als Ziel wählen.');
 const node=project.nodes.find(n=>n.id===value.rootId);if(!node||node.kind!=='mesh')invalid('Das Ziel ist kein vorhandenes bearbeitbares Netzteil.');const state=flags(node,project);
 if(state.locked)throw Object.assign(Error('Das Netzteil oder sein Ordner/Layer ist gesperrt.'),{code:'LOCKED_MESH_OBJECT',feedback:{target:{rootId:node.id,path:[]},retryable:false}});
 if(state.hidden)throw Object.assign(Error('Für Netz-Werkzeuge ein sichtbares Netzteil wählen.'),{code:'HIDDEN_MESH_OBJECT',feedback:{target:{rootId:node.id,path:[]},retryable:false}});return node.id;
}
function storeAlias(aliases,key,value){if(key===undefined)return;if(Object.hasOwn(aliases,key))invalid('Ein Befehlsalias darf nur einmal vergeben werden.');aliases[key]=value;}
function meshOperation(command,aliases,project){
 const c=validateMeshAICommand(command),id=c.tool==='create'||c.tool==='group'?undefined:rootId(c.target,aliases,project);
 switch(c.tool){
  case 'counterpart':return {type:'mesh-counterpart',id,resultId:crypto.randomUUID(),options:c.options,...(c.name?{name:c.name}:{}),...(c.color?{color:c.color}:{})};
  case 'lid':return {type:'mesh-lid',id,resultId:crypto.randomUUID(),options:c.options,...(c.name?{name:c.name}:{}),...(c.color?{color:c.color}:{})};
  case 'create':return {type:'mesh-create',id:crypto.randomUUID(),shape:c.type,...(c.name?{name:c.name}:{}),position:c.pos??[0,0,(c.size?.[2]??20)/2],...(c.size?{size:c.size}:{}),...(c.params?{params:c.params}:{}),...(c.segments?{segments:c.segments}:{}),...(c.color?{color:c.color}:{}),...(c.space==='plane'?{frame:new Matrix4().compose(new Vector3(...project.workplane.origin),new Quaternion(...project.workplane.orientation),new Vector3(1,1,1)).toArray()}: {})};
  case 'group':return {type:'mesh-group',ids:c.targets.map(t=>rootId(t,aliases,project)),operation:c.operation??'union'};
  case 'split':{const length=Math.hypot(...c.normal);if(length<1e-12)invalid('Eine von null verschiedene Schnittnormale wählen.');return {type:'mesh-split',id,plane:{normal:c.normal.map(v=>v/length),offset:c.distance}};}
  case 'drill':return {type:'mesh-drill',id,reference:c.reference,options:c.options??{}};
  case 'finish':return {type:'mesh-finish',id,geometryDigest:c.geometryDigest,edgeIds:c.edgeIds,options:c.options};
  case 'bodies':return {type:'mesh-extract-bodies',id};
  case 'dissolve':return {type:'mesh-dissolve',id};
  case 'role':return {type:'mesh-role',id,role:c.role};
  case 'repair':return {type:'mesh-repair',id,fillSmallHoles:c.fillSmallHoles??false};
  case 'sourceEdit':return {type:'mesh-source-edit',id,path:c.path,set:c.set};
 }
}
/** Both workers calculate transient candidates inside ONE shared transaction.
 * No intermediate Apply/Undo, renderer geometry, repair or conversion is used. */
export async function runMixedCadAIBatch({project,baseline,commands,runNative,runMesh,query,runScript,runPython,convertModel,runFreeCAD,signal,progress,initialAliases={}}={}){
 if(!Array.isArray(commands)||!commands.length||commands.length>200)invalid('1–200 gemeinsame Befehle erforderlich.');
 commands.forEach((command,index)=>rejectStaleCadReferences(command,index>0));
 let current=cadProjectSnapshot(project),aliases=structuredClone(initialAliases),changes=[],warnings=[],reports=[];
 // Revalidate a supplied draft against its real confirmed baseline before it
 // becomes the baseline of any subsequent native command segment.
 current=(await runNative({project:current,baseline,operation:undefined,signal})).project;
 function locks(before,after){
  const all=p=>{const map=new Map();function visit(n,inherited=false){const locked=inherited||flags(n,p).locked;if(locked)map.set(n.id,JSON.stringify(n));for(const child of n.children??[])visit(child,locked);}p.nodes.forEach(n=>visit(n));return map;};
  const existing=all(before),next=all(after);for(const [id,data]of existing)if(next.get(id)!==data)invalid('Gesperrte Teile und Quellen müssen unverändert bleiben.');
  for(const n of after.nodes)if(!before.nodes.some(old=>old.id===n.id)&&flags(n,after).locked)invalid('Neue Teile benötigen einen entsperrten Zielcontainer.');
 }
 async function programTool(command){
  const c=validateProgramCommand(command);let operation=resolveProgramAliases(c.operation,aliases);const before=current;let conversionReport;
  if(c.engine==='freecad'){
   if(operation.kind!=='build')invalid('FreeCAD-Prüfungen als separate analyze-Anfrage oder lokale query ausführen.');
   if(typeof runFreeCAD!=='function')invalid('FreeCAD ist in dieser Umgebung nicht verfügbar.');
   const converted=await runFreeCAD({project:current,operation,signal});abort(signal);operation=converted.operation;conversionReport=converted.report;
  }
  if(c.engine==='converter'){
   if(operation.kind!=='convert'||Object.keys(operation).some(k=>!['kind','target','options'].includes(k))||typeof convertModel!=='function')invalid('Eine Konvertierung des aktuellen Modellteils wählen.');
   const target=typeof operation.target==='string'?{rootId:operation.target,path:[]}:operation.target;
   const converted=await convertModel({project:current,target,options:operation.options,action:'convert',signal});abort(signal);operation=converted.operation;conversionReport=converted.report;
  }
  if(c.engine==='cad'&&['cadToMesh','meshToCad'].includes(operation.kind)&&typeof operation.target==='string')operation.target={rootId:operation.target,path:[]};
  if(c.engine==='mesh'){
   if(operation.target!==undefined){
    const target=operation.target,id=typeof target==='string'?target:Array.isArray(target?.path)&&target.path.length===0?target.rootId:null;
    if(typeof id!=='string'||operation.id!==undefined&&operation.id!==id)invalid('Ein eindeutiges vollständiges Netzteil als Ziel wählen.');
    operation.id=id;delete operation.target;
   }
   const method=AI_PROGRAM_TOOLS.meshOptions[operation.type]?.method;
   if(method&&operation.options&&operation.options.method===undefined)operation.options.method=method;
   if(['mesh-create','mesh-create-source','mesh-from-data'].includes(operation.type))operation.id??=crypto.randomUUID();
   if(['mesh-lid','mesh-counterpart','mesh-make-solid','mesh-hollow'].includes(operation.type))operation.resultId??=crypto.randomUUID();
  }
  let result;
  if(c.engine==='app'){
   result=runCommonModelTool(current,operation);const checked=await runNative({project:result.project,baseline:current,operation:undefined,signal});result.project=checked.project;
  }else result=c.engine==='mesh'?await runMesh({project:current,operation,signal}):await runNative({project:current,baseline:current,operation,signal});abort(signal);
  locks(before,result.project);
  assertMeshProtectionChange(before,result.project,{reduceTarget:['mesh-reduce','mesh-large-reduce','mesh-remesh','mesh-smooth','mesh-sculpt','mesh-erase-fill'].includes(operation.type)?operation.id:null});
  if(['mesh-lid','mesh-counterpart','mesh-make-solid','mesh-hollow'].includes(operation.type)){
   const globals=p=>JSON.stringify(Object.fromEntries(Object.entries(p).filter(([k])=>k!=='nodes')));
   if(result.project.nodes.length!==before.nodes.length+1||JSON.stringify(result.project.nodes.filter(n=>n.id!==operation.resultId))!==JSON.stringify(before.nodes)||globals(result.project)!==globals(before))invalid('Eine Ergebniskopie muss das ganze Originalprojekt unverändert erhalten.');
  }
  const synchronized=synchronizeMeshWorkplane(result.project,before);current=synchronized.project;
  const ids=result.selectedIds??current.nodes.filter(n=>!before.nodes.some(old=>old.id===n.id)).map(n=>n.id);
  for(const [key,value]of Object.entries(result.aliases??{}))storeAlias(aliases,key,value);
  storeAlias(aliases,c.as,ids.length===1?ids[0]:ids);warnings.push(...(result.warnings??[]),...synchronized.warnings);
  changes.push({op:'tool',engine:c.engine,tool:operation.type??operation.kind,selectedIds:ids});
  reports.push({tool:operation.type==='mesh-lid'?'lid':operation.type==='mesh-counterpart'?'counterpart':operation.type??operation.kind,...result.report,...(conversionReport?{conversion:conversionReport}:{})});
  return {selectedIds:ids,aliases:structuredClone(aliases),report:conversionReport??result.report??null};
 }
 async function scriptCommand(command,previousCommand){
  const c=validateProgramCommand(command),runner=c.op==='python'?runPython:runScript;if(typeof runner!=='function')invalid('Lokale Skriptumgebung ist nicht verfügbar.');let count=0;
  const signature=id=>{const node=current.nodes.find(n=>n.id===id);return node?.kind==='cad'?projectObjectGeometryDigest(node)+':'+JSON.stringify(node.transform):null;},initialRoots=new Map(current.nodes.map(node=>[node.id,signature(node.id)])),issued=new Map();
  function rawReferenceAllowed(id){return !previousCommand&&typeof id==='string'&&initialRoots.has(id)&&initialRoots.get(id)!==null&&initialRoots.get(id)===signature(id);}
  function checkedScriptCommand(input){
   const command=resolveProgramAliases(input,aliases);if(!hasTransientCadReference(command))return command;
   const inner=command.op==='tool'&&command.engine==='cad'&&command.operation?.kind==='tool'?command.operation.options:command, id=inner?.target?.rootId??inner?.target??inner?.id;
   const allowed=command.op==='drill'||command.op==='editDrill'||command.op==='tool'&&command.engine==='cad'&&['previewDrill','previewEditDrill'].includes(command.operation?.name);
   if(!allowed){if(previousCommand||count>1&&(!rawReferenceAllowed(id)||command.op!=='modeling'))rejectStaleCadReferences(command,true);return command;}
   const keys=['reference','positionReference','stopReference'];let verifiedToken=false;
   for(const key of keys){const ref=inner?.[key];if(!ref||typeof ref!=='object')continue;
    let proof;if(typeof ref.token==='string'&&ref.token.startsWith('ai-ref:')){proof=issued.get(ref.token);if(!proof||proof.id!==id||proof.signature!==signature(id))rejectStaleCadReferences(command,true);ref.token=proof.token;verifiedToken=true;}
    else if(('token' in ref||'faceIndex' in ref)&&!rawReferenceAllowed(id))rejectStaleCadReferences(command,true);
    if('faceIndex' in ref&&!rawReferenceAllowed(id)&&(!proof||proof.faceIndex!==ref.faceIndex))rejectStaleCadReferences(command,true);
   }
   if(!verifiedToken&&!rawReferenceAllowed(id))rejectStaleCadReferences(command,true);
   return command;
  }
  const value=await runner({code:c.code,name:c.name,modules:c.modules,signal,timeoutMs:300000,call:async(method,args)=>{
   abort(signal);
   if(method==='model'){const snapshot=cadProjectSnapshot(current);return {...snapshot,objects:snapshot.nodes};}
   if(method==='query'){
    if(!args||!Object.hasOwn(AI_PROGRAM_TOOLS.queries,args.engine)||typeof args.kind!=='string'||typeof query!=='function')invalid('Eine lokale Geometrieabfrage wählen.');
    // fontLibrary mutates worker configuration; provider/desktop IPC is never
    // reachable here. Geometry queries alone are exposed to the sandbox.
    if(!AI_PROGRAM_TOOLS.queries[args.engine].includes(args.kind)&&!(args.engine==='mesh'&&AI_PROGRAM_TOOLS.meshCatalogs.includes(args.kind)))invalid('Unbekannte Modellabfrage.');
    const options=resolveProgramAliases(args.options??{},aliases);let faceToken;
    if(args.engine==='cad'&&args.kind==='faceSketch'&&'faceToken' in options){
     if('faceIndex' in options)invalid('Für die Flächenkopie entweder faceToken oder faceIndex angeben.');faceToken=options.faceToken;const proof=issued.get(faceToken),id=options.nodeId;if(!proof||proof.kind!=='face'||proof.id!==id||proof.signature!==signature(id))rejectStaleCadReferences({reference:{faceIndex:0}},true);options.faceIndex=proof.faceIndex;delete options.faceToken;
    }
    if(args.engine==='cad'&&!faceToken&&('faceIndex' in options||'faceIndices' in options)&&!rawReferenceAllowed(options.nodeId??options.id??options.target))rejectStaleCadReferences({reference:{faceIndex:options.faceIndex??0}},true);
    const result=await query({project:current,engine:args.engine,kind:args.kind,options,signal});
    if(args.engine==='cad'&&args.kind==='rayPick'&&result&&typeof result.objectId==='string'&&Number.isSafeInteger(result.faceIndex)){
     const id=result.objectId,digest=signature(id);if(digest){const token='ai-face:'+crypto.randomUUID();issued.set(token,{kind:'face',id,signature:digest,faceIndex:result.faceIndex});return {...result,faceToken:token};}
    }
    if(faceToken&&result)return {...result,faceToken};
    if(args.engine==='cad'&&args.kind==='referencePoints'&&Array.isArray(result?.points)){
     const id=options.nodeId,digest=signature(id);if(!digest)invalid('Ein eindeutiges natives Teil für die Bezugsabfrage wählen.');
     const wrapped=structuredClone(result);for(const point of wrapped.points)if(typeof point.id==='string'){const token='ai-ref:'+crypto.randomUUID();issued.set(token,{id,signature:digest,token:point.id,faceIndex:point.faceIndex});point.id=token;}return wrapped;
    }
    return result;
   }
   if(method!=='run'||!args||['script','python'].includes(args.op))invalid('Ein Modellierwerkzeug wählen. Verschachtelte Skripte sind nicht nötig.');
   if(++count>2000)invalid('Zu viele Modelloperationen in einer Vorschau.');
   args=checkedScriptCommand(args);
   if(args.op==='tool')return programTool(args);
   const result=await runMixedCadAIBatch({project:current,baseline:current,commands:[args],initialAliases:aliases,runNative,runMesh,query,runScript,runFreeCAD,convertModel,signal});
   const before=current;locks(before,result.project);assertMeshProtectionChange(before,result.project);current=result.project;
   // Native grouping remaps existing aliases to retained source addresses.
   // Keep that complete map between individual calls from the local worker.
   aliases=result.aliases;
   changes.push(...result.changes);warnings.push(...result.warnings);reports.push(...result.report.meshOperations);
   return {aliases:structuredClone(aliases),report:result.report};
  }});abort(signal);reports.push({tool:c.op,name:c.name??'Lokale Modellberechnung',operations:count,result:value??null});
 }
 for(let index=0;index<commands.length;){
  abort(signal);const start=index,command=commands[index];
  try{
   if(['tool','script','python'].includes(command?.op)){
    if(command.op==='tool')await programTool(command);else await scriptCommand(command,start>0);index++;
   }else if(command?.op!=='mesh'){
    const segment=[];while(index<commands.length&&!['mesh','tool','script','python'].includes(commands[index]?.op))segment.push(commands[index++]);
    const before=current,result=await runNative({project:current,baseline:current,operation:{kind:'batch',commands:segment,initialAliases:aliases},signal}),synchronized=synchronizeMeshWorkplane(result.project,before);
    current=synchronized.project;aliases=result.aliases;changes.push(...(result.changes??[]));warnings.push(...(result.warnings??[]),...synchronized.warnings);
   }else{
    const operation=meshOperation(command,aliases,current),before=current,result=await runMesh({project:current,operation,signal});abort(signal);
    if(['lid','counterpart'].includes(command.tool)){
     const globals=p=>JSON.stringify(Object.fromEntries(Object.entries(p).filter(([k])=>k!=='nodes')));
     if(result.project.nodes.length!==before.nodes.length+1||result.project.nodes.filter(n=>n.id===operation.resultId&&n.kind==='mesh').length!==1||JSON.stringify(result.project.nodes.filter(n=>n.id!==operation.resultId))!==JSON.stringify(before.nodes)||globals(result.project)!==globals(before))invalid('Der Deckel darf nur als neues Teil entstehen; das Originalprojekt muss exakt erhalten bleiben.');
    }
    const synchronized=synchronizeMeshWorkplane(result.project,before);current=synchronized.project;warnings.push(...(result.warnings??[]),...synchronized.warnings);
    const ids=result.selectedIds??[];if(command.tool==='group'&&command.name!==undefined){if(ids.length!==1)invalid('Das Netz-Gruppenergebnis ist nicht eindeutig.');current.nodes.find(n=>n.id===ids[0]).name=command.name;}
    if(command.tool==='split'){
     if(ids.length!==2)invalid('Die Teilung benötigt genau zwei gültige Ergebnisse.');storeAlias(aliases,command.asPositive,ids[0]);storeAlias(aliases,command.asNegative,ids[1]);
    }else storeAlias(aliases,command.as,['bodies','dissolve'].includes(command.tool)?ids:ids[0]);
    changes.push({op:'mesh',tool:command.tool,target:command.target??command.as??null,selectedIds:ids});reports.push({commandIndex:index+1,tool:command.tool,...result.report});index++;
   }
   abort(signal);progress?.(index/commands.length*.9);
  }catch(error){
   const localIndex=error.feedback?.commandIndex;error.code??='MESH_ERROR';let target=command?.target;if(typeof target==='string'&&target.startsWith('$'))target=aliases[target.slice(1)]??target;
   error.feedback=aiFeedback(error,{...(localIndex?{commandIndex:start+localIndex}:['mesh','tool','script','python'].includes(command?.op)?{commandIndex:start+1,operation:command.op,target:error.feedback?.target??target}:{} )});throw error;
  }
 }
 abort(signal);current=(await runNative({project:current,baseline:current,operation:undefined,signal})).project;abort(signal);progress?.(1);
 return {project:cadProjectSnapshot(current),aliases,changes,warnings:[...new Set(warnings)],report:{meshOperations:reports}};
}
