import {cadGeometryDigest} from './cad-geometry-digest.js';
import {aiFeedback} from './ai-feedback.js';
import {photoCandidatePenalty} from './cad-photo-data.js';

const fail=message=>{throw Object.assign(Error(message),{code:'AI_TASK_PROGRESS_INVALID',feedback:{retryable:false}});};
function canonical(value){
 if(value===undefined)return null;
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
 if(typeof value==='number'&&!Number.isFinite(value))return String(value);
 return value;
}
const digest=value=>cadGeometryDigest(JSON.stringify(canonical(value)));
function distance(expected,actual){
 if(Number.isFinite(expected)&&Number.isFinite(actual))return Math.min(1e6,Math.abs(expected-actual)/Math.max(1,Math.abs(expected)));
 if(Number.isFinite(expected))return 1e6;
 if(Array.isArray(expected)&&!Array.isArray(actual))return 1e6;
 if(Array.isArray(expected)&&Array.isArray(actual))return expected.reduce((n,v,i)=>n+distance(v,actual[i]),0);
 if(expected&&actual&&typeof expected==='object'&&typeof actual==='object')return Object.keys(expected).reduce((n,k)=>n+distance(expected[k],actual[k]),0);
 return 0;
}
// Only application-observed checks influence this order. Model-written claims,
// labels and candidate IDs cannot improve a candidate's measured quality.
export function aiCandidateQuality(proposal){
 const checks=proposal.verification?.checks??[],failed=checks.filter(c=>c.passed===false);
 return [proposal.independentCheck?.passed===false?1:0,
  Math.max(failed.length,proposal.verification?.passed===false?1:0),
  failed.reduce((n,c)=>n+distance(c.expected??c.feedback?.expected,c.actual??c.feedback?.actual),0),
  photoCandidatePenalty(proposal.photoComparison),proposal.visualReview?.correctionRequested?1:0];
}
export function compareAIQuality(left,right){
 for(let i=0;i<left.length;i++)if(Math.abs(left[i]-right[i])>1e-10)return left[i]<right[i]?-1:1;
 return 0;
}
function measurementValues(report){
 const clean=value=>{
  if(Array.isArray(value))return value.map(clean);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!['id','requestId','revision','previewId','elapsedMs','durationMs','program'].includes(k)).map(([k,v])=>[k,clean(v)]));
  return typeof value==='number'&&Number.isFinite(value)?Number(value.toPrecision(12)):value;
 };
 return clean(report);
}
// Use actual complete geometry, including mesh buffers. IDs, labels and archived
// program timestamps cannot disguise an unchanged shape in a visual loop.
export function aiCandidateGeometry(project){
 if(!project?.nodes)return undefined;
 const shape=n=>Object.fromEntries(['kind','source','recipe','brep','mesh','transform','solid','hidden','suppressed','operation','partition','extraction','modeling','color','opacity'].filter(k=>n[k]!==undefined).map(k=>[k,n[k]]).concat(n.children?[['children',n.children.map(shape)]]:[]));
 return digest(project.nodes.map(shape));
}
export function createAITaskProgress({maxSteps=7,purpose='technical',snapshot}={}){
 if(!Number.isSafeInteger(maxSteps)||maxSteps<7||maxSteps>80||!['technical','generative'].includes(purpose))fail('Ungültiges KI-Auftragsbudget oder Qualitätsziel.');
 let state={version:1,maxSteps,purpose,usedSteps:0,withoutProgress:0,observations:[],failures:[],bestQuality:null,candidates:[],stop:null};
 if(snapshot){
  const s=snapshot,keys=Object.keys(state);
  if(!s||Object.keys(s).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(s,k))||s.version!==1||s.maxSteps!==maxSteps||s.purpose!==purpose||!Number.isSafeInteger(s.usedSteps)||s.usedSteps<0||s.usedSteps>maxSteps||!Number.isSafeInteger(s.withoutProgress)||s.withoutProgress<0||s.withoutProgress>80||!Array.isArray(s.observations)||s.observations.length>80||s.observations.some(x=>!x||Object.keys(x).sort().join(',')!=='count,key'||!/^[a-f0-9]{64}$/.test(x.key)||!Number.isSafeInteger(x.count)||x.count<1||x.count>80)||!Array.isArray(s.failures)||s.failures.length>80||s.failures.some(x=>!x||Object.keys(x).sort().join(',')!=='count,key'||!/^[a-f0-9]{64}$/.test(x.key)||!Number.isSafeInteger(x.count)||x.count<1||x.count>80)||s.bestQuality!==null&&(!Array.isArray(s.bestQuality)||s.bestQuality.length!==5||!s.bestQuality.every(x=>Number.isFinite(x)&&x>=0))||!Array.isArray(s.candidates)||s.candidates.length>80||s.candidates.some(x=>!x||Object.keys(x).sort().join(',')!=='count,key'||!/^[a-f0-9]{64}$/.test(x.key)||!Number.isSafeInteger(x.count)||x.count<1||x.count>80)||s.stop!==null&&(!s.stop||!['repeated-failure','repeated-measurement','repeated-candidate','no-progress'].includes(s.stop.reason)||!Number.isSafeInteger(s.stop.step)||s.stop.step<1||s.stop.step>s.usedSteps))fail('Ungültiger gespeicherter KI-Fortschritt.');
  state=structuredClone(s);
 }
 const copy=()=>structuredClone(state);
 function stopped(){
  if(!state.stop)return null;
  return Object.assign(Error('KI-Auftrag gestoppt: '+({'repeated-failure':'derselbe Fehler trat dreimal ohne bessere Prüfung auf.','repeated-measurement':'dieselbe Messung lieferte dreimal denselben Befund.','repeated-candidate':'derselbe geometrisch geprüfte Entwurf wurde dreimal ohne bestätigte Verbesserung vorgeschlagen.','no-progress':'sechs Arbeitsschritte ergaben keinen messbaren Fortschritt.'}[state.stop.reason])),{code:'AI_TASK_STALLED',feedback:{retryable:false,reason:state.stop.reason,step:state.stop.step},taskProgress:copy()});
 }
 function stop(reason){state.stop??={reason,step:state.usedSteps};return stopped();}
 if(state.failures.reduce((n,r)=>n+r.count,0)>state.usedSteps||state.observations.reduce((n,r)=>n+r.count,0)>state.usedSteps||state.candidates.reduce((n,r)=>n+r.count,0)>state.usedSteps)fail('Fortschrittsbefunde überschreiten das verbrauchte Budget.');
 if(new Set(state.observations.map(x=>x.key)).size!==state.observations.length||new Set(state.candidates.map(x=>x.key)).size!==state.candidates.length||new Set(state.failures.map(x=>x.key)).size!==state.failures.length)fail('Doppelte gespeicherte Fortschrittsbezüge.');
 const candidates=new Map(state.candidates.map(x=>[x.key,x])),observations=new Map(state.observations.map(x=>[x.key,x])),failures=new Map(state.failures.map(x=>[x.key,x]));
 return {
  snapshot:copy,
  claimStep(){const error=stopped();if(error)throw error;if(state.usedSteps>=maxSteps)throw Object.assign(Error('Das gespeicherte KI-Arbeitsschrittbudget ist erschöpft.'),{code:'AI_ANALYSIS_LIMIT',feedback:{retryable:false}});state.usedSteps++;state.withoutProgress++;return state.usedSteps;},
  candidate(proposal){
   const quality=aiCandidateQuality(proposal),better=!state.bestQuality||compareAIQuality(quality,state.bestQuality)<0;
   if(better){state.bestQuality=quality;state.withoutProgress=0;}
   return better;
  },
  proposed(key){
   if(key){if(!/^[a-f0-9]{64}$/.test(key))fail('Ungültiger nativer Entwurfsbezug.');const row=candidates.get(key)??{key,count:0};if(!candidates.has(key)){candidates.set(key,row);state.candidates.push(row);}row.count++;if(row.count>=3)return stop('repeated-candidate');}
   return state.withoutProgress>=6?stop('no-progress'):null;
  },
  analysis(requests,report){
   // Request IDs and program text are not measured progress. Identical native
   // values remain identical even when a provider renames its measurement.
   const route=requests.map(({engine,kind,options={}})=>({engine,kind,options:Object.fromEntries(Object.entries(options).filter(([k])=>!['script','code','modules'].includes(k)))}));
   const key=digest({route,report:measurementValues(report)}),row=observations.get(key)??{key,count:0};row.count++;
   if(!observations.has(key)){observations.set(key,row);state.observations.push(row);state.withoutProgress=0;}
   if(row.count>=3)return stop('repeated-measurement');
   if(state.withoutProgress>=6)return stop('no-progress');
   return null;
  },
  failed(error,result){
   if(error.code==='AI_TASK_STALLED')return stopped();
   const feedback=aiFeedback(error),route=[...(result?.commands??[]).map(c=>({op:c.op,engine:c.engine,kind:c.operation?.kind})),...(result?.analysis??[]).map(q=>({engine:q.engine,kind:q.kind}))];
   // The concrete observed cause stays keyed across intervening successful
   // measurements. Merely renaming a part cannot reset a failed route.
   const key=digest({feedback,route,bestQuality:state.bestQuality}),row=failures.get(key)??{key,count:0};
   if(!failures.has(key)){failures.set(key,row);state.failures.push(row);}row.count++;
   if(row.count>=3)return stop('repeated-failure');
   if(state.withoutProgress>=6)return stop('no-progress');
   return null;
  }
 };
}
