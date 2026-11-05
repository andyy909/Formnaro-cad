const fail=message=>{throw Object.assign(Error(message),{code:'MOTION_RANGE_INVALID'});};
export async function checkCadMotionRange(options){
 const controller=new AbortController(),cancel=()=>controller.abort();let expired=false,timer;
 options.signal?.addEventListener('abort',cancel,{once:true});if(options.signal?.aborted)cancel();
 const limit=options.request?.timeLimitMs??30000;if(Number.isFinite(limit)&&limit>=1&&limit<=300000)timer=setTimeout(()=>{expired=true;controller.abort();},limit);
 try{const result=await sampleMotionRange({...options,signal:controller.signal});if(expired&&result.reason==='cancelled')result.reason='time-limit';return result;}
 finally{clearTimeout(timer);options.signal?.removeEventListener('abort',cancel);}
}
async function sampleMotionRange({request,project,revision,currentRevision,checkPose,signal,now=()=>performance.now(),yieldTask=()=>new Promise(resolve=>setTimeout(resolve,0))}){
 if(!request||Object.keys(request).some(k=>!['jointId','from','to','step','pairs','timeLimitMs'].includes(k)))fail('Bewegungsbereich: Antrieb, Bereich und Bauteilpaare wählen.');
 const joint=project.joints?.joints.find(j=>j.id===request.jointId&&j.kind!=='fixed'),{from,to,pairs,step=1,timeLimitMs=30000}=request;
 if(!joint||![from,to,step,timeLimitMs].every(Number.isFinite)||step<1e-6||step>100000||timeLimitMs<1||timeLimitMs>300000||Math.min(from,to)<joint.limits.min||Math.max(from,to)>joint.limits.max)fail('Bereich innerhalb der Gelenkgrenzen und positiven Schritt wählen.');
 if(!Array.isArray(pairs)||!pairs.length||pairs.length>16||pairs.some(p=>!p||Object.keys(p).some(k=>!['leftId','rightId','minimumDistance','allowContact','tolerance'].includes(k))||typeof p.leftId!=='string'||typeof p.rightId!=='string'||p.leftId===p.rightId||p.minimumDistance!==undefined&&(!Number.isFinite(p.minimumDistance)||p.minimumDistance<0||p.minimumDistance>100000)||p.allowContact!==undefined&&typeof p.allowContact!=='boolean')||new Set(pairs.map(p=>[p.leftId,p.rightId].sort().join('\0'))).size!==pairs.length)fail('1–16 eindeutige Bauteilpaare mit gültigen Mindestabständen/Kontaktfreigaben wählen.');
 const distance=Math.abs(to-from),intervals=Math.ceil(distance/step),requestedSamples=intervals+1,sign=to>=from?1:-1,start=now(),collisions=[],failures=[],checkedValues=[],methods=new Map(),minimums=new Map(),classifications={};let reason=null,partialPairCount=0,unknown=false;
 const valueAt=i=>i===intervals?to:from+sign*step*i;
 outer:for(let i=0;i<Math.min(501,requestedSamples);i++){
  if(currentRevision()!==revision)throw Object.assign(Error('Modell während der Bereichsprüfung geändert.'),{code:'STALE_REVISION'});
  if(signal?.aborted){reason='cancelled';break;}if(now()-start>=timeLimitMs){reason='time-limit';break;}
  const value=valueAt(i);partialPairCount=0;
  for(const pair of pairs){
   if(signal?.aborted){reason='cancelled';break outer;}if(now()-start>=timeLimitMs){reason='time-limit';break outer;}
   let result;try{result=await checkPose({...pair,values:[{jointId:joint.id,value}]},{revision,signal});}catch(error){if(signal?.aborted||['ABORTED','CANCELLED'].includes(error.code)){reason='cancelled';break outer;}throw error;}
   if(currentRevision()!==revision)throw Object.assign(Error('Modell während der Bereichsprüfung geändert.'),{code:'STALE_REVISION'});
   if(signal?.aborted){reason='cancelled';break outer;}if(now()-start>=timeLimitMs){reason='time-limit';break outer;}
   methods.set([pair.leftId,pair.rightId].join('\0'),{...pair,method:result.method,...(result.deflectionTargetMm!==undefined?{deflectionTargetMm:result.deflectionTargetMm}:{}),...(result.method==='cad-mesh-approximation'?{approximation:true,maximumErrorGuaranteed:false}:{}),scope:'Positive volume intersection at sampled poses only; no contact or continuous path guarantee.'});
   partialPairCount++;if(result.intersects)collisions.push({...pair,driver:{jointId:joint.id,value,unit:joint.kind==='revolute'?'degree':'mm'},method:result.method,volume:result.volume});
   const key=[pair.leftId,pair.rightId].join('\0'),driver={jointId:joint.id,value,unit:joint.kind==='revolute'?'degree':'mm'};
   if(Number.isFinite(result.distance)&&(!minimums.has(key)||result.distance<minimums.get(key).distance))minimums.set(key,{...pair,distance:result.distance,points:result.points,driver});
   const classification=result.classification??(result.intersects?'interference':'volume-only');classifications[classification]=(classifications[classification]??0)+1;
   if(result.passed===null)unknown=true;if(result.passed===false||result.intersects)failures.push({...pair,driver,classification,volume:result.volume,method:result.method,...(result.points?{points:result.points,distance:result.distance}:{})});
  }
  checkedValues.push(value);partialPairCount=0;await yieldTask();
 }
 if(currentRevision()!==revision)throw Object.assign(Error('Modell während der Bereichsprüfung geändert.'),{code:'STALE_REVISION'});
 if(!reason&&checkedValues.length<requestedSamples)reason='sample-limit';
 return {revision,status:reason?'incomplete':'completed',complete:!reason,passed:failures.length?false:reason||unknown?null:true,reason,jointId:joint.id,unit:joint.kind==='revolute'?'degree':'mm',from,to,step,pairs,methods:[...methods.values()],minimums:[...minimums.values()],classifications,failures,requestedSamples,checkedSamples:checkedValues.length,checkedValues,partialPairCount,uncheckedSamples:requestedSamples-checkedValues.length,uncheckedFrom:checkedValues.length<requestedSamples?valueAt(checkedValues.length):null,collisions,elapsedMs:now()-start,sampledOnly:true,fullMotionGuarantee:false,message:'Prüfung berechneter Stichproben; keine kontinuierliche Bewegungsfreigabe.'};
}
