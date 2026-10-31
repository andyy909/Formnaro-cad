import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
export function integrationManifest(root=process.cwd()){
 const files=[];
 function scan(directory,relative){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
  if(entry.name==='__pycache__'||/\.py[co]$/.test(entry.name))continue;
  if(relative==='converter'&&(entry.name.startsWith('runtime')||entry.name==='.venv'||entry.name.endsWith('.egg-info')))continue;
  if(relative==='parametric'&&entry.name==='runtime-win-x64')continue;
  if(entry.isSymbolicLink())throw Error('Symlink in source');
  const name=relative+'/'+entry.name;if(entry.isDirectory())scan(path.join(directory,entry.name),name);else files.push(name);
 }}
 for(const name of ['python-runtime','src','backend','scripts','tests','converter','parametric','dist','licenses','docs','cad-kernel-build','ai'])scan(path.join(root,name),name);
 if(fs.existsSync(path.join(root,'public')))scan(path.join(root,'public'),'public');
 for(const name of ['electron.cjs','preload.cjs','package.json','package-lock.json','LICENSE.txt','index.html','vite.config.js','README.md','LIES-MICH.txt','THIRD-PARTY-LICENSES.txt','.gitignore'])files.push(name);
 return files.sort().map(file=>({file,sha256:createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')}));
}
