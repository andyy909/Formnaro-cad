const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto');
const {runPythonJob,validateModules}=require('./freecad-python.cjs');
const LIMIT=32*1024*1024,fail=message=>{throw Object.assign(Error(message),{code:'FREECAD_DOCUMENT_INPUT'});};
const plain=v=>v&&Object.getPrototypeOf(v)===Object.prototype;
const exact=(v,keys)=>plain(v)&&Object.keys(v).every(k=>keys.includes(k));
const name=v=>typeof v==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(v);
const scalar=v=>typeof v==='number'&&Number.isFinite(v)||typeof v==='boolean'||typeof v==='string'&&v.length<=512;
const linkTypes=new Set(['App::PropertyLink','App::PropertyXLink','App::PropertyLinkList','App::PropertyXLinkList','App::PropertyLinkSub','App::PropertyXLinkSub','App::PropertyLinkSubList','App::PropertyXLinkSubList']);
function linkValue(value,type){
 const sub=type.includes('Sub'),list=type.endsWith('List');
 const entry=v=>exact(v,sub?['object','subelements']:['object'])&&(v.object===null||name(v.object))&&(!sub||Array.isArray(v.subelements)&&v.subelements.length<=64&&v.subelements.every(s=>typeof s==='string'&&s.length<=1024&&!/[\x00-\x1f]/.test(s)));
 return list?Array.isArray(value)&&value.length<=64&&value.every(entry):value===null||entry(value);
}
const propertyValue=(value,type)=>linkTypes.has(type)?linkValue(value,type):scalar(value);
function validateDocumentRequest(value){
 if(!exact(value,['version','action','documentBase64','sourceDigest','resultObject','edits','modules'])||value.version!==1||!['inspect','edit','export'].includes(value.action))fail('FCStd-Auftrag benötigt version:1 und inspect, export oder edit.');
 try{validateModules(value.modules);}catch(error){fail(error.message);}
 if(typeof value.documentBase64!=='string'||value.documentBase64.length>Math.ceil(LIMIT/3)*4||!/^UEs[A-Za-z0-9+/]*={0,2}$/.test(value.documentBase64))fail('Gültiges archiviertes FCStd-Dokument bis 32 MiB wählen.');
 const bytes=Buffer.from(value.documentBase64,'base64');if(bytes.length>LIMIT||bytes.toString('base64')!==value.documentBase64)fail('Ungültige FCStd-Kodierung.');
 if(typeof value.sourceDigest!=='string'||!/^[a-f0-9]{64}$/.test(value.sourceDigest)||createHash('sha256').update(bytes).digest('hex')!==value.sourceDigest)fail('FCStd-Quelle geändert. Merkmalsbaum erneut lesen.');
 if(value.resultObject!==undefined&&!name(value.resultObject))fail('Eine vorhandene eindeutige FreeCAD-Ergebniskennung wählen.');
 if(value.action!=='edit'&&value.edits!==undefined)fail('Eine Leseabfrage darf keine Merkmalsänderungen enthalten.');
 if(value.action==='export'&&!name(value.resultObject))fail('Einen vorhandenen Ergebniskörper für den FCStd-Import wählen.');
 if(value.action==='edit'){
  if(!name(value.resultObject)||!Array.isArray(value.edits)||!value.edits.length||value.edits.length>64)fail('Ergebniskörper und 1 bis 64 explizite Eigenschaften wählen.');
  const seen=new Set();for(const e of value.edits){if(!exact(e,['object','property','expectedType','expectedValue','value'])||!name(e.object)||!name(e.property)||typeof e.expectedType!=='string'||!/^App::Property[A-Za-z0-9]+$/.test(e.expectedType)||!propertyValue(e.expectedValue,e.expectedType)||!propertyValue(e.value,e.expectedType))fail('Eigenschaft benötigt eindeutige Objekt-/Eigenschaftskennung, Typ sowie ursprünglichen und neuen Wert oder Quellenbezug.');const key=e.object+'.'+e.property;if(seen.has(key))fail('Doppelte Eigenschaft im FCStd-Auftrag.');seen.add(key);}
 }
 return structuredClone(value);
}
async function runDocument(value,{signal,exe,timeout=300000}={}){
 const documentJob=validateDocumentRequest(value);exe??=require('./freecad.cjs').executable();
 if(!exe)throw Object.assign(Error(require('./freecad-runtime.cjs').message),{code:'FREECAD_UNAVAILABLE'});
 signal?.throwIfAborted();const job=await fs.mkdtemp(path.join(os.tmpdir(),'formnaro-fcstd-'));
 try{
  await runPythonJob({job,exe,script:{version:1,code:'',gui:documentJob.action==='edit',modules:documentJob.modules},inputs:[],inspectOnly:documentJob.action==='inspect',signal,timeout,documentJob});
  const read=async n=>{const file=path.join(job,n),s=await fs.lstat(file);if(!s.isFile()||s.isSymbolicLink()||s.size>LIMIT||path.dirname(await fs.realpath(file))!==await fs.realpath(job))fail('Ungültige native FCStd-Ergebnisdatei.');return fs.readFile(file);};
  const result=JSON.parse(await read('result.json'));
  if(!result.ok)throw Object.assign(Error(result.error),{code:result.code??'FREECAD_DOCUMENT_FAILED',feedback:{traceback:result.traceback}});
  if(result.sourceDigest!==documentJob.sourceDigest||result.isolation!=='windows-appcontainer')fail('FCStd-Antwort gehört nicht zum aktuellen Quelldokument.');
  if(documentJob.action==='export')return {...result,stepBase64:(await read('result.step')).toString('base64')};
  if(documentJob.action==='edit')return {...result,stepBase64:(await read('result.step')).toString('base64'),documentBase64:(await read('result.FCStd')).toString('base64')};
  return result;
 }finally{await fs.rm(job,{recursive:true,force:true});}
}
module.exports={validateDocumentRequest,runDocument};
