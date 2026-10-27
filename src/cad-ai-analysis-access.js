export function trackedAIAnalysis(analyze,setBusy){
 return async(requests,options)=>{setBusy(true);try{return await analyze(requests,options);}finally{setBusy(false);}};
}
