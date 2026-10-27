// Bounded application evidence only. Never serialize arbitrary Error properties.
const text=(v,n=1500)=>typeof v==='string'?v.slice(0,n):undefined;
export function feedbackTarget(value){
 if(typeof value==='string')return value.slice(0,200);
 if(value&&typeof value.rootId==='string'&&Array.isArray(value.path)&&value.path.length<=12&&value.path.every(v=>typeof v==='string'))return {rootId:value.rootId.slice(0,200),path:value.path.map(v=>v.slice(0,200))};
}
export function aiFeedback(error,context={}){
 const source=error?.feedback??{},code=text(error?.code??source.code??'MODEL_VALIDATION',80),message=text(source.message??error?.message)??'Model validation failed.';
 const out={code,message,retryable:source.retryable!==false&&error?.name!=='AbortError'&&!/LOCK|READ.?ONLY|REEXTRACT_REQUIRED|STALE|CANCEL|ABORT|BUSY|TIMEOUT|FATAL|FORBIDDEN|UNAUTHORIZED/.test(code),applied:false};
 const index=context.commandIndex??source.commandIndex,operation=context.operation??source.operation,target=feedbackTarget(context.target??source.target);
 if(Number.isSafeInteger(index)&&index>=1&&index<=200)out.commandIndex=index;
 if(typeof operation==='string')out.operation=operation.slice(0,64);
 if(target!==undefined)out.target=target;
 if(typeof source.field==='string')out.field=source.field.slice(0,120);
 if(typeof source.value==='number'&&Number.isFinite(source.value)||typeof source.value==='boolean')out.value=source.value;
 if(Array.isArray(source.value)&&source.value.length<=4&&source.value.every(Number.isFinite))out.value=[...source.value];
 if(source.range&&['min','max'].some(k=>Number.isFinite(source.range[k])))out.range=Object.fromEntries(['min','max'].filter(k=>Number.isFinite(source.range[k])).map(k=>[k,source.range[k]]));
 if(Number.isSafeInteger(source.checkIndex)&&source.checkIndex>=1&&source.checkIndex<=32){out.checkIndex=source.checkIndex;if(['size','bounds','volume','solids','distance','clearance','radialClearance'].includes(source.checkKind))out.checkKind=source.checkKind;for(const key of ['expected','actual'])if(Number.isFinite(source[key])||Array.isArray(source[key])&&source[key].length===3&&source[key].every(Number.isFinite))out[key]=structuredClone(source[key]);if(Number.isFinite(source.tolerance)&&source.tolerance>=0&&source.tolerance<=.1)out.tolerance=source.tolerance;}
 if(source.checkKind==='radialClearance'&&source.actual&&typeof source.actual==='object'){
  const actual={};for(const k of ['minimumGapLowerBound','sampledMinimumGapLowerBound','samples','slabsChecked','numericalAllowance'])if(Number.isFinite(source.actual[k]))actual[k]=source.actual[k];
  if(typeof source.actual.coverage==='string')actual.coverage=text(source.actual.coverage,500);
  if(typeof source.actual.method==='string')actual.method=text(source.actual.method,100);
  out.actual=actual;
 }
 return out;
}
const safeKeys=new Set(['rootId','path','op','target','targets','set','size','pos','rot','scale','translate','mirror','solid','type','params','diameter','depth','height','width','radius','through','kind','offset','space','point','normal','mode','distance','as','name','expected','tolerance','edge','from','to','other','samples']);
function safeValue(value,depth=0){
 if(depth>4)return undefined;
 if(typeof value==='number')return Number.isFinite(value)?value:undefined;
 if(typeof value==='boolean'||value===null)return value;
 if(typeof value==='string')return value.slice(0,200);
 if(Array.isArray(value))return value.slice(0,16).map(v=>safeValue(v,depth+1));
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).filter(k=>safeKeys.has(k)).slice(0,24).map(k=>[k,k==='target'?feedbackTarget(value[k]):safeValue(value[k],depth+1)]));
}
export function rejectedProposal(result){
 const out={revision:text(result?.revision,80),label:text(result?.label,200),commandCount:result?.commands?.length??0,commands:[],...(Array.isArray(result?.checks)?{checks:[]}:{}),truncated:true};
 if(out.checks)for(const check of result.checks.slice(0,32)){out.checks.push(safeValue(check));if(JSON.stringify(out).length>7000){out.checks.pop();break;}}
 for(const command of result?.commands??[]){const summary=safeValue(command);out.commands.push(summary);if(JSON.stringify(out).length>8500){out.commands.pop();break;}}
 // Summaries intentionally omit unsupported fields, even when no commands were dropped.
 return out;
}
export function correctionFeedback(error,result){
 return '[Formnaro application feedback: failed proposal; nothing applied]\n'+JSON.stringify({feedback:aiFeedback(error),rejectedBatch:result?rejectedProposal(result):null})+'\nCorrect the original user task using only the current scene and contract. Return the complete corrected JSON object.';
}
