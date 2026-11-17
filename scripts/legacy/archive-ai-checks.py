"""Whitelist release archive and public sources; verify every stored byte."""
from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parent.parent
checks = root / 'work/cad-ai-result-checks/checks'
build = json.loads((checks / 'build.json').read_text(encoding='utf-8'))
audit = json.loads((checks / 'final-audit.json').read_text(encoding='utf-8'))
assert audit['ok'] and audit['version'] == '0.49.1'
release, runtime = Path(build['release']), Path(build['runtime'])
source_zip = release / 'Formnaro-Quellcode-v0.49.1.zip'
output_zip = release.parent / 'Formnaro-KI-Ergebnispruefung-v0.49.1.zip'
assert not source_zip.exists() and not output_zip.exists(), 'Do not overwrite an archive'


def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def archive(target, items):
    expected = {}
    with zipfile.ZipFile(target, 'x', zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as output:
        for file, name in items:
            assert name not in expected and not file.is_symlink()
            expected[name] = sha(file)
            output.write(file, name)
    with zipfile.ZipFile(target) as output:
        assert output.testzip() is None
        assert sorted(output.namelist()) == sorted(expected)
        for name, digest in expected.items():
            with output.open(name) as stream:
                assert hashlib.file_digest(stream, 'sha256').hexdigest() == digest, name
    return {'file': str(target), 'bytes': target.stat().st_size, 'entries': len(expected), 'sha256': sha(target), 'crcAndEveryFileHashVerified': True}


sources = []
# Only the explicitly audited release helpers may differ from the tested source.
# All application, test, documentation and runtime bytes remain frozen.
for item in audit['sourceManifest']:
    file = root / item['file']
    assert sha(file) == item['sha256'], item['file']
    sources.append((file, item['file']))
source_report = archive(source_zip, sources)
items = []
for item in build['runtimeFiles']:
    file = runtime / item['file']
    assert sha(file) == item['sha256'], item['file']
    items.append((file, 'App/' + item['file']))
items += [(source_zip, 'Quellcode/' + source_zip.name), (checks / 'final-audit.json', 'Pruefung/final-audit.json')]
for scope in ['source', 'packaged']:
    file = checks / (scope + '-acceptance.json')
    proof = json.loads(file.read_text(encoding='utf-8'))
    assert proof['ok']
    items.append((file, 'Pruefung/' + file.name))
    for entry in proof['proofs']:
        log = Path(entry['log'])
        assert sha(log) == entry['logSha256']
        items.append((log, 'Pruefung/' + scope + '/' + entry['name'] + '.log'))
        if entry.get('report'):
            report = Path(entry['report'])
            assert sha(report) == entry['reportSha256']
            items.append((report, 'Pruefung/' + scope + '/' + entry['name'] + '.json'))
            if entry['name'] == 'result-checks':
                shot = report.parent / 'ai-checks.png'
                items.append((shot, 'Pruefung/' + scope + '/ai-checks.png'))
archive_report = archive(output_zip, items)
result = {'ok': True, 'version': audit['version'], 'sourceArchive': source_report, 'applicationArchive': archive_report, 'auditSha256': sha(checks / 'final-audit.json')}
(checks / 'archives.json').write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False))
