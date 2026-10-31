import {zipSync} from 'fflate';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const profile=JSON.parse(fs.readFileSync(new URL('./portable-freecad-profile.json',import.meta.url),'utf8'));
const nativeExclusions=new Map(profile.nativeExclusions.map(row=>[row.file.toLowerCase(),row]));
for(const name of ['bin/freecad.exe','bin/freecadcmd.exe','bin/python.exe','bin/freecad.pyd','bin/python3.dll','bin/python311.dll','bin/opengl32sw.dll','lib/part.pyd','lib/sketcher.pyd','lib/mesh.pyd','lib/meshpart.pyd','lib/import.pyd','lib/surface.pyd','formnaro-container.exe'])if(nativeExclusions.has(name))throw Error('Core runtime cannot be excluded: '+name);
const omittedPythonPackages=new Set(profile.omittedPythonPackages.map(n=>n.toLowerCase()));

// Workbench exclusions follow the checked Formnaro worker imports and supported
// dynamic module catalogue. Core DLLs and Python dependencies remain intact.
export const omittedWorkbenches=new Set(['BIM','Fem','CAM','Idf','OpenSCAD','Robot','ReverseEngineering','Inspection','AddonManager','Test','Tux',...profile.extraOmittedWorkbenches]);
const qtTools=new Set('androiddeployqt androiddeployqt6 androidtestrunner designer dumpcpp dumpdoc idc lconvert linguist lrelease lupdate pixeltool qdbuscpp2xml qdbusviewer qdbusxml2cpp qdistancefieldgenerator qdoc qmake qmake6 qmldom qmleasing qmlformat qmllint qmlls qmlplugindump qmlpreview qmlprofiler qmltc qmltestrunner qmltime qtdiag qtdiag6 qtpaths qtpaths6 qtplugininfo testcon windeployqt windeployqt6 svgtoqml'.split(' ').map(n=>n+'.exe'));
export function cadExclusion(file){
 const n=file.replaceAll('\\','/');
 if(nativeExclusions.has(n.toLowerCase()))return 'audited-unused-native-component';
 if(n.startsWith('bin/Lib/site-packages/')&&omittedPythonPackages.has(n.split('/')[3].toLowerCase()))return 'unused-python-package';
 if(n.startsWith('lib/vtk-9.3/'))return 'unused-vtk-wrapper-build-data';
 if(n.endsWith('.pyi'))return 'development-type-stubs';
 if(/^lib\/(?:Fem|FemGui|Path|PathGui|Robot|RobotGui|ReverseEngineering|ReverseEngineeringGui|Inspection|InspectionGui)\.pyd$/.test(n))return 'unused-workbench';
 if(n.startsWith('Mod/')&&omittedWorkbenches.has(n.split('/')[1]))return 'unused-workbench';
 if(n==='bin/Lib/test'||n.startsWith('bin/Lib/test/')||n.split('/').some(part=>['test','tests','idle_test','TDTest'].includes(part)||/^[A-Za-z]+Tests$/i.test(part)))return 'upstream-test-data';
 if(/^Mod\/[^/]+\/Test[^/]*\.py$/.test(n))return 'upstream-test-data';
 if(n.startsWith('data/examples/'))return 'upstream-example-data';
 if(n.startsWith('sources/'))return 'separate-source-archive';
 if(n.endsWith('.pdb'))return 'debug-symbols';
 if(/^(?:include\/|lib\/(?:cmake|pkgconfig)\/|lib\/qt6\/(?:mkspecs|metatypes|modules)\/)/.test(n))return 'build-metadata';
 if(/^lib\/[^/]+\.(?:a|lib|prl)$/.test(n))return 'linker-input';
 if(n.startsWith('lib/qt6/bin/')&&(qtTools.has(path.posix.basename(n))||n.endsWith('.bat')))return 'qt-development-tool';
 // Keep rcc/uic and all Qt DLLs/plugins for runtime Python/GUI loading.
 if(/^lib\/qt6\/(?:cmake_automoc_parser|lprodump|lrelease-pro|lupdate-pro|moc|qlalr|qmlaotstats|qmljsrootgen|qmltyperegistrar|qtattributionsscanner|qvkgen|syncqt|tracegen|tracepointgen)\.exe$/.test(n))return 'qt-development-tool';
 return null;
}
export function sourceAssetNotice(manifest){return `Formnaro integrated CAD runtime: FreeCAD ${manifest.version}, Windows x64 / Python ${manifest.python}.\nRuntime file contents are unchanged; developer tools, build metadata and debug symbols are omitted.\nFreeCAD is a separate executable and retains its upstream licenses.\nLicenses: doc/LICENSE.html, doc/ThirdPartyLibraries.html, share/doc and Python package notices.\nCorresponding FreeCAD source and Formnaro launcher source are supplied separately in Formnaro-FreeCAD-Quellen-${manifest.version}.zip alongside this portable package.\nUpstream source archive: ${manifest.source.url}\nSource SHA256: ${manifest.source.sha256}\nDependency package/build versions: packages.txt; recipes: https://github.com/conda-forge/feedstocks\nBundle build: https://github.com/FreeCAD/FreeCAD-Bundle\nNo FreeCAD or Python installation is required on the user's computer.\n`;}
export function copyPortableCAD(from,to){
 if(fs.existsSync(to))throw Error('CAD output must be a new directory.');
 const original=JSON.parse(fs.readFileSync(path.join(from,'manifest.json'))),removed=[],files=[];
 const hash=b=>createHash('sha256').update(b).digest('hex');
 for(const row of original.files){
  if(typeof row.file!=='string'||row.file.split('/').some(part=>!part||part==='.'||part==='..'||/[\\:\0]/.test(part)))throw Error('Unsafe CAD manifest path');
  const nativeRule=nativeExclusions.get(row.file.toLowerCase());if(nativeRule&&nativeRule.sha256!==row.sha256)throw Error('Native exclusion needs a new dependency audit: '+row.file);
  const pySource=row.file.replace(/\/__pycache__\/([^/]+)\.cpython-[^.]+(?:\.opt-\d+)?\.pyc$/, '/$1.py').replace(/\.pyc$/,'.py');
  const reason=row.file.endsWith('.pyc')&&pySource!==row.file&&fs.existsSync(path.join(from,pySource))?'python-bytecode-cache':cadExclusion(row.file);if(reason){removed.push({...row,reason});continue;}
  const input=path.join(from,row.file),output=path.join(to,row.file);fs.mkdirSync(path.dirname(output),{recursive:true});
  const bytes=row.file==='SOURCE-NOTICE.txt'?Buffer.from(sourceAssetNotice(original)):fs.readFileSync(input);
  if(row.file!=='SOURCE-NOTICE.txt'&&(bytes.length!==row.size||hash(bytes)!==row.sha256))throw Error('CAD input damaged: '+row.file);
  fs.writeFileSync(output,bytes);files.push({file:row.file,size:bytes.length,sha256:hash(bytes)});
 }
 const manifest={...original,scope:'Portable runtime; developer tools, build metadata and debug symbols omitted. Corresponding source supplied separately.',files};
 fs.writeFileSync(path.join(to,'manifest.json'),JSON.stringify(manifest,null,2));
 return {files:files.length,removedFiles:removed.length,savedBytes:removed.reduce((a,r)=>a+r.size,0),removed};
}
export function copyPortableApp(source,stage){
 const docs=new Set(['Formnaro-CAD-Handbuch-DE.txt']);
 for(const n of ['backend','ai','licenses','dist','electron.cjs','preload.cjs','package.json','LICENSE.txt','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt'])fs.cpSync(path.join(source,n),path.join(stage,n),{recursive:true,filter:file=>n!=='backend'||!(/verification|fixture|^all-functions|^\./.test(path.basename(file))||file.endsWith('.cs'))});
 for(const n of docs){const input=path.join(source,'docs',n);if(fs.existsSync(input)){fs.mkdirSync(path.join(stage,'docs'),{recursive:true});fs.copyFileSync(input,path.join(stage,'docs',n));}}
 // The public bridge client and acceptance/build scripts stay in the source repository.
}
export const speechRuntimeDLLs=['msvcp140.dll','vcruntime140.dll','vcruntime140_1.dll','vcomp140.dll'];
export function copySpeechEngine(from,to,{crtDirectory}={}){
 if(fs.existsSync(to))throw Error('Speech output must be a new directory');
 if(!crtDirectory)throw Error('Speech packaging requires the verified CAD Microsoft runtime directory');
 const cad=JSON.parse(fs.readFileSync(path.join(crtDirectory,'../manifest.json')));
 const runtimeFiles=speechRuntimeDLLs.map(name=>{
  const row=cad.files.find(row=>row.file.toLowerCase()==='bin/'+name);
  if(!row)throw Error('CAD Microsoft runtime missing from manifest: '+name);
  const bytes=fs.readFileSync(path.join(crtDirectory,name));
  if(bytes.length!==row.size||createHash('sha256').update(bytes).digest('hex')!==row.sha256)throw Error('CAD Microsoft runtime damaged: '+name);
  return {name,bytes,sha256:row.sha256};
 });
 const manifest=JSON.parse(fs.readFileSync(path.join(from,'manifest.json')));fs.mkdirSync(to,{recursive:true});
 for(const item of manifest.files.filter(row=>!row.name.endsWith('.bin'))){
  if(!/^[a-zA-Z0-9_.-]+$/.test(item.name))throw Error('Invalid speech engine path');
  const bytes=fs.readFileSync(path.join(from,item.name));if(createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw Error('Speech engine damaged: '+item.name);fs.writeFileSync(path.join(to,item.name),bytes);
 }
 for(const item of runtimeFiles){fs.writeFileSync(path.join(to,item.name),item.bytes);manifest.files=manifest.files.filter(row=>row.name.toLowerCase()!==item.name);manifest.files.push({name:item.name,sha256:item.sha256});}
 manifest.microsoftRuntime={source:'Unmodified DLLs from the bundled FreeCAD runtime; its manifest pins every file.',files:speechRuntimeDLLs,notices:'../freecad/SOURCE-NOTICE.txt; ../freecad/doc/ThirdPartyLibraries.html; ../freecad/share/doc'};
 fs.writeFileSync(path.join(to,'manifest.json'),JSON.stringify(manifest,null,2));
 fs.writeFileSync(path.join(to,'MICROSOFT-RUNTIME-NOTICE.txt'),'Microsoft Visual C++ / OpenMP runtime\nThe four app-local DLLs are unchanged copies of the Microsoft runtime bundled with FreeCAD.\nTheir original file hashes are recorded in this manifest and ../freecad/manifest.json.\nThe accompanying upstream notices and package/build versions remain in ../freecad.\n');
 for(const n of ['LICENSE-whisper.txt','LICENSE-model.txt'])fs.copyFileSync(path.join(from,n),path.join(to,n));
}

export function writeCADSourceAsset(from,directory){
 const manifest=JSON.parse(fs.readFileSync(path.join(from,'manifest.json'))),entries={};
 if(!manifest.files.some(row=>row.file.startsWith('sources/')&&row.file.endsWith('.tar.gz')))throw Error('A complete FreeCAD source input is required to create the corresponding source archive');
 for(const row of manifest.files.filter(r=>r.file.startsWith('sources/'))){const bytes=fs.readFileSync(path.join(from,row.file));if(createHash('sha256').update(bytes).digest('hex')!==row.sha256)throw Error('CAD source damaged');entries[row.file]=[new Uint8Array(bytes),{level:0}];}
 entries['SOURCE-NOTICE.txt']=new TextEncoder().encode(sourceAssetNotice(manifest));
 fs.mkdirSync(directory,{recursive:true});const file=path.join(directory,`Formnaro-FreeCAD-Quellen-${manifest.version}.zip`);fs.writeFileSync(file,zipSync(entries,{level:0}));return file;
}

export function converterRuntime(root){
 const provenance=JSON.parse(fs.readFileSync(path.join(root,'converter/provenance.json'),'utf8'));
 if(!/^runtime-v010(?:-[a-z0-9]+)*$/.test(provenance.runtimeDirectory))throw Error('Invalid converter runtime directory');
 const directory=path.join(root,'converter',provenance.runtimeDirectory),exe=path.join(directory,'Formnaro-Konverter.exe');
 if(createHash('sha256').update(fs.readFileSync(exe)).digest('hex')!==provenance.headlessExeSha256)throw Error('Converter executable differs from its provenance');
 return directory;
}

export function trimElectronLocales(runtime){
 const directory=path.join(runtime,'locales'),keep=new Set(['de.pak','en-US.pak','en-GB.pak']);
 // Only a newly assembled runtime may call this helper. Never recurse through
 // links or apply a name-based deletion to a user-selected directory.
 if(!fs.existsSync(path.join(runtime,'Formnaro.exe'))||!fs.existsSync(path.join(runtime,'resources/app.asar'))||fs.lstatSync(directory).isSymbolicLink()||path.dirname(fs.realpathSync(directory))!==fs.realpathSync(runtime))throw Error('Expected a freshly packaged Electron runtime');
 for(const name of ['de.pak','en-US.pak'])if(!fs.existsSync(path.join(directory,name)))throw Error('Required Electron locale missing: '+name);
 const removed=[];
 for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
  if(!entry.isFile()||! /^[A-Za-z0-9-]+\.pak$/.test(entry.name)||keep.has(entry.name))continue;
  const file=path.join(directory,entry.name);removed.push({file:entry.name,bytes:fs.statSync(file).size});fs.unlinkSync(file);
 }
 return {kept:[...keep].filter(name=>fs.existsSync(path.join(directory,name))),removed,savedBytes:removed.reduce((sum,row)=>sum+row.bytes,0)};
}
