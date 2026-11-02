const test=require('node:test'),assert=require('node:assert/strict');
const {providerContext}=require('../backend/ai-provider-context.cjs');
const {isDeepStrictEqual}=require('node:util');
function expand(value,definitions,root=value){
 if(value&&typeof value==='object'&&Object.keys(value).length===1&&value.$ref==='#/commandSchema')return expand(root.commandSchema,definitions,root);
 if(value&&typeof value==='object'&&Object.keys(value).length===1&&typeof value.$ref==='string'&&value.$ref.startsWith('#/providerDefinitions/'))return expand(definitions[value.$ref.split('/').at(-1)],definitions,root);
 return Array.isArray(value)?value.map(v=>expand(v,definitions,root)):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,expand(v,definitions,root)])):value;
}
test('provider dictionary round-trips the entire real contract without dropping commands, limits or policy',async()=>{
 const {cadAIContext}=await import('../src/cad-ai-context.js'),context=cadAIContext(),original=JSON.stringify(context),packed=providerContext(context),{providerDefinitions,providerEncoding,...encoded}=packed;
 assert(providerDefinitions);assert.match(providerEncoding,/No command/);const expanded=expand(encoded,providerDefinitions);
 assert.ok(isDeepStrictEqual(expanded,JSON.parse(original)),'Every original contract field must survive expansion');assert.equal(JSON.stringify(context),original);
 const previous=original.length;
 assert(JSON.stringify(packed).length<previous*.6);assert.deepEqual(providerContext(packed),packed);
});
test('identical schemas share one alias while distinct request-only fields remain lossless',()=>{
 const schema={type:'object',properties:{commands:{type:'array',items:{description:'same repeated command description '.repeat(8)}}}};
 const original={commandSchema:schema,requestSchema:structuredClone(schema)},packed=providerContext(original),{providerDefinitions,providerEncoding,...encoded}=packed;
 assert.equal(packed.requestSchema.$ref,'#/commandSchema');assert.deepEqual(expand(encoded,providerDefinitions??{}),original);
 const different={commandSchema:schema,requestSchema:{...schema,additionalProperties:false}};
 const result=providerContext(different),{providerDefinitions:defs,providerEncoding:encoding,...body}=result;
 assert.deepEqual(expand(body,defs??{}),different);
});
test('small and navigation-only contexts remain lossless and are not inflated',()=>{
 for(const value of [null,{version:1},{programHelpOnly:true,programAssistant:{reply:'Use menu targets.'}}])assert.deepEqual(providerContext(value),value);
});
