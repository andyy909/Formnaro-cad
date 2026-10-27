import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
export function cadReleaseManifest(root=process.cwd()){
 const files=[];
 function collect(relative){for(const entry of fs.readdirSync(path.join(root,relative),{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){if(entry.name==='__pycache__'||/\.py[co]$/i.test(entry.name))continue;const name=relative+'/'+entry.name;if(entry.isSymbolicLink())throw Error('Release source symlinks are excluded.');if(entry.isDirectory())collect(name);else if(entry.isFile())files.push(name);}}
 for(const name of ['src','backend','scripts','tests','dist','cad-kernel-build'])collect(name);
 for(const name of ['package.json','package-lock.json','LICENSE.txt','index.html','vite.config.js','electron.cjs','preload.cjs'])files.push(name);
 return files.sort().map(file=>{const bytes=fs.readFileSync(path.join(root,file));return {file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};});
}
