// P26 uses only these explicitly named new F: task/output directories.
import fs from 'node:fs';
import path from 'node:path';

export const hollowTaskDirectory=path.resolve('F:/Formnaro-Buildtemp/Paket26-0.49.0');
export const hollowReleaseDirectory=path.resolve('F:/Formnaro-Ausgaben/Aushoehlen-v0.49.0');
export const hollowArchiveFile=path.resolve('F:/Formnaro-Ausgaben/Formnaro-Aushoehlen-v0.49.0.zip');

function ownedDirectory(directory,markerName,format,workspace){
 const marker=path.join(directory,markerName);
 const identity={format,package:26,version:'0.49.0',workspace:path.resolve(workspace),syntheticOnly:true};
 if(fs.existsSync(directory)){
  const stat=fs.lstatSync(directory);
  if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('P26 path is not a regular directory: '+directory);
  if(!fs.existsSync(marker)){
   if(fs.readdirSync(directory).length)throw Error('Refusing existing nonempty unmarked P26 directory: '+directory);
   fs.writeFileSync(marker,JSON.stringify(identity,null,2),{flag:'wx'});
  }else{
   const stat=fs.lstatSync(marker);
   if(!stat.isFile()||stat.isSymbolicLink()||JSON.stringify(JSON.parse(fs.readFileSync(marker,'utf8')))!==JSON.stringify(identity))throw Error('P26 ownership marker differs: '+directory);
  }
 }else{
  fs.mkdirSync(directory,{recursive:true});
  fs.writeFileSync(marker,JSON.stringify(identity,null,2),{flag:'wx'});
 }
 return {directory,markerName,identity};
}

export function ensureHollowTaskTemp(workspace=process.cwd()){
 return ownedDirectory(hollowTaskDirectory,'.formnaro-paket26-temp.json','FormnaroSyntheticTaskTemp',workspace).directory;
}

export function ensureHollowOutput(workspace=process.cwd(),{fresh=false}={}){
 const owned=ownedDirectory(hollowReleaseDirectory,'.formnaro-paket26-output.json','FormnaroSyntheticReleaseOutput',workspace);
 if(fresh){
  if(fs.readdirSync(owned.directory).some(name=>name!==owned.markerName))throw Error('P26 release already contains files; nothing will be overwritten');
  if(fs.existsSync(hollowArchiveFile)||fs.existsSync(hollowArchiveFile+'.sha256'))throw Error('P26 archive output already exists; nothing will be overwritten');
 }
 return owned.directory;
}
