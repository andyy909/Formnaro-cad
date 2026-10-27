"""Archive a frozen, accepted CAD milestone and verify all CRCs/file hashes."""
import hashlib
import json
import sys
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
number = 8
assert 1 <= number <= 8
work = root / 'work/ai-contract/release'
proof = json.loads((work / 'final-audit.json').read_text(encoding='utf-8'))
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
runtime = Path(proof['runtime'])
source = runtime.parent / f'Formnaro-CAD-Quellcode-v{version}.zip'
kernel = root / 'release-formnaro-stl-konverter-v0.12.1/Formnaro-CAD-Quellen-v0.12.zip'
output = root / f'output/Formnaro-KI-Regeln-v{version}-Portable.zip'

def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def safe(name):
    assert not name.startswith('/') and '\\' not in name
    parts = name.split('/')
    forbidden = {'..', 'daten', 'layouts', 'projekte', 'work', 'node_modules', '.git', '__pycache__', 'ai-bridge.json', 'ai-settings.json'}
    assert not any(p.lower() in forbidden or p.lower().startswith('.env') for p in parts), name

assert proof['ok'] and proof['version'] == version and proof['number'] == number
assert proof['nativeChecks'] >= 25 and proof['overviewChecks'] >= 15
if number >= 2: assert proof['placementChecks'] >= 14
if number >= 3: assert proof['referenceChecks'] >= 12
if number >= 4: assert proof['sketchChecks'] >= 14
if number >= 5: assert proof['partitionChecks'] >= 16
if number >= 6: assert proof['extractionChecks'] >= 16
if number >= 7: assert proof['annotationChecks'] >= 16
if number >= 8: assert proof['performanceChecks'] >= 12
for key, file in [('exeSha256', 'Formnaro.exe'), ('asarSha256', 'resources/app.asar'), ('converterSha256', 'resources/converter/Formnaro-Konverter.exe')]:
    assert sha(runtime / file) == proof[key]
for entry in proof['manifest']:
    safe(entry['file'])
    assert sha(root / entry['file']) == entry['sha256'], entry['file']

with zipfile.ZipFile(kernel) as z:
    assert z.testzip() is None
    for file in ['cad-kernel-build/upstream-lock.json', 'cad-kernel-build/wrappers/formnaro-cad-bridge.cpp']:
        assert z.read(file) == (root / file).read_bytes()
    assert z.read('generated/build-inputs.json') == (root / 'cad-kernel-build/runtime/build-inputs.json').read_bytes()
    assert z.read('generated/formnaro_cad.yml') == (root / 'work/cad-v011-build/config/formnaro_cad.yml').read_bytes()
    for entry in json.loads((root / 'cad-kernel-build/upstream-lock.json').read_text(encoding='utf-8'))['sources']:
        data = z.read('upstream/' + entry['file'])
        assert len(data) == entry['bytes'] and hashlib.sha256(data).hexdigest() == entry['sha256']

with zipfile.ZipFile(source, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=1) as z:
    for entry in proof['manifest']:
        z.write(root / entry['file'], entry['file'])
with zipfile.ZipFile(source) as z:
    assert z.testzip() is None
    for entry in proof['manifest']:
        assert hashlib.sha256(z.read(entry['file'])).hexdigest() == entry['sha256']

entries = []
for file in sorted(runtime.rglob('*')):
    assert not file.is_symlink()
    if file.is_file():
        name = 'App/' + file.relative_to(runtime).as_posix()
        safe(name)
        entries.append((name, file))
entries += [(source.name, source), (kernel.name, kernel)]
for name in ['node-overview.log', 'regressions.log', 'native-foundation.log', 'source-ui/result.json', 'packaged/result.json', 'final-audit.json']:
    file = work / name
    entries.append(('Pruefnachweise/' + name, file))
for name in ['chat/result.json','models/result.json','models/models-usage.png','ai-contract.log','python-feedback.log','review/review.json','review/result.json','review/python-result.json','review/nested-result.json','review/native-limit-comparison.json']:
    entries.append(('Pruefnachweise/' + name, work / name))
manifest = dict(version=version, number=number, includesUserData=False, files=[dict(file=name, bytes=file.stat().st_size, sha256=sha(file)) for name, file in entries])
output.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(output, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=1, allowZip64=True) as z:
    for name, file in entries:
        safe(name)
        z.write(file, name, compress_type=zipfile.ZIP_STORED if file.suffix == '.zip' else zipfile.ZIP_DEFLATED)
    z.writestr('START-HIER.txt', f'Formnaro CAD {version} – KI-Achsenmaße und Fehlerdetails\n\nGanz in einen eigenen Ordner mit kurzem Pfad entpacken, zum Beispiel C:\\Formnaro.\nApp/Formnaro.exe starten.\nAnleitung-KI.md neben Formnaro.exe beschreibt die neuen Funktionen; technische Dokumentation liegt im Quellenarchiv unter docs.\nAnwendungs-, Konverter- und passende native CAD-Kernquellen sowie Lizenzen sind enthalten.\nVorhandene Installationen und Projekte bleiben erhalten. Keine Nutzerprofile oder Zugangsdaten.\n')
    z.writestr('Paket-Pruefung.json', json.dumps(manifest, ensure_ascii=False, indent=2))
print('Portable erstellt; CRC und sämtliche Dateihashes werden geprüft.', flush=True)
with zipfile.ZipFile(output) as z:
    assert z.testzip() is None
    for entry in manifest['files']:
        with z.open(entry['file']) as stream:
            assert hashlib.file_digest(stream, 'sha256').hexdigest() == entry['sha256'], entry['file']
result = dict(ok=True, file=str(output), bytes=output.stat().st_size, sha256=sha(output), sourceSha256=sha(source), entries=len(entries) + 2, crcVerified=True, allFileHashesVerified=True, includesUserData=False)
(work / 'archives.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
output.with_suffix('.zip.sha256').write_text(result['sha256'] + '  ' + output.name + '\n', encoding='utf-8')
print(json.dumps(result), flush=True)
