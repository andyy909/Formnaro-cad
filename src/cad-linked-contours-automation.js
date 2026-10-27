import {CAD_CONTOUR_ROLES,createCadContourLinks,validateCadContourLinks,validateCadContourTarget,planCadContourLinks} from './cad-linked-contours-data.js';
import {SKETCH_PROFILE_SCHEMA} from './sketch-profile-schema.js';
import {resolveCadSketch} from './cad-sketch.js';

const fail=(message,code='INVALID_CONTOUR_COMMAND')=>{throw Object.assign(Error('Konturverknüpfung: '+message),{code});};
const id={type:'string',minLength:1,maxLength:200},target={type:'object',additionalProperties:false,required:['rootId','path'],properties:{rootId:id,path:{type:'array',maxItems:12,items:id}}};
const selector={oneOf:[{type:'object',additionalProperties:false,required:['kind','role'],properties:{kind:{const:'native-role'},role:{enum:CAD_CONTOUR_ROLES}}},{type:'object',additionalProperties:false,required:['kind','faceKey'],properties:{kind:{const:'step-exact'},faceKey:{type:'string',pattern:'^[a-f0-9]{64}$'}}}]};
const ids={type:'array',minItems:1,maxItems:500,uniqueItems:true,items:id},edits={type:'array',maxItems:500,items:{type:'object',additionalProperties:false,required:['target','sketch'],properties:{target,sketch:SKETCH_PROFILE_SCHEMA}}};
export const CAD_CONTOUR_COMMAND_SCHEMAS=Object.entries({
 create:{required:['source','selector'],properties:{source:target,selector,name:id,height:{type:'number',minimum:.01,maximum:10000},targetSketch:SKETCH_PROFILE_SCHEMA}},
 update:{required:[],properties:{ids,edits}},
 rebind:{required:['id','source','selector'],properties:{id,source:target,selector,edits}},
 unlink:{required:['ids'],properties:{ids}}
}).map(([action,spec])=>({type:'object',additionalProperties:false,required:['op','action',...spec.required],properties:{op:{const:'contour'},action:{const:action},...spec.properties}}));

export function validateCadContourRequest(value){
 const schema=CAD_CONTOUR_COMMAND_SCHEMAS.find(schema=>schema.properties.action.const===value?.action),validId=value=>typeof value==='string'&&value.trim().length>0&&value.length<=200&&!/[\x00-\x1f]/.test(value),plain=value=>value&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
 if(!schema||!plain(value)||Object.keys(value).some(key=>key==='op'||!Object.hasOwn(schema.properties,key))||schema.required.filter(key=>key!=='op').some(key=>!Object.hasOwn(value,key)))fail('Ungültige oder gemischte Konturaktion.');
 const request=structuredClone(value),provided=key=>Object.hasOwn(request,key),sketch=value=>{if(!value||value.version!==2)fail('Eine vollständige Konturskizze der Version 2 erforderlich.');return resolveCadSketch(value).sketch;};
 if(provided('source')){request.source=validateCadContourTarget(request.source);validateCadContourLinks({version:1,links:[{id:'validate-only',source:request.source,target:{rootId:request.source.rootId==='validate-target'?'validate-other':'validate-target',path:[]},selector:request.selector}]});}
 if(provided('ids')&&(!Array.isArray(request.ids)||!request.ids.length||request.ids.length>500||new Set(request.ids).size!==request.ids.length||request.ids.some(value=>!validId(value))))fail('Vorhandene eindeutige Konturkennungen erforderlich.');
 if(provided('id')&&!validId(request.id))fail('Vorhandene Konturkennung erforderlich.');
 if(provided('name')&&!validId(request.name))fail('Einen Namen mit 1 bis 200 Zeichen wählen.');
 if(provided('height')&&(typeof request.height!=='number'||!Number.isFinite(request.height)||request.height<.01||request.height>10000))fail('Eine Höhe zwischen 0,01 und 10000 mm wählen.');
 if(provided('targetSketch'))request.targetSketch=sketch(request.targetSketch);
 if(provided('edits')){if(!Array.isArray(request.edits)||request.edits.length>500)fail('Höchstens 500 unterschiedliche verknüpfte Höhen bearbeiten.');const seen=new Set();request.edits=request.edits.map(edit=>{if(!plain(edit)||Object.keys(edit).some(key=>!['target','sketch'].includes(key)))fail('Ziel und vollständige Konturskizze als Höhenänderung angeben.');const target=validateCadContourTarget(edit.target),key=JSON.stringify(target);if(seen.has(key))fail('Ein Höhenziel nur einmal ändern.');seen.add(key);return {target,sketch:sketch(edit.sketch)};});}
 return request;
}
export function validateCadContourCommands(commands){
 if(!Array.isArray(commands)||commands.length!==1)fail('Genau eine Konturaktion pro Vorschau senden; update.ids kann mehrere Verknüpfungen gesammelt aktualisieren.');
 const command=commands[0];if(!command||Object.getPrototypeOf(command)!==Object.prototype||command.op!=='contour')fail('Ungültige oder gemischte Konturaktion.');const request={...command};delete request.op;return validateCadContourRequest(request);
}
export async function previewCadContourCommands(controller,{commands,revision,label='Verknüpfte Konturen ändern'}={}){const request=validateCadContourCommands(commands);if(controller.revision()!==revision)fail('Modell wurde geändert.','STALE_REVISION');return controller.previewContourLinks(request,{revision,label});}

export function cadContourLinksSummary(project,options={}){
 if(!options||Object.getPrototypeOf(options)!==Object.prototype||Object.keys(options).some(key=>!['offset','limit'].includes(key))||!Number.isSafeInteger(options.offset??0)||(options.offset??0)<0||(options.offset??0)>1000000||!Number.isInteger(options.limit??32)||(options.limit??32)<1||(options.limit??32)>100)fail('Berichtsseite mit offset ab 0 und limit 1 bis 100 wählen.');
 const data=validateCadContourLinks(project.contourLinks??createCadContourLinks()),plan=planCadContourLinks(project,data),issues=[...plan.problems,...(plan.staleProblems??[])],offset=options.offset??0,limit=options.limit??32,summary={version:1,exists:project.contourLinks!==undefined,total:data.links.length,offset,returned:0,nextOffset:null,links:[],problemCount:issues.length,graphProblems:plan.problems.filter(problem=>!problem.linkId).slice(0,4),truncated:false,limits:{bytes:64000,links:100,problemsPerLink:8}};
 for(const link of data.links.slice(offset,offset+limit)){const problems=issues.filter(problem=>problem.linkId===link.id);const row={id:link.id,source:link.source,target:link.target,selector:link.selector,status:problems.some(problem=>problem.code!=='CONTOUR_UPDATE_REQUIRED')?'blocked':problems.length?'update-required':'current',problemCount:problems.length,problems:problems.slice(0,8),hasSnapshot:!!link.snapshot,...(link.snapshot?{sourceBrepSignature:link.snapshot.sourceBrepSignature,elementCount:link.snapshot.elementMap.length}:{})};summary.links.push(row);if(new TextEncoder().encode(JSON.stringify(summary)).length>63000){summary.links.pop();break;}if(problems.length>8)summary.truncated=true;}
 summary.returned=summary.links.length;summary.nextOffset=offset+summary.returned<data.links.length?offset+summary.returned:null;summary.truncated||=offset>0||summary.nextOffset!==null;return summary;
}
