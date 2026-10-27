const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
exports.runPerformance=async({win,app,js,pause,proof,initialLoadMs})=>{
 const median=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
 await js(`window.__mini.actions.add('box')`);const template=(await js(`window.__mini.snapshot()`)).nodes[0];
 const nodes=Array.from({length:36},(_,i)=>({...structuredClone(template),id:'performance-'+i,name:'Test '+i,pos:[(i%6)*28,Math.floor(i/6)*28,10]}));
 await js(`window.__mini.replace({format:'Formnaro-Mini-CAD',version:1,name:'Leistung',nodes:${JSON.stringify(nodes)}})`);
 const phase=async()=>{
  const values={move:[],rotate:[],scale:[]};
  for(const kind of Object.keys(values))for(let i=0;i<10;i++){
   const ms=await js(`(async()=>{const p=window.__mini.snapshot();for(const n of p.nodes){${kind==='move'?'n.pos[0]+=.31;':kind==='rotate'?'n.rot[2]+=13.7;':'n.size=n.size.map(v=>v*1.0002);'}}const t=performance.now();await window.__mini.replace(p);return performance.now()-t;})()`);
   if(i>=3)values[kind].push(ms);
  }
  await js(`window.__mini.fit()`);const cpu0=app.getAppMetrics().map(p=>({pid:p.pid,cpu:p.cpu.cumulativeCPUUsage}));await pause(1000);const cpu1=app.getAppMetrics();
  return {samples:values,medianMs:Object.fromEntries(Object.entries(values).map(([k,v])=>[k,median(v)])),idleCpuSeconds:cpu1.reduce((sum,p)=>sum+Math.max(0,p.cpu.cumulativeCPUUsage-(cpu0.find(x=>x.pid===p.pid)?.cpu||p.cpu.cumulativeCPUUsage)),0),memory:cpu1.map(p=>({type:p.type,workingSetKB:p.memory.workingSetSize})),resources:await js(`performance.getEntriesByType('resource').filter(x=>/ai-|worker|wasm/.test(x.name)).map(x=>({name:x.name.split('/').pop(),bytes:x.transferSize}))`)};
 };
 const cold=await phase();let afterAI=null;
 if(process.env.FORMNARO_MINI_PERF_AI){await js(`window.__mini.loadAI().then(a=>a.access.sceneForAI()).then(()=>true)`);afterAI=await phase();}
 await js(`(async()=>{const t=window.__mini.snapshot().nodes[0],nodes=Array.from({length:12},(_,i)=>({...t,id:'step-sphere-'+i,name:'STEP-Kugel '+i,type:'sphere',size:[16,16,16],params:undefined,pos:[i%4*22,Math.floor(i/4)*22,8],rot:[0,0,0]}));const buffer=await window.__mini.request('export-step',nodes),imported=await window.__mini.request('import',{name:'STEP-Kugeln.step',buffer});await window.__mini.replace({format:'Formnaro-Mini-CAD',version:1,name:'12 echte STEP-Kugeln',nodes:[imported]});})()`);
 const stepSpheres=await phase();
 const result={ok:true,stepSpheres,version:app.getVersion(),packaged:app.isPackaged,initialLoadMs,cold,afterAI};fs.writeFileSync(path.join(proof,'performance.json'),JSON.stringify(result,null,2));return result;
};
