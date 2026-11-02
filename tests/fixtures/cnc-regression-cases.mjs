import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Matrix4} from 'three';
import {loadCadKernel} from '../../src/cad-kernel-loader.js';
import {createCadService} from '../../src/cad-service.js';
import {createCadProject,parseCadProject,cadProjectRevision} from '../../src/cad-project.js';
import {createCadController} from '../../src/cad-controller.js';
import {createCadAutomationAccess} from '../../src/cad-automation-access.js';
import {Worker} from 'node:worker_threads';
import {compileCadJointMotion} from '../../src/cad-joints-data.js';
const [name,file]=process.argv.slice(2),send=value=>process.send?.(value),hash=value=>createHash('sha256').update(value).digest('hex');
// No native kernel starts until the parent establishes its OS memory limit.
await new Promise(resolve=>process.once('message',value=>{if(value.start)resolve();}));
const thread=(diameter,pitch,length,kind='external',outerDiameter=diameter,leadIn=0)=>({type:'thread',size:[outerDiameter,outerDiameter,length],params:{kind,profile:'trapezoid',diameter,pitch,length,hand:'right',starts:1,phase:0,clearance:kind==='nut'?.18:0,outerShape:'round',outerDiameter,head:'none',leadIn}});
let phase='initialization',oc,service,controller;
const step=value=>{phase=value;send({type:'phase',phase,timeMs:Date.now(),heapBytes:oc?.wasmMemory?.buffer.byteLength??0,rss:process.memoryUsage().rss});};
const factory=()=>{const worker=new Worker(new URL('./cad-node-worker.mjs',import.meta.url)),adapter={postMessage:v=>worker.postMessage(v),terminate:()=>worker.terminate()};worker.on('message',v=>{send({type:'worker',heapBytes:v.heapBytes,phase:v.phase,memory:v.memory??v.value?.memory,commandIndex:v.value?.commandIndex,progress:v.type==='progress'?v.value:undefined});adapter.onmessage?.({data:v});});worker.on('error',e=>adapter.onerror?.(e));return adapter;};
async function run(){
 if(name==='post-commit-refresh'){
  controller=createCadController({createWorker:factory});
  const access=createCadAutomationAccess({controller,getModelChecksEnabled:()=>false,refresh:async()=>{throw Object.assign(Error('Injected display failure after real commit'),{code:'CAD_KERNEL_FATAL'});}});
  const preview=await access.preview({revision:controller.revision(),commands:[{op:'create',type:'box',size:[10,8,4],as:'box'}],checks:[]});
  const before=controller.revision(),depth=controller.state().undo;let reply,error;
  step('apply-then-refresh');try{reply=await access.apply({revision:preview.revision,previewId:preview.previewId});}catch(e){error={code:e.code,message:e.message};}
  return {status:error?'reproduced':'completed',error,reply,revisionChanged:before!==controller.revision(),undoDelta:controller.state().undo-depth};
 }
 if(name==='memory-after-commit')return (await import('./cad-memory-thread-acceptance.mjs')).recoveryAfterCommit();
 if(name==='memory-recovery')return (await import('./cad-memory-thread-acceptance.mjs')).memoryRecovery();
 if(['large-project','correction-eight','scene-display-loop','memory-workflow','anchor-cnc'].includes(name)&&!file)return {status:'test-data-missing'};
 if(name==='large-project'){
  step('parse-project');const raw=readFileSync(file),project=parseCadProject(raw.toString('utf8'));
  return {status:'completed',bytes:raw.length,clientResponseLimit:32*1024*1024,exceedsClientLimit:raw.length>32*1024*1024,sha256:hash(raw),roots:project.nodes.length,joints:project.joints.joints.length};
 }
 if(name!=='memory-workflow'){oc=await loadCadKernel({print:()=>{},printErr:()=>{}});service=createCadService({oc});}
 if(name.startsWith('thread-variant')||['thread-comparison','thread-roundtrip','geometry-cache-display','thread-reference','thread-segmented'].includes(name))return (await import('./cad-memory-thread-acceptance.mjs')).threadAcceptance(name,oc,service);
 if(name==='cnc-final')return (await import('./cnc-final-acceptance.mjs')).runCncFinal(service,file,step);
 if(name==='rotation'){
  step('construct-thread');const node=service.nativeNode(thread(16,4,20),{id:'rotation-thread'}),brep=hash(node.brep.data),rows=[];
  for(const angle of [0,3.004649258303339,12,45,90]){
   step('rotation-'+angle);const current=structuredClone(node);current.transform=new Matrix4().makeRotationX(angle*Math.PI/180).toArray();
   try{const rebuilt=await service.rebuild(createCadProject({nodes:[current]}));rows.push({angle,ok:true,sameLocalBrep:hash(rebuilt.nodes[0].brep.data)===brep});}catch(e){rows.push({angle,ok:false,error:{code:e.code,message:e.message}});}
  }
  return {status:rows.every(r=>r.ok&&r.sameLocalBrep)?'completed':'reproduced',rows};
 }
 if(['long-thread','nut-x','nut-tilt'].includes(name)){
  step('construct-'+name);const recipe=name==='long-thread'?thread(12,4,248,'external',12,.5):name==='nut-x'?thread(12,4,24,'nut',24):thread(10,2,12,'nut',20);
  const transform=name==='nut-x'?new Matrix4().makeRotationY(Math.PI/2).toArray():name==='nut-tilt'?new Matrix4().makeRotationX(Math.atan2(15,37)).toArray():undefined;
  const node=service.nativeNode(recipe,{id:name,...(transform?{transform}:{})});return {status:'completed',stats:node.stats,brepBytes:node.brep.data.length,memory:service.memoryState()};
 }
 const original=readFileSync(file),project=parseCadProject(original.toString('utf8')),revision=cadProjectRevision(project);
 if(name==='anchor-cnc'){
  const {cadSelectionContext,cadFormLocalDimensions}=await import('../../src/cad-interface-state.js'),{cadPoint}=await import('../../src/cad-affine.js');let target;
  const visit=(node,rootId,path=[])=>{if(node.name==='X-Mutteraufnahme')target={rootId,path};for(const child of node.children??[])visit(child,rootId,[...path,child.id]);};project.nodes.forEach(node=>visit(node,node.id));if(!target)throw Error('CNC target missing');
  const context=cadSelectionContext(project,target),node=structuredClone(context.node);node.transform=[...context.world];const normalize=n=>{n.layerId='default';n.folderId=null;n.children?.forEach(normalize);};normalize(node);
  const small=await service.rebuild(createCadProject({nodes:[node]}));controller=createCadController({initial:small,createWorker:factory});const access=createCadAutomationAccess({controller,getModelChecksEnabled:()=>false});const initial=controller.serialize(),before=(await controller.describe()).objects.find(o=>!o.target.path.length),size=cadFormLocalDimensions(small.nodes[0]);size[0]*=.8;size[1]*=.8;
  const preview=await access.preview({revision:controller.revision(),commands:[{op:'update',target:node.id,set:{size,sizeAnchor:'center'}}],checks:[]}),after=preview.scene.objects.find(o=>!o.target.path.length);if(before.worldBounds.center.some((v,k)=>Math.abs(v-after.worldBounds.center[k])>1e-7))throw Error('CNC center moved');const applied=await access.apply({previewId:preview.previewId,revision:preview.revision});if(!applied.applied)throw Error('CNC isolated apply failed');controller.undo();if(controller.serialize()!==initial)throw Error('CNC anchor Undo failed');
  return {status:'completed',scope:'Exact CNC source extracted into isolated native test; original root parent matrix retained as world placement',originalTarget:target,sourceId:node.id,centerBefore:before.worldBounds.center,centerAfter:after.worldBounds.center,changes:preview.changes,undoPreserved:true,inputUnchanged:hash(readFileSync(file))===hash(original)};
 }
 if(name==='correction-eight'){
  // Exact original eight-command intent, retargeted by retained source names
  // to the final saved copy. This is not the unavailable pre-failure snapshot.
  controller=createCadController({initial:project,createWorker:factory});
  const find=n=>{let result;const visit=(node,rootId,path=[])=>{if(node.name===n)result={rootId,path};node.children?.forEach((c,i)=>visit(c,rootId,[...path,c.id]));};project.nodes.forEach(n=>visit(n,n.id));if(!result)throw Error('Missing source '+n);return result;};
  const table=find('05 · Schwenkbarer T-Nutentisch').rootId,saddle=find('04 · Y-Schlitten und Kippböcke').rootId,U=[110,-70,102],L=Math.hypot(15,37),dir=[0,-15/L,37/L];
  const commands=[{op:'update',target:find('X-Mutteraufnahme'),set:{pos:[0,34,300]}},{op:'update',target:find('Kipp-Anlenkarm'),set:{size:[28,16,20],pos:[88,-70,106]}},{op:'update',target:find('Oberer Gelenkbolzen'),set:{size:[8,8,34],pos:[110,-70,102]}},{op:'update',target:find('Handkurbelgriff'),set:{pos:U.map((v,i)=>i===0?120:v-dir[i]*55)}},{op:'create',type:'box',as:'forkOuter',size:[4,16,20],pos:[124,-70,106],parent:table,space:'local'},{op:'create',type:'box',as:'forkBridge',size:[28,16,6],pos:[112,-70,116],parent:table,space:'local'},...[94,126].map(x=>({op:'create',type:'cylinder',as:'clevisBore'+x,size:[8.4,8.4,14],pos:[x,-55,65],rot:[0,90,0],solid:false,parent:saddle,space:'local'}))];
  const access=createCadAutomationAccess({controller,getModelChecksEnabled:()=>false,getLivePreviewEnabled:()=>true}),rows=[];
  for(const mode of ['inherit','final'])for(let repetition=0;repetition<2;repetition++){
   step('eight-command-'+mode+'-'+repetition);const result=await access.preview({revision,commands,checks:[],intermediateDisplay:mode});controller.discard(result.previewId);rows.push({mode,repetition,worker:controller.state().worker});
   if(repetition===0){let failed=false;try{await access.preview({revision,commands:[...commands,{op:'update',target:'deliberately-missing',set:{pos:[0,0,0]}}],checks:[],intermediateDisplay:mode});}catch(error){failed=true;}if(!failed)throw Error('Injected correction failure was not rejected');}
   if(controller.revision()!==revision||controller.state().undo!==0)throw Error('Correction failure changed confirmed model');
  }
  return {status:'completed',rows,unchanged:true,undo:0,scope:'Original command intent on final saved copy; no original pre-failure snapshot'};
 }
 if(name==='memory-workflow'){
  controller=createCadController({createWorker:factory});await controller.open(project);const baselineRevision=controller.revision(),baselineUndo=controller.state().undo,rows=[];let controlledStop=null;
  for(let i=0;i<6;i++){
   step('workflow-motion-'+i);const p=await controller.previewJoints({action:'move',values:[{jointId:'cnc-X',value:i%2?24:-24}]});controller.apply({previewId:p.previewId,revision:p.revision});
   try{await controller.describe();await controller.display();rows.push({iteration:i,revision:controller.revision(),undo:controller.state().undo,worker:controller.state().worker});}catch(error){if(error.code!=='CAD_MEMORY_BUDGET')throw error;controlledStop={code:error.code,iteration:i};break;}
  }
  const depth=controller.state().undo;for(let i=baselineUndo;i<depth;i++)controller.undo();if(controller.revision()!==baselineRevision)throw Error('Undo lost original confirmed model');await controller.describe();const recovered=await createCadAutomationAccess({controller,getModelChecksEnabled:()=>false}).preview({revision:controller.revision(),commands:[{op:'create',type:'box',size:[2,2,2],as:'recovered'}],checks:[]});controller.discard(recovered.previewId);
  return {status:'completed',rows,controlledStop,undoRestored:true,recovered:true,inputUnchanged:hash(readFileSync(file))===hash(original),worker:controller.state().worker};
 }
 if(name==='scene-display-loop'){
  let current=project;const heaps=[],motion=compileCadJointMotion(project);
  for(let i=0;i<4;i++){
   step('motion-'+i);const moved=motion.preview([{jointId:'cnc-X',value:i%2?24:-24}]);current=structuredClone(project);for(const placement of moved.placements)current.nodes.find(node=>node.id===placement.rootId).transform=placement.transform;current.joints=motion.data();
   step('rebuild-'+i);current=await service.rebuild(current);step('scene-'+i);for(const node of current.nodes.filter(n=>n.kind==='cad'))service.inspect(node);step('display-'+i);service.display(current);
   heaps.push(oc.wasmMemory.buffer.byteLength);if(heaps.at(-1)>2*1024**3)return {status:'memory-limit',heaps,limitBytes:2*1024**3};
  }
  return {status:'completed',heaps,motionIterations:4,revisionChangedByMotion:cadProjectRevision(current)!==revision,fileUnchanged:hash(readFileSync(file))===hash(original)};
 }
 throw Error('Unknown case '+name);
}
try{send({type:'result',value:await run()});}catch(error){send({type:'result',value:{status:'reproduced',phase:error.cadPhase??phase,error:{measuredTolerance:error.measuredTolerance,allowedTolerance:error.allowedTolerance,code:error.code??(error instanceof WebAssembly.RuntimeError?'CAD_KERNEL_FATAL':'ERROR'),message:error.message},heapBytes:oc?.wasmMemory?.buffer.byteLength??0}});}finally{service?.dispose();controller?.dispose();process.disconnect?.();}
