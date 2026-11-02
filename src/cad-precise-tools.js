const id={type:'string',minLength:1,maxLength:200},number={type:'number'},vec={type:'array',minItems:3,maxItems:3,items:number},ids={type:'array',minItems:1,maxItems:500,uniqueItems:true,items:id},bool={type:'boolean'},frame={type:'array',minItems:16,maxItems:16,items:number};
export const CAD_NATIVE_RAY_SCHEMA={type:'object',additionalProperties:false,required:['origin','direction'],properties:{origin:vec,direction:vec,near:{type:'number',minimum:0},far:{type:'number',exclusiveMinimum:0}}};
export const CAD_NATIVE_REFERENCE_SCHEMA={type:'object',additionalProperties:false,properties:{token:{type:'string',pattern:'^(vertex|edge|circle|face):[0-9]{1,5}$'},ray:CAD_NATIVE_RAY_SCHEMA,faceIndex:{type:'integer',minimum:1,maximum:20000}},anyOf:[{required:['token']},{required:['ray']}]};
const ray=CAD_NATIVE_RAY_SCHEMA,reference=CAD_NATIVE_REFERENCE_SCHEMA;
const object=(properties,required)=>({type:'object',additionalProperties:false,properties,required});
export const CAD_PRECISE_TOOL_SCHEMAS={
 previewAlign:object({ids,targetId:id,axis:{enum:[0,1,2]},mode:{enum:['min','center','max']},targetMode:{enum:['min','center','max']},frame},['ids','targetId','axis']),
 previewAnchor:object({id,localPoint:vec,targetPoint:vec},['id','localPoint','targetPoint']),
 previewReferencePlacement:object({id,sourceReference:reference,targetId:id,targetReference:{oneOf:[reference,object({workplane:{type:'array',minItems:2,maxItems:2,items:number}},['workplane'])]},offset:vec},['id','sourceReference','targetReference']),
 previewPlace:object({id,ray,targetIds:ids,localPoint:vec,alignNormal:bool,includeHoles:bool},['id','ray']),
 previewDrill:object({id,scope:{enum:['root','source']},sourcePath:{type:'array',maxItems:12,items:id},reference,kind:{enum:['plain','counterbore','countersink']},through:bool,termination:{const:'plane'},stopReference:reference,diameter:{type:'number',minimum:.1,maximum:1000},depth:{type:'number',minimum:.1,maximum:10000},headDiameter:number,headDepth:{type:'number',exclusiveMinimum:0,maximum:10000},angle:{type:'number',minimum:30,maximum:150},gap:{type:'number',minimum:0,maximum:5},offset:vec,associative:bool,resultId:id},['id','reference'])
};
// This deliberately small schema dialect is used only for the tool definitions
// above. Native geometric and dependency checks still run after this validation.
function matches(value,s){
 if(s.oneOf&&s.oneOf.filter(option=>matches(value,option)).length!==1)return false;if(s.anyOf&&!s.anyOf.some(option=>matches(value,option)))return false;
 if(s.const!==undefined&&value!==s.const||s.enum&&!s.enum.includes(value))return false;
 if(s.type==='object'&&(!value||typeof value!=='object'||Array.isArray(value)))return false;if(s.required&&(!value||typeof value!=='object'||s.required.some(key=>!Object.hasOwn(value,key))))return false;
 if(s.type==='object'){if(s.additionalProperties===false&&Object.keys(value).some(key=>!Object.hasOwn(s.properties,key)))return false;for(const [key,item]of Object.entries(value))if(s.properties[key]&&!matches(item,s.properties[key]))return false;}
 if(s.type==='array'){if(!Array.isArray(value)||s.minItems!==undefined&&value.length<s.minItems||s.maxItems!==undefined&&value.length>s.maxItems||s.uniqueItems&&new Set(value).size!==value.length||value.some(item=>!matches(item,s.items)))return false;}
 if(['number','integer'].includes(s.type)&&(!Number.isFinite(value)||s.type==='integer'&&!Number.isInteger(value)||s.minimum!==undefined&&value<s.minimum||s.maximum!==undefined&&value>s.maximum||s.exclusiveMinimum!==undefined&&value<=s.exclusiveMinimum))return false;
 if(s.type==='string'&&(typeof value!=='string'||s.pattern&&!new RegExp(s.pattern).test(value)||s.minLength!==undefined&&value.length<s.minLength||s.maxLength!==undefined&&value.length>s.maxLength))return false;if(s.type==='boolean'&&typeof value!=='boolean')return false;return true;
}
export function validateCadPreciseTool(name,options){const schema=CAD_PRECISE_TOOL_SCHEMAS[name];if(schema&&!matches(options,schema))throw Object.assign(Error('Ungültige Felder für '+name+'. Befehlsauskunft abrufen und Ziel/Bezug ausdrücklich angeben.'),{code:'INVALID_CAD_TOOL_OPTIONS'});return options;}
