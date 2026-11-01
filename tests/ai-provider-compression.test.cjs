const test=require('node:test'),assert=require('node:assert/strict');
const {providerContext}=require('../backend/ai-provider-context.cjs');
function expand(value,definitions){
 if(value&&typeof value==='object'&&Object.keys(value).length===1&&typeof value.$ref==='string'&&value.$ref.startsWith('#/providerDefinitions/'))return expand(definitions[value.$ref.split('/').at(-1)],definitions);
 return Array.isArray(value)?value.map(v=>expand(v,definitions)):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,expand(v,definitions)])):value;
}
test('provider dictionary round-trips the entire real contract without dropping commands, limits or policy',async()=>{
 const {cadAIContext}=await import('../src/cad-ai-context.js'),context=cadAIContext(),original=JSON.stringify(context),packed=providerContext(context),{providerDefinitions,providerEncoding,...encoded}=packed;
 assert(providerDefinitions);assert.match(providerEncoding,/No command/);const expanded=expand(encoded,providerDefinitions);
 assert.deepEqual(expanded,{...JSON.parse(original),requestSchema:{$ref:'#/commandSchema'}});assert.equal(JSON.stringify(context),original);
 const previous=JSON.stringify({...context,requestSchema:{$ref:'#/commandSchema'}}).length;
 assert(JSON.stringify(packed).length<previous*.6);assert.deepEqual(providerContext(packed),packed);
});
test('small and navigation-only contexts remain lossless and are not inflated',()=>{
 for(const value of [null,{version:1},{programHelpOnly:true,programAssistant:{reply:'Use menu targets.'}}])assert.deepEqual(providerContext(value),value);
});
