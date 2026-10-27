// P24 uses only these explicitly named new F: task/output directories.
import fs from 'node:fs';
import path from 'node:path';

export const eraseFillTaskDirectory=path.resolve('F:/Formnaro-Buildtemp/Paket24-0.47.0');
export const eraseFillReleaseDirectory=path.resolve('F:/Formnaro-Ausgaben/Bereiche-Ersetzen-v0.47.0');
export const eraseFillArchiveFile=path.resolve('F:/Formnaro-Ausgaben/Formnaro-Bereiche-Ersetzen-v0.47.0.zip');

function ownedDirectory(directory,markerName,format,workspace){
 const marker=path.join(directory,markerName);
 const identity={format,package:24,version:'0.47.0',workspace:path.resolve(workspace),syntheticOnly:true};
 if(fs.existsSync(directory)){
  const stat=fs.lstatSync(directory);
  if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('P24 path is not a regular directory: '+directory);
  if(!fs.existsSync(marker)){
   if(fs.readdirSync(directory).length)throw Error('Refusing existing nonempty unmarked P24 directory: '+directory);
   fs.writeFileSync(marker,JSON.stringify(identity,null,2),{flag:'wx'});
  }else{
   const stat=fs.lstatSync(marker);
   if(!stat.isFile()||stat.isSymbolicLink()||JSON.stringify(JSON.parse(fs.readFileSync(marker,'utf8')))!==JSON.stringify(identity))throw Error('P24 ownership marker differs: '+directory);
  }
 }else{
  fs.mkdirSync(directory,{recursive:true});
  fs.writeFileSync(marker,JSON.stringify(identity,null,2),{flag:'wx'});
 }
 return {directory,markerName,identity};
}

export function ensureEraseFillTaskTemp(workspace=process.cwd()){
 return ownedDirectory(eraseFillTaskDirectory,'.formnaro-paket24-temp.json','FormnaroSyntheticTaskTemp',workspace).directory;
}

export function ensureEraseFillOutput(workspace=process.cwd(),{fresh=false}={}){
 const owned=ownedDirectory(eraseFillReleaseDirectory,'.formnaro-paket24-output.json','FormnaroSyntheticReleaseOutput',workspace);
 if(fresh){
  if(fs.readdirSync(owned.directory).some(name=>name!==owned.markerName))throw Error('P24 release already contains files; nothing will be overwritten');
  if(fs.existsSync(eraseFillArchiveFile)||fs.existsSync(eraseFillArchiveFile+'.sha256'))throw Error('P24 archive output already exists; nothing will be overwritten');
 }
 return owned.directory;
}
