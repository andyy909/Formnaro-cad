import {spawnSync} from 'node:child_process';
import {existsSync,readdirSync,writeFileSync,mkdirSync,copyFileSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const root=fileURLToPath(new URL('..',import.meta.url));
function run(cmd,args,cwd=root){const r=spawnSync(cmd,args,{cwd,stdio:'inherit',shell:process.platform==='win32'&&cmd.endsWith('.bat')});if(r.status!==0)throw Error('Android-Build fehlgeschlagen: '+cmd);}
const require=createRequire(import.meta.url);
run(process.execPath,[path.join(path.dirname(require.resolve('vite/package.json')),'bin/vite.js'),'build','--config','vite.android.config.js']);
const sdk=process.env.ANDROID_HOME||path.join(process.env.LOCALAPPDATA||'','Android','Sdk');if(!existsSync(sdk))throw Error('ANDROID_HOME auf das Android SDK setzen.');
writeFileSync(path.join(root,'android/local.properties'),'sdk.dir='+sdk.replaceAll('\\','/')+'\n');
let gradle=process.env.FORMNARO_GRADLE;
if(!gradle){const base=path.join(process.env.USERPROFILE||process.env.HOME,'.gradle/wrapper/dists/gradle-8.11.1-bin');if(existsSync(base))for(const d of readdirSync(base)){const candidate=path.join(base,d,'gradle-8.11.1/bin/gradle.bat');if(existsSync(candidate))gradle=candidate;}}
if(!gradle)throw Error('Gradle 8.11.1 installieren und FORMNARO_GRADLE auf gradle.bat setzen.');
run(gradle,['--no-daemon','assembleDebug'],path.join(root,'android'));
const output=path.resolve(process.env.FORMNARO_ANDROID_OUTPUT||path.join(root,'work/android-output'));mkdirSync(output,{recursive:true});
const target=path.join(output,'Formnaro-Mini-Android-0.5.0-test1.apk');copyFileSync(path.join(root,'android/app/build/outputs/apk/debug/app-debug.apk'),target);
writeFileSync(target+'.sha256',createHash('sha256').update(readFileSync(target)).digest('hex')+'  '+path.basename(target)+'\n');console.log('Tablet-Testausgabe: '+target);
