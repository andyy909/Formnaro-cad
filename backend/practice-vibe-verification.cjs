const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {ACPClient}=require('./mistral-acp.cjs');
const {flashConfig,recordPracticeFlash}=require('./practice-flash-verification.cjs');
const vibeConfig={authMode:'mistral-vibe',baseUrl:'https://api.mistral.ai/v1',protocol:'chat',model:'mistral-large-4',
 mistralReasoningEffort:'high',agentSteps:7,rememberKey:false,bridgeEnabled:false,webResearchAllowed:false};
const flash=()=>!!process.env.FORMNARO_VERIFY_PRACTICE_FLASH_PROFILE;
exports.practiceLiveConfig=()=>flash()?flashConfig:vibeConfig;

exports.practiceComparisonPolicy=function practiceComparisonPolicy(criteria,selected){
 const variant=process.env.FORMNARO_VERIFY_PRACTICE_MATRIX_MODE;
 if(!variant)return undefined;
 if(!['off','report','enforce','all'].includes(variant))throw Error('Unknown practice comparison variant.');
 const override=process.env.FORMNARO_VERIFY_PRACTICE_MATRIX_CRITERIA;
 const enabled=override?JSON.parse(override):selected;
 if(override&&(!['report','enforce'].includes(variant)||!Array.isArray(enabled)||!enabled.length||
   new Set(enabled).size!==enabled.length||enabled.some(id=>!criteria.some(entry=>entry.id===id))))
  throw Error('Invalid private catalog criteria selection.');
 return {mode:variant==='all'?'enforce':variant,criteria,...(variant==='all'?{}:{enabled})};
};

exports.recordPracticeVibe=function recordPracticeVibe(directory){
 const original=ACPClient.prototype.call,rounds=[],configurations=new Map(),sessions=new Map();
 const write=()=>fs.writeFileSync(path.join(directory,'vibe-rounds.json'),JSON.stringify(rounds,null,2));
 ACPClient.prototype.call=async function call(method,params,options){
  if(method!=='session/prompt'){
   const result=await original.call(this,method,params,options);
   if(Array.isArray(result?.configOptions))configurations.set(result.sessionId??params?.sessionId,result.configOptions);
   return result;
  }
  const session=params.sessionId,config=configurations.get(session)??[];
  if(!sessions.has(session))sessions.set(session,sessions.size+1);
  const round={round:rounds.length+1,session:sessions.get(session),model:config.find(o=>o.category==='model'||o.id==='model')?.currentValue,
   confirmedEffort:config.find(o=>o.id==='thinking')?.currentValue,requestBytes:Buffer.byteLength(JSON.stringify(params)),images:[],response:''};
  const validation=params.prompt.find(block=>block.type==='text')?.text.split('\nValidation feedback:\n').at(-1);
  if(validation?.startsWith('{'))try{round.applicationFeedback=JSON.parse(validation);}catch{}
  for(const block of params.prompt.filter(block=>block.type==='image')){
   const bytes=Buffer.from(block.data,'base64'),file=`vibe-round-${round.round}-image-${round.images.length+1}.${block.mimeType.split('/').at(-1)}`;
   fs.writeFileSync(path.join(directory,file),bytes);
   round.images.push({file,sha256:createHash('sha256').update(bytes).digest('hex'),mimeType:block.mimeType,bytes:bytes.length});
  }
  rounds.push(round);write();
  const started=Date.now();
  const update=event=>{
   if(event.sessionId!==session)return;
   const value=event.update;
   if(value.sessionUpdate==='config_option_update'&&Array.isArray(value.configOptions))configurations.set(session,value.configOptions);
   if(value.sessionUpdate==='agent_message_chunk'&&value.content?.type==='text')round.response=(round.response+value.content.text).slice(0,32000);
   if(value.sessionUpdate==='usage_update')round.sessionUsage={inputTokens:value._meta?.promptTokens,outputTokens:value._meta?.completionTokens,cachedInputTokens:value._meta?.cachedTokens,costUSD:value.cost?.currency==='USD'?value.cost.amount:undefined};
  };
  this.on('update',update);
  try{const result=await original.call(this,method,params,options);round.stopReason=result?.stopReason;return result;}
  catch(error){
   const message=String(error?.message??'');
   round.failure=/zu lange gedauert|\btimeout\b|\btimed out\b/i.test(message)?'timeout':
    error?.name==='AbortError'||/\babgebrochen\b/i.test(message)?'cancelled':
    error?.code==='MISTRAL_ACP_ERROR'?'provider-error':'transport-error';
   throw error;
  }
  finally{this.removeListener('update',update);round.elapsedMs=Date.now()-started;write();}
 };
 const valid=()=>rounds.length>0&&rounds.every(round=>round.model===vibeConfig.model&&round.confirmedEffort==='high'&&round.stopReason==='end_turn');
 return {rounds,valid,stop:()=>{ACPClient.prototype.call=original;write();}};
};
exports.recordPracticeProvider=directory=>flash()?recordPracticeFlash(directory):exports.recordPracticeVibe(directory);

