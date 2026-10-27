"""Archive the accepted native Formnaro integration, with corresponding sources."""
import hashlib
import json
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parents[1]
work = root / 'work/stl-v010-integration'
proof = json.loads((work / 'final-runtime-audit.json').read_text())
version = json.loads((root / 'package.json').read_text())['version']
release = root / ('release-formnaro-stl-konverter-v' + version)
runtime = release / 'Formnaro-win32-x64'
source = release / ('Formnaro-Quellcode-v' + version + '.zip')
kernel = root / 'release-formnaro-stl-konverter-v0.12.1/Formnaro-CAD-Quellen-v0.12.zip'
output = root / ('output/Formnaro-v' + version + '-Portable-STL-0.10.zip')

def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def safe(name):
    parts = Path(name).parts
    assert not Path(name).is_absolute() and '..' not in parts and '\\' not in name
    forbidden = {'daten','layouts','projekte','work','node_modules','.git','__pycache__','ai-bridge.json','ai-settings.json'}
    assert not any(p.lower() in forbidden or p.lower().startswith('.env') for p in parts), name

assert proof['ok'] and proof['version'] == version
assert proof['checks'] >= 52 and proof['nativeChecks'] >= 25 and proof['asarEntriesVerified'] > 300
for key, file in [('exeSha256','Formnaro.exe'),('asarSha256','resources/app.asar'),('converterSha256','resources/converter/Formnaro-Konverter.exe')]:
    assert sha(runtime / file) == proof[key]
for entry in proof['manifest']:
    safe(entry['file'])
    assert sha(root / entry['file']) == entry['sha256'], entry['file']

# The kernel itself is unchanged. Verify the matching upstream/bridge/config inputs
# in its previously accepted corresponding-source archive before redistributing it.
with zipfile.ZipFile(kernel) as z:
    assert z.testzip() is None
    for file in ['cad-kernel-build/upstream-lock.json','cad-kernel-build/wrappers/formnaro-cad-bridge.cpp']:
        assert z.read(file) == (root / file).read_bytes()
    assert z.read('generated/build-inputs.json') == (root / 'cad-kernel-build/runtime/build-inputs.json').read_bytes()
    assert z.read('generated/formnaro_cad.yml') == (root / 'work/cad-v011-build/config/formnaro_cad.yml').read_bytes()
    lock = json.loads((root / 'cad-kernel-build/upstream-lock.json').read_text())
    for entry in lock['sources']:
        data = z.read('upstream/' + entry['file'])
        assert len(data) == entry['bytes'] and hashlib.sha256(data).hexdigest() == entry['sha256']

with zipfile.ZipFile(source, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=1) as z:
    for entry in proof['manifest']:
        z.write(root / entry['file'], entry['file'])
with zipfile.ZipFile(source) as z:
    assert z.testzip() is None
    for entry in proof['manifest']:
        assert hashlib.sha256(z.read(entry['file'])).hexdigest() == entry['sha256']
print('Aktuelle Anwendungs- und Enginequellen verifiziert.', flush=True)

entries = []
for file in sorted(runtime.rglob('*')):
    assert not file.is_symlink()
    if file.is_file():
        name = 'Formnaro-win32-x64/' + file.relative_to(runtime).as_posix()
        safe(name)
        entries.append((name, file))
entries += [(source.name, source), (kernel.name, kernel)]
manifest = dict(version=version, engine='0.10.0', asarSha256=proof['asarSha256'], includesUserData=False,
                files=[dict(file=name, bytes=file.stat().st_size, sha256=sha(file)) for name,file in entries])
output.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(output, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=1, allowZip64=True) as z:
    for name,file in entries:
        z.write(file,name,compress_type=zipfile.ZIP_STORED if file.suffix=='.zip' else zipfile.ZIP_DEFLATED)
    z.writestr('START-HIER.txt', f'Formnaro {version} – STL-Konverter 0.10\n\nGesamtes ZIP in einen eigenen Ordner entpacken.\nFormnaro-win32-x64/Formnaro.exe starten.\nUnter Funktionen > STL → STEP: Flächenfarben, Regionseditor, Freiformen, Prüfbericht und reparierte STL/3MF.\nAls CAD übernehmen fügt den geprüften Körper mit einem Undo ein.\nAnwendungs-/Enginequellen und passende CAD-Kernel-Quellen sind beigefügt.\nEigener Code: PolyForm Noncommercial 1.0.0; Drittanbieter behalten ihre eigenen Lizenzen.\nPersönliche Modelle, Profile und Zugangsdaten sind nicht enthalten.\n')
    z.writestr('Paket-Pruefung.json',json.dumps(manifest,ensure_ascii=False,indent=2))
print('Portable ZIP erstellt; prüfe CRC und alle enthaltenen Dateihashes.', flush=True)
with zipfile.ZipFile(output) as z:
    assert z.testzip() is None
    for entry in manifest['files']:
        with z.open(entry['file']) as stream:
            assert hashlib.file_digest(stream,'sha256').hexdigest()==entry['sha256'],entry['file']
result=dict(ok=True,file=str(output),bytes=output.stat().st_size,sha256=sha(output),entries=len(entries)+2,
            crcVerified=True,allFileHashesVerified=True,includesUserData=False,asarSha256=proof['asarSha256'],sourceSha256=sha(source),kernelSourcesSha256=sha(kernel))
(work / 'portable-audit.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
output.with_suffix('.zip.sha256').write_text(result['sha256']+'  '+output.name+'\n',encoding='utf-8')
print(json.dumps(result),flush=True)
