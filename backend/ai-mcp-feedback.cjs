const localRefusal=new Set(['CAD_PREVIEW_NOT_OWNED','CAD_JOB_NOT_OWNED']);
const nextActions=new Set(['repeat','change_input','fix_prerequisite','stop']);

function toolFeedback(tool,report,{isError,imageAttached,args,availableTools}){
 const envelope={tool,isError,result:report,...(imageAttached?{imageAttached:true}:{})};
 if(isError){
  let data;try{data=JSON.parse(report);}catch{}
  const feedback=data?.feedback;
  const code=feedback?.code??data?.code;
  if(typeof code==='string'&&/^[A-Z0-9_]{1,80}$/.test(code)){
   const failure={code};
   const message=feedback?.message??data?.error;
   if(typeof message==='string')failure.message=message.slice(0,1500);
   if(typeof feedback?.phase==='string')failure.phase=feedback.phase.slice(0,80);
   if(typeof feedback?.operation==='string')failure.operation=feedback.operation.slice(0,64);
   if(Number.isSafeInteger(feedback?.commandIndex)&&feedback.commandIndex>=1&&feedback.commandIndex<=200)failure.commandIndex=feedback.commandIndex;
   const target=feedback?.target;
   if(typeof target==='string')failure.target=target.slice(0,200);
   else if(typeof target?.rootId==='string'&&Array.isArray(target.path)&&target.path.length<=12&&target.path.every(id=>typeof id==='string')){
    failure.target={rootId:target.rootId.slice(0,200),path:target.path.map(id=>id.slice(0,200))};
   }
   if(typeof feedback?.retryable==='boolean')failure.retryable=feedback.retryable;
   if(nextActions.has(feedback?.nextAction))failure.nextAction=feedback.nextAction;
   if(feedback?.applied===true||feedback?.applied===false||feedback?.applied===null)failure.applied=feedback.applied;
   if(feedback?.commitStatus==='unknown')failure.commitStatus='unknown';
   const sandboxOutput={};
   for(const key of ['stdout','stderr'])if(typeof feedback?.sandboxOutput?.[key]==='string'&&feedback.sandboxOutput[key])sandboxOutput[key]=feedback.sandboxOutput[key].slice(0,4000);
   if(Object.keys(sandboxOutput).length)failure.sandboxOutput=sandboxOutput;
   if(localRefusal.has(code))Object.assign(failure,{applied:false,retryable:true,nextAction:'change_input'});
   if(code==='INVALID_COMMAND_REFERENCE'&&tool==='offlinecad_command_info'){
    const command=typeof args?.command==='string'?args.command:null;
    const direct=command?.startsWith('offlinecad_')?command:command?'offlinecad_'+command:null;
    failure.recovery=direct&&direct!==tool&&availableTools?.has(direct)
     ?{tool:direct,message:'This is a tool, not a modelling command. Call it directly with its own arguments.'}
     :command==='cut'
      ?{tool,arguments:{command:'group'},message:'To subtract cutters from a newly created solid, see the group example.'}
      :{tool,arguments:{},message:'Read the modelling command index, then use an exact command key.'};
   }
   envelope.failure=failure;
  }
 }
 if(report.length>160000)envelope.result=JSON.stringify({truncated:true,characters:report.length,message:'Tool result exceeds the feedback limit. Use compact scene, fewer objects, or a narrower query. Do not infer omitted content.'});
 return envelope;
}

module.exports={toolFeedback};
