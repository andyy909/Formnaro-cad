
import {createLocalStlConversion} from './cad-stl-converter.js';

export function createStlSymmetryTask(onProgress){
  let worker, native, pending, timer, cancelled=false;
  const abortError=()=>Object.assign(Error('Symmetrieprüfung abgebrochen.'),{name:'AbortError'});
  function stopWorker(){
    clearTimeout(timer);worker?.terminate();worker=null;
  }
  function request(message,transfer){
    return new Promise((resolve,reject)=>{
      const fail=error=>{pending=null;stopWorker();reject(error);};
      pending=fail;
      timer=setTimeout(()=>fail(Error('Zeitgrenze der Symmetrieprüfung erreicht.')),120000);
      worker.onmessage=({data})=>{
        clearTimeout(timer);pending=null;
        if(data.error)fail(Error(data.error));else resolve(data.result);
      };
      worker.onerror=event=>fail(Error(event.message||'Symmetrieprüfung fehlgeschlagen.'));
      worker.postMessage(message,transfer);
    });
  }
  return {
    async cancel(){
      cancelled=true;pending?.(abortError());stopWorker();await native?.cancel();
    },
    async run(file,settings,symmetry){
      try{
        const bytes=await file.arrayBuffer();
        if(cancelled)throw abortError();
        worker=new Worker(new URL('./cad-stl-symmetry-worker.js',import.meta.url),{type:'module'});
        onProgress('Prüfe die Spiegelung am vollständigen Originalnetz …');
        const half=await request({phase:'prepare',bytes,settings:{...symmetry,unit:settings.unit,tolerance:settings.tolerance}},[bytes]);
        if(cancelled)throw abortError();
        native=createLocalStlConversion({onProgress:message=>onProgress('Teilstück · '+message)});
        const halfFile=new File([half.halfBytes],'Symmetry-side.stl');
        const result=await native.run(halfFile,{...settings,unit:1});
        native=null;
        if(cancelled)throw abortError();
        onProgress('Spiegle und vereinige die CAD-Hälfte. Prüfe STEP und Naht …');
        return await request({phase:'finish',bytes:result.bytes},[result.bytes.buffer]);
      }finally{stopWorker();}
    }
  };
}
