"""Finish a separate minimal converter build, preserving licensed dependencies."""
import argparse
import hashlib
import importlib.metadata as metadata
import json
import shutil
import sys
from pathlib import Path
from PyInstaller.archive.readers import CArchiveReader, ZlibArchiveReader

parser = argparse.ArgumentParser()
parser.add_argument('--built', required=True)
parser.add_argument('--baseline', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--report', required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
built, baseline, target = (Path(value).resolve() for value in [args.built, args.baseline, args.output])
report = Path(args.report).resolve()
if target.exists():
    raise SystemExit('Use a new converter output directory')
pins = json.loads((root / 'converter/provenance.json').read_text(encoding='utf-8'))


def digest(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


for row in pins['engineSourceFiles']:
    assert digest(root / 'converter' / row['file']) == row['sha256'], row['file']
assert metadata.version('pillow') == '13.0.0'
assert metadata.version('setuptools') == '84.2.1'
for file in built.rglob('*'):
    if file.is_file() and file.suffix.lower() in {'.pyd', '.dll'}:
        original = baseline / file.relative_to(built)
        assert original.is_file() and digest(file) == digest(original), str(file)
shutil.copytree(built, target)
shutil.copytree(baseline / 'Lizenzen', target / 'Lizenzen')
archive = CArchiveReader(str(target / 'Formnaro-Konverter.exe'))
report.parent.mkdir(parents=True, exist_ok=True)
pyz_file = report.with_suffix('.pyz')
pyz_file.write_bytes(archive.extract('PYZ.pyz'))
pyz = ZlibArchiveReader(str(pyz_file))
assert '13.0.0' in pyz.extract('PIL._version').co_consts
assert 'vtk' in pyz.toc
assert not any(module == name or module.startswith(name + '.')
               for module in pyz.toc for name in ['numba', 'llvmlite', 'trame', 'cadquery.vis', 'cadquery.fig'])
previous = {'runtimeDirectory': pins['runtimeDirectory'], 'headlessExeSha256': pins['headlessExeSha256']}
pins.update(runtimeDirectory='runtime-v010-minimal', headlessExeSha256=digest(target / 'Formnaro-Konverter.exe'))
pins['portableMinimal'] = {
    'previous': previous, 'engineSourcesUnchanged': True,
    'dependencyBinariesIdenticalToBaseline': True, 'python': sys.version.split()[0],
    'pyinstaller': metadata.version('pyinstaller'),
    'versions': {name: metadata.version(name) for name in ['cadquery', 'cadquery-ocp', 'vtk', 'numpy', 'scipy', 'pillow', 'setuptools']},
    'headlessVtkBridgeSHA256': digest(root / 'converter/headless-vtk/vtk.py'),
    'freezeSpecSHA256': digest(root / 'converter/Formnaro-Konverter.spec'),
    'scope': 'Fixed headless converter protocol only. General VTK umbrella replaced by retained real core types; direct CadQuery VTK imports use normal dependency hooks. No general viewer/VR/JIT API. Engine algorithms unchanged.'
}
(root / 'converter/provenance.json').write_text(json.dumps(pins, indent=2) + '\n', encoding='utf-8')
for name in ['README.md', 'provenance.json']:
    shutil.copy2(root / 'converter' / name, target / name)
rows = [{'file': file.relative_to(target).as_posix(), 'bytes': file.stat().st_size, 'sha256': digest(file)}
        for file in sorted(target.rglob('*')) if file.is_file()]
result = {'ok': True, 'runtime': str(target), 'files': rows, 'bytes': sum(row['bytes'] for row in rows), 'provenance': pins['portableMinimal']}
report.write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps({'ok': True, 'files': len(rows), 'bytes': result['bytes']}))
