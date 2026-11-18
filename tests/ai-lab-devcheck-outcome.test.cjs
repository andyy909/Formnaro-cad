const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const fixture=name=>JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures','development-check',name+'.json'),'utf8'));
const load=()=>import('../ai/lab-development-sequence.mjs');
test('Rückfrage des Agenten wird als needs-input eingeordnet, nicht als Prüferfehler',async()=>{
 const {developmentOutcome}=await load();
 const outcome=developmentOutcome(fixture('advanced-01'));
 assert.equal(outcome.status,'blocked');
 assert.equal(outcome.reason,'needs-input');
});
test('Ein echter Prüferfehler bleibt Prüferfehler',async()=>{
 const {developmentOutcome}=await load();
 const record={status:'completed',cleanExit:true,modelIdentity:{requested:'deepseek-flash',returned:'deepseek-flash',exactMatch:true},verificationFailure:'checker-error',verification:{passed:false,checks:[]},events:[{type:'finished'}]};
 const outcome=developmentOutcome(record);
 assert.equal(outcome.status,'blocked');
 assert.equal(outcome.reason,'checker-error');
});
test('Der glatte Erfolg bleibt bestanden',async()=>{
 const {developmentOutcome}=await load();
 const outcome=developmentOutcome(fixture('drill'));
 assert.equal(outcome.status,'passed');
});
test('Erfolg im ersten Versuch wird von Erfolg nach Prüferhinweis unterschieden',async()=>{
 const {developmentOutcome}=await load();
 assert.equal(developmentOutcome(fixture('advanced-02')).firstTry,false);
 assert.equal(developmentOutcome(fixture('drill')).firstTry,true);
});
