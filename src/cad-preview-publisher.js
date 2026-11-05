// Keep one display update in flight and replace queued frames with the latest.
// Finish is a boundary: no intermediate frame may arrive after the final view.
export function createCadPreviewPublisher(publish,{intervalMs=80}={}){
 let pending=null,inFlight=null,timer=null,closed=false,started=false,error;
 function flush(){
  clearTimeout(timer);timer=null;if(!pending)return;
  const value=pending;pending=null;started=true;
  inFlight=Promise.resolve().then(()=>publish(value)).catch(e=>{error??=e;}).finally(()=>{inFlight=null;if(pending&&!closed)timer=setTimeout(flush,intervalMs);});
 }
 return {
  push(value){if(closed)return;pending=value;if(!started)flush();else if(!inFlight&&!timer)timer=setTimeout(flush,intervalMs);},
  async finish(cancelled=false){closed=true;clearTimeout(timer);timer=null;if(cancelled)pending=null;await inFlight;if(pending&&!cancelled){flush();await inFlight;}if(error&&!cancelled)throw error;}
 };
}
