import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export function buildWindowsDictation(root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')){
 if(process.platform!=='win32')return {supported:false};
 const source=path.join(root,'backend/windows-dictation.cs'),file=path.join(root,'backend/windows-dictation.exe');
 const pinFile=path.join(root,'backend/windows-dictation-pin.json');
 const sourceSha256=createHash('sha256').update(fs.readFileSync(source)).digest('hex');
 try{const pin=JSON.parse(fs.readFileSync(pinFile,'utf8')),bytes=fs.readFileSync(file);if(pin.sourceSha256===sourceSha256&&pin.bytes===bytes.length&&pin.sha256===createHash('sha256').update(bytes).digest('hex')&&spawnSync(file,['--self-test'],{windowsHide:true}).status===0)return {supported:true,cached:true,...pin};}catch{/* Missing or changed build inputs require a fresh verified helper. */}
 const compiler=path.join(process.env.WINDIR??'C:/Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe');
 const result=spawnSync(compiler,['/nologo','/target:winexe','/platform:x64','/optimize+','/out:'+file,source],{stdio:'inherit',windowsHide:true});
 if(result.error||result.status!==0)throw Error('Windows-Diktat-Helfer konnte nicht gebaut werden.');
 if(spawnSync(file,['--self-test'],{windowsHide:true}).status!==0)throw Error('Windows-Diktat-Helfer hat eine ungültige native Eingabestruktur.');
 const bytes=fs.readFileSync(file),pin={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),sourceSha256:createHash('sha256').update(fs.readFileSync(source)).digest('hex')};
 fs.writeFileSync(path.join(root,'backend/windows-dictation-pin.json'),JSON.stringify(pin,null,2)+'\n');
 return {supported:true,...pin};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(buildWindowsDictation()));
