// Apply tempo only to presentation time, never to geometry or input validation.
export function createPracticePlayback({checkpoint,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),now=()=>performance.now()}={}){
 let multiplier=2;
 return {setTempo(value){if(!Number.isFinite(Number(value))||Number(value)<1/3||Number(value)>10)throw Error('Ungültiges Übungstempo.');multiplier=Number(value);},multiplier:()=>multiplier,
  async delay(milliseconds){let remaining=milliseconds;while(remaining>0){await checkpoint();const factor=multiplier,started=now();await wait(Math.min(100,remaining*factor));remaining-=Math.max(0,now()-started)/factor;}await checkpoint();}
 };
}
