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
