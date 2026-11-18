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
test('Kurzzeile zählt ersten Versuch, Prüferhinweis und offene Fälle',async()=>{
 const {developmentSummaryText}=await load();
 const outcomes=[
  {caseId:'advanced-01',status:'blocked',reason:'needs-input'},
  {caseId:'advanced-02',status:'passed',firstTry:false},
  {caseId:'advanced-05',status:'passed',firstTry:false},
  {caseId:'advanced-07',status:'passed',firstTry:true},
  {caseId:'drill',status:'passed',firstTry:true},
 ];
 const report={phases:[{effort:'low',caseIds:outcomes.map(outcome=>outcome.caseId),outcomes}]};
 assert.equal(developmentSummaryText(report),'Bestanden: 2 im ersten Versuch, 2 nach Prüferhinweis, 1 offen');
});
test('Alter Bericht ohne firstTry wird nicht als erster Versuch gezählt',async()=>{
 const {developmentSummaryText}=await load();
 const report={phases:[{effort:'low',caseIds:['drill'],outcomes:[{caseId:'drill',status:'passed'}]}]};
 assert.equal(developmentSummaryText(report),'Bestanden: 0 im ersten Versuch, 0 nach Prüferhinweis, 0 offen · 1 ohne Angabe');
});
test('Eine eskalierte Aufgabe zählt einmal als bestanden',async()=>{
 const {developmentSummaryText}=await load();
 const report={phases:[
  {effort:'low',caseIds:['advanced-02'],outcomes:[{caseId:'advanced-02',status:'failed'}]},
  {effort:'high',caseIds:['advanced-02'],outcomes:[{caseId:'advanced-02',status:'passed',firstTry:true}]},
 ]};
 assert.equal(developmentSummaryText(report),'Bestanden: 1 im ersten Versuch, 0 nach Prüferhinweis, 0 offen');
});
