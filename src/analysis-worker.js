import Module from 'manifold-3d/manifold';
import {setKernel,groupNodes,booleanManifold,stlBinary,objString,fitParameters} from './geometry.js';
import {synchronizeHistory,adoptComputedHistory} from './history.js';
import {computedRenderData} from './render-data.js';
import {coloredParts,threeMF,gltf,svgProjection} from './exports.js';
import {inspectModel} from './model-analysis.js';
import {sectionGeometry} from './section-geometry.js';
import {initCad,cadEdges,finishNode,importStep,exportStep} from './cad-kernel.js';
import {hasFinishing} from './cad-data.js';
let ready;
async function init(wasmUrl){const wasmBinary=wasmUrl.startsWith('data:')?Uint8Array.from(atob(wasmUrl.split(',')[1]),c=>c.charCodeAt(0)):new Uint8Array(await(await fetch(wasmUrl)).arrayBuffer());const m=await Module({wasmBinary});m.setup();setKernel(m);}
self.onmessage=async({data})=>{const {jobId,revision}=data,post=d=>self.postMessage({...d,jobId,revision});try{
  await(ready??=init(data.wasmUrl));post({working:true,progress:0});const {job,nodes,format}=data;
  if(job.startsWith('cad-')||hasFinishing(nodes||[]))await initCad(data.cadWasmUrl);
  if(job==='cad-edges'){post({done:true,result:cadEdges(data.node)});return;}
  if(job==='cad-finish'){const node=finishNode(data.node,data.request);post({done:true,result:{node,renders:computedRenderData([node])}});return;}
  if(job==='cad-step-import'){post({done:true,result:importStep(data.bytes)});return;}
  if(job==='cad-step-export'){const output=exportStep(nodes),m=booleanManifold(nodes);try{post({done:true,result:{output,triangles:m.numTri(),volume:m.volume()}});}finally{m.delete();}return;}
  if(job==='group'){const node=groupNodes(nodes,data.operation);post({done:true,result:{node,renders:computedRenderData([node])}});return;}
  if(job==='edit'){
    adoptComputedHistory(nodes,data.baseline);
    const fitIds=new Set(data.fitIds||[]);function fit(n){if(fitIds.has(n.id))fitParameters(n);(n.children||[]).forEach(fit);}nodes.forEach(fit);synchronizeHistory(nodes);
    post({done:true,result:{nodes,renders:computedRenderData(nodes)}});return;
  }
  if(job==='export'){const m=booleanManifold(nodes);try{const output=format==='stl'?stlBinary(m):format==='obj'?objString(m):format==='3mf'?threeMF(nodes.flatMap(coloredParts)):format==='gltf'?gltf(nodes.flatMap(coloredParts)):svgProjection(m);post({done:true,result:{output,triangles:m.numTri(),volume:m.volume()}});}finally{m.delete();}return;}
  if(job==='section'){post({done:true,result:sectionGeometry(nodes,data.plane,p=>post({progress:p}))});return;}
  if(job==='inspect'){post({done:true,result:inspectModel(nodes,{threshold:data.threshold,quality:data.quality,progress:p=>post({progress:p})})});return;}
  throw Error('Unbekannter Berechnungsauftrag.');
}catch(e){post({error:e.message});}};

