"""Create and read back a clean end-user ZIP. Build tool; never shipped."""
import sys
sys.dont_write_bytecode = True
import argparse
import hashlib
import json
import re
import zipfile
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--runtime', required=True)
parser.add_argument('--version', required=True)
parser.add_argument('--revision', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--report', required=True)
args = parser.parse_args()
if not re.fullmatch(r'\d+\.\d+\.\d+', args.version) or not re.fullmatch(r'r\d+', args.revision):
    raise SystemExit('Invalid version/revision')
runtime, output = Path(args.runtime).resolve(), Path(args.output).resolve()
archive = output / f'Formnaro-v{args.version}-{args.revision}-Windows.zip'
source_asset = output / 'Formnaro-FreeCAD-Quellen-1.1.4.zip'
if archive.exists() or not source_asset.is_file() or not (runtime / 'Formnaro.exe').is_file():
    raise SystemExit('Fresh output, clean runtime and corresponding source asset required')


def digest(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


rows = []
for file in sorted(runtime.rglob('*')):
    if file.is_symlink():
        raise SystemExit('Unexpected runtime link: ' + str(file))
    if not file.is_file():
        continue
    relative = file.relative_to(runtime)
    parts = {p.lower() for p in relative.parts}
    # License provenance can include upstream src/Tests directory names. These
    # are license notices, not bundled application source/test trees.
    license_notice = 'licenses' in parts or 'lizenzen' in parts
    forbidden = {'.git', 'node_modules', 'work', 'tests', '__pycache__',
                 '.cache', '.venv'}
    if (not license_notice and parts & forbidden) or relative.parts[0].lower() in {'scripts','src','tests','daten','layouts','projekte','pruefberichte'}:
        raise SystemExit('Developer/user data in runtime: ' + str(relative))
    if file.name.lower() in {'ai-settings.json', 'ai-bridge.json', '.env'}:
        raise SystemExit('Private configuration must not be distributed')
    if relative.parts[:2] == ('resources', 'speech') and file.suffix == '.bin':
        raise SystemExit('Speech model must remain optional')
    rows.append({'source': str(file), 'name': 'Programmdateien/' + relative.as_posix(),
                 'bytes': file.stat().st_size, 'sha256': digest(file)})
templates = Path(__file__).resolve().parents[1] / 'packaging/windows'
for name in ['Formnaro starten.lnk', 'Projekte.lnk', 'Bibliothek und Einstellungen.lnk']:
    file = templates / name
    rows.append({'source': str(file), 'name': name, 'bytes': file.stat().st_size, 'sha256': digest(file)})
examples = Path(__file__).resolve().parents[1] / 'packaging/examples'
example_manifest = json.loads((examples / 'manifest.json').read_text(encoding='utf-8'))
allowed_examples = {'atlas-5.ocad', 'schraeggetriebe-6zu1.ocad', 'solid-schraubstock.ocad'}
assert {row['file'] for row in example_manifest['examples']} == allowed_examples
for example in example_manifest['examples']:
    file = examples / example['file']
    assert file.is_file() and not file.is_symlink() and digest(file) == example['sha256']
    project = json.loads(file.read_text(encoding='utf-8-sig'))
    assert isinstance(project.get('nodes'), list) and project['nodes']
    rows.append({'source': str(file), 'name': 'Programmdateien/Projekte/Beispiele/' + file.name,
                 'bytes': file.stat().st_size, 'sha256': example['sha256']})
readme = (
    f'Formnaro {args.version}-{args.revision} – Portable Windows x64\n\n'
    'ZIP vollständig in einen beschreibbaren Ordner entpacken.\n'
    'Danach „Formnaro starten“ öffnen. FreeCAD, Python und die Anwendungs-\n'
    'laufzeit sind enthalten; keine zusätzliche Installation erforderlich.\n\n'
    'Das optionale Sprachmodell ist nicht enthalten. Im KI-Chat unter\n'
    '„Bilder, Bezüge & Sprache“ auf „Sprachmodell herunterladen“ klicken.\n'
    'Einmaliger Internetdownload: 574 MB. Danach funktioniert Sprache offline.\n'
    'Das Modell bleibt in Programmdateien/Daten/Sprachmodelle.\n\n'
    'Beispiele unter Projekte/Beispiele: ATLAS-5-Fräse, großes 6:1-\n'
    'Schräggetriebe und Schraubstock. Die Vorlagen am besten als Kopie speichern.\n\n'
    'Eigene Daten und Projekte gehören in die portablen Daten-/Projektordner.\n'
    'Die zugehörigen FreeCAD-Quellen werden separat neben dem Windows-Paket\n'
    'angeboten; zum Ausführen sind sie nicht erforderlich.\n'
).encode('utf-8')
output.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(archive, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as zipped:
    for directory in ['Programmdateien/Daten/', 'Programmdateien/Projekte/']:
        zipped.writestr(directory, b'')
    zipped.writestr('LIES-MICH-ZUERST.txt', readme)
    for i, row in enumerate(rows):
        zipped.write(row['source'], row['name'])
        if i % 5000 == 0:
            print('Archived', i, flush=True)
with zipfile.ZipFile(archive) as zipped:
    expected = sorted([row['name'] for row in rows] + ['LIES-MICH-ZUERST.txt'])
    assert sorted(n for n in zipped.namelist() if not n.endswith('/')) == expected
    assert zipped.read('LIES-MICH-ZUERST.txt') == readme
    for i, row in enumerate(rows):
        with zipped.open(row['name']) as stream:
            assert hashlib.file_digest(stream, 'sha256').hexdigest() == row['sha256'], row['name']
        if i % 5000 == 0:
            print('Verified ZIP bytes', i, flush=True)
result = {'ok': True, 'archive': str(archive), 'bytes': archive.stat().st_size,
          'sha256': digest(archive), 'unpackedBytes': sum(row['bytes'] for row in rows) + len(readme),
          'sourceAsset': str(source_asset), 'sourceAssetSha256': digest(source_asset),
          'modelBundled': False, 'allReadbackVerified': True, 'entries': rows}
report = Path(args.report)
report.parent.mkdir(parents=True, exist_ok=True)
report.write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps({k: v for k, v in result.items() if k != 'entries'}), flush=True)
