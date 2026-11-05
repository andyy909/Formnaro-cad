// The bundled kernel exposes reservation, not allocator occupancy. Never infer
// occupied native bytes from BRep sizes or JS handle counts.
export const CAD_MEMORY_POLICY=Object.freeze({retireBytes:1536*1024**2,stopBytes:2*1024**3,runtimeLimitBytes:4*1024**3});
const monitors=new WeakMap();
export function cadNativeMemory(oc){
 if(monitors.has(oc))return monitors.get(oc);
 let live=0,peakHandles=0,peakReserved=0;const samples=[];
 function sample(phase,details={}){const reserved=oc?.wasmMemory?.buffer?.byteLength??0;peakReserved=Math.max(peakReserved,reserved);const js=globalThis.performance?.memory?.usedJSHeapSize??(typeof process!=='undefined'&&process.memoryUsage?process.memoryUsage().heapUsed:null);const value={phase,timeMs:globalThis.performance?.now?.()??Date.now(),wasmReservedBytes:reserved,nativeOccupiedBytes:null,jsHeapBytes:js,trackedHandles:live,peakTrackedHandles:peakHandles,...details};samples.push(value);if(samples.length>48)samples.shift();return value;}
 const monitor={sample,check(phase){const value=sample(phase);if(value.wasmReservedBytes>=CAD_MEMORY_POLICY.stopBytes)throw Object.assign(Error('CAD-Speicherbudget erreicht. Auftrag beendet; bestätigtes Modell bleibt erhalten.'),{code:'CAD_MEMORY_BUDGET',cadPhase:phase});return value;},retain(){live++;peakHandles=Math.max(peakHandles,live);},release(){live--;},state:()=>({wasmReservedBytes:oc?.wasmMemory?.buffer?.byteLength??0,peakReservedBytes:Math.max(peakReserved,oc?.wasmMemory?.buffer?.byteLength??0),nativeOccupiedBytes:null,jsHeapBytes:globalThis.performance?.memory?.usedJSHeapSize??(typeof process!=='undefined'&&process.memoryUsage?process.memoryUsage().heapUsed:null),trackedHandles:live,peakTrackedHandles:peakHandles,trackedHandleCoverage:'screw construction and boolean temporaries; not all OCCT allocations',samples:samples.map(x=>({...x})),policy:CAD_MEMORY_POLICY})};monitors.set(oc,monitor);return monitor;
}
export function cadNativeScope(oc,phase){
 const objects=new Set(),memory=cadNativeMemory(oc);memory.check(phase+'-begin');
 const api={keep(value){if(objects.has(value))throw Error('Native object already owned.');objects.add(value);memory.retain();return value;},release(value){if(!objects.delete(value))throw Error('Native object not owned.');memory.release();return value;},drop(value){api.release(value);value?.delete?.();},close(){for(const value of [...objects].reverse()){objects.delete(value);memory.release();value?.delete?.();}memory.sample(phase+'-released');}};return api;
}
