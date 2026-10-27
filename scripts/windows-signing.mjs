import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {inspectUnsignedPE,assertSigningPreservesPE} from './windows-signing-integrity.mjs';

const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const fail=message=>{throw Error('Windows-Signatur: '+message);};
const plain=(v,keys)=>{if(!v||Object.getPrototypeOf(v)!==Object.prototype||Object.keys(v).some(k=>!keys.includes(k)))fail('Unbekannte Konfigurationsfelder. Schlüssel und Passwörter gehören nicht in diese Datei.');};
function url(value){let u;try{u=new URL(value);}catch{fail('Zeitstempel-URL fehlt.');}if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)fail('Öffentliche Zeitstempel-URL ohne Zugangsdaten erforderlich.');return u.href;}
export function validateSigningProfile(input){
 plain(input,['provider','certificateThumbprint','store','signToolPath','timestampUrl','dlibPath','metadataPath']);
 const p={...input};if(!['certificate-store','artifact-signing'].includes(p.provider))fail('certificate-store oder artifact-signing als Anbieter wählen.');p.timestampUrl=url(p.timestampUrl);
 for(const key of ['signToolPath','dlibPath','metadataPath'])if(p[key]!==undefined&&(typeof p[key]!=='string'||!p[key]||p[key].length>2000||/[\x00-\x1f]/.test(p[key])))fail('Ungültiger Werkzeugpfad.');
 if(p.provider==='certificate-store'){
  if(typeof p.certificateThumbprint!=='string')fail('Öffentlicher Zertifikat-Fingerabdruck fehlt.');p.certificateThumbprint=p.certificateThumbprint.replace(/\s/g,'').toUpperCase();if(!/^[A-F0-9]{40}$/.test(p.certificateThumbprint)||!['CurrentUser','LocalMachine'].includes(p.store))fail('Zertifikat-Fingerabdruck und Windows-Zertifikatspeicher angeben.');if(p.dlibPath!==undefined||p.metadataPath!==undefined)fail('Signierdienst-Metadaten gehören nicht zum Zertifikatspeichermodus.');
 }else if(p.certificateThumbprint!==undefined||p.store!==undefined||!p.dlibPath||!p.metadataPath)fail('Artifact Signing benötigt Dlib- und Metadatendatei.');
 return p;
}
export function validateArtifactMetadata(value){
 plain(value,['Endpoint','CodeSigningAccountName','CertificateProfileName','CorrelationId','ExcludeCredentials']);let endpoint;try{endpoint=new URL(value.Endpoint);}catch{fail('Artifact-Signing-Endpunkt fehlt.');}
 if(endpoint.protocol!=='https:'||!/^[-a-z0-9]+\.codesigning\.azure\.net$/.test(endpoint.hostname)||endpoint.username||endpoint.password||endpoint.search||endpoint.hash||!['','/'].includes(endpoint.pathname))fail('Regionalen Microsoft-Artifact-Signing-Endpunkt angeben.');
 for(const k of ['CodeSigningAccountName','CertificateProfileName'])if(typeof value[k]!=='string'||!/^[A-Za-z0-9][A-Za-z0-9-]{1,63}$/.test(value[k]))fail('Echte Konto- und Zertifikatprofilnamen eintragen.');
 if(value.ExcludeCredentials!==undefined&&(!Array.isArray(value.ExcludeCredentials)||value.ExcludeCredentials.length>32||value.ExcludeCredentials.some(v=>typeof v!=='string'||!/^[A-Za-z]{2,70}$/.test(v))))fail('Ungültige Liste der Authentifizierungsmethoden.');
 if(value.CorrelationId!==undefined&&(typeof value.CorrelationId!=='string'||value.CorrelationId.length>200||/[\x00-\x1f]/.test(value.CorrelationId)))fail('Ungültige Korrelationskennung.');return value;
}
export function signingArguments(profile,exe){
 const p=validateSigningProfile(profile),args=['sign','/q','/fd','SHA256','/tr',p.timestampUrl,'/td','SHA256','/d','Formnaro'];
 if(p.provider==='certificate-store'){if(p.store==='LocalMachine')args.push('/sm');args.push('/s','My','/sha1',p.certificateThumbprint);}
 else args.push('/dlib',path.resolve(p.dlibPath),'/dmdf',path.resolve(p.metadataPath));return [...args,exe];
}
function powershell(script,env={}){
 const childEnv={...process.env,...env};delete childEnv.PSModulePath;
 const result=spawnSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024,env:childEnv});
 if(result.status!==0)fail('Die lokale Windows-Prüfung konnte nicht abgeschlossen werden.');try{return JSON.parse(result.stdout.replace(/^\uFEFF/,''));}catch{fail('Ungültiges Ergebnis der Windows-Prüfung.');}
}
const inspectScript=String.raw`
$ErrorActionPreference='Stop';[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
function SignatureInfo($file){if(!$file -or !(Test-Path -LiteralPath $file -PathType Leaf)){return $null};$s=Get-AuthenticodeSignature -LiteralPath $file;return @{status=[string]$s.Status;subject=if($s.SignerCertificate){$s.SignerCertificate.Subject}else{$null};thumbprint=if($s.SignerCertificate){$s.SignerCertificate.Thumbprint}else{$null};timestampPresent=($null -ne $s.TimeStamperCertificate)}}
$tool=$env:FORMNARO_SIGN_INSPECT_TOOL
if(!$tool){$bins=Join-Path ([Environment]::GetEnvironmentVariable('ProgramFiles(x86)')) 'Windows Kits\10\bin';if(Test-Path -LiteralPath $bins){$tool=Get-ChildItem -LiteralPath $bins -Directory | Sort-Object {try{[version]$_.Name}catch{[version]'0.0'}} -Descending | ForEach-Object {Join-Path $_.FullName 'x64\signtool.exe'} | Where-Object {Test-Path -LiteralPath $_ -PathType Leaf} | Select-Object -First 1}}
function IsCodeSigning($c){foreach($e in $c.Extensions){if($e.Oid.Value -eq '2.5.29.37'){foreach($u in $e.EnhancedKeyUsages){if($u.Value -eq '1.3.6.1.5.5.7.3.3'){return $true}}}};return $false}
$certs=@();foreach($store in @('CurrentUser','LocalMachine')){foreach($c in @(Get-ChildItem -Path ('Cert:\'+$store+'\My') -ErrorAction SilentlyContinue)){if(IsCodeSigning $c){$certs+=@{store=$store;subject=$c.Subject;issuer=$c.Issuer;thumbprint=$c.Thumbprint;hasPrivateKey=$c.HasPrivateKey;notBefore=$c.NotBefore.ToUniversalTime().ToString('o');notAfter=$c.NotAfter.ToUniversalTime().ToString('o');selfSigned=($c.Subject -eq $c.Issuer)}}}}
$selected=$null;if($env:FORMNARO_SIGN_INSPECT_SHA){$storePath='Cert:\'+$env:FORMNARO_SIGN_INSPECT_STORE+'\My\'+$env:FORMNARO_SIGN_INSPECT_SHA;if(Test-Path -LiteralPath $storePath){$c=Get-Item -LiteralPath $storePath;$chain=New-Object System.Security.Cryptography.X509Certificates.X509Chain;try{$selected=@{codeSigning=(IsCodeSigning $c);hasPrivateKey=$c.HasPrivateKey;active=($c.NotBefore -le (Get-Date) -and $c.NotAfter -gt (Get-Date));selfSigned=($c.Subject -eq $c.Issuer);windowsChainValid=$chain.Build($c);subject=$c.Subject}}finally{$chain.Dispose()}}}
$az=Get-Command az -ErrorAction SilentlyContinue;$dotnet=Get-Command dotnet -ErrorAction SilentlyContinue;$dotnetPath=if($dotnet){$dotnet.Source}else{Join-Path $env:ProgramFiles 'dotnet\dotnet.exe'};$dotnet8=$false;if(Test-Path -LiteralPath $dotnetPath){$runtimes=(& $dotnetPath --list-runtimes | Out-String);$dotnet8=($runtimes -match '(?m)^Microsoft.NETCore.App 8\.')}
@{signToolPath=$tool;signToolSignature=(SignatureInfo $tool);signToolVersion=if($tool){(Get-Item -LiteralPath $tool).VersionInfo.FileVersion}else{$null};inputSignature=(SignatureInfo $env:FORMNARO_SIGN_INSPECT_EXE);certificates=$certs;selectedCertificate=$selected;dlibSignature=(SignatureInfo $env:FORMNARO_SIGN_INSPECT_DLIB);azureCliPresent=($null -ne $az);dotnet8Present=$dotnet8} | ConvertTo-Json -Depth 7 -Compress
`;
function readJson(file){const stat=fs.statSync(file);if(!stat.isFile()||stat.size>32768)fail('Konfigurationsdatei zu groß.');return JSON.parse(fs.readFileSync(file,'utf8'));}
export function inspectSigning(runtime,profileFile){
 if(process.platform!=='win32')fail('Authenticode-Prüfung benötigt Windows.');const root=fs.realpathSync(runtime),exe=path.join(root,'Formnaro.exe');if(!fs.statSync(root).isDirectory()||!fs.existsSync(exe)||!fs.existsSync(path.join(root,'resources/app.asar')))fail('Vollständigen Formnaro-Programmordner wählen.');
 const profile=profileFile?validateSigningProfile(readJson(profileFile)):null,environment={FORMNARO_SIGN_INSPECT_EXE:exe,FORMNARO_SIGN_INSPECT_TOOL:profile?.signToolPath?path.resolve(profile.signToolPath):'',FORMNARO_SIGN_INSPECT_SHA:profile?.certificateThumbprint??'',FORMNARO_SIGN_INSPECT_STORE:profile?.store??'',FORMNARO_SIGN_INSPECT_DLIB:profile?.dlibPath?path.resolve(profile.dlibPath):''};
 const inspection=powershell(inspectScript,environment),issues=[];if(!profile)issues.push('SIGNING_PROFILE_MISSING');if(!inspection.signToolPath||inspection.signToolSignature?.status!=='Valid'||!/Microsoft/i.test(inspection.signToolSignature.subject??''))issues.push('MICROSOFT_SIGNTOOL_REQUIRED');
 if(inspection.inputSignature?.status!=='NotSigned')issues.push('UNSIGNED_ORIGINAL_REQUIRED');inspectUnsignedPE(fs.readFileSync(exe));
 if(!profile&&!(inspection.certificates??[]).length)issues.push('CODE_SIGNING_IDENTITY_MISSING');
 if(profile?.provider==='certificate-store'){const c=inspection.selectedCertificate;if(!c?.codeSigning||!c.hasPrivateKey||!c.active||c.selfSigned||!c.windowsChainValid)issues.push('VALID_CODE_SIGNING_CERTIFICATE_REQUIRED');}
 if(profile?.provider==='artifact-signing'){
  if(!fs.existsSync(profile.metadataPath))issues.push('ARTIFACT_METADATA_REQUIRED');else validateArtifactMetadata(readJson(profile.metadataPath));
  if(inspection.dlibSignature?.status!=='Valid'||!/Microsoft/i.test(inspection.dlibSignature.subject??''))issues.push('MICROSOFT_ARTIFACT_DLIB_REQUIRED');
  const version=(inspection.signToolVersion??'').match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)/);if(!version||Number(version[3])<22621||Number(version[3])===22621&&Number(version[4])<755)issues.push('ARTIFACT_SIGNTOOL_22621_755_OR_NEWER_REQUIRED');
  if(!inspection.dotnet8Present)issues.push('DOTNET8_RUNTIME_REQUIRED');
 }
 return {version:1,ready:issues.length===0,signed:false,provider:profile?.provider??null,runtime:root,exe,issues,inspection,profile:profileFile?path.resolve(profileFile):null,scope:'Read-only preflight. No key export, certificate creation, trust-store changes or paid resources. Readiness does not prove Azure identity validation/sign-in or SmartScreen reputation.'};
}
function inventory(directory,prefix=''){
 return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{const file=path.join(directory,entry.name),relative=prefix+entry.name;if(entry.isSymbolicLink())fail('Programmordner mit symbolischen Verknüpfungen nicht signieren.');return entry.isDirectory()?inventory(file,relative+'/'):[{file:relative,sha256:sha(file)}];}).sort((a,b)=>a.file.localeCompare(b.file));
}
function canonicalDestination(file){let current=path.resolve(file);const rest=[];while(!fs.existsSync(current)){const parent=path.dirname(current);if(parent===current)fail('Ungültiger Zielpfad.');rest.unshift(path.basename(current));current=parent;}return path.join(fs.realpathSync(current),...rest);}
function within(directory,file){const relative=path.relative(directory,file);return !relative||!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);}
function runSignTool(tool,args){const result=spawnSync(tool,args,{encoding:'utf8',windowsHide:true,timeout:300000});if(result.error||result.status!==0)fail('SignTool konnte Signatur/Zeitstempel nicht bestätigen. Der Kandidat ist nicht freigegeben.');}
export function signWindowsRuntime(runtime,profileFile,{destination,inPlace=false,reportFile}={}){
 const preflight=inspectSigning(runtime,profileFile);if(!preflight.ready)fail('Voraussetzungen fehlen: '+preflight.issues.join(', '));const profile=validateSigningProfile(readJson(profileFile)),source=preflight.runtime;
 const parent=path.dirname(source),accepted=['Abnahme.json','Freigabe.json'].some(n=>fs.existsSync(path.join(parent,n))),protectedRoot=accepted?parent:source;
 if(inPlace){if(destination)fail('Für In-place-Signierung kein Kopierziel angeben.');const parent=path.dirname(source);if(['Abnahme.json','Freigabe.json'].some(n=>fs.existsSync(path.join(parent,n))))fail('Freigegebene Originalausgaben nur als getrennte signierte Kopie bearbeiten.');}
 else{if(!destination)fail('Neuen Zielordner für die signierte Kopie angeben.');destination=canonicalDestination(destination);if(fs.existsSync(destination)||within(protectedRoot,destination))fail('Signaturziel muss ein neuer, getrennter Programmordner sein.');}
 if(reportFile){const report=canonicalDestination(reportFile);if(within(protectedRoot,report)||!inPlace&&within(destination,report))fail('Prüfbericht außerhalb des Original- und Programmordners speichern.');}
 const original=inventory(source),originalExe=fs.readFileSync(path.join(source,'Formnaro.exe')),target=inPlace?source:destination;if(!inPlace)fs.cpSync(source,target,{recursive:true,errorOnExist:true,force:false});
 const exe=path.join(target,'Formnaro.exe');runSignTool(preflight.inspection.signToolPath,signingArguments(profile,exe));runSignTool(preflight.inspection.signToolPath,['verify','/pa','/all','/q',exe]);
 const signature=powershell(String.raw`[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false);$s=Get-AuthenticodeSignature -LiteralPath $env:FORMNARO_SIGN_INSPECT_EXE;@{status=[string]$s.Status;subject=if($s.SignerCertificate){$s.SignerCertificate.Subject}else{$null};thumbprint=if($s.SignerCertificate){$s.SignerCertificate.Thumbprint}else{$null};timestampPresent=($null -ne $s.TimeStamperCertificate)}|ConvertTo-Json -Compress`,{FORMNARO_SIGN_INSPECT_EXE:exe});
 if(signature.status!=='Valid'||!signature.timestampPresent)fail('Vertrauensprüfung oder Zeitstempel fehlt. Kandidat nicht freigeben.');const identity=assertSigningPreservesPE(originalExe,fs.readFileSync(exe)),signedFiles=inventory(target);
 if(original.length!==signedFiles.length)fail('Programmdateien wurden beim Signieren hinzugefügt oder entfernt.');for(let i=0;i<original.length;i++){if(original[i].file!==signedFiles[i].file||original[i].file!=='Formnaro.exe'&&original[i].sha256!==signedFiles[i].sha256)fail('Unbeteiligte Programmdatei wurde verändert.');if(!inPlace&&sha(path.join(source,original[i].file))!==original[i].sha256)fail('Originalausgabe wurde verändert.');}
 const report={ok:true,version:1,signed:true,runtime:target,signature,identity,originalExeSha256:createHash('sha256').update(originalExe).digest('hex'),exeSha256:sha(exe),asarSha256:sha(path.join(target,'resources/app.asar')),files:signedFiles,scope:'Only Formnaro.exe signed. Vendor signatures, ASAR and all other runtime bytes preserved. Successful Authenticode verification on this Windows host with RFC3161 timestamp; no SmartScreen-reputation guarantee. Application/release acceptance remains a separate required step.'};
 if(reportFile){fs.mkdirSync(path.dirname(path.resolve(reportFile)),{recursive:true});fs.writeFileSync(reportFile,JSON.stringify(report,null,2));}return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const [command,runtime,...flags]=process.argv.slice(2),options={};for(let i=0;i<flags.length;i+=2){if(!['--profile','--report','--destination'].includes(flags[i])||!flags[i+1])fail('Aufruf: preflight|sign-copy|sign-in-place PROGRAMMORDNER --profile DATEI --report DATEI [--destination NEUER_ORDNER]');options[flags[i].slice(2)]=flags[i+1];}if(!runtime)fail('Programmordner angeben.');
  const result=command==='preflight'?inspectSigning(runtime,options.profile):['sign-copy','sign-in-place'].includes(command)?signWindowsRuntime(runtime,options.profile,{destination:options.destination,inPlace:command==='sign-in-place',reportFile:options.report}):fail('Unbekannter Befehl.');
  if(command==='preflight'&&options.report){fs.mkdirSync(path.dirname(path.resolve(options.report)),{recursive:true});fs.writeFileSync(options.report,JSON.stringify(result,null,2));}console.log(JSON.stringify(command==='preflight'?result:{ok:result.ok,signed:result.signed,runtime:result.runtime,exeSha256:result.exeSha256,signature:result.signature},null,2));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
