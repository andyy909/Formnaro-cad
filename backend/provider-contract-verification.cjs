// External acceptance fixtures read the same lossless dictionary as a provider.
// Ordinary JSON Schema references are retained; only wire dictionary entries expand.
exports.readVerificationContract=function(system){
 const line=system.split('Contract:\n').at(-1).split('\n',1)[0];
 const wire=JSON.parse(line),cache=new Map(),active=new Set();
 function expand(value){
  if(!value||typeof value!=='object')return value;
  if(typeof value.$ref==='string'&&value.$ref.startsWith('#/providerDefinitions/')){
   const key=value.$ref.slice('#/providerDefinitions/'.length);
   if(!/^d\d+$/.test(key)||!Object.hasOwn(wire.providerDefinitions??{},key))throw Error('Missing provider definition: '+key);
   if(active.has(key))throw Error('Cyclic provider definition: '+key);
   if(cache.has(key))return cache.get(key);
   active.add(key);const result=expand(wire.providerDefinitions[key]);active.delete(key);cache.set(key,result);return result;
  }
  return Array.isArray(value)?value.map(expand):Object.fromEntries(Object.entries(value).map(([key,child])=>[key,expand(child)]));
 }
 const {providerDefinitions,...body}=wire;
 return {wire,contract:expand(body)};
};
