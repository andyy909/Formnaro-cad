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
