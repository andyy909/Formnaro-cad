const median=values=>{const v=values.filter(Number.isFinite).sort((a,b)=>a-b);return v.length?(v[Math.floor((v.length-1)/2)]+v[Math.ceil((v.length-1)/2)])/2:null;};
export function summarizeLab(records){
 const groups=new Map(),warnings=[];
 const rows=records.filter(r=>r.spec?.experiment==='lab');
 for(const r of rows){
  const key=[r.spec.seriesId,r.sourceHash,r.spec.dataset,r.spec.variant,r.spec.effort,r.spec.workflow,r.spec.sceneScope,r.spec.imageMode,r.spec.stage].join('|');
  if(!groups.has(key))groups.set(key,{key,seriesId:r.spec.seriesId,sourceHash:r.sourceHash,dataset:r.spec.dataset,variant:r.spec.variant,effort:r.spec.effort,workflow:r.spec.workflow,sceneScope:r.spec.sceneScope,imageMode:r.spec.imageMode,stage:r.spec.stage,rows:[]});
  groups.get(key).rows.push(r);
 }
 const results=[...groups.values()].map(({rows,...group})=>{
  const completed=rows.filter(r=>r.status!=='running'),native=completed.filter(r=>r.verification),passed=native.filter(r=>r.verification.passed),judged=completed.filter(r=>r.monitor),shadow=judged.filter(r=>r.spec.monitor?.mode==='shadow'),stops=shadow.filter(r=>(r.monitor.judgments??[r.monitor]).some(j=>j.verdict==='stop')),known=stops.filter(r=>r.verification),falseStops=known.filter(r=>r.verification.passed),correctStops=known.filter(r=>!r.verification.passed),tasks=new Map();
  for(const r of completed){const id=r.spec.caseId;if(!tasks.has(id))tasks.set(id,[]);tasks.get(id).push(r);}
  const repeated=[...tasks.values()].filter(v=>v.length>=2&&v.length===(v[0].spec.plannedRepeats??v.length));
  return {...group,preparationErrors:completed.filter(r=>r.failurePhase==='preparation'||r.status==='failed'&&(r.requestCount??r.events?.filter(e=>e.type==='request').length)===0).length,trials:rows.length,finished:completed.length,checked:native.length,nativePassed:passed.length,schemaValid:completed.filter(r=>r.proposedValid).length,relevantProposals:completed.filter(r=>r.proposedValid&&r.toolChoice?.appropriate).length,medianMs:median(completed.map(r=>r.elapsedMs)),medianSuccessfulMs:median(passed.map(r=>r.elapsedMs)),medianPreviewMs:median(completed.map(r=>r.firstValidPreviewMs)),formatRepairs:completed.reduce((n,r)=>n+(r.formatCorrections??0),0),timeouts:completed.filter(r=>r.status==='timeout').length,aborted:completed.filter(r=>['cancelled','monitor-stopped'].includes(r.status)).length,errors:completed.filter(r=>r.status==='failed'||r.status==='truncated').length,supervisorJudgments:judged.length,shadowStopRecommendations:stops.length,falseStops:falseStops.length,correctStops:correctStops.length,unknownStops:stops.length-known.length,allRepeatTasksPassed:repeated.filter(v=>v.every(r=>r.verification?.passed===true)).length,repeatedTasks:repeated.length,scope:'All mandatory native checks required for success; schema and heuristic tool relevance are separate startup diagnostics. Two repeats are exploratory, not a precise reliability estimate.'};
 });
 if(rows.some(r=>r.spec.dataset==='holdout'))warnings.push('Neue Aufgabeninstanzen sind innerhalb bekannter Aufgabenfamilien zurückgehalten; kein Beleg für Generalisierung auf beliebige CAD-Aufgaben.');
 if(rows.some(r=>r.spec.monitor?.mode==='active'))warnings.push('Aktiv gestoppte Läufe besitzen kein beobachtetes vollständiges Gegenergebnis. Einsparung und geometrische Fehlerrate daraus nicht behaupten.');
 warnings.push('Getrennte Serien oder Quellstände werden nicht stillschweigend gepoolt. Kleine Stichproben und wiederholte Aufgaben erlauben keine sichere allgemeine Rangfolge.');
 return {runs:rows.length,groups:results,warnings};
}
