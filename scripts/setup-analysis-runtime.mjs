import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=process.cwd(),dir=path.join(root,'python-runtime/packages'),lock=JSON.parse(await fs.readFile(path.join(root,'python-runtime/pyodide-lock.json')));
await fs.mkdir(dir,{recursive:true});
const names=new Set();function include(name){if(names.has(name))return;names.add(name);for(const dep of lock.packages[name].depends)include(dep);}
['numpy','scipy','shapely','matplotlib','sympy','networkx'].forEach(include);
const records=[];
const overrides=JSON.parse(await fs.readFile(path.join(dir,'security-overrides.json')));
async function download(url,file,sha){
 let bytes;try{bytes=await fs.readFile(path.join(dir,file));}catch{}
 if(!bytes||createHash('sha256').update(bytes).digest('hex')!==sha){if(url.startsWith('formnaro-build:'))throw Error('Pinned security wheel missing or changed: '+file+'. Rebuild using python-runtime/security-pillow/README.md and verify the resulting provenance before updating its pin.');const r=await fetch(url);if(!r.ok)throw Error(url+': '+r.status);bytes=Buffer.from(await r.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==sha)throw Error('Digest mismatch: '+file);await fs.writeFile(path.join(dir,file),bytes);}
 return bytes.length;
}
for(const name of names){if(overrides[name]){const p=overrides[name];await download(p.url,p.file,p.sha256);records.push(p);console.log(name+' '+p.bytes+' (pinned security build)');continue;}const p=lock.packages[name],url='https://cdn.jsdelivr.net/pyodide/v314.0.7/full/'+p.file_name,bytes=await download(url,p.file_name,p.sha256);records.push({name,version:p.version,file:p.file_name,sha256:p.sha256,bytes,url,depends:p.depends});console.log(name+' '+bytes);}
// Pure Python wheels are pinned by the package index's published digest.
let previous;try{previous=JSON.parse(await fs.readFile(path.join(dir,'manifest.json')));}catch{}
for(const name of ['trimesh']){const pinned=previous?.packages.find(p=>p.name===name);if(pinned){await download(pinned.url,pinned.file,pinned.sha256);records.push(pinned);continue;}const r=await fetch('https://pypi.org/pypi/'+name+'/json');if(!r.ok)throw Error('Package metadata unavailable');const meta=await r.json(),p=meta.urls.find(p=>p.filename.endsWith('-py3-none-any.whl'));if(!p)throw Error('Pure Python wheel unavailable');const bytes=await download(p.url,p.filename,p.digests.sha256);records.push({name,version:meta.info.version,file:p.filename,sha256:p.digests.sha256,bytes,url:p.url,depends:['numpy']});console.log(name+' '+bytes);}
await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify({version:1,runtime:'314.0.7',packages:records},null,2)+'\n');
