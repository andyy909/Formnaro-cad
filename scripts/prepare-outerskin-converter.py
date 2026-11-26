"""Finish a separate converter runtime with the outer-skin engine changes.

Never alters a released runtime and never switches the active runtime: the
updated provenance is written only into the new runtime directory and the
report. Switching ``converter/provenance.json`` is a separate, explicit step.

Only the engine files listed in ``ALLOWED_ENGINE_CHANGES`` may differ from
the pinned provenance; every other pinned source, the freeze spec, the
headless VTK bridge and all dependency binaries must be unchanged.
"""
import argparse
import hashlib
import importlib.metadata as metadata
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path
from PyInstaller.archive.readers import CArchiveReader, ZlibArchiveReader

# File -> reason. Commits are read from git for the record.
ALLOWED_ENGINE_CHANGES = {
    'stlstep/advanced_regions.py': 'N06 freeform BSpline wall edge pcurves',
    'stlstep/freeform_verification.py': 'N06 freeform BSpline wall edge pcurves',
    'stlstep/surface_check.py': 'N03 two-sided surface sampling (new file)',
    'stlstep/repair_budget.py': 'N03 deviation budget, N03-B/N03-C outer-skin admission (new file)',
    'stlstep/outer_skin.py': 'N03-B outer-skin-v1 Python port (new file)',
    'stlstep/repair.py': 'N03 budget, N03-C outer skin in the repair path',
    'stlstep/engine.py': 'N03 budget, N04-B repaired mesh on STEP failure',
}
BRIDGE_REASON = 'N04-B repaired artefacts on STEP failure'

parser = argparse.ArgumentParser()
parser.add_argument('--built', required=True, help='PyInstaller COLLECT folder (Formnaro-Konverter)')
parser.add_argument('--baseline', required=True, help='Released runtime whose binaries and licenses are reused')
parser.add_argument('--output', required=True, help='New runtime folder converter/runtime-v010-<name>')
parser.add_argument('--report', required=True)
parser.add_argument('--source-commit', required=True)
args = parser.parse_args()

root = Path(__file__).resolve().parents[1]
converter = root / 'converter'
built, baseline, target = (Path(value).resolve() for value in [args.built, args.baseline, args.output])
report = Path(args.report).resolve()
if target.parent != converter.resolve() or not re.fullmatch(r'runtime-v010(?:-[a-z0-9]+)+', target.name):
    raise SystemExit('Output must be converter/runtime-v010-<name>')
if target.exists():
    raise SystemExit('Use a new converter output directory')
pins = json.loads((converter / 'provenance.json').read_text(encoding='utf-8'))


