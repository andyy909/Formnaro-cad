// Electron contextBridge copies Error text but drops custom Error properties.
// Reconstruct task errors in the renderer, as for native CAD/provider replies.
export async function requestAITask(desktop,args){
 if(typeof desktop?.aiTasksReply!=='function')throw Object.assign(Error('Gespeicherte KI-Aufträge stehen in der Windows-Anwendung zur Verfügung.'),{code:'AI_TASK_UNAVAILABLE',feedback:{retryable:false}});
 const reply=await desktop.aiTasksReply(args);
 if(reply?.ok===true)return reply.value;
 const error=Error(typeof reply?.error==='string'?reply.error:'KI-Auftragsablage hat keine gültige Antwort geliefert.');
 error.code=typeof reply?.code==='string'?reply.code:'AI_TASK_STORE_FAILED';if(reply?.feedback)error.feedback=reply.feedback;throw error;
}
