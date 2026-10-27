import {miniAIContext} from './ai-context.js';
import {validateAIAnalysis,pageAIAnalysisResult} from './ai-core/cad-ai-analysis.js';
import {encodeProject} from './model.js';
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
export function miniRevision(project){const text=encodeProject(project);let a=2166136261,b=2246822519;for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b^text.charCodeAt(i),3266489917);}return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');}
export function createMiniAIAccess(app){
 let cache=null,pending=null,computing=false,generation=0;
 const revision=()=>miniRevision(app.snapshot());
 const scene=()=>({...cache?.scene,objects:cache?.scene?.objects??[],application:'Formnaro Mini Mesh',revision:revision(),selection:app.selection(),selectionTargets:app.selection().map(rootId=>({rootId,path:[]}))});
 const current=(r,t)=>{if(t!==generation)fail('ABORTED','Berechnung abgebrochen.');if(revision()!==r)fail('STALE_REVISION','Das Modell wurde geändert. Vorschau neu berechnen.');};
 async function ready(){if(app.busy())fail('BUSY','Bitte laufende Mini-Berechnung abwarten.');const r=revision(),t=generation;if(cache?.revision!==r){const source=app.snapshot(),value=await app.request('ai-scene',{project:source});current(r,t);cache={scene:value,revision:r};}return scene();}
 const access={context:miniAIContext,scene,sceneForAI:ready,ready,project:async()=>{await ready();return app.snapshot();},
  analyze:async queries=>{await ready();const r=revision(),t=generation,project=app.snapshot(),results=[];for(const q of validateAIAnalysis(queries)){const value=await app.request('ai-query',{project,engine:q.engine,kind:q.kind,options:q.options??{}});current(r,t);results.push({...q,value:pageAIAnalysisResult(value,q.report,3500)});}return {revision:r,results};},
  preview:async input=>{
   if(computing||app.busy())fail('BUSY','Eine Berechnung läuft bereits.');pending=null;app.clearPreview();if(input?.revision!==revision())fail('STALE_REVISION','Das Modell wurde geändert.');
   if(Object.keys(input).some(k=>!['revision','commands','label','checks'].includes(k)))fail('INVALID_COMMAND','Unbekannte Vorschaufelder.');
   pending=null;computing=true;app.clearPreview();const r=input.revision,t=generation,source=app.snapshot();
   try{const before=await ready(),result=await app.request('ai-batch',{project:source,commands:input.commands,checks:input.checks??[]});current(r,t);const display=await app.prepare(result.project);current(r,t);
    pending={...result,previewId:crypto.randomUUID(),revision:r,label:String(input.label||'KI-Modellierung').slice(0,200),display,before:before.objects,after:result.scene.objects};
    const {project,display:ignored,...publicResult}=pending;return publicResult;
   }finally{computing=false;}
  },
  apply:async({previewId,revision:r}={})=>{if(!pending||pending.previewId!==previewId)fail('PREVIEW_MISSING','Bitte zuerst einen Vorschlag prüfen.');current(r,generation);if(r!==pending.revision)fail('STALE_REVISION','Die Vorschau gehört zu einem anderen Stand.');const candidate=pending.project;await app.commit(candidate);pending=null;cache=null;return {changed:true,revision:revision()};},
  discard:()=>{generation++;pending=null;app.clearPreview();return true;},
  cancel:()=>{generation++;if(computing)app.cancel();pending=null;app.clearPreview();},
  show:()=>{if(!pending)fail('PREVIEW_MISSING','Keine Vorschau vorhanden.');current(pending.revision,generation);app.preview(pending.project,pending.display);},
  release:()=>{if(!computing){cache=null;pending=null;}},
 };
 return access;
}
