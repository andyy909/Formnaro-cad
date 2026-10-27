import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
assert.equal(process.argv[3],'--visual-reviewed','Inspect actual packaged screenshots before final release');
const revision=process.argv[2]??'r1';assert.match(revision,/^r\d+$/);
const out=path.resolve('output/Foto-Perspektive-v0.107.0-'+revision),proof=path.resolve('work/photo-perspective/release-'+revision),a=JSON.parse(fs.readFileSync(out+'/Abnahme.json'));
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert(a.ok&&a.version==='0.107.0');assert(!fs.existsSync(out+'/Freigabe.json'),'Already finalized');
for(const row of a.runtimeFiles)assert.equal(hash(path.join(a.runtime,row.file)),row.sha256,'Runtime file changed: '+row.file);
const log=fs.readFileSync(proof+'/unit.log','utf8');assert.match(log,/# fail 0/);const unitTests=Number(log.match(/# pass (\d+)/)[1]);
let actualExeChecks=0;
for(const row of a.results){assert.equal(hash(row.report),row.sha256);const r=JSON.parse(fs.readFileSync(row.report));assert(r.ok&&r.isolatedProfile&&!r.errors.length&&!r.external.length);assert.equal(r.appVersion,a.version);assert.equal(r.exeSha256,a.exeSha256);assert.equal(r.asarSha256,a.asarSha256);actualExeChecks+=row.checks;}
for(const flag of ['photo','perspective','perspective-pipeline','program-assistant'])assert(a.results.some(r=>r.flag===flag));
assert(a.protectedFiles.length>=136);
const baseline=JSON.parse(fs.readFileSync(proof+'/expansion-baseline.json'));assert(baseline.ok);for(const row of baseline.manifest)assert.equal(hash(proof+'/expansion-fixtures/'+row.file),row.sha256);
const front=JSON.parse(fs.readFileSync(proof+'/packaged-photo/photo-proof.json')),tilted=JSON.parse(fs.readFileSync(proof+'/packaged-perspective-pipeline/photo-proof.json'));
assert.equal(front.calls,8);assert.equal(tilted.calls,8);assert.equal(front.visualReviews,2);assert.equal(tilted.visualReviews,2);assert.equal(front.cloudRequests+tilted.cloudRequests,0);
const images=[];fs.mkdirSync(out+'/Vorschau');
for(const [from,to]of [
 ['packaged-perspective/perspective-plane-light.png','Entzerrte-Ebene.png'],
 ['packaged-perspective/perspective-plane-small-dark.png','Entzerrung-klein-dunkel.png'],
 ['packaged-perspective/project-photos-light.png','Projektfotos.png'],
 ['packaged-perspective-pipeline/photo-editor-responses.png','Schraeges-Original.png'],
 ['packaged-perspective-pipeline/photo-editor-small.png','Original-klein-dunkel.png'],
 ['packaged-perspective-pipeline/photo-overlay-responses.png','Entzerrter-CAD-Vergleich.png'],
 ['packaged-perspective-pipeline/photo-result-responses.png','Gepruefte-CAD-Vorschau.png']
]){const source=path.join(proof,from),target=out+'/Vorschau/'+to;fs.copyFileSync(source,target);assert.equal(hash(source),hash(target));images.push({file:target,sha256:hash(target)});}
const scope='Persistent original photo bytes, SHA binding, provenance, marks and measured dimensions in project19, .ocad/.fnpack/recovery, exact one-Undo metadata edits and direct import in all four modes. Four independently projected rectangle corners, known width/height, original-pixel-linked planar homography, bounded bilinear rectification, explicitly confirmed editable convex Sobel proposals. Frontal and tilted measurement/correction/visual-review pipelines with both simulated provider protocols; native CAD dimensions and opening volume, preview/apply/exact Undo. Native OCCT/STEP fixture quality and local timing/process-memory samples. No general multi-view reconstruction, lens/depth correction or arbitrary AI accuracy/fit proof.';
// Correct the inherited generic packager description; all measured receipts stay intact.
a.scope=scope;fs.writeFileSync(out+'/Abnahme.json',JSON.stringify(a,null,2));
const report={ok:true,version:a.version,runtime:a.runtime,exeSha256:a.exeSha256,asarSha256:a.asarSha256,unitTests,actualExeChecks,perspectiveChecks:a.results.find(r=>r.flag==='perspective').checks,frontPhotoChecks:front.checks.length,tiltedPhotoChecks:tilted.checks.length,syntheticPhotoCalls:front.calls+tilted.calls,liveCloudRequests:0,protectedPreviousFiles:a.protectedFiles.length,images,baseline:{manifest:baseline.manifest,quality:baseline.quality,measurements:baseline.measurements,memory:baseline.memory},scope};
fs.writeFileSync(out+'/Freigabe.json',JSON.stringify(report,null,2));
fs.writeFileSync(out+'/Starten.txt','Formnaro 0.107.0 – Projektfotos und Perspektiventzerrung\r\n\r\nFormnaro-win32-x64/Formnaro.exe starten. Projektfotos > Foto hinzufügen funktioniert in allen Bedienmodi. Im KI-Chat alternativ Bild anhängen > Foto vermessen > Im Projekt speichern.\r\n\r\nFür schräge Fotos ein echtes bekanntes Rechteck in der Ebene markieren: oben links, oben rechts, unten rechts, unten links. Breite UND Höhe angeben. Entzerrung ansehen zeigt die verknüpfte Ebene. Kantenvorschläge korrigieren und ausdrücklich bestätigen.\r\n\r\nNur innerhalb der kalibrierten Ebene. Objektivverzeichnung, Tiefe, verdeckte Geometrie und Passung separat prüfen. Noch keine allgemeine Mehrbildrekonstruktion. Projektfotos verwenden Format 19; ältere Programmversionen können diese neuen Projekte nicht öffnen. Alte Projekte bleiben im neuen Programm lesbar.\r\n\r\nAnleitung docs/FOTO-ASSISTENT.md. Eigene Datenordner beim Umzug mitnehmen; persönliche Modelle, Profile und Zugangsdaten sind nicht enthalten.\r\n');
fs.writeFileSync(proof+'/release-proof.json',JSON.stringify({...report,acceptanceSha256:hash(out+'/Abnahme.json'),releaseSha256:hash(out+'/Freigabe.json')},null,2));
console.log(JSON.stringify({ok:true,version:a.version,runtime:a.runtime,unitTests,actualExeChecks,perspectiveChecks:report.perspectiveChecks,protectedPreviousFiles:report.protectedPreviousFiles}));
