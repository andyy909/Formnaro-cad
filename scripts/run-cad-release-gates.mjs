import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {cadReleaseManifest} from './cad-release-manifest.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),work=path.join(root,'work/cad-v011'),version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
if(version!=='0.12.0')throw Error('Release gates require the complete native 0.12.0 entry.');
fs.mkdirSync(work,{recursive:true});const checks=[],started=Date.now(),report=path.join(work,'release-gates.json');
const sourceManifest=()=>cadReleaseManifest(root).filter(entry=>!entry.file.startsWith('dist/')),initialSources=sourceManifest();
function run(name,executable,args,extraEnv={}){return new Promise((resolve,reject)=>{const log=fs.openSync(path.join(work,'release-gate-'+name+'.log'),'w'),child=spawn(executable,args,{cwd:root,windowsHide:true,env:{...process.env,...extraEnv},stdio:['ignore',log,log]});console.log('Running '+name);child.on('error',error=>{fs.closeSync(log);reject(error);});child.on('exit',code=>{fs.closeSync(log);if(code!==0)reject(Error(name+' failed; inspect its local gate log.'));else{checks.push({name,ok:true});console.log('Passed '+name);resolve();}});});}
try{
 // npm is not a runtime dependency; invoke the exact commands from package.json directly.
 const scripts=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).scripts;
 for(const name of ['test','test:cad-foundation','test:cad-kernel-extended','test:cad-stl','test:cad-fonts','test:cad-ai-chat','test:cad-move','test:cad-selection','test:cad-workspace','test:cad-functions','test:cad-renderer-picking']){const words=scripts[name].split(' ');await run(name.replaceAll(':','-'),process.execPath,words.slice(1));}
 await run('production-build',process.execPath,['node_modules/vite/bin/vite.js','build','--base','./']);
 await run('native-app-build',process.execPath,['node_modules/vite/bin/vite.js','build','--config','tests/cad-app.config.mjs']);
 const electron=path.join(root,'node_modules/electron/dist/electron.exe');
 for(const name of ['cad-app-desktop','cad-app-imports-desktop','cad-app-gestures-desktop','cad-app-tools-desktop','cad-app-placement-desktop','cad-app-editing-desktop','cad-app-move-desktop','cad-app-align-desktop','cad-app-scale-dimensions-desktop','cad-app-align-markers-desktop','cad-app-selection-desktop','cad-app-group-performance-desktop','cad-app-program-performance-desktop','cad-app-fonts-sidebar-desktop','cad-app-ai-chat-desktop','cad-app-ai-models-desktop','cad-app-projects-desktop','cad-app-functions-desktop'])await run(name,electron,['tests/'+name+'.cjs']);
 if(fs.existsSync(path.join(root,'work/stl-cad-v2/inventory.json'))){await run('cad-app-stl-desktop',electron,['tests/cad-app-stl-desktop.cjs']);await run('cad-app-stl-repair-desktop',electron,['tests/cad-app-stl-repair-desktop.cjs']);}
 await run('interface-build',process.execPath,['node_modules/vite/bin/vite.js','build','--config','tests/cad-interface-proof.config.mjs']);await run('interface',electron,['tests/cad-interface-browser.cjs']);
 await run('worker-build',process.execPath,['node_modules/vite/bin/vite.js','build','--config','tests/cad-proof.config.mjs']);await run('worker-browser',electron,['tests/cad-browser-worker.cjs']);
 await run('independent-step-reader','powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File','cad-kernel-build/step-reader-proof/run.ps1']);
 await run('runtime-integrity',process.execPath,['cad-kernel-build/verify-runtime.mjs']);
 const {spawnSync}=await import('node:child_process'),staged=spawnSync(process.execPath,['tests/stage-cad-native-app.mjs'],{cwd:root,encoding:'utf8'});if(staged.status!==0)throw Error('Isolated native stage failed.');const stage=JSON.parse(staged.stdout.trim());
 await run('native-electron-http-mcp-and-ui',process.execPath,['tests/cad-portable-proof.cjs'],{FORMNARO_TEST_APP_DIR:stage.directory});
 if(JSON.stringify(initialSources)!==JSON.stringify(sourceManifest()))throw Error('Sources changed during acceptance; repeat the affected checks before release.');
 fs.writeFileSync(report,JSON.stringify({ok:true,version,checks,manifest:cadReleaseManifest(root),elapsedMs:Date.now()-started,actualPackagedExePending:true},null,2)+'\n');console.log(JSON.stringify({ok:true,version,checks:checks.length,report}));
}catch(error){fs.writeFileSync(report,JSON.stringify({ok:false,version,checks,elapsedMs:Date.now()-started,error:error.message},null,2)+'\n');throw error;}
