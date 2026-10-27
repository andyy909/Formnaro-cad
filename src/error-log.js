export function createErrorReporter({desktop=globalThis.offlinecadDesktop,getContext=()=>({})}={}){
 const seen=new WeakSet();
 function report(error,context={}){
  if(error?.name==='AbortError'||error?.code==='ABORTED')return;
  if(error&&typeof error==='object'){if(seen.has(error))return;seen.add(error);}
  const value={source:'renderer',name:String(error?.name??'Error'),code:String(error?.code??''),message:String(error?.message??error??'Unbekannter Fehler'),stack:String(error?.stack??''),...getContext(),...context};
  try{const pending=desktop?.recordError?.(value);pending?.catch?.(()=>{});}catch{/* Logging must never break the original action. */}
 }
 function install(target=globalThis){
  const onError=event=>report(event.error??event.message,{source:'renderer-unhandled'}),onReject=event=>report(event.reason,{source:'renderer-rejection'});
  target.addEventListener('error',onError);target.addEventListener('unhandledrejection',onReject);
  return ()=>{target.removeEventListener('error',onError);target.removeEventListener('unhandledrejection',onReject);};
 }
 return {report,install};
}
