// Preserve complete original notices from the actual native release inputs.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const json=file=>JSON.parse(read(file));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const runtime=json('cad-kernel-build/runtime/integrity.json');
const nativeLicenses=Object.keys(runtime.files).filter(file=>file.startsWith('licenses/')).sort();
const versions={three:json('node_modules/three/package.json').version,fflate:json('node_modules/fflate/package.json').version,electron:json('node_modules/electron/package.json').version};
const fonts=['src/font.json','src/fonts/helvetiker_bold.typeface.json','src/fonts/optimer_regular.typeface.json'].map(file=>({file,...json(file).original_font_information}));
assert.ok(fonts.every(font=>font.license_description&&font.copyright),'Font metadata must include original notices.');
assert.ok(fonts.every(font=>font.license_description===fonts[0].license_description),'Distinct font terms must be retained separately.');
const parts=[`Formnaro 0.11 — Drittanbieterhinweise für die native CAD-Ausgabe
Stand: 11.10.2026

Produktives Inventar:
  Three.js ${versions.three}: Darstellung, Maussteuerung und Dateiformat-Lader; MIT.
  fflate ${versions.fflate}: lokale ZIP-/3MF-/OBJ-Archive; MIT.
  Helvetiker Regular/Bold und Optimer Regular: originale Magenta-Fontdaten.
  Gemeinsamer nativer Replicad/OpenCascade.js/OCCT-8.0.1-Kern mit Formnaro-Bridge.
  Electron ${versions.electron}/Chromium: eigenständige Desktoplaufzeit.

Der CAD-Kern ist eine gesonderte neu gebaute JS/WASM-Kombination aus den in
licenses/CAD-Quellen-und-Build.txt beschriebenen entsprechenden Quellen.
Die OCCT-Ausnahme gilt für OCCT; die Bedingungen der anderen Teile bleiben
erhalten. Die ergänzte Bridge steht unter MIT, der kombinierte Kern wird dadurch
nicht insgesamt MIT-lizenziert. Alle ${nativeLicenses.length} nativen Lizenz-/Autoren-Dateien
folgen vollständig unten und liegen einzeln unter licenses/cad-kernel/licenses/
in der Portable-Ausgabe. Das Integritätsmanifest umfasst insgesamt
${Object.keys(runtime.files).length} Runtimeartefakte einschließlich dieser Texte und der Buildprovenienz.

Die ursprünglichen Fontdaten enthalten unveränderte Linien/Bézierkonturen;
CAD-Topologie und Darstellung werden von Formnaro daraus separat erzeugt.
Buildwerkzeuge und Prüfleser sind keine zusätzlich ausgelieferte Modellierlaufzeit.
Die Electron-Ausgabe enthält daneben LICENSE und LICENSES.chromium.html;
diese vollständigen Desktoplaufzeit-Hinweise gehören zur Portable-Ausgabe.

Entsprechende Quellen, exakte Revisionen, Neubuild und vollständiger Ersatz:
  licenses/CAD-Quellen-und-Build.txt
  Formnaro-CAD-Quellen-v0.11.zip und Formnaro-Quellcode-v0.11.zip
  Quellen-Pruefsummen.json

Die folgenden Texte stammen aus den tatsächlichen, lokal geprüften Originalen.
`];
function add(label,text){parts.push(`\n\n========== ${label} ==========\n\n${text}`);}
add(`Three.js ${versions.three} — node_modules/three/LICENSE`,read('node_modules/three/LICENSE'));
add(`fflate ${versions.fflate} — node_modules/fflate/LICENSE`,read('node_modules/fflate/LICENSE'));
add('Helvetiker Regular/Bold und Optimer Regular — Originale Fontmetadaten',fonts.map(font=>`${font.file}\n${font.copyright}\n${font.full_font_name}; ${font.version_string}`).join('\n\n')+'\n\n'+fonts[0].license_description);
add(`Electron ${versions.electron} — node_modules/electron/LICENSE`,read('node_modules/electron/LICENSE'));
for(const file of nativeLicenses){
  const bytes=fs.readFileSync(path.join(root,'cad-kernel-build/runtime',file)),expected=runtime.files[file];
  assert.equal(bytes.length,expected.bytes,`Native notice size: ${file}`);
  assert.equal(sha(bytes),expected.sha256,`Native notice SHA256: ${file}`);
  add(`Gemeinsamer CAD-Kern — ${file}`,bytes.toString('utf8'));
}
const result=parts.join('')+'\n';
assert.ok(!result.includes('Manifold'),'Legacy modeling dependency must not appear in native notices.');
for(const file of nativeLicenses)assert.ok(result.includes(read('cad-kernel-build/runtime/'+file)),`Complete original missing: ${file}`);
fs.writeFileSync(path.join(root,'THIRD-PARTY-LICENSES.txt'),result);
console.log(JSON.stringify({file:'THIRD-PARTY-LICENSES.txt',bytes:Buffer.byteLength(result),nativeLicenseFiles:nativeLicenses.length,runtimeArtifacts:Object.keys(runtime.files).length,versions,fonts:fonts.map(font=>font.file)}));
