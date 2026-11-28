// Unattended lab trials: the practice window deliberately pauses on focus loss
// and only a person can resume it. Without a guard the trial silently waits
// until the execution budget expires and is recorded as a model timeout.
// After a grace period the trial ends as an interruption instead, so it can be
// replaced and is never scored as modelling performance.
const FOCUS_LOST_CODE='PRACTICE_FOCUS_LOST';
const DEFAULT_GRACE_MS=30000;
function createFocusGuard({graceMs=DEFAULT_GRACE_MS,onExpire,setTimer=setTimeout,clearTimer=clearTimeout}={}){
 if(!Number.isFinite(graceMs)||graceMs<0||typeof onExpire!=='function')throw Error('Ungültiger Fokuswächter.');
 let timer=null,expired=false,pausedAt=0;
 const disarm=()=>{if(timer)clearTimer(timer);timer=null;};
 return {
  observe(activity){
   if(expired||!activity)return;
   if(['resumed','result','exit'].includes(activity.phase)){disarm();return;}
   if(activity.phase!=='paused'||activity.reason!=='focus-lost'||timer)return;
   pausedAt=Number.isFinite(activity.elapsedMs)?activity.elapsedMs:null;
   timer=setTimer(()=>{timer=null;expired=true;onExpire(Object.assign(Error('Übungsfenster hat den Fokus verloren und wurde nicht fortgesetzt; Versuch als unterbrochen beendet.'),{code:FOCUS_LOST_CODE,graceMs,...(pausedAt===null?{}:{pausedAtMs:pausedAt})}));},graceMs);
  },
  stop:disarm,
 };
}
function abortStatus(reason){
 if(reason?.code===FOCUS_LOST_CODE)return 'interrupted';
 if(reason?.code==='MONITOR_STOP')return 'monitor-stopped';
 if(reason?.name==='TimeoutError')return 'timeout';
 return 'cancelled';
}
module.exports={createFocusGuard,abortStatus,FOCUS_LOST_CODE,DEFAULT_GRACE_MS};
