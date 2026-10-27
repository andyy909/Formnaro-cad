// Fixed baseline, one running computation and only the newest waiting draft.
export function createEditTransaction({capture,compute,accept,commit,rollback,abort}){
  let active=null,sequence=0;
  function begin(){if(active)return active;let resolve,reject;const done=new Promise((a,b)=>{resolve=a;reject=b;});done.catch(()=>{});active={id:++sequence,baseline:capture(),version:0,pending:null,running:false,closing:false,result:null,resolve,reject,done};return active;}
  function complete(t){if(active!==t||t.running||t.pending||!t.closing)return;active=null;try{commit(t.baseline,t.result);t.resolve(t.result);}catch(e){rollback(t.baseline);t.reject(e);}}
  async function drain(t){if(t.running)return;t.running=true;while(active===t&&t.pending){const request=t.pending;t.pending=null;try{const result=await compute(request.data,t.baseline,t.id,request.version);if(active!==t)return;if(request.version!==t.version)continue;accept(result);t.result=result;}catch(e){if(active!==t)return;if(request.version!==t.version&&e.name!=='AbortError')continue;active=null;rollback(t.baseline);t.reject(e);return;}}t.running=false;complete(t);}
  function submit(data,{finish=false}={}){const t=begin();t.pending={data:structuredClone(data),version:++t.version};t.closing||=finish;void drain(t);return t.done;}
  function finish(){if(!active)return Promise.resolve();const t=active;t.closing=true;complete(t);return t.done;}
  function cancel(){if(!active)return false;const t=active;active=null;abort();rollback(t.baseline);const e=Error('Bearbeitung abgebrochen. Anfangszustand wiederhergestellt.');e.name='AbortError';t.reject(e);return true;}
  return {begin,submit,finish,cancel,isActive:()=>!!active,baseline:()=>active?.baseline,state:()=>active?{id:active.id,version:active.version,running:active.running,pending:!!active.pending,closing:active.closing}:null};
}
