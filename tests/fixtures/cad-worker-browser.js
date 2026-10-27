import {createCadWorkerClient} from '../../src/cad-worker-client.js';
import {createCadProject,cadProjectRevision} from '../../src/cad-project.js';
import {createCadTransactions} from '../../src/cad-transactions.js';
const require=(value,message)=>{if(!value)throw Error(message);};
window.runCadProof=async()=>{
  let project=createCadProject(),workers=0,ticks=0;const timer=setInterval(()=>ticks++,5);
  const client=createCadWorkerClient({confirmed:()=>project,createWorker:()=>{workers++;return new Worker(new URL('../../src/cad-worker.js',import.meta.url),{type:'module'});}});
  const run=(request,options={})=>client.run({...request,project:request.project??project},{revision:options.revision??cadProjectRevision(project),...options});
  try{
    const created=await run({job:'create',recipe:{type:'cylinder',size:[20,20,20]},options:{id:'body',name:'CAD-Zylinder'},display:true});project=created.project;
    require(created.display[0].mesh.faceGroups.length===9,'CAD-Flächenzuordnung fehlt');require(ticks>5,'Renderer-Timer während Kernstart blockiert');
    const store=createCadTransactions({initial:project,build:async(draft,context)=>(await run({job:'rebuild',project:draft,baseline:context.baseline},{revision:context.revision,signal:context.signal})).project,abort:()=>client.cancel()});
    const draft=store.snapshot();draft.nodes[0].recipe.size=[24,24,20];const preview=await store.preview({revision:store.revision(),project:draft});require(store.snapshot().nodes[0].recipe.size[0]===20,'Entwurf vorzeitig bestätigt');project=store.apply(preview).project;require(project.nodes[0].recipe.size[0]===24,'Quellenänderung fehlt');project=store.undo().project;require(project.nodes[0].recipe.size[0]===20,'Undo fehlt');project=store.redo().project;
    const affine=store.snapshot();affine.nodes[0].transform=[-1.5,.2,0,0,.4,.8,0,0,.2,.3,1.2,0,7,-3,14,1];project=store.apply(await store.preview({revision:store.revision(),project:affine})).project;
    const bounds=await run({job:'query',query:{kind:'bounds',options:{ids:['body']}}}),ray={origin:[bounds.max[0]+100,bounds.center[1],bounds.center[2]],direction:[-1,0,0]},hit=await run({job:'query',query:{kind:'rayPick',options:{ray}}});require(hit?.objectId==='body'&&Math.abs(Math.hypot(...hit.normal)-1)<1e-8,'Native affine CAD-Flächennormale fehlt');
    const coarse=await run({job:'display',quality:{deflection:.4,angleDegrees:25}}),fine=await run({job:'display',quality:{deflection:.005,angleDegrees:3}});require(fine[0].mesh.triangles.length>coarse[0].mesh.triangles.length,'Anzeigequalität ohne Wirkung');require(workers===1,'CAD-Kern wurde wiederholt geladen');
    const afterHit=await run({job:'query',query:{kind:'rayPick',options:{ray}}});require(JSON.stringify(afterHit)===JSON.stringify(hit),'Anzeigequalität verändert CAD-Treffer');const exportMesh=await run({job:'exportMeshes'});require(exportMesh.length===1&&exportMesh[0].mesh.vertices.length>0,'Double-CAD-Export fehlt');const step=await run({job:'exportStep'});require(new TextDecoder().decode(step).includes('ISO-10303-21'),'Direkter CAD-STEP-Export fehlt');
    const complex=structuredClone(project);complex.nodes=Array.from({length:100},(_,i)=>{const node=structuredClone(project.nodes[0]);node.id='heavy-'+i;node.recipe={type:'gear',size:[30,30,6],params:{teeth:32+i%10}};return node;});
    const controller=new AbortController(),pending=run({job:'rebuild',project:complex,baseline:project},{signal:controller.signal});await new Promise(resolve=>setTimeout(resolve,30));const started=performance.now();controller.abort();
    let aborted=false;try{await pending;}catch(error){aborted=error.name==='AbortError';}const abortMs=performance.now()-started;require(aborted&&abortMs<1000,'CAD-Worker-Abbruch dauert länger als 1 s');require(client.state().running===0,'CAD-Auftrag bleibt nach Abbruch aktiv');
    const restored=await run({job:'rebuild'});require(restored.project.nodes.length===1&&restored.project.nodes[0].recipe.size[0]===24,'Neustart verliert bestätigten CAD-Stand');
    require(JSON.stringify(restored.project.nodes[0].transform)===JSON.stringify(project.nodes[0].transform),'Neustart verliert affine Matrix');document.querySelector('#status').textContent='CAD-Worker-Nachweis bestanden';return {ready:true,workers,ticks,abortMs,volume:restored.project.nodes[0].stats.volume,format:restored.project.version,nativeAffine:true,cadRay:true,doubleExport:true};
  }finally{clearInterval(timer);client.dispose();}
};
