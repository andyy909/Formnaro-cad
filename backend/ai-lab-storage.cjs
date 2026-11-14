const {writeTaskAtomicSync}=require('./ai-task-atomic.cjs');
function writeLabFile(file,value,options){
 try{writeTaskAtomicSync(file,value,options);}
 catch(cause){throw Object.assign(new Error('Laborergebnis konnte nicht sicher gespeichert werden; die Serie wurde gestoppt. '+cause.message,{cause}),{code:'LAB_STORAGE_FAILED',causeCode:cause.code,failureClass:'infrastructure'});}
}
function failureClass(record){
 const code=record.error?.code;
 if(record.cleanExit===false||record.close&&(record.close.forced||record.close.code!==0||record.close.signal))return 'infrastructure';
 if(record.failureClass==='infrastructure'||['LAB_STORAGE_FAILED','EPERM','EACCES','EBUSY','ENOSPC','EIO','EROFS','HOST_EXIT','AI_PROVIDER_QUOTA','CHATGPT_REQUEST_FAILED','CHATGPT_AUTH_REQUIRED'].includes(code)||record.failurePhase==='preparation'||record.verificationFailure==='checker-error')return 'infrastructure';
 if(['cancelled','interrupted'].includes(record.status))return 'interrupted';
 if(record.error)return 'execution';
 if(record.verification?.passed===false)return 'native-mismatch';
 return record.verification?.passed===true?'none':'unverified';
}
module.exports={writeLabFile,failureClass};
