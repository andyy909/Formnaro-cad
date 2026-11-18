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

export function formatFeedback(record){
 return (record?.events??[])
  .filter(event=>event.type==='format-feedback')
  .map(event=>String(event.error??'').slice(0,200));
}

export function firstAction(record){
 const proposal=(record?.events??[]).find(event=>event.type==='proposal');
 const actions=proposal?.plan?.actions;
 return {
  reasoningMs:Number.isFinite(record?.firstReasoningMs)?record.firstReasoningMs:null,
  firstProposalMs:Number.isFinite(proposal?.ms)?proposal.ms:null,
  firstStepKinds:Array.isArray(actions)?actions.slice(0,5).map(action=>action.kind??null):[],
 };
}

export function contextGaps(record){
 const gaps=[];
 if(record?.status==='needs-input')gaps.push({kind:'rueckfrage',text:String(record.finalMessage??'').slice(0,600)});
 for(const event of record?.events??[]){
  if(event.type==='format-feedback')gaps.push({kind:'formatregel',text:String(event.error??'').slice(0,600)});
  if(event.type==='tool-call'&&/tool_info/.test(String(event.tool??'')))gaps.push({kind:'werkzeugauskunft',text:String(event.arguments??'').slice(0,200)});
 }
 return gaps;
}

const CONTEXT_FLAGS=[
 ['szene-leer',text=>/objects:\s*\[\s*\]/i.test(text)||(/scene|szene/i.test(text)&&/empty|leer/i.test(text))],
 ['widerspruch',text=>/ambigu|contradict|widerspr|inconsistent/i.test(text)],
 ['unklar',text=>/unclear|unklar|not sure|missing|fehlt/i.test(text)],
];

export function firstContextReaction(record){
 const reasoning=(record?.events??[]).find(event=>event.type==='reasoning');
 const text=typeof reasoning?.text==='string'?reasoning.text:'';
 if(!text)return {excerpt:null,flags:[],untrusted:true};
 const excerpt=text.slice(0,800);
 return {excerpt,flags:CONTEXT_FLAGS.filter(([,matches])=>matches(excerpt)).map(([flag])=>flag),untrusted:true};
}

export function runFinding(record,outcome){
 const facts=runFacts(record);
 return {
  caseId:facts.caseId,
  runId:facts.runId,
  effort:facts.effort,
  status:facts.status,
  seconds:facts.seconds,
  requests:facts.requests,
  tokens:facts.tokens,
  failedChecks:facts.failedChecks,
  formatFeedback:formatFeedback(record),
  firstAction:firstAction(record),
  contextGaps:contextGaps(record),
  firstContextReaction:firstContextReaction(record),
  outcome:outcome??null,
  firstTry:typeof outcome?.firstTry==='boolean'?outcome.firstTry:null,
  feedbackRounds:feedbackRounds(record),
 };
}

const TOLERANCE=1e-5;
const sameNumbers=(left,right)=>Array.isArray(left)&&Array.isArray(right)&&left.length===right.length&&left.every((value,index)=>Math.abs(value-right[index])<=TOLERANCE);
const sameBody=(body,reference)=>sameNumbers(body?.size,reference?.size)&&sameNumbers(body?.center,reference?.center);
const round3=value=>Math.round(value*1000)/1000;

export function symptomKey(check){
 const name=String(check?.name??'');
 const actual=check?.actual;
 if(typeof actual?.actual?.count==='number'&&typeof actual?.expected?.count==='number'){
  const bodies=actual.actual.bodies;
  const identical=Array.isArray(bodies)&&bodies.length>1&&bodies.every(body=>sameBody(body,bodies[0]));
  return name+': '+actual.actual.count+' statt '+actual.expected.count+(identical?', deckungsgleich':'');
 }
 if(typeof actual?.actual==='number'&&typeof actual?.expected==='number')return name+': '+round3(actual.actual)+' statt '+round3(actual.expected);
 return name;
}

export function runSymptoms(record){
 const checks=[];
 for(const event of record?.events??[])if(event.type==='practice-ui-feedback')for(const check of event.verification?.checks??[])if(!check.passed)checks.push(check);
 for(const check of record?.verification?.checks??[])if(!check.passed)checks.push(check);
 return [...new Set(checks.map(symptomKey))];
}

export function findPatterns(findings){
 const byKey=new Map();
 for(const finding of findings??[]){
  for(const key of finding?.symptoms??[]){
   const entry=byKey.get(key)??{caseIds:new Set(),runIds:new Set()};
   entry.caseIds.add(finding.caseId);
   entry.runIds.add(finding.runId);
   byKey.set(key,entry);
  }
 }
 return [...byKey]
  .filter(([,entry])=>entry.caseIds.size>=2)
  .map(([key,entry])=>({key,caseIds:[...entry.caseIds],runIds:[...entry.runIds],hint:'Gleiches Symptom in mehreren Aufgaben: mögliche Programmursache'}));
}

export function contextReactionPatterns(findings){
 const list=findings??[];
 const total=list.length;
 if(!total)return [];
 const counts=new Map();
 for(const finding of list)for(const flag of finding?.firstContextReaction?.flags??[])counts.set(flag,(counts.get(flag)??0)+1);
 return [...counts]
  .filter(([,count])=>count/total>=1/3)
  .map(([flag,count])=>({flag,count,total,hint:'Startkontext prüfen',untrusted:true}));
}
