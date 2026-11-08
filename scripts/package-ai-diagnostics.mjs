// Private x64 diagnostics edition. Never updates an installation or publishes.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {extractAll} from '@electron/asar';
import {packager} from '@electron/packager';
const release=process.argv.includes('--release'),regular=release||process.argv.includes('--regular');
// Optional freshly retrieved official checksum table; @electron/get still
// verifies the cached/downloaded ZIP with its normal checksum validator.
const electronChecksums=process.env.FORMNARO_ELECTRON_CHECKSUMS_FILE?JSON.parse(fs.readFileSync(process.env.FORMNARO_ELECTRON_CHECKSUMS_FILE,'utf8')):undefined;
const root=process.cwd(),base=path.resolve(process.argv[2]??'F:/Formnaro/Programm-v0.127.0-r10');
const out=path.resolve(process.argv[3]??'F:/Formnaro-Testausgaben/KI-Testlabor-0.129.0-r1');
if(fs.existsSync(out))throw Error('Neues privates Ausgabeverzeichnis erforderlich.');
const build=path.join(root,'work','diagnostic-package-'+Date.now()),source=path.join(build,'source'),stage=path.join(build,'stage');
fs.mkdirSync(source,{recursive:true});
for(const name of ['src','public','ai','backend','packaging','python-runtime','LICENSE.txt','THIRD-PARTY-LICENSES.txt','cad-kernel-build/runtime','index.html','vite.config.js','package.json'])fs.cpSync(path.join(root,name),path.join(source,name),{recursive:true});
const metadata=JSON.parse(fs.readFileSync(path.join(source,'package.json'),'utf8'));metadata.version=regular?metadata.version:'0.129.0';metadata.diagnosticEdition=!regular;
fs.writeFileSync(path.join(source,'package.json'),JSON.stringify(metadata,null,2));
if(!regular)fs.writeFileSync(path.join(source,'src/version.js'),"export const FORMNARO_VERSION='0.129.0';\nexport const FORMNARO_BUILD_LABEL='KI-Testlabor · Privat r1';\n");
if(regular){const revision=/-r\d+$/.exec(out)?.[0].slice(1)??'r1';fs.writeFileSync(path.join(source,'src/version.js'),`export const FORMNARO_VERSION='${metadata.version}';\nexport const FORMNARO_BUILD_LABEL='${release?revision:'Privat '+revision}';\n`);}
fs.symlinkSync(path.join(root,'node_modules'),path.join(source,'node_modules'),'junction');
const result=spawnSync(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'build','--base','./'],{cwd:source,windowsHide:true,encoding:'utf8'});
fs.writeFileSync(path.join(build,'build.log'),result.stdout+'\n'+result.stderr);if(result.status!==0)throw Error('Diagnose-Build fehlgeschlagen: '+build);
extractAll(path.join(base,'resources/app.asar'),stage);
for(const name of ['backend','ai'])fs.cpSync(path.join(root,name),path.join(stage,name),{recursive:true});
fs.cpSync(path.join(source,'dist'),path.join(stage,'dist'),{recursive:true});
for(const name of ['electron.cjs','preload.cjs'])fs.copyFileSync(path.join(root,name),path.join(stage,name));
fs.writeFileSync(path.join(stage,'package.json'),JSON.stringify(metadata,null,2));
// Backend ZIP export uses the same declared fflate dependency as the renderer.
fs.cpSync(path.join(root,'node_modules','fflate'),path.join(stage,'node_modules','fflate'),{recursive:true,dereference:true});
// A packaged runtime requires its manifest pin even when the base edition omitted it.
// Verify the actual copied distribution before binding the new package to it.
const cadRoot=path.resolve(process.env.FORMNARO_PACKAGE_CAD_RUNTIME??path.join(base,'resources','freecad'));
const cadIntegrity=await (await import('../backend/freecad-runtime.cjs')).verifyRuntime(cadRoot);
const cadManifestSHA256=createHash('sha256').update(fs.readFileSync(path.join(cadRoot,'manifest.json'))).digest('hex');
fs.writeFileSync(path.join(stage,'backend','freecad-runtime-pin.json'),JSON.stringify({sha256:cadManifestSHA256}));
fs.copyFileSync(path.join(root,'docs/KI-STARTDIAGNOSE.md'),path.join(stage,'docs/KI-STARTDIAGNOSE.md'));
for(const name of ['KI-TESTLABOR.md','KI-CAD-EVAL-QUELLEN-2026-11-05.md','KI-ABSCHLUSSAUSWERTER.md','KI-LABOR-ROLLENWAHL.md','KI-BENCHMARK.md','KI-MODELL-BENCHMARKS.md'])fs.copyFileSync(path.join(root,'docs',name),path.join(stage,'docs',name));
const [runtime]=await packager({dir:stage,name:'Formnaro',platform:'win32',arch:'x64',out,asar:true,prune:false,overwrite:false,...(electronChecksums?{download:{checksums:electronChecksums}}:{}),electronVersion:JSON.parse(fs.readFileSync(path.join(root,'node_modules/electron/package.json'))).version,appVersion:metadata.version,icon:path.join(stage,'dist/formnaro-icon.ico'),win32metadata:{ProductName:'Formnaro',FileDescription:regular?'Formnaro CAD':'Privates KI-Testlabor'}});
for(const name of ['freecad','converter'])fs.cpSync(name==='freecad'?cadRoot:path.join(base,'resources',name),path.join(runtime,'resources',name),{recursive:true,dereference:false});
const cadCopyIntegrity=await (await import('../backend/freecad-runtime.cjs')).verifyRuntime(path.join(runtime,'resources','freecad'));
if(createHash('sha256').update(fs.readFileSync(path.join(runtime,'resources','freecad','manifest.json'))).digest('hex')!==cadManifestSHA256)throw Error('Kopierte CAD-Laufzeit hat ein anderes Manifest.');
for(const name of ['LICENSE.txt','THIRD-PARTY-LICENSES.txt'])fs.copyFileSync(path.join(stage,name),path.join(runtime,name));
if(!regular)fs.writeFileSync(path.join(runtime,'START-HIER.txt'),'Formnaro KI-Testlabor 0.129.0 Privat r1\r\nFormnaro.exe starten. Das Diagnosefenster öffnet sich automatisch.\r\nEigener DeepSeek-Zugang unter KI-Einstellungen. Eigenes Testprofil im Ordner Testprofil.\r\nKeine bestehende Installation wird ersetzt. Keine Veröffentlichung.\r\nGesamtkosten oben sind tarifbasiert; Anbieterabgleich siehe Vergleichsbericht.\r\n');
if(regular)fs.writeFileSync(path.join(runtime,'START-HIER.txt'),'Formnaro '+metadata.version+'\r\nFormnaro.exe starten. KI-Testlabor unter Einstellungen > KI / API > KI-Testlabor öffnen.\r\n');
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const report={private:!release,published:false,version:metadata.version,revision:regular?(/-r\d+$/.exec(out)?.[0].slice(1)??null):'r1',runtime,baseAsarSHA256:hash(path.join(base,'resources/app.asar')),exeSHA256:hash(path.join(runtime,'Formnaro.exe')),asarSHA256:hash(path.join(runtime,'resources/app.asar')),sourceBuild:build,cadManifestSHA256,cadIntegrity,cadCopyIntegrity,verification:'pending'};
fs.writeFileSync(path.join(out,'Paket.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
