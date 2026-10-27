import {aiFeedback} from './ai-feedback.js';
import {checkCadAIResultNative} from './cad-ai-result-checks-native.js';
import {createCadService} from './cad-service.js';
import {cadProjectSnapshot,cadProjectRevision} from './cad-project.js';
import {createCadFinishNative} from './cad-finish-native.js';
import {createCadToolsNative} from './cad-tools-native.js';
import {createCadTransactions} from './cad-transactions.js';
import {createCadCommandRouter} from './cad-command-router.js';
import {nativeRecipeForInput,nativeRecipeEdit} from './cad-form-runtime.js';
import {createCadPrecisionNative} from './cad-precision-native.js';
import {validateCadFontLibrary} from './cad-fonts.js';
import {cadFontInfo} from './cad-font-outline.js';

// Transport-independent entry point; the browser and native test thread use
// the same service. Responses carry both worker generation and model revision.
export function createCadWorkerRuntime({createKernel,postMessage,makeRecipe=nativeRecipeForInput,editRecipe=nativeRecipeEdit}={}){
  let generation=null,ready=null,service=null,kernel=null,router=null,precision=null,tail=Promise.resolve(),closed=false,fonts=[];
  function reply(request,payload){if(!closed&&generation===request.generation)postMessage({id:request.id,generation,revision:request.revision,heapBytes:kernel?.wasmMemory?.buffer?.byteLength??0,...payload});}
  async function compute(message){
    const importJob=message.request?.job==='command'&&message.request?.operation?.kind==='importStlHousing';
    // Successful worker retirement is requested by the controller after an
    // empty model is committed, never while an empty preview is unconfirmed.
    const recycle=(failed=false)=>failed&&importJob&&(kernel?.wasmMemory?.buffer?.byteLength??0)>=512*1024*1024;
    try{
      await ready;if(closed||generation!==message.generation)return;
      const request=message.request,readOnly=['display','query','exportMeshes','exportStep','exportModel'].includes(request.job),project=cadProjectSnapshot(request.project);
      // Read-only requests without a separate baseline have exactly one input.
      // Validate and hash it once; editing jobs still own independent copies.
      const baseline=readOnly&&request.baseline==null?project:cadProjectSnapshot(request.baseline??request.project),baselineRevision=cadProjectRevision(baseline);
      if(baselineRevision!==message.revision){const error=Error('CAD-Worker erhielt ein anderes Ausgangsmodell.');error.code='STALE_REVISION';throw error;}
      if(readOnly&&(baseline===project?baselineRevision:cadProjectRevision(project))!==message.revision){const error=Error('CAD-Abfragen und Export benötigen den bestätigten Modellstand.');error.code='UNCONFIRMED_PROJECT';throw error;}
      const progress=value=>reply(message,{type:'progress',value});let result;
      switch(request.job){
        case 'command':result=await router.run(project,request.operation,{baseline,progress});if(request.display)result.display=service.display(result.project,request.quality);break;
        case 'rebuild':result={project:await service.rebuild(project,{progress,baseline})};if(request.display)result.display=service.display(result.project,request.quality);break;
        case 'create':{
          project.nodes.push(service.nativeNode(request.recipe,request.options));result={project:await service.rebuild(project,{progress,baseline})};if(request.display)result.display=service.display(result.project,request.quality);break;
        }
        case 'display':result=service.display(project,request.quality,{colored:!!request.colored,knownMeshes:request.knownMeshes});break;
        case 'exportMeshes':result=service.exportMeshes(project,request.quality);break;
        case 'exportStep':result=service.exportStep(project);break;
        case 'exportModel':result=service.exportModel(project,request.options);break;
        case 'query':{
          if(request.query?.kind==='fontInfo'){result=await cadFontInfo(request.query.options?.base64);break;}
          if(request.query?.kind==='fontLibrary'){fonts=validateCadFontLibrary(request.query.options?.fonts);result={count:fonts.length};break;}
          if(request.query?.kind==='scene'){result=router.scene(project,request.query.options?.selection);break;}
          if(request.query?.kind==='aiResultChecks'){result=checkCadAIResultNative({oc:kernel,project,scene:router.scene(project),checks:request.query.options?.checks,aliases:request.query.options?.aliases});break;}
          if(request.query?.kind==='bounds'&&request.query.options?.targets){result=router.bounds(project,request.query.options);break;}
          const nativeQueries=['edges','edgesInRectangle','section','svgProjection','wallThickness','collision'];
          if(nativeQueries.includes(request.query?.kind)){
            const options=request.query.options??{},node=id=>{const value=project.nodes.find(n=>n.id===id);if(!value||value.kind!=='cad')throw Error('CAD-Präzisionsziel fehlt oder ist eine Netzreferenz.');return value;};
            if(request.query.kind==='collision')result=precision.collision({...options,left:node(options.leftId),right:node(options.rightId)});
            else if(request.query.kind==='svgProjection')result=precision.svgProjection({...options,nodes:service.productionNodes(project,{ids:options.ids})});
            else result=precision[request.query.kind]({...options,node:node(options.nodeId),revision:message.revision});break;
          }
          const store=createCadTransactions({initial:project,build:p=>service.rebuild(p)}),tools=createCadToolsNative({oc:kernel,service,transactions:store});
          if(!['bounds','rayPick','minimumDistance','referencePoints'].includes(request.query?.kind))throw Error('Unbekannte native CAD-Abfrage.');result=tools[request.query.kind](request.query.options);break;
        }
        case 'importStep':project.nodes.push(service.stepNode(request.bytes,request.options));result={project:await service.rebuild(project,{progress,baseline})};if(request.display)result.display=service.display(result.project,request.quality);break;
        default:throw Error('Unbekannter CAD-Workerauftrag.');
      }
      reply(message,{type:'result',result,recycleWorker:recycle()});
    }catch(error){const fatal=error instanceof WebAssembly.RuntimeError;reply(message,{type:'error',recycleWorker:recycle(true),code:fatal?'CAD_KERNEL_FATAL':error.code||'CAD_ERROR',feedback:aiFeedback({code:fatal?'CAD_KERNEL_FATAL':error.code||'CAD_ERROR',message:error.message,feedback:error.feedback}),phase:error.cadPhase,stack:String(error.stack??'').slice(0,12000),message:fatal?'Die CAD-Berechnung musste beendet werden. Das bisherige Modell bleibt erhalten; bitte erneut versuchen.':error.message||'CAD-Workerauftrag fehlgeschlagen.'});}
  }
  function receive(message){
    if(closed)return;
    if(message.type==='initialize'){
      if(ready)throw Error('CAD-Worker wurde bereits initialisiert.');generation=message.generation;
      // Confirmed input is validated before loading the kernel. No renderer
      // buffers, legacy project or incomplete preview initializes a worker.
      const confirmed=cadProjectSnapshot(message.confirmed);
      ready=Promise.resolve().then(()=>{fonts=validateCadFontLibrary(message.resources?.fonts??[]);return createKernel();}).then(async oc=>{if(closed)throw Error('CAD-Worker wurde geschlossen.');kernel=oc;service=createCadService({oc,finish:createCadFinishNative({oc})});router=createCadCommandRouter({oc,service,makeRecipe:makeRecipe?((type,input)=>makeRecipe(oc,type,input,{fonts})):undefined,editRecipe:editRecipe?((node,patch)=>editRecipe(oc,node,patch,{fonts})):undefined});precision=createCadPrecisionNative({oc,service});await service.rebuild(confirmed);return service;});ready.catch(()=>{});return;
    }
    if(message.type!=='compute'||!ready||message.generation!==generation)return;
    tail=tail.then(()=>compute(message));
  }
  return {receive,dispose:()=>{closed=true;service?.dispose();},state:()=>({generation,ready:!!service,closed})};
}
