import {runFreeCADArchive} from './cad-freecad-document.js';
import {freeCADSourceDigest,validateFreeCADSource} from './cad-freecad-source.js';
const fail=message=>{throw Object.assign(Error(message),{code:'FREECAD_IMPORT_INPUT'});};
export function validateFreeCADArchive(base64){
 if(typeof base64!=='string'||base64.length>Math.ceil(32*1024*1024/3)*4||!/^UEs[A-Za-z0-9+/]*={0,2}$/.test(base64))fail('Eine FCStd-Datei bis 32 MiB wählen.');
 return freeCADSourceDigest(base64);
}
export async function inspectFreeCADArchive(base64,options){validateFreeCADArchive(base64);return runFreeCADArchive(base64,{...options,action:'inspect',edits:undefined});}
export async function prepareFreeCADImport(request,{signal}={}){
 if(!request||Object.getPrototypeOf(request)!==Object.prototype||Object.keys(request).some(k=>!['documentBase64','sourceDigest','resultObject','name'].includes(k))||typeof request.name!=='string'||!request.name.trim()||request.name.length>200||/[\x00-\x1f]/.test(request.name)||!(/^[A-Za-z_][A-Za-z0-9_]{0,127}$/).test(request.resultObject??''))fail('FCStd-Import benötigt Dateiname, unveränderte Quelle und ausdrücklich gewählten Ergebniskörper.');
 const digest=validateFreeCADArchive(request.documentBase64);if(digest!==request.sourceDigest)fail('Die FCStd-Datei wurde geändert. Erneut lesen.');
 const result=await runFreeCADArchive(request.documentBase64,{action:'export',resultObject:request.resultObject,signal});
 if(result.report?.check!=='passed'||result.stepReadback?.check!=='passed'||result.tree.resultObject!==request.resultObject)fail('Der gewählte FCStd-Körper konnte nicht nativ bestätigt werden.');
 const source=validateFreeCADSource({version:2,engineVersion:result.engineVersion,documentBase64:request.documentBase64,documentDigest:digest,resultObject:request.resultObject,mode:'native',changes:[]}),missing=result.tree.objects.filter(o=>o.missingProxy).map(o=>o.name);
 return {source,bytes:Uint8Array.from(atob(result.stepBase64),c=>c.charCodeAt(0)),report:{geometry:result.report,stepReadback:result.stepReadback,engineVersion:result.engineVersion,resultObject:request.resultObject,missingProxies:missing,staticShape:result.tree.objects.find(o=>o.name===request.resultObject)?.staticShape===true},warnings:missing.length?['Python-Konstruktionsmodule fehlen für '+missing.join(', ')+'. Die gespeicherte Geometrie wird importiert; native Dokumentänderungen bleiben bis zur Wiederherstellung gesperrt.']:[]};
}
