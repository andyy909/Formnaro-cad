/** One pending frame, explicit invalidation and a separately drained camera.
 * step() can keep computing subpixel damping without drawing every frame. */
export function createCadRenderScheduler({step,render,request=requestAnimationFrame,cancel=cancelAnimationFrame,now=()=>performance.now(),onError=()=>{}}={}){
 let frame=null,dirty=true,closed=false,draining=false,waiters=[];const counters={ticks:0,draws:0,updates:0,stepMs:0,drawMs:0,lastDrawMs:0,lastReason:'initial'};
 function queue(){if(!closed&&frame===null)frame=request(tick);}
 function tick(){frame=null;if(closed)return;try{const start=now(),motion=step();counters.ticks++;counters.stepMs+=now()-start;const draw=dirty||motion.changed||draining&&!motion.moving;dirty=false;draining=motion.moving;
  if(draw){const before=now();render();counters.draws++;counters.updates++;counters.lastDrawMs=now()-before;counters.drawMs+=counters.lastDrawMs;const pending=waiters;waiters=[];pending.forEach(w=>w.resolve());}
  if(dirty||draining)queue();
  }catch(error){if(frame!==null)cancel(frame);frame=null;draining=false;dirty=false;counters.lastError=String(error.message??error);const pending=waiters;waiters=[];pending.forEach(w=>w.reject(error));onError(error);}
 }
 function invalidate(reason='view'){if(closed)return;dirty=true;counters.lastReason=reason;queue();}
 queue();return {invalidate,wake:queue,paint:()=>closed?Promise.resolve():new Promise((resolve,reject)=>{waiters.push({resolve,reject});invalidate('capture');if(frame!==null)cancel(frame);frame=null;tick();}),state:()=>({...counters,pending:frame!==null,dirty,draining,closed}),dispose:()=>{closed=true;if(frame!==null)cancel(frame);frame=null;const pending=waiters;waiters=[];pending.forEach(w=>w.resolve());}};
}