exports.runPracticeLive=async function runPracticeLive({js,directory,prompt,files=[],quality,fault,allowNoResult=false,timeoutMs=300000}){
 if(fault!==undefined&&!['sketch-gap','width-42'].includes(fault))throw Error('Unknown test fault.');
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<300000||timeoutMs>900000)throw Error('Invalid private live wait budget.');
 const provider=exports.recordPracticeProvider(directory),config=exports.practiceLiveConfig();
 const readUi=()=>js(`({results:window.__livePracticeResults,chat:document.getElementById('ai-chat-log').innerText,
  status:document.getElementById('ai-chat-status').textContent,usage:document.getElementById('ai-chat-usage').textContent,
  observedAtMs:performance.now(),waitBudgetMs:${timeoutMs}})`);
 const until=async condition=>{
  const deadline=Date.now()+timeoutMs;
  while(!await js(condition)){
   if(Date.now()>=deadline){
    const status=(await readUi()).status;
    throw Object.assign(Error('Zeitlimit des Live-Übungstests erreicht.'+(status?' Letzter Status: '+status:'')),{code:'PRACTICE_VERIFICATION_TIMEOUT'});
   }
   await new Promise(resolve=>setTimeout(resolve,100));
  }
 };
 try{
  await js(`(async()=>{
   const a=window.__cadTest,assistant=a.programAssistant,execute=assistant.execute,accept=assistant.acceptPractice;
   window.__livePracticeSelection=a.selection();
   if(!${files.length}&&!a.selection().length)a.select([{rootId:a.snapshot().nodes[0].id,path:[]}]);
   if(${JSON.stringify(!!quality)})a.setPracticeQuality(${JSON.stringify(quality)});
   window.__livePracticeResults=[];
   const fault=${JSON.stringify(fault)};
   let injected=false;
   const capture=result=>({ok:result?.ok,reason:result?.reason,report:result?.report,steps:result?.steps,resultRef:result?.resultRef});
   assistant.execute=async function(step,options){
    const entry={kind:step.kind,actions:step.plan?.actions,startedMs:performance.now()};window.__livePracticeResults.push(entry);
    if(fault&&!injected&&step.kind==='practice'){
     const actions=structuredClone(step.plan.actions);
     const target=(action,id)=>action.kind==='ui'&&action.target==='ui:id:'+id;
     if(fault==='sketch-gap'){
      const open=actions.findIndex(action=>action.kind==='ui'&&action.action==='click'&&
       (target(action,'edit-sketch-source')||action.target==='ui:tool:edit-sketch'));
      const preview=actions.findIndex((action,index)=>index>open&&target(action,'sketch-preview'));
      if(open>=0&&preview>open){
       actions.splice(preview,0,{kind:'ui',action:'choose',target:'ui:id:sketch-profile-element',value:'right'},
        {kind:'ui',action:'click',target:'ui:id:sketch-profile-delete'});
       injected=true;
      }
     }else{
      const width=actions.find(action=>action.kind==='set'&&action.field==='size-0'&&action.value===44);
      const field=actions.find(action=>target(action,'size-0')&&action.action==='set'&&Number(action.value)===44);
      if(width){width.value=42;injected=true;}
      else if(field){field.value='42';injected=true;}
     }
     if(injected){entry.injected=fault;entry.executedActions=actions;step={...step,plan:{...step.plan,actions}};}
    }
    try{
     const result=await execute.call(this,step,options);
     entry.result=capture(result);
     return result;
    }finally{entry.elapsedMs=Math.round(performance.now()-entry.startedMs);}
   };
   assistant.acceptPractice=async function(...args){
    const entry={kind:'accept-advisory',startedMs:performance.now()};window.__livePracticeResults.push(entry);
    try{
     const result=await accept.apply(this,args);
     entry.result=capture(result);
     return result;
    }finally{entry.elapsedMs=Math.round(performance.now()-entry.startedMs);}
   };
   const saved=await window.offlinecadDesktop.saveAISettings({config:${JSON.stringify(config)},key:''});
   if(saved.authMode==='api-key'&&!saved.hasKey)throw Error('The existing DeepSeek credential could not be used in the isolated test.');
   await a.aiUI.chat.refreshModels();
  })()`);
  if(files.length)await js(`(()=>{
   const input=document.getElementById('ai-chat-practice-file-input'),dt=new DataTransfer();
   for(const f of ${JSON.stringify(files)})dt.items.add(new File([Uint8Array.from(atob(f.base64),c=>c.charCodeAt(0))],f.name,{type:f.mimeType}));
   input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  })()`);
  await until("!document.getElementById('ai-chat-send').disabled");
  await js(`(()=>{
   document.getElementById('ai-chat-practice-from-project').checked=true;
   document.getElementById('ai-chat-prompt').value=${JSON.stringify(prompt)};
   document.getElementById('ai-chat-form').requestSubmit();
  })()`);
  await until('window.__cadTest.aiUI.chat.state().busy');
  await until('!window.__cadTest.aiUI.chat.state().busy');
  const ui=await readUi(),result=ui.results.map(entry=>entry.result).findLast(result=>result?.resultRef);
  if(!result&&!allowNoResult)throw Error(ui.status||ui.results.at(-1)?.result?.reason||'The agent did not complete an adoptable practice');
  if(!provider.valid())throw Error('The transport trace does not confirm the requested model and High setting.');
  for(const photo of files.filter(file=>file.kind==='photo')){
   const hash=createHash('sha256').update(Buffer.from(photo.base64,'base64')).digest('hex');
   if(!provider.rounds.some(round=>round.images.some(image=>image.sha256===hash)))throw Error('The explicitly supplied photo did not reach the provider transport');
  }
  return {...result,reply:provider.rounds.at(-1)?.response,
   attempts:ui.results.map(({injected,result})=>({injected,reason:result?.reason,report:result?.report,steps:result?.steps}))};
 }finally{
  provider.stop();
  const ui=await readUi().catch(()=>null);
  if(ui)for(const entry of ui.results??[])if(entry.result?.resultRef){delete entry.result.resultRef;entry.result.hasResult=true;}
  fs.writeFileSync(path.join(directory,'live-ui.json'),JSON.stringify(ui,null,2));
  await js(`if(window.__livePracticeSelection)window.__cadTest.select(window.__livePracticeSelection);
   ${quality?'window.__cadTest.setPracticeQuality(null);':''}`).catch(()=>{});
 }
};
