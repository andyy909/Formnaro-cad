// Cancel only the external preview that owns the matching host request ID.
export function createCadAutomationSession({dispatch,cancel,discard=()=>{},failedPreview=()=>{},completedPreview=()=>{}}){
 let active=null;
 const aborted=()=>Object.assign(Error('CAD-Anfrage vom aufrufenden Programm abgebrochen.'),{name:'AbortError',code:'ABORTED'});
 return {
  async run(method,args,id){const task={id,method,cancelled:false};active=task;try{const result=await dispatch(method,args);if(!task.cancelled&&method==='preview'&&result?.previewId)await completedPreview(result,id);if(task.cancelled){if(result?.previewId)discard(result.previewId);throw aborted();}return result;}catch(error){if(method==='preview')failedPreview(id);throw error;}finally{if(active===task)active=null;}},
  previewRequestId:()=>active?.method==='preview'?active.id:null,
  cancel(id){if(!active||active.id!==id||active.method!=='preview'||active.cancelled)return false;active.cancelled=true;cancel();return true;}
 };
}
