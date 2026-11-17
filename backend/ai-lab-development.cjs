const {complete}=require('./ai-lab-review-data.cjs');
const {failureClass}=require('./ai-lab-storage.cjs');

function developmentOutcome(record){
 if(!record)return {status:'open',reason:'not-started'};
 if(!complete(record))return {status:'blocked',reason:'interrupted'};
 if(record.cleanExit!==true||failureClass(record)==='infrastructure')return {status:'blocked',reason:record.error?.code??'infrastructure'};
 if(record.verificationFailure==='checker-error'||record.verification?.checks?.some(check=>check.name==='Native Gegenprüfung ausführbar'&&!check.passed)){
  return {status:'blocked',reason:'checker-error'};
 }
 if(record.modelIdentity?.exactMatch!==true)return {status:'blocked',reason:'model-identity'};
 if(record.status==='needs-input')return {status:'blocked',reason:'needs-input'};
 if(record.status!=='completed'||record.error||typeof record.verification?.passed!=='boolean'){
  return {status:'blocked',reason:record.error?.code??record.verificationSkipped??record.status??'unverified'};
 }
 return {status:record.verification.passed?'passed':'failed'};
}

function escalationCases(caseIds,records){
 const byCase=new Map(records.map(record=>[record.spec.caseId,record]));
 return caseIds.filter(caseId=>developmentOutcome(byCase.get(caseId)).status==='failed');
}

module.exports={developmentOutcome,escalationCases};
