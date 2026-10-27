import loaderSource from '../python-runtime/pyodide.mjs?raw';
import moduleSource from '../python-runtime/pyodide.asm.mjs?raw';
import wasmURL from '../python-runtime/pyodide.asm.wasm?url';
import stdlibURL from '../python-runtime/python_stdlib.zip?url';
import lock from '../python-runtime/pyodide-lock.json';
import packageManifest from '../python-runtime/packages/manifest.json';
import analysisSDK from '../ai/python/formnaro/analysis.py?raw';
const packageURLs=import.meta.glob('../python-runtime/packages/*.whl',{eager:true,query:'?url',import:'default'});
import sdk from '../ai/python/formnaro/__init__.py?raw';
import {runCadAIScript} from './cad-ai-sandbox.js';

let assets;
async function runtime(){
 if(!assets)assets=Promise.all([wasmURL,stdlibURL,...packageManifest.packages.map(p=>packageURLs['../python-runtime/packages/'+p.file])].map(async url=>{const r=await fetch(url);if(!r.ok)throw Error('Die lokale Python-Laufzeit konnte nicht geladen werden.');return r.arrayBuffer();})).then(async([wasm,stdlib,...buffers])=>{
  const packages={};for(const [i,p]of packageManifest.packages.entries()){
   const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffers[i])),b=>b.toString(16).padStart(2,'0')).join('');if(digest!==p.sha256)throw Error('Prüfsumme der Python-Bibliothek stimmt nicht: '+p.name);
   packages[p.name]={...(lock.packages[p.name]??{name:p.name,imports:[p.name],package_type:'package',install_dir:'site'}),version:p.version,depends:p.depends,file_name:p.file,sha256:p.sha256};
  }
  return {loaderSource,moduleSource,wasm,stdlib,sdk,analysisSDK,packages:packageManifest.packages.map((p,i)=>({name:p.name,file:p.file,bytes:buffers[i]})),lock:{info:lock.info,packages}};
 }).catch(error=>{assets=null;throw error;});
 return assets;
}

// Serialized verbatim into a Worker belonging to an opaque-origin sandbox.
// Its only outward capabilities are the same model/query/run RPCs as JS.
// Python's filesystem is disposable WebAssembly memory, never a mounted host
// directory. CSP admits only supplied blob assets; HTTP/file/network imports
// and desktop/program-storage access remain unavailable, even through `js`.
export function pythonWorkerMain(){
 let sequence=0,started=false;const pending=new Map();
 const rpc=(method,args)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});postMessage({type:'call',id,method,args});});
 onmessage=async event=>{
  const m=event.data;
  if(m?.type==='reply'){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);m.error?p.reject(Object.assign(Error(m.error.message),{code:m.error.code})):p.resolve(m.value);return;}
  if(m?.type!=='start'||started)return;started=true;
  const urls=[];let output='',errors='';
  const blob=(value,type)=>{const url=URL.createObjectURL(new Blob([value],{type}));urls.push(url);return url;};
  try{
   // Opaque-origin blob Workers use dynamic ES imports. Disable the legacy
   // importScripts path (including Pyodide's data-URL capability probe).
   globalThis.importScripts=()=>{throw new TypeError('Only supplied runtime modules are supported.');};
   const load=new Function('url','return import(url);');
   const [{loadPyodide},{default:createModule}]=await Promise.all([load(blob(m.runtime.loaderSource,'text/javascript')),load(blob(m.runtime.moduleSource,'text/javascript'))]);
   // Pyodide's settings factory eagerly starts the wasm fetch. Satisfy exactly
   // that pinned runtime URL from already supplied bytes; no request leaves
   // the Worker. Every other URL remains subject to opaque-origin CSP.
   const fetchAsset=globalThis.fetch.bind(globalThis);
   const supplied=new Map(m.runtime.packages.map(p=>['https://formnaro-python.invalid/'+p.file,p.bytes]));
   globalThis.fetch=(url,...args)=>String(url)==='https://formnaro-python.invalid/pyodide.asm.wasm'?Promise.resolve(new Response(m.runtime.wasm,{headers:{'Content-Type':'application/wasm'}})):supplied.has(String(url))?Promise.resolve(new Response(supplied.get(String(url)))):fetchAsset(url,...args);
   const py=await loadPyodide({indexURL:'https://formnaro-python.invalid/',packageBaseUrl:'https://formnaro-python.invalid/',stdLibURL:blob(m.runtime.stdlib,'application/zip'),lockFileContents:m.runtime.lock,packages:[],enableRunUntilComplete:false,
    createPyodideModule:settings=>createModule(settings),
    stdout:line=>{if(output.length<16000)output+=(String(line)+'\n').slice(0,16000-output.length);},stderr:line=>{if(errors.length<16000)errors+=(String(line)+'\n').slice(0,16000-errors.length);}});
   const loadErrors=[];await py.loadPackage(m.runtime.packages.map(p=>p.name),{errorCallback:message=>loadErrors.push(String(message))});if(loadErrors.length)throw Error('Lokale Analysebibliotheken konnten nicht geladen werden: '+loadErrors.join('; '));
   py.registerJsModule('_formnaro_bridge',{call:async(method,args)=>JSON.stringify(await rpc(method,JSON.parse(args)))});
   py.globals.set('_formnaro_source',m.runtime.sdk);
   py.globals.set('_formnaro_analysis_source',m.runtime.analysisSDK);
   py.runPython(`import sys, types, json
_formnaro = types.ModuleType('formnaro')
sys.modules['formnaro'] = _formnaro
exec(_formnaro_source, _formnaro.__dict__)
from _formnaro_bridge import call as _bridge_call
async def _model_rpc(method, args):
    return json.loads(await _bridge_call(method, json.dumps(args, allow_nan=False)))
_formnaro._rpc = _model_rpc
_formnaro.__path__ = []
_analysis = types.ModuleType('formnaro.analysis')
sys.modules['formnaro.analysis'] = _analysis
exec(_formnaro_analysis_source, _analysis.__dict__)
_formnaro.analysis = _analysis
from formnaro.analysis import workspace
_formnaro.workspace = workspace
del _formnaro_source
del _formnaro_analysis_source
`);
   const result=await py.runPythonAsync(m.code,{filename:'<Formnaro-Python>'});result?.destroy?.();
   await py.runPythonAsync('await _formnaro._flush_all()');
   const json=py.runPython("json.dumps(globals().get('result', None), ensure_ascii=False, allow_nan=False)");
   if(json.length>900000)throw Error('Python-Ergebnis ist zu groß. Eine Messzusammenfassung zurückgeben.');
   postMessage({type:'done',value:{value:JSON.parse(json),stdout:output,stderr:errors,pythonVersion:py.runPython('sys.version.split()[0]')}});
  }catch(error){postMessage({type:'failed',error:{message:String(error.message??error).slice(0,6000),code:String(error.code??'AI_PYTHON')}});}
  finally{for(const url of urls)URL.revokeObjectURL(url);}
 };
}

export async function runPython({code,call,signal,timeoutMs=120000,...environment}){
 if(signal?.aborted)throw Object.assign(Error('Python-Berechnung abgebrochen.'),{name:'AbortError',code:'ABORTED'});
 const data=await runtime();
 return runCadAIScript({code,call,signal,timeoutMs,...environment,workerSource:`(${pythonWorkerMain.toString()})();`,payload:{runtime:data}});
}
