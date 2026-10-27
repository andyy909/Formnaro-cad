import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {inspectUnsignedPE} from './windows-signing-integrity.mjs';

const [revision='r1',review,...extra]=process.argv.slice(2);
assert.match(revision,/^r\d+$/);
assert(review==='--visual-reviewed'&&!extra.length,'Inspect the actual packaged screenshots before technical acceptance');
const out=path.resolve('output/FreeCAD-Parameter-Testkandidat-v0.110.0-'+revision),proof=path.resolve('work/freecad-document/candidate-'+revision);
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const a=JSON.parse(fs.readFileSync(out+'/Abnahme.json'));
assert(a.ok&&a.candidateOnly===true&&a.releaseReady===false&&a.version==='0.110.0'&&a.signature===null);
assert(inspectUnsignedPE(fs.readFileSync(a.runtime+'/Formnaro.exe')).unsigned);
assert(!fs.existsSync(out+'/Freigabe.json')&&!fs.existsSync(out+'/Testabnahme.json'));
for(const base of [out,a.runtime])assert.match(fs.readFileSync(base+'/NICHT-FREIGEGEBEN.txt','utf8'),/unsignierter Testkandidat/);
for(const row of a.runtimeFiles)assert.equal(hash(path.join(a.runtime,row.file)),row.sha256,'Runtime changed: '+row.file);
// The packager checks previous outputs before and after every EXE suite. Their
// receipt is retained here; visual inspection only reads this candidate.
assert(a.protectedFiles.length>=142);
const log=fs.readFileSync(proof+'/unit.log','utf8');assert.match(log,/# fail 0/);
const unitTests=Number(log.match(/# pass (\d+)/)[1]);assert(unitTests>=318);
const flags=['fusion','solid','context-menu','workbench','sketch-upgrade','ai-result-checks','speech','task-evidence','ai-meter','program-assistant','photo','perspective','perspective-pipeline','multiview','multiview-oblique','feature-references','freecad-document'];
assert.equal(a.results.length,flags.length);
let actualExeChecks=0;
for(const flag of flags){
  const row=a.results.find(r=>r.flag===flag&&r.mode==='packaged');assert(row,'Missing suite: '+flag);assert.equal(hash(row.report),row.sha256);
  const r=JSON.parse(fs.readFileSync(row.report));assert(r.ok&&r.isolatedProfile&&!r.errors.length&&!r.external.length);
  assert.equal(r.appVersion,a.version);assert.equal(r.exeSha256,a.exeSha256);assert.equal(r.asarSha256,a.asarSha256);assert.equal(r.checks.length,row.checks);actualExeChecks+=row.checks;
}
const f=JSON.parse(fs.readFileSync(proof+'/packaged-feature-references/feature-proof.json'));
assert(f.ok&&f.checks.length>=46&&f.cloudRequests===0&&Array.isArray(f.calls)&&f.calls.length===16&&f.visualReviews===4);
const baseline=JSON.parse(fs.readFileSync(proof+'/expansion-baseline.json'));assert(baseline.ok);
for(const row of baseline.manifest)assert.equal(hash(proof+'/expansion-fixtures/'+row.file),row.sha256);
const documentProof=JSON.parse(fs.readFileSync(proof+'/packaged-freecad-document/document-proof.json')),exportProof=JSON.parse(fs.readFileSync(proof+'/packaged-freecad-document/export-proof.json'));
assert(documentProof.ok&&documentProof.cloudRequests===0&&documentProof.checks.length>=70);assert(exportProof.ok&&exportProof.cloudRequests===0&&Math.abs(exportProof.nativeVolume-480)<1e-7&&exportProof.exports.length===2);
for(const row of exportProof.exports){assert(['step','stl'].includes(row.format));assert(Math.abs(row.measurements.volume-504)<.0001);assert.equal(hash(proof+'/packaged-freecad-document/exports/'+row.file),row.sha256);}
const images=[];fs.mkdirSync(out+'/Vorschau');
for(const name of ['feature-manager','feature-bore-selected','feature-chat-highlight','feature-preview-responses','feature-preview-chat','feature-reassigned','feature-reference-kinds','feature-shared-parameter-preview','feature-spatial-reference-preview','feature-small-dark']){
  const source=proof+'/packaged-feature-references/'+name+'.png',target=out+'/Vorschau/'+name+'.png';
  fs.copyFileSync(source,target);assert.equal(hash(source),hash(target));images.push({file:target,sha256:hash(target)});
}
for(const name of ['freecad-feature-tree-light','freecad-feature-tree-small-dark','freecad-property-edit-3d','freecad-program-rerun-3d','freecad-project-parameter-3d','freecad-external-import-compact','freecad-native-followup-compact','freecad-bound-rerun-compact','freecad-feature-chat-preview','freecad-pad-reopened']){
 const source=proof+'/packaged-freecad-document/'+name+'.png',target=out+'/Vorschau/'+name+'.png';fs.copyFileSync(source,target);assert.equal(hash(source),hash(target));images.push({file:target,sha256:hash(target)});
}
const report={ok:true,candidateOnly:true,releaseReady:false,signed:false,version:a.version,runtime:a.runtime,exeSha256:a.exeSha256,asarSha256:a.asarSha256,unitTests,actualExeChecks,featureChecks:f.checks.length,freeCADDocumentChecks:documentProof.checks.length,exportChecks:exportProof.checks.length,syntheticFeatureCalls:f.calls.length,liveFeatureCloudRequests:f.cloudRequests,protectedPreviousFiles:a.protectedFiles.length,images,scope:a.scope,acceptanceSha256:hash(out+'/Abnahme.json')};
fs.writeFileSync(out+'/Testabnahme.json',JSON.stringify(report,null,2));
fs.writeFileSync(proof+'/candidate-proof.json',JSON.stringify({...report,testAcceptanceSha256:hash(out+'/Testabnahme.json')},null,2));
console.log(JSON.stringify({ok:true,candidateOnly:true,releaseReady:false,unitTests,actualExeChecks,featureChecks:f.checks.length,protectedPreviousFiles:a.protectedFiles.length}));
