const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createAIUsageLedger,categoryFor}=require('../backend/ai-usage-ledger.cjs'),{contextMetrics}=require('../backend/ai-context-metrics.cjs');
const config={baseUrl:'https://api.deepseek.com',model:'deepseek-flash',authMode:'api-key',reasoningEffort:'low'},usage={inputTokens:1000,outputTokens:20,cachedInputTokens:800,reasoningTokens:12,estimatedCostUSD:{min:.01,max:.02}};
const temporary=fn=>async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-usage-'));try{await fn(dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}};
test('Task categories distinguish editing, STL reconstruction, new models and menu guidance',()=>{
 for(const [prompt,expected]of [['Baue die STL als STEP nach','rebuild'],['Modell nachstellen','rebuild'],['Verschiebe den Halter um 10 mm','edit'],['Erstelle einen neuen Halter','create'],['Wo finde ich den STEP-Export?','help'],['Was bedeutet das?','help'],['Hallo','other']])assert.equal(categoryFor({prompt}),expected,prompt);
 assert.equal(categoryFor({prompt:'Zusammenführen',domain:'converter'}),'rebuild');
 assert.equal(categoryFor({prompt:'Wo finde ich den STL-zu-STEP-Konverter im Menü?'}),'help');
});
test('All correction requests count once, task count stays grouped, reasoning/cache are subsets and prompts never persist',temporary(dir=>{
 const file=path.join(dir,'usage.json'),ledger=createAIUsageLedger({file}),args={prompt:'Baue die STL als CAD nach. PRIVATE_PROMPT',scene:{apiKey:'PRIVATE_KEY'}};
 for(let i=0;i<2;i++)assert(ledger.record({usage,config,provider:'https://api.deepseek.com',taskId:'same-task',args:i?{prompt:'Wo finde ich Export?'}:args}));
 const r=ledger.statistics({}).rows.find(r=>r.category==='rebuild').api;assert.equal(r.requests,2);assert.equal(r.tasks,1);assert.equal(r.inputTokens,2000);assert.equal(r.outputTokens,40);assert.equal(r.reasoningTokens,24);assert.equal(r.costMaxUSD,.04);assert.doesNotMatch(fs.readFileSync(file,'utf8'),/PRIVATE_|prompt|scene|taskId/);
 assert.equal(createAIUsageLedger({file}).statistics({}).rows.find(r=>r.category==='rebuild').api.requests,2);
}));
test('Unknown usage/prices remain disclosed, failed provider output with usage is counted',temporary(dir=>{
 const ledger=createAIUsageLedger({file:path.join(dir,'usage.json')});ledger.record({usage,config,provider:'x',args:{}});ledger.record({usage:undefined,config,provider:'x',args:{}});
 const r=ledger.statistics({}).rows.find(r=>r.category==='other').api;assert.equal(r.requests,2);assert.equal(r.inputTokens,1000);assert.equal(r.inputMissing,1);assert.equal(r.unpricedRequests,1);assert.equal(r.pricedRequests,1);
}));
test('Provider, subscription and time filters preserve separate cost meanings',temporary(dir=>{
 let time=new Date('2026-10-01T12:00:00Z');const ledger=createAIUsageLedger({file:path.join(dir,'usage.json'),now:()=>new Date(time)});
 ledger.record({usage,config,provider:'deepseek',taskId:'one',args:{prompt:'Erstelle Modell'}});time=new Date('2026-10-26T12:00:00Z');ledger.record({usage,config:{...config,authMode:'chatgpt'},provider:'chatgpt',taskId:'one',args:{prompt:'Wo ist das Menü?'}});
 const filtered=ledger.statistics({period:'today',provider:'chatgpt'});assert.equal(filtered.rows.find(r=>r.category==='help').subscription.requests,1);assert.equal(filtered.rows.find(r=>r.category==='create').api.requests,0);assert.equal(ledger.statistics({period:'all'}).rows.find(r=>r.category==='create').api.requests,1);
}));
test('Corrupt files and write errors never erase existing statistics or fail the AI response',temporary(dir=>{
 const file=path.join(dir,'usage.json');fs.writeFileSync(file,'preserve me');const bad=createAIUsageLedger({file});assert.equal(bad.record({usage,config,provider:'x',args:{}}),false);assert.equal(bad.statistics({}).available,false);assert.equal(fs.readFileSync(file,'utf8'),'preserve me');
 const failed=createAIUsageLedger({file:path.join(dir,'no.json'),write:()=>{throw Error('disk');}});assert.equal(failed.record({usage,config,provider:'x',args:{}}),false);assert.match(failed.statistics({}).warning,/nicht gespeichert/);
}));
test('Context metrics count actual compact input once, UTF-8 file bytes, unknown files and uncached input prices without any provider call',temporary(dir=>{
 fs.writeFileSync(path.join(dir,'OfflineCAD-KI-Kontext.json'),'ä'.repeat(10));fs.writeFileSync(path.join(dir,'AI-CONTEXT.txt'),'abc');const notes=path.join(dir,'notes.md');fs.writeFileSync(notes,'Hinweise');
 const schema={allTools:'UNIQUE_SCHEMA'},context={commandSchema:schema,requestSchema:schema},modeling={status:()=>({notesFile:notes,journalFile:path.join(dir,'journal.json')}),context:()=> 'Loaded notes'};
 const m=contextMetrics({context,config,modeling,bundledDirectory:dir});assert.equal(m.files[0].bytes,20);assert.equal(m.files.find(f=>f.id==='journal').bytes,0);assert(m.files.find(f=>f.id==='journal').missing);assert.equal(m.components[0].characters,JSON.stringify({...context,requestSchema:{$ref:'#/commandSchema'}}).length);assert(m.total.estimatedInputCostUSD.max>0);assert.equal(m.tokenEstimateMethod,'characters/4');assert.equal(context.requestSchema,schema);assert.equal(m.total.bytes,m.components.reduce((s,r)=>s+r.bytes,0));
}));
