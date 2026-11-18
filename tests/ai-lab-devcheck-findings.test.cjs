const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const load=()=>import('../ai/lab-development-findings.mjs');
const fixture=name=>JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures','development-check',name+'.json'),'utf8'));
test('Die deutschen Ergebnisgründe decken alle fünf bekannten Gründe ab',async()=>{
 const {developmentReasonLabels}=await load();
 assert.deepEqual(Object.keys(developmentReasonLabels).sort(),['checker-error','interrupted','model-identity','needs-input','not-started']);
 assert.equal(developmentReasonLabels['needs-input'],'Rückfrage des Agenten');
 assert.equal(developmentReasonLabels['checker-error'],'Prüferfehler');
 assert.equal(developmentReasonLabels.interrupted,'unterbrochen');
 assert.equal(developmentReasonLabels['model-identity'],'Modellkennung abweichend');
 assert.equal(developmentReasonLabels['not-started'],'nicht gestartet');
});
test('Prüferrückmeldungen tragen die Runde der fehlgeschlagenen nativen Prüfung',async()=>{
 const {feedbackRounds}=await load();
 assert.deepEqual(feedbackRounds(fixture('advanced-02')),[1]);
 assert.deepEqual(feedbackRounds(fixture('advanced-05')),[1]);
 assert.deepEqual(feedbackRounds(fixture('drill')),[]);
});
