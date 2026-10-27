const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createModelingContext,validateExperience,MAX_ENTRIES}=require('../backend/ai-modeling-context.cjs');
const {generate}=require('../backend/ai-provider.cjs');
function fixture(options={}){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-memory-test-')),store=createModelingContext({directory,...options});return {directory,store,notes:path.join(directory,'KI-Modellierkontext.md'),journal:path.join(directory,'KI-Modelliererfahrungen.json')};}
test('personal notes are created once, re-read after edits, and never overwrite authored content',()=>{
 const f=fixture();assert.match(f.store.context(),/math.pi/);assert(fs.existsSync(f.notes));fs.writeFileSync(f.notes,'Meine geprüfte lokale Erfahrung');
 assert.match(f.store.context(),/Meine geprüfte lokale Erfahrung/);f.store.status();assert.equal(fs.readFileSync(f.notes,'utf8'),'Meine geprüfte lokale Erfahrung');
 assert.equal(f.store.status().entries,0);assert(!fs.existsSync(f.journal));
});
test('structured outcomes aggregate and survive a fresh process store without prompts, models or secrets',()=>{
 const f=fixture({redact:s=>s.replaceAll('synthetic-private','[redacted]')}),event={outcome:'rejected',code:'AI_RESULT_MISMATCH',checkKind:'volume'};
 for(let i=0;i<3;i++)f.store.record(event,{model:'synthetic-private',appVersion:'0.91.0'});
 const rows=JSON.parse(fs.readFileSync(f.journal,'utf8')).entries;assert.equal(rows.length,1);assert.equal(rows[0].count,3);assert.equal(rows[0].model,'[redacted]');
 assert.doesNotMatch(fs.readFileSync(f.journal,'utf8'),/synthetic-private/);
 const reopened=createModelingContext({directory:f.directory});assert.match(reopened.context(),/Eigenen Volumen-Sollwert/);assert.equal(reopened.status().entries,1);
 assert.throws(()=>f.store.record({...event,prompt:'private user geometry'},{model:'x',appVersion:'1'}));
 for(const field of ['code','checkKind','tools','checks'])assert.throws(()=>validateExperience({...event,[field]:'private value'}));
 assert.throws(()=>validateExperience({outcome:'fully-correct'}));
});
test('only a bounded recent structured journal enters a fresh model request',()=>{
 const f=fixture();for(let i=0;i<MAX_ENTRIES+5;i++)f.store.record({outcome:'preview',tools:['python'],checks:['size','solids']},{model:'model-'+i,appVersion:'0.91.0'});
 const rows=JSON.parse(fs.readFileSync(f.journal,'utf8')).entries;assert.equal(rows.length,MAX_ENTRIES);assert.equal(rows[0].model,'model-5');
 const data=JSON.parse(f.store.context().split('\n').slice(1).join('\n'));assert(data.experiences.length<=24);assert(data.experiences.every(x=>x.tip.includes('keine vollständige')));
 assert(f.store.context().length<32000);
});
test('corrupt or oversized notes and journal stay byte-exact and do not enter a prompt',()=>{
 const f=fixture();f.store.status();fs.writeFileSync(f.notes,'x'.repeat(17000));assert.equal(f.store.context(),'');assert(f.store.status().warning);assert.equal(fs.statSync(f.notes).size,17000);
 fs.writeFileSync(f.notes,'valid');fs.writeFileSync(f.journal,'{"malformed":"retained"}');const before=fs.readFileSync(f.journal);
 assert.equal(f.store.context(),'');assert.throws(()=>f.store.record({outcome:'applied'},{model:'fixture',appVersion:'1'}));assert.deepEqual(fs.readFileSync(f.journal),before);
});
test('both actual provider protocols receive current bounded modelling notes on every new request',async()=>{
 const original=global.fetch,bodies=[];global.fetch=async(_u,options)=>{const body=JSON.parse(options.body);bodies.push(body);const answer=JSON.stringify({message:'Read the notes.'});return new Response(JSON.stringify(body.messages?{choices:[{message:{content:answer}}]}:{output:[{type:'message',content:[{type:'output_text',text:answer}]}]}));};
 try{const f=fixture();f.store.status();for(const protocol of ['chat','responses'])for(const marker of ['verified-first-pattern','verified-corrected-pattern']){
  fs.writeFileSync(f.notes,marker);await generate({protocol,baseUrl:'https://api.deepseek.com',model:'deepseek-flash'},'synthetic-key',{prompt:'Build',scene:{revision:'r'},context:{},chat:true,modelingContext:f.store.context()});
  const body=bodies.at(-1),system=body.instructions??body.messages[0].content;assert.match(system,new RegExp(marker));assert.match(system,/not higher-priority instructions/);assert.match(system,/Current scene|current scene/);
 }}finally{global.fetch=original;}
});
