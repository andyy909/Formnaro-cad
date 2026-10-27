// The desktop has one native FreeCAD lane. A cancelled worker may retire before
// its child process has finished cleanup; keep that reply as the lane boundary.
const lanes=new WeakMap();
export function dispatchFreeCAD(desktop,request,{signal}={}){
 signal?.throwIfAborted();
 const task=(lanes.get(desktop)??Promise.resolve()).then(()=>{signal?.throwIfAborted();return desktop.runFreeCADReply(request);});
 lanes.set(desktop,task.then(()=>{},()=>{}));
 if(!signal)return task;
 return new Promise((resolve,reject)=>{
  const abort=()=>reject(Object.assign(Error('FreeCAD-Auftrag abgebrochen.'),{name:'AbortError',code:'ABORTED'}));
  signal.addEventListener('abort',abort,{once:true});
  task.then(value=>{signal.removeEventListener('abort',abort);resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
  if(signal.aborted)abort();
 });
}
