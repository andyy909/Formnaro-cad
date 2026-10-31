import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {unzipSync} from 'fflate';
const root=path.resolve('speech-runtime'),manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
async function fetchVerified(url,expected){const response=await fetch(url);if(!response.ok)throw Error('Download failed: '+response.status);const bytes=new Uint8Array(await response.arrayBuffer());if(sha(bytes)!==expected)throw Error('Download SHA-256 mismatch');return bytes;}
let archive;
for(const item of manifest.files.filter(item=>process.argv.includes('--with-model')||!item.name.endsWith('.bin'))){
 const target=path.join(root,item.name);try{if(sha(await fs.readFile(target))===item.sha256)continue;}catch{}
 let bytes;
 if(item.name.endsWith('.bin'))bytes=await fetchVerified(manifest.modelUrl,item.sha256);
 else{archive??=unzipSync(await fetchVerified(manifest.archiveUrl,manifest.archiveSha256));const matches=Object.entries(archive).filter(([name])=>name.split('/').at(-1)===item.name);if(matches.length!==1)throw Error('Ambiguous runtime file '+item.name);bytes=matches[0][1];if(sha(bytes)!==item.sha256)throw Error('Runtime SHA-256 mismatch');}
 await fs.writeFile(target,bytes);console.log('Verified '+item.name);
}
console.log('Local speech runtime ready.');
