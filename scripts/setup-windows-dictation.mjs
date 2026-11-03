import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const checkout=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceHash=file=>sha256(fs.readFileSync(file,'utf8').replaceAll('\r\n','\n'));

export function verifyWindowsDictation(root=checkout){
 const source=path.join(root,'backend/windows-dictation.cs');
 const bytes=fs.readFileSync(path.join(root,'backend/windows-dictation.exe'));
 const pin=JSON.parse(fs.readFileSync(path.join(root,'backend/windows-dictation-pin.json'),'utf8'));
 if(bytes.length!==pin.bytes||sha256(bytes)!==pin.sha256||sourceHash(source)!==pin.sourceSha256){
  throw Error('The Windows dictation helper does not match its checked-in pin and source. Regenerate it with npm run setup:windows-dictation on Windows x64.');
 }
 return pin;
}

export function buildWindowsDictation(root=checkout){
 if(process.platform!=='win32')return {supported:false};
 const source=path.join(root,'backend/windows-dictation.cs'),file=path.join(root,'backend/windows-dictation.exe');
 const compiler=path.join(process.env.WINDIR??'C:/Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe');
 const result=spawnSync(compiler,['/nologo','/target:winexe','/platform:x64','/optimize+','/out:'+file,source],{stdio:'inherit',windowsHide:true});
 if(result.error||result.status!==0)throw Error('Windows-Diktat-Helfer konnte nicht gebaut werden.');
 if(spawnSync(file,['--self-test'],{windowsHide:true}).status!==0)throw Error('Windows-Diktat-Helfer hat eine ungültige native Eingabestruktur.');
 const bytes=fs.readFileSync(file),pin={bytes:bytes.length,sha256:sha256(bytes),sourceSha256:sourceHash(source)};
 fs.writeFileSync(path.join(root,'backend/windows-dictation-pin.json'),JSON.stringify(pin,null,2)+'\n');
 return {supported:true,...pin};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(process.argv[2]==='--verify'?verifyWindowsDictation():buildWindowsDictation()));
