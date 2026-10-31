import {verifyStepDrillExports} from './cad-step-drill-verify.js';
import {nativePartProperties} from './cad-part-properties-native.js';
import {rerunBoundFreeCADNative} from './cad-freecad-rerun-bound-native.js';
import {replaceFreeCADDocumentNative} from './cad-freecad-replacement-native.js';
import {measureCadBore} from './cad-bore-check-native.js';
import {validateAIResultChecks,resolveAIResultTarget} from './cad-ai-result-checks.js';
import {cadMeshCopyNative} from './cad-mesh-copy-native.js';
import {offsetSketchContour} from './sketch-offset-native.js';
import {faceSketchNative} from './cad-face-sketch-native.js';
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
import {createCadDrawingNative} from './cad-drawing-native.js';
import {updateCadProjectParameters} from './cad-project-parameters-native.js';
import {updateCadParameterPatterns} from './cad-linked-pattern-update-native.js';
import {planCadParameterPatterns} from './cad-linked-pattern-update-data.js';
import {createCadLinkedContoursNative,updateCadAssociative} from './cad-linked-contours-native.js';
import {createCadClickMeasureNative} from './cad-click-measure-native.js';
import {createCadAIReferencesNative} from './cad-ai-feature-references-native.js';
import {editCadAIFeaturesNative} from './cad-ai-feature-edits-native.js';
import {validateCadFontLibrary} from './cad-fonts.js';
import {cadFontInfo} from './cad-font-outline.js';

