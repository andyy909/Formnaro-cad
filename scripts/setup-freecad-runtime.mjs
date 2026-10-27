import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=path.resolve('freecad-runtime/runtime'),cache=path.resolve('work/freecad-runtime/download');
const archive='FreeCAD_1.1.4-Windows-x86_64-py311.7z';
const archiveSha256='4828741fc91ee37fafcdb97a1abacb18b04ba451ac4372d9ff7a7349b36f4d6d';
const source='freecad_source_1.1.4.tar.gz',sourceSha256='674f2c42dc060b71c8b052c70b04a9a995dde6cb868fe568615d3ff3f2717748';
const url=name=>'https://github.com/FreeCAD/FreeCAD/releases/download/1.1.4/'+name;
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
fs.mkdirSync(cache,{recursive:true});
for(const [name,sha]of [[archive,archiveSha256],[source,sourceSha256]]){
 const file=path.join(cache,name);
 if(!fs.existsSync(file)||hash(file)!==sha){
  const result=spawnSync('curl.exe',['-L','--fail','--silent','--show-error','-o',file,url(name)],{stdio:'inherit',windowsHide:true});if(result.status!==0)throw Error('FreeCAD download failed');
 }
 if(hash(file)!==sha)throw Error('FreeCAD archive checksum mismatch: '+name);
}
const unpacked=path.join(cache,archive.slice(0,-3));
if(!fs.existsSync(path.join(unpacked,'packages.txt'))){const r=spawnSync('tar.exe',['-xf',path.join(cache,archive),'-C',cache],{stdio:'inherit',windowsHide:true});if(r.status!==0)throw Error('FreeCAD extraction failed');}
if(!fs.existsSync(root)){
 console.log('Copying the complete official portable runtime');fs.cpSync(unpacked,root,{recursive:true});
}
fs.mkdirSync(path.join(root,'sources'),{recursive:true});fs.copyFileSync(path.join(cache,source),path.join(root,'sources',source));
fs.copyFileSync('backend/freecad-container.cs',path.join(root,'sources/formnaro-container.cs'));
const compiler=path.join(process.env.WINDIR??'C:/Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe');
const r=spawnSync(compiler,['/nologo','/out:'+path.join(root,'formnaro-container.exe'),path.resolve('backend/freecad-container.cs')],{stdio:'inherit',windowsHide:true});if(r.status!==0)throw Error('CAD isolation launcher compilation failed');
fs.writeFileSync(path.join(root,'SOURCE-NOTICE.txt'),`Formnaro integrated CAD runtime: FreeCAD 1.1.4, official Windows x64 / Python 3.11 portable distribution.\nThe upstream files are unmodified. No personal settings, add-ons or user data are copied.\nFreeCAD is a separate executable and is not covered by the Formnaro proprietary license.\nLicenses: doc/LICENSE.html, doc/ThirdPartyLibraries.html, share/doc and Python package license notices.\nFreeCAD corresponding source: sources/${source}\nUpstream source: https://github.com/FreeCAD/FreeCAD/tree/1.1.4\nDependency packages, versions, build channels and exact conda build strings: packages.txt.\nDependency recipes and source retrieval: https://github.com/conda-forge/feedstocks\nFreeCAD bundle build: https://github.com/FreeCAD/FreeCAD-Bundle\nThe included launcher source is sources/formnaro-container.cs. It only launches isolated CAD jobs.\nNo runtime download, registration, Python installation or FreeCAD installation is performed on the user's computer.\n`);
function inventory(dir,prefix=''){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
 if(e.isSymbolicLink())throw Error('Unexpected runtime symlink');const file=prefix+e.name,p=path.join(dir,e.name);
 return e.isDirectory()?inventory(p,file+'/'):file==='manifest.json'?[]:[{file,size:fs.statSync(p).size,sha256:hash(p)}];
}).sort((a,b)=>a.file.localeCompare(b.file,'en'));}
const files=inventory(root);fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify({schema:1,version:'1.1.4',python:'3.11',archive:{url:url(archive),sha256:archiveSha256},source:{url:url(source),sha256:sourceSha256},scope:'Complete unmodified upstream portable distribution plus sources, notices and Formnaro isolation launcher',files},null,2));
console.log(JSON.stringify({ok:true,root,files:files.length,bytes:files.reduce((a,f)=>a+f.size,0),manifestSha256:hash(path.join(root,'manifest.json'))}));
