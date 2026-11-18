export const developmentReasonLabels={
 'needs-input':'Rückfrage des Agenten',
 'checker-error':'Prüferfehler',
 interrupted:'unterbrochen',
 'model-identity':'Modellkennung abweichend',
 'not-started':'nicht gestartet',
};

export function feedbackRounds(record){
 return (record?.events??[])
  .filter(event=>event.type==='practice-ui-feedback'&&event.phase==='native-verification'&&event.verification?.passed===false)
  .map(event=>event.round);
}

export function developmentCases(report){
 const caseIds=report?.phases?.[0]?.caseIds??[];
 return caseIds.map(caseId=>{
  const outcomes=(report?.phases??[]).flatMap(phase=>(phase.outcomes??[]).filter(outcome=>outcome.caseId===caseId));
  return {caseId,outcomes,decisive:outcomes.find(outcome=>outcome.status==='passed')??outcomes.at(-1)??null};
 });
}

export function developmentSummaryText(report){
 const cases=developmentCases(report);
 const passed=cases.filter(entry=>entry.decisive?.status==='passed');
 const first=passed.filter(entry=>entry.decisive.firstTry===true).length;
 const after=passed.filter(entry=>entry.decisive.firstTry===false).length;
 const unknown=passed.filter(entry=>typeof entry.decisive.firstTry!=='boolean').length;
 const open=cases.length-passed.length;
 return 'Bestanden: '+first+' im ersten Versuch, '+after+' nach Prüferhinweis, '+open+' offen'+(unknown?' · '+unknown+' ohne Angabe':'');
}

export function runFacts(record){
 const events=record?.events??[];
 const tokens={input:null,output:null};
 for(const event of events){
  if(event.type!=='usage'||(event.role??'modeler')!=='modeler')continue;
  const usage=event.usage??{};
  if(typeof usage.input_tokens==='number')tokens.input=(tokens.input??0)+usage.input_tokens;
  if(typeof usage.output_tokens==='number')tokens.output=(tokens.output??0)+usage.output_tokens;
 }
 return {
  caseId:record?.spec?.caseId??null,
  runId:record?.id??null,
  effort:record?.spec?.effort??null,
  status:record?.status??null,
  seconds:Number.isFinite(record?.elapsedMs)?Math.round(record.elapsedMs/100)/10:null,
  requests:events.filter(event=>event.type==='request').length,
  tokens,
  failedChecks:(record?.verification?.checks??[]).filter(check=>!check.passed).map(check=>check.name),
 };
}
