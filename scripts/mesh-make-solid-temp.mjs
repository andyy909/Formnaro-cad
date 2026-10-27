// P25 uses only these explicitly named new F: task/output directories.
import fs from 'node:fs';
import path from 'node:path';

export const makeSolidTaskDirectory=path.resolve('F:/Formnaro-Buildtemp/Paket25-0.48.0');
export const makeSolidReleaseDirectory=path.resolve('F:/Formnaro-Ausgaben/Make-Solid-v0.48.0');
export const makeSolidArchiveFile=path.resolve('F:/Formnaro-Ausgaben/Formnaro-Make-Solid-v0.48.0.zip');

function ownedDirectory(directory,markerName,format,workspace){
 const marker=path.join(directory,markerName);
 const identity={format,package:25,version:'0.48.0',workspace:path.resolve(workspace),syntheticOnly:true};
 if(fs.existsSync(directory)){
  const stat=fs.lstatSync(directory);
  if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('P25 path is not a regular directory: '+directory);
  if(!fs.existsSync(marker)){
   if(fs.readdirSync(directory).length)throw Error('Refusing existing nonempty unmarked P25 directory: '+directory);
   fs.writeFileSync(marker,JSON.stringify(identity,null,2),{flag:'wx'});
  }else{
   const stat=fs.lstatSync(marker);
   if(!stat.isFile()||stat.isSymbolicLink()||JSON.stringify(JSON.parse(fs.readFileSync(marker,'utf8')))!==JSON.stringify(identity))throw Error('P25 ownership marker differs: '+directory);
  }
 }else{
  fs.mkdirSync(directory,{recursive:true});
  fs.writeFileSync(marker,JSON.stringify(identity,null,2),{flag:'wx'});
 }
 return {directory,markerName,identity};
}

export function ensureMakeSolidTaskTemp(workspace=process.cwd()){
 return ownedDirectory(makeSolidTaskDirectory,'.formnaro-paket25-temp.json','FormnaroSyntheticTaskTemp',workspace).directory;
}

export function ensureMakeSolidOutput(workspace=process.cwd(),{fresh=false}={}){
 const owned=ownedDirectory(makeSolidReleaseDirectory,'.formnaro-paket25-output.json','FormnaroSyntheticReleaseOutput',workspace);
 if(fresh){
  if(fs.readdirSync(owned.directory).some(name=>name!==owned.markerName))throw Error('P25 release already contains files; nothing will be overwritten');
  if(fs.existsSync(makeSolidArchiveFile)||fs.existsSync(makeSolidArchiveFile+'.sha256'))throw Error('P25 archive output already exists; nothing will be overwritten');
 }
 return owned.directory;
}
