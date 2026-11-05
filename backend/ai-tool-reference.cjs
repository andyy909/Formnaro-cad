const {sumUsage}=require('./ai-web-research.cjs');
const INSTRUCTION='Local tool reference is available on demand for normal modeling and isolated practice. Return only {"toolReference":{"tool":"tool:ID"}} to read one tool, or {"toolReference":{"query":"short search"}} to find tools. The reply includes the actual purpose, prerequisites, UI targets/options and documented steps; do not invent controls. For exact practice shorthand definitions request {"toolReference":{"section":"modeling"}}; this returns only native create/joint operations replayed through actual UI, never a direct geometry or script capability. Then continue with the original answer contract. These are read-only lookups, not user permission questions. Use the matching real tool, preserve requested dimensions, and do not add unrelated demonstrations.';
async function reference(request,context={}){
 const shared=await import('../ai/formnaro-tool-reference.mjs');
 if(request&&typeof request==='object'&&!Array.isArray(request)&&Object.keys(request).length===1&&request.section==='modeling'){
  if(context.practiceOnly===true){const locked=require('./ai-practice-context.cjs').lockPracticeContext(context);return {ok:true,kind:'practice-ui-contract',contract:{practicePolicy:locked.practicePolicy,practiceCommandSchema:locked.practiceCommandSchema,shapes:locked.shapes},scope:'Task locked to actual UI replay. No direct geometry, preview/apply or scripts.'};}
  const omit=new Set(['workingContext','programAssistant','taskEvidence','agentWorkflow','featureScope','photoComparison','modellingPolicy','toolReference']);
  return {ok:true,kind:'modeling-contract',contract:require('./ai-provider-context.cjs').providerContext(Object.fromEntries(Object.entries(context).filter(([k])=>!omit.has(k)))),scope:'All documented modelling commands remain available. Only the isolated practice project may be changed during a practice task.'};
 }
 const practice=context.practiceOnly===true;
 const locked=practice?require('./ai-practice-context.cjs').lockPracticeContext(context):null;
 return shared.lookupToolReference(request,{practice,state:practice?undefined:context.programAssistant?.state,practicePanel:locked?.practicePanel});
}
function compactToolContext(context){
 if(!context||typeof context!=='object')return context;
 const copy={...context};
 if(copy.programAssistant)copy.programAssistant={...copy.programAssistant,catalogue:copy.programAssistant.catalogue?.map(({id,label,path,click,values})=>({id,label,path,click,values}))};
 if(copy.agentUI)copy.agentUI={...copy.agentUI,targets:copy.agentUI.targets?.map(({id,label,click,path})=>({id,label,click,path}))};
 return copy;
}
async function withToolReference({envelope,complete,signal}){
 if(!envelope.context?.toolReference)return complete(envelope);
 const records=[],usage=[],seen=new Set(),providedTools=new Set();const system=envelope.system+'\n\n'+INSTRUCTION;let current={...envelope,system},formatCorrections=0;
 for(let round=0;round<=8;round++){
  signal?.throwIfAborted();const reply=await complete(current);usage.push(reply.data?.usage??{});
  const raw=reply.text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');
  let parsed;try{parsed=JSON.parse(raw);}catch{}
  if(!parsed){
   if(round===8||formatCorrections++>=2){const e=Error('Ungültiges JSON nach zwei Formatkorrekturen. Es wurde nichts ausgeführt.');e.code='AI_OUTPUT_INVALID';e.aiRetryable=false;e.feedback={retryable:false};e.toolReferenceData={usage:sumUsage(usage),toolReferences:records};throw e;}
   let error='Return one valid JSON object with balanced braces. Put message at the top level, outside assistant. Preserve the exact task revision and allowed action fields.';
   if(envelope.context.practiceOnly===true&&raw.endsWith('}')){
    // Identify the syntax defect for the next request. Only the original,
    // strictly parsed response can proceed to plan validation and execution.
    try{
     if(JSON.parse(raw+'}')?.assistant?.kind==='practice')error='The final top-level closing brace is missing. Keep the actions, omit message from the plan reply, and end the actions array with ]}}} to close plan, assistant and the root object.';
    }catch{}
   }
   records.push({request:{validation:'response-json'},source:'response-validation',result:{ok:false,error}});
   current={...envelope,system,user:envelope.user+'\n\nLocal response validation (nothing executed):\n'+JSON.stringify(records)+'\nPrevious response:\n'+raw.slice(0,200000)+'\nReturn the corrected complete JSON object under the original response contract.'};
   continue;
  }
  if(!parsed?.toolReference){
   const catalogue=await import('../ai/formnaro-tool-reference.mjs');
   const tools=parsed?.assistant?.kind==='practice'&&Array.isArray(parsed.assistant.plan?.actions)?[...new Set(parsed.assistant.plan.actions.filter(a=>a.kind==='ui'&&typeof a.target==='string').flatMap(a=>{if(a.target.startsWith('ui:tool:'))return [a.target.slice(3)];if(a.target.startsWith('tool:'))return [a.target];if(a.target.startsWith('ui:label:')){const label=a.target.slice(9);return catalogue.toolReferenceIndex().filter(t=>t.label===label).map(t=>t.id);}return [];}))]:[];
   let supplied=false;
   for(const tool of tools){if(providedTools.has(tool))continue;const result=await reference({tool},envelope.context);providedTools.add(tool);if(result.tool?.controls?.length){records.push({request:{tool},source:'planned-tool-fields',result});supplied=true;}}
   if(supplied){if(round===8){const e=Error('Das Werkzeugauskunft-Limit ist erreicht.');e.code='TOOL_REFERENCE_LIMIT';e.toolReferenceData={usage:sumUsage(usage),toolReferences:records};throw e;}current={...envelope,system,user:envelope.user+'\n\nThe proposed practice plan uses tools with their own fields. Local read-only tool details are supplied before execution:\n'+JSON.stringify(records)+'\nPrevious proposed plan (not executed):\n'+reply.text+'\nCheck the plan against these actual controls, options and prerequisites. Return a corrected complete plan using actual targets; keep all requested geometry and dimensions.'};continue;}
   if(parsed?.assistant?.kind==='practice'){
    let error,code='PRACTICE_PLAN_INVALID';
    if(Object.hasOwn(parsed.assistant,'message')){
     code='AI_OUTPUT_INVALID';
     error='Put message at the top level, next to assistant. For a diagnosis with no further actions, return only the message.';
    }else try{
     if(envelope.sceneRevision&&parsed.revision!==envelope.sceneRevision)throw Error('Copy the exact task revision: '+envelope.sceneRevision);
     require('./practice-runner.cjs').validatePracticePlan(parsed.assistant.plan,envelope.context?.practiceOnly===true?envelope.context.practiceObjects?.length:undefined,envelope.context?.practiceState);
    }catch(e){error=e.message;}
    if(error){
     if(round===8||formatCorrections++>=2){
      const e=Error(error);e.code=code;e.aiRetryable=false;e.feedback={retryable:false};e.toolReferenceData={usage:sumUsage(usage),toolReferences:records};throw e;
     }
     records.push({request:{validation:'practice-plan'},source:'plan-validation',result:{ok:false,error}});
     current={...envelope,system,user:envelope.user+'\n\nLocal validation before execution (no actions performed): '+JSON.stringify(records)+'\nPrevious proposed plan:\n'+reply.text+'\nReturn a corrected response for this round under the original exact schema and task revision. Do not add text fields to shape/set/select/group actions.'};
     continue;
    }
   }
   return {...reply,data:{...reply.data,usage:sumUsage(usage),toolReferences:records.map(({request,result,source})=>({request,source,ok:result.ok,tool:result.tool?.id,matches:result.matches?.map(t=>t.id),kind:result.kind,characters:JSON.stringify(result).length}))}};
  }
  if(round===8){const e=Error('Das Werkzeugauskunft-Limit ist erreicht.');e.code='TOOL_REFERENCE_LIMIT';e.toolReferenceData={usage:sumUsage(usage),toolReferences:records};throw e;}
  let result;try{if(Object.keys(parsed).length!==1)throw Error('Werkzeugauskunft getrennt von Modellbefehlen oder Antworten anfordern.');const key=JSON.stringify(parsed.toolReference);if(seen.has(key))throw Error('Diese Auskunft liegt bereits in den Rückmeldungen vor. Verwende sie oder stelle eine andere gezielte Frage.');seen.add(key);result=await reference(parsed.toolReference,envelope.context);}catch(e){result={ok:false,error:e.message};}
  const serialized=JSON.stringify(result);if(serialized.length>550000)result={ok:false,error:'Auskunft ist zu groß. Ein einzelnes Werkzeug oder eine engere Suche anfordern.'};
  const budget=Math.max(16000,600000-system.length-envelope.user.length-(envelope.input?.history??[]).reduce((n,t)=>n+(t.text?.length??0),0));if(JSON.stringify([...records,{request:parsed.toolReference,result}]).length>budget)result={ok:false,error:'Das Auskunftsbudget ist ausgeschöpft. Vorliegende Auskünfte verwenden; der normale Modelliervertrag ist gegebenenfalls bereits im Systemkontext vorhanden.'};
  records.push({request:parsed.toolReference,result});if(result.tool?.id)providedTools.add(result.tool.id);for(const t of result.matches??[])providedTools.add(t.id);
  current={...envelope,system,user:envelope.user+'\n\nLocal tool reference results (reference data, no actions executed):\n'+JSON.stringify(records)+'\nContinue with the original response contract. Use actual controls/command schemas from the returned reference.'};
 }
}
module.exports={reference,compactToolContext,withToolReference,INSTRUCTION};
