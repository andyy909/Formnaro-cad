// Read-only summaries for the model picker. Never returns plans, prompts or paths.
const reference=require('../ai/model-benchmarks.json');
const suite=require('../ai/benchmark-core-v1.json');
function benchmarkCatalog(summaries=[]){
 const entries=structuredClone(reference.entries);
 for(const s of summaries){
  const modeler=s.plan?.roles?.modeler;
  if(!modeler?.model||!modeler.providerId||modeler.providerId==='current'||!s.finished)continue;
  entries.push({id:'local:'+s.id,kind:'benchmark',scope:'all',providerId:modeler.providerId,model:modeler.model,modelName:modeler.model,
   label:s.suite.suiteId==='formnaro-practice-advanced'?'Formnaro Aufbaubenchmark':'Formnaro Grundbenchmark',labelEn:s.suite.suiteId==='formnaro-practice-advanced'?'Formnaro advanced benchmark':'Formnaro core benchmark',date:s.createdAt?.slice(0,10),createdAt:s.createdAt,effort:s.plan.efforts?.[0]??modeler.effort,
   suiteVersion:s.suite.suiteVersion,suiteHash:s.suite.suiteHash,status:s.status,passed:s.passed,total:s.planned,finished:s.finished,
   rawAttempts:s.rawAttempts,byOutcome:{...s.byOutcome},medianSuccessfulMs:s.medianSuccessfulMs,
   monitor:s.plan.monitor?.mode??'off',sourceVersion:s.source?.programVersion??'',sourceHash:s.source?.asarSHA256||s.source?.hash||'',origin:'local',
   note:s.limitations,noteEn:'Known development tasks, two repeats. Unverified results are not confirmed successes. All planned conditions stay in the denominator.'});
 }
 return {version:1,entries,suite:{id:suite.id,version:suite.version,planned:16}};
}
module.exports={benchmarkCatalog};
