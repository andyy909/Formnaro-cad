// Lossless provider-only dictionary: repeated contract structures travel once.
// Public MCP/API data and executable command validation stay unchanged.
function providerContext(context){
 if(!context||typeof context!=='object'||Array.isArray(context)||context.providerDefinitions)return context;
 const input=context.commandSchema&&context.requestSchema&&JSON.stringify(context.commandSchema)===JSON.stringify(context.requestSchema)?{...context,requestSchema:{$ref:'#/commandSchema'}}:context;
 const counts=new Map(),keys=new WeakMap();
 function count(value){if(!value||typeof value!=='object')return;const key=JSON.stringify(value);keys.set(value,key);if(key.length>=120)counts.set(key,(counts.get(key)??0)+1);for(const child of Object.values(value))count(child);}
 count(input);const definitions={},known=new Map();let index=0;
 function pack(value,root=false){
  if(!value||typeof value!=='object')return value;const key=keys.get(value),shared=!root&&(counts.get(key)??0)>1;
  if(shared&&known.has(key))return {$ref:'#/providerDefinitions/'+known.get(key)};
  const packed=Array.isArray(value)?value.map(v=>pack(v)):Object.fromEntries(Object.entries(value).map(([k,v])=>[k,pack(v)]));
  if(!shared)return packed;const id='d'+(++index);known.set(key,id);definitions[id]=packed;return {$ref:'#/providerDefinitions/'+id};
 }
 const packed=pack(input,true);if(!index)return input;
 const result={...packed,providerDefinitions:definitions,providerEncoding:'Repeated contract structures are defined once in providerDefinitions. A {$ref:"#/providerDefinitions/dN"} means use that complete definition at this location, including arrays. Expand references recursively when reading command schemas. No command, parameter, rule or limit is omitted.'};
 return JSON.stringify(result).length<JSON.stringify(input).length?result:input;
}
module.exports={providerContext};