def digest(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def commits(relative):
    out = subprocess.run(['git', '-C', str(root), 'log', '--format=%h %s', 'e31149f..' + args.source_commit,
                          '--', 'converter/' + relative], capture_output=True, text=True, check=True).stdout
    return [line for line in out.splitlines() if line]


# 1. Engine sources: only the allowed files may differ or be new.
pinned = {row['file']: row['sha256'] for row in pins['engineSourceFiles']}
changes, rows = [], []
for row in pins['engineSourceFiles']:
    current = digest(converter / row['file'])
    if current != row['sha256']:
        if row['file'] not in ALLOWED_ENGINE_CHANGES:
            raise SystemExit('Unexpected engine source change: ' + row['file'])
        changes.append({'file': row['file'], 'previousSha256': row['sha256'], 'sha256': current,
                        'reason': ALLOWED_ENGINE_CHANGES[row['file']], 'commits': commits(row['file'])})
    rows.append({'file': row['file'], 'sha256': current})
for file in sorted((converter / 'stlstep').glob('*.py')):
    relative = file.relative_to(converter).as_posix()
    if relative in pinned:
        continue
    if relative not in ALLOWED_ENGINE_CHANGES:
        raise SystemExit('Unexpected new engine source: ' + relative)
    current = digest(file)
    changes.append({'file': relative, 'previousSha256': None, 'sha256': current,
                    'reason': ALLOWED_ENGINE_CHANGES[relative], 'commits': commits(relative)})
    rows.append({'file': relative, 'sha256': current})
unused = set(ALLOWED_ENGINE_CHANGES) - {change['file'] for change in changes}
if unused:
    raise SystemExit('Allowed change not present (update the list): ' + ', '.join(sorted(unused)))
bridge = digest(converter / 'bridge.py')
bridge_change = None if bridge == pins['bridgeSourceSha256'] else {
    'previousSha256': pins['bridgeSourceSha256'], 'sha256': bridge, 'reason': BRIDGE_REASON, 'commits': commits('bridge.py')}

# 2. Freeze inputs and dependency versions as in the previous minimal build.
minimal = pins['portableMinimal']
assert digest(converter / 'Formnaro-Konverter.spec') == minimal['freezeSpecSHA256'], 'freeze spec changed'
assert digest(converter / 'headless-vtk/vtk.py') == minimal['headlessVtkBridgeSHA256'], 'headless VTK bridge changed'
versions = {name: metadata.version(name) for name in minimal['versions']}
assert versions == minimal['versions'], versions
assert metadata.version('pyinstaller') == minimal['pyinstaller']

# 3. Every frozen binary is byte-identical to the released baseline. Windows
# API-set/UCRT/VC runtime files are collected from the build machine's system
# folder and drift with Windows updates; for those the released baseline copy
# is used so the runtime keeps the tested system DLLs.
OS_RUNTIME = re.compile(r'^(api-ms-win-.*|ucrtbase|msvcp140(_\w+)?|vcruntime140(_\w+)?)\.dll$', re.IGNORECASE)
binaries, from_baseline = 0, []
for file in built.rglob('*'):
    if file.is_file() and file.suffix.lower() in {'.pyd', '.dll'}:
        relative = file.relative_to(built)
        original = baseline / relative
        assert original.is_file(), 'not in baseline: ' + relative.as_posix()
        if digest(file) != digest(original):
            assert OS_RUNTIME.match(file.name), 'dependency binary differs: ' + relative.as_posix()
            from_baseline.append(relative.as_posix())
        binaries += 1

# 4. Assemble the separate runtime.
shutil.copytree(built, target)
for relative in from_baseline:
    shutil.copy2(baseline / relative, target / relative)
shutil.copytree(baseline / 'Lizenzen', target / 'Lizenzen')
archive = CArchiveReader(str(target / 'Formnaro-Konverter.exe'))
report.parent.mkdir(parents=True, exist_ok=True)
pyz_file = report.with_suffix('.pyz')
pyz_file.write_bytes(archive.extract('PYZ.pyz'))
pyz = ZlibArchiveReader(str(pyz_file))
assert '13.0.0' in pyz.extract('PIL._version').co_consts
assert 'vtk' in pyz.toc and 'stlstep.outer_skin' in pyz.toc and 'stlstep.repair_budget' in pyz.toc
assert not any(module == name or module.startswith(name + '.')
               for module in pyz.toc for name in ['numba', 'llvmlite', 'trame', 'cadquery.vis', 'cadquery.fig'])
pyz_file.unlink()

runtime = dict(pins)
runtime.update(engineSourceFiles=rows, bridgeSourceSha256=bridge, runtimeDirectory=target.name,
               headlessExeSha256=digest(target / 'Formnaro-Konverter.exe'))
runtime['outerSkinEngine'] = {
    'previous': {'runtimeDirectory': pins['runtimeDirectory'], 'headlessExeSha256': pins['headlessExeSha256']},
    'sourceCommit': args.source_commit, 'engineSourceChanges': changes, 'bridgeChange': bridge_change,
    'dependencyBinariesIdenticalToBaseline': True, 'baseline': baseline.name, 'binariesChecked': binaries,
    'osRuntimeFilesFromBaseline': sorted(from_baseline),
    'python': sys.version.split()[0], 'pyinstaller': metadata.version('pyinstaller'), 'versions': versions,
    'scope': 'Engine change: N03 deviation budget, outer-skin-v1 admission (N03-B/N03-C), repaired mesh on STEP failure (N04-B), N06 freeform pcurves. Dependencies, freeze spec and headless VTK bridge unchanged. Released runtimes untouched; converter/provenance.json not switched.'}
(target / 'provenance.json').write_text(json.dumps(runtime, indent=2) + '\n', encoding='utf-8')
shutil.copy2(converter / 'README.md', target / 'README.md')
files = [{'file': file.relative_to(target).as_posix(), 'bytes': file.stat().st_size, 'sha256': digest(file)}
         for file in sorted(target.rglob('*')) if file.is_file()]
result = {'ok': True, 'runtime': str(target), 'files': files, 'bytes': sum(row['bytes'] for row in files),
          'provenance': runtime['outerSkinEngine'], 'headlessExeSha256': runtime['headlessExeSha256']}
report.write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps({'ok': True, 'runtime': target.name, 'files': len(files), 'bytes': result['bytes'],
                  'binariesChecked': binaries, 'engineChanges': len(changes), 'bridgeChanged': bool(bridge_change)}))