// Transport-independent entry point; the browser and native test thread use
// the same service. Responses carry both worker generation and model revision.
export function createCadWorkerRuntime({createKernel,postMessage,makeRecipe=nativeRecipeForInput,editRecipe=nativeRecipeEdit}={}){
  const hostRequests=new Map();let hostSequence=0;
  let generation=null,ready=null,service=null,kernel=null,router=null,precision=null,tail=Promise.resolve(),closed=false,fonts=[];
  function reply(request,payload){if(!closed&&generation===request.generation)postMessage({id:request.id,generation,revision:request.revision,heapBytes:kernel?.wasmMemory?.buffer?.byteLength??0,...payload});}
  function hostRequest(message,request){return new Promise((resolve,reject)=>{const callId=++hostSequence;hostRequests.set(callId,{message,resolve,reject});reply(message,{type:'hostRequest',callId,request});});}
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
      if(['exportModel','exportMeshes','exportStep'].includes(request.job))await verifyStepDrillExports(service,project,{ids:request.options?.ids});
      if(request.job==='query'&&['svgProjection','drawingProjection'].includes(request.query?.kind))await verifyStepDrillExports(service,project,{ids:request.query.options?.ids});
      switch(request.job){
        case 'patternConsumerChoices':{
          const operation=request.operation,options={oc:kernel,service,collectConsumerChoices:true,freecadRun:value=>hostRequest(message,value),editRecipe:(node,patch)=>editRecipe(kernel,node,patch,{fonts})};
          if(operation?.kind==='projectParameters'){
            if(Object.keys(operation).some(key=>!['kind','data','variantId','consumerBindings'].includes(key))||!project.linkedPatterns?.patterns.length||!planCadParameterPatterns(project,operation.data,{variantId:operation.variantId}).requiresPatternUpdate)throw Error('Eine betroffene Muster-/Parameteränderung für die Bezugswahl wählen.');
            result=await updateCadParameterPatterns(project,operation,options);
          }else if(operation?.kind==='linkedPattern'||operation?.kind==='tool'&&operation.name==='previewRebindDrills')result=await router.run(project,operation,{baseline,progress,...options});
          else throw Error('Unbekannter Auftrag zur gemeinsamen Bezugswahl.');
          if(!result.consumerChoices)throw Error('Der native Auftrag hat keine gesonderte Bezugswahl geliefert.');
          break;
        }
        case 'command':
          if(request.operation?.kind==='freecadBoundRerun')result=await rerunBoundFreeCADNative(project,request.operation,{oc:kernel,service,freecadRun:value=>hostRequest(message,value),editRecipe:(node,patch)=>editRecipe(kernel,node,patch,{fonts})});
          else if(request.operation?.kind==='freecadReplacement')result=await replaceFreeCADDocumentNative(project,request.operation,{oc:kernel,service,freecadRun:value=>hostRequest(message,value),editRecipe:(node,patch)=>editRecipe(kernel,node,patch,{fonts})});
          else if(request.operation?.kind==='featureEdits')result=await editCadAIFeaturesNative(project,request.operation,{oc:kernel,service,router,freecadRun:value=>hostRequest(message,value),editRecipe:(node,patch)=>editRecipe(kernel,node,patch,{fonts})});
          else if(request.operation?.kind==='associativeUpdate')result=await updateCadAssociative(project,request.operation,{oc:kernel,service,freecadRun:value=>hostRequest(message,value),editRecipe:(node,patch)=>editRecipe(kernel,node,patch,{fonts})});
          else if(request.operation?.kind==='projectParameters'){
            if(Object.keys(request.operation).some(key=>!['kind','data','variantId','consumerBindings'].includes(key)))throw Error('Unbekannte Felder der Projektmaß-Aktualisierung.');
            if(project.linkedPatterns?.patterns.length&&planCadParameterPatterns(project,request.operation.data,{variantId:request.operation.variantId}).requiresPatternUpdate)result=await updateCadParameterPatterns(project,request.operation,{oc:kernel,service,freecadRun:value=>hostRequest(message,value),editRecipe:(node,patch)=>editRecipe(kernel,node,patch,{fonts})});
            else if(request.operation.consumerBindings!==undefined)throw Error('Gemeinsame Kopienbezüge benötigen eine betroffene Musteränderung.');
            else if(project.contourLinks?.links.length||request.operation.data?.version===2)result=await updateCadAssociative(project,{...request.operation,kind:'associativeUpdate'},{oc:kernel,service,freecadRun:value=>hostRequest(message,value),editRecipe:(node,patch)=>editRecipe(kernel,node,patch,{fonts})});
            else result={...await updateCadProjectParameters(project,request.operation.data,{service,editRecipe:(node,patch)=>editRecipe(kernel,node,patch,{fonts}),variantId:request.operation.variantId}),changes:[{op:'projectParameters',label:'Projektmaße aktualisieren'}],aliases:{},warnings:[]};
          }else result=await router.run(project,request.operation,{baseline,progress,freecadRun:value=>hostRequest(message,value)});
          if(request.display)result.display=service.display(result.project,request.quality);break;
        case 'rebuild':result={project:await service.rebuild(project,{progress,baseline,restoreUnresolvedSources:request.restoreUnresolvedSources===true})};if(request.display)result.display=service.display(result.project,request.quality);break;
        case 'create':{
          project.nodes.push(service.nativeNode(request.recipe,request.options));result={project:await service.rebuild(project,{progress,baseline})};if(request.display)result.display=service.display(result.project,request.quality);break;
        }
        case 'display':result=service.display(project,request.quality,{colored:!!request.colored,knownMeshes:request.knownMeshes,...(request.ids!==undefined?{ids:request.ids}:{})});break;
        case 'exportMeshes':result=service.exportMeshes(project,request.quality);break;
        case 'exportStep':result=service.exportStep(project);break;
        case 'exportModel':result=service.exportModel(project,request.options);break;
        case 'query':{
          if(request.query?.kind==='stepDrillIntegrity'){result=await verifyStepDrillExports(service,project,request.query.options);break;}
          if(request.query?.kind==='partProperties'){const options=request.query.options;if(!options||Object.keys(options).some(k=>k!=='id'))throw Error('Ein Teil für die Masseprüfung wählen.');const node=service.productionNodes(project,{ids:[options.id]})[0];if(!node)throw Error('Ein sichtbares CAD-Materialteil wählen.');result=nativePartProperties(kernel,node);break;}
          if(request.query?.kind==='featureReference'){result=createCadAIReferencesNative({oc:kernel,service})(project,request.query.options);break;}
          if(request.query?.kind==='drawingProjection'){result=createCadDrawingNative({oc:kernel,service})(project,request.query.options);break;}
          if(request.query?.kind==='linkedFaceCandidate'){result=createCadLinkedContoursNative({oc:kernel,service}).candidate(project,request.query.options);break;}
          if(request.query?.kind==='faceSketch'){
            const options=request.query.options??{};if(Object.keys(options).some(k=>!['nodeId','faceIndex'].includes(k)))throw Error('CAD-Flächenkontur benötigt Teil und Fläche.');
            const node=project.nodes.find(n=>n.id===options.nodeId);if(!node||node.kind!=='cad'||!node.solid)throw Error('Sichtbares natives CAD-Materialteil auswählen.');
            const visible=service.productionNodes(project,{ids:[node.id]});if(!visible.length)throw Error('Sichtbares natives CAD-Materialteil auswählen.');
            const shape=service.worldShape(node);try{result=faceSketchNative(kernel,shape,options.faceIndex);}finally{shape.delete();}break;
          }
          if(request.query?.kind==='sketchOffset'){result=offsetSketchContour(kernel,request.query.options);break;}
          if(request.query?.kind==='jointCollisionSurface'){const options=request.query.options;if(!options||Object.keys(options).some(k=>k!=='id')||typeof options.id!=='string')throw Error('Ein CAD-Teil für die diskrete Kollisionsprüfung wählen.');const copied=cadMeshCopyNative(kernel,project,{target:{rootId:options.id,path:[]},quality:{deflection:.01,angleDegrees:5},readOnly:true});if(copied.node.mesh.triangles.length/3>200000)throw Error('Diskrete Kollisionsprüfung: höchstens 200.000 Dreiecke je CAD-Oberfläche.');result={node:copied.node,quality:copied.report.quality};break;}
          if(request.query?.kind==='thicknessSurface'){
            const node=project.nodes.find(n=>n.id===request.query.options?.id);if(node?.kind!=='cad'||!node.solid)throw Error('Vollständiger CAD-Materialkörper erforderlich.');
            result=service.display({...project,nodes:[node],workplane:{...project.workplane,reference:null}},request.query.options.quality,{colored:false})[0];
            if(result.mesh.triangles.length/3>200000)throw Error('Mehr als 200.000 Anzeigedreiecke. Anzeigequalität reduzieren.');break;
          }
          if(['clickSurface','clickSurfaceDistance'].includes(request.query?.kind)){const measurement=createCadClickMeasureNative({oc:kernel,service});result=measurement[request.query.kind==='clickSurface'?'pick':'distance']({...request.query.options,project});break;}
          if(request.query?.kind==='fontInfo'){result=await cadFontInfo(request.query.options?.base64);break;}
          if(request.query?.kind==='fontLibrary'){fonts=validateCadFontLibrary(request.query.options?.fonts);result={count:fonts.length};break;}
          if(request.query?.kind==='scene'){result=router.scene(project,request.query.options?.selection);break;}
          if(request.query?.kind==='bore'){const check=validateAIResultChecks([{...request.query.options,kind:'bore'}])[0],scene=router.scene(project);result=measureCadBore({oc:kernel,project,object:resolveAIResultTarget(scene,check.target),check});break;}
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
    if(message.type==='hostReply'){const pending=hostRequests.get(message.callId);if(!pending||message.id!==pending.message.id||message.generation!==generation||message.revision!==pending.message.revision)return;hostRequests.delete(message.callId);if(message.ok===true)pending.resolve(message.value);else pending.reject(Object.assign(Error(message.message??'Native Berechnung fehlgeschlagen.'),{code:message.code??'CAD_HOST_ERROR'}));return;}
    if(message.type==='initialize'){
      if(ready)throw Error('CAD-Worker wurde bereits initialisiert.');generation=message.generation;
      // Confirmed input is validated before loading the kernel. No renderer
      // buffers, legacy project or incomplete preview initializes a worker.
      const confirmed=cadProjectSnapshot(message.confirmed);
      ready=Promise.resolve().then(()=>{fonts=validateCadFontLibrary(message.resources?.fonts??[]);return createKernel();}).then(async oc=>{if(closed)throw Error('CAD-Worker wurde geschlossen.');kernel=oc;service=createCadService({oc,finish:createCadFinishNative({oc})});router=createCadCommandRouter({oc,service,makeRecipe:makeRecipe?((type,input)=>makeRecipe(oc,type,input,{fonts})):undefined,editRecipe:editRecipe?((node,patch)=>editRecipe(oc,node,patch,{fonts})):undefined});precision=createCadPrecisionNative({oc,service});await service.rebuild(confirmed,{catalogOnly:true});return service;});ready.catch(()=>{});return;
    }
    if(message.type!=='compute'||!ready||message.generation!==generation)return;
    tail=tail.then(()=>compute(message));
  }
  return {receive,dispose:()=>{closed=true;service?.dispose();},state:()=>({generation,ready:!!service,closed})};
}
