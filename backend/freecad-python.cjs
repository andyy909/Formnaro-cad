const fs=require('node:fs/promises'),sync=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const failure=(message,code='FREECAD_PYTHON_INVALID')=>Object.assign(Error(message),{code});
function validateModules(modules={}){
 if(!modules||Object.getPrototypeOf(modules)!==Object.prototype||Object.keys(modules).length>32||JSON.stringify(modules).length>4000000)throw failure('Ungültige FreeCAD-Python-Module.');
 const seen=new Set();for(const [name,text] of Object.entries(modules)){
  const key=name.toLowerCase(),stem=key.slice(0,-3);
  if(!/^[A-Za-z][A-Za-z0-9_]{0,63}\.py$/.test(name)||seen.has(key)||['worker.py','formnaro_freecad.py','user.py'].includes(key)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(stem)||typeof text!=='string'||text.length>1000000)throw failure('Helfermodule benötigen eindeutige einfache .py-Dateinamen und vollständigen Quelltext.');
  seen.add(key);
 }return structuredClone(modules);
}
function validateScript(v){
 if(!v||Object.getPrototypeOf(v)!==Object.prototype||Object.keys(v).some(k=>!['version','name','code','parameters','modules','gui'].includes(k))||v.version!==1||typeof v.code!=='string'||!v.code.trim()||v.code.length>100000||v.gui!==undefined&&typeof v.gui!=='boolean'||v.name!==undefined&&(typeof v.name!=='string'||v.name.length>200))throw failure('FreeCAD-Python benötigt version:1, vollständigen code und optional name, parameters, modules, gui.');
 validateModules(v.modules);
 const parameters=v.parameters??{};if(!parameters||Object.getPrototypeOf(parameters)!==Object.prototype)throw failure('FreeCAD-Python-Parameter benötigen ein JSON-Objekt.');
 const seen=new Set();function plain(x,d=0){if(d>20)throw failure('Parameter sind zu tief verschachtelt.');if(x===null||typeof x==='string'||typeof x==='boolean'||typeof x==='number'&&Number.isFinite(x))return;if(!x||typeof x!=='object'||seen.has(x)||!Array.isArray(x)&&Object.getPrototypeOf(x)!==Object.prototype)throw failure('Parameter benötigen endliche JSON-Daten.');seen.add(x);for(const [k,a]of Object.entries(x)){if(['__proto__','constructor','prototype'].includes(k))throw failure('Ungültiger Parameterschlüssel.');plain(a,d+1);}seen.delete(x);}plain(parameters);
 if(Buffer.byteLength(JSON.stringify(v))>8*1024*1024)throw failure('FreeCAD-Python-Auftrag überschreitet 8 MiB.');return JSON.parse(JSON.stringify(v));
}
async function execute(exe,args,{cwd,env,signal,timeout=300000}={}){
 signal?.throwIfAborted();return new Promise((resolve,reject)=>{let log='',timedOut=false;const child=spawn(exe,args,{cwd,env,windowsHide:true,stdio:['ignore','pipe','pipe']}),abort=()=>child.kill();
 const timer=setTimeout(()=>{timedOut=true;child.kill();},timeout);signal?.addEventListener('abort',abort,{once:true});for(const stream of [child.stdout,child.stderr])stream.on('data',b=>log=(log+b.toString()).slice(-16000));
 const clean=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};child.once('error',e=>{clean();reject(e);});child.once('close',code=>{clean();if(signal?.aborted)reject(failure('FreeCAD-Python abgebrochen.','ABORTED'));else if(timedOut)reject(failure('FreeCAD-Python-Zeitlimit erreicht.','FREECAD_TIMEOUT'));else if(code!==0)reject(failure('FreeCAD-Python-Prozess ('+code+'): '+log,'FREECAD_PYTHON_FAILED'));else resolve(log);});
 });
}
async function runPythonJob({job,exe,script,inputs,inspectOnly,signal,timeout,documentJob,planJob}){
 if(process.platform!=='win32')throw failure('Die vollständige lokale FreeCAD-Python-Umgebung benötigt zurzeit Windows. Die vorhandenen CAD-Pläne bleiben verfügbar.','FREECAD_PYTHON_UNAVAILABLE');
 const host=await fs.mkdtemp(path.join(path.dirname(job),'formnaro-cad-host-'));
 try{
 const runtime=await require('./freecad-runtime.cjs').prepareRuntime(exe,{signal});
 // The container grants runtime access using this path. Resolve directory
 // junctions first so the grant reaches the physical DLL directory as well.
 exe=await fs.realpath(exe);
 if(runtime.bundled&&path.dirname(path.dirname(exe)).toLowerCase()!==(await fs.realpath(runtime.root)).toLowerCase())throw failure('Die CAD-Programmdatei liegt außerhalb der geprüften Laufzeit.','FREECAD_RUNTIME_INVALID');
 if(runtime.bundled)await fs.copyFile(path.join(runtime.root,'formnaro-container.exe'),path.join(host,'container.exe'));
 else{
 const source=await fs.readFile(path.join(__dirname,'freecad-container.cs'));await fs.writeFile(path.join(host,'container.cs'),source);
 const compiler=path.join(process.env.WINDIR||'C:/Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');if(!sync.existsSync(compiler))throw failure('Die Windows-CAD-Laufzeit (.NET Framework) fehlt.','FREECAD_PYTHON_UNAVAILABLE');
 await execute(compiler,['/nologo','/out:'+path.join(host,'container.exe'),path.join(host,'container.cs')],{cwd:host,signal,timeout:30000});
 }
 const workerName=planJob?'freecad-worker.py':documentJob?'freecad-document-worker.py':'freecad-python-worker.py';
 for(const file of [workerName,'formnaro_freecad.py'])await fs.writeFile(path.join(job,file===workerName?'worker.py':file),await fs.readFile(path.join(__dirname,file)));
 for(const [name,code]of Object.entries(script.modules??{}))await fs.writeFile(path.join(job,name),code);
 await fs.writeFile(path.join(job,'user.py'),script.code);await fs.writeFile(path.join(job,'input.json'),JSON.stringify(planJob??(documentJob?{documentJob}:{script,inspectOnly,inputs})));
 // Deliberately create a fresh minimal environment: provider credentials and
 // unrelated application variables never reach the native Python process.
 const env={};for(const k of ['SystemRoot','WINDIR','SystemDrive','ComSpec','ProgramData','ProgramFiles','ProgramFiles(x86)','LOCALAPPDATA','USERPROFILE','USERNAME','USERDOMAIN','OS','PROCESSOR_ARCHITECTURE','NUMBER_OF_PROCESSORS','PATHEXT'])if(process.env[k])env[k]=process.env[k];
 Object.assign(env,{PATH:path.dirname(exe)+';'+path.join(process.env.WINDIR,'System32'),TEMP:job,TMP:job,HOME:job,APPDATA:job,FREECAD_USER_HOME:job,FREECAD_USER_DATA:job,FREECAD_USER_TEMP:job,FORMNARO_FREECAD_JOB:job,PYTHONDONTWRITEBYTECODE:'1',QT_QPA_PLATFORM:'offscreen'});
 let worker=path.join(job,'worker.py');if(script.gui){exe=path.join(path.dirname(exe),'FreeCAD.exe');worker=path.join(job,'worker.FCMacro');await fs.writeFile(worker,"from pathlib import Path\nexec(compile((Path.cwd()/'worker.py').read_text(encoding='utf-8'),str(Path.cwd()/'worker.py'),'exec'),{'__file__':str(Path.cwd()/'worker.py'),'__name__':'__main__'})\nimport FreeCADGui\nfrom PySide import QtCore\nQtCore.QTimer.singleShot(0,FreeCADGui.getMainWindow().close)\n");}
 const containerName='formnaro.cad.'+require('node:crypto').randomUUID().replaceAll('-','');
 try{await execute(path.join(host,'container.exe'),[exe,job,worker,containerName],{cwd:job,env,signal,timeout});}
  catch(error){try{const f=path.join(job,'process.log'),stat=await fs.lstat(f);if(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=64000&&path.dirname(await fs.realpath(f))===await fs.realpath(job))error.message+='\n'+(await fs.readFile(f,'utf8')).slice(-12000);}catch{}throw error;}
 finally{await execute(path.join(host,'container.exe'),['--cleanup',containerName],{cwd:host,env,timeout:10000});}
 }finally{await fs.rm(host,{recursive:true,force:true});}
}
module.exports={validateScript,validateModules,runPythonJob};
