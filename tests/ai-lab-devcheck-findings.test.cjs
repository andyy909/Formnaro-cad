const {test}=require('node:test'),assert=require('node:assert/strict');
const load=()=>import('../ai/lab-development-findings.mjs');
test('Die deutschen Ergebnisgründe decken alle fünf bekannten Gründe ab',async()=>{
 const {developmentReasonLabels}=await load();
 assert.deepEqual(Object.keys(developmentReasonLabels).sort(),['checker-error','interrupted','model-identity','needs-input','not-started']);
 assert.equal(developmentReasonLabels['needs-input'],'Rückfrage des Agenten');
 assert.equal(developmentReasonLabels['checker-error'],'Prüferfehler');
 assert.equal(developmentReasonLabels.interrupted,'unterbrochen');
 assert.equal(developmentReasonLabels['model-identity'],'Modellkennung abweichend');
 assert.equal(developmentReasonLabels['not-started'],'nicht gestartet');
});
