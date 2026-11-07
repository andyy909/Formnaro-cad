// Validation for the JSON-schema dialect actually published by Formnaro.
// Geometry, source ownership and native capability are checked separately.
function matches(v,s){
 if(s===true)return true;if(s===false)return false;
 if(s.oneOf&&s.oneOf.filter(x=>matches(v,x)).length!==1||s.anyOf&&!s.anyOf.some(x=>matches(v,x))||s.allOf&&!s.allOf.every(x=>matches(v,x))||s.not&&matches(v,s.not))return false;
 if(s.if&&matches(v,s.if)&&s.then&&!matches(v,s.then))return false;
 if(Object.hasOwn(s,'const')&&JSON.stringify(v)!==JSON.stringify(s.const)||s.enum&&!s.enum.some(x=>JSON.stringify(x)===JSON.stringify(v)))return false;
 const types=Array.isArray(s.type)?s.type:s.type?[s.type]:[];
 const type=t=>t==='null'?v===null:t==='array'?Array.isArray(v):t==='object'?v!==null&&typeof v==='object'&&!Array.isArray(v):t==='integer'?Number.isSafeInteger(v):t==='number'?typeof v==='number'&&Number.isFinite(v):typeof v===t;
 if(types.length&&!types.some(type))return false;
 if(v&&typeof v==='object'&&!Array.isArray(v)){
  const keys=Object.keys(v);if(s.required?.some(k=>!Object.hasOwn(v,k))||s.minProperties!==undefined&&keys.length<s.minProperties||s.maxProperties!==undefined&&keys.length>s.maxProperties)return false;
  for(const [key,needs]of Object.entries(s.dependentRequired??{}))if(Object.hasOwn(v,key)&&needs.some(k=>!Object.hasOwn(v,k)))return false;
  for(const k of keys){if(Object.hasOwn(s.properties??{},k)){if(!matches(v[k],s.properties[k]))return false;}else if(s.additionalProperties===false)return false;else if(s.additionalProperties&&typeof s.additionalProperties==='object'&&!matches(v[k],s.additionalProperties))return false;}
 }
 if(Array.isArray(v)&&(s.minItems!==undefined&&v.length<s.minItems||s.maxItems!==undefined&&v.length>s.maxItems||s.uniqueItems&&new Set(v.map(x=>JSON.stringify(x))).size!==v.length||s.items&&v.some(x=>!matches(x,s.items))||s.contains&&!v.some(x=>matches(x,s.contains))))return false;
 if(typeof v==='string'&&(s.minLength!==undefined&&v.length<s.minLength||s.maxLength!==undefined&&v.length>s.maxLength||s.pattern&&!new RegExp(s.pattern).test(v)))return false;
 if(typeof v==='number'&&(s.minimum!==undefined&&v<s.minimum||s.maximum!==undefined&&v>s.maximum||s.exclusiveMinimum!==undefined&&v<=s.exclusiveMinimum))return false;
 return true;
}
async function validateProposal(args,revision,context){if(!context?.requestSchema||!Array.isArray(context.shapes))throw Error('Aktuelles Validierungsschema fehlt.');let valid=args.revision===revision&&matches(args,context.requestSchema);
 for(const command of args.commands??[])if(command.op==='create'&&command.params){const shape=context.shapes.find(s=>s.type===command.type);for(const [key,value]of Object.entries(command.params)){const field=shape?.parameters.find(p=>p.key===key);if(!field||field.options&&!field.options.some(o=>o[0]===value)||field.min!==undefined&&value<field.min||field.max!==undefined&&value>field.max)valid=false;}}return {valid,scope:'Aktuelle veröffentlichte Felder, Typen und Grenzen; keine Geometrieberechnung.'};}
module.exports={matches,validateProposal};
