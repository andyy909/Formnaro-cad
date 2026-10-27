import {runCadAIScript} from '../../src/cad-ai-sandbox.js';
import {createCadController} from '../../src/cad-controller.js';
import {cadAIContext} from '../../src/cad-ai-context.js';
import {createCadAutomationAccess} from '../../src/cad-automation-access.js';
let liveCad,liveAccess;
window.programLiveInput=async()=>{
 liveCad=createCadController({createWorker:()=>new Worker(new URL('../../src/cad-worker.js',import.meta.url),{type:'module'})});
 liveAccess=createCadAutomationAccess({controller:liveCad});return {context:cadAIContext(),scene:await liveCad.describe()};
};
window.programLivePreview=async answer=>{
 const before=liveCad.serialize(),p=await liveAccess.preview({revision:answer.revision,label:answer.label,commands:answer.commands,...(answer.checks?{checks:answer.checks}:{})}),candidate=liveCad.getPreview(p.previewId).project;
 const roots=candidate.nodes.filter(n=>n.kind==='cad'&&n.solid);if(roots.length!==1||candidate.nodes.length!==1)throw Error('Erwartet wird genau eine fertige native Platte.');
 const id=roots[0].id,target={rootId:id,path:[]};
 const verified=await liveCad.checkPreview(p.previewId,[{kind:'size',target,space:'worldAxes',expected:[60,40,4]},{kind:'solids',target,expected:1},{kind:'volume',target,expected:60*40*4-2*Math.PI*2.25**2*4,tolerance:.01},...[-20,20].map(x=>({kind:'clearance',target,from:[x,0,-1],to:[x,0,5],diameter:4.5,tolerance:.001}))]);
 if(liveCad.serialize()!==before||liveCad.state().undo!==0)throw Error('Die Vorschau hat das Original verändert.');
 liveCad.apply(p);const exported=await liveCad.exportModel({format:'stl',ids:[id]});const project=liveCad.snapshot();liveCad.undo();if(liveCad.serialize()!==before)throw Error('Undo unvollständig.');
 return {ok:true,checks:verified.checks,report:p.report,stl:Array.from(exported.data),project,undoExact:true};
};
window.runProgramProof=async()=>{
 const checks=[];const check=(condition,label)=>{if(!condition)throw Error(label);checks.push(label);};
 const run=(code,options={})=>runCadAIScript({code,call:async(method,args)=>method==='model'?{nodes:[{name:'Testmodell'}]}:{method,args},...options});
 const values=await run(`return {value:6*7,window:typeof window,process:typeof process,require:typeof require,bridge:typeof offlinecadDesktop,model:(await api.model()).nodes[0].name};`);
 check(values.value===42&&values.model==='Testmodell','Eigene Rechnung und bereitgestelltes Modell verfügbar');
 check(values.window==='undefined'&&values.process==='undefined'&&values.require==='undefined'&&values.bridge==='undefined','Kein Fenster, Node, Dateisystem oder Desktop-Bridge im Skript');
 const boundaries=await run(`
  const failures={};
  for(const [name,url]of [['network','http://127.0.0.1:9/private'],['file','file:///C:/formnaro-private-sentinel.txt']]){
   try{await fetch(url);failures[name]=false;}catch{failures[name]=true;}
  }
  try{await import('file:///C:/formnaro-private-code.js');failures.import=true;}catch{failures.import=false;}
  try{await import('http://127.0.0.1:9/code.js');failures.remoteImport=true;}catch{failures.remoteImport=false;}
  try{indexedDB.open('foreign-profile');failures.storage=false;}catch{failures.storage=true;}
  return failures;
 `);
 check(boundaries.network&&boundaries.file,'CSP blockiert Netzwerk und fremde Dateien');
 check(!boundaries.import&&!boundaries.remoteImport,'Keine externen Skripte oder Dateiimporte');
 check(boundaries.storage,'Undurchsichtiger Ursprung verhindert Zugriff auf Programmspeicher');
 const moduleResult=await run(`
  const module=await api.importTool('geometry');const own=await api.importTool('own','export const double=x=>x*2;');
  return {value:own.double(module.area(6,7)),scope:module.scope,model:await module.model(),blocked:await module.externalBlocked()};
 `,{modules:{geometry:`export const area=(a,b)=>a*b;export const scope=typeof process;export const model=async()=>(await formnaro.model()).nodes[0].name;export async function externalBlocked(){try{await fetch('file:///C:/private.txt');return false;}catch{return true;}}`}});
 check(moduleResult.value===84&&moduleResult.model==='Testmodell','Bereitgestellte und dynamisch ergänzte Werkzeugmodule lassen sich intern importieren');
 check(moduleResult.scope==='undefined'&&moduleResult.blocked,'Importierte Module bleiben im selben abgeschotteten Modellbereich');
 const concurrency=await run(`const calls=await Promise.all([api.run({op:'first'}),api.run({op:'second'})]);return calls.map(c=>c.args.op);`);
 check(concurrency.join(',')==='first,second','Werkzeugaufrufe kommen geordnet zurück');
 try{await run('while(true){}',{timeoutMs:250});throw Error('Timeout fehlt');}catch(error){check(error.code==='AI_SCRIPT_TIMEOUT','Endlosschleife beendet ohne blockierte Oberfläche');}
 const abort=new AbortController();const pending=run('await new Promise(()=>{})',{signal:abort.signal});setTimeout(()=>abort.abort(),100);
 try{await pending;throw Error('Abbruch fehlt');}catch(error){check(error.code==='ABORTED','Skript lässt sich abbrechen');}
 check(document.querySelectorAll('iframe').length===0,'Skriptfenster nach Erfolg, Timeout und Abbruch entfernt');
 const cad=createCadController({createWorker:()=>new Worker(new URL('../../src/cad-worker.js',import.meta.url),{type:'module'})});
 try{
  const original=cad.serialize(),p=await cad.preview({kind:'batch',commands:[{op:'script',modules:{dimensions:'export const size=[24,16,4];'},code:`
   const dimensions=await api.importTool('dimensions');
   await api.run({op:'create',type:'box',as:'plate',size:dimensions.size,pos:[0,0,2]});
   const data=await api.query({engine:'cad',kind:'scene'});
   const copy=await api.run({op:'tool',engine:'cad',as:'copy',operation:{kind:'cadToMesh',target:'$plate',quality:{deflection:.05,angleDegrees:8}}});
   await api.run({op:'tool',engine:'mesh',operation:{type:'mesh-role',id:'$copy',role:'hole'}});
   return {measured:data.objects[0].measures.worldAxisSize[0],copy:copy.selectedIds[0]};
  `}]});
  check(cad.serialize()===original&&cad.state().undo===0,'Echte Skriptwerkzeuge verändern nur die Vorschau');
  check(p.project.nodes.length===2&&p.project.nodes.find(n=>n.kind==='mesh').meshRole==='hole','Skript verwendet echte CAD- und Netz-Werkzeuge gemeinsam');
  check(p.report.meshOperations.find(r=>r.tool==='script').result.measured===24,'Abfrage misst den vorläufigen Ergebnisstand');
  cad.apply(p);check(cad.state().undo===1,'Gesamter Ablauf erzeugt einen Undo-Schritt');cad.undo();check(cad.serialize()===original,'Undo stellt Original exakt wieder her');
  const bad=cad.preview({kind:'batch',commands:[{op:'script',code:`await api.run({op:'create',type:'sphere'});throw Error('Abbruch nach Berechnung');`}]});
  try{await bad;throw Error('Fehler wurde übergangen');}catch(error){check(error.message.includes('Abbruch nach Berechnung')&&cad.serialize()===original,'Fehler nach echtem Werkzeug verwirft den gesamten Ablauf');}
 }finally{cad.dispose();}
 return {ok:true,checks};
};
