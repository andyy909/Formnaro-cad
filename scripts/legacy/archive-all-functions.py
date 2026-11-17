"""Archive only explicit public files and the fresh synthetic acceptance evidence."""
import hashlib
import json
from pathlib import Path
import zipfile
import shutil

root = Path.cwd()
checks = root / 'work/gesamtpruefung'
build = json.loads((checks / 'build.json').read_text(encoding='utf-8'))
audit = json.loads((checks / 'final-audit.json').read_text(encoding='utf-8'))
assert audit['ok'] and audit['version'] == '0.49.2'
release = Path(build['release'])

def sha(file):
    h = hashlib.sha256()
    with file.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

def archive(target, entries):
    assert not target.exists(), target
    seen = set()
    with zipfile.ZipFile(target, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as output:
        for source, name, expected in entries:
            assert name not in seen and '..' not in Path(name).parts
            assert sha(source) == expected, source
            seen.add(name)
            output.write(source, name)
    with zipfile.ZipFile(target) as output:
        assert output.testzip() is None
        for source, name, expected in entries:
            assert hashlib.sha256(output.read(name)).hexdigest() == expected, name
    return dict(file=str(target), bytes=target.stat().st_size, entries=len(entries), sha256=sha(target))

sources = [(root / e['file'], e['file'], e['sha256']) for e in audit['sourceManifest']]
source_zip = release / 'Formnaro-Quellcode-v0.49.2.zip'
source_report = archive(source_zip, sources)
entries = [(Path(build['runtime']) / e['file'], 'App/' + e['file'], e['sha256']) for e in build['runtimeFiles']]
entries.append((source_zip, 'Quellcode/' + source_zip.name, sha(source_zip)))
entries.append((checks / 'final-audit.json', 'Pruefung/final-audit.json', sha(checks / 'final-audit.json')))
for name in ['Pruefbericht.md', 'funktionsmatrix.json']:
    file = checks / name
    assert file.is_file(), name
    shutil.copyfile(file, release / name)
    entries.append((file, 'Pruefung/' + name, sha(file)))
for mode in ['source', 'packaged']:
    summary_file = Path(audit[mode + 'Summary'])
    summary = json.loads(summary_file.read_text(encoding='utf-8'))
    assert summary['ok'] and not summary['exploratory'] and not summary['sourceChanged']
    entries.append((summary_file, f'Pruefung/{mode}/summary.json', sha(summary_file)))
    independent = summary_file.parent / 'independent-files.json'
    assert json.loads(independent.read_text(encoding='utf-8'))['ok']
    entries.append((independent, f'Pruefung/{mode}/independent-files.json', sha(independent)))
    for result in summary['results']:
        assert result['ok']
        for field in ['log', 'report']:
            if result.get(field):
                file = Path(result[field])
                entries.append((file, f"Pruefung/{mode}/{result['id'].replace(':', '-')}/{file.name}", result[field + 'Sha256']))
    # Only top-level screenshots and synthetically authored model files. Never
    # traverse verification profiles, portable data stores or bridge descriptors.
    for directory in Path(summary['directory']).iterdir():
        if directory.is_dir():
            for file in directory.iterdir():
                if file.is_file() and file.suffix.lower() in ['.png', '.ocad', '.stl', '.obj']:
                    entries.append((file, f'Belege/{mode}/{directory.name}/{file.name}', sha(file)))
            export_directory = directory / 'exports'
            if export_directory.is_dir():
                for file in export_directory.iterdir():
                    if file.is_file() and file.suffix.lower() in ['.stl', '.obj', '.mtl', '.step', '.stp', '.svg', '.3mf', '.glb', '.gltf']:
                        entries.append((file, f'Belege/{mode}/{directory.name}/exports/{file.name}', sha(file)))
archive_file = Path('F:/Formnaro-Ausgaben/Formnaro-Gesamtpruefung-v0.49.2.zip')
application = archive(archive_file, entries)
report = dict(ok=True, version='0.49.2', sourceArchive=source_report, applicationArchive=application, finalAuditSha256=sha(checks / 'final-audit.json'))
(checks / 'archives.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report))
