const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createProviderContexts,contextKey}=require('../backend/ai-provider-memory.cjs');
const {createModelingContext}=require('../backend/ai-modeling-context.cjs');
test('provider notes and journals remain isolated and survive reopening, legacy notes stay with DeepSeek',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-context-isolation-'));
 try{const legacy=createModelingContext({directory});legacy.status();fs.writeFileSync(legacy.status().notesFile,'Legacy DeepSeek personal notes');
  for(const model of ['deepseek-flash','gpt-6-astra'])legacy.record({outcome:'rejected',code:'AI_TEST'},{model,appVersion:'1'});
  const old=fs.readFileSync(legacy.status().journalFile),stores=createProviderContexts({directory}),ds=stores.forProvider('https://api.deepseek.com'),gpt=stores.forProvider('chatgpt'),api=stores.forProvider('https://api.openai.com');
  assert.match(ds.context(),/Legacy DeepSeek personal notes/);assert.doesNotMatch(ds.context(),/gpt-6-astra/);assert.doesNotMatch(gpt.context(),/Legacy DeepSeek|deepseek-flash/);assert.doesNotMatch(api.context(),/Legacy DeepSeek/);
  fs.writeFileSync(gpt.status().notesFile,'GPT personal only');gpt.record({outcome:'preview'},{model:'gpt-6-astra',appVersion:'1'});
  assert.doesNotMatch(ds.context(),/GPT personal only/);assert.doesNotMatch(api.context(),/GPT personal only/);assert.match(createProviderContexts({directory}).forProvider('chatgpt').context(),/GPT personal only/);
  assert.deepEqual(fs.readFileSync(legacy.status().journalFile),old);assert.equal(fs.readFileSync(legacy.status().notesFile,'utf8'),'Legacy DeepSeek personal notes');
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('custom providers have stable separate safe folders and reject ambiguous identifiers',()=>{
 assert.notEqual(contextKey('https://a.example'),contextKey('https://b.example'));assert.match(contextKey('http://localhost:1234'),/^Anbieter-[0-9a-f]{24}$/);
 for(const id of ['../../x','https://x.example/path','https://x.example/','file:///tmp','https://user:pass@x.example'])assert.throws(()=>contextKey(id));
});
