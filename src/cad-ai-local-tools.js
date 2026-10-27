import {cadJointsSummary} from './cad-joints-automation.js';
import {SKETCH_TEMPLATES,createSketchTemplate} from './sketch-templates.js';
import {queryTechnicalMesh} from './mesh-technical-service.js';
import {meshCadInput} from './cad-mesh-to-cad-data.js';
import {createLocalStlAnalysis,createLocalStlConversion,conversionSummary} from './cad-stl-converter.js';
import {meshTextPaths,meshSvgPaths} from './mesh-contours.js';
import {cadProjectRevision} from './cad-project.js';
import {commonFit,commonEditable,commonBounds,commonReferenceTransform,meshFloorTransform,meshMagnetTransform} from './common-tool-operations.js';
import {cloneCadSources} from './cad-source-clone.js';
import {cadProjectParametersSummary,cadProjectParameterCatalogSummary} from './cad-project-parameters-automation.js';
import {cadContourLinksSummary} from './cad-linked-contours-automation.js';

// Only model bytes and already-loaded resources enter this interface. There is
// deliberately no path, readFile, saveFile, credentials or generic IPC argument.
export async function runModelConversion({project,target,action,options={},edits,commands,signal,desktop=globalThis.window?.offlinecadDesktop}={}){
 if(!desktop||typeof desktop.convertStl!=='function'||typeof desktop.analyseStl!=='function')throw Object.assign(Error('Der lokale STL-Konverter ist in dieser Ausgabe nicht verfügbar.'),{code:'AI_CONVERTER_UNAVAILABLE'});
 if(!['analyze','convert'].includes(action))throw Error('Unbekannte Modellkonvertierung.');
 const input=meshCadInput(project,target,cadProjectRevision(project));
 const task=(action==='analyze'?createLocalStlAnalysis:createLocalStlConversion)({desktop});
 const cancel=()=>{Promise.resolve(task.cancel()).catch(()=>{});};signal?.addEventListener('abort',cancel,{once:true});
 try{
  if(signal?.aborted)throw Object.assign(Error('Konvertierung abgebrochen.'),{code:'ABORTED'});
  const result=await task.run(input.file,{...options,unit:1},action==='analyze'?{edits,commands}:undefined);
  if(signal?.aborted)throw Object.assign(Error('Konvertierung abgebrochen.'),{code:'ABORTED'});
  if(action==='analyze')return result;
  if(!(result?.bytes instanceof Uint8Array)||!result.report?.valid)throw Error('Der Konverter hat keinen geprüften CAD-Körper geliefert.');
  return {operation:{kind:'meshToCad',target:input.source.target,sourceDigest:input.source.digest,id:crypto.randomUUID(),bytes:result.bytes,notes:conversionSummary(result.report).slice(0,4000)},report:result.report};
 }catch(error){
  if(/Reparaturbudget|Netzreparatur abgelehnt|offen oder nicht mannigfaltig/.test(error.message??''))throw Object.assign(Error(error.message+' Dieser Konverterweg benötigt ein geschlossenes mannigfaltiges Netz und ist hier blockiert. Original und Abweichungsbudget erhalten. Für den beauftragten CAD-Nachbau die Originaldreiecke/Schnitte lokal mit Python oder JavaScript messen und einen neuen CAD-Körper über native Werkzeuge oder FreeCAD aufbauen. Fehlende Maße gezielt benennen, wenn sie tatsächlich nicht messbar sind.'),{code:/Reparaturbudget|Netzreparatur abgelehnt/.test(error.message??'')?'CAD_CONVERTER_REPAIR_REJECTED':'CAD_CONVERTER_TOPOLOGY',feedback:{retryable:true,toolFailure:{scope:'converter-only',retrySameTool:false,alternatives:['python-analysis','javascript-analysis','native-cad-reconstruction','freecad-reconstruction']}}});
  throw error;
 }finally{signal?.removeEventListener('abort',cancel);}
}
export async function queryProgramResources({project,kind,options={},getFonts=()=>[],getResources=()=>({}),signal}={}){
 if(signal?.aborted)throw Object.assign(Error('Lokale Datenabfrage abgebrochen.'),{name:'AbortError',code:'ABORTED'});
 if(kind==='projectParameters')return cadProjectParametersSummary(project,options);
 if(kind==='joints')return cadJointsSummary(project,options);
 if(kind==='contourLinks')return cadContourLinksSummary(project,options);
 if(kind==='projectParameterCatalog')return cadProjectParameterCatalogSummary(project,options);
 if(kind==='sketchTemplate'){if(Object.keys(options).some(k=>k!=='id'))throw Error('Skizzenvorlage: nur id wählen.');const descriptor=SKETCH_TEMPLATES.find(t=>t.id===options.id);if(!descriptor)throw Error('Unbekannte Skizzenvorlage.');return {...structuredClone(descriptor),sketch:createSketchTemplate(descriptor.id)};}
 if(kind==='technicalMesh'){if(Object.keys(options).some(k=>!['id','triangleIds','geometryDigest','tolerance'].includes(k)))throw Error('Ungültige Flächenanalyseoption.');return queryTechnicalMesh({project,...options,signal});}
 if(kind==='resources')return structuredClone({...getResources(),sketchTemplates:SKETCH_TEMPLATES});
 if(kind==='textContours')return meshTextPaths(options.text,options.font??'regular',getFonts());
 if(kind==='svgContours')return meshSvgPaths(options.svg);
 if(kind==='bounds'){
  const n=project.nodes.find(n=>n.id===(options.id??options.target));if(!n)throw Error('Ein Modellteil wählen.');return commonBounds(n,options.frame);
 }
 throw Error('Unbekannte programminterne Geometrieabfrage.');
}
export function runCommonModelTool(project,operation){
 const p=structuredClone(project),o=operation;
 const fields={fit:['kind','target','options','copy'],reference:['kind','target','source','reference','offset'],floor:['kind','target','triangleIndex','point','ground'],magnet:['kind','target','reference'],ruler:['kind','origin','mode']};
 if(!fields[o.kind]||Object.keys(o).some(k=>!fields[o.kind].includes(k)))throw Error('Ein vorhandenes Modellhilfswerkzeug wählen.');
 if(o.kind==='ruler'){
  if(o.origin===null)p.ruler=null;
  else{if(!Array.isArray(o.origin)||o.origin.length!==3||o.origin.some(v=>!Number.isFinite(v)||Math.abs(v)>100000)||!['min','center'].includes(o.mode))throw Error('Gültigen Linealursprung und Bezug wählen.');p.ruler={origin:[...o.origin],mode:o.mode};}
  return {project:p,selectedIds:[],report:{tool:'ruler'}};
 }
 const id=typeof o.target==='string'?o.target:o.target?.path?.length===0?o.target.rootId:null,original=commonEditable(p,id);let n=original;
 if(o.kind==='fit'){
  if(o.copy){n=cloneCadSources(original);n.name=('Passung – '+n.name).slice(0,200);if(n.kind==='mesh')n.meshRole='hole';else n.solid=false;p.nodes.push(n);}
  n.transform=commonFit(n,o.options).transform;
 }else if(o.kind==='reference')n.transform=commonReferenceTransform(n,o.source,o.reference,o.offset);
 else if(o.kind==='magnet')n.transform=meshMagnetTransform(n,o.reference);
 else{
  if(!o.ground&&p.workplane.reference?.objectId===id)throw Error('Die Arbeitsebene gehört zu diesem Teil. Eine andere Ebene wählen.');
  n.transform=meshFloorTransform(n,o.triangleIndex,o.point,o.ground?{origin:[0,0,0],orientation:[0,0,0,1]}:p.workplane);
 }
 return {project:p,selectedIds:[n.id],report:{tool:o.kind,originalRetained:!!o.copy}};
}
