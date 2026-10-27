// Dedicated, explicitly named P23 build/test storage. Never traverse other F: data.
import fs from 'node:fs';
import path from 'node:path';

export function ensureSmoothTaskTemp(workspace=process.cwd()){
 const directory=path.resolve('F:/Formnaro-Buildtemp/Paket23-0.46.0');
 const marker=path.join(directory,'.formnaro-paket23-temp.json');
 const identity={format:'FormnaroSyntheticTaskTemp',package:23,version:'0.46.0',workspace:path.resolve(workspace),syntheticOnly:true};
 if(fs.existsSync(directory)){
  const stat=fs.lstatSync(directory);
  if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('P23 task temp is not a regular directory');
  if(!fs.existsSync(marker)){
   if(fs.readdirSync(directory).length)throw Error('Refusing an existing nonempty unmarked P23 task temp');
   fs.writeFileSync(marker,JSON.stringify(identity,null,2),{flag:'wx'});
  }else{
   const stat=fs.lstatSync(marker);
   if(!stat.isFile()||stat.isSymbolicLink()||JSON.stringify(JSON.parse(fs.readFileSync(marker,'utf8')))!==JSON.stringify(identity))throw Error('P23 task temp ownership marker differs');
  }
 }else{
  fs.mkdirSync(directory,{recursive:true});
  fs.writeFileSync(marker,JSON.stringify(identity,null,2),{flag:'wx'});
 }
 return directory;
}
