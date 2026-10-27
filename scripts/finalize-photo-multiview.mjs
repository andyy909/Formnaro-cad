import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
assert.equal(process.argv[3],'--visual-reviewed','Inspect actual packaged screenshots before final release');
const revision=process.argv[2]??'r1';assert.match(revision,/^r\d+$/);
const out=path.resolve('output/Technische-Ansichten-v0.108.0-'+revision),proof=path.resolve('work/photo-multiview/release-'+revision),a=JSON.parse(fs.readFileSync(out+'/Abnahme.json'));
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert(a.ok&&a.version==='0.108.0');assert(!fs.existsSync(out+'/Freigabe.json'),'Already finalized');
for(const row of a.runtimeFiles)assert.equal(hash(path.join(a.runtime,row.file)),row.sha256,'Runtime file changed: '+row.file);
const log=fs.readFileSync(proof+'/unit.log','utf8');assert.match(log,/# fail 0/);const unitTests=Number(log.match(/# pass (\d+)/)[1]);
let actualExeChecks=0;
for(const row of a.results){assert.equal(hash(row.report),row.sha256);const r=JSON.parse(fs.readFileSync(row.report));assert(r.ok&&r.isolatedProfile&&!r.errors.length&&!r.external.length);assert.equal(r.appVersion,a.version);assert.equal(r.exeSha256,a.exeSha256);assert.equal(r.asarSha256,a.asarSha256);actualExeChecks+=row.checks;}
for(const flag of ['photo','perspective','perspective-pipeline','program-assistant','multiview','multiview-oblique'])assert(a.results.some(r=>r.flag===flag));
assert(a.protectedFiles.length>=138);
const baseline=JSON.parse(fs.readFileSync(proof+'/expansion-baseline.json'));assert(baseline.ok);for(const row of baseline.manifest)assert.equal(hash(proof+'/expansion-fixtures/'+row.file),row.sha256);
const front=JSON.parse(fs.readFileSync(proof+'/packaged-photo/photo-proof.json')),tilted=JSON.parse(fs.readFileSync(proof+'/packaged-perspective-pipeline/photo-proof.json'));
assert.equal(front.calls,8);assert.equal(tilted.calls,8);assert.equal(front.visualReviews,2);assert.equal(tilted.visualReviews,2);assert.equal(front.cloudRequests+tilted.cloudRequests,0);
const multi=JSON.parse(fs.readFileSync(proof+'/packaged-multiview/multiview-proof.json')),oblique=JSON.parse(fs.readFileSync(proof+'/packaged-multiview-oblique/multiview-proof.json'));
assert(multi.checks.length>=37&&oblique.checks.length>=37&&!multi.oblique&&oblique.oblique);assert.equal(multi.cloudRequests+oblique.cloudRequests,0);
const images=[];fs.mkdirSync(out+'/Vorschau');
for(const [from,to]of [
 ['packaged-multiview/multiview-registered-views.png','Drei-Originalansichten.png'],
 ['packaged-multiview-oblique/multiview-registered-views.png','Schraeges-Original.png'],
 ['packaged-multiview-oblique/multiview-common-dimensions.png','Gemeinsame-Funktionsmasse.png'],
 ['packaged-multiview-oblique/multiview-native-preview.png','Native-CAD-Vorschau.png'],
 ['packaged-multiview-oblique/multiview-check-report.png','Getrennte-Ansichtspruefungen.png'],
 ['packaged-multiview-oblique/multiview-front-overlay.png','Entzerrter-Vergleich.png'],
 ['packaged-multiview-oblique/multiview-small-dark.png','Kleines-dunkles-Fenster.png'],
 ['packaged-multiview-oblique/multiview-shifted-mismatch.png','Verschobene-Variante-abgelehnt.png']
]){const source=path.join(proof,from),target=out+'/Vorschau/'+to;fs.copyFileSync(source,target);assert.equal(hash(source),hash(target));images.push({file:target,sha256:hash(target)});}
const scope='Three explicitly registered front/right/top original photo references with shared XYZ dimensions and native tolerances, changed/missing/contradictory references diagnosed, explicit through-opening and invisible-geometry assumptions. Editable native intersection of three profile sketches with three shared project parameters and nine bindings. Each view compared independently at the shared origin without recentering; native finished dimensions, one solid, optional clearance and true cylindrical bore checks gate Apply using private controller proof. Independent known stepped fixture, positive 4mm corridor, negative 6mm corridor and false cylindrical bore despite matching silhouettes; native STEP and global XYZ parameter edits. Actual .ocad/.fnpack, all four modes, JSON report without image bytes, cancellation, one Undo/Redo and unchanged locked source checked. Original project photos remain format19; view sets and typed CAD provenance use format20. Silhouettes do not establish unknown interior geometry or physical manufacturing fit.';
// Correct the inherited generic packager description; all measured receipts stay intact.
a.scope=scope;fs.writeFileSync(out+'/Abnahme.json',JSON.stringify(a,null,2));
const report={ok:true,version:a.version,runtime:a.runtime,exeSha256:a.exeSha256,asarSha256:a.asarSha256,unitTests,actualExeChecks,perspectiveChecks:a.results.find(r=>r.flag==='perspective').checks,frontPhotoChecks:front.checks.length,tiltedPhotoChecks:tilted.checks.length,syntheticPhotoCalls:front.calls+tilted.calls,multiViewChecks:multi.checks.length,obliqueMultiViewChecks:oblique.checks.length,liveCloudRequests:0,protectedPreviousFiles:a.protectedFiles.length,images,baseline:{manifest:baseline.manifest,quality:baseline.quality,measurements:baseline.measurements,memory:baseline.memory},scope};
fs.writeFileSync(out+'/Freigabe.json',JSON.stringify(report,null,2));
fs.writeFileSync(out+'/Starten.txt','Formnaro 0.108.0 – Technische Fotoansichten\r\n\r\nFormnaro-win32-x64/Formnaro.exe starten. Projektfotos > Technische Ansichten verbinden. Drei kalibrierte Originale mit bestätigten Konturen als Vorder-, rechte Seiten- und Draufsicht zuordnen. Gemeinsame Nullpunkte, XYZ-Maße und Herkunft bestätigen. Verdeckte Geometrie und Durchgangsöffnungen ausdrücklich erklären.\r\n\r\nOptionale native Freiraum-/Bohrungsprüfungen verwenden gemeinsame XYZ-mm. Neue CAD-Variante berechnen prüft jede Ansicht getrennt und Funktionsmaße nativ. Übernehmen erstellt eine neue editierbare Profil-Schnittmenge mit gemeinsamen Projektparametern und einem Undo. 3D-Vorschau ansehen öffnet die kompakte Kamerasteuerung.\r\n\r\nSilhouetten bestimmen keine unsichtbaren Innenräume oder Fertigungspassung. Perspektive gilt nur innerhalb der kalibrierten Ebene. Ansichtssätze und CAD-Herkunft benötigen Projektformat 20; reine Fotos bleiben 19. Ältere Programme können neue Formate nicht öffnen. Anleitung docs/FOTO-ASSISTENT.md. Eigene Datenordner beim Umzug mitnehmen. Keine persönlichen Modelle oder Zugangsdaten enthalten.\r\n');
fs.writeFileSync(proof+'/release-proof.json',JSON.stringify({...report,acceptanceSha256:hash(out+'/Abnahme.json'),releaseSha256:hash(out+'/Freigabe.json')},null,2));
console.log(JSON.stringify({ok:true,version:a.version,runtime:a.runtime,unitTests,actualExeChecks,perspectiveChecks:report.perspectiveChecks,protectedPreviousFiles:report.protectedPreviousFiles}));
