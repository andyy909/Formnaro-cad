// Generate a consumer configuration from the exact original replicad source.
// No ytt installation is needed: the committed upstream generated YAML is used.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),build=path.join(root,'work','cad-v011-build'),lock=JSON.parse(fs.readFileSync(path.join(root,'cad-kernel-build','upstream-lock.json'),'utf8'));
fs.mkdirSync(path.join(build,'archives'),{recursive:true});fs.mkdirSync(path.join(build,'sources'),{recursive:true});
const systemLicenses=JSON.parse(fs.readFileSync(path.join(root,'cad-kernel-build/system-license-lock.json'),'utf8'));
if(systemLicenses.emscriptenCommit!==lock.emsdk.emscriptenCommit)throw Error('System-library license revision differs from the pinned compiler.');
for(const source of systemLicenses.files){
  const destination=path.join(root,'cad-kernel-build/licenses',source.file);
  if(!fs.existsSync(destination)){const response=await fetch(source.url);if(!response.ok)throw Error(`System license download failed: ${source.file}`);fs.writeFileSync(destination,Buffer.from(await response.arrayBuffer()));}
  const bytes=fs.readFileSync(destination);if(bytes.length!==source.bytes||createHash('sha256').update(bytes).digest('hex')!==source.sha256)throw Error(`System-library license checksum failed: ${source.file}`);
}
for(const source of lock.sources){
  let archive=path.join(root,'work','v010','upstream','source-archives',source.file);
  if(!fs.existsSync(archive)){
    archive=path.join(build,'archives',source.file);
    if(!fs.existsSync(archive)){const response=await fetch(source.url);if(!response.ok)throw Error(`Source download failed: ${source.name}, ${response.status}`);fs.writeFileSync(archive,Buffer.from(await response.arrayBuffer()));}
  }
  const bytes=fs.readFileSync(archive);if(createHash('sha256').update(bytes).digest('hex')!==source.sha256)throw Error(`Source archive checksum failed: ${source.name}`);
  const destination=path.join(build,'sources',source.directory);
  if(!fs.existsSync(destination)){
    const listing=spawnSync('tar',['-tf',archive],{encoding:'utf8'});if(listing.status!==0)throw Error(listing.stderr);
    if(listing.stdout.split(/\r?\n/).filter(Boolean).some(entry=>!entry.startsWith(source.directory+'/')||entry.split('/').includes('..')||entry.includes('\\')))throw Error('Unsafe archive paths.');
    const extraction=spawnSync('tar',['-xf',archive,'-C',path.join(build,'sources')],{encoding:'utf8'});if(extraction.status!==0)throw Error(extraction.stderr);
  }
}
const replicad=path.join(build,'sources',lock.sources.find(source=>source.name==='replicad').directory,'packages','replicad-opencascadejs','build-config'),destination=path.join(build,'config');
fs.mkdirSync(path.join(destination,'wrappers'),{recursive:true});
for(const entry of fs.readdirSync(path.join(replicad,'wrappers')))fs.copyFileSync(path.join(replicad,'wrappers',entry),path.join(destination,'wrappers',entry));
fs.copyFileSync(path.join(root,'cad-kernel-build','wrappers','formnaro-cad-bridge.cpp'),path.join(destination,'wrappers','formnaro-cad-bridge.cpp'));
let yaml=fs.readFileSync(path.join(replicad,'custom_build_single.yml'),'utf8');
yaml=yaml.replace('name: replicad_single.js','name: formnaro_cad.js').replace('  emccFlags:','  - symbol: FormnaroCadBridge\n  - symbol: BRepBuilderAPI_GTransform\n  - symbol: IntCurvesFace_ShapeIntersector\n  - symbol: BRepLProp_SLProps\n  - symbol: TopTools_FormatVersion\n  emccFlags:');
yaml+='\n- wrappers/formnaro-cad-bridge.cpp\n';
fs.writeFileSync(path.join(destination,'formnaro_cad.yml'),yaml);
const provenance={schema:'Formnaro-CAD-kernel-build-v1',sources:lock.sources,emsdk:lock.emsdk,dockerImage:lock.dockerImage,linuxLauncher:lock.linuxLauncher,upstreamYamlSha256:createHash('sha256').update(fs.readFileSync(path.join(replicad,'custom_build_single.yml'))).digest('hex'),bridgeSha256:createHash('sha256').update(fs.readFileSync(path.join(destination,'wrappers','formnaro-cad-bridge.cpp'))).digest('hex'),generatedYamlSha256:createHash('sha256').update(yaml).digest('hex')};
fs.writeFileSync(path.join(destination,'build-inputs.json'),JSON.stringify(provenance,null,2)+'\n');
console.log(JSON.stringify({config:path.join(destination,'formnaro_cad.yml'),provenance:path.join(destination,'build-inputs.json')},null,2));
