import {validateCadLoadSet} from './cad-assembly-display.js';
export const CAD_ASSEMBLY_DISPLAY_SCHEMA={type:'object',additionalProperties:false,required:['action'],properties:{action:{enum:['state','only','load','all']},revision:{type:'string',minLength:1,maxLength:200},ids:{type:'array',minItems:1,maxItems:500,uniqueItems:true,items:{type:'string',minLength:1,maxLength:200}}},allOf:[{if:{properties:{action:{enum:['only','load']}},required:['action']},then:{required:['revision','ids']}},{if:{properties:{action:{const:'all'}},required:['action']},then:{required:['revision'],not:{required:['ids']}}},{if:{properties:{action:{const:'state'}},required:['action']},then:{not:{anyOf:[{required:['ids']},{required:['revision']}]}}}]};
export function validateCadAssemblyRequest(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Object.keys(value).some(k=>!['action','revision','ids'].includes(k))||!['state','only','load','all'].includes(value.action))throw Error('Ungültiger Baugruppen-Anzeigebefehl.');
 if(value.action==='state'){if(Object.keys(value).length!==1)throw Error('Die Zustandsabfrage benötigt nur action:state.');return {action:'state'};}
 if(typeof value.revision!=='string'||!value.revision||value.revision.length>200)throw Error('Aktuelle Modellrevision für die Baugruppenanzeige erforderlich.');
 if(value.action==='all'){if(value.ids!==undefined)throw Error('Alles darstellen benötigt keine Teilauswahl.');return {action:'all',revision:value.revision};}
 const ids=validateCadLoadSet(value.ids);if(!ids?.length)throw Error('Mindestens ein Teil für die Baugruppenanzeige wählen.');return {action:value.action,revision:value.revision,ids};
}
