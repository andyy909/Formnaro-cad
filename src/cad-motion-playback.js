import {compileCadJointMotion} from './cad-joints-data.js';

const invalid=message=>{throw Object.assign(Error(message),{code:'MOTION_INVALID'});};
/** Playback owns only a compiled motion and display matrices. No controller
 * preview/apply/describe/query or native worker is reachable from this loop. */
export async function playCadMotion({project,revision,currentRevision,view,tracks,frames=61,signal,onFrame=()=>{},wait=()=>new Promise(resolve=>requestAnimationFrame(resolve))}){
 if(!Array.isArray(tracks)||!tracks.length||tracks.length>256||new Set(tracks.map(t=>t.jointId)).size!==tracks.length||!Number.isSafeInteger(frames)||frames<2||frames>501)invalid('2–501 Bilder und eindeutige Bewegungsgrößen wählen.');
 for(const t of tracks)if(!t||Object.keys(t).some(k=>!['jointId','from','to'].includes(k))||typeof t.jointId!=='string'||![t.from,t.to].every(Number.isFinite))invalid('Gültigen Anfangs- und Endwert wählen.');
 const motion=compileCadJointMotion(project);let captured=0,status='completed',error;
 const current=()=>{if(currentRevision()!==revision)throw Object.assign(Error('Modell während der Wiedergabe geändert.'),{code:'STALE_REVISION'});if(signal?.aborted)throw Object.assign(Error('Wiedergabe abgebrochen.'),{name:'AbortError',code:'ABORTED'});};
 try{
  for(let index=0;index<frames;index++){
   current();const values=tracks.map(t=>({jointId:t.jointId,value:t.from+(t.to-t.from)*index/(frames-1)})),pose=motion.preview(values);
   view.setJointPreview(pose.placements);await wait();current();
   await onFrame({index,frames,revision,values:pose.values,placements:pose.placements});captured++;current();
  }
 }catch(e){status=e.code==='ABORTED'?'cancelled':'failed';error={code:e.code??'MOTION_CAPTURE_FAILED',message:e.message};}
 finally{view.clearJointPreview({restore:true});}
 return {status,complete:status==='completed',revision,requestedFrames:frames,capturedFrames:captured,unrecordedFrames:frames-captured,...(error?{error}:{}),modelChanged:false,scope:'Display matrices and coupled joint values; no native construction or measurements per frame.'};
}
