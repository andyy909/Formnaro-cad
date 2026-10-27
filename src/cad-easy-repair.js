import {flags} from './organization.js';
import {meshProtectionRegions} from './mesh-protection.js';

const MAX_IDS=512,MAX_DIGESTS=128;
const validDigest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);

/** Deferred, view-independent repairs. Only confirmed transactions enter Undo;
 * neither a selection change nor a decorative preview is needed. */
export function createEasyMeshRepair({controller,isEnabled,isIdle,isVisible=()=>true,notify=()=>{},afterApply=async()=>{},delay=350,setTimer=setTimeout,clearTimer=clearTimeout}){
  const processed=new WeakSet(),history=new Map();
  let timer=null,activeTask=null,generation=0,running=false,pending=false,attempts=0,repaired=0,unrepairable=0,failures=0;
  function digests(id){return history.get(id)??new Set();}
  function remember(id,...values){
    const known=digests(id);
    for(const value of values)if(validDigest(value)){known.add(value);while(known.size>MAX_DIGESTS)known.delete(known.values().next().value);}
    if(!known.size)return;
    history.delete(id);history.set(id,known);
    while(history.size>MAX_IDS)history.delete(history.keys().next().value);
  }
  function allowed(node,project){
    if(node?.kind!=='mesh'||!node.mesh||!isVisible(node.id,node,project))return false;
    const state=flags(node,project);
    return !state.hidden&&!state.locked&&!meshProtectionRegions(node).length;
  }
  const eligible=(node,project)=>allowed(node,project)&&!processed.has(node.mesh);
  function start(){if(!activeTask)activeTask=run().finally(()=>{activeTask=null;});return activeTask;}
  function queue(){
    if(timer!==null||running||!pending||!isEnabled())return;
    timer=setTimer(()=>{timer=null;void start();},delay);
  }
  function schedule(){
    if(!isEnabled()){if(timer!==null)clearTimer(timer);timer=null;pending=false;return;}
    pending=true;queue();
  }
  function invalidate(){
    generation++;pending=false;
    if(timer!==null)clearTimer(timer);
    timer=null;
  }
  async function flush(){
    const ticket=generation;
    if(timer!==null)clearTimer(timer);
    timer=null;
    if(!isEnabled()){pending=false;return;}
    pending=true;
    // Sharing the running promise serializes an early tool click with an
    // already pending repair. It never awaits itself from a state callback.
    if(activeTask)await activeTask;
    while(generation===ticket&&pending&&isEnabled()&&isIdle()){
      if(timer!==null)clearTimer(timer);
      timer=null;
      await start();
    }
  }
  async function run(){
    if(running||!pending||!isEnabled())return;
    // A later UI state notification retries once the gesture/dialog ends.
    if(!isIdle())return;
    pending=false;running=true;
    const ticket=generation,revision=controller.revision();
    const current=()=>generation===ticket&&isEnabled()&&isIdle()&&controller.revision()===revision;
    let previewId;
    try{
      const project=controller.readSnapshot();
      for(const node of project.nodes){
        if(!current())break;
        if(!eligible(node,project))continue;
        attempts++;
        let result;
        try{result=await controller.meshQuery('toolsQuery',{kind:'autoRepair',id:node.id,attemptedDigests:[...digests(node.id)]});}
        catch{if(current()){processed.add(node.mesh);failures++;}continue;}
        if(!current()||!allowed(node,project))break;
        processed.add(node.mesh);
        const known=digests(node.id).has(result?.geometryDigest);
        remember(node.id,result?.geometryDigest,result?.outputDigest);
        if(result?.status==='unrepairable'){
          if(!known){unrepairable++;notify('Netz konnte nicht automatisch repariert werden.');}
          continue;
        }
        if(result?.status!=='repaired'||known)continue;
        const operation=result.operation;
        if(!validDigest(result.geometryDigest)||!validDigest(result.outputDigest)||!['mesh-simple-repair','mesh-repair'].includes(operation?.type)||operation.id!==node.id){failures++;continue;}
        const proposal=await controller.preview(operation,{revision,label:'Netz automatisch reparieren'});
        previewId=proposal.previewId;
        if(!current()||!allowed(node,project)||proposal.revision!==revision||proposal.resultRevision===revision){controller.discard(previewId);previewId=undefined;break;}
        const applied=controller.apply({previewId,revision});previewId=undefined;
        if(applied.changed){repaired++;notify('Netz automatisch repariert. Rückgängig ist möglich.');pending=true;await afterApply();}
        // Applying changes the project revision. Start the next root only
        // after the normal renderer refresh and another idle interval.
        break;
      }
    }catch{failures++;}
    finally{
      if(previewId!==undefined)controller.discard(previewId);
      running=false;
      if(!isEnabled())pending=false;
      if(pending&&isEnabled()&&isIdle())queue();
    }
  }
  return {schedule,flush,invalidate,cancel:invalidate,state:()=>({running,pending,attempts,repaired,unrepairable,failures,historyIds:history.size,historyDigests:[...history.values()].reduce((n,values)=>n+values.size,0)})};
}
