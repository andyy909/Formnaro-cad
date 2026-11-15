import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {integrationManifest} from './stl-integration-manifest.mjs';

const root=process.cwd(),out=path.resolve(process.argv[2]),version=JSON.parse(fs.readFileSync('package.json')).version,hash=b=>createHash('sha256').update(b).digest('hex');
function entries(dir,prefix=''){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{if(e.name==='__pycache__'||/\.py[co]$/i.test(e.name))return [];if(e.isSymbolicLink())throw Error('Symlinks excluded');return e.isDirectory()?entries(path.join(dir,e.name),prefix+e.name+'/'):[[prefix+e.name,path.join(dir,e.name)]];});}
function archive(name,files){
 const program=`import sys,json,pathlib,zipfile,hashlib
request=json.load(sys.stdin);manifest=[]
with zipfile.ZipFile(request['file'],'x',allowZip64=True) as archive:
 for name,source in sorted(request['files']):
  if name.startswith('/') or '..' in name or chr(92) in name or any(p in ['work','Daten','__pycache__','ai-bridge.json','ai-settings.json'] or p.startswith('.env') for p in name.split('/')):raise ValueError('Unsafe source name '+name)
  data=pathlib.Path(source).read_bytes();entry=zipfile.ZipInfo(name,(2026,10,18,0,0,0));entry.external_attr=0o100644<<16
  compression=zipfile.ZIP_STORED if name.lower().endswith(('.gz','.zip','.wasm','.png','.jpg')) else zipfile.ZIP_DEFLATED
  archive.writestr(entry,data,compress_type=compression,compresslevel=6);manifest.append(dict(name=name,bytes=len(data),sha256=hashlib.sha256(data).hexdigest()))
with zipfile.ZipFile(request['file']) as archive:
 if archive.testzip() is not None:raise ValueError('Archive CRC failure')
 if len(archive.namelist())!=len(manifest):raise ValueError('Archive count mismatch')
 for entry in manifest:
  if hashlib.sha256(archive.read(entry['name'])).hexdigest()!=entry['sha256']:raise ValueError('Archive content mismatch '+entry['name'])
print(json.dumps(manifest))`;
 const file=path.join(out,name),result=spawnSync('python',['-c',program],{input:JSON.stringify({file,files}),encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});
 if(result.status!==0)throw Error('Source archive failed: '+result.stderr);
 const manifest=JSON.parse(result.stdout),bytes=fs.readFileSync(file);return {file,bytes:bytes.length,sha256:hash(bytes),entries:manifest};
}
const lock=JSON.parse(fs.readFileSync('cad-kernel-build/upstream-lock.json')),native=[];
for(const s of lock.sources){const old=path.join(root,'work/v010/upstream/source-archives',s.file),file=fs.existsSync(old)?old:path.join(root,'work/cad-v011-build/archives',s.file),bytes=fs.readFileSync(file);if(bytes.length!==s.bytes||hash(bytes)!==s.sha256)throw Error('Wrong upstream source '+s.file);native.push(['upstream/'+s.file,file]);}
native.push(...entries('cad-kernel-build').filter(([n])=>!n.startsWith('runtime/')).map(([n,p])=>['cad-kernel-build/'+n,p]));
native.push(['generated/formnaro_cad.yml','work/cad-v011-build/config/formnaro_cad.yml'],['generated/build-inputs.json','work/cad-v011-build/config/build-inputs.json'],['LIES-MICH-QUELLEN.txt','licenses/CAD-Quellen-und-Build.txt']);
const pin=JSON.parse(fs.readFileSync('cad-kernel-build/runtime/build-inputs.json'));
if(hash(fs.readFileSync('cad-kernel-build/wrappers/formnaro-cad-bridge.cpp'))!==pin.bridgeSha256||hash(fs.readFileSync('work/cad-v011-build/config/formnaro_cad.yml'))!==pin.generatedYamlSha256)throw Error('Runtime input/source mismatch');
const results=[archive('Formnaro-CAD-Quellen-v'+version+'.zip',native),archive('Formnaro-Quellcode-v'+version+'.zip',integrationManifest().map(e=>[e.file,e.file]))];
fs.writeFileSync(path.join(out,'Quellen-Pruefsummen.json'),JSON.stringify({version,results},null,2));console.log(JSON.stringify(results.map(({entries,...r})=>({...r,files:entries.length}))));
