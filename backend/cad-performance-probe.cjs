// Serialized into the isolated benchmark renderer. No probe runs at startup.
async function measureInteraction(app,action,hasFeedback,{workerTiming=true}={}){
 const view=app.view;
 await view.renderReady();
 const frameGaps=[],drawTimes=[],renderer=view.renderer,render=renderer.render;
 const stateBefore=app.controller.state().worker;
 if(workerTiming)app.controller.measureTransport(true,{payload:false});
 const status=document.getElementById('status');
 const initialStatus=status?.textContent;
 let frame,firstDrawFeedbackMs=null,lastMatchingDrawMs=null,firstStatusFeedbackMs=null,pendingStatus=null;
 const start=performance.now();
 let previous=start;
 function sample(){
  const now=performance.now();
  frameGaps.push(now-previous);
  previous=now;
  const text=status?.textContent;
  if(firstStatusFeedbackMs===null&&text!==initialStatus&&status?.getClientRects().length){
   if(text===pendingStatus)firstStatusFeedbackMs=now-start;
   pendingStatus=text;
  }else pendingStatus=null;
  frame=requestAnimationFrame(sample);
 }
 frame=requestAnimationFrame(sample);
 renderer.render=function(...args){
  const before=performance.now();
  const result=render.apply(this,args);
  const after=performance.now();
  drawTimes.push(after-before);
  if(hasFeedback()){
   lastMatchingDrawMs=after-start;
   firstDrawFeedbackMs??=lastMatchingDrawMs;
  }
  return result;
 };
 try{
  await action();
  await app.settled();
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const stateAfter=app.controller.state().worker;
  const feedback=[firstDrawFeedbackMs,firstStatusFeedbackMs].filter(value=>value!==null);
  return {
   firstFeedbackMs:feedback.length?Math.min(...feedback):null,firstDrawFeedbackMs,firstStatusFeedbackMs,
   finishedViewMs:lastMatchingDrawMs,
   frameGapsMs:frameGaps,longestFrameGapMs:Math.max(0,...frameGaps),drawCpuMs:drawTimes,
   workerJobs:workerTiming?app.controller.transportState().samples:null,
   workerGenerationBefore:stateBefore.generation,workerGenerationAfter:stateAfter.generation,
   workerRetirements:stateAfter.retirements-stateBefore.retirements,wasmReservedBytes:stateAfter.heapBytes
  };
 }finally{
  cancelAnimationFrame(frame);
  renderer.render=render;
  if(workerTiming)app.controller.measureTransport(false);
 }
}

module.exports={measureInteraction};
